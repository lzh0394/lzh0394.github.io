---
title: "std::shared_ptr 研究"
slug: "std-shared-ptr"
date: "2026-11-15"
tags: ["C++", "标准库", "shared_ptr", "引用计数"]
series: "C++ 标准库"
series_order: 10
draft: false
summary: "以标准条款、WG21 提案与三家实现源码为证据，拆解 std::shared_ptr 的控制块、一次与两次分配、别名构造与计数原子性：说明合并分配的内存滞留、weak_ptr 的延迟释放、线程安全的范围，以及循环引用与跨模块传递的规则。"
---

## 0. 结论摘要

`shared_ptr` 的状态由两个指针组成：一个指向被管理对象，一个指向控制块。对象指针决定 `get()`、`operator*` 与 `operator->` 的结果，控制块承载强计数、弱计数、删除器与分配器。所有权语义完全由控制块决定，这一分离解释了别名构造、`owner_before` 与数组形式的行为。

`make_shared` 与 `allocate_shared` 把对象与控制块放进同一次分配。标准把「不超过一次分配」写成建议（[draft][util.smartptr.shared.create]/7），三家实现都照此执行。合并分配的代价是：只要还有 `weak_ptr` 存在，整块内存连同对象所占空间都不会归还。分离分配（`shared_ptr<T>(new T)`）换来删除器的自由度与更早的内存归还，代价是两次分配与一次额外的指针跳转。

计数以原子方式更新，指针本身不是原子变量。不同的 `shared_ptr` 对象即使共享所有权，也可以在不同线程并发复制与销毁；同一个 `shared_ptr` 对象的并发读写构成数据竞争；被管理对象不因被共享而获得任何同步。需要原子地替换一个被多个线程读取的 `shared_ptr` 时，用 C++20 的 `atomic<shared_ptr>`。

四类误用覆盖了多数故障：用裸指针重复构造控制块、循环引用、`expired()` 之后解引用、在构造函数里调用 `shared_from_this`。

选型上，`shared_ptr` 适合表达真正的共享所有权，以及在接口边界上做类型擦除的删除，因为删除器类型不进入 `shared_ptr` 的类型；独占所有权用 `unique_ptr`，计数开销不可接受且能够修改类定义时用侵入式计数。

---

## 1. 范围与口径

`shared_ptr` 的接口规模与 `vector` 相近，隐含状态却更多。除对象指针之外，还有一个不在类型里出现的控制块，保存计数、删除器与分配器；多数行为差异都能追到这两部分的关系上。

分析可以分成三层：

- 所有权模型：对象由谁在何时销毁，记账结构何时释放。
- 接口约束：裸指针构造、别名构造、`enable_shared_from_this` 与数组形式的边界。
- 并发规则：哪些操作可以并发，哪些必须由外部同步。

把三层分开之后，剩下的问题大多有确定答案。用同一个裸指针构造两个 `shared_ptr` 属于第一层被误读；把 `shared_ptr` 当成同步设施属于第三层被误读；在构造函数里调用 `shared_from_this` 属于第二层被误读。

### 1.1 证据分级与版本基准

本文用四类标记区分证据等级，正文按需标注：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | C++ 工作草案的可观察要求 | `[util.smartptr.shared.dest]/1` 规定析构的效果 |
| [paper] | WG21 提案与缺陷报告 | P0674R1 为 `make_shared` 增加数组形式 |
| [impl] | 标准库实现源码 | libstdc++ 的 `_M_release_last_use` |
| [推断] | 由证据推出的工程判断 | 计数递增只需 relaxed 语义的论证 |

版本基准：标准侧以 eel.is 的 2026-11 草案快照为准，C++20 与 C++23 的措辞用 N4861、N4950 对照。实现侧对照三家上游源码：libstdc++ 的 `bits/shared_ptr_base.h` 与 `bits/shared_ptr_atomic.h`，MSVC STL 的 `stl/inc/memory`，libc++ 的 `__memory/shared_count.h` 与 `__memory/shared_ptr.h`。实现的行号随版本变动，正文只写头文件与类名。

草案不是正式标准，正式文本是 ISO/IEC 14882。本文引用的段号对应草案快照，标准换版后可能位移。

### 1.2 不做什么

- 不重述分配器协议：`allocate_shared` 使用的分配器要求见系列第 2 篇《标准库分配器的演化》。
- 不做性能测试：本文比较实现的路径与开销来源，不给绝对数字。
- 不讨论 `shared_ptr` 与垃圾回收接口的关系。
- 不比较第三方智能指针的完整实现，只在说明取舍时引用。

---

## 2. 标准要求

### 2.1 所有权模型

[draft][util.smartptr.shared.general]/1 的措辞是：`shared_ptr` 保存一个指针，通常由 `new` 获得；它实现共享所有权语义，最后一个拥有者负责销毁对象或释放与指针关联的资源；不拥有指针的对象称为空（empty）。

要求集合很短（[draft][util.smartptr.shared.general]/2–/3）：

- 特化满足 `Cpp17CopyConstructible`、`Cpp17CopyAssignable` 与 `Cpp17LessThanComparable`，可以放进标准容器。
- 可以上下文转换为 `bool`。
- 模板参数 `T` 可以是不完整类型，也可以是函数类型。

标准正文没有定义「控制块」这个名称。它只用「与 `r` 共享所有权」描述两个对象之间的关系；[draft][util.smartptr.shared.create]/7 的说明提到实现会分配「引用计数一类的内部记账结构」。「控制块」（control block）是实现与文档惯用的称呼，本文沿用它指代这块记账结构，并把它当作实现概念而非标准术语。

