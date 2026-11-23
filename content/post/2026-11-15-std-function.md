---
title: "std::function 研究"
slug: "std-function"
date: "2026-11-15"
tags: ["C++", "标准库"]
series: "C++ 标准库"
series_order: 6
draft: false
summary: "以标准条款与三家实现为证据，拆解 std::function 的类型擦除模型：管理器与调用器的分工、SBO 阈值的实现差异、可复制要求与只可移动目标的冲突，以及 move_only_function、copyable_function 与 function_ref 的定位。"
---

## 0. 结论摘要

- `std::function` 是「可复制的类型擦除调用包装」。状态由三部分组成：一段固定大小的缓冲区、管理器指针、调用器指针。管理器承担克隆、销毁与类型查询，调用器按固定签名转发调用，目标对象的类型因此不出现在包装类型里。
- 三条规则划定行为边界：目标必须可复制，空对象调用抛 `bad_function_call`，`operator()` 恒为 const 而目标按非 const 路径访问。第一条排除只移动的捕获类型，第二条使调用无法声明 `noexcept`，第三条使 const 正确性不成立。
- SBO 只是推荐实践。`[func.wrap.func.con]/5` 建议小对象不分配内存，阈值由实现选择：libstdc++ 为 16 字节，MSVC 在 x64 上为 56 字节，libc++ 随版本变化。SBO 消除分配，不消除间接调用。
- C++23 的 `move_only_function` 让签名携带 cv、ref 与 noexcept 限定符，并把空调用改为前置条件；C++26 工作草案加入 `copyable_function` 与 `function_ref`。存储异质回调时按所有权选型；能模板化时不必使用类型擦除。

---

## 1. 范围与口径

`std::function` 的接口只有构造、赋值、`swap`、`operator bool`、`operator()` 与目标访问六部分，但它同时涉及类型擦除、缓冲区布局、异常保证与 ABI。多数使用问题不在接口本身，而在三件事被忽略：目标的可复制性、空状态的存在、`operator()` 的 const 与目标访问路径不一致。

### 1.1 证据分级与版本基准

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | C++ 工作草案的可观察要求 | `[func.wrap.func.inv]/2` 规定空对象调用抛异常 |
| [paper] | WG21 提案与缺陷报告 | P0288R9 定义 `move_only_function` |
| [impl] | 标准库实现源码 | libstdc++ 的 `_Function_base::_M_manager` |
| [推断] | 由证据推出的工程判断 | 56 字节缓冲区对对象尺寸的影响 |

标准侧以 eel.is 的 2026-11 草案快照为准，C++20 与 C++23 的措辞用 N4861 与 N4950 对照，段号变化只在影响引用时说明。实现侧对照 libstdc++ 16.2.0 的 `bits/std_function.h` 与 `bits/funcwrap.h`、MSVC STL 14.51 的 `functional`、`typeinfo` 与 `yvals_core.h`；libc++ 只按 `__functional/function.h` 的设施结构描述，未取本机修订，因此不给行号与尺寸数值。

草案不是正式标准，正式文本是 ISO/IEC 14882。本文引用的段号对应草案快照，标准换版后可能位移。

### 1.2 不做什么

- 不重述分配器协议：`allocator_traits` 与传播规则见系列第 2 篇《标准库分配器的演化》，本文只讨论 `std::function` 与分配器的历史交集。
- 不重复《C++ vector 解析》的容量模型与《STL 需要有什么组件》的分层清单，只在对比处引用结论。
- 不做性能测试：调用开销只按间接调用次数与是否有分配来定性描述，不给计时数字。
- 不展开 `std::bind`、`std::mem_fn`、`std::packaged_task` 的接口细节，只在它们复用同一套类型擦除设施时提及。

---

## 2. 标准要求

### 2.1 规范身份

`[func.wrap.func.general]/1` 把 `function` 描述为「泛化函数指针」的多态包装，能存储、复制并调用任意可调用对象；/2 规定它是调用签名为 `R(Args...)` 的调用包装（call wrapper）。调用包装与调用签名的定义在 `[func.def]/5` 与 `[func.def]/2`：前者是持有目标对象并支持转发调用的类型，后者是返回类型加参数类型列表。

这一定义决定了接口的最小集：持有（构造）、转发调用（`operator()`）、交换（`swap`）、判空（`operator bool`）、取回类型（`target_type`）。标准没有再要求更多，也没有规定缓冲区大小、是否分配、如何分派。

目标的复制要求写在构造函数条款 `[func.wrap.func.con]` 中：`function` 的复制必须复制目标，因此目标类型必须可复制。libstdc++ 与 MSVC 都以静态断言落实这条要求，诊断信息中写明目标必须可复制。静态断言不参与重载决议，这带来第 6.1 节讨论的检测问题。

