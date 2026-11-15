---
title: "std::variant 研究"
slug: "std-variant"
date: "2026-11-15"
tags: ["C++", "标准库", "variant", "类型安全联合"]
series: "C++ 标准库"
series_order: 11
draft: false
summary: "以标准条款、提案与三家实现源码为证据，拆解 std::variant 的布局、构造与赋值路径、valueless_by_exception 的成因、visit 的分派实现与比较哈希规则，并给出与 union、any、optional 的分工以及 ABI 与陷阱清单。"
---

## 0. 结论摘要

`std::variant` 的行为由三件事决定：索引标记哪个备选类型处于活跃状态，存储区容纳其中最大的备选类型，访问路径先检查索引。标准不允许它使用动态内存（[variant.variant]/1），因此布局、`sizeof` 与访问成本都能从这两部分推出来。

1. 布局是「联合体加索引」。索引字段的宽度由备选数量决定，取值在 1 到 4 字节之间；字段顺序、补齐方式与索引类型由实现定义，不同标准库之间的 `variant` 不能互换。

2. 空状态只出现在改变活跃成员的路径上。构造失败不产生空对象，因为对象尚未完成构造；赋值与 `emplace` 先析构旧值再构造新值，中间窗口里没有可读的值。四条路径中只有移动赋值是「必然为空」，其余三条都允许实现先构造临时对象再移动，实际行为由实现定义。

3. `visit` 的分派是常数时间。标准只对一个 `variant` 的访问要求常数复杂度，多个 `variant` 没有要求；三家实现都退化为查表或 `switch`，表的大小是各备选数的乘积，这是 `visit` 的主要代码体积成本。

4. 比较与哈希都把索引纳入。索引不同时不做值比较，空状态排在所有值之前，哈希值不等于所存值的哈希。C++20 加入 `<=>`，C++26 把比较运算符约束化（P2944R3），缺口是格式化：标准至今没有 `formatter` 特化。

5. 工程上可以收敛成三条规则：让备选类型的移动操作 `noexcept`，把可能为空的路径变成不可达分支；首位放 `std::monostate`，用 `in_place_index` 消除歧义；不依赖 `sizeof` 与索引宽度，在模块边界固定工具链。

---

## 1. 范围与口径

### 1.1 讨论对象

`std::variant` 的接口由四组操作构成：构造与赋值、状态查询（`index`、`valueless_by_exception`、`holds_alternative`）、访问（`get`、`get_if`、`visit`），以及比较、`swap` 与 `hash` 特化。接口表很短，行为由三个层面共同决定：

- 存储模型：所有备选类型共享一块存储，索引记录活跃成员。
- 状态模型：允许「不持有值」，这个状态不对应任何备选类型。
- 分派模型：访问先确定活跃成员，再选择该类型的操作。

多数与 `variant` 有关的故障可以归到其中一个层面。`get<T>` 抛异常是状态模型的问题，`visit` 编译失败是分派模型的问题，`sizeof` 与预期不符是存储模型的问题。

### 1.2 证据分级与版本基准

本文用四类标记区分证据等级：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | C++ 工作草案的可观察要求 | `[variant.visit]/8` 规定单 `variant` 访问的复杂度 |
| [paper] | WG21 提案与缺陷报告 | P0602R4 要求平凡性按备选传播 |
| [impl] | 标准库实现源码 | libstdc++ 的 `__select_index` |
| [推断] | 由证据推出的工程判断 | 索引宽度对对象大小的影响 |

标准侧以 2026-11 草案快照为准，C++17 与 C++20 的措辞用 N4659、N4861 对照。实现侧取上游主线源码：libstdc++ 的 `std/variant`、MSVC STL 的 `stl/inc/variant`、libc++ 的 `libcxx/include/variant`。引用实现只写头文件与类名，不写行号，行号随每次提交变化。

草案不是正式标准，正式文本是 ISO/IEC 14882。段号对应草案快照，标准换版后可能位移。

### 1.3 不做什么

- 不重述容器与分配器协议，相关内容见系列第 2 篇《标准库分配器的演化》与第 4 篇《C++ vector 解析》。
- 不做性能测试，不给绝对耗时与目标文件体积数字。
- 不展开 `std::any` 的类型擦除实现，只在选型处提及。
- 不预测 C++26 之后的提案，状态只写到工作草案。

---

## 2. 标准要求

### 2.1 要求集合

[variant.variant]/1 给出三条互相支撑的要求：任一时刻持有某个备选类型的值，或不持有值；持有值时，值分配在 `variant` 对象的存储内；实现不得使用额外存储，例如动态内存。

