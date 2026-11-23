---
title: "std::string 研究"
slug: "std-string"
date: "2026-11-15"
tags: ["C++", "标准库", "字符串"]
series: "C++ 标准库"
series_order: 5
draft: false
summary: "以标准条款、WG21 提案与三家实现源码为证据，拆解 std::string 的对象布局与 SSO 阈值、COW 历史与双 ABI、容量与失效语义、修改路径的异常保证，以及 string_view、resize_and_overwrite 与 pmr 的边界。"
---

## 0. 结论摘要

`std::string` 的行为由三条不变式固定：连续存储且末尾带空终止符、分配器感知但不使用分配器的构造与析构、容量只是请求而非承诺。三条合起来排除了分片表示，也让 SSO 只能把缓冲内嵌在对象里。

对象布局属于 ABI。带 SSO 的 string 无法再用三个指针描述：内部缓冲必须与容量字段共享空间，libstdc++ 与 MSVC STL 用「指针 + 长度 + 尾部联合体」（32 字节，15 字符），libc++ 用整个表示的联合（24 字节，22 字符）。阈值由对象大小预算与 `sizeof(charT)` 决定，属实现定义。

失效规则弱于 `vector`：`[string.require]/4` 只说非 const 成员函数「可能」使引用、指针、迭代器失效，不保证「未重分配就有效」。任何修改之后重新获取 `c_str()`、`data()` 与迭代器，是唯一可移植的写法。

修改路径的成本由两个判断决定：是否重分配，源区间是否与目标重叠。源落在自身缓冲内时先复制到临时缓冲，libstdc++ 用 `_M_disjunct` 做这个判断。追加触发的重分配按实现选定的因子扩张，libstdc++ 与 libc++ 约为 2 倍，MSVC 为 1.5 倍。

异常保证接近强保证：`[string.require]/2` 规定成员函数抛出异常时对对象没有其他效果。这一点与 `vector` 的中间插入不同，原因是元素为 char-like 类型，复制与赋值不抛，实现可以先备好新内容再提交。

实际使用可以收敛成三条规则：

- 跨 ABI 边界不传 `std::string`；接口用 `const char*` 加长度，或 `string_view` 并在文档中约定生命周期。
- 需要控制分配次数时先 `reserve` 再 `append`，不要依赖 `shrink_to_fit` 收缩；小串的容量由 SSO 阈值决定。
- 视图只作参数，需要保存时转成 `std::string`；`c_str()` 的指针不跨任何非 const 调用保存。

---

## 1. 范围与口径

`std::string` 是 `basic_string<char>` 的别名。接口覆盖构造、容量、元素访问、修改、查找与比较，另有一组非成员函数。决定行为的是四个层面：

- 对象表示：是否使用 SSO、阈值多少、各字段如何排布。
- 容量与失效：何时重分配，哪些操作使引用、指针、迭代器失效。
- 修改路径：内部移动与复制如何组织，源与目标重叠时如何处理。
- 边界设施：`string_view`、`c_str()`、`resize_and_overwrite`、`pmr` 别名与 C 互操作。

本文讨论 `char` 实例化，`wstring`、`u16string`、`u8string` 的差异集中在阈值与 `char_traits`，结论可类推。Unicode 语义不在范围内：`basic_string` 不承诺编码，码点、字素与归一化属于外部库。

### 1.1 证据分级与版本基准

本文用四类标记区分证据等级，正文按需标注：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | C++ 工作草案的可观察要求 | `[string.require]/4` 的失效规则 |
| [paper] | WG21 提案与缺陷报告 | P1072R10 引入 `resize_and_overwrite` |
| [impl] | 标准库实现源码 | libstdc++ 的 `_S_local_capacity` |
| [推断] | 由证据推出的工程判断 | SSO 阈值与 ABI 冻结的关系 |

版本基准：标准侧以 eel.is 的 2026-11 草案快照为准，C++20 与 C++23 的措辞用 N4861、N4950 对照，段号差异只在影响引用时说明。

实现侧对照上游主分支源码：libstdc++ 的 `bits/basic_string.h` 与 `bits/basic_string.tcc`，MSVC STL 的 `stl/inc/xstring`，libc++ 的 `libcxx/include/string` 与 `__functional/hash.h`。正文只写文件名与函数名，不写行号，行号随提交位移。

草案不是正式标准，正式文本是 ISO/IEC 14882。本文引用的段号对应草案快照，标准换版后可能位移。

### 1.2 不做什么

- 不重述字符串库的需求分层：见系列第 3 篇《不同的 C++ 使用者对字符串库有什么需求》。
- 不展开分配器协议与 `pmr` 的完整设计：见系列第 2 篇《标准库分配器的演化》。
- 不比较第三方小字符串实现（folly `fbstring`、EASTL）的布局，除非用于说明某个取舍。
- 不做本机测量，不给绝对性能数字；容量序列与阈值由源码布局推导。

---

## 2. 标准要求

### 2.1 三条不变式

`basic_string` 的规范身份由三条要求固定（[draft][string.require]、[string.access]）：

