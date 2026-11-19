---
title: "C++ concepts"
slug: "cpp-concepts"
date: "2026-11-19"
tags: ["C++", "concepts", "模板", "泛型编程"]
draft: false
summary: "以 C++ 工作草案与 WG21 提案为据，拆解 concept 的四个环节：约束的引入位置、归一化、原子约束的满足性检查、包含关系与重载决议；说明 requires 表达式检查的边界、标准库概念的语义要求，以及 C++26 折叠约束与 concept 模板参数改变了什么。"
---

概念（concept）在 C++20 进入语言，语法只有 `concept` 与 `requires` 两个关键字，行为却由四层机制叠加决定：声明上收集了哪些约束、约束被归一化成什么形状、每个原子约束如何判定、判定结果如何参与重载决议。多数误用来自把这四层混成一层，例如认为概念名会像宏一样原样替换，或认为拼写相同的约束天然可以互相包含。

本文按这四层展开，先给出约束的语法位置，再处理归一化与包含关系，最后落到标准库概念与实现现状。`requires` 表达式单独成章，因为它既可以在概念体内使用，也可以脱离概念出现在 `if constexpr` 与 `static_assert` 中。

## 0. 结论摘要

- `concept` 是模板，定义的是一组约束；`C<T>` 是 `bool` 纯右值，`C` 本身不能当类型名使用。
- 声明上的约束有四个引入位置，按固定顺序合取成 associated constraints，这个顺序同时是检查顺序。
- 归一化把 `&&` 与 `||` 拆成合取与析取，把 concept-id 展开成定义；原子约束的同一性由表达式出现位置与参数映射共同决定。
- 原子约束通过替换判定：立即上下文内的替换失败算不满足，表达式类型不是 `bool` 属于硬错误。
- 重载决议用包含关系（subsumption）比较约束；包含关系由析取范式与合取范式定义，概念定义中的原子约束直接参与比较。
- C++26 引入折叠约束与 concept 模板参数；标准库概念只把语法要求交给编译器，语义要求由 `[res.on.requirements]` 约束。

---

## 1. 范围与口径

### 1.1 版本基准与证据分级

标准侧以 eel.is 的 2026-11 工作草案快照为准。C++20 的最终文本用 N4861 对照；C++26 已并入工作草案的特性按草案引用，DIS 尚未出版；C++29 只涉及一条已进入工作草案的改动（P3822R2），单独标注。提案不是标准，涉及设计动机与被否决方案时以提案为准。

正文用三类标记区分证据，并用 IFNDR 简写 ill-formed, no diagnostic required：

- [draft]：工作草案的可观察要求，附条款锚点与段号。
- [paper]：WG21 提案、缺陷报告或技术勘误。
- [impl]：编译器、标准库实现或文档的行为。

版本差异集中在两处：C++26 对折叠表达式的归一化规则，以及 concept 作为模板模板参数时的依赖约束。其余核心规则自 C++20 起没有实质变化。

### 1.2 不做什么

- 不展开模板实参推导、函数模板偏序与 SFINAE 的完整规则，只保留与约束交互的部分。
- 不逐条罗列 `<concepts>` 的全部定义，只处理与语言机制相关的边界。
- 不做性能测量；约束带来的编译期开销只做定性说明。

---

## 2. 从 Concepts TS 到 C++20

### 2.1 两次设计

C++0x 的 concepts 试图同时解决三个问题：约束类型参数、为类型与概念之间的对应关系提供显式声明（concept map）、允许作者写下语义公理（axiom）。约束写在 `where` 子句中。2009 年 7 月的法兰克福会议把整套设计移出 C++0x 工作草案，理由是设计分歧与实现经验不足。

Concepts TS（N4377）是重新出发的版本，保留 `concept bool`、`requires` 子句与 requires 表达式，删除 concept map 与 axiom。GCC 通过 `-fconcepts` 提供过这份 TS 的实现，语法与最终 C++20 有差异，不能直接当作 C++20 使用。

C++20 的 P0734R0 把 concept 定义为模板，约束成为表达式，`concept bool` 被删除。这一定位决定了后续所有行为：concept 不引入新的声明种类，不参与实例化，只提供一种给约束命名的语法。[paper P0734R0、N4377]