第二条排除了「指针加堆分配」的实现方式，也解释了 `variant` 不能容纳自身：备选类型的大小必须在实例化时已知。

该节的 /2 要求所有备选类型满足 `Cpp17Destructible`；/3 规定零个模板实参的实例化不符合标准；/4 规定显式特化与偏特化不符合标准，且不要求诊断。

这些要求合起来说明 `variant` 不是容器：没有迭代器，没有 `size()`，不满足容器要求，也不参与分配器协议。它的规范身份是「封闭集合上的类型安全联合」。

### 2.2 复杂度

`get`、`index`、`holds_alternative`、`valueless_by_exception` 都是常数时间，因为它们只读索引。`visit` 分两档：[variant.visit]/8 只对至多一个 `variant` 要求常数时间，多个 `variant` 时没有复杂度要求。这条差异允许实现用查表分派，也允许表的大小随组合数增长。

`swap` 的成本取决于索引是否相同：相同时调用一次备选类型的 `swap`，不同时交换值，需要两次移动构造。

| 操作 | 复杂度 | 抛异常时 |
| --- | --- | --- |
| 构造（默认、转换、复制、移动） | 常数，代价等于所选备选的构造 | 对象未构造完成，不适用 |
| `emplace` | 常数 | 构造抛异常时可能为空 |
| 同索引赋值 | 取决于备选类型的赋值 | 由该赋值运算符保证 |
| 类型改变赋值 | 常数加一次构造 | 可能为空 |
| `get`、`get_if` | 常数 | `get` 抛 `bad_variant_access` |
| `visit`（一个 `variant`） | 常数 | 空状态时抛 `bad_variant_access` |
| `visit`（多个 `variant`） | 无要求 | 同上 |
| `swap` | 同索引一次 `swap`，不同索引两次移动 | 由 `swap` 或移动构造保证 |

### 2.3 异常保证

`variant` 的异常保证按操作分档，分界是「旧值是否已经析构」。

构造失败不产生空状态：对象尚未完成构造，析构函数不会运行，标准也不需要为它规定状态。空状态因此只与已有对象的修改有关。

赋值与 `emplace` 先析构旧值，再构造新值，中间存在一个既没有旧值也没有新值的窗口。`emplace` 的措辞是「析构当前值，然后直接初始化」，并注明构造抛异常时「允许不持有值」（[variant.mod]/9）。这条「允许」给了实现两种做法：原地构造，或先构造临时对象再移动进来。

复制赋值在索引不同时分两种情况：备选类型的复制构造不抛，或移动构造可能抛，则直接 `emplace`；否则先复制一个临时 `variant`，再移动赋值（[variant.assign]/2）。后一种做法把可能失败的复制放在旧值析构之前，因此复制赋值在常见类型上不会产生空状态。

移动赋值只有一条路径：索引不同时对源值做 `emplace`。移动构造抛异常时旧值已析构，源值已被部分移动，对象必然为空（[variant.assign]/9）。

`swap` 在索引不同时交换值，抛异常时两个对象的状态由移动构造的保证决定（[variant.swap]/4–/5）。

### 2.4 与 union 的差异

`union` 只提供存储，活跃成员由使用者维护；`variant` 把索引写进对象，并在访问时检查。`union` 的成员可以是任意类型，但构造与析构需要手动调用；`variant` 要求备选类型可析构，并自动管理生命周期。`union` 读错成员是未定义行为，`variant` 的 `get` 抛 `bad_variant_access`。布局上，`union` 的大小是最大成员的大小，`variant` 还要加索引字段并按最大对齐补齐。

---

## 3. 对象模型与布局

### 3.1 存储与索引

三家实现的共同结构是一个能容纳全部备选类型的联合体加一个索引字段，差异在索引类型与存储写法。

| 实现 | 索引字段 | 空状态的表示 | 存储 |
| --- | --- | --- | --- |
| libstdc++ | `_M_index`，类型由 `__select_index` 选 `unsigned char` 或 `unsigned short` | `variant_npos` 的截断值 | `_Variadic_union` 成员 `_M_u` |
| MSVC STL | `_Which`，类型由 `_Variant_index_t` 选 `signed char`、`short` 或 `int` | `-1` | 递归的 `_Variant_storage_`，含 `_Head` 与 `_Tail` |
| libc++ | `__index`，类型为 `__variant_index_t<sizeof...(_Types)>` | `__variant_npos` 实例 | `__data` 成员 |

MSVC 用递归模板表示联合体：每个 `_Variant_storage_` 持有一个 `_Head` 与一个 `_Tail`，最后一层是空存储。libstdc++ 用一个变参联合体，libc++ 用一个 `__data` 成员。三者都不分配。

