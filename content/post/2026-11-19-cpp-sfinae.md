---
title: "C++ 的 SFINAE"
slug: "cpp-sfinae"
date: "2026-11-19"
tags: ["C++", "模板", "SFINAE", "重载决议"]
draft: false
summary: "以草案条款、提案与缺陷报告为据，解释 SFINAE 的判定位置：替换失败只在立即上下文中移除候选，函数体、类模板实例化、默认函数实参与 noexcept 说明符中的失败都是硬错误；并给出 enable_if、void_t 与表达式 SFINAE 的写法、边界和与 concepts 的分工。"
---

## 0. 结论摘要

SFINAE 是模板实参推导期间的一条容错规则：替换模板参数后，如果函数类型或模板参数声明中的某个类型、表达式无效，该候选从重载集中移除，程序不因此报错（`[temp.deduct.general]/8`）。规则主要作用于函数模板的候选生成，也作用于类模板与变量模板偏特化的匹配。

三个限定决定它是否生效：

- 失败必须发生在替换阶段。函数体、类模板实例化的副作用、默认函数实参、`noexcept` 说明符中的错误都在替换之外，按硬错误处理。
- 失败必须位于立即上下文（immediate context）。立即上下文是替换轨迹本身，不包含 lambda 体与单独实例化的构造。
- 规则只服务于可行性判定。候选生成之后，函数体中的错误与 SFINAE 无关。

工程上常用的三种载体是返回类型、模板参数与函数参数；`std::enable_if` 把布尔条件编码成「类型不存在」，`std::void_t` 把成员检测编码成偏特化匹配。C++20 起，concepts 与 `requires` 在多数场景取代这些写法，SFINAE 仍用于不能改签名或需要兼容旧标准的代码。

---

## 1. 范围与口径

### 1.1 术语

本文区分几个容易混用的词：

- 替换（substitution）：把模板参数替换为模板实参的过程。
- 推断失败（deduction failure）：推导或替换没有成功，候选不可行。
- 替换失败（substitution failure）：替换产生了本应诊断的无效类型或表达式。
- 硬错误（hard error）：程序立即 ill-formed，不再继续筛选候选。
- 立即上下文（immediate context）：替换轨迹中扣除函数体、lambda 体与单独实例化构造后的部分。

SFINAE 只描述「替换失败不报错」，推断失败还包括类型不匹配、推导冲突等情形，两者不能互相替代。标准文本本身不使用 SFINAE 这个缩写，而用「推断失败」与「替换」描述行为。

### 1.2 版本与证据

条款引用以 eel.is 的 2026-11 草案快照为准；C++11、C++17、C++20 的措辞分别用 N3337、N4659、N4861 对照。提案与缺陷报告写到编号为止，草案段号在标准换版后可能位移。除特别说明外，代码示例按 C++17 写；C++11 的写法需要把 `_v`、`_t` 别名换成 `::value` 与 `typename ...::type`。

正文用三类标记：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | 草案条款的可观察要求 | `[temp.deduct.general]/8` 限定立即上下文 |
| [paper] | 提案、缺陷报告与技术勘误 | N2634 把表达式纳入替换；CWG 1170 把访问检查纳入替换 |
| [推断] | 由条款与实现行为推出的工程判断 | 条件应尽量写进签名，不要藏进辅助类 |

实现侧只讨论公开可观察的行为，不引用具体版本的头文件行号。

### 1.3 不做什么

- 不展开 concepts 的归一化、原子约束与偏序，只在第 8 章比较分工。
- 不穷举模板元编程惯用法，只讨论与重载决议相关的部分。
- 不给编译耗时数据，也不比较编译器的诊断文本质量。
- 不涉及 C++26 契约（contracts）与反射对替换规则的影响。

---

## 2. 规则在重载决议中的位置

### 2.1 候选的生成