### 2.2 进入 C++20 的几次改动

| 版本 | 文件 | 改变 |
| --- | --- | --- |
| C++20 | P0734R0 | 约束、requires 子句与 requires 表达式进入核心语言 |
| C++20 | P1084R2 | 复合要求的返回类型部分改为类型约束 |
| C++20 | P1452R2 | 修正返回类型要求的非统一语义 |
| C++20 | P1141R2 | 简写形式：`template<C T>` 与 `void f(C auto&)` |
| C++20 | P1754R1 | 标准库概念改用 snake_case |
| C++26 | P2963R3 | 约束中的折叠表达式按元素展开为折叠约束 |
| C++26 | P2841R7 | concept 与变量模板可作为模板模板参数 |
| C++29 | P3822R2 | 复合要求支持条件 `noexcept` |

复合要求的返回类型部分在 C++20 定稿前经过两次修正（P1084R2、P1452R2）。最终语义是 `{ E } -> C` 要求 `decltype((E))` 满足类型约束 `C`，`noexcept` 检查排在返回类型检查之前（`[expr.prim.req.compound]/1`）。早期设计中按隐式转换检查的写法没有保留。

P1141R2 引入的简写形式影响最大。`template<C T>` 与 `template<class T> requires C<T>` 的 associated constraints 相同，`void f(C auto&)` 则会发明一个带约束的类型参数。后一种写法让函数模板可以不带 `template` 头出现，也让重载集合里的模板与普通函数更接近。

P1754R1 把标准库概念从 `Same`、`EqualityComparable` 这类 CamelCase 改成 `same_as`、`equality_comparable`，理由是与标准库其余命名保持一致。C++20 之前基于 Concepts TS 写的代码需要改名字，语义不变。[paper P1754R1]

### 2.3 C++26 与 C++29 的增量

P2963R3 改变约束中折叠表达式的归一化形状，使 `(C<Ts> && ...)` 可以按元素与 `C<T1> && C<T2>` 比较，详见第 6.4 节。P2841R7 允许 concept 与变量模板作为模板模板参数，并为此引入 concept-dependent constraint，详见第 4.4 节。C++29 工作草案中的 P3822R2 给复合要求加上条件 `noexcept`，语法为 `{ E } noexcept(cond) -> C`，条件为 `false` 时允许表达式抛出。

---

## 3. 约束写在哪里

### 3.1 concept 定义

concept 是一条模板声明，约束表达式写在等号右侧：

```cpp
template<class T>
concept Size4 = sizeof(T) == 4;

template<class T>
concept Eq = requires(const T& a, const T& b) {
    { a == b } -> std::convertible_to<bool>;
    { a != b } -> std::convertible_to<bool>;
};
```

`[temp.concept]` 对定义位置有明确限制：[draft]

- 只能出现在命名空间作用域，不能在类作用域或块作用域定义（`[temp.concept]/3`）。
- 不能再带 associated constraints，即 concept 定义上不能写 `requires` 子句（`[temp.concept]/4`）。
- 不实例化；不能显式实例化、显式特化或偏特化（`[temp.concept]/5`）。
- 约束表达式是 unevaluated operand，概念体中的表达式不产生运行期求值（`[temp.concept]/6`）。
- 第一个模板参数是 prototype parameter；prototype 是类型参数时，这个 concept 叫 type concept（`[temp.concept]/7`）。

`Size4` 只能作为模板使用，不能当类型名。`Size4 x;` 不合法，需要写成 `Size4 auto x = 0;`。`Size4<int>` 是 `bool` 纯右值，可以直接用于 `static_assert` 或 `if constexpr`（`[temp.names]/105`）。

`Eq` 的约束表达式是一个 requires 表达式，因此 `Eq<int>` 的判定发生在 requires 表达式的规则内：某个要求不成立时得到 `false`，不会直接让程序 ill-formed。

### 3.2 四个引入位置

一条声明的 associated constraints 由若干条 constraint-expression 合取而成，引入位置与顺序由 `[temp.constr.decl]/3` 规定：