索引是 `variant` 唯一的状态位。`index()` 返回 `size_t`，内部字段更窄，宽度随备选数量增长；具体阈值与类型由实现定义。

### 3.2 大小与对齐

`sizeof` 至少是最大备选类型的大小加索引字段，再按最大对齐补齐。64 位平台上 `variant<int, double>` 的存储区是 8 字节，索引占 1 字节，补齐后为 16 字节；`variant<char>` 通常是 2 字节[推断]。

对齐要求由最大备选类型决定：`variant<char, double>` 的对齐是 8，与 `double` 相同。把对齐要求高的类型放进 `variant`，会抬高整个对象的最小尺寸。

索引字段不能省，它决定哪个备选类型活跃。可以省的是有效性检查：若所有备选类型的移动构造与移动赋值都不抛，类型切换不可能失败，实现可以把「是否为空」判定编译成常量。libstdc++ 的 `__never_valueless` 做这件事，条件是移动赋值可用且每个备选类型满足 `_Never_valueless_alt`。该头文件的注释说明这个判定会影响使用该备选类型的 `variant` 的 ABI，因此不能事后修改。

### 3.3 平凡性

标准对平凡性有明确要求。析构函数在所有备选类型可平凡析构时是平凡的（[variant.dtor]/2）。复制构造与移动构造的平凡性按备选传播（[variant.ctor]/9、/12），这条要求来自 P0602R4：此前实现可以让 `variant` 的复制构造始终非平凡。复制赋值的平凡性要求备选类型同时满足平凡复制构造、平凡复制赋值与平凡析构（[variant.assign]/5）。

实现手段是分层基类。libstdc++ 用 `_Copy_ctor_base`、`_Move_ctor_base`、`_Copy_assign_base`、`_Move_assign_base` 四层，每层按 traits 选择平凡或非平凡的实现，最底层 `_Variant_storage` 本身按析构是否平凡分成两个特化。libc++ 用一个联合体模板，按 `_DestructibleTrait` 选择平凡析构、普通析构或删除析构三个版本。

平凡性决定 `variant` 能否按字节搬运、能否放进共享内存、能否按值传给 C 接口。MSVC 的头文件里有一条注释，说明备选类型全部可平凡析构时不能添加调试用的析构函数，因为标准要求该析构函数平凡。调试设施与标准要求冲突时，标准优先。

### 3.4 不完整类型与递归

`variant` 需要为每个备选类型预留空间，所以备选类型在实例化时必须完整。这一点与 `vector` 不同：`vector` 从 C++17 起允许不完整元素，`variant` 没有对应能力。

递归结构因此需要间接层。可行的写法是让备选类型持有指向自身的指针或容器：

```cpp
struct Node;
using Expr = std::variant<int, std::unique_ptr<Node>>;

struct Node {
  char op;
  Expr lhs;
  Expr rhs;
};
```

`std::unique_ptr<Node>` 在 `Node` 不完整时已是完整类型，`variant` 可以容纳它；`Node` 的定义处 `Expr` 已完整，成员可以按值保存。用 `std::vector<Node>` 做备选也可以，前提是 `vector` 的不完整类型支持可用。裸指针同样能编译，但生命周期需要使用者管理。

### 3.5 monostate

默认构造函数参与重载决议的条件是首个备选类型可默认构造（[variant.ctor]/2）。首个备选类型不可默认构造时，该构造函数被删除，`variant` 无法默认构造。

`std::monostate` 是为此提供的空类型（P0393R3）：所有 `monostate` 值相等，哈希可用，比较返回相等。把它放在首位，`variant` 就有了一个可默认构造的「无值」状态。

`monostate` 不消除 `valueless_by_exception()`。前者是正常的备选类型，索引为 0；后者是索引为 `variant_npos` 的异常状态。判断空状态要用 `valueless_by_exception()`，不能用 `holds_alternative<std::monostate>`。

---

## 4. 构造、赋值与转换

### 4.1 构造

六类构造函数对应六种初始化方式：默认、复制、移动、转换、`in_place_type`、`in_place_index`。`in_place_type` 要求类型在备选列表中恰好出现一次，`in_place_index` 没有这个限制，重复类型只能用索引指定。带 `initializer_list` 的重载用于构造容器类备选类型。

复制构造在源为空时构造一个空 `variant`，异常规格是各备选复制构造的合取；移动构造要求全部备选类型可移动构造，异常规格是各备选移动构造的合取。

### 4.2 转换构造

转换构造函数的选择规则是一段假想重载集：为每个备选类型构造一个假想函数 `FUN(T_i)`，只有当 `T_i x[] = {std::forward<T>(t)}` 这种列表初始化合法时，该函数才参与重载决议；决议选中的备选类型就是构造结果（[variant.ctor]/12）。

