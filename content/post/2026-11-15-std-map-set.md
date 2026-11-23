---
title: "std::map 与 std::set 研究"
slug: "std-map-set"
date: "2026-11-15"
tags: ["C++", "标准库"]
series: "C++ 标准库"
series_order: 12
draft: false
summary: "以标准条款、WG21 提案与三家实现源码为证据，梳理 std::map 与 std::set 的节点模型、键的常量语义、插入与节点句柄接口、透明比较器下的异构查找，以及它们与无序容器和 C++23 扁平容器的分工。"
---

## 0. 结论摘要

`map` 与 `set` 的接口语义可以由三条不变量推出：键在容器内不可修改；「等价」由比较器定义，与 `==` 无关；元素以节点为单位独立分配。三条不变量分别决定常量迭代器、`operator[]` 的插入行为、失效规则与内存行为。

1. 红黑树属于实现选择，标准不规定平衡结构。标准只规定查找、插入、删除的对数上界与迭代器稳定性，三家实现都选红黑树；节点布局、头节点设计与自增函数的落点各不相同，这些差异属于 ABI，跨实现不可依赖。
2. 插入接口的区别在「构造发生在哪一步」。`emplace` 无条件构造 `value_type`，键已存在时构造结果被析构；`try_emplace` 先查找，键存在时不构造 `mapped_type` 对象、也不从右值参数移动；`operator[]` 等价于 `try_emplace`。
3. 迭代器稳定性是与 `vector` 的主要差异。插入不使任何迭代器失效，删除只使被删元素的迭代器失效，`extract` 与 `merge` 搬运节点而不复制元素。
4. 「等价」与「相等」是两套关系。容器内的键唯一性由比较器诱导的等价关系判定，容器之间的 `==` 用元素的 `==`。比较器必须给出严格弱序，违反属于未定义行为。
5. 选型按访问模式划分：需要有序遍历与范围查询时用有序容器；只要求平均常数查找时用无序容器；元素少、读多写少、可批量重建时用 C++23 的 `flat_map` 与 `flat_set`。

全文按标准要求、对象模型、接口语义、三家实现、取舍与演进的顺序展开，证据以草案条款与实现源码为主。

---

## 1. 范围、口径与版本基准

本文讨论 `std::map`、`std::set` 与多键版本 `std::multimap`、`std::multiset`；`unordered_*` 与 C++23 的 `flat_*` 只在对比与定位处出现。讨论对象是容器语义与实现路径，不涉及具体业务数据结构的设计。

### 1.1 证据分级与版本基准

本文用四类标记区分证据等级，正文按需标注：

| 标记 | 含义 | 例子 |
| --- | --- | --- |
| [draft] | C++ 工作草案的可观察要求 | `[associative.reqmts.general]/5` 规定 `map` 的 `value_type` |
| [paper] | WG21 提案 | P0083R3 引入节点句柄 |
| [impl] | 标准库实现源码 | libstdc++ 的 `_Rb_tree_header` |
| [推断] | 由证据推出的工程判断 | 节点分配对遍历局部性的影响 |

版本基准：标准侧以 eel.is 的 2026-11 草案快照为准，C++20 与 C++23 的措辞用 N4861、N4950 对照，段号只在影响引用时说明。实现侧对照 libstdc++ 16.2（GCC 16.2.0）、上游 MSVC STL（`_MSVC_STL_VERSION 145`）与 libc++ 的 main 分支；引用实现时写头文件名与类名，不写行号。

草案不是正式标准，正式文本是 ISO/IEC 14882。段号随版本位移，锚点用于定位条款，不保证跨版本稳定。

### 1.2 不做什么

- 不重述 `vector` 的容量模型与失效规则，见系列第 4 篇 [C++ vector 解析](/post/2026/11/14/cpp-vector/)。
- 不重述分配器协议与 pmr 的设计动机，见系列第 2 篇《标准库分配器的演化》。
- 不做性能测试，不给吞吐、延迟或内存占用的具体数字。
- 不展开无序容器的桶策略与 rehash 细节，只在第 7 章做定位对比。

---

## 2. 标准要求

### 2.1 要求集合

`[associative.reqmts.general]/1` 列出四类基本关联容器，并把 `flat_map` 一类描述为由序列容器组合而成的容器适配器；/2 要求比较器在键上诱导严格弱序；/4 区分唯一键与等价键；/5 规定 `value_type`；/6 规定迭代器类别。

三条要求可以概括为：