### 2.2 构造、赋值与空状态

空的来源有五种：默认构造、以 `nullptr` 构造、以空函数指针构造、以空成员指针构造、以空的 `std::function` 构造。实现在构造路径上判断实参是否为空指针或空包装，判定为空时只把管理器指针置空。

复制构造的异常规定见 `[func.wrap.func.con]/4`：目标为 `reference_wrapper` 的特化或函数指针时不抛，否则可能抛 `bad_alloc`，或抛目标复制构造抛出的异常。移动构造声明为 `noexcept`，移动后源对象「处于有效状态，值未指定」（`[func.wrap.func.con]/6`）。三家实现都把源置空，但这是实现行为，依赖它不符合可移植性要求。

复制赋值与模板赋值在两家实现里都是「构造临时对象，再 `swap`」，异常时原目标保持不变。`operator=(nullptr_t)` 释放目标并置空，规范上不抛。`swap` 声明为 `noexcept`（`[func.wrap.func.mod]`）；LWG 2062 修过「交换目标」的措辞与不抛保证之间的矛盾，libstdc++ 的头文件里保留了这条缺陷编号的注释。

C++20 起与 `nullptr` 的比较只剩 `f == nullptr` 一种形式。`operator!=` 与 `nullptr == f` 在 C++20 的比较运算符清理中移除，两份实现的头文件用 `_HAS_CXX20` 与 `__cpp_impl_three_way_comparison` 保留旧模式。

### 2.3 调用

`[func.wrap.func.inv]/1` 规定 `operator()` 返回 `INVOKE<R>(f, std::forward<ArgTypes>(args)...)`，其中 `f` 是目标对象；/2 规定 `!*this` 时抛 `bad_function_call`，否则传播目标抛出的异常。

声明形式是 `R operator()(ArgTypes...) const`。const 与调用签名无关，是写死在类定义里的。这一点区分了 `std::function` 与后文的 `move_only_function`：后者的 const、引用与 noexcept 限定符来自签名，因而可以把「只读调用」与「可写调用」编码进类型。

### 2.4 目标访问

`[func.wrap.func.targ]/1` 规定 `target_type()` 在有类型 `T` 的目标时返回 `typeid(T)`，否则返回 `typeid(void)`；/2 规定 `target<T>()` 在 `target_type() == typeid(T)` 时返回目标指针，否则返回空指针。

两条限制来自实现方式。其一，`T` 必须与存储时的类型完全一致：模板构造把实参按 `decay` 存储，因此 `target<decltype(lambda)>` 可行；`target<int(*)(int)>` 只在目标本身就是函数指针时可行，lambda 即使不捕获也存成闭包类型。其二，两个函数都依赖 RTTI：libstdc++ 在 `__cpp_rtti` 为 0 时不声明 `target_type`，MSVC 在 `_HAS_STATIC_RTTI` 为 0 时让这两个函数在运行期报错。

`target<T>()` 的实现不完全依赖 typeid。libstdc++ 先比较管理器函数地址是否等于 `_Function_handler<签名, T>::_M_manager`，不等再比较 typeid；地址比较处理同一构建内的常见情形，typeid 比较处理跨共享库时函数地址不同的情形。

### 2.5 异常与 noexcept 汇总

| 操作 | 声明 | 可能抛出 |
| --- | --- | --- |
| 默认构造、`nullptr` 构造 | `noexcept` | 不抛 |
| 复制构造 | 无 | `bad_alloc` 或目标复制构造的异常 |
| 移动构造 | `noexcept` | 不抛 |
| 复制赋值 | 无 | 同复制构造 |
| 移动赋值 | 无 `noexcept` | 实现可以强化为不抛 |
| `operator()` | 无 `noexcept` | `bad_function_call` 或目标的异常 |
| `swap` | `noexcept` | 不抛 |
| `target`、`target_type` | `noexcept` | 不抛 |

移动赋值一行值得单独说明：草案的类摘要没有给它 `noexcept`，而 libstdc++ 与 MSVC 都标了 `noexcept`（MSVC 的注释写明 strengthened）。实现加强异常规格是允许的，但代码不应据此假设其他实现同样如此。

---

## 3. 对象模型

### 3.1 三部分状态

类型擦除的通用结构是「缓冲区 + 操作表」。`std::function` 把操作表拆成两个函数指针：

- 管理器（manager）：签名形如 `bool (*)(any_data&, const any_data&, operation)`，按操作码执行克隆、销毁、取类型信息、取目标地址。libstdc++ 的操作码是 `__get_type_info`、`__get_functor_ptr`、`__clone_functor`、`__destroy_functor` 四项。
- 调用器（invoker）：签名形如 `R (*)(const any_data&, Args&&...)`，把缓冲区当作目标类型，按包装的调用签名转发。