这条规则有两个后果。其一，窄化转换被排除：`variant<int, long>` 用 `0.5` 初始化时，`double` 到 `int` 与到 `long` 都是窄化，两个假想函数都不参与，构造不符合标准。其二，布尔转换同样被排除：C++17 最初允许指针转 `bool`，P0608R3 关闭了这条路径并作为缺陷报告回溯到该版本，MSVC STL 直到 VS 2022 17.12 才对齐。

备选类型的顺序不参与选择，转换等级决定结果。这解释了 `variant<std::string, const char*>` 用字符串字面量赋值时选中指针：指针到指针是精确匹配，到 `std::string` 需要用户定义转换。选中指针之后，存储的是指向源缓冲区的地址，源缓冲区失效时 `variant` 持有悬垂指针。

转换赋值共用同一套假想重载集（[variant.assign]/11），因此上述结论对 `v = "abc"` 同样成立。

### 4.3 赋值

赋值有三条分支，区别在于活跃成员是否改变。

索引相同的赋值走备选类型的赋值运算符，保证由该运算符决定，`variant` 不析构也不重建。

索引不同的复制赋值按第 2.3 节的两条路径处理，其中「先复制临时再移动」的路径要求备选类型的移动构造 `noexcept`，否则退回直接 `emplace`。

索引不同的移动赋值只有 `emplace` 一条路径，因此移动构造抛异常时对象为空。

转换赋值先判断当前是否持有目标类型：持有则赋值，否则按「构造不抛或移动可能抛」决定直接构造还是先构造临时再移动。这条规则与复制赋值同构，目的都是把可能失败的构造放在旧值析构之前。

### 4.4 emplace

`emplace<I>` 与 `emplace<T>` 的语义是「析构当前值，然后直接初始化」。它们不做赋值路径的判断，总是重建，适合「确定要换类型」的场合，也适合避免转换构造函数选错类型：`v.emplace<0>("abc")` 明确要求用 `std::string` 构造。

`emplace` 返回新值的引用，可以继续使用。构造抛异常时对象可能为空，标准允许实现先构造临时再移动来避免这一点，是否这样做由实现定义。

### 4.5 重复类型与歧义

重复的备选类型使 `get<T>`、`holds_alternative<T>`、`emplace<T>` 全部失效，`in_place_type` 也不可用，只能使用索引。标准允许 `variant<int, int>` 这样的实例化，但它的可用接口只剩索引版本。

转换构造的歧义以编译错误的形式出现：`variant<std::string, std::string>` 用字面量初始化时，两个假想函数同样好，程序不符合标准（[variant.ctor]/12 的注解）。这类错误在备选类型有相同构造签名时出现，修法是改用 `in_place_index`。

---

## 5. valueless_by_exception

### 5.1 成因

空状态需要两个条件同时成立：操作要改变活跃成员，且新值的构造失败。改变活跃成员意味着旧值已经析构，构造失败意味着新值不存在，中间状态没有对应的备选类型。

| 路径 | 必然为空 | 说明 |
| --- | --- | --- |
| 移动赋值，索引不同 | 是 | 旧值已析构，源值只能移动 |
| 复制赋值，索引不同 | 否 | 复制可能抛且移动不抛时先复制临时对象 |
| 转换赋值，索引不同 | 否 | 构造不抛或移动可能抛时直接构造 |
| `emplace` | 否 | 同上，实现可先构造临时 |

### 5.2 标准措辞

[variant.status]/1 的措辞是「当且仅当持有值时返回 false」，没有列举成因。注解给出两条补充：类型改变的赋值或 `emplace` 抛异常时可能不持有值；即使 `variant<float, int>` 也可能为空，例如备选类型有一个会抛异常的转换运算符，`emplace<1>` 调用它时抛出（[variant.status]/2）。

空状态下 `index()` 返回 `variant_npos`，`get` 与 `visit` 抛 `bad_variant_access`。这些行为是规定的，不依赖实现。

### 5.3 检测与恢复

检测有两种写法：`valueless_by_exception()`，或比较 `index() == std::variant_npos`。两者语义等价，前者更直接，后者与 `index()` 的返回值一致。

恢复只有一条路：重新构造一个值。`emplace` 或赋值都可以，旧值无法找回，因为它已经被析构。恢复之前不能读取，任何读取都会抛异常。

把「空」建模为 `std::monostate` 备选可以避免大部分检查，前提是所有可能失败的路径都被排除。更稳妥的做法是在 API 边界统一检查一次，把空状态转换成错误码或异常，内部代码不再处理。

### 5.4 三家实现

