---
title: "C++ 多态"
slug: "cpp-polymorphism"
date: "2026-10-14"
tags: ["C++", "对象模型"]
draft: false
summary: "以标准条款为准梳理 C++ 运行期多态：虚函数的定义与重写条件、override/final、静态类型决定名字与访问与默认实参而动态类型决定实际调用、final overrider 与多继承歧义、构造析构期间的派发限制、抽象类与纯虚函数、虚析构与 delete、typeid 与 dynamic_cast，并区分标准规定与 vptr/vtable/去虚化这类实现行为。"
---

「多态」在 C++ 里不是一件事，而是一组机制：重载在编译期按实参挑选函数，模板在编译期按类型实例化，虚函数在运行期按对象的动态类型挑选函数体，类型擦除则在运行期把具体类型藏起来。它们的实现方式、出错方式、能解决的问题都不一样，混在一起讲必然讲不清。

这篇只处理标准的 `[class.virtual]` 那一套——运行期子类型多态，也叫动态绑定。效力边界先说清楚：条条款款以当前工作草案（<https://eel.is/c++draft/>）为准，涉及版本差异的地方单独标出。vptr、vtable、thunk、去虚化这些词在标准里统统不存在，它们出现在「实现」一节，且明确标为实现行为。

---

## 1. 先把术语钉死

标准给运行期多态关涉的每个概念都起了名字，误解基本都来自没区分这些名字。

- 多态类（polymorphic class）：含至少一个虚函数的类。`dynamic_cast`、`typeid` 的动态行为，以及「动态类型」这个概念，都只对多态类成立（`[class.virtual]`/1）。
- 虚函数（virtual function）：非静态成员函数，且要么首次用 `virtual` 声明，要么它重写了基类的虚函数（`[class.virtual]`/1）。注意后半句——虚函数是继承来的属性，派生类里的重写函数不写 `virtual` 也是虚函数；反过来，在重写声明里再写一次 `virtual` 是合法的但语义为空（脚注 85）。
- 重写（override）：派生类的声明与基类某虚函数的声明「对应」（`corresponds`，见 `[basic.scope.scope]`），忽略尾随 requires-clause（`[class.virtual]`/2）。注意重写判定不考虑访问控制：基类私有虚函数照样能被重写（脚注 87）。
- final overrider（最终覆盖者）：类对象 S 的虚函数 V 是 final overrider，除非 S 作为基类子对象所属的最派生类里有另一个函数重写了 V。同一个虚函数若有两个不同的 final overrider，程序 ill-formed（`[class.virtual]`/2）。
- 虚函数调用（virtual function call）：被选中函数是虚函数，且类成员访问用的是非限定 id 时，实际调用的是该对象表达式的动态类型里的 final overrider，这样的调用叫虚函数调用（`[expr.call]`/2）。
- 静态类型 / 动态类型：静态类型是表达式写出来的类型；动态类型是对象表达式当前值所指对象的类型（`[expr.call]`/2 注 2）。

最后一组是全文的支点：一次成员函数调用里，编译期用静态类型决定「叫哪个名字」，运行期用动态类型决定「执行哪个函数体」。这两件事独立，各自出错的方式也完全不同。

---

## 2. 一次 `p->f(x)` 到底发生了什么

把它拆成五步，每一步依据什么类型都能对上条款。

1. 名字查找与重载解析：用 `p` 的静态类型，在编译期完成，选定一个「静态选中的函数」。
2. 访问检查：在调用点、用表达式所指对象的类型来做（`[class.access.virt]`/2）。派生类把重写函数设成 private 并不妨碍通过基类指针调用它——因为检查时根本不知道、也不需要知道派生类里那份的访问权限（`[class.access.virt]`/1）。
3. 默认实参：虚函数调用取的是静态类型里那份声明的默认实参；派生类的重写函数不会从被重写函数那里继承默认实参（`[dcl.fct.default]`/10）。
4. 返回类型：函数调用表达式的类型是静态选中函数的返回类型，忽略 `virtual`，即使实际执行的函数返回类型不同（`[expr.call]`/4）。协变返回的情况下，运行期把实际结果转换成静态选中函数的返回类型（`[expr.call]`/9）。
5. 实际执行谁：如果静态选中的函数是虚函数、且调用没有被限定，则调用动态类型中的 final overrider（`[expr.call]`/2）。

