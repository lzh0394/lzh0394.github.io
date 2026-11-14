---
title: "C++ 常见面试题"
slug: "cpp-interview-questions"
date: "2026-10-14"
tags: ["C++", "面试", "STL", "并发"]
draft: false
summary: "覆盖语言基础、面向对象、内存管理、STL、模板、并发、C++11 至 C++23 新特性、编译链接与 ABI、未定义行为、性能与标准常识，共 215 道面试题，题型含概念问答、辨析、代码输出、填空、条款溯源、场景设计与手写实现。"
---

## 1. 语言基础

### 1.1 C 和 C++ 的区别？

- C 是面向过程的语言，C++ 是面向对象的语言（同时兼容 C）。
- C++ 支持封装、继承、多态；支持模板（泛型编程）；支持函数重载、引用、命名空间、异常处理。
- C++ 有更严格的类型检查，且提供 STL 等标准库。

### 1.2 指针和引用的区别？

| 特性 | 指针 | 引用 |
|------|------|------|
| 是否可为空 | 可以为 nullptr | 必须绑定对象，不可为空 |
| 是否可重新绑定 | 可以改变指向 | 初始化后不可改变 |
| 是否占内存 | 占用（地址大小） | 通常不额外占内存（编译期别名） |
| 是否可多级 | 有多级指针 | 无多级引用 |
| 自增含义 | 地址偏移 | 绑定对象值 +1 |

### 1.3 什么是 const？有哪些用法？

- `const` 修饰变量：值不可改。
- `const` 修饰指针：
  - `const int* p`：指向的内容不可改（底层 const）。
  - `int* const p`：指针本身不可改（顶层 const）。
  - `const int* const p`：都不可改。
- `const` 修饰成员函数：`int get() const;` 表示不修改成员变量，可被 const 对象调用。
- `const` 修饰函数参数/返回值，避免意外修改。

### 1.4 static 关键字的作用？

- 修饰全局变量/函数：内部链接，仅本文件可见。
- 修饰局部变量：生命周期延长到程序结束，只初始化一次，存在静态存储区。
- 修饰类的成员变量：属于类而非对象，所有对象共享，需在类外定义。
- 修饰类的成员函数：无 this 指针，不能访问非静态成员，可用 `类名::函数` 调用。

### 1.5 宏定义 #define 和 const 的区别？

- 宏在预处理阶段做文本替换，无类型检查，不占存储；调试困难。
- const 在编译期处理，有类型检查，有作用域，可调试。
- 常量表达式优先用 `constexpr`（C++11）。

### 1.6 sizeof 和 strlen 的区别？

- `sizeof` 是运算符，编译期计算，包括 `\0`，可作用于类型和变量。
- `strlen` 是函数，运行期计算，遇到 `\0` 结束，不计入 `\0`，只作用于字符串。

### 1.7 什么是内存对齐？为什么要对齐？

- 编译器按成员类型大小及最大对齐数补 padding，使成员地址对齐。
- 原因：CPU 访问对齐数据更快，某些架构不支持非对齐访问会报错。
- `#pragma pack(n)` 或 `alignas` 可改变对齐。

### 1.8 数组和指针的区别？

- 数组名是地址常量（多数情况退化为指针），`sizeof` 得到数组总大小。
- 指针是变量，`sizeof` 得到指针自身大小。
- 数组不能赋值/自增，指针可以。

### 1.9（辨析）volatile 与 atomic 的区别？

- volatile 阻止编译器把读写缓存在寄存器里，适合内存映射 I/O；它不保证原子性和内存序，不能用于线程同步。
- atomic 提供原子操作与内存序，用于并发。

### 1.10（输出题）int i = 1; i = i++ + ++i; 的结果是什么？

- 对 i 的读写没有确定的求值顺序，属于未定义行为；不同编译器可能得到不同结果。
- 这类表达式不应出现在代码里。

### 1.11（条款）整型提升与寻常算术转换的顺序？

- 小于 int 的整型先做整型提升（[conv.prom]），再按等级与符号做寻常算术转换（[expr.arith.conv]）。
- 有符号与无符号混合时可能转成无符号，负数会变得很大。

### 1.12（填空）空类、含一个 char 的类、含虚函数的类的大小？

- 空类至少 1 字节；含一个 char 通常 1 字节；含虚函数通常多一个 vptr，具体由 ABI 决定。
- 空基类作为基类时可被优化掉，作为成员时 C++20 用 [[no_unique_address]] 提示可重叠。

### 1.13（辨析）const 与 constexpr 的区别？

- const 表示只读，可以在运行期初始化；constexpr 要求能在常量表达式中求值。
- constexpr 变量隐含 const，但 const 变量不一定是 constexpr。

### 1.14（填空）auto 与 decltype 的推导差异？

- auto 丢弃顶层 const 与引用，数组与函数退化为指针；decltype(expr) 保留引用与 const，decltype(auto) 保留值类别。
- auto&& 在推导语境中是转发引用，用于转发。

### 1.15（辨析）typedef 与 using 别名？

- 语义类似；using 可读性更好，并支持模板别名，typedef 不能直接定义模板别名。

### 1.16（陷阱）char、signed char、unsigned char 是三种类型吗？

- 是三种不同类型；char 的符号性由实现定义。
- 用 char 做数值运算前应明确符号性，或改用 std::int8_t 与 std::uint8_t。

### 1.17（输出题）sizeof('a') 在 C 与 C++ 中分别是多少？

- C 中字符常量类型是 int，sizeof('a') 等于 sizeof(int)；C++ 中是 char，结果为 1。

### 1.18（场景）如何比较两个浮点数是否相等？

- 不要直接用 ==；用绝对误差或相对误差阈值比较，并单独处理 NaN 与无穷。
- 需要精确十进制语义时用整数或定点数。

### 1.19（辨析）i++ 与 ++i 的差异与选择？

- 内建类型没有性能差异；自定义类型 i++ 通常要复制旧值，++i 更省。
- 迭代器场景优先写 ++it。

### 1.20（条款）switch 的约束？

- case 标签必须是整型常量表达式，不能重复；C++17 起支持 switch (init; cond) 形式。
- 忘记 break 会贯穿，C++17 可用 [[fallthrough]] 标注意图。

---

## 2. 面向对象

### 2.1 面向对象的三大特性？

- 封装：隐藏实现细节，暴露接口。
- 继承：复用代码，建立 is-a 关系。
- 多态：同一接口不同实现，分编译期（重载/模板）和运行期（虚函数）。