libstdc++ 用 `_M_index` 与 `variant_npos` 的截断值比较，并在 `__never_valueless` 为真时把有效性判定编译成常量。`_Never_valueless_alt` 的默认条件是「大小不超过 256 字节且可平凡复制」，注释说明满足条件的类型可以先构造临时再按字节复制，从而提供强保证。

MSVC 把索引声明为有符号类型，`-1` 表示空，判定写成 `_Which < 0`。有符号的选择让这条判断变成一次符号检查，也避免了无符号索引与 `variant_npos` 的比较。

libc++ 在 `__base` 中保存 `__index`，与 `__variant_npos<__index_t>` 比较；析构是否平凡由 `_DestructibleTrait` 选择不同的联合体定义。

三家的共同点是空状态检查只是一次比较，成本可以忽略；差异在于能否在编译期证明「不会为空」。这属于实现优化，标准不作要求。

### 5.5 设计规则

- 让备选类型的移动构造与移动赋值 `noexcept`，类型切换路径不会失败，「可能为空」的分支退化为死代码。
- 需要表达「无值」时用 `std::monostate` 作为首个备选，不依赖空状态。
- 类型切换前先构造临时对象，确认构造成功后再提交，这是在调用方消除空状态的通用做法。

---

## 6. 访问与分派

### 6.1 get 系列

`get<I>` 检查索引，索引不符抛 `bad_variant_access`；`get<T>` 要求 `T` 在备选列表中恰好出现一次，否则调用不符合标准。四个重载按 `const` 与值类别区分，返回值的值类别与 `variant` 一致。

`get_if` 接受指针，索引不符返回空指针，声明为 `noexcept`；传入空指针也返回空指针。`holds_alternative<T>` 等价于比较索引与类型对应的位置，同样要求 `T` 唯一。

异常类型是 `bad_variant_access`，捕获时不要写成 `std::out_of_range`。空状态下 `get` 也抛这个异常，因为索引是 `variant_npos`。

### 6.2 visit 的语义

`visit` 按当前索引调用一次访问器，参数是各 `variant` 的当前值。返回类型是 `decltype(e(m))`，其中 `e(m)` 是把访问器应用到第 `m` 组备选值上的表达式（[variant.visit]/6）。

要求有三条：每个组合都必须可调用（[variant.visit]/5）；所有组合的结果必须是同一类型与同一值类别；任一 `variant` 为空时抛 `bad_variant_access`（[variant.visit]/7）。第一条在多 `variant` 访问时最容易触发，因为组合数是乘积。

`visit<R>`（P0655R1）允许显式指定返回类型，各分支的结果只需可转换为 `R`，不再要求完全一致。C++26 增加成员版本 `v.visit(vis)`（P2637R3），转发到 `std::visit`，并允许私有继承自 `variant` 的类型使用。

### 6.3 分派实现

三家实现都把「按索引选择代码」变成一次表查询或跳转。

libstdc++ 的 `__gen_vtable_impl` 递归生成多维函数指针数组，维度是各 `variant` 的备选数，元素是指向「用第 `i`、`j` 个备选调用访问器」这一实例的函数指针。访问时按索引取出一项并调用。

libc++ 的 `__fmatrix`（由 `__make_fmatrix` 生成）是同一结构，名字直接表明它是函数指针矩阵。

MSVC 按备选数量分档：不超过 4 个时用 `switch`，不超过 16、64、256 时分别展开同样多的 `case`，超过 256 时改用函数指针数组。索引在查表前加一，把 `variant_npos` 映射到第 0 项，空状态因此不需要单独分支。

表的大小是各 `variant` 备选数的乘积，这是 `visit` 的主要代码体积成本。两个各有 10 个备选类型的 `variant` 产生 100 个实例，单 `variant` 访问只有 10 个。

### 6.4 返回类型

「同一类型与同一值类别」比看上去严格。返回 `int` 与返回 `int&` 不兼容，返回 `int` 与返回 `const int` 也不兼容；返回 `void` 是允许的，所有分支都返回 `void` 即可。

常见错误是让分支返回不同精度的整数，或者一个分支返回值、另一个分支返回引用。修法有两种：用 `visit<R>` 指定统一返回类型，或在访问器内部把结果规范成同一类型。

多 `variant` 访问还要求所有组合可调用。用一个通用 lambda 处理全部组合，再在内部用 `if constexpr` 分支，可以避免为每个组合写一个重载。

### 6.5 overloaded 与 if constexpr

`overloaded` 是聚合继承加 `using` 声明，把多个 lambda 的 `operator()` 放进同一个重载集：

```cpp
template<class... Fs>
struct overloaded : Fs... { using Fs::operator()...; };

template<class... Fs>
overloaded(Fs...) -> overloaded<Fs...>;
```