析构的规范效果分三种情形（[draft][util.smartptr.shared.dest]/1）：空或仍有其他拥有者时无副作用；拥有对象与删除器时调用 `d(p)`；否则执行 `delete p`。同一节的说明补了一句可观察结果：对象销毁后，其余共享所有权的 `shared_ptr` 报告的 `use_count()` 比之前少一。

`weak_ptr` 的定位写在 [draft][util.smartptr.weak.general]/1：它保存一个已经被 `shared_ptr` 管理的对象的弱引用，要访问对象必须用 `lock` 转换成 `shared_ptr`。这条要求隐含了记账结构的生存期：对象销毁之后，`weak_ptr` 仍要能回答「是否过期」，因此控制块必须比对象活得更久。

### 2.2 计数语义与生命周期

标准只规定可观察行为，计数如何划分属于实现细节。实现里的三项分工是：

- 强计数（实现中的 `_M_use_count`、`__shared_owners_`、`_Uses`）记录拥有者的个数，最后一个拥有者析构时对象被销毁。
- 弱计数（`_M_weak_count`、`__shared_weak_owners_`、`_Weaks`）记录控制块自身的引用，最后一个 `weak_ptr` 析构时控制块被释放。
- 强计数大于零期间，控制块隐式持有一个弱引用，因此弱计数至少为 1。

第三条解释了合并分配的内存滞留，见第 3.4 节。

`use_count()` 是观察接口，不是同步设施。[draft][util.smartptr.shared.obs] 的说明指出：多个线程可能影响返回值时，结果是近似的；`use_count() == 1` 不意味着通过已销毁的 `shared_ptr` 进行的访问已经完成。同一节的 `Synchronization` 一栏写的是 `None`。`unique()` 在 C++17 弃用、C++20 移除，原因也在这里。

带原子性保证的「检查加提升」写在 [draft][util.smartptr.weak.obs]/3：它要求 `weak_ptr::lock` 的效果等价于 `expired() ? shared_ptr<T>() : shared_ptr<T>(*this)`，并且整体以原子方式执行。分开写 `expired()` 与解引用得不到这个保证，见第 6.4 节。

### 2.3 线程安全条款

与 `shared_ptr` 并发相关的主要规范段落是 [draft][util.smartptr.shared.general]/5：判断数据竞争时，成员函数只访问与修改 `shared_ptr` 与 `weak_ptr` 对象本身，不访问它们所指的对象；`use_count()` 的变化不反映可能引入数据竞争的修改。

这段文字划出三条边界：

- 不同 `shared_ptr` 对象共享所有权时可以并发操作，计数更新是原子的。
- 同一个 `shared_ptr` 对象不能被多个线程同时读写，否则构成数据竞争。
- 被管理对象不因被共享而获得同步，访问对象本身仍按普通对象规则处理。

### 2.4 异常与 noexcept

`shared_ptr` 的多数成员是 `noexcept`：复制构造、移动构造、复制赋值、移动赋值、`swap`、`reset()` 与析构。抛异常的位置集中在构造：控制块分配失败，或删除器的复制、移动失败。

标准为这些位置规定了回滚（[draft][util.smartptr.shared.const]）：

- 裸指针构造在控制块分配失败时执行 `delete p`，不泄漏对象。
- 带删除器的构造在异常时调用 `d(p)`，把对象交还给删除器。
- 删除器本身的构造与调用不得抛出，这是前置条件；抛出时行为不由标准规定。

`make_shared` 与 `allocate_shared` 的异常行为更简单：[draft][util.smartptr.shared.create]/3 规定抛出异常时函数无效果，已构造的数组元素按构造的逆序销毁。

---

## 3. 对象模型与控制块

### 3.1 两个指针

三家实现的 `shared_ptr` 都由对象指针与控制块指针组成，只是成员命名与封装方式不同：

| 实现 | 成员 | 说明 |
| --- | --- | --- |
| libstdc++ | `__shared_ptr::_M_ptr` 与 `_M_refcount`（内含 `__shared_count::_M_pi`） | `__shared_count` 只含一个指针成员 |
| libc++ | `__shared_ptr::__ptr_` 与 `__cntrl_` | 头文件注释称其可平凡重定位 |
| MSVC STL | `_Ptr` 与 `_Rep`，放在 `_Compressed_pair` 中 | 调试级别不改变这两个字段 |

对象大小由此确定：64 位平台上 `sizeof(shared_ptr<T>)` 是两个机器字，即 16 字节；32 位平台是 8 字节。大小与 `T`、删除器、分配器都无关，因为这些信息都在控制块里。这也是 `shared_ptr` 与 `unique_ptr` 在接口上的关键差别：`unique_ptr<T, D>` 的大小随 `D` 变化，`shared_ptr<T>` 不随删除器变化。

访问对象只经过一个指针。`get()` 返回保存的对象指针，`operator->` 直接用它；控制块指针只在复制、销毁与 `use_count()` 时使用。常见说法「`shared_ptr` 有两次间接寻址」只在访问控制块时成立。

### 3.2 控制块的组成

控制块至少要放四样东西：强计数、弱计数、销毁对象的方法、释放自身的方法。删除器与分配器按构造方式追加。三家的变体划分一致：

| 实现 | 计数基类 | 变体 | 合并分配的实现 |
| --- | --- | --- | --- |
| libstdc++ | `_Sp_counted_base` | `_Sp_counted_ptr`、`_Sp_counted_deleter`、`_Sp_counted_ptr_inplace` | `_Sp_counted_ptr_inplace` 用 `_M_storage` 存放对象 |
| libc++ | `__shared_weak_count`（派生自 `__shared_count`） | `__shared_ptr_pointer`、`__shared_ptr_emplace` | `__shared_ptr_emplace` 用 `char __buffer_[sizeof(T)]` |
| MSVC STL | `_Ref_count_base` | `_Ref_count`、`_Ref_count_resource`、`_Ref_count_resource_alloc`、`_Ref_count_obj2` | `_Ref_count_obj2` 用 `union` 存放对象 |