1. 模板参数列表中的 type-constraint，按出现顺序；
2. 模板参数列表之后的 requires 子句；
3. 函数参数类型列表中的 type-constraint；
4. 函数的尾随 requires 子句。

```cpp
template<class T> concept C1 = true;
template<class T> concept C2 = true;
template<class T> concept C3 = true;
template<class T> concept C4 = true;

template<C1 T>                    // 1. 模板参数列表
requires C2<T>                    // 2. 模板头之后的 requires 子句
void f(T t, C3 auto u)            // 3. 参数类型中的 type-constraint
    requires C4<T>;               // 4. 尾随 requires 子句
```

`f` 的 associated constraints 是 `C1<T> ∧ C2<T> ∧ C3<U> ∧ C4<T>`，其中 `U` 是 `C3 auto` 发明的类型参数。这个顺序同时规定了检查顺序：前面的约束不满足时，后面的约束不会被检查（第 5.3 节）。

尾随 requires 子句只能出现在 templated function 上。`void f(int) requires true;` 不合法，因为 `f` 不是模板，也不是模板实体（`[dcl.decl]/74`）。[draft]

约束也出现在类模板、变量模板与别名模板的声明上。形成 `S<int>` 这样的特化名字时，如果模板受约束且实参不依赖，约束必须满足，否则程序 ill-formed（`[temp.names]/99`）：

```cpp
template<class T>
concept Small = sizeof(T) <= 4;

template<Small T>
struct S {};

S<int>  a;  // OK
S<long> b;  // 错误：Small<long> 不满足
```

### 3.3 requires 表达式

requires 表达式提供一种按名字查找与类型属性检查要求的语法，四类要求可以混写：

```cpp
template<class T>
concept Container = requires(T c, const T& cc) {
    typename T::value_type;                            // 类型要求
    c.begin();                                         // 简单要求
    { cc.size() } -> std::convertible_to<std::size_t>;  // 复合要求
    requires sizeof(typename T::value_type) > 0;       // 嵌套要求
};
```

规则分散在 `[expr.prim.req]` 的五个子条款中：[draft]

- 局部参数只作记号，没有链接、存储与生命期；不能带默认实参，参数列表不能以省略号结尾（`[expr.prim.req.general]/4`）。
- 简单要求的表达式是 unevaluated operand，只检查有效性（`[expr.prim.req.simple]/1`）。
- 类型要求命名类模板特化时，不要求该类型完整（`[expr.prim.req.type]/2`）。
- 复合要求按固定顺序检查：替换 `E`，检查 `noexcept`，最后要求 `decltype((E))` 满足返回类型约束（`[expr.prim.req.compound]/1`）。
- 嵌套要求本身是一条约束，按约束的规则判定。

requires 表达式的值是 `bool` 纯右值。替换与语义检查按词法顺序进行，遇到能决定结果的条件就停止；无效的类型或表达式得到 `false`，不会让程序 ill-formed（`[expr.prim.req.general]/5`）。这条保护只对模板实体成立：requires 表达式出现在非模板实体中且要求无效时，程序直接 ill-formed。

C++29 工作草案放宽了复合要求的 `noexcept`：`{ E } noexcept(cond) -> C` 允许按条件要求表达式不抛出，`cond` 为 `false` 时允许抛出（P3822R2）。C++20 到 C++26 只支持无条件的 `{ E } noexcept;`。

---

## 4. 归一化

### 4.1 范式

约束在比较之前先转成 normal form，规则见 `[temp.constr.normal]/1`：[draft]

- `(E)` 的范式是 `E` 的范式；括号只影响分组，不产生新的原子约束。
- `E1 && E2` 的范式是两者范式的合取；`E1 || E2` 的范式是两者范式的析取。
- concept-id `C<A...>` 的范式是把实参代入 `C` 的定义后得到的范式，代入的是原子约束的参数映射。
- 折叠表达式在 C++26 中按元素展开为折叠约束（第 6.4 节）。
- 其余表达式各自成为一个原子约束，参数映射为恒等映射。

归一化按语法处理 `&&` 与 `||`，用户重载的 `operator&&` 与 `operator||` 不参与。`A && (B || C)` 的析取范式是 `(A ∧ B) ∨ (A ∧ C)`；包含关系就在这个范式上比较。

