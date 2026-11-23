---
title: "C++ 对齐规则"
slug: "cpp-alignment"
date: "2026-11-19"
tags: ["C++", "对象模型"]
draft: false
summary: "以标准草案、提案与实现源码为据，区分对齐要求、对象布局与分配保证：alignof 与 alignas 的边界、类与数组的对齐推导、基本对齐与扩展对齐、C++17 过度对齐 new、C 分配函数的限制，以及 max_align_t 与 long double 在 ABI 上的差异。"
---

## 0. 结论摘要

对齐有两个层面：对齐要求属于类型，对齐值属于地址。两者的关系由标准规定，具体的数值与偏移由 ABI 决定。

- 类型给出最小对齐要求；`alignas` 只能加强，不能削弱。对象上的 `alignas` 不改变对象的类型，类定义上的 `alignas` 才进入类型。
- 类的布局按成员与基类的对齐要求插入填充，`sizeof(T)` 是 `alignof(T)` 的整数倍，数组的步长就是 `sizeof(T)`。
- 基本对齐的边界是 `alignof(std::max_align_t)`；扩展对齐超过它；新扩展对齐超过 `__STDCPP_DEFAULT_NEW_ALIGNMENT__`。后两个阈值不必相等。
- C++17 起，new 表达式为过度对齐类型选择带 `align_val_t` 的分配函数。不带对齐参数的 `operator new` 只保证非新扩展对齐。
- `malloc` 只保证基本对齐；过度对齐的内存要用 new、`aligned_alloc`、`posix_memalign` 或平台接口取得。
- `max_align_t` 与 `long double` 的对齐是 ABI 的一部分，x86-64 上 GCC/Clang 与 MSVC 不同，不能按单一数值写死。

---

## 1. 范围与口径

对齐规则分散在几个条款里：`[basic.align]` 定义对齐要求与合法对齐值，`[dcl.align]` 规定 `alignas`，`[expr.alignof]` 规定 `alignof`，`[expr.new]` 与 `[new.delete]` 规定分配路径，`[support.types.layout]` 定义 `max_align_t`，`[ptr.align]` 提供运行期调整指针的函数。本文按「类型—声明—存储—分配—ABI」的顺序组织这些规则。

### 1.1 证据分级与版本基准

本文用四类标记区分证据等级，正文按需标注：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | C++ 工作草案的可观察要求 | `[basic.align]/4` 规定合法对齐值是 2 的幂 |
| [paper] | WG21/WG14 提案、缺陷报告与技术勘误 | P0035R4 引入过度对齐 new；N2072 删除 `aligned_alloc` 的大小约束 |
| [impl] | 编译器、标准库或平台 ABI 的实现行为 | MSVC x64 的 `alignof(std::max_align_t)` 为 8 |
| [推断] | 由证据推出的工程判断 | 过度对齐类型不适合直接跨 C ABI 按值传递 |

版本基准：标准侧以 eel.is 的 2026-11 草案快照为准，C++11、C++20、C++23 分别用 N3337、N4861、N4950 对照。实现侧对照 libstdc++ 16.2、MSVC STL 与 libc++ 的 main 分支，平台以 x86-64 的 Linux 与 Windows 为主。实现引用写到头文件、类型名或宏名为止，不写行号，因为行号随版本移动。

草案不是正式标准，正式文本是 ISO/IEC 14882。本文引用的段号对应草案快照，标准换版后可能位移。

### 1.2 不做什么

- 不展开虚表、空基类优化、多继承指针调整等布局细节，相关内容见[《C++ 对象模型》](/post/2026/10/14/cpp-object-model/)。
- 不展开调用约定与栈帧结构，相关内容见[《C/C++ 编译模型》](/post/2026/11/14/c-cpp-compilation-model/)。
- 不展开分配器协议与传播规则，相关内容见[《标准库分配器的演化》](/post/2026/11/14/allocator-evolution/)。
- 不做性能测量，不给绝对耗时与吞吐数字。
- 不覆盖全部编译器扩展，只列常见写法及其边界。

---

## 2. 对齐是什么

### 2.1 地址约束与合法值

[draft] `[basic.align]/1` 把对齐定义为一个实现定义的整数值，表示某个类型的对象可以放置的相邻地址之间的字节数。每个对象类型都对它的所有对象提出对齐要求；`alignas` 可以请求更严格的对齐。在不满足对齐要求的存储中创建对象是未定义行为。

合法对齐值受两条限制：

- `[basic.align]/4` 规定，每个对齐值都是非负的 2 的幂。合法值包括基本类型的 `alignof` 结果，以及实现额外定义的一组值，这组值可以为空。
- `[basic.align]/5` 规定对齐值有强弱之分：数值越大越严格，满足严格对齐的地址也满足任何较弱的合法对齐。

`[basic.align]/6` 要求窄字符类型具有最弱的对齐要求，因此 `alignof(char)`、`alignof(signed char)`、`alignof(unsigned char)` 都是 1。这也解释了为什么字符数组可以作为对齐存储的底层类型：元素本身没有额外的对齐约束，外部再用 `alignas` 抬高整个对象的对齐。