把这几条摆在一起，几个经典现象就不再是「坑」，而是直接推论：

- 派生类里写成 `void f(int)` 而基类是 `void f()`，那不是重写而是隐藏。派生类的这个声明把基类所有同名函数都挡住了，名字查找根本不会找到基类那份。标准对此专门给了一个例子：`struct B { virtual void f(); }; struct D : B { void f(int); }; struct D2 : D { void f(); };` 里 `D::f(int)` 不是虚函数，而 `D2::f()` 照样重写了 `B::f()`——即使 `B::f` 在 `D2` 里不可见（`[class.virtual]`/3 注 2）。重写与否看声明对应关系，不看名字查找是否找得到。
- 想让被隐藏的基类重载重新参与重载解析，得写 `using B::f;`。这就是「派生类为什么用 using 把基类重载拉回来」的标准依据。
- 默认实参按静态类型取，于是出现这种组合：实际执行的是派生类函数体，传进去的却是基类的默认值。

  ```cpp
  struct A { virtual void f(int a = 7); };
  struct B : A { void f(int a) override; };

  B b;
  A& ra = b;
  ra.f();   // 调用 B::f，实参是 7（来自 A 的声明）
  b.f();    // 错误：B::f 不接受零个实参
  ```

  这也是「虚函数不要写默认实参」这条编码规范的来源。

- 限定调用（`b.A::f()`）显式抑制虚调用机制，标准措辞是「用作用域运算符显式限定会压制虚调用机制」（`[class.virtual]`/16）。这条在派生类实现里回调用基类实现时是必需的。

还要注意区分「静态类型」和「对象」：动态类型是对象的类型，只有当调用经由指针或引用、且指针静态类型是某个基类时，静态类型和动态类型才可能不同。对对象本身调用（`b.f()`，`b` 是 `B` 对象）时二者一致，派发结果与静态选择相同。

---

## 3. 重写的确切条件

`[class.virtual]`/2 现在用 `corresponds` 来表述重写关系，实质要求可以列成一张清单：

- 同名，参数类型列表相同。仅返回类型不同不构成重写，是错误（`[class.virtual]`/8 的例子：`char vf3();` 报错）。
- cv 限定相同。
- ref 限定符（C++11 起）相同，或者都缺省（`[class.virtual]`/7）。
- 返回类型相同，或协变（`[class.virtual]`/8）。协变的三个条件：两边都是类指针、都是类左值引用、或都是类右值引用；基类的那个类是派生类那个类的无歧义且可访问的直接或间接基类；cv 限定一致且派生侧不比基类侧更严格。多级指针不允许协变（脚注 88）。

  ```cpp
  struct B {};
  struct D : B {};
  struct Base { virtual B* vf(); };
  struct Derived : Base { D* vf() override; };   // OK：协变
  ```

- 虚函数不能有尾随 requires-clause（`[class.virtual]`/6，C++20 起）。
- 成员函数模板不能声明为 `virtual`（`[temp.mem]`/3）。而且成员函数模板的特化不重写基类虚函数（`[temp.mem]`/4），这条比前一条更容易记错。
- 删除的函数不能重写未删除的函数，反之亦然（`[class.virtual]`/17，随 `= delete` 在 C++11 引入）。
- 虚函数不能是静态成员，也不能是非成员函数（`[class.virtual]`/11 注）。构造函数也不能是虚函数——虚调用要靠对象的动态类型，而对象在构造函数里还没成型。

另外两条与「虚函数本身」有关的规则值得单独记：

`virtual` 说明符蕴含成员身份，所以虚函数必须声明在类里；而一个类里声明的虚函数必须被定义、或声明为纯虚、或两者兼有，且不要求诊断（`[class.virtual]`/12）。这条是 IFNDR（ill-formed, no diagnostic required），实践中的表现通常是链接期的「undefined reference to vtable for X」——它不是某个编译器的小脾气，而是标准允许的行为。

### 3.1 override 与 final

这两个是 C++11 引入的 contextual keyword，作用是把「以为重写了」变成编译期可判定的问题：

- `override` 标在一个声明上，如果它没有重写任何基类成员函数，程序 ill-formed（`[class.virtual]`/5）。典型触发场景：派生类里漏了 `const`、参数类型写宽了（`long` 对 `int`）、ref 限定不一样。
- `final` 标在虚函数上，之后有派生类函数重写它就 ill-formed（`[class.virtual]`/4）。`final` 也可以标在整个类上，表示不允许再派生。

