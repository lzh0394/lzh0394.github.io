---
title: "std::unique_ptr 研究"
slug: "std-unique-ptr"
date: "2026-11-15"
tags: ["C++", "标准库", "unique_ptr", "RAII"]
series: "C++ 标准库"
series_order: 9
draft: false
summary: "以标准草案条款、WG21 提案与三家实现源码为证据，拆解 std::unique_ptr 的独占所有权模型、布局与空基类优化、数组特化与 make_unique 的边界：说明析构点为何要求完整类型、派生类到基类的转换为何依赖虚析构、删除器类型如何影响接口形状与 ABI，并给出工厂、PIMPL 与容器中的使用规则。"
---

## 0. 结论摘要

`std::unique_ptr` 的规范身份可以用一句话概括：它是一个只可移动的对象，持有一个指针，在自身析构时用绑定的删除器处置该指针。所有权语义、布局代价、接口形状都由这句话派生。

1. 运行时表示是一个指针加一个删除器。删除器为空类时经空基类优化不占空间，默认形式的对象大小与裸指针相同。标准不规定 `sizeof`，这一等式由三家实现共同维持，跨标准库实现不保证一致。
2. 析构点是唯一强制要求元素类型完整的位置。析构函数的效果等价于 `if (get()) get_deleter()(get())`（`[unique.ptr.single.dtor]/1`），而 `default_delete<T>::operator()` 的 Mandates 要求 `T` 完整（`[unique.ptr.dltr.dflt]/3`）。PIMPL 因此必须把析构函数与移动操作的定义放到类型完整处。
3. 删除器进入 `unique_ptr` 的类型，删除器自身的状态才进入对象。空删除器不占空间，函数指针删除器使对象大小翻倍，有状态删除器按状态大小增长；删除器类型不同就产生不同的 `unique_ptr` 类型，无法放进同一容器。
4. 派生类到基类的转换同时转换删除器，析构调用退化为对基类指针的 `delete`，基类析构非虚时是未定义行为。数组形式的转换被约束在元素类型一致的范围内，不存在派生类数组到基类数组的转换。
5. 工程规则可以收敛成四条：默认用 `std::make_unique` 构造；接口以 `T*` 或 `T&` 借用，以 `unique_ptr` 表达所有权转移；析构与移动操作在类型完整处定义；自定义删除器只在默认删除器不适用时使用。

---

## 1. 范围与口径

`std::unique_ptr` 定义在 `[unique.ptr]`，接口分布在两个类模板中：单对象形式在 `[unique.ptr.single]`，运行期长度数组形式在 `[unique.ptr.runtime]`。语义由三个量确定：持有的指针、处置指针的删除器、以及所有权只能通过移动转移这一约束。三者共同决定本文的讨论边界。

讨论范围包括：默认删除器与自定义删除器、两种形式的接口差异、布局与 `sizeof`、转换规则、析构点对类型完整性的要求、跨模块传递，以及与 `std::shared_ptr`、裸指针的分工。分配器协议见系列第 2 篇《标准库分配器的演化》，容器失效规则见第 4 篇《C++ vector 解析》，本文只在对比处引用。

### 1.1 证据分级与版本基准

本文用四类标记区分证据等级，正文按需标注：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | 工作草案的可观察要求 | `[unique.ptr.single.modifiers]/3` 规定 `reset` 的调用顺序 |
| [paper] | WG21 提案与修订 | N3656 为 C++14 加入 `make_unique` |
| [impl] | 标准库实现源码 | libstdc++ 的 `__uniq_ptr_impl` |
| [推断] | 由证据推出的工程判断 | 删除器类型进入接口会放大模块耦合 |

版本基准：标准侧以 eel.is 的 2026-11 草案快照为准，C++20 与 C++23 的措辞用 N4861、N4950 对照；实现侧对照 libstdc++ 16.2、MSVC STL 145 与 libc++ 的 main 分支。按实现引用时只写头文件名与类名，不写行号，因为行号随版本移动。

草案不是正式标准，正式文本是 ISO/IEC 14882。段号按上述快照引用，标准换版后可能位移。

### 1.2 不做什么

- 不做性能测量，也不给出计时数据；涉及成本的结论只描述结构，不描述绝对耗时。
- 不讨论 `auto_ptr` 的完整历史，只在说明独占所有权的来源时提一句。
- 不比较 Boost、folly、Abseil 的智能指针实现，除非某个选择需要参照。
- 不讨论分配器的完整协议，也不展开容器的异常保证。

---

## 2. 标准要求

### 2.1 独占所有权的规范表述

