---
title: "C++ vector 解析"
slug: "cpp-vector"
date: "2026-11-14"
tags: ["C++", "标准库", "STL", "内存管理"]
series: "C++ 标准库"
series_order: 4
draft: false
summary: "以标准条款与三家实现源码为证据，拆解 std::vector 的容量模型、扩容策略、失效规则与异常保证：说明几何增长的必要性、1.5 与 2 的取舍来源、重分配的回滚路径，以及 bool 特化与 inplace_vector 的位置。"
---

> 副标题：容量、失效与异常：标准条款与三家实现的对照
>
> 证据基准：2026-11。标准侧以 C++ 工作草案的 eel.is 快照为准，历史措辞对照 N4861（C++20）与 N4950（C++23）；实现侧对照本机 libstdc++ 16.2、上游 MSVC STL main（`_MSVC_STL_VERSION` 为 145，2026-11）与 libc++ main 分支源码，行号对应抓取时的提交。
>

## 0. 结论摘要

1. `vector` 的接口很小，行为由三个契约决定：连续存储下的容量模型、可精确描述的失效规则、由元素类型属性决定的异常保证。多数正确性问题来自其中一个契约被误读。
2. 连续容器身份由两条要求合成：`[vector.overview]/2` 对非 `bool` 元素要求满足连续容器，`[container.reqmts]/68` 要求迭代器建模 `contiguous_iterator`。`data()`、指针算术与 C 接口互操作都建立在这两条上。
3. 复杂度契约：尾部插入与删除摊销常数时间，中间插入与删除线性时间。`insert` 重分配时线性于结果规模，否则线性于插入数加到尾距离；`erase` 的赋值次数等于擦除点之后的元素数，析构次数等于被删元素数。
4. 失效规则按「是否重分配」分三段：重分配使全部引用、指针、迭代器失效；不重分配时插入点之前有效、插入点及之后失效；`erase` 使擦除点及之后失效。
5. 异常保证分档：尾部插入在元素可拷贝或移动构造 `noexcept` 时是强保证；只可移动且移动可能抛时效果未指定。中间插入只在元素操作之外的异常下才保证无效果。
6. 几何增长是摊销常数的前提。容量按因子 `c > 1` 增长时，插入 n 个元素的总搬迁次数约为 `c / (c - 1) * n`：因子 2 约 2n，因子 1.5 约 3n；固定增量会退化为 O(n²)。
7. 三家实现的增长因子：libstdc++ 用 `size() + max(size(), n)`（2 倍），libc++ 用 `2 * capacity()`（2 倍），MSVC 用 `capacity() + capacity() / 2`（1.5 倍）。C++23 的 `allocate_at_least` 允许实现把更大的实际分配记为容量。
8. 1.5 与 2 的取舍是搬迁次数、峰值内存、空闲块复用与容量浪费之间的折中，标准只规定复杂度，不规定因子。
9. 扩容后的容量由实现决定：标准只要求 `capacity() >= size()`，以及 `reserve(n)` 之后 `capacity() >= n`；连续插入得到的容量序列不是可移植契约。
10. 重分配的顺序固定为：分配新存储、构造新元素、搬迁旧元素、释放旧存储。先构造后搬迁是为了处理 `v.push_back(v[0])` 一类参数引用旧元素的别名情形。
11. 搬迁策略由类型属性决定：可平凡重定位的类型按字节复制，`noexcept` 移动的类型用移动，否则可拷贝时拷贝。`move_if_noexcept` 把这条规则变成标准工具。
12. 容量管理：`reserve` 只增不减；`shrink_to_fit` 是非约束请求，libstdc++ 对「不可拷贝且移动可能抛」的类型直接不收缩，MSVC 精确收缩且可能抛 `bad_alloc`，libc++ 声明 `noexcept` 但成功后容量仍可能大于 `size()`。
13. `vector<bool>` 是位压缩特化：不是连续容器，没有 `data()`，`reference` 是代理而不是 `bool&`。位图之外的用途应选择 `vector<char>`、`std::bitset` 或 `boost::dynamic_bitset`。
14. C++26 的 `inplace_vector` 与容器加固（P3471R4）扩展了工具箱，没有改变 `vector` 的模型。日常使用仍归结为三件事：按量级预估容量、不跨修改持有元素地址、让移动构造与移动赋值 `noexcept`。

---

## 1. 范围与口径

`std::vector` 的接口表很短：构造、容量、元素访问、修改，加上比较与 `swap`。决定行为的主要因素是三个契约：

- 容量契约：`size()` 个元素连续存放，`capacity()` 是已分配存储能容纳的元素数，`[size(), capacity())` 是尚未构造对象的原始存储。
- 失效契约：哪些操作使已有的引用、指针、迭代器失效。
- 异常契约：某个操作抛异常后容器处于什么状态。

多数关于 `vector` 的故障都能归到其中一个契约被误读。保存元素地址后调用 `push_back` 导致重分配，是失效契约的问题；调用 `shrink_to_fit` 后容量没有下降，是容量契约的问题；`emplace_back` 抛出后容器是否回滚，是异常契约的问题。

### 1.1 证据分级与版本基准

本文用四类标记区分证据等级，正文按需标注：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | C++ 工作草案的可观察要求 | `[vector.capacity]/4` 规定 `reserve` 之后的容量 |
| [paper] | WG21 提案与缺陷报告 | P1206R7 为容器增加 `append_range` 一类接口 |
| [impl] | 标准库实现源码 | libstdc++ 的 `_M_check_len` |
| [推断] | 由证据推出的工程判断 | 1.5 倍增长对内存复用的影响 |

版本基准：标准侧以 eel.is 的 2026-11 草案快照为准，C++20 与 C++23 的措辞用 N4861、N4950 对照，段号变化只在影响引用时说明。实现侧对照本机 libstdc++ 16.2（GCC 16.2.0）、上游 MSVC STL 与 libc++ 的 main 分支源码，行号对应抓取时的版本。

草案不是正式标准，正式文本是 ISO/IEC 14882。本文引用的段号对应草案快照，标准换版后可能位移。

### 1.2 不做什么

- 不重述容器与分配器的全部要求：分配器协议见系列第 2 篇《标准库分配器的演化》。
- 不做性能测试：本文关注语义与实现路径，不比较实现的绝对性能。
- 不比较第三方容器实现（EASTL、folly、Abseil）的 `vector`，除非用于说明某个选择的代价。
- 不讨论标准库 ABI 的全貌，只在与失效、调试或混合链接相关处提及。