C++11 之前没有这两个说明符，签名不匹配只能靠人眼核对——这正是「重写」和「隐藏」在旧代码里频繁混淆的原因。

---

## 4. final overrider、多继承与指针同一性

final overrider 的定义在单继承下几乎等于「最派生的那份」，在多继承下才有内容：同一个虚函数可能经由不同的基类子对象出现多次，每份各有自己的 final overrider，互不相干。

```cpp
struct A { virtual void f(); };
struct B1 : A { void f(); };       // 非虚派生
struct B2 : A { void f(); };
struct D : B1, B2 {};              // D 里有两个 A 子对象

D d;
B1* b1p = &d;
A* ap = b1p;
ap->f();        // 调用 D::B1::f
// A* a2 = &d;  // ill-formed：A 是歧义基类
```

标准给的正面例子就是这样：`B1::A::f` 的 final overrider 是 `B1::f`，`B2::A::f` 的是 `B2::f`（`[class.virtual]`/13 例 7）。换一种继承方式，问题性质就变了：

```cpp
struct A  { virtual void f(); };
struct VB1 : virtual A { void f(); };
struct VB2 : virtual A { void f(); };
struct Error : VB1, VB2 {};        // ill-formed：没有唯一的 final overrider
struct Okay  : VB1, VB2 { void f(); };
```

`VB1::f` 和 `VB2::f` 都重写了 `A::f`，而 `Error` 里没有任何函数把两者都覆盖掉，于是同一个虚函数有两个 final overrider，程序 ill-formed。`Okay` 显式声明 `f()`，成了唯一的 final overrider，于是合法（`[class.virtual]`/14 例 8）。这条是「菱形虚继承忘了在最派生类里再声明一次」报错的条款依据。

多继承还有个更常被踩的推论：同一个对象转成不同基类的指针，地址可以不同。

```cpp
struct A { virtual ~A() = default; };
struct B { virtual ~B() = default; };
struct C : A, B {};

C c;
A* pa = &c;
B* pb = &c;      // 通常与 pa 的数值不同：B 子对象在 C 里的偏移不为 0
```

指针转换时做 `this` 调整是标准行为，不是实现细节；而转成 `void*` 用的是对象地址、不做这种调整（`[expr.static.cast]`），所以 `static_cast<void*>(pa)` 和 `static_cast<void*>(pb)` 仍然分别指向各自子对象。结论：多继承下不能用指针数值或 `void*` 比较来判断「是不是同一个对象」。要拿到最派生对象的地址，用 `dynamic_cast<void*>`（`[expr.dynamic.cast]`/8）：

```cpp
bool same_object(A* p, B* q) {
    return dynamic_cast<void*>(p) == dynamic_cast<void*>(q);
}
```

---

## 5. 构造与析构期间的派发

这是最容易被考试和面试反复问的一段，标准措辞很精确（`[class.cdtor]`/4）：从构造函数或析构函数里（包括在成员初始化期间、契约断言求值期间）直接或间接发起虚调用，且调用所作用的对象正是正在构造或析构的那个对象 x，那么被调用的函数是构造函数或析构函数所在类里的 final overrider，而不是更派生类里的重写版本。

```cpp
struct Base {
    Base() { f(); }                 // 调用 Base::f
    virtual void f() { /* ... */ }
    virtual ~Base() { f(); }        // 同样调用 Base::f
};
struct Derived : Base {
    void f() override { /* ... */ } // 不会在构造/析构 Base 期间被调用
};
```

同一节还规定了两件相关的事：

- `typeid` 在构造/析构期间作用于该对象时，得到的是构造/析构函数所在类的 `type_info`（`[class.cdtor]`/5）。
- `dynamic_cast` 在构造/析构期间作用于该对象时，该对象被视为「类型为构造/析构函数所在类」的最派生对象（`[class.cdtor]`/6）。

两者都有配套的 UB 条款：操作数的静态类型既不是构造/析构函数所在类也不是它的基类时，行为未定义。

纯虚函数在这里更硬：从抽象类的构造/析构函数里，对正在构造/析构的对象直接或间接做虚调用、且目标是纯虚函数时，行为未定义（`[class.abstract]`/6）。实现上常见的表现是运行期打印 `pure virtual method called` 然后终止——但这是实现选择，标准说的是 UB，不保证一定被抓住。