- 元素按键有序存放，遍历顺序由比较器决定，与插入顺序无关。
- 键的唯一性由比较器诱导的等价关系判定，与 `==` 无关。
- 迭代器是双向迭代器；当 `value_type` 与 `key_type` 相同时，`iterator` 与 `const_iterator` 都是常量迭代器，两者是否为同一类型由实现定义。

第二点决定接口的形状：`find`、`count`、`erase` 都按等价关系工作，比较器因此成为容器身份的一部分，参与构造、比较与 `swap`。

第三点排除随机访问：`std::sort` 对关联容器不可用，需要排序结果时用 `std::vector` 收集再排序，或改用 `flat_map`。

### 2.2 复杂度与失效

| 操作 | 复杂度 | 失效范围 |
| --- | --- | --- |
| `find`、`count`、`contains`、`lower_bound` | 对数 | 无 |
| `insert`、`emplace`、`erase(key)` | 对数 | 无，或仅被删元素 |
| `insert(hint, t)`、`emplace_hint` | 一般对数；插在 `hint` 之前时摊销常数 | 无 |
| `erase(迭代器)`、`extract` | 摊销常数 | 仅该元素的迭代器 |
| `merge` | 以源容器元素数为参数 | 被搬运元素的迭代器仍有效 |
| 遍历、复制、析构 | 线性 | 不适用 |

复杂度条款的前提是树平衡：对数上界来自平衡结构，而不是来自比较器。[draft][associative.reqmts.general] 的表格对 `insert(hint, t)` 写明「一般对数，插在 `p` 之前时摊销常数」，这是 hint 接口的主要价值来源。

失效规则比 `vector` 简单：插入不使任何迭代器、引用或指针失效；删除只使指向被删元素的迭代器与引用失效；`swap` 不使元素的迭代器失效，但 `end()` 可能失效。规则简单的原因是节点不搬家，元素在节点内，节点一旦分配就不移动。

多键版本需要一处修正：`erase(key)` 与 `count` 的复杂度是对数加上等价元素个数，因为同名键可能连续出现多次。

### 2.3 严格弱序

比较器是容器的模板参数，标准要求它在键上诱导严格弱序（[draft][associative.reqmts.general]/2，定义见 `[alg.sorting]`）。严格弱序由四条性质组成：

- 非自反：`comp(a, a)` 为假。
- 非对称：`comp(a, b)` 为真时 `comp(b, a)` 为假。
- 传递：`comp(a, b)` 与 `comp(b, c)` 为真时 `comp(a, c)` 为真。
- 等价传递：由 `!comp(a, b) && !comp(b, a)` 定义的等价关系是传递的。

查找路径依赖三分：小于、大于、等价。比较器若不自洽，同一次查找可能在某个分支得出与插入时不同的结论，元素因此出现「存在但找不到」的现象。标准把这种情形定为未定义行为，不定义降级结果。

最常见的违反是把 `<=` 当作比较器：`comp(a, a)` 为真，非自反性被破坏，查找可能永远走同一侧分支。第二个常见来源是只比较复合键的一部分字段，或让比较依赖可变状态；`[associative.reqmts.general]/3` 要求对同一容器内的任意两个键，`comp` 的返回值始终一致。

### 2.4 比较与相等

容器提供两套关系，容易混用：

- 键的等价：`!comp(a, b) && !comp(b, a)`，用于容器内部的唯一性判定。
- 元素的相等：`operator==`，用于容器之间的比较。

两个 `map` 相等，当且仅当大小相同且按顺序对应的 `pair` 相等；比较用 `pair` 的 `==`，与容器的比较器无关。两个使用不同比较器的容器可以相等；两个键在等价意义下相同的元素在 `==` 意义下未必相同，浮点 NaN 是一例。

`value_comp()` 返回的比较对象只比较键，对 `map` 它就是「由第一个分量诱导的 `pair` 上的序」；`key_comp()` 返回键比较器本身。C++20 起容器的关系运算符由 `<=>` 合成，`<` 按字典序比较，其余运算符由比较结果推出。

---

## 3. 对象模型：节点与红黑树

### 3.1 红黑树不变量

三家实现都用红黑树。红黑树维持五条不变量：

1. 每个节点是红色或黑色。
2. 根节点是黑色。
3. 空指针位置视为黑色叶节点。
4. 红色节点的两个子节点都是黑色。
5. 从任一节点出发到其所有后代叶节点的路径上，黑色节点数相同。

第四、五条合起来给出高度上界：树高不超过 `2 * log2(n + 1)`，查找、插入、删除因此都是对数。插入的再平衡最多两次旋转，删除最多三次，这是红黑树相对其他平衡树的主要优势。