```cpp
static_assert(alignof(char) == 1);
static_assert(alignof(std::max_align_t) >= alignof(double));
```

对齐值不是地址的一部分，也不能从指针类型推导。两个指针类型相同，指向的地址可以有不同的实际对齐；编译器只保证它自己创建的对象满足类型要求。

### 2.2 基本对齐与扩展对齐

[draft] `[support.types.layout]/5` 定义 `std::max_align_t`：一个可平凡复制、标准布局的类型，其对齐要求至少与所有标量类型一样大，并且在所有上下文中都受支持。

在此基础上，`[basic.align]/2` 与 `[basic.align]/3` 划出三条界线：

| 概念 | 阈值 | 保证 |
| --- | --- | --- |
| 基本对齐 | 不大于 `alignof(std::max_align_t)` | 实现在所有上下文中都支持 |
| 扩展对齐 | 大于 `alignof(std::max_align_t)` | 支持哪些值、在哪些上下文支持，由实现定义 |
| 新扩展对齐 | 大于 `__STDCPP_DEFAULT_NEW_ALIGNMENT__` | 需要带 `align_val_t` 的分配函数或自定义分配路径 |

具有扩展对齐要求的类型称为过度对齐类型（over-aligned type）。`[basic.align]/3` 的注指出，过度对齐类型要么是类类型，要么包含一个应用了扩展对齐的类类型；基本类型本身不会过度对齐。

两个阈值不必相等。MSVC x64 上 `alignof(std::max_align_t)` 为 8，`__STDCPP_DEFAULT_NEW_ALIGNMENT__` 为 16，因此 `alignas(16)` 的类型按第一个判据属于过度对齐，按第二个判据不属于新扩展对齐，普通 `operator new` 已经能提供足够的对齐。[impl] GCC/Clang 的 x86-64 Linux 上两者通常都是 16，`alignas(16)` 既不是过度对齐，也不是新扩展对齐。

[draft] `[basic.align]/9` 规定，如果某个上下文不支持请求的扩展对齐，程序是 ill-formed。这条规则把「不支持」放在编译期检查，不把它留到运行期。跨平台代码请求 32 或 64 字节对齐时，需要确认目标平台在对应上下文支持该值。

### 2.3 完整对象与子对象

[draft] `[basic.align]/2` 指出，同一个类型作为完整对象与作为子对象时，所需的对齐可以不同。条款给出的例子是虚基类：`D` 作为完整对象时必须容纳 `B` 子对象，因此要满足 `long double` 的对齐；当 `D` 作为另一个对象的子对象、而该对象也以 `B` 为虚基类时，`B` 子对象可能落在别处，`D` 子对象的对齐要求随之降低。`alignof` 返回的是完整对象情形下的要求。

这条规则的工程含义是：`alignof(T)` 只描述「单独创建一个 T」所需的对齐，不描述「T 出现在任何位置时每个子对象都按这个值对齐」。虚基类的实际偏移与对齐由 ABI 决定，不能从 `alignof` 反推。

C++20 的 `[[no_unique_address]]` 让非静态数据成员成为可能重叠的子对象（potentially-overlapping subobject），其实际大小可以小于 `sizeof`。重叠仍受对齐约束：一个 `alignas(64)` 的成员不会因为可以与别的成员共享地址就放弃 64 字节对齐。

---

## 3. 类型布局中的对齐

### 3.1 成员、基类与填充

类的布局由三条规则共同决定：

- 同一个访问控制区内的非静态数据成员按声明顺序放置，地址递增（`[class.mem]`）。
- 每个成员或基类子对象的地址满足其类型的对齐要求，编译器在成员之间插入填充。
- 类的对齐至少与最严格的成员或基类一样大，`sizeof` 包含尾部填充，使数组中的下一个元素仍然满足对齐。

标准只保证声明顺序与对齐约束，不规定偏移。下面的结构在 LP64 平台上通常占 16 字节：

```cpp
struct Record {
    char tag;     // 偏移 0
    int id;       // 偏移 4
    double value; // 偏移 8
};
```

`sizeof(Record)` 为 16，`alignof(Record)` 为 8；`tag` 后面有 3 字节填充，`value` 后面没有额外填充，因为 16 已经是 8 的整数倍。[impl] 在 i386 SysV 上 `double` 的对齐为 4，同一结构通常变成 12 字节。偏移与大小是实现行为，跨平台接口不应依赖具体数值。

空基类优化（EBO）允许空基类子对象不占独立存储，`[[no_unique_address]]` 允许空成员与相邻成员共享地址。两者都是实现可以采用的布局，标准并未强制；具体采用哪一种由 ABI 决定。判断某个成员的真实偏移，应使用 `offsetof`（仅对标准布局类型有条件支持，见 `[support.types.layout]/1`）或静态断言，不能按成员大小累加。