实践结论只有一句：不要在构造函数和析构函数里调用虚函数并指望派发到派生实现。要在构造完成后初始化，就得用一个显式的 `init()`／工厂函数，而不是把逻辑塞进构造函数。

---

## 6. 抽象类与纯虚函数

纯虚函数用 pure-specifier `= 0` 声明；含至少一个纯虚函数的类是抽象类；抽象类只能作为基类使用，不能创建对象，除非作为派生类的子对象（`[class.abstract]`/2）。

容易记错的两点：

第一，一个类是否抽象，看的是 final overrider 是否纯虚，而不是看有没有写过 `= 0`（`[class.abstract]`/4）：

```cpp
class shape {
public:
    virtual void rotate(int) = 0;
    virtual void draw() = 0;
};
class ab_circle : public shape {
public:
    void rotate(int) override {}     // draw() 没重写
};
// ab_circle::draw 默认仍是纯虚 -> ab_circle 仍是抽象类
```

第二，纯虚函数可以有定义，只有在用限定名语法调用它时才必须有定义（`[class.abstract]`/2）。所以 `virtual ~Base() = 0;` 这种纯虚析构函数必须提供函数体——派生类析构会调用到它。

抽象类型不能作为按值参数或返回值（那会需要构造对象），但指向它的指针和引用可以（`[class.abstract]`/3）。

---

## 7. 虚析构函数与 delete

析构函数可以是虚的，也可以是纯虚的（`[class.dtor]`/11）；如果某个类的析构是虚的、且程序里创建了这个类或派生类的对象，那这个析构函数必须被定义（同条）。

通过基类指针删除时，规则落在 `delete` 表达式的条款里（`[expr.delete]`/3）：单对象 `delete` 中，如果被删对象的静态类型与动态类型不 similar，静态类型必须是动态类型的基类，且静态类型必须有虚析构函数，否则行为未定义。

`[expr.delete]`/10 给出了同一件事的正面表述：单对象 `delete` 时，如果静态类型没有虚析构函数，被删除的对象就是操作数所指的那个对象；如果有虚析构函数，被删除的是它的最派生对象。这就把「不析构派生部分」和「UB」两件事对上了。

虚析构还额外决定 deallocation 函数怎么选：操作数是 `cv T*` 且 `T` 有虚析构时，deallocation 函数在动态类型的虚析构定义处选定（`[expr.delete]`/8.1），这也是 `[class.dtor]`/15 那条「虚析构定义点确定非数组 deallocation 函数」的用途——保证对应动态类型的释放函数可用。

数组版本没有这种关照：数组 `delete` 中，只要被删对象的动态类型与静态类型不 similar，行为就是未定义的（`[expr.delete]`/3）。数组不协变，没有运行期补偿。

要不要写虚析构，判据是是否打算通过基类指针删除。不打算删，就不必写；写了会让析构函数非平凡（`[class.dtor]`/8 的平凡判据里明确有「析构函数不是虚的」这一条），也可能挡住 standard-layout。另外注意一个常被记反的事实：有虚函数并不妨碍一个类是 trivially copyable——平凡性判据里没有「有虚函数」这一项；standard-layout 的判据里才有「没有虚函数、没有虚基类」。

---

## 8. RTTI：typeid 与 dynamic_cast

运行期类型信息只在多态类上存在，`typeid` 和 `dynamic_cast` 的动态行为都以此为门槛。

### 8.1 typeid

- 作用于多态类的泛左值时，结果是该泛左值所指对象的最派生对象（也就是动态类型）的 `type_info`（`[expr.typeid]`/4）。这种情况操作数会被求值，所以 `typeid(f())` 里 `f()` 会真的被调用。
- 作用于其它表达式时，结果是表达式的静态类型，且做左值到右值、数组到指针、函数到指针转换时不施加这些转换、操作数是 unevaluated operand（`[expr.typeid]`/5）——也就是不求值，副作用不会发生。
- 一个反直觉但明确的规则：如果操作数是形如 `*p` 的一元表达式且 `p` 求值为空指针，`typeid` 抛 `std::bad_typeid`，而不是 UB（`[expr.typeid]`/3）。同样的写法在别处是 UB。
- `typeid` 结果忽略 cv 限定，`typeid(const D&)` 与 `typeid(D)` 相同（`[expr.typeid]`/7）；类类型必须完整定义（`/2`）；`std::type_info` 的声明必须先于 `typeid` 出现，否则 ill-formed（`/8`）。

