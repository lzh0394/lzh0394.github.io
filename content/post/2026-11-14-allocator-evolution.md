---
title: "标准库分配器的演化：从类型参数到 traits、pmr 与常量求值"
slug: "allocator-evolution"
date: "2026-11-14"
categories: ["编程语言"]
tags: ["C++", "标准库", "分配器", "WG21"]
draft: false
summary: "从 C++98 的容器类型参数，到 C++11 的 allocator_traits、C++17 的 pmr，再到 C++20 的 constexpr 与 C++23/26 的容量反馈：梳理分配器模型的五次演化、五组张力与三家实现的落地差异。"
---

> 副标题：C++98 至 C++26 的分配器模型变迁、提案脉络与实现启示。
>
> 证据口径：以 WG21 提案、标准工作草案与三家实现的官方状态页为主，不依赖本机实测；提案编号、标题与日期经 wg21.link 核对，标准版本归属用 cppreference 的 since 标记交叉验证。
>
> 基线：2026-11。C++26 为当前基线，C++29 为在研前沿；文中「当前」均指这一口径。
>
> 生成说明：本文底稿由 AI 辅助整理，事实、提案编号与链接经抽样核对；关键决定请以标准文本与官方文档为准。

## 0. 结论摘要

1. 标准库分配器的演化不是接口增补史，而是三次「把分配策略放在哪里」的重画：C++98 把策略放进容器类型参数，C++11 把它抽成 traits 协议，C++17 把它放到运行期对象（`std::pmr::memory_resource`）。C++20 之后进入收缩期：只保留最小接口，并补上常量求值与容量反馈。
2. C++98 的失败点不在「抽象多余」，而在抽象把分配策略编码进了类型。`vector<T, A1>` 与 `vector<T, A2>` 是不同类型，运行期无法替换；有状态分配器无法跨接口传播；1998 年埋下的 `rebind`、`construct`、`destroy`、`address`、`max_size` 等成员把实现细节压给每个分配器作者。N1850（2005）把这些问题写成正式提案动机。[提案 N1850]
3. 从 N1850 到 C++11 不是一步到位：N2525（分配器相关的 swap 与 move）与 N2554（scoped allocator 模型）在 2008 年 Bellevue 会议上先被采纳；随后 concepts 方案（N2768、N2840、N2908）试图简化，但 concepts 在 2009 年法兰克福会议上被移出核心语言，N2982（2009-10）改以 `allocator_traits` 重新实现同一目标。[提案 N2525、N2554、N2982]
4. `allocator_traits` 是 C++11 的关键转折：分配器的所有成员都变为可选，缺失时由 traits 给出默认值；容器只通过 traits 访问分配器。N2982 给出的最小接口是 `value_type`、构造函数、模板转换构造、`allocate`、`deallocate`；分配器要求中的相等比较仍由 [allocator.requirements] 的表格规定。N2982 称 `allocator_traits` 为与 `iterator_traits` 同构的「适配点」。[提案 N2982][标准 allocator.traits]
5. C++11 同时建立传播协议：`propagate_on_container_copy_assignment`、`propagate_on_container_move_assignment`、`propagate_on_container_swap` 默认全为 `false`，`select_on_container_copy_construction` 默认返回原分配器；`is_always_equal` 在 C++17 由 N4258 补入，默认取 `is_empty`。这组协议把「有状态」从不可说变成可声明。[标准 allocator.traits][提案 N4258]
6. `scoped_allocator_adaptor`（N2554）解决嵌套容器的多级分配器传播，但要求类型层级显式编码每一层分配器。C++17 的 pmr 用运行期多态覆盖同一需求，且默认让元素沿用外层资源，scoped 适配器此后成为边缘设施。[提案 N2554、N3916]
7. pmr 是第二次范式转换。`memory_resource` 提供虚接口，`polymorphic_allocator` 只持有资源指针，于是同一静态类型可在运行期表现为不同分配策略；代价是它的传播 traits 全为 `false`、拷贝构造回落到默认资源、资源生命周期完全由使用者负责，拷贝赋值被删除（P0337R0）。[提案 N3916、P0337R0][标准 memory.resource]
8. C++20 做减法与下沉。P0619R4 删除 `allocator<void>` 与 `pointer`、`rebind`、`construct`、`destroy`、`address`、`max_size` 等历史成员，但接受 P0619R4 自身的建议保留 `size_type` 与 `difference_type`；同一轮提案把分配与对象生存期操作变成 `constexpr`（P0784R7），使 `constexpr vector` 与 `constexpr string` 成为可能。[提案 P0619R4、P0784R7]
9. C++23 的 `allocate_at_least` 把「分配器可能给出比请求更大的块」写进协议：`allocation_result` 同时返回指针与实际容量，容器可据此把 capacity 对齐到真实分配大小，减少重分配（P0401R6）。同一版本禁止用户特化 `allocator_traits`（P2652R2），协议从「可扩展」转为「封闭」。[提案 P0401R6、P2652R2]
10. C++26 进入收尾与延伸：移除被 LWG 3170 弃用的 `allocator::is_always_equal`（P2868R3），撤回 `polymorphic_allocator::destroy` 的弃用（P2875R4），并把分配器语义带入 operation state、`promise`/`packaged_task` 与任务模型（P3433R1、P3503R3、P3980R1；后三项的采纳状态与归属见 7.4 与第 11 节）。[提案 P2868R3、P2875R4、P3433R1、P3503R3、P3980R1]
11. 五组张力贯穿全程：状态性 vs 类型同一性；编译期多态 vs 运行期多态；抽象成本 vs 分配信息（fancy pointer、size feedback、过度对齐）；向后兼容 vs 接口清洁；运行期分配 vs 常量求值。每次范式转换都是把其中一组张力的代价转移到另一组，而不是消灭它。
12. 对从零实现标准库的项目，可执行的结论是：先写 `allocator_traits` 与传播矩阵，再写容器；把 constexpr、对齐与 `allocate_at_least` 当作容器骨架的一部分；pmr 与 scoped 适配器可以排后，但协议形状必须一次定对；不要重新发明「把分配策略写进容器类型」的旧模型。

---

## 1. 范围、口径与分期

### 1.1 讨论对象

本文把「标准库分配器」拆成四层，后文的演化分析围绕这四层展开：

| 层 | 内容 | 演化主线 |
| --- | --- | --- |
| 概念层 | Allocator 具名要求、AllocatorAwareContainer 行为 | C++98 的成员要求 → C++11 的可选要求 + 默认值 |
| 访问层 | `std::allocator_traits` | 从「直接调用分配器成员」变为「唯一访问点」 |
| 实现层 | `std::allocator`、`std::pmr::polymorphic_allocator`、`std::scoped_allocator_adaptor`、内存资源 | 无状态默认分配器 → 有状态模板分配器 → 运行期多态资源 |
| 下游 | 容器、字符串、智能指针的分配器感知构造与传播 | 传播规则、嵌套容器、`allocate_shared`、pmr 别名 |

不在本文范围：`shared_ptr` 控制块布局、`operator new`/`operator delete` 的完整家族、第三方分配器（jemalloc、tcmalloc 等）、GC 接口、`std::function` 等类型擦除设施的完整分配器语义。

### 1.2 事实分级与日期口径

| 标记 | 含义 | 本文用法 |
| --- | --- | --- |
| [标准] | ISO C++ 标准或工作草案的可观察要求 | 引用条款名（如 `[allocator.traits]`），不逐段抄录 |
| [提案] | WG21 提案、缺陷报告或会议决议 | 给出编号、标题与日期，链接集中在附录 C |
| [实现] | GCC、Clang/libc++、MSVC 的官方状态页或发布说明 | 只写官方公布的采纳版本，不写本机探测结果 |
| [推断] | 本文的工程判断 | 明确写出取舍与风险 |

提案日期采用论文标注的发布或会议日期；「进入哪个标准版本」以 cppreference 的 since 标记与 libc++ 状态表中的 `Papers.csv` 交叉核对，两者冲突时以标准草案条款与特性测试宏为准，并在「未决问题」中列出。

### 1.3 分期

下表是本文的叙事分期，不是 WG21 的官方分类。

| 代 | 标准 | 一句话概括 | 标志性设施 |
| --- | --- | --- | --- |
| 第一代 | C++98/03 | 分配策略被写进容器类型 | `std::allocator<T>`、`rebind`、`construct`/`destroy` |
| 第二代 | C++11/14 | 协议抽成 traits，成员可选 | `allocator_traits`、传播 traits、`uses_allocator`、`scoped_allocator_adaptor` |
| 第三代 | C++17 | 策略搬到运行期对象 | `memory_resource`、`polymorphic_allocator`、`std::pmr` |
| 第四代 | C++20/23 | 收缩接口、常量求值、容量反馈 | 成员移除、constexpr 分配、`allocate_at_least` |
| 第五代 | C++26/29 | 收尾与向任务模型延伸 | 移除别名、撤回弃用、operation state 与任务分配器 |

### 1.4 一个提醒

本文频繁使用「失败」「成功」这类判断词。它们指的是设计目标是否达成，不是对当事人工作的评价：C++98 的分配器模型在 1998 年的语言与实现条件下是合理选择；它的问题只有在模板、变参模板、`decltype` 与大规模跨模块使用成熟之后才充分暴露。

---

## 2. 演化总表