两个指针都由模板构造按目标类型实例化，指向 `_Function_handler<签名, 目标类型>` 的静态成员函数。管理器是类型信息的唯一载体：判空看它是否为空，克隆与销毁走它，`target_type` 也由它填写。

### 3.2 两种分派方式

同样的模型有两种落地方式，差异在于操作表放在哪里。

函数指针表：libstdc++ 在包装对象里存管理器与调用器两个指针，管理器用 `switch` 在操作码之间分派。目标对象本身不带任何元数据，因此本地存储的目标可以按字节复制。

抽象基类：MSVC 让每个目标类型派生自 `_Func_base`，基类声明 `_Copy`、`_Move`、`_Do_call`、`_Target_type`、`_Delete_this` 与取地址的 `_Get` 六个纯虚函数。包装对象存一个指向实现的指针，调用的形式是虚调用。操作表以虚表指针的形式进入目标对象，本地存储时虚表指针占用缓冲区的一个指针位置。

两种方式的开销结构不同：函数指针表让包装对象多存一个指针，虚表方案让目标对象多存一个指针；调用路径都是一次间接调用，虚表方案多一次从包装对象到实现对象的指针解引用。

libc++ 采用的分派结构与两家都不同：内部同时有抽象基类 `__base` 与静态策略表 `__policy` 两套设施，具体分层见第 4.3 节。缓冲区大小与本地存储判据随版本变化，本文不作数值断言。

### 3.3 SBO 的判据

小对象优化（small buffer optimization，SBO）把目标直接构造在包装对象的缓冲区里，省去一次分配。它要满足三个条件：

- 大小不超过缓冲区。
- 对齐不超过缓冲区对齐，且缓冲区对齐是目标对齐的整数倍。
- 目标可以被安全搬运：可平凡复制，或移动构造不抛。

第三条是关键。函数指针表的移动构造要做到不分配、不抛，最省事的做法是按字节复制整个缓冲区；这只对可平凡复制的类型成立。libstdc++ 因此要求 `__is_location_invariant`（默认是 `is_trivially_copyable`）为真，并保留用户为该 traits 特化的能力，特化即声明类型可以按字节重定位。MSVC 的 `std::function` 与两家实现的 `move_only_function` 采用另一条判据：移动构造不抛。代价是本地存储的移动要走一次移动构造，收益是更多类型能进入缓冲区。

| 实现 | 缓冲区 | 判据要点 | 可用载荷 |
| --- | --- | --- | --- |
| libstdc++ | 16 字节（`_Any_data`） | 可平凡复制、对齐整除 | 16 字节 |
| MSVC STL（x64） | 56 字节 | 大小、`max_align_t` 对齐、移动构造不抛 | 48 字节 |
| libc++ | 随版本变化 | 由实现选择 | 不给具体值 |

MSVC 一行需要解释：`_Space_size` 为 `(_Small_object_num_ptrs - 1) * sizeof(void*)`，`_Small_object_num_ptrs` 定义在 `<typeinfo>` 中，取值为 `6 + 16 / sizeof(void*)`，x64 上为 8，于是缓冲区 56 字节。实现对象自带虚表指针，扣除后目标可用 48 字节。判据还包含 `alignof` 不超过 `max_align_t` 与移动构造不抛，后者让移动可能抛的小对象也落到堆上。

### 3.4 简化实现

去掉跨签名转换、RTTI 与分配器之后，结构如下：

```cpp
struct storage { void* p; };  // 简化：真实缓冲区更大

template<class F, class R, class... Args>
struct handler {
  static R invoke(const storage& s, Args&&... args) {
    return std::invoke(*static_cast<F*>(s.p), std::forward<Args>(args)...);
  }
  static void manage(storage& d, const storage* src, int op) {
    if (op == 0) static_cast<F*>(d.p)->~F();          // 销毁
    if (op == 1) d.p = new F(*static_cast<const F*>(src->p));  // 克隆
  }
};

template<class R, class... Args>
class function_sketch {
  using manager_t = void (*)(storage&, const storage*, int);
  using invoker_t = R (*)(const storage&, Args&&...);

  storage   buf_{};
  manager_t manager_ = nullptr;
  invoker_t invoker_ = nullptr;

public:
  R operator()(Args... args) const {
    if (manager_ == nullptr) throw std::bad_function_call();
    return invoker_(buf_, std::forward<Args>(args)...);
  }
  explicit operator bool() const noexcept { return manager_ != nullptr; }
};
```

这个骨架保留了三个要点：判空靠管理器指针，调用靠调用器，克隆与销毁靠管理器。真实实现还要处理本地存储的构造与析构、移动时置空源对象、`target` 的类型比较，以及不同签名之间的转换构造。