### 8.2 dynamic_cast

`dynamic_cast<T>(v)` 里 `T` 必须是指向完整类类型的指针、引用，或 `cv void*`，且不能去掉 const（`[expr.dynamic.cast]`/1）。

行为分几种情况：类型相同、或从派生指针向上转基类指针，不需要多态性（`/3`、`/4`）；其余情况要求 `v` 是多态类型的指针或泛左值（`/5`）。也就是说，一个类没有虚函数，就做不了向下转换。

运行时检查的逻辑是（`/9`）：先看 `v` 指向的是不是一个 `C` 对象的 public 基类子对象且这样的 `C` 对象唯一；否则看 `v` 指向的公开基类子对象所属的最派生对象是否有唯一且 public 的 `C` 基类；都不满足则失败。失败时指针结果为相应类型的空指针，引用则抛出能匹配 `std::bad_cast` 处理器的异常（`/10`）。注意「public」这两个字在检查里，非公开基类的向下转换会失败。

虚基类带来的差异值得单独提一句：从虚基类静态向下转换是 ill-formed，但 `dynamic_cast` 能做——因为路径要在运行期查。

```cpp
struct V { virtual ~V() = default; };
struct A : virtual V {};
struct B : virtual V {};
struct D : A, B {};

D d;
V* v = &d;
A* a = dynamic_cast<A*>(v);      // OK
// A* a2 = static_cast<A*>(v);   // ill-formed：不能从虚基类静态向下转换
```

`dynamic_cast<void*>` 是特例：它不做去 const 检查那套，直接给出最派生对象的指针（`/8`），这也是上一节提到的对象同一性判据。

`-fno-rtti` 之类的开关属于实现选项，不是标准语义：关掉之后，对多态类型的 `typeid`／`dynamic_cast` 就不再可用。这是编译器的取舍，不要写进「语言规定」里。

---

## 9. 实现层面（以下都不是标准规定）

标准里没有 vptr 和 vtable 这两个词，`sizeof` 的结果是实现定义的，构造期间 vptr 何时更新、多继承下有几个 vptr、vtable 里放什么，标准一概不管。主流实现的典型做法是：

- 每个多态对象里埋一个隐藏指针（vptr）指向该类型的 vtable；vtable 里按固定槽位存虚函数地址，以及供 `dynamic_cast`、虚基类使用的信息（类型信息指针、偏移项，具体布局由 ABI 定）。
- 虚调用据此实现为：读对象的 vptr → 按编译期就固定下来的槽位取函数地址 → 间接调用。所以这不是运行期按名字搜索，也不涉及字符串比较。
- 多继承下，指针调整可能需要一段跳板（thunk）才能把 `this` 修正后再进入重写函数；虚继承下这个偏移在编译期未知，要靠表里查。
- 去虚化（devirtualization）：当编译器能证明动态类型时，会把虚调用改写成直接调用。`final`、匿名命名空间、局部对象、LTO、PGO 都可能帮助它成功。这是优化，不是语言保证——依赖它来保证性能或语义都不合适。
- ABI 差异是真实存在的：Itanium C++ ABI（GCC／Clang）与 MSVC 的 vtable 布局、构造期间 vptr 的更新策略并不相同，跨 ABI 的二进制接口不兼容。

开销上，代价是三样的：每个对象多一个（多继承下可能多个）指针；虚调用通常不能内联，除非去虚化成功；间接跳转对分支预测不友好。

---

## 10. 高频错误清单

按前面的条款逐条对应，可以当成自查表：