[draft] `[temp.over]/1` 规定，调用函数或函数模板时，对每个函数模板做实参推导并检查显式模板实参。推导成功时，用得到的模板实参合成一个函数模板特化的声明，加入候选函数集；推导失败，或合成的声明会 ill-formed，该模板不加入候选集。

这段措辞有两个要点：

- 参与候选生成的是声明，函数体不参与。[draft] `[temp.over]/5` 明确，解析调用只需要函数模板的声明，定义可以不在当前翻译单元。
- 候选集合并后，重载决议按通常规则比较非模板函数与合成声明。转换序列仍是首要比较项，模板与非模板、模板之间的先后由 `[over.match.best]` 的决胜规则决定。

由此可以理解 SFINAE 的收益：某个重载只在类型满足条件时存在，其他情况下它不进入候选集，调用方不需要写运行期分支。

### 2.2 两轮替换

[draft] `[temp.deduct.general]/6` 把替换分成两个时点：

1. 推导开始时，把显式指定的模板实参替换进函数类型。
2. 推导结束时，把推导得到的实参与默认模板实参替换进函数类型。

显式实参替换完成后，推导得到其余实参；在把这些实参最终替换进函数类型之前，还会检查关联约束。约束不满足时，推断失败（`[temp.deduct.general]/5`）。约束失败与替换失败的效果相同，都是候选不可行，但判定机制不同，第 8 章展开。

[draft] `[temp.deduct.general]/7` 规定替换轨迹：函数类型（不含 `noexcept` 说明符）、`explicit` 说明符（C++20 起）、模板参数声明，以及类模板偏特化的实参列表。替换按词法顺序进行，遇到第一个导致失败的条件就停止。

词法顺序有可观察后果。同一个函数模板的两次声明如果词法顺序不同，导致实例化顺序不同或某些实例化不发生，程序 ill-formed，不要求诊断（CWG 2322）。下面的例子来自 `[temp.deduct.general]/7`：

```cpp
template <class T>
struct A { using X = typename T::X; };

template <class T>
typename T::X f(typename A<T>::X);   // 返回类型先替换，先失败

template <class T>
auto g(typename A<T>::X) -> typename T::X; // 参数先替换，实例化 A<T>

template <class T>
void f(...);
```

对 `f<int>(0)`，返回类型 `typename T::X` 先失败，`A<int>` 不会被实例化，第一个重载被移除，调用落到 `f(...)`。对 `g<int>(0)`，参数 `typename A<int>::X` 先触发 `A<int>` 的实例化，而 `A` 的成员声明无效，错误不在立即上下文，程序硬错误。

### 2.3 一个最小例子

```cpp
#include <vector>

template <class T>
typename T::value_type first_value(const T& c) {
    return *c.begin();
}

template <class T>
T first_value(T* p) {
    return *p;
}
```

调用 `first_value(v)`（`v` 的类型是 `std::vector<int>`）时，第二个重载的 `T*` 无法从 `const std::vector<int>&` 推导，只有第一个候选。调用 `first_value(&x)` 时，第一个重载把 `T` 推导为 `int*`，返回类型 `typename int*::value_type` 无效，候选被移除；第二个重载把 `T` 推导为 `int`，调用成功。

这个例子也说明 SFINAE 的判定发生在候选生成阶段，早于参数转换的比较：第一个重载在替换阶段出局，第二个重载不需要与它比较参数转换。

---

## 3. 立即上下文

### 3.1 定义

[draft] `[temp.deduct.general]/8` 把立即上下文定义为「该替换轨迹本身，排除 lambda 表达式体与单独实例化的构造」。同一段还指出：

- 替换可能触发模板特化实例化、隐式函数生成等副作用；这些副作用不在立即上下文，其中的错误可以使程序 ill-formed。
- 访问检查是替换过程的一部分。

[draft] `[temp.deduct.general]/9` 补充：任何语句都不在立即上下文中。函数体、lambda 体、默认函数实参的实例化与求值都属于语句或单独实例化的范畴，不能指望其中的错误被 SFINAE 吸收。