标准没有为 `unique_ptr` 写一段「所有权」定义；语义由三条可观察要求固定。第一，`unique_ptr<T, D>` 在 `T*` 不是有效类型时不能实例化（`[unique.ptr.single.general]/1`），因此 `unique_ptr<T&>` 与 `unique_ptr<int() const>` 都在编译期被排除。第二，删除器 `D` 必须是函数对象类型、函数左值引用或函数对象左值引用，且对 `D` 的值 `d` 与 `pointer` 的值 `ptr`，表达式 `d(ptr)` 必须有效并具有处置该指针的效果（`/2`）。第三，`D` 不是引用类型时须满足 `Cpp17Destructible`（`/3`）。

复制构造与复制赋值被删除，移动构造与移动赋值可用，移动后源对象的 `get()` 为空（`[unique.ptr.single.ctor]` 的后置条件）。这条后置条件把「移动」与「共享」区分开：移动完成后，同一对象只可能有一个所有者。`unique_ptr` 的不变量是「两个存活的 `unique_ptr` 不拥有同一对象」，标准通过删除复制操作与规定移动后置条件来维持它，没有引入运行期检查。

独占所有权的直接后果是接口形态：需要转移所有权的函数按值接收 `unique_ptr`，需要观察的函数接收 `T*` 或 `T&`，需要保留所有权的成员保存 `unique_ptr`。`std::shared_ptr` 的接口之所以不同，根源在于所有权可以分割，计数只是分割的实现手段。

### 2.2 删除器的要求

删除器在语义上是「如何释放」的载体，在实现上是一个可调用对象。标准对它的要求集中在四点：

- 类型形态：函数对象类型、函数左值引用或函数对象左值引用（`[unique.ptr.single.general]/2`）。
- 可调用性：`d(ptr)` 有效，且效果是处置指针。
- 可析构：`D` 不是引用类型时满足 `Cpp17Destructible`（`/3`）。
- 不抛异常：析构路径上删除器抛出异常时行为未定义（`[unique.ptr.single.dtor]/2`）；`reset` 的措辞给出同样的规定（`[unique.ptr.single.modifiers]/5`）。

引用型删除器用于共享删除器状态：`unique_ptr<T, D&>` 不复制删除器，`get_deleter()` 返回对同一左值的引用，因此删除器的生命周期由外部管理。这种形式的代价是对象里仍要保存一个引用，通常占一个指针宽度的空间。

删除器的移动与赋值跟随 `unique_ptr` 的移动与赋值：移动构造按 `D` 或 `E` 的值类别构造删除器，移动赋值把删除器赋值过去，`swap` 交换删除器。标准要求这些操作不抛异常，不满足时程序不符合要求，实现通常用 `static_assert` 拒绝。

### 2.3 指针类型与空值要求

`unique_ptr<T, D>::pointer` 不一定等于 `T*`：若 `remove_reference_t<D>::pointer` 有效，则取该类型，否则取 `T*`（`[unique.ptr.single.general]/4`）。这个指针类型须满足 `Cpp17NullablePointer` 要求，即能与 `nullptr` 比较、能默认构造为空值。

这条规定是为分配器指针留的接口。标准在 `/5` 的示例里明确写出：分配器的 `pointer`、`const_pointer`、`void_pointer` 都可以作为 `unique_ptr` 的指针类型。代价是 `get()`、`release()`、`reset()`、`operator->` 都使用这个类型，解引用需要解包装；分配器指针若比裸指针宽，`unique_ptr` 也随之变宽。本文其余部分假定指针类型是 `T*`。

### 2.4 接口语义

单对象形式的接口很短，语义集中在几个后置条件上：

| 成员 | 效果 | 约束与异常 |
| --- | --- | --- |
| 默认构造 | 存空指针，值初始化删除器 | `noexcept`，要求 `D` 可默认构造且不抛 |
| 指针构造 | 接管 `p`，值初始化删除器 | `noexcept`，同上 |
| 移动构造 | 转移指针与删除器，源置空 | `noexcept`，要求 `D` 可移动构造且不抛 |
| 移动赋值 | 先 `reset(u.release())`，再赋值删除器 | `noexcept`，要求 `D` 可移动赋值且不抛 |
| 析构 | `if (get()) get_deleter()(get())` | 删除器抛异常则未定义 |
| `release` | 返回旧指针并把存储指针置空 | `noexcept` |
| `reset(p)` | 存 `p`，再以旧值调用删除器 | 删除器抛异常则未定义 |
| `swap` | 交换指针与删除器 | 要求删除器可交换且交换不抛 |

`reset` 的措辞需要单独说明：先把 `p` 写入存储，再以旧值 `old_p` 调用删除器，标准用注说明顺序重要，因为删除器可能销毁 `*this`（`[unique.ptr.single.modifiers]/3`）。删除条件只有「旧值非空」，没有「旧值不等于新值」这一项，第 5.3 节据此说明 `reset(get())` 的后果。