- 连续存储：`[data(), data() + size()]` 是有效范围，`data() + size()` 指向值为 `charT()` 的对象，改写该对象是未定义行为。这条让 `c_str()` 与 `data()` 可以交给 C 接口。
- 分配器感知但不使用分配器的构造与析构：`[string.require]/3` 的注写明它是分配器感知容器，但不调用 `allocator_traits::construct` 与 `destroy`，元素的生存期由 `char_traits` 的复制与赋值管理。
- 容量非承诺：`reserve` 只在容量不足时重分配，`shrink_to_fit` 是非约束请求（[draft][string.capacity]）。

第二条是 string 与 vector 的第一处语义分叉。后果是自定义分配器无法介入单字符的构造，只能管理整块存储；元素构造不经过分配器，`std::string` 因此没有「构造时注入」的钩子。

另有两条通用规则：长度超过 `max_size()` 的操作抛 `length_error`（`[string.require]/1`）；成员函数抛出异常时对对象没有其他效果（`[string.require]/2`，第 6 章展开）。

### 2.2 接口地图

把接口按条款分组，可以看清每组的成本来源：

| 组 | 条款 | 代表操作 | 成本来源 |
| --- | --- | --- | --- |
| 构造与赋值 | [string.cons] | 从指针、长度、视图、范围构造 | 复制字符 |
| 容量 | [string.capacity] | `size`、`capacity`、`reserve`、`resize` | 重分配时移动全部字符 |
| 访问 | [string.access] | `operator[]`、`at`、`data`、`c_str` | 常数时间 |
| 修改 | [string.modifiers] | `append`、`insert`、`erase`、`replace` | 移动插入点之后的字符 |
| 查找与操作 | [string.ops] | `find`、`substr`、`compare` | 逐位置比较或复制 |

最后一行需要拆开看：`substr` 返回新的 string，成本是复制；`find` 返回下标，成本是比较次数；`compare` 返回三值结果，成本是较短长度的比较。

### 2.3 失效规则

`[string.require]/4` 列出的失效来源只有两类：把对象作为参数传给接受非 const `basic_string` 引用的标准库函数，以及调用非 const 成员函数。它同时给出九个例外：`operator[]`、`at`、`data`、`front`、`back`、`begin`、`rbegin`、`end`、`rend` 不在此列。

措辞用的是「可能失效」（may be invalidated），不是「重分配则失效，否则保持」。这与 `vector` 的写法不同：`[vector.modifiers]/2` 明确规定不重分配时插入点之前的引用保持有效。string 没有给出对等的保证，原因之一是历史实现（第 4 章的 COW）让「没有插入也可能换掉缓冲区」成为常态，标准因此只保留最弱的说法[推断]。

可执行的结论只有一条：任何非 const 成员调用之后，重新获取 `data()`、`c_str()` 与迭代器。反过来说，只读操作不失效有规范依据：`[container.reqmts]` 规定除非显式说明，调用容器成员函数不会使迭代器失效，也不会改变元素的值。

### 2.4 异常保证

`[string.require]/2` 的措辞比 `vector` 的对应条款强：「若 `basic_string` 的任何成员函数或运算符抛出异常，该函数或运算符对 `basic_string` 对象没有其他效果。」这是无条件的强保证，不依赖元素类型的属性。

可能抛出的来源只有三类：`at` 与带位置参数的修改操作抛 `out_of_range`；长度越界抛 `length_error`；分配失败抛分配器的异常（通常是 `bad_alloc`）。元素复制与赋值不抛，因为 char-like 类型的 `char_traits` 操作是逐字节的。

这条保证解释了实现的写法：先把所有可能抛出的步骤做完（分配新块、把结果拼进临时缓冲），再用不抛的动作提交（交换指针、写终止符、更新长度）。第 6 章按这个顺序展开。

### 2.5 版本差异

同一组接口在不同版本上的语义有四处变化需要区分：

- C++11 起 `data()` 与 `c_str()` 等价，都保证 `data()[size()]` 是终止符；此前 `data()` 不保证。
- C++17 起非 const 的 `data()` 返回 `charT*`，可以写入 `[0, size())`。
- C++20 起接口成为 constexpr（P0980R1），`starts_with` 与 `ends_with` 加入（P0457R2）。
- C++23 起 `contains`（P1679R3）、`resize_and_overwrite`（P1072R10）、`substr() &&`（P2438R2）加入，从 `nullptr` 构造被禁止（P2166R1）。

当前草案另有两处变化：`operator[]` 的前置条件被标为 Hardened preconditions（`[string.access]/1`），`to_string` 的措辞改为 `format("{}", val)`。第 12 章统一说明。

---

## 3. 对象模型与 SSO

### 3.1 三个字段与缓冲的共用

string 需要记录三件事：缓冲区地址、当前长度、容量。SSO 要求内部缓冲与容量字段重叠，于是「三个指针」这种排布不再可行：64 位平台上三个指针占满 24 字节，没有空间放 15 字节缓冲。三家的做法都是用「缓冲与某个字段共享空间」的联合体：

| 实现 | 字段与缓冲 | SSO 容量 | 64 位对象大小 |
| --- | --- | --- | --- |
| libstdc++（C++11 ABI） | `_M_dataplus` 指针、`_M_string_length`、联合体 `_M_local_buf[16]` 与 `_M_allocated_capacity` | 15 | 32 |
| MSVC STL | `_Bx` 联合体（`_Buf[16]` 或 `_Ptr`）、`_Mysize`、`_Myres` | 15 | 32 |
| libc++ | 整体联合：`__long`（指针、长度、63 位容量与 1 位标志）与 `__short`（23 字节数据区、7 位长度与 1 位标志） | 22 | 24 |