### 4.2 concept-id 的展开

concept-id 会展开成定义中的原子约束，不作为单个原子约束保留。代入过程只构造参数映射，不求值：

```cpp
template<class T>
concept A = T::value || true;

template<class U>
concept B = A<U*>;

template<class V>
concept C = B<V&>;  // ill-formed, no diagnostic required
```

`B<U*>` 的范式是 `T::value`（映射 `T -> U*`）与 `true` 的析取。`T::value` 对指针类型 ill-formed，但归一化不检查这一项，只要求映射本身能形成。`C<V&>` 要把 `V&` 代入 `T -> U*`，得到 `V&*`，这不是合法类型，整个程序 ill-formed, no diagnostic required（`[temp.constr.normal]/1` 的例子）。[draft]

这条规则解释了一个常见现象：概念定义里可以出现对某些实参必然无效的原子约束，只要归一化阶段不构造出无效类型，概念本身仍然合法；判定阶段再按替换失败处理。

### 4.3 原子约束的同一性

两个原子约束相同，需要同时满足两个条件（`[temp.constr.atomic]/2`）：[draft]

1. 它们来自同一个表达式的同一次出现；
2. 参数映射的目标在等价意义下相同。

第二条按 `[temp.over.link]` 的声明匹配规则比较，允许别名模板展开后的等价写法。第一条最容易被忽略：在两个概念里各写一遍 `sizeof(T) == 4`，得到的是两个不同的原子约束。

```cpp
template<class T> concept A = sizeof(T) == 4;  // 出现位置 #1
template<class T> concept B = sizeof(T) == 4;  // 出现位置 #2

template<class T> requires A<T> void f(T);  // #1
template<class T> requires B<T> void f(T);  // #2

f(0);  // 有歧义：A 与 B 互不包含
```

取反也不会把不同的原子约束变成同一个。标准在 `[temp.constr.op]/5` 给出的例子是：

```cpp
template<class T> concept sad = false;
template<class T> concept sad_nested_type = sad<typename T::type>;

template<class T> int f3(T) requires (!sad<typename T::type>);
template<class T> int f4(T) requires (!sad_nested_type<T>);
```

对 `T = int`，`f3` 的原子约束 `sad<typename T::type>` 在替换时失败，整个原子约束不满足，前面的 `!` 不改变这个结论。`f4` 的原子约束是 `!sad_nested_type<T>`，替换本身成功；求值时 `sad_nested_type<int>` 为 `false`，取反后为 `true`，所以 `f4` 可用。失败被包在概念内部，还是发生在原子约束的替换中，结果相反。[draft]

### 4.4 concept 模板参数与依赖约束

C++26 允许把 concept 作为模板模板参数传递（P2841R7）：

```cpp
template<class T>
concept Always = true;

template<class T, template<class> concept CC>
concept D = CC<T>;

static_assert(D<int, Always>);
```

当 `CC` 是模板参数时，`CC<T>` 的归一化结果取决于 `CC` 最终绑定到哪个 concept，无法在声明处展开。标准把这种原子约束称为 concept-dependent constraint（`[temp.constr.concept]`），满足性检查在替换 `CC` 之后递归进行。[draft]

含 concept-dependent constraint 的 associated constraints 不参与包含关系比较（`[temp.constr.order]/3`）。这避免了在概念本身尚未确定时比较约束强弱。模板模板参数自身的 associated constraints 也不能包含 concept-dependent constraint（`[temp.param]/212`）。

---

## 5. 满足性检查

### 5.1 替换与立即上下文

原子约束的判定分两步（`[temp.constr.atomic]/3`）：先把参数映射与模板实参代入表达式，再对结果求值。[draft]

- 替换在立即上下文内产生无效类型或无效表达式时，原子约束不满足。
- 替换成功时，先做必要的左值到右值转换，表达式必须是 `bool` 类型的常量表达式；结果为 `true` 才算满足。

立即上下文指替换直接产生的无效类型与无效表达式，不包括实例化类模板成员、函数体或常量求值过程中更深一层的错误。这个边界决定了哪些失败是「不满足」，哪些是硬错误（第 5.5 节）。

