---
title: "C++ 的历史错误决定"
slug: "cpp-history-mistakes"
date: "2026-10-14"
categories: ["编程语言"]
tags: ["C++", "语言设计"]
draft: false
summary: "按「标准自己撤销/替换」「一路打补丁才勉强能用」「因兼容或 ABI 明确无法回头」三类判据，梳理 C++ 从 C 继承以及自身引入的失败决定——动态异常规范、export 模板、std::auto_ptr、`std::vector<bool>`、std::valarray、std::regex、char8_t 的反复等，逐条标注修补发生在哪个标准版本、之前是什么，并区分标准规定、实现定义与未定义行为。"
---

这篇笔记整理的判据是三条：标准自己撤销或替换了它；它需要一路打补丁才勉强能用；它因为兼容性或 ABI 明确无法回头。第三条里的东西并非「设计时看走眼」那么简单——很多决定放在当年是合理妥协，只是事后被冻住了。

核对状态：文中的论文编号与版本界线已对照 WG21 文稿页核对过；仍未取到原文的少数几项标了【待核】，直接链接列在文末，取到后应据原文改掉。

---

## 1. 被标准自己撤销或替换的决定

这一类最硬，因为有明确的版本与替换物可查。下表的论文编号已逐条核对，带链接的见文末参考。

| 决定 | 之前是什么 | 何时被撤销/替换 | 换成什么 |
| --- | --- | --- | --- |
| 动态异常规范 `throw(X)` | 运行时检查、影响优化，且漏抛直接 `std::terminate` | C++11 弃用、C++17 移除（P0003R5）；最后一个形式 `throw()` 在 C++17 已等价于 `noexcept(true)`，直到 C++20 才从标准里删掉（P0619R4） | `noexcept`、`noexcept(...)` |
| `export template` | C++98 唯一一次把模板定义与实例化分离的尝试，几乎无人实现 | C++11 列入 deprecated，C++20 移除（P0619R4） | 无，回到「定义放头文件」 |
| `std::auto_ptr` | 拷贝即转移所有权，和容器、算法都不兼容 | C++11 弃用，C++17 移除（N4190） | `std::unique_ptr` |
| 旧 `<functional>` 设施 | `unary_function`、`binary_function`、`ptr_fun`、`mem_fun`、`bind1st`、`bind2nd` | C++17 移除（N4190） | lambda、`std::mem_fn`、`std::bind` |
| `std::random_shuffle` | 用 `std::rand` 实现，随机源不可控 | C++14 弃用，C++17 移除（N4190，弃用版本【待核】） | `std::shuffle` |
| `throw()` 空异常规范 | 与动态异常规范同源 | C++11 起 `noexcept` 取代，C++17 起 `throw()` 等价于 `noexcept(true)`，C++20 随 P0619R4 删掉 | `noexcept` |
| 序列点（sequence point）模型 | 求值顺序靠「序列点」描述，规则零散 | C++11 用 sequenced-before / happens-before 重写 | `[intro.execution]`、`[intro.multithread]` |
| 有符号整数的非补码表示 | 允许反码、原码（表示形式 implementation-defined） | C++20 强制二进制补码（P0907R4），见 [C++算术运算溢出](/post/2026/10/14/cpp-arithmetic-overflow/) 的同一结论 | 补码成为语言保证 |
| `std::atomic` 的默认构造 | C++11/14/17 规定默认构造后值未初始化 | C++20 修（P0883R2【待核】） | 默认构造值初始化 |
| `shared_ptr::unique()` | 与 `use_count` 一样不可靠 | C++17 弃用，C++20 移除（P0619R4） | 无 |

值得单独记的是 `auto_ptr` 那一行：它不是「用着不顺手」，而是拷贝语义与所有权语义直接冲突，标准用移除来承认这一点。与之对照，`std::shared_ptr`、`std::unique_ptr` 是重写，不是修补。

---

## 2. 需要一路打补丁才勉强能用的决定

补丁本身的存在就是证据：如果设计没问题，不需要二十年连加七八层。

### 2.1 隐式转换与整数提升

`int` 与 `unsigned` 混比时按模比较，`i >= 0` 对无符号恒真；窄化静默发生；`bool` 是整数类型，可以参与算术。这是被 WG21 自己点得最多的一条。

修补时间线：`explicit` 可作用于转换函数（C++11）、列表初始化的窄化检查（C++11）、`std::cmp_less` / `cmp_equal` 等（C++20）。但常用算术转换的规则本身从 C 继承至今没动，`std::cmp_less` 的存在等于承认 `a < b` 在混符号时没有正确答案。

### 2.2 声明符「模仿使用」

`int *p` 里 `*p` 是取值，`int a[10]` 里 `a[i]` 是取元素——语法要求声明符长得像使用表达式。单个指针或数组还好，指针、数组、函数指针嵌套后彻底失控，`int (*pif)(const char*, const char*)` 这类拼写就是产物，most vexing parse 也由此而来。