---

## 2. 标准契约

### 2.1 要求集合

`vector` 的规范身份由要求集合定义，不由接口清单定义。[draft][vector.overview]/1–/2 给出三条：

- 它是序列容器，尾部插入与删除摊销常数时间，中间插入与删除线性时间。
- 它满足容器（container）、可逆容器（reversible container）、分配器感知容器（allocator-aware container）与序列容器的要求，包括大部分可选序列容器要求。
- 对除 `bool` 以外的元素类型，它满足连续容器（contiguous container）的要求。

连续容器的定义不在 `[vector]` 里，而在 `[container.reqmts]/68`：迭代器与常迭代器满足随机访问迭代器要求，并建模 `contiguous_iterator`。这两条合起来给出 `data()`、指针算术、与 C 接口互操作的规范依据。`vector<bool>` 被排除在外，原因见第 8 章。

四个例外需要记住：`vector` 不提供 `push_front`、`prepend_range`、`pop_front`、`emplace_front`（[draft][vector.overview]/2 明确列出）。这些操作在连续存储上的成本只能是线性的，标准选择不提供。

[draft][vector.overview]/3 还要求 `iterator` 与 `const_iterator` 满足 constexpr 迭代器要求，这是 C++20 让容器进入常量求值带来的结果；/4 规定不完整类型的使用条件。两条都不改变运行时行为。

版本差异体现在表述方式上。C++20（N4861）的 /2 用「[container.requirements] 中的两张表」描述容器与可逆容器要求，C++23（N4950）起改为具名要求锚点（`[container.reqmts]`、`[container.rev.reqmts]`、`[container.alloc.reqmts]`），并把 `prepend_range` 加入不提供的操作列表。要求集合本身没有变化，变化的是组织方式。

### 2.2 复杂度契约

复杂度条款分散在 `[vector.cons]`、`[vector.capacity]`、`[vector.modifiers]`，合并成一张表：

| 操作 | 复杂度 | 失效范围 | 异常保证 |
| --- | --- | --- | --- |
| 构造 n 个元素 | 线性于 n | 不适用 | 对象未构造完成，不适用 |
| `push_back`/`emplace_back` | 摊销常数，重分配时线性 | 重分配则全部，否则仅尾部 | 强保证（有条件，见第 6 章） |
| `insert`/`emplace` 中间 | 重分配时线性于结果规模，否则线性于插入数加到尾距离 | 重分配则全部，否则插入点及之后 | 元素操作抛异常时可能有效果 |
| `erase` | 线性于擦除点之后的元素数 | 擦除点及之后 | 不抛，除非元素赋值抛 |
| `clear` | 线性于元素数 | 全部 | 不抛 |
| `reserve` | 线性于元素数 | 重分配则全部 | 移动构造抛异常时可能有效果 |
| `shrink_to_fit` | 重分配时线性 | 重分配则全部 | 同上 |
| `resize` | 线性于新增或删除的元素数 | 重分配则全部 | 强保证（默认插入版本有条件） |

两个细节需要单独说明。

`erase` 的复杂度不按被删元素数计，而按擦除点之后的元素数计：`[vector.modifiers]/6` 规定析构函数调用次数等于被删元素数，赋值运算符调用次数等于擦除之后剩余的元素数。删除首元素最贵，删除尾元素最便宜。

`insert` 的复杂度分两支：重分配时线性于结果规模，所有元素都要搬一次；不重分配时线性于插入个数加上插入点到末尾的距离，只需搬插入点之后的元素。

当前草案的 `[vector.modifiers]/3` 对范围插入与迭代器对插入给出「至多一次重分配」的规范性要求，但有条件：`R` 建模 `approximately_sized_range` 且 `distance(rg) <= reserve_hint(rg)`，或 `R` 建模 `forward_range`。C++23 的 `[vector.modifiers]` 没有这一段。

### 2.3 失效规则

失效规则可以压缩成三段：

1. 重分配使所有引用、指针、迭代器失效，包括 `end()`（[draft][vector.modifiers]/2、[vector.capacity]/7、/11）。
2. 不重分配时，插入点之前的引用、指针、迭代器保持有效，插入点及之后（含 `end()`）失效（[draft][vector.modifiers]/2）。
3. `erase` 使擦除点及之后失效，之前的保持有效；`clear` 使全部失效（[draft][sequence.reqmts] 的 `clear` 条目）。

这三条都挂在一个前提上：是否重分配。判断重分配是否发生，要看 `size()` 与 `capacity()` 的关系，不看调用的是哪个函数。`reserve` 之后、容量之内的插入不会重分配，规则退化为第 2 条。

只读操作不失效有规范依据：`[container.reqmts]/67` 规定，除非显式说明，调用容器成员函数不会使迭代器失效，也不会改变容器内元素的值。这条规则让「查找、遍历、比较不改变容器」成为可依赖的前提。

### 2.4 异常保证

标准把保证分成若干级，`vector` 的不同操作落在不同级别：

| 级别 | 含义 | `vector` 中的例子 |
| --- | --- | --- |
| 不抛 | 声明 `noexcept` 且实现不抛 | `size`、`capacity`、`empty`、`pop_back` |
| 强保证 | 抛异常后容器保持原状 | 尾部 `push_back`（条件）、`resize(sz, c)`、`reserve`（条件） |
| 基本保证 | 抛异常后容器有效，状态未知 | 中间 `insert` 在元素操作抛异常时 |
| 未指定 | 标准不作要求 | 不可拷贝且移动可能抛的类型扩容失败 |

容器要求给出了一条通用保证：[container.reqmts]/66 规定，除非另有说明，单元素 `insert`/`emplace` 抛异常时函数无效果，`push_back`/`emplace_back` 抛异常时函数无效果，`erase`/`clear`/`pop_back` 不抛异常。`[vector.modifiers]` 是这些例外的来源之一。

`[vector.modifiers]/2` 的措辞分三句：

- 由元素拷贝构造、移动构造、赋值、移动赋值之外的异常触发时，无效果。
- 尾部插入单元素时，若 `T` 是 `Cpp17CopyInsertable` 或 `is_nothrow_move_constructible_v<T>` 为真，无效果。
- 否则，若移动构造抛出且 `T` 不可拷贝，效果未指定。