### 2.2 重载、重写（覆盖）、隐藏的区别？

- 重载（overload）：同一作用域，函数名相同，参数列表不同。
- 重写（override）：派生类重新实现基类的虚函数，函数签名相同。
- 隐藏（hide）：派生类同名函数（非虚或签名不同）遮蔽基类同名函数。

### 2.3 虚函数与虚函数表（vtable）？

- 含虚函数的类有虚函数表，对象内有 vptr 指向它。
- 通过基类指针/引用调用虚函数时，运行期查表决定调用哪个版本（动态绑定）。
- 构造函数中不生效（对象未构造完），析构函数若为虚则正确调用派生类析构。

### 2.4 为什么基类析构函数要声明为虚函数？

- 若通过基类指针 `delete` 派生类对象，非虚析构只调用基类析构，派生类资源泄漏（UB）。
- 虚析构保证完整析构链。含虚函数的类一般都应有虚析构。

### 2.5 纯虚函数和抽象类？

- `virtual void f() = 0;` 纯虚函数无实现，含纯虚函数的类是抽象类，不能实例化。
- 派生类必须实现所有纯虚函数才能实例化（类似接口）。

### 2.6 构造函数和析构函数能是虚函数吗？

- 构造函数不能是虚函数（对象尚未构造，vptr 未就绪）。
- 析构函数可以是且常应是虚函数。

### 2.7 构造函数可以调用虚函数吗？

- 可以调用，但调用的是当前构造层次的版本，不触发多态（因为派生类部分尚未构造）。

### 2.8 深复制与浅复制？

- 浅复制：逐位复制成员，指针共享同一块内存，析构时 double free。
- 深复制：为指针成员重新分配内存并复制内容。
- 需要深复制时遵循 三法则/五法则：析构、复制构造、复制赋值（+移动构造、移动赋值）。

### 2.9 什么是 RAII？

- Resource Acquisition Is Initialization：资源获取即初始化。
- 在构造函数中获取资源，析构函数中释放，利用栈对象自动析构保证异常安全。
- 例：智能指针、`std::lock_guard`、`std::fstream`。

### 2.10（辨析）虚继承解决什么问题？

- 菱形继承中同一基类只保留一份子对象；虚基类由最派生类负责初始化。
- 代价是多一层间接（vbtable 与 vbptr），访问与转换更慢。

### 2.11（输出题）构造与析构的顺序？

- 构造：基类、成员（按声明顺序）、派生类体；析构逆序。
- 成员初始化列表的顺序由声明顺序决定，与列表书写顺序无关。

### 2.12（辨析）派生类重写虚函数还要写 virtual 吗？

- 不需要；基类声明 virtual 后，派生类同签名函数自动是虚函数。
- 写 override 让编译器检查签名，写 virtual 只是可读性选择。

### 2.13（陷阱）构造或析构函数中调用虚函数会怎样？

- 构造与析构期间对象的动态类型是当前构造或析构的类，调用的是该层的版本（[class.cdtor]）。
- 调用纯虚函数通常导致未定义行为。

### 2.14（条款）final 的用途？

- 修饰类禁止继承，修饰虚函数禁止重写。
- 也给编译器去虚化提供依据。

### 2.15（辨析）dynamic_cast 的条件与失败行为？

- 要求源类型是多态类型（含虚函数）；指针失败返回 nullptr，引用失败抛 std::bad_cast。
- 依赖 RTTI，开销高于 static_cast。

### 2.16（场景）多继承下指针转换为什么可能改变地址？

- 基类子对象在派生类中有偏移，static_cast 会调整指针；reinterpret_cast 不调整，通常错误。
- 类层次转换用 static_cast 或 dynamic_cast。

### 2.17（条款）空基类优化与 [[no_unique_address]]？

- 空基类作为基类时不占空间；作为成员时标准不保证，C++20 用 [[no_unique_address]] 提示可重叠。

### 2.18（设计）为什么移动构造应声明 noexcept？

- 容器扩容用 move_if_noexcept 选择移动或复制；移动可能抛时会退回复制。
- 不声明 noexcept 会让扩容成本变高，也会失去强异常保证。

### 2.19（条款）三法则、五法则、零法则？

- 三法则：需要自定义析构、复制构造、复制赋值之一时，通常三者都要。
- 五法则：再加移动构造与移动赋值；零法则：用 RAII 成员，不手写这些函数。

### 2.20（条款）对象大小与 vptr？

- 含虚函数的类通常含一个 vptr，大小至少为指针宽度；布局由 ABI 决定。
- 不要依赖 sizeof 的精确值做协议或序列化。

---

## 3. 内存管理

### 3.1 内存分区？

- 栈：局部变量、函数参数，自动管理，速度快，空间小。
- 堆：`new`/`malloc` 分配，手动管理，空间大，易碎片和泄漏。
- 全局/静态区：全局变量、静态变量。
- 常量区：字符串字面量等只读数据。
- 代码区：程序指令。

### 3.2 new/delete 与 malloc/free 的区别？

- `new` 是运算符，`malloc` 是库函数。
- `new` 调用构造函数，`delete` 调用析构函数；malloc/free 只管理内存。
- `new` 返回具体类型指针，malloc 返回 `void*`。
- `new` 失败抛 `bad_alloc`，malloc 失败返回 NULL。
- `new[]`/`delete[]` 配对，`malloc`/`free` 配对。

### 3.3 什么是内存泄漏？如何避免？

- 分配的内存未释放，程序运行期间持续占用。
- 避免：RAII、智能指针、配对 new/delete、工具检测（Valgrind、ASan、CRT debug）。

### 3.4 智能指针有哪些？

- `std::unique_ptr`：独占所有权，不可复制，可移动。
- `std::shared_ptr`：共享所有权，引用计数，计数为 0 释放。
- `std::weak_ptr`：不增加引用计数，解决 shared_ptr 循环引用。

### 3.5 shared_ptr 的循环引用问题？如何解决？

- 两个对象互相持有 shared_ptr，引用计数永不归零，内存泄漏。
- 解决：一方改用 `weak_ptr`（如父子关系中的子指向父）。

### 3.6 shared_ptr 线程安全吗？

- 引用计数的增减是原子的（线程安全），但所指对象的读写不是线程安全的。

### 3.7 什么是野指针、悬空指针？

- 野指针：未初始化的指针。
- 悬空指针：指向已释放内存的指针。
- 避免：初始化 nullptr，释放后置空，不返回局部变量地址。