本地存储的判定可以写成一行常量表达式：

```cpp
template<class F>
inline constexpr bool stored_locally =
    std::is_trivially_copyable_v<F> && sizeof(F) <= sizeof(storage)
    && alignof(storage) % alignof(F) == 0;
```

### 3.5 复制与移动的路径

复制走管理器的克隆操作：本地存储用 placement new 在目标缓冲区里构造副本，堆存储用 `new` 分配并构造。移动有两种处理：本地存储按字节复制或逐对象移动构造，堆存储只搬指针。libstdc++ 与 MSVC 在移动后把源对象置空，因此移动的开销与目标是否在缓冲区无关，都是常数时间。

复制赋值采用「构造临时对象再交换」，代价是一次额外的构造与析构。移动赋值释放原目标后接管新目标，因此可以做到不抛。

---

## 4. 三家实现

### 4.1 libstdc++

`bits/std_function.h` 的 `_Function_base` 有两个成员：`_Any_data _M_functor` 与 `_Manager_type _M_manager`；`function` 再追加 `_Invoker_type _M_invoker`。缓冲区的大小由 `_Nocopy_types` 决定，它是四个指针类成员的联合体；成员函数指针在 Itanium ABI 下占 16 字节，因此缓冲区为 16 字节。LP64 平台上对象总大小为 32 字节。

`_Function_handler<签名, 目标类型>` 为每个组合生成 `_M_manager` 与 `_M_invoke`，后者调用 `std::__invoke_r<_Res>`，因此返回类型允许隐式转换。`_M_manager` 用 `switch` 处理四个操作码，`__get_functor_ptr` 在本地存储时返回缓冲区地址，在堆存储时返回保存的指针。

移动构造直接把联合体按字节复制，再接管管理器与调用器指针并把源置空。复制赋值是「构造临时对象再 `swap`」，移动赋值标了 `noexcept`，强于草案的要求。`target<T>()` 先比管理器地址再比 typeid，`target_type()` 通过管理器取得 typeinfo。

### 4.2 MSVC STL

`functional` 的 `_Func_base` 是带六个纯虚函数的抽象基类，`_Func_impl_no_alloc` 与 `_Func_impl` 是它的两个实现：前者用于普通构造，后者在构造时携带分配器，供 `packaged_task` 复用。`_Func_class` 持有一个 `_Storage` 联合体，里面是指针数组，最后一个元素存放实现对象的指针。

本地与堆的分界由 `_Is_large` 决定：实现对象大于缓冲区、对齐超过 `max_align_t`、或移动构造可能抛，三者任一成立就分配到堆上。`_Local()` 通过比较实现指针与缓冲区地址判断目标是否在本地；`_Swap` 在任一侧为本地存储时改走三次移动，因为直接交换两个含本地目标的缓冲区会破坏内部指针。

分配器扩展由 `_HAS_FUNCTION_ALLOCATOR_SUPPORT` 门控，该宏在 `yvals_core.h` 中定义为 `!_HAS_CXX17`，即只在 C++14 及更早模式提供。

### 4.3 libc++

libc++ 把类型擦除拆成两层：`__base` 是声明调用、克隆、销毁与取类型的抽象基类；`__policy` 是一份按目标类型实例化的静态表，保存克隆、销毁、取类型与取指针的函数指针。`std::function` 建立在 `__value_func` 一类设施之上，对象里放缓冲区、基类指针与调用器指针。

这种分层让「本地存储」与「堆存储」共用同一套调用路径，代价是每个目标类型多一份策略表实例。缓冲区大小与本地存储判据在 libc++ 的历史上调整过，本文不引用具体数值与行号，只按结构描述。

### 4.4 对照

| 维度 | libstdc++ 16.2 | MSVC STL 14.51 | libc++ |
| --- | --- | --- | --- |
| 分派方式 | 两个函数指针 | 抽象基类加虚函数 | 基类加策略表 |
| 缓冲区 | 16 字节 | 56 字节（x64） | 随版本变化 |
| 本地存储判据 | 可平凡复制、对齐整除 | 大小、对齐、移动不抛 | 随版本变化 |
| 对象大小（x64） | 32 字节 | 64 字节 | 随版本变化 |

差异集中在工程取舍：缓冲区大小换取分配次数，虚表与函数指针的选择换取调用路径的形态，判据的松紧换取可存储类型的范围。标准层的语义三家一致。

### 4.5 ABI

`sizeof(std::function)` 由实现定义，32 与 64 字节的差距会传导到按值传参、结构体布局与缓存占用。布局本身是 ABI 的一部分：libstdc++ 与 MSVC 都把它当作二进制接口固定下来，改动等于破坏兼容性，因此缓冲区大小与字段顺序一旦发布就难以调整。