最后一句是 `vector` 主要的未指定角落。它对应的类型是「只可移动、移动可能抛」：拷贝被删除，`move_if_noexcept` 没有退路，实现只能移动；移动失败时新存储里已构造了一部分元素，旧存储的状态已不可恢复，标准因此不给保证。规避方式是让移动构造 `noexcept`，或者用 `reserve` 把扩容挪到不容易失败的位置。

`reserve` 与 `shrink_to_fit` 的保证带同一个限定：由非 `Cpp17CopyInsertable` 类型的移动构造抛出的异常，不保证无效果（[draft][vector.capacity]/4、/9）。原因是重分配必须搬迁旧元素，搬迁失败时没有通用的安全回滚办法。

### 2.5 分配器感知

`vector` 通过 `allocator_traits` 访问分配器：存储用 `allocate`/`deallocate`，元素的构造与析构走 `construct`/`destroy`（`vector<bool>` 是例外，见第 8 章）。

分配器传播由三个 traits 决定：`propagate_on_container_copy_assignment`、`propagate_on_container_move_assignment`、`propagate_on_container_swap`。三者都为 `false` 时，等号两边的容器各自保留自己的分配器，跨分配器移动赋值退化为逐元素移动。

`capacity()` 以元素个数计量，背后分配的是原始字节，换算由分配器完成。`vector` 对象内部是否保存分配器、保存后是否占空间，由分配器是否为空类决定：空分配器通常通过空基类优化不占空间，有状态分配器会增加对象大小。`allocator_traits<A>::pointer` 可以不是 `T*`，此时迭代器与 `data()` 的实现要经过解包装。本文后续假定分配器的指针类型是 `T*`，fancy pointer 的额外成本在分配器篇讨论。

---

## 3. 对象模型与容量

### 3.1 三个指针

三家实现的 `vector` 都用「起始、当前末尾、容量末尾」三个指针描述状态：

| 实现 | 内部表示 | 位置 |
| --- | --- | --- |
| libstdc++ | `_Vector_impl_data` 的 `_M_start`、`_M_finish`、`_M_end_of_storage` | `bits/stl_vector.h:98`–`102` |
| MSVC STL | `_Vector_val` 的 `_Myfirst`、`_Mylast`、`_Myend`（`stl/inc/vector:437`–`439`），与分配器一起放入 `_Compressed_pair`（`vector:2247`） | `stl/inc/vector:390` |
| libc++ | `__vector_layout` 的 `__begin_`、`__end_` 与压缩对中的容量指针（`__vector/layout.h:219`、`225`–`227`），`vector` 以 `__layout_` 成员组合 | `__vector/vector.h:644` |

由此得到两个推论。其一，`size() = end - begin`、`capacity() = cap - begin`，都是常数时间操作。其二，三个指针全为空时 `capacity()` 为 0，第一次插入必须分配。

对象大小可以由布局推出：64 位平台上三个指针占 24 字节，元素类型不进入对象大小；空分配器经空基类优化后通常不占空间，有状态分配器会增加对象大小。

调试模式会多占空间。MSVC 的 `_Vector_val` 继承 `_Container_base`，调试版通过容器代理记录迭代器，对象因此变大（第 9 章）。同一头文件在不同编译选项下产生不同 `sizeof`，这是混用调试库与发布库会出问题的原因之一。

### 3.2 布局选择：三个指针与首指针加长度

`vector` 至少需要记录三个量：缓冲区起始、元素个数、缓冲区容量。只用「起始指针加长度」覆盖前两个量，容量仍需单独记录，否则 `push_back` 无法判断是否要重分配，析构时也无法把整块存储还给分配器。因此在 `vector` 里，「首指针加长度」实际仍是三个字段，只是字段的物化方式有两种：

- 指针表示：`begin`、`end`、容量末尾三个指针，`size()` 与 `capacity()` 由相减得到。
- 尺寸表示：`begin` 指针加 `size`、`capacity` 两个整数，`end()` 与容量末尾指针由加法算出。

两种表示的字段数相同，差别在于把哪个量物化。指针表示让 `end()` 与「下一个写入位置」直接是存储的指针；尺寸表示让 `size()` 与 `capacity()` 直接是字段，代价是每次取末尾指针都要做一次加法。

libc++ 的布局头把两种表示并列写出来：指针布局是默认布局，用于维持二进制兼容；尺寸布局把末尾指针改为按需计算，文档称采用尺寸布局的程序「测得了更好的计算与内存性能」，并建议在没有 ABI 约束时优先选择尺寸布局（`libcxx/include/__vector/layout.h:41`–`90`）。切换由 `_LIBCPP_ABI_VECTOR_LAYOUT_SIZE_BASED` 控制（`layout.h:124`、`221`–`228`），一个二进制内只能选一种。

三家实现默认都用指针表示，原因有三个：

- 连续容器的迭代器就是指针，`begin()`、`end()` 直接返回存储的指针，不必在调用时计算。
- 追加元素的热路径比较 `end != 容量末尾` 后写入，指针表示把「是否还有剩余容量」变成一次指针比较。
- ABI 已经固定。libstdc++ 与 MSVC 的布局是二进制接口的一部分；libc++ 为了兼容既有二进制，把尺寸布局做成可选项。

尺寸表示的收益是把三个指针换成一个指针加两个整数，更新元素个数时不必同时维护末尾指针；代价是 `end()` 与 `data() + size()` 这类调用需要重新计算指针。两种表示都维护 `size() <= capacity()`，对象大小都是三个机器字，选择权在实现与 ABI，不在使用者手里。

### 3.3 容量不变量

`vector` 维持一条不变量：`size() <= capacity()`，`[begin, begin + size())` 是已构造对象，`[begin + size(), begin + capacity())` 是未构造的原始存储。这条不变量解释了四个现象：

- `resize` 向下只析构元素，不释放存储，容量不变。
- `clear` 析构全部元素，容量不变。
- `shrink_to_fit` 要减少容量必须重分配，所以它不是常数时间操作。
- `reserve` 只增加容量，不改变元素个数。

未构造区间意味着 `data() + size()` 之后不能解引用，即使下标小于 `capacity()`。下标落在未构造存储上属于未定义行为：`at` 检查 `size()`，`operator[]` 默认不检查（加固模式下检查 `size()`），两者都不看 `capacity()`。

### 3.4 data() 与空容器

`data()` 的规范保证只有一句：[draft][vector.data]/1 要求 `[data(), data() + size())` 是有效范围，非空时 `data() == addressof(front())`。空容器没有规定 `data()` 必须为空指针，也没有规定必须非空。