### 3.8（辨析）栈对象与堆对象的生命周期？

- 栈对象随作用域结束自动析构；堆对象需要显式释放或交给智能指针。
- 栈分配更快、空间受限；堆分配灵活但可能碎片化。

### 3.9（条款）new 表达式与 operator new 的区别？

- new 表达式等于分配加构造；delete 表达式等于析构加释放。
- operator new 只负责分配原始内存，可以重载。

### 3.10（填空）delete[] 为什么需要知道元素个数？

- 数组 new 通常保存元素个数，delete[] 用它逐个析构并释放。
- new[] 配 delete、new 配 delete[] 都是未定义行为。

### 3.11（场景）placement new 的用途与注意点？

- 在已分配内存上构造对象，需要显式析构，内存管理自理。
- 标准库提供 std::construct_at 与 std::destroy_at（C++20）。

### 3.12（场景）如何定位内存泄漏？

- 从源头用 RAII 与智能指针；工具用 ASan、Valgrind、CRT 调试堆。
- 也可以用自定义 operator new 或分配器统计分配。

### 3.13（实现题）make_shared 与 shared_ptr(new T) 的差别？

- make_shared 一次分配控制块与对象；shared_ptr(new T) 两次分配。
- 一次分配更快、局部性更好，但 weak_ptr 存活时对象内存不会提前释放。

### 3.14（陷阱）同一裸指针构造两个 shared_ptr 会怎样？

- 会得到两个独立控制块，最终重复释放同一对象，属于未定义行为。
- 用 enable_shared_from_this 或从已有 shared_ptr 复制。

### 3.15（辨析）weak_ptr 的 expired() 与 lock()？

- expired() 只是某一时刻的判断，之后状态可能变化。
- 需要安全访问时用 lock() 取得 shared_ptr。

### 3.16（条款）unique_ptr 的删除器与大小？

- 删除器是类型的一部分；无状态删除器通常不占空间，有状态会增大对象。
- 数组特化 unique_ptr<T[]> 使用 delete[]。

### 3.17（场景）什么时候需要自定义分配器或内存池？

- 分配是热点、需要确定性延迟、避免碎片或按生命周期批量释放时。
- 优先用 std::pmr 组合内存资源，而不是重写容器。

### 3.18（辨析）memcpy 与 memmove？

- memcpy 要求源与目标不重叠；memmove 允许重叠，实现可能更慢。
- 两者只对可平凡复制的对象安全。

### 3.19（条款）对象生命周期何时开始与结束？

- 生命周期在构造完成时开始、析构开始时结束；原始存储不等于对象。
- C++20 起部分操作可以隐式创建对象（[intro.object]）。

### 3.20（陷阱）realloc 能用于 C++ 对象吗？

- 不能用于非平凡类型：它按字节搬移，不调用构造与析构。
- C++ 容器通过分配器重新分配并在新存储中构造元素。

---

## 4. STL

### 4.1 vector 和 list 的区别？

- `vector`：连续内存，随机访问 O(1)，中间插入删除 O(n)，扩容会重新分配。
- `list`：双向链表，随机访问 O(n)，任意位置插入删除 O(1)，无扩容问题，缓存不友好。

### 4.2 vector 的扩容机制？reserve 和 resize 的区别？

- 容量不足时按倍数（通常 1.5 或 2 倍）重新分配，把旧元素移动到新存储，迭代器/指针失效。
- `reserve(n)`：只改变 capacity，不改变 size。
- `resize(n)`：改变 size，构造或析构元素。

### 4.3 map 和 unordered_map 的区别？

- `map`：红黑树，有序，查找 O(log n)，需要比较函数。
- `unordered_map`：哈希表，无序，平均 O(1)，最坏 O(n)，需要哈希函数，可能 rehash。

### 4.4 vector 和 deque 的区别？

- vector 单端扩容、连续内存；deque 双端队列，分段连续，头尾插入删除都是摊还 O(1)。

### 4.5 迭代器失效的情况？

- `vector`：扩容或插入删除后原有迭代器可能失效。
- `list`/`map`/`set`：插入不影响，删除只使被删元素迭代器失效。
- `deque`：头尾插入可能使迭代器失效，中间插入删除全部失效。

### 4.6 为什么 map 用红黑树而不用 AVL 树？

- 红黑树插入删除旋转次数更少（最多 3 次），综合性能更好；AVL 更严格平衡，查找稍快但维护成本高。

### 4.7（辨析）reserve 与 shrink_to_fit？

- reserve 只增不减，保证容量至少为 n；shrink_to_fit 是非约束请求，可能不生效。
- 两者都可能重分配，使迭代器与引用失效。

### 4.8（条款）vector 的失效规则？

- 重分配使全部引用、指针、迭代器失效；不重分配时插入点及之后失效。
- erase 使擦除点及之后失效，clear 使全部失效（[vector.modifiers]）。

### 4.9（辨析）deque 的失效规则与 vector 的差别？

- deque 头尾插入使迭代器失效，但引用通常仍有效；中间插入使全部失效。
- deque 没有 data()，不保证连续存储。

### 4.10（场景）需要元素地址稳定时怎么选容器？

- list 与 forward_list 地址稳定；或者用 `vector<unique_ptr<T>>` 把对象放到堆上。
- 代价是缓存不友好与额外分配。

### 4.11（条款）关联容器的迭代器失效？

- map 与 set 插入不影响其他元素的迭代器，erase 只使被删元素失效。
- unordered_* 的 rehash 使全部迭代器失效，但引用与指针仍指向元素。

### 4.12（条款）unordered_map 何时 rehash？

- 元素数超过 max_load_factor() 与 bucket_count() 的乘积时。
- rehash 使迭代器失效并重新分布元素，可用 reserve 预留。

### 4.13（辨析）map::operator[] 与 insert、emplace？

- operator[] 要求值可默认构造，找不到时插入默认值；insert 与 emplace 不覆盖已有元素。
- try_emplace（C++17）避免不必要的构造。

### 4.14（陷阱）`vector<bool>` 的问题？

- 位压缩特化，reference 是代理而不是 bool&；没有 data()，不满足连续容器。
- 位图之外用 `vector<char>` 或 `bitset`。

### 4.15（条款）std::sort 的复杂度与稳定性？

- 平均与最坏 O(N log N) 次比较，不稳定。
- stable_sort 稳定，内存不足时可能退化为 O(N log² N)。

### 4.16（场景）lower_bound 的前提？

- 区间必须按同一比较器有序；返回第一个不小于 value 的位置。
- 比较器必须满足严格弱序，否则行为未定义。