标准不要求红黑树，只要求复杂度与迭代器稳定性。C++23 的 `flat_map` 用有序序列加二分查找满足同一组接口要求，代价是插入与删除变成线性。讨论「标准库为什么用红黑树」时，需要把实现选择与标准要求分开。

### 3.2 节点布局

| 实现 | 节点类型 | 位置 |
| --- | --- | --- |
| libstdc++ | `_Rb_tree_node_base` 与 `_Rb_tree_node` | `bits/stl_tree.h` |
| MSVC STL | `_Tree_node` | `stl/inc/xtree` |
| libc++ | `__tree_node` | `__tree` |

三家节点都由父指针、左指针、右指针、颜色标记与值组成，差异在字段顺序、颜色表示与值的存放方式：

- libstdc++ 的 `_Rb_tree_node_base` 保存 `_M_color`、`_M_parent`、`_M_left`、`_M_right`；`_Rb_tree_node` 继承它，用 `__aligned_membuf` 存放值，值经 `_M_valptr()` 取得。
- MSVC 的 `_Tree_node` 保存 `_Left`、`_Parent`、`_Right`、`_Color`、`_Isnil` 与 `_Myval`，其中 `_Isnil` 标记头节点。
- libc++ 的 `__tree_node` 以 `__is_black_` 布尔量表示颜色，值作为成员跟在节点基类之后。

节点大小由实现定义，典型组成是三个指针加一个颜色字节，再加值本身与对齐填充。这个大小决定每次插入的分配量与遍历时的缓存占用，是 `map` 与 `flat_map` 差别的主要来源。

### 3.3 头节点与 `end()`

树需要一个位置表示 `end()`，三家都用头节点承担，做法不同：

- libstdc++ 的 `_Rb_tree_header` 内嵌一个 `_Rb_tree_node_base` 作为头节点，颜色置红；它的父指针指向根，左指针指向最左节点，右指针指向最右节点。`end()` 就是头节点的地址。
- MSVC 的头节点由 `_Isnil` 标记，父指针指向根，左右指针分别指向最左与最右节点。
- libc++ 另有 `__begin_node_` 直接保存最左节点，`__end_node` 的左指针指向根、父指针指向最右节点。

头节点解释三个可观察行为：`begin() == end()` 表示空容器；`--end()` 合法，得到最大元素；对 `end()` 解引用是未定义行为。迭代器的 `operator--` 需要从 `end()` 回到最右节点，这是头节点必须保存最右指针的原因。

### 3.4 迭代器

关联容器的迭代器是双向迭代器；实现上通常是一个节点指针。`operator++` 走中序后继：有右子树时取右子树的最左节点，否则向上直到从某个节点的左子树上来。`operator--` 对称：有左子树时取左子树的最右节点，否则向上直到从右子树上来；在 `end()` 上执行 `--` 时，从头节点进入最右节点。

落点差异值得一提：libstdc++ 的 `_Rb_tree_increment` 与 `_Rb_tree_decrement` 定义在编译库（`src/c++98/tree.cc`），头文件里只有声明；MSVC 与 libc++ 在头文件内定义。前者每次自增都是一次函数调用，并形成对 libstdc++ 共享库的符号依赖，后者可以被优化器展开[推断]。两者都满足双向迭代器的语义要求。

### 3.5 对象大小与分配单位

容器对象保存三样东西：比较器、头节点、元素计数。空比较器与空分配器通常经空基类优化不占空间；比较器有状态时，它的状态进入对象布局，并成为 ABI 的一部分。`sizeof(std::map<K, V>)` 由实现定义，不应写进依赖代码。

分配单位是节点，一次插入一次分配，一次删除一次归还。容器没有容量概念，也没有 `reserve`；这一点与 `vector` 相反，内存随元素数线性变化，删除立即归还。

---

## 4. 键的常量语义与接口

### 4.1 `value_type` 与常量迭代器

[draft][associative.reqmts.general]/5 规定：`set` 与 `multiset` 的 `value_type` 就是 `key_type`；`map` 与 `multimap` 的 `value_type` 是 `pair<const Key, T>`。/6 规定迭代器是双向迭代器，且 `value_type` 与 `key_type` 相同的容器，其 `iterator` 与 `const_iterator` 都是常量迭代器。

`const` 出现在 `pair` 的第一个分量上，效果是键在容器内不可修改，而 `mapped_type` 对应的值可以。由此产生四条可观察后果：