位域是另一个例外。`[class.bit]` 规定位域在一个可寻址的分配单元内分配，分配单元的大小、位域的排列顺序与跨单元方式由实现定义。`alignas` 不能用于位域（`[dcl.align]/1`），位域也不能取地址。零宽无名位域通常用于把下一个位域推到分配单元边界，但边界本身仍由实现决定。

### 3.2 sizeof、数组与步长

[draft] `[expr.sizeof]/2` 规定，对类应用 `sizeof` 得到的是对象占用的字节数，包括为把该类型的对象放入数组而需要的填充；对数组应用 `sizeof` 得到元素个数乘以元素大小。`[expr.alignof]/3` 规定，对数组类型应用 `alignof` 得到元素类型的对齐。

由此可以推出两条在工程中常用的结论：

- 对任何完整对象类型 `T`，`sizeof(T)` 是 `alignof(T)` 的整数倍。否则 `T` 的数组无法让每个元素都满足对齐。
- 数组的步长等于 `sizeof(T)`，其中包含元素类型的尾部填充。尾部填充属于对象表示，不能通过 `memcpy` 或指针算术跳过。

对象上的 `alignas` 不进入类型，因此不改变 `sizeof` 与 `alignof(decltype(obj))`：

```cpp
alignas(64) char buffer[3];

static_assert(sizeof buffer == 3);
static_assert(alignof(decltype(buffer)) == 1);
```

`buffer` 这个对象从 64 的倍数地址开始，但它的类型是 `char[3]`，元素对齐为 1，大小仍为 3。把同样的 `alignas` 写在类定义上，结果就不同：

```cpp
struct alignas(64) Block {
    char data;
};

static_assert(alignof(Block) == 64);
static_assert(sizeof(Block) == 64);
```

`Block` 的类型本身带有 64 字节对齐要求，`sizeof` 被填充到 64，`Block[2]` 的步长也是 64。`std::array<Block, N>` 与内建数组一样按这个步长排布，元素数量多时内存放大明显。

### 3.3 标准保证到哪一步

把上面的规则合起来，标准保证的是对齐约束与声明顺序，不保证偏移、填充位置与尾部填充的复用方式。下面的差异都属于 ABI：

- 基类的尾部填充能否被派生类复用。Itanium ABI 允许在满足条件时复用，MSVC 的布局通常不复用，`sizeof` 因此不同。[impl]
- 空基类优化是否发生，以及多个空基类能否共享地址。
- 位域的分配单元、字节序内的位序、跨单元规则。
- 虚基类子对象的偏移与对齐。

打包扩展（`#pragma pack`、`__attribute__((packed))`）不在标准内。它把成员放到不满足自然对齐的地址，编译器改为生成不做对齐假设的访问指令。对打包成员取地址并传给假定自然对齐的代码，可能触发未对齐访问；这类布局也不满足标准对对象地址的要求，跨平台时可移植性由实现决定。

---

## 4. alignof 与 alignas

### 4.1 alignof 的操作数

[draft] `[expr.alignof]/1` 规定，`alignof` 的操作数必须是表示完整对象类型的 type-id，或这种类型的数组，或对它们的引用。函数类型与不完整类型不能作为操作数。

结果类型是 `std::size_t`，并且是整型常量表达式（`[expr.alignof]/2`）。`[expr.alignof]/3` 补充两条转换规则：

- 操作数是引用类型时，结果是被引用类型的对齐。
- 操作数是数组类型时，结果是元素类型的对齐。

`alignof` 查询类型层面的对齐要求，不查询某个具体对象的存储。对一个带 `alignas` 的变量，`alignof(decltype(v))` 得到类型的自然对齐，变量被要求的对齐不在其中：

```cpp
struct alignas(32) Block {
    char data[32];
};

alignas(64) Block block;

static_assert(alignof(Block) == 32);
static_assert(alignof(decltype(block)) == 32);
```

`block` 对象实际按 64 字节对齐，但 `Block` 类型的对齐仍是 32。需要用 `alignas` 表达的对齐进入类型时，只能把它写在类定义上。

### 4.2 alignas 的适用范围

[draft] `[dcl.align]/1` 列出 `alignas` 可以出现的位置：

| 位置 | 是否允许 | 效果 |
| --- | --- | --- |
| 变量声明 | 允许 | 提高该对象的对齐，不改变类型 |
| 非静态数据成员 | 允许 | 提高成员对齐，通常抬高类对齐并增加填充 |
| 类定义 | 允许 | 对齐要求进入类型，影响 `alignof`、`sizeof` 与 new |
| 位域 | 不允许 | 位域的布局由分配单元决定 |
| 函数参数、异常声明 | 不允许 | 参数的传递方式由 ABI 决定 |
| 函数声明 | 不允许 | 函数没有对象对齐要求 |

`alignas(type-id)` 等价于 `alignas(alignof(type-id))`（`[dcl.align]/3`）。带省略号的 `alignas` 是包展开，可以对参数包中的每个类型或值各生成一个说明符。