销毁走虚函数：基类声明 `_M_dispose` 与 `_M_destroy`（libstdc++）、`__on_zero_shared` 与 `__on_zero_shared_weak`（libc++）、`_Destroy` 与 `_Delete_this`（MSVC）。删除器的类型因此不进入 `shared_ptr` 的类型，`get_deleter<T>()` 通过 `type_info` 比较把删除器取回。

虚函数带来两个后果。控制块的第一项是虚表指针，64 位平台上占 8 字节；销毁路径是一次间接调用，而不是直接调用删除器。MSVC 的 `_Ref_count_base` 析构函数旁有一条注释，说明它应当是非虚的，现状属于过渡状态，可见实现也在权衡虚析构的必要性。

### 3.3 一次分配与两次分配

`make_shared` 与 `allocate_shared` 把对象放进控制块的分配里。[draft][util.smartptr.shared.create]/7 把这一点写成建议而非要求：实现「应当执行不超过一次内存分配」，给出的理由是效率可以接近侵入式智能指针。三家实现都照此执行，对象通常紧跟在计数基类之后。

`shared_ptr<T>(new T)` 走另一条路：`new T` 一次分配，控制块再一次分配。`reset(new T)` 与从 `unique_ptr` 构造同理。

两条路径的差别不止分配次数：

- 合并分配少一次分配与一次释放，对象与控制块相邻，销毁时的缓存局部性通常更好。
- 合并分配下，只要还有 `weak_ptr` 存在，整块内存连同对象占用的空间都不能归还；分离分配下，对象在强计数归零时立即释放，控制块可以继续存在。
- 合并分配不允许自定义删除器，只允许自定义分配器（`allocate_shared`）。
- 分离分配给删除器留出空间，删除器存放在控制块里，`shared_ptr` 本身不变大。

分离分配还有一个异常窗口。在 C++17 之前，`f(shared_ptr<T>(new T), g())` 中 `new T` 与 `shared_ptr` 的构造可能被 `g()` 隔开，`g()` 抛出时裸指针泄漏。C++17 起函数实参的求值顺序改为不确定顺序，`g()` 仍可能先于 `shared_ptr` 构造完成，泄漏窗口没有完全关闭。规避方式是把分配与接管写进同一条语句，例如 `make_shared`，或先构造 `shared_ptr` 再调用。

### 3.4 弱引用延迟释放

控制块的两个计数初值都是 1：强计数 1 代表创建者的拥有关系，弱计数 1 代表强计数存续期间隐式的弱引用。释放路径分两段：

1. 强计数减到 0，调用销毁函数析构对象，然后弱计数减 1。
2. 弱计数减到 0，调用释放函数归还控制块。

因此 `weak_ptr` 延长的是控制块的寿命，不是对象的寿命。对象在强计数归零时已经析构，`weak_ptr::lock` 之后返回空。

`make_shared` 把对象放进控制块，第二段完成之前整块内存都不能归还。`shared_ptr` 与 `weak_ptr` 混用的场景里，这条规则会让内存占用高于直觉：一个长期存在的 `weak_ptr`（例如缓存里的观察者）足以让已经析构的对象所占的空间保留到它被销毁。分离分配下同样的代码只保留控制块本身，通常在几十字节量级。

弱计数的最小值不是 0：强计数大于零时，弱计数至少为 1。实现依赖这条不变量判断「还有没有拥有者」，`weak_ptr::lock` 的原子性也建立在它之上。

### 3.5 大小与开销

| 项目 | 64 位平台上的量级 | 说明 |
| --- | --- | --- |
| `sizeof(shared_ptr<T>)` | 16 字节 | 两个指针，与 `T`、删除器无关 |
| `sizeof(weak_ptr<T>)` | 16 字节 | 同样两个指针 |
| 计数基类 | 16 或 24 字节 | 虚表指针加两个计数；libc++ 用 64 位计数，基类为 24 字节 |
| 每次复制 | 一次原子读改写 | 强计数加一，销毁时减一 |
| 对象访问 | 一次指针解引用 | 不经过控制块 |

计数宽度由实现选择：libstdc++ 的 `_Atomic_word` 与 MSVC 的 `_Atomic_counter_t` 是 32 位，libc++ 用 `long`。32 位计数在 64 位平台上意味着约 21 亿个拥有者之后溢出，标准不规定溢出后的行为，实际代码远达不到这个量级。

复制 `shared_ptr` 的成本主要是一次原子读改写加一次指针写入。按值传递参数、在容器里存 `shared_ptr`、用 `shared_ptr` 做返回值，都会触发这个成本。以 `const shared_ptr<T>&` 传参可以避免计数变化，前提是调用期间对象不被其他线程重置。

---

## 4. 接口与语义边界

### 4.1 裸指针构造

`explicit shared_ptr(Y* p)` 的约束写在 [draft][util.smartptr.shared.const]/3：`delete p` 必须良构，`Y*` 必须能转换为 `T*`；数组情形要求 `delete[] p` 良构。前置条件是 `delete p` 的行为有定义且不抛异常。这些条件把责任交给调用方：`p` 必须来自能配对的分配，且此后不再由其他所有者管理。

两条规则覆盖了这类构造的主要风险：

- 同一个裸指针只能交给一个控制块。`shared_ptr<T> a(p); shared_ptr<T> b(p);` 产生两个控制块，两次 `delete p`。
- 已经在 `shared_ptr` 里的指针不能再用 `get()` 构造新的 `shared_ptr`。需要第二个拥有者时复制原对象，或使用 `enable_shared_from_this`。

控制块分配失败时构造函数执行 `delete p`，这一点由标准规定，`shared_ptr<T>(new T)` 不会因为控制块分配失败而泄漏对象。

