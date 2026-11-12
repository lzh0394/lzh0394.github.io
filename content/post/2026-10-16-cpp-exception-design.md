---
title: C++ 异常的设计
slug: "cpp-exception-design"
date: 2026-10-16
categories: ["编程语言"]
tags:
  - C++
  - 语言设计
  - 异常
draft: false
summary: 按「抛出的是什么对象」「谁能接住它」「栈怎么展开」三层拆开 C++ 异常的语义设计，再梳理异常规格从 C++98 动态规格到 noexcept 的沿革、标准库的异常家族与非异常路线，最后落到 Itanium C++ ABI 与 MSVC 的两阶段展开实现，说明「零开销」到底指什么；逐处区分规范保证、implementation-defined 与实现选择。
---

这篇讲设计：异常要解决什么问题、标准规定了哪些语义、哪些留给实现、以及哪一部分后来被证否。语法层面的写法不铺开。条款以 C++ 工作草案为准（<https://eel.is/c++draft/>，草案不等于正式标准，正式文本是付费的 ISO/IEC 14882）。

核对状态：草案条款、Itanium C++ ABI 与 P0003R5 原文已逐处核对；标【沿用既有记录】的条目是本仓库其他笔记核对过、本次未取原文的。

---

## 一、它要替代什么

异常进入 C++ 是为了填三个返回码填不了的洞：

构造函数没有返回值。初始化失败（内存不足、文件打不开、不变式不成立）在返回码模型里只能靠"对象处于半死状态 + 一个 `valid()` 标志"来表达，调用方可以完全不检查。异常是唯一能在构造中途中断、并且保证已构造部分被清理的机制。

错误检测与错误处理必须能分开。深层代码发现错误时往往不知道该怎么处理，异常把这个决定推迟到任意远的调用者，中途每一层不必写转发样板。

清理必须自动发生。C++ 没有 `finally`，清理交给析构函数；反过来说，"展开路上一定会调用析构"是 RAII 成立的前提，也是异常机制必须保证的第一件事（见第四节）。

代价也要一起记：异常类型不出现在函数签名里（不是 Java 那样的 checked exception），因此控制流在源码上不可见；模板对异常友好，代价是静态分析困难，接口的失败方式只能写文档。

历史上，异常在 1989–1991 年间的 C++ 实现与 ARM 中成形，随后进入 C++98；动态异常规格是同一时期的产物，几十年后被证否，详见第五节。设计者的自述见参考里的 D&E 与 HOPL 论文（属二手背景，只用来解释动机）。

---

## 二、抛出的是一个对象

`throw` 不是"跳转指令"，它先造一个对象。

- `throw-expression` 的类型是 void，但它的操作数要先经过数组到指针、函数到指针转换，再去掉顶层 cv，然后**拷贝初始化**出一个异常对象（[expr.throw]）。异常对象的类型就是操作数去掉顶层 cv 后的类型。
- 异常对象具有动态存储期（dynamic storage duration），在抛出点初始化（[except.throw]/3）。类型不能是不完整类型、抽象类类型，也不能是指向不完整类型的指针（`cv void*` 除外）。
- 这块存储怎么分配是 unspecified，标准只规定：异常对象在最后一个引用它的点之后才能被释放，且"销毁点"里有一个 unspecified 的最后者，其余都排在它之前（[except.throw]/4）。实现可以在那之后回收。
- 异常对象的类型 T 必须能从 `const T` 左值拷贝初始化，且析构函数可访问（[except.throw]/5）。所以 **move-only 类型不能直接抛**。
- 抛一个局部自动对象时，可以直接把它构造进异常对象而省略拷贝，并且按右值处理（[class.copy.elision]/1.2）：`Thing t; throw t;` 走的是移动构造或被省略。函数形参没有这个待遇（同条的示例 3 里 `throw x;` 不移动、`throw y;` 移动）。异常对象本身**始终是左值**，handler 里不能把它移走。
- `throw;` 不造新对象，而是复用当前正在处理的异常对象（[expr.throw]/2）；确实没有正在处理的异常时，结果是 `terminate`，不是未定义行为。
- 从异常对象初始化完成、到某个 handler 被激活之间，异常处于 uncaught 状态（[except.throw]/6）；`std::uncaught_exceptions` 数的就是它（见第六节）。