三家的常量可以对照源码读出来：libstdc++ 的 `_S_local_capacity = 15 / sizeof(_CharT)`；MSVC 的 `_BUF_SIZE = 16 / sizeof(value_type)` 与 `_Small_string_capacity = _BUF_SIZE - 1`；libc++ 的 `__min_cap = (sizeof(__long) - 1) / sizeof(value_type)`，短串容量为 `__min_cap - 1`[impl]。

### 3.2 阈值从哪来

三个数字都来自同一个预算：对象大小定下来之后，能在对象里留出多少字节给缓冲。

libstdc++ 与 MSVC STL 给内部缓冲 16 字节：15 个字符加一个终止符。其余 16 字节给指针与长度，总大小 32 字节。libc++ 把总大小压到 24 字节，用一个字节存 7 位长度与 1 位长串标志，剩下 23 字节作数据区，于是 22 个字符加终止符。代价在长模式：容量字段与标志位共享一个字，容量只用 63 位表示。

阈值随元素宽度收缩。三者都用 `sizeof(charT)` 做除法，因此 `wstring` 的 SSO 容量取决于平台的 `wchar_t` 宽度。以 libstdc++ 的 `15 / sizeof(wchar_t)` 为例：Windows 上 `wchar_t` 为 2 字节，容量 7；Linux 上为 4 字节，容量 3。libc++ 的公式是 `(sizeof(__long) - 1) / sizeof(charT) - 1`，同一平台上得到 10 与 4。这是「由实现定义」的一个直接例子。

直接可观察的后果是空串的 `capacity()`：libstdc++ 与 MSVC 返回 15，libc++ 返回 22。任何把 15 或 22 写进断言的测试都绑定了实现。

### 3.3 指针必须指向自身缓冲

SSO 之后，`data()` 在短串上必须返回对象内部数组的地址。这条要求使 string 的复制与移动不能按字节完成：复制要把指针重定向到自己的缓冲，移动要先判断源处于短模式还是长模式。

libstdc++ 的移动构造走 `_M_move`：源为长模式时接管指针并把源重置为空，源为短模式时复制 `_M_local_buf`。libc++ 的短串移动同样复制数据区。因此移动一个短 string 的成本是一次内部缓冲的复制（16 或 23 字节），不是零；但它是常数时间且不抛，所以移动构造可以无条件声明 `noexcept`。

由此得到两条使用规则：`std::string` 不是平凡可复制类型，用 `memcpy` 复制 string 对象是错误的；把它放进 `vector` 后，扩容依靠逐元素移动构造完成，按字节搬移的优化不适用。

### 3.4 大小与取舍

32 字节与 24 字节的差别是 8 字节换 15 字符的免分配区间。小串密集的场景（配置键、短标识符、日志片段）受益于 SSO；对象本身变大则在小容器、按值传递与数组里付出代价。

与 `std::vector<char>` 的 24 字节相比，32 字节的 string 多出的部分正是内部缓冲。这个比较也说明 SSO 的边界：它优化的是「短且频繁创建」的串，不改变长串的分配行为。

### 3.5 布局即 ABI

`sizeof(std::string)` 与字段顺序写进二进制接口。libstdc++ 用 `_GLIBCXX_USE_CXX11_ABI` 在两套实现之间选择；libc++ 用 `_LIBCPP_ABI_ALTERNATE_STRING_LAYOUT` 在两种字段顺序之间切换，以便在 ABI 修订时区分新旧布局；MSVC 的布局随工具集版本变化，跨版本混用运行库会破坏二进制兼容。

因此标准不会规定 SSO 阈值，实现也不会为了几个字节重排布局。第 11 章讨论这条约束在工程上的后果。

---

## 4. COW 历史与双 ABI

### 4.1 COW 的实现

C++11 之前，libstdc++ 的 `basic_string` 用引用计数实现写时复制。对象持有一个指向表示（`_Rep`）的指针，表示内部依次是长度、容量、引用计数与字符数据。复制构造只增加计数，`c_str()` 直接返回共享数据。

写操作需要先确认独占：非 const 的 `operator[]`、`at()`、`begin()` 在共享状态下调用 `_M_leak`，必要时分配私有副本再分离。后果是读取一个字符也可能触发 O(n) 的分配与复制，引用计数在多线程下需要原子操作。

### 4.2 C++11 为什么禁止

GCC 文档的表述很直接：新 ABI 是为了符合 2011 标准，标准禁止写时复制字符串[doc]。可核实的技术理由有三条：

1. `operator[]` 的非 const 重载必须返回可写的 `charT&`（`[string.access]/2`），COW 只能在返回引用前分离，于是「读一个元素」可能分配，而且分配的时机不可预期。
2. 容器要求允许并发修改不同元素而不构成数据竞争（[container.reqmts]），共享表示下的计数与分离需要同步，否则违反该要求。
3. 失效规则以对象拥有自己的存储为前提（`[string.require]/4`），共享表示让「没有修改」也可能改变指针的身份。

