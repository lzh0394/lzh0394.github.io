---
title: "C++ contracts 提案"
slug: "cpp-contracts"
date: "2026-10-16"
tags: ["C++", "契约/Contracts"]
draft: false
summary: "梳理契约（contracts）从 P0542 进入 C++20 又被移除、SG21 重做 MVP、P2900R14 进入 C++26 直至 DIS 投票阶段的完整脉络：C++26 的 pre/post/contract_assert 语法、四种求值语义与违规判定、handler 与 `<contracts>` 库设施，2025–2026 的九类反对意见与反提案，C++29 路线图中已并入的虚函数契约（P3097R3），以及 GCC/Clang/MSVC 的实现现状。全文区分规范保证、implementation-defined、unspecified 与实现行为，并区分 C++26 DIS 文本与 C++29 现行工作草案。"
---

契约（contracts）是 C++ 里唯一一个「进过工作草案、被整体移除、重做后再次进草案，却始终没能平息争议」的特性。所以这篇笔记的重点不在语法本身（新的语法并不复杂），而在于每一版设计把「语力」交给了谁，以及由此产生的规范保证与实现自由之间的落差。

先说效力边界。contracts 已经是 C++26 的一部分，本文以标准文本为准：C++26 的 DIS 文本与 C++29 的现行工作草案（<https://eel.is/c++draft/>，快照 2026-08-23）在契约条款上已有差异，凡涉及差异处分别写明。与提案阶段有关的内容（投票记录、被否决的方案、尚未定稿的 C++29 扩展）以 WG21 文稿为准，提案不是标准，不能当作规范引用。凡是只有二手来源（会议报道、cppreference 表格）的地方，在最后一节点明。

## 1. 现状与时间线

要点：C++26 带着 P2900R14 这套设计走到了 DIS 投票阶段，但「契约断言一定会被执行」这件事在 C++26 里没有任何保证，而承载这一诉求的改动在 C++29 里仍未定稿。

| 时间 | 事件 |
| --- | --- |
| 2018-06 Rapperswil | P0542R5 进入 C++20 工作草案 |
| 2019-07 Cologne | P1823R0 把 contracts 整体移出 C++20 |
| 2019–2024 | SG21 重做，产出 MVP 设计（P2388 → P2877 → P2900 各修订） |
| 2024-06 St. Louis | EWG 同意虚函数契约进入设计（P2900R8 并入） |
| 2025-02 Hagenberg | P2900R14 进入 C++26 工作草案；同一会议删除虚函数上的 pre/post |
| 2025-11 Kona | 处理 CD 阶段国家机构意见，接受 AT1-057（P3886R0），实质拒绝 RO 2-056 |
| 2026-03 Croydon | 完成 C++26 技术工作，送 DIS；EWG 否决把 P4044R0 作为 RO 2-056 的回应 |
| 2026-06 Brno | EWG 批准 P3850R1 的 C++29 路线图；P3097R3 虚函数契约进入下一版工作草案 |
| 2026-07—09 | DIS 投票期（12 周）；2026-09-01 的 P4238R1 呼吁国家机构投反对票 |

C++26 的 DIS 尚未出版，投票结果未知。送 DIS 时的全会表决数字（114 票赞成 / 12 反对 / 3 弃权）只有二手来源，见最后一节。

版本差异（本文后续所有结论都按这张表区分）：

| 项目 | C++20 | C++26（DIS 文本） | C++29 现行工作草案 |
| --- | --- | --- | --- |
| 契约语法 | `[[expects:]]`/`[[ensures:]]`/`[[assert:]]`（后被移除，C++20 最终无此特性） | `pre`/`post`/`contract_assert` | 同 C++26 |
| 求值语义 | 构建级别 off/default/audit | 四种：ignore/observe/enforce/quick_enforce | 同 C++26 |
| 不同语义的 TU 混链 | mixed mode 属 conditionally supported，语义 implementation-defined，且不许程序查询或设置 build level | 是否支持混合由实现决定；语义差异不构成 ODR 违反（见 4.5） | 同 C++26 |
| 虚函数上的 pre/post | 未涉及 | ill-formed | 允许（P3097R3 措辞已并入） |
| 函数指针/类型别名上的契约 | 未涉及 | 不允许 | 仍不允许，且在 C++29 计划之外 |
| `__cpp_contracts` | — | `202502L` | `202606L` |
| `__cpp_lib_contracts` | — | `202502L` | `202502L`（未变） |

---

## 2. 第一次尝试：P0542 与 C++20

设计祖本是 P0380R1《A contract design》（2016-07，Dos Reis、Garcia、Lakos、Meredith、Myers、Stroustrup），措辞论文是 [P0542R5](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p0542r5.html)（2018-06-08，Garcia）。

语法是三个属性：`[[expects: cond]]`（前置条件）、`[[ensures: cond]]`（后置条件，`result` 指返回值）、`[[assert: cond]]`（块内断言语句），再加 `audit`/`axiom` 限定符，例如 `[[expects audit: c]]`、`[[assert axiom: c]]`。

求值方式由构建级别（build level）决定：`off`、`default`、`audit`，选择机制 implementation-defined。`default` 检查 default 契约，`audit` 检查 default 与 audit 契约，即 audit 条件在低于 audit 的级别下永不检查；`axiom` 永不检查。违规处理函数由实现「以 implementation-defined 方式」建立，程序无法设置或修改它；处理函数完成后的行为由 continuation mode 决定：`off` 之下 `std::terminate()`，`on` 之下继续执行，默认是 `off`。库侧是 `<contract>` 里的 `std::contract_violation`，接口为 `line_number()`、`file_name()`、`function_name()`、`comment()`、`assertion_level()`（后来 P1639R0 提议把它们换成 `source_location` 与 `const char*`）。

这一版在 2019 年被移除。P1823R0 给出的理由直接把问题定性为「没准备好」：

