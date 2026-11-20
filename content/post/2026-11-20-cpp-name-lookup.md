---
title: "C++ 的名字查找"
slug: "cpp-name-lookup"
date: "2026-11-20"
tags: ["C++", "名字查找", "作用域", "模板"]
draft: false
summary: "以 C++ 工作草案的 [basic.lookup]、[class.member.lookup] 与 [temp.res] 条款为据，拆解名字查找的执行顺序：程序点与声明点、非限定查找的逐层搜索、限定查找与类成员查找集的合并、ADL 的关联实体、模板两阶段查找的分界，以及隐藏、二义与访问检查的先后关系。"
---

## 0. 结论摘要

名字查找把名字的一次使用与一组声明关联起来（[basic.lookup.general]/1）。它是编译期最早的一步语义分析：查找失败或结果二义，程序 ill-formed；查找成功且结果全是函数，才进入重载决议；决议与访问检查都排在查找之后。

- 查找以程序点为单位。声明点位于完整声明符之后，名字在声明点之前不可见；类的成员体、默认实参与默认成员初始化器属于完整类上下文，可以看到整个类。
- 非限定查找从当前作用域逐层向外，找到即停；using-directive 让被指定命名空间的声明参与查找，但它本身不声明名字。
- 限定查找只在指定作用域内进行。`obj.m` 中的 `m` 按 `obj` 的静态类型查找；类内查找沿基类子对象合并查找集。
- 类成员查找可能二义：不同基类子对象给出不同声明时，查找结果无效；虚基类只保留一份子对象，可以消解一部分路径二义。
- ADL 只扩展非限定函数调用，关联命名空间由实参类型决定；限定调用、成员访问与写成 `(f)(x)` 的调用都不做 ADL。
- 隐藏先于查找结果。内层作用域的同名声明隐藏外层，派生类成员隐藏基类同名成员，变量可以隐藏类型名；`using` 声明把基类名字重新引入派生类作用域。
- 模板内部按两阶段处理：非依赖名在定义期绑定，依赖名在实例化期查找；依赖调用的 ADL 同时考虑定义上下文与实例化上下文。
- 查找不检查访问权限、不检查函数是否删除、不做隐式转换。这些步骤都在查找之后。

---

## 1. 范围与口径

名字查找的条款集中在 [basic.lookup]，它依赖 [basic.scope] 的作用域与声明点定义，并向 [over.match]、[class.access]、[temp.res] 输出结果。本文按查找发生的顺序组织：先建立程序点与作用域模型，再分别处理非限定查找、限定查找、类成员查找与 ADL，最后处理模板中的两阶段查找与特殊上下文。

### 1.1 证据分级与版本基准

标准草案是主要依据，提案与实现行为只在解释来源或边界时引用。本文沿用下列标记：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | 工作草案的可观察要求 | [basic.lookup.general]/1 规定查找先于重载决议 |
| [paper] | WG21 提案、缺陷报告 | P1787R6 重写查找与作用域条款 |
| [impl] | 编译器与标准库的实现行为 | 二义查找的诊断文本 |
| [推断] | 由规则推出的工程判断 | 用限定名消解基类二义 |

标准侧以 eel.is 的 2026-11 草案快照为准，C++11、C++17、C++20、C++23 分别用 N3337、N4659、N4861、N4950 对照。P1787R6 在 C++23 中重写了 [basic.scope] 与 [basic.lookup] 的措辞，段号与 N4861 不完全对应；本文引用的段号以当前快照为准。草案不是正式标准，正式文本是 ISO/IEC 14882。

### 1.2 不做什么

- 不展开重载决议的完整规则，只说明查找向它交付什么，细节见[《C++ 的重载决议》](/post/2026/11/19/cpp-overload-resolution/)。
- 不展开模板实参推导与替换失败，只讨论查找在定义期与实例化期的分界，细节见[《C++ 的 SFINAE》](/post/2026/11/19/cpp-sfinae/)。
- 不展开约束与概念偏序，细节见[《C++ concepts》](/post/2026/11/19/cpp-concepts/)。
- 不展开链接、ODR 与模块的构建规则，只保留它们对可见声明的影响，细节见[《C++ 单一定义规则（ODR）》](/post/2026/11/14/cpp-odr/)。
- 不讨论编译器扩展、反射提案与 ABI，也不给出性能结论。

---

## 2. 查找模型

### 2.1 查找的输入与输出