前两条是规范层面的，第三条是从规范推出的判断[推断]。三条合起来说明：COW 的退场源于与 C++11 引用语义、并发模型的不兼容，与性能无关。

### 4.3 双 ABI

GCC 5.1 起，libstdc++ 同时提供两套实现。新实现放在 inline 命名空间 `__cxx11` 中，符号名因此不同，同一个库里可以同时存在两种定义。`_GLIBCXX_USE_CXX11_ABI` 取 1 用新 ABI（默认），取 0 用旧 ABI，宏的选择与 `-std` 无关，这样 C++03 与 C++11 的代码可以链接到一起。

旧 ABI 缺少的能力有明确清单：不能用 `string::const_iterator` 作位置参数，不支持分配器传播，不支持常量求值中的 string，也没有 `<syncstream>` 与 `chrono` 的时区接口。这些缺失意味着旧 ABI 只能作为兼容层使用。

### 4.4 混合链接的症状

两套 ABI 混用时，症状分三层：

- 链接期：未定义符号里出现 `std::__cxx11` 命名空间或 `[abi:cxx11]` 标签。这是最容易定位的一层。
- 编译期：`abi_tag` 属性让编译器发现一部分不匹配，`-Wabi-tag` 可以打开告警。
- 运行期：类的成员是 string 时，类型名字修饰不随 ABI 改变，问题被推到运行期，表现为崩溃或数据错乱。

处置办法只有两条：统一工具链与宏；对外接口不暴露 `std::string`。静态库、插件与跨编译器边界是主要来源。

---

## 5. 容量语义

### 5.1 reserve 的当且仅当条款

`[string.capacity]` 对 `reserve` 的措辞是「当且仅当当前容量小于参数时在此刻重分配」。重分配后 `capacity()` 不小于参数，否则等于原值。三个推论：

- `reserve` 不缩小容量，`reserve(0)` 与小于当前容量的请求完全无效。
- `reserve` 不改变 `size()`，不构造元素，之后不能访问新增容量中的对象。
- 重分配与否只看参数与当前容量的比较，与后续操作无关。

对 string 还有一个 SSO 效应：空串的容量已经是阈值，`reserve(10)` 在三家实现上都不分配，因为请求小于阈值，结果落在内部缓冲里。容量小于阈值的请求全部属于这种情况。

实现可以在重分配时分配多于请求的块（分配器取整或增长策略），标准只要求不小于参数。依赖 `capacity()` 精确值的代码不可移植。

### 5.2 shrink_to_fit 与非约束请求

`shrink_to_fit` 被规定为「把 `capacity()` 减到 `size()` 的非约束请求」（[draft][string.capacity]）。非约束的含义是实现可以完全忽略，也可以只收缩一部分。复杂度条款是：长度不等于原容量时线性，否则常数。

对 string，收缩的下界不是 `size()`：实现可以把数据搬回内部缓冲，此时 `capacity()` 等于阈值；也可以在堆上分配一个更小的块，此时容量接近 `size()`。两种结果都符合非约束请求。需要确定释放存储时有两条写法：与临时对象交换（`std::string(s).swap(s)`），或与空串交换后让旧对象析构。

### 5.3 clear 与 resize

`clear()` 等价于 `erase(begin(), end())`（[draft][string.capacity]），只销毁元素，不释放存储，`capacity()` 不变，且不抛异常。这一点常被误读：清空之后再次追加不会分配，因为容量仍在。

`resize(n)` 在缩短时截断，在增长时补 `charT()`；两参数版本补指定字符。增长超过容量时按实现的策略重分配，缩短不释放。`resize` 与 `reserve` 的分工是：前者改变长度并构造元素，后者只改容量。

### 5.4 三家实现的增长

追加路径的容量计算三家不同：

| 实现 | 增长入口 | 因子 | 备注 |
| --- | --- | --- | --- |
| libstdc++ | `_M_create` | 2 | 请求小于两倍旧容量时取两倍，分配 `capacity + 1` 个字符的空间 |
| MSVC STL | `_Calculate_growth` | 1.5 | 与 `vector` 共用同一策略 |
| libc++ | `__grow_by` 调用 `__get_amortized_growth_capacity` | 约 2 | 另按对齐取整 |

libstdc++ 的 `_M_create` 多分配一个字符，用于存放终止符，因此 `capacity()` 与分配块大小相差一。MSVC 的 `_Alloc_mask` 把分配块向上取整到固定粒度，容量可能大于增长公式的结果。libc++ 的 `__min_cap` 决定短串边界，超过边界才进入长模式。

这些差异只影响容量序列，不影响语义。依赖「第几次追加会重分配」的代码在三家实现上行为不同。

---

## 6. 修改操作与异常保证

### 6.1 append 的两条路径

容量足够时，`append` 把源区间复制到 `data() + size()`，写终止符，更新长度；容量不足时，分配新块，按「前缀、源、后缀」的顺序拼好，交换指针，释放旧块。

两条路径的成本差别在于复制量：容量足够时只复制源区间，不足时新旧内容都要复制一遍。`reserve` 的价值就在这里：把重分配与整串复制挪到循环之外。