### 4.17（辨析）remove 与 erase 的区别？

- remove 与 remove_if 只前移元素并返回新的逻辑终点，不改变容器大小。
- 需要再 erase 删除尾部；C++20 的 erase_if 一步完成。

### 4.18（条款）迭代器类别与连续迭代器？

- 输入、前向、双向、随机访问、连续（C++20）五类；vector 的迭代器建模连续迭代器。
- 连续迭代器可以退化为指针，支持 data() 与指针算术。

### 4.19（场景）std::array 与 C 数组？

- array 是聚合类型，保留大小信息，支持 STL 算法与迭代器，不会退化。
- 大小必须在编译期确定。

### 4.20（辨析）string 的 SSO 与 string_view 的生命周期？

- SSO 把小字符串存在对象内部，避免分配；阈值由实现决定。
- string_view 不拥有数据，所指字符串销毁后即悬空。

---

## 5. 模板与泛型

### 5.1 模板的特化与偏特化？

- 全特化：为特定类型提供专门实现。
- 偏特化：为部分模板参数提供实现（如 `T*`）。
- 函数模板不支持偏特化，只能重载。

### 5.2 模板的实例化机制？

- 编译期根据使用的类型生成具体代码（泛型实例化），导致代码膨胀。
- 声明与定义通常都要放头文件。

### 5.3 SFINAE 是什么？

- Substitution Failure Is Not An Error：模板参数替换失败时只是从重载集中移除，不报错。
- 常用于类型萃取、`enable_if`。

### 5.4 C++11 可变参数模板？

- `template<typename... Args> void f(Args... args);` 可接收任意数量类型参数，配合折叠表达式（C++17）使用。

### 5.5（条款）两阶段名字查找？

- 模板定义时查找非依赖名，实例化时用 ADL 查找依赖名。
- 依赖类型名需 typename，依赖模板名需 template 消歧。

### 5.6（辨析）函数模板为什么不能偏特化？

- 语言不允许；用重载，或用类模板偏特化加转发实现同样效果。
- 函数模板全特化更像普通函数，参与重载。

### 5.7（条款）SFINAE 与 if constexpr 的取舍？

- SFINAE 在重载决议阶段排除候选，C++20 用 requires 更清晰。
- if constexpr 丢弃未选分支，但要求被丢弃分支在语法上有效。

### 5.8（场景）CRTP 的用途？

- 派生类把自身作为模板参数传给基类，实现静态多态，避免虚函数开销。
- 常用于混入、运算符生成与 enable_shared_from_this。

### 5.9（条款）转发引用与 std::forward？

- `T&&` 在模板推导中可能是左值引用或右值引用，`std::forward<T>` 保持值类别。
- 只有推导语境才叫转发引用，显式写 std::string&& 是右值引用。

### 5.10（辨析）auto 与模板参数推导的差异？

- auto 对花括号初始化列表推导为 initializer_list，模板推导不行。
- auto 丢弃引用与顶层 const，decltype(auto) 保留。

### 5.11（条款）折叠表达式？

- C++17 提供一元与二元折叠，对参数包做归约。
- 注意空包的默认值与运算符结合性，例如 (args + ...)。

### 5.12（场景）enable_if 与 requires 的对比？

- enable_if 通过 SFINAE 排除候选，语法噪声大；requires 直接写约束，错误信息更好。
- C++20 起优先 concepts 与 requires。

### 5.13（条款）显式实例化与 extern template？

- 显式实例化在某个翻译单元生成代码；extern template 抑制其他翻译单元的隐式实例化。
- 用于减少编译时间与代码膨胀。

### 5.14（陷阱）模板定义为什么放头文件？

- 实例化需要看到定义；放在源文件会导致链接错误，除非显式实例化。
- C++17 的 inline 变量可用于头文件中的变量定义。

### 5.15（条款）concepts 的两种写法？

- concept 定义可复用的约束；也可以直接在模板参数后写 requires 子句。
- 约束参与重载决议，比 SFINAE 更容易读。

### 5.16（场景）如何缓解模板代码膨胀？

- 显式实例化常用类型，抽公共基类，用类型擦除，减少不必要的模板参数。

---

## 6. 并发

### 6.1 进程和线程的区别？

- 进程是资源分配的基本单位，有独立地址空间；线程是调度的基本单位，共享进程资源。
- 线程通信更简单但需同步，进程间通信需 IPC（管道、共享内存、socket 等）。

### 6.2 线程同步的方式？

- 互斥锁 `std::mutex`、读写锁 `shared_mutex`、条件变量 `condition_variable`、原子变量 `atomic`、信号量（C++20 `counting_semaphore`）。

### 6.3 死锁的四个必要条件及避免？

- 互斥、占有并等待、不可抢占、循环等待。
- 避免：加锁顺序一致、`std::lock` 一次性锁多个、使用 `lock_guard`/`scoped_lock`、超时锁。

### 6.4 volatile 能保证线程安全吗？

- 不能。volatile 只保证不被编译器优化、每次从内存读取，不保证原子性和内存序。
- 并发用 `std::atomic`。

### 6.5 atomic 和 mutex 的区别？

- atomic 适用于简单变量的原子操作，无锁、性能高；mutex 用于保护临界区，可保护复杂逻辑。

### 6.6（辨析）mutex、recursive_mutex、shared_mutex？

- recursive_mutex 允许同一线程重复加锁，容易掩盖设计问题；shared_mutex 适合读多写少。
- 优先用普通 mutex，并缩小临界区。

### 6.7（条款）内存序有哪些？

- relaxed、consume（不推荐）、acquire、release、acq_rel、seq_cst。
- 默认 seq_cst 最直观，无锁结构需要精确配对 acquire 与 release。

### 6.8（输出题）两个线程各对同一 int 自增 1000 次，最终值？

- 存在数据竞争，属于未定义行为；结果不保证是 2000。
- 用 atomic 或互斥锁保护。

### 6.9（条款）条件变量为什么用循环等待？

- 存在虚假唤醒与通知丢失，用谓词循环等待，例如 cv.wait(lock, pred)。
- 修改共享状态时持锁，通知可以在锁外。

### 6.10（辨析）lock_guard、unique_lock、scoped_lock？

- lock_guard 最简单，只能构造时加锁、析构时解锁。
- unique_lock 可延迟加锁、手动解锁，配合条件变量；scoped_lock（C++17）一次锁多个互斥量，避免死锁。