### 4.2 别名构造

别名构造函数的形式是 `shared_ptr(const shared_ptr<Y>& r, element_type* p)`，见 [draft][util.smartptr.shared.const]。它保存 `p`，与 `r` 共享所有权，`use_count()` 与 `r` 相同：

```cpp
struct Widget {
  int id;
  std::string name;
};

auto w = std::make_shared<Widget>(Widget{1, "demo"});
std::shared_ptr<int> id(w, &w->id);   // 共享所有权，指向成员
```

删除仍作用于 `w` 持有的原指针，`id` 不参与删除。标准在说明里点明：除非 `p` 至少在 `r` 的所有权组销毁之前保持有效，否则得到悬空指针。

用途有三类：

- 指向成员或子对象，同时保留整体所有权，容器的元素视图与整个缓冲区都由此共用一份计数。
- 把派生类指针转成基类指针而保留原控制块。`static_pointer_cast` 也做这件事，但要求指针可转换；别名构造不作此要求。
- 类型擦除：保存 `shared_ptr<void>` 或 `shared_ptr<const void>`，仍能通过原控制块正确销毁。

`static_pointer_cast`、`dynamic_pointer_cast`、`const_pointer_cast` 与 `reinterpret_pointer_cast` 都共享控制块，只调整对象指针，语义与别名构造一致。

所有权比较用 `owner_before` 与 `owner_equal`，不用 `==`。`==` 比较 `get()`，两个别名 `shared_ptr` 指向不同子对象时 `==` 为假，`owner_equal` 为真。以 `shared_ptr` 或 `weak_ptr` 为键的关联容器要用 `owner_less` 或 C++26 的 `owner_hash`，见第 8 章。

### 4.3 enable_shared_from_this

`enable_shared_from_this<T>` 提供一个私有的 `weak_ptr<T>` 成员，标准以一个仅用于说明的名字 `weak-this` 指代它（[draft][util.smartptr.enab]/2）。`shared_from_this()` 返回 `shared_ptr<T>(weak-this)`，`weak_from_this()` 返回这个 `weak_ptr`。

成员在 `shared_ptr` 构造时被赋值。[draft][util.smartptr.shared.const]/1 规定：如果 `Y` 有一个无歧义且可访问的 `enable_shared_from_this` 基类，构造函数据此执行 `weak-this` 的赋值。同一条款注明，这个赋值不是原子操作，与对同一对象的并发访问冲突。

三条边界由此确定：

- 在构造函数里调用 `shared_from_this()` 必然失败，此时 `weak-this` 还没有被赋值，抛出 `bad_weak_ptr`。
- 对象不由 `shared_ptr` 持有时，例如栈对象、`unique_ptr` 持有的对象、由另一个控制块管理的对象，同样抛出 `bad_weak_ptr`。
- 多个 `enable_shared_from_this` 基类造成歧义时，赋值条件不满足，`shared_from_this()` 不可用。

`weak_from_this()` 是 C++17 加入的接口（P0033R1），适合在不能确定对象是否由 `shared_ptr` 管理的场合先取弱引用再 `lock`：

```cpp
class Session : public std::enable_shared_from_this<Session> {
public:
  void start() {
    auto self = shared_from_this();      // 延长自身寿命
    io.post([self] { self->run(); });
  }
};
```

这段写法把回调的生存期绑到对象上。代价是回调执行之前对象不会被销毁；回调可能永远不执行时，对象也就永远不会释放。需要「对象先销毁、回调自然失效」的语义时，改捕获 `weak_ptr` 并在回调里 `lock`。

### 4.4 自定义删除器与分配器

删除器在构造时被复制或移动进控制块。前置条件有两条：删除器的构造不得抛异常，`d(p)` 的行为有定义且不抛异常。删除器的调用发生在析构路径上，抛出会终止程序，标准选择用前置条件排除这种情形。

删除器的类型只影响控制块，不影响 `shared_ptr` 的类型；`get_deleter<T>()` 用 `type_info` 比较取回删除器。这一点让 `shared_ptr` 适合出现在接口边界上：更换删除器不改变函数签名，也不破坏 ABI。

分配器通过 `allocate_shared` 传入。[draft][util.smartptr.shared.create]/7 规定：`allocate_shared` 用分配器的一份副本（可能经过重绑定）分配控制块，对象的构造与析构走 `allocator_traits<A2>::construct` 与 `destroy`。这是它与 `make_shared` 在语义上的主要差别：前者让对象也经过分配器的构造与析构钩子。

三者的分工可以列成三条：

- `make_shared` 用全局 `new` 分配整块，删除方式是 `delete`。
- `allocate_shared` 用重绑定后的分配器分配整块，删除方式仍在控制块内部实现。
- 两者都不接受自定义删除器；需要删除器时用 `shared_ptr<T>(p, d)` 或 `shared_ptr<T>(p, d, a)`。

### 4.5 数组形式

C++17 起 `shared_ptr<T[]>` 可用（P0414R2）。它保存的指针类型是 `T*`（`element_type` 为 `remove_extent_t<T>`），删除由实现提供的删除器执行 `delete[] p`（[draft][util.smartptr.shared.const]/3、/6）。

需要区分三件事：

- `shared_ptr<T[]>` 不记录元素个数。`get()` 返回 `T*`，没有 `size()`。
- C++20 起 `make_shared<T[]>(n)` 与 `allocate_shared<T[]>(n)` 可用（P0674R1），元素个数记录在控制块里，销毁时按构造的逆序析构全部元素。
- `operator[]` 可以用于数组形式，下标越界是未定义行为；加固模式下 `i < N` 成为检查的前置条件，见第 8 章。