转换构造与转换赋值的约束也写在条款里：`unique_ptr<U, E>::pointer` 须可隐式转换到 `pointer`，`U` 不是数组类型，且 `D` 为引用时 `E` 与 `D` 同型、`D` 非引用时 `E` 可隐式转换到 `D`（`[unique.ptr.single.ctor]`）。转换只改变删除器的静态类型，析构时执行的是转换后的 `D`，这是第 5.2 节讨论的基点。

### 2.5 数组特化

`unique_ptr<T[], D>` 是偏特化，接口与单对象形式有五处差异（`[unique.ptr.runtime]/1`）：

- 与指针到数组类型不一致的转换、以及与单对象形式之间的互转，都使程序不符合标准。
- 构造函数与 `reset` 拒绝指向 `T` 派生类的指针。
- 不提供 `operator*` 与 `operator->`。
- 提供 `operator[]`，前置条件为下标小于元素个数。
- 默认删除器调用 `delete[]`。

数组形式还多一条要求：模板参数 `T` 须是完整类型（`[unique.ptr.runtime]/3`）。单对象形式允许不完整类型，数组形式不允许，原因是 `delete[]` 需要元素大小与数组 cookie 的信息。

转换约束的措辞是 `V(*)[]` 可转换到 `element_type(*)[]`。数组类型之间不存在派生类到基类的转换，因此这个约束实际只放行元素类型相同、仅 cv 限定不同的情形，例如 `unique_ptr<int[]>` 到 `unique_ptr<const int[]>`。

### 2.6 空状态

`unique_ptr` 的空状态由空指针表示，没有独立的 engaged 标志。由此得到三条可观察结论。

析构只在指针非空时调用删除器。删除器若承担「必须在空句柄上执行」的清理工作，例如释放与句柄绑定的锁或关闭一个允许空值的句柄，`unique_ptr` 不会代为执行。

`operator bool` 等价于 `get() != nullptr`。判断是否持有对象用 `if (p)` 或 `if (p != nullptr)`，不需要与 `nullptr` 之外的值比较。

空指针可以带非空删除器。`unique_ptr<T> p(nullptr, deleter)` 合法，析构时删除器不被调用，删除器自身的状态仍随对象销毁。

---

## 3. 对象模型与布局

### 3.1 两个字段

`unique_ptr` 在逻辑上只有一个指针，在实现上需要保存指针与删除器两个值。删除器为空类时，两个值可以共享同一块存储；删除器有状态时，对象大小随状态增长。这个结构决定了三件事：对象的 `sizeof`、移动的代价、以及能否作为常量表达式的一部分。

移动 `unique_ptr` 不触碰被管理对象，只复制指针与删除器并把源置空。这一点与 `std::shared_ptr` 的移动相同，与 `std::vector` 的移动不同：后者转移的是缓冲区，代价同样是常数时间，但涉及三个字段。

### 3.2 空基类优化与 sizeof

空基类优化（empty base optimization）允许空类作为基类时不占空间。删除器为空类时，实现把它放进基类或压缩对中，指针成为唯一占空间的字段。常见删除器的对比如下，具体数值由实现定义，下表按 64 位平台的一般情形列出：

| 删除器 | 存储内容 | 典型 `sizeof` |
| --- | --- | --- |
| `default_delete<T>` | 指针 | 8 |
| 无捕获 lambda | 指针 | 8 |
| 函数指针 `void(*)(T*)` | 指针与函数指针 | 16 |
| 有状态函数对象 | 指针与状态 | 8 加状态大小 |
| `std::function` | 指针与函数对象 | 由实现定义，可能更大 |

函数指针删除器占两倍空间的原因与优化无关：函数指针不是空类，无法压缩。`std::function` 删除器把类型擦除的代价转成对象体积与可能的堆分配，换来统一的 `unique_ptr` 类型。

`sizeof` 不是标准规定的内容，标准只要求行为。跨标准库实现传递 `unique_ptr` 时，布局差异会直接表现为二进制不兼容，这也是第 5.6 节讨论的前提。

### 3.3 引用型删除器与不可复制性

`D` 为左值引用时，删除器不归 `unique_ptr` 所有：`get_deleter()` 返回外部对象，移动与复制都只传递引用。这种形式适合删除器携带昂贵状态、或删除器本身不可复制的场景。代价是对象里仍要保存引用，且删除器的生命周期必须长于 `unique_ptr`。

`unique_ptr` 不是平凡可复制类型，复制构造与复制赋值被删除。把它作为成员时，类的复制构造与复制赋值随之被删除；移动操作是否隐式生成，取决于类是否声明了析构函数或复制操作。声明析构函数会抑制隐式移动构造，这条规则在第 5.1 节与 PIMPL 一起说明。

### 3.4 const、引用与接口差异

`const unique_ptr<T>` 的常量性作用于指针本身，不作用于被管理对象：`operator*` 返回 `T&`，声明中写作 `add_lvalue_reference_t<T>`，与 `T* const` 的读法一致。要禁止修改被管理对象，用 `unique_ptr<const T>`，此时 `operator*` 返回 `const T&`。