实现可以让空容器的 `data()` 返回空指针，也可以在 `clear()` 之后继续返回原缓冲区地址，两种做法都符合标准。使用规则由此确定：判断容器是否为空用 `empty()`，不要看 `data()`。

`data()` 与元素访问函数的边界不同：`operator[]` 越界是未定义行为，`at` 越界抛 `std::out_of_range`。`at` 的成本是一次比较与可能的分支，热路径上省略它需要下标有独立保证。

### 3.5 不完整类型

C++17 起 `vector` 可以用不完整类型实例化，前提是分配器满足完整性要求，特性宏为 `__cpp_lib_incomplete_container_elements`。这让「类内保存 `vector<自身>`」与 pimpl 里的容器声明成为合法写法。

限制在操作上：需要 `sizeof(T)`、析构 `T` 或构造 `T` 的成员，必须在 `T` 完整处实例化。头文件里只写 `std::vector<Impl>` 成员、把析构函数放到实现文件里定义，是常见做法。

### 3.6 对齐与分配器指针

`vector` 的存储由分配器提供，对齐要求也由分配器保证。自定义分配器如果只调用 `malloc`，`alignas(64)` 的元素会失去对齐保证；正确做法是用 `std::allocator`，或在分配器里处理过度对齐。

`allocator_traits<A>::pointer` 允许不是 `T*`，这时迭代器类型与 `data()` 的实现都要经过 `to_address` 解包装。本文后续假定指针类型是 `T*`。

---

## 4. 扩容

### 4.1 几何增长的必要性

`push_back` 的摊销常数时间依赖容量按几何级数增长。设每次扩容把容量乘 `c > 1`，容量从 1 开始，插入 n 个元素的总搬迁次数约为：

```text
1 + c + c^2 + ... + c^k ≈ c / (c - 1) * n
```

`c = 2` 时约 2n 次搬迁，`c = 1.5` 时约 3n 次。两者都是 O(n)，均摊到每次插入是 O(1)。若每次只增加固定数量 `d`，搬迁总次数为 `n^2 / (2d)`，插入变成二次复杂度。

这条推导给出两个结论：增长因子必须大于 1；因子越接近 1，搬迁越多，因子越大，浪费的容量越多。标准不规定因子，只规定复杂度。

### 4.2 三家实现的增长因子

| 实现 | 增长函数 | 公式 | 因子 |
| --- | --- | --- | --- |
| libstdc++ | `_M_check_len`（`bits/stl_vector.h:2189`–`2199`） | `size() + max(size(), n)` | 2 |
| MSVC STL | `_Calculate_growth`（`stl/inc/vector:2009`–`2025`） | `capacity() + capacity() / 2`，溢出取 `max_size()` | 1.5 |
| libc++ | `__recommend`（`__vector/vector.h:881`–`892`） | `min(max(new_size, 2 * capacity), max_size())`，用饱和加法防溢出 | 2 |

三个函数都处理同一类边界：请求超过 `max_size()` 时抛 `length_error`；几何增长溢出时退回 `max_size()`；本次请求大于几何增长结果时取请求值，因为一次插入多个元素时只扩一倍可能不够。

C++23 起实现可以使用 `allocate_at_least`：分配器可能返回比请求更大的块，容器把实际大小记为容量。MSVC 的 `_Reallocate<_At_least>` 走 `_Allocate_at_least_helper`（`stl/inc/vector:1650`–`1651`），libc++ 在 `emplace_back` 里调用 `__allocate_at_least`（`__vector/vector.h:1085`），两者的实际容量都可能大于增长公式算出的值，`reserve(n)` 之后 `capacity()` 也可能大于 n。

libstdc++ 的 `reserve` 直接按请求分配（`bits/vector.tcc:67`–`104`），不经过 `allocate_at_least`，容量恰好等于 `n`。

### 4.3 1.5 与 2 的取舍

增长因子是实现的自由选择，差异来自不同的权衡。

搬迁成本：因子为 2 时总搬迁约 2n，因子为 1.5 时约 3n。因子越大，扩容次数越少，搬迁越少。

内存峰值：重分配期间新旧两块同时存在，峰值约为 `(1 + c) * capacity` 个元素的空间。因子 2 的峰值是 3 倍，因子 1.5 是 2.5 倍。

内存复用：把此前各次扩容释放的块大小累加，因子为 c 时总和是 `c + c^2 + ... + c^k`，下一次请求是 `c^{k+1}`。`c < 2` 时总和大于下一次请求，释放的块有机会被复用；`c = 2` 时总和恒小于下一次请求，释放的块永远装不下新块。

Folly 的 `FBVector` 文档（<https://github.com/facebook/folly/blob/main/folly/docs/FBVector.md>）把这一点写成「2 是理论上最差的因子」，并提到其他编译器把因子降到 1.5。复用能否发生还取决于分配器是否合并空闲块、地址是否连续，标准不作保证[推断]。

容量浪费：因子越大，`size()` 与 `capacity()` 的差距可能越大。对内存敏感的场景，这个差距比搬迁成本更重要。

### 4.4 MSVC 的 1.5：来源与取舍

MSVC 的增长公式是 `capacity() + capacity() / 2`，源码注释只写 geometric growth，没有给出选择理由（`stl/inc/vector:2009`–`2025`）；公开文档里也找不到微软的书面说明。可以核实的是这个因子在机制上的后果。

因子 2 的内存复用劣势在第 4.3 节已经推导：释放块的总和永远小于下一次请求。因子 1.5 的总和约为 `3 * 1.5^k`，大于下一次请求 `1.5^{k+1}`，空闲块有机会被复用。Folly 的文档与围绕「理想增长因子」的讨论（<https://blog.demofox.org/2016/05/18/who-cares-about-dynamic-array-growth-strategies/>）把最优值定在黄金比例附近（约 1.618），1.5 是接近该值、又能用整数运算 `cap + cap / 2` 表达的折中[推断]。

MSVC STL 团队在公开讲座里把 1.5 到 2 之间的因子描述为速度与内存占用的折中；可查到的只有二手转述，原始视频已从 Channel 9 下线，本文只把它当作工程判断。

代价可以量化：因子为 2 时搬迁总量约 2n，1.5 时约 3n；到达 n 个元素的重分配次数从约 `log2(n)` 变成约 `log1.5(n)`，多出约 70%。MSVC 用更多的搬迁与重分配换取更低的峰值内存和更大的空闲块复用机会，这个取舍与 `_Calculate_growth` 的实现一致。