### 3.2 边界表

| 位置 | 是否在立即上下文 | 失败后果 |
| --- | --- | --- |
| 返回类型（含尾置返回类型） | 是 | 候选移除 |
| 函数参数类型 | 是 | 候选移除 |
| 模板参数声明中的类型与表达式 | 是 | 候选移除 |
| 默认模板实参 | 是 | 候选移除 |
| `explicit` 说明符（C++20 起） | 是 | 候选移除 |
| 默认函数实参 | 否 | 使用到时硬错误 |
| 函数体、lambda 体（C++20 起明确排除） | 否 | 实例化时硬错误 |
| `noexcept` 说明符 | 否 | 实例化时硬错误 |
| 类模板或变量模板的实例化 | 否 | 硬错误 |
| 别名模板展开后的类型与表达式 | 是 | 候选移除 |

表中的「是」有条件：替换本身不能触发不在立即上下文中的实例化。别名模板的展开是透明的，`void_t` 依赖这一点；一旦展开过程中实例化了某个类模板，该类模板内部的错误就落到表的下半部分。

### 3.3 类模板实例化把失败推出去

```cpp
template <class T>
struct helper {
    using type = typename T::type;
};

template <class T>
typename helper<T>::type f(T); // 替换返回类型需要实例化 helper<T>
```

对 `f(0)`，替换 `helper<int>::type` 要求实例化 `helper<int>`；`helper<int>` 的成员声明 `typename int::type` 无效。该错误发生在实例化内部，不在立即上下文，程序硬错误，`f(...)` 形式的回退不会被考虑。

把同样的检测写成偏特化，失败就回到立即上下文：

```cpp
template <class T, class = void>
struct has_type : std::false_type {};

template <class T>
struct has_type<T, std::void_t<typename T::type>> : std::true_type {};
```

偏特化的实参列表是替换轨迹的一部分，`typename T::type` 对 `int` 无效时，这个偏特化不匹配，主模板被使用。这里没有函数重载，规则的作用方式类似。CWG 1227 处理的是立即上下文与实例化内部混合的判定，替换顺序会影响最终结果是推断失败还是硬错误。

### 3.4 别名模板与 CWG 1558

别名模板不产生新的类型，展开后直接参与替换。下面的写法依赖这一点：

```cpp
template <class...>
using void_t = void;

template <class T, class = void>
struct has_static_member : std::false_type {};

template <class T>
struct has_static_member<T, void_t<decltype(T::member)>> : std::true_type {};
```

CWG 1558 处理的是别名模板忽略部分实参时的等价性：如果 `void_t<X>` 中的 `X` 无效，替换应当失败，而不是把 `void_t<X>` 当作与 `void` 等价后继续。C++17 把 `std::void_t` 纳入标准（N3911），这类检测才有统一的写法。

---

## 4. 标准中的适用位置

### 4.1 函数调用

最常见的入口是函数调用。`[temp.deduct.call]` 描述从实参类型推导形参类型；推导与替换失败时，该模板不进入候选集，其他候选继续参与重载决议。

调用表达式中的显式模板实参也在检查范围内。`f<int>(0)` 会先替换显式实参，再推导其余参数；任一阶段失败都使该候选不可行。

### 4.2 取函数模板地址与转换函数模板

[draft] `[temp.deduct.funcaddr]/1` 规定，对重载集取地址时，用目标类型与函数模板的函数类型做推导。目标类型不存在时，推导在空的 P/A 集合上进行。替换失败同样移除候选。

[draft] `[temp.deduct.conv]/1` 规定，转换函数模板的推导把返回类型与目标类型比较。转换函数参与重载决议，失败时该转换函数不可行。

这两种场景说明 SFINAE 不限于「调用」语法：初始化、赋值、按值传参、`static_cast` 都可能触发转换函数模板的推导。