### 6.11（场景）线程池的基本组成？

- 任务队列、工作线程、同步原语与停止标志。
- 注意异常处理与关闭顺序，避免在锁内执行任务。

### 6.12（条款）std::async 与 std::thread？

- async 返回 future，可能延迟执行（launch::deferred）；future 析构可能阻塞等待。
- thread 需要手动 join 或 detach，析构前必须处理。

### 6.13（辨析）thread_local 的初始化与销毁？

- 每个线程一份，首次使用前初始化；销毁顺序与构造相反。
- 动态初始化的 thread_local 可能有守护变量开销。

### 6.14（条款）atomic_flag 与自旋锁？

- atomic_flag 保证无锁，用 test_and_set 与 clear 实现自旋锁。
- 自旋适合极短临界区，长时间忙等浪费 CPU。

### 6.15（场景）无锁队列的主要风险？

- ABA 问题、内存回收、内存序错误与伪共享。
- 优先用成熟库或互斥锁实现。

### 6.16（条款）jthread 与 stop_token？

- C++20 的 jthread 析构时自动 join，并支持协作式停止。
- 停止是协作的，任务需要定期检查 stop_token。

### 6.17（辨析）数据竞争与竞态条件？

- 数据竞争是对同一内存位置的无同步并发访问，属于未定义行为。
- 竞态条件是结果依赖调度，即使没有数据竞争也可能存在。

### 6.18（场景）线程安全单例的写法？

- C++11 局部静态变量初始化线程安全；或用 call_once 与 once_flag。
- 双检锁需要原子与内存序，容易写错。

### 6.19（条款）call_once 的语义？

- 多个线程调用时只有一个执行函数，其余阻塞到完成。
- 函数抛异常时，下一次调用会重试。

### 6.20（陷阱）线程未 join 就析构 thread？

- std::thread 析构时仍 joinable 会调用 std::terminate。
- 用 jthread，或确保 join 或 detach。

---

## 7. C++11 及以后新特性

### 7.1 常用的 C++11 特性？

- auto、范围 for、nullptr、智能指针、右值引用与移动语义、lambda、`std::thread`、`constexpr`、`using` 别名、可变参数模板、`enum class`、`override`/`final`。

### 7.2 左值和右值的区别？移动语义？

- 左值有名字、可取地址；右值是临时值。
- 右值引用 `T&&` 绑定右值，配合移动构造/移动赋值转移资源，避免深复制。
- `std::move` 将左值转为右值引用。

### 7.3 完美转发？

- `std::forward<T>(arg)` 在模板中保持参数的左/右值属性，避免多余复制。

### 7.4 nullptr 和 NULL 的区别？

- `NULL` 通常是 `0` 或 `(void*)0`，可能引起重载歧义。
- `nullptr` 是 `std::nullptr_t` 类型，类型安全。

### 7.5 lambda 表达式？

- `[capture](params) -> ret { body }`。
- 捕获方式：值捕获 `[=]`、引用捕获 `[&]`、混合、`mutable` 可修改值捕获副本。

### 7.6 override 和 final？

- `override`：显式表明重写基类虚函数，签名不匹配时编译报错。
- `final`：禁止进一步重写或继承。

### 7.7 C++17 重要特性？

- 结构化绑定、`if constexpr`、`std::optional`/`variant`/`any`、折叠表达式、`std::string_view`、inline 变量、并行算法。

### 7.8 C++20 重要特性？

- Concepts、Ranges、协程（coroutine）、Modules、三路比较 `<=>`、`std::format`、`std::span`。

### 7.9（条款）std::optional 的用途与成本？

- 表示可能缺失的值，不动态分配；value() 缺失时抛 bad_optional_access，value_or 给默认值。
- 存储大小包含一个 bool 标志，通常与 T 同大小加对齐。

### 7.10（条款）std::variant 的访问与异常？

- 用 std::visit 访问；get 类型不符时抛 bad_variant_access。
- valueless_by_exception 表示异常导致的空状态。

### 7.11（条款）结构化绑定的限制？

- 绑定的是成员或元素的引用或副本，不能绑定位域。
- C++20 起可以被 lambda 捕获。

### 7.12（条款）if constexpr 与 SFINAE 的差别？

- if constexpr 在模板内丢弃分支，但被丢弃分支仍需语法有效。
- 需要约束接口时用 requires 或 concepts 更直接。

### 7.13（条款）span 与 string_view 的区别？

- span 是任意类型的连续序列视图，string_view 是字符序列视图，两者都不拥有数据。
- `span<T>` 可写，`string_view` 只读。

### 7.14（条款）三路比较？

- <=> 返回 ordering 类型，可用 = default 生成。
- 与 == 需要分别声明，C++20 起编译器不会自动从 <=> 推导 ==。

### 7.15（条款）concepts 与 requires 子句？

- concept 是可复用的约束；requires 子句写在模板参数后，参与重载决议。

### 7.16（场景）协程的基本构件？

- promise_type、coroutine_handle 与 co_await、co_yield、co_return。
- 编译器生成状态机，标准库只提供基础设施。

### 7.17（条款）模块与头文件的区别？

- 模块按声明导入，避免文本包含与宏泄漏，接口与实现分离。
- C++23 起标准库模块逐步可用。

### 7.18（条款）std::format 与 iostream 的差异？

- format 用格式串、类型安全、性能好；iostream 依赖流状态与 locale。
- C++20 的 `<format>`，C++23 的 `<print>`。

### 7.19（场景）C++23 的常用新设施？

- expected、print 与 println、mdspan、flat_map 与 flat_set、stacktrace。
- 以编译器与标准库的支持情况为准。

### 7.20（条款）consteval 与 constinit？

- consteval 强制编译期求值；constinit 保证静态初始化，但不要求 const。
- constexpr 既可以在编译期也可以在运行期求值。

---

## 8. 常见编程题

### 8.1 手写 String 类（含复制构造、赋值、析构）

```cpp
class String {
public:
    String(const char* str = "") {
        size_ = strlen(str);
        data_ = new char[size_ + 1];
        strcpy(data_, str);
    }
    String(const String& other) { copy(other); }
    String& operator=(const String& other) {
        if (this != &other) { delete[] data_; copy(other); }
        return *this;
    }
    String(String&& other) noexcept : data_(other.data_), size_(other.size_) {
        other.data_ = nullptr; other.size_ = 0;
    }
    ~String() { delete[] data_; }
private:
    void copy(const String& o) {
        size_ = o.size_;
        data_ = new char[size_ + 1];
        strcpy(data_, o.data_);
    }
    char* data_;
    size_t size_;
};
```

