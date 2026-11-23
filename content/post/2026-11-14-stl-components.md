---
title: "STL 需要有什么组件"
slug: "stl-components"
date: "2026-11-14"
tags: ["C++", "标准库", "STL", "架构"]
series: "C++ 标准库"
series_order: 1
draft: false
summary: "按 L0–L12 分层梳理一个 C++ 标准库需要哪些组件、按什么顺序实现、工程配套占多大比重，并按经典 STL 子集、完整标准库、实现产品三档给出范围建议。"
---

> 副标题：从零实现 C++ 标准库的组件地图、依赖顺序与工程配套
>
> 证据基准：2026-11；标准侧以 C++26 为基线、C++29 早期特性为前沿；实现侧对照本机三套源码——MSVC STL 14.51（`_MSVC_STL_VERSION 145`）、libstdc++ 16.2 与 GCC 17 trunk、libc++ 24 trunk（`_LIBCPP_VERSION 240000`）。
>
> 生成说明：本文底稿由 AI 辅助整理，事实与数据经抽样核对；关键决定请以标准文本与官方文档为准。

## 0. 结论摘要

1. 「STL 需要什么组件」有三层答案：经典 STL 子集（容器、迭代器、算法，约 20 个头）、完整 C++ 标准库（约 110 个 C++ 标准头，含 C 兼容头共约 140 个，加文本、I/O、并发、数值、时间、本地化）、可维护的实现产品（再加配置层、编译库、测试体系、ABI 与加固策略、平台数据）。只做第一层是教学项目；做到第三层才是库。
2. 组件的依赖顺序从语言与内存开始：语言支持与运行时（L0）→ 配置层（L1）→ 元编程与通用工具（L2）→ 内存与分配（L3）→ 容器/迭代器/算法/`ranges`（L4–L6）→ 文本、I/O、数值、时间、并发（L7–L10）→ 诊断与兼容层（L11–L12）。跨层引用的设计会在实现早期制造循环依赖。
3. 模板组件可以纯头文件实现；但 locale、iostream、filesystem、format/print、random、chrono 的时区、stacktrace、regex 需要编译库与平台设施。三家实现都有 `src` 目录，MSVC 的 `crt\src\stl` 约 100 个编译单元。
4. 三套实现的标准头集合高度一致：本机并集约 150 个名字，归入标准组件清单的 138 个（C++ 标准头 109 个、C 兼容头 27 个），其余是实现内部头、平台包装头与扩展目录。差异集中在 C++26 覆盖度（`<contracts>`、`<meta>`、`<simd>`、`<inplace_vector>` 等）与实现自有扩展头，不在组件划分。
5. 「组件」不只是类模板：每个组件还包含特性宏、约束与诊断、异常安全保证、分配器协议、加固断言、ABI 布局、测试与基准。评估工作量时这些必须计入，否则会低估 3–5 倍。
6. C++20 之后组件边界发生变化：概念（concepts）把约束从文档变成接口，`ranges` 把算法从「迭代器对」扩展为「range + 视图 + 投影」，`<format>` 把格式化从流中分离出来。新实现应按新边界组织组件，不必复刻 C++98 的实现结构。
7. 四件事必须在写第一个容器之前定：异常模型、分配模型、ABI 承诺、加固策略。它们决定类型布局、接口形状与二进制兼容性，事后修改成本接近重写。
8. 最小可行内核：配置层 + 语言支持 + 分配器 + `vector`/`string`/`string_view` + 迭代器协议 + 基础算法 + 测试与构建，约 15–20 个公共头，能形成「可编译、可测试、可扩展」的闭环。
9. 工程量分布通常是：测试与验证 > 组件实现 > 文档。libc++ 的 `test/std` 约 8000 个正向测试，libstdc++ 的 `testsuite` 约 1 万个测试文件；测试体系与库代码同规模。
10. 一句话版本：先做「语言支持 + 分配器 + 迭代器协议 + 容器与算法」，再做「文本与格式化 + I/O + 并发」，最后做「`ranges` + `format` + `chrono` 时区 + `filesystem` + 本地化」；工程组件与库组件同步建设，不要等库写完再补。

---

## 1. 范围与口径：三个「STL」

「STL」在不同语境下指三种规模，组件清单随之不同。先选目标，再谈组件。

| 范围 | 包含 | 规模 | 适合的目标 |
| --- | --- | --- | --- |
| S1 经典 STL 子集 | 容器、迭代器、算法、函数对象、适配器、分配器 | 约 20 个标准头（`<vector>`、`<list>`、`<map>`、`<algorithm>`、`<iterator>`、`<functional>`、`<memory>` 等） | 教学、嵌入式内核、算法库 |
| S2 完整 C++ 标准库 | S1 + 语言支持、诊断、通用工具、文本、I/O、本地化、数值、时间、并发、文件系统、正则、C 兼容层 | 约 110 个 C++ 标准头 + 约 30 个 C 头 | 自研标准库、替换平台 STL、研究 |
| S3 实现产品 | S2 + 配置层、编译库与运行库绑定、测试体系、ABI 政策、加固、性能基准、平台数据、发布流程 | 代码量与测试量通常 1:2 到 1:3 | 长期维护、可发布的实现 |

本文按 S3 组织，但每节都标注 S1/S2 的裁剪方式。若目标只是 S1，可直接跳到 §2 的 L0–L6 与 §6 的范围建议。

### 1.1 事实分级与版本基准

| 标记 | 含义 | 例 |
| --- | --- | --- |
| [标准] | C++26 工作草案或已发布标准的要求 | `<vector>` 必须满足连续容器要求 |
| [实现] | 本机三套实现的实际做法，注明路径与版本 | MSVC 在 `crt\src\stl` 编译 `locale.cpp` |
| [推断] | 本文的工程判断，非标准或实现事实 | 建议把平台层收敛为 5 个头 |

标准事实以「头文件与条款」表述，不逐一引用段落号；实现事实给到目录或文件。C++29 特性只在与选型相关时提及，并标注「前沿」。

### 1.2 不做什么

- 不把「实现 STL」等同于「重写 `std::vector`」：完整实现的主要工作量在标准要求的边缘行为、异常安全、分配器传播与测试，而不在主路径。
- 不承诺一家实现覆盖全部标准：三家本机实现都有未完成的 C++26 组件（见 §7），实现范围应显式列出「已实现 / 部分 / 未实现」。
- 不把平台差异藏进业务代码：locale、时区、文件系统、线程、熵源必须有明确的平台抽象层。

---

## 2. 分层组件模型

把组件按「依赖方向」而不是按标准条款分章，才能得到可执行的实现顺序。下面 13 层是本文的组织框架，层号越小越先实现。

L0–L6（语言基础、元编程、内存、容器、迭代器与算法）：

| 层 | 职责 | 代表标准头 | 层内主要组件 | 依赖 |
| --- | --- | --- | --- | --- |
| L0 语言支持与运行时 | 把语言机制暴露为库设施 | `<new>`、`<exception>`、`<typeinfo>`、`<initializer_list>`、`<coroutine>`、`<contracts>`、`<cstddef>`、`<cstdint>`、`<climits>`、`<cstdarg>`、`<csignal>`、`<type_traits>`（基础内建） | 分配函数、异常类、RTTI 包装、初始化列表、协程句柄、契约、类型特征内建、基础类型定义 | 编译器内建、C 运行库、ABI |
| L1 配置与基础设施 | 让其余组件可移植的公共底座 | 非标准头（`__config`、`c++config.h`、`yvals_core.h` 一类） | 平台/编译器探测、特性宏、标准模式门控、ABI 命名空间、加固宏、符号可见性 | L0 |
| L2 元编程与通用工具 | 类型计算与不分配内存的通用类型 | `<concepts>`、`<type_traits>`、`<limits>`、`<compare>`、`<utility>`、`<tuple>`、`<optional>`、`<variant>`、`<any>`、`<expected>`、`<bitset>`、`<bit>`、`<functional>`、`<source_location>`、`<version>`、`<ratio>`、`<system_error>` | 概念、traits、`pair`/`tuple`、和类型、函数对象与 `invoke`、哈希、位运算、错误码 | L0、L1 |
| L3 内存与分配 | 所有动态容器的地基 | `<memory>`、`<memory_resource>`、`<scoped_allocator>` | `allocator`/`allocator_traits`、`unique_ptr`、`shared_ptr`/`weak_ptr`、`make_*`、未初始化算法、`polymorphic_allocator`、内存资源 | L2 |
| L4 容器 | 最常被使用的组件 | `<array>`、`<vector>`、`<deque>`、`<list>`、`<forward_list>`、`<map>`、`<set>`、`<unordered_map>`、`<unordered_set>`、`<stack>`、`<queue>`、`<priority_queue>`、`<flat_map>`、`<flat_set>`、`<span>`、`<mdspan>`、`<inplace_vector>`（C++26） | 序列/关联/无序容器、适配器、视图、多维视图、节点句柄、分配器传播 | L3、L5（迭代器） |
| L5 迭代器与算法 | 泛型编程的核心协议 | `<iterator>`、`<algorithm>`、`<numeric>`、`<execution>` | 迭代器概念与 traits、迭代器适配器、`<algorithm>` 全家族、数值算法、执行策略 | L2、L3 |
| L6 `ranges` | 以 range 为一等公民的算法层 | `<ranges>` | range 概念、视图、工厂、适配器、`borrowed_range`、`dangling`、投影 | L2、L5 |

L7–L12（文本、I/O、数值、并发、诊断与 C 兼容）：

| 层 | 职责 | 代表标准头 | 层内主要组件 | 依赖 |
| --- | --- | --- | --- | --- |
| L7 文本与格式化 | 字符序列、解析与格式化 | `<string>`、`<string_view>`、`<charconv>`、`<format>`、`<print>`、`<text_encoding>`（C++26） | 拥有型与借用型字符串、数值转换、格式化、打印、编码识别 | L2、L3、L5 |
| L8 I/O、文件与本地化 | 与外部世界交换数据 | `<iosfwd>`、`<ios>`、`<streambuf>`、`<istream>`、`<ostream>`、`<iostream>`、`<fstream>`、`<sstream>`、`<spanstream>`、`<strstream>`、`<syncstream>`、`<iomanip>`、`<filesystem>`、`<locale>`、`<codecvt>`、`<regex>` | 流缓冲与流状态、文件流、字符串流、同步输出、路径与目录遍历、本地化 facet、正则 | L7、L3 |
| L9 数值、时间与随机 | 计算型设施 | `<complex>`、`<valarray>`、`<numbers>`、`<cmath>`、`<random>`、`<chrono>`、`<simd>`（C++26）、`<linalg>`（C++26） | 复数、数值数组、数学常数、数学函数、随机引擎与分布、时钟/日历/时区、数据并行类型、线性代数 | L2、L3、L5 |
| L10 并发与执行 | 线程、原子与异步 | `<atomic>`、`<thread>`、`<mutex>`、`<shared_mutex>`、`<condition_variable>`、`<future>`、`<semaphore>`、`<latch>`、`<barrier>`、`<stop_token>`、`<execution>`、`<coroutine>`、`<generator>` | 原子类型、线程、互斥与条件变量、future/promise、信号量与屏障、停止令牌、senders/receivers、协程任务 | L0、L3、L9（`chrono`） |
| L11 诊断与观测 | 错误、断言与回溯 | `<stdexcept>`、`<cassert>`、`<stacktrace>`、`<debugging>`（C++26） | 异常层级、断言、栈回溯、断点 | L0、L2 |
| L12 C 库兼容与弃用层 | 与 C 互操作、历史兼容 | `<cstdio>`、`<cstdlib>`、`<cstring>`、`<ctime>` 等约 30 个头；`<ccomplex>`、`<ctgmath>`、`<cstdalign>`、`<cstdbool>`、`<ciso646>` 等弃用头 | C 头包装、`<*.h>` 形式、弃用告警与抑制 | L0、L1 |

### 2.1 依赖图

```text
编译器/运行库/OS
      |
      v
 L0 语言支持与运行时
      |
      v
 L1 配置与基础设施
      |
      v
 L2 元编程与通用工具 ----> L3 内存与分配
      |                        |
      +--------+---------------+
               v
 L5 迭代器与算法 <---- L4 容器 <---- L3
      |                     ^
      v                     |
 L6 ranges                  |
      |                     |
      +-------> L7 文本与格式化
                     |
                     v
                 L8 I/O、文件、本地化

 L9 数值/时间/随机 <---- L2
 L10 并发与执行   <---- L0/L3/L9
 L11 诊断与观测   <---- L0/L2
 L12 C 库兼容     <---- L0/L1
```

### 2.2 跨层关系说明

- L4 容器依赖 L5 的迭代器协议，而不是反过来；实现时先有 `iterator_traits` 与迭代器概念，再写容器。
- L6 `ranges` 依赖 L5 的算法与迭代器，但 `ranges` 的视图可被 L7 的格式化、L8 的 I/O 使用，因此 `ranges` 要早于文本与 I/O 的下游组件完成「只读视图」部分。
- L10 的 `std::execution`（senders/receivers）与 `<execution>` 的执行策略共享头文件但语义不同：前者是异步组合模型，后者是并行算法策略，应作为两个子组件分别排期。
- L12 不是「最后再补」：C 头包装被 L0 的基础类型、L7 的 `charconv`、L8 的 `iostream` 广泛使用，必须在早期至少提供最小实现。
- `std::string` 横跨 L7 与 L4：它是容器也是文本类型，建议在 L7 排期，但复用 L4 的分配器与迭代器设施。

---

## 3. 各层组件清单与实现要点

本节按 §2 的分层逐层列出组件。每层先给组件表（标准头、关键实体、难点、优先级），再给该层的实现顺序要点。

### 3.1 L0 语言支持与运行时

这一层不是「简单的头文件」，而是库与编译器/运行库的协议层。`<new>`、`<exception>`、`<typeinfo>`、`<initializer_list>`、`<coroutine>` 的声明可以写在头里，但 `operator new` 的实现、异常传播与捕获、RTTI 对象生成、`exception_ptr` 的引用计数都在运行库与编译器 ABI 中 [实现]。实现前必须定两件事：选哪套 C++ ABI（Itanium 或 MSVC），以及复用现成运行库（`libc++abi`、`libsupc++`、`vcruntime`）还是自研低层；只交付头文件得不到可用的 `<new>`/`<exception>`/`<typeinfo>` [推断]。