查找的输入是名字、程序点与当前作用域。名字可以是普通标识符、运算符函数名、转换函数名、字面量运算符名、模板名或析构函数名。输出是一组声明。

若这组声明全部是函数或函数模板，它们构成重载集（[basic.lookup.general]/1），交给重载决议。否则，声明必须指称同一个实体；不同实体共存时名字的使用二义，程序 ill-formed。二义与重载的区别在这里：重载集内部由决议选一个，非函数声明之间没有这种选择。

查找成功不等于可调用。访问权限、删除定义、位域绑定等检查都在查找与决议之后（[basic.lookup.general]/1）。私有成员可以被查找找到，`= delete` 的函数也可以成为最优候选，错误在后续步骤产生。

### 2.2 程序点与声明点

程序点是翻译单元中相邻 token 之间的位置（[basic.lookup.general]/2）。单次搜索只收集在程序点之前出现的声明；跨翻译单元时，模块导入让另一翻译单元中导出的声明满足「在之前」的条件（同条）。

声明点是声明开始生效的位置。声明符的声明点在完整声明符之后（[basic.scope.pdecl]/1），因此数组边界看到的是外层名字：

```cpp
const int i = 2;

void f() {
    int i[i]; // 数组长度取外层 i，值为 2
}
```

类、枚举与别名声明的声明点分别在 class-head、enum-head 与整个别名声明之后（[basic.scope.pdecl]/3）；枚举量的声明点在其定义之后（[basic.scope.pdecl]/5）；注入类名的声明点在类定义左花括号之后（[basic.scope.pdecl]/8）。

类成员是声明点规则的主要例外。成员函数体、默认实参、默认模板实参与默认成员初始化器属于完整类上下文，成员查找从类定义之后的位置开始（[class.member.lookup]/3），因此可以引用正文中后出现的成员：

```cpp
struct S {
    int f() { return x; } // OK：x 在整个类完成后可见
    int x = 1;
};
```

这条规则只覆盖完整类上下文。写在类外的成员定义、类外的前置声明与普通的块作用域声明，仍按各自的程序点判断。

### 2.3 作用域链

作用域决定一次搜索的范围。C++ 的作用域种类与父子关系如下：

| 作用域 | 引入方式 | 父作用域 |
| --- | --- | --- |
| 块作用域 | 复合语句、选择与循环语句的子语句 | 外层块或函数参数作用域 |
| 函数参数作用域 | 函数或 lambda 声明中的形参 | 声明该函数的作用域 |
| 函数作用域 | 标签 | 函数参数作用域 |
| 类作用域 | 类定义 | 声明该类的作用域 |
| 命名空间作用域 | 命名空间定义 | 外层命名空间或全局作用域 |
| 枚举作用域 | 有作用域枚举的定义 | 声明该枚举的作用域 |
| 模板参数作用域 | 模板形参 | 声明该模板的作用域 |

无作用域枚举的枚举量注入外层作用域，不形成独立的枚举作用域。函数参数作用域在函数声明与函数定义中都存在；函数作用域（标签）只在函数定义中存在。

非限定查找从直接作用域开始（[basic.lookup.unqual]/3），沿父作用域链向外，直到全局作用域。限定查找不沿链向外，只在指定作用域及其基类中搜索。

### 2.4 查找只依赖声明

查找只需要声明可见，不需要定义可见。前置声明足以让名字参与查找：

```cpp
struct S;      // 声明

S* make();     // OK：S 已声明
```

定义是否存在于同一翻译单元、多个翻译单元中的定义是否一致，属于链接与 ODR 的问题，查找不检查。这条分工解释了一个常见现象：查找成功的代码仍可能在链接期失败。

---

## 3. 非限定查找

### 3.1 逐层搜索

非限定查找在直接作用域内做一次搜索；若没有找到，再在父作用域重复（[basic.lookup.unqual]/2）。找到即停，外层同名声明不参与合并：

```cpp
int x = 1;

void f() {
    int x = 2;
    {
        int x = 3;
        x = 4; // 第三层的 x
    }
}
```

同一层出现多个不同实体时，查找结果二义。using-directive 把多个命名空间的名字带到同一层，最容易触发这种二义：

```cpp
namespace A { int x; }
namespace B { int x; }

using namespace A;
using namespace B;

int y = x; // 二义：A::x 与 B::x
```

如果同一层找到的声明都是函数，这里不报二义，改为形成重载集，由重载决议选择。

