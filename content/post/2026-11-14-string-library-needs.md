---
title: "不同的 C++ 使用者对字符串库有什么需求"
slug: "string-library-needs"
date: "2026-11-14"
categories: ["编程语言"]
tags: ["C++", "字符串", "Unicode", "标准库"]
draft: false
summary: "从标准与提案、三家实现、行业实践三条证据线，梳理十类 C++ 使用者对字符串库的需求差异、六层需求模型、现存方案的覆盖与缺口，以及标准演进最可能先落地的方向。"
---

## 0. 结论摘要

1. 「字符串库」不是一条需求，而是六层可分离的需求：字节与码元存储（owning）、借用视图（borrowing）、文本语义（编码与 Unicode）、格式化与解析、互操作边界（C 接口、NUL、跨语言）、编译期能力。把六层压进一个类型，是所有争议的共同根源。
2. 需求的第一分界线是生命周期与所有权，第二分界线是编码契约。性能预算、异常模型、ABI 承诺、分配器可用性属于「硬约束」，它们决定类型布局，而不是偏好。
3. 标准库的 `basic_string` 被三条不变式钉死：连续容器、末尾空终止符、allocator-aware 但不使用 allocator 的 `construct`/`destroy`。这三条使 rope/分片表示在标准层不可行，也使「改进 `std::string` 布局」与「ABI 稳定」不可兼得。
4. 标准委员会的实际策略是「最小公分母 + 增量类型」：不重构 `basic_string`，而是陆续添加 `string_view`（C++17）、`resize_and_overwrite`（C++23）、`text_encoding`（C++26），并在 2025—2026 年推进 `cstring_view`（P3655）与 UTF 转码视图（P2728、P4246）。Unicode 算法（归一化、排序、分词）仍留在 ICU 一类外部库。
5. 十类使用者的需求差异主要体现在硬约束上：游戏引擎要自定义分配器与无异常；嵌入式要无堆、静态容量、可预测；HFT 与数据管道要热路径零分配与 locale 无关解析；桌面/GUI 要完整 Unicode 与 UTF-16 平台互操作；安全敏感场景要边界检查、生命周期诊断与敏感数据擦除；跨语言边界要保证 NUL 终止的视图。
6. 最主要的未满足需求：保证式预留与非初始化写入、保证 NUL 终止的视图（推进中）、标准转码（提案中）、字素/分词级文本视图、rope、透明异构查找、checked view、运行时格式串的安全检查。
7. 对库设计者的核心建议：参数用借用视图、返回值用拥有类型；转换的隐式性由代价决定；编码契约写进类型或文档；格式化同时提供编译期检查与运行时入口；安全检查分级且不改 ABI；新类型必须与旧类型零成本互转。
8. 对标准演进的判断：`cstring_view` 与 UTF 转码是最可能先落地的两块；完整 Unicode 文本类型在可预见的周期内不会进入标准，因为 Unicode 数据每年更新，而标准库行为兼容期以十年计。

---

## 1. 调研范围、方法与证据分级

### 1.1 「字符串库」指什么

本文的「字符串库」指 C++ 中处理字符序列的一整套设施，而不是单指 `std::string`：拥有型字符容器（`std::string`、`pmr::string`、自定义 small string）、借用视图（`string_view`、`span<char>`、`cstring_view`、LLVM `StringRef`）、文本与编码设施（`text_encoding`、转码、Unicode 算法）、格式化与解析（`std::format`、`to_chars`/`from_chars`）、以及跨边界互操作（C 字符串、`const char*`、平台 UTF-16 API）。

把范围放宽是必要的：用户说「字符串库不好用」时，抱怨的对象可能是分配策略、可能是编码、可能是格式化，也可能是 C 接口。只盯 `std::string` 会把不同层次的问题混为一谈。

### 1.2 三条证据线

| 证据线 | 回答的问题 | 主要来源 |
|---|---|---|
| 标准与提案 | 标准保证什么、委员会考虑过什么、哪些被否决 | 工作草案小节、WG21 提案正文、LWG/CWG 议题、disposition 索引 |
| 实现与替代库 | 工业界实际怎么解决、代价是什么 | LLVM/Abseil/Qt/fmt/folly/EASTL/ICU 文档与源码、三家标准库源码 |
| 行业实践 | 不同用户群的硬约束与真实抱怨 | 厂商文档、CppCon/CppNow 演讲、工程博客、社区讨论、基准测试 |

正文按事实等级标注，写作时对「文档明确写的」与「从证据推断的」分开标注。

### 1.3 事实分级

- [draft] 标准草案条文，链接指向 eel.is 快照。
- [paper]/[lwg]/[cwg] WG21 提案、库议题、核心议题。
- [impl] 库实现或源码，尽量给到文件与行号。
- [doc] 厂商或委员会官方文档。
- [talk]/[blog]/[community] 演讲、博客、邮件列表与论坛。
- [推断] 由证据推出、但文档中没有直接写下的结论。

### 1.4 时间基准与局限

- 标准事实以 2026-11-02 的工作草案快照为准。2026 年 11 月之后的 LEWG/LWG 结果不在证据范围内。
- 本机离线索引的论文正文以 2020 年后为主，早年提案（如 N3921）只能通过二手引文取证。
- 三家标准库的 `sizeof(std::string)` 与 SSO 容量由源码布局推导，未在本机实测（本机编译器环境不完整），标为 [impl][推断]。
- 行业部分依赖公开文档与演讲，缺少系统性的用户问卷；涉及具体公司内部实践时只引用公开材料。
- 部分二手来源（EASTL 的 SSO 容量、Boost.Text 的入库状态、folly 与 Chromium 的镜像文档）标注「待核实」，汇总在 §9。

### 1.5 术语约定

| 术语 | 本文中的含义 |
|---|---|
| owning / 拥有型 | 自己管理字符存储的生命周期，如 `std::string`、`absl::Cord`、`SmallString<N>` |
| borrowing / 借用型 | 只引用他人存储，如 `string_view`、`StringRef`、`span<char>` |
| 空终止 / NUL 终止 | 数据在 `size()` 位置之后还有一个 `charT()`，可直接传给 C 接口 |
| 编码契约 | 类型或文档层面对「这些字节是什么编码」的承诺，如 Qt 的 UTF-16、Rust 的 UTF-8 不变量 |
| 热路径 | 对延迟或吞吐敏感、不允许不可预测分配与系统调用的代码段 |

---

## 2. 分析框架：字符串需求的四个正交维度

### 2.1 维度一：所有权与生命周期

字符串库首先回答「谁拥有这段字符、活多久」。四种形态在工业界同时存在：