libstdc++ 把追加收在 `_M_append` 中，扩容时经 `_M_create` 的倍增规则分配新块[impl]。MSVC 的 `_Reallocate_for` 在 `_New_size` 超过 `max_size()` 时抛 `length_error`，否则按 `_Calculate_growth` 分配[impl]。

### 6.2 别名：源落在自身缓冲内

`s.append(s)`、`s.insert(0, s)`、`s.replace(1, 2, s)` 都让源区间指向目标对象的存储。此时先移动再复制会读到已被覆盖的数据，实现必须先判断、再决定复制到临时缓冲。

libstdc++ 用 `_M_disjunct(__s)` 判断源是否完全位于自身缓冲之外；不满足时走 `_M_replace_cold`，先把源复制到临时缓冲，再按普通路径移动[impl]。MSVC 与 libc++ 用各自的偏移计算与临时缓冲处理同一情形。

这条判断对使用者是透明的，但它解释了为什么 `s.append(s)` 的开销可能比预期高一次复制。自引用追加在语义上是合法的，实现必须支持。

### 6.3 operator+ 的分配次数

`[string.nonmembers]/1` 规定 `operator+` 等价于「复制左操作数，再 append 右操作数」。因此 `s1 + s2` 至少有一次分配（结果的缓冲），实现可以按 `lhs.size() + rhs.size() + 1` 一次分配，也可能先复制再扩容。

链式写法 `a + b + c` 在左结合下产生两个临时 string，每个都要分配。需要的是一次分配时，写法是 `reserve` 之后连续 `append`，或直接构造时按总长度预留。

### 6.4 insert、erase 与 replace

三个操作共享同一结构：确定受影响区间，移动它，写入新内容。

- `insert(pos, s)` 把 `[pos, size())` 后移源长度，在空出的位置复制源；容量不足时先重分配，再按偏移直接构造，避免先整体后移。
- `erase(pos, n)` 把 `[pos + n, size())` 前移，缩短长度并写终止符；成员版本返回 `*this`，迭代器版本返回后继迭代器。
- `replace(pos, n1, s, n2)` 在 `n1` 与 `n2` 相等时只做覆盖，不需要移动；不等时移动一次差值。

三者都线性于移动的字符数，都不释放容量。`erase` 的成本按擦除点之后的字符数计，删除开头最贵。

### 6.5 强保证的实现方式

`[string.require]/2` 的强保证在实现上表现为一个固定顺序：先做可能失败的部分（分配新块、把源复制到临时缓冲），再做不失败的部分（移动尾部、写终止符、更新长度）。libstdc++ 的 `_M_replace` 在容量足够且源不相交时直接移动加复制，否则转入 `_M_replace_cold` 走临时缓冲[impl]。

提交阶段只做不抛的动作：交换指针、`memmove`、写终止符、更新长度。这样异常只可能出现在前半段，前半段没有修改对象，回滚就是释放临时资源。

对使用者，可依赖的结论是：`append`、`insert`、`replace` 抛出时对象保持原状，不需要写「失败后重建」的代码。代价是重叠或扩容时多一次复制。

### 6.6 常见陷阱

| 写法 | 问题 | 修正 |
| --- | --- | --- |
| 保存 `c_str()` 或 `data()` 的返回值，随后修改字符串 | 非 const 成员可能使指针失效 | 用前重新获取 |
| 对 `s[s.size()]` 赋值以追加字符 | 改写终止符是未定义行为 | 用 `push_back` 或 `append` |
| 视图绑定临时 string，或绑定后修改源 | 视图悬垂或指向旧缓冲 | 视图只作参数，保存时复制 |
| 循环中写 `s = s + "x"` | 每轮复制整串 | 用 `+=` 或 `append` |
| 把 `substr()` 当视图用 | `substr` 返回新的 string | 用 `string_view::substr` |

五条的共同点是忽略 string 的容量、失效与所有权语义：这些规则与 `vector` 的模型一致，只是标准给出的保证更弱。

---

## 7. 查找、切片与比较

### 7.1 find 家族

六个查找函数（`find`、`rfind`、`find_first_of`、`find_last_of`、`find_first_not_of`、`find_last_not_of`）各有四种参数形式：另一个 string、指针加长度、单个字符，以及 C++17 起可转换为 `string_view` 的类型。返回下标，未找到返回 `npos`。

两个边界：空模式在 `pos` 不大于长度时返回 `pos`；`pos` 大于长度时返回 `npos`。实现通常逐位置调用 `traits::compare`，最坏情况是 O(n·m)，把线性期望放在这些函数上没有依据。

### 7.2 substr

`substr(pos, n)` 返回新的 string，`pos` 大于长度时抛 `out_of_range`，`n` 默认取 `npos` 表示到末尾。成本是复制 `min(n, size() - pos)` 个字符，外加一次分配（短结果可能落在 SSO 内，不分配）。

C++23 增加右值重载 `substr() &&`（P2438R2），把内部缓冲移进返回值，避免复制。它对临时对象有意义：`std::move(s).substr(1)` 不复制，但会把 `s` 留在有效但未指定的状态。

需要视图而不是副本时用 `string_view::substr`，它只调整指针与长度，不分配，也不延长生命周期。

### 7.3 compare 与三路比较

`compare` 返回负值、零或正值，语义是先按 `traits::compare` 比较较短长度的前缀，前缀相等时比较长度。返回值不保证是 -1、0、1，只保证符号。