`shared_ptr<T[]>` 与 `shared_ptr<T>` 之间没有隐式转换。允许的转换由指针兼容规则给出（[draft][util.smartptr.shared.general]/6）：`U[N]*` 可以转成 `cv U[]` 形式的 `shared_ptr`，即数组形式内部可以从定长转到不定长，不能反向。

```cpp
std::shared_ptr<int[]> buf = std::make_shared<int[]>(1024);  // C++20
buf[0] = 1;

std::shared_ptr<int> one(new int(1));                         // 标量形式
```

数组形式适合把一块缓冲区共享给多个使用者的场景。需要长度信息时，把长度与指针放进同一个结构，或改用 `shared_ptr<std::vector<T>>`。

---

## 5. 三家实现

### 5.1 libstdc++

`_Sp_counted_base<_Lp>` 的两个计数 `_M_use_count` 与 `_M_weak_count` 由构造函数初始化为 1。模板参数 `_Lp` 是锁策略：`_S_atomic` 用原子内建，`_S_mutex` 用互斥量，`_S_single` 用于单线程构建。策略通过 `_Mutex_base` 注入，`_S_need_barriers` 决定析构与释放之间是否需要显式的 `__atomic_thread_fence`。

释放路径有两处值得注意。

其一，`_M_release` 在 `_S_atomic` 策略下先做一次整体判断：两个计数相邻且都是 32 位，可以按一个 64 位字读出；若读到的值正好是「强计数 1、弱计数 1」，说明没有其他线程能观察到这次释放，实现直接把两个计数清零，依次调用 `_M_dispose` 与 `_M_destroy`，跳过两次原子读改写。这条路径要求 64 位原子操作无锁、两个计数恰好拼成一个机器字、且对齐满足要求，条件在编译期判断。

其二，强计数减到零的慢路径被拆成 `_M_release_last_use` 与一个 `noinline` 的 `_M_release_last_use_cold`，冷代码移出热路径后指令缓存占用更小。

`weak_ptr::lock` 对应的 `_M_add_ref_lock_nothrow` 是比较交换循环：读出强计数，为零则失败，否则尝试加一，失败重试。这个循环是 `lock` 原子性的实现基础。

合并分配的 `_Sp_counted_ptr_inplace` 用 `__gnu_cxx::__aligned_buffer<T>` 保存对象，构造走 `allocator_traits::construct`；`get_deleter` 用 `_Sp_make_shared_tag` 的 `type_info` 作为标记，识别「这块控制块由 `make_shared` 创建」。

### 5.2 libc++

libc++ 的 `__shared_count` 保存 `long __shared_owners_`，但存的是计数减一：初值 0 表示一个拥有者，释放时减到 -1 表示最后一个。`__shared_weak_count` 再增加 `long __shared_weak_owners_`。两个计数都是 64 位，因此计数基类在 64 位平台上占 24 字节，比另外两家多 8 字节。

计数的原子操作集中在两个函数里：`__libcpp_atomic_refcount_increment` 用 `__atomic_add_fetch` 加 `__ATOMIC_RELAXED`，`__libcpp_atomic_refcount_decrement` 用 `__ATOMIC_ACQ_REL`。头文件注释说明这一选择：递增用 relaxed、递减用 acq/rel 已经足够，并指向 LLVM 的 PR22803。`use_count()` 用 relaxed 读取出计数，再加一。

`__shared_ptr_emplace` 保存分配器与 `_ALIGNAS_TYPE(T) char __buffer_[sizeof(T)]`，对象由 `allocator_traits::construct` 构造。释放时先显式析构分配器，再用一份重绑定后的分配器归还内存，顺序不能颠倒，因为归还动作需要分配器的副本。

`__shared_ptr` 的两个成员旁有一条注释，说明它「只包含两个堆指针，移动构造不需要记账」，因此被标记为可平凡重定位。这条性质让 `vector<shared_ptr<T>>` 扩容时可以直接搬移字节，而不必逐个调用移动构造。

### 5.3 MSVC STL

`_Ref_count_base` 的两个计数是 `_Atomic_counter_t` 类型的 `_Uses` 与 `_Weaks`，同样从 1 开始。递增与递减通过 `_MT_INCR` 与 `_MT_DECR` 完成，在 x86 与 x64 上映射到 `_InterlockedIncrement` 一类带完全屏障的互锁操作。`weak_ptr::lock` 用 `_Incref_nz`，即「非零才加一」的比较交换循环。

释放路径写在 `_Decref` 里：强计数减到零先调用 `_Destroy` 析构对象，再调用 `_Decwref`；弱计数减到零调用 `_Delete_this` 释放控制块。两个动作拆成两个虚函数，与另外两家的 dispose 与 destroy 二分一致。

`_Ref_count_base` 的虚析构函数旁有一条注释：`TRANSITION, should be non-virtual`。控制块的释放总是通过 `_Delete_this` 完成，虚析构并非必需，保留它是历史遗留，代价是每个控制块多一个虚表项。

合并分配的 `_Ref_count_obj2` 用 `union { _Wrap<T> _Storage; }` 保存对象，`_Wrap` 负责对齐；C++20 的 `_for_overwrite` 形式用标签类型区分，构造时调用 `_Default_construct_in_place`，不做值初始化。

### 5.4 计数操作的内存序

三家实现的模式相同：递增用 relaxed 或等价的完全屏障操作，递减用 release 语义，最后一个拥有者在销毁对象之前建立 acquire 语义。

理由是同步关系只依赖递减。一个线程释放最后一个强引用时，它在对象上的写入必须对执行析构的线程可见；递减因此至少要有 release 语义，析构线程在读到「计数归零」之后需要 acquire 语义才能看到这些写入。递增不需要同步，只需要原子性。