`reset`、`release`、`swap` 不是 const 成员，因此 `const unique_ptr<T>` 只能观察，不能改绑。这一点常被误认为「const 的智能指针连对象也不能改」，实际不是。

引用类型不能作为模板参数。`unique_ptr<T&>` 在 `T*` 不是有效类型时被排除（`[unique.ptr.single.general]/1`）。需要表达「不拥有但可重绑定的引用」时，用裸指针或 `std::reference_wrapper`，不要试图给 `unique_ptr` 传引用类型。

数组形式在观察接口上更窄：没有 `operator*` 与 `operator->`，只有 `operator[]` 与 `get()`。这意味着泛型代码不能对两种形式使用同一套解引用写法，需要按 `is_array_v<T>` 分支，或统一改用 `get()` 加下标。

---

## 4. 三家实现

### 4.1 libstdc++

libstdc++ 在 `bits/unique_ptr.h` 中定义 `default_delete`、`__uniq_ptr_impl` 与两个 `unique_ptr` 形式。`__uniq_ptr_impl<T, D>` 用 `std::tuple<pointer, D>` 保存两个字段，`_M_ptr()` 与 `_M_deleter()` 通过 `std::get` 取出；`unique_ptr` 以该实现类作为成员，`get_deleter()` 转发到 `_M_deleter()`。

空删除器的压缩由 `std::tuple` 完成：libstdc++ 的 `tuple` 对空元素套用空基类优化，空删除器因此不增加对象大小。这个选择把布局责任交给 `tuple` 的实现，`unique_ptr` 本身不写压缩对。

`default_delete<T>::operator()` 里有 `static_assert`，要求 `sizeof(T) > 0`，错误消息为 `can't delete pointer to incomplete type`。这条断言把「析构要求完整类型」从文档约定变成编译错误，触发点是 `unique_ptr` 析构函数实例化的位置。

### 4.2 MSVC STL

MSVC STL 在 `stl/inc/memory` 中定义 `unique_ptr`，结构是 `_Unique_ptr_base<T, D, _Compressed_pair<D, T*>>`。删除器放在压缩对的第一位，空删除器经空基类优化被压缩；`get_deleter()` 返回压缩对的第一成员，指针是第二成员。

`_Compressed_pair` 是 MSVC 的通用工具，也用于容器保存分配器与指针。把删除器放第一位、指针放第二位，使得空删除器时对象大小等于一个指针，与指针放在第一位的写法结果相同，区别在于访问成员的名字。

`default_delete` 同样用 `static_assert` 要求类型完整，消息为 `can't delete an incomplete type`。MSVC 的调试容器会因迭代器代理而变大，`unique_ptr` 没有迭代器，调试档不改变其布局。

### 4.3 libc++

libc++ 在 `__memory/unique_ptr.h` 中定义 `__uniq_ptr_impl<T, D>`，字段是一个 `__compressed_pair<pointer, D>`；`__uniq_ptr_data` 在这个压缩对上增加构造、移动与交换，`unique_ptr` 继承 `__uniq_ptr_data`。这一层拆分把布局固定在 `__uniq_ptr_data` 上，成员函数可以在此之上调整。

libc++ 另有一个 ABI 开关：定义 `_LIBCPP_ABI_ENABLE_UNIQUE_PTR_TRIVIAL_ABI` 后，`unique_ptr` 被标记为 `[[clang::trivial_abi]]`，按值传递时直接传递对象本身，不再经由隐式引用。这个开关改变调用约定，也改变调用边界上的析构时点。libc++ 的测试 `unique_ptr_arg.pass.cpp` 用副作用记录了差异：未开启时，作为实参的临时 `unique_ptr` 在整条表达式结束时析构；开启后，析构发生在被调函数返回之前。这类差异属于实现定义的行为，同一二进制内必须统一开关。

### 4.4 make_unique 的实现

`make_unique` 在 `[unique.ptr.create]` 中只有一行效果：`unique_ptr<T>(new T(std::forward<Args>(args)...))`。三家实现的写法与此一致，没有额外机制。

数组版本的效果是 `unique_ptr<T[]>(new remove_extent_t<T>[n]())`，末尾的括号表示值初始化，因此 `make_unique<int[]>(n)` 得到的元素全为零。不需要初始化时用 C++20 的 `make_unique_for_overwrite`，它的效果是 `new remove_extent_t<T>[n]`，元素不被初始化。

构造失败时不会泄漏：`new` 表达式在 `T` 的构造函数抛出异常时自行释放存储，`unique_ptr` 尚未接管，也没有其他需要清理的状态。

`make_unique` 不接受删除器参数，也不接受分配器。需要自定义删除器时只能直接构造：