### 3.2 using-directive 与 inline namespace

using-directive 不声明名字（[namespace.udir]/4）。它让被指定命名空间的成员以「好像声明在最近的外层命名空间中」的方式参与非限定查找（[namespace.udir]/3），并且这种效果可以传递：

```cpp
namespace A { int x; }
namespace B { using namespace A; }

using namespace B;

int y = x; // 找到 A::x
```

因为名字被提升到命名空间层，块作用域的局部声明仍然优先。下面的 `i` 指局部变量，不指 `A::i`：

```cpp
namespace A { int i; }

void f() {
    int i = 0;
    using namespace A;
    i++; // 局部 i
}
```

inline namespace 的成员可以像外层命名空间的成员一样使用。ADL 计算关联命名空间时，也会把关联命名空间的 inline namespace 集合全部纳入（[basic.lookup.argdep]/4）。

### 3.3 类作用域与基类

在成员函数体内，非限定查找先查类作用域，包括基类（[basic.lookup.unqual]/2 注），再查类所在的命名空间。类作用域一旦找到名字，外层命名空间的同名声明被隐藏：

```cpp
void f(int);

struct S {
    void f(double);
    void g() { f(1); } // 调用 S::f(double)
};
```

若希望两组重载同时可见，在类内写 `using` 声明，或把调用写成限定形式。类作用域的查找顺序与基类合并规则见第 5 章。

### 3.4 函数与形参

形参在函数参数作用域中声明。函数体最外层块不能重新声明形参名（[basic.scope.block]/2）；内层块可以，构成隐藏：

```cpp
void f(int x) {
    int x;     // 错误：函数体最外层块重新声明形参
    { int x; } // OK：内层块隐藏形参
}
```

默认实参在声明所在的作用域中查找，不能使用函数的局部变量。默认实参也不能使用同一参数列表中后出现的形参：

```cpp
int g = 1;

void f(int a = g);        // OK：g 在命名空间作用域
void h(int a, int b = a); // 错误：默认实参不能引用形参 a
```

### 3.5 全局与匿名命名空间

全局作用域的名字可以用 `::` 限定，绕过所有局部作用域。匿名命名空间的成员具有内部链接，并通过隐式的 using-directive 在外层命名空间中可见；同一翻译单元内的非限定查找可以直接使用这些名字。

```cpp
namespace {
int hidden = 1;
}

int x = hidden; // OK：匿名命名空间的成员在外层可见
```

---

## 4. 限定查找

### 4.1 语法与查找上下文

限定名由 nested-name-specifier 与后面的名字组成。名字后跟 `::` 时，查找只考虑命名空间、类型与特化后为类型的模板（[basic.lookup.qual.general]/1）：

```cpp
struct A { static int n; };

void f() {
    int A = 0;
    A::n = 1; // OK：A 在 :: 前按类型查找
    A a;      // 错误：A 在这里是变量
}
```

类成员访问中的名字也是限定名。`obj.m` 的查找上下文是 `obj` 的静态类型（[basic.lookup.qual.general]/2）。即使 `m` 是虚函数，名字查找仍按静态类型完成，运行期才选择覆盖者，两层机制的分工见[《C++ 的多态》](/post/2026/10/14/cpp-polymorphism/)。

### 4.2 命名空间限定

命名空间限定查找先搜 `N` 与其 inline namespace 集合；没有结果时，才搜 `N` 中 using-directive 指定的命名空间（[namespace.qual]/1）。这与非限定查找的合并方式不同：直接声明优先于 using-directive 带来的声明。

```cpp
namespace A { int f(int); }
namespace B { using namespace A; char f(char); }

char c = B::f(1); // 调用 B::f(char)，A::f(int) 不参与
```

若不同命名空间给出同名但不同的实体，限定查找同样二义：

```cpp
namespace A { int y; }
namespace B { int y; }
namespace C { using namespace A; using namespace B; }

int j = C::y; // 二义
```

跨命名空间的搜索中，类与枚举声明不会因为其他声明而被丢弃（[namespace.qual]/4），这与同一作用域内的类型隐藏不同。

`::x` 从全局命名空间开始查找，不经过局部作用域，也不受块作用域中同名声明的影响。

### 4.3 类限定

`C::m` 在类 `C` 的作用域中查找，规则与成员访问相同，沿基类合并查找集（第 5 章）。`p->Base::f()` 把查找上下文限定到 `Base`，用于绕过派生类中的同名隐藏。