跨模块传递 `std::function` 需要同一套标准库、同一 ABI 与一致的构建选项。两个用不同 STL 编译的目标文件互相传递 `std::function` 属于未定义行为，症状通常是销毁时崩溃而不是链接错误。

---

## 5. const 正确性与分配器

### 5.1 operator() 的 const

`operator()` 声明为 const，目标却按非 const 路径访问。N4348 把这一点写成缺陷：包装的 const 成员函数间接调用了目标的非 const 操作，既违反 const 的语义，也违反 `[res.on.data.races]` 对标准库函数不得间接修改可通过 const 参数访问的对象的要求。

实现层面的证据很直接：libstdc++ 的 `_M_invoke` 接收 `const _Any_data&`，再通过 `const_cast` 取回 `_Functor*`；MSVC 的 `_Do_call` 本身不是 const 成员函数，`operator()` 里用 `const_cast` 去掉 `_Data` 的 const。两家都在类型系统之外恢复了对目标的可写访问。

后果有三条：`const std::function` 可以修改其目标，因此不能把 const 引用当作「不修改目标」的承诺；多个线程并发调用同一个 `std::function` 且目标写入自身状态时构成数据竞争；把 `std::function` 放进只读数据结构并不能阻止回调修改捕获的变量。

### 5.2 签名不能表达限定符

`std::function` 的模板参数只能是 `R(Args...)` 形式的函数类型。`function<int() const>` 不存在，`function<int() &>` 也不存在。C++17 起 noexcept 成为函数类型的一部分，`function<void() noexcept>` 无法匹配偏特化，主模板未定义，实例化即出错；MSVC 另加静态断言，在诊断信息中说明不接受 noexcept 函数类型。

结果是签名层面的 const、引用与 noexcept 信息全部丢失。一个只读回调与一个可写回调在类型上无法区分，一个不抛的回调与一个可能抛的回调也无法区分。`move_only_function` 的设计动机之一就是补上这三类限定符。

### 5.3 分配器支持的历史

C++11 给 `function` 增加了 `allocator_arg_t` 构造与 `uses_allocator` 特化，设想是让包装在分配目标时使用调用方提供的分配器。实际执行出现了三方分歧，P0302R1 对此有明确记录：

- GCC 的标准库从未提供这些构造函数。
- libc++ 声明了构造函数但忽略分配器实参。
- MSVC 在构造时使用分配器，但在赋值替换目标后不复用原分配器，因此不支持分配器传播。

语义上的困难在于类型擦除与分配器的组合：复制赋值需要取回原分配器，而分配器本身被擦除在目标类型里。相关的 LWG 议题包括 2385、2386、2501、2502，多数没有形成可实施的方案。P0302R1 选择整体移除，C++17 起这些构造函数不再存在。

MSVC 只在 C++14 及更早模式保留这套接口，宏名为 `_HAS_FUNCTION_ALLOCATOR_SUPPORT`；其内部的分配器感知实现 `_Func_impl` 仍在使用，服务于 `packaged_task`。libstdc++ 已完全删除。

需要控制分配的场景不应依赖 `std::function`。可行做法是用 `std::pmr` 容器管理回调集合，或自建类型擦除设施，把分配器作为擦除状态的一部分保存。

---

## 6. 可复制要求与 move-only

### 6.1 要求与后果

复制 `std::function` 必须复制目标，因此目标必须可复制。捕获 `std::unique_ptr`、`std::promise`、`std::thread` 的 lambda 无法存入，捕获 `std::shared_ptr` 则可以。这条要求在 C++11 的年代影响有限，在移动语义普及之后成为主要限制。

可复制性由静态断言检查，不参与重载决议。libstdc++ 的构造函数约束只检查可调用性与返回类型转换，复制性检查放在函数体内；MSVC 的 `_Enable_if_callable_t` 同样只检查可调用性。因此 `std::is_constructible` 一类的查询可能给出肯定答案，直到实际构造实例化函数体才报错。泛型代码若要用 SFINAE 排除不可复制的目标，需要自己加 `is_copy_constructible` 判断。

### 6.2 绕法与其代价

| 绕法 | 语义 | 代价 |
| --- | --- | --- |
| 捕获 `shared_ptr` | 共享所有权 | 一次分配与引用计数开销 |
| `std::ref` 包装 | 借用，不复制 | 生命周期需自行保证 |
| 自定义可复制包装 | 复制时共享或抛异常 | 偏离值语义 |
| 改用 `move_only_function` | 只移动 | 需要 C++23 |

前三行都在「让目标看起来可复制」上做文章，代价是语义变化。第四行改变包装类型，是唯一不改变目标语义的方案。