### 8.2 手写单例（线程安全，C++11 局部静态）

```cpp
class Singleton {
public:
    static Singleton& instance() {
        static Singleton inst;   // C++11 保证线程安全
        return inst;
    }
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
private:
    Singleton() = default;
};
```

### 8.3 反转链表

```cpp
ListNode* reverseList(ListNode* head) {
    ListNode* prev = nullptr;
    while (head) {
        ListNode* next = head->next;
        head->next = prev;
        prev = head;
        head = next;
    }
    return prev;
}
```

### 8.4 判断回文 / 字符串常用算法

- 双指针从两端向中间比较。
- 常用：快慢指针找中点、KMP 字符串匹配、哈希表统计字符。

### 8.5 快速排序

```cpp
void quickSort(vector<int>& a, int l, int r) {
    if (l >= r) return;
    int i = l, j = r, pivot = a[(l + r) / 2];
    while (i <= j) {
        while (a[i] < pivot) i++;
        while (a[j] > pivot) j--;
        if (i <= j) { swap(a[i], a[j]); i++; j--; }
    }
    quickSort(a, l, j);
    quickSort(a, i, r);
}
```

### 8.6 手写简化 shared_ptr

```cpp
template<class T>
class shared_ptr_sketch {
    struct ControlBlock {
        long strong = 1;
        T* ptr = nullptr;
    };
    ControlBlock* cb_ = nullptr;
public:
    explicit shared_ptr_sketch(T* p) : cb_(new ControlBlock{1, p}) {}
    shared_ptr_sketch(const shared_ptr_sketch& o) : cb_(o.cb_) { ++cb_->strong; }
    shared_ptr_sketch& operator=(shared_ptr_sketch o) noexcept {
        std::swap(cb_, o.cb_);
        return *this;
    }
    ~shared_ptr_sketch() {
        if (cb_ && --cb_->strong == 0) {
            delete cb_->ptr;
            delete cb_;
        }
    }
    T* get() const { return cb_ ? cb_->ptr : nullptr; }
};
```

- 复制增加计数，析构减少计数，计数为 0 时释放对象与控制块。
- 真实实现还要处理 weak_ptr、原子计数与自定义删除器。

### 8.7 手写简化 vector 的 push_back 与扩容

```cpp
template<class T>
class vector_sketch {
    T* begin_ = nullptr;
    T* end_ = nullptr;
    T* cap_ = nullptr;
public:
    void push_back(const T& value) {
        if (end_ == cap_) grow(size() + 1);
        std::construct_at(end_, value);
        ++end_;
    }
private:
    std::size_t size() const { return begin_ ? end_ - begin_ : 0; }
    std::size_t capacity() const { return begin_ ? cap_ - begin_ : 0; }
    void grow(std::size_t need);
};
```

- grow 分配新存储、先构造新元素、再移动或复制旧元素，成功后释放旧存储。
- 异常时用守卫销毁已构造元素并归还新存储。

### 8.8 手写 LRU 缓存

```cpp
class LRU {
    int cap_;
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> index_;
public:
    explicit LRU(int cap) : cap_(cap) {}
    int get(int key) {
        auto it = index_.find(key);
        if (it == index_.end()) return -1;
        items_.splice(items_.begin(), items_, it->second);
        return it->second->second;
    }
    void put(int key, int value) {
        auto it = index_.find(key);
        if (it != index_.end()) {
            it->second->second = value;
            items_.splice(items_.begin(), items_, it->second);
            return;
        }
        if ((int)items_.size() == cap_) {
            index_.erase(items_.back().first);
            items_.pop_back();
        }
        items_.emplace_front(key, value);
        index_[key] = items_.begin();
    }
};
```

- 链表维护访问顺序，哈希表定位节点，get 与 put 都是 O(1)。

### 8.9 手写线程安全队列

```cpp
template<class T>
class BlockingQueue {
    std::mutex m_;
    std::condition_variable cv_;
    std::deque<T> q_;
    bool closed_ = false;
public:
    void push(T value) {
        {
            std::lock_guard<std::mutex> lock(m_);
            if (closed_) return;
            q_.push_back(std::move(value));
        }
        cv_.notify_one();
    }
    bool pop(T& out) {
        std::unique_lock<std::mutex> lock(m_);
        cv_.wait(lock, [this] { return closed_ || !q_.empty(); });
        if (q_.empty()) return false;
        out = std::move(q_.front());
        q_.pop_front();
        return true;
    }
    void close() {
        {
            std::lock_guard<std::mutex> lock(m_);
            closed_ = true;
        }
        cv_.notify_all();
    }
};
```

- 条件变量必须配合谓词循环，关闭时唤醒所有等待者。

### 8.10 反转字符串中的单词

```cpp
void reverseWords(std::string& s) {
    std::reverse(s.begin(), s.end());
    for (std::size_t i = 0; i < s.size();) {
        std::size_t j = i;
        while (j < s.size() && s[j] != ' ') ++j;
        std::reverse(s.begin() + i, s.begin() + j);
        i = j + 1;
    }
}
```

- 先整串反转，再逐词反转；原地操作，O(n) 时间。

### 8.11 手写二分查找的边界

```cpp
int lower_bound(const std::vector<int>& a, int x) {
    int lo = 0, hi = (int)a.size();
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
```

- 循环不变式是答案落在 [lo, hi]，先把边界写对再谈优化。

### 8.12 手写归并排序

```cpp
void mergeSort(std::vector<int>& a, std::vector<int>& buf, int l, int r) {
    if (r - l <= 1) return;
    int m = l + (r - l) / 2;
    mergeSort(a, buf, l, m);
    mergeSort(a, buf, m, r);
    int i = l, j = m, k = l;
    while (i < m && j < r) buf[k++] = (a[j] < a[i]) ? a[j++] : a[i++];
    while (i < m) buf[k++] = a[i++];
    while (j < r) buf[k++] = a[j++];
    std::copy(buf.begin() + l, buf.begin() + r, a.begin() + l);
}
```

- 稳定排序，时间 O(n log n)，需要 O(n) 额外空间。

### 8.13 手写简化 unique_ptr