替换失败位于原子约束内部时，取反不会改变结论。`[temp.constr.op]/5` 明确说明：判断原子约束是否满足时遇到替换失败，无论有没有 `!`，约束都不满足。这是 `f3` 与 `f4` 结果不同的原因。

### 5.2 表达式必须是 bool

替换成功之后，表达式还必须是 `bool` 类型的常量表达式。类型不对属于硬错误，不会退化成「约束不满足」，也不会让其他重载接管：

```cpp
template<class T>
concept C = sizeof(T) == 4;

template<class T>
struct S { constexpr operator bool() const { return true; } };

template<class T> requires (S<T>{}) void f(T);  // #1
void f(int);                                    // #2

void g() {
    f(0);  // 错误：S<int>{} 的类型不是 bool
}
```

这个例子来自 `[temp.constr.atomic]/3`。`f(int)` 的转换序列更好，但检查 `#1` 的约束时已经产生硬错误，调用整体 ill-formed。约束检查不按候选优劣跳过失败项；每个可行候选的约束都要判定。[draft]

### 5.3 短路

合取先检查左操作数，不满足则不再检查右操作数；析取先检查左操作数，满足则不再检查右操作数（`[temp.constr.op]/2`、`[temp.constr.op]/3`）。associated constraints 是按第 3.2 节顺序排列的合取，因此前面的约束可以为后面的约束提供前提。[draft]

```cpp
template<class T>
constexpr bool get_value() { return T::value; }

template<class T> requires (sizeof(T) > 1) && get_value<T>()
void f(T);

void f(int);

f('a');  // 调用 f(int)；第二个原子约束没有被检查
```

`sizeof(char) > 1` 不满足，`get_value<char>()` 不会被实例化。如果没有短路，`get_value<char>` 的函数体中的 `T::value` 会产生硬错误，非模板重载无法接管。标准在 `[temp.constr.op]/4` 用同一个例子说明这一点。[draft]

### 5.4 结果一致性

同一个原子约束与同一组模板实参，在不同位置得到不同满足结果时，程序 ill-formed, no diagnostic required（`[temp.constr.atomic]/3`）。这条规则让实现可以缓存判定结果，也把约束限制在稳定属性上：依赖可变全局状态、线程状态或翻译单元相关宏的约束，都可能违反一致性要求。[draft]

缓存本身不构成可观察行为。实现可以在第一次判定后复用结果，也可以每次重算；标准只要求结果一致。[impl]

### 5.5 错误分层

把约束相关的失败分成三层，可以解释多数诊断差异：

| 层次 | 失败形态 | 结果 |
| --- | --- | --- |
| requires 表达式内部 | 要求无效或替换失败 | 表达式为 `false` |
| 原子约束替换 | 立即上下文内无效 | 约束不满足 |
| 原子约束求值 | 类型不是 `bool`，或实例化出错 | 硬错误 |

第三层的典型例子是替换成功、求值失败的类模板：

```cpp
template<class T>
struct Wrap { static constexpr bool value = T::missing; };

template<class T>
concept HasMissing = Wrap<T>::value;

template<class T> requires HasMissing<T> void f(T);
void f(int);

f(0);  // 硬错误：Wrap<int>::value 的实例化失败
```

`Wrap<T>::value` 对 `T = int` 形成有效表达式，替换本身成功；求值需要实例化 `Wrap<int>`，而成员初始化中的 `T::missing` 无效。这个错误不在立即上下文中，因此不会变成「约束不满足」，也不会回到 `f(int)`。[draft]

requires 表达式还有一个 always-substitution-failure 规则：如果某个要求对任何模板实参都必然替换失败，程序 ill-formed, no diagnostic required（`[expr.prim.req.general]/5`）。例如在 requires 表达式中写 `new decltype((void)T{})`，对任何 `T` 都无效。

---

## 6. 包含关系与重载决议

### 6.1 定义

约束 P 包含（subsumes）约束 Q，当且仅当 P 的析取范式中的每个析取子句都包含 Q 的合取范式中的每个合取子句；一个子句包含另一个子句，指前者的某个原子约束与后者的某个原子约束相同（`[temp.constr.order]/1`）。[draft]