| 标准 | 新增或变更 | 关键提案 | 解决的问题 | 遗留或新引入的问题 |
| --- | --- | --- | --- | --- |
| C++98 | `std::allocator<T>`、allocator 成员要求、容器以分配器为模板参数 | — | 让容器把内存模型参数化 | 类型爆炸、有状态分配器无传播规则、`rebind` 手工、无运行期选择 |
| C++11 | `allocator_traits`、传播 traits、`allocator_arg_t`、`uses_allocator`、`scoped_allocator_adaptor`、`pointer_traits` | N2525、N2554、N2982 | 最小分配器接口、有状态分配器可声明、嵌套容器可构造 | 分配器类型仍在容器类型里；传播规则复杂；历史成员仍在 |
| C++17 | pmr、`memory_resource`、`polymorphic_allocator`、过度对齐 new、弃用历史成员、移除 `std::function` 分配器支持 | N3916、P0035R4、P0174R2、P0302R1、N4258 | 运行期选择分配策略、过度对齐类型、接口清理 | 资源生命周期、传播能力受限、类型擦除后不可查询 |
| C++20 | 删除 `allocator<void>` 与冗余成员、constexpr 分配、`to_address`、uses-allocator 工具、`polymorphic_allocator<>` | P0619R4、P0784R7、P0653R2、P0591R4、P0339R6、P1165R1 | 编译期容器、最小接口、泛型工具 | 源兼容性破坏、constexpr 分配只能瞬时 |
| C++23 | `allocate_at_least`、`allocation_result`、禁止特化 `allocator_traits`、容器推导指南修正、`pmr::stacktrace` | P0401R6、LWG 3887、P2652R2、P1518R2、P2301R1 | 减少重分配、封闭协议、修正过度约束、补齐 pmr 别名 | 容器采纳需要时间；deallocate 计数契约更细；GCC 对 P2652R2 的支持滞后 |
| C++26 | 移除 `allocator::is_always_equal`、撤回 `polymorphic_allocator::destroy` 弃用、operation state 与任务分配器 | P2868R3、P2875R4、P3433R1、P3503R3、P3980R1 | 修正派生分配器的错误默认、把分配器接进执行模型 | 部分提案实现尚未落地；P3433R1/P3980R1 的采纳归属仍需核实 |

这张表的读法是：每一代只解决上一代最痛的一两个问题，同时把复杂度转移到别处。下一节开始按代展开。

---

## 3. 第一代：C++98 的 allocator 模型

### 3.1 设计意图

C++98 的分配器不是一个类，而是一组具名要求：分配器是「封装分配模型的类类型对象」，它同时描述指针类型、指针差值类型、大小类型以及分配与释放原语。容器、字符串与字符串缓冲区都以分配器为模板参数。[标准 allocator.requirements]

这个设计在当时是自然的：1990 年代的 STL 用模板参数表达策略，分配器就是「内存策略」的编译期参数；不同的分配模型（共享内存、池、调试分配器）通过替换分配器类型来选择。标准库只需要给出一个默认实现 `std::allocator<T>`，其余交给用户。

问题在于，设计者把两件事捆在了一起：内存来源与容器类型身份。

### 3.2 标准化后的形状

C++98 的 Allocator 要求包含下列成员（括号内为容器使用它的场景）：

| 成员 | 作用 |
| --- | --- |
| `value_type` | 被分配对象的类型 |
| `pointer`、`const_pointer`、`reference`、`const_reference` | 指针与引用类型（允许 fancy pointer，但见 3.3） |
| `size_type`、`difference_type` | 大小与差值类型 |
| `template rebind<U>::other` | 把分配器重绑定到另一种类型（容器为节点、内部缓冲区使用） |
| `allocate(n, hint)`、`deallocate(p, n)` | 分配与释放未初始化存储 |
| `construct(p, t)`、`destroy(p)` | 在已分配存储上构造与析构对象（C++11 起 `construct` 改为变参） |
| `max_size()`、`address(r)` | 最大可分配量、取地址 |
| `operator==`、`operator!=` | 分配器相等性（决定内存能否跨实例释放） |

容器实现必须通过 `rebind` 取得内部类型的分配器，例如 `list<T, A>` 的节点分配器是 `A::rebind<Node<T>>::other`；`vector<T, A>` 的分配器类型就是 `A`。这也意味着容器的 `get_allocator()` 返回的是用户传入的分配器，而节点分配用的是它的重绑定版本。C++98 的 `construct` 只接受单个 `const T&`，变参形式是 C++11 才加入的。

### 3.3 五个结构性问题

问题一：分配器类型进入容器类型。N1850（2005）在摘要中直接点明：标准委员会「没有考虑，或认为不重要」的一点是，用于实例化容器模板的分配器类型参数会影响容器的类型，使容器无法与「分配策略不同、其余类型相同」的容器互操作。项目需要的是按实例定制分配（per-instance allocator），而不是按类型定制。[提案 N1850]

其后果是连锁的：

- 两个模块各自用不同的池分配器实例化 `std::vector<int>`，得到的是两个不兼容的类型，无法跨接口传递；
- 想「运行时再决定用哪个分配器」在类型系统层面不可能，除非引入类型擦除或继承；
- 容器的 ABI 与模板实例化数量随分配器类型增长。

问题二：有状态分配器没有传播规则。C++98 允许分配器带状态，却没有规定容器拷贝、移动、交换时分配器怎么处理。LWG 431 与 N1599 指出：按当时的 `swap` 定义，同类型容器总能在常数时间内交换且不抛异常；但如果两侧是有状态分配器且不相等，`swap` 到底该交换分配器、线性搬移元素，还是直接未定义，标准没有答案。N2525 的措辞很直接：当时的「weasel wording」允许实现假设同类型分配器全部相等，而这必须被移除，有状态分配器才可能可移植地工作。[提案 N2525][缺陷 LWG 431]

问题三：成员要求对分配器作者过于沉重。每个分配器都要实现 `rebind`、`construct`、`destroy`、`address`、`max_size`，哪怕行为与默认实现完全一致。更糟的是，这些成员一旦写错，错误会以容器内部模板实例化的形式出现，诊断信息极长。

问题四：分配与构造耦合。`construct`/`destroy` 放在分配器上，容器就只能通过分配器构造元素，无法表达「这一层只负责内存，构造策略另说」。标准库因此也无法可靠地检测「这个分配器的 `construct` 就是 placement new，因此可以对平凡类型整块拷贝」——这正是 N2982 后来强调 `construct` 可选、可检测的价值所在。[提案 N2982]

问题五：fancy pointer 与 `allocator<void>` 的边角。C++98 的措辞允许实现假设分配器的 `pointer` 就是 `value_type*`，共享内存与可重定位内存等场景因此不可移植；同时，`allocator<void>` 特化提供 `void*`/`const void*` 指针类型，并承担「proto-allocator」角色（C++11 中 `allocate` 的 hint 参数就使用 `allocator<void>::const_pointer`）。两者都是类型系统不完整的补丁。[提案 N2982][标准 default.allocator]

### 3.4 为什么当时这样设计

把 1998 年的选择放回语境，它并不草率：

- 当时没有变参模板、`decltype` 与成熟的 SFINAE，写「检测成员是否存在、缺失则回退」的通用代码代价极高；直接要求成员反而简单。
- 没有 concepts，分配器语义只能靠文档与命名要求约束，无法把「哪些成员可选」写成语言机制。
- 标准库的目标是「最小公分母 + 可移植」，默认分配器无状态、可互换的假设让容器实现最简单。
- 编译期策略是 STL 的一贯风格，分配器作为模板参数与迭代器、比较器、哈希函数保持一致。

这些条件在 2005 年之后逐项改变：变参模板与扩展 SFINAE 成熟（N2982 明确以此为实现前提），大规模跨模块使用暴露出类型身份问题，C++11 又引入了移动语义与右值引用。分配器模型的重构因此成为可能。

### 3.5 小结

第一代模型能工作，但不可组合：它能表达「这个容器用哪种内存」，不能表达「这两个容器实例共享同一种内存，但类型相同」，也不能表达「拷贝这个容器时分配器怎么办」。这两条正是第二代的起点。

---

## 4. 第二代：C++11 的 traits 协议

### 4.1 从 N1850 到 N2982

C++11 的分配器重构不是一篇论文完成的，而是一条被 concepts 打断又重新接上的路线：[提案 N1850、N2525、N2554、N2982]

| 时间 | 文档 | 内容 | 结果 |
| --- | --- | --- | --- |
| 2005-08 | N1850 | 《Towards a Better Allocator Model》：按实例分配、容器元素共享分配器 | 提出方向，未直接采纳 |
| 2008-02 | N2525 | 分配器相关的 swap 与 move 行为：移除「同类型分配器全相等」的 weasel wording；当时提出的是四种 usage pattern traits，最终标准收敛为三个传播 traits | 2008 年被采纳（据 N2982 记述） |
| 2008-02 | N2554 | 《The Scoped Allocator Model》：嵌套容器的多级分配器与 uses-allocator 构造 | 2008 年被采纳（据 N2982 记述） |
| 2008–2009 | N2768、N2840、N2908 | 用 concepts 简化分配器与 pair 的构造 | 随 concepts 在法兰克福会议（2009-07）被移出核心语言而作废 |
| 2009-10 | N2982 | 《Allocators post Removal of C++ Concepts》：`allocator_traits`、`pointer_traits`、`uses_allocator`、scoped 适配器重新表述 | C++11 的基础 |

N2982 对自身的定位很清楚：它要「重新拿回 N2768 的简化」，但不用 concepts；并且因为变参模板与扩展 SFINAE 已经可用，这次可以完整实现。论文同时列出它要解决的缺陷报告：431、580、635、1075、1166、1172。[提案 N2982]

### 4.2 allocator_traits：适配点

N2982 称 `allocator_traits` 是整篇提案的拱心石（keystone）：它包含使用分配器所需的类型与静态成员函数，实质上取代了在法兰克福被移除的 Allocator concept。容器不再调用 `myalloc.allocate(n)`，而是调用 `allocator_traits<Alloc>::allocate(myalloc, n)`。[提案 N2982]

它的设计借用 `iterator_traits` 的模式：traits 是适配点，分配器是「可能只实现最小接口」的类型。N2982 给出的最小分配器只需要：