> We had major design changes proposed and accepted by EWG this meeting … We have significant disagreement whether these changes make things better or worse. In fact, even the initial authors of Contracts for C++20 have no agreement. … We have no implementation experience.

技术上的致命处在 P0542R5 第 15 段：未被检查的契约条件是否被求值是 unspecified，而「若求值为 false 则行为未定义」。于是每个被关闭的断言都成了优化器的假设许可。[P1321R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1321r0.html)（Voutilainen，2018-10-07）用 Peter Dimov 的 Godbolt 原型演示了后果：`[[expects audit: x == 2]]` 在 `default` 级别下被折叠，最终对 `extern int a[3]` 写出越界写。围绕这一点的争论塑造了后来所有设计：

- [P1486R1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1486r1.html)（Lakos）主张工作草案里「检查或假设」的对应关系是转写错误，「关闭运行期检查从来不意味着默认当作假设」。
- [P1773R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1773r0.pdf)（Doumler）指出构建级别把语义放在代码之外全局决定，头文件库无法保证自己的假设不被某个 TU 变成检查。
- [P1670R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1670r0.pdf)（Meredith、Berne）指出谓词里的副作用一律 UB，于是往 `[[expects: g(x)]]` 里加一句 `std::cout` 就足以让所有调用者 UB。
- [P1490R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1490r0.html)（Krzemieński）指出 `axiom` 同时被用来表达「不能求值」和「编译器可当真理用」两件事，措辞只是「表面上的统一」。
- [P1290R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p1290r0.pdf)（Garcia）在 continuation mode 为 `on` 的前提下指出：程序明明知道谓词为假，还去假设它成立，这就是主动注入 UB。

Kona 2019-02 曾有「要不要拉闸」的投票（P1426R2，2/7/4/14/7，反对移除者占多数），真正的移除发生在五个月后的 Cologne。P1823R0 本身的票数未获一手记录。

---

## 3. SG21：从 build mode 到每次求值的实现定义语义

SG21 从零重做，先收缩成最小可用特性（MVP）：

- [P2182R1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/p2182r1.pdf)（2020）《Contract Support: Defining the Minimum Viable Feature Set》砍掉「继续执行」与 `observe`，只留「强制或忽略」。
- [P2388R4](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2388r4.html)（2021）《Minimum Contract Support》把语义定为 `no_eval` / `eval_and_abort`，仍按 TU 级构建模式选择。同期有 P2461R1（闭包式语法）与 P2487R0（属性式语法）两个竞争语法方案。
- [P2877R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/p2877r0.pdf)（2023-06-13 Varna）是转折点：语义改为每次求值由实现决定，构建模式被取消。
- 2024-03 Tokyo EWG 增加第四种语义：P3191R0 的「Louis semantic」（求值，但违规时不调用 handler，直接终止），由 [P3226R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2024/p3226r0.pdf) 定名为 `quick_enforce`，类比 `std::exit`/`std::quick_exit`，是从 25 个候选、38 条判据里选出的。同一会议把「终止方式由实现决定」固化下来，并明确 EWG 不接受「终止方式不该由实现决定」的方向。

其余部件的来源：handler API 是 P2811R7（P2853R0 的整体替代设计被 SG21 否决）；常量求值规则是 P2894R2；重复求值的上限是 P3119R1（推荐 64 次）；「契约断言序列」与可观察检查点是 [P3520R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2024/p3520r0.pdf) 与 P3328R0；`will_continue()` 改为 `is_terminating()` 是 P3227R1；协程上的 pre/post 一度被禁，后由 P3387R0/P2957R2 恢复；函数指针与类型别名上的契约被明确排除在 MVP 之外；类不变式从未被正式提案。

这段时期几个有决定性的投票：2022-12-14 关于「安全编程模型」和「谓词无副作用」的两次投票都没有共识（5/2/0/7/4、6/2/1/5/4），谓词因此允许有副作用，代价是允许被消除与重复；2023-02-08 Issaquah「谓词在 eval_and_abort 下恰好求值一次」被否（2/2/0/9/15），「可以求值零次或多次」成立（14/10/0/1/2）；2024-05-30「以 TS 而非 IS 发布」被明确否决（SF1 F3 N3 A12 SA10）；2024-11 Wrocław EWG 以 SF25 F17 N0 A3 SA12 把 P2900R11 送入 CWG/LEWG。

---

## 4. C++26 的设计：P2900R14

采纳过程：LWG 2025-02-13 以 F13 N0 A0 通过，CWG 2025-02-12 通过措辞，Hagenberg 全会（2025-02-16）进入工作草案。关键插曲是 EWG 在 2025-02-11 曾就「把 P2900 从 C++26 的 CWG 考虑中移除、另找发布载体」投票，结果 SF9 F8 N3 A19 SA41——反对移除构成共识，特性因此留下。同一会议以 20/24/13/14/2 决定彻底删除虚函数上的 pre/post（即 P3616R0），推翻了 St. Louis 的决定，这就是 C++26 缺少虚函数契约的直接原因。

### 4.1 语法与名字

```cpp
int f(int i)
  pre (i >= 0)
  post (r: r >= i)
{ return i; }

void g(int* p) {
  contract_assert (p != nullptr);
}
```

`contract_assert` 是关键字（[lex.key] 表 5）；`pre`、`post` 只是「有特殊含义的标识符」（[lex.name] 表 4，与 `final`、`import`、`module`、`override` 并列），因此它们在别处仍可当普通标识符使用，但不得用作宏名。`pre`/`post` 之后可以跟属性序列。

谓词是「一个 bool 类型的表达式」（语境转换到 bool）。结果对象只有写了 result-name-introducer（`post(r: …)`）才可命名。另有一条少见的规定：`va_start` 宏的调用不得作为谓词的子表达式（ill-formed，无需诊断）。

### 4.2 谓词的 const 化（constification）

谓词里引用断言外部实体的名字一律按 const 处理，这条限制在讨论中被称为 constification。它从 C++26 起生效，P0542 那一版没有对应规则——当时副作用是靠「未检查的谓词是否求值 unspecified、若求值为 false 则行为未定义」应付的（见第二节）。规范条文分散在三处，[basic.contract.general] 第 4 段只是概述性的 Note：