### 4.3 类模板与变量模板偏特化

[draft] `[temp.spec.partial.match]/2` 规定，偏特化匹配的条件是：偏特化的模板实参可以从实际实参列表推导出来，并且推导出的实参满足关联约束。匹配失败时，该偏特化被忽略，实例化回退到主模板或其他偏特化。

匹配失败与函数重载中的替换失败效果相同，但术语不同：标准描述为「偏特化不匹配」，不描述为「候选移除」。CWG 2054 把偏特化的模板实参列表补进替换轨迹，使匹配阶段的替换失败按容错规则处理。如果偏特化的模板实参因为参数列表结构而无法推导，程序 ill-formed（`[temp.spec.partial.match]/3`），不会静默回退。

变量模板的偏特化从 C++14 起存在，匹配规则相同。

### 4.4 显式实例化与显式特化

[draft] `[temp.deduct.decl]/2` 规定，在显式实例化、显式特化以及部分友元声明中，推导用于确定声明指向哪个特化。推导失败或匹配多于一个时，程序 ill-formed。这里没有候选集，也没有回退路径，SFINAE 不适用。

```cpp
template <class T>
typename T::type f(T);

template void f(int); // 推导失败，程序 ill-formed
```

希望「类型不满足条件时静默跳过」的代码，不能依赖显式实例化。

### 4.5 约束

[draft] `[temp.deduct.general]/5` 规定，模板实参全部确定后、函数类型最终替换前，检查关联约束；约束不满足时推断失败。约束失败不属于替换失败，但效果一致：该候选不可行。

这个顺序决定了排查方向：显式实参的替换最先发生，随后是模板实参推导与约束检查，最后才是函数类型的完整替换。某一步已经产生硬错误时，后续检查不会发生。

---

## 5. 常用手法

### 5.1 enable_if 的机制

`std::enable_if` 的经典实现只有一个偏特化：

```cpp
template <bool B, class T = void>
struct enable_if {};

template <class T>
struct enable_if<true, T> { using type = T; };
```

`B` 为 `true` 时，`enable_if<B, T>::type` 存在，等于 `T`；`B` 为 `false` 时，主模板没有 `type`，引用 `::type` 产生无效类型，替换失败。N2240 把 `enable_if` 与 `conditional` 提案进标准，C++11 起可用；C++14 起有别名模板 `enable_if_t`。

条件可以放在三个位置：

```cpp
// 返回类型
template <class T>
typename std::enable_if<std::is_integral<T>::value, T>::type
twice(T x) { return x + x; }

// 模板参数
template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
constexpr T twice_v2(T x) { return x + x; }

// 函数参数
template <class T>
void twice_v3(T x, std::enable_if_t<std::is_integral_v<T>, int> = 0);
```

三种写法都能让条件不满足时该重载不可行，差别在签名与调用形式：

- 返回类型位置不改变参数列表，调用形式最自然；返回类型不参与重载决议的排序，两个候选的模板头与参数列表都相同时，条件必须互斥，否则两个都可行时调用 ambiguous。
- 模板参数位置不改变函数类型，常用于构造函数模板与转换运算符模板，这两类没有返回类型可写。
- 函数参数位置会改变签名，可能影响取地址、函数指针类型与调用处的实参个数，使用较少。

[draft] `[temp.deduct.general]/7` 把模板参数声明列为替换轨迹，因此默认模板实参中的 `enable_if` 失败属于 SFINAE。默认函数实参不在函数类型中，写在默认函数实参里的条件在使用该实参时才检查，失败是硬错误。

两个函数模板仅默认模板实参不同时，不构成重载。默认模板实参不参与函数模板等价性判断，这两个声明会被当作同一模板的重复声明，不能用来制造两个候选。

### 5.2 void_t 与检测

`std::void_t` 把任意数量的类型映射为 `void`。它本身不做检测，作用是在偏特化的实参列表中制造一个可以失败的位置：