说明符的实参必须是整型常量表达式，并且求值到合法对齐值或 0（`[dcl.align]/2`）。合法对齐值是 2 的幂，因此 `alignas(3)` 是 ill-formed；`alignas(0)` 没有效果。求值到扩展对齐、而实现不支持该上下文时，程序也是 ill-formed。

标准没有把 typedef、函数返回类型或模板参数列为可应用的位置。把 `alignas` 写在这些地方，不能达到「给类型加对齐」的目的；需要类型级对齐时，应定义一个新的类类型。

### 4.3 多个说明符与削弱

[draft] `[dcl.align]/4` 规定，一个实体的对齐要求是所有说明符中最严格的非零值；如果没有说明符，实体的对齐保持不变。多个说明符因此可以叠加，但只有最严格的那个生效：

```cpp
alignas(8) alignas(16) int value; // 对齐为 16
```

[dcl.align]/5 禁止把对齐削弱到低于自然对齐。下面的写法是 ill-formed，因为 `U` 含有 `S` 成员，自然对齐为 8，而 `alignas(1)` 要求 1：

```cpp
struct alignas(8) S {};

struct alignas(1) U {
    S s; // 错误：U 的对齐被削弱到 1
};
```

同样的规则适用于变量：`alignas(2) int x;` 是 ill-formed，因为 `int` 的自然对齐为 4；`alignas(4) int x;` 合法，但没有效果。

### 4.4 类型与实体的分界

`alignas` 写在类定义上与写在变量上，语义不同：

- 类定义上的 `alignas` 改变类型。`alignof(S)`、`sizeof(S)`、`S` 的数组步长、`new S` 的分配对齐都随之改变。
- 变量上的 `alignas` 只改变该对象的存储。`decltype(v)` 仍是原来的类型，`alignof(decltype(v))` 不变，按值传递、放入容器、用 `new` 复制时都不会带上这个对齐。

这条分界解释了一类常见错误：把 `new int` 的结果赋给 `alignas(64) int*`，指针类型不携带对齐信息，分配器也不会因为赋值目标而改变返回地址。需要过度对齐的堆对象，应让类型本身带 `alignas`，或者显式调用带 `align_val_t` 的分配函数。

C++11 的 `std::aligned_storage` 把大小与对齐编码进一个类型，正是为了绕开「变量对齐不进入类型」的限制。它在 C++23 被弃用（P1413R3），替代写法是 `alignas(T) std::byte buffer[sizeof(T)]` 或直接定义带 `alignas` 的类。

### 4.5 跨翻译单元的一致性

[draft] `[dcl.align]/6` 规定，如果实体的定义声明带对齐说明符，其他非定义声明要么指定等价的对齐，要么不带说明符；反过来，任何声明带了说明符，所有定义声明都必须指定等价的对齐。不同翻译单元中的声明不一致时，程序 ill-formed，且不要求诊断（IFNDR）。

这条规则使 `alignas` 成为 ABI 的一部分。类的对齐改变 `sizeof` 与成员偏移，所有看到该类定义的翻译单元必须一致；只在某一个源文件里给前向声明加 `alignas`，或者用不同的宏开关切换对齐，都会产生布局不一致：

```cpp
// 翻译单元 1
struct S { int x; };

// 翻译单元 2
struct alignas(16) S; // 与定义不一致，IFNDR
```

把 `alignas` 放进头文件里的类定义，是避免这类问题的基本做法。预编译库与使用方的编译选项也应一致，否则对齐差异会以难以定位的内存错误出现。

---

## 5. 存储期与分配

### 5.1 静态、线程与自动存储期

静态存储期与线程存储期的对象由编译器放置，符号或段的对齐由编译器与链接器保证。请求的扩展对齐如果在目标平台受支持，编译器会提高符号对齐；如果不支持，按 `[basic.align]/9` 是 ill-formed。

自动存储期的对象放在栈帧里。编译器先保证栈帧满足目标 ABI 的基本对齐，再为超过基本对齐的局部对象调整帧指针或栈指针。[impl] x86-64 的 SysV 与 MSVC ABI 都要求调用前栈指针 16 字节对齐，`alignas(32)` 或 `alignas(64)` 的局部对象由函数序言额外调整。局部对象的对齐不需要分配函数参与。

这两类存储期没有「分配失败」的概念，对齐问题主要在动态存储期。

### 5.2 operator new 的保证

[draft] `[basic.stc.dynamic.allocation]/3` 规定普通分配函数返回值的最小对齐保证：

- 不带 `align_val_t` 参数、名为 `operator new` 的函数，返回的存储对齐于「任何不具有新扩展对齐、且大小等于请求大小的对象」。
- 名为 `operator new[]` 的函数，返回的存储对齐于「任何不具有新扩展对齐、且大小不大于请求大小的对象」。
- 带 `align_val_t` 参数的函数，返回的存储对齐于该参数指定的值。

第一条保证的上界由 `__STDCPP_DEFAULT_NEW_ALIGNMENT__` 决定，与 `alignof(std::max_align_t)` 无关。在 MSVC 这类默认 new 对齐大于 `max_align_t` 的实现上，普通 `operator new` 能覆盖到 16 字节对齐，即使 `max_align_t` 只有 8。