### 6.3 move_only_function 的设计

P0288R9 定义的 `move_only_function` 与 `std::function` 有四处差异：只可移动；修掉 const 正确性问题；支持带 cv、ref、noexcept 限定符的签名；不提供 `target_type` 与 `target`。第四点容易被忽略，它是提案概述中明确列出的设计决定。

签名形如 `R(Args...) cv ref noexcept(noex)`，`operator()` 带上同样的限定符与 noexcept 规格。调用语义见 `[func.wrap.move.inv]/3`：把目标 `static_cast` 到签名对应的 `inv-quals` 再执行 `INVOKE<R>`。const 签名只能调用 const 成员，右值签名只能调用右值限定的成员，noexcept 签名则真正声明不抛。

空调用的处理也随之改变：`[func.wrap.move.inv]/2` 把「有目标」写成前置条件，违反即未定义行为，不再抛 `bad_function_call`。这是 noexcept 签名能够成立的前提，也意味着每次调用省掉一次判空分支。

小对象优化的判据在 `[func.wrap.move.class]/2` 的注中给出：只有移动构造不抛的类型才能放进缓冲区；否则包装的移动构造可能抛，破坏只移动包装的常数时间移动保证。

移动赋值在草案的类摘要中没有 `noexcept`。MSVC 的实现注释写明这是故意留出的余地，便于将来加入分配器支持。

### 6.4 copyable_function 与 function_ref

C++26 工作草案在 `[func.wrap.copy]` 与 `[func.wrap.ref]` 中加入两个新包装。

`copyable_function`（P2548R6）是 const 正确的可复制包装：签名携带限定符，复制语义保留，接口与 `move_only_function` 对齐。它被视为 `std::function` 的长期替代品。

`function_ref`（P0792R14）是非拥有包装：构造时不复制目标，不做分配，只保存一个指针与一个调用器指针。代价是生命周期完全由使用者保证，悬垂引用不会被检测。

实现进度有差异：libstdc++ 16.2 已实现三者，公共部分在 `bits/funcwrap.h`，`move_only_function` 与 `copyable_function` 的按签名特化分别位于 `bits/mofunc_impl.h` 与 `bits/cpyfunc_impl.h`，两者共享 `_Mo_base` 基类，`move_only_function` 用单个管理器指针加 16 字节存储实现；MSVC 14.51 只提供 `move_only_function`，其布局复用 `std::function` 的 64 字节结构。

---

## 7. 与替代方案的对比

### 7.1 函数指针

函数指针没有状态、可以比较、可以为空、可以在调用点做内联优化。它不能捕获，也不能保存有状态的调用对象。回调只需要一个自由函数且没有状态时，函数指针是最省的选择。

### 7.2 模板参数与 lambda

把可调用对象作为模板参数传递，调用点能看到具体类型，编译器可以做内联优化，也不产生分配。代价是类型进入签名：每个 lambda 类型都产生一份实例化，无法把不同类型的回调放进同一个容器。头文件接口暴露实现类型，编译期成本随之上升。

### 7.3 虚接口

定义抽象基类、让调用方实现 `operator()`，得到的是显式类型、明确的生命周期与可调试的调用栈。代价是需要继承、通常需要堆分配，调用是一次虚调用，与 `std::function` 的间接调用同级。接口需要多组操作（调用之外还有取消、状态查询）时，虚接口比单一调用包装更合适。

### 7.4 对比与选型

| 形态 | 状态 | 单次调用开销 | 可复制 | 调用点内联优化 |
| --- | --- | --- | --- | --- |
| 函数指针 | 无 | 一次间接调用 | 是 | 可以 |
| 模板参数 | 任意 | 可为零 | 取决于类型 | 可以 |
| 虚接口 | 有 | 一次虚调用 | 取决于实现 | 通常不可以 |
| `std::function` | 有 | 判空加一到两次间接调用 | 是 | 不可以 |
| `move_only_function` | 有 | 一到两次间接调用 | 否 | 不可以 |

选择规则可以收敛为三条：

- 回调在编译期已知且类型不需要统一，用模板参数或函数指针，不必引入类型擦除。
- 需要运行时决定回调、需要存储或传递、且回调可复制，用 `std::function`。
- 回调捕获只移动对象，或需要把 const、引用、noexcept 限定符写进类型，用 `move_only_function`。

---

## 8. 性能与 ABI

### 8.1 调用成本

`std::function` 的调用由三部分组成：判空分支、经调用器指针的间接调用、目标自身的 `operator()`。目标若是普通函数指针，第二次调用也是一次间接调用；目标若是 lambda，编译器无法跨越类型擦除边界做内联优化。