```cpp
struct FileCloser {
  void operator()(std::FILE* f) const noexcept {
    if (f) std::fclose(f);
  }
};
using FilePtr = std::unique_ptr<std::FILE, FileCloser>;

FilePtr open(const char* path) {
  return FilePtr(std::fopen(path, "r"), FileCloser{});
}
```

### 4.5 三家实现对照

| 维度 | libstdc++ | MSVC STL | libc++ |
| --- | --- | --- | --- |
| 存储 | `tuple<pointer, D>` | `_Compressed_pair<D, T*>` | `__compressed_pair<pointer, D>` |
| 空删除器压缩 | 由 `tuple` 完成 | 由 `_Compressed_pair` 完成 | 由 `__compressed_pair` 完成 |
| 完整类型检查 | `static_assert` | `static_assert` | `static_assert` |
| 调用约定开关 | 无 | 无 | `_LIBCPP_ABI_ENABLE_UNIQUE_PTR_TRIVIAL_ABI` |

三家在标准语义上一致，差异集中在布局细节与 ABI 开关。跨实现交换 `unique_ptr` 对象不可行，跨实现交换裸指针则需要保证释放逻辑落在正确的模块，第 5.6 节展开。

---

## 5. 陷阱与取舍

### 5.1 不完整类型与析构点

`unique_ptr<T>` 允许 `T` 不完整，这是 PIMPL 的基础。限制出现在需要删除器的成员上：析构函数、`reset`、移动赋值都会调用删除器，而 `default_delete<T>::operator()` 的 Mandates 要求 `T` 完整（`[unique.ptr.dltr.dflt]/3`）。因此类内声明 `unique_ptr<Impl>` 成员时，析构函数必须由使用者声明并在实现文件中定义：

```cpp
// widget.h
class Widget {
public:
  Widget();
  ~Widget();
  Widget(Widget&&) noexcept;
  Widget& operator=(Widget&&) noexcept;
private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
```

```cpp
// widget.cpp
struct Widget::Impl { std::vector<int> data; };

Widget::Widget() : impl_(std::make_unique<Impl>()) {}
Widget::~Widget() = default;
Widget::Widget(Widget&&) noexcept = default;
Widget& Widget::operator=(Widget&&) noexcept = default;
```

移动构造与移动赋值也要在实现文件中定义：移动赋值会先销毁原有的 `Impl`，同样需要完整类型。若在头文件里写 `~Widget() = default;`，析构函数的定义点落在头文件，`Impl` 不完整，编译失败。

数组形式没有这条余地：`T` 须完整（`[unique.ptr.runtime]/3`），`unique_ptr<Impl[]>` 不能作为不完整类型的成员。

`std::shared_ptr` 的规则不同。删除器在构造时被类型擦除并存入控制块，析构时不需要 `T` 完整，因此 PIMPL 里的 `shared_ptr<Impl>` 可以在头文件默认析构。代价是控制块、原子计数与一次额外分配。选择的依据是所有权是否需要共享，析构的便利性不构成理由。

### 5.2 派生类到基类：切片与虚析构

`unique_ptr<Derived>` 可以隐式转换为 `unique_ptr<Base>`：指针类型可转换，删除器 `default_delete<Derived>` 也可转换到 `default_delete<Base>`，后者的约束是 `Derived*` 可隐式转换到 `Base*`（`[unique.ptr.dltr.dflt]/1`）。转换之后，析构时执行的是对 `Base*` 的 `delete`。

若 `Base` 的析构函数不是虚函数，通过基类指针删除派生对象是未定义行为。转换本身不报错，错误发生在析构点，且通常只在派生类持有资源时暴露。让基类析构函数为虚，或让工厂返回 `unique_ptr<Derived>` 而不提前转换，是两种可行做法。

转换还会丢失派生类型的接口。若调用方需要派生类成员，保存 `unique_ptr<Derived>`，或在基类提供虚函数；转换到基类后再 `static_cast` 回来属于依赖外部约定，与所有权语义无关，风险由调用方承担。

指针转换本身不产生切片：被管理对象仍是完整的派生类对象。切片发生在按值取用被管理对象时，例如 `Base b = *p;` 只复制基类子对象，派生类的成员被丢弃。要保留派生部分，按引用或指针取用，不按值复制。

数组形式的约束更紧：构造函数与 `reset` 拒绝派生类指针（`[unique.ptr.runtime]/1`），数组之间也不存在派生类到基类的转换。这与 `delete[]` 的语义一致：通过基类指针删除派生类数组，即使析构函数虚，元素大小与数组 cookie 也不匹配。

### 5.3 release 与 reset

`release` 只放弃所有权，不释放对象。返回值未被接管即泄漏，这是 `release` 最常见的误用。需要把裸指针交给 C 接口时，接回 `unique_ptr` 或显式删除，两条路径都应在代码中显式处理。

`reset` 的删除条件是旧指针非空，不比较新值：