这个选择没有对错之分。libstdc++ 与 libc++ 保持倍增，换取更少的重分配；MSVC 选择 1.5，换取内存占用。标准不规定因子，同一段代码在三家实现上的容量序列与重分配时机都不同，依赖容量序列的代码不可移植。

### 4.5 reserve 的约束与用法

`reserve` 的规范约束有三条（[draft][vector.capacity]/3–/7）：

- 前置条件：`T` 是 `Cpp17MoveInsertable`，不满足时程序不符合标准。
- 效果：`n > capacity()` 时重分配，之后 `capacity() >= n`；否则不重分配，容量不变。
- 异常：`n > max_size()` 抛 `length_error`，分配失败抛分配器的异常；由非 `Cpp17CopyInsertable` 类型的移动构造抛出的异常不在无效果保证内。

使用上有三条边界：

- `reserve` 只增不减，要减少容量得用 `shrink_to_fit` 或新建容器（第 7 章）。
- `reserve` 不改变 `size()`，不构造元素，调用之后不能访问新增容量中的对象。
- `reserve` 保证此后直到某次插入会使 `size()` 超过 `capacity()` 为止不再重分配。

`reserve` 的语义本身决定了 `reserve(0)` 与小于当前容量的 `reserve` 都不缩减容量：效果条款只规定 `n > capacity()` 时重分配。

---

## 5. 修改操作的实现路径

### 5.1 尾部插入的两条路径

`push_back` 与 `emplace_back` 共享同一结构：容量足够时在当前末尾构造对象、把末尾指针加一；容量不足时走重分配路径。

libstdc++ 的慢路径是 `_M_realloc_insert`（`bits/vector.tcc:459`–`557`），MSVC 是 `_Emplace_back_with_unused_capacity`（`stl/inc/vector:855`）配合 `_Reallocation_guard2`（`vector:628`），libc++ 用 `_SplitBuffer` 构造新缓冲区后搬迁（`__vector/vector.h:1020`–`1028`）。

关闭加固与调试检查时，热路径的成本是一次构造加一次指针自增，除容量比较外没有额外开销。慢路径的成本是分配、搬迁全部元素、释放旧存储，比例由增长因子决定。

### 5.2 重分配的顺序

三家实现的重分配都按同一顺序，顺序本身有规范理由：

1. 计算新容量并分配新存储。
2. 在正确位置构造新元素。
3. 搬迁旧元素到新存储。
4. 销毁旧元素、释放旧存储、更新三个指针。

先构造新元素再搬迁旧元素，是为了处理 C++11 的别名情形：`v.push_back(v[0])` 的参数可能引用旧存储中的元素，先搬迁会让参数指向已被移走的对象。libstdc++ 在 `_M_realloc_insert` 内有一段注释说明这一点（`bits/vector.tcc:479`–`483`）。

### 5.3 搬迁：移动、拷贝与重定位

搬迁用哪种操作由类型属性决定：

- 类型可平凡重定位（trivially relocatable）时按字节复制。libstdc++ 的 `_S_use_relocate` 与 `__relocate_a` 走 `__builtin_memcpy`（`bits/stl_uninitialized.h:1394`），不调用构造函数。
- 否则，移动构造是 `noexcept` 时用移动。
- 否则，有拷贝构造时用拷贝，因为拷贝失败时旧存储仍然有效，能提供强保证。
- 否则，只可移动且移动可能抛，只能用移动，失败时没有回滚保证。

实现按这条规则分支：libstdc++ 用 `__uninitialized_move_if_noexcept_a`（`bits/vector.tcc:533`–`543`），MSVC 用 `is_nothrow_move_constructible_v<_Ty> || !is_copy_constructible_v<_Ty>` 决定是否移动（`stl/inc/vector:906`–`917`），libc++ 用 relocation 与 `__move_if_noexcept` 系列工具。

libstdc++ 的判定是 `__is_trivial`（`bits/stl_uninitialized.h:1346`），`int`、`double` 与简单聚合类型因此走字节复制路径，代价是内存带宽；`std::unique_ptr`、`std::string` 这类不满足 trivial 但移动 `noexcept` 的类型走移动路径，代价是逐元素构造。这解释了为什么 `vector<int>` 的扩容通常比同字节数的 `vector<std::string>` 便宜。

### 5.4 中间插入

容量足够时，中间 `insert` 把插入点之后的元素整体后移一位，在空出的位置构造新元素。容量不足时走重分配，搬迁时把插入点之后的元素直接构造到偏移后的位置，避免先整体移位再插入。

复杂度由此确定：不重分配时移动的元素数是「插入个数 + 插入点到末尾的距离」；重分配时所有元素都要搬一次。

`insert` 的异常保证弱于尾部插入：由元素的拷贝构造、移动构造、赋值、移动赋值抛出的异常，标准允许留下效果（[draft][vector.modifiers]/2）。原因是后移与构造分步进行，中途失败时元素已经移动了一部分。

### 5.5 erase 与 clear

`erase(pos)` 把 `pos` 之后的元素逐个赋值到前一位，再析构最后一个元素；实现通常把连续赋值优化成块拷贝。复杂度按赋值次数计，等于擦除点之后的元素数（[draft][vector.modifiers]/6）；析构次数等于被删元素数。

`clear()` 只析构元素，不释放存储，容量不变。`pop_back()` 析构最后一个元素并回退末尾指针，声明为 `noexcept`。

复杂度上的差异可以推出耗时关系：`insert` 到中间只移动插入点之后的元素，`erase` 首元素要移动擦除点之后的全部元素，后者的元素移动次数约为前者的两倍；`pop_back` 只做一次析构与一次指针回退。

### 5.6 一次插入多个元素

范围版本的 `insert` 与 `insert_range`、`append_range`（C++23）在实现里通常合并为一次重分配。

当前草案新增 `[vector.modifiers]/3`，把范围插入与迭代器对插入的「至多一次重分配」写成规范性要求，但有条件：`R` 建模 `approximately_sized_range` 且 `distance(rg) <= reserve_hint(rg)`，或 `R` 建模 `forward_range`。C++23 的文本没有这一段，同类内容以建议形式出现在范围构造的要求里。输入迭代器版本无法预先知道长度，可能触发多次重分配。

---

## 6. 异常保证与移动语义

### 6.1 强保证的两个前提