- `map` 的 `value_type` 不可赋值，因为 `pair` 的赋值要求两个分量都可赋值；需要移动或赋值的算法不能直接作用于 `map` 的元素。
- `set` 的迭代器不能改元素。`iterator` 与 `const_iterator` 的语义相同，标准不规定两者是否为同一类型；跨翻译单元的函数参数统一写 `const_iterator` 可以规避 ODR 问题。
- 结构化绑定声明 `auto& [k, v]` 时，`k` 的类型是 `const Key`。
- 容器要求里的可复制赋值等约束，对 `map` 施加在 `key_type` 与 `mapped_type` 上，而不是 `value_type` 上（[draft][associative.reqmts.general]/8 的注）。

键不可修改是树结构的直接要求：键决定节点在树中的位置，修改键等于破坏查找路径。需要改键时只能搬出节点，见第 4.6 节。

### 4.2 `operator[]` 与 `at`

`map::operator[]` 承担插入语义，与查找接口的行为不同。[draft][map.access]/1 把它定义为 `try_emplace(x).first->second` 的等价形式：键不存在时插入一个默认构造的 `mapped_type` 对象，然后返回引用。

`at` 不做插入：键缺失时抛 `std::out_of_range`。`const` 容器没有 `operator[]`，只读访问只能走 `at`、`find` 或 `contains`。

```cpp
std::map<std::string, int> hits;
++hits["GET"];                 // 键缺失时先插入 0，再加一

if (auto it = hits.find("POST"); it != hits.end())
  use(it->second);

try {
  int n = hits.at("PUT");      // 缺失时抛 std::out_of_range
} catch (const std::out_of_range&) {
  // 未命中
}
```

把 `operator[]` 用在只读查询里，会在容器中留下默认构造的元素，`size()` 随之改变。日志聚合、计数与缓存场景中，这类「查询即写入」可以通过 `contains` 或 `find` 避免。

### 4.3 插入族

四个接口的差异集中在构造时机与参数处理方式：

| 接口 | 构造时机 | 键已存在时 |
| --- | --- | --- |
| `insert` | 参数已是 `value_type` | 无效果，返回已有元素 |
| `emplace` | 先构造，再查找 | 构造结果被析构，节点被归还 |
| `try_emplace` | 先查找，命中则不构造 | 不构造，不从参数移动 |
| `insert_or_assign` | 键不存在时构造 | 对 `mapped_type` 赋值 |

`emplace` 的规范措辞是「当且仅当容器中没有键等价于 `t` 的元素时插入」，`t` 是由参数构造的 `value_type` 对象。实现通常先分配节点、在节点内构造 `value_type`、再沿树查找插入位置；键已存在时，构造出的对象被析构、节点被归还。[paper] `try_emplace` 把查找提前，命中时整个构造过程不发生，右值参数也不会被移动。

这个差别在两类场景中可见：`mapped_type` 对象的构造代价高（例如持有大缓冲区），或者参数是右值且调用方之后还要使用。

```cpp
std::map<int, std::vector<int>> m;
m.emplace(1, std::vector<int>(100));       // 键 1 已存在时也会构造
m.try_emplace(1, 100);                     // 键 1 存在时什么都不做
m.insert_or_assign(1, std::vector<int>{}); // 键 1 存在时移动赋值
```

`try_emplace` 与 `insert_or_assign` 由 [paper] N4279（修订 2.3）提出，C++17 加入。`emplace` 的参数转发有一个副作用值得注意：把左值键写成 `std::move(k)` 时，即使键已存在，`k` 也已经被移动进临时 `pair`，调用方拿到的是移空的对象。

`mapped_type` 不能移动、只能分段构造时，用 `std::piecewise_construct`：

```cpp
m.emplace(std::piecewise_construct,
          std::forward_as_tuple(key),
          std::forward_as_tuple(arg1, arg2));
```

### 4.4 `hint` 插入

`insert(hint, t)` 与 `emplace_hint(hint, args...)` 接受一个位置提示。位置正确时摊销常数，位置错误时退化为对数。前提是 `hint` 必须是容器的有效迭代器，否则行为未定义。

批量插入有序数据时，用 `end()` 作为 hint 的命中率最高；无序数据用 hint 不会比不带 hint 更好。实现的做法通常是比较 hint 及其前驱的键，判断新元素是否正好落在两者之间。

### 4.5 `erase` 与迭代器失效

`erase` 的重载分四类：按迭代器、按迭代器范围、按键，以及 C++23 加入的按异构键。[draft] 规定按迭代器版本的返回值为被删元素的后继，按范围版本返回 `q2` 之前的元素位置，按键版本返回删除数量。C++20 起另有自由函数 `std::erase_if`。

失效范围可以压缩成一句：只有指向被删元素的迭代器与引用失效，其他元素不受影响。这使下面的循环写法成立：