对于新扩展对齐类型，new 表达式选择带 `align_val_t` 的分配函数（`[new.delete.single]/1`、`[expr.new]/19`）。这条路径从 C++17 起可用，之前没有语言层面的保证，过度对齐的 `new` 依赖实现扩展。

```cpp
struct alignas(64) Line {
    std::atomic<int> value;
};

Line* p = new Line; // C++17 起调用 operator new(sizeof(Line), align_val_t(64))
delete p;           // 调用对应的 operator delete
```

分配函数的选择受名字查找影响。如果类内定义了 `operator new`，它会隐藏全局版本；类内版本没有 `align_val_t` 重载时，重载决议会回退到不带对齐参数的版本（`[expr.new]/19`）。回退之后，分配函数仍须返回满足 `alignof(Line)` 的存储；只按 16 字节对齐返回，会让对象创建在不满足对齐的存储中，行为未定义。自定义类内分配器时，这条回退路径需要单独处理。

数组 new 还可能附加簿记开销。实现可以在分配块前放置元素个数，返回给程序的指针相对分配函数返回的地址有偏移；偏移量由实现决定，但返回的指针必须满足元素的对齐。`delete[]` 依赖同一份簿记找回原始地址，对齐与未对齐的分配、释放形式不能混用。

### 5.3 C 分配函数

[draft] `[c.malloc]/2` 让 `malloc`、`calloc`、`realloc` 沿用 C 标准的语义。C 标准只保证这些函数返回的存储满足基本对齐，不保证扩展对齐：

- `malloc`、`calloc`、`realloc` 不能用来创建过度对齐类型的对象，除非另外确认平台实现给了更强的对齐。
- `aligned_alloc` 从 C++17 起由 `<cstdlib>` 提供，接受对齐值与大小。C11 原文要求大小是对齐值的整数倍；DR 460 把不满足时的行为从未定义改为返回空指针；N2072 随后删除了整数倍要求，C17 起不再要求。实现仍可能拒绝不满足旧约束的请求，跨平台代码按整数倍传入最稳妥。
- `aligned_alloc` 在 MSVC CRT 中不提供，Windows 上对应的是 `_aligned_malloc` 与 `_aligned_free`，两者必须配对，不能与 `free` 混用。[impl]
- POSIX 的 `posix_memalign` 要求对齐值是 2 的幂且是 `sizeof(void*)` 的整数倍，成功返回 0，失败返回错误码，得到的指针用 `free` 释放。

`[new.delete.single]/3` 说明默认 `operator new` 的实现是否调用 `malloc` 或 `aligned_alloc` 是未指定的。也就是说，不能假设全局 new 一定走某个 C 函数，也不能用 `free` 释放 new 得到的指针。分配与释放必须来自同一套接口。

```cpp
void* raw = std::aligned_alloc(64, 256); // 256 是 64 的整数倍
if (raw == nullptr) {
    // 处理分配失败
}
// 使用 raw
std::free(raw);
```

这段代码在 MSVC 上不可移植，原因是没有 `std::aligned_alloc`，与对齐语义无关。

### 5.4 在缓冲区中切出对齐地址

[draft] `[ptr.align]/1` 到 `/3` 定义 `std::align`：第一个参数是对齐值，必须是 2 的幂；第二个参数是需要的字节数；后两个参数分别是指针与剩余空间。函数在缓冲区中寻找第一个满足对齐的地址，更新指针与剩余空间，放不下时返回空指针。反复调用可以在同一块缓冲区里切出多个不同对齐的子块。

```cpp
std::byte buffer[256];
void* cursor = buffer + 1;
std::size_t space = sizeof buffer - 1;

void* slot = std::align(64, sizeof(Line), cursor, space);
if (slot != nullptr) {
    Line* line = ::new (slot) Line;
    // 使用 line
    line->~Line();
}
```

放置 new 只负责在给定地址上构造对象，不检查地址是否满足对齐。缓冲区本身需要用 `alignas(T)` 或 `std::align` 准备好，否则构造出的对象位于不满足对齐的存储中。

C++20 的 `std::assume_aligned<N>` 把「这个指针至少 N 字节对齐」告诉编译器，N 必须是 2 的幂。它只影响通过返回指针进行的访问，不检查假设；假设不成立时行为未定义（`[ptr.align]/5` 到 `/9`）。这个函数适合在分配层已经保证对齐、但编译器无法从类型看出对齐的场合。

在复用存储时，如果旧指针仍然指向原来的对象，放置 new 之后通过旧指针访问新对象可能违反生命期规则，需要 `std::launder`（C++17）。对齐正确并不自动解决生命期与指针 provenance 的问题。

---

## 6. 过度对齐类型

### 6.1 判定与支持

过度对齐类型的判据只有一条：`alignof(T) > alignof(std::max_align_t)`。新扩展对齐的判据是`alignof(T) > __STDCPP_DEFAULT_NEW_ALIGNMENT__`。两个判据回答不同的问题：前者决定类型是否属于扩展对齐，后者决定分配路径是否需要 `align_val_t`。