一个容易被忽略的推论：抛出的对象是**拷贝**，所以 handler 改不到抛出点那个对象；跨线程传播需要显式搬运（`std::exception_ptr`）。异常对象大小也不受限制，这正是后来 P0709 想改掉的地方（见参考里的 `herbception.md`）。

---

## 三、谁能接住它：靠类型，不靠转换

匹配规则只有四条（[except.handle]/3），且都基于类型：

- handler 的 `cv T` 或 `cv T&` 与异常对象类型（忽略顶层 cv）相同；
- `T` 是异常对象类型 `E` 的**无歧义公开基类**；
- 异常对象是指针/成员指针，且能通过标准指针转换、函数指针转换或限定转换转成 handler 的指针类型（不许私有/保护/歧义基类路径）；
- 异常对象是 `nullptr_t`，转成指针或成员指针。

关键点是它**完全没有**算术转换和用户定义转换：`catch (double)` 接不住 `throw 1;`，自定义的隐式转换也不会被考虑。这跟函数重载的规则是两套东西。

其余规则：

- handler 按书写顺序尝试，第一个匹配的胜出（/4）；`catch (...)` 匹配任何东西，因此必须是最后一个（/5）。
- 没有匹配就沿动态调用链往外找同一线程里层层的 `try`（/6）；都没有，结果就是 `terminate`（/8），而不是把异常传给调用者当作返回值。
- `exception-declaration` 不能是不完整类型、抽象类类型、**右值引用类型**；数组和函数类型会被调整为指针（/1）。这也意味着 handler 里没法从异常对象移动。
- catch 形参对象的初始化方式很讲究（/15）：`T` 是 `E` 的基类时从基类子对象拷贝初始化，否则从异常对象拷贝初始化。**按值捕获必然是一次拷贝**，异常对象本身不受影响（可能被切片）；按引用捕获操作的才是异常对象。
- `currently handled exception` 是最近激活且仍未退出的 handler 对应的那个异常（/10）。

---

## 四、展开与清理：有顺序，有硬停

栈展开（stack unwinding）的规范定义在 [except.ctor]：

- 进入 `try` 之后已经构造、尚未销毁的自动对象，按构造完成的逆序销毁（/2）。返回语句里抛异常时，返回对象也在被销毁之列。
- 构造函数中途抛出，只销毁"已知被初始化"且初始化已完成的子对象，逆序（/3）。基类与成员的清理顺序由此确定，而对象自己的析构函数不会被执行——对象从未构造完成。委托构造函数是例外：委托构造的函数体抛出时，整个对象的析构函数会被调用（/4）。
- 如果某个析构函数在展开途中被异常终止，那么该析构函数体之后本来还会执行的析构调用仍会执行（/3 末段），例如虚基类子对象。
- 这些销毁被定序在进入构造函数/析构函数的函数 try 块 handler 之前（/3）。

异常机制自身的失败统一落到 `std::terminate`（[except.terminate]/1 的注释里列了完整清单），常见的几类：异常对象初始化期间抛出（例如拷贝构造失败）、找不到 handler、查找 handler 时走出非抛出规格的函数体、展开途中析构函数抛异常、静态或线程存储期对象初始化/销毁抛出、`atexit` 注册的函数抛出、无异常可重抛时的 `throw;`、`nested_exception::rethrow_nested` 无捕获、线程初始函数抛出、`std::thread` 析构在 joinable 时被调用、`condition_variable::wait` 后置条件不成立等。

"是否先展开栈"在规范里分三档（[except.terminate]/2），这一条常被误记成统一行为：

| 情形 | 是否展开 |
| --- | --- |
| 找不到匹配的 handler | implementation-defined，展开或不展开 |
| 查找 handler 时走出非抛出规格的函数体 | implementation-defined，可展开、部分展开或不展开 |
| 其余所有情形 | 规范要求不展开 |

规范还额外禁止实现以"反正最后要 `terminate`"为理由提前结束展开。

构造函数/析构函数的函数 try 块有几条只在这里出现的特殊规则（[except.handle]/11–14）：