```cpp
template <class Tp>
class SimpleAllocator {
public:
  typedef Tp value_type;
  SimpleAllocator(ctor args);
  template <class T> SimpleAllocator(const SimpleAllocator<T>& other);
  Tp* allocate(std::size_t n);
  void deallocate(Tp* p, std::size_t n);
};
```

指针与引用类型、`rebind`、`construct`、`destroy`、`max_size` 全部变成可选，因为 traits 有默认实现。论文还指出一个后来被反复引用的收益：因为 `construct` 与 `destroy` 可选，实现（小心地）检测到它们不存在时可以做优化，例如对平凡类型用 `memcpy`。[提案 N2982]

### 4.3 traits 的默认值

下面两张表是 `std::allocator_traits` 主模板在成员缺失时的默认行为 [标准 allocator.traits]，它们也是实现者写 traits 时的验收清单：

| 成员 | 分配器未提供时的默认值 |
| --- | --- |
| `pointer` | `value_type*` |
| `const_pointer` | `pointer_traits<pointer>::rebind<const value_type>` |
| `void_pointer` | `pointer_traits<pointer>::rebind<void>` |
| `const_void_pointer` | `pointer_traits<pointer>::rebind<const void>` |
| `difference_type` | `pointer_traits<pointer>::difference_type` |
| `size_type` | `make_unsigned<difference_type>::type` |
| `propagate_on_container_copy_assignment` | `false_type` |
| `propagate_on_container_move_assignment` | `false_type` |
| `propagate_on_container_swap` | `false_type` |
| `is_always_equal`（C++17） | `is_empty<Alloc>::type` |

成员函数与操作的默认值：

| 成员 | 分配器未提供时的默认值 |
| --- | --- |
| `rebind_alloc<T>` | 分配器有 `rebind<T>::other` 则用之，否则把 `SomeAllocator<U, Args...>` 改写为 `SomeAllocator<T, Args...>` |
| `allocate(a, n)` | `a.allocate(n)` |
| `allocate_at_least(a, n)`（C++23） | 若 `a.allocate_at_least(n)` 良构则用之，否则返回 `{a.allocate(n), n}` |
| `deallocate(a, p, n)` | `a.deallocate(p, n)` |
| `construct(a, p, args...)` | 在 `p` 上以 `args...` 构造对象（C++20 起等价于 `construct_at`） |
| `destroy(a, p)` | 调用 `p->~T()`（C++20 起等价于 `destroy_at`） |
| `max_size(a)` | 若 `a.max_size()` 良构则用之，否则 `numeric_limits<size_type>::max() / sizeof(value_type)` |
| `select_on_container_copy_construction(a)` | 若 `a` 有同名成员则调用，否则返回 `a` |

`std::allocator` 自己则声明 `propagate_on_container_move_assignment = true_type`（C++14 起由缺陷报告 LWG 2103 补入）与 `is_always_equal = true_type`（C++17 起由 N4258 引入；C++23 弃用、C++26 移除，见 7.4）。表中 `is_always_equal` 的默认值是 C++17 才加入的，动机是让「无状态分配器」有一个可声明的标记，供容器跳过逐元素搬移。

### 4.4 传播协议

C++11 用三个 traits 回答「容器做这四种操作时，分配器跟不跟着走」：

| 容器操作 | 分配器是否传播 | 若传播 | 若不传播 |
| --- | --- | --- | --- |
| 拷贝赋值 | `propagate_on_container_copy_assignment` | 先按目标分配器释放旧存储，再拷贝赋值分配器，再分配 | 目标保留自己的分配器；必要时释放并重分配 |
| 移动赋值 | `propagate_on_container_move_assignment` | 直接接管源存储与分配器 | 分配器相等则接管；不相等则逐元素移动 |
| `swap` | `propagate_on_container_swap` | 交换分配器 | 分配器相等则交换存储；不相等则行为未定义 |
| 拷贝构造 | 不适用 | — | 通过 `select_on_container_copy_construction` 决定新分配器（默认返回源分配器） |

另有 `is_always_equal` 作为优化提示：若为 `true`，容器可以跳过「分配器是否相等」的运行时比较，直接接管存储。它的动因是 LWG 2108《No way to identify allocator types that always compare equal》（2011），N4258 以这个 trait 回应。它对移动赋值尤其重要：「不相等且不传播」是唯一必须逐元素移动的路径，N4258 因此把容器移动赋值的 `noexcept` 条件写成「`propagate_on_container_move_assignment` 为真，或 `is_always_equal` 为真」。[标准 allocator.traits][提案 N4258]

这组协议解决了两件事：第一，有状态分配器第一次有了可移植的拷贝、移动、交换语义；第二，分配器作者通过几个 `using` 声明就能选择行为，不必重写容器。它也带来了新的复杂度：四种操作 × 三个 traits × 相等性判断，任何一项写错都可能导致「用 A 分配、用 B 释放」的未定义行为，因此成为容器实现最容易出错的区域之一。[推断]

### 4.5 分配器感知构造

`allocator_traits` 只解决「内存从哪来」，不解决「元素自己的分配器从哪来」。对 `vector<map<string, int>>` 这样的嵌套容器，外层分配器必须传给内层容器，否则内层会退回默认分配器。C++11 用两套机制表达这件事：

1. `uses_allocator<T, Alloc>`：若 `T` 有 `allocator_type` 且可由 `Alloc` 转换，则为 `true`。真正构造时按三种约定之一传入分配器：`T(allocator_arg, alloc, args...)`（前置约定）、`T(args..., alloc)`（后置约定）、或忽略分配器。`allocator_arg_t` 是前置约定的标签类型。[标准 allocator.uses]
2. `scoped_allocator_adaptor<OuterAlloc, InnerAllocs...>`：N2554 引入的多级适配器。容器用 `OuterAlloc` 分配元素；若元素自身是容器，则用第一个内层分配器；再嵌套则用第二个，以此类推；内层分配器用尽后重复最后一个。`pair` 被特别当作「容器」处理。[提案 N2554][标准 scoped.allocator]

`scoped_allocator_adaptor` 能工作，但把「嵌套几层、每层用什么分配器」编码进类型，使用与阅读成本都高；C++17 的 pmr 用运行期资源指针覆盖同一需求，并让 `polymorphic_allocator::construct` 自动做 uses-allocator 构造，scoped 适配器从此退居边缘（见 5.6）。

### 4.6 这一代解决了什么，留下了什么

解决：最小分配器接口、默认值、传播协议、嵌套容器构造、fancy pointer 的正式支持（`pointer_traits`）、有状态分配器的可移植语义。C++11 的分配器因此可以真正写成「只分配内存」的无状态类，也可以写成带池、带审计的有状态类。[标准 allocator.requirements]

留下：分配器类型仍进入容器类型（N2982 没有解决，也无意解决）；传播协议复杂；`std::allocator` 仍保留 `allocator<void>`、`pointer`、`rebind`、`construct`、`destroy`、`address`、`max_size` 等历史成员；没有运行期多态。C++11 到 C++17 之间没有出现同量级的重构提案，C++14 的改动集中在缺陷报告；这一判断基于提案清单与条款抽查，未逐条比对 N4140 与 N3337（见第 11 节）。[推断]

C++11 的遗产是「协议」而不是「类」：从这一代起，标准库真正的分配器接口是 `allocator_traits`，`std::allocator` 只是它的一个默认实例。这一点决定了后面两代的方向。

---

## 5. 第三代：C++17 的 pmr 与运行期多态

### 5.1 动机：分配器进不了非泛型代码

N3916 的开头是整篇 pmr 设计最凝练的动机陈述：大型软件系统的大部分代码是「编译一次、链接多次」的非泛型过程式或面向对象代码；而 C++ 的分配器一直只依赖编译期多态，于是分配器类型必然影响使用它的对象类型，分配器因此无法用于词汇类型（vocabulary type），也无法穿过独立编译模块之间的接口。[提案 N3916]

换句话说，C++11 解决了「分配器怎么写、怎么传播」，但没有解决「怎么在运行期选、怎么跨模块传」。pmr 补的是后者。

### 5.2 组成

pmr 由四块组成：资源接口、分配器适配器、别名命名空间、标准资源实现。[标准 memory.resource][提案 N3916]

资源接口 `std::pmr::memory_resource` 是一个抽象基类，公开 `allocate(bytes, alignment)`、`deallocate(p, bytes, alignment)`、`is_equal(other)`，分别转发到虚函数 `do_allocate`、`do_deallocate`、`do_is_equal`（public 非虚 / 虚函数分离的 NVI 惯用法）。相等性默认按资源对象地址判断，派生类可以重写 `do_is_equal` 表达「不同对象、同一底层资源」。

分配器适配器 `std::pmr::polymorphic_allocator<T>` 只持有一个 `memory_resource*`，把资源包装成符合 C++11 Allocator 要求的类型。它的 `construct` 执行 uses-allocator 构造，因此 `std::pmr::vector<std::pmr::string>` 中每个字符串都会自动使用同一个资源——这是 pmr 的「scoped allocator 语义」。两个对象即使类型都是 `list<int, polymorphic_allocator<int>>`，也可以使用不同资源，这正是 N3916 要的「同一类型、不同分配行为」。[提案 N3916]

C++17 的 `polymorphic_allocator` 必须写完整模板参数；C++20 的 P0339R6 给它加了默认模板参数 `std::byte`，于是 `polymorphic_allocator<>` 成为推荐写法，并作为类型擦除接口的「词汇类型」使用。[提案 P0339R6]

别名命名空间 `std::pmr` 为常用容器与字符串提供固定分配器版本，例如 `pmr::vector<T>` 等价于 `vector<T, polymorphic_allocator<T>>`。这让「用 pmr」在调用点只体现为命名空间差异。

标准资源包括：