```cpp
template<class T>
class unique_ptr_sketch {
    T* p_ = nullptr;
public:
    explicit unique_ptr_sketch(T* p = nullptr) noexcept : p_(p) {}
    unique_ptr_sketch(unique_ptr_sketch&& o) noexcept : p_(o.p_) { o.p_ = nullptr; }
    unique_ptr_sketch& operator=(unique_ptr_sketch&& o) noexcept {
        if (this != &o) { delete p_; p_ = o.p_; o.p_ = nullptr; }
        return *this;
    }
    unique_ptr_sketch(const unique_ptr_sketch&) = delete;
    unique_ptr_sketch& operator=(const unique_ptr_sketch&) = delete;
    ~unique_ptr_sketch() { delete p_; }
    T* get() const noexcept { return p_; }
};
```

- 复制被删除，移动转移所有权，析构释放。

### 8.14 手写生产者消费者

```cpp
std::mutex m;
std::condition_variable cv;
std::deque<int> q;
const std::size_t kMax = 8;

void producer(int n) {
    for (int i = 0; i < n; ++i) {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock, [] { return q.size() < kMax; });
        q.push_back(i);
        cv.notify_all();
    }
}

void consumer(int n) {
    for (int i = 0; i < n; ++i) {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock, [] { return !q.empty(); });
        int v = q.front();
        q.pop_front();
        cv.notify_all();
    }
}
```

- 两个条件变量或一个 notify_all 都可以，关键是谓词与循环等待。

### 8.15 判断链表是否有环并找入口

```cpp
ListNode* detectCycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) {
            ListNode* p = head;
            while (p != slow) { p = p->next; slow = slow->next; }
            return p;
        }
    }
    return nullptr;
}
```

- 快慢指针相遇后，从头与相遇点同速前进，交点即入口。

---

## 9. 进阶与易错点

### 9.1 inline 的作用？

- 建议编译器展开函数体，避免调用开销；类内定义的成员函数隐含 inline。
- C++17 起 inline 变量允许多个翻译单元定义同一变量，由链接器合并。

### 9.2 extern "C" 的作用？

- 按 C 语言链接，关闭名称修饰，用于 C 与 C++ 互操作。
- 不能用于重载函数，因为 C 没有重载。

### 9.3 空类的大小为什么是 1？

- 保证不同对象有不同地址；空基类作为基类时可以被优化掉，不占空间。

### 9.4 this 指针与 const 成员函数？

- this 是非静态成员函数的隐式参数；const 成员函数中 this 的类型是 const T*。
- 可以显式使用 this 返回 *this，实现链式调用。

### 9.5 friend 的规则？

- 单向、不可继承、不可传递；声明在类内，定义可以在类内或类外。
- 用于运算符重载与需要访问私有成员的辅助类。

### 9.6 四种类型转换如何选择？

- static_cast 用于相关类型与显式转换；dynamic_cast 用于多态类型的安全向下转换。
- const_cast 去 const，reinterpret_cast 按位重解释，最危险；优先用显式转换而非 C 风格转换。

### 9.7 运算符重载的限制？

- 不能改变优先级、结合性与操作数个数；不能重载 ::、.、.*、?:、sizeof 等。
- 至少一个操作数必须是类或枚举类型。

### 9.8 C 与 C++ 的兼容差异？

- void* 隐式转换、函数声明、名称修饰、默认参数、struct 标签作用域等。
- 边界处用 extern "C" 与兼容头处理。

### 9.9 编译链接过程？

- 预处理、编译（生成翻译单元）、汇编、链接（符号解析与重定位）。
- 模板实例化发生在编译期，链接器只处理符号。

### 9.10 名称修饰与 ABI？

- C++ 符号包含命名空间与参数类型信息，不同编译器或版本可能不兼容。
- extern "C" 使用未修饰符号，跨语言可用。

### 9.11 前置声明与 include 的取舍？

- 前置声明减少依赖与编译时间，但只能用于指针与引用；需要完整类型时仍要 include。
- 模板与别名无法前置声明。

### 9.12 static 与 extern 的链接性？

- static 修饰全局名给内部链接；extern 声明外部链接对象。
- const 全局变量在 C++ 中默认内部链接。

答案力求准确简洁，实际面试中建议结合项目经验深入阐述。

---

## 10. 编译、链接与 ABI

### 10.1 编译的四个阶段各做什么？

- 预处理展开宏与头文件，编译生成汇编，汇编生成目标文件，链接解析符号并重定位。

### 10.2 为什么头文件不能放定义？

- 头文件被多个翻译单元包含，非 inline 定义会违反 ODR，链接时重复定义。

### 10.3 inline 函数与 ODR？

- inline 函数允许多份定义，但要求一致，链接器用 COMDAT 或弱符号合并。
- 与优化器的 inline 展开是两件事。

### 10.4 静态库与动态库的区别？

- 静态库在链接时复制进可执行文件；动态库运行时加载，可共享，但需要处理版本与搜索路径。

### 10.5 符号可见性与导出？

- 默认可见性导出所有符号；用 visibility 属性或导出表控制，减少符号冲突与二进制体积。
- Windows 用 __declspec(dllexport) 与 .def 文件。

### 10.6 名称修饰（mangling）示例？

- Itanium ABI 把 f(int) 修饰为 _Z1fi；extern "C" 不加修饰。
- 名称修饰让重载与命名空间可行，但跨编译器不保证兼容。

### 10.7 ABI 包含哪些内容？

- 类型布局与对齐、调用约定、名称修饰、异常传播、RTTI、标准库容器的表示。

### 10.8 为什么修改类布局会破坏 ABI？

- 旧二进制按旧偏移访问成员；布局变化后读写错位，必须重新编译所有使用者。

### 10.9 -fno-exceptions 与 -fno-rtti 的影响？

- 禁用异常后 throw 与 catch 不可用，标准库的错误路径改为终止；禁用 RTTI 后 dynamic_cast 与 typeid 受限。
- 库与使用方必须使用一致开关。

### 10.10 LTO 与 unity build 的取舍？

- LTO 跨翻译单元优化，代价是链接时间与内存；unity build 合并源文件，减少重复解析，代价是增量编译变慢。

### 10.11 C++20 模块与头文件的区别？

- 模块按声明导入，避免宏泄漏与重复解析；需要编译器与构建系统支持。
- 头文件仍是当前跨平台最稳妥的方式。

### 10.12 静态初始化顺序问题？

- 不同翻译单元的动态初始化顺序未指定，跨单元依赖可能读到未初始化对象。
- 用函数内局部静态或 constinit 规避。

### 10.13 std::string 的双 ABI？

- libstdc++ 的 _GLIBCXX_USE_CXX11_ABI 控制旧 COW 与新 SSO 实现，混用会链接或运行期出错。

