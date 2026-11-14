---
title: "C++ 常见面试题"
slug: "cpp-interview-questions"
date: "2026-10-14"
categories: ["编程语言"]
tags: ["C++"]
draft: false
summary: "覆盖语言基础、面向对象、内存管理、STL、模板、并发与 C++11/14/17/20 新特性共 52 道常见面试题的速答，含手写 String、线程安全单例、快速排序等编程题，末章汇总 inline、`extern \"C\"`、四种类型转换等易错点。"
---

> 覆盖语言基础、面向对象、内存管理、STL、模板、并发、C++11/14/17/20 新特性等方向。

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

### 2.8 深拷贝与浅拷贝？

- 浅拷贝：逐位复制成员，指针共享同一块内存，析构时 double free。
- 深拷贝：为指针成员重新分配内存并复制内容。
- 需要深拷贝时遵循 三法则/五法则：析构、拷贝构造、拷贝赋值（+移动构造、移动赋值）。

### 2.9 什么是 RAII？

- Resource Acquisition Is Initialization：资源获取即初始化。
- 在构造函数中获取资源，析构函数中释放，利用栈对象自动析构保证异常安全。
- 例：智能指针、`std::lock_guard`、`std::fstream`。

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

- `std::unique_ptr`：独占所有权，不可拷贝，可移动。
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

---

## 7. C++11 及以后新特性

### 7.1 常用的 C++11 特性？

- auto、范围 for、nullptr、智能指针、右值引用与移动语义、lambda、`std::thread`、`constexpr`、`using` 别名、可变参数模板、`enum class`、`override`/`final`。

### 7.2 左值和右值的区别？移动语义？

- 左值有名字、可取地址；右值是临时值。
- 右值引用 `T&&` 绑定右值，配合移动构造/移动赋值转移资源，避免深拷贝。
- `std::move` 将左值转为右值引用。

### 7.3 完美转发？

- `std::forward<T>(arg)` 在模板中保持参数的左/右值属性，避免多余拷贝。

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

- 结构化绑定、`if constexpr`、`std::optional`/`variant`/`any`、折叠表达式、`std::string_view`、内联变量、并行算法。

### 7.8 C++20 重要特性？

- Concepts、Ranges、协程（coroutine）、Modules、三路比较 `<=>`、`std::format`、`std::span`。

---

## 8. 常见编程题

### 8.1 手写 String 类（含拷贝构造、赋值、析构）

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

---

## 9. 进阶与易错点

- inline 的作用：建议编译器内联展开，避免函数调用开销；也用于头文件中定义函数以避免重定义。
- `extern "C"` 的作用：按 C 的方式编译链接，避免 C++ 名称修饰（name mangling），用于 C/C++ 混合编程。
- C++ 对象模型：空类大小为 1；含虚函数的类有 vptr，大小增加一个指针。
- this 指针：非静态成员函数隐含参数，指向调用对象。
- 友元：`friend` 破坏封装但提高效率，单向、不可继承、不可传递。
- 四种类型转换：`static_cast`、`dynamic_cast`（多态类型运行时检查）、`const_cast`、`reinterpret_cast`。
- 运算符重载：不能改变优先级和结合性，不能重载 `::`、`.`、`.*`、`?:`、`sizeof`。
- C++ 与 C 的兼容：`struct`/`class` 差异、默认参数、名称修饰、`void*` 隐式转换差异。
- 编译链接过程：预处理 → 编译 → 汇编 → 链接。

答案力求准确简洁，实际面试中建议结合项目经验深入阐述。