`char_traits<char>::compare` 按无符号字节比较，与 `memcmp` 一致，因此非 ASCII 字节按无符号序排列。这与按有符号 `char` 比较的写法不同，后者在遇到高位字节时给出相反的顺序。

C++20 起六个关系运算符由 `operator<=>` 统一（P1614R2），与 `string_view` 的比较也有专门重载，不需要构造临时 string。

### 7.4 starts_with、ends_with 与 contains

`starts_with` 与 `ends_with` 在 C++20 加入（P0457R2），`contains` 在 C++23 加入（P1679R3）。三者都转发到 `string_view` 的同名成员（[draft][string.ops]），不分配，成本分别是前缀长度、后缀长度与一次查找。

`contains` 与 `find(x) != npos` 等价，差别在意图表达与可读性。这三个函数也存在于 `string_view`，因此同一套判断既可以写在拥有型字符串上，也可以写在视图上。

参数是 `string_view` 可转换类型。传 `const char*` 时先求长度，传字面量时长度在编译期已知，循环中没有额外扫描[推断]。

---

## 8. string_view 与边界

### 8.1 转换与生命周期

`basic_string` 可以隐式转换为 `basic_string_view`（C++17），转换是 O(1)：取出指针与长度，不复制。反向转换是显式的，因为需要分配。

视图不拥有存储。三种悬垂来源：从临时 string 取视图，从 `substr()` 的返回值取视图，取视图后修改源字符串。`string_view` 只保证 `[data(), data() + size())` 有效，不保证 `data()[size()]` 是终止符，这一点与 string 不同。

`basic_string` 的模板重载（`append`、`insert`、`find` 等）接受可转换为 `string_view` 的类型，约束是「可转换为 `string_view` 且不可转换为 `const charT*`」（[draft][string.modifiers]）。这条约束让 `const char*` 走指针重载，避免对同一实参产生歧义。

### 8.2 data 与 c_str 的边界

C++11 起 `data()` 与 `c_str()` 等价，都返回指向 `[0, size()]` 的指针（[draft][string.access]）；C++17 起非 const 的 `data()` 返回 `charT*`，可以写入 `[0, size())`，但 `data()[size()]` 仍是终止符，改写它是未定义行为。

三条使用边界：指针在下一个非 const 成员调用后可能失效，不要存进结构体或交给异步接口；空串的 `data()` 可以解引用一次（读到终止符），但不能解引用第二次；`c_str()` 只用于只读的 C 接口。

### 8.3 数值转换

`stoi`、`stol`、`stoul`、`stoll`、`stoull` 与浮点版本的规范写法是调用 `strtol`、`strtoul`、`strtod` 等（`[string.conversions]/1`）。由此继承了一整套 C 语义：跳过前导空白，接受正负号与基数前缀，受当前 C locale 影响，溢出抛 `out_of_range`，无法转换抛 `invalid_argument`，`idx` 返回首个未消费字符的位置。

`to_string` 在当前草案中规定为 `format("{}", val)`（`[string.conversions]`），早期措辞是 `sprintf` 语义。两者的浮点输出不同：前者给最短往返表示，后者给固定小数位。这一改动已进入 C++26 工作草案。

需要稳定、无 locale、无异常的转换时用 `to_chars` 与 `from_chars`（P0067R5）：结果写入调用方缓冲，错误以返回值区分，适合批量解析。

### 8.4 与 C 字符串互操作

`c_str()` 是交给 C 接口的标准入口。含嵌入 NUL 的串会被 C 函数截断，接口接受长度时改用 `data()` 加 `size()`。从 `const char*` 构造 string 需要 `traits::length`，已知长度时用「指针加长度」的构造，避免重复扫描。

反向的边界同样存在：C 函数保存指针并在之后使用，等于把生命周期交给不可控的代码。跨语言边界上用「指针加长度」并把复制放在边界内，是唯一稳定的做法。

---

## 9. resize_and_overwrite

### 9.1 动机

往 string 写入长度在运行时才确定的数据，旧接口有三条路径：`resize(n)` 先零初始化再覆盖，多写一遍；写临时缓冲再 `assign`，多一次复制；`reserve` 之后分段 `append` 并手工维护终止符，多一层簿记。P1072R10 把三者概括为多付初始化、多付复制、多付簿记，提出回调式接口。

这一取舍在 LEWG 被明确接受：方案只为 string 解决，不为 `vector` 解决。需求侧的理由见系列第 3 篇，本节只关心它对接口形状的影响。

### 9.2 语义

`resize_and_overwrite(n, op)` 的流程是：把长度置为 n，把可写区间 `[p, p + n)` 交给 `op`，由 `op` 返回实际长度 r，最后把长度设为 r 并在 `p + r` 处写终止符。前置条件有四条：`op` 不抛异常、不修改 `p` 与 `m`、返回值不小于 0 且不大于 n、`[p, p + r)` 内没有不确定值。

调用前 `[p, p + min(size(), n))` 保持原内容，实现通常让 `p` 指向内部缓冲，从而省掉临时块。若 `op` 抛出异常，属于违反前置条件，行为未定义；错误处理要用返回值编码，不能用异常。