```cpp
template <class T, class = void>
struct has_size : std::false_type {};

template <class T>
struct has_size<T, std::void_t<decltype(std::declval<const T&>().size())>>
    : std::true_type {};
```

`std::declval` 只用于不求值语境，不需要定义。`decltype` 检查表达式是否合法；`void_t` 把合法的结果统一成 `void`，与主模板的默认实参匹配。表达式非法时，偏特化不匹配，`has_size` 继承 `false_type`。

检测成员类型时把 `decltype` 换成类型：

```cpp
template <class T, class = void>
struct has_value_type : std::false_type {};

template <class T>
struct has_value_type<T, std::void_t<typename T::value_type>>
    : std::true_type {};
```

这种写法比在函数体里写 `static_assert` 更适合泛型代码，因为检测结果可以在编译期参与重载与偏特化，不需要实例化函数体。

`std::is_detected` 不在 C++17 主标准中。检测惯用法由 N4436 提出，进入 Library Fundamentals TS v2，实现通常放在 `std::experimental` 命名空间。可移植代码应自带检测模板，或直接写 `requires` 表达式。

### 5.3 表达式 SFINAE

C++11 起，函数类型中的一般表达式也参与替换（N2634）。把检测写进尾置返回类型是常见用法：

```cpp
template <class T>
auto member_begin(T& c) -> decltype(c.begin()) {
    return c.begin();
}
```

`c.begin()` 不合法时，`decltype(c.begin())` 无效，替换失败；合法时，返回类型就是 `begin` 的返回类型。这种写法不要求 `T` 有某个嵌套类型，检测的是表达式。

逗号表达式可以把多个检测串起来，并把结果类型放到最后一项：

```cpp
template <class T>
auto addable(T& a, T& b) -> decltype((void)(a + b), std::true_type{}); // 只用于检测，不需要定义
```

`(void)(a + b)` 丢弃 `operator+` 的返回类型，避免用户定义的逗号运算符干扰；`std::true_type{}` 给出返回类型。任一子表达式无效，整个 `decltype` 无效。

表达式 SFINAE 的边界与类型 SFINAE 相同：表达式必须位于立即上下文。把同样的表达式放进函数体，错误就是硬错误。

### 5.4 重载检测

用两个函数模板做检测，可以避免写偏特化：

```cpp
template <class T>
auto has_foo(int) -> decltype(std::declval<T&>().foo(), std::true_type{});

template <class>
std::false_type has_foo(...);

template <class T>
inline constexpr bool has_foo_v = decltype(has_foo<T>(0))::value;
```

第一个重载的参数是 `int`，第二个重载是省略号。`foo` 不存在时，第一个重载被移除，调用落到第二个；`foo` 存在时，`int` 比省略号更匹配。这种写法把检测结果编码为返回类型，适合在常量表达式中使用。

### 5.5 标签分派与优先级

标签分派不依赖替换失败，而是用参数类型选择重载：

```cpp
template <class It>
void advance_impl(It& it, int n, std::random_access_iterator_tag) {
    it += n;
}

template <class It>
void advance_impl(It& it, int n, std::input_iterator_tag) {
    while (n--) ++it;
}

template <class It>
void advance(It& it, int n) {
    advance_impl(it, n, typename std::iterator_traits<It>::iterator_category{});
}
```

随机访问迭代器的标签同时可转换为 `input_iterator_tag`，但完全匹配优先，选择第一个重载。标签分派要求类型体系中存在可用的标签，且被选中的分支必须是合法代码；它不检查表达式是否存在，也不处理「成员可能不存在」的情况。

### 5.6 if constexpr

`if constexpr` 在 C++17 进入语言，`requires` 表达式在 C++20 进入语言；两者结合可以在函数体内按条件实例化分支：