| 组件 | 标准头 | 关键实体 | 实现难点 | 优先级 |
| --- | --- | --- | --- | --- |
| 分配函数 | `<new>` | `bad_alloc`、`bad_array_new_length`、`nothrow`、对齐/带大小 `delete`、`launder`、`new_handler` | 可替换函数不能内联；数组 cookie 与对齐重载；`-fno-exceptions` 时失败只能终止；分配来源与 `new_handler` 的循环 | 最小可用 |
| 异常 | `<exception>` | `exception`、`bad_exception`、`exception_ptr`、`current_exception`、`rethrow_exception`、`nested_exception`、`uncaught_exceptions`、`terminate` | `exception_ptr` 引用计数与跨线程/跨 DSO；Itanium `__cxa_*` 与 MSVC EH 的差异；异常对象布局属于 ABI；析构抛出与 `noexcept` 违规触发 `terminate` | 最小可用 |
| RTTI | `<typeinfo>`、`<typeindex>` | `type_info`、`bad_cast`、`bad_typeid`、`type_index` | `name()` 内容未指定；`hash_code` 必须与 `==` 一致；`-fno-rtti` 下不可用；跨 DSO 同一类型必须同一对象，`dynamic_cast` 的跨继承图转换由运行库完成 | 最小可用 |
| 初始化列表 | `<initializer_list>` | `initializer_list`、`begin`/`end`/`size`/`data` | 布局由编译器约定（私有构造函数），不能自行定义；底层数组由编译器在调用点生成；元素生命周期到完整表达式结束 | 最小可用 |
| 协程 | `<coroutine>` | `coroutine_traits`、`coroutine_handle`、`suspend_always`/`suspend_never`、`noop_coroutine` | `__builtin_coro_*` 内建；协程帧分配走 `operator new`；`promise_type` 协议与分配省略；ABI 版本必须与编译器一致（MSVC 用 `#pragma detect_mismatch("_COROUTINE_ABI", "2")`） | 可延后 |
| 契约 | `<contracts>` | 契约断言与违约处理 | C++26 特性，依赖编译器契约支持；与 hardening 断言的关系要先定 | 可延后（前沿） |
| 异常类 | `<stdexcept>` | `logic_error`、`runtime_error` 及派生类 | `what()` 返回以空字符结尾的字符串、复制不抛异常 [标准]；异常类必须导出以跨 DSO 抛出；`what()` 的存储方式属实现自由，libstdc++ 的 `<stdexcept>` 甚至直接包含 `<string>`（依赖倒置） | 最小可用 |
| C 基础类型头 | `<cstddef>`、`<cstdint>`、`<climits>`、`<cfloat>`、`<cstdarg>`、`<csetjmp>`、`<csignal>` | `size_t`、`byte`、定宽整数、浮点极限、`va_list`、`jmp_buf` | 类型必须与编译器一致，不能自造；`max_align_t` 随平台；`long double` 的 80/128 位差异会传导到 `<limits>`；`va_list` 布局不可移植；`longjmp` 跳过析构是标准可观察行为 | 最小可用 |

这一层的另一半在头文件之外 [实现]：

- `operator new`/`operator delete` 是可替换的全局符号，必须由运行库给出定义；MSVC 把它们放在闭源的 `vcruntime` 中，头文件里只有 `vcruntime_new.h` 的声明。
- 异常传播需要 unwinder 与 personality routine；RTTI 对象由编译器生成，`dynamic_cast` 的跨继承图转换由运行库完成。
- `initializer_list` 的底层数组、协程帧的布局与恢复代码都由编译器生成，库只提供指向首元素与长度的视图，以及 `coroutine_handle` 的薄封装。
- C 基础头不是实现出来的，而是与编译器、目标 C 库对齐出来的；这部分工作量在平台矩阵验证，不在写逻辑 [推断]。

三家落点 [实现]：

| 落点 | MSVC STL 14.51 | libstdc++ 16 | libc++ 24 trunk |
| --- | --- | --- | --- |
| 分配函数 | 闭源 `vcruntime`，头文件只给声明 | `libsupc++/new_op.cc`、`del_op*.cc`、`new_handler.cc` | `src/new.cpp`、`src/new_helpers.cpp` |
| 异常传播 | MSVC EH（SEH） | `libsupc++/eh_throw.cc`、`eh_personality.cc`、`unwind-cxx.h` | 依赖 `libunwind` 或系统 unwinder，`src/exception.cpp` |
| RTTI | 编译器生成 `type_info` 对象 | `libsupc++/tinfo.cc`、`dyncast.cc` | `src/typeinfo.cpp` |
| `initializer_list` 布局 | `_First`/`_Last` | `_M_array`/`_M_len` | `__begin_`/`__size_` |
| 协程 | `#pragma detect_mismatch("_COROUTINE_ABI", "2")` | 头文件加编译器内建 | `__coroutine/coroutine_handle.h` |
| 异常类存储 | 类定义在头内，依赖 `xstring` | 头包含 `<string>`，实体在 `src/c++11/cxx11-stdexcept.cc` | `__libcpp_refstring`（`stdexcept:59`） |

异常、RTTI 与 ABI 命名空间的开关必须写进配置层，三家落点不同 [实现]：

| 开关 | MSVC STL | libstdc++ | libc++ |
| --- | --- | --- | --- |
| 异常 | `_HAS_EXCEPTIONS`（`yvals_core.h:734`） | `__cpp_exceptions`；`bits/exception_defines.h` 把 `throw` 映射为终止 | `_LIBCPP_HAS_EXCEPTIONS`（`__configuration/language.h:50-52`） |
| RTTI | `_HAS_STATIC_RTTI`（`yvals_core.h:928-929`） | `__GXX_RTTI` | `_LIBCPP_HAS_RTTI`（`__configuration/language.h:44-46`） |
| ABI 命名空间 | 无版本命名空间，`_STD_BEGIN` 只是 `namespace std {` 的包装（`yvals_core.h:1899`） | `_GLIBCXX_BEGIN_NAMESPACE_VERSION` 展开为 `namespace __8 {`（`c++config.h:399`） | `inline namespace _LIBCPP_ABI_NAMESPACE`（`__configuration/namespace.h:81`） |

实现顺序：配置层先行 → C 基础类型头 → `<new>`/`<initializer_list>`/`<typeinfo>`/`<exception>` 与运行库对接 → `<stdexcept>` → 协程与契约。两个横切开关（异常、RTTI）必须在第一天定；开关不一致的库与 TU 不能混链 [推断]。

### 3.2 L1 配置与基础设施

配置层没有标准头，却是所有头的第一行依赖。它把「平台差异 + 编译能力 + 项目策略」收敛成宏，其他组件只使用宏、不直接判断编译器。它必须先于其他所有头完成：ABI 标签、hardening 开关、异常/RTTI 开关、`-std` 版本探测都在这里，改一处会波及全库 [推断]。

| 组件 | 职责 | 三家落点 [实现] |
| --- | --- | --- |
| 平台/编译器探测 | 编译器与版本、平台、架构、字节序、`wchar_t`/`char8_t` 能力、对齐模型 | `__config`（libc++）、`bits/c++config.h`（libstdc++）、`yvals_core.h` + `vcruntime.h`（MSVC） |
| 特性宏 | 生成 `__cpp_lib_*`、`__cpp_impl_*` 能力宏，单一事实来源 | `<version>` 与配置头；libc++ 的 `version` 约 304 个宏 |
| 标准模式门控 | 按 `__cplusplus`/`_MSVC_LANG` 裁剪接口，一份源码支持多标准模式 | 三家都集中门控，禁止在公共头散落版本判断 |
| 异常/RTTI 开关 | 提供无异常、无 RTTI 构建分支 | 见 §3.1 的开关表 |
| ABI 命名空间与版本 | 版本化内联命名空间、ABI 标签、版本宏 | libstdc++ `__8`（`c++config.h:399`），`string` 另有 `__cxx11` 内联命名空间（`_GLIBCXX_USE_CXX11_ABI` 于 `c++config.h:371` 为 1）；libc++ `_LIBCPP_ABI_NAMESPACE`（`__configuration/namespace.h:81`），值由构建生成的 `__config_site` 决定；MSVC 无版本命名空间 |
| 加固钩子 | 断言宏、检查档位、失败语义 | `_STL_VERIFY`/`_STL_ASSERT`（MSVC）、`_LIBCPP_ASSERT`（libc++）、`__glibcxx_assert`（libstdc++） |
| 符号可见性/导出 | 动态库导出、内联、`noexcept` 修饰 | `_LIBCPP_EXPORTED_FROM_ABI`、`_GLIBCXX_EXTERN_TEMPLATE`、`__declspec(dllexport)` |
| 编译期能力探测 | `constexpr` 能力、内建检测、编译器缺陷规避 | `__config`/`c++config.h` 的 feature test 段 |

配置层还有三条硬规则：

- 低层头（L0–L2）不得包含高层头（L4 及以上）[推断]。三套实现靠内部头维持这条边界：MSVC 的 `x*`/`y*`、libstdc++ 的 `bits/*`、libc++ 的 `__*` 目录；违反后会出现循环包含与编译期膨胀 [实现]。
- `<version>` 的宏要按标准级别按需展开 [实现]：libstdc++ 经 `bits/version.h` 的 `__glibcxx_want_*` 机制逐项展开（`exception:43-45` 是示例），MSVC 的 `version` 只包含 `yvals_core.h`，libc++ 的 `version` 汇总 304 个 `__cpp_lib_*` 宏。
- 异常/RTTI 开关不只是 `#if`：它们决定头文件里每个 `throw` 点的写法与库的二进制形态，必须与 §3.1 的开关表、加固宏、符号导出一起在配置层定义 [推断]。

配置层的验收标准：同一份实现代码在 C++17/20/23/26 模式、异常开/关、RTTI 开/关的六种组合下都能编译。做不到这一点，后续每加一个组件都会遇到宏爆炸。

### 3.3 L2 元编程与通用工具

这一层是「纯头文件、无运行时依赖」的主体，也是模板代码量与编译期成本的主要来源。它的正确性高度依赖编译器内建与目标平台 C 库：traits 错一个，容器、算法、格式化会集体出错 [推断]。

类型计算与约束：

| 组件 | 标准头 | 实现难点 | 优先级 |
| --- | --- | --- | --- |
| 类型特征 | `<type_traits>` | 必须与编译器内建 `__is_*` 结论完全一致；SFINAE 中不能产生硬错误；编译期成本；`is_trivially_copyable`、`is_standard_layout`、`is_convertible` 与编译器结论不一致会让全库连锁失效 | 最小可用 |
| 概念 | `<concepts>` | 语义与短路；subsumption；诊断质量；概念不能替代 traits 的编译期计算 | 最小可用 |
| 数值极限 | `<limits>`、`<cfloat>`、`<climits>` | `long double` 平台差异；`is_iec559`/`has_denorm`/`round_style` 必须与硬件一致 | 最小可用 |
| 三路比较 | `<compare>` | 全序/弱序/偏序；浮点 NaN；与用户 `<=>` 的互操作 | 最小可用 |
| 位与字节 | `<bit>` | `bit_cast` 的 `constexpr` 与对象表示；`endian` 平台检测；内建不可用降级 | 最小可用 |
| 编译期常数 | `<ratio>`、`<version>` | 有理数约分与溢出控制；特性宏单一事实来源 | 最小可用 |

通用工具与词汇类型：

| 组件 | 标准头 | 实现难点 | 优先级 |
| --- | --- | --- | --- |
| 通用工具 | `<utility>`、`<tuple>` | `pair` 布局与 EBO；`tuple` 的递归继承与 `uses_allocator` 构造；结构化绑定；模板实例化成本 | 最小可用 |
| 词汇类型 | `<optional>`、`<variant>`、`<any>`、`<expected>` | 平凡性传播；`variant` 的 `valueless_by_exception`；`any` 的类型擦除与无 RTTI 退化；`expected` 的 `constexpr` | 完整 |
| 函数对象 | `<functional>` | `invoke`/`bind`/`hash`/`reference_wrapper`/`move_only_function`；`hash` 的稳定性 | 完整 |
| 源码位置 | `<source_location>` | MSVC 用 `__builtin_LINE`/`__builtin_FUNCSIG`，GCC/Clang 用 `__builtin_source_location`；`consteval` 默认参数机制；不能作为模板参数 | 可延后 |
| 错误码 | `<system_error>` | `error_category` 的 ABI；跨 DSO 单例；`error_code`/`error_condition` 语义 | 完整 |
| 位集合 | `<bitset>` | 与 `<string>` 的互操作；`constexpr` | 完整 |

`<type_traits>` 的实现策略三家不同：MSVC 大量直接用编译期内建，libstdc++ 混合内建与手写偏特化，libc++ 把它们拆成 `__type_traits/` 下 114 个内部小头以控制编译依赖 [实现]。自研实现建议采用「内建优先 + 手写兜底」的两层结构：每个 trait 先取编译器内建，内建缺失或结论不一致时再用手写偏特化兜底，并用静态断言把两层结果对齐 [推断]。

这一层有四个横切约束，决定验收方式 [标准]：

- `constexpr` 矩阵：同一类型在不同标准级别能力不同（如 `optional` 在 C++17/20/23 的差异），要按标准级别分别测，不能只测最新标准。
- 平凡性传播：`optional`、`variant`、`expected` 必须按元素或备选类型传播平凡复制与析构，否则容器与算法会放弃 `memmove` 一类优化，性能和 ABI 都受影响。
- 布局 ABI：`pair`、`tuple`、`optional`、`variant` 的 `sizeof` 决定容器布局与结构化绑定性能，发布后不能随意改。
- 编译期成本：`tuple`/`variant`/`visit` 的模板实例化可能爆炸；自研实现应按「一个组件一个内部头」切分，避免每个工具头都拉入整棵 traits 依赖树 [推断]。

无 RTTI 构建是这层的隐藏分支：`<any>` 需要退化方案，libc++ 用 `__get_fallback_typeid` 在无 RTTI 时改用函数地址做类型标识（`any:182-192`），MSVC 用 `type_info` 指针加表示模式位、空值时返回 `typeid(void)`（`any:167-175、249-256`）[实现]。`type_index` 与 `dynamic_cast` 在无 RTTI 下不可用，配置层应给出明确错误，而不是让错误在模板深处变成晦涩的编译信息 [推断]。

实现顺序：`<type_traits>` 与 `<concepts>` 是所有模板的底座，必须先完成；随后 `<limits>`/`<compare>`/`<bit>`/`<utility>`/`<tuple>`；`<optional>`/`<variant>`/`<expected>` 可以在容器之后补。`<system_error>` 是 I/O 与文件系统的前置，但要避免与 `<stdexcept>` 的循环依赖；`tuple` 的分配器感知构造依赖 `uses_allocator`，这条路径要在写容器之前打通 [实现]。

### 3.4 L3 内存与分配

`<memory>` 是基础层最大的单体，也是分配器协议的唯一定义处。容器全部建立在这层之上，而它的子组件互相依赖：`allocator_traits` 依赖 `pointer_traits`，`shared_ptr` 依赖分配器与 `<exception>`，`uses_allocator` 依赖 `pair`/`tuple` 的构造路径，因此实现顺序不能按头文件排 [推断]。