```cpp
for (auto it = m.begin(); it != m.end();) {
  if (it->second == 0)
    it = m.erase(it);   // 用返回值继续
  else
    ++it;
}
```

对比 `vector` 的同类循环，差别在于 `erase` 之后不需要重新计算偏移：其余节点不动。C++20 的 `std::erase_if(m, pred)` 把这段惯用法收敛成一次调用。

### 4.6 节点句柄与 `merge`

[paper] P0083R3 在 C++17 引入节点句柄。`extract` 把元素从容器中摘出，节点所有权转入 `node_type`；`insert(node_type&&)` 与 `merge` 把节点接回容器，元素不复制也不移动。

关键性质有三条：

- 摘出与接回都不改变元素地址。指向该元素的指针与引用在 `extract` 之后仍然有效，只是元素暂时不属于任何容器；接回后继续有效。
- `node_type` 提供 `key()`、`mapped()`（`map` 专有）、`value()` 与 `get_allocator()`，可以原地修改键。
- 容器之间的搬运要求分配器相等（[draft][associative.reqmts.general] 表格中 `insert(node_type&&)` 与 `merge` 的前置条件）；比较器类型可以不同，节点类型只由键类型与分配器决定（[draft][container.node.overview]/1 的表）。

```cpp
std::set<int> a{1, 2, 3};
std::set<int> b{3, 4};

auto nh = a.extract(1);
nh.value() = 5;              // 元素不在容器中，键可以改
b.insert(std::move(nh));     // 搬运节点，不复制元素
a.merge(b);                  // 3 在 a 中已存在，留在 b
```

`insert(node_type&&)` 返回 `insert_return_type`，包含 `inserted`、`position` 与 `node` 三个成员。插入失败时，节点回到返回值的 `node` 成员中，调用方仍拥有该元素。`merge` 不抛异常，除比较器抛出之外；冲突的元素留在源容器。

### 4.7 透明比较器与异构查找

默认比较器 `std::less<Key>` 只接受 `Key`，用其他类型查找时会先构造一个临时 `Key`。[paper] N3657 在 C++14 引入异构查找：比较器声明嵌套类型 `is_transparent` 后，`find`、`count`、`lower_bound`、`upper_bound`、`equal_range` 增加模板重载，直接把实参交给比较器。

```cpp
std::map<std::string, int> a;
a.find("key");                    // 构造临时 std::string

std::map<std::string, int, std::less<>> b;
b.find("key");                    // 直接把 const char* 交给比较器
```

`std::less<>` 是没有模板实参的特化，`operator()` 把比较转交给 `operator<`，对任意可比较的类型都可用。代价是把类型检查从编译期推后：混合符号的整数比较会按常规算术转换进行，`-1` 与 `1u` 一类情形可能给出非预期的序，而这类序一旦进入容器就难以排查。

C++23 通过 [paper] P2077R3 为 `erase` 与 `extract` 增加异构重载，透明比较器的适用范围扩展到删除路径。其余接口的异构重载在草案中陆续补齐，使用前应查特性宏与实现版本。

---

## 5. 三家实现

### 5.1 骨架

去掉 ABI 细节后，树的结构只有三个指针、一个颜色位与一个头节点：

```cpp
template<class Key, class T, class Compare = std::less<Key>>
class tree_sketch {
  struct node {
    node* parent = nullptr;
    node* left = nullptr;
    node* right = nullptr;
    bool red = true;
    std::pair<const Key, T> value;
  };

  node* header_;              // end() 的位置
  std::size_t size_ = 0;
  [[no_unique_address]] Compare comp_{};

public:
  bool empty() const { return size_ == 0; }
};
```

`header_` 的父指针指向根，左指针指向最左节点，右指针指向最右节点；空容器的左右指针指向 `header_` 自身。真实实现还要处理分配器、比较器的空基类优化、常量求值与调试钩子，结构不变。

### 5.2 插入与再平衡

插入分三步：沿树下降找到插入位置与父节点；分配节点并在节点内构造 `value_type`；把节点链接到父节点，再按红黑树规则再平衡。

再平衡分两类：父节点为黑时无需调整；父节点为红时按叔节点颜色分三种情形，分别做变色或旋转。插入最多两次旋转，删除最多三次。[impl] libstdc++ 的对应函数是 `_M_get_insert_unique_pos` 与 `_Rb_tree_insert_and_rebalance`（`bits/stl_tree.h`、`src/c++98/tree.cc`）；MSVC 用 `_Find_lower_bound`、`_Insert_at` 与 `_Rebalance`（`stl/inc/xtree`）；libc++ 用 `__find_equal`、`__insert_node_at` 与 `__balance_after_insert`（`__tree`）。