差别在实现选择：libc++ 明确用 relaxed 递增；libstdc++ 的 `__exchange_and_add_dispatch` 在原子策略下使用带 acq_rel 的读改写，比必需的内存序更强；MSVC 的 `_MT_INCR` 在 x86 上使用带完全屏障的互锁指令。标准只要求可观察行为，这些选择属于实现自由[推断]。

### 5.5 对照

| 维度 | libstdc++ | libc++ | MSVC STL |
| --- | --- | --- | --- |
| 计数类型 | `_Atomic_word`，32 位 | `long`，64 位，存计数减一 | `_Atomic_counter_t`，32 位 |
| 计数基类大小 | 16 字节 | 24 字节 | 16 字节 |
| 递增 | acq_rel 读改写 | relaxed | 完全屏障互锁 |
| 递减 | acq_rel 读改写 | acq_rel | 完全屏障互锁 |
| 锁策略 | `_S_atomic`、`_S_mutex`、`_S_single` | `_LIBCPP_HAS_THREADS` 编译期开关 | 固定互锁内建 |
| 合并分配 | `_Sp_counted_ptr_inplace` | `__shared_ptr_emplace` | `_Ref_count_obj2` |
| 控制块释放 | `_M_destroy` | `__on_zero_shared_weak` | `_Delete_this` |

差异集中在工程取舍：计数宽度、内存序的强弱、合并分配的布局、虚函数的划分。标准层的语义三家一致，跨实现的代码只能依赖标准要求。

---

## 6. 并发与原子性

### 6.1 强计数与弱计数的原子性

两个计数都用原子操作更新，原因不同。强计数的更新决定对象何时销毁，弱计数的更新决定控制块何时释放；两者都可能被不同线程同时触发，且必须保证只有一个线程看到「归零」。

顺序不能交换：先析构对象，再释放控制块。删除器与分配器可能位于控制块内，控制块先释放会让析构访问已释放的内存。三家实现的释放路径都体现这个顺序，析构在前，弱计数递减在后。

弱计数递减到零之后控制块被归还，任何仍指向它的对象都是悬空的。这条约束由 `weak_ptr` 的复制语义保证：每次复制 `weak_ptr` 都增加弱计数，因此只要还有 `weak_ptr`，控制块就不会释放。

### 6.2 线程安全边界

| 操作 | 是否可并发 | 依据 |
| --- | --- | --- |
| 不同 `shared_ptr` 对象共享所有权时的复制与销毁 | 可以 | 计数是原子的（[draft][util.smartptr.shared.general]/5） |
| 同一个 `shared_ptr` 对象的读写 | 不可以 | 对象本身不是原子变量 |
| 通过 `shared_ptr` 访问被管理对象 | 按对象本身的规则 | 共享所有权不提供同步 |
| 读取 `use_count()` | 可以，但结果是近似值 | [draft][util.smartptr.shared.obs] 的说明 |

边界可以压缩成一句：`shared_ptr` 保证的只有计数，对象本身与 `shared_ptr` 变量都不在保护范围内。把 `shared_ptr` 当成线程安全的指针是常见误解；它保证的是「多个拥有者同时持有时，销毁只发生一次」。

需要让多个线程看到同一个 `shared_ptr` 的更新时，有两条路：外部加锁，或用 `atomic<shared_ptr>`。

### 6.3 原子智能指针

C++20 加入 `atomic<shared_ptr<T>>` 与 `atomic<weak_ptr<T>>`（P0718R2），补上了此前只能靠自由函数 `atomic_load`、`atomic_store`、`atomic_compare_exchange_*` 完成的操作。这些自由函数在 C++20 被弃用，当前草案已移除对应子条款 `[util.smartptr.shared.atomic]`，新代码应使用 `atomic<shared_ptr>`。

规范语义的要点有三条：

- 操作对象是整个 `shared_ptr`，`load` 返回一个拥有所有权的 `shared_ptr`，计数同步增加。
- `compare_exchange` 的相等条件是「存储的指针相同，且共享所有权或同时为空」（[draft][util.smartptr.atomic.shared]）。
- `is_always_lock_free` 为 `false`，标准不要求无锁实现。

两家实现的做法都不是无锁的，但路径不同。libstdc++ 把对象指针与控制块指针分开存放，用控制块指针所在机器字的最低位作锁标记（`_S_lock_bit`），需要一致读取时先置位再读。MSVC 把对象指针放在真正的原子变量里，把控制块指针放在 `_Locked_pointer` 的保护下：读取时先锁住控制块指针，再原子读对象指针，增加计数后解锁。

```cpp
std::atomic<std::shared_ptr<Config>> g_config;

void publish(std::shared_ptr<Config> next) {
  g_config.store(std::move(next));
}

std::shared_ptr<Config> snapshot() {
  return g_config.load();   // 得到一份稳定快照
}
```

这个模式适合读多写少的配置或路由表：读取方拿到快照后不再加锁，写入方整体替换。代价是每次 `load` 都增加一次计数，写入方替换时旧快照要等最后一个读取方释放才析构；替换频率高时，旧对象可能同时存在多份。

### 6.4 并发误用

- 先 `expired()` 再解引用：两步之间对象可能被销毁。用 `lock()` 一次完成检查与提升。
- 两个线程对同一个 `shared_ptr` 变量分别 `reset`：对象本身的数据竞争，计数原子不能补救。
- 用 `use_count() == 1` 判断独占并直接修改对象：结果近似，其他线程可能刚复制过。
- 期待 `atomic<shared_ptr>` 无锁：`is_always_lock_free` 为 `false`，高频替换要考虑锁竞争。
- 在回调里按值捕获 `shared_ptr` 形成长生命周期引用：对象与回调互相等待，表现为内存不下降。

---

## 7. 陷阱与取舍

### 7.1 循环引用

两个对象用 `shared_ptr` 互相持有，强计数永远不会归零。典型的父子结构：