重分配要搬迁全部旧元素。搬迁失败时能否回到原状，取决于两件事：旧存储是否仍然完整，已构造的新元素能否逐个析构。

拷贝失败时源对象不变，旧存储完整，回滚只需析构新存储里已构造的元素。移动失败时源对象可能已被改动，旧存储不再完整，没有通用的回滚办法。标准因此把「可拷贝」与「移动不抛」作为强保证的充分条件（[draft][vector.modifiers]/2）。

### 6.2 三种类型的分档

| 类型属性 | 搬迁方式 | 尾部插入的保证 |
| --- | --- | --- |
| 可拷贝 | 拷贝（移动可能抛时）或移动 | 强保证 |
| 只可移动，移动 `noexcept` | 移动 | 强保证 |
| 只可移动，移动可能抛 | 移动 | 效果未指定 |

第三种只在移动构造实际抛出时暴露问题：不抛时程序正常，抛出时容器处于有效但未知的状态。这条路径在测试中较少覆盖，构造一个「移动会抛」的类型需要额外代码。

### 6.3 move_if_noexcept 的选择规则

`std::move_if_noexcept` 的规则是：`!is_nothrow_move_constructible_v<T> && is_copy_constructible_v<T>` 为真时返回 `const T&`，否则返回 `T&&`。等价表述是「能移动且移动不抛时移动，否则能拷贝时拷贝，都不能时移动」。

三家实现都按这条规则分支：

- libstdc++ 用 `__uninitialized_move_if_noexcept_a`（`bits/vector.tcc` 的重分配路径）。
- MSVC 在重分配路径里写 `if constexpr (is_nothrow_move_constructible_v<_Ty> || !is_copy_constructible_v<_Ty>)`，条件不满足时走拷贝。
- libc++ 用 `__uninitialized_allocator_relocate` 与 `__move_if_noexcept` 系列工具。

这条规则的结果是：`noexcept` 移动的类型在扩容时走移动，移动可能抛但有拷贝的类型走拷贝，两种情况下旧元素都只被搬一次。

### 6.4 移动赋值的 noexcept 影响 erase

`erase` 通过赋值把后续元素前移。标准对 `erase` 的异常规定是「不抛，除非 `T` 的赋值运算符或移动赋值运算符抛」（[draft][vector.modifiers]/5）。移动赋值可能抛的类型，`erase` 因此可能抛，抛出时容器状态不受保证。

需要「删除不抛」的场景包括析构路径与无异常构建。可行的做法是保证移动赋值 `noexcept`，或者避免中间删除：把待删元素与末尾元素交换后 `pop_back`，代价是一次交换与一次析构。

### 6.5 建议

- 移动构造与移动赋值标 `noexcept`，除非类型确实需要抛。这个选择不只影响 `vector`，还影响所有依赖 `move_if_noexcept` 的容器与算法。
- 只可移动且移动可能抛的类型，在插入前 `reserve`，把重分配挪到可预期的位置；或改用 `std::deque`、`std::list`、`vector<std::unique_ptr<T>>`。
- 不要假设移动一定比拷贝便宜：小对象移动与拷贝的成本可能相同。

---

## 7. 容量管理

### 7.1 shrink_to_fit 是非约束请求

[draft][vector.capacity]/9 的措辞是：`shrink_to_fit` 是「减少 `capacity()` 到 `size()` 的非约束请求」，非约束是为了给实现留优化空间；它不增加容量，但可以通过重分配减少容量；由非 `Cpp17CopyInsertable` 类型的移动构造抛出的异常不在无效果保证内。

实现可以完全不收缩，也可以收缩到任意不小于 `size()` 的值。三家实现的做法：

| 实现 | 行为 |
| --- | --- |
| libstdc++ | `_M_shrink_to_fit` 先判 `capacity() == size()`，再调用 `__shrink_to_fit_aux`；元素可拷贝或移动 `noexcept` 时用 `move_if_noexcept` 构造新容器并 `swap`，否则返回、不收缩；全过程不抛（`bits/vector.tcc:919`、`bits/alloc_traits.h:1027`–`1055`） |
| MSVC STL | 空容器调用 `_Tidy()` 释放存储；非空容器调用 `_Reallocate<_Exactly>(size())`，重分配到精确大小，分配失败抛 `bad_alloc`（`stl/inc/vector:1736`） |
| libc++ | `shrink_to_fit` 声明为 `noexcept`；只有新缓冲容量更小时才搬迁，成功后容量仍可能大于 `size()`（`__vector/vector.h:1030`–`1047`） |

libstdc++ 的 `__shrink_to_fit_aux` 只在元素可拷贝或移动 `noexcept` 时构造新容器并交换，条件不满足时直接返回，容量不变；成功路径是新分配加 `swap`，没有 `realloc`（`bits/alloc_traits.h:1034`–`1049`）。

### 7.2 释放内存的三种写法

`shrink_to_fit` 可能无效，需要确定释放时有三种写法：

- 拷贝交换：`std::vector<T>(v).swap(v)`。拷贝一份精确大小的容器，交换后临时对象析构释放旧存储，要求 `T` 可拷贝。
- 移动重置：`auto old = std::move(v); v = std::vector<T>();`。`old` 在作用域结束时释放旧存储，要求分配器可比较相等，否则移动赋值可能退化为逐元素移动。
- 新建容器：直接让 `v` 指向新对象，并显式处理分配器与生命周期。

三条路径的代价都是 O(n) 的元素构造与一次分配，选择取决于类型是否可拷贝与分配器是否有状态。

### 7.3 容量的精确性

标准只保证 `capacity() >= size()`，以及 `reserve(n)` 之后 `capacity() >= n`，不保证相等。C++23 的 `allocate_at_least` 允许分配器返回更大的块，实现可以把实际大小记为容量，容量因此可能超过请求值。

`vector<bool>` 的容量以位计，向上取整到位存储单位的整数倍，`reserve(n)` 之后 `capacity()` 可能大于 n。依赖逻辑不应写到 `capacity()` 的精确值上。

### 7.4 reserve 不适用的场景

`reserve` 不总是收益：

- 预估远大于实际用量时，多出的容量在容器生命周期内一直占用内存。
- 大块预留可能触发分配失败，`bad_alloc` 出现在与业务无关的位置。
- 短生命周期的小容器，重分配成本低于预留的判断与分配成本。

可用的经验规则是按量级预估（例如按批次大小预留），不按精确值预留；无法预估时让几何增长承担。

---

## 8. `vector<bool>` 特化