| 资源 | 行为 | 适用场景 |
| --- | --- | --- |
| `new_delete_resource()` | 调用全局 `operator new`/`delete`，也是默认资源 | 通用兜底 |
| `null_memory_resource()` | 所有分配都抛 `bad_alloc` | 测试、禁止分配的接口 |
| `get_default_resource()` / `set_default_resource()` | 读写进程级默认资源指针 | 全局策略切换 |
| `monotonic_buffer_resource` | 只向前分配，不逐个释放；析构或 `release()` 时整体归还上游 | 请求级短生命周期对象、解析器 |
| `unsynchronized_pool_resource` | 按大小分池，不做线程同步 | 单线程热路径 |
| `synchronized_pool_resource` | 与上者相同，但内部同步 | 多线程共享 |

池资源的行为可用 `pool_options` 调节最大块大小、每块上限等参数；具体分池策略属于实现自由，标准不规定。

### 5.3 传播语义：保守是刻意的

pmr 的传播设置与 C++11 的默认值一致，但理由不同：

- 三个 `propagate_on_container_*` 全为 `false_type`；
- `select_on_container_copy_construction()` 返回默认构造的 `polymorphic_allocator`，即使用默认资源，而不是源容器的资源；
- 拷贝赋值被删除（P0337R0），因此 `polymorphic_allocator` 不可赋值。

后果是明确的：使用 pmr 的容器在拷贝构造时默认改回默认资源；拷贝赋值时分配器不传播；移动赋值可能抛异常（因为不能接管存储时只能逐元素移动）；两个资源不相等的容器 `swap` 是未定义行为（来自容器的 AllocatorAwareContainer 前置条件）。[标准 container.requirements.general][提案 P0337R0]

这些限制不是疏忽，而是生命周期推理的结果。资源是运行期对象，标准库无法知道它比容器活得久还是短；如果拷贝容器时把资源指针一并复制，源资源销毁后副本就会悬空。让拷贝回落到默认资源，至少保证「副本不会因为源资源消失而失效」，代价是调用者必须显式把资源传进新容器。这是一次用可预测性换安全性的取舍。[推断]

### 5.4 同期的其他 C++17 变化

pmr 不是 C++17 唯一的分配器变化，另外三项同样重要：

1. 过度对齐 new（P0035R4）：C++17 增加 `operator new(size_t, align_val_t)` 与对应的 delete，使 `alignas(64)` 之类的类型可以由全局分配器正确分配。`std::allocator<T>::allocate` 对 `alignof(T) > __STDCPP_DEFAULT_NEW_ALIGNMENT__` 的类型必须走对齐重载；容器因此不能假设元素满足默认对齐。[提案 P0035R4]
2. 弃用冗余成员（P0174R2）：`std::allocator` 的 `address`、`max_size`、`construct`、`destroy`、`pointer`、`reference` 等被弃用，理由是 `allocator_traits<allocator<T>>` 已经提供了同样的行为，`addressof` 又取代了 `allocator::address`。[提案 P0174R2]
3. `std::function` 移除分配器支持（P0302R1）：`std::function` 的分配器参数在类型擦除下语义不清，标准选择删除而不是修补。[提案 P0302R1]

此外，N4258 在 C++17 补上 `is_always_equal`，让无状态标记可以被容器利用，并触发特性宏 `__cpp_lib_allocator_traits_is_always_equal`（201411L）。[提案 N4258]

### 5.5 代价与陷阱

pmr 把「分配策略」从类型搬到对象，代价也随之转移：

- 资源生命周期：容器不拥有资源，资源必须先于所有使用它的容器销毁；栈上的 `monotonic_buffer_resource` 与堆上的容器混用是常见悬空来源。
- 单调资源不单独释放：`monotonic_buffer_resource` 适合「整批一起丢」的场景；如果元素频繁删除，内存不会回收。
- 拷贝语义反直觉：容器拷贝默认改用默认资源，而不是源资源；需要保持一致时必须显式传资源。
- 类型擦除后不可查询：资源指针可以从 `polymorphic_allocator` 取出，但经过一次类型擦除接口（如 `std::function` 风格的 API）后，标准设施没有统一方式把资源取回。
- 虚调用成本：每次分配至少一次虚函数调用，模板分配器则可以内联；对分配极频繁的热路径，pmr 不一定更快，需要基准验证。
- ABI 边界：资源接口是虚基类，跨 DLL/SO 传递资源对象要求两侧 ABI 与异常模型一致。

### 5.6 与 scoped_allocator_adaptor 的关系

pmr 的 `polymorphic_allocator::construct` 自动做 uses-allocator 构造，因此嵌套容器默认共享外层资源，不需要 `scoped_allocator_adaptor`。标准为 pmr 分配器规定的 uses-allocator 构造已经覆盖嵌套容器；cppreference 的注记据此指出 pmr 分配器「不需要也不适配」scoped_allocator_adaptor。这是行为结果，不是标准对两者的兼容性要求。[标准 mem.poly.allocator.class][推断]

`scoped_allocator_adaptor` 并未被移除，它仍适用于「用有状态模板分配器、且需要多级传播」的场景；但在 pmr 可用的地方，它的类型复杂度使其不再是首选。这是标准库用新范式覆盖旧设施的典型方式：不删除，只让旧设施退居二线。

---

## 6. 第四代：C++20 的收缩与常量求值

### 6.1 删除：`std::allocator` 瘦身

P0619R4 系统审查了 C++17 弃用的库设施，决定在 C++20 删除其中大部分。与分配器相关的是 `std::allocator<T>` 的历史成员与 `allocator<void>` 特化：[提案 P0619R4]

删除的内容包括：

- `allocator<void>` 特化；
- `pointer`、`const_pointer`、`reference`、`const_reference`、`rebind`；
- `address`、`max_size`、`construct`、`destroy`；
- 带 hint 的 `allocate(n, hint)` 重载；
- `operator==` / `operator!=`（C++20 起 `std::allocator` 不再提供比较运算）。

保留 `size_type` 与 `difference_type`。P0619R4 在分析中给出的理由值得记住：`size_type`（`size_t`）与 `difference_type`（`ptrdiff_t`）并不是同一底层类型的有符号/无符号版本，若删掉它们、依赖 `allocator_traits` 从指针推导，可能产生 ABI 不兼容；论文因此「强烈建议」撤销这两个成员的弃用。[提案 P0619R4]

删除后，`std::allocator<T>` 只剩 `value_type`、`allocate`、`deallocate`（C++23 起再加 `allocate_at_least`）、`size_type`、`difference_type`、`propagate_on_container_move_assignment` 与 `is_always_equal`（后者 C++26 再删）。分配器的「完整接口」正式由 `allocator_traits` 承担，`std::allocator` 变成最小示例。[标准 default.allocator]

### 6.2 constexpr 分配

P0784R7《More constexpr containers》是 C++20 分配器演化的另一半。它分两层：[提案 P0784R7]

- 核心语言：允许在常量求值中使用 `new` 与 `delete`，但分配必须在同一次求值结束前释放，即所谓「瞬时分配」（transient allocation）。非瞬时分配（常量求值结束后仍存活、由常量变量持有）在 R6 因 EWG 反对 `mark_immutable_if_constexpr` 方案而被移除，C++20 最终只支持瞬时分配。
- 标准库：`std::allocator::allocate`/`deallocate`、`allocator_traits` 的对应函数、`construct_at`/`destroy_at` 变为 `constexpr`；配合 `is_constant_evaluated()`，容器可以在编译期走一条不调用全局 `operator new` 的路径。

直接结果就是 C++20 的 `constexpr std::vector` 与 `constexpr std::string`：它们能在常量求值中分配、构造、析构，并把内存全部释放。特性宏是 `__cpp_lib_constexpr_dynamic_alloc`（201907L）与核心语言侧的 `__cpp_constexpr_dynamic_alloc`（201907L）。[标准 cpp20]

这条线对分配器实现提出两个硬要求：

1. `allocate`/`deallocate` 在常量求值中必须成对出现，且不能泄漏；分配器若在编译期使用全局状态（例如静态池），该状态必须对常量求值不可见或可构造。
2. 分配器实现通常要在 `allocate` 内用 `is_constant_evaluated()` 分支：常量求值走编译器内建路径，运行期走真实分配。这是 C++20 之后所有分配器的标准写法。[推断]

### 6.3 配套工具

C++20 还补齐了分配器生态的四块拼图：

| 提案 | 内容 | 解决的问题 |
| --- | --- | --- |
| P0653R2 | `std::to_address` | 从 fancy pointer 取裸地址，`allocator_traits`/pmr 需要它 |
| P0591R4 | `uses_allocator_construction_args`、`make_obj_using_allocator`、`uninitialized_construct_using_allocator` | 把前置/后置 uses-allocator 约定收敛为可复用函数，`polymorphic_allocator::construct` 与 scoped 适配器都用它 |
| P0339R6 | `polymorphic_allocator<>` 作为词汇类型（默认参数 `std::byte`） | 让 pmr 分配器可以出现在非模板接口中 |
| P1165R1 | `basic_string` 的 `operator+` 一致传播有状态分配器 | 修正字符串拼接在分配器传播上的不一致 |

其中 P0591R4 的意义容易被低估：在它之前，「按分配器构造对象」的规则散落在 `polymorphic_allocator::construct`、`scoped_allocator_adaptor::construct` 与 `pair` 的特化里，每处都要重复实现前置/后置约定的分派；之后这些函数成为公共设施，第三方分配器也能复用同一套规则。[提案 P0591R4]

### 6.4 这一代的影响

C++20 之后，分配器协议的形状基本定型：

- 接口最小化：分配器作者只需 `value_type`、`allocate`、`deallocate` 与相等比较；
- 访问唯一化：库与用户代码都应通过 `allocator_traits`；
- 常量求值成为分配器的正式场景，不再只是运行期设施；
- 代价是源兼容性破坏：使用 `allocator<void>`、`a.construct(...)`、`a.address(...)` 的代码需要迁移到 traits 或 `construct_at`。