- [expr.prim.id.unqual](https://eel.is/c++draft/expr.prim.id.unqual) 第 7 段：id-expression 出现在契约断言的谓词中，且实体是「在断言外声明的、对象类型 T 的变量」、「在断言外声明的、类型为 T 的引用 的变量或模板参数」，或「对应变量在断言外声明的结构化绑定」时，该表达式的类型是 `const T`。这是浅 const：`int* p` 得到的是 `int* const`，指针本身不能改，所指对象仍可改。
- 同条第 6 段：后置条件的结果绑定（`post(r: …)`）同样被 const 化——返回类型 U 是「T 的引用」时表达式类型为 `const T`，否则为 `const U`。
- [expr.prim.this](https://eel.is/c++draft/expr.prim.this) 第 3 段：谓词中出现的 `this`（包括嵌套 lambda 的函数体内）在与当前类的 cv-qualifier-seq 合并时加上 const，即 `X*` 变成指向 const 的指针，于是非 const 成员函数调不出来。
- 这些都是编译期规则：违反是 ill-formed，不是未定义行为，也不是运行期断言失败。谓词内部自己声明的变量不受影响。

草案的 Example 2 给出了边界（`void f(int i, int* p, int& r, X x, X* px)`，`X::m()` 非 const）：

```cpp
pre (++n)     // 错误：试图修改 const 左值
pre (++i)     // 错误
pre (++(*p))  // OK：p 是 int* const，所指对象仍可改
pre (++r)     // 错误：引用也被 const 化，改的是 T 本身
pre (x.m())   // 错误：调用非 const 成员函数
pre (px->m()) // OK
pre ([=, &i, *this] mutable { ++n; /* 错误 */ ++i; /* 错误 */
                              ++p; /* OK：闭包成员 */ ++r; /* OK：非引用闭包成员 */ }())
```

这样设计的理由是 checking 语义下「谓词是否真的被求值」本身是 unspecified（见 4.4）：求值次数与是否发生都不确定，若谓词带破坏性副作用，可观察行为就会随实现和所选语义漂移。用类型系统静态禁掉，比事后规定 UB 更可控——后者正是 C++20 那一版的症结之一。

另有一条相关但独立的规则在 [dcl.contract.func] 第 7 段：后置条件 odr 使用非引用参数时，该参数（以及所有声明上的对应参数，包括不写后置条件的声明）都必须有 const 类型，见 4.3。迁移代价见第七节：const 化在 GCC 与 Clang 里都被评价为「平凡且不意外」，但真实代码会因漏写 const 而编译失败。

### 4.3 声明、ODR 与重载

函数契约说明符属于那个未指明的首次声明；后续声明要么不写，要么逐字等价。等价的含义是：说明符相同且顺序相同，谓词 ODR 等价（允许对函数参数、外围模板参数、结果绑定改名），两边要么都有 result-name-introducer 要么都没有。跨 TU 不一致时，只有声明附着于具名模块才必须诊断。

不得带契约的情况：被删除的函数，以及首次声明即 default 的函数。C++26 的条文里这一句还包含「虚函数」，现行 C++29 工作草案已把它删掉（见第六节）。后置条件若 odr 使用了非引用参数，该参数在所有声明上都必须有 const 类型；注意数组与函数参数会退化，所以 `int f(const int i[10]) post(r: r == i[0]);` 是错的——`i` 的类型是 `const int*`，不是 `int* const`。

契约断言在函数被 odr 使用或被定义时「被需要」，但不参与重载决议。规范给的例子是：

```cpp
template<class T> void f(T t) pre (t == "");
template<class T> void f(T&& t);
void g() { f(5); }   // 错误：二义
```

函数类型、函数指针、成员函数指针都不能携带契约说明符，但通过它们间接调用时，断言照常求值。

### 4.4 求值语义与违规判定

四种语义是 `ignore`、`observe`、`enforce`、`quick_enforce`。`observe`、`enforce`、`quick_enforce` 合称 checking，`enforce` 与 `quick_enforce` 合称 terminating。规范只说每次求值用哪一种由实现决定（同一次翻译内不同求值可以不同，包括常量求值），实现不必四种都提供；推荐做法是提供「全部 ignore」和「全部 enforce」两种翻译选项，且默认应当是 enforce。「默认 enforce」是 Recommended practice，不是规范保证。

四种语义各自的行为可以并列看清楚（「终止」都指 contract-terminated）：

| 语义 | 是否检查谓词 | 违规时 | handler 正常返回之后 |
| --- | --- | --- | --- |
| `ignore` | 否 | 不作违规处理 | 该次求值没有效果 |
| `observe` | 是 | 调用 handler | 继续执行 |
| `enforce` | 是 | 调用 handler | 程序 contract-terminated |
| `quick_enforce` | 是 | 不调用 handler，直接 contract-terminated | — |

`observe` 是唯一「报告完继续跑」的语义：handler 里 `is_terminating()` 为 false，`semantic()` 会如实报回 `observe`。也就是说它是诊断手段而不是安全机制——违规之后程序照常往下走，这正是硬化标准库那条线反对它的原因（见第五节第 7 条）。

其余细则：

- checking（`observe`、`enforce`、`quick_enforce`）会确定谓词的值，而谓词是否真的被求值 unspecified，实现可以用一个无副作用、同值的替代求值。规范给的例子是 `void f() pre((s.g++, false));`，其中的自增可能根本不发生。
- 契约违规的三种情形：谓词为 false；谓词的求值因异常退出；在 manifestly constant-evaluated 上下文中谓词不是核心常量表达式。
- 常量求值中：terminating 语义使程序 ill-formed，`observe` 则要求诊断，`ignore` 什么也不做（谓词本身仍须合法，也可以 odr 使用别的实体）。
- 非常量求值中：`quick_enforce` 使程序 contract-terminated——究竟是 `std::terminate`、`std::abort` 还是「执行直接终止」由实现决定；`enforce` 与 `observe` 则调用 contract-violation handler，传入指向 `const std::contracts::contract_violation` 的左值（存储位置 unspecified，不调用全局分配函数，生命期到该次调用结束）。

异常路径也有明确规定：若违规源自异常，handler 在一个隐式的活动 handler 内运行；`observe` 下 handler 正常返回后该隐式 handler 不再活动，`enforce` 下则带着它 contract-terminate。handler 从函数契约断言中以异常退出时，行为等同于函数体以该异常退出（function-try-block 捕获不到；在 noexcept 函数里导致 `std::terminate`）；从 `contract_assert` 中退出则继续向外寻找 handler。

求值顺序用「evaluate in sequence」定义：构造序列 S（R 中每个元素可以被重复实现定义的次数，首次出现的顺序保持），再按顺序求值。也就是可以重复，不可以越过首次出现重排。此外在求值前与 handler 正常返回后各有一个可观察检查点。

### 4.5 混合构建（Mixed Mode）

把用不同求值语义编译的 TU 链接到一起，P2900R14 与 P2899R1 称为 Mixed Mode；中文「混合构建」是意译，提案里没有对应的正式术语。它是这套设计在实现层最难自洽的地方，也是「契约可被忽略」这条反对意见（第五节第 1 条）的技术根子。

P0542R5 那一版明确不给保证：build level 不在所有 TU 中相同的程序是 conditionally supported，语义 implementation-defined，并且不允许任何程序化手段设置、修改或查询某个 TU 的 build level。P2877R0 之后构建级别这个概念被整体删掉，混合与不混合完全交给实现，支持混合不是强制要求。

P2899R1 把问题归结成一个三选二：对 inline 函数而言，「忽略断言时零开销」「不破坏现有 ABI 与链接器」「语义选择完全自由」不能同时成立，实现必须放弃其中一个——放弃混合模式下的确定性行为（只能保证用的是某个 TU 选的语义，但不知道是哪个）、放弃忽略断言的零开销（改成运行期按确定性规则选语义）、或者放弃与现有链接器的兼容（把所选语义编进 ABI，由链接器确定性地选，例如「总是选更严格的」）。P2899R1 的立场是这不是 P2900 的缺陷：任何「可以关掉的断言」都要付这个代价，同一函数在不同 TU 被不同编译的问题早于 contracts 存在。

P2900R14 §3.5.11 的理由链是：语义实际到运行期才确定，所以语义不同不构成 ODR 违反——契约断言所在函数的定义在语义不同时仍是同一 token 序列，与同一个 inline 函数在不同 TU 被不同程度优化同类。由此有一条明确判断：把混合配置的程序变成 ill-formed（无需诊断）要糟得多，那实质上是程序级的未定义行为，会违反 P2900 自己立的「显式定义所有新行为」原则。EWG 在 Hagenberg（2025-02-11）以 SF6 F5 N10 A25 SA17 否决了给契约加 ODR 约束的提议。inline 函数实际取哪份语义，草案列了几种可能：

- 被内联进调用者时，用调用方 TU 的配置。
- 有多份定义可用时，每次非内联调用求值其中一份；不改链接器的情况下同一函数最终只留一份版本，取到哪份实际上接近随机。这是唯一同时满足「忽略时零开销」与「不动 ABI」的方案。
- 多次非内联调用不必解析到同一份定义，只有在取函数地址时才要求一致，因此 TU 可以发一份无链接的本地副本，按自己的配置求值。
- 平台也可以不支持混合，改为要求所有 TU 语义一致；这合规，但会让分发二进制的使用变得极其困难。

缝隙就在这里：一个二进制里只要有一个 TU（或一个第三方库）以 `ignore` 编译，检查就可能根本不存在，而调用方无从得知——这正是第五节第 1 条要解决的问题。实现层的应对办法有几种：

- 把语义编进名字修饰（[P3910R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3910r0.pdf)，Bengt Gustafsson，2025-11）：不同语义的函数可以共存，inline 函数按调用点取语义，代价是混合语义的构建直接变成链接错误，链接 OS 或 C 库时不可接受。同一篇还给出链接器优先级列表的思路：找不到所请求的语义时按 `quick_enforce, enforce, observe, ignore, no_contracts` 的次序回退，再用一个「永远找不到的 undefined 语义」修饰名，保证取地址时仍然只有一份定义。
- 调用点检查与定义检查分开配置，如 GCC 的 `-fcontracts-client-check=` 与 `-fcontracts-definition-check=`。
- 不依赖全局配置，用厂商属性把个别断言钉死为 enforce（ScyllaDB 的做法，见第七节）。
- 在标准里加「必须强制」的标记，让源码直接锁死语义，即 `pre!` 与标签方案（见第五节）。

实证并不完全一边倒：P4306R0 收录的实现者记录里，Dionne 报告不同 hardening 模式混编可以工程化地保证安全，没有见到现场事故。

### 4.6 handler

contract-violation handler 是函数 `::handle_contract_violation`，单个参数为「指向 const `std::contracts::contract_violation` 的左值引用」，返回 void，可以带不抛异常的异常说明。实现必须提供定义（默认 handler），并且没有任何标准头文件提供它的声明；默认 handler 的行为只是推荐做法——输出最相关的违规信息、对可能重复的 observe 违规限速，然后正常返回。它是否可替换由实现决定，声明替换一个不可替换的 handler 是 ill-formed（无需诊断）。Kona 处理意见后新增了探测可替换性的宏（P3886R0）。

### 4.7 库设施

`<contracts>` 是 freestanding 头文件（[contracts.syn]），内容如下：

```cpp
namespace std::contracts {
  enum class assertion_kind : unspecified { pre = 1, post = 2, assert = 3 };
  enum class evaluation_semantic : unspecified { ignore = 1, observe = 2, enforce = 3, quick_enforce = 4 };
  enum class detection_mode : unspecified { predicate_false = 1, evaluation_exception = 2 };

  class contract_violation {                 // 没有用户可访问的构造函数
  public:
    contract_violation(const contract_violation&) = delete;
    contract_violation& operator=(const contract_violation&) = delete;
    ~contract_violation();                   // 是否虚由实现决定
    const char* comment() const noexcept;    // 谓词文本，可截断、可重排、可为空（推荐做法）
    detection_mode detection_mode() const noexcept;
    bool is_terminating() const noexcept;
    assertion_kind kind() const noexcept;
    std::source_location location() const noexcept;   // 前置条件取调用点，其余取断言位置（推荐做法）
    evaluation_semantic semantic() const noexcept;
  };

  void invoke_default_contract_violation_handler(const contract_violation&);
}
```

特色宏：`__cpp_contracts` 在 C++26 是 `202502L`，在 C++29 现行草案中是 `202606L`（因虚函数契约而提升）；`__cpp_lib_contracts` 一直是 `202502L`。另有 `__cpp_lib_replaceable_contract_violation_handler = 202603L`（P3886R0），取自 cppreference 与提案，未在草案 synopsis 中逐一核对。

---

## 5. 2025–2026 的争议

反对意见在 C++26 完成前后集中爆发，可以归成九类，每一类都对应具体措辞：

1. 可忽略、无法保证强制（RO 2-056）。[P3911R2](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3911r2.html)（2026-01-14，Neatu、Alexandrescu、Teodorescu、Sutter 等）指出 [basic.contract.eval] 规定「每次求值用哪种语义由实现决定」，而「默认 enforce」只是推荐做法，因此 C++26 无法表达「绝不允许通过」的断言。文中类比 Abseil `CHECK`、Folly `XCHECK`、WebKit `RELEASE_ASSERT`、LLVM `cantFail`、GCC 早年的 `[[pre check_never_continue:]]`。Kona 2025-11 的 EWG 投票（「是否按四个选项之一做修改」，SF18 F25 N22 A7 SA0）有改动共识，但后续没有落地措辞。这条意见有两层落点：单个 TU 就可以用 `ignore` 语义翻译，而多个 TU 混合时（见 4.5）最终行为还取决于链接结果，源码里看不出保证。
2. 谓词的 const 化：谓词内一切外部名字都变 const、`this` 变 pointer-to-const（规则见 4.2），使很多在函数体里合法的谓词写不出来（P4334R0 与 P3846R1 的交锋）。实现报告说这项迁移会打断真实代码的构建（见第七节）。
3. 副作用、消除与重复求值：规范允许谓词被求值 0 次、1 次或多次，并明确警告不同 TU 用不同语义会违反 ODR，例子是 `contract_assert((++const_cast<int&>(i), true));` 配合 `int a[f(1)];`——数组大小取决于求值语义。
4. 语义由实现或构建配置决定：[P3595R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3595r0.pdf) 用外部 JSON 配置按位置/命名空间/组/种类选择语义，[P3400R4](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3400r4.pdf) 用标签（新标签还会进入函数 ABI），[P4330R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p4330r0.pdf) 批评这等于「把行为从源码搬到构建配置」并伤害 profiles。
5. 默认 handler 不必终止，是否可替换也由实现决定（P3577R0、P3819R0）。
6. 虚函数：P3616R0 主张先删除；P3097R3 让虚调用断言依赖动态类型且不继承，覆写者必须重述基类断言，而当谓词引用基类私有成员时甚至无法重述。
7. 与 `assert`、加固标准库的集成：P3878R0（Voutilainen、Wakely、Spicer、Lavavej）直言硬化的标准库没法建立在 contracts 上，要求把语义规定为 terminating；P3290R6 让老 `assert` 经 `__STDC_WANT_ASSERT_USES_CONTRACTS` 路由到全局 handler，行为取决于哪个 TU 触发它；P3893R0 补上静态分析的顾虑——契约可被运行时关闭，工具只能猜。
8. 安全与 profiles：P3835R0《Contracts make C++ less safe — full stop!》（其具体论证是组件级语义不可控，见第八节）、P3500R0/R1、P3910R0、P4332R0、P4347R0。
9. 流程：[P4238R1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p4238r1.pdf)《Returning C++26 for the Evaluation It Skipped》（2026-09-01）要求国家机构在 DIS 投票中投反对票、退回草案「补上被跳过的评估，代价是一个周期」；P3909R0 要求改为 White Paper；P3829R0 主张 contracts 不该进语言；P4381R0 是 SG21 前主席的反对。

反提案同样密集。P3911R2 的最小扩展是给 `pre`/`post`/`contract_assert` 加「始终强制」标记（标签式 `pre<terminating>`/`pre<enforce>`，或 bang 式 `pre!`/`pre!!`），[P4044R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p4044r0.pdf)《Just `pre!`》收窄到只做前置条件：`pre!` 标记「必须满足的前置条件」，保证以 terminating 语义求值。它不引入新的求值模式，只是把已经允许的行为固定下来——[basic.contract.eval] 第 2 段本来就把每次求值的语义交给实现，第 3 段的推荐做法本来就默认 enforce；措辞上只在那一处加一句「用 `pre!` 引入的契约断言，实现应当以 terminating 语义求值」，并把「全部 ignore」的推荐选项限定为不以 `pre!` 引入的断言（提案正文把锚点误写成 `[decl.contract.func]`，应为 `[dcl.contract.func]`）。P4044R0 记录了 P3911R2 在 telecon 被 EWG 否决，以及 P3911R2 把 always-contract-terminate 扩到 `post` 与 `contract_assert` 后，技术反对集中在「后置条件能否可靠终止」，而 RO 2-056 的核心只需要前置条件。P3640R0、P4005R0、P3912R0、P3919R0 同族，方向是把推荐默认反转。P4009R0 走另一条路：语言里只留 enforce 与 ignore，写出 `pre(std::pre(x >= 0))`、`post(r: std::post(r >= 0))`、`contract_assert(std::cassert(x))`，由库函数查询实现配置、返回 `std::ignore` 类型的对象或自行处理 observe/quick_enforce/enforce；作者在同一篇里说「We have never had this much and this strong opposition to a feature in a DIS」。P3100 系列把核心语言 UB 变成隐式契约断言，配套反驳是 P4306R1、P4308R1、P4310R0。标签语法本身也有分歧：P3400R4 的标签对 P3831R0 的注解语法。

Croydon（2026-03）的结果是：EWG 否决把 P4044R0 作为 RO 2-056 的回应（1/17/10/18/14），也否决把 P3100R5 送进 C++26（同一票数），C++26 未做增删，直接送 DIS。也就是说，RO 2-056 在实质上从未被满足。

---

## 6. C++29 路线图与虚函数

[P3850R1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3850r1.pdf)（2026-07-15，Doumler、Berne）是 EWG 在 2026-06 Brno 以 SF12 F14 N3 A3 SA0 批准的路线图，按优先级排了六项扩展，每项都要求设计完备、措辞完整、至少一个主流编译器有完整实现：

1. 虚函数上的 pre/post（P3097R3）
2. 在代码里控制求值语义的标签（P3400R4）
3. 显式触发违规的库 API（P3290R6）
4. 用户自定义消息（P3099R3）
5. 守护核心语言 UB 的隐式契约断言（P3100R7）
6. 后置条件捕获（P3098R2），形如 `post [old_size = size()] (size() == old_size + 1)`

文件同时列出不在计划内的东西：函数指针与类型别名上的契约、类不变式、非语义用途的标签（局部违规 handler、改消息等）、P0465R0 式过程化接口、`requires` 子句、包展开、协程产出值的后置条件等。

P3097R3 是这六项里唯一已经落地的：现行工作草案中 [dcl.contract.func] 第 6 段的「虚函数」禁令已被删除，`__cpp_contracts` 也从 `202502L` 提升到 `202606L`。它的设计要点是「覆写函数的断言与被覆写函数相互独立」：一次虚调用既求值静态选择函数的断言，也求值最终覆写者的断言，用例子说明就是——

```cpp
struct X1 { virtual void f() pre(a) post(b) {} };
struct Y  : X1 { void f() override pre(e) post(f) {} };
struct Z  : Y  { void f() override pre(g) post(h) {} };
```

`z.f()` 断言 g,h；`static_cast<Y*>(&z)->f()` 断言 e,g,h,f；经基类引用 `x1ref.f()` 断言 a,g,h,b；经成员指针 `(x1ref.*pmf)()` 只断言 g,h（没有静态选择的函数）。它同时改了 [intro.execution] 的定序规则，以及 [expr.call] 中关于前置/后置断言与参数初始化、参数析构次序的措辞。

---

## 7. 实现与工具链

[P3460R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2024/p3460r0.pdf)《Contracts Implementors Report》（2024，Fiselier、Ranns、Sandoe）的结论是 P2900 的规范「清晰且可实现」：GCC 与 Clang 都按 P2900 做了实现，Clang 侧最困难的是 result-name introducer，被称为「by far the most novel and difficult part」；谓词的 const 化在两家实现里都「平凡且不意外」，但把真实断言迁移过去会打断构建——libc++ 的 `_LIBCPP_ASSERT` 用 `contract_assert` 重写后基本原样编译通过（`quick_enforce` 特别有用），整个 LLVM 的 `<assert.h>` 实验花了一天修 const 错误，问题集中在「实际是 const 的成员漏写 const」「参数漏写 const」「只在调试期改动的状态不是 const」以及重载决议失败。报告里没有任何代码体积或性能数字。

当前状态（2026 年）：GCC 16 是唯一发布了 P2900 支持的实现，且要显式打开——`-fcontracts`，配合 `-fcontract-evaluation-semantic=ignored|observed|enforce|quick_enforce`（TU 级）、`-fcontracts-client-check=`、`-fcontracts-definition-check=`、`-fcontract-checks-outlined`、`-fcontract-disable-optimized-checks` 等；虚函数契约尚未实现（GCC PR125834）。Clang、MSVC、EDG 都没有已发布的 P2900 支持：Clang 的 C++ 状态页把两行都标为 No，MSVC 侧 P4306R0 说加固违规要等「MSVC 实现 contracts，而那项工作尚未发布」。cppreference 的 C++26 支持表同样只有 GCC 16 一列有 `__cpp_contracts`。

工具链论文里值得记的几条：P3595R0 提供按位置的 JSON 配置（GCC/Clang 均有原型），理由是「逐条断言的控制用命令行不现实」；P3290R6 给出库侧显式触发违规的 API 与 `assert` 迁移路径；P3183R0 讨论如何在测试里只检查前置或后置条件；P3267R0/R1 归纳了「谁能选择语义」的七种策略。P4306R0 汇总了强制语义的代价与诉求：可抛异常的 handler 逼编译器在每个断言周围生成异常处理指令（noexcept 与否是链接期信息，编译期不可知），GCC 对「可能抛」的谓词包 try/catch；libc++ 维护者说链接期可覆盖的 handler「太重，而你需要的是生成一条 trap 指令」；ScyllaDB 迁移到实验实现后干脆用厂商属性把断言钉死为 enforce，其工程师抱怨「写契约的人不是为应用选语义的人，这与硬化库的需求不一致」。

---

## 8. 争论的实质

把九年拉直看，争的其实是一个问题：契约断言的语力归谁定。

P0542 把它交给构建级别（TU 外部的全局开关），并让未检查的谓词变成 UB——技术上是错的，2019 年被移除。P2900 换成「每次求值的语义由实现决定，默认 enforce 只是推荐做法」，同时用谓词 const 化、禁止越过首次出现重排、允许消除与重复来保证「语义选择不改变可观察语义」，这在语言设计上自洽，代价是规范里没有任何一句能保证某个断言一定会被执行：单个 TU 可以整体用 ignore 翻译，多个 TU 混合时（见 4.5）还要看链接结果。对安全关键代码和硬化标准库来说，这正是不可接受的。

### 8.1 两种危害：可以被忽略，与违约后继续

反对这套设计的人常用一句话收尾：能被忽略的检查等于没有检查，安全特性反而制造不安全，还不如不做。这句话在 WG21 里出现过两次，理由并不相同，值得分开看。

2019 年那次是 [P1426R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1426r0.pdf)（Nathan Myers，audience All of WG21）《Pull the Plug on Contracts?》，原话是「让语言变得更难理解的 contracts 特性，可能还不如完全没有这个特性」——理由是设计失去一致性与可理解性，与安全无关。Kona 2019 的投票否决了移除，但同年 Cologne 还是靠 P1823R0 拿掉了。可见「还不如没有」作为施压手段是有效的，成立与否取决于当时有没有替代设计。

2025 年这版的原文是 [P3835R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3835r0.html)（Spicer、Voutilainen、Garcia Sanchez）《Contracts make C++ less safe -- full stop!》，结尾主张这套设施降低 C++ 的安全性、应当移除，直到出现严格更安全的版本。但它的论证其实是组件级语义不可控：头文件里的 inline 函数带 `contract_assert`，库以 `quick_enforce` 编译、客户端以 `ignore` 编译时，`f(0)` 会不会被抓到取决于链接器选了哪份定义，程序员无从知道；文中还记录 Fiselier 在 2025-02 会上说缺少把语义绑到组件的机制时这个特性「实质不可用」，于是他在 Clang 里自建了一套属性与选项。也就是说，这篇真正要的是标签机制（C++29 路线图第 2 项），移除是施压手段，而非它给出的终局。

就技术实质而言，比「可忽略」更锋利的是「违约以后继续执行」。这一点设计方自己在 [P2388R4](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2388r4.html)（Krzemieński、Ažman，2021）的附录 A 里就承认了：前置条件防的往往是抽象机违规，而「记日志然后继续」可能让排障者看不到那条日志（后续的未定义行为把痕迹抹掉），文中说它「有欺骗契约违规日志使用者的能力」；继续执行本身还会引入新的抽象机违规——在已经违约的状态下往下走，就是主动进入作者声明不可能出现的状态。作者当时的判断是「这并不比整个关掉运行期检查更糟（后者没有人有异议）」，但也承认对现实性没有共识，并说在 P1494R2 探明之前，任何允许继续执行的方案都会被挡住（相关讨论还有 P2339R0）。这正是 P3878R0 说 `observe` 对内存安全机制「完全不可接受」的原因。所以两种危害要分开：忽略是没检查，继续执行是带着已知违约继续——后者才是「安全特性制造不安全」的准确指控对象（对照见 4.4 的语义表）。

至于「还不如没有」这个结论本身，它需要一个比较基线。没有 contracts 的世界里，替代品是 `assert`/`NDEBUG`、各家 `CHECK`/`RELEASE_ASSERT`、厂商属性和编译器 hardening 开关，这些同样可关，而且 P3835R0 举的组件问题一模一样——头文件里宏的行为由编译它的 TU 决定；配置不一致时更糟，是 IFNDR（P2900R14 §3.5.11 把「混合配置变 IFNDR」直接说成实质上的程序级未定义行为）。相比之下 contracts 至少提供了可观测的手段：handler 里能查 `semantic()` 与 `is_terminating()`、可替换性有宏可探测、实现提供 TU 级开关（GCC 的 `-fcontract-evaluation-semantic=`），且混合配置不落进 IFNDR。要证明「严格更不安全」，得拿出「因为写了 `pre` 就把原有的无条件检查撤掉」这类证据；P4306R0 收录的现场记录反而是反方向的——ScyllaDB 用厂商属性把断言钉死为 enforce，是加机制而不是拆检查。

因此更准确的写法是两句而不是一句：把可关闭的断言当作保证来使用，会让程序比没有这个机制更糟，因为它会让人不去部署真正无条件的检查；但这不构成删除特性的理由，而构成必须补上源码级强制手段（`pre!`、标签、按组件绑语义）、并禁止拿它充当安全边界的理由。这套设计真正的短板也不是「存在一个可以被忽略的语义」，而是忽略与否在源码层面看不出来，跨 TU 时还不由单个构建单元决定（见 4.5）——所以最有建设性的批评方向是可见性：让「这条断言在这个构建里是 enforce 还是 ignore」可查、可审计、可被工具检查。Croydon 2026-03 的结果是两个方向都没走通：既没给强制手段，也没接受删除，这大概就是「还不如没有」这句话至今仍有市场的原因。

### 8.2 两边都不满意的僵局

有一句在会后流传的概括：contracts 同时被批评「不完整」和「内容太多」，所以现在给它加特性或者减特性，都会让更多人不满意。这句话未能找到逐字出处——公开文本里最接近的是 SG21 前主席 John Spicer 的 [P4381R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p4381r0.html)《Chairing SG21 and then objecting to Contracts》（2026-09-19），但那篇里没有这句表述。不过作为对僵局的描述，它有一手记录支撑，值得单独拆一层。

设计方自己在 [P2899R1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p2899r1.pdf) §2.2 里承认了这个结构：P2900R14 「is commonly criticized as being too large」，P1607R1 曾提出小得多的集合；但它「is indeed minimal in the sense that it represents the smallest possible feature set that, as a whole, could achieve SG21 consensus within the existing WG21 standardization process」。从 P2388R0 到 R14 陆续加进去的东西——用户自定义 handler、observe 与 quick-enforce、协程上的 pre/post、constification——每一项的理由都是「necessary to overcome limitations that, at least for some members of SG21, would have made the entire proposal unviable」。同一节还记录了反方向：P1607 那条最小化路线被判断为「too restrictive … to be practically useful for the more important runtime checking use case」（原文如此），因此没有采用（详见 P3386R0 §4）。也就是说，这个特性集不是技术上的最小集，而是联盟最小集：少一项就有成员退出支持，多一项就动到已经谈成的妥协。

票数把这个两头堵住的形状写得很清楚：Hagenberg（2025-02-11）想把 P2900 从 C++26 拿掉的动议是 SF9 F8 N3 A19 SA41（没通过，但 19 票弃权）；Croydon（2026-03）以同一组票数 1/17/10/18/14 先后否决了 P4044R0（加强制手段）与 P3100R5（加隐式断言）；Kona（2025-11）关于 RO 2-056 的投票 SF18 F25 N22 A7 SA0 显示有改的意愿，但没有任何措辞落地；再往前，SG21 在 2024-05-30 曾以 1/3/3/12/10 否掉「先以 TS 发布」，理由是没有更好的载体。

但把这句概括读成「大小之争」是误读，两边说的其实不是同一件事。Spicer 在 P3478R0 里反对的是 constification 进 MVP——「Novel expression semantics inside contract predicates are surprising, change overload resolution, and buy very little. Shipping them as part of a 'minimal' product is the opposite of minimal.」；同一批人又在 [P3835R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3835r0.html) 说这个特性不可用的原因是缺少把语义绑到组件的机制，P3573R0 说 MVP 在真正要紧处（跨 TU 的 mixed checking、modules、规模化虚函数）既不完整也未经试用，P3506R0 说 pre/post 缺现场经验。合起来是：嫌它大的地方不对，缺的地方要紧——不是尺寸轴两端的意见分布，而是形状之争。

加与减也不对称，这一点比「都不满意」更值得记。加可以推迟到后续标准，并按实现门槛准入：P3850R1 的 C++29 路线图要求每项扩展设计完备、措辞完整、至少一个主流编译器完整实现，P3097R3 就是照这个门槛过掉并已并入现行工作草案的（`__cpp_contracts` 随之从 `202502L` 升到 `202606L`）。减则是破坏性的：求值语义已经写进规范文本，混合 TU 的链接行为、handler 的签名与可替换性都随之固定，事后删掉 `observe` 之类的语义，对已经按它写的实现和库是破坏性变更。所以委员会更愿意推迟「加」，而不是「减」——这不是两头讨好，而是有方向的。

对现状的读数也要小心。上面那场 SF9 F8 N3 A19 SA41 常被读成「多数支持保留」，但把 41 张强烈反对移除、19 张弃权和 12 张赞成移除放在一起看，它更像「没有热情的支持」；SG21 当年否掉 TS 的理由也不是「这个设计好」，而是没有更好的载体。这句话描述的是可行性边界，不是最优性证明。

因此它的正确用途是诊断而不是结论：它证伪的是「再谈几轮就能收敛」的信心（[P4238R1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p4238r1.pdf) 在 DIS 投票前呼吁国家机构投反对票，正说明僵局延续到了投票阶段），但推不出「维持现状即为最优」。按它应该走向的是换形状或换载体——把可关闭的断言工具与需要保证的安全契约拆成两件事，或者退回 TS／white paper（P3851R0 的建议，没赢）；「任何增删都会更糟，所以别动」是对它的过度解读。

### 8.3 语力往哪儿去

反对派的方案（always-enforced 标记、`pre!`、标签、JSON 配置、库化）都在试图把语力重新交回代码或策略配置，但这与「对已发布设计做最小改动」以及 ABI 稳定性直接冲突，于是被一次次推迟到 C++29。因此当前的状态是：C++26 会带着这套「实现定义语义」的设计出版（除非 DIS 阶段被国家机构退回），而「保证强制」这件事在 C++29 里仍没有定论——承载它的 P3400R4 标签还未定稿。

---

## 9. 取证与存疑

已核对一手文本的部分：契约相关条款取自 eel.is 现行工作草案（2026-08-23 快照），包括 [basic.contract]、[contracts.syn]、[dcl.contract.func]、[dcl.contract.res]、[cpp.predefined]、[class.virtual]（后者完全没有契约措辞，虚函数的契约规则在 [expr.call] 与 [intro.execution]）；P2900R14、P2899R1、P3850R1、P3097R3、P3460R0、P3910R0、P3911R2、P4044R0、P4238R1、P4306R0、P4381R0 等读的是提案原文，第八节里 P1426R0、P3835R0、P2388R4 的引文也取自原文；投票数字取自 P2899R1、P2521R5、P3850R1、P3911R2、P4238R1 的正文或引文。

以下几处证据较弱，引用时需注意：

- C++26 送 DIS 的全会表决数字（114/12/3）只有二手来源（会议报道与参会者报告），未见 ISO 投票门户的一手记录。
- N5031（Kona 2025-11 纪要）在其预期 URL 上取不到，Kona 的投票数字来自 P3911R2 与 P4238R1 对 EWG 投票记录的逐字引用，而非纪要本身。
- `__cpp_lib_replaceable_contract_violation_handler = 202603L` 取自 P3886R0 与 cppreference，未在草案 synopsis 中核对。
- DIS 投票是否已正式开始、当前结果如何，截至本文写作时没有一手信息。
- P4044R0 与 P3835R0 没有 PDF，正文取自 open-std 上托管的 HackMD 渲染页，个别措辞可能与其网页版有细微差别；P4044R0 措辞片段里的锚点误写已在第五节标出。
- P1823R0 自身的票数、P0542 进入工作草案时具体搬入的是哪个修订，均未获一手记录。
- P0542R5 之后、SG21 之前的若干过渡提案（如 P1607R0、P1710R0、P1769R0、P1793R0）本文只按二手转述提及，未逐篇核对。
- 第八节开头那句「加特性或减特性都会让更多人不满意」的概括未见逐字出处，只找到与之最近似的公开文本（P4381R0）；该节引用的 P3478R0、P3573R0、P3506R0、P3851R0 原话均转引自 P4381R0，未逐篇核对原文。