SBO 只影响构造与复制，不影响调用。把目标放进缓冲区省掉一次分配，间接调用的次数不变。这是选型时最容易混淆的一点：小对象优化解决的是分配，不是分派。

### 8.2 构造与复制成本

本地存储在构造时执行一次复制或移动构造，不分配；堆存储执行一次分配加一次构造。复制时本地存储走一次复制构造，堆存储走一次分配加一次复制构造。复制赋值采用「构造临时对象再交换」，因此比复制构造多一次析构。

移动是常数时间：本地存储搬移缓冲区内容，堆存储只搬指针。libstdc++ 与 MSVC 在移动之后把源对象置空，其他实现只需保证源对象处于有效状态。

### 8.3 尺寸与传参

libstdc++ 与 MSVC 的对象在 x64 上分别为 32 字节与 64 字节，空对象也占满整个缓冲区。按值传参会复制整个对象，按 const 引用传参避免复制但保留间接调用。把 `std::function` 放进结构体时，它的尺寸会影响结构体布局与缓存行占用。

跨模块边界传递需要同一套标准库与一致的构建选项。作为公开接口的参数类型时，`std::function` 把标准库 ABI 暴露给了调用方；库接口需要长期稳定时，可以用函数指针加 `void*` 上下文，或定义自己的抽象接口。

### 8.4 何时值得

值得使用的场景：回调在运行时注册、数量少、调用频率远低于构造频率；需要把不同类型的回调放进同一个容器；接口需要接受任意可调用对象而不暴露模板。

不值得的场景：回调在编译期已知，模板参数即可；调用在热路径且每次调用的工作量很小，间接调用与判空成为主要成本；需要精确控制分配。

---

## 9. 常见误用

### 9.1 清单

| 写法 | 问题 | 修正 |
| --- | --- | --- |
| 捕获局部变量的引用后长期保存 | 目标销毁后悬垂 | 按值捕获，或用 `shared_ptr` 共享 |
| 捕获 `this` 的回调存进长生命周期对象 | 对象销毁后悬垂 | 用 `weak_ptr` 检测，或显式注销 |
| 默认构造后直接调用 | 抛 `bad_function_call` | 调用前检查 `operator bool` |
| 用 `std::function` 作函数参数 | 间接分派，无法做内联优化 | 改用模板参数 |
| 把 lambda 先转成 `std::function` 再传给模板 | 多一次擦除与可能的分配 | 直接传 lambda |
| 依赖 `target<T>()` 取回引用类型 | 存储时按 `decay` 处理 | 取回值类型，或改用 `reference_wrapper` |
| 对 `const std::function&` 假设目标不被修改 | 目标按非 const 路径调用 | 需要只读调用时用 `move_only_function` 的 const 签名 |
| 捕获 `unique_ptr` | 目标不可复制 | 改用 `shared_ptr` 或 `move_only_function` |

### 9.2 生命周期

`std::function` 不延长捕获对象的寿命。捕获引用的 lambda 存入 `std::function` 后，包装的生命周期一旦超过被引用对象，调用就是悬垂访问。捕获 `this` 的成员函数回调是同一问题的常见形式：对象在回调被调用之前销毁，回调仍然持有失效的指针。

可靠的写法有三种：按值捕获需要的数据；用 `shared_ptr` 与 `weak_ptr` 表达所有权；在对象析构时显式注销回调。标准库不提供自动注销机制，注销责任在持有回调的一侧。

### 9.3 空状态

默认构造的 `std::function` 是空对象，调用抛 `bad_function_call`，不检查就调用会把「未设置回调」变成运行期异常。以空函数指针或空成员指针构造同样得到空对象，这一点在把 C 风格回调表转成 `std::function` 时容易忽略。

工厂函数返回 `std::function` 时，返回空对象表示失败是一种常见约定，调用方需要检查。`bad_function_call` 继承自 `std::exception`，`what()` 的文本由实现定义，不应被解析。

### 9.4 过度使用

把 `std::function` 用作函数参数是最常见的过度使用：模板参数能接受任意可调用对象且不产生擦除，只有需要在函数内部存储回调、或需要避免模板实例化扩张时，参数才应写成 `std::function`。

另一种形式是先把 lambda 转成 `std::function` 再传给模板函数。这一步会引入一次擦除、可能的一次分配，并让编译器失去内联优化的机会，收益通常为零。

---

## 10. 演进

### 10.1 版本变化

| 版本 | 与 `std::function` 相关的变化 |
| --- | --- |
| C++11 | 从 TR1 与 Boost.Function 引入；分配器扩展构造；`bad_function_call` |
| C++17 | P0302R1 移除分配器支持；P0012R1 让 noexcept 进入函数类型，`function<void() noexcept>` 不能实例化 |
| C++20 | 移除 `operator!=` 与 `nullptr == f`，只保留 `f == nullptr` |
| C++23 | `move_only_function`（P0288R9） |
| C++26 | `copyable_function`（P2548R6）、`function_ref`（P0792R14）进入工作草案 |