这一代没有解决的是「分配器知道自己给了多少」的问题。容器在 `reserve` 或增长时只能假设分配器恰好给了请求的量，而实际分配器（尤其是池与页对齐分配器）往往给得更多。这个缺口由 C++23 的 `allocate_at_least` 补上。

---

## 7. 第五代：C++23–C++26 的增量

### 7.1 allocate_at_least：把「分配器知道得更多」写进协议

C++20 之后，分配器接口已经很小，但仍有一个信息缺口：容器增长时只能按请求量假设分配器恰好给了这么多。池分配器、页对齐分配器与 `std::allocator` 常常给出更大的块，容器却不知道，只能把多出来的空间记为不可用，下一次增长再要一次。传统 C 的 `realloc` 不能直接用：C++ 对象需要构造与析构，fancy pointer 与有状态分配器也不满足 `realloc` 的假设。[提案 P0401R6]

P0401R6（2021-01-22，Jonathan Wakely、Chris Kennelly）把「大小反馈」做成正式接口：

- `std::allocation_result<Pointer, SizeType>` 同时携带 `ptr` 与 `count`；
- `Allocator::allocate_at_least(n)` 返回至少 `n` 个元素的分配结果；
- `allocator_traits::allocate_at_least(a, n)` 在分配器没有该成员时回退为 `{a.allocate(n), n}`；
- 契约：`result.count >= n`；释放时传给 `deallocate` 的大小 `m` 必须满足 `n <= m <= result.count`，请求值与实际值都在合法区间内。[标准 allocator.members][提案 P0401R6]

最后一条契约是使用这个设施最容易出错的地方：`m` 小于请求的 `n` 或大于返回的 `count` 才违反契约；按请求值释放合法，按实际 `count` 释放也合法。容器若想把多出来的空间用起来，应把 `result.count` 记为 capacity。

这个设施的标准化过程本身也值得记录。P0401R1 时该接口在 `allocator_traits` 内（据 R1→R2 的修订说明反推）；LEWG 在科隆会议上指出，`allocator_traits` 允许用户特化，既有特化不会有这个新成员，于是 P0401R2 把它改成自由函数，C++23 草案（N4919）里因此出现了一个游离在 traits 之外的分配器接口。直到 P2652R2 禁止特化 `allocator_traits`，协议重新封闭，最终 C++23 才把它收回 traits 作为成员（同时保留 `std::allocator::allocate_at_least`）。这段历史是「协议可扩展性」与「接口一致性」冲突的典型案例。[提案 P0401R6、P2652R2]

特性宏 `__cpp_lib_allocate_at_least` 在 N4950 与 cppreference 中的值为 202302L，覆盖 P0401R6、P2652R2 与 LWG 3887（为宏补上版本号）；libstdc++ 状态页把同一宏写作 `>= 202306L`，与前者不一致。本文采用 N4950 的值，差异记入第 11 节。[标准 cpp23]

### 7.2 P2652R2：封闭 allocator_traits

P2652R2 的立场可以用一句话概括：`allocator_traits` 允许用户特化，标准委员会就无法再扩展它。论文给出的论证链很完整：[提案 P2652R2]

1. `allocator_traits` 在 C++11 引入时有两个目标：为分配器提供默认实现以降低要求；为未来标准扩展分配器接口提供不破坏既有分配器的机制。
2. 允许用户显式或偏特化 `allocator_traits` 会破坏第二个目标：任何新增成员都会让既有特化「缺成员」，而标准不能要求用户跟着改。
3. 实例就在眼前：C++17 给 `allocator_traits` 加了 `is_always_equal` 这个成员，理论上破坏了所有既有特化，只是没人抱怨；C++23 的 `allocate_at_least` 因此被迫设计成自由函数。
4. 其实没有特化的必要：分配器的每个 trait 都可以通过「在分配器类型里定义同名成员」覆盖，特化 `allocator_traits` 只是另一种写法。

结论是「程序声明 `allocator_traits` 的显式或偏特化即 ill-formed，无需诊断」（C++23 起）。这是一次有意的源兼容性破坏，但影响面很小。它换来的能力是：协议可以继续演进而不再受既有特化掣肘。[标准 allocator.traits][提案 P2652R2]

### 7.3 C++23 的其他两项：推导指南与 pmr::stacktrace

C++17 的类模板实参推导给容器加了一批推导指南，但序列容器与容器适配器的指南对分配器参数约束过强，导致 `std::pmr` 容器这类场景无法按直觉推导。P1518R2（2021-03-14，Arthur O’Dwyer、Mike Spertus）指出：推导指南不应从「不参与推导的分配器」里推导类型，也不应要求分配器类型与元素类型之间的过度匹配。论文的两节分别是「停止过度约束不参与推导的分配器」与「停止从本不该参与推导的分配器反推」；修正后，`pmr` 容器的推导写法才符合直觉。取值的实现版本为 GCC 12.1、libc++ 13、MSVC 19.31。[提案 P1518R2][实现 cppreference 支持页]

P2301R1（2021-06-14，Steve Downey）补上 `std::pmr::stacktrace` 别名：`basic_stacktrace` 本来就带分配器模板参数，`stacktrace` 把分配器固定为 `std::allocator`，却一直没有对应的 pmr 版本。新增 `namespace pmr { using stacktrace = basic_stacktrace<polymorphic_allocator<stacktrace_entry>>; }` 后，pmr 别名集合才完整。[提案 P2301R1]

### 7.4 C++26：收尾与修正

C++26 的分配器变化以「修正上一轮收缩的边角」为主：

| 提案 | 内容 | 动机 |
| --- | --- | --- |
| P2868R3 | 从 C++26 移除 `std::allocator<T>::is_always_equal` | 弃用来源是 LWG 3170（C++20）；删除理由见 P2868R3 §5：`std::allocator` 无状态，它的 `is_always_equal` 是 `true_type`；非空的用户分配器若继承 `std::allocator`，会连这个 `true_type` 一起继承，`allocator_traits` 于是把「有状态」的派生分配器当成永远相等，语义错误。移除后，派生分配器按默认规则由 `is_empty` 推导。[提案 P2868R3] |
| P2875R4 | 撤回 `polymorphic_allocator::destroy` 的弃用 | C++23 的 LWG 3036 认为 `destroy` 与 traits 自动生成的行为重复，将其弃用；但非泛型的 pmr 代码直接调用 `destroy`，并不经过 `allocator_traits`。论文认为 `construct` 与 `destroy` 是一组成对契约，撤回弃用、留在主条款。[提案 P2875R4] |
| P3433R1 | 为异步 operation state 提供分配器支持 | sender/receiver 的嵌套对象需要把外层 operation state 的分配器传进去；当前规范没有转发 `get_allocator()` 查询。论文把分配器语义接到 operation state。[提案 P3433R1] |
| P3503R3 | 统一 `promise` 与 `packaged_task` 的类型擦除分配器用法 | LWG 2095/2921/2976/3003 的历史遗留：`uses_allocator` 特化与构造函数不一致；论文恢复 `packaged_task` 的分配器构造函数，并删除 `promise` 的 `uses_allocator` 特化。[提案 P3503R3] |
| P3980R1 | 规定 `std::execution::task` 的分配器使用 | 协程帧与环境应使用哪个分配器、`allocator_arg` 的位置、从 receiver 环境取分配器等四个国家体意见。[提案 P3980R1] |

落地情况（完整矩阵见第 9 节）：P2868R3 已在 libstdc++ 15 与 libc++ 18 落地，P2875R4 已在 libstdc++ 14.3、libc++ 15 与 MSVC 19.41 落地，P3503R3 已在 GCC 17 与 MSVC 19.51 落地、libc++ 尚未实现；P3433R1 三家均未实现。P3980R1 按 C++26 CD 的国家机构评论在 Croydon（2026-03）处理，libc++ 状态表与 cppreference 都把它归入 C++26，本文按 C++26 记录（待正式出版确认）；P3433R1 的正式采纳仍缺会议决议证据，本文按「C++26 方向」表述，归属问题记入第 11 节。这说明「进入标准」与「实现可用」之间仍有时间差。[实现 cppreference 支持页、libc++ 状态表]

### 7.5 方向：分配器进入执行上下文

把 7.4 的后三项放在一起看，方向很清楚：分配器不再只是容器的模板参数，也不只是运行期资源指针，而是执行上下文的一部分。协程帧、operation state、receiver 的 environment 都参与「这次异步操作从哪里取内存」的决策。这与 C++26 的 `std::execution` 模型合流，也解释了为什么 2025–2026 年的分配器提案大多以「allocator support for X」而不是「new allocator type」的形式出现。[推断]

---

## 8. 演化中的五组张力

把 3–7 节的事实压缩，可以得到五组反复出现的张力。它们解释了为什么分配器接口看起来「总是差一点」，也解释了每次范式转换的代价转移到了哪里。

### 8.1 状态性 vs 类型同一性

C++98 用类型表达分配策略：`vector<T, PoolAlloc>` 与 `vector<T, HeapAlloc>` 是不同类型。这换来零开销与编译期内联，代价是同一逻辑类型在不同分配策略下不可互换。C++11 允许分配器带状态，但类型身份没有变：`vector<T, A>` 仍只有一个分配器类型。C++17 的 pmr 用类型擦除换来运行期互换：`pmr::vector<T>` 只有一个类型，资源可以按实例不同。[提案 N1850、N3916]

没有免费的午餐：pmr 保住了类型同一性，失去的是编译期特化与传播能力（传播 traits 全 false）。这类「要么类型相同、要么分配器可传播」的二选一，是分配器设计里最根本的约束。

### 8.2 编译期多态 vs 运行期多态