| 组件 | 标准头 | 实现难点 | 优先级 |
| --- | --- | --- | --- |
| 分配器协议 | `<memory>` | `allocator_traits` 默认行为；有状态分配器传播；`constexpr` 分配（C++20）；过度对齐；`allocate_at_least` 的返回值要求 | 最小可用 |
| 指针工具 | `<memory>` | fancy pointer 支持；`to_address`；`pointer_traits` 的 `element_type` 推导与 `rebind` 配合 | 最小可用 |
| `unique_ptr` | `<memory>` | 空 deleter 的零开销（EBO）；数组特化；转换构造；`constexpr` 析构；指针大小等于裸指针 | 最小可用 |
| 未初始化算法 | `<memory>` | 异常安全（销毁已构造前缀）；`constexpr`；ranges 版本；与 `construct_at` 的边界 | 最小可用 |
| 生存期工具 | `<memory>` | `construct_at`；`start_lifetime_as`（C++23 可选能力，libstdc++ 在 `bits/stl_construct.h:284-317` 实现，受特性宏门控）；常量求值中的 placement new 限制 | 完整 |
| 对齐与地址工具 | `<memory>` | `align` 的重载；`assume_aligned` 的优化提示；`destroy_at`/`destroy`/`destroy_n` 与 `default_delete` 的分工 | 最小可用 |
| 共享所有权 | `<memory>` | 原子引用计数的内存序；弱计数与对象销毁顺序；控制块布局；aliasing 构造；`make_shared` 单次分配；`atomic<shared_ptr>` 依赖 16 字节原子或锁回退 | 完整 |
| 分配器感知构造 | `<memory>` | `uses_allocator` 四种构造形式；`pair`/`tuple` 特化；`constexpr` | 完整 |
| 作用域分配器 | `<scoped_allocator>` | 外层/内层分配器的传播组合；嵌套容器构造 | 可延后 |
| 多态内存资源 | `<memory_resource>` | 虚接口 ABI；池大小与对齐调优；`polymorphic_allocator` 的传播；MSVC 实现依赖 `<vector>`/`<mutex>`，须排在容器与并发之后 | 可延后 |

分配器协议在写容器之前必须固定，以下约束直接决定容器语义 [标准]：

- 容器与智能指针只能经 `allocator_traits` 访问分配器；直接调用 `a.allocate(n)` 会在 fancy pointer 或缺少成员的分配器上失败。
- `propagate_on_container_copy_assignment`、`propagate_on_container_move_assignment`、`propagate_on_container_swap` 决定赋值与交换行为；写错会「用 A 分配、用 B 释放」，属于未定义行为。
- 有状态分配器必须提供正确的 `operator==`；移动赋值时若分配器不相等且不可传播，容器只能逐元素移动。
- `constexpr` 分配要求 `allocate` 与 `deallocate` 在常量求值中成对出现；C++20 起 `new` 表达式可用于常量求值。
- 分配失败抛 `bad_alloc`；构造过程中抛异常必须回滚已构造元素并释放内存。

`shared_ptr` 是这层最集中的 ABI 风险点：引用计数的原子操作、控制块的虚函数表、原子计数宽度、`make_shared` 的单次分配布局都属于实现自由，三套实现互不兼容 [实现]。证据上，libstdc++ 的 `bits/shared_ptr_base.h` 用 `__gnu_cxx::__exchange_and_add_dispatch`（150-151 行），libc++ 的 `__memory/shared_count.h` 用 `__libcpp_atomic_refcount_increment`（28 行），MSVC 的 `_Ref_count_base`（`memory:1126`）里是 `_Atomic_counter_t _Uses`（`:1142`）。

关键约束：`shared_ptr` 的控制块与引用计数接口一旦发布不可改；分配器协议同样要先固定，容器层的赋值/交换语义全部继承自它。

实现顺序：`allocator`/`allocator_traits` → `pointer_traits` → `unique_ptr` → 未初始化算法与对齐工具 → `shared_ptr`/`weak_ptr` → `uses_allocator` → `scoped_allocator` → `memory_resource`。`memory_resource` 依赖容器与同步原语，只能收尾 [推断]。

### 3.5 L4 容器

容器是使用频率最高的组件，但实现难点主要不在数据结构，而在标准要求的边缘行为：分配器传播、异常安全、迭代器失效、`constexpr`、节点句柄、pmr 别名、加固断言。先定共性骨架（类型别名、构造族、分配器接口），再填数据结构；骨架错了，后面每个容器都要改 [推断]。

| 共性要求 | 标准要求 | 三家落点 [实现] |
| --- | --- | --- |
| 类型别名与 `get_allocator` | `value_type`、`allocator_type`、`size_type`、`difference_type`、`reference`、`const_reference`、`iterator`、`const_iterator` 必须齐全 | MSVC 用 `_Compressed_pair` 压缩空分配器；libstdc++ 以 `_Vector_base` 内嵌 `_Vector_impl`；libc++ 用 `__compressed_pair` |
| 分配器传播 | 由三个 `propagate_on_container_*` 与 `select_on_container_copy_construction` 决定，默认均为 `false_type` | 三个 traits 定义在 `<memory>` 的 `allocator_traits` 中，由容器按 traits 分支 |
| `erase`/`erase_if` | C++20 为序列、关联、无序容器提供自由函数 | MSVC 在各容器头内定义（`vector`、`list`、`map`、`set`、`unordered_*`、`flat_*` 均可检出）；libstdc++ 集中在 `bits/erase_if.h`；libc++ 在 `__iterator/erase_if_container.h` |
| pmr 别名 | 每个容器提供 `std::pmr::` 版本 | MSVC 各容器头包含 `xpolymorphic_allocator.h`；libc++ 以 `__vector/pmr.h` 一类文件拆分；libstdc++ 走 `bits/memory_resource.h` |
| node handle | 关联与无序容器提供 `node_type`、`extract`、`insert(node_type&&)`、`merge` | MSVC `xnode_handle.h`；libstdc++ `bits/node_handle.h`；libc++ `__node_handle` |

序列与关联容器：

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 定长数组 | `<array>` | 保持聚合体语义（不能加用户提供的构造函数）；`N == 0` 时 `begin() == end()` 且不产生零长数组；全成员 `constexpr`；`to_array` 需处理 `T` 为数组类型与 `remove_cv_t`；libstdc++ 直接实现于 `<array>` 头，没有 `bits/stl_array.h` | 最小可用 |
| 动态数组 | `<vector>` | 增长因子属实现自由：MSVC 的 `_Calculate_growth` 为 1.5 倍（`vector:2014-2027`），libstdc++ 的 `_M_check_len` 取 `size() + max(size(), n)` 即 2 倍（`stl_vector.h:2192-2199`），libc++ 取 `max(2 * cap, 8)`；强异常安全依赖 `move_if_noexcept` 与回滚，单元素插入与批量填充的回滚路径不同；`reserve` 不得缩容；`data()` 的 const 重载；`constexpr` 容器；迭代器失效规则需逐条落实 | 最小可用（第一个容器） |
| 位数组特化 | `<vector>`（`vector<bool>`） | 代理引用使 `reference` 不等于 `value_type&`；无 `data()`；`std::sort` 不可用；位迭代器需模拟随机访问；`flip` 与按字操作；MSVC 用 `_Vbase = unsigned int`、`_VBITS = 8 * sizeof(_Vbase)`（`vector:2269-2271`）；ABI 敏感 | 可延后 |
| 双端队列 | `<deque>` | MSVC 每块容纳 16/8/4/2/1 个元素（块约 16 字节）、映射长度为 2 的幂，用 `(Off / _Block_size) & (_Mapsize - 1)` 定位（`deque:550-572`）；libstdc++ 每块 512 字节（`bits/stl_deque.h:94-101`）；libc++ 取 `sizeof(T) < 256 ? 4096 / sizeof(T) : 16`，另有 512 字节块大小的 ABI 选项（`deque:267-271`）；迭代器 4 字段；中段插入的搬移量取两端较小者；map 增长时迭代器失效 | 完整 |
| 链表 | `<list>`、`<forward_list>` | 逐元素分配；`splice` 必须 O(1) 且不误用分配器；`sort` 用稳定归并（迭代器不失效）；`merge` 要求两边分配器兼容；`forward_list` 无 `size()`、所有修改需前置迭代器、`sort`/`merge` 用自底向上归并以适应单向遍历、`before_begin` 哨兵 | 完整 |
| 关联容器 | `<map>`、`<set>` | 红黑树，节点布局是 ABI 层的实现自由：MSVC 的 `_Tree_node` 以 `_Isnil` 标记空头节点、`end()` 靠右子树定位；libstdc++ 用 `_Rb_tree_node_base` 加颜色置红的 `_M_header`；libc++ 的 `__end_node` 只使用 `__left_` 回指根 [实现]；还有 `try_emplace` 不构造 value、`operator[]` 默认构造的异常安全、hint 插入均摊 O(1)、异构查找需 `is_transparent`、`erase` 只失效被删节点、比较器状态存放在树中、`multiset` 的 `equal_range` 语义、node handle | 完整 |

无序容器、适配器与视图：

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 无序容器 | `<unordered_map>`、`<unordered_set>` | 分离链接的桶数组加单链表；桶策略是差异最大的实现自由点：MSVC 用 2 的幂加掩码（`_Min_buckets = 8`、`_Mask = _Min_buckets - 1`，`xhash:299-311`），libstdc++ 用 `_Prime_rehash_policy` 取下一个素数（`bits/hashtable_policy.h:597`），libc++ 用 `__next_prime`（`__hash_table:79`）[实现]；rehash 只失效迭代器、引用与指针保持有效；`local_iterator` 的遍历；C++20 异构查找；node handle；`count` 的均摊 O(1) 存在最坏情形退化 | 完整 |
| 容器适配器 | `<stack>`、`<queue>` | 只暴露受限接口；`emplace` 返回 `decltype(auto)`（C++17 起）；底层容器可替换；`priority_queue` 依赖堆算法，`push`/`pop` 为 O(log n)，必须先有堆算法 | 最小可用（`priority_queue` 完整） |
| 扁平容器 | `<flat_map>`、`<flat_set>` | 排序 vector 加二分，键与值分存两个容器（默认 `vector<Key>` 与 `vector<T>`）；代理迭代器模拟 `pair<const Key&, T&>`；`containers()` 暴露可变引用后需重新校验不变量；`insert` 为 O(n)；`extract` 是值语义、无常量时间版本；无 node handle；`erase` 后按 vector 语义失效迭代器 | 可延后 |
| 连续视图 | `<span>`、`<mdspan>` | 借用语义；`mdspan` 的 layout mapping 与访问策略；不分配 | 完整（`span` 可前移） |
| 固定容量容器 | `<inplace_vector>`（C++26） | 固定容量、零分配；API 与 `vector` 的差异 | 可延后（前沿） |

迭代器失效规则必须逐容器落实，且与 `reserve`/`shrink_to_fit`/`rehash` 的实现选择绑定，这是测试最容易覆盖不全的部分 [标准]：

| 容器 / 操作 | 失效范围 [标准] |
| --- | --- |
| `vector` 扩容（`push_back`、`insert`、`resize` 超容量）、`reserve` | 全部迭代器、引用、指针失效 |
| `vector` 不扩容的 `push_back`/`emplace_back` | 仅 `end()` 失效，其余保持有效 |
| `vector::erase` | 被删位置及其后全部失效 |
| `array` | `swap` 后迭代器仍指向同一数组（内容交换） |
| `deque` 两端插入 | 迭代器失效，引用与指针保持有效 |
| `deque` 中段插入/删除 | 全部迭代器与引用失效 |
| `list`/`forward_list` | 仅被删元素失效 |
| 关联容器 | 仅被删元素失效；`insert` 不影响已有迭代器 |
| 无序容器 `rehash`/`reserve` | 迭代器失效，引用与指针保持有效；`insert` 触发 rehash 时同理 |

node handle 与分配器传播的交叉是本层最容易写错的部分 [标准]：

- `extract` 返回的 `node_type` 拥有节点，`insert(node_type&&)` 与 `merge` 只搬运不复制；`merge` 因目标已有等价键而失败时，节点留在源 node handle 里，`insert_return_type` 必须能携带 `node_type`。
- `extract` 后节点的分配器属于源容器，跨分配器 `insert` 只能复制元素、不能搬运节点；`propagate_on_container_swap` 为 `false` 时，不同分配器的容器 `swap` 是未定义行为，实现可在 hardening 下断言。
- `std::pmr::vector` 等别名是「容器 + `polymorphic_allocator`」的组合，容器本身不需要 pmr 特化，只需正确使用 `allocator_traits`；但 `polymorphic_allocator` 的传播语义会让 `swap` 与移动赋值的行为不同。

异常安全是容器骨架的一部分：`vector` 的强保证只在元素可移动或可复制时成立，批量 `insert` 的回滚顺序必须与构造顺序相反，三实现都用「先构造新段、再提交指针」的模式 [推断]。C++23 的 `from_range_t` 构造与 `assign_range`/`insert_range`/`append_range`/`prepend_range` 是容器对 range 概念的反向依赖，应实现在容器侧而不是 `ranges` 侧 [标准]。

调试与 hardening 是横切面，还会改变迭代器布局与 ABI [实现]：

- MSVC 用 `_ITERATOR_DEBUG_LEVEL`（0/1/2）加逐组件的 `_MSVC_STL_HARDENING_*`。
- libstdc++ 用 `_GLIBCXX_DEBUG`（Debug Mode，`debug/` 目录）；未优化构建下会自动定义 `_GLIBCXX_ASSERTIONS`（`c++config.h:603-610`），同一测试在 `-O0` 与 `-O2` 下行为可能不同。
- libc++ 用 `_LIBCPP_HARDENING_MODE`（`NONE`/`FAST`/`EXTENSIVE`/`DEBUG`），尽量不改变布局。

横切要求：每个容器都要通过「分配器传播矩阵」「异常安全等级」「迭代器失效规则」「`constexpr` 成员清单」「加固断言」五项验收；这些不是收尾工作，而是容器骨架的一部分。节点大小、是否用哨兵、迭代器 `sizeof` 一旦发布就不能改，必须与 ABI 策略一起定死 [推断]。

### 3.6 L5 迭代器与算法