限定名可以指称私有成员或删除函数。限定查找本身不检查访问权限，错误在访问检查或调用检查处产生。

### 4.4 限定查找与 ADL

限定调用不做 ADL（[basic.lookup.argdep]/1）。若一个函数只能由 ADL 找到，写成限定形式会失败：

```cpp
namespace N {
struct S { friend void f(S); };
}

void g() {
    N::S s;
    f(s);    // OK：ADL 找到隐藏友元
    N::f(s); // 错误：friend 声明不在 N 中绑定名字
}
```

---

## 5. 类成员查找

### 5.1 查找集

类作用域的查找结果是一个查找集，由声明集与子对象集两部分组成（[class.member.lookup]/2）。计算过程如下：

1. 先在类 `C` 自身的作用域中做一次搜索。若找到声明，子对象集只含 `C`，过程结束（[class.member.lookup]/3）。
2. 否则，对每个直接基类计算查找集，依次合并（[class.member.lookup]/4）。
3. 合并时，若一个集合的子对象都是另一个集合中某个子对象的基类子对象，则前者被后者支配，丢弃；若两个集合的声明不同且互不支配，结果无效；若声明相同，保留共享声明并合并子对象集（[class.member.lookup]/5）。

结果无效时程序 ill-formed（[class.member.lookup]/6）。这个算法解释了为什么派生类的声明能隐藏基类声明：第 1 步找到声明后，根本不会搜索基类。

### 5.2 二义

两个互不相关的基类给出不同声明时，查找集无效：

```cpp
struct A { int x; };
struct B { float x; };
struct C : A, B {};

void f(C& c) {
    c.x; // 二义：A::x 与 B::x
}
```

### 5.3 支配与虚基类

支配规则处理的是子对象格中的重复路径，而不是重载。若一个集合的每个子对象都是另一个集合中某个子对象的基类子对象，则前者被丢弃，后者保留；这一步不比较声明是否相同：

```cpp
struct V { int f(); };
struct B : virtual V { int f(); };
struct C : virtual V {};
struct D : B, C {};

void g(D& d) {
    d.f(); // OK：B::f 支配 V::f
}
```

虚基类只保留一份子对象，所以沿多条路径到达的同一虚基类声明不会二义。非虚基类则可能留下多份子对象：

```cpp
struct V { int v; };
struct A { int a; };
struct B : A, virtual V {};
struct C : A, virtual V {};
struct D : B, C {};

void f(D& d) {
    d.v++; // OK：虚基类只有一份 V 子对象
    d.a++; // 错误：两份 A 子对象
}
```

静态成员、嵌套类型与枚举量不依赖对象子对象，即使存在多份基类子对象也能唯一找到（[class.member.lookup]/8 注）。

### 5.4 隐藏与 using 声明

派生类中的同名声明隐藏基类的全部同名声明，隐藏与参数列表无关：

```cpp
struct B { void f(int); };
struct D : B { void f(double); };

void g(D& d) {
    d.f(1); // 调用 D::f(double)
}
```

`using` 声明把基类的声明引入派生类作用域，形成重载集。查找时 using-declarator 被替换为它命名的声明（[basic.lookup.general]/3），因此基类的重载可以与派生类的重载一起参与决议：

```cpp
struct B { void f(int); };

struct D2 : B {
    using B::f;
    void f(double);
};

void h(D2& d) {
    d.f(1); // 调用 B::f(int)
}
```

转换函数的查找另有一条规则：目标类型已知时，类中的转换函数模板也参与候选（[class.member.lookup]/7），具体的转换序列在重载决议中比较。

### 5.5 查找成功后的二义

查找集合并后可能只含一个声明，但成员访问仍可能二义。下面的 `D` 有两个 `A` 子对象，两条路径找到的都是 `A::x`，查找集里只有这一个声明，访问表达式却无法确定使用哪个子对象：

```cpp
struct A { int x; };
struct B : A {};
struct C : A {};
struct D : B, C {};

void f(D& d) {
    d.x; // 错误：A::x 无法绑定到唯一的 A 子对象
}
```

[expr.ref] 要求非静态数据成员的访问对应唯一的子对象。诊断文本通常写作 ambiguous name lookup，但按 [class.member.lookup] 的合并规则，这一步的分歧在子对象，不在声明集。

---

## 6. 实参依赖查找

### 6.1 触发条件