- 在 handler 里引用对象的任何非静态成员或基类 → 未定义行为（成员已经被销毁了）。
- 构造函数 handler 里出现 `return` 语句 → ill-formed。
- 走到构造函数/析构函数 handler 的末尾，等价于重新抛出当前异常（其他函数的函数 try 块不会这样）。
- 静态存储期对象或线程存储期非块变量的构造/析构中抛出的异常，`main` 上的函数 try 块捕获不到。

由此得到一条工程结论：**析构函数里抛异常是单程票**。C++11 起，用户声明的析构函数带隐式异常规格；若该规格是非抛出的，展开途中再抛就直接 `terminate`。

---

## 五、异常规格的沿革：从运行期检查到类型系统

| 设施 | 引入 | 语义 | 结局 |
| --- | --- | --- | --- |
| `throw(T1, T2)` 动态异常规格 | C++98 | 运行期强制，抛出未列出的类型时调用 `std::unexpected` | C++11 弃用（N3051），C++17 移除（P0003R5） |
| `throw()` | C++98 | 不允许抛出，违规走 `std::unexpected` | C++17 起是 `noexcept(true)` 的弃用别名，C++20 删除（P0619R4，【沿用既有记录】） |
| `noexcept` / `noexcept(cond)` | C++11 | 只有"会不会失败"这一位信息，违规直接 `terminate` | 现行；C++17 起进入函数类型（P0012R1） |

P0003R5（Alisdair Meredith，2016-11-11，audience CWG）对动态规格的评语是 "a failed experiment"，理由有两条：一来它们是运行期检查，列出的类型集合跟签名里的类型系统没有关系，却影响虚函数能否覆盖；二来 `throw()` 在实现上是个**纯 pessimization**——它迫使栈先展开到函数出口、再调用注定失败的 `std::unexpected`，而使用者普遍误以为它能让编译器优化掉异常路径。把 `throw()` 直接等价于 `noexcept(true)` 才拿到了人们原本期待的性能。

这份论文里几个值得单记的细节：

- 移除是可诊断的破坏性变化：带 potentially-throwing 动态规格的合法 C++14 声明在 C++17 变成 ill-formed（新增 [diff.cpp14.except]）。
- `std::unexpected`、`std::set_unexpected`、`std::get_unexpected`、`unexpected_handler` 整条链一并退场，进入 zombie names；现行草案的 [except.special] 里只剩 `std::terminate`，`<exception>` 里也没有它们了。
- `std::bad_exception` 保留下来，但释义被改写为"`current_exception` 在当前异常对象拷贝失败时返回的 `exception_ptr` 所指的类型"——原先它服务于 `unexpected` 的替换逻辑。
- 兼容性补救（论文给出的写法）：老代码里 `void legacy() throw(Something)` 想保留"只能抛这一种、否则终止"的语义，可以改成函数 try 块，`catch (const Something&) { throw; }` 加上 `catch (...) { terminate(); }`。
- 同一份论文重写的兼容性附录 C.2.6 [diff.cpp03.special] 记下了另一处破坏性变化："用户声明的析构函数具有隐式异常规格"——这是 C++11 相对 C++03 的变化，效果是 C++03 里会抛出的析构在 C++11 下直接 `terminate`（且不再经过 `unexpected`）。

另外几条与异常规格相关的现行规则：

- 没有显式规格时默认是 potentially-throwing，例外是析构函数、释放函数，以及首次声明即 defaulted 的函数（[except.spec]/4）。
- 非抛出规格的虚函数，其派生类覆盖函数也必须非抛出（用 `= delete` 可以，[except.spec]/5）。这使 `noexcept` 成为接口契约的一部分。
- 显式 `noexcept(false)` 的析构函数、以及需要在展开时抛出的场景仍可写，但要自己承担 `terminate` 的风险。
- C++17 引入 `std::uncaught_exceptions()` 返回计数，C++17 同时弃用 `std::uncaught_exception()`（单值版本在"析构里嵌套创建对象"的场景无法判断）；C++20 移除后者（P0619R4，本次未核对原文）。这条与 P0003R5 是同一批清理。

后续想把"异常规格"从运行期检查改成编译期信息的提案（P0709 的 `throws`、P3166 重拾的 `throw(E1, E2)`）都未采纳，细节见 `herbception.md`。

---

## 六、库设施：三条路线