修补：`typedef`、`auto`（C++11）、尾置返回类型（C++11）、`std::type_identity`（C++20）、`P0634R3` 减少 `typename`（C++20，【待核】）。结构本身没改，引用、成员指针、cv/ref 限定都继续叠在上面。

### 2.3 数组到指针退化

参数里的数组一律调整为指针（`[dcl.fct]`），长度信息在类型里消失；字符串字面量是数组，一离开 `sizeof` 就只剩指针，「字符串」在类型系统里从来不是一等类型，长度、所有权、编码全推给约定。

修补：`std::array`（C++11）、`std::string_view`（C++17）、`std::span` 与 `std::ssize`（C++20）、`std::ranges` 把区间提升为算法接口。这些都是绕开，不是让数组成为一等值。

### 2.4 `explicit` 长期只覆盖单参构造函数

C++98 的 `explicit` 管不住转换运算符，也管不住多参构造的隐式转换。补齐到 C++11 才有 explicit conversion operator。

### 2.5 虚函数没有 `override` / `final`

C++11 之前，写错签名的「覆盖」是静默地新增一个虚函数，不是编译错误。`override` 与 `final` 到 C++11 才补上。

### 2.6 两阶段名字查找与 `typename` / `template` 关键字

模板里的依赖名查找规则在 C++98 里含糊，编译器分歧严重，最终靠 `typename`、`template` 两个关键字让程序员手动消歧。C++20 放宽了一部分 `typename`，但「需要靠关键字告诉编译器某个名字是不是类型」这件事本身是设计债。

### 2.7 `switch` 穿透、运算符优先级、可重载的 `&&` / `||` / `,`

`switch` 默认穿透、`&` 优先级低于 `==`，都是从 C 原样继承；`operator&&`、`operator||`、`operator,` 在 C++ 里可重载，一旦重载就失去短路求值与求值顺序保证。这些至今没有规则层面的修正，只能靠约定和 lint。

---

## 3. 因兼容与 ABI 冻结的错误

这一类未必是设计失误，但已经改不动。

`char` 是否有符号仍然是 implementation-defined（`[basic.fundamental]`），而 `char`、`signed char`、`unsigned char` 是三个不同类型。C++17 的 `std::byte`、C++20 的 `char8_t` 都是分流，不是修正，`char` 本身大概率永远不会改。

没有标准化的 ABI。这是有意的非决定，代价却是实打实的：`std::string` 从 COW 改成 SSO 时，libstdc++ 不得不引入 `_GLIBCXX_USE_CXX11_ABI` 开关，让两种布局在同一套头文件下并存；Bjarne 专门写 `P1962R0`（【待核】）讨论「在不打破 ABI 的前提下怎么加新特性」。

头文件模型与预处理器自 C 继承，直到 C++20 才有模块（P1103R3【待核】）。注意边界：模块解决文本包含与名字可见性，不解决二进制兼容。

`new` / `delete` 是语言内建运算符而不是库设施，尺寸不匹配、数组 `delete[]`、placement new 的生命期规则，都是这条决定的连锁反应。

有符号整数溢出至今是 UB。C++20 只强制了表示形式是补码，没有定义溢出行为——「现在都是补码机器，所以溢出就是回绕」是错的，回绕只是当前编译器的实现选择，不是语言保证。指针 provenance 与 `std::launder` 这一片同样属于「当年没规定、现在收尾」。

---

## 4. 标准库里的失败设计

`std::vector<bool>` 用代理引用换位压缩，不满足普通容器的要求，`&v[0]` 之类代码直接失效，被广泛认为是错误的特化，至今没有替代品进标准。

`std::valarray` 面向数值计算设计，实现稀少、实际几乎没人用，被普遍认为是失败的库设计。

`std::regex` 功能完整但实现普遍偏慢，编译期与运行期开销都大，实践中常被 RE2 一类第三方库取代，ABI 也让它难以改进。

这三条目前都只有技术层面的公认结论，没有 WG21 的正式「失败」表述，引用时不要写成委员会决议。

`std::string` / `std::wstring` / `u8` 的编码混乱是另一条线：`u8"..."` 从 C++11 起一直是 `const char[]`，C++20 的 P0482R6 改成 `const char8_t[]`（文稿自己也把「`f(u8"text")` 由合法变为 ill-formed」写进 Annex C），破坏了源码兼容，同年又不得不出补救论文（P1423R3【待核】）。一个标准版本内先引入破坏再补救，是很典型的一次「改又后悔」。

`std::function` 要求可拷贝构造，存不下 move-only 的可调用对象；C++23 才补 `std::move_only_function`（P0288R9【待核】）。

`std::async` 返回的 future，析构时会阻塞等待任务完成，加上默认策略是 `std::launch::async | std::launch::deferred`，「发射后不管」这种用法基本不可用；长期方向是 `std::execution`（P2300R5，C++26），而不是修补 future。

`std::rand()` 从 C 继承，质量差、`rand() % n` 有偏，C++11 的 `<random>` 直到很晚才成为替代品，而且分布不保证跨实现一致。