删除更复杂：被删节点有两个子节点时，实现先把它与中序后继互换，再删除后继位置的节点，最后按被删节点的颜色决定是否修复。这也是 `erase(迭代器)` 摊销常数的来源。

### 5.3 查找与 `hint`

查找是一次从根到叶的下降，每一步比较一次。`lower_bound` 与 `upper_bound` 在下降过程中记录候选位置，`equal_range` 调用两次。`count` 对唯一键容器就是 `find` 的布尔化。

`hint` 插入先做两次比较：`comp(*hint, value)` 与 `comp(value, *prev(hint))`，成立时直接链接，不下降。这解释了「插在 `p` 之前时摊销常数」的措辞：位置的正确性由调用方保证。

### 5.4 分配器与 pmr

节点容器按节点类型重新绑定分配器：`allocator_traits<A>::rebind_alloc<node>`，每次插入调用一次 `allocate(1)`，删除调用一次 `deallocate(1)`。容器对象保存分配器（可能经空基类优化），元素构造走 `allocator_traits::construct`。

`std::pmr::map` 是 `std::map` 与 `polymorphic_allocator` 的组合别名，节点从 `memory_resource` 分配。[impl] 由于 `polymorphic_allocator` 的 `propagate_on_container_swap` 为 `false`，两个使用不同资源的 pmr 容器交换属于未定义行为，这是 pmr 容器最常见的误用。批量构建后不再修改的场景适合 `monotonic_buffer_resource`：节点一次分配、整体释放，避免逐节点归还。

分配器传播由三个 traits 决定，节点容器的行为与 `vector` 相同：复制赋值时若 `propagate_on_container_copy_assignment` 为真，分配器随之替换；移动赋值时若不传播且两个分配器不相等，只能逐元素移动，目标容器保留自己的分配器。节点句柄携带源分配器（[draft][container.node.overview]/2），跨容器搬运节点的前提是两边分配器相等，第 4.6 节的前置条件由此而来。

### 5.5 调试模式与 ABI

节点布局、头节点设计与迭代器类型都是 ABI 的组成部分，三家都用开关控制附加检查：

| 实现 | 开关 | 对布局的影响 |
| --- | --- | --- |
| MSVC STL | `_ITERATOR_DEBUG_LEVEL` 取 0、1、2 | 大于 0 时迭代器带容器代理指针，容器带调试信息 |
| libstdc++ | `_GLIBCXX_DEBUG` | 换成 `__gnu_debug::map` 一类调试容器，迭代器带归属检查 |
| libc++ | `_LIBCPP_HARDENING_MODE` | 以断言为主，不改变布局 |

同一程序的所有翻译单元必须使用同一档位与同一标准库；混用不同档位构建的目标文件属于错误配置，症状通常是运行时崩溃而不是链接错误。libstdc++ 与 libc++ 用版本化的命名空间区分 ABI，MSVC 没有版本命名空间，因此 MSVC 的节点布局一旦发布就不能修改。

### 5.6 三家对照

| 维度 | libstdc++ 16.2 | MSVC STL 145 | libc++ main |
| --- | --- | --- | --- |
| 头文件 | `bits/stl_tree.h` | `stl/inc/xtree` | `__tree` |
| 节点类型 | `_Rb_tree_node` | `_Tree_node` | `__tree_node` |
| 头节点 | `_M_header`，颜色置红 | 带 `_Isnil` 标记 | `__end_node` 加 `__begin_node_` |
| 自增函数 | 编译库中的 `_Rb_tree_increment` | 头文件内 | 头文件内 |
| 计数 | `_M_node_count` | `_Mysize` | 压缩对中的 `size_type` |

差异属于工程取舍与 ABI 历史，标准层面的语义三家一致。可移植代码只依赖标准要求，不依赖节点大小、迭代器表示或自增的落点。

---

## 6. 取舍：节点、局部性与成本

### 6.1 一次插入一次分配

节点容器的成本结构由分配次数决定：插入 n 个元素需要 n 次分配，删除需要 n 次归还。分配器的开销在每次调用中重复，无法像 `vector` 那样通过预留容量摊销。这是 `map` 在批量构建时慢于 `flat_map` 的主要原因[推断]。

节点分散还带来遍历成本的差异：元素地址由分配器决定，遍历顺序由树的中序决定，两者不相关，缓存行利用率低。`flat_map` 的遍历是连续内存的顺序访问，同样的元素数量下访存次数更少。

### 6.2 稳定性与局部性的交换

稳定性与局部性是同一取舍的两面。节点容器保证元素地址在插入、删除、`extract` 与 `merge` 之后保持不变，代价是每个元素一次分配与一次指针跳转。连续容器相反。