### 8.1 特化的规范位置

`vector<bool>` 是 `vector` 对 `bool` 的偏特化（[draft][vector.bool.pspc]/1），规范措辞写明它的目的：「为了优化空间分配」。特化的语义与主模板只有两处不同（[draft][vector.bool.pspc]/2）：与 `bool` 值相关的操作映射到存储中的位，`allocator_traits::construct` 不用于构造这些值。

### 8.2 与容器要求的偏离

[draft][vector.bool.pspc]/3 明确：「不要求数据以 `bool` 值的连续分配存储，推荐用位的空间优化表示」。由此产生四条后果：

- 它不是连续容器。[draft][vector.overview]/2 把连续容器要求限定为「元素类型不是 `bool` 时」。
- 它没有 `data()`。类摘要里没有这个成员，libstdc++ 显式声明 `void data() = delete;`（`bits/stl_bvector.h:1764`），让误用产生清晰的编译错误。
- `reference` 是代理类，不是 `bool&`。`v[0]` 返回的是代理对象，不能绑定到 `bool&`，也不能取地址；`decltype(v[0])` 是代理类型。
- 元素不是独立内存位置。多个位共享同一个机器字，两个线程写不同元素仍构成数据竞争（[推断]，依据内存模型对内存位置的定义）。

代理类提供 `operator bool`、`operator=` 与 `flip()`，并有 `swap(reference, reference)` 一类重载；`v.flip()` 翻转全部位（[draft][vector.bool.pspc]/10–/12）。

### 8.3 位存储的粒度

位存储的单位是一台机器字。libstdc++ 用 `_Bit_type`，定义为 `unsigned long`（`bits/stl_bvector.h:72`）；MSVC 用 `unsigned int`，固定 32 位（`stl/inc/vector:2264`）；libc++ 用 `size_type`（`__vector/vector_bool.h:88`）。

容量粒度由位存储单位的宽度决定。libstdc++ 的 `_Bit_type` 是 `unsigned long`：Windows/LLP64 上为 4 字节，容量按 32 位取整；LP64 平台上为 8 字节，按 64 位取整。MSVC 固定为 32 位，libc++ 按 `size_type` 的宽度（通常 64 位）取整。

空间上，`vector<bool>` 每个元素占一位，`vector<char>` 与 `bool[N]` 每个元素占一字节，理论压缩比为 8 倍。代价是每次读写都要做位运算与读改写，`vector<char>` 的单元素访问更便宜。

### 8.4 适用场景与替代方案

适合的场景有限：批量置位、翻转、计数的位图；元素数量大、内存敏感、不需要元素地址、不跨线程并发写。

不适合的场景：

- 需要把元素地址交给 C 接口或 `std::span`。
- 需要 `bool&` 语义，或泛型代码依赖 `reference` 是 `value_type&`。
- 多线程对不同元素并发写。
- 逐位读写低于按字节读写的热路径。

替代方案按需求分：

| 需求 | 方案 |
| --- | --- |
| 动态位集，需要 C 互操作 | `vector<char>` 或 `vector<std::uint8_t>` |
| 定长位集 | `std::bitset` |
| 动态位集，需要位运算接口 | `boost::dynamic_bitset` |
| 固定容量，普通元素语义 | C++26 的 `std::inplace_vector<bool, N>` |

### 8.5 历史与现状

这个特化来自早期 STL 把位集需求并入容器的设计。标准后续打过补丁：LWG 2187 为特化补上 `emplace` 与 `emplace_back`；C++23 通过 P2286R8 为 `vector<bool>::reference` 增加 `formatter` 特化（[vector.bool.fmt]），并用 `is-vector-bool-reference` 约束代理类型。标准没有移除这个特化的迹象，C++26 新增的 `inplace_vector` 也没有为 `bool` 提供位压缩特化。

---

## 9. 演进与工程实践

### 9.1 版本变化

| 版本 | 与 `vector` 相关的变化 |
| --- | --- |
| C++98 | 基本接口；没有 `data()`、`shrink_to_fit` 与移动语义 |
| C++11 | 移动构造与移动赋值、`emplace_back`/`emplace`、`initializer_list`、`data()`、`shrink_to_fit`、`allocator_traits` |
| C++17 | `emplace_back` 返回引用、不完整类型实例化、过度对齐的 `new`、`is_always_equal` |
| C++20 | constexpr 接口（P1004R2、P0784R7）、`erase`/`erase_if`（P1209R0）、连续迭代器概念与 constexpr 迭代器要求 |
| C++23 | `append_range`/`assign_range`/`insert_range` 与 range 构造（P1206R7）、`allocate_at_least`（P0401R6）配合、`vector<bool>::reference` 的 `formatter`（P2286R8） |
| C++26 | `inplace_vector`（P0843R14）、容器加固（P3471R4） |

表中最后一行对应的草案文本仍在变化：C++23 之后新增的 `[vector.modifiers]/3`（至多一次重分配）与 `[sequence.reqmts]` 的 Hardened preconditions 都属于这一轮修订。

### 9.2 constexpr 与 ranges 接口

P1004R2 让 `vector` 的接口成为 constexpr，P0784R7 让常量求值中可以使用动态分配。两者合起来允许在常量求值中构造与操作 `vector`。限制是常量求值中的分配在求值结束后回收，结果只能以常量表达式可表示的形式带出，不能作为运行期容器继续使用。

C++23 的 `append_range`、`assign_range`、`insert_range` 把「从 range 追加」变成成员函数，减少迭代器样板；C++20 的 `erase`/`erase_if` 把 erase-remove 惯用法收敛成自由函数（[draft][vector.erasure]）。

### 9.3 inplace_vector

C++26 加入 `std::inplace_vector`（P0843R14）：容量在编译期固定、元素内嵌在对象里、满足连续容器要求，不是分配器感知容器（[container.alloc.reqmts]/1 把它与 `array` 一起排除）。它的成员函数在会导致 `size() > N` 时抛 `std::bad_alloc`（[draft][inplace.vector.overview]/4），另有 `try_emplace_back` 一类返回指针、失败时返回空指针的接口。

与 `vector` 的分工：容量上限在编译期已知、需要避免分配的场景用 `inplace_vector`；容量未知或需要增长的场景用 `vector`。

### 9.4 加固与调试