由于基本类型不会过度对齐，过度对齐类型一定涉及类类型：类定义上的 `alignas`，或类成员上的 `alignas` 把整个类抬上去。这也意味着过度对齐是可以在类型层面检查的，不需要运行时探测。

实现是否支持某个扩展对齐、在哪些上下文支持，由实现定义；不支持时程序 ill-formed（`[basic.align]/9`）。常见的支持范围包括全局变量、局部变量、类成员与 new 分配，但具体上界依平台而定。

### 6.2 分配器与容器

标准库分配器的 `allocate` 必须返回适合 `T` 的存储，对齐要求包含在「适合」里。C++17 之后，`std::allocator<T>` 在 `alignof(T) > __STDCPP_DEFAULT_NEW_ALIGNMENT__` 时调用带 `align_val_t` 的全局 new，否则调用普通 new。[impl] libstdc++ 的 `new_allocator::allocate`、MSVC STL 的分配辅助函数与 libc++ 的 `allocator` 都按这个分支处理。

自定义分配器需要自己完成同样的判断。一个固定按 16 字节对齐切块的池，遇到 `alignas(64)` 的元素类型就会返回不满足要求的地址；容器随后在这些地址上构造对象，行为未定义。分配器的对齐分支应写成 `alignof(T) > __STDCPP_DEFAULT_NEW_ALIGNMENT__`，而不写死平台常量。

`std::pmr::memory_resource::allocate(bytes, align)` 把对齐作为参数传入，比传统分配器的接口更直接。默认的 `new_delete_resource` 在需要时调用带 `align_val_t` 的全局 new；自定义内存资源需要按传入的 `align` 调整地址。

容器方面，`std::vector<T>` 的元素步长是 `sizeof(T)`。当 `T` 带 64 字节对齐时，每个元素至少占 64 字节，1000 个 4 字节的计数器会占用约 64 KB，而非 4 KB。对齐带来的内存放大来自类型，不来自 vector 的额外开销。

### 6.3 替换全局分配函数

C++17 的全局分配函数有多组重载：

- `operator new(std::size_t)` 与 `operator new(std::size_t, std::align_val_t)`
- `operator new[](std::size_t)` 与 `operator new[](std::size_t, std::align_val_t)`
- 对应的 `nothrow` 版本与 `delete` 版本

只替换不带对齐参数的版本，过度对齐的 new 仍然走库的默认对齐版本，替换函数收不到这些请求。反过来，只替换对齐版本而不同时处理普通版本，会让两类请求走不同的分配器。替换时应成组处理 new/delete、new[]/delete[]、带与不带 `align_val_t` 的形式，并保持分配与释放配对。

带尺寸参数的 delete 也属于这组接口。替换分配函数时，替换带尺寸的版本时，标准要求同时提供不带尺寸的版本；反过来则建议同时提供。这样可以避免依赖默认实现的转发关系。

### 6.4 缓存行与伪共享

C++17 的 `std::hardware_destructive_interference_size` 给出「两个被并发访问的对象之间建议的最小偏移」，取值至少为 `alignof(std::max_align_t)`（`[hardware.interference]/1`）。它通常对应缓存行大小，标准没有把它固定为 64。

```cpp
struct alignas(std::hardware_destructive_interference_size) Counter {
    std::atomic<long long> value;
};
```

把两个这样的计数器放进同一个数组，每个元素落在独立的对齐块中，通常各占一个缓存行，写入各自的行不会互相失效。代价是内存占用随元素数量线性放大，元素本身的载荷可能只有几个字节。

这个常量是实现定义的，并且可能随编译选项变化。GCC 提供 `-Winterference-size` 警告，提示把该值用于 ABI 可见的布局时，不同 `-mtune` 设置可能产生不一致的结构大小。[impl] 跨模块的稳定 ABI 更适合定义一个项目常量，并在构建期用静态断言核对，避免直接把标准常量写进导出类型。

`std::hardware_constructive_interference_size` 给出相反方向的建议：在同一个缓存行内放置会被一起访问的数据。它同样受实现与编译选项影响。

### 6.5 代价

过度对齐不是免费的：

- 类型大小被填充到对齐的整数倍，数组与容器的内存占用按比例上升。
- 分配函数需要额外空间或专门的对齐接口，分配路径比普通 new 复杂。
- 大量过度对齐对象会增加缓存与 TLB 压力，尤其在对象本身很小时。

是否值得提高对齐，取决于访问模式与并发结构。在没有明确访问模式的情况下给所有类型加 `alignas(64)`，通常只会放大内存足迹。

---

## 7. 实现与 ABI

### 7.1 max_align_t 与 long double

[draft] `std::max_align_t` 的对齐要求至少覆盖所有标量类型，因此它的值通常由最严格的标量类型决定。x86-64 上两套主流 ABI 在这一点的选择不同：