```cpp
struct Child;

struct Parent {
  std::shared_ptr<Child> child;
};

struct Child {
  std::shared_ptr<Parent> parent;   // 形成环
};
```

创建一对 `Parent` 与 `Child` 并互相赋值之后，即使外部引用全部销毁，两个对象的强计数仍为 1。析构函数不执行，内存不归还。

修法是把环上的一条边改成 `weak_ptr`：

```cpp
struct Child {
  std::weak_ptr<Parent> parent;   // 不增加强计数
};
```

哪条边改成弱引用由所有权决定：父对象拥有子对象，子对象只观察父对象，因此子到父的边用 `weak_ptr`。使用前 `lock()`，失败说明父对象已销毁。

环也可能不表现为两个对象：观察者列表、回调注册、缓存里的索引都可能形成更长的环。判断标准是「是否存在一条全部由 `shared_ptr` 组成的强引用回路」，与对象个数无关。

### 7.2 与 unique_ptr 的分工

| 维度 | `unique_ptr<T, D>` | `shared_ptr<T>` |
| --- | --- | --- |
| 大小 | 一个指针（无状态删除器） | 两个指针 |
| 所有权 | 独占，可移动不可复制 | 共享 |
| 删除器 | 类型的一部分 | 存于控制块，类型擦除 |
| 数组形式 | `unique_ptr<T[]>` | `shared_ptr<T[]>`（C++17） |
| 额外开销 | 无 | 控制块分配与原子计数 |
| 转换 | 可隐式转为 `shared_ptr` | 不能转回 |
| 接口边界 | 删除器类型进入签名 | 签名只含 `T` |

分工规则可以写成三条：

- 工厂返回 `unique_ptr`，调用方需要共享时再转换。转换发生在边界上，选择权留给调用方。
- 接收所有权的函数按值取 `unique_ptr`，接收共享所有权的函数按值取 `shared_ptr`；只观察时用 `T*` 或 `T&`，并注明生存期要求。
- `shared_ptr` 只在所有权确实需要共享时使用。用 `shared_ptr` 表达独占会让每次复制付出原子计数成本，也让所有权关系难以从签名读出。

### 7.3 侵入式引用计数

侵入式计数把计数放进对象内部，指针类型只保存对象地址：

```cpp
class RefCounted {
public:
  void add_ref() noexcept { ++refs_; }
  void release() noexcept { if (--refs_ == 0) delete this; }
private:
  std::atomic<long> refs_{1};
};
```

与 `shared_ptr` 相比，侵入式计数省掉了控制块分配，对象指针就是全部状态，从 `this` 构造智能指针也不需要 `enable_shared_from_this`。代价是计数进入对象布局，每个对象至少多一个字；不支持弱引用；要求类在设计时预留计数。COM 的 `AddRef` 与 `Release`、`boost::intrusive_ptr` 都是这个模型。

`enable_shared_from_this` 可以看作两者的折中：对象内部保存一个 `weak_ptr`，因此能从 `this` 取得拥有者，但仍需要外部的控制块。它的成本是一个 `weak_ptr` 成员（两个指针）与构造时的一次赋值。

选择规则：

- 类由本项目控制、对象数量大、需要从 `this` 取得拥有者时，侵入式计数更省。
- 需要弱引用、需要与已有的 `shared_ptr` 代码互操作、或不能修改类定义时，用 `shared_ptr`。

### 7.4 ABI 与跨模块传递

`shared_ptr` 的布局由 ABI 固定为两个指针，删除器类型既不进入布局也不进入签名，因此它比 `unique_ptr<T, D>` 更适合出现在跨模块接口上。这不等于可以随意跨模块传递，限制在另外几处。

- 控制块的代码属于创建它的模块。控制块里的销毁函数是虚函数，实现位于创建 `shared_ptr` 的那个库中；创建控制块的模块在对象存活期间被卸载，销毁时会跳转到已卸载的代码。
- 分配与释放必须配对。`make_shared` 的整块内存由创建模块的分配器分配，也由同一模块的控制块释放；两侧使用不同的运行库配置（例如一个静态链接 CRT、另一个动态链接）时，堆不一致会让释放失败。
- 同一程序里的标准库实现必须一致。libstdc++ 与 libc++ 的控制块布局不同，混用属于错误配置，症状通常是运行时崩溃。
- 调试与发布配置混用会改变容器与迭代器的布局。`shared_ptr` 本身大小不变，但控制块里的删除器若捕获了调试版对象，仍可能出问题。

可行的规则是：跨模块接口上传 `shared_ptr` 时，约定同一标准库、同一运行库配置，并保证创建控制块的模块在对象存活期间不被卸载。做不到时改用不透明句柄加显式的创建与销毁函数，把所有权留在模块内部。这些限制的具体表现由实现与构建配置决定，标准不作规定。

### 7.5 常见误用清单

| 写法 | 问题 | 修正 |
| --- | --- | --- |
| `shared_ptr<T> b(p.get())` | 第二个控制块，重复删除 | 复制原 `shared_ptr`，或改用 `enable_shared_from_this` |
| `f(shared_ptr<T>(new T), g())` | `g()` 抛出时裸指针泄漏 | 用 `make_shared`，或分两步构造 |
| 构造函数里调用 `shared_from_this()` | `weak-this` 尚未赋值，抛 `bad_weak_ptr` | 改在工厂函数里调用，或延迟到初始化完成之后 |
| `expired()` 之后解引用 `weak_ptr` | 检查与使用之间对象可能销毁 | 用 `lock()` 取 `shared_ptr` |
| 父子对象互相持有 `shared_ptr` | 强计数不归零，对象不析构 | 一条边改成 `weak_ptr` |
| 长期缓存保存指向 `make_shared` 对象的 `weak_ptr` | 整块内存延迟释放 | 改用分离分配，或定期清理缓存 |