需要长期保存元素地址时（观察者、回调注册表、以地址为键的索引），节点容器是满足要求的关联容器。只需要遍历与查找、不需要稳定地址时，`flat_map` 在内存与遍历上更优。

### 6.3 常见陷阱

| 写法 | 问题 | 修正 |
| --- | --- | --- |
| 用 `operator[]` 做只读查询 | 键缺失时插入默认值 | 用 `find`、`contains` 或 `at` |
| 键类型为 `const char*` | 比较指针值而不是字符串内容 | 用 `std::string` 或自定义比较器 |
| 比较器写成 `<=` | 违反非自反性，未定义行为 | 用 `<`，并保证等价传递 |
| 对 `set` 元素 `const_cast` 后修改 | 破坏有序不变量 | 用 `extract` 摘出、改完再插入 |
| 跨分配器 `merge` | 前置条件不满足 | 统一分配器，或逐元素复制 |
| `emplace` 传入 `std::move(k)` 后继续用 `k` | 键已存在时 `k` 仍被移动 | 改用 `try_emplace` |
| 对 `map` 元素调用 `std::sort` | `value_type` 不可赋值 | 收集到 `vector` 再排序 |

最后一行还与键的只读性相关：`map` 的键在遍历中无法修改，需要修正键的批量任务必须走节点句柄或重建容器。

---

## 7. 与无序容器、扁平容器的定位

### 7.1 与 `unordered_map` 的对比

无序容器用哈希表：桶数组加链表，查找平均常数，最坏线性。三处语义差异需要记住：

- 迭代顺序不保证，`rehash` 会改变遍历顺序；有序输出需要额外排序。
- 插入可能触发 `rehash`，使迭代器失效；元素的指针与引用保持有效，因为节点不搬家。
- 需要哈希函数与相等谓词，两者必须一致：`a == b` 为真时 `hash(a) == hash(b)` 必须为真。

| 维度 | `map` 与 `set` | `unordered_map` 与 `unordered_set` | `flat_map` 与 `flat_set` |
| --- | --- | --- | --- |
| 查找 | 对数 | 平均常数，最坏线性 | 对数，常数更小 |
| 有序遍历 | 支持 | 不支持 | 支持 |
| 插入 | 对数，一次分配 | 平均常数，可能 rehash | 线性搬移 |
| 迭代器稳定性 | 插入不影响 | rehash 使迭代器失效 | 插入与删除使迭代器失效 |
| 元素地址稳定 | 是 | 是 | 否 |

范围查询只在有序容器上成立：`lower_bound`、`upper_bound`、`equal_range` 依赖有序性，无序容器没有这些接口。前缀查询、区间统计与按序遍历因此指向 `map` 一侧。

### 7.2 `flat_map` 与 `flat_set` 的定位

C++23 加入 `flat_map`、`flat_multimap`、`flat_set`、`flat_multiset`，提案为 [paper] P0429R9 与 P1222R4，头文件是 `<flat_map>` 与 `<flat_set>`。它们定义在容器适配器一栏，内部由两个序列容器组合：默认是 `std::vector<Key>` 与 `std::vector<T>`，键与值分开存放（[draft][flat.map.overview]/1–/7）。

与 `map` 的差异有四处：

- 不是分配器感知容器（[flat.map.overview]/2 的注）。元素分配由底层序列容器负责，`flat_map` 本身没有 `get_allocator`。
- `value_type` 是 `pair<Key, T>`，键不是 `const`，因为元素要随底层容器搬移。修改键会破坏「键容器与值容器按偏移对应」的不变量，标准把这种修改的后果留给使用者。
- `insert` 与 `erase` 是线性复杂度，`extract` 返回元素值而不是节点句柄，因此没有常数时间的改键路径。
- 迭代器是随机访问迭代器，遍历是连续访问，`containers()` 暴露底层容器的引用。

构造上提供 `sorted_unique` 标签：输入已经有序且无重复时跳过排序，线性完成构建。批量构建、之后以查询为主的场景因此省去逐次分配与再平衡[推断]。

### 7.3 选型规则

- 需要有序遍历、范围查询、稳定元素地址：`map` 或 `set`。
- 只做按键查找与插入删除，不要求顺序，元素数量大：`unordered_map` 或 `unordered_set`。
- 元素数量小、构建后以查询为主、可以整体重建：`flat_map` 或 `flat_set`。
- 需要在容器之间搬运元素而不复制：节点容器加 `extract` 与 `merge`，扁平容器没有等价能力。

---

## 8. 演进

### 8.1 版本变化