- GCC/Clang 的 x86-64 Linux 使用 80 位扩展精度的 `long double`，存储 16 字节、对齐 16，`max_align_t` 随之为 16。[impl]
- MSVC 的 x86-64 Windows 把 `long double` 定义为 64 位，存储 8 字节、对齐 8，`max_align_t` 随之为 8。[impl]

结果是同一个 `alignas(16)` 类型在 Linux 上是普通类型，在 Windows 上是过度对齐类型；同一个 `alignof(std::max_align_t)` 表达式在两处得到不同值。代码里写死 16 作为「最大基本对齐」，在 MSVC 上是错的。

两套 ABI 的 `__STDCPP_DEFAULT_NEW_ALIGNMENT__` 在 x86-64 上通常都是 16，所以 MSVC 的 `alignas(16)` 虽然属于过度对齐，却不需要 `align_val_t` 分配路径。这个组合说明「过度对齐」与「新扩展对齐」不能互相替代。

### 7.2 基础类型的对齐

下表列出 x86-64 上的典型值，标准没有规定这些数值：

| 类型 | SysV（Linux） | MSVC（Windows） | 备注 |
| --- | --- | --- | --- |
| `char` | 1 | 1 | 字符类型对齐最弱 |
| `int` | 4 | 4 | |
| `long` | 8 | 4 | LP64 与 LLP64 的差别 |
| `long long` | 8 | 8 | |
| `float` | 4 | 4 | |
| `double` | 8 | 8 | |
| `long double` | 16 | 8 | 80 位扩展精度与 64 位 |
| 指针 | 8 | 8 | |
| `std::max_align_t` | 16 | 8 | 由 `long double` 决定 |

32 位 x86、ARM、RISC-V 的取值又不同。例如 i386 SysV 的 `double` 与 `long double` 通常按 4 字节对齐，整体取值与 x86-64 不同。任何跨平台的二进制接口都不应把这张表当作常量表使用，而应在目标平台上用 `alignof` 与静态断言核对。

### 7.3 栈与调用约定

x86-64 的两套 ABI 都要求调用前栈指针 16 字节对齐，函数序言负责把超过这个值的局部对象对齐到 32 或 64。局部对象的对齐由编译器在栈帧内解决，不改变调用约定。

按值传递过度对齐的聚合类型会触及 ABI 规则。不同的 ABI 可能把这类参数放在内存、按引用传递，或要求调用者额外对齐栈上的临时对象；具体方式由 ABI 规定，标准不介入。跨编译器、跨语言的接口如果按值传递带 `alignas(32)` 的结构，双方必须使用同一套 ABI 规则，否则参数位置与布局都可能错位。

C 与 C++ 的布局由各自的 ABI 规定，`alignas` 不会出现在符号或调用约定里。把过度对齐类型暴露给 C 接口时，传指针比传值稳定：指针的大小与传递方式不受被指类型对齐的影响。

### 7.4 编译器扩展

标准写法之外，两套编译器各有扩展：

- MSVC 的 `__declspec(align(N))` 可以放在结构体、联合、类与变量上，语义与 `alignas` 接近但不完全相同。MSVC 从 VS2015 起支持标准 `alignas` 与 `alignof`；更早的版本只能用扩展。[impl]
- GCC/Clang 的 `__attribute__((aligned(N)))` 可以放在类型、变量、成员与 typedef 上，行为由编译器定义。
- `#pragma pack` 与 `__attribute__((packed))` 降低成员对齐，属于布局扩展，不在标准内。

扩展可以表达标准不允许的位置，例如给 typedef 指定对齐，或通过 packed 把成员对齐削弱到自然对齐以下。这些写法在单一编译器上可能工作，跨编译器时没有保证。能写成 `alignas` 的地方，优先用标准写法。

### 7.5 跨模块与跨语言

对齐进入类型后，就成为 ODR 与 ABI 的一部分：

- 同一个类在所有翻译单元中必须有相同的 `alignas`。头文件里的类定义是唯一可靠的位置，前向声明不能替代。
- 预编译库与使用方必须用一致的对齐相关选项构建。混用不同的 `-mpreferred-stack-boundary`、`-mtune` 或打包选项，可能改变栈对齐、结构大小或传参方式。
- C 侧用 `_Alignas` 与 `_Alignof`（C11），`<stdalign.h>` 在 C 中把 `alignas`、`alignof` 定义为宏；C++ 中它们是关键字，`<stdalign.h>` 不把它们定义为宏。
- `extern "C"` 只影响名字修饰与调用约定，不改变布局。`long double`、过度对齐的按值参数、位域布局仍需逐项核对。

---

## 8. 常见误用