- 拥有 + 值语义：`std::string`、Qt `QString`（隐式共享）、folly `fbstring`（大串惰性共享）。
- 借用 + 视图语义：`std::string_view`、LLVM `StringRef`、`QStringView`。它们不延长生命周期，存起来就是 bug。LLVM 在头文件里直接写「not in general safe to store」[impl]（[StringRef.h#L49](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/StringRef.h#L49)）。
- 惰性拼接：LLVM `Twine` 用表达式模板表示待拼接的树，只在渲染时分配；代价是「只能作 `const Twine&` 形参，不能存」[impl]（[Twine.h#L26](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/Twine.h#L26)）。
- 共享/分片：`absl::Cord` 用 B 树 + 引用计数表示大字符串，面向「需要长期修改或共享的大文本」[doc]（[cord.h 注释](https://raw.githubusercontent.com/juanmaneo/abseil-cpp/e968256406fd7898d7fde880e31e54b041d32a7e/absl/strings/cord.h#L1)）。

生命周期维度决定了 API 的形参类型、返回值类型和错误模式。Rust 把这条维度做进类型系统（`String` 拥有、`str` 借用）；C++ 只能靠命名约定、注解（`[[lifetimebound]]` 风格的宏）与 hardening 断言来补偿。

### 2.2 维度二：编码与文本语义

同一个 `char` 序列，在不同用户眼里是三种东西：

- 字节容器：`std::string` 不承诺编码，只承诺「连续的 char-like 对象」[draft]（[basic.string.general](https://eel.is/c++draft/basic.string.general)）。这对二进制协议、遗留 GBK 数据是优点。
- 带不变量的文本：Rust `String` 保证合法 UTF-8；Qt `QString` 保证 UTF-16 code unit 序列。编码进类型，切片、查找、索引的语义才能干净，代价是「任意字节」要另找类型。
- 完整 Unicode 文本：需要归一化、大小写折叠、排序、分词、双向文本与字素簇边界。C++ 标准库目前只到「命名编码」（`std::text_encoding`），算法层外置给 ICU。

编码维度回答的是「谁负责保证这些字节是合法文本、合法性在哪一层检查」。C++ 的选择是「不承诺」，把责任推给调用方与外部库，这既是灵活性也是长期痛点的来源。

### 2.3 维度三：性能预算

字符串是少数「性能需求可以直接写成接口约束」的库。可观察的预算有四档：

- 零分配：热路径拼接、日志、错误消息。Abseil 用 `StrCat`/`StrAppend`（函数，一次预留）[doc]（[strings guide](https://abseil.io/docs/cpp/guides/strings)），LLVM 用 `Twine`（表达式模板，零临时串）。
- 一次分配：已知总长的构造与序列化。P1072R10 的动机段把「多付初始化、多付拷贝、多付簿记」列为三害 [paper]（[P1072R10](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p1072r10.html)）。
- 吞吐：解析器与校验器。simdjson 自述以 6 GB/s 压缩、13 GB/s 校验 UTF-8、3.5 GB/s 处理 NDJSON 为目标 [doc]（[simdjson README](https://github.com/simdjson/simdjson/blob/40a686ab89dc5ee58ec10d0514dd5c99abbc472b/README.md)）。
- 编译期：常量求值、静态检查、零运行期初始化。`std::format` 的 `consteval` 格式串检查是典型 [paper]（[P2216R3](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2216r3.html)）。

性能预算决定接口形状：返回新字符串（易用但多一次分配）、写入调用方缓冲（`format_to`、`to_chars`）、还是惰性对象（零分配但不可存）。

### 2.4 维度四：工程约束

四个约束经常直接否决设计方案：

- 异常：`-fno-exceptions` 的游戏主机与嵌入式构建。EASTL 的存在理由就是服务无异常环境 [blog]（二手，待核实）。
- 分配器：无堆环境、arena、pmr 内存池。`std::string` 的 allocator 参数在 ABI 上近乎名义存在，SSO 布局无法按分配器调整。
- ABI：闭源 SDK、插件系统、发行版。libc++ 把 ABI 稳定写成正式政策 [doc]（[ABIGuarantees](https://libcxx.llvm.org/docs/ABIGuarantees.html)），一旦布局进入 ABI，SSO 阈值与 `sizeof(string)` 被冻结。
- 安全与合规：越界、悬垂、注入、敏感数据擦除。libc++ 的四档 hardening 明确承诺「不影响 ABI」[impl]（[Hardening.md#L36](https://github.com/llvm/llvm-project/blob/main/libcxx/docs/Hardening.md#L36)），这是工业界接受检查的前提。

### 2.5 六层需求模型

把上述维度投影到设施上，得到本文使用的分层模型：

| 层 | 提供的保证 | 失配点 | 典型设施 |
|---|---|---|---|
| L0 存储 | 连续、可增长、分配策略 | SSO 阈值、分配器传播、ABI | `std::string`、`pmr::string`、`SmallString<N>` |
| L1 视图 | 非拥有、O(1) 切片、按值传递 | 生命周期、无 NUL 终止、无边界检查 | `string_view`、`StringRef`、`span<char>`、`cstring_view`（提案） |
| L2 文本 | 编码契约、码点/字素迭代、Unicode 算法 | 编码不变量、数据版本、体积 | Qt `QString`、Rust `String`、ICU、ICU4X |
| L3 格式化与解析 | 类型安全、编译期检查、数值转换 | 运行时格式串、locale、i18n | `std::format`、`std::print`、`fmt`、`to_chars`/`from_chars` |
| L4 互操作 | C ABI、NUL 终止、UTF-16/UTF-8 边界 | 平台 API、跨语言、嵌入 NUL | `c_str()`、`cstring_view`（提案）、平台转换 API |
| L5 编译期 | `constexpr`/`consteval`、静态诊断 | 编译期分配、运行期输入 | `constexpr string`、`consteval basic_format_string` |

这张表是后文的组织骨架：每一类用户的需求，本质上是「在哪几层有硬约束、愿意在哪些层妥协」。

---

## 3. 标准库已经给出的答案

### 3.1 `std::string`：三条不变式决定了上限

标准对 `basic_string` 的约束可以压缩为三条：

1. 连续容器：`[data(), data() + size())` 是合法区间，且 `data() + size()` 指向 `charT()`（空终止符），改写该终止符是未定义行为 [draft]（[basic.string.general](https://eel.is/c++draft/basic.string.general)）。
2. allocator-aware，但不用 allocator 的构造语义：标准明文说它「does not use the allocator's construct and destroy member functions」[draft]（[string.require](https://eel.is/c++draft/string.require)）。这是 string 与 vector 的第一处语义分叉。
3. 容量不是契约：`reserve` 只在「发生重分配时」保证 `capacity() >= n`，`shrink_to_fit` 是「non-binding request」[draft]（[string.capacity](https://eel.is/c++draft/string.capacity)）。用户无法用标准接口表达「预留后不得再分配」。

这三条直接排除了 rope/分片表示：只要 `data()` 必须返回连续内存、且末尾必须有终止符，分块存储就不合法。这也解释了为什么 `std::rope` 从未进入标准，而 `absl::Cord`、SGI rope 只能作为独立类型存在 [推断]（草案中无 rope 设施，检索亦无相关提案命中）。

另一个常被忽略的事实是布局：libstdc++ 的本地缓冲为 `15 / sizeof(charT)`（`char` 时 15 字符，`sizeof` 32 字节）[impl]（[basic_string.h#L232](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/basic_string.h#L232)）；MSVC `_BUF_SIZE = 16 / sizeof(value_type)`，SSO 容量 15，`sizeof` 32 字节 [impl]（[xstring#L424](https://github.com/microsoft/STL/blob/main/stl/inc/xstring#L424)）；libc++ 的短串容量可达 22、对象 24 字节，且由 `_LIBCPP_ABI_ALTERNATE_STRING_LAYOUT` 控制字段顺序 [impl]（[string#L794](https://github.com/llvm/llvm-project/blob/main/libcxx/include/string#L794)）。三个数字（15/15/22、32/32/24）都由源码布局推导，未实测，属 [impl][推断]。

对用户而言，这意味着「小字符串优化」不是可配置项，而是写进 ABI 的既成事实。Facebook 的 CppCon 2016 演讲标题就是「Standard strings are slowing you down」，主张按工作负载重排 `std::string` 的布局 [talk]（[演讲页](https://isocpp.org/blog/2017/06/cppcon-2016-the-strange-details-of-stdstring-at-facebook-nicholas-ormr)）；而 ABI 政策要求冻结布局。两者不可同时满足，这是后文矛盾清单中的一条主线。

### 3.2 `string_view`：解决了借用，留下了三个缺口

C++17 引入 `string_view` 的初衷是「非拥有、廉价、按值传递的字符串引用」。N3921 的定义与 P0254 的整合提案都强调：构造与拷贝廉价，因此按值传递；从 `string_view` 构造 `string` 有代价，因此必须显式 [paper]（[P0254R2](https://wg21.link/p254)）。

它留下了三个结构性缺口：

- 不保证 NUL 终止：`data()` 不保证 `data()[size()]` 是空字符，而操作系统与 C 库接口大量要求 `const char*`。P3655 的开篇把后果写得很直接：开发者于是对需要 NUL 的地方传 `string_view` 再调 `data()`，「very bug-prone」[paper]（[P3655R6](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3655r6.html)）。
- 下标契约比 `string` 更严：`string::operator[]` 允许 `pos <= size()`（可读终止符），`string_view::operator[]` 要求 `pos < size()`，标准专门加注说明这个不对称 [draft]（[string.view.access](https://eel.is/c++draft/string.view.access)）。因此视图无法继承 `string` 的 C 兼容性。
- 隐式构造的边界难划：P1391/P1989 让任意连续字符区间隐式转成 `string_view`，随后 P2499 收紧为显式、LWG4102 记录了对既有代码的破坏 [paper]/[lwg]（[P2499R0](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2499r0.html)、[LWG4102](https://cplusplus.github.io/LWG/issue4102)）。P2516 的总结最锋利：「confuse representation with semantics using contiguity as a proxy for being a string」[paper]（[P2516R0](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2022/p2516r0.html)）。

这段历史说明：语法上的「任何连续内存都是字符串」在重载解析层面会造成静默行为变化，标准最终选择了保守方向。

### 3.3 写入路径：`resize_and_overwrite` 是一次定向妥协

对性能敏感的用户，往 `string` 写数据只有三个不理想的选择：`resize` 先零初始化再覆盖；写临时缓冲再拷贝；`reserve` 后反复小 `append` 并维护终止符。P1072R10 把这三害写成动机，并提出回调式接口：把「不初始化就写入」的能力借给用户，写完由回调返回实际长度 [paper]（[P1072R10 §1](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p1072r10.html)）。

值得注意的是委员会的取舍：LEWG 投票记录「Willing to solve this for string without solving it for vector」为 SF 6 / F 9 / N 2 / A 1 / SA 0，即明确接受 `string` 与 `vector` 的接口不对称 [paper]（同上）。这等于承认：`string` 不是「字符的 vector」，而是有独立语义的类型。

### 3.4 格式化与数值转换：安全被做成接口形状

`std::format`（P0645）进入 C++20，`std::print`（P2093）与 range 格式化（P2286）跟进；P2216 用 `consteval basic_format_string` 把格式串与实参的匹配检查前移到编译期 [paper]/[draft]（[P0645](https://wg21.link/p645)、[P2216R3](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2216r3.html)、[format.fmt.string](https://eel.is/c++draft/format.fmt.string)）。

数值转换走另一条路：`to_chars`/`from_chars` 的接口被 P0067 用七条要求约束——不解析运行时格式串、接口不隐含动态分配、不考虑 locale、不经函数指针间接、防缓冲区越界、错误可与合法数字区分、不静默忽略空白 [paper]（[P0067R5](https://wg21.link/p67)）。这七条是「把性能写成接口性质」的范本，也解释了为什么 `from_chars` 在批量解析里显著快于 `stoi`/`strtod`（有二手基准称约 3—4 倍，属 [blog]，未独立复测）。

格式化层的关键张力在 i18n：编译期检查要求格式串是常量，而翻译文件里的格式串是运行期数据。P2216 的讨论中记录了「作为 DR 还是新特性」的分歧 [paper]，标准最终的答案是同时保留 `format`（编译期检查）与 `vformat`/运行时格式串（弱类型入口）。

### 3.5 编码：目前只走到「命名」

C++26 的 `std::text_encoding` 提供了 `literal()`、`environment()`、`mib()`、`name()`、`aliases()` 等接口，用 IANA 注册表 + MIB 整数 + 固定 64 字节内联缓冲表达编码名 [draft]（[text.encoding](https://eel.is/c++draft/text.encoding)）。设计上刻意零分配、可 `constexpr`，回答的是「程序怎么说出自己在用什么编码」。

但它不提供转换。P1885 的动机写得很清楚：标准里所有编码都从 locale 派生，而 locale 与现实环境并不一致，标准又没有查询环境编码的途径，于是只能猜、只能 UB [paper]（[P1885R12](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/p1885r12.pdf)）。全量转码提案 P1629 与文本视图 P0244 都没有进入草案 [paper]（[P1629R1](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/p1629r1.html)、[P0244R2](https://wg21.link/p244)）。

2026 年的进展是「转码视图」：P2728R16 提出 `views::to_utf32` 一类惰性转码视图与 `or_error` 变体，支持编译期求值 [paper]（[P2728R16](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p2728r16.html)）；P4246R0 提出基于 WHATWG 编码规范与 `iconv` 的 `<transcode>` 头文件设计，并在摘要里承认「编码是烂摊子，但数据存在，程序必须读」[paper]（[P4246R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p4246r0.html)）。两者都还在 LEWG 迭代，未见采纳记录 [推断，基于 2026-11 快照]。

### 3.6 互操作：`cstring_view` 是当前最活跃的补丁

P3655R6（2026-10-18，目标 C++29）提议 `std::cstring_view`：非拥有、但保证 `data()[size()]` 为空字符的视图。它的论证链值得完整记录，因为它是「用户需求如何变成类型设计」的样本：

- 需要 NUL 的地方只能四选一：传 `const char*`（可能重复 `strlen`）、传 `const std::string&`（可能多余拷贝与分配）、传 `string_view` 再拷贝、或传 `string_view` 并依赖不可强制的前置条件 [paper]（[P3655R6 §5.1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3655r6.html)）。
- 历史上尝试过：2019 年 P1402 在 Kona 的 LEWGI 被否，结论是「We will not pursue this problem space」；2024 年 P3081 的核心安全 profile 又把 `cstring_view` 作为「GSL 常见需求、标准缺失」的例子写进旁注 [paper]（同上）。
- GitHub 上 `cstring_view`/`zstring_view` 的自定义实现从 1.9k 增长到 2.1k，微软、谷歌与大量小项目各自实现 [paper]（同上）。
- 设计原则按重要性排序：非分配、类型系统传播「有终止符」、与 `string`/`string_view` 行为一致、最小惊讶、`size()` 与 `strlen(c_str())` 一致 [paper]（同上）。
- 嵌入 NUL 的处理没有共识：Croydon 的投票为 3/5/2/5/10，有人认为嵌入 NUL 是必须防的安全隐患，有人认为检查会拖慢性能，有人认为是必须支持的使用场景；最终提案选择在「值」而不是「类型」层面提供 `has_nulls()`/`first_piece()` 一类 API [paper]（同上，§6.6）。

同期还有 P3862R0 主张「推迟 `basic_string::subview`，等 `cstring_view`」，理由是返回类型一旦发布就改不了；它引用 P3044 已加入的 `subview` 现状并写道「we couldn't change .substr without breaking someone's code. This is the reason why we need to act now」[paper]（[P3862R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3862r0.html)）。标准草案 2026-11 快照中 `subview` 仍带默认实参，与 P3862 的推迟主张冲突，需以后续会议记录为准（见 §9）。

### 3.7 小结：标准层的策略

综合来看，标准层采取的是「三层策略」：

1. 保留 `basic_string` 的简单模型：连续 + 空终止 + allocator-aware，不引入 rope、不改变布局、不承诺编码。
2. 用增量类型补缺口：`string_view` → `cstring_view` →（可能的）UTF 转码视图；每个新类型都必须与旧类型零成本互转，否则不会被采纳。
3. 把算法与数据外置：Unicode 归一化/排序/分词交给 ICU 一类库；格式化通过 `formatter` 特化点扩展；数值转换只保证接口形状，不保证算法。

这套策略的代价是「标准库永远比用户需求慢半步」，收益是 ABI 与行为兼容性可以维持十年以上。理解这一点，才能理解后文各用户群为什么会各自造轮子。

---

## 4. 十类使用者的需求

以下每一节给出「场景 / 硬约束 / 可牺牲项 / 关键证据 / 对库设计的含义」。群体划分是分析工具，真实项目常常同时属于多类。

### 4.1 标准库实现者与 WG21

- 场景：定义可移植语义、维护 ABI、保证可教学性，并在委员会时间预算内推进提案。
- 硬约束：不破坏既有代码；不增加实现负担；新设施要能落到三家实现；ABI 稳定（尤其 libc++）。
- 可牺牲项：极端性能场景的便利性、完整 Unicode 算法、rope。
- 证据：`reserve`/`shrink_to_fit` 的非绑定措辞 [draft]（[string.capacity](https://eel.is/c++draft/string.capacity)）；P1072 明确只解决 string 不解决 vector [paper]；libc++ ABI 政策 [doc]（[ABIGuarantees](https://libcxx.llvm.org/docs/ABIGuarantees.html)）；P2499/P2516 对隐式转换的回退 [paper]。
- 设计含义：委员会把「兼容性成本」当作一级风险，因为几乎每个 C++ 程序都直接或间接使用字符串。任何新接口都要先回答「会不会抢走既有重载、会不会改变 ABI、能不能在三种实现上落地」。

### 4.2 系统软件与基础设施库作者（LLVM、Abseil、Chromium）

- 场景：编译器、日志、RPC、浏览器内核；字符串是高频、跨模块的公共货币。
- 硬约束：零拷贝的参数传递；可预测的分配；与自有容器/哈希表协同；跨平台（含无异常构建）。
- 可牺牲项：编码正确性（普遍按字节处理）、API 丰富度（宁可少而精）。
- 证据：LLVM 几乎所有解析 API 用 `StringRef`，且明确「不拥有、不可存」[impl]（[StringRef.h#L49](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/StringRef.h#L49)）；`Twine` 用 rope 表达式模板消除临时串，但注释禁止存储 [impl]（[Twine.h#L26](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/Twine.h#L26)）；`SmallString<N>` 把内联容量显式化 [impl]（[SmallString.h#L23](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/SmallString.h#L23)）；`StringMap` 是专为字符串键设计的哈希表 [impl]（[StringMap.h#L10](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/StringMap.h#L10)）；Abseil 用 `StrCat`/`StrAppend` 明确反模式，并用 `Cord` 处理大文本 [doc]（[strings guide](https://abseil.io/docs/cpp/guides/strings)）；Chromium 长期维护自研 `base::StringPiece`，迁移提交直言「Chromium has forked a fundamental C++ vocabulary type」[impl]（[迁移提交](https://chromium.googlesource.com/chromium/src/net/+/b4f8fb776a13d44583d75065b4490daa14c6c1e4)）。
- 设计含义：这一群体是「view-first」最坚定的实践者：形参统一借用视图，返回统一拥有类型；零分配拼接用函数或表达式模板；容器层自造专用哈希表。标准库对他们的价值主要是「公共词汇」，而不是「全部实现」。

### 4.3 游戏引擎

- 场景：引擎核心、序列化、网络同步、UI 文本；60 fps 的帧预算是 16.6 ms、120 fps 是 8.3 ms，热路径上处理资产名、骨骼名、关卡路径与本地化文本。
- 硬约束：自定义分配器（arena/帧分配器）；无异常、常无 RTTI；字符串驻留（interning）与大小写不敏感比较；本地化文本不可被普通字符串操作破坏；序列化格式稳定；平台字符类型差异。
- 可牺牲项：标准一致性、异常安全、完整 Unicode 算法覆盖、可变增长能力。
- 证据：Unreal 把字符串拆成三类：`FName`（全局池化、不可变、大小写不敏感）、`FText`（本地化文本，提供 `AsCultureInvariant`/`INVTEXT`）、`FString`（可变、自有字符数组）[doc]（[String Handling](https://dev.epicgames.com/documentation/en-us/unreal-engine/string-handling-in-unreal-engine)）；Epic 编码规范要求字面量始终用 `TEXT()` 宏，否则会触发不期望的窄/宽转换 [doc]（[Coding Standard](https://dev.epicgames.com/documentation/unreal-engine/epic-cplusplus-coding-standard-for-unreal-engine?application_version=5.6)）；Godot 的 `String` 引用计数并写时复制，`StringName` 走名字池化 [doc]（[Godot String](https://docs.godotengine.org/en/stable/classes/class_string.html)）；EASTL 以无异常环境为设计目标 [blog]（二手，待核实）；folly `fbstring` 对大于 255 字符的串采用惰性共享 [doc]（[FBString.md 镜像](https://nest-open-source.googlesource.com/nest-cam/4320010/faux-folly/+/refs/heads/master/faux-folly/folly/docs/FBString.md)）。
- 设计含义：一个类型无法同时承担「不可变标识符」「可编辑缓冲」「本地化文本」三种语义。工程上需要显式的 intern/handle 类型、可变 owning 类型与结构化本地化文本；池化句柄比指针更适合序列化与热重载 [推断]，但会引入「字符串表版本 + 句柄重映射」的新问题。COW 与 §4.7 的安全擦除需求直接冲突。

对应的需求卡片：

- G1 池化不可变标识符：创建后不可变、全局去重、大小写不敏感、可廉价复制、可跨帧保存。证据：Unreal `FName` 的全局唯一字符串表与实例号设计 [doc]。
- G2 可变字符串与本地化文本分工：`FString` 可搜索/修改/比较，`FText` 负责本地化；把本地化文本当 `std::string` 处理会破坏占位符、复数与性别规则 [推断]。
- G3 引用计数与固定容量：Godot 的 COW 降低复制成本；EASTL 的 `fixed_string` 面向固定内存场景，其溢出行为有已知 issue [community]（[EASTL #454](https://github.com/electronicarts/EASTL/issues/454)）。

### 4.4 嵌入式、实时与汽车

- 场景：MCU、RTOS、汽车 ECU、工业控制；字符串用于日志、诊断码、配置键、车载网络标识；RAM/ROM 以 KB 计。
- 硬约束：禁止或严格限制动态分配；禁止异常与 RTTI；容量在编译期固定；最坏执行时间（WCET）可分析；`constexpr` 初始化；代码体积；MISRA/AUTOSAR 类规则。
- 可牺牲项：字符串动态增长、完整 Unicode 与本地化、与桌面生态的二进制兼容、异常式错误传播。
- 证据：ETL 文档写明其字符串「maximum capacity fixed at compile time and make no calls to malloc/free or new/delete」，并提供截断标志与 `ETL_STRING_TRUNCATION_IS_ERROR` 一类可配置错误策略 [doc]（[ETL strings](https://www.etlcpp.com/docs/strings/)、[ETL string](https://www.etlcpp.com/docs/strings/string/)）；MISRA C++ 2023 规则 21.6.1 禁止动态内存，而 AUTOSAR C++14 对异常与动态内存做受控放宽，并要求异常处理满足确定性的最坏执行时间（A15-0-7），两套规则同时约束同一代码库时会冲突 [doc]（规则经工具厂商文档转引，见 §10）；Khalil Estell 在 CppCon 2024 主张「异常可以减小固件体积」，说明「禁异常」未必是技术最优，而是规则与工具链约束 [talk]（[演讲页](https://isocpp.org/blog/2024/08/cppcon-2024-cpp-exceptions-for-smaller-firmware-khalil-estell)）。
- 设计含义：这一群体需要「容量在类型里、无分配、错误可返回」的字符串。固定容量类型的失败策略（截断并置标志 / 断言 / 溢出到堆）必须是显式状态；截断状态在复制、移动后如何传播，ETL 文档已承认是设计难点。标准库没有固定容量字符串，用户只能用 `std::array<char, N>` 加长度或自造类型 [推断]。

### 4.5 高性能服务、HFT 与数据管道

- 场景：交易撮合、行情解析、FIX/ITCH 协议、日志聚合、JSON/CSV 处理；延迟以微秒到纳秒计，吞吐以 GB/s 计。
- 硬约束：热路径零分配、无锁或低争用、缓存局部性、locale 无关的数值解析与格式化、可预测的 p99.9 尾延迟。
- 可牺牲项：通用 Unicode 文本处理、标准库 API 兼容性、异常、可读性。
- 证据：低延迟交易系统的工程总结指出，`std::string` 的 SSO 阈值会造成「短字段走栈、长字段走堆」的非确定性延迟，某项目把零拷贝解析从 730 ns 降到 520 ns [community]（[NexusFix](https://github.com/StratCraftsAI/NexusFix)）；fast_float 声称比 `strtod` 快 4—10 倍，并进入 GCC 12、MySQL、DuckDB、Chromium、Redis、WebKit [impl]（[fast_float](https://github.com/fastfloat/fast_float)）；fmt 用 Dragonbox 算法保证正确舍入、最短表示与 round-trip [impl]（[fmt](https://github.com/fmtlib/fmt)）；simdjson 在单核上达到 GB/s 级解析 [paper]（[Parsing Gigabytes of JSON per Second](https://arxiv.org/abs/1902.08318)）；P0067 把「无 locale、无分配、无运行时格式串」写成接口要求 [paper]（[P0067R5](https://wg21.link/p67)）。
- 设计含义：这一群体把「分配次数」当成接口的一等属性：需要写入调用方缓冲的 API（`format_to`、`to_chars`、`resize_and_overwrite`）、栈上固定容量缓冲、以及返回视图而非拥有对象的批量解析接口。SSO 既是优化也是不确定性来源，这一点在标准库层面无法通过配置解决。

### 4.6 企业桌面、GUI 与本地化

- 场景：桌面应用、办公软件、输入法、字体渲染；用户可见文本必须正确显示、排序、截断。
- 硬约束：完整 Unicode（字素簇、大小写、排序、双向文本）；与平台 API 互操作（Win32/Qt 原生 UTF-16）；本地化数字/日期/货币；值语义；UI 线程响应。
- 可牺牲项：纯 UTF-8 内部表示的简洁性、零分配、跨平台 ABI 一致。
- 证据：Microsoft 文档说明 Windows 的 Unicode 字符串操作基本单位是 16 位字符 [doc]（[Windows data types for strings](https://learn.microsoft.com/en-us/windows/win32/Intl/windows-data-types-for-strings)）；Windows 自 1903 起可通过 manifest 设置进程级 UTF-8 code page，但 GDI 等子系统仍不能按进程切换 [doc]（[Use UTF-8 code page](https://learn.microsoft.com/en-us/windows/apps/design/globalizing/use-utf8-code-page)）；Qt Wiki 说明 `QString` 用 UTF-16 的部分理由是与 Windows/macOS 原生 Unicode API 直接对接 [doc]（[Qt Wiki: QString](https://wiki.qt.io/QString)）；`QString::length()` 返回 QChar 数，含补充字符时不等于实际字符数 [doc]（同上）；字素、词、句边界由 UAX #29 定义 [doc]（[UAX #29](https://www.unicode.org/reports/tr29/)）；Qt 提供 `normalized()`，Godot 提供 `is_valid_unicode_identifier` 与 XID_Start/XID_Continue 区分 [doc]（[Godot String](https://docs.godotengine.org/en/stable/classes/class_string.html)）。
- 设计含义：需要区分 code unit / code point / grapheme 三种索引语义，并在 API 命名或强类型上体现；编码边界类型化（如 `QAnyStringView` 的标签分派）；Unicode 数据与算法必须可外置、可裁剪；COW 值语义与 STL 迭代器契约、安全擦除存在冲突。

### 4.7 安全敏感场景

- 场景：浏览器、操作系统组件、认证与加密、日志与审计、解析不可信输入。
- 硬约束：不得悬垂、不得越界、不得注入、敏感数据可擦除、日志可脱敏。
- 可牺牲项：极致性能、与既有 ABI 完全兼容、API 简洁性。
- 证据：Herb Sutter 写道「it turns out to be easy to convert a `std::string` to a `string_view`，so that dangling is almost the default behavior」[talk]（[Sutter's Mill](https://herbsutter.com/2018/09/20/)）；P3471 把标准库中部分 UB 转为契约违约，并明确沿用 libc++ 的 hardening 实践 [paper]（[P3471](https://wg21.link/p3471)）；P1315 要求敏感数据擦除不被优化器删除，提供 `memset_explicit` 与函数模板 [paper]（[P1315R7](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p1315r7.html)）；P3672 指出 Windows 路径 API 对嵌入 NUL 的处理是 CVE 来源，主张「actively not support embedded nulls」[paper]（[P3672R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3672r0.pdf)）；libc++ 四档 hardening 承诺不影响 ABI [impl]（[Hardening.md#L13](https://github.com/llvm/llvm-project/blob/main/libcxx/docs/Hardening.md#L13)）。
- 设计含义：安全需要三层配合：语言/库的注解（P2255 的 `reference_constructs_from_temporary`、LLVM 的 `LLVM_LIFETIME_BOUND`）、实现的 hardening（可选检查）、API 设计的 checked 变体与显式错误。标准目前只覆盖了前两层的一部分。另一个直接冲突：COW/引用计数字符串无法擦除「所有副本」，安全擦除需求要求库提供擦除钩子或禁止共享。

### 4.8 科学计算、数据处理与命令行工具

- 场景：数值模拟、数据分析、日志/CSV/JSON 转换、CLI 输出；文本主要用于输入解析与结果输出。
- 硬约束：数值转换的精度与速度（正确舍入、最短表示、round-trip）；locale 无关；大文件流式处理；表格对齐。
- 可牺牲项：Unicode 语义（数据多为 ASCII）、动态拼接的便利性。
- 证据：P0067 的七条接口要求 [paper]（[P0067R5](https://wg21.link/p67)）；fast_float 的 4—10 倍提升已进入多个数据库与运行时 [impl]；fmt 的 Dragonbox 保证 round-trip [impl]；simdjson 的 GB/s 级批量解析 [paper]；格式化宽度/对齐属于 `format_spec` 的字段宽度、对齐、填充与精度 [doc]（[fmt syntax](https://fmt.dev/latest/syntax/)）。
- 设计含义：这一群体最在意「接口是否隐含分配/locale/运行时解析」，对类型系统的新花样兴趣不大。`from_chars` 的形状（返回 `{ptr, ec}`、不跳过空白、不抛异常）是理想范式；显示宽度对齐需要 East Asian Width 一类数据，标准格式化库目前不处理，这是 CLI 与 GUI 需求的分叉点 [推断]。

### 4.9 编译期与工具链

- 场景：静态初始化、编译期配置解析、格式串检查、反射与代码生成、DSL、嵌入资源。
- 硬约束：`constexpr`/`consteval` 可用；编译期分配与常量求值可用；错误在编译期暴露；编译时间与诊断可接受。
- 可牺牲项：运行期动态性、部分 ABI 兼容（编译期求值无 ABI 面）。
- 证据：P0980 让 `std::string` 的成员逐步 `constexpr` 化 [paper]（[P0980R1](https://wg21.link/p980)）；P2996 的示例包括 Enum to String、解析命令行选项与通用格式化器 [paper]（[P2996R13](https://wg21.link/p2996)）；草案已出现 `meta::reflect_constant_string` [draft]（[intseq](https://eel.is/c++draft/intseq)）；P1040 提出编译期拉取嵌入资源（`std::embed`）[paper]（[P1040R4](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1040r4.html)）；P2216 用 `consteval` 做格式串检查 [paper]；CTRE 在编译期完成正则解析与匹配 [impl]（[CTRE](https://github.com/hanickadot/compile-time-regular-expressions)）；P3655 指出 P2996 中返回 `string_view` 的元函数实际上被要求返回 NUL 结尾对象，等于在规范里「without naming the type」地使用 `cstring_view` [paper]（[P3655R6 §4](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3655r6.html)）。
- 设计含义：编译期能力正在成为字符串库的新接口维度。字符串要作为模板参数/反射输入，需要固定容量、字面量可构造、零分配的常量类型；`consteval` 检查与运行期输入天然矛盾，因此必须同时提供运行期入口；编译期 DSL 的模板实例化成本是实际工程负担。

### 4.10 跨语言、FFI 与网络边界

- 场景：C ABI 库、POSIX 系统调用、Rust/C++ 互操作、protobuf/gRPC、Wasm、插件系统。
- 硬约束：内存布局稳定；NUL 语义；明确的编码（UTF-8 或平台 UTF-16）；嵌入 NUL 的处理；错误码而非异常。
- 可牺牲项：C++ 侧的便利性；统一编码（边界两侧常常不同）；跨边界类型安全。
- 证据：Rust 的 `CString` 是「owned, C-compatible, nul-terminated string with no nul bytes in the middle」[doc]（[CString](https://doc.rust-lang.org/std/ffi/struct.CString.html)）；protobuf 的 string 字段必须是 UTF-8 或 7-bit ASCII、长度不超过 2^32，且采用长度前缀因而允许嵌入 NUL [doc]（[proto3](https://protobuf.dev/programming-guides/proto3/)）；cxx.rs 在 `std::string` 构造 `rust::String` 时对非 UTF-8 抛 `std::invalid_argument`，另提供 U+FFFD 替换的 lossy 版本 [impl]（[cxx string](https://cxx.rs/binding/string.html)）；Windows API 原生 UTF-16、Linux 约定 UTF-8 [paper]（[P3672R0](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3672r0.pdf)）；Qt 的 `QAnyStringView` 用编码标签 + 分派处理跨编码边界 [doc]（[QAnyStringView](https://doc.qt.io/qt-6/zh/qanystringview.html)）。
- 设计含义：边界层需要「类型系统能表达的不变式」：是否 NUL 终止、是什么编码、是否允许嵌入 NUL。C ABI 的 NUL 终止契约与 protobuf 的长度前缀契约互相排斥，同一程序两种契约并存时必须用不同类型区分 [推断]。`string_view` 只表达「一段字符」，不足以承载这些信息，于是每个项目各自定义 `zstring_view`、`StringPiece`、`QAnyStringView`。

---

## 5. 需求维度矩阵

下面三张表把十类用户与十个需求维度放在一起，用于快速定位「谁在什么维度上有硬约束」。强度是对证据的归纳 [推断]，不是问卷统计：强 = 该维度直接决定选型或可接受性；中 = 重要但可折中；弱 = 通常不构成约束。

表示与性能维度：

| 用户群 | 所有权 | 零分配 | 编码 | Unicode 算法 |
| --- | --- | --- | --- | --- |
| 标准库实现者/WG21 | 中 | 中 | 弱 | 弱 |
| 系统软件/基础设施库 | 强 | 强 | 弱 | 弱 |
| 游戏引擎 | 强 | 强 | 强 | 弱 |
| 嵌入式/实时/汽车 | 强 | 强 | 中 | 弱 |
| HFT/高性能服务 | 强 | 强 | 弱 | 弱 |
| 企业桌面/GUI/本地化 | 强 | 弱 | 强 | 强 |
| 安全敏感 | 中 | 弱 | 中 | 中 |
| 科学计算/数据/CLI | 中 | 强 | 弱 | 弱 |
| 编译期/工具链 | 强 | 强 | 中 | 弱 |
| 跨语言/FFI/网络 | 中 | 强 | 强 | 弱 |

接口与环境维度：

| 用户群 | 格式化 | 互操作 NUL | ABI | 无异常/无堆 |
| --- | --- | --- | --- | --- |
| 标准库实现者/WG21 | 强 | 强 | 强 | 中 |
| 系统软件/基础设施库 | 中 | 强 | 中 | 中 |
| 游戏引擎 | 中 | 强 | 强 | 强 |
| 嵌入式/实时/汽车 | 弱 | 中 | 中 | 强 |
| HFT/高性能服务 | 强 | 弱 | 中 | 强 |
| 企业桌面/GUI/本地化 | 强 | 强 | 中 | 中 |
| 安全敏感 | 弱 | 强 | 中 | 中 |
| 科学计算/数据/CLI | 强 | 中 | 中 | 中 |
| 编译期/工具链 | 强 | 弱 | 中 | 中 |
| 跨语言/FFI/网络 | 弱 | 强 | 强 | 中 |

安全与编译期维度：

| 用户群 | 安全 | 编译期 |
| --- | --- | --- |
| 标准库实现者/WG21 | 中 | 强 |
| 系统软件/基础设施库 | 中 | 中 |
| 游戏引擎 | 中 | 中 |
| 嵌入式/实时/汽车 | 中 | 强 |
| HFT/高性能服务 | 中 | 中 |
| 企业桌面/GUI/本地化 | 中 | 弱 |
| 安全敏感 | 强 | 中 |
| 科学计算/数据/CLI | 中 | 中 |
| 编译期/工具链 | 中 | 强 |
| 跨语言/FFI/网络 | 中 | 弱 |

读表时有两点需要注意。第一，同一列里出现多个「强」并不表示可以用同一种设计满足：例如「零分配」在嵌入式意味着「完全不允许堆」，在 HFT 意味着「热路径不允许分配，冷路径可以」，在基础设施库意味着「参数传递不分配，但返回值可以分配」。第二，「弱」不等于不需要，而是该维度可以通过约定或外部工具解决，例如标准库对 Unicode 算法弱，是因为它把责任外置给 ICU。

把维度换成接口要求，可以得到另一张表：

| 维度 | 典型接口要求 | 代表证据 |
|---|---|---|
| 所有权 | 借用视图作形参、拥有类型作返回值、显式转换 | P0254；LLVM StringRef/Twine |
| 零分配 | 写入调用方缓冲、可变参数拼接、惰性表达式、栈上固定容量 | Abseil StrCat；LLVM Twine；simdjson |
| 编码 | 编码标签/类型参数、显式转换、边界处校验 | Qt QAnyStringView；Rust String；P1885 |
| Unicode 算法 | 码点/字素迭代、归一化、排序、分词、大小写 | UAX #29；ICU；Boost.Locale |
| 格式化 | 编译期格式串检查、运行时逃生口、formatter 扩展点 | P0645；P2216；fmt |
| 互操作 NUL | 保证终止的视图、长度前缀类型、嵌入 NUL 策略 | P3655；Rust CString；protobuf |
| ABI | 布局冻结、ABI 版本宏、pimpl/类型擦除 | libc++ ABI 政策；P3655 的返回类型谨慎 |
| 无异常/无堆 | 错误码/expected、固定容量、无 RTTI 依赖 | ETL；EASTL；MISRA/AUTOSAR |
| 安全 | 生命周期注解、hardening 分档、擦除原语、checked 变体 | P2255；P3471；P1315 |
| 编译期 | constexpr/consteval、固定容量常量类型、静态诊断 | P0980；P2996；CTRE |

最后一张表记录「同一需求在不同人群得出相反结论」的情形，这些是设计评审中最容易漏掉的部分：

| 分歧点 | A 方立场 | B 方立场 | 现状 |
|---|---|---|---|
| 源编码 | Qt：全库 UTF-16，与系统 API 对齐 | Rust/网络生态：UTF-8 不变量 | C++ 标准两者都不承诺，边界转换由应用承担 |
| 拷贝策略 | Qt：COW 隐式共享，值语义像 int | 标准库：C++11 后 basic_string 禁止 COW | 共享诉求外置为 Cord/fbstring 大串惰性共享 |
| 格式串 | 编译期检查、类型安全 | i18n 翻译文件只能在运行期拿到 | 两套入口（format/vformat）并存 |
| Unicode 归属 | Boost.Text：算法进库甚至进标准 | ICU：算法与数据外置，标准只管表示 | 实际胜出的是 ICU 路线 |
| 异常 | 标准库/Abseil：分配失败抛 bad_alloc | EASTL/嵌入式：无异常是硬约束 | 同一 API 需在两种构建下可用 |
| 视图终止符 | string_view：不必 NUL 结尾，换取廉价子串 | C/POSIX/OS 接口：必须 NUL 结尾 | P3655 主张加 cstring_view 兄弟类型 |
| SSO 大小 | libstdc++/MSVC：15 字符换 32 字节对象 | libc++：22 字符、24 字节对象 | 无共识，靠 ABI 宏留后路 |
| 动态内存 | MISRA C++ 2023 21.6.1：禁止 | AUTOSAR C++14：受控允许 | 同一汽车代码库可能同时受两套规则约束 |

---

## 6. 主要矛盾与设计取舍

### 6.1 借用视图的生命周期 vs 零成本

视图的价值在于零成本，零成本意味着不拥有、不延长生命周期，于是悬垂成为默认风险。Sutter 的原话是「dangling is almost the default behavior」[talk]（[Sutter's Mill](https://herbsutter.com/2018/09/20/)）。标准层能做的只有：提供检测引用绑定到临时对象的 trait（P2255）[paper]、用注释与静态分析补足（LLVM 的 `LLVM_LIFETIME_BOUND`）[impl]、以及在实现层加 hardening 断言 [impl]。

折中：接口按「借用只在本次调用内有效」设计，跨调用存储必须显式拷贝；返回视图的函数加生命周期注解；把「视图作成员」视为需要审查的设计气味。

### 6.2 NUL 终止 vs 通用视图

`string_view` 的廉价子串依赖于「不要求终止符」，而 C/POSIX/OS 接口要求终止符。两种需求无法在同一个类型上同时最优，P3655 的结论是增加一个保证终止的兄弟类型，而不是修改 `string_view` [paper]（[P3655R6](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3655r6.html)）。嵌入 NUL 的处理则更加分裂：Croydon 投票 3/5/2/5/10，最终选择在值层面提供 `has_nulls()` 一类 API，而不是在类型层面禁止 [paper]。

折中：边界层用「终止性 + 编码 + 是否允许嵌入 NUL」三个正交属性描述；不要试图让一个视图类型同时表达全部。

### 6.3 编码正确性 vs 标准兼容期

Unicode 数据每年更新，标准库行为兼容期以十年计。ICU 主数据约 8 MB [doc]（[ICU4C Footprint](https://icu.unicode.org/charts/icu4c-footprint)），ICU4X 用 `no_std`、无全局缓存、数据由用户生成来应对 [doc]（[ICU4X Design Principles](https://chromium.googlesource.com/external/github.com/unicode-org/icu4x/+/74ab7948eb59568fdc09ebc98f7a08e2f1b8bdab/docs/design/principles.md)）。标准库若内置排序/大小写，就必须回答「按哪个 Unicode 版本」——这会把行为兼容性问题变成标准问题。

折中：标准只提供表示与基础迭代（码点、UTF 校验），算法与数据外置；库设计者把 Unicode 版本作为显式配置项。

### 6.4 零分配/惰性 vs 可存储性

LLVM `Twine` 用表达式模板做零分配拼接，代价是「只能作 `const Twine&` 形参、不能存」[impl]（[Twine.h#L26](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/Twine.h#L26)）。Abseil 的 `StrCat`/`StrAppend` 选择函数形态，牺牲「无限链式调用」换取可存储与可读 [doc]（[strings guide](https://abseil.io/docs/cpp/guides/strings)）。`absl::Cord` 则走向另一个极端：分片 + 引用计数，换取大文本的拼接与共享效率 [doc]。

折中：同时提供三种形态（函数式拼接、惰性表达式、拥有型 rope），并让它们的生命周期约束写进类型/注解；不要承诺「既零分配又可长期保存」的单一类型。

### 6.5 ABI 稳定 vs 布局性能

libstdc++/MSVC 的 `std::string` 是 32 字节、SSO 15 字符，libc++ 是 24 字节、22 字符 [impl][推断]；Facebook 的演讲主张按工作负载重排布局 [talk]，而 libc++ 的 ABI 政策要求冻结布局 [doc]（[ABIGuarantees](https://libcxx.llvm.org/docs/ABIGuarantees.html)）。libc++ 想试新布局只能靠 ABI 宏另开一版 [impl]。

折中：稳定类型保持布局不变；需要不同布局的用户改用新类型（`SmallString<N>`、自定义分配器类型）或在构建层面选择 ABI 版本。

### 6.6 编译期检查 vs 国际化

编译期格式串检查要求格式串是常量；翻译文件里的格式串是运行期数据。P2216 的讨论记录了「作为 DR 还是新特性」的分歧 [paper]（[P2216R3](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2216r3.html)）。

折中：两条腿走路——字面量走编译期检查，运行时/翻译串走 `vformat` 一类弱类型入口，并在入口处做尽量早的运行时校验。

### 6.7 统一容器语义 vs string 特化

P1072 的 LEWG 投票明确接受「只解决 string、不解决 vector」[paper]（[P1072R10](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p1072r10.html)）。这说明标准不把 `string` 当作「字符的 vector」，而是有独立语义的类型。

折中：承认两者的语义差异（终止符、allocator 构造语义、写入路径），不要为了「统一」而把 string 的保证降级或给 vector 增加文本语义。

### 6.8 无异常/无堆 vs 标准异常模型

ETL 用固定容量与截断标志避免异常与堆 [doc]（[ETL strings](https://www.etlcpp.com/docs/strings/)）；MISRA C++ 2023 禁止动态内存，AUTOSAR C++14 则受控允许异常与动态内存并要求 WCET 可分析 [doc]。EASTL 把无异常环境作为设计目标 [blog，二手]。

折中：库的错误策略参数化（异常 / error_code / expected / 截断标志），成功路径零开销；不要把 `bad_alloc` 作为唯一失败通道。

### 6.9 COW/共享 vs 安全擦除与 STL 契约

Qt 用隐式共享实现值语义，但文档自认迭代器行为与 STL 不同 [doc]（[implicit-sharing.html](https://doc.qt.io/qt-6/implicit-sharing.html)）。COW 还与安全擦除冲突：擦除一个副本不会擦除共享块，P1315 要求的「可靠擦除」在共享表示上无法实现 [paper]（[P1315R7](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p1315r7.html)）。

折中：COW 只存在于非标准类型；安全敏感数据使用不可共享的存储并提供擦除钩子；或者要求库提供 `detach` 后再擦除的 API。

### 6.10 大而全 vs 生态外置

`std::regex` 是前车之鉴：接口重、性能不可预期，社区转向 PCRE2/RE2 后很少回头 [推断]。Unicode 算法若强行进入标准，也会面临同样的实现成本与兼容期问题。

折中：标准提供「最小公分母 + 扩展点」，重量级算法由生态库承担；标准化的价值在于词汇类型与互操作，而不是把所有算法收进 `<string>`。

---

## 7. 现有方案的覆盖与缺口

下面六张表用「支持 / 部分 / 缺」描述各设施对需求的覆盖，按设施分组、按需求分表。`cstring_view` 一列指 P3655 提案（尚未进入草案，截至 2026-11 快照）；其余为标准或成熟库的现状。

标准库与提案设施（存储、视图与性能）：

| 需求 | std::string | string_view | cstring_view（提案） |
| --- | --- | --- | --- |
| 拥有型存储 | 支持 | 缺 | 缺 |
| 分配器可控 | 部分 | — | — |
| SSO 阈值可调 | 缺 | — | — |
| 借用视图 | 部分（可转换） | 支持 | 支持 |
| 保证 NUL 终止 | 支持（c_str） | 缺 | 支持 |
| 零分配拼接 | 缺 | — | — |
| rope/大文本 | 缺 | — | — |
| 固定容量 | 缺 | — | — |
| 池化/驻留标识符 | 缺 | 缺 | 缺 |

标准库与提案设施（文本、接口与安全）：

| 需求 | std::string | string_view | cstring_view（提案） |
| --- | --- | --- | --- |
| 编码查询 | 缺 | 缺 | 缺 |
| UTF 转码 | 缺 | 缺 | 缺 |
| Unicode 算法 | 缺 | 缺 | 缺 |
| 编译期格式检查 | — | — | — |
| 数值转换 | 支持（to/from_chars） | — | — |
| 边界检查 | 部分（hardening） | 部分（hardening） | 部分 |
| 安全擦除 | 缺 | — | 缺 |
| 异构查找 | 部分 | 部分 | — |
| 编译期字符串常量 | 部分（constexpr） | 支持（字面量视图） | 支持 |

格式化与编码设施（存储、视图与性能）：

| 需求 | std::format | text_encoding | ICU |
| --- | --- | --- | --- |
| 拥有型存储 | 缺 | 缺 | 支持 |
| 分配器可控 | 部分 | — | 部分 |
| SSO 阈值可调 | — | — | — |
| 借用视图 | — | — | 部分 |
| 保证 NUL 终止 | — | — | 部分 |
| 零分配拼接 | 部分（format_to） | — | 缺 |
| rope/大文本 | — | — | 缺 |
| 固定容量 | — | — | — |
| 池化/驻留标识符 | — | — | — |

格式化与编码设施（文本、接口与安全）：

| 需求 | std::format | text_encoding | ICU |
| --- | --- | --- | --- |
| 编码查询 | 缺 | 支持 | 支持 |
| UTF 转码 | 缺 | 缺 | 支持 |
| Unicode 算法 | 缺 | 缺 | 支持 |
| 编译期格式检查 | 支持 | — | — |
| 数值转换 | 支持 | — | 部分 |
| 边界检查 | 部分 | — | — |
| 安全擦除 | — | — | 部分 |
| 异构查找 | — | — | — |
| 编译期字符串常量 | 部分 | 支持 | — |

第三方与平台设施（存储、视图与性能）：

| 需求 | absl::Cord | LLVM | Qt |
| --- | --- | --- | --- |
| 拥有型存储 | 支持 | 支持（SmallString） | 支持 |
| 分配器可控 | 部分 | 支持 | 部分 |
| SSO 阈值可调 | — | 支持（显式容量） | 缺 |
| 借用视图 | 部分 | 支持 | 支持 |
| 保证 NUL 终止 | 部分 | 缺 | 部分 |
| 零分配拼接 | 支持 | 支持（Twine） | 部分 |
| rope/大文本 | 支持 | 缺 | 缺 |
| 固定容量 | 缺 | 支持 | 缺 |
| 池化/驻留标识符 | 缺 | 部分（StringMap） | 缺 |

第三方与平台设施（文本、接口与安全）：

| 需求 | absl::Cord | LLVM | Qt |
| --- | --- | --- | --- |
| 编码查询 | 缺 | 缺 | 支持 |
| UTF 转码 | 缺 | 部分 | 支持 |
| Unicode 算法 | 缺 | 缺 | 部分 |
| 编译期格式检查 | — | 部分 | 缺 |
| 数值转换 | — | 部分 | 部分 |
| 边界检查 | 缺 | 部分 | 缺 |
| 安全擦除 | 缺 | 缺 | 缺 |
| 异构查找 | 部分 | 支持（StringMap） | 部分 |
| 编译期字符串常量 | 缺 | 部分 | 缺 |

从覆盖表可以读出三条结构性缺口：

1. 「保证 NUL 终止 + 非拥有 + 零成本」缺少标准类型：`c_str()` 从拥有类型返回指针，`string_view` 不保证终止，于是每个项目自造 `zstring_view`/`StringPiece`。这是 P3655 的直接动机。
2. 文本层整体缺位：编码查询（C++26）与转码（提案中）之外，字素、排序、大小写、分词在标准库中完全缺失，只能外挂 ICU；这使「标准库字符串」实际上只是「字节容器」。
3. 性能相关的能力分布不均：零分配拼接、rope、固定容量、SSO 可调都只有第三方方案；标准库只在「一次分配 + 写入缓冲」这条路上提供了 `resize_and_overwrite`。

---

## 8. 对字符串库设计的建议

### 8.1 给库设计者的十条原则

1. 按边界分层：形参用借用视图（`string_view`/`StringRef`/`span<const char>`），返回值用拥有类型，跨模块边界用稳定布局的 (ptr,len) 或句柄。四家主流实现（Abseil、LLVM、Qt、Rust）在这一点上一致。
2. 转换的隐式性由代价决定：零成本转换可隐式（string → view），有成本转换必须显式（view → string、编码转换）。这是 P0254 的原则性表述 [paper]。
3. 编码契约写进类型或文档：要么像 Qt 一样固定 UTF-16、像 Rust 一样固定 UTF-8 不变量，要么在命名与文档里明确「这是字节序列」。模糊定位会把编码判断推给每个调用点。
4. 不要给 `std::string` 加隐式共享：COW 与 STL 迭代器契约、线程语义、安全擦除冲突；共享诉求用独立类型（Cord）表达。
5. 容量语义要显式：区分「提示性预留」与「保证不重分配」，提供「借用缓冲写入」的入口（`resize_and_overwrite` 式回调或 `span` 输出参数）。
6. SSO 与对象大小是 ABI 决策：要不同阈值就换类型（`SmallString<N>`）或另开 ABI 版本，不要指望运行期配置；文档要写明对象大小与阈值。
7. 格式化两条腿：字面量格式串走编译期检查（`consteval`），运行时/翻译串走弱类型入口；同时提供写入调用方缓冲的 `format_to`。
8. Unicode 算法外置、接口内置：库提供码点迭代、UTF 校验、码点/字素索引类型这类薄层；归一化、排序、分词交给可替换的后端（ICU/ICU4X/自带表）。
9. 安全分级且零 ABI 代价：hardening 做成编译期分档（unchecked/fast/extensive/debug），违约处理策略可配置；敏感数据提供不会被优化掉的擦除原语与 `detach` 语义。
10. 新类型必须与旧类型零成本互转：`cstring_view` 与 `string_view`、`string` 的互转必须是 O(1) 且无歧义；否则生态不会采用，标准也不会接受。

### 8.2 对标准演进的判断

- `cstring_view` 最可能先落地：P3655 已到 R6（2026-10），目标 C++29，有 Beman 参考实现，SG16/LEWG 已多轮反馈 [paper]。它解决的是「C 接口互操作」这一最刚性的缺口，阻力相对小。
- UTF 转码方向明确、时间未定：P2728（UTF 转码视图）与 P4246（WHATWG/iconv 适配器）在 2026 年仍处迭代，二者可能在范围上竞争或互补 [paper]。可以确定的是，标准最终不会内置完整 Unicode 算法。
- `text_encoding` 只是起点：它回答「当前在用什么编码」，不回答「怎么转换」。后续工作必然落在转码与边界类型上。
- `subview` 应等 `cstring_view` 定型：P3862 的论证成立——返回类型是 ABI 级承诺，先发布再改会制造永久债务 [paper]。2026-11 草案快照中 `subview` 仍带默认实参，这一冲突需要后续会议记录澄清（见 §9）。
- 固定容量字符串、池化标识符、Unicode 文本类型短期不会进标准：它们要么与 ABI/兼容期冲突，要么生态已有稳定方案；标准化的收益不足以覆盖成本 [推断]。
- 运行时格式串的安全检查仍是空白：`vformat` 会长期存在，标准层面没有统一的「运行时校验 + 拒绝策略」。

### 8.3 按用户群的选型建议

| 用户群 | 形参类型 | 存储 | 编码策略 | 格式化 |
| --- | --- | --- | --- | --- |
| 系统软件/基础设施 | string_view / StringRef | 标准 string 或专用类型 | 字节，边界处显式 | format/formatv |
| 游戏引擎 | StringRef/视图 + interned FName | 自定义分配器 + fixed_string | 平台字符类型（UTF-16/char） | 自建或 format |
| 嵌入式/汽车 | 视图 + 固定容量类型 | ETL/fixed_string，无堆 | ASCII/UTF-8 快路径 | 精简实现 |
| HFT/数据管道 | `span<const char>`/`string_view` | 栈缓冲 + arena | locale 无关 | to_chars/format_to |
| 桌面/GUI/本地化 | QStringView/QAnyStringView | QString/自有文本类型 | UTF-16 边界 | 本地化格式化 |
| 安全敏感 | 带注解的视图 | 不可共享、可擦除 | 边界校验 | 脱敏后再格式化 |
| 科学计算/CLI | string_view | 标准 string/流式缓冲 | ASCII/UTF-8 | format + 精度控制 |
| 编译期/工具链 | 字面量常量类型 | fixed capacity 常量 | UTF-8/UTF-16 字面量 | consteval 检查 |
| FFI/网络 | (ptr,len) 视图 | 边界一侧拥有 | UTF-8 或 UTF-16 显式 | 边界内格式化 |

补充：

- 系统软件/基础设施：自建 StringMap、Cord
- 游戏引擎：本地化文本独立类型
- 嵌入式/汽车：错误码/截断标志
- HFT/数据管道：批量视图解析、SIMD
- 桌面/GUI/本地化：ICU/平台 API
- 安全敏感：hardening + checked 变体
- 科学计算/CLI：from_chars/fast_float
- 编译期/工具链：CTRE/反射
- FFI/网络：CString/protobuf 契约

### 8.4 评审清单：设计或选型时问十个问题

1. 形参是否统一为借用视图？返回值是否统一为拥有类型？
2. 视图的生命周期约束是否写进类型、注解或文档？跨调用存储是否被禁止或显式拷贝？
3. 是否区分「字节 / 码元 / 码点 / 字素」四种索引语义？
4. 编码契约在哪里表达？边界转换是否显式且可失败？
5. NUL 终止、嵌入 NUL、长度前缀三种契约是否用不同类型区分？
6. 分配次数是否是接口的可观察属性？是否提供写入调用方缓冲的变体？
7. 对象大小与 SSO 阈值是否作为 ABI 承诺管理？
8. 错误策略是否可配置（异常/错误码/截断标志/lossy）？无异常构建是否可用？
9. 安全检查是否分档且不改 ABI？敏感数据是否有擦除路径？
10. 新类型是否与既有类型零成本互转？是否引入重载歧义或隐式行为变化？

---

## 9. 局限与待核实

本文的证据边界与未决事项如下，供后续核查：

- 标准快照时效：标准事实以 2026-11-02 草案快照为准；2026 年 11 月之后的 LEWG/LWG 结果不在范围内。
- `subview` 状态冲突：快照中 `basic_string::subview` 仍带默认实参，而 P3862R0 主张推迟到 `cstring_view` 定型；需要会议记录确认是提案未被采纳还是快照滞后。
- `cstring_view` 是否已进入草案：本地 `draft "cstring_view"` 无结果，可能是快照未更新，也可能是索引粒度问题；不能据此断言「未进入」。
- P0254 的最终形态：草案中 `basic_string` 是否提供到 `basic_string_view` 的转换运算符，本轮未逐条核对。
- EDIT5518：[container.reqmts] p65 是否与 SSO 存在张力，只拿到标题，正文未取证。
- `sizeof(std::string)` 与 SSO：24/32/32 字节与 15/22/15 字符由源码布局推导，未在本机实测（编译器环境不完整）。
- 二手来源：EASTL 的 SSO 容量 23 与无异常定位来自二手分析；Boost.Text 是否正式进入 Boost 仅有 2019 年评审征集；folly `FBString.md` 与 Chromium `string_piece.h` 取自镜像站；Qt `QStringBuilder`、Abseil 的异常策略与 `ABSL_FORMAT` 宏名、`flat_hash_map` 异构查找细节未取证。
- 平台细节：Godot `String` 的 COW 原句在抓取时被截断；Unreal 非 Windows 平台的 `TCHAR` 宽度、UE5 源码编码细节待核实。
- 未取证项：Victor Ciura 的 CppCon 2018 演讲 PDF、Apache Arrow 零拷贝文档、.NET `String` 与 Wasm/Emscripten 的字符串约定。
- 提案状态：P2728 与 P4246 的采纳状态无法从本地 disposition 索引确认，只能确认「仍在迭代」；P1040（`std::embed`）的采纳状态同样待核实。
- 方法局限：行业部分依赖公开文档、演讲与博客，缺少系统性问卷与可复现基准；所有「强/中/弱」矩阵条目都是对证据的归纳 [推断]。
- 无性能实测：本文未运行基准测试；引用的性能数字均来自来源方，未独立复测。

---

## 参考文献

### 标准草案（[draft]）

- [basic.string.general](https://eel.is/c++draft/basic.string.general)
- [string.require](https://eel.is/c++draft/string.require)
- [string.capacity](https://eel.is/c++draft/string.capacity)
- [string.access](https://eel.is/c++draft/string.access)
- [string.substr](https://eel.is/c++draft/string.substr)
- [string.view.cons](https://eel.is/c++draft/string.view.cons)
- [string.view.access](https://eel.is/c++draft/string.view.access)
- [text.encoding](https://eel.is/c++draft/text.encoding)
- [format.fmt.string](https://eel.is/c++draft/format.fmt.string)
- [format.range](https://eel.is/c++draft/format.range)
- [charconv.to.chars](https://eel.is/c++draft/charconv.to.chars)
- [charconv.from.chars](https://eel.is/c++draft/charconv.from.chars)
- [diff.cpp23.strings](https://eel.is/c++draft/diff.cpp23.strings)
- [intseq](https://eel.is/c++draft/intseq)

### 提案与议题（[paper]/[lwg]）

- [N3921 string_view 原始提案](https://wg21.link/n3921)
- [P0254R2 Integrating string_view and string](https://wg21.link/p254)
- [P1391 Range constructor for string_view](https://wg21.link/p1391)
- [P1989R2 Range constructor for string_view 2](https://wg21.link/p1989)
- [P2499R0 string_view range constructor should be explicit](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2499r0.html)
- [P2516R0 string_view is implicitly convertible from what?](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2022/p2516r0.html)
- [P1072R10 resize_and_overwrite](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p1072r10.html)
- [P0980R1 Making std::string constexpr](https://wg21.link/p980)
- [P0645R10 Text Formatting](https://wg21.link/p645)
- [P2216R3 std::format improvements](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p2216r3.html)
- [P2093R14 Formatted output](https://wg21.link/p2093)
- [P2286R8 Formatting Ranges](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2022/p2286r8.html)
- [P0067R5 Elementary string conversions](https://wg21.link/p67)
- [P1885R12 Naming Text Encodings](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/p1885r12.pdf)
- [P1629R1 Transcoding the world](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/p1629r1.html)
- [P0244R2 Text_view](https://wg21.link/p244)
- [P2255R2 reference binding to temporary](https://wg21.link/p2255)
- [P3044R2 sub-string_view from string](https://wg21.link/p3044)
- [P3862R0 Postpone basic_string::subview](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3862r0.html)
- [P3655R6 cstring_view](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p3655r6.html)
- [P2728R16 Unicode in the Library, Part 1](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p2728r16.html)
- [P4246R0 Transcoding Text Views](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2026/p4246r0.html)
- [P3672R0 On Windows, Systems APIs, Text Encodings, and Pragmatism](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2025/p3672r0.pdf)
- [P3471 Standard Library Hardening](https://wg21.link/p3471)
- [P1315R7 secure_clear](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2021/p1315r7.html)
- [P1040R4 std::embed](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1040r4.html)
- [P2996R13 Reflection](https://wg21.link/p2996)
- [P3081R2 Core safety profiles](https://wg21.link/p3081)
- [LWG4102 string_view(Iter, Iter) breaks code](https://cplusplus.github.io/LWG/issue4102)
- [LWG3645 resize_and_overwrite callback lvalues](https://cplusplus.github.io/LWG/issue3645)
- [LWG2791 string and string_view hash](https://cplusplus.github.io/LWG/issue2791)

### 实现源码（[impl]）

- [LLVM StringRef.h#L49](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/StringRef.h#L49)
- [LLVM Twine.h#L26](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/Twine.h#L26)
- [LLVM SmallString.h#L23](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/SmallString.h#L23)
- [LLVM StringMap.h#L10](https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/ADT/StringMap.h#L10)
- [libstdc++ basic_string.h#L232](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/basic_string.h#L232)
- [libc++ string#L794](https://github.com/llvm/llvm-project/blob/main/libcxx/include/string#L794)
- [libc++ string_view#L436](https://github.com/llvm/llvm-project/blob/main/libcxx/include/string_view#L436)
- [libc++ Hardening.md#L13](https://github.com/llvm/llvm-project/blob/main/libcxx/docs/Hardening.md#L13)
- [MSVC xstring#L424](https://github.com/microsoft/STL/blob/main/stl/inc/xstring#L424)
- [Abseil cord.h（镜像）](https://raw.githubusercontent.com/juanmaneo/abseil-cpp/e968256406fd7898d7fde880e31e54b041d32a7e/absl/strings/cord.h#L1)
- [Chromium StringPiece 迁移提交](https://chromium.googlesource.com/chromium/src/net/+/b4f8fb776a13d44583d75065b4490daa14c6c1e4)
- [NexusFix 低延迟日志](https://github.com/StratCraftsAI/NexusFix)
- [fast_float](https://github.com/fastfloat/fast_float)
- [fmt](https://github.com/fmtlib/fmt)
- [CTRE](https://github.com/hanickadot/compile-time-regular-expressions)
- [EASTL](https://github.com/electronicarts/EASTL)

### 厂商与标准组织文档（[doc]）

- [Abseil Strings Guide](https://abseil.io/docs/cpp/guides/strings)
- [Abseil Tip #18](https://abseil.io/tips/18)
- [Qt QString](https://doc.qt.io/qt-6/qstring.html)
- [Qt Implicit Sharing](https://doc.qt.io/qt-6/implicit-sharing.html)
- [Qt QAnyStringView](https://doc.qt.io/qt-6/zh/qanystringview.html)
- [Qt Wiki: QString](https://wiki.qt.io/QString)
- [fmt.dev](https://fmt.dev/dev/)
- [fmt syntax](https://fmt.dev/latest/syntax/)
- [libc++ ABI Guarantees](https://libcxx.llvm.org/docs/ABIGuarantees.html)
- [ICU4C Footprint](https://icu.unicode.org/charts/icu4c-footprint)
- [ICU4X Design Principles](https://chromium.googlesource.com/external/github.com/unicode-org/icu4x/+/74ab7948eb59568fdc09ebc98f7a08e2f1b8bdab/docs/design/principles.md)
- [Boost.Locale](https://www.boost.org/library/1.87.0/locale/)
- [Unreal String Handling](https://dev.epicgames.com/documentation/en-us/unreal-engine/string-handling-in-unreal-engine)
- [Epic C++ Coding Standard](https://dev.epicgames.com/documentation/unreal-engine/epic-cplusplus-coding-standard-for-unreal-engine?application_version=5.6)
- [Godot String](https://docs.godotengine.org/en/stable/classes/class_string.html)
- [Godot StringName](https://docs.godotengine.org/fr/4.x/classes/class_stringname.html)
- [ETL strings](https://www.etlcpp.com/docs/strings/)
- [Windows data types for strings](https://learn.microsoft.com/en-us/windows/win32/Intl/windows-data-types-for-strings)
- [Use UTF-8 code page](https://learn.microsoft.com/en-us/windows/apps/design/globalizing/use-utf8-code-page)
- [UAX #29](https://www.unicode.org/reports/tr29/)
- [Rust CString](https://doc.rust-lang.org/std/ffi/struct.CString.html)
- [Rust String](https://doc.rust-lang.org/std/string/struct.String.html)
- [protobuf proto3](https://protobuf.dev/programming-guides/proto3/)
- [cxx.rs string](https://cxx.rs/binding/string.html)
- [simdjson README](https://github.com/simdjson/simdjson/blob/40a686ab89dc5ee58ec10d0514dd5c99abbc472b/README.md)
- [simdjson About](https://simdjson.org/about/)
- [Core Guidelines SL.str.2](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#rstr-view)
- [MISRA C++ 2023 规则 21.6.1（经 CodeSonar 文档）](https://docs.adacore.com/live/wave/codesonar_manual_ada/html/codesonar_manual_ada/WarningClasses/BADFUNC/BADFUNC.STDLIB_H_MEM.html)
- [AUTOSAR C++14 Guidelines](https://www.autosar.org/fileadmin/standards/R21-11/AP/AUTOSAR_RS_CPP14Guidelines.pdf)
- [AUTOSAR A15-0-7 规则表（经 MathWorks BugFinder 文档）](https://www.mathworks.com/help/releases/r2025a/pdf_doc/bugfinder/bugfinder_ref.pdf)

### 演讲、博客与社区（[talk]/[blog]/[community]）

- [CppCon 2016: The strange details of std::string at Facebook](https://isocpp.org/blog/2017/06/cppcon-2016-the-strange-details-of-stdstring-at-facebook-nicholas-ormr)
- [CppCon 2017: A modern formatting library for C++](https://isocpp.org/blog/2018/06/cppcon-2017-a-modern-formatting-library-for-cpp-victor-zverovich)
- [Sutter's Mill: string_view 悬垂](https://herbsutter.com/2018/09/20/)
- [CppCon 2024: C++ Exceptions for Smaller Firmware](https://isocpp.org/blog/2024/08/cppcon-2024-cpp-exceptions-for-smaller-firmware-khalil-estell)
- [Parsing Gigabytes of JSON per Second](https://arxiv.org/abs/1902.08318)
- [SG16 邮件列表讨论](https://lists.isocpp.org/sg16/2025/04/4549.php)
- [EASTL issue #454](https://github.com/electronicarts/EASTL/issues/454)
- [Boost.Text 作者评审征集](https://listarchives.boost.org/boost-users/2019/10/90048.php)