ADL 只用于函数调用，且调用表达式必须是非限定名。普通非限定查找没有找到类成员、块作用域函数声明或非函数声明时，ADL 才启用（[basic.lookup.argdep]/1）。普通查找找到命名空间作用域的函数时，ADL 仍会补充其他命名空间中的同名函数，两者一起进入候选集。

下面的调用中，第一行触发 ADL，后两行分别因限定形式与括号而不触发：

```cpp
namespace N {
struct S {};
void f(S);
}

void g() {
    N::S s;
    f(s);    // OK：ADL 找到 N::f
    N::f(s); // 限定调用
    (f)(s);  // 错误：括号使 postfix-expression 不是非限定名
}
```

成员访问不走这条路径。块作用域函数声明会抑制 ADL：

```cpp
namespace N {
struct S {};
void f(S);
}

void g() {
    void f(int);
    N::S s;
    f(s); // 错误：块作用域声明抑制 ADL
}
```

### 6.2 关联实体

对每个实参类型，ADL 计算一组关联实体（[basic.lookup.argdep]/3）：

| 实参类型 | 关联实体 |
| --- | --- |
| 类类型 | 类本身、外围类、直接与间接基类；类模板特化还包含模板实参关联的实体 |
| 枚举类型 | 枚举本身、外围类 |
| 指针或数组 | 指向类型或元素类型 |
| 函数类型 | 形参类型与返回类型 |
| 成员指针 | 类本身与成员类型 |
| 基础类型 | 空集 |

typedef 与 using 别名不贡献实体，查找只看类型本身。非类型模板实参也不贡献实体；类型模板实参与模板模板实参会把其关联实体带入集合。

### 6.3 关联命名空间与友元

关联命名空间是关联实体所在的最内层非 inline 命名空间，再加上这些命名空间的 inline namespace 集合（[basic.lookup.argdep]/4）。类内定义的友元函数只通过 ADL 可见：

```cpp
namespace N {
struct S {
    friend void f(S); // 只在 ADL 中可见
};
}

void g() {
    N::S s;
    f(s);    // OK
    N::f(s); // 错误
}
```

模板实参也会把命名空间带入关联集合。下面的 `f` 能被找到，是因为 `std::vector<N::T>` 的实参 `N::T` 关联到 `N`：

```cpp
namespace N {
struct T {};
void f(std::vector<T>);
}

void g() {
    std::vector<N::T> v;
    f(v); // ADL 找到 N::f
}
```

### 6.4 典型用法

交换函数是 ADL 最常见的用法。先引入 `std::swap`，再以非限定形式调用，让 ADL 有机会选中用户定义的重载：

```cpp
namespace N {
struct S {};
void swap(S&, S&);
}

void g() {
    N::S a, b;
    using std::swap;
    swap(a, b); // 找到 N::swap
}
```

运算符的候选集由 [over.match.oper] 单独规定，但非成员候选同样来自非限定查找与 ADL。把 `operator<<` 放在类型所在的命名空间中，`std::cout << x` 才能通过 ADL 找到它：

```cpp
namespace N {
struct S {};
std::ostream& operator<<(std::ostream&, S);
}

void g() {
    std::cout << N::S{}; // ADL 找到 N::operator<<
}
```

若把 `operator<<` 放在第三个命名空间，ADL 不会搜索它，调用只能通过限定形式或 `using` 声明引入。

### 6.5 ADL 与重载决议

ADL 只负责扩大候选集，选择仍由重载决议完成。ADL 找到的函数与普通查找找到的函数按同一套规则排序，不会因为来源不同而有优先级。ADL 的结果也可能与普通查找的结果冲突，此时由重载决议判断是否存在唯一最优候选。

---

## 7. 隐藏

### 7.1 内层隐藏外层

名字隐藏是作用域链的直接结果：内层声明一旦找到，外层同名声明不再参与。局部变量隐藏全局变量，内层命名空间的声明隐藏外层命名空间的声明，类成员隐藏命名空间中的同名声明。

隐藏与重载是两件事。被隐藏的声明不在查找结果中，重载决议看不到它们；`using` 声明是少见的、把被隐藏的名字重新带回同一作用域的手段。

### 7.2 类型名被其他声明隐藏

同一作用域中，如果查找同时找到类或枚举声明与其他声明，类与枚举声明被丢弃（[basic.lookup.general]/4）。变量因此可以隐藏类型名：

```cpp
struct widget {};
int widget;

struct widget w; // OK：elaborated-type-specifier 只查类型名
widget w2;       // 错误：widget 在这里是变量
```