1. 基类函数忘了写 `virtual`，派生类写了同名函数 → 静态绑定，走的还是基类那份。
2. 参数列表、`const`、ref 限定、返回类型写得不匹配 → 变成隐藏而不是重写。加 `override` 可以在编译期抓住。
3. 给虚函数写默认实参 → 实际用的是静态类型那份的默认值。
4. 基类析构非虚，却通过基类指针 `delete` → UB（`[expr.delete]`/3）。
5. 构造函数／析构函数里调用虚函数，期待派生实现 → 只会派发到当前层（`[class.cdtor]`/4）。
6. 按值传参或赋值给基类对象 → 切片，动态类型丢失，虚调用从此无从谈起。
7. 把派生对象塞进基类数组 → 不成立。数组按下标访问时按静态元素大小步进，派生对象也放不进基类元素，属于 UB。
8. 多继承下用指针数值或 `static_cast<void*>` 判断同一性 → 不对，要用 `dynamic_cast<void*>`。
9. 类没有虚函数却要 `dynamic_cast` 下行 → 编译失败（`[expr.dynamic.cast]`/5 要求多态类型）。
10. 把派生类的重写函数设为 private 就以为「外面调不到」→ 通过基类指针照样能调到（`[class.access.virt]`/1）。私有虚函数是 NVI 惯用手法的基础，不是保护措施。
11. 菱形继承里重复继承同一个基类，却没在最派生类里再声明一次 → 同一虚函数出现两个 final overrider，ill-formed（`[class.virtual]`/2）。
12. 声明了虚函数却没定义（常见于只改了头文件、忘了实现）→ `[class.virtual]`/12 的 IFNDR，表现为链接错误。

---

## 11. 与其他多态形式的关系

把边界画清楚，才知道什么时候不该用虚函数。

编译期一侧：重载、模板、C++20 的 concepts 都在编译期定死实现，没有间接跳转，可以完全内联，但类型必须在编译期已知，也装不进异构容器。CRTP（把派生类当模板参数传给基类模板）用静态方式拿到「基类调用派生实现」的效果，代价是类型不能擦除、编译期开销和错误信息都更重。

运行期但不要求继承的一侧：类型擦除（`std::function`、`std::any`、手写 type erasure）把具体类型藏在接口后面；`std::variant` + `std::visit` 适合类型集合封闭的场合，分发在编译期展开成跳转表。另有提案在做不要求继承的非侵入式运行期多态，那是另一条路线。

选型判据基本是四个问题：类型集合是否封闭、实现是否必须编译期可知、是否需要把不同派生类型放进同一个容器、以及对间接调用开销的容忍度。

---

## 12. 版本变化

| 版本 | 与运行期多态有关的变化 |
| --- | --- |
| C++98 | 虚函数、纯虚函数、抽象类、虚析构函数、RTTI（`dynamic_cast`／`typeid`）、协变返回类型，这一套基本成型 |
| C++11 | 引入 `override` 与 `final` 两个 contextual keyword；引入 ref 限定符，它参与重写判定；引入 `= delete`，随之有「删除函数不能与非删除函数互相重写」 |
| C++20 | 允许 `constexpr` 虚函数，并允许在常量求值中发生虚调用（前提是所选 final overrider 本身可用于常量求值，P1064R0）；禁止虚函数带尾随 requires-clause；重写判定改写为基于 `corresponds` 的表述（P1787R6） |
| C++23 | 引入显式对象参数（deducing this），但它不能与 `virtual` 组合；要把两者结合得等后续提案 |
| 当前工作草案（C++26 周期） | `[expr.call]`/5 规定虚调用的前置/后置断言按「静态选中函数的断言 + 实际调用函数的断言」两套依次求值（合同，P2900）；`[class.virtual]`/18 还对 immediate（`consteval`）函数与虚函数之间的重写关系作了限制 |

其中 C++20 那条重写措辞的改动最容易被忽略：条款编号没变，但判定的写法换了，读旧书时的表述与现行草案已经不是同一套字面。

---

## 参考

- 标准草案：`[class.virtual]`、`[class.abstract]`、`[class.cdtor]`、`[class.dtor]`、`[class.access.virt]`、`[expr.call]`、`[expr.delete]`、`[expr.dynamic.cast]`、`[expr.typeid]`、`[dcl.fct.default]`、`[temp.mem]`、`[class.prop]`
- 直达形式：<https://eel.is/c++draft/class.virtual>、<https://eel.is/c++draft/class.abstract>、<https://eel.is/c++draft/class.cdtor>、<https://eel.is/c++draft/expr.call>、<https://eel.is/c++draft/expr.dynamic.cast>、<https://eel.is/c++draft/expr.typeid>
- cppreference：<https://en.cppreference.com/w/cpp/language/virtual>、<https://en.cppreference.com/w/cpp/language/abstract_class>、<https://en.cppreference.com/w/cpp/language/dynamic_cast>、<https://en.cppreference.com/w/cpp/language/typeid>、<https://en.cppreference.com/w/cpp/language/override>