迭代器协议是泛型编程的核心：容器产出迭代器，算法消费迭代器，`ranges` 再在其上抽象。先把迭代器协议定对，容器与算法才能独立演进。C++17 的 `iterator_category` 五分类与 C++20 的 `iterator_concept` 两套描述体系必须共存，不能二选一 [标准]。

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 迭代器协议 | `<iterator>` | `iterator_traits`（用户特化优先于自动推导，保留指针与 `void` 特化）、`iterator_concept`、C++20 迭代器概念（`input_iterator`…`random_access_iterator`、`contiguous_iterator`）、`indirectly_readable`/`indirectly_writable`/`permutable`/`mergeable`/`sortable`；`iter_swap`/`iter_move` | 最小可用 |
| 迭代器适配器 | `<iterator>` | `reverse_iterator`（底层须双向，`operator->` 经 `pointer_traits`）、`move_iterator`/`move_sentinel`（`operator*` 返回右值引用）、插入迭代器族（`*it = v` 与 `it = v` 都要生效）、`istream_iterator`/`ostream_iterator`（单遍、依赖 I/O 层）、`counted_iterator`（配 `default_sentinel_t`）、`common_iterator`（用 `variant` 存迭代器或哨兵） | 完整 |
| 非修改算法 | `<algorithm>` | `all_of`/`find`/`count`/`mismatch`/`equal`/`search` 等；谓词按值复制；`for_each` 返回函数对象（C++11 起）；投影 | 最小可用 |
| 修改算法 | `<algorithm>` | `copy`/`move`/`fill`/`transform`/`remove`/`unique`/`replace`/`rotate`/`shuffle`；重叠范围要区分 `copy` 与 `copy_backward`；`remove` 的返回值语义；`shuffle` 依赖均匀随机数 | 最小可用 |
| 排序与选择 | `<algorithm>` | 内省排序与插入排序阈值是实现自由；`stable_sort` 需要临时缓冲，缓冲不足时退化为原地归并；`partial_sort`；`nth_element` 平均线性；比较器必须严格弱序 | 最小可用（`sort` 是分水岭） |
| 二分与堆 | `<algorithm>` | `lower_bound`/`upper_bound`/`equal_range` 只要求前向迭代器，比较器须与容器排序一致；`make_heap`/`push_heap`/`pop_heap`（`priority_queue` 的前置，必须先完成） | 最小可用（堆可前移） |
| 其他算法 | `<algorithm>` | 排列、分区、集合操作、采样、`shift_left`/`shift_right`、`lexicographical_compare_three_way`；C++23 新增 `ranges::contains`/`starts_with`/`ends_with`/`fold_left`/`fold_right`；C++20 起 `constexpr` | 完整 |
| 数值算法 | `<numeric>` | `accumulate`；`reduce`（要求结合律与交换律，允许乱序归约）；`transform_reduce`（双函数重载）；`inclusive_scan`/`exclusive_scan` 及 transform 版本；`iota`/`ranges::iota`；`partial_sum`；`adjacent_difference`；`gcd`/`lcm`/`midpoint`（防溢出）；并行版本 | 完整 |
| 执行策略 | `<execution>` | 四类策略对象（`seq`/`par`/`par_unseq`/`unseq`）；后端可替换：MSVC 走 Windows 线程池、libstdc++ 的 PSTL（TBB 或 serial）、libc++ 的 `__pstl` 后端 | 可延后 |
| 并行算法 | `<algorithm>` 并行重载 | 后端接入；`par` 下未捕获异常必须导致 `std::terminate`；`par_unseq` 下调用同步函数是未定义行为；标准允许串行降级，先串行后并行是合法分期 | 可延后 |

迭代器层的几个实现细节值得单独列出 [实现]：

- `iter_move`/`iter_swap` 是定制点对象：MSVC 在 `xutility:993-1066` 的 `_Iter_move` 命名空间内显式删除 `iter_move()` 以阻止无限定查找，libstdc++ 与 libc++ 同样把 ADL 与 CPO 查找隔离；代理引用下 `iter_move` 的右值语义与 `noexcept` 传播是易错点。
- `basic_const_iterator`（C++23）把任意迭代器包成常量迭代器；MSVC 用 `conditional_t` 按需选择（`xutility:2358-2361`），对已是常量迭代器的类型不再重复包装；主要难点在它与 `common_reference`、`iter_move` 的交互。
- 迭代器表示决定 `contiguous_iterator` 判定与 ABI：libstdc++ 用 `__normal_iterator`（`bits/stl_iterator.h:1026`），libc++ 用 `__wrap_iter`（`__iterator/wrap_iter.h`），MSVC 用 `_Vector_iterator`；Debug 模式再包一层（libstdc++ 的 `__gnu_debug::_Safe_iterator`）。
- 迭代器协议冻结得太晚是全项目最大风险：`iterator_concept` 与 `iter_move`/`iter_swap` 一旦定错，容器、算法、`ranges` 三处同时返工 [推断]。

算法层的难点不在单个函数，而在分派、编译期成本与并行后端 [实现]：

- `<algorithm>` 是本层最大的单头：MSVC 的 `algorithm` 576 KB；libstdc++ 拆成 `bits/stl_algobase.h`、`bits/stl_algo.h`、`bits/stl_heap.h`；libc++ 的 `__algorithm/` 有 209 个文件，一算法一文件；分派方式正从标签分派迁到 `if constexpr`。
- `constexpr` 双路径：常量求值下不能调用 `memmove` 一类内建，必须手写循环；同一函数的两条路径行为必须一致 [标准]。
- ranges 版本落点：libstdc++ 单独出 `bits/ranges_algo.h` 等头，libc++ 以 `ranges_*.h` 与经典版并列，MSVC 在同一 `algorithm` 头内用 `namespace ranges` 定义（该头中 `namespace ranges` 出现 108 次）。ranges 算法统一返回 `in_fun_result`/`in_out_result`/`min_max_result` 等聚合（libstdc++ 的 `in_in_result` 在 `bits/ranges_util.h:607`），以 `sortable`/`permutable` 约束并要求支持投影，与经典重载放在不同命名空间以避免重载决议互相干扰 [标准]。
- 比较器、投影与 `invoke`：ranges 算法要把 `invoke(proj, *it)` 贯穿每个比较点，并保持 `noexcept` 传播 [标准]。
- 执行策略实现差异：MSVC 在头内直接调用 Windows 线程池（`__std_create_threadpool_work`、`__std_submit_threadpool_work`），并带 `_Oversubscription_multiplier = 32` 一类调参常量；libstdc++ 把并行实现隔离在 `pstl/`（`parallel_backend_tbb.h`、`parallel_backend_serial.h`），启用 TBB 才有并行；libc++ 在 `__pstl/backends/` 提供默认、串行与静态分区后端；后端还要处理资源耗尽（MSVC 的 `_Parallelism_resources_exhausted`）。

实现顺序：迭代器 traits/概念 → 基础算法 → 堆算法（供 `priority_queue`）→ 排序 → 其余算法 → 执行策略与并行后端。C++20 之后算法还要接受 `ranges` 版本复用同一内核；并行部分先保证串行路径正确，再接后端。

### 3.7 L6 `ranges`

`<ranges>` 把「算法 + 视图」从迭代器对扩展为 range 一等公民。它不是独立数据结构，而是概念、视图与适配器的组合层。它依赖 `<concepts>`、`<iterator>`、`<compare>`、`<tuple>`、`<optional>`，整体应在概念与算法稳定后再动工，但只读视图部分要被文本与 I/O 的下游组件使用，不能整体留到最后 [推断]。

| 组件 | 关键内容 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| range 概念 | `range`、`view`、`borrowed_range`、`sized_range`、`common_range`、`viewable_range`、`constant_range`（C++23） | 概念组合与诊断；与迭代器概念对齐；`constant_range` 要求迭代器只读 | 完整 |
| 视图基础 | `ref_view`、`owning_view`、`subrange`、`view_interface`、`dangling` | 生命周期语义；`views::all` 对左值 range 产 `ref_view`、对右值 range 产 `owning_view`，直接决定结果是否 `borrowed_range`；`dangling` 是纯编译期机制，无运行时成本 | 完整 |
| 视图工厂 | `iota`、`repeat`（C++23）、`empty`、`single`、`basic_istream_view`、`subrange`、`cartesian_product`（C++23） | 惰性求值与缓存策略；`subrange` 同时是工厂与视图 | 可延后 |
| 视图适配器 | `filter`、`transform`、`take`/`take_while`、`drop`/`drop_while`、`join`/`join_with`、`split`/`lazy_split`、`reverse`、`zip`/`zip_transform`、`enumerate`、`chunk`/`chunk_by`、`slide`、`stride`、`common`、`counted`、`elements`/`keys`/`values`、`as_rvalue`、`concat` | 迭代器/哨兵配对；`common_view` 的代价来自包装；view 必须 `movable` 且满足 `enable_view`，适配器还要求底层是 view 或 `viewable_range`；嵌套视图的编译期成本 | 可延后 |
| range 算法 | `<algorithm>` 的 `ranges::` 重载 | 投影；返回类型（`in_fun_result` 等）；与经典算法共用内核；额外要求 `sortable`/`permutable`、支持哨兵与 `borrowed_range` 返回 | 完整 |
| 构造适配 | `ranges::to`（C++23）、`from_range_t` 构造、`insert_range` | 按 `from_range_t` 构造、`insert_range`、`reserve`/`insert` 的可用性做 SFINAE 分派；嵌套 range 的递归推导、分配器透传与极长的错误信息 | 可延后 |

- 依赖方向有直接证据：libstdc++ `<ranges>` 的 include 列表为 `<concepts>`、`<compare>`、`<initializer_list>`、`<iterator>`、`<optional>`、`<span>`、`<string_view>`、`<tuple>`，C++23 分支再加 `<utility>` 与 `<variant>` [实现]。
- 视图机制：`view_interface` 是 CRTP 基类，按可用性提供 `empty`/`size`/`data`/`front`/`back`/`operator bool`（MSVC 放在 `xutility`，用 `_MSVC_STL_HARDENING_RANGES_VIEW_INTERFACE` 控制越界检查；libstdc++ 在 `bits/ranges_util.h`）；`movable-box`（C++23，libc++ `__ranges/movable_box.h`）包装不可默认构造或不可复制的 view；`filter_view`/`join_view` 用 `non_propagating_cache` 缓存 `begin()`，赋值与交换不传播缓存值 [实现]。
- 生命周期诊断：把临时容器交给 `views::all` 后保存 view 是最常见的悬垂来源；标准只约束 `viewable_range`，实现只能在 hardening 下加断言 [推断]。
- `ranges::to` 的落点：MSVC `__msvc_ranges_to.hpp`（56 KB）；libstdc++ 在 `<ranges>` 内（`ranges:9593-9713`）；libc++ `__ranges/to.h` [实现]。

编译期成本是本层主要负担：MSVC 的 `<ranges>` 头约 413 KB，libstdc++ 的 `<ranges>` 10720 行，libc++ 的 `__ranges/` 有 50 余个文件 [实现]。如果目标包含 `<format>` 的 range 格式化与 C++23 容器 range 构造，`ranges` 不能整体延后到最后；但视图层可先只落只读部分 [推断]。

### 3.8 L7 文本与格式化

文本层是标准库使用频率最高的部分，也是 ABI 风险最集中的部分（`std::string` 的 SSO 布局、`std::string_view` 的生命周期语义）。这一层还有一条容易被忽略的硬依赖：`<format>` 的浮点输出直接复用 `<charconv>` 的 `to_chars`，`<charconv>` 的正确性缺陷会原样传导到格式化结果 [实现]。

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 字符串 | `<string>` | `basic_string` 的 SSO/COW 布局（ABI 敏感）；`char_traits` 与 `mbstate_t`；`pmr::string` 别名；`stoi`/`stod`/`to_string`；`operator""s`；`getline`；`hash` 特化；C++20 起 `constexpr`，`resize_and_overwrite` 与 `operator+` 的分配次数是常见缺陷点 | 最小可用 |
| 字符串视图 | `<string_view>` | 非拥有语义；`starts_with`/`ends_with`/`contains`；`hash` 特化；与 `string` 的零成本互转 | 最小可用 |
| 字符特性 | `<string>` | `char_traits<char>`/`wchar_t`/`char8_t`/`char16_t`/`char32_t` 的 `length`/`compare`/`find`/`assign`/`copy`/`move`；`pos_type`/`state_type`；`char8_t` 特化与 `<text_encoding>` 是 C++20 之后的新面 | 最小可用 |
| 数值与文本互转 | `<charconv>` | 整数 `to_chars`/`from_chars`（`base` 支持）；浮点 shortest 的可往返表示与正确舍入的 `from_chars`；无分配、`noexcept`、不受 locale 影响；缓冲不足、`-0`、`inf`/`nan`、次正规数 | 最小可用（先整数与 `double`） |
| 格式化 | `<format>` | `basic_format_string` 的 `consteval` 校验；`format_args`/`format_context`；`formatter` 特化与 `range_formatter`；Unicode 宽度表；locale 变体 | 完整 |
| 打印 | `<print>` | `print`/`println`；`FILE*` 输出；Unicode 控制台能力探测；`vprint_unicode`/`vprint_nonunicode` | 可延后 |
| 编码识别 | `<text_encoding>`（C++26） | 平台字符集名映射；`id` 与 `name()`；依赖平台 API；libstdc++ 16 与 libc++ 都报 `__cpp_lib_text_encoding 202306`，MSVC 未定义该宏 [实现] | 可延后（前沿） |
| 本地化文本 | `<locale>`、`<codecvt>` | 见 §3.9；`string` 的数值转换与大小写折叠依赖 locale facet | 完整 |
| 正则 | `<regex>` | ECMAScript 语法解析与匹配引擎；locale 相关 `collate`；模板实例化成本高 | 可延后 |

这一层的关键实现集中在「文本与数值互转」上，三家的落点与链接模型不同 [实现]：

| 落点 | MSVC STL 14.51 | libstdc++ 16 | libc++ 24 trunk |
| --- | --- | --- | --- |
| 浮点 `to_chars` | `xcharconv_ryu*.h` + Ryu 表在头文件 | `src/c++17/ryu/`，实体在 `floating_to_chars.cc` | `src/charconv.cpp` + `src/ryu/{d2s,d2fixed,f2s}.cpp`，编进 dylib |
| 浮点 `from_chars` | `charconv` 头内 header-only（`_Assemble_floating_point_*`） | fast_float（`src/c++17/fast_float/`，带 `LOCAL_PATCHES`/`MERGE`） | `src/include/from_chars_floating_point.h`，编进 dylib |
| `format` 常量检查 | `basic_format_string` 的 `consteval` 构造（`format:2939`） | `format:172-181` | `__format/format_arg_store.h` 的 `consteval __determine_arg_t` 一族 |
| Unicode 数据表 | `tools/unicode_properties_parse/` 生成 | 构建期生成并入库 | `utils/generate_width_estimation_table.py` 等 4 个脚本 |
| `string` 布局 | `xstring` | SSO 与旧 COW 两套（`src/c++11/sso_string.cc`/`cow-string-inst.cc`，由 `_GLIBCXX_USE_CXX11_ABI` 选择） | `__string/` |

关键点：`<string>` 的布局一旦发布就是 ABI。三家的 `string` 在 `sizeof`、SSO 阈值、是否 COW 上互不兼容 [实现]，自研实现必须在「布局简单、可预测」与「SSO 性能」之间先做选择，并写进 ABI 政策。可观察约束只有几条：迭代器/引用失效规则、`c_str()`/`data()` 的 null 终止、C++20 起 `reserve(n)` 不再缩容（P0966R1）、`shrink_to_fit` 只是非强制请求；SSO 阈值本身属实现选择 [标准]，验收时把 SSO 边界与 `sizeof` 固定进 ABI 清单。缺陷高发区是 `substr` 的分配器传播、`operator+` 的分配次数与 `constexpr` 路径 [推断]。