```cpp
template <class T>
auto size_of(const T& value) {
    if constexpr (requires { value.size(); }) {
        return value.size();
    } else {
        return sizeof(value);
    }
}
```

它不改变候选集。函数模板一旦被选中，函数体照常实例化，`if constexpr` 只保证未选中的语句不被实例化。需要「类型不满足条件时该重载不存在」时，仍要用约束或 SFINAE。

### 5.7 concepts 与 requires

C++20 起，约束可以直接写在模板头：

```cpp
template <class T>
concept Sized = requires(const T& c) {
    c.size();
};

template <Sized T>
std::size_t size(const T& c) {
    return c.size();
}
```

`requires` 表达式检查一组要求的合法性，结果是一个 `bool` 常量。约束不满足时，候选不参与重载决议；约束参与偏序，更严格的约束可以胜出。诊断会指出哪条约束失败，不需要展开 `enable_if` 的替换链。

---

## 6. 边界与陷阱

### 6.1 函数体与 auto 返回类型

函数体中的错误永远不是 SFINAE。下面的写法不会在重载决议阶段被排除：

```cpp
template <class T>
auto first(T& c) {
    return c.begin(); // 返回类型从函数体推导
}
```

`auto` 返回类型不带尾置类型时，返回类型由函数体推导；推导发生在选中该候选之后，`c.begin()` 无效是硬错误。把返回类型写成 `-> decltype(c.begin())` 才能把检测移入立即上下文。

### 6.2 默认函数实参

```cpp
template <class T>
void g(T, int = sizeof(typename T::type));
```

调用 `g(0)` 时，形参类型 `T` 与 `int` 都合法，替换阶段不会失败；默认实参 `sizeof(typename int::type)` 在使用时实例化，错误已经离开立即上下文，程序硬错误。需要条件时，把条件放进模板参数或参数类型，不要放进默认函数实参。

### 6.3 noexcept 说明符

C++17 起，`noexcept` 是函数类型的一部分，但异常说明中的替换只在说明符被实例化时进行。`[temp.deduct.general]/7` 的注指出，此时如果替换产生无效类型或表达式，程序 ill-formed。下面的写法不能用来筛选候选：

```cpp
template <class T>
void h(T) noexcept(noexcept(typename T::type{})); // 失败是硬错误
```

需要按 `noexcept` 条件筛选时，把条件放进返回类型或模板参数，不要依赖异常说明中的替换。

### 6.4 访问控制

[draft] `[temp.deduct.general]/8` 的注说明，访问检查是替换过程的一部分。CWG 1170 把这个行为应用到 C++11：立即上下文中的访问失败按推断失败处理。

```cpp
class Widget {
    void secret();
};

template <class T>
auto call_secret(T& t) -> decltype(t.secret()); // 访问失败，候选移除
```

访问检查依赖实例化时，情况不同。通过类模板成员间接触发的访问失败不在立即上下文，仍然是硬错误。

### 6.5 推断失败与替换失败

调用 `f(1, 2.0)` 且形参为 `(T, T)` 时，`T` 同时推导为 `int` 与 `double`，推导冲突，候选被移除。这里没有无效类型，也没有替换失败，效果却与 SFINAE 相同。把「所有候选移除」都称为 SFINAE 会掩盖这个区别。

替换失败是推断失败的子集。标准在 `[temp.deduct.general]/8` 规定替换失败的判定，在其他段落规定推导冲突、约束不满足等失败形式。工程上关心的是候选是否可行，术语上应保持区分。

### 6.6 重载决议与偏序

SFINAE 条件不参与函数模板偏序。两个候选的参数列表相同、条件互斥时，只有条件为真的那个进入候选集，不会产生歧义；条件同时为真时，两个候选都可行，且没有一条规则按条件排序，调用 ambiguous。

```cpp
template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
void f(T);

template <class T, std::enable_if_t<std::is_floating_point_v<T>, int> = 0>
void f(T);

f(1);   // 只有第一个可行
f(1.0); // 只有第二个可行
```