```cpp
std::unique_ptr<T> p(new T);
p.reset(p.get());   // 存储指针不变，旧值仍被删除
```

标准的效果描述是先写入 `p`，再以旧值调用删除器（`[unique.ptr.single.modifiers]/3`）。旧值等于 `p` 时，删除器仍然执行，对象被销毁，`p` 悬垂。重置为空应写 `p.reset()`；以同一指针重建没有安全的成员写法。

`p.reset(q.get())` 是另一类错误：`q` 仍持有该指针，两个所有者会各删除一次。所有权只能单向移动，`reset` 不检查指针的来源。

`get()` 只用于观察。返回的指针不应被 `delete`，也不应交给另一个 `unique_ptr` 接管，否则同一对象会出现两个所有者。`swap` 的前提是双方删除器可交换且交换不抛，满足这一前提时它只交换字段，不触碰被管理对象。

自移动赋值是安全的：效果是 `reset(u.release())`，`release` 先把存储指针置空，`reset` 看到的旧值为空，不调用删除器。标准把 `u.get() == nullptr` 的后置条件限定在 `this != addressof(u)`（`[unique.ptr.single.asgn]/4`），与这一执行顺序吻合。

### 5.4 删除器的形态与代价

删除器的形态直接影响接口与体积，选择可以按三类判断。

无状态函数对象是最常用的一类，包括 `default_delete` 与无捕获 lambda。它们不占空间，但每个 lambda 表达式有独立类型，两个写法相同的 lambda 也是不同类型，因此不能混入同一容器。需要统一类型时，改用函数指针或 `std::function`。

函数指针删除器占两倍空间，换来可复制的统一类型。它有一个容易忽略的性质：函数指针可默认构造为空值，`unique_ptr<T, void(*)(T*)>` 的默认构造函数因此可用，删除器为空。默认构造之后再 `reset` 一个指针，析构时会调用空函数指针。使用这种形式时应在构造时就提供删除器，并避免默认构造。

`std::function` 删除器把类型擦除引到删除器上，体积与可能的堆分配是代价，收益是任意删除器都能存进同一个 `unique_ptr` 类型。若删除器不需要在运行期更换，函数指针或无状态函数对象更直接。

### 5.5 const、引用与函数接口

函数参数的选择反映所有权意图，三种写法含义不同：

| 写法 | 含义 | 适用 |
| --- | --- | --- |
| `f(std::unique_ptr<T>)` | 接管所有权 | 工厂、容器插入 |
| `f(T*)` 或 `f(T&)` | 借用，不涉及所有权 | 大多数观察型接口 |
| `f(const std::unique_ptr<T>&)` | 观察所有权对象本身 | 需要访问删除器或判空 |

第三种写法常被用来表达「不取得所有权」，但它接受临时对象，也把调用方绑定到 `unique_ptr` 这一具体类型。接口若只需要对象，用 `T&`；若需要允许空值，用 `T*`。`const unique_ptr<T>&` 的合理用途是确实需要 `get_deleter()` 或整体判空的场景。

### 5.6 ABI 与跨模块

`unique_ptr` 是类模板，没有独立的库符号，布局由实现决定。跨标准库实现传递对象不可行：libstdc++ 的 `tuple` 布局、MSVC 的压缩对布局、libc++ 的 `__uniq_ptr_data` 布局互不相同。

跨模块传递 `unique_ptr` 的关键在析构点。对象在模块 A 中构造，`unique_ptr` 在模块 B 中被销毁时，删除器在 B 中实例化。若 A 与 B 使用不同的运行时（例如 MSVC 下 `/MT` 与 `/MD` 混用），堆的实现不同，`delete` 落在错误的堆上，表现为崩溃或静默损坏。

可行的做法有三条：让两侧共享同一运行时；由构造方导出销毁函数，调用方以函数指针作为删除器；或以抽象接口加虚析构代替跨模块的 `unique_ptr` 成员。三条做法都把「谁分配、谁释放」固定在同一个模块内。

libc++ 的 `trivial_abi` 开关属于另一类 ABI 风险：它改变调用约定，开启与未开启的目标文件不能混链。这类开关与 `_GLIBCXX_DEBUG`、`_ITERATOR_DEBUG_LEVEL` 同属「同一程序必须统一」的配置项。

### 5.7 与 shared_ptr、裸指针的对比

| 维度 | `unique_ptr` | `shared_ptr` | 裸指针 |
| --- | --- | --- | --- |
| 大小 | 一个指针（空删除器） | 两个指针 | 一个指针 |
| 所有权 | 独占，可移动 | 共享，引用计数 | 无 |
| 删除器 | 类型的一部分 | 类型擦除，构造时绑定 | 无 |
| 复制 | 禁止 | 允许，计数原子更新 | 允许 |
| 析构点类型完整性 | 需要完整类型 | 不需要 | 不适用 |