### 10.2 提案脉络

C++11 的 `std::function` 直接来自 TR1 的 `std::tr1::function`，后者与 Boost.Function 同源。C++11 版本带上了分配器扩展，其后的十五年里这套扩展没有形成可移植的语义，P0302R1 因此在 C++17 整体移除。

P0012R1 把 noexcept 变成函数类型的一部分，副作用是 `std::function` 无法接受 noexcept 签名。这一限制在 C++23 由 `move_only_function` 解决，P0288R9 明确把「支持 cv、ref、noexcept 限定符」与「修掉 const 正确性问题」列为差异项。

P2548R6 与 P0792R14 把同一套限定符机制分别用于可复制包装与非拥有包装。三份提案的共同点是放弃分配器支持，把分配控制交给外部设施。

### 10.3 现状

工作草案中四个包装并存：`function` 保持兼容，`copyable_function` 提供 const 正确的可复制版本，`move_only_function` 提供只移动版本，`function_ref` 提供非拥有版本。`std::function` 没有移除计划，已有代码的迁移不是必须的。

实现进度不一致：libstdc++ 16.2 已提供后三者，MSVC 14.51 只提供 `move_only_function`。以 `copyable_function` 作为公共接口的类型时，需要确认目标编译器与标准库版本。

---

## 11. 结论

`std::function` 的语义可以压缩成一句话：一个可复制的、可存储任意可调用对象的调用包装，代价是每次调用一次间接分派与一次判空。围绕这句话可以给出四条规则：

1. 目标必须可复制。捕获只移动对象时，改用 `shared_ptr` 表达共享所有权，或改用 `move_only_function`。
2. 空状态必须显式处理。默认构造、空指针构造、工厂返回都可能产生空对象，调用前的判断是调用方责任。
3. `const std::function` 不承诺目标不被修改。需要只读调用语义时，用 `move_only_function` 的 const 签名，或在包装外自己保证。
4. 编译期已知的回调用模板参数或函数指针，不必引入类型擦除；需要运行时注册与同质存储时再选 `std::function`。

类型擦除的代价不在某一次调用，而在信息丢失：目标类型、限定符、是否分配都在构造时被压缩成两个函数指针。理解这一点，选型与排错都有了依据。

---

## 参考

- 标准条款：`[func.def]`、`[func.wrap]`、`[func.wrap.badcall]`、`[func.wrap.func.general]`、`[func.wrap.func.con]`、`[func.wrap.func.mod]`、`[func.wrap.func.cap]`、`[func.wrap.func.inv]`、`[func.wrap.func.targ]`、`[func.wrap.func.nullptr]`、`[func.wrap.func.alg]`、`[func.wrap.move]`、`[func.wrap.move.class]`、`[func.wrap.move.inv]`、`[func.wrap.copy]`、`[func.wrap.ref]`、`[res.on.data.races]`。
- 直达形式：<https://eel.is/c++draft/func.wrap.func>、<https://eel.is/c++draft/func.wrap.func.con>、<https://eel.is/c++draft/func.wrap.func.inv>、<https://eel.is/c++draft/func.wrap.func.targ>、<https://eel.is/c++draft/func.wrap.move>、<https://eel.is/c++draft/func.wrap.copy>、<https://eel.is/c++draft/func.wrap.ref>、<https://eel.is/c++draft/func.def>。
- 历史草案：N4861（C++20）、N4950（C++23），取自 cplusplus/draft 对应标签；版本对照只用于说明措辞与段号变化。
- 提案与缺陷报告：P0012R1（Add noexcept to the function type system）、P0302R1（Removing Allocator Support in std::function）、P0288R9（move_only_function）、P2548R6（copyable_function）、P0792R14（function_ref: a type-erased callable reference）、N4348（Making std::function safe for concurrency）、LWG 2062、LWG 2385、LWG 2501、LWG 2502。
- 实现源码：libstdc++ 16.2.0（`bits/std_function.h`、`bits/funcwrap.h`、`bits/invoke.h`）、MSVC STL 14.51（`functional`、`typeinfo`、`yvals_core.h`）、libc++（`__functional/function.h`）。
- 标准库文档：<https://en.cppreference.com/w/cpp/utility/functional/function>、<https://en.cppreference.com/w/cpp/utility/functional/move_only_function>、<https://en.cppreference.com/w/cpp/utility/functional/copyable_function>、<https://en.cppreference.com/w/cpp/utility/functional/function_ref>。