标准库在异常这件事上铺了三条并行的路。

异常类型层次。`std::exception` 是根，提供 `what()` 与虚析构；`logic_error`/`runtime_error` 两条支线是命名传统，标准并不规定"逻辑错误必须用 `logic_error`"。实际会遇到的：`bad_alloc`、`bad_array_new_length`（C++11）、`bad_cast`、`bad_typeid`、`out_of_range`、`range_error`、`system_error`、`future_error`、`bad_weak_ptr`（C++11）、`bad_function_call`（C++11）、`filesystem_error`（C++17）、`bad_variant_access`/`bad_optional_access`（C++17）、`bad_expected_access`（C++23）。库函数的抛出承诺写在各自的 Throws: 段里，且允许抛所列类型的派生类。

搬运与包装（C++11）。`exception_ptr` + `current_exception`/`rethrow_exception`/`make_exception_ptr` 用来把异常带出当前上下文（典型是跨线程、跨回调边界）；`nested_exception` + `throw_with_nested`/`rethrow_if_nested` 处理"处理失败时又失败"的场景，注意 `rethrow_nested` 在没有捕获到异常时是 `terminate` 而非 UB。

非异常路线。`error_code`/`error_condition`/`system_error`（C++11）把失败编码成值，`std::expected`（C++23）把"值或错误"变成返回类型。两者的存在理由相同：异常在某些环境（禁用异常、实时约束、跨语言边界）不可用或代价不可接受。选哪条是接口风格问题，不是"谁更现代"。

---

## 七、实现层：零开销与两阶段展开

规范只规定语义，不规定实现；以下全部是实现选择，跨编译器不通用。

Itanium C++ ABI（GCC、Clang 及多数 Unix 平台）的模型：

- 每个可能抛出或需要清理的函数在编译期生成 unwind 表（含 LSDA 语言相关数据与 personality routine 指针）。正常执行路径上不为异常付出任何指令——**"零开销"指的就是这一点**；代价是代码体积、以及编译器在优化时对展开信息的额外约束。
- 运行期分两层：下层的 unwind 库接口（`_Unwind_RaiseException`、`_Unwind_Resume`、`_Unwind_ForcedUnwind` 等），上层是 C++ 专用的 personality routine。
- 抛出的处理是**两阶段**：search 阶段只逐帧询问"这帧有没有 handler"，不恢复任何状态；找到后进入 cleanup 阶段，逐帧执行清理代码，最后用 `_URC_INSTALL_CONTEXT` 把控制权交给 landing pad。
- search 阶段失败就直接调 `terminate`，**根本不进入第二阶段**。这正是规范里"是否展开栈 implementation-defined"的来源——按 ABI 的流程，没有一个匹配的 handler 时栈压根没动过。
- 两阶段并非 C++ 语义的必需，它换来的是与支持 resumptive 异常处理的语言共存的能力，以及"先确定能处理再开始破坏栈"的顺序保证。代价是重抛会重新走一遍流程：ABI 明确说明重抛是再调一次 `_Unwind_RaiseException`，而不是 `_Unwind_Resume`。
- C++ 运行期函数：`__cxa_allocate_exception` 分配异常对象（通常在堆上，分配失败时用紧急缓冲，仍失败则 `terminate`）、`__cxa_throw`（写入 `exception_class`——低四字节是 `"C++\0"`——递增未捕获计数，然后交给 unwind 库）、`__cxa_begin_catch`/`__cxa_end_catch` 用引用计数决定异常对象何时销毁、`__cxa_rethrow` 标记重抛。类型匹配靠 `__cxa_throw` 传入的 `type_info*` 与析构函数指针。
- 紧急缓冲的量化（ABI Level III）：每个任务至少 4KB、至多 64KB，按 1KB 切块；最多 16 个任务同时使用，每任务最多 4 层嵌套异常，单个异常对象（含 header）不超过 1KB；用满时其他线程阻塞等待。这条是为了让 `bad_alloc` 本身还能被抛出。