选择规则由此确定：所有权唯一时用 `unique_ptr`，需要共享时用 `shared_ptr`，只借用时用裸指针或引用。`unique_ptr` 到 `shared_ptr` 的转换是单向的，转换后独占语义消失，删除器被移入控制块。反向转换不存在，因为共享所有权无法退回独占。

---

## 6. 演进

### 6.1 C++11 的起点

`unique_ptr` 随 C++11 的移动语义进入标准，取代被弃用的 `auto_ptr`。两者的差别主要在所有权模型：`auto_ptr` 的复制构造执行转移，复制语义与转移语义混在一起，放进容器或按值传递时行为难以预测；`unique_ptr` 把转移交给移动构造，复制被删除，误用在编译期暴露。

同一轮还引入了 `default_delete` 与数组特化。数组特化把「用 `delete[]` 释放」编码进类型，避免单对象形式误删数组。

### 6.2 make_unique 与求值顺序

C++14 通过 N3656 加入 `make_unique`。动机有三条：消除 `new` 与类型名的重复、让所有权在构造点就明确、以及在复合表达式中避免泄漏。

第三条需要解释。C++17 之前，函数实参的求值顺序未指定，`f(std::unique_ptr<T>(new T), g())` 中若 `g()` 先求值并抛出异常，`new T` 分配的对象没有所有者，泄漏。`make_unique` 把分配与接管放进同一个函数调用，泄漏窗口消失。C++17 的 P0145R3 规定了实参的求值顺序为不确定顺序，同类表达式不再有泄漏窗口，但 `make_unique` 的可读性优势仍然存在。

### 6.3 常量求值与 C++23

C++20 的 P0784R7 允许在常量求值中动态分配并引入 constexpr 析构函数，为智能指针的常量求值铺路。C++23 的 P2273R3 把 `unique_ptr` 的构造、析构、观察器与修改器全部标为 `constexpr`，当前草案的类摘要因此每个成员都带 `constexpr`。

常量求值中的分配在求值结束时回收，`constexpr` 的 `unique_ptr` 只能存在于常量表达式内部，不能作为运行期对象带出。这个限制与 `constexpr vector` 相同。

C++20 的 P1614R2 为 `unique_ptr` 增加了 `<=>`；C++23 的 P1132R8 加入 `std::out_ptr` 与 `std::inout_ptr`。后者用于把 `unique_ptr` 适配到以 `T**` 出参的 C 接口，避免手工 `release` 与重新接管。

### 6.4 版本表与未决问题

| 版本 | 与 `unique_ptr` 相关的变化 |
| --- | --- |
| C++11 | 引入 `unique_ptr` 与数组特化，`auto_ptr` 弃用 |
| C++14 | `make_unique`（N3656） |
| C++17 | 实参求值顺序（P0145R3），`auto_ptr` 移除 |
| C++20 | `make_unique_for_overwrite`（P1020R1）、`<=>`（P1614R2）、常量求值基础（P0784R7） |
| C++23 | 全部成员 `constexpr`（P2273R3）、`out_ptr` 与 `inout_ptr`（P1132R8） |

标准库只有 `allocate_shared`，没有对应的 `allocate_unique`；分配器感知的独占指针需要自行以自定义删除器包装。本文引用的草案快照中，`[unique.ptr]` 的成员与 C++23 一致，没有新增接口。

---

## 7. 工程用法

### 7.1 工厂函数

工厂返回 `unique_ptr` 表示所有权转移，调用方无需关心释放。返回派生类时，直接返回 `unique_ptr<Derived>`，需要基类接口时再隐式转换；转换点越靠后，可用的类型信息越多。

```cpp
std::unique_ptr<Widget> make_widget(int kind) {
  if (kind == 0) return std::make_unique<Button>();
  return std::make_unique<Label>();
}
```

返回 `unique_ptr` 的函数天然支持移动语义，不必为返回值写 `std::move`：返回值是右值，隐式移动即可。

### 7.2 PIMPL

PIMPL 用 `unique_ptr` 持有实现，头文件只暴露不完整类型，编译依赖与对象布局都随之收敛。代价是析构、移动构造、移动赋值必须在实现文件中定义，理由见第 5.1 节。若实现类需要多态，可以在 `Impl` 内部使用虚函数，外层仍保持值语义。

与 `shared_ptr` 的 PIMPL 相比，`unique_ptr` 版本的对象大小是一个指针，没有控制块与原子计数，复制被禁止；需要可复制的句柄时，改为 `shared_ptr` 或自行实现引用计数。

### 7.3 容器与算法

`vector<unique_ptr<T>>` 把「地址稳定」与「连续存储」分开：元素本身在堆上，容器只保存指针。多态对象集合需要值语义容器时，这是标准库内的常规写法。代价是每次访问多一次间接，元素分散在堆上，缓存局部性弱于 `vector<T>`。