用它访问 `variant` 时，每个备选类型由重载决议选中对应的 lambda。写法比 `if constexpr` 直观，代价是每个 lambda 都要精确匹配 cv 限定与值类别：`const variant` 传出的参数是 `const T&`，只接受 `T&` 的 lambda 不参与。

`if constexpr` 适合另一种情形：备选类型共享一部分接口，只有少数分支需要区别处理。下面的写法对一个 `variant` 做分派，未覆盖的组合在编译期被丢弃：

```cpp
std::visit([](auto&& x) {
  using T = std::decay_t<decltype(x)>;
  if constexpr (std::is_same_v<T, int>) { /* integer branch */ }
  else { /* other branch */ }
}, v);
```

两种写法可以组合：外层用 `overloaded` 按大类分派，内层用 `if constexpr` 处理细节。选择标准是分支数量与是否需要精确匹配，与运行期成本无关，两者都编译成一次间接调用。

---

## 7. 比较、哈希与格式化

### 7.1 相等

`operator==` 的语义分三层：索引不同返回 `false`；索引相同且为空返回 `true`；否则比较所存的值（[variant.relops]/2）。空状态与空状态相等，`<=>` 在两边都为空时也返回相等。

约束是每个备选类型的 `==` 都可用且结果可转 `bool`（[variant.relops]/1）。C++26 之前，条件不满足是「程序不符合标准」；P2944R3 把它改成约束，不满足时运算符不参与重载决议，错误信息落在调用点而不是模板深处。

`!=` 独立定义，逐条对应 `==` 的三种情形，因此不依赖 `==` 的重写候选。

### 7.2 序与三路比较

`<` 的规则是：右为空则 `false`，左为空则 `true`，否则先比索引，索引相同再比值（[variant.relops]/6）。这条规则让空状态排在最前，索引顺序成为类型顺序。`>`、`<=`、`>=` 各自独立定义，规则与 `<` 对称。

C++20 加入 `operator<=>`（P1614R2），返回类型是 `common_comparison_category_t<compare_three_way_result_t<Types>...>`，要求每个备选类型都满足 `three_way_comparable`。空状态返回 `strong_ordering` 的 `less`、`greater` 或 `equal`。

返回类别由最弱的备选决定：`variant<int, double>` 的 `<=>` 返回 `partial_ordering`，因为 `double` 的比较是偏序。把结果存入 `auto` 变量时，推导出的类型可能与预期不同。

索引优先意味着跨类型的顺序没有语义：`variant<int, std::string>` 中所有 `int` 都排在所有 `std::string` 之前，与值无关。把 `variant` 用作有序容器的键时，这个顺序需要与业务预期一致。

### 7.3 hash

`std::hash<std::variant<Types...>>` 在所有 `hash<remove_const_t<Types>>` 都启用时启用（[variant.hash]/1）。成员函数不保证 `noexcept`，因为备选类型的哈希可能抛异常。

实现通常先哈希索引，再与值的哈希组合，因此 `variant<int, long>` 中两个取值为 `0` 的对象哈希不同。这是有意的：同一份数据在不同备选类型下应当可以区分。

哈希与 `==` 必须一致：索引相同且值相等时哈希相同；索引不同时 `==` 为假，哈希不同不违反要求。用作无序容器的键时，这个一致性是主要需要保证的性质。

### 7.4 格式化

标准没有为 `std::variant` 提供 `formatter` 特化。C++23 为 `pair`、`tuple` 与范围提供了格式化（P2286R8），`variant` 不在其中。

需要格式化时有两种做法：写一个 `formatter` 特化，内部用 `visit` 转发到各备选类型的 `formatter`；或者先 `visit` 成 `std::string` 再交给 `format`。前者的编译期检查完整，后者简单但多一次分配。

---

## 8. 对比与选型

### 8.1 union

`union` 是最接近的底层设施。它只提供存储与成员访问，活跃成员由使用者记录；析构需要手动调用，复制需要手动实现。`variant` 把这些工作放进对象，代价是一个索引字段与访问时的检查。

需要精确控制布局，或者备选类型都是平凡类型且生命周期简单时，`union` 更直接。需要异常安全、需要访问检查、需要与 `visit` 配合时，`variant` 更合适。

### 8.2 any

`std::any` 保存任意可复制类型的值，集合在运行期开放。它通过类型擦除实现，访问用 `any_cast`，指针形式失败返回空指针，值形式失败抛 `bad_any_cast`。

两者的分工由「集合是否封闭」决定：备选类型在编译期已知时用 `variant`，可以用 `visit` 做静态分派，不需要分配，也不要求类型可复制；备选类型在运行期才知道时用 `any`，代价是可能的堆分配、按类型查询，以及要求存储的类型可复制。