---

## 8. 演进

### 8.1 版本变化

| 版本 | 与 `shared_ptr` 相关的变化 |
| --- | --- |
| C++11 | 引入 `shared_ptr`、`weak_ptr`、`enable_shared_from_this`、`make_shared`、`allocate_shared` 与原子访问自由函数 |
| C++17 | 数组形式 `shared_ptr<T[]>`（P0414R2）、`weak_from_this`（P0033R1）、`unique()` 弃用 |
| C++20 | `make_shared` 的数组与 `_for_overwrite` 形式（P0674R1）、`atomic<shared_ptr>`（P0718R2）、`unique()` 移除、原子访问自由函数弃用 |
| C++23 | `out_ptr` 与 `in_ptr`（P1132R8）改善与 C 接口的互操作 |
| C++26 | `constexpr` 接口（P3037R6）、`owner_hash` 与 `owner_equal`（P1901R2）、容器加固（P3471R4）覆盖 `operator[]`、弃用的原子访问自由函数从草案移除 |

表中最后一行对应的内容仍在修订。`constexpr` 接口由 P3037R6 引入，已进入 C++26 工作草案，当前草案已把多数成员标为 `constexpr`；`owner_hash` 与 `owner_equal` 由 P1901R2 引入，同样已进入工作草案，目的是让 `weak_ptr` 能作为无序容器的键。

### 8.2 提案脉络

C++11 之后，`shared_ptr` 的所有权模型没有变化：对象指针加控制块，强计数归零销毁对象，弱计数归零释放控制块。变化集中在三处。

接口补全：数组形式、`weak_from_this`、`make_shared` 的数组与 `_for_overwrite` 形式都属于把已有用法标准化，不改变语义。

并发设施：`atomic<shared_ptr>` 替换了 C++11 的原子访问自由函数，后者在 C++20 弃用，当前草案已移除。标准没有要求无锁实现，因此 `atomic<shared_ptr>` 的实际成本由实现决定。

常量求值与加固：P3037R6 让 `shared_ptr` 的接口进入常量求值，P3471R4 为 `operator[]` 一类接口增加加固前置条件。两者都不改变运行期语义，但要求实现把计数与销毁路径写成常量求值可走的形式。

草案中没有改变所有权模型的提案。公开讨论集中在实现质量与诊断，例如无锁的 `atomic<shared_ptr>`、计数溢出的处理，这些不改变标准语义。

---

## 结论

`shared_ptr` 的行为可以归结为一条链：对象指针决定访问，控制块决定生命周期，两个计数决定对象与控制块何时释放。接口、并发规则与实现差异都从这条链派生。

可执行的规则：

1. 默认用 `make_shared`。需要自定义删除器、需要对象随强计数归零立即释放、或对象很大而弱引用可能长期存在时，改用分离分配。
2. 一个裸指针只交给一个控制块。需要从 `this` 取得拥有者时继承 `enable_shared_from_this`，并在对象构造完成之后调用。
3. 复制 `shared_ptr` 意味着共享所有权，按值传递要有明确理由。只观察时用引用或裸指针，并写明生存期要求。
4. 环上的边用 `weak_ptr` 打断，使用前 `lock()`，不用 `expired()` 加解引用。
5. 多线程共享同一个 `shared_ptr` 变量时用 `atomic<shared_ptr>` 或外部锁；不同 `shared_ptr` 对象共享所有权时可以并发操作。
6. 接口边界优先 `shared_ptr`，内部所有权优先 `unique_ptr`；跨模块传递要保证同一标准库与运行库配置。

---

## 参考

- 标准草案：`[util.smartptr.shared]`、`[util.smartptr.shared.general]`、`[util.smartptr.shared.const]`、`[util.smartptr.shared.dest]`、`[util.smartptr.shared.mod]`、`[util.smartptr.shared.obs]`、`[util.smartptr.shared.create]`、`[util.smartptr.weak.general]`、`[util.smartptr.weak.obs]`、`[util.smartptr.enab]`、`[util.smartptr.atomic.shared]`，以及已从草案移除的 `[util.smartptr.shared.atomic]`。
- 直达形式：<https://eel.is/c++draft/util.smartptr.shared>、<https://eel.is/c++draft/util.smartptr.shared.const>、<https://eel.is/c++draft/util.smartptr.shared.create>、<https://eel.is/c++draft/util.smartptr.shared.obs>、<https://eel.is/c++draft/util.smartptr.weak.obs>、<https://eel.is/c++draft/util.smartptr.enab>、<https://eel.is/c++draft/util.smartptr.atomic.shared>。
- 历史草案：N4861（C++20）、N4950（C++23），取自 cplusplus/draft 对应标签；版本对照只用于说明措辞变化。
- 提案：P0033R1（Re-enabling shared_from_this）、P0414R2（Merging shared_ptr changes from Library Fundamentals to C++17）、P0674R1（Extending make_shared to Support Arrays）、P0718R2（Revising atomic_shared_ptr for C++20）、P1132R8（out_ptr）、P1901R2（Enabling the Use of weak_ptr as Keys）、P3037R6（constexpr std::shared_ptr and friends）、P3471R4（Standard library hardening）。
- 实现源码：libstdc++ 的 `bits/shared_ptr_base.h`、`bits/shared_ptr_atomic.h`；MSVC STL 的 `stl/inc/memory`；libc++ 的 `__memory/shared_count.h`、`__memory/shared_ptr.h`。
- 标准库文档：<https://en.cppreference.com/w/cpp/memory/shared_ptr>、<https://en.cppreference.com/w/cpp/memory/weak_ptr>、<https://en.cppreference.com/w/cpp/memory/enable_shared_from_this>、<https://en.cppreference.com/w/cpp/memory/shared_ptr/atomic2>。