条件覆盖不完整时，两个候选都不可行，报「没有匹配函数」。条件重叠时，两个都可行，报 ambiguous。设计约束时应让条件互斥且覆盖预期类型。

### 6.7 诊断与 static_assert

SFINAE 失败通常只留下「没有匹配函数」以及每个候选的替换失败说明。候选多、模板层次深时，诊断会很长。`static_assert` 可以在选中候选后给出明确文字，但它不参与候选筛选：

```cpp
template <class>
inline constexpr bool always_false = false;

template <class T>
void serialize(const T&) {
    static_assert(always_false<T>, "T 必须提供 serialize 成员");
}
```

这类回退重载常用于「所有 SFINAE 候选都不可行」时给出可读错误。`static_assert` 的条件必须依赖模板参数，否则会在定义时立即触发。

### 6.8 编译期成本

每个候选都要做替换；候选多、表达式复杂时，编译器在失败路径上仍要构造与丢弃大量类型。检测模板的递归层次过深，会放大编译时间与内存占用。

控制成本的做法：

- 把条件写进签名，避免在函数体里层层分派。
- 用命名 trait 复用检测结果，不要在每个重载里重复写表达式。
- 优先用 `requires` 表达式，减少模板实例化与诊断链。
- 对确实需要多个候选的场景，先测量候选数量与实例化深度。

---

## 7. 标准库中的使用

SFINAE 在标准库中主要出现在三处。

第一类是约束构造函数与赋值运算符。`std::function` 的转换构造函数用可调用性约束候选，复制性检查不在候选约束中；不可调用类型不进入重载集，不可复制的目标可能在候选通过后才报错。`std::variant` 的转换构造函数按可转换性与是否同一 variant 筛选；`std::tuple` 的转换构造函数按元素可构造性筛选。这些约束把大部分不适用的类型挡在重载决议阶段。

第二类是类型特征。`std::is_constructible`、`std::is_convertible` 等特征需要在无效表达式上给出 `false`，不能产生硬错误。标准把这些特征的结果定义为某个表达式或变量定义是否良构，实现通常用 `decltype` 与偏特化完成检测，避免在特征内部触发硬错误。

第三类是检测工具。`std::void_t` 是标准库提供的别名模板；`std::experimental::is_detected` 在 Library Fundamentals TS v2 中提供检测惯用法，主标准没有对应的 `std::is_detected`。

标准库的实现细节不属于接口约定。判断某个构造函数是否参与重载，应查对应条款的「参与重载决议的条件」，不要依赖某个实现的 `enable_if` 写法。

---

## 8. 与 concepts 的分工

### 8.1 表达方式

concepts 的完整规则见[《C++ concepts》](/post/2026/11/19/cpp-concepts/)，这里只比较两者的分工。

SFINAE 把约束编码为类型或表达式的合法性，约束失败表现为「该类型不存在」或「该表达式无效」。concepts 把约束写成具名谓词，失败表现为「约束不满足」。

```cpp
// SFINAE
template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
void f_sfinae(T);

// concepts
template <class T>
    requires std::integral<T>
void f_concept(T);
```

两者都让候选不可行，差别在可读性、诊断与组合能力。

### 8.2 偏序与诊断

约束参与约束偏序（constraint subsumption）。两个候选的参数列表相同、约束强弱不同时，更严格的约束胜出；SFINAE 条件不参与偏序，只能靠互斥条件避免歧义。

约束失败时，编译器可以指出具体哪条原子约束不满足，诊断通常比 `enable_if` 的替换链短。约束还可以命名、复用、组合，适合库接口。

### 8.3 仍然需要 SFINAE 的场景

- 需要兼容 C++17 及更早标准的代码。
- 约束依赖表达式合法性，且该表达式不便写成 `requires` 表达式。
- 需要让候选的存在依赖返回类型中的表达式，例如只在返回类型中检测成员函数的接口。
- 与旧库的 trait 体系对接，已有 `enable_if` 接口不能改动。