模板分配器的分配调用可以内联，且编译期就能知道分配器是否为空、是否 `is_always_equal`，从而省掉比较与分支。pmr 的每次分配至少一次虚调用，`polymorphic_allocator` 还多一层指针间接。两套设施并存不是过渡状态，而是标准库的长期形态：`allocator_traits` 是编译期协议，`memory_resource` 是运行期实现，pmr 只是把后者适配成前者的一个分配器类型。[标准 allocator.traits、memory.resource]

因此，「pmr 比模板分配器慢」只在分配极频繁且分配器可内联的场景成立；反过来，pmr 避免了模板实例化膨胀与跨模块类型不兼容。选型应按场景，而不是按「新设施一定更好」。

### 8.3 抽象成本 vs 分配信息

分配器协议每增加一条信息通道，就多一层抽象：

| 信息 | 设施 | 引入版本 | 代价 |
| --- | --- | --- | --- |
| 指针可能不是裸指针 | `pointer_traits`、`to_address` | C++11 / C++20 | 所有取地址、比较、偏移都要经过 traits |
| 分配器可能给得更多 | `allocate_at_least`、`allocation_result` | C++23 | 释放时必须传实际大小，容器 capacity 要跟着改 |
| 类型可能过度对齐 | aligned `operator new`、`align_val_t` | C++17 | 分配路径要按 `alignof(T)` 分支 |
| 分配器可能无状态 | `is_always_equal` | C++17 | 容器要区分「永远相等」与「需要运行时比较」 |

趋势是：标准逐步承认「分配器知道得比调用者多」，并把这些信息变成可选接口。代价是协议面变大，正确实现的难度上升。

### 8.4 向后兼容 vs 接口清洁

分配器是标准库中少数经历完整「弃用 → 移除」周期的设施：

- C++17：P0174R2 弃用 `allocator<void>` 与冗余成员；P0302R1 直接删除 `std::function` 的分配器构造（连弃用都跳过）。
- C++20：P0619R4 删除 C++17 弃用的大部分成员，同时接受论文建议保留 `size_type`/`difference_type`。
- C++23：P2652R2 禁止特化 `allocator_traits`，属于「不告而破」但影响面小的源兼容性破坏。
- C++23：LWG 3170 标记 `allocator::is_always_equal` 有问题并弃用；C++26 P2868R3 移除。
- C++23：LWG 3036 弃用 `polymorphic_allocator::destroy`；C++26 P2875R4 撤回弃用。

这条时间线说明两件事：第一，委员会愿意为接口清洁付出源兼容性代价，但节奏是「一个标准周期弃用、下一个移除」；第二，弃用不总是单向的，`destroy` 的撤回表明「重复实现 traits 默认行为」并不足以构成删除理由。[提案 P0174R2、P0619R4、P2652R2、P2868R3、P2875R4]

### 8.5 运行期分配 vs 常量求值

C++20 之前，分配天然是运行期行为；P0784R7 之后，分配器必须同时支持两种求值环境：常量求值中分配与释放必须成对、不能泄漏，运行期则走真实堆。实现通常用 `is_constant_evaluated()` 分支，这带来了新的正确性要求：编译期路径不能碰全局可变状态，运行期路径不能把编译期假设带进来。[提案 P0784R7]

这条张力还远未结束：C++20 只允许瞬时分配，非瞬时分配被移除；如果未来重新引入（例如让 `constexpr` 变量持有动态分配的字符串），「谁负责释放、何时释放」会再次成为核心问题。[推断]

### 8.6 补充暗线：分配与构造的分离

除了上述五组张力，还有一条贯穿始终的暗线：分配内存与在内存上构造对象正在分离。C++98 把 `construct`/`destroy` 放在分配器上；C++11 的 traits 把它们变成可选；C++20 用 `construct_at`/`destroy_at` 取代分配器拦截；`uses_allocator` 与 pmr 则把「元素自己的分配器」独立处理。结果是分配器越来越像「原始内存来源」，而对象构造策略回到语言与容器手里。[标准 specialized.construct、allocator.uses]

这条暗线解释了为什么 `polymorphic_allocator::destroy` 的弃用会被撤回：在非泛型代码里，`construct`/`destroy` 是最直接的成对操作；把它们全部推给 traits 会牺牲可用性。标准最终选择保留冗余但清晰的接口，而不是为了「无冗余」牺牲使用体验。[提案 P2875R4]

---

## 9. 实现落地对照

标准文本是一条时间线，实现是另一条。下面两张表按设施而不是按语言版本组织，因为「用了 C++23 标准」不等于「目标编译器已经实现该设施」。数据取自 cppreference 编译器支持页与 libc++、libstdc++ 官方状态页；MSVC 官方一致性页在采集时返回 404，MSVC 版本转引自 cppreference。MSVC 列中带 `*` 的版本沿用 cppreference 的脚注（多为部分支持说明），本文未逐条核实脚注含义。[实现 cppreference 支持页、libc++ / libstdc++ 状态页]

| 设施 | 标准 | GCC（libstdc++） | Clang（libc++） | MSVC STL |
| --- | --- | --- | --- | --- |
| `allocator_traits`、`scoped_allocator_adaptor`、`uses_allocator` | C++11 | 支持（首版未核实） | 支持（首版未核实） | 支持（首版未核实） |
| pmr（`<memory_resource>`） | C++17 | 9.1 | 16 | 19.13（VS2017 15.6） |
| 过度对齐 new/delete | C++17 | 7 | 4 | 19.12 |
| `is_always_equal` | C++17 | 6.1 | 3.7 | 19.0（VS2015） |
| constexpr 容器操作（含 constexpr 分配） | C++20 | 10 | 10 | 19.28（VS2019 16.9） |
| `to_address` | C++20 | 8 | 6 | 19.22（VS2019 16.2） |
| `uses_allocator_construction_args` 系列 | C++20 | 9 | 16 | 19.29（VS2019 16.10） |
| `polymorphic_allocator<>` | C++20 | 9 | 16 | 19.28（VS2019 16.9） |
| `basic_string` 的 `operator+` 传播 | C++20 | 10 | 15 | 19.26（VS2019 16.6） |

C++23 与 C++26 的落地情况：

| 设施 | 标准 | GCC（libstdc++） | Clang（libc++） | MSVC STL |
| --- | --- | --- | --- | --- |
| `allocate_at_least` | C++23 | 16.1 | 15 | 19.30* |
| 禁止特化 `allocator_traits` | C++23 | 未支持（状态页无版本） | 19 | 19.37* |
| 推导指南去约束 | C++23 | 12.1 | 13 | 19.31 |
| `pmr::stacktrace` | C++23 | 12.1 | 未列 | 19.34 |
| 删除 `allocator::is_always_equal` | C++26 | 15 | 18 | 未列 |
| 撤回 `polymorphic_allocator::destroy` 弃用 | C++26 | 14.3 | 15 | 19.41* |
| `promise`/`packaged_task` 分配器一致性 | C++26 | 17 | 未列 | 19.51* |
| operation state 分配器 | C++26（采纳待核实） | 未支持 | 未支持 | 未支持 |
| `task` 分配器 | C++26（待出版确认） | 无 | 无 | 无 |

备注（按设施）：

- `allocator_traits`、`scoped_allocator_adaptor`、`uses_allocator`：无特性宏可查
- pmr（`<memory_resource>`）：`__cpp_lib_memory_resource` 201603L；libc++ 比 GCC 晚约 4 年（2019 → 2023）
- 过度对齐 new/delete：`align_val_t`
- `is_always_equal`：`__cpp_lib_allocator_traits_is_always_equal` 201411L
- constexpr 容器操作（含 constexpr 分配）：`__cpp_lib_constexpr_dynamic_alloc` 201907L；与核心语言 `constexpr new/delete` 配套
- `to_address`：`__cpp_lib_to_address` 201711L
- `uses_allocator_construction_args` 系列：P0591R4
- `polymorphic_allocator<>`：`__cpp_lib_polymorphic_allocator` 201902L
- `basic_string` 的 `operator+` 传播：P1165R1
- `allocate_at_least`：`__cpp_lib_allocate_at_least` 202302L
- 禁止特化 `allocator_traits`：P2652R2
- 推导指南去约束：P1518R2
- `pmr::stacktrace`：P2301R1
- 删除 `allocator::is_always_equal`：P2868R3
- 撤回 `polymorphic_allocator::destroy` 弃用：P2875R4
- `promise`/`packaged_task` 分配器一致性：P3503R3
- operation state 分配器：P3433R1
- `task` 分配器：P3980R1

读这两张表要注意三点：

1. 按设施查版本，不要按 `-std` 查。同一标准模式下的设施落地时间可能相差数年；`allocate_at_least` 在 libc++ 15 就有，在 libstdc++ 要等到 16.1。
2. 特性宏不总是可靠。`__cpp_lib_allocate_at_least` 的宏值在 N4950 与 libstdc++ 状态页之间就存在 202302L 与 202306L 的差异（见第 11 节）；跨编译器代码应同时检查头文件可用性与宏值。
3. 「清理类」改动没有特性宏。删除成员、撤回弃用、禁止特化这类变化无法用宏探测，只能靠标准模式与编译器版本文档判断。

---

## 10. 对从零实现标准库的启示

把 3–7 节的历史映射到实现工作，可以得到一份按优先级排列的清单。以下建议面向从零实现标准库的项目，假定目标是 C++20/23 起步、逐步补齐 C++26。

### 10.1 先协议，后容器

`allocator_traits` 必须先于第一个容器完成。它包含三部分：成员类型与别名、静态函数的默认实现、传播 traits 的默认值。容器只通过 traits 访问分配器，不直接调用 `allocate`、不假设 `pointer` 是裸指针。[标准 allocator.traits]

最小分配器只要求 `value_type`、`allocate`、`deallocate`、可拷贝构造与相等比较。实现矩阵应至少覆盖：无状态分配器、有状态分配器、fancy pointer 分配器、过度对齐类型。

### 10.2 传播矩阵是容器骨架的一部分