elaborated-type-specifier 做 type-only 查找（[basic.lookup.elab]/1），所以 `struct widget w;` 仍能找到类。限定形式也做 type-only 查找（[basic.lookup.elab]/2）。同名 typedef 与底层类型同时被找到时，typedef 声明被丢弃，保留底层类型声明（[basic.lookup.general]/4）。

### 7.3 using 声明与 using-directive

`using N::x;` 是声明，它把名字引入当前作用域，参与隐藏与重载。`using namespace N;` 不是声明，它不引入名字，只改变查找路径（[namespace.udir]/4）。两者的区别在冲突时最明显：using 声明在同一作用域中引入一个实体，重复引入不同实体会报错；using-directive 让多个命名空间的名字并列，冲突留到使用处判断。

### 7.4 声明顺序

名字只在此前的程序点可见。函数声明之后才能调用，类声明之后才能定义对象。完整类上下文与模块导入是两条例外，前者让整个类的成员在类内任意位置可见，后者把导入的声明视为在程序点之前。

前置声明因此是控制可见性的基本工具。头文件中的声明顺序、`#include` 顺序与命名空间嵌套都会改变查找结果。

---

## 8. 模板中的查找

### 8.1 两阶段

模板的定义在实例化之前就要做语法与语义检查。为了同时支持这两步，标准把模板中的名字分成两类：非依赖名在定义期绑定，依赖名在实例化期查找（[temp.res.general]/1）。

```cpp
void f(int);

template<class T>
void g(T) {
    f(1); // 非依赖调用，定义期绑定到 f(int)
}

void f(double);

void h() {
    g(0); // 仍然调用 f(int)
}
```

后声明的 `f(double)` 不参与 `g` 中的调用，因为 `f(1)` 不依赖模板参数，在定义期就完成了查找。

### 8.2 依赖名与消歧

依赖名在实例化时查找，编译器在定义期无法判断它是类型、值还是模板。类型名需要 `typename`，模板名需要 `template`：

```cpp
template<class T>
void f() {
    typename T::type* p; // typename 表明 T::type 是类型
}
```

类型-only 上下文可以省略 `typename`（[temp.res.general]/5）。C++20 起，函数返回类型、形参声明、别名声明等位置都属于类型-only 上下文（P0634R3）：

```cpp
template<class T>
T::type f(); // C++20 起 OK，返回类型是类型-only 上下文
```

块作用域中的声明不属于类型-only 上下文，`T::type * p;` 仍按乘法解析，需要写 `typename`。

### 8.3 依赖基类

依赖基类的成员在定义期不可见。下面的 `f()` 不是依赖调用，普通查找找不到它：

```cpp
template<class T>
struct Base {
    void f();
};

template<class T>
struct D : Base<T> {
    void g() { f(); }       // 错误：依赖基类的成员不可见
    void h() { this->f(); } // OK
};
```

`this->f()` 把调用变成依赖表达式，查找推迟到实例化。`Base<T>::f()` 也有效，它直接限定查找上下文。依赖基类的名字不会进入派生类作用域，这是模板与普通继承的一个分界。

### 8.4 实例化期的 ADL

依赖调用的普通查找仍只在定义期进行，ADL 则在定义上下文与实例化上下文各做一次（[basic.lookup.argdep]/4）。因此实例化点之后声明的关联命名空间函数可以被找到：

```cpp
template<class T>
void h(T t) {
    f(t); // 依赖调用
}

struct X {};
void f(X);

void g() {
    h(X{}); // ADL 在实例化上下文找到 f(X)
}
```

如果完整考虑所有翻译单元中的外部声明会改变查找结果，程序 ill-formed, no diagnostic required（[temp.dep.candidate]/1）。这条规则把「实例化上下文之外还有别的候选」归为不可诊断的错误，工程上应当让依赖调用的候选在定义处或实参的关联命名空间中可见。

---

## 9. 特殊上下文

### 9.1 运算符表达式

运算符表达式不走普通函数调用的查找路径。候选集由四部分组成：左操作数类中的成员候选、非限定查找与 ADL 得到的非成员候选、内建候选、C++20 的改写候选（[over.match.oper]/3）。成员候选只从左操作数类型产生，非成员候选来自非限定查找与对两个操作数做的 ADL。