```cpp
std::string s;
s.resize_and_overwrite(64, [](char* p, std::size_t n) {
  std::size_t r = 0;
  while (r < n && source_has_more())   // source_has_more 与 read_char 代表数据源
    p[r++] = read_char();
  return r;
});
```

### 9.3 与既有接口的对比

| 写法 | 分配次数 | 多余写入 | 适用场景 |
| --- | --- | --- | --- |
| `resize(n)` 后覆盖 | 至多一次 | 零初始化 n 个字符 | 长度已知且实现简单 |
| 临时缓冲后 `assign` | 两次 | 整段复制 | 数据源给出连续块 |
| `reserve` 后 `append` | 一次（预留足够时） | 无 | 分片追加 |
| `resize_and_overwrite` | 至多一次 | 无 | 直接写入，长度运行时决定 |

### 9.4 边界

- 不能保存 `p`：下一次修改可能重分配，`p` 随即可失效。
- 返回长度小于 n 时，`[p + r, p + n)` 的内容不确定，长度按 r 计。
- `n` 是上界，不是目标长度；给出过大的上界会让实现按 n 预留容量。
- 不需要预先 `reserve`：该函数自行保证容量，额外的 `reserve` 只会多一次判断。
- `op` 内不得抛出异常：违反前置条件是未定义行为，错误处理只能用返回值编码。

---

## 10. 分配器、pmr 与哈希

### 10.1 pmr::string

`std::pmr::string` 是 `basic_string` 以 `polymorphic_allocator<char>` 实例化的别名。小串落在 SSO 区间内时不分配，内存资源不参与；超过阈值后按资源分配。分配器有状态（保存 `memory_resource*`），对象因此比 `std::string` 大，具体字节数由实现定义。

`pmr` 的价值在于把分配策略从类型移到构造参数：同一个函数可以处理来自不同内存池的字符串。SSO 阈值不随分配器改变，这是「布局属于 ABI」的又一后果。

### 10.2 传播与 SSO 的交互

三个传播 traits（`propagate_on_container_copy_assignment`、`propagate_on_container_move_assignment`、`propagate_on_container_swap`）决定赋值与交换是否更换分配器。三者都为假且分配器不相等时，移动赋值退化为逐元素搬运，成本从常数变成线性。

短串本来就不分配，分配器是否相等不影响其移动成本，这是 SSO 在 `pmr` 场景下仍然有效的原因。

### 10.3 哈希

`std::hash<basic_string>` 只要求相等的字符串得到相等的值，并且在同一执行内保持一致。算法、随机化与是否缓存都由实现决定：

| 实现 | 入口 | 算法 |
| --- | --- | --- |
| libstdc++ | `_Hash_bytes` | MurmurHash 变体 |
| libc++ | `__murmur2_or_cityhash` | 按字宽选择 MurmurHash2 或 CityHash |
| MSVC STL | `_Hash_array_representation` | FNV-1a |

哈希值不能持久化，也不能跨进程比较：标准不要求跨执行稳定，实现也可能随版本更换算法。需要稳定摘要时用密码学哈希。

### 10.4 比较与相等

`operator==` 通常先比长度，长度不同时是 O(1)；长度相同时逐字节比较。`operator<` 按 `traits::compare` 的字典序，前缀相等时短者在前。

与 `string_view` 的比较有专门重载，可以直接比较 string 与视图而不构造临时对象。这一点在查找表、解析器与日志过滤里很实用：键是 `string_view`，表里存 `std::string`。

---

## 11. 调试模式与 ABI 风险

### 11.1 三家开关

| 实现 | 开关 | 效果 |
| --- | --- | --- |
| libstdc++ | `_GLIBCXX_ASSERTIONS` | 下标与前置条件加断言，不改布局 |
| libstdc++ | `_GLIBCXX_DEBUG` | 换成 `__gnu_debug::basic_string`，改变类型与布局 |
| libc++ | `_LIBCPP_HARDENING_MODE` | 断言为主，不改 ABI |
| MSVC STL | `_ITERATOR_DEBUG_LEVEL` | 迭代器归属检查，改变对象大小 |

C++26 的硬化工作把 `operator[]` 的前置条件写成 Hardened preconditions（`[string.access]/1`，P3471R4），这一步把 string 的下标访问纳入可诊断检查的范围。硬化是编译期选择：启用后违反前置条件变成库内可诊断的失败，关闭时没有运行期开销。

### 11.2 混合构建

同一程序的不同翻译单元使用不同档位，会产生布局不同、符号不同的 `std::string`。症状可能是链接错误，也可能是运行期崩溃或内存破坏；后者更难定位，因为符号名可以相同而布局不同。

典型来源有三处：MSVC 的调试运行库与发布运行库混用；libstdc++ 的 `_GLIBCXX_DEBUG` 与非调试库混用；libstdc++ 的新旧 ABI 混用。三者的共同点是「头文件相同、编译选项不同」。

### 11.3 跨边界的三种做法

- 接口用 `const char*` 加长度，复制发生在边界内，调用方负责生命周期。
- 接口用 `string_view`，要求两侧使用同一标准库与同一编译选项，并在文档中写明生命周期。
- 接口用自定义的稳定字符串类型，内部转换成 `std::string`。