直观说法是：P 的要求不弱于 Q。由此得到几条直接推论：

- `A ∧ B` 包含 `A`，反过来不成立；
- `A` 包含 `A ∨ B`，反过来不成立；
- 每个约束包含自身；
- concept-id 先展开，概念定义中的原子约束直接参与比较。

包含关系是偏序，存在互不包含的两个约束，也存在互相包含（等价）的两个约束。声明 `D1` 至少与 `D2` 一样受约束，指 `D1` 包含 `D2`，或 `D2` 没有约束；`D1` 比 `D2` 更受约束，指至少一样且反过来不成立（`[temp.constr.order]/4`、`[temp.constr.order]/5`）。

### 6.2 常见关系

| 写法 1 | 写法 2 | 结果 |
| --- | --- | --- |
| `A<T>` | `A<T> && B<T>` | 后者更受约束 |
| `A<T> && B<T>` | `B<T> && A<T>` | 互相包含，无法区分，调用有歧义 |
| `A<T>`（概念 A） | `B<T>`（概念 B，定义相同） | 原子约束不同，互不包含，调用有歧义 |
| `A<T>` | `A<T> \|\| B<T>` | 前者更受约束 |
| `C<T>` | `C<T> && true` | 后者更受约束 |
| `C<T>` | `D<T>`（`D = C<T>`） | 归一化相同，互相包含，调用有歧义 |

表中第三行是最常见的误解。两个概念的定义文本相同，但原子约束来自不同出现位置，包含关系不成立。修正方式是把公共部分抽成一个概念，再在两边引用同一个 concept-id。

第五行说明概念没有「边界」：`C<T>` 展开成定义中的原子约束，`C<T> && true` 在此基础上多一个原子约束，因此更强。第六行是相反效果：`D = C<T>` 只是给同一个范式换了个名字，两个声明无法区分。

### 6.3 重载决议中的位置

约束在模板实参推导之后、候选可行性判定时检查；不满足的候选被移除（`[over.match.viable]`）。效果与 SFINAE 类似，区别在于约束是声明接口的一部分，会参与模板偏序与重载决议的最后一级比较。[draft]

比较顺序大致是：转换序列、非模板优先、模板偏序，最后才看约束强弱（`[over.match.best]`）。约束只在前面几项都无法区分时才决定胜负。两个候选的转换序列不同时，约束更强也不会让更差的转换胜出。

约束不检查函数体。选中的函数体无效仍然是硬错误；函数体是否可编译，只在该特化被实例化时检查。

具名类模板特化在形成类型时检查约束（第 3.2 节）；函数模板在重载决议中检查约束。两者都发生在「使用」处，不在声明处。

### 6.4 C++26 的折叠约束

C++26 之前，`(C<Ts> && ...)` 作为一个整体成为原子约束。两个折叠表达式只要写法不同，就不互相包含：

```cpp
template<class T> concept A = std::is_move_constructible_v<T>;
template<class T> concept B = std::is_copy_constructible_v<T>;
template<class T> concept C = A<T> && B<T>;

template<class... T> requires (A<T> && ...) void g(T...);  // #1
template<class... T> requires (C<T> && ...) void g(T...);  // #2
```

C++23 中 `g(std::string{})` 有歧义：`#1` 与 `#2` 的原子约束是两个不同的折叠表达式。C++26 把折叠表达式归一化为折叠约束（fold expanded constraint），按元素展开后，`#2` 的每个元素要求 `A<T> ∧ B<T>`，`#2` 包含 `#1`，调用选择 `#2`。[draft]

折叠约束的判定规则（`[temp.constr.fold]`）：[draft]

- 包展开无效（例如两个包的宽度不同）时，约束不满足；
- 元素个数为 0 时，`&&` 折叠满足，`||` 折叠不满足；
- 按顺序替换元素；`&&` 遇到第一个不满足的元素即停止，`||` 遇到第一个满足的元素即停止；
- 两个折叠约束可比较，需要相同的折叠运算符、可比较的约束，以及等价的不展开包。