这解释了一个常见差异：`operator+(a, b)` 是普通调用，成员函数会隐藏外部同名函数；`a + b` 走运算符候选收集，即使类中有同名成员，也仍能找到外部重载。细节见[《C++ 的重载决议》](/post/2026/11/19/cpp-overload-resolution/)第 7 章。

### 9.2 友元

友元声明不向所在命名空间绑定名字（[basic.scope.pdecl]）。在类内定义的友元函数只能由 ADL 找到，这就是隐藏友元（hidden friend）的由来。把 `operator==`、`swap` 或 `operator<<` 写成隐藏友元，可以缩小候选集，避免隐式转换带来的意外匹配。

友元类声明不同：`friend class X;` 可以在最内层命名空间中声明 `X`，但该名字对普通查找不可见，直到同一命名空间中给出匹配的声明。

### 9.3 lambda

lambda 体是块作用域，外层作用域的名字按普通规则查找。被捕获的实体成为闭包对象的成员，在 lambda 体内按成员访问处理；没有被捕获的局部变量如果被 odr-use，程序 ill-formed。`this` 被捕获时，lambda 体内通过 `this` 访问外围类成员，查找上下文是外围类。

`[=]` 与 `[&]` 只改变捕获方式，不改变查找顺序。lambda 体内的名字仍先查 lambda 自身的形参与局部声明。

### 9.4 声明点的边界

结构化绑定的声明点位于标识符列表之后，绑定名在后续语句中可见。range-based for 的循环变量声明点在 range-initializer 之后，因此 range-initializer 中的同名名字指外层对象：

```cpp
int a[2] = {1, 2};

void f() {
    for (int a : a) { } // 范围表达式用外层 a
}
```

这类规则不影响查找模型，但会影响同名声明在循环头中的解释。

### 9.5 模块

模块改变的是声明的可见性，不是查找的顺序。导入的翻译单元中导出的声明，被视为在导入点之前出现（[basic.lookup.general]/2）。因此 `import` 之后的名字查找可以找到被导入模块导出的实体，未导出的实体不参与。

模块接口单元中的名字查找仍按本章的规则进行。模块分区、私有模块片段与头文件单元影响哪些声明可见，不影响非限定查找与限定查找的层次。

---

## 10. 诊断与工程实践

### 10.1 读诊断

查找失败的诊断通常比重载失败的诊断短，因为它还没有候选集可列。常见文本与含义如下：

| 诊断 | 含义 | 检查方向 |
| --- | --- | --- |
| use of undeclared identifier | 查找没有找到任何声明 | 声明点、作用域、拼写、头文件 |
| reference to name is ambiguous | 找到多个非函数声明 | 消除同名声明或改用限定名 |
| member found in multiple base classes | 类成员查找二义 | 加限定名、虚继承或调整层次 |
| no matching function for call | 查找成功，重载决议失败 | 候选集与转换，见重载决议 |
| no declarations were found by argument-dependent lookup | 依赖调用的 ADL 失败 | 关联命名空间、实例化上下文 |

第二条与第四条的区别是定位起点：前者在查找阶段就失败，后者已经拿到候选集。把这两类错误分开，可以避免在重载上反复调整却始终找不到声明。

### 10.2 设计准则

1. 让名字在尽量小的作用域中可见。局部变量、匿名命名空间与 `static` 函数都能减少查找冲突。
2. 派生类需要基类重载时写 `using Base::f;`。只声明一个同名函数会隐藏其余重载。
3. 隐藏友元只通过 ADL 调用，不要写限定形式；需要显式调用时，提供普通命名空间函数。
4. 泛型代码用 `using std::swap; swap(a, b);` 或 `std::ranges::swap`，不要直接限定 `std::swap`。
5. 依赖基类的成员用 `this->` 或基类限定访问，不依赖派生类作用域。
6. 依赖名按上下文补 `typename` 与 `template`，不要依赖编译器的宽容。
7. 避免变量名与类型名相同。类型名被隐藏后，可以用 elaborated-type-specifier 或另起别名恢复。
8. 头文件中按依赖顺序声明，前置声明优先于包含定义。
9. 模块边界只导出需要参与查找的名字，其余留在模块内部。
10. 出现二义时优先用限定名消解，不要通过调整重载或转换序列掩盖查找层的冲突。

### 10.3 常见误用