浮点转换的工程分工值得单独说明：三家浮点 `to_chars` 同源，都来自 Ulf Adams 的 Ryu（Apache-2.0/BSL-1.0 双许可，发行时必须保留版权与许可声明）[实现]；接口相同、链接模型不同（见上表），会直接影响 ABI 与库分发方式。`<format>` 自身的难点不在接口，而在编译期检查与数据表：格式串检查必须在常量求值阶段完成（[format.fmt.string]），因此 `basic_format_string` 的构造是 `consteval`，三家都遵守；宽度、精度、填充、对齐、`#`/`0`/符号与 `L` 本地化逐条规定，显示宽度依赖 Unicode 属性，UCD 表必须由离线脚本生成并纳入构建链；`vformat` 的类型擦除参数包与栈上缓冲、`formatter` 特化的编译期成本、`wformat` 与 `char8_t` 的转码是主要难点，任一环节都需要大量测试 [推断]。

文本层的验收应覆盖以下边界：

- `charconv`：全量 binary32 往返、binary64 抽样；次正规、极值、`-0`、`inf`/`nan`、`hex`；缓冲不足时不写入；`printf("%.17g")` 不能作为正确性基准，因为它不做最短化。
- `format`：非法格式串在编译期被拒绝；宽度/精度/填充/对齐/符号组合；Unicode 显示宽度；`L` 本地化变体。
- `print` 与 `<text_encoding>`：控制台编码探测失败时的降级路径；`text_encoding` 只做平台名映射，不承诺自动转码。

### 3.9 L8 I/O、文件系统与本地化