`&&` 与 `||` 对空包的结果沿用折叠表达式的惯例，这也让空参数包上的约束保持数学上的单位元语义。

---

## 7. 标准库概念

### 7.1 层次

`<concepts>` 把基础概念分成四组：

| 类别 | 代表 | 关注点 |
| --- | --- | --- |
| 语言相关 | `same_as`、`derived_from`、`convertible_to`、`common_reference_with`、`integral` | 类型关系与类型类别 |
| 比较 | `equality_comparable`、`totally_ordered`、`three_way_comparable` | 比较运算与共同引用类型 |
| 对象 | `movable`、`copyable`、`semiregular`、`regular` | 构造、赋值、交换、默认状态 |
| 可调用 | `invocable`、`predicate`、`relation`、`strict_weak_order` | 调用表达式与返回类型 |

`same_as` 的定义值得单独看。标准用说明性的辅助概念把两个方向都写出来：

```cpp
template<class T, class U>
concept same_as_impl = std::is_same_v<T, U>;  // 说明用，标准中记作 same-as-impl

template<class T, class U>
concept same_as = same_as_impl<T, U> && same_as_impl<U, T>;
```

两个方向都要求，保证 `same_as<T, U>` 与 `same_as<U, T>` 的满足性一致。[draft]

`derived_from` 同时要求 `is_base_of_v<Base, Derived>` 与指针的可转换性，后者排除私有继承与歧义基类。`convertible_to` 要求 `is_convertible_v` 与 `static_cast` 都成立，因此显式转换也算，单看 `is_convertible` 会漏掉这一部分。

### 7.2 满足与建模

标准库概念同时带语法要求与语义要求。语法要求由 requires 表达式描述，编译器可以检查；语义要求写在正文中，编译器无法检查。`[res.on.requirements]/1` 把两者分开：[draft]

- 实参满足（satisfies）概念，指约束的语法部分成立；
- 实参建模（models）概念，指满足概念且符合概念规格中的全部语义要求。

如果程序的有效性或含义依赖「实参建模某个概念」，而实参只满足、未建模，程序 ill-formed, no diagnostic required（`[res.on.requirements]/2`）。

语义要求中最常见的是相等保持（equality preservation）。`[concepts.equality]/1` 要求表达式在相等输入下产生相等输出，`[concepts.equality]/3` 进一步要求稳定：同样的输入对象在两次求值中产生相同输出，期间没有显式修改。[draft]

```cpp
struct Weird {
    int v;
};

bool operator==(const Weird& a, const Weird& b) {
    return (a.v + b.v) % 2 == 0;  // 不满足相等保持
}
```

`Weird` 在语法上满足 `equality_comparable`，但不建模它。把 `Weird` 用在一个假定 `==` 保持相等的算法里，程序行为不受标准保证。概念无法把这类语义要求变成编译期错误，这是概念与类型系统之间的固定边界。

### 7.3 ranges 中的组合

`<ranges>` 的概念通过组合定义，强化关系直接写进定义。例如 `random_access_iterator` 以 `bidirectional_iterator` 为前提，再叠加随机访问能力；`sortable` 组合 `permutable` 与 `indirect_strict_weak_order`。因此包含关系沿定义自动成立，算法重载不需要重复声明强弱。[draft]

这种写法值得在库设计中沿用：把「更强」表达为「引用较弱的概念并追加要求」，让包含关系由归一化完成；为同一个要求另写一个同义概念，会切断包含关系（第 6.2 节）。

---

## 8. 实现与诊断

### 8.1 支持情况

| 实现 | 版本 | 说明 |
| --- | --- | --- |
| GCC | 10 | C++20 模式；更早版本以 `-fconcepts` 支持 Concepts TS |
| Clang | 10 | C++20 模式 |
| MSVC | 19.30 | 19.23 起提供实现 |

特性宏的取值如下：

| 宏 | 值 | 含义 |
| --- | --- | --- |
| `__cpp_concepts` | `202002L` | C++20 概念；C++26 没有再次提升该宏 |
| `__cpp_fold_expressions` | `202406L` | P2963R3 的折叠约束 |
| `__cpp_template_parameters` | `202502L` | P2841R7 的 concept 模板参数 |
| `__cpp_lib_concepts` | `202002L`，C++23 为 `202207L` | 标准库概念 |