### 10.14 MSVC 的 _ITERATOR_DEBUG_LEVEL 混用问题？

- 调试与发布档的容器布局不同，混用会导致布局不一致与崩溃；所有翻译单元必须一致。

### 10.15 ABI 兼容性怎么检查？

- 用 abi-compliance-checker、abi-dumper，或把 ABI 测试纳入 CI；同时固定编译器与标准库版本。

---

## 11. 未定义行为与安全

### 11.1 什么是未定义行为？

- 标准不规定结果的程序行为；实现可以做任何事，包括看似正常地运行。
- 它与实现定义、未指定行为不同，后两者仍有约束。

### 11.2 有符号整数溢出？

- 有符号溢出是未定义行为；无符号运算按模 2^N 回绕，有定义。
- 需要回绕语义时显式用无符号类型或检查边界。

### 11.3 数组越界与 one-past-the-end？

- 允许取尾后一位的指针，但解引用它是未定义行为。
- 下标必须小于 size。

### 11.4 解引用空指针或悬空指针？

- 两者都是未定义行为；悬空指针指向已结束生命周期的对象。
- 用智能指针与 RAII 管理生命周期。

### 11.5 读取未初始化变量？

- 读取未初始化的自动变量是未定义行为；静态存储期对象会零初始化。

### 11.6 类型双关的合法写法？

- union 读非活跃成员在 C++ 中是未定义行为；std::bit_cast（C++20）或 memcpy 是合法方式。

### 11.7 严格别名规则？

- 通过不相关类型的指针访问对象可能违反严格别名，属于未定义行为。
- 用 memcpy、std::bit_cast 或 char 类型访问字节表示。

### 11.8 求值顺序的规则？

- C++17 起赋值、移位等运算符有明确的先后规则，但仍有未定序的写法，例如 i = i++ 仍是未定义行为。

### 11.9 有符号与无符号比较？

- 混合比较时通常把有符号转成无符号，负数会变成很大的正数。
- 用 std::cmp_less（C++20）或显式转换处理。

### 11.10 移位的未定义情形？

- 移位数大于等于位宽、左移负数、有符号左移溢出都是未定义行为。

### 11.11 对象生命周期结束后的访问？

- 访问已析构对象是未定义行为；在新的同类型对象复用同一地址时，旧指针可能需要 std::launder。

### 11.12 通过基类指针 delete？

- 基类析构函数非虚时，通过基类指针 delete 派生类对象是未定义行为。

### 11.13 数据竞争为什么是未定义行为？

- 对同一内存位置的无同步并发访问破坏编译器假设，结果无法预测。
- 用原子操作或互斥量建立同步。

### 11.14 memcpy 用于非平凡类型？

- 只对可平凡复制的类型安全；对含指针或虚表的对象按字节复制会破坏不变量。

### 11.15 如何检测未定义行为？

- UBSan、ASan、TSan、Valgrind 与静态分析工具；测试中开启断言与 sanitizer。

---

## 12. 性能与优化

### 12.1 容器选择对缓存的影响？

- 连续存储的 vector 局部性好，链表节点分散；遍历为主的场景优先 vector。

### 12.2 对象布局与伪共享？

- 多线程写同一缓存行的不同变量会互相拖慢；用对齐与填充把热点变量分开。

### 12.3 复制省略与 RVO？

- C++17 起纯右值初始化保证省略复制，返回值优化是常见形式。
- 不要返回 std::move(局部变量)，会阻止 RVO。

### 12.4 移动语义一定更快吗？

- 小对象或可平凡复制的类型，移动与复制成本接近；移动的价值在堆资源转移。

### 12.5 虚函数的开销？

- 每次调用一次间接跳转，阻碍内联优化；热点路径可用去虚化、模板或函数指针替代。

### 12.6 分支预测与 likely？

- C++20 的 [[likely]] 与 [[unlikely]] 给编译器提示；收益依赖 CPU 与代码布局，需测量。

### 12.7 inline 与代码膨胀？

- inline 减少调用开销但增大代码体积，可能降低指令缓存命中；由编译器决定是否展开。

### 12.8 分配器开销与内存池？

- 频繁小分配是热点时用对象池、arena 或 pmr 资源；注意生命周期与线程安全。

### 12.9 reserve 与 shrink_to_fit 的使用边界？

- 能预估规模时 reserve，避免多次重分配；shrink_to_fit 可能触发复制，不要在热路径频繁调用。

### 12.10 哈希表的负载因子？

- 负载因子过高冲突增多，过低浪费内存；按查询与插入比例调 max_load_factor 并 reserve。

### 12.11 字符串 SSO 与 string_view？

- SSO 避免短字符串分配；string_view 避免复制，但不拥有数据，注意生命周期。

### 12.12 如何做可靠的性能测量？

- 用基准框架、固定环境、多次取中位数；避免把优化器优化掉的代码计入，注意预热与频率变化。

---

## 13. 标准与提案常识

### 13.1 C++ 标准有哪些版本？

- C++98、C++03、C++11、C++14、C++17、C++20、C++23、C++26；每三年左右一版。

### 13.2 草案、DIS 与正式标准的关系？

- 工作草案是滚动文本，DIS 是国际标准草案，IS 是正式标准；引用时以正式标准为准。

### 13.3 WG21 的组织结构？

- EWG 管核心语言，LEWG 管库设计，LWG 处理库措辞，CWG 处理核心措辞；提案编号形如 P1234R5。

### 13.4 如何查提案状态？

- 用 wg21.link 与提案列表页；关注采纳版本与 LWG 议题编号。

### 13.5 实现定义、未指定与未定义行为的区别？

- 实现定义要求实现给出文档化的选择；未指定允许实现任选但需一致；未定义行为没有任何保证。

### 13.6 特性测试宏怎么用？

- 用 __cplusplus 判断语言版本，用 __cpp_lib_* 判断库特性；包含 `<version>` 后可用。

### 13.7 三家标准库实现？

- libstdc++（GCC）、libc++（LLVM）、MSVC STL；ABI 与特性覆盖不同，跨库混用要谨慎。

### 13.8 C++26 的主要方向？

- contracts、反射、senders/receivers、标准库加固等；以标准文本与实现状态为准。

### 13.9 C++29 在研方向？

- 模式匹配、契约改进、执行器与网络等仍在讨论；提案不等于标准。

### 13.10 怎么读标准条款？

- 先看锚点与段号，区分规范性措辞（shall、undefined）与注（note）；实现行为只作参考。