I/O 层是「头文件 + 编译库」分工最明显的层：流模板在头文件，`ios_base`、`locale`、`filebuf` 等非模板实体与平台交互在编译库。`<filesystem>` 的关键是平台抽象：MSVC 用一组 `extern "C"` 的宽字符 Win32 ABI（`__std_fs_*`），libstdc++ 分为 `fs_path`（纯字符串）与 `fs_ops`（POSIX），libc++ 同样把路径解析与系统操作分离，并用 `posix_compat.h`/`path_parser.h` 隔离平台差异 [实现]。

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 流基座 | `<iosfwd>`、`<ios>`、`<streambuf>` | `ios_base` 的状态/格式/回调/`iword`/`pword`；`basic_streambuf` 的 `underflow`/`uflow`/`overflow`/`seekoff`/`sync`/`imbue` 虚接口；`ios_base::Init` 与标准流初始化顺序 | 最小可用 |
| 输入输出流 | `<istream>`、`<ostream>`、`<iostream>` | `sentry`、格式化/解析路径；`num_get`/`num_put` 等 facet 的接线；`sync_with_stdio`；locale 属于 `basic_ios`，`streambuf` 只接收 `imbue` 事件 [标准] | 最小可用 |
| 操纵符 | `<iomanip>` | `setw`/`setprecision`/`setfill`/`setbase`；`quoted`；`put_time`/`get_time`/`put_money`；`num_put` 与 `width`/`fill`/`adjustfield` 的交互 [推断] | 完整 |
| 文件流 | `<fstream>` | `basic_filebuf` 基于 `<cstdio>` 或 OS 文件 API；`openmode` 到系统模式的映射（`ate`/`trunc`/`binary` 组合）；`seekoff`/`seekpos` 的失败方式；`sync()` 的刷新语义；`filesystem::path` 重载 | 完整 |
| 字符串流 | `<sstream>`、`<spanstream>`、`<strstream>` | `stringbuf`/`spanbuf`；`view()`；`str()` 与 `in`/`out`/`ate` 打开模式的交互；`strstream` 为弃用头，`freeze` 语义 | 最小可用（`sstream`）；其余可延后 |
| 同步输出 | `<syncstream>` | `basic_syncbuf`/`basic_osyncstream`；`emit()` 相对其他 `osyncstream` 的原子性与顺序；与 `mutex` 协作；MSVC 用虚分派把 `emit` 做成可覆盖点 [实现] | 可延后 |
| 路径 | `<filesystem>` | `path` 的平台 `value_type`（Windows `wchar_t`、POSIX `char`）；`lexically_normal`/`relative`；编码转换；MSVC 的 ABI 层以宽字符与 `__std_fs_max_path = 260` 为上限，长路径需实现自行加 `\\?\` 前缀 [实现] | 完整 |
| 目录与操作 | `<filesystem>` | `directory_iterator`/`recursive_directory_iterator`；`status`/`perms`/`space`；复制、改名、删除；`error_code` 重载；`file_time_type` 的自定义 epoch 与 `last_write_time` 互操作 [推断] | 完整 |
| 本地化 | `<locale>` | facet 体系（`ctype`/`numpunct`/`moneypunct`/`collate`/`time_put`/`time_get`/`codecvt`）；locale 数据来源；`imbue`；`locale::global` 影响 `std::cout` 等全局对象；`use_facet` 抛 `bad_cast` [标准] | 完整 |
| 正则 | `<regex>` | 语法解析、匹配引擎、替换；与 locale 的交互；标准不保证线性时间，回溯风险需在文档中声明 [标准] | 可延后 |

流实体的落点与平台层如下 [实现]：

| 落点 | MSVC STL 14.51 | libstdc++ 16 | libc++ 24 trunk |
| --- | --- | --- | --- |
| 流基座实体 | `ios_base` 与 `basic_ios` 分离，状态位由 `_Iosb<int>` 承载，非模板实体在 STL DLL | 标准流与初始化在 `src/c++98/globals_io.cc`、`ios_init.cc`，实例化在 `src/c++11/*-inst.cc` | `src/ios.cpp`、`src/iostream.cpp`、`src/ostream.cpp` 进 dylib |
| 文件流后端 | `basic_filebuf` 建在 `<cstdio>` 之上（`__msvc_filebuf.hpp`） | `bits/fstream.tcc` + `src/c++11/fstream-inst.cc` | `fstream` + `src/fstream.cpp` |
| 路径与操作 | `__std_fs_*` 宽字符 ABI，`__std_fs_max_path = 260` | `bits/fs_path.h`/`fs_ops.h` 分离，`src/filesystem/*.cc` | `__filesystem/*` + `src/filesystem/{path,operations,directory_iterator}.cpp` |
| locale 数据 | UCRT/Windows NLS（`_Getctype`/`_Getdays`） | glibc locale + `newlocale`/`setlocale` | `locale_base_api`（BSD `*_l` 函数、IBM z/OS），`src/locale.cpp` |
| `regex` 规模 | 单头 | 12 个文件约 8 431 行 + `src/c++11/regex.cc` | 单头约 5 874 行 + `src/regex.cpp` 401 行 |

iostream 是 ABI 负担最重的组件：MSVC 在 `__msvc_filebuf.hpp` 头部注释明确记录，给 iostreams 加成员函数会破坏「派生并 `__declspec(dllexport)` 的 DLL」的 ABI，因此接受 `filesystem::path` 的重载被做成模板绕开 [实现]。结论是 `basic_ios`/`basic_streambuf` 的数据成员必须在首个版本前定死；locale 与 streambuf 的耦合点只有 `basic_ios::imbue` 一处，`num_put`/`num_get` 从 `ios_base::getloc()` 取 facet，`basic_streambuf` 本身不持有 facet [标准]。`codecvt` 自 C++17 起弃用但三家仍提供，`basic_filebuf` 的宽字符路径不应作为新设计依据。

本地化数据是这层最容易低估的组件：MSVC 的 facet 数据直接来自 UCRT/NLS（`xlocinfo` 转调 `_Getctype`/`_Getdays`），libstdc++ 依赖 glibc locale 数据并在数值转换前切到 C locale（`__uselocale(_S_get_c_locale())`），libc++ 把平台 API 抽成 `locale_base_api` 再在头文件实现 facet [实现]。locale 数据是 OS 资产，三家都复用而非自带；若要「自带全套 locale 数据」，等同引入 ICU 量级的数据与维护成本，应作为独立产品决策；数据源选择直接决定行为一致性与可移植性。facet 缓存需自带锁，`num_get` 的分组/小数点/指数状态机与 `num_put` 的填充/对齐交互是错得最多的两处 [推断]。

I/O 与本地化的验收边界：

- 流状态机：`width()` 只作用于下一次输出、`exceptions()` 掩码的抛出时机、`tie()->flush()`、`sentry` 构造顺序逐条对照标准。
- 文件流：`openmode` 到系统模式的组合、`seekoff`/`seekpos` 的失败方式、`sync()` 刷新、`filebuf` 的 `pbackfail`/`overflow` 边界。
- 文件系统：符号链接与 `symlink_status`、`copy` 的递归/覆盖规则、`canonical` 的失败条件、Windows 长路径。

### 3.10 L9 数值、时间与随机

计算型设施的共同点是「标准只规定语义、实现自由很大」，差异集中在精度、数据源与平台时钟；这一层也是外部数据（tzdata、libm）与库代码耦合最紧的地方 [推断]。

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 数学函数 | `<cmath>`、`<numbers>` | 超越函数精度；特殊值（NaN/Inf/-0）；与平台 libm 的差异；数学常数必须正确舍入到目标类型；`std::` 重载集合含 `float`/`long double` 版本 [标准] | 最小可用 |
| 复数与数值数组 | `<complex>`、`<valarray>` | `complex` 的布局被「按 `T[2]` 访问」的约定钉死为两个 `T` [标准]；`valarray` 的切片（`slice`/`gslice`/`mask_array`）与表达式模板；libstdc++ 用 `__complex__` 内建与 `__builtin_c*`，MSVC/libc++ 为纯 C++ 实现 [实现] | 完整（`complex` 可前移） |
| 随机 | `<random>` | 引擎（LCG、MT19937、ranlux 等）的状态转换与输出序列由标准逐位规定；分布只规定输出分布；`seed_seq`；`random_device` 的熵源 | 完整 |
| 时间 | `<chrono>` | `duration`/`time_point`/时钟；C++20 日历与 `tzdb`；与 `<format>`/`<locale>` 的格式化；时区数据来源与更新 | 完整 |
| 数据并行 | `<simd>`（C++26） | 数据并行类型；与内建向量类型的映射；可移植性 | 可延后（前沿） |
| 线性代数 | `<linalg>`（C++26） | 基于 `mdspan` 的 BLAS 接口；后端实现选择 | 可延后（前沿） |

时钟、时区与熵源的三家落点 [实现]：

| 落点 | MSVC STL 14.51 | libstdc++ 16 | libc++ 24 trunk |
| --- | --- | --- | --- |
| 稳态时钟 | `steady_clock` 包 `QueryPerformanceCounter`（`__msvc_chrono.hpp:672`），UCRT 提供 `_Query_perf_counter`/`_Query_perf_frequency` | OS 时钟 API | `__chrono/*` 平台分支 |
| 时区数据 | `__std_tzdb_*` ABI 层，错误枚举保留 `_Icu_error` | `#embed` 内嵌 `tzdata.zi`（2026f，105 015 字节），默认 `/usr/share/zoneinfo`，弱符号 `zoneinfo_dir_override` 可覆盖 | `src/experimental/tzdb.cpp`，硬编码 `/usr/share/zoneinfo/`，受实验开关门控 |
| 随机熵源 | OS 熵源 | `__x86_rdrand`/`__x86_rdseed_rdrand`/`__libc_getentropy` 多后端 | `src/random.cpp` 平台分支 |

时间与随机的工程量主要在「标准之外」：`<chrono>` 的重点是 C++20 的日历与时区（`tzdb`），而不是 `duration` 算术；日历字段合法性与 `ok()`、`sys_days`/`local_days` 换算、`zoned_time` 对 DST 歧义/不存在时刻的处理都有明确规定 [标准]。`system_clock` 的 epoch 与精度（Windows FILETIME 100 ns 对 POSIX ns）、`file_clock` 的自定义 epoch 与 `filesystem::last_write_time` 的互操作是跨层易错点 [推断]。

时区数据源的差异会直接决定「库能否在不装时区文件的容器里工作」，也决定 `locate_zone` 结果的可复现性：要跨机器一致，必须自带数据快照（libstdc++ 的 `#embed` 做法）或锁定 OS 数据版本 [推断]。这条决策应在项目初期定下，晚改会牵动 ABI 与安装包。

随机实现的可验证部分比接口多：LCG 参数、MT19937 的 twisting、`discard_block` 的丢弃规则必须与标准给的参考输出逐位一致；分布只要求输出分布正确，因此 `uniform_int_distribution` 的无偏拒绝采样与 `min()`/`max()` 边界、`discrete_distribution` 的别名表、`seed_seq` 的生成步骤都是实现自由但必须自测 [标准]。`complex<T>` 的布局被「按 `T[2]` 访问」的 ABI 约定钉死为两个 `T`，三实现一致；`valarray` 的表达式模板不是标准要求，但决定它是否可用 [推断]。

数值、时间与随机的验收边界：

- `chrono`：`system_clock`/`steady_clock` 的 epoch 与单调性来源；`file_time_type` 与 `last_write_time` 互操作；DST 歧义、不存在时刻与闰秒。
- `random`：引擎参考输出逐位比对；分布统计检验；`random_device` 在无熵源平台的降级策略。
- `<numbers>`/`<cmath>`：常量正确舍入；特殊值与平台 libm 差异。

### 3.11 L10 并发与执行

并发层几乎没有算法，复杂度全在「OS 原语 + 内存序 + 等待/通知」的封装，以及这些原语对 ABI 的反向约束 [推断]。

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 原子 | `<atomic>` | `atomic<T>` 的 `is_always_lock_free`、对齐与填充进 ABI；`atomic_flag`；内存序与 `compare_exchange` 的双内存序；`atomic_ref`；`atomic<shared_ptr>`/`atomic<weak_ptr>` 依赖平台 16 字节原子或锁回退；`atomic::wait`/`notify` | 完整 |
| 线程 | `<thread>` | `thread`/`jthread`（停止令牌集成）；线程局部存储；线程属性；OS 后端可选 | 完整 |
| 互斥与条件变量 | `<mutex>`、`<shared_mutex>`、`<condition_variable>` | `mutex`/`recursive_mutex`/`timed_mutex`；`shared_mutex`；`condition_variable`/`condition_variable_any` 的 OS 原语映射；`timed_mutex` 的时钟选择与写优先/读优先策略 [推断] | 完整 |
| 异步 | `<future>` | `future`/`promise`/`packaged_task`/`async`；共享状态的引用计数与异常传递；`future::get` 的移动语义；`async(launch::async)` 必须真正在新线程执行，返回的 future 在析构时阻塞 [标准] | 完整 |
| 同步原语 | `<semaphore>`、`<latch>`、`<barrier>` | 计数信号量；一次性闩锁；屏障的阶段推进与完成函数调用顺序 | 完整 |
| 停止令牌 | `<stop_token>` | `stop_source`/`stop_token`/`stop_callback`；与 `jthread`、`condition_variable_any` 集成；析构 join 与取消的竞态 [推断] | 完整 |
| 执行 | `<execution>` | senders/receivers（P2300）；调度器、`then`/`when_all`/`sync_wait`；与并行算法策略同名但语义不同；并行后端（TBB/PSTL）的链接模型 [推断] | 可延后（前沿） |
| 协程支撑 | `<coroutine>`、`<generator>` | 协程帧与 `generator` 的惰性求值；与 `ranges` 的集成；协程帧分配走 `operator new`，ABI 必须与编译器一致 | 可延后 |

原语封装层的三家落点 [实现]：

| 落点 | MSVC STL 14.51 | libstdc++ 16 | libc++ 24 trunk |
| --- | --- | --- | --- |
| 线程/互斥后端 | UCRT C11 threads（`_Thrd_*`/`_Mtx_*`/`_Cnd_*`，`xthreads.h` 带「TRANSITION, ABI」注释） | `__gthread` 抽象（pthread） | `__thread/support/*` 四个可切换后端（pthread/C11/Windows/external） |
| 原子操作 | `_Interlocked*` intrinsics + `xatomic.h` | `bits/atomic_base.h` + 平台原子内建 | `__atomic/*`（含 `clear_padding.h`、`to_gcc_order.h`） |
| 等待原语 | Win32 `WaitOnAddress`（1/2/4/8 字节直接路径）+ 间接表 | `syscall(SYS_futex, ...)`（`src/c++11/futex.cc`） | `syscall(SYS_futex, ...)`，`SYS_futex_time64` 兼容 + 全局表回退 |

并发的工程约束比其他层更强：OS 原语抽象（`pthread`/Win32/`futex`）、线程库依赖、原子 libcall（`libatomic`）、TSan 可测性、无异常构建下的错误处理。三实现都先把 OS 原语隔离在一层薄封装后，再实现 C++ 语义（超时、`cv_status`、递归计数）；反向依赖会让移植成本失控 [实现]。`<execution>` 的 senders/receivers（P2300）与并行算法策略共用头文件，但语义不同，应作为两个子组件排期。CI 矩阵要覆盖 TSan、无异常与无 gthread 的降级配置 [推断]。

`atomic::wait`/`notify` 是其中最容易被忽略的子组件：MSVC 对 1/2/4/8 字节走 `WaitOnAddress` 直接路径、其他宽度走间接表；libstdc++ 与 libc++ 用 `futex`，只有 4 字节 word 有原生等待，其他宽度需要上层回退（libc++ 的 `__atomic_wait_native` 与全局表回退），libstdc++ 另带 `futex_wait_bitset_op` 与 time64 分支 [实现]。等待原语的可用性会反过来约束锁与条件变量的实现方式，并让同一接口在非 4 字节类型上呈现不同的性能与退化路径。

并发类型的 ABI 影响常被低估：`std::thread` 内嵌 `_Thrd_t`/`pthread_t`，`mutex` 直接内嵌 `_Mtx_t`/`pthread_mutex_t`，大小与对齐随平台变；`atomic<T>` 的对齐与填充、`future` 的共享状态分配策略也进 ABI，跨实现不可能兼容 [推断]。可观察语义是测试断言的主要来源：`thread::join`/`detach` 的 `terminate` 条件、`mutex` 的所有权与 `unlock` 前置条件、条件变量的虚假唤醒与 notify 时机、`call_once` 失败后重试、`barrier` 的阶段推进与完成函数调用顺序 [标准]。

并发层的验收边界：

- 等待原语：4 字节与非 4 字节类型的 `wait`/`notify` 退化路径分别测。
- 内存序：`compare_exchange` 双内存序、`atomic_ref` 对齐要求、`fence` 与 `kill_dependency`。
- 线程语义：`join`/`detach`/析构、`jthread` 取消、`hardware_concurrency` 的稳定回答。

### 3.12 L11–L12 诊断、观测与 C 兼容

诊断与兼容层大多是「薄头 + 平台回调」，但它们决定错误路径的质量与 C 互操作的边界，也和异常模型、加固策略共用同一条终止路径 [推断]。

| 组件 | 标准头 | 实现要点与难点 | 优先级 |
| --- | --- | --- | --- |
| 异常层级 | `<stdexcept>` | 见 §3.1；`what()` 存储、跨 DSO 导出 | 最小可用 |
| 断言 | `<cassert>` | `assert` 宏与 `NDEBUG`；与 hardening 断言的边界 | 最小可用 |
| 错误码 | `<system_error>` | `error_category`/`error_code`/`error_condition`；跨 DSO 单例；`generic_category`/`system_category` | 完整 |
| 栈回溯 | `<stacktrace>` | 帧捕获、符号化、源码位置；依赖 `libunwind`/`libbacktrace`/平台接口；`current()` 是最佳努力，允许失败与空结果 [标准] | 可延后 |
| 调试支持 | `<debugging>`（C++26） | `breakpoint()`；与信号/调试器交互 | 可延后（前沿） |
| 契约 | `<contracts>`（C++26） | 契约断言与违约处理；与 hardening、`assert` 的关系 | 可延后（前沿） |
| C 兼容头 | 约 30 个 `<c*>` 与 `<*.h>` | 转发 C 头、`std` 命名空间导入、宏兼容；`<cstdint>` 宏、`<climits>` 值必须与编译器一致；`<cxxx>` 只要求名字进入 `std`，`<xxx.h>` 形式必须在全局 [标准] | 最小可用 |
| 弃用头 | `<ccomplex>`、`<ctgmath>`、`<cstdalign>`、`<cstdbool>`、`<ciso646>`、`<codecvt>`、`<strstream>` | 保留头与兼容别名；弃用告警策略 | 可延后 |

兼容层与回溯的三家落点 [实现]：

| 落点 | MSVC STL 14.51 | libstdc++ 16 | libc++ 24 trunk |
| --- | --- | --- | --- |
| C 头转发 | 先 `#include <stdio.h>` 再 `#undef` 宏，最后在 `_STD_BEGIN` 内 `using` | `namespace std { using ::fopen; }`，同名宏由 `#undef` 处理 | 平台差异收进 `__config_site`/`__configuration`，头只做 `using` 与补丁 |
| 栈回溯 | 模板在头文件，捕获/符号化在编译部分；`_Stacktrace_string_fill` 回调；ABI `__std_stacktrace_*` | 内置 libbacktrace，`backtrace-rename.h` 把符号重命名为 `__glibcxx_backtrace_*` | 未提供该头 |
| 断言/终止 | `_STL_VERIFY`/`_STL_ASSERT`，终止走 `_MSVC_STL_DOOM_FUNCTION` | `__glibcxx_assert` | `_LIBCPP_ASSERT` |

C 兼容层不是「最后补几个转发头」：`<cstdio>`/`<cstdlib>`/`<cstring>` 是 I/O、`charconv`、`filesystem` 的底层依赖，`<cstdint>`/`<climits>` 是 `<limits>`/`<bit>` 的事实来源，必须在早期至少提供最小实现。C 库本体不属于「从零实现」范围（否则要重写 CRT 与 libm），兼容层只做转发、`std` 命名空间整理与少量补齐；`strtod`/`snprintf` 应视为不可信依赖，它们的行为差异会渗进 `num_get` 与 `<format>` [推断]。

C 兼容头最容易踩的坑是宏污染：UCRT 的 `<stdio.h>` 把 `getc`/`getchar`/`putc`/`putchar` 等定义成宏，直接 `using ::getc` 无法编译，MSVC 的 `cstdio` 必须先 `#include <stdio.h>`、再 `#undef` 这些宏，最后在 `_STD_BEGIN` 里加 `using` [实现]；`<cmath>` 还必须在 `std` 中提供含 `float`/`long double` 的重载集合 [标准]。

栈回溯是平台边界最典型的组件：`current()` 是最佳努力，允许失败与空结果，`description`/`source_file` 可为空 [标准]；MSVC 用回调做类型擦除（DLL 侧不能依赖 `<string>` 的 ABI），libstdc++ 用符号重命名隔离第三方 libbacktrace，思路都是把平台依赖关进编译库 [实现]。它必须做成构建开关：无调试信息时退化为「只有地址」，且会拉入调试信息解析依赖，应排在诊断层的最后 [推断]。

诊断与兼容层的验收边界：

- 异常路径：`what()` 的内容与生命周期、跨 DSO 抛出、`bad_alloc` 与 `terminate` 路径。
- 栈回溯与弃用头：捕获上限、符号化失败降级；弃用告警策略与移除时间表。

---

## 4. 依赖顺序与实现批次

### 4.1 标准自身的强制包含关系

标准在每个头的 synopsis 中给出了强制包含（mandatory `#include`）。libc++ 维护的 `header_information.py` 从草稿 TeX 源码提取了这份关系，共 41 个头有强制依赖 [实现]（`~/src/llvm-project/libcxx/utils/libcxx/header_information.py` 的 `mandatory_inclusions` 表）。按它做拓扑分层，得到：

| 层级 | 头文件 | 说明 |
| --- | --- | --- |
| 第 0 层（无强制依赖） | `<cmath>`、`<compare>`、`<complex>`、`<concepts>`、`<cstdint>`、`<initializer_list>`、`<iosfwd>`、`<istream>`、`<ostream>`、`<streambuf>`、`<typeinfo>` | 这些头是其余头的下界；`<iosfwd>` 作为前向声明头是 I/O 层的关键解耦点 |
| 第 1 层 | `<algorithm>`、`<any>`、`<array>`、`<chrono>`、`<cinttypes>`、`<complex.h>`、`<coroutine>`、`<deque>`、`<filesystem>`、`<flat_map>`、`<flat_set>`、`<forward_list>`、`<functional>`、`<ios>`、`<iterator>`、`<list>`、`<map>`、`<memory>`、`<optional>`、`<queue>`、`<random>`、`<regex>`、`<set>`、`<stack>`、`<string>`、`<string_view>`、`<syncstream>`、`<system_error>`、`<tgmath.h>`、`<thread>`、`<tuple>`、`<typeindex>`、`<unordered_map>`、`<unordered_set>`、`<utility>`、`<valarray>`、`<variant>`、`<vector>` | 依赖第 0 层的 1–2 个头 |
| 第 2 层 | `<bitset>`、`<iostream>`、`<ranges>` | 依赖第 1 层；`<ranges>` 依赖 `<iterator>` 与 `<concepts>` |

这只是标准强制给出的下界，真实实现依赖更宽：容器依赖分配器与迭代器协议，`<format>` 依赖 `<charconv>` 与本地化，`<filesystem>` 依赖 `<system_error>`。因此实现顺序取「标准下界 + 实现实际依赖」的交集与并集。

### 4.2 建议实现批次

| 批次 | 交付物 | 依赖 | 完成判据 |
| --- | --- | --- | --- |
| 0 地基 | 配置层、语言支持头、C 基础头、构建系统、`ctest` 骨架 | 编译器/运行库 | 最小 TU 在 C++17/20/23/26 下编译通过；一个 `static_assert` 测试可运行 |
| 1 元编程与工具 | `<type_traits>`、`<concepts>`、`<limits>`、`<compare>`、`<utility>`、`<tuple>`、`<optional>`、`<variant>`、`<bit>`、`<bitset>`、`<functional>`、`<expected>` | 批次 0 | 每个类型的平凡性/`constexpr`/异常安全测试通过 |
| 2 内存与分配 | `<memory>`（分配器、智能指针、未初始化算法）、`<memory_resource>`、`<scoped_allocator>` | 批次 1 | 自定义分配器可注入所有容器；`shared_ptr` 引用计数有并发测试 |
| 3 迭代器与算法 | `<iterator>`、`<algorithm>`、`<numeric>` | 批次 2 | 迭代器概念/适配器齐全；算法有随机对照测试 |
| 4 容器 | `<array>`、`<vector>`、`<deque>`、`<list>`、`<forward_list>`、`<map>`、`<set>`、`<unordered_map>`、`<unordered_set>`、`<stack>`、`<queue>` | 批次 2、3 | 分配器传播、异常安全、迭代器失效测试通过 |
| 5 文本 | `<string_view>`、`<string>`、`<charconv>`、`<format>`、`<print>`、`<source_location>` | 批次 1–4 | 格式化正确性、数值往返、SSO/分配行为有测试 |
| 6 `ranges` 与视图 | `<span>`、`<ranges>`、`<mdspan>`、`<flat_map>`/`<flat_set>` | 批次 3–5 | 视图可组合、投影与 `borrowed_range` 语义测试通过 |
| 7 I/O 与文件 | `<iosfwd>`/`<ios>`/`<streambuf>`/`<istream>`/`<ostream>`/`<iostream>`/`<fstream>`/`<sstream>`/`<iomanip>`、`<filesystem>`、`<locale>`、`<regex>` | 批次 5 | 流状态机、本地化 facet、路径遍历测试通过 |
| 8 数值/时间/并发 | `<complex>`、`<valarray>`、`<numbers>`、`<random>`、`<chrono>`、`<atomic>`、`<thread>`、`<mutex>`、`<condition_variable>`、`<future>`、`<semaphore>`、`<latch>`、`<barrier>`、`<stop_token>` | 批次 2、5 | 并发测试可在 TSan 下通过；时区数据可加载 |
| 9 收尾与兼容 | `<stacktrace>`、`<debugging>`、C 头包装、弃用头、扩展（`<expected>`/`<generator>` 等按目标） | 全部 | 完整测试矩阵与 ABI 清单通过 |

### 4.3 排序原则

1. 先协议后实现：迭代器协议、分配器协议、`range` 概念必须先于使用它们的组件。
2. 先可测试闭环后广度：每批结束都要能跑测试；宁少做一层，不留下「写了但不可验证」的组件。
3. 横切关注点随批落地：异常安全、`constexpr`、分配器传播、加固断言不是收尾工作，每个批次都要覆盖。
4. 编译库与头文件库分开排期：`<format>`、`<filesystem>`、`<locale>`、`<stacktrace>` 等依赖编译源，需要先有库的构建与符号管理。
5. 按「被依赖度」而不是「名气」排期：`<iterator>` 与 `<memory>` 的优先级高于 `<format>` 与 `<ranges>`。

---

## 5. 工程与验证组件

库组件之外，还需要一套同等重要的工程组件。测试与验证是其中最大的单项工程，ABI 与加固决定二进制承诺，配置与构建决定可移植性，平台数据与发布流程决定能否长期维护。本节给清单与验收判据；三家实现的规模数据与逐项机制对照集中在 §7.1，不在此重复。

### 5.1 配置、构建与仓库

| 工程件 | 内容 | 验收判据 |
| --- | --- | --- |
| 配置层 | 平台/编译器探测、特性宏、标准模式门控、ABI 命名空间、加固开关（三家落点见 §3.2） | 配置头单独成目录，每个公共头第一行包含它；一个最小 TU 在 C++17/20/23/26 下都能编译 |
| 目录布局 | `include/`（公共头）、内部实现头目录、`src/`（编译源）、`test/`、`benchmarks/`、`docs/`、`cmake/` | 公共头与内部头物理分离，防止用户依赖内部头 |
| 构建系统 | CMake + Ninja（可保留 autotools 兼容层）、静态与动态库、模块构建、交叉编译、安装与导出 | 一条命令构建全部目标；`std.cppm`/`std.compat.cppm` 等价物可生成并安装；下游可用 `find_package` 或 pkg-config |
| 运行库绑定 | 异常展开、`type_info`、`operator new`/`delete`、原子 libcall、协程栈的所有权 | 复用现成运行库（如 `libc++abi`、`libsupc++`、`vcruntime`）还是自研要显式决定；静态/动态链接方式会传导到 ABI 与分发 |
| 构建卫生 | `-Werror`、头文件自包含、双包含保护、依赖方向检查 | 公共头可单独包含、不依赖包含顺序；libc++ 用 `double_include.gen.py`、`header_inclusions.gen.py` 生成这类测试 |
| 头文件元数据 | 公共/内部、C 兼容、所属标准版本的清单 | libc++ 的 `header_information.py` 把清单变成数据，让组件范围同时被构建系统与测试消费 |

交付形态分三种：纯头文件（模板类与模板函数）、头文件加编译库（locale、iostream、filesystem、format/print、random、chrono/tzdb、regex、stacktrace）、与运行库/编译器绑定（异常、RTTI、`operator new`/`delete`、原子 libcall、协程栈、回溯）[实现]。三种形态的边界要写成设计约束：允许依赖哪些编译器内建、是否允许直接使用 C 运行库、`freestanding` 目标怎么裁剪、外部数据从哪来、怎么更新。

### 5.2 测试体系与 CI 门禁

标准库的正确性无法靠 code review 保证，只能把「条款 → 可执行断言」固定下来；测试体系与库代码同规模。

| 测试类型 | 目的 | 落地要点 |
| --- | --- | --- |
| 正向行为与编译期 | 验证标准可观察行为与常量求值路径 | 每条条款至少一个用例；每个 `constexpr` 接口至少一条 `static_assert`，否则只能算运行期实现 |
| 负向编译与诊断 | 不满足约束时给出诊断而非硬错误 | 概念/SFINAE 的诊断文本也是用户接口；libc++ 的 verify 测试用 `expected-error` 固定关键片段 |
| ABI 与符号 | 布局、虚表、导出符号不意外变化 | 清单纳入 CI，任何导出符号变化都要显式更新 |
| 标准与平台矩阵 | 防止把实现绑死在单一编译器或平台上 | 宏门控而非复制实现；至少覆盖本机编译器加一个对照编译器 |
| 消毒器与 fuzz | 越界、悬垂、数据竞争、未初始化；解析/格式化/正则的输入面 | ASan/UBSan/TSan/MSan 组合；`charconv`、`format`、`regex` 必须有 fuzz 入口 |
| 性能与一致性 | 热路径回归、分配次数、编译期成本、二进制大小与条款覆盖状态 | 基准加分配计数断言加 CI 阈值；编译期成本单独测量；覆盖状态表（`docs/Status/Cxx17.rst…Cxx29.rst`、`FeatureTestMacroTable.rst` 一类）驱动排期 |

组织与门禁：libstdc++ 的 `testsuite` 按条款号分目录（`17_intro`…`30_threads`）再加 `abi`/`performance`，「覆盖了哪条条款」一眼可见；libc++ 用 lit 驱动，测试文件头部可声明编译选项、标准版本与平台条件 [实现]。CI 必须能一条命令复现某个配置（编译器、标准、异常开关、平台）的全部测试，否则矩阵会退化为人肉记忆；先建测试骨架再写库，一个能跑 `vector` 二十个用例的 `ctest` 比十个空头文件有价值。

覆盖底线按三条执行：每条标准条款至少一个正向用例，每个受约束接口至少一个 verify 用例，每个 `constexpr` 接口至少一个 `static_assert` 用例。负向测试必须能真正判失败，只做运行期断言不够；「C++17/20/23/26 × 异常/无异常 × RTTI 开/关」矩阵从第一天只跑已实现部分，ABI 清单与符号检查随第一个动态库产出接入，不要等到发布前。

### 5.3 ABI 政策与加固策略

这两项决定类型布局、符号名与失败行为，必须在写第一个容器之前定；事后修改成本接近重写。

| 工程件 | 内容 | 三家做法 [实现] |
| --- | --- | --- |
| 版本宏与符号版本 | 库版本、ABI 版本、更新时间；动态库符号带版本节点，旧二进制继续解析旧符号 | libstdc++ 的 `config/abi/pre/gnu.ver` 从 `GLIBCXX_3.4` 起逐版本追加；MSVC 用 DLL 导出与 `_MSVC_STL_VERSION` 门控 |
| ABI 清单与符号检查 | 冻结的导出符号集合，防止误删误改 | libc++ 的 `lib/abi/*.abilist` 与 `sym_check`；libstdc++ 的 `testsuite/abi` |
| 兼容政策 | 哪些变更允许、哪些禁止、破坏性变更怎么过渡 | libc++ 的 `docs/ABIGuarantees.md`；libstdc++ 的双 ABI 用 `_GLIBCXX_USE_CXX11_ABI` 让新旧 `std::string` 共存 |

加固把「前置条件违反」从未定义行为变成可观测失败，同时不改 ABI。设计原则：检查只加分支、不加成员，容器布局用 `static_assert(sizeof(...))` 固定；档位化，默认档在开销与可观测失败之间取平衡、调试档允许更重、生产档用 trap 尽快终止；越界、空指针、失效迭代器统一走加固断言，不允许有的地方 abort、有的地方静默 UB；断言文本、`static_assert` 文本与概念诊断都属于质量目标，要可测试。三家档位与宏名（libc++ 的 `_LIBCPP_HARDENING_MODE`、libstdc++ 的 `_GLIBCXX_ASSERTIONS`/`_GLIBCXX_DEBUG`、MSVC 的 `_ITERATOR_DEBUG_LEVEL` 与 `_MSVC_STL_HARDENING_*`）见 §7.1。

### 5.4 平台数据、发布与最小工程集

| 工程件 | 内容 | 设计要点 |
| --- | --- | --- |
| 平台设施 | 线程与同步原语、文件系统、时区、熵源、回溯、128 位原子 libcall | 收敛为一层 `platform` 接口（线程、文件、时区、熵、回溯各一个头），其余实现只经由它访问 OS；`freestanding` 目标可整层裁掉；链接依赖写进「必需运行库」清单 |
| 外部数据 | locale 数据、tzdata、Unicode 表、浮点转换表 | 数据来源与更新方式要进设计：用系统数据还是内嵌数据决定行为一致性与可移植性，须写成「实现定义行为」文档；MSVC 的 `locale.cpp`、`tzdb.cpp`、`xcharconv_ryu_tables.cpp` 与 libstdc++ 的 `src/c++20/tzdb.cc` 是三种不同的落点 [实现] |
| 发布组件 | 版本与 ABI 版本、发布节奏、用户文档、决策记录、贡献流程、CI 流水线、许可证、打包 | libc++ 发布 `ReleaseNotes`、`ABIGuarantees.md`、`Hardening.md` 与 `ImplementationDefinedBehavior.md`；libstdc++ 用 `ChangeLog`；许可证须带运行库例外：libc++ 与 MSVC STL 为 Apache-2.0 WITH LLVM-exception，libstdc++ 为 GPL-3.0 WITH GCC-exception |

最小工程集（若只做内核）：仓库骨架、配置头、CMake preset、`ctest` + 正向测试 + `static_assert` 测试、负向编译测试机制、加固宏骨架、版本/ABI 宏、变更日志与决策记录。验收判据是最小 TU 在 C++17/20/23/26 下都能编译、一条命令构建全部目标、新组件无测试不得合并。建议档再加无异常/无 RTTI 构建模式、sanitizer 脚本、基准 harness 与分配计数、C++23 模块入口、一致性状态表；ABI 清单自动化、fuzz 入口、多平台 locale/tzdata 后端可以延后，但对外发布动态库前必须补上。

---

## 6. 范围建议：先做哪一套

### 6.1 按目标选档位

| 档位 | 组件范围 | 工程范围 | 说明 |
| --- | --- | --- | --- |
| S1 教学/内核 | L0–L6 中的核心：配置、语言支持、工具、内存、迭代器、算法、主要容器、`string`/`string_view`（不含 `filesystem`/`locale`/`regex`） | 单平台、单编译器、正向测试 + 基础基准 | 约 20–30 个公共头；适合验证设计与学习 |
| S2 可用子集 | S1 + 文本与格式化 + 基础 I/O + 并发 + 时间 | 双标准模式、双编译器、负向测试、加固、ABI 宏 | 可作为内部工具链的替代实现 |
| S3 完整实现 | 全部标准头 + C 兼容 + 弃用层 + C++26 新组件 | 多平台矩阵、ABI 清单与符号检查、fuzz、多档加固、完整文档 | 长期维护；参考三家实现的分工 |

### 6.2 必须自研与可以复用

| 类别 | 必须自研 | 可以复用 |
| --- | --- | --- |
| 语言支持层 | 头文件与语义必须自己做；`operator new`/异常/RTTI 的实现可复用编译器运行库（如 `libc++abi`、`libsupc++`、`vcruntime`）的接口 | 编译器内建、C 运行库的 `malloc` |
| 分配器与容器 | 协议与容器实现 | 平台分配器（`malloc`/`mmap`） |
| 文本与格式化 | 类型与算法；浮点短表示算法可参考 Ryu/Dragonbox 并自研实现 | C 库 `strtod` 不可直接用于 `from_chars`（locale 无关要求） |
| I/O 与文件系统 | 流抽象与路径语义 | OS 系统调用、C `stdio`（作为后端而非语义层） |
| 本地化 | `locale`/facet 框架 | 系统 locale 数据（glibc/Windows NLS）、ICU（若允许第三方数据） |
| 时间 | `chrono` 类型与日历算法 | OS 时钟、tzdata 数据文件 |
| 并发 | 线程/原子/同步原语的库语义 | OS 线程原语、`pthread`/win32、`libatomic` |
| 回溯 | `stacktrace` 的库语义与符号化接口 | `libunwind`/`libbacktrace`/平台调试接口 |

### 6.3 反模式

- 先写 `<format>` 或 `<ranges>` 再补基础：它们依赖概念、分配器与迭代器，前置组件不稳定会导致返工。
- 只做头文件：`<locale>`、`<filesystem>`、`<stacktrace>`、`<format>` 的完整实现需要编译库。
- 忽略异常安全与分配器传播：容器主路径能跑不代表符合标准；这两项是测试失败的高发区。
- 把「平台相关」写进公共接口：locale/tzdata/线程/回溯必须经平台抽象层。
- 没有 ABI 与加固策略就发布：二进制兼容与安全检查是最难事后补的两项。

---

## 7. 三家实现对照

选型与排期时，对照三家实现比读标准更能看清「哪些是共性、哪些是自由选择」。以下数据来自本机源码，测试数量为文件数，只用于量级比较。

### 7.1 规模与工程机制

| 维度 | MSVC STL 14.51 | libstdc++ 16.2 | libc++ 24 trunk |
| --- | --- | --- | --- |
| 标准头数量 | 127 个无扩展名头（含 `x*` 内部头）；`include` 目录共 264 个文件 | 126 个顶层头，另有 `bits/`、`debug/`、`parallel/`、`pstl/`、`experimental/`、`ext/`、`tr1/`、`tr2/`、`backward/` | 124 个公共头；`include` 目录 190 个文件，内部头在 `__*` 目录 |
| 内部头机制 | `x*`、`y*`、`__msvc_*` 前缀，与公共头同目录 | `bits/` 与实现命名空间（`__gnu_cxx`、`std::__detail`） | `__*` 子目录按组件拆分（如 `__algorithm/`、`__vector/`） |
| 编译库 | `crt\src\stl` 约 100 个 `.cpp`：locale、iostream、filesystem、format、print、stacktrace、tzdb、mutex、thread、atomic、regex、浮点转换表 | `src/c++98`、`c++11`、`c++17`、`c++20`、`c++23`、`c++26`、`filesystem`、`experimental` | `libcxx/src`（含 `filesystem.cpp`、`locale.cpp`、`random.cpp` 等）；模块 `modules/std.cppm` |
| 测试体系 | 上游仓库测试；本机安装不含测试 | `testsuite` 约 10291 个测试文件，按标准条款号组织（`17_intro`…`30_threads`）+ `abi`/`performance` | `test/std` 8089 个 pass、361 个 verify、182 个 compile.fail；lit 驱动；`utils/ci` |
| ABI 机制 | DLL 导出、`_MSVC_STL_VERSION`、`_ITERATOR_DEBUG_LEVEL`；无命名空间版本化 | 符号版本脚本 `config/abi/pre/gnu.ver`（`GLIBCXX_3.4` 起）；双 ABI（`_GLIBCXX_USE_CXX11_ABI`） | `lib/abi/*.abilist` 13 个 + `sym_check`；`_LIBCPP_ABI_VERSION`/`_LIBCPP_ABI_NAMESPACE` |
| 加固 | `_ITERATOR_DEBUG_LEVEL`、`_CONTAINER_DEBUG_LEVEL`、按组件的 `_MSVC_STL_HARDENING_*` | `_GLIBCXX_ASSERTIONS`、`_GLIBCXX_DEBUG`、`_GLIBCXX_DEBUG_PEDANTIC` | `_LIBCPP_HARDENING_MODE`：`none`/`fast`/`extensive`/`debug` |
| 本地化后端 | Windows NLS | glibc locale | 平台分支（Darwin/Windows/其他） |
| 模块支持 | 由工具链提供 `import std` 机制 | `src/c++23/std.cc.in`、`std.compat.cc.in` | `modules/std.cppm.in`、`std.compat.cppm.in` |
| 标准状态跟踪 | 版本宏与 release notes | GCC 状态页与手册 | `docs/Status/Cxx17.rst…Cxx29.rst` 与 `FeatureTestMacroTable.rst` |

### 7.2 C++23/26 新组件覆盖（本机安装实测）

| 组件 | MSVC 14.51 | libstdc++ 16.2 | libc++ 24 trunk |
| --- | --- | --- | --- |
| `<expected>`、`<flat_map>`/`<flat_set>`、`<mdspan>`、`<print>` | 有 | 有 | 有 |
| `<generator>`、`<spanstream>`、`<stacktrace>`、`<stdfloat>` | 有 | 有 | 未见 |
| `<text_encoding>`、`<debugging>` | 未见 | 有 | 有 |
| `<contracts>`、`<meta>`、`<simd>`、`<inplace_vector>` | 未见 | 有 | 未见 |
| `<hive>`、`<linalg>`、`<rcu>`（C++26） | 未见 | 未见 | 未见 |
| `<execution>`（senders/receivers） | 头存在 | 头存在 | 头存在；P2300 状态见 `docs/Status/Cxx26Papers.csv` |
| `<stdbit.h>`、`<stdckdint.h>`（C23） | 未见 | 有 | 未见 |

结论：没有一家实现覆盖全部 C++26 组件。组件清单必须写成「已实现 / 部分 / 未实现」的状态表，而不是假定「标准有的都要立刻有」。

头文件存在也不等于功能完整：特性宏能提供第二重证据。本机 libc++ 的 `__cpp_lib_format` 报 202110、`__cpp_lib_chrono` 报 201611，而 MSVC 与 libstdc++ 分别报到 202304/202306；`__cpp_lib_stacktrace`、`__cpp_lib_generator`、`__cpp_lib_spanstream` 在 libc++ 的 `<version>` 中未定义，与头文件缺失的结论一致 [实现]。评估组件时应同时看「头文件、特性宏、测试覆盖」三项。

---

## 8. 附录：标准头完整清单（按层）

下面两张表是本机三套实现的公共头并集，并补入标准已采纳但本机未全部出现的 C++26 头（`<linalg>`、`<hive>`、`<rcu>`）；按本文分层归类并标注版本背景。共 138 个条目（C++ 标准头 109 个、C 兼容头 27 个、内部头 2 个）；实现内部头与平台包装头不计入。

L0–L7（语言、元编程、内存、容器、算法、ranges 与文本）：

| 层 | 数量 | 标准头 | 版本与说明 |
| --- | --- | --- | --- |
| L0 语言支持与运行时 | 20 | `<new>`、`<exception>`、`<typeinfo>`、`<typeindex>`、`<initializer_list>`、`<coroutine>`、`<contracts>`、`<stdfloat>`、`<cstddef>`、`<cstdint>`、`<climits>`、`<cfloat>`、`<cstdarg>`、`<csetjmp>`、`<csignal>`、`<cstdalign>`、`<cstdbool>`、`<ciso646>`、`<ccomplex>`、`<ctgmath>` | C++26 的 `<contracts>`、C++23 的 `<stdfloat>` 属于新前沿；其余为 C++98/11 基础 |
| L2 元编程与通用工具 | 18 | `<concepts>`、`<type_traits>`、`<limits>`、`<compare>`、`<utility>`、`<tuple>`、`<optional>`、`<variant>`、`<any>`、`<expected>`、`<bitset>`、`<bit>`、`<functional>`、`<source_location>`、`<version>`、`<ratio>`、`<system_error>`、`<meta>` | `<expected>` 为 C++23；`<meta>` 为 C++26 反射 |
| L3 内存与分配 | 3 | `<memory>`、`<memory_resource>`、`<scoped_allocator>` | `<memory_resource>` 为 C++17；其余为 C++11 起 |
| L4 容器 | 16 | `<array>`、`<vector>`、`<deque>`、`<list>`、`<forward_list>`、`<map>`、`<set>`、`<unordered_map>`、`<unordered_set>`、`<stack>`、`<queue>`、`<flat_map>`、`<flat_set>`、`<span>`、`<mdspan>`、`<inplace_vector>` | `multimap`/`multiset` 在 `<map>`/`<set>`；`priority_queue` 在 `<queue>`；`flat_*`、`mdspan`、`span` 为 C++23 前后；`inplace_vector` 为 C++26 |
| L5 迭代器与算法 | 4 | `<iterator>`、`<algorithm>`、`<numeric>`、`<execution>` | `<execution>` 同时承载并行算法策略与 C++26 的 senders/receivers |
| L6 ranges | 1 | `<ranges>` | C++20 起；视图与适配器数量持续增长 |
| L7 文本与格式化 | 6 | `<string>`、`<string_view>`、`<charconv>`、`<format>`、`<print>`、`<text_encoding>` | `<format>`/`<print>` 为 C++20/23；`<text_encoding>` 为 C++26 |

L8–L12 与 C 兼容头、实现内部头：

| 层 | 数量 | 标准头 | 版本与说明 |
| --- | --- | --- | --- |
| L8 I/O、文件与本地化 | 16 | `<iosfwd>`、`<ios>`、`<streambuf>`、`<istream>`、`<ostream>`、`<iostream>`、`<fstream>`、`<sstream>`、`<spanstream>`、`<strstream>`、`<syncstream>`、`<iomanip>`、`<filesystem>`、`<locale>`、`<codecvt>`、`<regex>` | `<syncstream>` 为 C++20；`<spanstream>` 为 C++23；`<strstream>` 为弃用头 |
| L9 数值、时间与随机 | 8 | `<complex>`、`<valarray>`、`<numbers>`、`<cmath>`、`<random>`、`<chrono>`、`<simd>`、`<linalg>` | `<numbers>` 为 C++20；`<simd>`、`<linalg>` 为 C++26 |
| L10 并发与执行 | 13 | `<atomic>`、`<thread>`、`<mutex>`、`<shared_mutex>`、`<condition_variable>`、`<future>`、`<semaphore>`、`<latch>`、`<barrier>`、`<stop_token>`、`<generator>`、`<hive>`、`<rcu>` | `<latch>`/`<barrier>`/`<semaphore>` 为 C++20；`<generator>` 为 C++23；`<hive>`、`<rcu>` 为 C++26 |
| L11 诊断与观测 | 4 | `<stdexcept>`、`<cassert>`、`<stacktrace>`、`<debugging>` | `<stacktrace>` 为 C++23；`<debugging>` 为 C++26 |
| C 兼容头（c 前缀） | 12 | `<cctype>`、`<cerrno>`、`<cfenv>`、`<cinttypes>`、`<clocale>`、`<cstdio>`、`<cstdlib>`、`<cstring>`、`<ctime>`、`<cuchar>`、`<cwchar>`、`<cwctype>` | 以 `c` 前缀包装 C 头；`<cstddef>`/`<cstdint>`/`<cmath>` 等已归入对应层 |
| C 兼容头（.h 形式） | 15 | `<complex.h>`、`<fenv.h>`、`<math.h>`、`<tgmath.h>`、`<stdatomic.h>`、`<stdbit.h>`、`<stdckdint.h>`、`<stddef.h>`、`<stdio.h>`、`<stdlib.h>`、`<string.h>`、`<uchar.h>`、`<wchar.h>`、`<wctype.h>`、`<errno.h>` | `<*.h>` 形式多为弃用兼容；`stdbit.h`/`stdckdint.h` 为 C23 引入 |
| 实现内部与扩展（非标准） | 2 | `<cxxabi.h>`、`<libcxx.imp>` | 另有实现自有的内部头：MSVC `x*`/`y*`、libc++ `__*` 目录、libstdc++ `bits/`/`debug/`/`parallel/`/`pstl/`/`experimental/`/`ext/`/`tr1/`/`tr2/`/`backward/`；`debug`/`parallel`/`pstl`/`experimental`/`ext`/`tr1`/`tr2`/`backward`/`decimal` 为头文件之外的非标准目录 |

注：

- 同一头可能被多个组件使用（如 `<memory>` 既提供分配器也提供智能指针），表中只归入其主要层。
- `multimap`/`multiset` 在 `<map>`/`<set>` 中；`priority_queue` 在 `<queue>` 中；`flat_multimap`/`flat_multiset` 在 `<flat_map>`/`<flat_set>` 中。
- 标准还包含少量本机实现未出现的 C++26 头（如 `<linalg>`、`<hive>`、`<rcu>`），已在上表标注。

---

## 9. 待确认问题

1. 自研标准库项目的目标档位是 S1、S2 还是 S3？这决定组件范围、测试矩阵与 ABI 承诺的规模。
2. 是否要求跨编译器（GCC/Clang/MSVC）与跨平台？跨编译器会显著放大配置层与诊断测试的工作量。
3. 异常与 RTTI 的默认策略是什么？是否要支持 `-fno-exceptions`/`-fno-rtti` 构建？分析见附录 A。
4. locale、tzdata、Unicode、浮点转换表的数据来源与许可证如何选择？
5. 测试框架复用 `lit` 还是自建？负向编译测试与诊断测试是否纳入第一版？
6. 首个里程碑是否按 §4 的批次 0–4 执行（配置、语言支持、元编程、内存、迭代器/算法、主要容器）？

---

## 附录 A：异常模型——能不能禁用异常（对应 §9 问题 3）

结论：能，但它是一个「构建档位」，不是标准库的运行时开关。代价是标准中带 `Throws:` 条款的接口在错误路径上从「可捕获异常」退化为「终止进程」，因此无异常档在错误路径上不满足 ISO 符合性。三家实现都支持这种档位，但支持方式与后果不同。

### A.1 两种含义先分清

| 含义 | 做法 | 影响范围 |
| --- | --- | --- |
| 用户 TU 禁用异常 | 编译选项 `-fno-exceptions`（GCC/Clang）、`/EHs-c-` + `_HAS_EXCEPTIONS=0`（MSVC） | 只影响本 TU 生成的代码；库二进制可能仍带异常 |
| 库自身以无异常构建 | libc++ 的 `LIBCXX_ENABLE_EXCEPTIONS=OFF`；MSVC 以 `_HAS_EXCEPTIONS=0` 构建 STL | 决定库内联代码与 out-of-line 实体的错误路径 |

如果只做前者、库仍带异常，调用库中会抛异常的接口（如 `vector::at` 越界）会变成 `std::terminate`；如果库也用无异常构建，错误路径会走实现自带的终止函数（通常带诊断信息）。

### A.2 三家实现的做法与实测

| 实现 | 库构建选项 | 用户 TU 开关 | throw 点变成什么 | 本机实测 |
| --- | --- | --- | --- | --- |
| MSVC STL 14.51 | 以 `_HAS_EXCEPTIONS=0` 构建 STL | `/EHsc-` + `/D_HAS_EXCEPTIONS=0` | `_THROW(x)` 展开为 `(x)._Raise()`，进入虚函数 `_Doraise()` → `_MSVC_STL_DOOM_FUNCTION`；默认 `__fastfail(5)`，可用 `_MSVC_STL_USE_ABORT_AS_DOOM_FUNCTION` 改为 `abort()`，也可整体替换宏 | `vector::at(0)` 空容器：打印 `before` 后进程退出码 `0xC0000409`（fail-fast），无异常消息 |
| libc++ 24 | CMake `LIBCXX_ENABLE_EXCEPTIONS=OFF`（默认 ON）；另有 `Generic-no-exceptions` 等构建缓存 | `-fno-exceptions` | 头文件按 `_LIBCPP_HAS_EXCEPTIONS` 分支：内联的 `__throw_*` 走 `_LIBCPP_VERBOSE_ABORT(... was thrown in -fno-exceptions mode ...)` | 同程序输出 `out_of_range was thrown in -fno-exceptions mode with message "vector"` 后 abort（exit 134） |
| libstdc++ 16 | 发行版库以带异常构建；头文件按 TU 的 `__cpp_exceptions` 分支 | `-fno-exceptions` | 头文件内 `__try`→`if(true)`、`__catch`→`if(false)`，`_GLIBCXX_THROW_OR_ABORT` 变 `(__builtin_abort(), ...)`；但库内 out-of-line 的 `__throw_*` 仍 `throw` | 同程序输出 `terminate called after throwing an instance of 'std::out_of_range'` 后 abort（exit 134） |

三条证据都说明：「禁用异常」之后的错误路径是进程终止，不是错误码返回。差别只在终止函数、诊断信息与可替换性。

### A.3 代价与限制

1. 标准符合性：`vector::at`、`string::at`、`map::at`、`stoi`/`stod`、`optional::value`、`variant` 的 `get`/`visit`、`any_cast`、`format_error`、`regex_error`、`filesystem` 的抛异常重载、`future::get` 重抛、`iostream` 的 `exceptions()` 掩码、`bad_alloc` 等，全部变成终止。无异常档只能声明为「错误路径不符合标准」的产品档位。
2. 用户代码不能再写 `try`/`catch`/`throw`：GCC 报 `exception handling disabled`，Clang 报 `cannot use 'try' with exceptions disabled`。标准库内部的 `try`/`catch` 在头文件里按宏退化，但用户无法捕获任何东西。
3. `exception_ptr` 退化：无异常无 RTTI 时，libstdc++ 的 `make_exception_ptr` 直接返回空指针、`exception_ptr_cast` 返回 `nullptr`；依赖 `exception_ptr` 的代码会静默得到空值而不是失败。
4. 分配失败：`operator new` 仍按标准抛 `bad_alloc`。在无异常 TU 中这会终止进程；若库也以无异常构建，分配路径必须显式定义「返回空/终止/可替换处理器」。
5. 配置一致性：库与所有 TU 必须使用同一档位与同一 ABI 标签，否则 ODR/ABI 混用。MSVC 的 `#pragma detect_mismatch` 只覆盖 `_ITERATOR_DEBUG_LEVEL`、`RuntimeLibrary`、`_MSC_VER` 等，不覆盖 `_HAS_EXCEPTIONS`；libc++ 的 `__config_site` 若不安装，混用更难发现。
6. 测试成本：所有「预期抛异常」的负向测试要改为 death test（保留进程退出与诊断断言）或在无异常档跳过；CI 需要一条独立的无异常矩阵。
7. 收益：去掉 EH 表与展开路径、缩小二进制、满足嵌入式/游戏主机/内核等平台的「禁止异常」约束；性能收益通常不是主要动机，可预测性与平台合规才是。

### A.4 对自研标准库项目的建议

| 决策 | 建议 |
| --- | --- |
| 默认档位 | 保留完整异常（符合标准），无异常是可选构建档位 |
| 档位划分 | 三档：`full`（默认）、`fail-fast`（无异常，终止）、`fail-fast + 可替换 fatal handler`（记录日志后终止） |
| 代码组织 | 所有 throw 点只能通过统一宏（如 `CXXSTL_THROW`、`CXXSTL_RETHROW`、`CXXSTL_TRY/CATCH`）书写，禁止散落 `#ifdef`；fatal handler 与 hardening 断言共用一条路径 |
| ABI 隔离 | 配置宏带上档位标签，并在符号/命名空间或链接期检查中体现；文档声明不同档位不可混链 |
| 分配策略 | 与异常档解耦：单独提供「抛 `bad_alloc` / 返回空并终止 / 自定义处理器」选项，避免把 OOM 策略绑死在异常开关上 |
| 测试 | 正向测试全档运行；负向测试在无异常档改为 death test；CI 矩阵加入「C++17/20/23/26 × 异常/无异常 × RTTI 开/关」 |
| 文档 | 明确列出无异常档下「会终止而非抛出」的接口清单，并声明该档在错误路径上不符合 ISO C++ |
| 实施顺序 | 先做 `full` 档跑通全部组件，再在 L0/L2 骨架稳定后补 `fail-fast` 档；否则每加一个组件都要同时改两套错误路径 |

### A.5 仍待确认

1. 首个版本是否要同时交付 `fail-fast` 档，还是先只做 `full` 档、把无异常留到 v1 之后？
2. fatal handler 的默认行为选 `abort()`、`__fastfail` 还是可注册处理器？是否需要打印契约/越界上下文？
3. 是否发行两个库变体（`libcxxstl` 与 `libcxxstl-noexc`），还是要求使用者从源码构建对应档位？