C++20 起的新代码优先用 concepts。SFINAE 作为底层机制仍然存在，理解它有助于读懂标准库与旧代码，也有助于判断某个错误为什么是硬错误。

---

## 9. 实践规则

1. 把条件放进立即上下文：返回类型、参数类型、模板参数声明或 `explicit` 说明符。不要放进函数体、默认函数实参与 `noexcept` 说明符。
2. 需要按表达式检测时，用尾置返回类型 `-> decltype(...)`，不要用不带尾置类型的 `auto` 返回。
3. 需要布尔结果时，用 `void_t` 偏特化或 `requires` 表达式；不要通过实例化辅助类的成员来检测，那会把失败推出立即上下文。
4. `enable_if` 的条件应互斥且覆盖预期类型。条件重叠会产生歧义，覆盖不全则没有可行候选。
5. 两个重载不能只靠默认模板实参区分；默认模板实参不参与函数模板等价性判断。
6. 检测结果用命名 trait 复用，避免在每个重载中重复长表达式。
7. 需要清晰诊断时，保留一个 `static_assert` 回退重载，条件依赖模板参数。
8. C++20 起优先用 concepts；只在兼容旧标准或需要精确控制候选集时使用 SFINAE。
9. 对负向用例写编译期测试：确认不该匹配的类型确实不匹配，避免条件写反后静默通过。

---

## 结论

SFINAE 的规则可以压缩成三步：重载决议为每个函数模板做替换；替换在立即上下文中产生无效类型或表达式时，该候选被移除；替换之外产生的错误仍然是硬错误。

三个边界最常被忽略。函数体，以及从函数体推导的 `auto` 返回类型，都在立即上下文之外，错误不会被吸收；默认函数实参与 `noexcept` 说明符同样在立即上下文之外；类模板实例化把错误带到实例化内部，辅助类里的 `typename T::type` 不能当作检测。

工程上，`std::enable_if` 负责把布尔条件变成候选是否存在，`std::void_t` 负责把表达式检测变成偏特化匹配，表达式 SFINAE 负责检测没有嵌套类型的接口。C++20 之后，这些写法在多数场景让位于 concepts；理解替换规则仍然是读懂诊断与旧代码的前提。

---

## 参考

- 标准草案：`[temp.deduct.general]`、`[temp.deduct.call]`、`[temp.deduct.funcaddr]`、`[temp.deduct.conv]`、`[temp.deduct.decl]`、`[temp.over]`、`[temp.spec.partial.match]`、`[temp.spec.partial.order]`、`[temp.alias]`、`[temp.constr.decl]`、`[over.match.best]`。
- 直达形式：<https://eel.is/c++draft/temp.deduct.general>、<https://eel.is/c++draft/temp.over>、<https://eel.is/c++draft/temp.deduct.decl>、<https://eel.is/c++draft/temp.spec.partial.match>、<https://eel.is/c++draft/temp.alias>。
- 提案与缺陷报告：N2240（Two missing traits: enable_if and conditional）、N2634（Solving the SFINAE problem for expressions）、N3911（TransformationTrait Alias `void_t`）、N4436（Proposing Standard Library Support for the C++ Detection Idiom）、CWG 1170（Access checking during template argument deduction）、CWG 1227（Mixing immediate and non-immediate contexts in deduction failure）、CWG 1558（Unused arguments in alias template specializations）、CWG 2054（Missing description of class SFINAE）、CWG 2322（Substitution failure and lexical order）。
- 条款对照版本：N3337（C++11）、N4659（C++17）、N4861（C++20）。
- 参考读物：<https://en.cppreference.com/w/cpp/language/sfinae>、<https://en.cppreference.com/w/cpp/types/enable_if>、<https://en.cppreference.com/w/cpp/types/void_t>。