在写 `vector`、`string`、`list` 之前，先把下表定下来并写成测试：

| 场景 | 需要验证的行为 |
| --- | --- |
| 拷贝构造 | `select_on_container_copy_construction` 的返回值被使用 |
| 拷贝赋值 | `POCCA` 为真：先释放旧存储再传播；为假：不传播，必要时重分配 |
| 移动赋值 | `POCMA` 为真：接管存储与分配器；为假且相等：接管存储；为假且不等：逐元素移动 |
| `swap` | `POCS` 为真：交换分配器；为假且相等：交换存储；为假且不等：不得调用（标准为未定义行为） |
| 析构 | 用构造时保存的分配器释放 |

这五项也是代码评审的检查表。历史上最危险的缺陷形态是「用 A 分配、用 B 释放」，它通常不会在单测中立刻暴露，而是在跨分配器拷贝或异常回滚时出现。[推断]

### 10.3 constexpr 从第一天设计

C++20 的 `constexpr` 容器不是「给容器加几个 `constexpr` 关键字」就能得到，它依赖三件事同时成立：[提案 P0784R7]

1. 核心语言允许常量求值中的 `new`/`delete`；
2. `allocate`/`deallocate` 是 `constexpr`，且在常量求值中成对出现；
3. 容器用 `construct_at`/`destroy_at` 而不是分配器的 `construct`/`destroy`。

实现分配器时，`allocate` 内部通常要按 `is_constant_evaluated()` 分支：常量求值走编译器内建路径，运行期走真实分配。若分配器自带池或全局状态，必须保证常量求值路径不触碰它们。

### 10.4 对齐与尺寸反馈

C++17 之后，分配器必须正确处理 `alignof(T) > __STDCPP_DEFAULT_NEW_ALIGNMENT__` 的类型：默认分配器走带 `align_val_t` 的 `operator new`，自定义分配器要么自行保证对齐，要么复用全局对齐分配。[提案 P0035R4]

C++23 之后，若容器想在增长时利用分配器的尺寸反馈，需要：`vector`/`string` 在扩容时调用 `allocator_traits::allocate_at_least`；把返回的 `count` 记入 capacity；释放时把 `count` 传给 `deallocate`。不做这三步时，`allocate_at_least` 只是一个可选的分配器优化，不影响正确性。[提案 P0401R6]

### 10.5 pmr 的排期

pmr 依赖容器、字符串、`mutex`/`atomic`（同步池资源需要同步原语）与 `vector`（资源内部实现常用容器）。因此它应排在容器之后，而不是与 `allocator_traits` 同时做。可以先实现 `memory_resource` 接口、`polymorphic_allocator`、`new_delete_resource`、`null_memory_resource` 与 `monotonic_buffer_resource`，池资源随后补。

pmr 的验收重点是语义而不是性能：拷贝构造是否回落到默认资源、`select_on_container_copy_construction` 是否返回默认构造分配器、`operator=` 是否被删除、不相等的两个资源容器是否被禁止 `swap`。[标准 memory.resource]

### 10.6 兼容策略要显式

新实现不必提供 C++20 已删除的成员（`allocator<void>`、`construct`、`destroy`、`address`、`max_size`、`pointer` 等）。如果目标包含 C++17 模式，则应按标准模式门控，而不是无条件保留：无条件保留会让用户写出无法迁移到新标准的代码。

同理，`allocator_traits` 不应允许用户特化。如果实现早期为了兼容旧代码而留了口子，后期再关闭会变成源兼容性破坏；C++23 的 P2652R2 就是前车之鉴。[提案 P2652R2]

### 10.7 测试矩阵

分配器是横切设施，测试不能只覆盖「默认分配器 + 默认容器」。建议至少四个维度：

| 维度 | 取值 |
| --- | --- |
| 分配器类型 | 无状态、有状态且相等、有状态且不等、`is_always_equal` |
| 传播配置 | 三个 traits 的八种组合（抽样）、`select_on_container_copy_construction` 自定义 |
| 指针类型 | 裸指针、fancy pointer、过度对齐元素 |
| 求值环境 | 运行期、常量求值、异常路径（分配失败与构造失败） |

每个容器都应通过「传播矩阵 × 异常安全 × 迭代器失效」三组测试；`constexpr` 容器额外通过编译期测试。测试分配器应记录分配/释放的指针与大小，以便在 `deallocate` 时检测「大小不匹配」与「跨分配器释放」。

### 10.8 历史坑清单

1. 不要把分配策略写进容器类型身份（C++98 的老路）。若确需运行期选择，用 pmr，而不是给容器加更多模板参数。
2. 不要让 `propagate_on_container_swap` 的「不相等」路径静默通过：标准规定未定义行为，实现应在 hardening 模式下断言。
3. 不要假设 `max_align_t` 足够：过度对齐类型必须走对齐分配。
4. 不要用 `allocate_at_least` 的请求值释放：必须用返回的 `count`。
5. 不要让 pmr 容器跨资源边界拷贝后仍被当作同一资源：拷贝默认回落到默认资源。
6. 不要在常量求值路径泄漏内存：瞬时分配必须成对释放。
7. 不要保留 `allocator_traits` 特化口子：它会阻止后续协议扩展。
8. 不要忽略 `basic_string` 的分配器传播：`operator+` 的传播规则曾是实现分歧点，C++20 才统一（P1165R1）。

---

## 11. 未决问题

写作过程中留下的、需要在后续工作中补证或裁决的问题：

1. `__cpp_lib_allocate_at_least` 的宏值不一致。N4950 与 cppreference 为 202302L；libstdc++ 状态页写作 `>= 202306L`；LWG 3887 的 issues 页状态标为 C++26，但其决议 2023-06 已通过，且 2023-05 的 N4950 已含 202302L。本文采用 N4950 的值。
2. P3433R1 是否已正式采纳进 C++26。目前只有 cppreference 的 C++26 论文清单与 libc++ 状态表两条间接证据，未取到 Sofia 2025 会议决议。
3. P3980R1 的出版状态。论文按 C++26 CD 的国家机构评论在 Croydon（2026-03）处理，libc++ 状态表与 cppreference 均归入 C++26；本文按 C++26 记录，正式出版状态待确认。
4. P0220R1 与 N3916 的措辞迁移。cppreference 把 pmr 并入 C++17 的提案记为 P0220R1（LFTS v1 并入），N3916 是设计论文；两者之间的 `std::experimental::pmr` → `std::pmr` 迁移细节未逐条核实。
5. P0337R0 的采纳阶段。open-std 2016 索引未标注 Adopted；cppreference 从 C++17 起把 `polymorphic_allocator` 的赋值记为 deleted，本文按「C++17 起删除」表述。
6. P0619R4 的完整删除清单。已核实其删除 `pointer`、`reference`、`rebind`、`address`、`construct`、`destroy`、`max_size` 与带 hint 的 `allocate`；`operator==` 的移除在 cppreference 中标为 C++20，未逐条回查论文原文。
7. MSVC 官方来源缺失。采集时 MSVC 一致性页返回 404，第 9 节的 MSVC 版本全部转引自 cppreference，属于二手数据。
8. C++14 无结构性修改的结论。基于提案清单与条款抽查，未逐条比对 N4140 与 N3337 的全部缺陷报告。
9. `allocator_traits`、`scoped_allocator_adaptor`、pmr 的首个支持版本。libstdc++ 状态页只标 Y 不给版本号，矩阵中相应格子标为「未核实」。
10. C++29 的分配器提案。P3980R1 按 C++26 处理（见第 3 条）；除此之外，本轮没有找到可核实的其他 C++29 分配器提案，若后续出现，附录 B 需要更新。

---

## 附录 A：速查表

### A.1 `std::allocator<T>` 成员的存在性

下面两张表只列标准文本层面「存在/弃用/移除」，不表示实现一定按此门控。

| 成员 | C++98/03 | C++11 | C++17 |
| --- | --- | --- | --- |
| `value_type` | 有 | 有 | 有 |
| `size_type`、`difference_type` | 有 | 有 | 有 |
| `pointer`、`const_pointer`、`reference`、`const_reference` | 有 | 有 | 弃用 |
| `rebind` | 有 | 有 | 弃用 |
| `address`、`max_size`、`construct`、`destroy` | 有 | 有 | 弃用 |
| `allocate`、`deallocate` | 有 | 有 | 有 |
| `allocate_at_least` | — | — | — |
| `propagate_on_container_move_assignment` | — | 有 | 有 |
| `is_always_equal` | — | —（见注） | 有 |
| `operator==`、`operator!=` | 有 | 有 | 有 |

C++20 至 C++26：

| 成员 | C++20 | C++23 | C++26 |
| --- | --- | --- | --- |
| `value_type` | 有 | 有 | 有 |
| `size_type`、`difference_type` | 有（保留） | 有 | 有 |
| `pointer`、`const_pointer`、`reference`、`const_reference` | 移除 | — | — |
| `rebind` | 移除 | — | — |
| `address`、`max_size`、`construct`、`destroy` | 移除 | — | — |
| `allocate`、`deallocate` | 有（constexpr） | 有 | 有 |
| `allocate_at_least` | — | 有 | 有 |
| `propagate_on_container_move_assignment` | 有 | 有 | 有 |
| `is_always_equal` | 有 | 弃用 | 移除 |
| `operator==`、`operator!=` | 移除 | — | — |

注：`is_always_equal` 由 N4258 在 C++17 引入（默认取 `is_empty`），cppreference 的 `std::allocator` 页面把它标为 C++11，系 LWG 2108 作为缺陷报告回溯的写法；N3337（C++11 草案）的 `allocator_traits` 与 `std::allocator` 均无此成员。本文按 C++17 处理。[提案 N4258][缺陷 LWG 2108]

### A.2 pmr 语义速查