排序与查找要注意比较的对象。`unique_ptr` 的 `<` 比较指针值，用 `std::less` 保证严格弱序（`[unique.ptr.special]/6、/7`），对无关指针也成立。按被管理对象排序必须传比较器：

```cpp
std::sort(v.begin(), v.end(),
          [](const auto& a, const auto& b) { return *a < *b; });
```

关联容器中用 `try_emplace` 插入 `unique_ptr`，避免先构造再移动；`operator[]` 要求映射类型可默认构造，`unique_ptr` 满足这一条，但对已存在的键赋值会销毁原对象。

### 7.4 与 C 接口互操作

C 接口的出参是 `T**`。直接传 `&p` 不可行，`unique_ptr` 没有暴露内部指针的地址。常规写法是先声明裸指针，调用后接管：

```cpp
T* raw = nullptr;
if (create(&raw) != 0) return;
std::unique_ptr<T, Deleter> p(raw, Deleter{});
```

C++23 的 `std::out_ptr` 把这段样板封装成适配器，`std::inout_ptr` 处理「传入既有指针、返回可能替换的指针」的情形。两者都只在调用点临时存在，不改变 `unique_ptr` 的类型。

---

## 8. 结论

`unique_ptr` 的规范文本很短，行为由三个量决定：指针、删除器、移动即转移。布局、接口、异常规格都可以从这三个量推出。

可执行的规则有五条：

1. 默认用 `std::make_unique`，需要自定义删除器或接管已有指针时直接构造 `unique_ptr`。
2. 析构、移动构造、移动赋值在类型完整处定义；PIMPL 的头文件只声明，不默认。
3. 接口以 `T*` 或 `T&` 借用，以按值 `unique_ptr` 表达接管，不用 `const unique_ptr<T>&` 代替借用。
4. 转换到基类之前确认基类析构函数为虚；数组形式不与基类混用。
5. 删除器优先选无状态函数对象；需要统一类型时用函数指针或 `std::function`，并注意函数指针删除器可默认构造为空值。

独占所有权是 C++ 资源管理的默认形态。共享与借用都是在它之上的补充，把默认形态用对，多数资源泄漏与重复释放问题在编译期就被排除。

---

## 参考

- 标准草案：`[unique.ptr]`、`[unique.ptr.single]`、`[unique.ptr.single.general]`、`[unique.ptr.single.ctor]`、`[unique.ptr.single.dtor]`、`[unique.ptr.single.asgn]`、`[unique.ptr.single.observers]`、`[unique.ptr.single.modifiers]`、`[unique.ptr.runtime]`、`[unique.ptr.runtime.ctor]`、`[unique.ptr.runtime.observers]`、`[unique.ptr.dltr.general]`、`[unique.ptr.dltr.dflt]`、`[unique.ptr.dltr.dflt1]`、`[unique.ptr.create]`、`[unique.ptr.special]`。
- 直达形式：<https://eel.is/c++draft/unique.ptr.single.general>、<https://eel.is/c++draft/unique.ptr.single.ctor>、<https://eel.is/c++draft/unique.ptr.single.dtor>、<https://eel.is/c++draft/unique.ptr.single.asgn>、<https://eel.is/c++draft/unique.ptr.single.modifiers>、<https://eel.is/c++draft/unique.ptr.runtime>、<https://eel.is/c++draft/unique.ptr.dltr.dflt>、<https://eel.is/c++draft/unique.ptr.create>、<https://eel.is/c++draft/unique.ptr.special>。
- 历史草案：N4861（C++20）、N4950（C++23），取自 cplusplus/draft 对应标签，用于对照措辞与段号变化。
- 提案：N3656（`make_unique`）、P0145R3（Refining Expression Evaluation Order for Idiomatic C++）、P0784R7（More constexpr containers）、P1020R1（Smart pointer creation with default initialization）、P1132R8（`out_ptr`）、P1614R2（Adding `<=>` to the library）、P2273R3（Making `std::unique_ptr` constexpr）。
- 实现源码：libstdc++ 16.2 的 `bits/unique_ptr.h`；MSVC STL 145 的 `stl/inc/memory`；libc++ 的 `libcxx/include/__memory/unique_ptr.h` 与测试 `libcxx/test/libcxx/memory/trivial_abi/unique_ptr_arg.pass.cpp`。
- 源码入口：<https://github.com/gcc-mirror/gcc/blob/master/libstdc++-v3/include/bits/unique_ptr.h>、<https://github.com/microsoft/STL/blob/main/stl/inc/memory>、<https://github.com/llvm/llvm-project/blob/main/libcxx/include/__memory/unique_ptr.h>。
- 标准库文档：<https://en.cppreference.com/w/cpp/memory/unique_ptr>、<https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique>、<https://en.cppreference.com/w/cpp/memory/default_delete>、<https://en.cppreference.com/w/cpp/memory/out_ptr_t/out_ptr>。