MSVC 走另一条路：x64 上是表驱动的，非叶函数在 `.pdata` 里登记 `RUNTIME_FUNCTION`（起止地址 + unwind 信息地址），指向 `.xdata` 中的 `UNWIND_INFO`，用 `UNW_FLAG_EHANDLER`/`UNW_FLAG_UHANDLER` 区分"异常处理器"与"终止处理器"（C++ 局部对象析构就注册在后者）。语言相关的 handler 以 `PEXCEPTION_ROUTINE` 形式被调用，拿到的 `DISPATCHER_CONTEXT` 里带 `ControlPc`、`EstablisherFrame` 等信息。MSVC 没有 Itanium 那样完整的公开 ABI 规范，只能依据官方文档与实际行为——这一点在本仓库里一贯要写明。

跨模块的边界要小心：类型匹配依赖两侧对类型身份与析构函数的一致看法，所以同一个 ABI、同一个运行期之内跨共享库通常可行，跨不同 ABI 或不同异常模型（例如 `/EHsc` 与 `/EHa`）就不行。MSVC 侧由 `/EH` 选择模型，新工程默认 `/EHsc`；官方文档明确不建议把 C++ 异常与 SEH 混用。

---

## 八、工程上剩下什么

- 异常安全通行分三档：不抛保证、强保证（失败后状态不变，常靠 copy-and-swap 实现）、基本保证（不泄漏、不变式不被破坏）。这是工程惯例而非标准条款，标准里没有"异常安全等级"这个术语。
- `noexcept` 是接口契约，不是优化提示。把它写错的结果是 `terminate`，且这一位信息会随函数类型传播。
- 关掉异常（`-fno-exceptions`、MSVC 的 `/EHs-c-` 一类）后，抛出点变成终止，标准库的失败只能用 `error_code`/`expected` 那条线表达，很多库（含标准库实现）直接不可用。
- 不该用异常的场合：跨语言或跨 ABI 的边界、实时与嵌入式里对最坏执行时间有要求的路径、以及"失败是正常结果"的接口（这时 `expected` 更贴切）。

---

## 参考

- C++ 标准草案：<https://eel.is/c++draft/>
  - 相关锚点：`[expr.throw]`（抛出表达式的类型与转换）、`[except.throw]`（异常对象的存储期与销毁点）、`[except.handle]`（匹配规则与 handler 激活）、`[except.ctor]`（栈展开）、`[except.spec]`（异常规格）、`[except.terminate]`（`terminate` 的全部触发情形）、`[except.special]`、`[class.copy.elision]`（抛出与捕获时的拷贝省略）。
- Itanium C++ ABI 的异常处理章节（Level I/II/III 分层、两阶段展开、`__cxa_*` 接口与紧急缓冲）：<https://itanium-cxx-abi.github.io/cxx-abi/abi-eh.html>
- WG21 文稿：
  - [P0003R5《Removing Deprecated Exception Specifications from C++17》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2016/p0003r5.html)（含改写后的 [except.spec]、[except.terminate]、Compatibility 附录与 `<exception>` 概要；本文的移除范围按原文核对）。
  - [P0012R1《Make exception specifications be part of the type system》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2015/p0012r1.html)（`noexcept` 进入函数类型，C++17）。
  - [N3051《Deprecating Exception Specifications》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2010/n3051.html)（C++11 弃用动态规格）。
  - [P0619R4《Reviewing Deprecated Facilities of C++17 for C++20》](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p0619r4.html)（删除 `throw()`；本次未取原文，沿用本仓库既有记录）。
- MSVC 文档：[x64 exception handling](https://learn.microsoft.com/en-us/cpp/build/exception-handling-x64)（`.pdata`/`.xdata`、`UNWIND_INFO` 与 `DISPATCHER_CONTEXT`）、[Exception handling in MSVC](https://learn.microsoft.com/en-us/cpp/cpp/exception-handling-in-visual-cpp)（`/EH` 与 SEH 的关系）。
- 二手背景（只用于解释动机，不作结论）：Stroustrup《The Design and Evolution of C++》与《A History of C++: 1979−1991》<https://www.stroustrup.com/hopl2.pdf>。
- 相关笔记：`C++历史错误决定.md`（动态异常规范在"被标准自己撤销"那一类里）、`herbception.md`（P0709/P3166 与两代异常规格的对照表）、`C++对象模型.md`（对象生命期与子对象销毁顺序）、`C++多态.md`（`dynamic_cast` 失败时 `bad_cast` 的抛出条件）。