### 8.3 optional

`std::optional<T>` 是「零个或一个值」的特例，没有索引字段，没有分派。`variant<T, std::monostate>` 与它语义相近，但多一个索引，且可以用 `visit` 统一处理两个分支。

需要表达「可能没有值」时用 `optional`，接口更窄，成本更低；需要与其它类型一起参与同一套分派时用 `variant`。

### 8.4 选型

| 类型 | 备选集合 | 分派方式 | 空状态 | 动态分配 |
| --- | --- | --- | --- | --- |
| `union` | 编译期固定 | 使用者维护 | 无标准表示 | 否 |
| `variant` | 编译期固定 | `visit` 或 `get` | 空状态 | 否 |
| `any` | 运行期开放 | `any_cast` | 空 `any` | 可能 |
| `optional` | 零个或一个 | 判空后访问 | `nullopt` | 否 |

三条判断可以概括这张表：类型集合是否封闭决定用 `variant` 还是 `any`，分支数量决定用 `variant` 还是 `optional`，是否需要异常安全与访问检查决定用 `variant` 还是 `union`。

---

## 9. 性能、ABI 与陷阱

### 9.1 运行期成本

访问的成本是一次索引比较加一次间接调用，或者一次索引比较（`get`）。没有分配，没有虚函数表，没有引用计数。

与继承加虚函数相比，`variant` 的分派点是封闭的：`visit` 在编译期看到全部备选类型，可以为每个组合生成代码，调用点也更容易被编译器 inline。虚函数的分派点是开放的，新增类型不需要改调用方，但每次调用都要经过虚表。

代价在大小上：`variant` 的大小等于最大备选类型的大小，各备选类型的尺寸不叠加。把大对象放进 `variant`，即使当前存的是小对象，整个对象也要占那么大。

### 9.2 代码体积

`visit` 为每个组合实例化一次访问器，表的大小是乘积。这是模板代码体积增长的主要来源，也是 `variant` 在嵌入式与体积敏感场景的主要顾虑。

减小体积的办法有三条：只对一个 `variant` 做 `visit`，其余参数作为普通参数传入；把共同逻辑抽成非模板函数，访问器只负责转发；限制备选类型数量，超过一定规模时改用继承加虚函数或表驱动。

### 9.3 ABI

`variant` 的布局由实现定义：索引字段的类型与位置、存储与索引的先后、补齐方式都不同。同一份源码在不同标准库下编译出的 `variant` 不能互换，跨模块传递需要固定工具链与标准库版本。

平凡性虽然由标准要求，实现细节仍会影响二进制：libstdc++ 的 `_Never_valueless_alt` 判定被注释标明为影响 ABI，不能事后修改。更换标准库版本可能改变 `variant` 的代码生成，即使源码不变。

在公开接口中暴露 `variant` 时，需要接受这条约束，或者改用 pimpl 把布局固定在实现内部。

### 9.4 陷阱

| 写法 | 问题 | 修正 |
| --- | --- | --- |
| 默认构造依赖首个备选 | 首个备选不可默认构造时构造函数被删除 | 首位放 `std::monostate` |
| 用 `get<T>` 直接取值 | 索引不符抛 `bad_variant_access` | 先 `holds_alternative`，或用 `get_if` |
| 类型切换赋值后继续使用 | 构造抛异常后为空 | 检查 `valueless_by_exception()` 并重建 |
| 递归类型直接放成员 | 备选类型必须完整，大小无法收敛 | 用 `std::unique_ptr` 或 `std::vector` 做间接层 |
| `visit` 用通用 lambda | 某些组合不可调用导致编译失败 | 用 `if constexpr` 提前分支 |
| 依赖 `sizeof` 或索引宽度 | 由实现定义 | 只按接口使用，不写死布局 |

---

## 10. 演进

### 10.1 版本

| 版本 | 与 `variant` 相关的变化 |
| --- | --- |
| C++17 | 引入 `variant`、`monostate`、`visit`、`get` 与 `hash` 特化（P0088R3、P0393R3） |
| C++20 | `<=>`（P1614R2）、`visit<R>`（P0655R1）、`emplace` 与 `swap` 的 `constexpr`（P2231R1） |
| C++23 | 接口无改动；`<expected>` 提供另一条错误建模路径 |
| C++26 | 成员 `visit`（P2637R3）、比较运算符约束化（P2944R3） |

P2231R1 以缺陷报告的方式回溯到 C++20，特性宏 `__cpp_lib_variant` 记为 202106L。P0608R3 与 P1957R2 同样以缺陷报告方式回溯到 C++17，前者关闭指针到 `bool` 的转换，后者把指针到 `bool` 归为窄化。