一批明显该有的成员来得太迟：`contains`（C++20，P0458R2【待核】）、`starts_with` / `ends_with`（C++20）、`move_only_function`、`std::expected`（P0323R12【待核】）、`scope_exit`（P0052R10【待核】）、`optional` 的 monadic 操作（P0798R8【待核】）全在 C++23。多维下标 `operator[]` 也是到 C++23 才有多实参版本（P2128R6【待核】）。

`std::initializer_list` 在重载解析里的优先级，加上花括号初始化与圆括号初始化不等价，使「uniform initialization」并不 uniform：`std::vector<int> v1(3, 2)` 与 `v2{3, 2}` 语义完全不同。

---

## 5. 版本修补时间线

| 版本 | 撤销 / 替换 / 修正 |
| --- | --- |
| C++11 | `auto_ptr` 弃用；`throw()` 由 `noexcept` 取代、动态异常规范弃用；序列点模型换成 happens-before；`register` 弃用；`explicit` 可用于转换运算符；`override` / `final`；`std::array` |
| C++14 | `std::random_shuffle` 弃用（【待核】） |
| C++17 | `auto_ptr`、`random_shuffle`、旧 `<functional>` 移除（N4190）；动态异常规范 `throw(X)` 移除（P0003R5）；`std::string_view`；结构化绑定 |
| C++20 | `export` 移除（P0619R4）；`throw()` 移除（P0619R4）；强制补码（P0907R4）；`char8_t`（P0482R6）与补救（P1423R3【待核】）；`std::atomic` 初始化（P0883R2【待核】）；`typename` 放宽（P0634R3【待核】）；`contains`（P0458R2【待核】）；模块（P1103R3【待核】）与 concepts |
| C++23 | `std::move_only_function`（P0288R9【待核】）、`std::expected`（P0323R12【待核】）、`std::scope_exit`（P0052R10【待核】）、`optional` monadic 操作（P0798R8【待核】）、多维下标（P2128R6【待核】） |
| C++26 | `std::execution`（P2300R5）；指针 provenance（【待核】） |

---

## 6. 待核实清单

下面这些还没能取到原文，按优先级排列：

1. `std::atomic` 默认构造修复是否为 P0883R2。
2. 补救论文是否为 P1423R3，它进的是 C++20 还是 C++23。
3. `contains`（P0458R2）、`move_only_function`（P0288R9）、`expected`（P0323R12）、`scope_exit`（P0052R10）、`optional` monadic（P0798R8）、多维下标（P2128R6）、`typename` 放宽（P0634R3）的编号。
4. 模块的合并论文是否写作 P1103R3。
5. `random_shuffle` 的弃用版本（C++14）是引自哪份文稿。
6. `std::vector<bool>`、`std::valarray`、`std::regex` 是否有替代提案，以及 Bjarne 相关评论的原始出处。
7. 维基百科只作线索用，任何条目都要落回上面对应的原始出处再采信。

---

## 参考

- C++ 标准草案：<https://eel.is/c++draft/>
  - 相关锚点：`[basic.fundamental]`（整数类型与 `char` 的符号）、`[dcl.fct]`（参数类型调整）、`[expr.arith.conv]`（常用算术转换）、`[expr.shift]`、`[intro.execution]`、`[intro.multithread]`、`[depr]`（已弃用设施清单）。
- cppreference：<https://en.cppreference.com/w/>，另有中文镜像 <https://zh.cppreference.com/w/> 仅作措辞参考。
- WG21 文稿（编号已对 <https://www.open-std.org/jtc1/sc22/wg21/docs/papers/> 核对，仍标【待核】的是没取到原文）：
  - [N4190《Removing auto_ptr, random_shuffle(), And Old `<functional>` Stuff》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2014/n4190.htm)
  - [P0003R5《Removing Deprecated Exception Specifications from C++17》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2016/p0003r5.html)
  - [P0619R4《Reviewing Deprecated Facilities of C++17 for C++20》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p0619r4.html)
  - [P0907R4《Signed Integers are Two's Complement》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p0907r4.html)
  - [P2300R5《std::execution》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2022/p2300r5.html)
  - [P0482R6《char8_t: A type for UTF-8 characters and strings》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p0482r6.html) 与 P1423R3《char8_t backward compatibility remediation》【待核】
  - P0883R2《Fixing Atomic Initialization》【待核，只有 PDF】
  - P0634R3《Down with typename!》【待核】
  - P1103R3《Merging Modules》【待核】
  - P0977R0《Remember the Vasa!》与 P1962R0（ABI 与演进方向；作者为 Bjarne Stroustrup）【待核】
- 相关笔记：[C 留给 C++ 的坑](/post/2026/10/14/c-pitfalls-for-cpp/) 讲被 C 继承的约束；[C++算术运算溢出](/post/2026/10/14/cpp-arithmetic-overflow/) 与 [C++有符号无符号转换](/post/2026/10/14/cpp-signed-unsigned-conversion/) 展开整数语义那部分。