| 版本 | 与 `map`、`set` 相关的变化 |
| --- | --- |
| C++98 | 四个关联容器；比较器与分配器作为模板参数 |
| C++11 | 移动语义、`emplace`、`erase` 返回迭代器、`initializer_list`、`allocator_traits` |
| C++14 | 透明比较器与异构查找（N3657） |
| C++17 | `try_emplace`、`insert_or_assign`（N4279）、`extract`、`merge` 与节点句柄（P0083R3） |
| C++20 | `contains`（P0458R2）、`std::erase_if`（P1209R0）、关系运算符由 `<=>` 合成 |
| C++23 | 异构 `erase` 与 `extract`（P2077R3）、`flat_*`（P0429R9、P1222R4）、`insert_range` |
| C++26 | 容器加固（P3471R4）等 |

演进方向集中在两处：把「查找」与「构造」分开；把「改键」从破坏性操作变成可回滚的操作。C++11 之后新增的接口几乎都可以归入这两类，`try_emplace` 与 `insert_or_assign` 属于前者，`extract`、`merge` 与异构 `erase` 属于后者。

### 8.2 仍在讨论的部分

草案快照中 `map` 已出现返回 `optional` 的 `lookup` 接口，来源提案 [paper] P3091R5；该提案在 2026 年仍在 LWG 审查，目标版本晚于 C++26，本文不把它列为可用特性。其余异构重载（`operator[]`、`at`、`try_emplace`）在草案中也已出现模板形式，实现覆盖度不一致，使用前应查特性宏。

常量求值是另一条推进线：草案中 `at` 等成员已标注 `constexpr`，但关联容器的常量求值支持在实现间差异较大，跨编译器的代码不应假定它可用。

---

## 结论

`map` 与 `set` 的行为由三条不变量决定：键不可修改，等价由比较器定义，元素以节点为单位分配。接口的形状、失效规则与成本结构都从这三条推出。

可执行的规则：

1. 键需要修改时用 `extract` 摘出节点、改完再插入，不用 `const_cast`。插入失败时节点留在 `insert_return_type` 中，元素不会丢失。
2. 查询用 `find`、`contains` 或 `at`；`operator[]` 只用于「不存在就创建」的语义。
3. 比较器给出严格弱序，并与键类型一起固定；需要异构查找时显式声明 `is_transparent`。
4. 需要有序遍历、范围查询或稳定元素地址时用有序容器；只要求平均常数查找时用无序容器；元素少、读多写少时用 `flat_*`。
5. 把节点分配当作设计约束：一次插入一次分配，容器与节点的大小由实现定义，不写进依赖代码。

`map` 与 `vector` 的差别在成本模型：`vector` 用重分配换取连续存储，`map` 用每次插入的分配换取地址稳定与有序遍历。选型问题因此可以归结为成本模型的选择。

---

## 参考

- 标准草案：`[associative.reqmts.general]`、`[container.node.overview]`、`[map]`、`[map.access]`、`[set]`、`[flat.map.overview]`、`[flat.set.overview]`、`[unord.req]`、`[container.reqmts]`、`[container.alloc.reqmts]`、`[alg.sorting]`。
- 直达形式：<https://eel.is/c++draft/associative.reqmts.general>、<https://eel.is/c++draft/container.node.overview>、<https://eel.is/c++draft/map.access>、<https://eel.is/c++draft/flat.map.overview>、<https://eel.is/c++draft/unord.req>、<https://eel.is/c++draft/alg.sorting>。
- 历史草案：N4659（C++17）、N4861（C++20）、N4950（C++23），取自 cplusplus/draft 的对应标签。
- 提案：N3657（透明比较器与异构查找，C++14）、N4279（修订 2.3，`try_emplace` 与 `insert_or_assign`）、P0083R3（节点句柄）、P0458R2（`contains`）、P1209R0（`erase_if`）、P2077R3（异构 `erase` 与 `extract`）、P0429R9（`flat_map`）、P1222R4（`flat_set`）、P3471R4（容器加固）、P3091R5（`lookup`，审查中）。
- 实现源码：libstdc++ 16.2.0（`bits/stl_tree.h`、`src/c++98/tree.cc`、`debug/map.h`）、MSVC STL（`stl/inc/xtree`、`stl/inc/xnode_handle.h`）、libc++（`__tree`、`__node_handle`）。
- 标准库文档：<https://en.cppreference.com/w/cpp/container/map>、<https://en.cppreference.com/w/cpp/container/set>、<https://en.cppreference.com/w/cpp/container/flat_map>、<https://en.cppreference.com/w/cpp/container/node_handle>。