| 写法 | 结果 | 原因 | 修正 |
| --- | --- | --- | --- |
| 派生类只声明 `f(double)` | 基类 `f(int)` 不可见 | 同名声明隐藏整个重载集 | 加 `using Base::f;` |
| `std::swap(a, b)` 用于自定义类型 | 调用通用版本 | 限定调用不做 ADL | 先 `using std::swap;` 再无限定调用 |
| `f(s)` 前有块作用域 `void f(int);` | ADL 不启用 | 块作用域函数声明抑制 ADL | 移除局部声明或改限定调用 |
| 变量名与类名相同 | `widget w;` 无法声明对象 | 变量隐藏类型名 | 写 `struct widget w;` 或改名 |
| 依赖基类成员直接调用 | 找不到名字 | 依赖基类不在派生类作用域 | 写 `this->f()` |
| 模板中漏写 `typename` | 按非类型解析 | 依赖名无法在定义期判定 | 补 `typename` |
| 两个基类同名数据成员 | 访问二义 | 查找集无效或多子对象 | 限定到具体基类 |
| 限定调用隐藏友元 | 找不到函数 | 友元只由 ADL 可见 | 改为非限定调用 |

---

## 11. 版本演进

名字查找的模型在 C++98 就已基本定型，后续版本主要在边界与措辞上调整：

| 版本 | 变化 | 对查找的影响 |
| --- | --- | --- |
| C++98 | 非限定查找、限定查找、ADL 与依赖名规则成形 | 建立两阶段查找的基本框架 |
| C++11 | 右值引用、别名模板 | 查找规则未变，依赖名与别名场景增多 |
| C++20 | 模块、`using enum`、P0634R3 | 导入的声明参与查找；类型-only 上下文的 `typename` 可省 |
| C++23 | P1787R6 重写 [basic.scope] 与 [basic.lookup] | 段号与部分边界规则改变，整体模型不变 |

C++20 的模块是可见性层面的变化：查找顺序、隐藏规则与 ADL 都没有改，改变的是哪些声明算作「在程序点之前」。P0634R3 放宽 `typename` 的书写位置，减少了一类语法噪声，没有改变依赖名的查找时机。

P1787R6 是迄今规模最大的一次重写。它把作用域、声明点、隐藏与查找的措辞统一到「声明与查找位置」的框架下，引入 `precedes` 与 `reachable` 等术语，并调整了成员访问中限定名的查找上下文。阅读 C++20 及更早的草案时，同一规则可能位于不同段号。

---

## 12. 结论

名字查找可以压缩成一条链：程序点确定哪些声明可见，作用域链确定搜索顺序，限定与非限定形式确定搜索范围，类成员查找沿基类子对象合并声明，ADL 为函数调用补充关联命名空间，最后把重载集交给决议。

容易混淆的地方集中在三个分界。第一，查找与决议：查找决定「有哪些声明」，决议决定「调用哪一个」。第二，查找与访问：私有成员与删除函数都能被找到，错误在后续检查。第三，隐藏与重载：内层或派生类的同名声明直接隐藏外层声明，不会自动合并成一个重载集。

工程上最有效的做法是缩小作用域、显式引入需要的重载、给依赖名补足限定与 `typename`。这些做法不改变语言的查找规则，只是让规则的结果更容易预测。

---

## 参考

- 标准草案：[basic.lookup.general]、[class.member.lookup]、[basic.lookup.unqual]、[basic.lookup.argdep]、[basic.lookup.qual.general]、[namespace.qual]、[namespace.udir]、[basic.lookup.elab]、[basic.scope.pdecl]、[basic.scope.block]、[temp.res.general]、[temp.dep.candidate]、[over.match.oper]。
- 直达形式：<https://eel.is/c++draft/basic.lookup>、<https://eel.is/c++draft/class.member.lookup>、<https://eel.is/c++draft/basic.lookup.argdep>、<https://eel.is/c++draft/basic.lookup.qual>、<https://eel.is/c++draft/namespace.qual>、<https://eel.is/c++draft/basic.scope.pdecl>、<https://eel.is/c++draft/temp.res>、<https://eel.is/c++draft/temp.dep.candidate>。
- 提案与缺陷报告：P1787R6（声明与查找位置）、P0634R3（`typename` 在更多上下文中可省）。
- 次级资料：<https://en.cppreference.com/w/cpp/language/lookup>、<https://en.cppreference.com/w/cpp/language/unqualified_lookup>、<https://en.cppreference.com/w/cpp/language/qualified_lookup>、<https://en.cppreference.com/w/cpp/language/adl>、<https://en.cppreference.com/w/cpp/language/dependent_name>。