### 10.2 提案

P0088R3 把 `variant` 带入 C++17，P0393R3 补上 `monostate` 与默认构造的可用性，P0602R4 要求平凡性按备选传播。这三份提案确定了接口与对象模型，此后的修改集中在两处：转换构造的候选集合，以及比较与访问的约束形式。

C++20 的改动让 `variant` 进入三路比较与常量求值：`visit<R>` 解决返回类型不一致，`<=>` 让 `variant` 有了统一的三路比较，P2231R1 让 `emplace` 与 `swap` 在常量求值中可用。P2162R2 修正了派生自 `variant` 的用法，使这类派生类型可以参与 `get` 与 `visit`。

C++26 工作草案的两项改动都属接口改良：成员 `visit` 省去重复写 `std::visit` 的前缀，比较运算符的约束化把错误从「程序不符合标准」提前到重载决议。

### 10.3 未决

三处缺口仍然存在。`variant` 没有标准的 `formatter`，格式化需要自己写。空状态无法彻底消除：标准不允许动态分配，旧值析构后没有地方保存，除非改变赋值顺序或增加存储。多 `variant` 访问的复杂度没有要求，代码体积随组合数增长，标准没有提供约束手段。

C++26 工作草案没有改变空状态的语义，也没有为 `variant` 增加分配器支持。后续修订更可能落在格式化与约束改进上，布局方面没有改动迹象。

---

## 结论

`std::variant` 的接口很小，行为由三件事决定：索引标记活跃成员，存储区容纳最大备选，访问前检查索引。三件事都写在标准里，也都能在实现源码中找到对应代码。

工程上可执行的规则：

1. 让备选类型的移动构造与移动赋值 `noexcept`，类型切换路径不会失败，空状态成为不可达分支。
2. 首位放 `std::monostate`，用 `in_place_index` 消除重复类型与转换歧义，在 API 边界检查 `valueless_by_exception()`。
3. 用 `visit` 做封闭集合的分派，保持返回类型一致；多 `variant` 访问前先估算组合数。
4. 不依赖 `sizeof`、索引宽度与字段顺序，跨模块边界固定工具链。

`variant` 与 `union` 的差别在索引，与 `any` 的差别在集合是否封闭，与 `optional` 的差别在分支数量。把这三条分清，选型与实现都不会偏离。

---

## 参考

- 标准草案：`[variant.variant]`、`[variant.ctor]`、`[variant.assign]`、`[variant.dtor]`、`[variant.mod]`、`[variant.status]`、`[variant.swap]`、`[variant.get]`、`[variant.visit]`、`[variant.relops]`、`[variant.hash]`、`[variant.helper]`、`[variant.monostate]`。
- 直达形式：<https://eel.is/c++draft/variant.variant>、<https://eel.is/c++draft/variant.assign>、<https://eel.is/c++draft/variant.visit>、<https://eel.is/c++draft/variant.status>、<https://eel.is/c++draft/variant.relops>、<https://eel.is/c++draft/variant.hash>。
- 历史草案：N4659（C++17）、N4861（C++20）、N4950（C++23），取自 cplusplus/draft 对应标签；版本对照只用于说明段号与措辞变化。
- 提案：P0088R3（Variant: a type-safe union for C++17）、P0393R3（Making variant's default constructor more useful）、P0602R4（variant and optional should propagate copy/move triviality）、P0608R3（A sane variant converting constructor）、P1957R2（Converting from `T*` to bool should be considered narrowing）、P0655R1（`visit<R>`: Explicit Return Type for visit）、P1614R2（Adding `<=>` to the standard library）、P2162R2（Inheriting from std::variant）、P2231R1（Missing constexpr in std::optional and std::variant）、P2637R3（Member visit）、P2944R3（Constrained comparisons）、P2286R8（Formatting Ranges）。
- 缺陷报告：LWG 2901（移除分配器感知的构造函数）、LWG 3024（复制构造改为定义为删除）、P0739R0（转换构造与类模板实参推导的交互）。
- 实现源码：libstdc++（`std/variant`）、MSVC STL（`stl/inc/variant`）、libc++（`libcxx/include/variant`）。
- 标准库文档：<https://en.cppreference.com/w/cpp/utility/variant>、<https://en.cppreference.com/w/cpp/utility/variant/valueless_by_exception>、<https://en.cppreference.com/w/cpp/utility/variant/operator_cmp>、<https://en.cppreference.com/w/cpp/utility/variant/hash>、<https://en.cppreference.com/w/cpp/utility/variant/monostate>。