| 写法 | 问题 | 修正 |
| --- | --- | --- |
| 用 `malloc` 分配 `alignas(64)` 类型 | `malloc` 只保证基本对齐 | 用 new、对齐分配函数或分配器 |
| `aligned_alloc(64, 100)` | 大小未按对齐取整，部分实现拒绝 | 把大小向上取整到 64 的倍数 |
| `alignas(16) int f(int);` | 函数与参数不能带对齐说明符 | 删除说明符，在函数内定义对齐局部对象 |
| 认为 `alignas(64) int x` 让 `decltype(x)` 带 64 对齐 | 对象对齐不进入类型 | 需要类型级对齐时定义带 `alignas` 的类 |
| 只替换 `operator new(std::size_t)` | 过度对齐分配走 `align_val_t` 重载 | 成组替换所有 new/delete 形式 |
| 自定义分配器固定 16 字节块 | `alignof(T)` 可能更大 | 按 `alignof(T)` 分支或透传对齐参数 |
| `std::vector` 存放大量过度对齐小对象 | 元素步长按对齐放大 | 评估内存预算，或把对齐移到外层 |
| `reinterpret_cast<T*>(buf + 1)` | 地址可能不满足 `alignof(T)` | 用 `std::align` 或 `alignas(T)` 缓冲区 |
| 假设 `max_align_t` 一定是 16 | MSVC x64 为 8 | 用 `alignof(std::max_align_t)` |

---

## 9. 实践规则

1. 用 `alignof` 查询，不写死平台常量。需要「最大基本对齐」时写 `alignof(std::max_align_t)`，需要某个类型的对齐时写 `alignof(T)`。
2. 类型级对齐写在类定义里，并放在头文件中。变量级 `alignas` 不改变类型，不能通过按值传递、容器或 new 复制传播。
3. 过度对齐的堆对象用 new 或支持对齐的分配器。不要用 `malloc`；用 `aligned_alloc` 取得的内存只与 `free` 配对。
4. 手工管理缓冲区时，用 `alignas(T)` 声明缓冲区，或用 `std::align` 在缓冲区内取地址；放置 new 之前确认对齐，之后处理生命期与 `std::launder`。
5. 自定义分配器按 `alignof(T)` 分支，替换全局 new 时成组替换对齐与不对齐、数组与单对象、带尺寸与不带尺寸的形式。
6. 把 `std::hardware_destructive_interference_size` 用在与并发布局相关的地方，不写进需要稳定 ABI 的导出类型；跨模块时用项目常量加静态断言。
7. 跨 ABI 的接口优先传指针，避免按值传过度对齐类型，并用 `static_assert` 核对 `sizeof`、`alignof` 与关键成员的 `offsetof`。

---

## 结论

对齐规则可以压缩成一条链：类型给出对齐要求，`alignas` 只能加强；布局按对齐插入填充，`sizeof` 成为对齐的整数倍；分配函数必须返回满足要求的地址，普通 new 覆盖到新扩展对齐阈值，超过阈值的类型走 `align_val_t`；C 分配函数只覆盖基本对齐。

容易混淆的地方集中在两个分界。第一个是类型与实体：类定义上的 `alignas` 进入类型，变量上的不进入，`decltype` 与按值传递都不会保留后者的对齐。第二个是基本对齐与新扩展对齐：前者的阈值是 `max_align_t`，后者的阈值是 `__STDCPP_DEFAULT_NEW_ALIGNMENT__`，两者在 MSVC x64 上分别是 8 与 16，不能互相替代。

跨平台时，`max_align_t`、`long double`、结构体填充与传参方式都是 ABI 的一部分。可移植的做法是以查询代替假设，把对齐写进类型定义，避免只写在局部声明上，并在接口边界上用静态断言把假设变成编译期错误。

---

## 参考

- 标准草案：`[basic.align]`、`[dcl.align]`、`[expr.alignof]`、`[expr.new]`、`[expr.sizeof]`、`[basic.stc.dynamic.allocation]`、`[new.delete.single]`、`[support.types.layout]`、`[ptr.align]`、`[hardware.interference]`、`[class.mem]`、`[class.bit]`、`[c.malloc]`。
- 直达形式：<https://eel.is/c++draft/basic.align>、<https://eel.is/c++draft/dcl.align>、<https://eel.is/c++draft/expr.alignof>、<https://eel.is/c++draft/expr.new>、<https://eel.is/c++draft/basic.stc.dynamic.allocation>、<https://eel.is/c++draft/new.delete.single>、<https://eel.is/c++draft/ptr.align>。
- 提案与缺陷报告：P0035R4（Dynamic memory allocation for over-aligned data）、P1007R3（assume_aligned）、P1413R3（Deprecate `aligned_storage` and `aligned_union`）、P0154R1（Hardware interference size）、CWG 1305（`alignof` 与未知边界数组的引用）、CWG 2812（Allocation with explicit alignment）、N2072（`aligned_alloc` 大小约束的技术勘误）。
- 实现与文档：libstdc++ 16.2 的 `new_allocator.h` 与 `new_op.cc`、MSVC STL 的 `xmemory` 与 `<new>` 相关头文件、libc++ 的 `new` 头文件、glibc 的 `malloc` 实现；<https://en.cppreference.com/w/cpp/language/alignas>、<https://en.cppreference.com/w/cpp/language/alignof>、<https://en.cppreference.com/w/cpp/memory/c/aligned_alloc>、<https://en.cppreference.com/w/cpp/memory/assume_aligned>。