| 语义 | `std::pmr::polymorphic_allocator` |
| --- | --- |
| 存储 | 一个 `memory_resource*` |
| 默认构造 | 绑定 `get_default_resource()` |
| `propagate_on_container_copy_assignment` / `move_assignment` / `swap` | 全为 `false_type` |
| `select_on_container_copy_construction` | 返回默认构造的分配器（默认资源），不继承源资源 |
| 拷贝赋值 | 被删除（P0337R0） |
| `construct` | 执行 uses-allocator 构造，嵌套容器自动共享资源 |
| 相等性 | 由底层资源的 `is_equal` 决定 |
| `destroy` | C++23 弃用、C++26 撤回弃用（P2875R4） |

### A.3 版本速查

| 版本 | 分配器相关新增 | 分配器相关移除/弃用 |
| --- | --- | --- |
| C++98/03 | Allocator 要求、`std::allocator<T>`、`rebind`、`construct`/`destroy` | — |
| C++11 | `allocator_traits`、三个传播 traits、`select_on_container_copy_construction`、`allocator_arg_t`、`uses_allocator`、`scoped_allocator_adaptor`、`pointer_traits` | — |
| C++14 | 无结构性修改 | — |
| C++17 | pmr、`memory_resource`、`polymorphic_allocator`、过度对齐 new、`is_always_equal` | 弃用 `allocator<void>` 与冗余成员（P0174R2）；删除 `std::function` 分配器构造（P0302R1） |
| C++20 | constexpr 分配、`to_address`、uses-allocator 工具、`polymorphic_allocator<>`、`string` 传播一致化 | 删除 `allocator<void>` 与冗余成员（P0619R4） |
| C++23 | `allocate_at_least`、`allocation_result`、`pmr::stacktrace`、推导指南修正 | 禁止特化 `allocator_traits`（P2652R2） |
| C++26 | `promise`/`packaged_task` 一致性、operation state 与任务分配器（部分待核实） | 删除 `allocator::is_always_equal`（P2868R3）；撤回 `destroy` 弃用（P2875R4） |

---

## 附录 B：提案索引

日期为论文标注日期或采纳会议；「角色」是本文引用它的原因。

| 编号 | 标题 | 日期 | 与本文的关系 |
| --- | --- | --- | --- |
| N1850 | Towards a Better Allocator Model | 2005-08-25 | C++98 模型批评与四项原则，C++11 重构的思想前身 |
| N2525 | Allocator-specific Swap and Move Behavior | 2008-02-04 | 传播协议前身（swap / move 时的分配器归属） |
| N2554 | The Scoped Allocator Model (Rev 2) | 2008-02-29 | `scoped_allocator_adaptor`、`uses_allocator`、`allocator_arg_t` 的来源 |
| N2982 | Allocators post Removal of C++ Concepts (Rev 1) | 2009-10-22 | `allocator_traits`、`pointer_traits` 的正式设计 |
| N3337 | C++11 工作草案 | 2012-01-16 | C++11 条款核对依据（`[allocator.traits]` 等） |
| N3916 | Polymorphic Memory Resources - r2 | 2014-02-14 | pmr 的设计论文 |
| N4258 | Cleaning up noexcept in the Library (Rev 3) | 2014-11-07 | `is_always_equal` 与移动赋值 `noexcept` 条件 |
| P0035R4 | Dynamic memory allocation for over-aligned data | 2016-06-21 | 过度对齐 new/delete |
| P0174R2 | Deprecating Vestigial Library Parts in C++17 | 2016-06-23 | 弃用 `allocator<void>` 与冗余成员 |

2016–2021 年的提案：

| 编号 | 标题 | 日期 | 与本文的关系 |
| --- | --- | --- | --- |
| P0302R1 | Removing Allocator Support in std::function (rev 1) | 2016-06-23 | 删除 `std::function` 的分配器构造 |
| P0337R0 | Delete operator= for polymorphic_allocator | 2016-05-25 | 删除 `polymorphic_allocator` 的赋值（阶段元数据待核实） |
| P0619R4 | Reviewing Deprecated Facilities of C++17 for C++20 | 2018-06-08 | 删除 `allocator<void>` 与冗余成员 |
| P0784R7 | More constexpr containers | 2019-07-22 | constexpr 分配与 `construct_at`/`destroy_at` |
| P0653R2 | Utility to convert a pointer to a raw pointer | 2017-11-09 | `to_address` |
| P0591R4 | Utility functions to implement uses-allocator construction | 2018-11-07 | uses-allocator 构造工具 |
| P0339R6 | polymorphic_allocator<> as a vocabulary type | 2019-02-22 | `polymorphic_allocator<>` 默认模板参数 |
| P1165R1 | Make stateful allocator propagation more consistent for operator+(basic_string) | 2018-11-10 | `basic_string::operator+` 的传播规则 |
| P0401R6 | Providing size feedback in the Allocator interface | 2021-01-22 | `allocate_at_least`、`allocation_result` |

2021 年以后的提案与 LWG 议题：

| 编号 | 标题 | 日期 | 与本文的关系 |
| --- | --- | --- | --- |
| LWG 3887 | Version macro for allocate_at_least | 2023-02-14（提交） | `__cpp_lib_allocate_at_least` 的版本值 |
| P2652R2 | Disallow User Specialization of allocator_traits | 2022-11 采纳（R0） | 禁止特化 `allocator_traits`，`allocate_at_least` 收回 traits |
| P1518R2 | Stop overconstraining allocators in container deduction guides | 2021-03-14 | 容器推导指南修正 |
| P2301R1 | Add a pmr alias for std::stacktrace | 2021-06-14 | `std::pmr::stacktrace` |
| P2868R3 | Remove Deprecated std::allocator Typedef From C++26 | 2023-11-09 | 删除 `allocator::is_always_equal` |
| P2875R4 | Undeprecate polymorphic_allocator::destroy for C++26 | 2024-03-20 | 撤回 `destroy` 弃用 |
| P3433R1 | Allocator Support for Operation States | 2025-06-18 | operation state 的分配器转发（采纳状态待核实） |
| P3503R3 | Make type-erased allocator use in promise and packaged_task consistent | 2025-06-19 | `promise`/`packaged_task` 分配器一致性 |
| P3980R1 | Task’s Allocator Use | 2026-03-24 | `std::execution::task` 的分配器来源（C++26，待出版确认） |

相关的 LWG 缺陷报告（按编号，日期未逐一核实）：431（容器 swap 与有状态分配器）、580、635、1075、1166、1172（N2982 一并解决）、2103（`allocator_traits<allocator<T>>::propagate_on_container_move_assignment`）、2108（与 `is_always_equal` 相关；N4258 引入该 trait，此关联未核实）、3036（弃用 `polymorphic_allocator::destroy`）、3170（`is_always_equal` 导致派生分配器被当作永远相等）、2095 / 2921 / 2976 / 3003（`promise`/`packaged_task` 的分配器构造历史）。

---

## 附录 C：参考来源

### C.1 标准文本与工作草案

- C++11 工作草案 N3337：[allocator.requirements](https://timsong-cpp.github.io/cppwp/n3337/allocator.requirements)、[allocator.traits](https://timsong-cpp.github.io/cppwp/n3337/allocator.traits)、[allocator.uses](https://timsong-cpp.github.io/cppwp/n3337/allocator.uses)
- C++17 工作草案 N4659：`[allocator.traits]` 的 C++17 版本（含 `is_always_equal`）
- C++23 工作草案 N4950：[version.syn](https://timsong-cpp.github.io/cppwp/n4950/version.syn)、[allocator.traits](https://timsong-cpp.github.io/cppwp/n4950/allocator.traits)
- 当前工作草案：[eel.is/c++draft/allocator.traits](https://eel.is/c++draft/allocator.traits)、[memory.resource](https://eel.is/c++draft/memory.resource)

### C.2 WG21 提案与缺陷报告

提案链接统一使用 `https://wg21.link/<编号>` 形式，编号与标题见附录 B。缺陷报告见 [LWG issue 列表](https://cplusplus.github.io/LWG/)，本文引用的编号：431、580、635、1075、1166、1172、2103、2108、3036、3170、2095、2921、2976、3003、3887。

### C.3 参考页面

- cppreference：[std::allocator](https://en.cppreference.com/w/cpp/memory/allocator)、[std::allocator_traits](https://en.cppreference.com/w/cpp/memory/allocator_traits)、[std::pmr::polymorphic_allocator](https://en.cppreference.com/w/cpp/memory/polymorphic_allocator)、[std::pmr::memory_resource](https://en.cppreference.com/w/cpp/memory/memory_resource)、[allocate_at_least](https://en.cppreference.com/w/cpp/memory/allocator_traits/allocate_at_least)、[std::scoped_allocator_adaptor](https://en.cppreference.com/w/cpp/memory/scoped_allocator_adaptor)、[std::uses_allocator](https://en.cppreference.com/w/cpp/memory/uses_allocator)
- cppreference 特性宏表：[feature_test](https://en.cppreference.com/w/cpp/feature_test)
- cppreference 编译器支持：[C++17](https://en.cppreference.com/w/cpp/compiler_support/17)、[C++20](https://en.cppreference.com/w/cpp/compiler_support/20)、[C++23](https://en.cppreference.com/w/cpp/compiler_support/23)、[C++26](https://en.cppreference.com/w/cpp/compiler_support/26)
- libc++ 状态：[C++17](https://libcxx.llvm.org/Status/Cxx17.html)、[C++20](https://libcxx.llvm.org/Status/Cxx20.html)、[C++23](https://libcxx.llvm.org/Status/Cxx23.html)、[C++26](https://libcxx.llvm.org/Status/Cxx26.html)
- libstdc++ 状态：[GCC 标准库支持状态](https://gcc.gnu.org/onlinedocs/libstdc++/manual/status.html)

> 本文的引用核对时间为 2026-11；实现支持页会随版本更新，引用具体版本前应重新核对。