`std::string` 出现在动态库导出符号、插件接口或跨编译器的结构体里，是最常见的 ABI 故障来源。这条限制与性能无关，只与二进制契约有关。

---

## 12. 演进

### 12.1 版本变化

| 版本 | 与 `basic_string` 相关的变化 |
| --- | --- |
| C++98 | 基本接口；`c_str()`；`data()` 不保证终止符；COW 实现普遍 |
| C++11 | 禁止 COW；移动语义；`data()` 保证终止符；`shrink_to_fit`；`stoi` 系列；分配器传播 |
| C++17 | `string_view` 与互操作；非 const `data()` 返回 `charT*`；与视图的比较重载 |
| C++20 | constexpr（P0980R1）；`starts_with` 与 `ends_with`（P0457R2）；`<=>`（P1614R2） |
| C++23 | `contains`（P1679R3）；`resize_and_overwrite`（P1072R10）；`substr() &&`（P2438R2）；禁止从 `nullptr` 构造（P2166R1） |
| C++26 | `to_string` 改为 `format("{}")` 语义；`operator[]` 的硬化前置条件（P3471R4） |

### 12.2 constexpr 的边界

P0980R1 让构造、`append`、`find`、`substr` 等成员进入常量求值。限制来自常量求值的分配规则：求值期间分配的存储必须在求值结束前释放，因此 `constexpr` 函数内部可以构造与操作 string，结果不能作为 `constexpr` 变量带到运行期。

这条限制决定了 constexpr string 的用途：编译期拼装与检查字符串，把结果以 `string_view` 或数组形式带出。

### 12.3 仍在讨论的方向

`cstring_view`（P3655R6）试图为「保证空终止的视图」提供类型，动机是 `string_view` 不保证 `data()[size()]` 是终止符，而 C 接口要求这一点。提案仍在讨论，尚未进入工作草案。

文本编码方向由 `std::text_encoding` 承担，它只回答「程序用什么编码」，不做转码。转码与 Unicode 算法仍在标准库之外，这一分工在系列第 3 篇已经分析，本文不重复。

---

## 13. 结论

`std::string` 的接口很小，行为由三件事决定：三条不变式（连续、空终止、容量非承诺）、布局与 ABI 的绑定、以及比 `vector` 更弱的失效规则与更强的异常保证。

工程上可执行的规则有四条：

1. 跨 ABI 边界不传 `std::string`，接口用指针加长度或视图；同一二进制内统一 `_GLIBCXX_USE_CXX11_ABI`、`_ITERATOR_DEBUG_LEVEL`、`_GLIBCXX_DEBUG` 与 `_LIBCPP_HARDENING_MODE`。
2. 任何修改之后重新获取 `data()`、`c_str()` 与迭代器；`operator[](size())` 只读，不写。
3. 分配次数由 `reserve` 与 SSO 阈值共同决定：短串不分配，长串按实现的因子增长；写入已知长度的数据用 `resize_and_overwrite`，不要用 `resize` 加覆盖。
4. 视图只作参数，需要保存时转成 `std::string`；需要 C 接口时用 `c_str()`，不要用 `string_view::data()`。

理解 string 的关键在三条不变式与「布局即 ABI」这两点：前者解释了接口为何如此，后者解释了为什么阈值、容量序列与调试开关都不可移植。

---

## 参考

- 标准草案：`[basic.string]`、`[string.require]`、`[string.cons]`、`[string.capacity]`、`[string.access]`、`[string.modifiers]`、`[string.ops]`、`[string.nonmembers]`、`[string.conversions]`、`[string.view]`、`[container.reqmts]`、`[container.alloc.reqmts]`、`[char.traits]`。
- 直达形式：<https://eel.is/c++draft/string.require>、<https://eel.is/c++draft/string.capacity>、<https://eel.is/c++draft/string.access>、<https://eel.is/c++draft/string.modifiers>、<https://eel.is/c++draft/string.ops>、<https://eel.is/c++draft/basic.string>。
- 历史草案：N4659（C++17）、N4861（C++20）、N4950（C++23），取自 cplusplus/draft 对应标签，用于对照措辞与段号变化。
- 提案：P0980R1（Making std::string constexpr）、P1072R10（basic_string::resize_and_overwrite）、P0457R2（String Prefix and Suffix Checking）、P1679R3（String contains function）、P2438R2（std::string::substr() &&）、P2166R1（Prohibit basic_string construction from nullptr）、P1614R2（The Mothership Has Landed）、P0067R5（Elementary string conversions）、P3471R4（Standard library hardening）、P3655R6（cstring_view）。
- 实现源码：libstdc++ 的 `bits/basic_string.h`、`bits/basic_string.tcc`；MSVC STL 的 `stl/inc/xstring`；libc++ 的 `libcxx/include/string`、`__functional/hash.h`。
- 实现文档：libstdc++ 的双 ABI 说明 <https://gcc.gnu.org/onlinedocs/libstdc++/manual/using_dual_abi.html>。
- 标准库文档：[basic_string](https://en.cppreference.com/w/cpp/string/basic_string)、[basic_string_view](https://en.cppreference.com/w/cpp/string/basic_string_view)、[resize_and_overwrite](https://en.cppreference.com/w/cpp/string/basic_string/resize_and_overwrite)。