C++29 工作草案把 `__cpp_concepts` 提升到 `202606L`，对应 P3822R2 的条件 `noexcept`。跨版本库应分别检查这些宏，不能只用 `__cpp_concepts` 判断折叠约束或 concept 模板参数是否可用。

### 8.2 诊断与实现自由度

标准不规定约束失败的诊断措辞与信息量。最终报错时，实现通常打印失败的原子约束链：GCC 与 Clang 报「constraints not satisfied」并列出表达式，MSVC 显示 concept 名与未满足的要求。[impl]

归一化、替换与满足性判定都发生在编译期，开销随约束数量与实例化深度增长。具体量级由实现决定，标准不规定诊断质量，也不规定缓存策略。可移植的写法是减少重复的深层约束，把公共前提抽成单个概念，避免在约束中触发不必要的实例化。

---

## 9. 工程规则

1. 约束写在接口上，只表达实现真正依赖的最小要求。多写的约束会排除合法类型，也会增加编译期负担。
2. 优先使用标准概念。自造一个语义相同但定义独立的概念，会切断与其他库之间的包含关系，造成重载歧义。
3. 语义要求写进文档或注释。编译器只能检查语法，相等保持、复杂度、异常安全这类要求无法由约束表达。
4. 用 `if constexpr` 选择实现路径，用概念过滤重载集合。两者职责不同：前者在函数体内分支，后者在候选阶段生效。
5. 约束中避免依赖可变状态。同一原子约束在不同位置必须得到相同结果，否则程序 IFNDR。
6. 约束不替代函数体检查。选中的函数体无效仍然是硬错误，概念通过不代表实现正确。

---

## 结论

概念机制可以压缩成一条链：声明按固定顺序收集约束，归一化把约束拆成原子约束的合取与析取并展开概念定义，替换决定每个原子约束是否满足，范式比较决定哪个声明更受约束，重载决议按这个偏序选择函数。

两处分界最容易出错。第一处是原子约束的同一性：拼写相同不保证是同一个原子约束，只有同一处表达式与等价参数映射才算。第二处是语法与语义：概念只把可检查的语法要求交给编译器，标准库概念另带语义要求，违反时程序 IFNDR。

工程上，概念适合写在接口上、用标准概念组合、把语义要求写进文档。约束能改善重载选择与诊断，不能保证选中的实现满足语义，也不能替代函数体与运行期的检查。

---

## 参考文献

- 标准草案：`[temp.concept]`、`[temp.constr.constr]`、`[temp.constr.op]`、`[temp.constr.atomic]`、`[temp.constr.normal]`、`[temp.constr.decl]`、`[temp.constr.order]`、`[temp.constr.fold]`、`[temp.constr.concept]`、`[expr.prim.req]`、`[temp.names]`、`[res.on.requirements]`、`[concepts.equality]`。
- 草案直达：<https://eel.is/c++draft/temp.concept>、<https://eel.is/c++draft/temp.constr.atomic>、<https://eel.is/c++draft/temp.constr.normal>、<https://eel.is/c++draft/temp.constr.order>、<https://eel.is/c++draft/expr.prim.req>。
- 提案：N4377（Concepts TS）、P0734R0（Wording for Concepts）、P1084R2（Today's return-type-requirements Are Insufficient）、P1452R2（On the non-uniform semantics of return-type-requirements）、P1141R2（Yet another approach for constrained declarations）、P1754R1（Rename concepts to standard_case for C++20, while we still can）、P2963R3（Ordering of constraints involving fold expressions）、P2841R7（Concept and variable-template template-parameters）、P3822R2（Conditional noexcept specifiers in compound requirements）。
- 实现与文档：GCC 的 `-fconcepts` 文档、<https://en.cppreference.com/w/cpp/language/constraints>、<https://en.cppreference.com/w/cpp/concepts>、<https://en.cppreference.com/w/cpp/feature_test>、<https://en.cppreference.com/w/cpp/compiler_support/20>。