P3471R4 为容器引入加固（hardening）。当前草案在 `[sequence.reqmts]` 中使用 Hardened preconditions 术语，例如 `a[n]` 要求 `n < a.size()`；`vector` 的支持由特性宏 `__cpp_lib_hardened_vector` 标记。加固是编译期选择：启用后越界与前置条件违反变成库内可诊断的失败，关闭时没有运行时开销。

三家实现各有开关：

- MSVC：`_ITERATOR_DEBUG_LEVEL` 取 0、1、2。0 关闭检查；大于 0 时容器带代理指针、迭代器带归属检查（`stl/inc/xmemory:1448`–`1454`）；2 额外使用加锁的代理操作。同一程序所有翻译单元必须一致。
- libstdc++：`_GLIBCXX_ASSERTIONS` 做轻量检查，`_GLIBCXX_DEBUG` 换成调试版容器。附带一个容易忽略的行为：未显式定义 `_GLIBCXX_ASSERTIONS` 且未开优化时，头文件会自动定义它（`bits/c++config.h:603`–`611`），`operator[]` 因此带越界断言（`bits/stl_vector.h:1253`），`-O2` 下则不生效。
- libc++：`_LIBCPP_HARDENING_MODE` 取 `none`、`fast`、`extensive`、`debug`。

MSVC 与 libstdc++ 的调试档会改变对象布局，libc++ 的加固档以断言为主、不改变 ABI。混用不同档位构建的目标文件属于错误配置，症状通常是运行时崩溃而不是链接错误。

### 9.5 失效陷阱清单

| 写法 | 问题 | 修正 |
| --- | --- | --- |
| 保存 `&v[i]` 或引用后 `push_back` | 重分配使指针失效 | 用下标访问，或在修改后重新取地址 |
| 循环中向正在遍历的 `vector` 插入 | 迭代器失效 | 先 `reserve`，或改成按下标遍历 |
| 对 `v.data()` 的指针做长期缓存 | 任何扩容或 `shrink_to_fit` 都会失效 | 缓存下标，不缓存指针 |
| 边遍历边 `erase` | 迭代器与下标同时偏移 | 用 `erase` 返回值，或用 `erase_if` |
| 在析构路径上依赖 `erase` 不抛 | 元素移动赋值可能抛 | 保证移动赋值 `noexcept`，或改成与末尾交换后 `pop_back` |

### 9.6 选型

| 容器 | 随机访问 | 尾部插入 | 中间插入 | 元素地址稳定 |
| --- | --- | --- | --- | --- |
| `vector` | O(1) | 摊销 O(1) | O(n) | 否 |
| `deque` | O(1) | 摊销 O(1) | O(n) | 否，首尾插入不失效引用 |
| `list` | 否 | O(1) | O(1) | 是 |
| `forward_list` | 否 | 无 | O(n) | 是 |
| `inplace_vector` | O(1) | O(1)，满则抛 | O(n) | 否 |
| `array` | O(1) | 不适用 | 不适用 | 是 |

选择规则：

- 默认用 `vector`。连续存储带来的缓存局部性通常比插入成本更重要。
- 元素地址必须稳定时，用 `list`、`forward_list`，或 `vector<std::unique_ptr<T>>` 把稳定对象放到堆上。
- 需要频繁在头部插入时用 `deque`；它不保证连续存储，没有 `data()`。
- 容量在编译期已知且不能分配时，用 `array` 或 `inplace_vector`。
- 位图需求用 `bitset`、`dynamic_bitset` 或 `vector<char>`，不用 `vector<bool>`。

---

## 10. 结论

`vector` 的接口很小，行为由三个契约决定：连续存储下的容量模型、可精确描述的失效规则、由类型属性决定的异常保证。三个契约都写在标准里，也都能在实现源码中找到对应代码。

工程上可执行的三条规则：

1. 规模可预估时按量级 `reserve`，把重分配从热路径挪走；无法预估时接受几何增长的摊销成本。
2. 任何可能改变容量的操作之后，重新获取指针、引用与迭代器，或改用下标访问。
3. 让移动构造与移动赋值 `noexcept`，否则扩容与 `erase` 会退化为拷贝，或失去强保证。

理解 `vector` 的关键在容量与失效的耦合：容量决定是否重分配，重分配决定失效范围，失效范围决定代码能不能持有元素地址。把这层关系记住，多数失效问题可以在写代码时避免。

---

## 参考

- 标准草案：`[vector.overview]`、`[vector.cons]`、`[vector.capacity]`、`[vector.data]`、`[vector.modifiers]`、`[vector.erasure]`、`[vector.bool.pspc]`、`[vector.bool.fmt]`、`[sequence.reqmts]`、`[container.reqmts]`、`[container.alloc.reqmts]`、`[iterator.requirements.general]`、`[iterator.concept.contiguous]`、`[inplace.vector.overview]`。
- 直达形式：<https://eel.is/c++draft/vector.overview>、<https://eel.is/c++draft/vector.capacity>、<https://eel.is/c++draft/vector.modifiers>、<https://eel.is/c++draft/vector.bool.pspc>、<https://eel.is/c++draft/container.reqmts>、<https://eel.is/c++draft/sequence.reqmts>、<https://eel.is/c++draft/inplace.vector.overview>。
- 历史草案：N4659（C++17）、N4861（C++20）、N4950（C++23），取自 cplusplus/draft 对应标签；版本对照只用于说明段号与措辞变化。
- 提案：P1004R2（Making std::vector constexpr）、P0784R7（More constexpr containers）、P1206R7（Ranges adaptors for containers）、P1209R0（erase_if）、P0401R6（allocate_at_least）、P0843R14（inplace_vector）、P2286R8（Formatting Ranges）、P3471R4（Standard library hardening）。
- 实现源码：libstdc++ 16.2.0（`bits/stl_vector.h`、`bits/vector.tcc`、`bits/stl_bvector.h`、`bits/alloc_traits.h`、`bits/stl_uninitialized.h`）、MSVC STL（`stl/inc/vector`）、libc++（`libcxx/include/__vector/vector.h`、`__vector/layout.h`）。
- 实现文档：Folly 的 `FBVector` 说明（<https://github.com/facebook/folly/blob/main/folly/docs/FBVector.md>）、demofox 的增长因子分析（<https://blog.demofox.org/2016/05/18/who-cares-about-dynamic-array-growth-strategies/>）。
- 标准库文档：<https://en.cppreference.com/w/cpp/container/vector>、<https://en.cppreference.com/w/cpp/container/vector_bool>、<https://en.cppreference.com/w/cpp/container/inplace_vector>。
