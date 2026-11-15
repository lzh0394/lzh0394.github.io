---
title: "C++ 数据结构与算法面试题"
slug: "cpp-interview-algorithms"
date: "2026-11-15"
tags: ["C++","面试","算法","数据结构"]
series: "C++ 开发岗面试"
series_order: 10
draft: false
summary: "按复杂度、数组与字符串、链表、栈队列、哈希、树、堆、排序、二分、双指针、前缀和、回溯、动态规划、贪心、图论与设计类题目组织 20 章，共 400 道算法面试题；每题给出思路、复杂度、边界与代码要点。"

---

## 1. 复杂度与算法分析

### 1.1 时间复杂度与空间复杂度分别度量什么？

- 时间复杂度统计算法执行的基本操作次数随输入规模的增长趋势，不直接对应实际耗时。
- 空间复杂度统计除输入外额外占用的存储随规模的增长趋势，通常称为辅助空间。
- 两者都以输入规模 n 为自变量，度量的是增长阶而非绝对数值。
- 同一算法在不同数据分布下操作次数不同，需要区分最坏、平均与最好情况。
- 递归算法的空间复杂度包含调用栈深度，不能只看显式申请的容器。
- 输入本身占用的空间不计入辅助空间，原地算法指辅助空间为 O(1)。
- 常数因子、编译优化与硬件差异不改变增长阶，但影响实际耗时。

### 1.2 大 O、大 Ω 与大 Θ 的区别？

- O 给出渐近上界：存在常数 c 与 n0，当 n 不小于 n0 时 f(n) 不超过 c·g(n)。
- Ω 给出渐近下界，Θ 同时给出上界与下界，三者都描述函数集合而非具体数值。
- 「快速排序最坏为 O(n^2)」的表述正确，「快速排序是 O(n^2)」忽略了平均情况更紧的界。
- Θ 比 O 更强，O(n^2) 的算法也可能同时是 O(n^3)，只有 Θ 表示阶数不可再改进。
- 面试中常把 O 当作紧界使用，严格表述应说明是上界还是紧界。
- 小 o 与小 ω 表示严格小于与严格大于的阶，实践中较少使用。
- 渐近记号默认 n 趋于无穷，n 很小时结论可能相反。

### 1.3（辨析）最坏、平均与最好复杂度如何选择？

- 最坏复杂度给出保证，实时系统与服务水平目标通常按最坏情况设计。
- 平均复杂度需要对输入分布建模，分布假设不成立时结论失效。
- 最好复杂度参考价值最低，只说明存在一条代价很低的执行路径。
- 快速排序最坏为 O(n^2)，平均为 O(n log n)，随机化基准可降低退化概率，但不能消除最坏情况。
- 哈希表平均为 O(1)，最坏为 O(n)，取决于哈希函数与冲突处理方式。
- 面试回答应同时给出三种情况，并说明所依赖的输入假设。
- 摊还复杂度与平均复杂度不是同一概念，前者不依赖输入分布。

### 1.4 渐进分析为何忽略常数因子与低阶项？

- n 足够大时最高阶项主导增长，低阶项的占比趋于零。
- 常数因子依赖编译器、指令集与实现细节，不适合作为算法层面的比较依据。
- 忽略常数使不同机器、不同语言之间的结论可以迁移。
- 常数因子在实际规模下仍然重要，n 较小时 O(n^2) 可能快于 O(n log n)。
- 系数差异可达数十倍，同样为 O(n) 的遍历，访存模式不同则耗时不同。
- 工程上通常把渐进阶、常数因子与数据规模三者放在一起判断。
- 渐近结论不适用于 n 固定且很小的场景。

### 1.5（陷阱）O(1) 一定比 O(n) 快吗？

- 渐进阶只描述增长趋势，不描述 n 较小时的绝对耗时。
- O(1) 操作若包含一次随机内存访问或系统调用，可能比顺序扫描数千个整数更慢。
- 哈希表查询平均为 O(1)，但哈希计算、冲突探测与缓存缺失使其常数远大于数组下标访问。
- n 小于某个阈值时，线性扫描往往优于二分查找或树结构。
- 阈值由实现与硬件决定，需要通过测量确定，不能照搬固定数字。
- 复杂度比较的前提是 n 足够大，且比较的是同一类基本操作。

### 1.6 空间复杂度如何计算递归栈？

- 每次递归调用占用一个栈帧，栈帧包含返回地址、参数、局部变量与保存的寄存器。
- 递归深度为 d、单帧大小为 s 时，栈空间为 O(d·s)，s 由实现与调用约定决定。
- 尾递归在部分编译器上可优化为循环，栈空间降为 O(1)，但标准不保证该优化。
- 二分查找的递归版本栈深度为 O(log n)，归并排序为 O(log n)，快速排序最坏为 O(n)。
- 栈帧大小不等于局部变量大小之和，对齐与寄存器保存会增加开销。
- 递归深度过大导致栈溢出，默认栈大小由平台与链接选项决定。
- 用显式栈改写递归可以把栈放在堆上，但辅助空间的阶数不一定降低。

### 1.7（复杂度）递归求斐波那契数列的时间复杂度如何分析？

- 朴素递归 `fib(n) = fib(n-1) + fib(n-2)` 的调用次数满足 T(n) = T(n-1) + T(n-2) + O(1)。
- 递推式的解与斐波那契数同阶，为 Θ(φ^n)，其中 φ 约为 1.618。
- 也可以按递归树计数，第 k 层节点数不超过 2^k，深度为 n，上界 O(2^n) 并不紧。
- 大量子问题被重复计算，n 为 30 时调用次数已达百万量级。
- 记忆化或自底向上递推把复杂度降为 O(n)，空间可降为 O(1)。
- 递归深度为 n，空间复杂度为 O(n)，n 较大时会栈溢出。
- 常见错误是把调用次数写成 O(n)，忽略了分支导致的指数增长。

```cpp
long long fib(int n) {
    if (n < 2) return n;
    long long a = 0, b = 1;
    for (int i = 2; i <= n; ++i) {
        long long c = a + b;
        a = b;
        b = c;
    }
    return b;
}
```

### 1.8（复杂度）二分查找的复杂度如何推导？

- 每次比较后区间长度减半，最多比较 ⌊log2 n⌋ + 1 次。
- 递推式为 T(n) = T(n/2) + O(1)，展开得 O(log n)。
- 前提是序列有序且支持 O(1) 随机访问，链表不满足，二分链表为 O(n)。
- 循环版本空间为 O(1)，递归版本栈深度为 O(log n)。
- 边界包括空区间、单元素、目标小于最小值、目标大于最大值与重复元素的左右边界。
- 中点写成 `lo + (hi - lo) / 2` 可以避免 `lo + hi` 溢出。
- 常见错误是区间定义不统一，`[lo, hi]` 与 `[lo, hi)` 的循环条件与更新方式不同。

```cpp
int lowerBound(const std::vector<int>& a, int target) {
    int lo = 0, hi = static_cast<int>(a.size());
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
```

### 1.9 主定理的三种情形如何判断？

- 形式为 T(n) = a·T(n/b) + f(n)，其中 a 不小于 1、b 大于 1，比较 f(n) 与 n^(log_b a)。
- 情形一：f(n) = O(n^(log_b a - ε))，则 T(n) = Θ(n^(log_b a))。
- 情形二：f(n) = Θ(n^(log_b a))，则 T(n) = Θ(n^(log_b a) · log n)。
- 情形三：f(n) = Ω(n^(log_b a + ε))，且存在常数 c 小于 1 使 a·f(n/b) 不超过 c·f(n)，则 T(n) = Θ(f(n))。
- 归并排序取 a = 2、b = 2、f(n) = Θ(n)，属于情形二，得 Θ(n log n)。
- 二分查找取 a = 1、b = 2、f(n) = Θ(1)，属于情形二，得 Θ(log n)。
- 主定理要求子问题规模相同，且 f(n) 为正函数。

### 1.10（陷阱）主定理不适用时如何处理？

- 子问题规模不等时，例如 T(n) = T(n/3) + T(2n/3) + O(n)，不能直接套用主定理。
- 此时可用递归树，每层代价为 O(n)，深度为 log_{3/2} n，总计 O(n log n)。
- f(n) 不是多项式量级时，例如 T(n) = 2T(n/2) + n log n，落在情形二与情形三之间。
- 这类情况可用扩展主定理，或直接展开求和。
- 子问题数量随层数变化时，例如 T(n) = T(n-1) + O(n)，展开得 O(n^2)。
- 无法判定时先画递归树估算，再用代入法验证上下界。
- 面试中直接套公式而忽略适用条件，是常见的失分点。

### 1.11 摊还分析中的聚合法如何用？

- 聚合法统计连续 m 次操作的总代价，再除以 m 得到每次操作的摊还代价。
- 以二进制计数器自增为例，从最低位起第 i 位（i 从 0 计）在 m 次自增中翻转约 m/2^i 次。
- 总翻转次数不超过 2m，因此单次自增的摊还代价为 O(1)。
- 某一次自增仍可能翻转 O(log n) 位，摊还界不限制单次代价。
- 聚合法不区分操作类型，给出的是所有操作的平均上界。
- 与平均情况分析不同，聚合法不需要对输入分布作假设。
- 适用于操作序列总代价容易整体估计的场景。

### 1.12（辨析）摊还分析与平均情况分析的区别？

- 摊还分析针对一个操作序列，给出最坏序列下的单次平均代价，不涉及概率。
- 平均情况分析针对单个操作，需要对输入分布或随机化建模，结果通常为期望值。
- 摊还界对每个序列都成立，平均界只在假设的分布下成立。
- `std::vector` 尾部插入的摊还代价为 O(1)，但某次插入可能因扩容达到 O(n)。
- 哈希表在好的哈希函数下平均为 O(1)，最坏为 O(n)，这是平均分析而非摊还分析。
- 随机化快速排序的 O(n log n) 是期望复杂度，依赖随机数质量。
- 混用两个概念会导致结论的适用范围出错。

### 1.13 会计法与势能法如何给 `std::vector` 扩容定摊还代价？

- 会计法为每次插入预付固定代价，多余部分存入账户，用于支付扩容时的复制。
- 容量按几何级数增长时，n 次插入的总复制次数不超过 2n。
- 势能法取势函数为 2·size - capacity，插入与扩容引起的势能变化可抵消复制代价。
- 两种方法都得到摊还 O(1)，前提是增长因子大于 1 且与 n 无关。
- 若每次只增加固定容量，n 次插入的总复制次数为 Θ(n^2)，摊还代价为 O(n)。
- 标准未规定增长因子，具体策略由实现定义，主流实现采用几何增长。
- 扩容时迭代器与引用失效，摊还分析不改变这一点。

### 1.14（复杂度）`std::vector` 尾部插入的摊还复杂度为何是 O(1)？

- 单次 `push_back` 在容量足够时为 O(1)，容量不足时需要重新分配并搬移全部元素。
- 设增长因子为 2，第 k 次扩容的复制量为 2^(k-1)，n 次插入的复制总量小于 2n。
- n 次插入的总代价为 O(n)，摊还到每次为 O(1)。
- 增长因子越大，扩容次数越少，但浪费的空间越多；因子接近 1 则摊还代价上升。
- `reserve` 可以预先分配，避免扩容与迭代器失效，但不改变摊还结论。
- 摊还 O(1) 不意味着每次插入都很快，单次最坏仍为 O(n)。
- 元素类型的搬移代价较高时，扩容的实际耗时会显著增加。

### 1.15 快速排序的平均与最坏复杂度如何推导？

- 每轮以基准划分，划分代价为 O(n)，总代价取决于划分是否均衡。
- 最坏情况每次划分只减少一个元素，递归式 T(n) = T(n-1) + O(n)，得 O(n^2)。
- 最好情况每次均分，T(n) = 2T(n/2) + O(n)，得 O(n log n)。
- 平均情况下基准落在中间区域，递归深度为 O(log n)，总代价为 O(n log n)。
- 随机选基准或三数取中可以降低退化概率，但不能把最坏情况变为 O(n log n)。
- 已排序输入配合固定端点为基准时最容易退化，递归深度达到 n。
- 栈空间平均为 O(log n)，最坏为 O(n)，可用尾递归消除或显式栈限制深度。

```cpp
int partition(std::vector<int>& a, int lo, int hi) {
    int pivot = a[hi];
    int i = lo;
    for (int j = lo; j < hi; ++j) {
        if (a[j] < pivot) std::swap(a[i++], a[j]);
    }
    std::swap(a[i], a[hi]);
    return i;
}
```

### 1.16（陷阱）递归深度与栈溢出如何估算？

- 默认线程栈大小由平台决定，Linux 常见为 8 MiB，Windows 常见为 1 MiB，可用链接选项或 `setrlimit` 调整。
- 单帧大小等于返回地址、参数、局部变量与对齐填充之和，优化后可能变化。
- 深度上限约为栈大小除以单帧大小，该估算不含库函数调用与信号处理栈。
- 递归深度为 n 的算法在 n 为十万级时通常不可用，应改写为迭代。
- 快速排序最坏递归深度为 n，即使平均为 log n，也应限制深度或改用堆排序兜底。
- 尾调用优化由编译器决定，不能作为可移植的保证。
- 调试构建的栈帧通常更大，发布构建通过不代表调试构建通过。

### 1.17 对数复杂度中的底数为何可以忽略？

- 换底公式给出 log_a n = log_b n / log_b a，底数之间只差一个常数因子。
- 渐进记号忽略常数因子，因此 O(log_2 n) 与 O(log_10 n) 同阶。
- 算法分析中通常不写底数，直接记为 O(log n)。
- 底数在精确计数时仍有意义，按 2 分与按 3 分的比较次数不同。
- 对数增长极慢，n 从 10^6 增加到 10^9，log2 n 只从 20 增加到 30。
- 指数中的对数不能随意省略，n^(log n) 的阶与底数相关。
- 在 64 位平台上，n 不超过 2^64 时 log2 n 不超过 64，可据此估算循环层数。

### 1.18（代码阅读）双重循环的复杂度如何判断？

- 内外循环都从 0 到 n 时为 O(n^2)，总迭代次数为 n^2。
- 内层上界依赖外层变量时需要求和，例如 Σi 为 n(n+1)/2，仍为 O(n^2)。
- 内层每次翻倍或减半时，总次数为 O(n log n)。
- 外层步长不为 1 时按实际迭代次数计算，例如 `i *= 2` 时外层为 O(log n)。
- 循环体内调用复杂度为 O(n) 的函数时，总代价为 O(n^3)。
- `break` 与提前返回会改变最坏情况下的实际执行次数，但不改变上界。
- 只看嵌套层数容易误判，必须看每层的迭代次数。

```cpp
for (int i = 1; i < n; i *= 2)
    for (int j = 0; j < n; ++j)
        work(i, j);
```

### 1.19（场景）输入规模为 10^5 时如何根据时限选择算法？

- 面试与竞赛环境通常按 1 秒处理约 10^8 次简单操作估算，实际取决于常数与硬件。
- n 为 10^5 时，O(n^2) 约为 10^10，通常超时；O(n log n) 约为 1.7×10^6，可行。
- n 为 10^5 时，O(n√n) 约为 3×10^7，处在边界，需要看常数。
- 需要多次查询时，预处理 O(n log n) 加单次 O(log n) 通常优于每次 O(n)。
- 空间限制同样需要估算，O(n log n) 的辅助数组在 n 为 10^6 时可能超过限制。
- 估算应按最坏情况与最大常数计算，不按平均情况。
- 实际选型还要考虑实现复杂度与边界处理的成本。

### 1.20（陷阱）复杂度相同为何实际耗时差一个量级？

- 基本操作的代价不同，整数加法、缓存命中访问、随机内存访问与系统调用相差数个数量级。
- 访问模式决定缓存命中率，同样为 O(n) 的遍历，顺序访问与跨步访问的带宽利用率不同。
- 分支预测失败、虚函数调用与内存分配会引入额外开销。
- 常数因子还受编译优化、函数展开与自动向量化影响。
- 数据结构的内存布局影响局部性，链表的 O(n) 遍历通常慢于数组。
- 输入分布影响实际路径，平均复杂度相同不代表每条路径代价相同。
- 比较实现时应固定输入与测量条件，用计时数据而非阶数下结论。

---

## 2. 数组与字符串

### 2.1 数组下标为什么从 0 开始？

- 下标表示相对首地址的偏移量，`a[i]` 的地址为 `a + i * sizeof(T)`。
- 从 0 开始使偏移计算少一次减法，访问表达式更直接。
- 半开区间 `[0, n)` 的长度为 n，空区间表示为 `[i, i)`，边界规则统一。
- 从 1 开始会使长度为 n 的区间写成 `[1, n]`，空区间需要额外约定。
- C++ 不检查下标越界，越界访问属于未定义行为。
- `std::vector::operator[]` 同样不检查，`at` 才抛出异常。
- 多维数组按行优先存储，元素 `(i, j)` 的偏移为 `i * cols + j`。

### 2.2（实现）如何原地删除有序数组中的重复元素？

- 数组有序，重复元素相邻，可用快慢指针一次遍历完成。
- 慢指针 `k` 指向已保留区间的末尾，快指针 `i` 扫描全部元素。
- 当 `a[i] != a[k]` 时，把 `a[i]` 写到 `a[k+1]` 并递增 `k`。
- 返回 `k + 1` 即新长度，区间 `[0, k]` 为结果。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空数组返回 0，单元素返回 1。
- 常见错误是先写后比较导致首元素被覆盖，或返回下标而非长度。

```cpp
int removeDuplicates(std::vector<int>& a) {
    if (a.empty()) return 0;
    int k = 0;
    for (int i = 1; i < static_cast<int>(a.size()); ++i) {
        if (a[i] != a[k]) a[++k] = a[i];
    }
    return k + 1;
}
```

### 2.3（实现）如何原地移除指定元素并返回新长度？

- 快指针读取，慢指针写入，等于目标值的元素跳过。
- 与删除重复元素不同，这里不要求有序，剩余元素的相对顺序仍然保持。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 返回慢指针位置即新长度，尾部元素的内容不再有意义。
- 边界：全部元素都等于目标值时返回 0，空数组返回 0。
- 常见错误是在循环中调用 `erase`，导致 O(n^2) 且迭代器失效。
- 若要求保持剩余元素相对顺序，快慢指针仍然适用。

```cpp
int removeElement(std::vector<int>& a, int val) {
    int k = 0;
    for (int x : a) {
        if (x != val) a[k++] = x;
    }
    return k;
}
```

### 2.4（实现）如何将数组向右旋转 k 位？

- 先对 n 取模，令 `k %= n`，避免 k 大于 n 时重复旋转。
- 三次反转：整体反转、前 k 个反转、后 n-k 个反转。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：n 为 0 或 1 时直接返回，k 为 0 时无需操作。
- k 为负数时应先加 n 再取模，否则下标越界。
- 反转区间用半开区间 `[first, last)`，避免差一错误。

```cpp
void rotate(std::vector<int>& a, int k) {
    int n = static_cast<int>(a.size());
    if (n == 0) return;
    k %= n;
    if (k < 0) k += n;
    std::reverse(a.begin(), a.end());
    std::reverse(a.begin(), a.begin() + k);
    std::reverse(a.begin() + k, a.end());
}
```

### 2.5（辨析）三次反转与额外数组两种旋转方案如何取舍？

- 额外数组把后 k 个元素复制到新数组前部，再复制其余部分，时间为 O(n)，空间为 O(n)。
- 三次反转原地完成，空间为 O(1)，写操作次数约为 2n。
- 额外数组实现简单，适合 k 较大或调用方仍需保留原数组的场景。
- 三次反转全程连续访问，缓存友好，常数较小。
- 元素复制代价较高时，额外数组的复制成本更高。
- 原地方案会修改输入，调用方若要保留原数组必须自行复制。
- 面试中应说明两种方案的复杂度与修改语义，再按约束选择。

### 2.6（实现）如何用双指针判断回文串？

- 左右指针分别从两端向中间移动，跳过非字母数字字符。
- 比较时统一转小写，避免大小写差异。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空串与单字符视为回文，全部为非字母数字字符时也视为回文。
- `char` 可能为负值，传给 `std::tolower` 前应转换为 `unsigned char`。
- 常见错误是只比较字符而忽略标点与空格。

```cpp
bool isPalindrome(const std::string& s) {
    int i = 0, j = static_cast<int>(s.size()) - 1;
    while (i < j) {
        while (i < j && !std::isalnum(static_cast<unsigned char>(s[i]))) ++i;
        while (i < j && !std::isalnum(static_cast<unsigned char>(s[j]))) --j;
        if (std::tolower(static_cast<unsigned char>(s[i])) !=
            std::tolower(static_cast<unsigned char>(s[j]))) return false;
        ++i;
        --j;
    }
    return true;
}
```

### 2.7（实现）如何在字符串中查找第一个不重复的字符？

- 第一次遍历统计每个字符的出现次数，第二次遍历按原顺序找计数为 1 的字符。
- 字符集为单字节时用长度 256 的计数数组，时间为 O(n)，空间为 O(1)。
- 字符集为 Unicode 时需要用哈希表按码位统计。
- 返回下标而非字符，找不到时返回 -1。
- 边界：空串返回 -1，全部重复返回 -1。
- 常见错误是遍历哈希表取第一个计数为 1 的键，哈希表的顺序不确定。

```cpp
int firstUniqChar(const std::string& s) {
    int count[256] = {};
    for (unsigned char c : s) ++count[c];
    for (int i = 0; i < static_cast<int>(s.size()); ++i) {
        if (count[static_cast<unsigned char>(s[i])] == 1) return i;
    }
    return -1;
}
```

### 2.8 字符统计为什么常用长度为 256 的数组？

- `char` 在多数平台上为 8 位，取值共 256 种，可用值域直接作为下标。
- 数组访问为 O(1)，常数比哈希表更小，且无需额外分配。
- 需要先把 `char` 转为 `unsigned char`，否则负值下标越界。
- 只统计小写字母时可用长度 26 的数组，下标为 `c - 'a'`。
- 字符集超过 256 时，例如 UTF-8 字节序列或宽字符，应改用哈希表。
- 计数数组的大小写成 `1 << CHAR_BIT` 或 `std::numeric_limits<unsigned char>::max() + 1`。
- 该做法统计的是字节而非字符，多字节编码下语义不同。

### 2.9（陷阱）`char` 是否有符号对字符统计有什么影响？

- `char` 的符号性由实现定义，x86 平台常见为有符号。
- 有符号 `char` 的取值可能为负，直接作为数组下标会越界。
- 比较与转换前应显式转换为 `unsigned char`。
- `std::isspace`、`std::tolower` 等函数要求参数可表示为 `unsigned char` 或等于 `EOF`，传负值属于未定义行为。
- 用 `int` 接收 `std::string::operator[]` 的返回值不能消除符号问题，必须在调用处转换。
- 字符分类结果还受当前 locale 影响。
- 常见错误是写成 `char c = s[i]; std::isalpha(c);`，在非 ASCII 字节上触发未定义行为。

### 2.10（实现）如何实现 `atoi` 风格的字符串转整数？

- 跳过前导空白，处理可选的正负号，逐位累加。
- 遇到非数字字符停止，返回已解析的部分。
- 结果用 `long long` 或 `int64_t` 暂存，便于在累加过程中判断溢出。
- 正溢出返回 `INT_MAX`，负溢出返回 `INT_MIN`。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空串、只有符号、前导零、`"-0"`、超出范围。
- 标准库 `std::from_chars` 提供不抛异常且能报告错误的替代。

```cpp
int myAtoi(const std::string& s) {
    std::size_t i = 0;
    while (i < s.size() && s[i] == ' ') ++i;
    int sign = 1;
    if (i < s.size() && (s[i] == '+' || s[i] == '-')) {
        sign = (s[i] == '-') ? -1 : 1;
        ++i;
    }
    long long value = 0;
    while (i < s.size() && s[i] >= '0' && s[i] <= '9') {
        value = value * 10 + (s[i] - '0');
        if (sign == 1 && value > INT_MAX) return INT_MAX;
        if (sign == -1 && -value < INT_MIN) return INT_MIN;
        ++i;
    }
    return static_cast<int>(sign * value);
}
```

### 2.11（陷阱）字符串转整数时溢出如何判断？

- 不能先乘加再判断，有符号整数溢出属于未定义行为。
- 应在乘 10 之前比较，例如 `value > (INT_MAX - digit) / 10`。
- `INT_MIN` 的绝对值比 `INT_MAX` 大 1，统一用负数累加可避免边界不对称。
- 使用 `long long` 中间变量时，仍需在返回前检查是否超出 `int` 范围。
- 无符号版本按 `UINT_MAX` 判断，规则与有符号版本不同。
- 常见错误是写成 `if (value * 10 + digit > INT_MAX)`，此时乘法已经溢出。
- 题目若规定溢出时返回特定值，应严格按约定实现。

### 2.12（实现）如何原地反转字符串中的单词顺序？

- 先整体反转，再逐个单词反转，两次反转后单词内部顺序恢复。
- 单词以空格分隔，需要跳过连续空格并处理首尾空格。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空串、全空格、单个单词、多个连续空格。
- 原地压缩时用读写指针，写指针控制新字符串的长度。
- 常见错误是反转后未去除多余空格，或末位残留空格。

```cpp
void reverseWords(std::string& s) {
    std::reverse(s.begin(), s.end());
    int n = static_cast<int>(s.size());
    int write = 0, read = 0;
    while (read < n) {
        while (read < n && s[read] == ' ') ++read;
        if (read == n) break;
        if (write > 0) s[write++] = ' ';
        int start = write;
        while (read < n && s[read] != ' ') s[write++] = s[read++];
        std::reverse(s.begin() + start, s.begin() + write);
    }
    s.resize(write);
}
```

### 2.13（实现）如何判断两个字符串是否互为变位词？

- 变位词要求字符种类与每个字符的出现次数都相同。
- 长度不同直接返回 false。
- 用长度 256 的计数数组，第一个字符串加一，第二个字符串减一，最后检查是否全为零。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 也可以排序后比较，时间为 O(n log n)，空间取决于排序实现。
- 边界：两个空串互为变位词，大小写是否敏感需要在题意中明确。
- 常见错误是只比较字符集合而忽略重复次数。

```cpp
bool isAnagram(const std::string& a, const std::string& b) {
    if (a.size() != b.size()) return false;
    int count[256] = {};
    for (unsigned char c : a) ++count[c];
    for (unsigned char c : b) {
        if (--count[c] < 0) return false;
    }
    return true;
}
```

### 2.14（实现）如何求最长无重复字符子串？

- 滑动窗口 `[left, right]` 维护无重复字符的区间。
- 右指针扩张，遇到重复字符时把左指针移到该字符上次出现位置的下一位。
- 用长度 256 的数组记录每个字符上次出现的下标，初始化为 -1。
- 左指针只能右移，取 `max(left, last[c] + 1)`，避免回退。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空串返回 0，全部为相同字符时返回 1。
- 常见错误是左指针直接赋值为 `last[c] + 1` 而不取最大值，导致区间内仍有重复。

```cpp
int lengthOfLongestSubstring(const std::string& s) {
    int last[256];
    std::fill(std::begin(last), std::end(last), -1);
    int best = 0, left = 0;
    for (int right = 0; right < static_cast<int>(s.size()); ++right) {
        unsigned char c = static_cast<unsigned char>(s[right]);
        if (last[c] >= left) left = last[c] + 1;
        last[c] = right;
        best = std::max(best, right - left + 1);
    }
    return best;
}
```

### 2.15（辨析）子串与子序列的区别？

- 子串要求字符连续，子序列只要求相对顺序不变，可以跳过字符。
- 长度为 n 的字符串有 n(n+1)/2 个非空子串，有 2^n 个子序列（含空序列）。
- 最长公共子串用二维动态规划，时间为 O(nm)；最长公共子序列同样为 O(nm)，状态转移不同。
- 子串匹配可用 KMP，子序列匹配常用贪心加二分。
- 「最长回文子串」与「最长回文子序列」的解法与复杂度不同。
- 术语混用会导致题意理解错误，应先在草稿上明确连续性要求。

### 2.16（实现）如何用 KMP 求子串首次出现的位置？

- 先对模式串求 `next` 数组，`next[i]` 表示 `p[0..i]` 的最长相等前后缀长度。
- 匹配时文本指针不回退，失配时按 `next` 跳转模式串指针。
- 时间复杂度 O(n + m)，空间复杂度 O(m)。
- 边界：模式串为空时按约定返回 0 或 -1，模式串长度大于文本时返回 -1。
- `next` 数组有前缀表与最大前后缀长度两种写法，下标差一容易出错。
- 常见错误是失配后让文本指针回退，退化为 O(nm)。

```cpp
std::vector<int> buildNext(const std::string& p) {
    std::vector<int> next(p.size(), 0);
    for (std::size_t i = 1, k = 0; i < p.size(); ++i) {
        while (k > 0 && p[i] != p[k]) k = next[k - 1];
        if (p[i] == p[k]) ++k;
        next[i] = static_cast<int>(k);
    }
    return next;
}

int kmpSearch(const std::string& s, const std::string& p) {
    if (p.empty()) return 0;
    auto next = buildNext(p);
    for (std::size_t i = 0, k = 0; i < s.size(); ++i) {
        while (k > 0 && s[i] != p[k]) k = next[k - 1];
        if (s[i] == p[k]) ++k;
        if (k == p.size()) return static_cast<int>(i + 1 - p.size());
    }
    return -1;
}
```

### 2.17（复杂度）KMP 的 `next` 数组为什么能把复杂度降到 O(n + m)？

- 暴力匹配失配时文本指针回退到 `i - j + 1`，最坏比较 O(nm) 次。
- KMP 利用已匹配部分的前后缀信息，失配时只移动模式串，文本指针不后退。
- 每次失配使模式串指针减小，而模式串指针在整个过程中最多增加 n 次，总跳转次数为 O(n)。
- 求 `next` 的过程与匹配同构，复杂度为 O(m)。
- 摊还分析给出总比较次数为 O(n + m)，并非每次匹配都为 O(1)。
- 最坏情况例如文本为 `"aaaaab"`、模式为 `"aaab"`，KMP 仍为线性。
- 常见错误是认为 KMP 在任何输入上都比暴力快，短模式串下其常数可能更大。

### 2.18（实现）如何合并两个有序数组到第一个数组的尾部？

- 第一个数组预留了足够空间，有效长度分别为 m 与 n。
- 从尾部比较两个数组的最大值，写入第一个数组的 `m + n - 1` 位置。
- 从后向前写，避免覆盖第一个数组中尚未比较的元素。
- 时间复杂度 O(m + n)，空间复杂度 O(1)。
- 边界：n 为 0 时无需操作，m 为 0 时直接复制第二个数组。
- 常见错误是从前向后合并，覆盖第一个数组的未处理元素。

```cpp
void merge(std::vector<int>& a, int m, const std::vector<int>& b, int n) {
    int i = m - 1, j = n - 1, k = m + n - 1;
    while (j >= 0) {
        if (i >= 0 && a[i] > b[j]) a[k--] = a[i--];
        else a[k--] = b[j--];
    }
}
```

### 2.19（陷阱）双指针原地修改时覆盖顺序如何确定？

- 写指针落后于读指针时，从前向后写不会覆盖尚未读取的元素。
- 需要删除元素并保持顺序时，读指针在前、写指针在后。
- 需要原地反转或旋转时，从两端向中间交换。
- 合并两个有序数组到同一数组时，必须从后向前写。
- 判断依据是写入位置是否可能落在尚未读取的区域。
- 常见错误是在前向压缩时先递增写指针再赋值，导致首元素丢失。
- 画图标注读写指针的位置关系，可以快速判断方向。

### 2.20（场景）UTF-8 字符串按字符反转为什么会出错？

- UTF-8 是变长编码，一个码位占 1 到 4 个字节，按字节反转会破坏字节序列。
- 即使按码位反转，组合字符与变体选择符仍会被拆散，显示结果错误。
- 正确的反转单位是扩展字素簇，需要 Unicode 分段算法。
- 面试题通常约定输入为 ASCII，应在解题前确认字符集。
- 需要处理 UTF-8 时，先解码为码位序列，反转后再编码。
- C++ 标准库没有内置的 Unicode 分段支持，`std::string` 只保存字节。
- 常见错误是把 `std::string::size()` 当作字符数。

---

## 3. 链表

### 3.1（实现）如何反转单链表？

- 维护 `prev`、`cur`、`next` 三个指针，逐节点改变指向。
- 每步先保存 `cur->next`，再令 `cur->next = prev`，最后同步前移。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 返回新的头节点 `prev`，原头节点的 `next` 最终为 `nullptr`。
- 边界：空链表返回 `nullptr`，单节点链表返回原节点。
- 常见错误是改变指向之后才保存后继，导致链表断裂。

```cpp
struct ListNode {
    int val;
    ListNode* next;
};

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

### 3.2（实现）如何递归反转链表，递归深度有何限制？

- 递归到最后一个节点，把该节点作为新的头节点返回。
- 回溯时令 `head->next->next = head`，并把 `head->next` 置空。
- 时间复杂度 O(n)，空间复杂度 O(n)，来自调用栈。
- 链表长度为十万级时可能栈溢出，工程上优先使用迭代版本。
- 尾递归形式可以改写为循环，但标准不保证尾调用优化。
- 常见错误是忘记把原头节点的 `next` 置空，形成环。

```cpp
ListNode* reverseListRecursive(ListNode* head) {
    if (!head || !head->next) return head;
    ListNode* newHead = reverseListRecursive(head->next);
    head->next->next = head;
    head->next = nullptr;
    return newHead;
}
```

### 3.3（实现）如何合并两个有序链表？

- 用虚拟头节点简化首节点处理，`tail` 指向结果链表的末尾。
- 每次比较两个链表当前节点的值，把较小者接到 `tail` 后面。
- 其中一个链表耗尽后，把另一个链表的剩余部分整体接上。
- 时间复杂度 O(m + n)，空间复杂度 O(1)。
- 边界：任一链表为空时直接返回另一个。
- 值相等时先取第一个链表的节点可以保持稳定顺序。
- 常见错误是把 `dummy` 当作返回值，正确结果为 `dummy.next`。

```cpp
ListNode* mergeTwoLists(ListNode* a, ListNode* b) {
    ListNode dummy{0, nullptr};
    ListNode* tail = &dummy;
    while (a && b) {
        if (a->val <= b->val) { tail->next = a; a = a->next; }
        else { tail->next = b; b = b->next; }
        tail = tail->next;
    }
    tail->next = a ? a : b;
    return dummy.next;
}
```

### 3.4（实现）如何判断链表有环？

- 快慢指针从同一起点出发，慢指针每次走一步，快指针每次走两步。
- 若存在环，快指针会在环内追上慢指针；若快指针到达 `nullptr`，则无环。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空链表与单节点无环链表应返回 false。
- 快指针移动前需检查 `fast` 与 `fast->next` 是否为空。
- 常见错误是快慢指针从不同起点出发，或循环条件只检查 `fast`。

```cpp
bool hasCycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) return true;
    }
    return false;
}
```

### 3.5（实现）如何求环的入口节点？

- 先用快慢指针判断有环，并记录相遇点。
- 设头节点到入口的距离为 a，入口到相遇点的距离为 b，环长为 c，则 a 与 c - b 同余。
- 把快指针重置到头节点，两个指针每次各走一步，再次相遇处即入口。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：无环时返回 `nullptr`。
- 常见错误是相遇后继续用不同速度移动，或忘记先判定无环。

```cpp
ListNode* detectCycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) {
            fast = head;
            while (slow != fast) {
                slow = slow->next;
                fast = fast->next;
            }
            return slow;
        }
    }
    return nullptr;
}
```

### 3.6（复杂度）快慢指针为什么一定相遇？

- 进入环后，快指针相对慢指针的速度为 1 步每次。
- 设慢指针入环时快指针在其前方 d 步，每轮追近 1 步，最多 c - 1 轮追上。
- 因此相遇一定发生在慢指针走完一圈之前。
- 总步数为 O(n)，n 为链表节点数。
- 该结论不依赖环的长度与入口位置。
- 若快指针每次走三步，相对速度为 2，环长为偶数且初始距离为奇数时可能跳过慢指针。
- 常见错误是认为快指针一定在环内绕多圈才相遇。

### 3.7（实现）如何找链表倒数第 k 个节点？

- 快指针先走 k 步，然后快慢指针同步前进。
- 快指针到达 `nullptr` 时，慢指针指向倒数第 k 个节点。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：k 大于链表长度时返回 `nullptr`，k 不大于 0 属于无效输入。
- 先走 k 步时要检查是否越界，避免空指针解引用。
- 常见错误是快指针先走 k - 1 步，导致慢指针停在倒数第 k + 1 个节点。

```cpp
ListNode* kthFromEnd(ListNode* head, int k) {
    if (k <= 0) return nullptr;
    ListNode* fast = head;
    for (int i = 0; i < k; ++i) {
        if (!fast) return nullptr;
        fast = fast->next;
    }
    ListNode* slow = head;
    while (fast) {
        slow = slow->next;
        fast = fast->next;
    }
    return slow;
}
```

### 3.8（实现）如何删除链表倒数第 k 个节点？

- 使用虚拟头节点，快指针先走 k + 1 步，慢指针从虚拟头节点开始。
- 快指针到达 `nullptr` 时，慢指针位于待删节点的前驱。
- 执行 `slow->next = slow->next->next` 删除节点。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：删除头节点时虚拟头节点保证逻辑统一，k 大于长度时不删除。
- 常见错误是先移动再判空，k 等于链表长度时错误地放弃删除。

```cpp
ListNode* removeNthFromEnd(ListNode* head, int k) {
    if (k <= 0) return head;
    ListNode dummy{0, head};
    ListNode* fast = &dummy;
    for (int i = 0; i < k + 1; ++i) {
        if (!fast) return head;
        fast = fast->next;
    }
    ListNode* slow = &dummy;
    while (fast) {
        slow = slow->next;
        fast = fast->next;
    }
    ListNode* victim = slow->next;
    slow->next = victim->next;
    delete victim;
    return dummy.next;
}
```

### 3.9（实现）如何复制带随机指针的链表？

- 每个节点除 `next` 外还有 `random`，可能指向任意节点或为空。
- 用哈希表建立原节点到新节点的映射，两次遍历完成复制。
- 第一次遍历创建新节点并记录映射，第二次遍历设置 `next` 与 `random`。
- 时间复杂度 O(n)，空间复杂度 O(n)。
- 边界：空链表返回 `nullptr`，`random` 为空时新节点的对应字段也为空。
- `random` 可以指向自身，映射中必须已经存在对应节点。

```cpp
struct Node {
    int val;
    Node* next;
    Node* random;
};

Node* copyRandomList(Node* head) {
    if (!head) return nullptr;
    std::unordered_map<Node*, Node*> map;
    for (Node* p = head; p; p = p->next)
        map[p] = new Node{p->val, nullptr, nullptr};
    for (Node* p = head; p; p = p->next) {
        map[p]->next = p->next ? map[p->next] : nullptr;
        map[p]->random = p->random ? map[p->random] : nullptr;
    }
    return map[head];
}
```

### 3.10（辨析）复制带随机指针的三种做法如何取舍？

- 哈希表法实现直接，时间为 O(n)，空间为 O(n)，不修改原链表。
- 交错节点法把新节点插在原节点之后，空间为 O(1)，但拆分步骤容易出错。
- 交错法中途失败会在原链表中留下脏节点，需要保证异常安全。
- 先复制 `next` 再逐个查找 `random` 的暴力法为 O(n^2)，只适合教学。
- 内存受限且允许临时修改原链表时，交错法更有优势。
- 三种方法都需要处理 `random` 指向自身与指向空的情况。
- 面试中应先写哈希表法保证正确，再讨论空间优化。

### 3.11（实现）如何删除排序链表中的重复元素？

- 链表有序，重复元素相邻，一次遍历即可。
- 比较 `cur` 与 `cur->next` 的值，相等则删除 `cur->next`。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空链表与单节点链表直接返回。
- 题目若要求重复元素一个不留，需要记录前驱并删除整段。
- 常见错误是删除节点后未更新 `cur->next`，跳过新的后继。

```cpp
ListNode* deleteDuplicates(ListNode* head) {
    ListNode* cur = head;
    while (cur && cur->next) {
        if (cur->val == cur->next->val) {
            ListNode* dup = cur->next;
            cur->next = dup->next;
            delete dup;
        } else {
            cur = cur->next;
        }
    }
    return head;
}
```

### 3.12（实现）如何删除链表中等于给定值的所有节点？

- 使用虚拟头节点，避免头节点被删除时单独处理。
- `prev` 指向已确认保留的最后一个节点，`cur` 扫描链表。
- 等于目标值时令 `prev->next = cur->next` 并释放 `cur`，否则令 `prev = cur`。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：全部节点都等于目标值时返回空链表。
- 常见错误是删除后仍访问已释放节点的 `next`。

```cpp
ListNode* removeElements(ListNode* head, int val) {
    ListNode dummy{0, head};
    ListNode* prev = &dummy;
    while (prev->next) {
        if (prev->next->val == val) {
            ListNode* victim = prev->next;
            prev->next = victim->next;
            delete victim;
        } else {
            prev = prev->next;
        }
    }
    return dummy.next;
}
```

### 3.13（实现）如何只给待删节点指针删除该节点？

- 题目只给出待删节点 `node`，不给头节点。
- 把后继节点的值复制到 `node`，再删除后继节点。
- 时间复杂度 O(1)，空间复杂度 O(1)。
- 边界：`node` 为尾节点时该方法失效，需要约定返回 false 或由调用方处理。
- 该方法要求节点值可复制，外部若持有后继节点指针会失效。
- 常见错误是不判断 `node->next` 为空，导致空指针解引用。

```cpp
bool deleteNode(ListNode* node) {
    if (!node || !node->next) return false;
    ListNode* next = node->next;
    node->val = next->val;
    node->next = next->next;
    delete next;
    return true;
}
```

### 3.14（陷阱）虚拟头节点解决什么问题？

- 删除或插入可能改变头节点时，虚拟头节点让所有位置的操作逻辑一致。
- 返回 `dummy.next` 即可得到真实头节点。
- 合并、划分、重排等需要构造新链表的场景也常用虚拟头节点。
- 虚拟头节点可以分配在栈上，不需要 `new`。
- 使用后应确保 `dummy.next` 正确，且不要返回栈上对象的地址。
- 若虚拟头节点用 `new` 分配，忘记释放会造成泄漏。
- 虚拟头节点不改变复杂度，只降低边界处理的复杂度。

### 3.15（实现）如何判断两个链表是否相交并求交点？

- 先分别求两个链表的长度，计算长度差 d。
- 长链表先走 d 步，然后两个指针同步前进。
- 首次指针相等处即交点，走到空仍未相等则不相交。
- 时间复杂度 O(m + n)，空间复杂度 O(1)。
- 边界：任一链表为空时不相交。
- 只比较节点地址，不比较节点值，值相等不代表同一节点。
- 用哈希表记录第一个链表的节点也可行，空间为 O(m)。

```cpp
ListNode* getIntersectionNode(ListNode* a, ListNode* b) {
    int lenA = 0, lenB = 0;
    for (ListNode* p = a; p; p = p->next) ++lenA;
    for (ListNode* p = b; p; p = p->next) ++lenB;
    while (lenA > lenB) { a = a->next; --lenA; }
    while (lenB > lenA) { b = b->next; --lenB; }
    while (a != b) { a = a->next; b = b->next; }
    return a;
}
```

### 3.16（实现）如何将链表按奇偶位置拆分并重新连接？

- 用两个虚拟头节点分别串起奇数位与偶数位节点。
- 遍历时交替把节点接到两个链表尾部，注意先保存后继。
- 遍历结束后把偶数链表接到奇数链表尾部。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空链表、单节点与双节点链表。
- 常见错误是拆分后未把偶数链表尾部置空，形成环。

```cpp
ListNode* oddEvenList(ListNode* head) {
    if (!head || !head->next) return head;
    ListNode odd{0, nullptr}, even{0, nullptr};
    ListNode* po = &odd;
    ListNode* pe = &even;
    bool isOdd = true;
    for (ListNode* p = head; p; p = p->next) {
        if (isOdd) { po->next = p; po = p; }
        else { pe->next = p; pe = p; }
        isOdd = !isOdd;
    }
    pe->next = nullptr;
    po->next = even.next;
    return odd.next;
}
```

### 3.17（实现）如何对链表做归并排序？

- 用快慢指针找到中点，把链表切成两半。
- 递归排序两半，再合并两个有序链表。
- 时间复杂度 O(n log n)，空间复杂度 O(log n)。
- 边界：空链表与单节点链表直接返回。
- 切分时令 `slow->next = nullptr`，否则递归不会终止。
- 合并复用第 3.3 节的 `mergeTwoLists`。

```cpp
ListNode* sortList(ListNode* head) {
    if (!head || !head->next) return head;
    ListNode* slow = head;
    ListNode* fast = head->next;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
    }
    ListNode* mid = slow->next;
    slow->next = nullptr;
    return mergeTwoLists(sortList(head), sortList(mid));
}
```

### 3.18（复杂度）链表归并排序的空间复杂度为何是 O(log n)？

- 递归调用栈的深度为 log2 n，每层保存常数个指针。
- 合并过程只改变指针，不需要额外数组。
- 若改用自底向上的迭代归并，空间可降为 O(1)。
- 递归版本的时间复杂度在各层合计为 O(n log n)。
- 链表不支持随机访问，快速排序的分区代价高，归并更适合链表。
- 常见错误是认为归并必须使用 O(n) 辅助空间，这是数组版本的特点。

### 3.19（实现）如何旋转链表？

- 先求链表长度 n，并对 k 取模，令 `k %= n`。
- 找到倒数第 k 个节点的前驱，在该处断开链表。
- 原尾节点指向原头节点，新的头节点为断开处的后继。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：空链表、单节点、k 为 0 或 n 的倍数时保持原样。
- 常见错误是断链后忘记把原尾节点接到原头节点。

```cpp
ListNode* rotateRight(ListNode* head, int k) {
    if (!head || !head->next || k == 0) return head;
    int n = 1;
    ListNode* tail = head;
    while (tail->next) { tail = tail->next; ++n; }
    k %= n;
    if (k == 0) return head;
    ListNode* newTail = head;
    for (int i = 0; i < n - k - 1; ++i) newTail = newTail->next;
    ListNode* newHead = newTail->next;
    newTail->next = nullptr;
    tail->next = head;
    return newHead;
}
```

### 3.20（场景）链表节点内存如何管理以避免泄漏？

- 每个 `new` 都应有对应的 `delete`，删除节点前先保存后继。
- 优先使用 `std::unique_ptr` 与容器管理节点，减少手工释放。
- 异常路径也要释放已分配节点，可用 RAII 对象包装所有权。
- 删除整条链表时循环释放，最后把头指针置空。
- 节点被多处引用时需要明确所有权，避免重复释放。
- 用 AddressSanitizer 或 Valgrind 检查泄漏与越界。
- 常见错误是只删除头节点，或删除后继续使用悬空指针。

---

## 4. 栈与队列

### 4.1 栈与队列的抽象操作与实现方式？

- 栈遵循后进先出，主要操作是 `push`、`pop`、`top`。
- 队列遵循先进先出，主要操作是 `push`、`pop`、`front`、`back`。
- 两者都可以用数组或链表实现，数组版本需要注意容量与扩容。
- `std::stack` 与 `std::queue` 是容器适配器，默认底层容器分别为 `std::deque`。
- 双端队列 `std::deque` 支持两端插入与删除，适合作为队列的底层容器。
- 栈的操作都是 O(1)，用数组实现的队列若从前端删除需要搬移元素，循环队列可以避免。
- 优先队列按优先级出队，底层通常为堆，与普通队列的语义不同。

### 4.2（实现）如何用数组实现一个栈？

- 用 `std::vector` 保存元素，`push_back` 入栈，`pop_back` 出栈。
- `top` 返回 `back()`，空栈时调用属于未定义行为，需要前置检查。
- 入栈摊还 O(1)，出栈 O(1)，空间 O(n)。
- 固定容量数组需要维护栈顶下标，初始值为 -1。
- 边界：栈满时入栈、栈空时出栈都应显式处理。
- 常见错误是让 `pop` 返回被删元素的值，而标准库的 `pop` 返回 void。

```cpp
class ArrayStack {
public:
    void push(int x) { data_.push_back(x); }
    void pop() {
        if (data_.empty()) throw std::out_of_range("empty");
        data_.pop_back();
    }
    int top() const {
        if (data_.empty()) throw std::out_of_range("empty");
        return data_.back();
    }
    bool empty() const { return data_.empty(); }
private:
    std::vector<int> data_;
};
```

### 4.3（实现）如何用两个栈实现队列？

- `in` 栈负责入队，`out` 栈负责出队。
- 入队直接压入 `in`，出队时若 `out` 为空，把 `in` 全部倒入 `out`。
- 每个元素最多被倒入一次，摊还复杂度为 O(1)。
- 边界：两个栈都为空时出队应报错或返回约定值。
- 常见错误是每次出队都倒栈，导致单次代价退化为 O(n)。
- 队列的 `front` 取自 `out` 栈顶，`back` 在 `in` 非空时取自 `in` 栈顶，否则取自 `out` 栈底。

```cpp
class MyQueue {
public:
    void push(int x) { in_.push(x); }
    int pop() {
        move();
        int v = out_.top();
        out_.pop();
        return v;
    }
    int peek() {
        move();
        return out_.top();
    }
    bool empty() const { return in_.empty() && out_.empty(); }
private:
    void move() {
        if (out_.empty()) {
            while (!in_.empty()) { out_.push(in_.top()); in_.pop(); }
        }
    }
    std::stack<int> in_, out_;
};
```

### 4.4（复杂度）用两个栈实现队列的摊还复杂度如何分析？

- 单次出队最坏为 O(n)，发生在 `out` 为空且 `in` 中有 n 个元素时。
- 每个元素在整个生命周期内最多进入 `in` 一次、倒入 `out` 一次、离开 `out` 一次。
- 连续 m 次操作的总代价为 O(m)，摊还到每次为 O(1)。
- 该结论与元素数量无关，属于摊还分析而非平均分析。
- 若在 `out` 非空时继续倒入，会破坏顺序并使复杂度退化。
- 空间复杂度为 O(n)，两个栈合计保存全部元素。

### 4.5（实现）如何用队列实现栈？

- 入栈后把队列中除新元素外的所有元素依次移到队尾，使新元素位于队首。
- 入栈为 O(n)，出栈为 O(1)，空间为 O(n)。
- 也可以用两个队列，一个保存数据，另一个在出栈时暂存。
- 单队列轮转的写法更简洁，适合面试手写。
- 边界：空栈出栈需要处理，只有一个元素时轮转次数为 0。
- 常见错误是轮转次数按 `size()` 计算，正确次数为 `size() - 1`。

```cpp
class MyStack {
public:
    void push(int x) {
        q_.push(x);
        int n = static_cast<int>(q_.size());
        for (int i = 1; i < n; ++i) {
            q_.push(q_.front());
            q_.pop();
        }
    }
    int pop() { int v = q_.front(); q_.pop(); return v; }
    int top() { return q_.front(); }
    bool empty() const { return q_.empty(); }
private:
    std::queue<int> q_;
};
```

### 4.6（实现）如何判断括号序列是否合法？

- 遇到左括号入栈，遇到右括号检查栈顶是否为对应的左括号。
- 匹配则出栈，不匹配立即返回 false。
- 遍历结束后栈为空才算合法。
- 时间复杂度 O(n)，空间复杂度 O(n)。
- 边界：空串视为合法，只有右括号或只有左括号都不合法。
- 字符串中包含非括号字符时，按题意选择跳过或判错。

```cpp
bool isValid(const std::string& s) {
    std::stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            st.push(c);
        } else {
            if (st.empty()) return false;
            char top = st.top();
            if ((c == ')' && top != '(') ||
                (c == ']' && top != '[') ||
                (c == '}' && top != '{')) return false;
            st.pop();
        }
    }
    return st.empty();
}
```

### 4.7（陷阱）括号匹配只统计数量为什么不够？

- 数量相等只能保证左右括号总数相同，不能保证嵌套顺序合法。
- 例如 `"([)]"` 左右括号各两个，但顺序非法。
- 必须借助栈记录最近未匹配的左括号，才能检查嵌套关系。
- 三种括号混合时，需要按类型匹配栈顶。
- 只用计数器无法区分 `"()"` 与 `")("`。
- 常见错误是先统计再判断，忽略了顺序约束。

### 4.8（实现）如何用单调栈求每日温度？

- 对每个位置找右侧第一个更大的元素，距离即等待天数。
- 维护一个从栈底到栈顶温度递减的下标栈。
- 当前温度大于栈顶温度时，栈顶元素找到答案，弹出并计算下标差。
- 每个下标最多入栈、出栈一次，时间复杂度 O(n)，空间为 O(n)。
- 边界：没有更高温度的位置结果为 0，空数组返回空。
- 常见错误是栈中存温度值而非下标，无法计算距离。

```cpp
std::vector<int> dailyTemperatures(const std::vector<int>& t) {
    std::vector<int> ans(t.size(), 0);
    std::stack<int> st;
    for (int i = 0; i < static_cast<int>(t.size()); ++i) {
        while (!st.empty() && t[i] > t[st.top()]) {
            ans[st.top()] = i - st.top();
            st.pop();
        }
        st.push(i);
    }
    return ans;
}
```

### 4.9（实现）如何用单调栈求柱状图中的最大矩形？

- 对每根柱子找左右两侧第一个高度小于它的柱子，确定可扩展的宽度。
- 维护高度递增的下标栈，遇到更矮的柱子时弹出并计算面积。
- 弹出时左边界为新的栈顶，右边界为当前下标。
- 在数组末尾补一个高度 0 的哨兵，保证栈内元素全部弹出。
- 时间复杂度 O(n)，空间为 O(n)。
- 边界：全相等高度、严格递增、严格递减与空数组。
- 常见错误是把宽度算成 `right - left`，正确值为 `right - left - 1`。

```cpp
int largestRectangleArea(const std::vector<int>& h) {
    std::vector<int> v(h);
    v.push_back(0);
    std::stack<int> st;
    int best = 0;
    for (int i = 0; i < static_cast<int>(v.size()); ++i) {
        while (!st.empty() && v[st.top()] > v[i]) {
            int height = v[st.top()];
            st.pop();
            int left = st.empty() ? -1 : st.top();
            best = std::max(best, height * (i - left - 1));
        }
        st.push(i);
    }
    return best;
}
```

### 4.10（复杂度）单调栈为什么是 O(n)？

- 每个元素最多入栈一次、出栈一次。
- 虽然内层有 `while` 循环，但循环总次数受入栈次数限制。
- 总操作次数不超过 2n，因此时间复杂度为 O(n)。
- 这是摊还分析，单次弹出可能连续多次，但总代价有上界。
- 栈的深度最大为 n，空间复杂度为 O(n)。
- 若在循环内重复扫描整个栈，则退化为 O(n^2)。

### 4.11（实现）如何用单调队列求滑动窗口最大值？

- 维护一个下标队列，队列中的值从队首到队尾单调递减。
- 新元素入队前，从队尾弹出所有小于等于它的元素。
- 队首元素超出窗口左边界时弹出。
- 每个元素最多入队、出队一次，时间复杂度 O(n)，空间为 O(k)。
- 边界：窗口大小为 1、窗口大于数组长度、数组为空，k 不大于 0 时返回空。
- 常见错误是队列存值而非下标，无法判断是否越出窗口。

```cpp
std::vector<int> maxSlidingWindow(const std::vector<int>& a, int k) {
    if (k <= 0) return {};
    std::deque<int> dq;
    std::vector<int> ans;
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        while (!dq.empty() && a[dq.back()] <= a[i]) dq.pop_back();
        dq.push_back(i);
        if (dq.front() <= i - k) dq.pop_front();
        if (i >= k - 1) ans.push_back(a[dq.front()]);
    }
    return ans;
}
```

### 4.12（辨析）单调栈与单调队列分别解决什么问题？

- 单调栈解决下一个更大或更小元素，以及以某元素为边界的区间问题。
- 单调队列解决固定长度窗口内的最值问题。
- 两者都通过删除不可能成为答案的元素来维持单调性。
- 单调栈只在一端操作，单调队列两端都要操作。
- 滑动窗口最大值也可以用堆，时间为 O(n log n)，不如单调队列。
- 选择依据是问题是否带有固定窗口约束。

### 4.13（实现）如何实现一个支持求最小值的栈？

- 用一个辅助栈同步保存当前最小值。
- 入栈时，辅助栈压入 `min(value, 当前最小值)`。
- 出栈时两个栈同时弹出，求最小值返回辅助栈顶。
- 所有操作均为 O(1)，空间为 O(n)。
- 另一种写法是辅助栈只在遇到更小值时压入，出栈时按值比较。
- 边界：空栈调用求最小值需要前置检查。

```cpp
class MinStack {
public:
    void push(int x) {
        data_.push(x);
        mins_.push(mins_.empty() ? x : std::min(x, mins_.top()));
    }
    void pop() { data_.pop(); mins_.pop(); }
    int top() const { return data_.top(); }
    int getMin() const { return mins_.top(); }
private:
    std::stack<int> data_, mins_;
};
```

### 4.14（实现）如何用两个栈实现四则运算表达式求值？

- 维护两个栈，操作数栈与运算符栈。
- 遇到数字时解析完整数字并入栈，遇到运算符时先弹出栈顶优先级不低于它的运算符计算。
- 左括号直接入栈，右括号弹出运算符直到遇到左括号。
- 遍历结束后弹出剩余运算符，操作数栈顶即结果。
- 时间复杂度 O(n)，空间为 O(n)。
- 边界：多位数、空格、一元负号、括号不匹配、除数为零。
- 常见错误是把优先级比较写成严格大于，正确条件为大于等于，否则左结合性会被破坏。

```cpp
int evaluate(const std::string& s) {
    std::stack<int> num; std::stack<char> op;
    auto prec = [](char o) { return (o == '*' || o == '/') ? 2 : 1; };
    auto reduce = [&] {
        char o = op.top(); op.pop();
        int b = num.top(); num.pop();
        int a = num.top(); num.pop();
        num.push(o == '+' ? a + b : o == '-' ? a - b : o == '*' ? a * b : a / b);
    };
    for (std::size_t i = 0; i < s.size(); ++i) {
        char c = s[i];
        if (c == ' ') continue;
        if (std::isdigit(static_cast<unsigned char>(c))) {
            int v = 0;
            while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i])))
                v = v * 10 + (s[i++] - '0');
            num.push(v); --i;
        } else if (c == '(') op.push(c);
        else if (c == ')') { while (op.top() != '(') reduce(); op.pop(); }
        else {
            while (!op.empty() && op.top() != '(' && prec(op.top()) >= prec(c)) reduce();
            op.push(c);
        }
    }
    while (!op.empty()) reduce();
    return num.top();
}
```

### 4.15（陷阱）表达式求值中一元负号如何处理？

- 一元负号与二元减号的字符相同，需要根据前一个记号判断。
- 出现在开头、左括号后或另一个运算符后的减号是一元负号。
- 可以把一元负号转换为 `0 - x`，或压入一个优先级高于乘除的特殊运算符。
- 直接按二元减号处理会导致操作数栈不足。
- 边界：`"-3"`、`"2*-3"`、`"-(1+2)"`。
- 常见错误是只判断字符而不看上下文。

### 4.16（实现）如何计算逆波兰表达式？

- 逆波兰表达式没有括号，运算符位于操作数之后。
- 遇到数字入栈，遇到运算符弹出两个操作数，先弹出的是右操作数。
- 计算结果压回栈中，遍历结束后栈内只剩一个值。
- 时间复杂度 O(n)，空间为 O(n)。
- 边界：除数为零、操作数不足、表达式结束后栈内多于一个元素。
- 常见错误是减法与除法的操作数顺序颠倒。

```cpp
int evalRPN(const std::vector<std::string>& tokens) {
    std::stack<int> st;
    for (const std::string& t : tokens) {
        if (t == "+" || t == "-" || t == "*" || t == "/") {
            int b = st.top(); st.pop();
            int a = st.top(); st.pop();
            if (t == "+") st.push(a + b);
            else if (t == "-") st.push(a - b);
            else if (t == "*") st.push(a * b);
            else st.push(a / b);
        } else {
            st.push(std::stoi(t));
        }
    }
    return st.top();
}
```

### 4.17 如何用显式栈模拟递归？

- 尾递归的递归调用是函数的最后一步，可以改写为循环，用参数变量替代递归调用的实参。
- 非尾递归需要显式栈保存返回后要继续处理的状态。
- 例如二叉树前序遍历用栈保存右子节点，再处理左子树。
- 时间复杂度不变，空间从调用栈转移到显式栈。
- 显式栈放在堆上，容量不受线程栈大小限制。
- 常见错误是只把递归改成栈，却漏掉回溯时需要恢复的状态。

### 4.18（实现）如何设计循环队列？

- 用固定大小数组与两个下标 `head`、`tail`。
- 入队写 `data[tail]` 后令 `tail = (tail + 1) % capacity`。
- 出队读 `data[head]` 后令 `head = (head + 1) % capacity`。
- 所有操作均为 O(1)，空间为 O(k)。
- 需要额外计数或空出一个槽位来区分空与满。
- 边界：容量为 0、队列满时入队、队列空时出队。

```cpp
class MyCircularQueue {
public:
    explicit MyCircularQueue(int k) : data_(k + 1), cap_(k + 1) {}
    bool enQueue(int value) {
        if (isFull()) return false;
        data_[tail_] = value;
        tail_ = (tail_ + 1) % cap_;
        return true;
    }
    bool deQueue() {
        if (isEmpty()) return false;
        head_ = (head_ + 1) % cap_;
        return true;
    }
    int Front() const { return isEmpty() ? -1 : data_[head_]; }
    int Rear() const { return isEmpty() ? -1 : data_[(tail_ + cap_ - 1) % cap_]; }
    bool isEmpty() const { return head_ == tail_; }
    bool isFull() const { return (tail_ + 1) % cap_ == head_; }
private:
    std::vector<int> data_;
    int cap_;
    int head_ = 0, tail_ = 0;
};
```

### 4.19（陷阱）循环队列的判空与判满条件是什么？

- 用 `head == tail` 表示空时，满也需要独立判据，否则与空冲突。
- 常见做法是空出一个槽位，用 `(tail + 1) % capacity == head` 表示满。
- 此时实际最多存放 `capacity - 1` 个元素。
- 另一种做法是维护 `size` 计数，空为 `size == 0`，满为 `size == capacity`。
- 两种做法的容量语义不同，接口说明需要写明。
- 常见错误是同时用 `head == tail` 判空和判满，导致满队列被误判为空。

### 4.20（场景）函数调用栈溢出如何定位？

- 栈溢出通常表现为段错误，访问地址落在栈映射区域附近。
- 常见原因是无限递归、递归深度过大或栈上分配了超大局部数组。
- 用调试器查看调用栈深度与重复帧，可以快速识别无限递归。
- 在递归入口打印深度或增加计数器，定位进入深层递归的输入。
- AddressSanitizer 的 `stack-overflow` 报告会给出访问地址与栈帧。
- 增大栈只能缓解，根本解决需要改迭代或限制递归深度。
- 常见错误是把栈溢出误判为堆损坏，忽略了大局部变量。

---

## 5. 哈希表与集合

### 5.1 哈希表的基本组成与操作复杂度？

- 哈希表由桶数组与哈希函数组成，键经哈希映射到桶。
- 插入、查找、删除的平均复杂度为 O(1)，最坏为 O(n)。
- 平均复杂度依赖哈希函数均匀分布与负载因子受控。
- 冲突处理分为链地址法与开放定址法。
- 负载因子等于元素数除以桶数，过高会显著增加冲突。
- 扩容需要重新计算所有键的桶位置，单次代价为 O(n)。
- 最坏情况出现在所有键映射到同一桶，退化为链表或线性探测。

### 5.2（实现）如何设计一个简单的链地址法哈希表？

- 桶数组的每个元素是一条链表，保存哈希值相同的键值对。
- 插入时计算桶下标，在链表中查找是否已存在，不存在则插入。
- 查找与删除同样先定位桶，再遍历链表。
- 负载因子超过阈值时扩容，桶数通常取素数或 2 的幂。
- 平均 O(1)，最坏 O(n)，空间为 O(n)。
- 删除节点时注意释放内存并更新链表头。
- 边界：重复键只更新值而不新增节点，键的分布决定单桶长度。

```cpp
class HashMap {
public:
    void put(int key, int value) {
        auto& bucket = table_[bucketOf(key)];
        for (auto& kv : bucket) {
            if (kv.first == key) { kv.second = value; return; }
        }
        bucket.emplace_back(key, value);
        if (++size_ > table_.size()) rehash();
    }
    bool get(int key, int& value) const {
        for (const auto& kv : table_[bucketOf(key)]) {
            if (kv.first == key) { value = kv.second; return true; }
        }
        return false;
    }
private:
    std::size_t bucketOf(int key) const {
        return std::hash<int>{}(key) % table_.size();
    }
    void rehash() {
        auto old = std::move(table_);
        table_.assign(old.size() * 2, {});
        size_ = 0;
        for (const auto& bucket : old)
            for (const auto& kv : bucket) put(kv.first, kv.second);
    }
    std::vector<std::list<std::pair<int, int>>> table_{8};
    std::size_t size_ = 0;
};
```

### 5.3 负载因子与扩容如何影响性能？

- 负载因子上升使链表变长或探测序列变长，平均查找长度增加。
- 链地址法成功查找的平均长度约为 1 + α/2，其中 α 为负载因子。
- 开放定址法在负载因子接近 1 时性能急剧下降，通常控制在 0.7 以下。
- 扩容把桶数增大到约两倍，并重新插入全部元素，单次代价为 O(n)。
- 几何扩容使插入的摊还代价保持 O(1)。
- 扩容后迭代器可能失效，`std::unordered_map` 的 rehash 会使迭代器失效。
- 阈值与增长策略由实现定义。

### 5.4（辨析）开放定址法与链地址法如何取舍？

- 链地址法使用额外指针，负载因子可以大于 1，删除操作直观。
- 开放定址法把元素存放在桶数组内，缓存局部性更好，没有额外指针。
- 开放定址法删除需要墓碑标记，否则会截断探测序列。
- 开放定址法对负载因子敏感，高负载时聚集效应明显。
- 链地址法在哈希函数较差时退化相对可控，开放定址法可能全面退化。
- `std::unordered_map` 通常采用链地址法，具体由实现定义。
- 内存受限、键值较小且负载可控时，开放定址法更有优势。

### 5.5 哈希冲突为什么不可避免？

- 键的取值空间通常远大于桶的数量，由鸽巢原理可知至少有两个键映射到同一桶。
- 哈希函数把很大的定义域映射到有限值域，冲突必然存在。
- 好的哈希函数让冲突均匀分布，但不能消除冲突。
- 冲突处理策略决定最坏情况下的性能。
- 即使桶数等于键数，也可能因哈希值重复而冲突。
- 常见错误是认为哈希函数足够好就不会冲突。

### 5.6（实现）如何选择字符串哈希函数？

- 逐字符累加并乘一个基数，例如 `h = h * 131 + c`。
- 基数应大于字符集大小，且与桶数互质，常用 31、131 等。
- 使用无符号整数让溢出按模 2^w 回绕，行为明确。
- 多项式哈希容易构造碰撞，安全场景应使用带随机种子的哈希。
- 需要防止哈希洪水时，选用带密钥的哈希函数。
- 时间复杂度 O(L)，L 为字符串长度，缓存哈希值可避免重复计算。
- 边界：空字符串返回初始值 0，调用方需自行处理空输入。
- 常见错误是用有符号整数累加，溢出属于未定义行为。

```cpp
std::size_t hashString(const std::string& s) {
    std::size_t h = 0;
    for (unsigned char c : s) {
        h = h * 131 + c;
    }
    return h;
}
```

### 5.7（陷阱）`std::hash` 与自定义哈希有哪些要求？

- `std::hash<Key>` 需要为 `Key` 提供 `operator()`，返回 `std::size_t`。
- 自定义类型作为 `unordered_map` 的键时，需要同时提供相等比较与哈希函数。
- 相等的键必须产生相同的哈希值，反之不要求。
- 哈希函数不应修改键，也不应抛出异常。
- 对同一对象多次调用应返回相同值，除非对象被修改。
- 为用户自定义类型特化 `std::hash` 需要写在 `std` 命名空间内，这是标准允许的扩展方式。
- 常见错误是哈希函数使用随机数，导致每次调用结果不同。

### 5.8（实现）如何用哈希表求两数之和？

- 遍历数组，对每个元素 `x` 查找 `target - x` 是否已经出现。
- 哈希表保存值到下标的映射，查找为平均 O(1)。
- 先查找再插入，避免同一元素被使用两次。
- 时间复杂度 O(n)，空间为 O(n)。
- 边界：无解时返回空，存在多组解时按题意返回任意一组或全部。
- 常见错误是先插入当前元素再查找，`target` 为 `2 * x` 时返回同一下标两次。

```cpp
std::vector<int> twoSum(const std::vector<int>& a, int target) {
    std::unordered_map<int, int> seen;
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        auto it = seen.find(target - a[i]);
        if (it != seen.end()) return {it->second, i};
        seen[a[i]] = i;
    }
    return {};
}
```

### 5.9（实现）如何对数组去重并保持顺序？

- 用哈希集合记录已出现的元素，遍历时若未出现则写入输出。
- 时间复杂度 O(n)，空间为 O(n)。
- 若允许打乱顺序，可先排序再去重，时间为 O(n log n)，空间为 O(1)。
- `std::unordered_set` 的遍历顺序不确定，不能用于保序输出。
- 边界：空数组、全部重复、全部不同。
- 常见错误是边遍历边从原数组删除，导致迭代器失效与 O(n^2)。

```cpp
std::vector<int> dedup(const std::vector<int>& a) {
    std::unordered_set<int> seen;
    std::vector<int> out;
    for (int x : a) {
        if (seen.insert(x).second) out.push_back(x);
    }
    return out;
}
```

### 5.10（实现）如何统计出现频率最高的 k 个元素？

- 先用哈希表统计每个元素的频率，时间为 O(n)。
- 再用大小为 k 的小顶堆维护频率最高的 k 个元素，时间为 O(n log k)。
- 也可以按频率分桶，时间为 O(n)，空间为 O(n)。
- 返回顺序不作要求时，堆方法不需要对结果排序。
- 边界：k 大于不同元素个数时返回全部，k 为 0 时返回空。
- 常见错误是用大顶堆保存全部元素，复杂度退化为 O(n log n)。

```cpp
std::vector<int> topKFrequent(const std::vector<int>& a, int k) {
    std::unordered_map<int, int> freq;
    for (int x : a) ++freq[x];
    using Item = std::pair<int, int>;
    auto cmp = [](const Item& x, const Item& y) { return x.second > y.second; };
    std::priority_queue<Item, std::vector<Item>, decltype(cmp)> heap(cmp);
    for (const auto& kv : freq) {
        heap.push(kv);
        if (static_cast<int>(heap.size()) > k) heap.pop();
    }
    std::vector<int> ans;
    while (!heap.empty()) { ans.push_back(heap.top().first); heap.pop(); }
    return ans;
}
```

### 5.11（实现）如何用哈希集合判断数组中是否存在重复元素？

- 遍历数组，把元素插入哈希集合，插入失败说明已经存在。
- `std::unordered_set::insert` 返回 pair，second 为 false 表示重复。
- 时间复杂度平均 O(n)，空间为 O(n)。
- 若元素范围有限，可用位图把空间降为 O(range/8)。
- 边界：空数组与单元素数组返回 false。
- 常见错误是先用 `count` 再 `insert`，做两次哈希计算。

```cpp
bool containsDuplicate(const std::vector<int>& a) {
    std::unordered_set<int> seen;
    for (int x : a) {
        if (!seen.insert(x).second) return true;
    }
    return false;
}
```

### 5.12（实现）如何求最长连续序列？

- 把所有元素放入哈希集合，便于 O(1) 判断某个值是否存在。
- 只从一个序列的最小值开始扩展，若 `x - 1` 不在集合中，则从 `x` 向后计数。
- 每个元素最多被访问两次，时间复杂度为 O(n)。
- 空间复杂度为 O(n)。
- 边界：空数组返回 0，元素重复不影响结果。
- 常见错误是对每个元素都向两侧扩展，复杂度退化为 O(n^2)。

```cpp
int longestConsecutive(const std::vector<int>& a) {
    std::unordered_set<int> s(a.begin(), a.end());
    int best = 0;
    for (int x : s) {
        if (s.count(x - 1)) continue;
        int y = x;
        while (s.count(y + 1)) ++y;
        best = std::max(best, y - x + 1);
    }
    return best;
}
```

### 5.13（复杂度）最长连续序列为什么能做到 O(n)？

- 外层循环遍历每个元素一次。
- 内层 `while` 只在元素是序列起点时执行，且每个元素最多被内层访问一次。
- 总访问次数不超过 2n，因此为 O(n)。
- 该结论依赖哈希集合的平均 O(1) 查找，最坏情况下为 O(n^2)。
- 若哈希函数退化，所有元素落入同一桶，复杂度不再成立。
- 排序解法为 O(n log n)，哈希解法以空间换时间。

### 5.14（实现）如何用哈希表实现 LRU 缓存？

- 用双向链表按访问顺序保存键值，链表头部为最近使用，尾部为最久未使用。
- 用哈希表保存键到链表节点的迭代器，查找为平均 O(1)。
- `get` 命中时把节点移到链表头部并返回值，未命中返回 -1。
- `put` 已存在时更新值并移到头部，不存在时插入头部，容量超限时删除尾部节点。
- 时间复杂度 O(1)，空间为 O(capacity)。
- 边界：容量为 0、重复写入同一键、访问已淘汰的键。
- 常见错误是只移动哈希表中的值而不同步链表顺序。

```cpp
class LRUCache {
public:
    explicit LRUCache(int cap) : cap_(cap) {}
    int get(int key) {
        auto it = pos_.find(key);
        if (it == pos_.end()) return -1;
        items_.splice(items_.begin(), items_, it->second);
        return it->second->second;
    }
    void put(int key, int value) {
        if (cap_ <= 0) return;
        auto it = pos_.find(key);
        if (it != pos_.end()) {
            it->second->second = value; items_.splice(items_.begin(), items_, it->second); return;
        }
        if (static_cast<int>(items_.size()) == cap_) { pos_.erase(items_.back().first); items_.pop_back(); }
        items_.emplace_front(key, value);
        pos_[key] = items_.begin();
    }
private:
    int cap_;
    std::list<std::pair<int, int>> items_;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> pos_;
};
```

### 5.15（复杂度）LRU 的 `get` 与 `put` 为什么是 O(1)？

- 哈希表定位节点为平均 O(1)。
- 双向链表在已知节点位置时，删除与插入均为 O(1)。
- 哈希表保存迭代器，避免在链表中线性查找。
- 淘汰尾部节点时通过前驱指针直接取得前驱。
- 若用单链表，删除节点需要前驱，无法在 O(1) 内完成。
- 哈希表的最坏情况为 O(n)，平均结论依赖哈希分布。

### 5.16（陷阱）LRU 中哈希表存迭代器有什么风险？

- `std::list` 的迭代器在插入与删除其他元素时保持有效，这是该设计成立的前提。
- 若改用 `std::vector` 或 `std::deque` 保存节点，扩容或中间插入删除会使迭代器失效。
- 删除节点前必须先从哈希表移除对应条目，否则留下悬空迭代器。
- 哈希表自身 rehash 不影响其中保存的链表迭代器，但会使哈希表的迭代器失效。
- 节点被移动后，哈希表中保存的迭代器仍需指向原节点。
- 常见错误是保存指向节点值而非链表节点的指针，节点删除后无法恢复。

### 5.17（实现）如何设计一个简单的哈希集合？

- 桶数组加链表，每个桶保存哈希值相同的元素。
- `add` 时若桶内不存在则插入，`contains` 遍历桶，`remove` 删除匹配元素。
- 负载因子超过阈值时应扩容并重新分配所有元素，示例为简洁起见固定使用 8 个桶。
- 平均 O(1)，最坏 O(n)，空间为 O(n)。
- 元素类型需要提供哈希与相等比较，负键应先转换为无符号类型再取模。
- 边界：删除不存在的元素应无操作。

```cpp
class HashSet {
public:
    bool add(int key) {
        auto& bucket = table_[bucketOf(key)];
        for (int v : bucket) if (v == key) return false;
        bucket.push_back(key);
        return true;
    }
    bool contains(int key) const {
        for (int v : table_[bucketOf(key)]) if (v == key) return true;
        return false;
    }
    bool remove(int key) {
        auto& bucket = table_[bucketOf(key)];
        for (auto it = bucket.begin(); it != bucket.end(); ++it) {
            if (*it == key) { bucket.erase(it); return true; }
        }
        return false;
    }
private:
    std::size_t bucketOf(int key) const {
        return std::hash<int>{}(key) % table_.size();
    }
    std::vector<std::list<int>> table_{8};
};
```

### 5.18（场景）哈希表遍历顺序为什么不确定？

- 遍历顺序由桶的顺序与桶内元素的顺序决定，二者都依赖哈希函数与插入历史。
- 不同标准库实现的桶数、扩容策略与插入方式不同，顺序不可移植。
- 即使同一实现，不同编译选项或不同运行也可能不同。
- `std::unordered_map` 只保证键不重复，不保证遍历顺序。
- 依赖遍历顺序的代码在 rehash 后会失效。
- 需要稳定顺序时应改用 `std::map` 或对结果排序。
- 常见错误是用遍历顺序推断插入顺序。

### 5.19（陷阱）`std::unordered_map` 的 rehash 何时发生？

- 当插入使负载因子超过 `max_load_factor()` 时，实现会 rehash。
- 默认 `max_load_factor()` 为 1.0，可调用同名函数调整。
- `rehash(n)` 与 `reserve(n)` 可以预先分配桶，减少后续 rehash。
- rehash 使所有迭代器失效，但指向元素的引用与指针仍然有效。
- 具体触发时机与桶数增长策略由实现定义。
- 常见错误是在遍历过程中插入元素，触发 rehash 后继续使用旧迭代器。
- 需要稳定迭代器时应改用 `std::map` 或先预留容量。

### 5.20（场景）哈希洪水攻击如何影响哈希表？

- 攻击者构造大量哈希值相同的键，使所有元素落入同一桶。
- 链地址法退化为链表，单次查找从 O(1) 变为 O(n)。
- n 次查找的总代价从 O(n) 变为 O(n^2)，可耗尽 CPU。
- 开放定址法在聚集时探测序列变长，同样会退化。
- 防御手段包括带随机种子的哈希、限制单桶长度、设置请求大小上限。
- 语言运行时通常在字符串哈希中加入随机化，例如进程级随机种子。
- 常见错误是认为使用哈希表就不会出现拒绝服务风险。

---

## 6. 二叉树与遍历

### 6.1 二叉树的前序遍历如何用递归与迭代分别实现？

- 递归写法把访问当前节点放在两次递归之前，顺序为中、左、右，函数体只有三条语句。
- 递归深度等于树高，最坏为 O(n)，链状树在深递归下可能耗尽栈空间。
- 迭代写法用显式栈模拟调用栈，先压右孩子再压左孩子，出栈顺序即为中、左、右。
- 每个节点入栈一次、出栈一次，时间复杂度 O(n)，额外空间为栈深 O(h)。
- 边界：空树返回空序列；单节点直接返回该值；节点值与遍历顺序无关。
- 常见错误是先压左孩子，输出变成中、右、左。

```cpp
void preorder(TreeNode* root, std::vector<int>& out) {
    if (root == nullptr) return;
    out.push_back(root->val);
    preorder(root->left, out);
    preorder(root->right, out);
}

std::vector<int> preorderIter(TreeNode* root) {
    std::vector<int> out;
    std::vector<TreeNode*> st;
    if (root != nullptr) st.push_back(root);
    while (!st.empty()) {
        TreeNode* p = st.back();
        st.pop_back();
        out.push_back(p->val);
        if (p->right != nullptr) st.push_back(p->right);
        if (p->left != nullptr) st.push_back(p->left);
    }
    return out;
}
```

### 6.2（实现）中序遍历的迭代写法如何用栈模拟？

- 迭代中序用一个栈加一个游标，沿左链一路压栈，直到空指针。
- 弹出栈顶并访问，再转向该节点的右子树，重复上述过程。
- 循环条件是游标非空或栈非空，两者同时为空表示遍历结束。
- 每个节点恰好压栈一次，时间复杂度 O(n)，空间为 O(h)。
- 该写法适合「第 k 小」与「验证二叉搜索树」等需要有序访问的场合。
- 边界：空树不进入循环；只有右孩子的节点在弹出后才转向右子树。

```cpp
std::vector<int> inorder(TreeNode* root) {
    std::vector<int> out;
    std::vector<TreeNode*> st;
    TreeNode* cur = root;
    while (cur != nullptr || !st.empty()) {
        while (cur != nullptr) {
            st.push_back(cur);
            cur = cur->left;
        }
        cur = st.back();
        st.pop_back();
        out.push_back(cur->val);
        cur = cur->right;
    }
    return out;
}
```

### 6.3 后序遍历的迭代写法如何避免重复访问同一节点？

- 后序要求左、右、中，迭代时需要判断右子树是否已经访问完毕。
- 记录上一个访问的节点 `prev`，栈顶的右孩子为空或等于 `prev` 时才访问栈顶。
- 否则转向右子树，把右孩子压栈。
- 每个节点入栈一次，时间复杂度 O(n)，空间 O(h)。
- 另一种写法按中、右、左遍历后整体逆序，代价是额外 O(n) 的结果数组。
- 边界：只有左孩子的节点，`prev` 为空时不能把右子树误判为已访问。

```cpp
std::vector<int> postorder(TreeNode* root) {
    std::vector<int> out;
    std::vector<TreeNode*> st;
    TreeNode* cur = root;
    TreeNode* prev = nullptr;
    while (cur != nullptr || !st.empty()) {
        while (cur != nullptr) { st.push_back(cur); cur = cur->left; }
        TreeNode* top = st.back();
        if (top->right != nullptr && top->right != prev) {
            cur = top->right;
        } else {
            out.push_back(top->val);
            st.pop_back();
            prev = top;
        }
    }
    return out;
}
```

### 6.4（辨析）Morris 遍历如何做到 O(1) 额外空间？

- 利用叶子节点的空右指针建立线索，指向中序后继，遍历结束后再断开。
- 当前节点的左孩子为空时访问当前节点，并转向右孩子。
- 左孩子非空时找到左子树的最右节点，即当前节点的中序前驱。
- 前驱的右指针为空时把它指向当前节点，随后进入左子树。
- 前驱的右指针已指向当前节点时说明左子树遍历完毕，断开线索、访问当前节点、转向右子树。
- 每个节点的前驱查找最多发生两次，总代价仍是 O(n)，空间 O(1)。
- 边界：单节点树与只有右子树的树都不会建立线索，遍历退化为沿右孩子逐层下行。

### 6.5 层序遍历如何按层输出？

- 用队列保存待访问节点，先把根入队。
- 每轮循环开始记录当前队列长度，只处理这么多个节点，处理完即得到一层。
- 处理节点时把非空的左右孩子入队，下一层的节点排在队尾。
- 时间复杂度 O(n)，队列峰值等于树的最大宽度，最坏为 O(n)。
- 边界：空树返回空的结果数组；最后一层处理完后队列为空，循环自然结束。
- 只要求一维输出时可以不按层切分，逐个出队即可。

```cpp
std::vector<std::vector<int>> levelOrder(TreeNode* root) {
    std::vector<std::vector<int>> out;
    if (root == nullptr) return out;
    std::queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        std::size_t n = q.size();
        std::vector<int> level;
        level.reserve(n);
        for (std::size_t i = 0; i < n; ++i) {
            TreeNode* p = q.front();
            q.pop();
            level.push_back(p->val);
            if (p->left != nullptr) q.push(p->left);
            if (p->right != nullptr) q.push(p->right);
        }
        out.push_back(std::move(level));
    }
    return out;
}
```

### 6.6（陷阱）层序遍历为什么要先保存队列长度？

- 若在循环条件中直接使用 `q.size()`，入队会让长度增长，同一层与下一层混在一起。
- 正确写法是把 `q.size()` 赋给局部变量，本轮循环次数固定为该值。
- 处理途中入队的孩子属于下一层，不能被本轮消费。
- 忘记固定长度时分层的边界丢失，输出退化为一维序列。
- 另一种等价写法是用两个队列交替，或用空指针作为层分隔符。
- 整棵树的层序遍历仍是 O(n)，固定长度只保证分层正确，不改变渐进复杂度。
- 边界：节点数可能超过 `int` 范围，长度变量用 `std::size_t`，避免与有符号数比较。

### 6.7 二叉树的锯齿形层序遍历如何实现？

- 在普通层序基础上记录层号，偶数层从左到右、奇数层从右到左。
- 方法一：按层收集后对奇数层调用 `std::reverse`，代码最短。
- 方法二：用双端队列，奇数层从尾部取出，孩子按相反顺序入队。
- 时间复杂度 O(n)，反转的总额外代价仍是 O(n)。
- 边界：只有一层的树不受方向影响；层号从 0 还是从 1 开始要与题意对齐。
- 常见错误是每层都反转，或在同一层内混合两个方向。

### 6.8 如何求二叉树的最大深度与最小深度？

- 最大深度取左右子树深度的较大值加一，递归到空节点返回 0。
- 最小深度不能直接对空子树取较小值，空子树的高度为 0 会把结果拉低。
- 只有一个孩子时最小深度取该孩子的结果加一，两个孩子都存在时才取较小值。
- 两者时间复杂度都是 O(n)，递归栈空间 O(h)。
- 层序求最小深度时，第一个遇到的叶子所在层即为答案，可以提前结束。
- 边界：空树的两个深度都按 0 处理；单节点树两者都是 1。

### 6.9 如何判断二叉树是否对称？

- 对称指左子树的镜像与右子树相同，比较对象是两棵子树。
- 递归函数接收两个节点，判断值相等，且左的左与右的右对称、左的右与右的左对称。
- 迭代写法用队列成对入队，每次取出两个节点比较，再按镜像顺序压入孩子。
- 时间复杂度 O(n)，空间为递归深度或队列宽度。
- 边界：空树视为对称；节点值相同但结构不同时仍不对称。
- 常见错误是只比较根的两个孩子，或把镜像比较写成同序比较。

### 6.10 如何求二叉树的直径？

- 直径是任意两节点路径边数的最大值，路径不一定经过根。
- 后序递归返回以当前节点为一端向下的最大深度，同时用左右深度之和更新全局答案。
- 每个节点只访问一次，时间复杂度 O(n)，递归栈 O(h)。
- 返回值与答案要分开：返回值供父节点使用，答案只做更新。
- 边界：空树与单节点树的直径都是 0；只有一条链时直径等于链长。
- 题目若按节点数定义直径，结果需要加一，先确认定义再写。

```cpp
int depthOf(TreeNode* node, int& best) {
    if (node == nullptr) return 0;
    int l = depthOf(node->left, best);
    int r = depthOf(node->right, best);
    best = std::max(best, l + r);
    return std::max(l, r) + 1;
}
```

### 6.11 如何判断二叉树是否平衡？

- 平衡指每个节点的左右子树高度差不超过 1，需要自底向上判断。
- 递归返回高度，失衡时返回 -1 作为标记，父节点收到 -1 后直接向上传递。
- 每个节点只计算一次高度，时间复杂度 O(n)；自顶向下重复求高会退化到 O(n²)。
- 空间为递归栈 O(h)。
- 边界：空树平衡；叶子节点平衡；高度差恰好为 1 时仍平衡。
- 常见错误是把平衡理解为左右子树的节点数接近。

### 6.12 如何求二叉树的最近公共祖先？

- 最近公共祖先指同时是两节点的祖先且深度最大的节点。
- 递归终止条件：当前节点为空、等于 `p` 或等于 `q` 时返回当前节点。
- 递归左右子树，两侧都非空时当前节点即为答案，只有一侧非空时返回该侧结果。
- 时间复杂度 O(n)，空间 O(h)，前提是 `p` 与 `q` 都存在于树中。
- 节点带有父指针时可以转化为两条链表求交点，用深度差对齐后同步上移。
- 边界：`p` 等于 `q` 时答案是自身；其中一个节点是另一个的祖先时答案是较浅者。

### 6.13（场景）最近公共祖先是二叉搜索树时如何利用有序性？

- 从根开始比较，两节点的值都小于当前值时答案在左子树。
- 两节点的值都大于当前值时答案在右子树。
- 否则当前节点即为分叉点，也就是最近公共祖先。
- 迭代写法不需要递归栈，时间复杂度 O(h)，空间 O(1)。
- 边界：两节点值相等时直接返回该值的节点；树退化为链时 h 等于 n。
- 该性质依赖左小右大的次序，树中若有重复键需先明确重复键的存放约定。

### 6.14 如何输出二叉树中所有根到叶子的路径？

- 用回溯维护当前路径，进入节点时压入值，离开时弹出。
- 到达叶子时把当前路径复制到结果集，叶子指左右孩子都为空。
- 时间复杂度为 O(n·h) 的上界，复制路径的成本与路径长度成正比。
- 空间为递归栈与当前路径，均为 O(h)，不计结果本身。
- 边界：空树返回空；根即为叶子时输出单元素路径。
- 常见错误是把只有一个孩子的节点当作叶子。

### 6.15 如何求路径和等于目标值的路径数量？

- 路径不要求从根开始，也不要求到叶子结束，但必须沿父子方向。
- 前缀和做法在递归时维护从根到当前节点的前缀和，用哈希表统计出现次数。
- 当前前缀和为 s 时查找 s 减 target 的出现次数并累加，再把 s 计入哈希表。
- 回溯时撤销当前前缀和的计数，保证哈希表只反映当前路径。
- 时间复杂度 O(n)，空间 O(h) 加上哈希表；哈希表键用 64 位整数防止求和溢出。
- 边界：空树返回 0；节点值可能为负，不能用「和超过目标就剪枝」。

### 6.16 如何把二叉树序列化为字符串并反序列化？

- 前序序列化把空节点记为特殊标记，例如 `#`，节点之间用逗号分隔。
- 反序列化按分隔符切分，遇到 `#` 返回空指针，否则创建节点并递归构造左右子树。
- 序列必须保留空节点标记，否则单靠一种遍历顺序无法唯一确定树形。
- 时间复杂度 O(n)，空间 O(n)，字符串长度与节点数成正比。
- 边界：空树序列化为单个 `#`；节点值含分隔符时改用长度前缀或转义。
- 数值范围大时用 `std::stoll` 解析，避免 `std::atoi` 溢出后的未定义行为。

```cpp
void encode(TreeNode* node, std::string& out) {
    if (node == nullptr) { out += "#,"; return; }
    out += std::to_string(node->val);
    out += ',';
    encode(node->left, out);
    encode(node->right, out);
}

TreeNode* decode(const std::vector<std::string>& tok, std::size_t& i) {
    if (i >= tok.size() || tok[i].empty()) return nullptr;
    if (tok[i] == "#") { ++i; return nullptr; }
    TreeNode* node = new TreeNode(std::stoi(tok[i++]));
    node->left = decode(tok, i);
    node->right = decode(tok, i);
    return node;
}
```

### 6.17（辨析）序列化为什么必须保留空节点标记？

- 仅记录非空节点的前序序列无法区分「只有左孩子」与「只有右孩子」。
- 例如前序为 1、2 时，2 可能是 1 的左孩子，也可能是右孩子。
- 补上空节点标记后每个节点的孩子位置固定，序列与树形一一对应。
- 层序序列化同样需要标记，末尾连续的空标记可以省略以压缩长度。
- 二叉搜索树可以只存前序或后序，依靠有序性重建，该做法不适用于一般二叉树。
- 序列化与反序列化各需 O(n) 时间与 O(h) 递归空间，标记只把长度常数扩大。
- 边界：全为空标记的序列只对应空树，反序列化要检查下标是否越界。

### 6.18 由前序与中序序列重建二叉树的关键步骤是什么？

- 前序首元素是根，在中序中定位该值，左侧构成左子树、右侧构成右子树。
- 用哈希表记录中序中每个值的位置，把定位从线性查找降为 O(1)。
- 递归参数用前序区间与中序区间，或只用前序下标加中序区间长度。
- 时间复杂度 O(n)，空间 O(n) 用于哈希表与递归栈。
- 边界：两序列长度不等、区间为空都要单独处理；存在重复值时结果不唯一。
- 常见错误是中序区间边界算错，或递归前忘记推进前序下标。

### 6.19 如何把二叉树原地展开为单链表？

- 要求展开后每个节点的左孩子为空，右孩子指向原前序顺序的下一个节点。
- 方法一：前序遍历收集节点，再依次改写指针，空间 O(n)。
- 方法二：按右、左、中的顺序后序处理，用 prev 记录已处理部分的头节点，把当前节点的右指针指向 prev，左指针置空。
- 方法二每个节点访问一次，时间复杂度 O(n)，空间 O(h)。
- 方法三：把左子树的最右节点接到右子树上，再把左子树移到右侧，空间 O(1)。
- 边界：空树直接返回；只有左子树或只有右子树的树都要保证指针不丢失。

```cpp
void flatten(TreeNode* root) {
    TreeNode* prev = nullptr;
    std::function<void(TreeNode*)> dfs = [&](TreeNode* node) {
        if (node == nullptr) return;
        dfs(node->right);
        dfs(node->left);
        node->left = nullptr;
        node->right = prev;
        prev = node;
    };
    dfs(root);
}
```

### 6.20 如何求二叉树的右视图？

- 右视图是每层最右侧节点值组成的序列。
- 层序遍历时取每层最后一个节点，时间复杂度 O(n)，空间为队列宽度。
- 深度优先按中、右、左的顺序访问，每层第一次到达的节点即为该层最右节点。
- 深度优先需要记录当前深度，结果数组长度不大于深度时追加。
- 时间复杂度 O(n)，空间 O(h)。
- 边界：空树返回空；只有左子树的树，右视图取的是每层唯一的节点。

---

## 7. 二叉搜索树与平衡树

### 7.1 二叉搜索树的中序遍历具有什么性质？

- 中序遍历按左、中、右访问，输出为非递减序列，这是二叉搜索树最直接的判定依据。
- 严格定义的二叉搜索树不含重复键，允许重复时需约定重复键放在左子树还是右子树。
- 中序序列可以判断有序性，但不足以还原树形，同一序列对应多棵树。
- 中序遍历的时间复杂度 O(n)，Morris 遍历可把额外空间降到 O(1)。
- 该性质把第 k 小、范围查询、前驱后继等问题转化为有序序列上的操作。
- 边界：空树的中序序列为空；单节点树的中序序列只有一个元素。

### 7.2 如何验证一棵二叉树是二叉搜索树？

- 只检查每个节点与直接孩子的大小关系不充分，需要约束整棵子树的取值范围。
- 递归时传入开区间上下界，进入左子树把上界收紧为当前值，进入右子树把下界收紧为当前值。
- 节点值等于边界时判定为不合法，是否允许重复键由题目约定。
- 也可中序遍历并检查序列是否严格递增，需要保存前一个节点的值。
- 两种方法时间复杂度都是 O(n)，空间 O(h)；中序写法用 Morris 可把空间降为 O(1)。
- 边界：空树视为合法；节点值取到 `INT_MIN` 或 `INT_MAX` 时上下界要用更宽类型或指针表示。

```cpp
bool valid(TreeNode* node, long long lo, long long hi) {
    if (node == nullptr) return true;
    if (node->val <= lo || node->val >= hi) return false;
    return valid(node->left, lo, node->val) && valid(node->right, node->val, hi);
}

bool isValidBST(TreeNode* root) {
    return valid(root, LLONG_MIN, LLONG_MAX);
}
```

### 7.3（陷阱）只比较父子节点为什么验证不了二叉搜索树？

- 反例：根为 10，左孩子为 5，5 的右孩子为 12。每对父子都满足大小关系，但 12 大于根。
- 二叉搜索树要求整棵左子树的键都小于根，整棵右子树的键都大于根，约束是全局的。
- 局部比较只能保证相邻两层有序，无法排除跨层违例。
- 修正方法是传递上下界，或改用中序遍历检查单调性。
- 中序写法只需一个前驱指针，代码更短，但前驱初值不能用 0 之类的合法键值。
- 上下界写法与中序写法都是 O(n) 时间、O(h) 空间。
- 边界：重复键的处理方式会影响判定，先确认题目是否允许相等。

### 7.4 如何在二叉搜索树中实现查找与插入？

- 查找从根开始，目标小于当前值进入左子树，大于进入右子树，相等即命中。
- 插入先执行查找，走到空指针的位置创建节点，挂到父节点的对应孩子上。
- 迭代写法用父指针记录上一步的节点，时间复杂度 O(h)，空间 O(1)。
- 递归写法代码更短，空间为 O(h)。
- 边界：空树插入时新节点即为根；重复键按约定忽略、覆盖或挂到一侧。
- 常见错误是插入时重新比较整棵树，或在找到空位后忘记链接父节点。

### 7.5 如何删除二叉搜索树中的节点？

- 待删节点没有孩子时直接删除，父节点对应的孩子指针置空。
- 只有一个孩子时用该孩子替代待删节点的位置。
- 有两个孩子时用中序后继替换值，再递归删除那个后继节点。
- 后继节点至多只有一个右孩子，删除它回到前两种情形。
- 时间复杂度 O(h)，递归写法空间 O(h)，迭代写法空间 O(1)。
- 边界：删除根节点要更新根指针；键不存在时保持原树不变。

```cpp
TreeNode* erase(TreeNode* root, int key) {
    if (root == nullptr) return nullptr;
    if (key < root->val) {
        root->left = erase(root->left, key);
    } else if (key > root->val) {
        root->right = erase(root->right, key);
    } else {
        if (root->left == nullptr) return root->right;
        if (root->right == nullptr) return root->left;
        TreeNode* succ = root->right;
        while (succ->left != nullptr) succ = succ->left;
        root->val = succ->val;
        root->right = erase(root->right, succ->val);
    }
    return root;
}
```

### 7.6（场景）删除节点时用前驱还是后继替代？

- 用后继替代保持中序序列的相对次序，左子树仍全部小于新值，右子树仍全部大于新值。
- 用前驱替代同样合法，选择取决于实现约定与树的当前形状。
- 后继一定在右子树中且没有左孩子，前驱一定在左子树中且没有右孩子。
- 交替使用前驱与后继可以缓解反复删除造成的树高倾斜。
- 两种做法的时间复杂度都是 O(h)，实际代价由替代节点的深度决定。
- 边界：右子树为空时没有后继，必须改用前驱或走单孩子分支。

### 7.7 如何求二叉搜索树中第 k 小的元素？

- 中序遍历的第 k 个节点即为答案，遍历到第 k 个即可提前返回。
- 迭代中序用栈实现，计数到 k 时停止，避免遍历整棵树。
- 时间复杂度 O(h + k)，空间 O(h)。
- 需要频繁查询时在节点中维护子树大小，把单次查询降到 O(h)。
- 维护子树大小时，插入与删除要沿路径更新计数。
- 边界：k 从 1 开始计数；k 大于节点总数时返回空或抛出异常，按接口约定处理。

### 7.8 如何把有序数组转换为高度平衡的二叉搜索树？

- 取中点作为根，左半段递归构造左子树，右半段递归构造右子树。
- 中点取 `left + (right - left) / 2`，避免两数相加溢出。
- 每次划分规模减半，时间复杂度 O(n)，递归栈 O(log n)。
- 结果高度为 O(log n)，任意节点的左右子树高度差不超过 1。
- 边界：空数组返回空指针；区间只剩一个元素时直接建叶子节点；数组含重复值时结果不唯一。
- 常见错误是区间写成闭区间却在递归时漏掉中点，或中点下标计算出界。

### 7.9（复杂度）二叉搜索树的查找复杂度在什么条件下退化？

- 查找代价等于从根到目标的路径长度，平均 O(log n) 的前提是树高接近 log n。
- 按升序或降序依次插入会形成链状树，树高为 n，查找退化为 O(n)。
- 随机插入顺序下期望高度为 O(log n)，与输入规模成对数关系。
- 删除操作可能使树逐渐倾斜，尤其是总用同一侧的替代节点时。
- 引入随机化或平衡策略可以把最坏情况控制在 O(log n)。
- 边界：单节点树查找为 O(1)；空树查找直接失败。

### 7.10 如何求二叉搜索树中任意两个节点值之差的最小值？

- 最小差值一定出现在中序序列的相邻元素之间。
- 中序遍历时维护前一个节点的值，每步计算差并更新最小值。
- 时间复杂度 O(n)，空间 O(h)。
- 差值用 64 位整数保存，避免两个接近 `INT_MAX` 与 `INT_MIN` 的值相减溢出。
- 边界：节点数小于 2 时不存在差值，返回一个约定的标记值。
- 常见错误是对所有节点两两比较，把复杂度推到 O(n²)。

### 7.11 如何求二叉搜索树中节点的中序后继？

- 后继是键大于给定节点的最小节点。
- 若节点有右子树，后继是右子树的最左节点。
- 否则向上查找，第一个满足「当前节点位于其左子树」的祖先即为后继。
- 有父指针时直接上溯，时间复杂度 O(h)，空间 O(1)。
- 没有父指针时从根开始查找，记录最后一次向左走时的节点。
- 边界：最大键没有后继，返回空指针；重复键的后继定义需按约定处理。

```cpp
TreeNode* inorderSuccessor(TreeNode* root, TreeNode* p) {
    TreeNode* succ = nullptr;
    while (root != nullptr) {
        if (p->val < root->val) { succ = root; root = root->left; }
        else root = root->right;
    }
    return succ;
}
```

### 7.12 如何实现二叉搜索树的范围查询？

- 查询闭区间内全部键，按中序输出即为有序结果。
- 剪枝条件：当前值大于下界才递归左子树，当前值小于上界才递归右子树。
- 时间复杂度 O(h + k)，k 为结果数量；不剪枝会退化为 O(n)。
- 空间为递归栈 O(h) 与结果数组。
- 边界：下界大于上界时返回空；区间可能覆盖全部节点。
- 常见错误是把剪枝条件写成严格不等号，导致边界键被漏掉。

### 7.13（实现）AVL 树的四种旋转分别对应哪种失衡？

- 左左失衡用右旋，右右失衡用左旋。
- 左右失衡先对左孩子左旋，再对当前节点右旋。
- 右左失衡先对右孩子右旋，再对当前节点左旋。
- 旋转只改变局部指针，中序序列不变，结果仍是二叉搜索树。
- 旋转后按先孩子后父节点的顺序更新高度。
- 单次旋转 O(1)，插入整体 O(log n)；孩子为空时不能旋转，调用前需确认失衡方向。
- 边界：空树插入后新节点即为根；旋转后要返回新的子树根，否则父节点指针丢失。

```cpp
int height(Node* p) { return p == nullptr ? 0 : p->h; }

Node* rotateRight(Node* y) {
    Node* x = y->left;
    y->left = x->right;
    x->right = y;
    y->h = std::max(height(y->left), height(y->right)) + 1;
    x->h = std::max(height(x->left), height(x->right)) + 1;
    return x;
}

Node* rotateLeft(Node* x) {
    Node* y = x->right;
    x->right = y->left;
    y->left = x;
    x->h = std::max(height(x->left), height(x->right)) + 1;
    y->h = std::max(height(y->left), height(y->right)) + 1;
    return y;
}
```

### 7.14 AVL 树插入后如何回溯更新高度与平衡因子？

- 插入沿查找路径下行，在空位创建节点，高度为 1。
- 回溯时先更新当前节点高度，取左右孩子高度的较大值加一。
- 再计算平衡因子，即左高减右高，绝对值大于 1 时按失衡形态旋转。
- 一次插入最多触发一次旋转，旋转后子树高度恢复到插入前，可以提前结束回溯。
- 删除可能触发 O(log n) 次旋转，需要一路回溯到根。
- 边界：空树插入后根的高度为 1；重复键被忽略时不触发任何更新。

```cpp
// height 与旋转函数见 7.13
Node* insert(Node* node, int key) {
    if (node == nullptr) return new Node{key, 1, nullptr, nullptr};
    if (key < node->val) node->left = insert(node->left, key);
    else if (key > node->val) node->right = insert(node->right, key);
    else return node;
    node->h = std::max(height(node->left), height(node->right)) + 1;
    int bf = height(node->left) - height(node->right);
    if (bf > 1 && key < node->left->val) return rotateRight(node);
    if (bf < -1 && key > node->right->val) return rotateLeft(node);
    if (bf > 1) { node->left = rotateLeft(node->left); return rotateRight(node); }
    if (bf < -1) { node->right = rotateRight(node->right); return rotateLeft(node); }
    return node;
}
```

### 7.15（辨析）AVL 树与红黑树在工程上如何取舍？

- AVL 树严格平衡，树高不超过约 1.44 log n，查找路径更短。
- 红黑树只保证最长路径不超过最短路径的两倍，树高上界为 2 log(n + 1)。
- AVL 树插入与删除的旋转次数更多，删除最坏需要 O(log n) 次旋转。
- 红黑树插入最多两次旋转，删除最多三次旋转，写操作的代价更稳定。
- 读多写少的场景偏 AVL，读写混合且延迟要求稳定的场景偏红黑树。
- 主流实现的有序关联容器多采用红黑树，具体选择由实现定义。
- 边界：节点很少时两者树高相同，取舍取决于写操作比例与实现成本。

### 7.16 红黑树的五条性质如何限制树高？

- 节点非红即黑，根为黑，空指针视为黑。
- 红节点的两个孩子都是黑，因此从根到叶的路径上不会出现连续红节点。
- 任一节点到其所有后代空指针的路径包含相同数量的黑节点，该数量称为黑高。
- 最短路径全为黑节点，最长路径红黑交替，长度不超过最短路径的两倍。
- 黑高为 h 时节点数至少为 2^h - 1，由此树高不超过 2 log(n + 1)。
- 这些性质只保证近似平衡，查找、插入、删除都是 O(log n)。
- 边界：空树与单节点树满足全部性质；插入后若根变红必须重新染黑。

### 7.17 红黑树插入后的修复分为哪几种情形？

- 新节点先染红，父节点为黑时性质未被破坏，直接结束。
- 父节点为红且叔节点为红时，把父与叔染黑、祖父染红，问题上移到祖父继续处理。
- 父节点为红且叔节点为黑时，若当前节点与父节点方向不一致，先对父节点旋转转为一致。
- 方向一致后对祖父旋转，并把父节点染黑、祖父染红，修复结束。
- 插入最多两次旋转，变色可能沿路径上溯 O(log n) 次。
- 边界：根被染红后要重新染黑；祖父为空说明父节点已是根，循环应终止。

### 7.18（辨析）红黑树为什么用颜色编码记录平衡信息？

- 颜色只占一位信息，可与指针低位或节点头中的位域共存，节省空间。
- 维护颜色只需在旋转与染色时做常数次修改，不需要沿路径重算高度。
- 高度信息在旋转后需要重算受影响节点，红黑树用局部规则替代了显式平衡因子。
- 红黑树的平衡条件是局部的，修复只看父、叔、祖父三个节点。
- AVL 的平衡因子也可用两位表示，同样是局部信息，但更新范围更大。
- 查找、插入、删除仍由树高决定，为 O(log n)，颜色信息不改变渐进代价。
- 边界：染色不能替代旋转，颜色只记录结构约束，不直接给出节点深度。

### 7.19 如何把二叉搜索树转换为累加树？

- 累加树要求每个节点的新值等于原树中不小于该键的所有键之和。
- 按右、中、左的逆中序遍历，访问顺序为从大到小。
- 维护累加和，每访问一个节点先把它加到累加和，再把累加和写回该节点。
- 时间复杂度 O(n)，空间 O(h)；Morris 逆中序可把空间降到 O(1)。
- 边界：空树直接返回；节点值可能为负，累加和随之减小。
- 常见错误是按普通中序遍历，得到从小到大的错误累加方向。

```cpp
void toGreaterSum(TreeNode* node, int& sum) {
    if (node == nullptr) return;
    toGreaterSum(node->right, sum);
    sum += node->val;
    node->val = sum;
    toGreaterSum(node->left, sum);
}
```

### 7.20（场景）如何用 `std::map` 的边界函数做区间统计？

- `lower_bound` 返回第一个不小于给定键的位置，`upper_bound` 返回第一个大于给定键的位置。
- 闭区间内的元素个数等于两个迭代器相减，用 `std::distance` 计算。
- 单次查询的复杂度为 O(log n) 加上遍历结果的数量。
- `std::map` 按键有序，适合动态插入与删除后再查询。
- 键为浮点数时注意精度与负零的排序位置，必要时改用整数键。
- 边界：区间为空时两个迭代器相等；键不存在时返回的是插入位置，解引用前要检查。

---

## 8. 堆与优先队列

### 8.1 堆的数组表示如何定位父子节点？

- 下标从 0 开始时，下标 i 的左孩子为 2i + 1，右孩子为 2i + 2，父节点为 (i - 1) / 2。
- 下标从 1 开始时公式更整齐，孩子为 2i 与 2i + 1，父节点为 i / 2。
- 数组表示不需要指针，缓存局部性好，代价是容量固定或需要动态扩容。
- 堆只保证父子之间的大小关系，兄弟之间与整个数组都没有全局有序性。
- 完全二叉树没有空洞，n 个节点恰好占用数组的前 n 个位置。
- 下标运算都是 O(1)，建堆与下沉的代价由树高决定，与下标换算无关。
- 边界：根节点没有父节点，计算父下标前要判断 i 是否为 0。

### 8.2 如何自底向上建堆？为什么是 O(n)？

- 从最后一个非叶节点开始，依次对每个节点执行下沉，直到根。
- 下标从 0 开始时，最后一个非叶节点的下标为 n / 2 - 1。
- 下沉代价与节点高度成正比，高度为 h 的节点约有 n / 2^(h+1) 个。
- 总代价为各层节点数与高度乘积之和，收敛到 2n，因此是 O(n)。
- 逐个插入建堆的代价为 O(n log n)，上界更高但实现更简单。
- 边界：空堆与单元素堆不需要调整；比较器必须满足严格弱序。

```cpp
void siftDown(std::vector<int>& h, std::size_t i, std::size_t n) {
    int v = h[i];
    while (2 * i + 1 < n) {
        std::size_t c = 2 * i + 1;
        if (c + 1 < n && h[c + 1] > h[c]) ++c;
        if (h[c] <= v) break;
        h[i] = h[c];
        i = c;
    }
    h[i] = v;
}

void buildHeap(std::vector<int>& h) {
    for (std::size_t i = h.size() / 2; i-- > 0; ) siftDown(h, i, h.size());
}
```

### 8.3（复杂度）堆的插入、取堆顶与删除堆顶的复杂度分别是多少？

- 取堆顶为 O(1)，直接返回数组首元素。
- 插入把新元素放到末尾再上浮，时间复杂度 O(log n)。
- 删除堆顶把末尾元素移到根再下沉，时间复杂度 O(log n)。
- 建堆为 O(n)，堆排序整体为 O(n log n)。
- 上浮与下沉的交换次数不超过树高，比较次数约为交换次数的两倍。
- 边界：空堆取堆顶或删除堆顶属于未定义行为，接口需先判空。

### 8.4 如何手写一个大根堆的插入与删除？

- 用动态数组存储，插入时追加到末尾，再与父节点比较并交换，直到不大于父节点。
- 删除堆顶时把末尾元素移到根，删除末尾，再从根开始与较大的孩子比较并交换。
- 下沉时先选出两个孩子中较大的一个，再与当前节点比较，避免两次交换。
- 循环终止条件是到达叶子，或当前节点不小于较大的孩子。
- 插入与删除的时间复杂度都是 O(log n)，空间 O(1)。
- 边界：删除后堆为空要单独处理；判断孩子下标越界要在取孩子之前完成。

```cpp
void push(std::vector<int>& h, int v) {
    h.push_back(v);
    std::size_t i = h.size() - 1;
    while (i > 0) {
        std::size_t p = (i - 1) / 2;
        if (h[p] >= h[i]) break;
        std::swap(h[p], h[i]);
        i = p;
    }
}

void pop(std::vector<int>& h) {
    h[0] = h.back();
    h.pop_back();
    std::size_t i = 0, n = h.size();
    while (true) {
        std::size_t l = 2 * i + 1, r = l + 1, big = i;
        if (l < n && h[l] > h[big]) big = l;
        if (r < n && h[r] > h[big]) big = r;
        if (big == i) break;
        std::swap(h[i], h[big]);
        i = big;
    }
}
```

### 8.5（陷阱）`std::priority_queue` 默认是什么堆？

- 默认使用 `std::less` 作为比较器，堆顶为最大元素，即大根堆。
- 要得到小根堆需显式传入 `std::greater`，三个模板参数都要写全。
- 比较器返回真表示第一个参数的优先级低于第二个参数。
- 同一比较器在 `std::sort` 中决定升序，在 `std::priority_queue` 中决定堆顶为最大元素，用途不同。
- `std::priority_queue` 不支持遍历与修改任意元素，只能访问堆顶。
- 取堆顶为 O(1)，入堆与出堆为 O(log n)，比较器只影响顺序，不影响代价。
- 边界：元素类型不可复制或比较器有状态时，构造方式要相应调整。

### 8.6 如何用 `std::priority_queue` 实现小根堆？

- 声明为 `std::priority_queue<int, std::vector<int>, std::greater<int>>`。
- 也可以把元素取负后放入大根堆，取用时再取反，适合不便写比较器的场合。
- 取负写法在元素为无符号数或接近类型最小值时可能溢出。
- 自定义类型的小根堆要为 `std::greater` 提供 `operator>`，或直接写比较器。
- 比较器必须是严格弱序，用小于等于比较会破坏堆的结构性质。
- 入堆与出堆为 O(log n)，取负映射本身是 O(1)。
- 边界：`std::greater` 需要包含 `functional` 头文件。

### 8.7（实现）如何求数组中第 k 大的元素？

- 维护大小为 k 的小根堆，堆顶是当前 k 个最大元素中的最小值。
- 遍历数组，堆未满时直接入堆；堆满后只有大于堆顶的元素才替换堆顶。
- 遍历结束后的堆顶即为第 k 大元素。
- 时间复杂度 O(n log k)，空间 O(k)；k 接近 n 时退化为 O(n log n)。
- 快速选择用分治把平均复杂度降到 O(n)，最坏为 O(n²)。
- 边界：k 小于 1 或大于数组长度时返回错误；含重复元素时第 k 大按排序后的位置定义。

```cpp
int kthLargest(const std::vector<int>& a, int k) {
    std::priority_queue<int, std::vector<int>, std::greater<int>> q;
    for (int v : a) {
        q.push(v);
        if (static_cast<int>(q.size()) > k) q.pop();
    }
    return q.top();
}
```

### 8.8 数据流中第 k 大的元素如何维护？

- 数据流只能顺序读取，无法回头重排，适合用大小为 k 的小根堆增量维护。
- 插入时元素入堆，堆大小超过 k 时弹出堆顶。
- 查询时直接返回堆顶，堆未满时返回约定的标记。
- 单次插入 O(log k)，查询 O(1)，空间 O(k)。
- 需要支持删除任意元素时配合哈希表做惰性删除，弹出时校验元素是否仍有效。
- 边界：k 为 0 时无定义；流中元素不足 k 个时不应返回堆顶。

### 8.9（实现）如何求数据流的中位数？

- 用两个堆，大根堆保存较小的一半，小根堆保存较大的一半。
- 约定大根堆的元素个数等于小根堆，或比小根堆多一个。
- 插入时先按与另一侧堆顶的大小关系放入一侧，再调整两堆大小差不超过 1。
- 中位数：两堆大小相等时取两个堆顶的平均值，否则取元素较多一侧的堆顶。
- 插入 O(log n)，查询 O(1)，空间 O(n)。
- 边界：空流没有中位数；元素为整数时平均值要用浮点或按题意取整。

```cpp
class MedianFinder {
public:
    void add(int x) {
        if (lo.empty() || x <= lo.top()) lo.push(x);
        else hi.push(x);
        if (lo.size() > hi.size() + 1) { hi.push(lo.top()); lo.pop(); }
        if (hi.size() > lo.size()) { lo.push(hi.top()); hi.pop(); }
    }
    double median() const {
        if (lo.size() == hi.size())
            return (static_cast<long long>(lo.top()) + hi.top()) / 2.0;
        return lo.top();
    }
private:
    std::priority_queue<int> lo;
    std::priority_queue<int, std::vector<int>, std::greater<int>> hi;
};
```

### 8.10（辨析）求 Top-K 用堆还是快速选择？

- 堆解法在线处理数据，空间 O(k)，适合数据流或内存受限的场合。
- 快速选择需要随机访问整个数组，平均 O(n)，最坏 O(n²)，并且会修改输入。
- 需要输出有序的 Top-K 时，堆解法最后排序的代价为 O(k log k)。
- 数据量超过内存时堆解法可以分块处理，快速选择不行。
- 快速选择用随机化枢轴可把期望代价压到 O(n)，中位数之中位数能保证最坏情况为 O(n)。
- 选择依据是数据形态与输出要求，渐进复杂度只提供上界。
- 边界：k 为 1 或 k 等于数组长度时两种方法差异最小，可直接取极值或整体排序。

### 8.11（实现）如何合并 k 个有序链表？

- 把每个链表的头节点放入小根堆，堆中元素为节点指针。
- 每次弹出最小节点接到结果链表尾部，再把该节点的后继入堆。
- 时间复杂度 O(N log k)，N 为节点总数，k 为链表数，空间 O(k)。
- 两两归并的做法同样是 O(N log k)，空间 O(1)，常数更小。
- 边界：空链表不参与建堆；所有链表为空时返回空指针。
- 常见错误是弹出后忘记把后继入堆，或对空指针解引用。

```cpp
ListNode* mergeKLists(std::vector<ListNode*>& lists) {
    auto cmp = [](ListNode* a, ListNode* b) { return a->val > b->val; };
    std::priority_queue<ListNode*, std::vector<ListNode*>, decltype(cmp)> q(cmp);
    for (ListNode* p : lists) if (p != nullptr) q.push(p);
    ListNode dummy;
    ListNode* tail = &dummy;
    while (!q.empty()) {
        ListNode* p = q.top();
        q.pop();
        tail->next = p;
        tail = p;
        if (p->next != nullptr) q.push(p->next);
    }
    return dummy.next;
}
```

### 8.12 如何合并 k 个有序数组？

- 与合并链表相同，堆中保存元素值与来源数组下标、元素下标。
- 每次取出最小元素追加到结果，再把同一数组的下一个元素入堆。
- 时间复杂度 O(N log k)，空间 O(k) 加上结果数组。
- k 个数组长度相近时两两归并的总代价也是 O(N log k)，缓存局部性更好。
- 边界：空数组跳过；某个数组耗尽后不再入堆。
- 结果需要去重时在追加前比较末尾元素，不能在入堆时去重。

### 8.13 堆排序的过程与复杂度是什么？

- 先自底向上建大根堆，代价 O(n)。
- 再把堆顶与末尾元素交换，堆的有效范围减一，对新的堆顶执行下沉。
- 重复 n - 1 次，数组整体升序。
- 总时间复杂度 O(n log n)，原地排序，额外空间 O(1)。
- 下沉的比较次数与树高成正比，建堆阶段的总代价小于排序阶段。
- 边界：空数组与单元素数组不需要排序；比较器必须满足严格弱序。

```cpp
void heapSort(std::vector<int>& a) {
    std::size_t n = a.size();
    auto sift = [&](std::size_t i, std::size_t end) {
        while (true) {
            std::size_t l = 2 * i + 1, r = l + 1, big = i;
            if (l < end && a[l] > a[big]) big = l;
            if (r < end && a[r] > a[big]) big = r;
            if (big == i) return;
            std::swap(a[i], a[big]);
            i = big;
        }
    };
    for (std::size_t i = n / 2; i-- > 0; ) sift(i, n);
    for (std::size_t end = n; end-- > 1; ) { std::swap(a[0], a[end]); sift(0, end); }
}
```

### 8.14（陷阱）堆排序为什么不稳定？

- 堆排序在交换堆顶与末尾元素时，把远处的元素直接搬到前面，跨越了中间元素。
- 相等的元素在交换与下沉过程中可能改变相对次序。
- 建堆阶段同样会打乱相同键的原有顺序。
- 稳定性要求相等元素的相对次序不变，任何长距离交换都可能破坏该性质。
- 需要稳定排序时改用归并排序或 `std::stable_sort`。
- 时间复杂度仍是 O(n log n)，不稳定性不带来额外的渐进代价。
- 边界：全部键相等时堆排序的结果仍然正确，只是无法保证与原序一致。

### 8.15 如何实现堆的上浮与下沉？

- 上浮用于插入：新元素放在末尾，与父节点比较，父节点较小时交换并继续向上。
- 下沉用于删除堆顶与建堆：与较大的孩子比较，孩子较大时交换并继续向下。
- 先保存待调整元素，再逐层移动父节点或孩子，最后写回，可把交换次数减半。
- 上浮的循环条件是下标大于 0，下沉的循环条件是左孩子下标小于堆大小。
- 两者都只沿一条路径移动，时间复杂度 O(log n)。
- 边界：堆大小为 0 或 1 时两种操作都不产生移动。

### 8.16 如何用堆实现定时器？

- 定时器按到期时间排序，用最小堆保存，堆顶是最近到期的任务。
- 每个任务记录到期时间与回调，插入时按到期时间上浮。
- 事件循环取出堆顶，比较当前时间与到期时间，未到期则计算需要等待的时长。
- 取消任务时不能直接删除堆中任意元素，常用惰性删除，弹出时跳过已失效的项。
- 插入 O(log n)，取最近到期 O(1)，删除堆顶 O(log n)。
- 边界：到期时间相同时用序号做次级键保证先进先出；系统时间被调整时应改用单调时钟。

### 8.17 如何求数组中距离原点最近的 k 个点？

- 维护大小为 k 的大根堆，堆顶是当前 k 个点中距离最大的一个。
- 遍历时计算距离平方，堆未满直接入堆，堆满且新距离小于堆顶时替换堆顶。
- 用距离平方比较，避免开方带来的精度问题与额外开销。
- 时间复杂度 O(n log k)，空间 O(k)。
- 边界：k 大于点数时返回全部点；坐标绝对值很大时距离平方要用 64 位整数或浮点类型。
- 结果不要求有序时无需再对堆排序。

### 8.18（代码阅读）`std::make_heap` 与 `std::sort_heap` 的配合有什么要求？

- `std::make_heap` 把区间调整为堆，时间复杂度 O(n)。
- `std::sort_heap` 要求区间已经是堆，否则结果未定义。
- `std::sort_heap` 排序后区间不再具有堆性质，不能继续当作堆使用。
- `std::push_heap` 与 `std::pop_heap` 只负责调整次序，不负责增删元素，容量管理由容器完成。
- 默认比较器是 `std::less`，得到大根堆与升序结果。
- 边界：空区间与单元素区间调用这些算法是合法的，不产生任何操作。

### 8.19 如何实现支持修改键值的索引堆？

- 在普通堆之外维护位置数组，记录每个元素在堆数组中的下标。
- 修改某个元素的键后，按新键与旧键的大小关系选择上浮或下沉。
- 交换堆中两个元素时同步更新位置数组，保证下标映射始终有效。
- 删除任意元素时把该位置与末尾交换，删除末尾，再对换上的元素做一次上浮或下沉。
- 单次操作 O(log n)，额外空间 O(n)。
- 边界：位置数组中无效位置用 -1 标记；元素标识必须能直接映射到下标。

### 8.20 如何用堆求两个有序数组中前 k 个最小的数对？

- 数对由一个数组的元素与另一个数组的元素组成，按两者之和排序。
- 把下标对 (0, 0) 入堆，每次弹出最小数对 (i, j) 后入堆 (i + 1, j) 与 (i, j + 1)。
- 用集合记录已入堆的下标对，避免重复。
- 弹出 k 次即得结果，时间复杂度 O(k log k)，空间 O(k)。
- 边界：任一数组为空时结果为空；k 大于数对总数时只返回全部数对。
- 两个数组都递增时该扩展方式不会遗漏更小的数对，单调性保证了这一点。

---

## 9. 排序

### 9.1（辨析）比较排序的下界为什么是 O(n log n)？

- 比较排序的每次比较只有两种结果，整个执行过程对应一棵二叉判定树。
- 判定树的叶子数至少为 n!，因为 n 个元素有 n! 种排列，每种都可能成为输出。
- 高度为 h 的二叉树叶子数不超过 2^h，因此 h 不小于 log2(n!)。
- 由斯特林公式，log2(n!) 为 Θ(n log n)，下界由此得到。
- 该下界只适用于基于比较的排序，计数排序与基数排序不受限制。
- 下界针对最坏情况，平均比较次数同样为 O(n log n) 量级。
- 边界：n 为 0 或 1 时不需要比较，下界讨论通常针对 n 不小于 2。

### 9.2 快速排序的分区有哪几种写法？

- Lomuto 分区用单指针扫描，把小于枢轴的元素换到前面，实现简单但交换次数多。
- Hoare 分区用双指针从两端向中间靠拢，交换次数少，边界更难写对。
- 三路划分把区间分为小于、等于、大于枢轴三段，适合大量重复元素。
- 分区后左右两段的元素分别不大于和不小于枢轴，再递归处理两侧。
- 平均时间复杂度 O(n log n)，最坏 O(n²)，空间为递归栈 O(log n) 到 O(n)。
- 边界：区间长度为 0 或 1 时直接返回；Hoare 分区要求枢轴取中间值，否则可能死循环。

```cpp
int partition(std::vector<int>& a, int lo, int hi) {
    int pivot = a[lo + (hi - lo) / 2];
    int i = lo - 1, j = hi + 1;
    while (true) {
        do { ++i; } while (a[i] < pivot);
        do { --j; } while (a[j] > pivot);
        if (i >= j) return j;
        std::swap(a[i], a[j]);
    }
}
```

### 9.3（陷阱）快速排序在什么输入上退化为 O(n²)？

- 每次分区都把区间分成 1 与 n - 1 两部分时，递归深度为 n，总代价为 O(n²)。
- 已有序的输入配合取首元素为枢轴，会稳定触发这种划分。
- 全部元素相等时两路划分同样退化，三路划分可以把这种情况降到 O(n)。
- 固定枢轴还可能被构造出针对性输入，形成算法复杂度攻击。
- 随机选择枢轴可以把最坏情况出现的概率降到很低，三数取中可以缓解常见的劣化输入。
- 边界：递归深度过大时要限制栈深或改用显式栈，避免栈溢出。

### 9.4 如何选择快速排序的枢轴？

- 取首元素或尾元素实现最简单，但对有序输入表现最差。
- 随机取枢轴的期望复杂度为 O(n log n)，与输入分布无关。
- 三数取中取首、中、尾的中位数，能缓解部分有序输入，代价是三次比较。
- 九数取中进一步降低劣化概率，代价是选出枢轴需要更多比较。
- 枢轴的选择不改变最坏复杂度，只改变劣化输入所占的比例。
- 边界：区间很短时改用插入排序，避免为小数组付出递归开销。

### 9.5 快速排序的三路划分解决什么问题？

- 把区间划分为小于枢轴、等于枢轴、大于枢轴三段，等于段不再参与递归。
- 大量重复元素时等于段可能占据大部分区间，递归规模迅速缩小。
- 全部元素相等时一次分区即结束，复杂度为 O(n)。
- 划分用三个指针，分别指向小于段末尾、当前扫描位置、大于段起始。
- 时间复杂度期望 O(n log n)，空间 O(log n)。
- 边界：枢轴取区间首元素时扫描从第二个位置开始，循环条件包含等于段边界。

```cpp
void sort3(std::vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int pivot = a[lo];
    int lt = lo, i = lo + 1, gt = hi;
    while (i <= gt) {
        if (a[i] < pivot) std::swap(a[lt++], a[i++]);
        else if (a[i] > pivot) std::swap(a[i], a[gt--]);
        else ++i;
    }
    sort3(a, lo, lt - 1);
    sort3(a, gt + 1, hi);
}
```

### 9.6（实现）归并排序的自顶向下与自底向上写法有何差异？

- 自顶向下递归二分区间，合并后返回，代码直观，空间为递归栈 O(log n)。
- 自底向上从长度为 1 的段开始两两合并，段长逐轮翻倍，不需要递归。
- 自底向上写法避免函数调用开销，也便于改成并行或外部排序。
- 两者时间复杂度都是 O(n log n)，都需要 O(n) 的辅助数组。
- 合并时可以从辅助数组复制回原数组，或交替使用两个数组减少复制。
- 边界：段长翻倍时可能超过数组长度，内层循环的上界要取较小值。

```cpp
void mergeSort(std::vector<int>& a) {
    std::vector<int> buf(a.size());
    for (std::size_t width = 1; width < a.size(); width *= 2) {
        for (std::size_t lo = 0; lo < a.size(); lo += 2 * width) {
            std::size_t mid = std::min(lo + width, a.size());
            std::size_t hi = std::min(lo + 2 * width, a.size());
            std::size_t i = lo, j = mid, k = lo;
            while (i < mid && j < hi) buf[k++] = (a[j] < a[i]) ? a[j++] : a[i++];
            while (i < mid) buf[k++] = a[i++];
            while (j < hi) buf[k++] = a[j++];
            std::copy(buf.begin() + lo, buf.begin() + hi, a.begin() + lo);
        }
    }
}
```

### 9.7 归并排序为什么稳定？稳定性由哪一步决定？

- 稳定性由合并步骤决定：两个子序列有序，相等时优先取左侧元素。
- 取左侧元素保证相等元素保持原有的先后次序，因为左侧子序列的下标更小。
- 递归划分本身不影响稳定性，划分只是把原序列按位置切开。
- 若合并时相等情况下取右侧元素，相等元素的次序被交换，排序变为不稳定。
- 时间复杂度 O(n log n)，空间 O(n)，稳定性的代价主要是辅助数组。
- 边界：辅助数组必须按原区间长度分配，复用全局缓冲区时注意并发安全。

### 9.8 如何求数组中的逆序对数量？

- 逆序对指下标 i 小于 j 但值大于 j 位置值的数对。
- 归并排序合并时，右侧元素被取出时，左侧剩余元素都与它构成逆序对。
- 每取出一个右侧元素，把计数器加上左侧区间剩余的元素个数。
- 时间复杂度 O(n log n)，空间 O(n)，计数结果用 64 位整数。
- 树状数组按值域统计同样能做到 O(n log n)，需要先离散化。
- 边界：全部相等的数组逆序对为 0；严格递减的数组逆序对数为 n(n-1)/2。

```cpp
long long mergeCount(std::vector<int>& a, std::vector<int>& buf, int lo, int hi) {
    if (hi - lo <= 1) return 0;
    int mid = lo + (hi - lo) / 2;
    long long cnt = mergeCount(a, buf, lo, mid) + mergeCount(a, buf, mid, hi);
    int i = lo, j = mid, k = lo;
    while (i < mid && j < hi) {
        if (a[j] < a[i]) { cnt += mid - i; buf[k++] = a[j++]; }
        else buf[k++] = a[i++];
    }
    while (i < mid) buf[k++] = a[i++];
    while (j < hi) buf[k++] = a[j++];
    std::copy(buf.begin() + lo, buf.begin() + hi, a.begin() + lo);
    return cnt;
}
```

### 9.9（复杂度）归并排序的空间复杂度能否降到 O(1)？

- 常规归并需要与输入等长的辅助数组，空间为 O(n)。
- 存在 O(n log n) 时间的原地归并算法，实现复杂且常数较大。
- 基于旋转的原地归并写法简单，但总代价会升到 O(n log² n)。
- 链表归并可以做到 O(1) 额外空间，因为合并只改指针。
- 外部排序的辅助空间与内存缓冲区大小有关，与数据总量无关。
- 边界：递归栈本身也占 O(log n)，严格意义上的 O(1) 需要改成迭代。

### 9.10 堆排序的建堆与排序阶段各占多少时间？

- 建堆阶段自底向上下沉，总代价 O(n)，小于排序阶段。
- 排序阶段执行 n - 1 次「交换堆顶与末尾并下沉」，每次 O(log n)。
- 总时间复杂度 O(n log n)，两个阶段都是原地操作。
- 建堆的比较次数约为 2n，排序阶段约为 2n log n。
- 堆排序的访存模式跳跃，缓存命中率低于快速排序与归并排序。
- 边界：数组长度为 0 或 1 时两个阶段都不执行。

### 9.11（辨析）快速排序、归并排序与堆排序如何取舍？

- 快速排序平均最快，常数小，原地排序，但最坏 O(n²) 且不稳定。
- 归并排序稳定，最坏 O(n log n)，需要 O(n) 辅助空间，适合链表与外部排序。
- 堆排序最坏 O(n log n)，空间 O(1)，但缓存不友好且不稳定。
- 数据基本有序时两路快排的分区会退化，归并排序不受影响。
- 要求稳定性时只能选归并排序，内存紧张时选快速排序或堆排序。
- 实际实现常用混合策略：快排为主，小区间用插入排序，递归过深时切换堆排序。
- 边界：元素很少时三者的差异可以忽略，选择更依赖实现常数与内存约束。

### 9.12 计数排序适用于什么数据？

- 适用于取值范围有限的整数，或可映射为整数的键。
- 统计每个值出现的次数，再按值从小到大展开，时间复杂度 O(n + k)，k 为值域。
- 值域远大于元素个数时，时间与空间都被 k 拖累。
- 计数排序是稳定排序，前提是回填时保持原序列的相对次序。
- 边界：负数需要先整体偏移；值域过大时改用基数排序或比较排序。
- 键不是整数时可以先离散化，但离散化本身需要 O(n log n)。

### 9.13（陷阱）计数排序回填时为什么要从后向前？

- 前缀和给出每个值在输出中的末尾位置，从后向前回填才能保持稳定性。
- 从后向前遇到相同值时，后出现的元素被放进更靠后的位置。
- 若从前向后回填且位置递减，相等元素的相对次序会被反转。
- 回填时每写入一个元素，对应计数减一，指向下一个空位。
- 时间复杂度 O(n + k)，空间为计数数组与输出数组。
- 边界：计数数组要用足够宽的类型，元素个数超过计数类型上限时溢出。

```cpp
void countingSort(std::vector<int>& a, int maxValue) {
    std::vector<int> cnt(maxValue + 1, 0);
    for (int v : a) ++cnt[v];
    for (int v = 1; v <= maxValue; ++v) cnt[v] += cnt[v - 1];
    std::vector<int> out(a.size());
    for (std::size_t i = a.size(); i-- > 0; ) out[--cnt[a[i]]] = a[i];
    a.swap(out);
}
```

### 9.14 基数排序的 LSD 与 MSD 有何区别？

- LSD 从最低位开始，逐位稳定排序，最后得到整体有序，实现简单且不需要递归。
- MSD 从最高位开始，按位分桶后对每个桶递归处理，接近字典序的自然划分。
- LSD 要求每一趟的排序稳定，通常用计数排序作为内层。
- LSD 的时间复杂度 O(d(n + k))，d 为位数，k 为基数。
- MSD 在数据分布均匀时可以提前终止，适合字符串排序。
- 边界：负数与不同长度的键要先统一处理，例如加偏移或按符号分组。

```cpp
void radixSort(std::vector<int>& a) {
    int maxValue = 0;
    for (int v : a) maxValue = std::max(maxValue, v);
    std::vector<int> buf(a.size());
    for (long long exp = 1; maxValue / exp > 0; exp *= 10) {
        int cnt[10] = {};
        for (int v : a) ++cnt[static_cast<int>((v / exp) % 10)];
        for (int d = 1; d < 10; ++d) cnt[d] += cnt[d - 1];
        for (std::size_t i = a.size(); i-- > 0; )
            buf[--cnt[static_cast<int>((a[i] / exp) % 10)]] = a[i];
        a.swap(buf);
    }
}
```

### 9.15（场景）如何对大量重复元素做排序？

- 三路划分的快速排序把等于枢轴的元素集中到一段，避免重复参与递归。
- 计数排序在值域很小时最优，时间 O(n + k)，天然处理重复。
- 元素为结构体时可按主键计数再展开，但会丢失同键元素的原有次序。
- 要求稳定且值域大时用归并排序，重复元素不会引发退化。
- 数据分布已知时可以先做直方图，再决定用计数排序还是三路快排。
- 边界：全部元素相等时三路快排与计数排序都是 O(n)，两路快排退化为 O(n²)。

### 9.16 希尔排序的增量序列如何影响复杂度？

- 按增量把序列分成若干子序列，对每个子序列做插入排序，再逐步缩小增量。
- 增量序列决定复杂度：每次减半的写法最坏为 O(n²)，Hibbard 序列的最坏为 O(n^1.5)。
- Sedgewick 序列可把最坏复杂度降到 O(n^(4/3))，实际表现接近 O(n log n)。
- 插入排序在近似有序的序列上代价接近 O(n)，这是希尔排序早期轮次取得收益的原因。
- 希尔排序原地进行，额外空间 O(1)，但元素跨增量跳跃交换，排序不稳定。
- 增量必须最终收缩到 1，最后一轮是普通插入排序，保证结果有序。
- 边界：元素个数小于 2 时不进入循环；增量序列的取值影响比较次数，不影响正确性。

### 9.17（实现）外部排序的多路归并与败者树如何工作？

- 数据量超过内存时，先分块读入内存排序，写出有序的归并段。
- 再用 k 路归并把归并段合并为一个有序文件。
- 多路归并的每次输出需要从 k 个候选里选出最小，用堆的代价为 O(log k)。
- 败者树把每次选择的比较次数降到 O(log k) 且常数更小，适合 k 较大的场合。
- 总代价由磁盘读写次数主导，增加归并路数可以减少归并趟数。
- 边界：归并段长度不一时以最短段为准；缓冲区大小决定每次 I/O 的数据量。

### 9.18（场景）如何按多个字段排序并保持稳定性？

- 先按次要字段排序，再按主要字段做稳定排序，两轮即可得到多关键字有序。
- 更直接的做法是写一个比较器，按字段优先级依次比较。
- 比较器必须满足严格弱序，相等时返回假值，不能使用小于等于。
- 稳定排序保证相等元素保持原有次序，适合分页或增量输出的场景。
- 排序键包含浮点非数时比较不满足严格弱序，需要先处理特殊值。
- 排序本身仍是 O(n log n) 次比较，字段数量只影响每次比较的常数。
- 边界：字段很多时预先计算组合键，减少每次比较的开销。

### 9.19（代码阅读）`std::sort` 与 `std::stable_sort` 的复杂度保证有何差异？

- `std::sort` 保证 O(n log n) 次比较，但不保证稳定，实现通常是内省排序。
- `std::stable_sort` 保证稳定，比较次数为 O(n log n)，内存不足时可能退化为 O(n log² n)。
- 两者都要求比较器满足严格弱序，违反时行为未定义。
- `std::sort` 的实现需要控制递归深度，常以堆排序作为兜底。
- `std::list` 与 `std::forward_list` 提供成员函数 `sort`，因为它们不支持随机访问迭代器。
- 边界：对空区间与单元素区间调用是合法的；比较器抛出异常时区间内元素的次序未指定。

### 9.20 桶排序的适用条件与复杂度是什么？

- 把元素按值域均匀划分到若干桶，桶内单独排序，再按桶的顺序拼接。
- 元素均匀分布时每个桶的规模约为 n / k，总代价 O(n + k)。
- 桶内用插入排序时常数较低，桶规模较大时改用比较排序。
- 最坏情况是所有元素落入同一个桶，退化为桶内排序的复杂度。
- 桶排序的稳定性取决于桶内排序是否稳定与拼接顺序。
- 边界：值域未知时先扫描求最小与最大值；浮点键要处理精度与边界归属。

---

## 10. 二分查找

### 10.1（辨析）二分查找的循环不变量如何确定？

- 循环不变量描述每次迭代前区间内外的状态，常见写法是「答案在左闭右开区间内」。
- 初始时左端点为 0、右端点为 n，整个数组都在区间内，不变量成立。
- 取中点后比较，把区间收缩到仍包含答案的那一半。
- 循环结束时左右端点相等，区间为空，左端点即为第一个满足条件的位置。
- 另一套写法使用闭区间，循环条件是左端点不大于右端点，结束时左端点比右端点大 1。
- 无论采用哪套写法，比较次数都是 O(log n)，额外空间为 O(1)。
- 两套写法不能混用，混用会导致死循环或漏掉边界元素。

### 10.2 如何实现 `lower_bound` 与 `upper_bound`？

- `lower_bound` 返回第一个不小于目标的位置，`upper_bound` 返回第一个大于目标的位置。
- 两者都使用左闭右开区间，循环条件是左端点小于右端点。
- 中点元素小于目标时把左边界移到中点之后，否则收缩右边界。
- 时间复杂度 O(log n)，空间 O(1)，要求区间已按比较器有序。
- 目标大于全部元素时返回末尾迭代器，小于全部元素时返回起始迭代器。
- 两个函数配合 `std::distance` 可以统计等于目标的元素个数。

```cpp
int lowerBound(const std::vector<int>& a, int target) {
    int lo = 0, hi = static_cast<int>(a.size());
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
```

### 10.3（陷阱）`mid` 的计算为什么会溢出？

- `(lo + hi) / 2` 在两端都接近 `INT_MAX` 时相加溢出，属于有符号整数溢出。
- 正确写法是 `lo + (hi - lo) / 2`，中间结果不超过 hi。
- 无符号类型不会溢出但会回绕，结果同样错误。
- 指针做二分时该写法不适用，应改用下标，或使用 C++20 的 `std::midpoint`。
- 有符号溢出是未定义行为，优化器可能据此做出与直觉不符的变换。
- 下标计算本身是 O(1)，溢出问题不影响渐进复杂度，只影响正确性。
- 边界：hi 等于 n 且 n 接近类型上限时，hi 减 lo 仍是安全的正数。

### 10.4 二分查找在哪些情况下会死循环？

- 循环条件与区间收缩方向不匹配时，区间不再缩小，循环无法终止。
- 典型错误是闭区间写法用左端点等于中点，当右端点等于左端点加 1 时中点恒等于左端点。
- 正确做法是闭区间用中点加一或中点减一，保证每轮至少排除一个元素。
- 求最后一个满足条件的位置时要使用上取整的中点，否则同样会卡住。
- 实数二分不会死循环，但可能因精度不足提前退出。
- 每轮必须把区间长度至少减一，才能保证在 O(log n) 轮内结束。
- 边界：区间长度为 1 与 2 时最容易暴露问题，测试应覆盖这两种规模。

### 10.5 如何在旋转有序数组中查找目标值？

- 旋转数组由两段升序组成，二分后必有一半是有序的。
- 比较中点元素与左端点元素，判断哪一半有序。
- 若左半有序，目标落在左半范围内则收缩右边界，否则收缩左边界。
- 若右半有序，用对称的条件判断目标是否落在右半范围内。
- 时间复杂度 O(log n)，空间 O(1)，元素互不相同是必要前提。
- 边界：目标不存在时返回 -1；数组未旋转时退化为普通二分。

```cpp
int searchRotated(const std::vector<int>& a, int target) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;
        if (a[lo] <= a[mid]) {
            if (a[lo] <= target && target < a[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {
            if (a[mid] < target && target <= a[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return -1;
}
```

### 10.6（陷阱）旋转数组含重复元素时为什么无法稳定二分？

- 当左端点、中点、右端点的值都相等时，无法判断哪一半有序。
- 同样的端点与中点取值可以对应不同的数组形态，信息量不足。
- 遇到三者相等只能把左端点右移、右端点左移，最坏退化为 O(n)。
- 重复元素使「有序的一半」这一判断依据失效。
- 若题目保证元素互不相同，可以安全使用 O(log n) 的写法。
- 边界：全部元素相等时只能线性扫描，返回目标是否存在。

### 10.7 如何求旋转数组的最小值？

- 最小值位于第二段的起点，二分时比较中点元素与右端点元素。
- 中点元素小于右端点元素时最小值在左半（含中点），把右端点移到中点。
- 中点元素大于右端点元素时最小值在右半，把左端点移到中点之后。
- 两者相等时无法判断，把右端点左移一位，逐步排除重复的右端点。
- 时间复杂度平均 O(log n)，含重复元素时最坏 O(n)。
- 边界：数组未旋转时返回首元素；单元素数组直接返回该元素。

```cpp
int findMin(const std::vector<int>& a) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < a[hi]) hi = mid;
        else if (a[mid] > a[hi]) lo = mid + 1;
        else --hi;
    }
    return a[lo];
}
```

### 10.8（实现）如何查找目标值的第一个与最后一个位置？

- 第一个位置用 `lower_bound`，最后一个位置用 `upper_bound` 减一。
- 也可以手写两次二分，一次找左边界，一次找右边界。
- 找左边界时命中后不立即返回，继续把右边界收缩到中点。
- 找右边界时命中后把左边界移到中点之后，循环结束时左端点减一为答案。
- 时间复杂度 O(log n)，空间 O(1)。
- 边界：目标不存在时两个边界都指向插入位置，需要额外判断。

```cpp
std::vector<int> searchRange(const std::vector<int>& a, int target) {
    auto first = std::lower_bound(a.begin(), a.end(), target);
    if (first == a.end() || *first != target) return {-1, -1};
    auto last = std::upper_bound(a.begin(), a.end(), target);
    return {static_cast<int>(first - a.begin()), static_cast<int>(last - a.begin()) - 1};
}
```

### 10.9 如何二分查找插入位置？

- 插入位置是第一个不小于目标的下标，与 `lower_bound` 的定义一致。
- 目标存在时返回其第一次出现的位置，插入后保持原有相对次序。
- 目标大于全部元素时返回 n，对应尾部插入。
- 时间复杂度 O(log n)，空间 O(1)。
- 要求相同元素插在最后时改用 `upper_bound`。
- 边界：空数组返回 0；目标为负或超出值域不影响下标的计算。

### 10.10 如何用二分求整数平方根？

- 在 0 到 x 之间二分，找最大的满足中点平方不大于 x 的中点。
- 中点略大于真实平方根时，平方运算会超过 `int` 的范围而溢出。
- 用 64 位整数计算，或把判断改写为「中点不大于 x 除以中点」。
- 循环使用闭区间，命中后记录答案并把左边界右移，继续寻找更大的可行值。
- 时间复杂度 O(log x)，空间 O(1)。
- 边界：x 为 0 或 1 时直接返回 x；x 为负数时按题意返回错误。

```cpp
int mySqrt(int x) {
    int lo = 0, hi = x, ans = 0;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (static_cast<long long>(mid) * mid <= x) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return ans;
}
```

### 10.11（实现）实数二分如何确定迭代次数与精度？

- 固定迭代次数比固定精度更可靠，每轮区间减半，迭代 100 次可把区间缩小到 2 的负 100 次方。
- 按值域与目标精度估算次数，取初始长度除以精度的以 2 为底的对数向上取整。
- 用左右端点的中点更新区间，判断依据是单调谓词的取值。
- 输出时取左端点或右端点都可以，两者差值已在精度范围内。
- 时间复杂度 O(log(1/ε))，与输入规模无关。
- 边界：谓词在端点处的结果要先确认，初始区间必须包含答案。

### 10.12（陷阱）实数二分的终止条件为什么不能用绝对误差比较？

- 浮点数的绝对误差与量级有关，值很大时 1e-9 的绝对误差已无法表示。
- 用区间长度小于给定容差作为条件时，容差小于机器精度会导致循环不终止。
- 固定迭代次数可以避免该问题，代价可控且结果稳定。
- 比较两个浮点数是否相等同样不可靠，应比较差值与容差。
- 需要更高精度时改用整数运算或高精度库，缩小容差无法突破机器精度。
- 比较两个浮点数本身是 O(1)，问题出在判据的可靠性上，计算代价并不是主因。
- 边界：区间端点为 0 或极大值时，减半所需的次数明显不同。

### 10.13（场景）如何二分答案求最小可行容量？

- 问题要求把序列按顺序分成若干段，使每段和不超过容量，段数不超过给定值。
- 可行性随容量单调：容量越大，所需段数越少，因此可以二分。
- 二分的下界取单个元素的最大值，上界取全部元素之和。
- 判定函数贪心地累加，超过容量就新开一段，返回段数与限制的比较结果。
- 时间复杂度 O(n log S)，S 为元素总和，空间 O(1)。
- 边界：元素个数不大于段数时答案为最大元素；元素含负数时单调性不成立。

```cpp
bool feasible(const std::vector<int>& a, long long cap, int m) {
    long long sum = 0;
    int parts = 1;
    for (int v : a) {
        if (v > cap) return false;
        if (sum + v > cap) { ++parts; sum = 0; }
        sum += v;
    }
    return parts <= m;
}

int minCapacity(const std::vector<int>& a, int m) {
    long long lo = *std::max_element(a.begin(), a.end());
    long long hi = std::accumulate(a.begin(), a.end(), 0LL);
    while (lo < hi) {
        long long mid = lo + (hi - lo) / 2;
        if (feasible(a, mid, m)) hi = mid;
        else lo = mid + 1;
    }
    return static_cast<int>(lo);
}
```

### 10.14 如何二分答案求分割数组的最大值最小？

- 与最小可行容量是同一问题的两种问法，二分容量并检查能否在给定段数内完成。
- 下界为最大元素，上界为总和，二分找第一个可行的容量。
- 判定函数按顺序切分，段数超过限制即返回不可行。
- 时间复杂度 O(n log S)，空间 O(1)。
- 边界：段数为 1 时答案为总和；段数不小于元素个数时答案为最大元素。
- 常见错误是把判定写成尽量均分，按容量贪心切分才是正确的可行性判定。

### 10.15（实现）如何求两个有序数组的中位数？

- 在较短的数组上二分分割位置，使左半部分的元素个数为总数的一半。
- 设第一个数组的分割点为 i，第二个为 j，两者之和等于总数加一后整除 2。
- 合法分割要求左半最大值不大于右半最小值，两个方向都要检查。
- 不满足时按比较结果调整 i 的方向，直到分割合法。
- 时间复杂度 O(log min(m, n))，空间 O(1)。
- 边界：分割点落在数组两端时用正负无穷作为哨兵；两数组都为空时无定义。

```cpp
double findMedian(const std::vector<int>& a, const std::vector<int>& b) {
    if (a.size() > b.size()) return findMedian(b, a);
    int m = static_cast<int>(a.size()), n = static_cast<int>(b.size());
    int lo = 0, hi = m, half = (m + n + 1) / 2;
    while (lo <= hi) {
        int i = lo + (hi - lo) / 2, j = half - i;
        int aL = (i == 0) ? INT_MIN : a[i - 1];
        int aR = (i == m) ? INT_MAX : a[i];
        int bL = (j == 0) ? INT_MIN : b[j - 1];
        int bR = (j == n) ? INT_MAX : b[j];
        if (aL <= bR && bL <= aR) {
            if ((m + n) % 2 == 1) return std::max(aL, bL);
            return (std::max(aL, bL) + std::min(aR, bR)) / 2.0;
        }
        if (aL > bR) hi = i - 1;
        else lo = i + 1;
    }
    return 0.0;
}
```

### 10.16 如何求有序矩阵中第 k 小的元素？

- 矩阵每行每列都递增时，可以按值二分，统计不大于中值的元素个数。
- 统计从右上角开始，向左或向下移动，单次统计 O(m + n)。
- 二分值域的下界取左上角，上界取右下角，找第一个使计数不小于 k 的值。
- 时间复杂度 O((m + n) log(max - min))，空间 O(1)。
- 也可以用大小为 k 的堆逐行归并，复杂度 O(k log m)。
- 边界：k 从 1 开始；矩阵元素有重复时二分仍成立，因为统计的是不大于。

### 10.17 二分查找的判定树如何决定比较次数？

- 判定树以比较结果为分支，内部节点对应一次比较，叶子对应查找成功或失败的位置。
- 成功查找的比较次数等于该元素所在节点的深度，失败查找对应外部节点。
- 折半查找的判定树高度为 log2(n + 1) 向上取整，最坏比较次数与该高度同阶。
- 元素个数为 n 时，成功查找的平均比较次数约为 log2(n + 1) 减 1。
- 判定树的形态由中点取法决定，取左中点或右中点得到的树不同。
- 判定树的高度为 O(log n)，比较次数与该高度同阶。
- 边界：n 为 0 时没有内部节点，任何查找都失败。

### 10.18（复杂度）二分查找为什么不能直接用于链表？

- 二分依赖常数时间定位中点，链表定位中点需要从头遍历，单次代价为 O(n)。
- 每轮遍历到中点，总代价为 n/2 + n/4 + 依次递减的项之和，结果为 O(n)，与线性查找同阶。
- 链表节点地址不连续，无法用下标运算得到中点位置。
- 先把链表复制到数组需要 O(n) 额外空间，也改变了数据结构的使用前提。
- 跳表通过逐层下降实现类似二分的查找，期望代价为 O(log n)，代价是额外的层指针。
- 边界：单节点链表一次比较即可结束；双向链表仍然无法在 O(1) 时间内走到中点。

### 10.19 如何二分查找第一个错误版本？

- 版本号从 1 到 n，判定函数在某个位置之后恒为真，具有单调性。
- 二分找第一个使判定为真的位置，区间用左闭右开，结束时左端点即为答案。
- 时间复杂度 O(log n)，空间 O(1)。
- 判定函数的调用次数决定实际代价，缓存判定结果不改变渐进复杂度。
- 边界：所有版本都正确时返回 n + 1 表示不存在；第一个版本即错误时返回 1。
- 常见错误是判定用闭区间更新，导致右端点越过版本范围。

### 10.20 如何二分查找峰值元素？

- 峰值指大于相邻元素的元素，数组两端视为负无穷。
- 比较中点元素与中点后一个元素：后者更大时峰值在右侧，否则在左侧（含中点）。
- 循环条件是左端点小于右端点，每次把区间收缩到仍含峰值的一半。
- 时间复杂度 O(log n)，空间 O(1)，不要求数组整体有序。
- 边界：单元素数组返回下标 0；多个峰值时返回任意一个即可。
- 常见错误是访问中点后一个元素越界，循环条件必须保证中点小于右端点。

```cpp
int findPeak(const std::vector<int>& a) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < a[mid + 1]) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
```

---

## 11. 双指针与滑动窗口

### 11.1 双指针有哪几种形态，分别适用于什么结构？

- 对撞形态：两个指针分别从区间两端向中间移动，适用于有序数组求和、回文判断与容器盛水一类问题。
- 快慢形态：两个指针同向移动但速度不同，适用于链表判环、寻找中点与原地压缩数组。
- 分离形态：两个指针分别位于两个序列上，适用于合并、求交与子序列判断。
- 三种形态的共同前提是搜索空间可以按单调性排除，每一步移动都能证明不丢失最优解。
- 时间复杂度通常为 O(n)，额外空间为 O(1)；排序作为前置步骤时总代价为 O(n log n)。
- 边界包括空区间、单元素区间与全部元素相同；循环条件用 `left < right` 还是 `left <= right` 取决于区间是否允许重合。
- 常见错误是移动方向写反、移动后未跳过重复值，以及同时移动两个指针导致遗漏。

| 形态 | 移动方式 | 典型问题 |
| --- | --- | --- |
| 对撞 | 两端向中间 | 两数之和、盛最多水、回文判断 |
| 快慢 | 同向不同速 | 链表判环、寻找中点、删除重复项 |
| 分离 | 两个序列各一个 | 合并有序数组、判断子序列 |

```cpp
int l = 0, r = n - 1;
while (l < r) {
    const int s = a[l] + a[r];
    if (s == target) return std::make_pair(l, r);
    if (s < target) ++l; else --r;   // 每步只移动一侧
}
```

### 11.2（复杂度）有序数组的两数之和为何能用对撞指针降到 O(n)？

- 比较 `a[l] + a[r]` 与目标值：和偏小时，`a[l]` 与右侧任何元素的组合都不足目标值，可以排除以 `l` 为左端点的全部组合。
- 和偏大时同理排除以 `r` 为右端点的全部组合；每步至少排除一个元素，指针总移动次数不超过 2n，比较次数为 O(n)。
- 该结论依赖数组有序；无序时需要先排序，代价为 O(n log n)，或改用哈希表以 O(n) 空间换取 O(n) 时间。
- 需要返回原下标时，排序破坏位置信息，应把值与下标绑定后排序并映射回原数组。
- 边界包括无解、多组解与重复元素；要求输出全部下标对时，命中后仍需继续收缩并去重。
- 两个元素相加可能溢出 `int`，比较时用 `long long` 承接。
- 常见错误是命中后立即返回而漏掉其他解，或在无序数组上直接套用对撞模板。

### 11.3（实现）如何用双指针把数组中的零移到末尾？

- 慢指针 `slow` 指向下一个非零元素应放置的位置，快指针 `fast` 扫描整个数组。
- `a[fast]` 非零时与 `a[slow]` 交换，然后慢指针前移；为零时只前移快指针。
- 交换而非覆盖，可以保持非零元素的相对顺序，也不需要额外数组。
- 时间复杂度 O(n)，空间复杂度 O(1)，每个非零元素至多被交换一次。
- 边界：没有零时数组不变；全为零时没有任何交换发生。
- 常见错误是用覆盖写入却未把尾部补零，或交换后忘记前移慢指针。

```cpp
void moveZeroes(std::vector<int>& a) {
    int slow = 0;
    for (int fast = 0; fast < (int)a.size(); ++fast) {
        if (a[fast] != 0) std::swap(a[slow++], a[fast]);
    }
}
```

### 11.4 每个元素最多保留两次时去重条件如何改写？

- 慢指针 `slow` 指向写入位置，写入区间为 `[0, slow - 1]`，快指针扫描整个数组。
- 判据为 `slow < 2` 或 `a[fast] != a[slow - 2]`：末尾两个元素已与该值相同，继续写入就会超过两次。
- 返回 `slow`，此时它既是写入位置也是新长度。
- 该写法可推广到最多保留 k 次：条件为 `slow < k` 或 `a[fast] != a[slow - k]`。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：长度为 0、1、2 的数组；连续重复次数远大于 k 的数组。
- 常见错误是比较 `a[fast]` 与 `a[fast - 2]`，在元素已被覆盖后判据失效。

```cpp
int removeDuplicates(std::vector<int>& a) {
    int slow = 0;
    for (int fast = 0; fast < (int)a.size(); ++fast) {
        if (slow < 2 || a[fast] != a[slow - 2]) {
            a[slow++] = a[fast];
        }
    }
    return slow;
}
```

### 11.5 两个有序数组的交集如何用双指针求？

- 两个指针分别在两个数组上移动，相等时记录并同时前移，较小的一侧单独前移。
- 该写法利用有序性，每步至少排除一个元素，时间复杂度 O(m + n)，空间为输出规模。
- 要求结果保留重复元素时（每个值取两边出现次数的较小值），命中后各自前移一步，不跳过相同值。
- 要求结果去重时，命中后跳过各自数组中相邻的相同值。
- 边界：任一数组为空时结果为空；一个数组是另一个的前缀。
- 常见错误是命中时只移动一个指针，导致同一对元素被重复记录。

```cpp
std::vector<int> intersect(const std::vector<int>& a, const std::vector<int>& b) {
    std::vector<int> res;
    int i = 0, j = 0;
    while (i < (int)a.size() && j < (int)b.size()) {
        if (a[i] < b[j]) ++i;
        else if (a[i] > b[j]) ++j;
        else { res.push_back(a[i]); ++i; ++j; }
    }
    return res;
}
```

### 11.6 三数之和如何去重与剪枝？

- 先排序，固定第一个数 `a[i]`，在右侧区间用对撞指针寻找和为 `-a[i]` 的两个数。
- 外层去重：`i` 大于 0 且 `a[i]` 等于 `a[i - 1]` 时跳过，避免同一首元素重复枚举。
- 内层去重：命中后跳过相邻的相同 `a[l]` 与 `a[r]`，再同时收缩。
- 剪枝：排序后若 `a[i]` 大于 0，则三数之和不可能为 0，可直接结束外层循环。
- 时间复杂度 O(n^2)，排序占 O(n log n)；空间为排序递归栈的 O(log n)。
- 边界：元素不足三个时返回空结果；三数相加用 `long long` 防止溢出。
- 常见错误是只做外层去重导致重复三元组，或先移动指针再判断造成死循环。

```cpp
std::sort(a.begin(), a.end());
for (int i = 0; i + 2 < (int)a.size(); ++i) {
    if (a[i] > 0) break;
    if (i > 0 && a[i] == a[i - 1]) continue;
    int l = i + 1, r = (int)a.size() - 1;
    while (l < r) {
        const long long s = (long long)a[i] + a[l] + a[r];
        if (s == 0) {
            res.push_back({a[i], a[l], a[r]});
            while (l < r && a[l] == a[l + 1]) ++l;
            while (l < r && a[r] == a[r - 1]) --r;
            ++l; --r;
        } else if (s < 0) {
            ++l;
        } else {
            --r;
        }
    }
}
```

### 11.7 最接近的三数之和与三数之和的差异在哪里？

- 目标从「等于 0」变为「与目标值的差的绝对值最小」，只需维护当前最优和，不需要收集全部解。
- 因此不需要对结果去重，命中后也不能提前返回，只能更新最优值。
- 若某次和恰好等于目标值，可以立即返回，这是唯一安全的提前结束条件。
- 时间复杂度 O(n^2)，空间复杂度与三数之和相同。
- 比较差值时用 `long long`，避免取绝对值作用于极端值时溢出。
- 边界：元素不足三个；目标值为负数；存在多组同样接近的组合时任意一组都正确。
- 常见错误是把初始最优值设为 0，导致结果被错误初始化。

### 11.8 四数之和的复杂度与剪枝如何设计？

- 排序后固定前两个数，后两个数用对撞指针，时间复杂度 O(n^3)。
- 两层循环各自去重：`i` 与 `i - 1` 比较，`j` 与 `j - 1` 比较。
- 剪枝一：从当前位置起最小的四个数之和大于目标值时，后续组合更大，可提前结束当前层。
- 剪枝二：从当前位置起最大的四个数之和小于目标值时，当前指针无解，直接进入下一轮。
- 四个数相加可能溢出 `int`，统一用 `long long`。
- 该结构可推广到 k 数之和：递归固定前 k - 2 个数，最后两个数用双指针。
- 常见错误是剪枝条件写反，把「最小和已超目标」当成继续搜索的条件。

### 11.9 盛最多水的容器为何移动较矮的一侧？

- 面积由 `min(h[l], h[r])` 与宽度 `r - l` 决定，宽度随指针内移单调减小。
- 若移动较高的一侧，新的高度不会超过原较矮一侧的高度，宽度又减小，面积不可能增大。
- 因此移动较矮一侧可以安全排除以该侧为边界的全部组合，不丢失最优解。
- 时间复杂度 O(n)，每个指针至多移动 n 次；空间复杂度 O(1)。
- 边界：元素少于两个时面积为 0；两侧高度相等时移动任意一侧都正确。
- 常见错误是把面积写成 `h[l] * h[r]`，或内层重新计算宽度时用错下标。

### 11.10 有序数组的平方如何用双指针构造？

- 数组含负数时，平方后的最大值一定来自两端之一，因此可以从后往前填充结果。
- 两个指针分别指向首尾，比较绝对值，把较大者的平方写入结果数组的末尾。
- 时间复杂度 O(n)，空间复杂度 O(n)，结果数组之外不需要额外空间。
- 边界：全为非负数时结果顺序不变；全为负数时结果顺序反转；元素取值为 `INT_MIN` 时 `std::abs` 溢出，比较时用 `long long`。
- 常见错误是从前往后比较绝对值，导致负数一侧的元素顺序被打乱。

```cpp
std::vector<int> sortedSquares(const std::vector<int>& a) {
    const int n = (int)a.size();
    std::vector<int> res(n);
    int l = 0, r = n - 1;
    for (int k = n - 1; k >= 0; --k) {
        const long long x = (long long)a[l] * a[l];
        const long long y = (long long)a[r] * a[r];
        if (x > y) { res[k] = (int)x; ++l; }
        else { res[k] = (int)y; --r; }
    }
    return res;
}
```

### 11.11 判断子序列时双指针的贪心为何成立？

- 两个指针分别扫描 `s` 与 `t`，字符相等时同时前移，否则只前移 `t` 的指针。
- 贪心成立的原因是：在 `t` 中尽早匹配 `s` 的当前字符，不会使后续字符的可选范围变小。
- 时间复杂度 O(|s| + |t|)，空间复杂度 O(1)。
- 若需要对同一个 `t` 回答大量 `s` 的查询，可预处理每个位置之后各字符首次出现的位置，单次查询降为 O(|s|)。
- 边界：空串是任何串的子序列；`s` 比 `t` 长时直接返回假。
- 常见错误是在匹配失败时也前移 `s` 的指针，把不连续的位置当成匹配。

### 11.12（辨析）滑动窗口的适用条件是什么？

- 窗口右端扩张后，窗口的可行性需要单调：一旦不可行，继续扩张仍然不可行，收缩才可能恢复。
- 窗口内维护的量必须能在 O(1) 均摊时间内更新，例如区间和、字符计数与不同字符数。
- 模板为：右指针扩张并更新状态，在不满足条件时用 `while` 收缩左指针，随后更新答案。
- 时间复杂度 O(n)，每个元素至多被加入窗口和移出窗口各一次。
- 求最长与求最短的更新时机不同：最长在收缩之后更新，最短在收缩循环内部更新。
- 不适用情形：数组中含负数时区间和不再随长度单调，需要改用前缀和配合单调队列。
- 常见错误是把收缩写成 `if` 后仍按合法窗口统计答案，此时窗口可能尚未恢复。

### 11.13 至多包含 K 个不同字符的最长子串如何维护窗口？

- 窗口内维护每个字符的出现次数，同时用 `distinct` 记录不同字符的个数。
- 右端扩张后若 `distinct` 超过 K，收缩左端直到恢复，再更新答案。
- 加入字符时计数从 0 变为 1 则 `distinct` 加一；移除字符时计数从 1 变为 0 则减一。
- 时间复杂度 O(n)，空间复杂度为字符集大小。
- 边界：K 不小于字符集大小时答案为整个串；K 为 0 且串非空时答案为 0。
- 常见错误是把「不同字符数」写成某个字符的出现次数，或收缩时未更新 `distinct`。

```cpp
int lengthOfLongestKDistinct(const std::string& s, int k) {
    int cnt[128] = {}, distinct = 0, ans = 0, l = 0;
    for (int r = 0; r < (int)s.size(); ++r) {
        const unsigned char c = static_cast<unsigned char>(s[r]);
        if (cnt[c]++ == 0) ++distinct;
        while (distinct > k) {
            const unsigned char d = static_cast<unsigned char>(s[l++]);
            if (--cnt[d] == 0) --distinct;
        }
        ans = std::max(ans, r - l + 1);
    }
    return ans;
}
```

### 11.14 最小覆盖子串的窗口如何扩张与收缩？

- 用长度 128 的计数数组 `need` 记录目标串的字符需求，`missing` 记录尚未满足的字符总数。
- 右指针扩张时，若该字符的需求计数减一后仍非负，说明本次出现填补了一个需求，`missing` 减一。
- `missing` 为 0 时窗口已覆盖目标串，此时用 `while` 收缩左指针并更新最短答案，直到窗口再次不覆盖。
- 收缩时把移出字符的需求计数加一，若加一后为正，说明该字符重新变为缺失，`missing` 加一。
- 时间复杂度 O(|s| + |t|)，空间复杂度为字符集大小。
- 边界：目标串为空、目标串长于源串、无解时返回空串。
- 常见错误是用窗口长度等于目标串长度来判断覆盖，或在收缩时忘记更新 `missing`。

```cpp
std::string minWindow(const std::string& s, const std::string& t) {
    if (t.empty()) return "";
    int need[128] = {}, missing = (int)t.size();
    for (char c : t) ++need[static_cast<unsigned char>(c)];
    int bestL = 0, bestLen = INT_MAX;
    for (int l = 0, r = 0; r < (int)s.size(); ++r) {
        const unsigned char c = static_cast<unsigned char>(s[r]);
        if (need[c]-- > 0) --missing;
        while (missing == 0) {
            if (r - l + 1 < bestLen) { bestLen = r - l + 1; bestL = l; }
            const unsigned char d = static_cast<unsigned char>(s[l++]);
            if (++need[d] > 0) ++missing;
        }
    }
    return bestLen == INT_MAX ? std::string() : s.substr(bestL, bestLen);
}
```

### 11.15 长度最小的子数组如何用窗口求最短？

- 数组元素为正整数时，窗口和随右端扩张单调不减，满足滑动窗口的单调性前提。
- 右指针扩张时累加和，当和大于等于目标值后进入 `while`，先更新答案，再减去左端元素并右移左指针。
- 答案初值设为 `n + 1`，循环结束后仍为该值则返回 0。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：目标值大于数组总和时无解；单元素满足条件时答案为 1。
- 数组中含负数时该写法失效，应改用前缀和与单调队列。
- 常见错误是答案长度写成 `r - l`，或先收缩再更新导致错过最短窗口。

```cpp
int minSubArrayLen(int target, const std::vector<int>& a) {
    int sum = 0, ans = INT_MAX;
    for (int l = 0, r = 0; r < (int)a.size(); ++r) {
        sum += a[r];
        while (sum >= target) {
            ans = std::min(ans, r - l + 1);
            sum -= a[l++];
        }
    }
    return ans == INT_MAX ? 0 : ans;
}
```

### 11.16 找到所有字母异位词时定长窗口如何计数？

- 窗口长度固定为模式串长度，右指针每步前移一位，左指针同步前移一位，窗口长度不变。
- 用两个长度 26 的计数数组分别统计模式串与窗口，再用 `matched` 记录计数相等的字符种类数。
- 每步只处理移入与移出两个字符：移入前若相等则 `matched` 减一，移入后若相等则加一；移出同理。
- `matched` 等于 26 时窗口是模式串的一个排列，记录窗口起点。
- 时间复杂度 O(|s| + |p|)，空间复杂度为字符集大小。
- 边界：模式串长于源串时返回空；题目通常限定小写字母，其他字符集需要扩大计数数组。
- 常见错误是每步重新比较整个计数数组，退化为 O(26n)；或在窗口未满时就开始比较。

```cpp
std::vector<int> findAnagrams(const std::string& s, const std::string& p) {
    std::vector<int> res;
    const int m = (int)p.size();
    if ((int)s.size() < m) return res;
    int need[26] = {}, win[26] = {}, matched = 0;
    for (char c : p) ++need[c - 'a'];
    for (int i = 0; i < 26; ++i) if (need[i] == 0) ++matched;
    for (int r = 0; r < (int)s.size(); ++r) {
        const int in = s[r] - 'a';
        if (win[in] == need[in]) --matched;
        if (++win[in] == need[in]) ++matched;
        if (r >= m) {
            const int out = s[r - m] - 'a';
            if (win[out] == need[out]) --matched;
            if (--win[out] == need[out]) ++matched;
        }
        if (r >= m - 1 && matched == 26) res.push_back(r - m + 1);
    }
    return res;
}
```

### 11.17 窗口内的计数结构该用数组还是哈希表？

- 字符集为单字节时用长度 128 或 256 的数组，下标即编码，访问为 O(1) 且没有哈希开销。
- 字符集较大或键稀疏时用 `std::unordered_map`，代价是哈希计算与结点分配。
- 数组每次清空的代价为 O(字符集)，窗口滑动时只回退受影响的键即可，不必整表清零。
- 哈希表在计数归零时用 `erase` 删除键，可让 `size()` 直接反映不同字符数。
- 计数需要表达「欠账」时，数组的负值比哈希表的缺失键更直接。
- 按增量更新的写法，单步代价为 O(1)，整体复杂度仍由窗口的扩张与收缩决定，为 O(n)。
- 常见错误是在循环内反复构造哈希表，或对数组执行整表清零造成 O(字符集 × n) 的开销。

### 11.18（陷阱）收缩窗口时用 while 还是 if？

- 求最短窗口时必须用 `while`：要收缩到窗口刚好不满足条件，`if` 只收缩一步，得到的不是最短。
- 求最长窗口时同样用 `while`，把窗口收缩回合法状态后再更新答案。
- 若只关心最长长度而不需要具体窗口，可用 `if` 代替 `while`：窗口大小此后不再增长，历史最大值仍然正确，但当前窗口可能不合法。
- 定长窗口不需要收缩循环，左右指针同步移动即可。
- 每个元素最多进出窗口各一次，`while` 不会使复杂度超过 O(n)。
- 边界：窗口为空时 `while` 条件直接为假，第一次右移后才进入判断。
- 常见错误是把 `while` 的收缩条件写成「满足条件」，导致窗口被收缩到空。

### 11.19 双指针与二分该如何选择？

- 有序数组两数之和：对每个位置二分查找为 O(n log n)，对撞双指针为 O(n)，后者常数更小。
- 求「第一个满足条件的位置」这类单调判定，二分的适用范围比双指针更广。
- 双指针要求指针移动能排除整块搜索空间，二分要求判定函数单调。
- 三数之和固定一个数后再二分，复杂度为 O(n^2 log n)，不如双指针的 O(n^2)。
- 数据规模为 10^5 时两种做法都可接受，10^7 以上优先选择 O(n) 的双指针。
- 常见错误是在无序数据上直接对撞，或二分时区间开闭与返回值不匹配。

### 11.20（场景）如何求错误日志不超过 k 条的最长连续区间？

- 维护窗口内的错误条数 `bad`，右端遇到错误日志时加一，超过 k 时收缩左端直到恢复。
- 每次收缩后更新最长长度与对应起止下标，长度用 `r - l + 1`。
- 单次遍历为 O(n)；流式处理只需保留左端位置与计数，空间为 O(1)。
- 边界：k 大于总错误数时答案为全部日志；全部为错误且 k 为 0 时答案为 0。
- 需要返回区间本身时，记录答案要同时保存左右下标，不能只保存长度。
- 常见错误是把「不超过 k」写成「小于 k」，或收缩时未同步减少错误计数。

```cpp
int longestWindow(const std::vector<int>& logs, int k) {
    int l = 0, bad = 0, best = 0;
    for (int r = 0; r < (int)logs.size(); ++r) {
        bad += logs[r];
        while (bad > k) bad -= logs[l++];
        best = std::max(best, r - l + 1);
    }
    return best;
}
```

---

## 12. 前缀和与差分

### 12.1 前缀和数组如何构建，区间和如何查询？

- 定义 `pre[0] = 0`，`pre[i + 1] = pre[i] + a[i]`，数组长度为 n + 1，0 号位置是哨兵。
- 区间 [l, r] 的和为 `pre[r + 1] - pre[l]`，两端都包含。
- 预处理为 O(n)，单次查询为 O(1)，额外空间为 O(n)。
- 哨兵使 l 为 0 时不需要特判，查询代码只有一条减法。
- 边界：空数组只有哨兵，任何区间查询返回 0；调用方需保证 l 不大于 r。
- 常见错误是 `pre` 与源数组下标错位一位，或把区间和写成 `pre[r] - pre[l]`。

```cpp
std::vector<long long> pre(n + 1, 0);
for (int i = 0; i < n; ++i) pre[i + 1] = pre[i] + a[i];
// 区间 [l, r] 的和
long long s = pre[r + 1] - pre[l];
```

### 12.2（复杂度）前缀和的预处理代价换来了什么？

- q 次区间查询的朴素代价为 O(nq)，前缀和把总代价降为 O(n + q)。
- 代价是 O(n) 空间与 O(n) 预处理；元素修改后需要重建，单次修改为 O(n)。
- 修改与查询混合出现时，应改用树状数组或线段树，单次操作 O(log n)。
- 查询次数很少时直接累加更划算，预处理反而增加常数与内存占用。
- 前缀和用 `long long` 时占用 8 × n 字节，n 达到 10^7 时对缓存不友好。
- 常见错误是只查询一次却建立完整前缀和，忽略预处理成本。

### 12.3 子数组和为 k 的个数如何统计？

- 遍历数组并维护当前前缀和 `pre`，哈希表记录每个前缀和出现的次数，初值为 `{0, 1}`。
- 每个位置先累加 `pre`，再把 `count[pre - k]` 加入答案，最后把 `pre` 的计数加一。
- 顺序不能颠倒：先插入会把当前前缀和与自身匹配，相当于统计空区间。
- 时间复杂度 O(n) 期望，空间复杂度 O(n)；数组含负数时结论不变。
- 边界：k 为 0；数组全为 0 时答案为 `n * (n + 1) / 2`。
- 常见错误是忘记初始计数，导致从下标 0 开始的子数组被漏掉。

```cpp
int subarraySum(const std::vector<int>& a, int k) {
    std::unordered_map<long long, int> cnt{{0, 1}};
    long long pre = 0;
    int ans = 0;
    for (int x : a) {
        pre += x;
        const auto it = cnt.find(pre - k);
        if (it != cnt.end()) ans += it->second;
        ++cnt[pre];
    }
    return ans;
}
```

### 12.4 和为 k 的最长子数组如何求？

- 哈希表存储每个前缀和第一次出现的下标，而不是出现次数。
- 对当前位置 i，若 `pre - k` 出现过，用 `i - first[pre - k]` 更新答案。
- 保留首次出现是得到最长的关键，覆盖已有键会得到更短的区间。
- 时间复杂度 O(n)，空间复杂度 O(n)。
- 边界：k 为负数；整个数组之和等于 k 时答案为 n。
- 常见错误是用最后一次出现的下标，或在哈希表中无条件覆盖已有键。

```cpp
int maxSubArrayLen(const std::vector<int>& a, int k) {
    std::unordered_map<long long, int> first{{0, -1}};
    long long pre = 0;
    int ans = 0;
    for (int i = 0; i < (int)a.size(); ++i) {
        pre += a[i];
        const auto it = first.find(pre - k);
        if (it != first.end()) ans = std::max(ans, i - it->second);
        if (!first.count(pre)) first[pre] = i;   // 只保留首次出现
    }
    return ans;
}
```

### 12.5 和可被 K 整除的子数组如何计数？

- 条件「区间和能被 K 整除」等价于两个前缀和对 K 同余，因为差值能被 K 整除。
- 用哈希表统计各余数出现的次数，余数 0 的初始计数为 1。
- C++ 中负数取模结果为负，需要用 `((x % K) + K) % K` 规范为非负余数。
- 时间复杂度 O(n)，空间复杂度 O(min(n, K))。
- 边界：K 为 1 时全部子数组都满足；K 为 0 时取模无定义，需要单独处理。
- 常见错误是直接用前缀和对 K 取模作为键，负余数与正余数被当成两类。

```cpp
int subarraysDivByK(const std::vector<int>& a, int k) {
    std::unordered_map<int, int> cnt{{0, 1}};
    int pre = 0, ans = 0;
    for (int x : a) {
        pre += x;
        const int r = ((pre % k) + k) % k;   // 规范为非负余数
        ans += cnt[r];
        ++cnt[r];
    }
    return ans;
}
```

### 12.6 二维前缀和如何构建与查询？

- `pre` 的尺寸为 (m + 1) × (n + 1)，`pre[i + 1][j + 1]` 由左侧、上方与左上三个已算值加当前元素得到。
- 递推式含一次减法，减去被重复计入的左上角区域。
- 子矩阵查询用四个前缀和组合：右下角加上，上方与左侧各减一次，左上角加回一次。
- 预处理 O(mn)，单次查询 O(1)，空间 O(mn)。
- 累加结果用 `long long`，m × n 个 `int` 之和可能溢出。
- 边界：单行、单列与 1 × 1 的子矩阵；坐标需满足起点不大于终点。
- 常见错误是行列下标写反，或容斥公式漏掉一项。

```cpp
for (int i = 0; i < m; ++i)
    for (int j = 0; j < n; ++j)
        pre[i + 1][j + 1] = a[i][j] + pre[i][j + 1] + pre[i + 1][j] - pre[i][j];

// 子矩阵 (x1, y1) 到 (x2, y2) 的元素和
long long s = pre[x2 + 1][y2 + 1] - pre[x1][y2 + 1]
            - pre[x2 + 1][y1] + pre[x1][y1];
```

### 12.7 最大子数组和的两种写法为何等价？

- 递推写法维护以当前位置结尾的最大和：`cur = max(a[i], cur + a[i])`，答案取历史最大。
- 前缀和写法的答案为 `pre[j]` 减去 `pre[0]` 到 `pre[j - 1]` 中的最小值，j 从 1 到 n，对应枚举子数组的右端点。
- 前者维护「以 i 结尾」的量，后者维护「历史最小前缀」，状态含义不同，结果相同。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：全为负数时答案是最大的单个元素，答案初值不能设为 0。
- 常见错误是答案初值为 0，全负数组返回 0 而不是最大元素。

```cpp
int maxSubArray(const std::vector<int>& a) {
    int cur = a[0], ans = a[0];
    for (int i = 1; i < (int)a.size(); ++i) {
        cur = std::max(a[i], cur + a[i]);
        ans = std::max(ans, cur);
    }
    return ans;
}
```

### 12.8 环形数组的最大子数组和如何处理？

- 分两种情况：不跨越首尾的最大子数组，与跨越首尾的子数组。
- 跨越首尾的部分等于总和减去中间一段不被选取的连续区间，因此可以用总和减去最小子数组和得到。
- 两种情况都用 Kadane 求一次，答案为两者中的较大值。
- 时间复杂度 O(n)，空间复杂度 O(1)。
- 边界：全部为负数时最小子数组等于整个数组，跨越情况会得到空区间，需要特判并返回最大单元素。
- 常见错误是遗漏全负特判，返回 0。

### 12.9（实现）差分数组如何支持区间加与单点查询？

- 定义 `diff[0] = a[0]`，`diff[i] = a[i] - a[i - 1]`。
- 区间 [l, r] 整体加 v 时，只需 `diff[l] += v` 与 `diff[r + 1] -= v`。
- 全部修改完成后对 `diff` 求前缀和，即得到最终数组。
- 每次修改 O(1)，还原 O(n)，空间 O(n)。
- 边界：r 为 n - 1 时 `r + 1` 越界，差分数组需要开 n + 1 个位置。
- 常见错误是漏掉 `r + 1` 处的减法，或对差分数组直接查询而未还原。

```cpp
std::vector<int> diff(n + 1, 0);
auto add = [&](int l, int r, int v) {
    diff[l] += v;
    diff[r + 1] -= v;          // 数组长度需为 n + 1
};
int cur = 0;
for (int i = 0; i < n; ++i) {
    cur += diff[i];
    a[i] += cur;
}
```

### 12.10 区间加与查询混合时为何差分不够？

- 差分把每次修改摊到 O(1)，但单次查询需要 O(n) 还原，混合场景总代价仍为 O(nq)。
- 离线场景可以收集全部修改后一次还原，总代价为 O(n + q)。
- 在线混合需要支持「区间加、区间和」的结构，常用树状数组维护两个差分数组，或线段树加懒标记。
- 树状数组的双差分写法把两种操作都做到 O(log n)，代码量小于线段树。
- 常见错误是在两次修改之间反复还原，使每次修改退化为 O(n)。

| 结构 | 区间加 | 区间和 | 适用场景 |
| --- | --- | --- | --- |
| 朴素数组 | O(n) | O(n) | 数据量很小 |
| 差分数组 | O(1) | O(n) | 先改后查的离线场景 |
| 树状数组 | O(log n) | O(log n) | 在线混合 |
| 线段树 | O(log n) | O(log n) | 需要更多区间操作 |

### 12.11 二维差分如何实现子矩阵加？

- 对 (x1, y1) 到 (x2, y2) 的矩形加 v，在四个角分别执行加、减、减、加。
- 还原时对差分数组做二维前缀和，得到每个位置的累计增量。
- 数组尺寸取 (m + 1) × (n + 1)，`x2 + 1` 与 `y2 + 1` 落在边界内，无需特判。
- 每次修改 O(1)，还原 O(mn)。
- 边界：矩形退化为单行或单列时公式不变。
- 常见错误是四个角的符号写错，导致某块区域被多次叠加。

```cpp
diff[x1][y1] += v;
diff[x2 + 1][y1] -= v;
diff[x1][y2 + 1] -= v;
diff[x2 + 1][y2 + 1] += v;
```

### 12.12 航班预订统计与拼车问题如何用差分？

- 预订记录 (first, last, seats) 表示闭区间内座位增加，转为 `diff[first] += seats` 与 `diff[last + 1] -= seats`。
- 还原后得到每个航段的座位总数，差分数组长度为最大坐标加二。
- 拼车的占用区间是半开区间：乘客在 from 上车、在 to 下车，因此 `diff[from] += numPassengers` 与 `diff[to] -= numPassengers`。
- 拼车还需容量约束：还原过程中累加值超过 `capacity` 时返回假。
- 时间复杂度 O(n + 最大坐标)，空间复杂度 O(最大坐标)。
- 常见错误是把闭区间与半开区间的端点处理混用，在上下车同一时刻多算一人。

### 12.13 如何求子数组和与目标值最接近？

- 目标是使 `|pre[r] - pre[l] - target|` 最小，对每个 `pre[r]` 在已出现的前缀和中查找最接近 `pre[r] - target` 的值。
- 用 `std::set` 维护已出现的前缀和，用 `lower_bound` 取前驱与后继两个候选。
- 查询顺序要求 l 小于 r，因此先查询再插入当前前缀和。
- 时间复杂度 O(n log n)，空间复杂度 O(n)。
- 边界：目标值为负数；前缀和重复时集合去重不影响结果。
- 常见错误是先插入再查询，把长度为 0 的区间纳入候选。

### 12.14 前缀异或如何求区间异或？

- `pre[0] = 0`，`pre[i + 1] = pre[i] ^ a[i]`。
- 区间 [l, r] 的异或为 `pre[r + 1] ^ pre[l]`，因为异或的逆运算仍是异或。
- 子数组异或为 0 的个数等于相同前缀异或值出现次数的组合数之和。
- 时间复杂度 O(n)，空间复杂度 O(n)。
- 边界：空区间异或为 0；元素为 0 时前缀异或值不变。
- 常见错误是把区间异或写成两个前缀异或相减。

### 12.15 除自身以外数组的乘积如何用前后缀完成？

- 前缀积 `left[i]` 表示 `a[0]` 到 `a[i - 1]` 的乘积，后缀积同理。
- 结果 `res[i] = left[i] * right[i]`；可以把前缀积直接写入结果数组，再用一个变量滚动计算后缀。
- 不使用除法，因此元素含 0 时结果仍然正确。
- 时间复杂度 O(n)，除输出外额外空间 O(1)。
- 边界：长度为 1 时结果为 1；存在两个及以上 0 时结果全为 0。
- 常见错误是采用「总和除以自身」的方案，遇到 0 时失效。

```cpp
std::vector<int> productExceptSelf(const std::vector<int>& a) {
    const int n = (int)a.size();
    std::vector<int> res(n, 1);
    for (int i = 1; i < n; ++i) res[i] = res[i - 1] * a[i - 1];
    int right = 1;
    for (int i = n - 1; i >= 0; --i) {
        res[i] *= right;
        right *= a[i];
    }
    return res;
}
```

### 12.16 哈希表在前缀和问题中存什么，如何按目标选择？

- 存出现次数用于计数类问题，例如和为 k 的子数组个数。
- 存首次出现下标用于求最长区间，例如和为 k 的最长子数组。
- 存最近出现下标用于求最短区间，但含负数时最短区间通常改用单调队列。
- 键可以是前缀和本身，也可以是前缀和对 K 的余数，取决于问题是否涉及整除。
- 哈希表的插入与查询为 O(1) 期望，因此计数类与前缀和类问题的整体复杂度保持不变。
- 常见错误是同一题中混用「次数」与「下标」，导致答案数量级错误。

| 存储内容 | 配合的操作 | 得到的结论 |
| --- | --- | --- |
| 出现次数 | 累加 `cnt[pre - k]` | 满足条件的子数组个数 |
| 首次下标 | 用当前下标相减 | 满足条件的最长区间 |
| 最近下标 | 用当前下标相减 | 满足条件的最短区间 |

### 12.17（陷阱）前缀和的下标偏移与溢出容易在哪些地方出错？

- 前缀和数组长度为 n + 1，`pre[i]` 对应前 i 个元素，不是第 i 个元素。
- 闭区间 [l, r] 对应 `pre[r + 1] - pre[l]`，与半开区间 [l, r + 1) 的表达一致。
- n 个 `int` 之和可能超过 `int` 上限，累加类型用 `long long`。
- 求平均值一类派生量时，先用 `long long` 求和再做除法，避免中间结果溢出。
- 常见错误是把 `pre[r] - pre[l]` 当作闭区间和，结果少算了 `a[r]`。
- 边界：n 为 0 时只有哨兵，任何区间查询都返回 0。

### 12.18 前缀最大值与后缀最大值数组有什么用？

- `preMax[i]` 表示 `a[0]` 到 `a[i]` 的最大值，`sufMax[i]` 表示 `a[i]` 到末尾的最大值。
- 构建一次 O(n)，此后 O(1) 取得任意前缀或后缀的极值。
- 典型用途包括接雨水、股票利润、分割数组与「左侧元素都不大于当前元素」一类判断。
- 边界：`preMax[0]` 初始化为 `a[0]`，数组含负数时初始化为 0 会出错。
- 常见错误是在循环中边查询边更新，使查询范围包含了当前位置。
- 需要同时比较左右两侧时，前缀与后缀各算一遍即可，不需要嵌套循环。

### 12.19 和至少为 K 的最短子数组如何用前缀和与单调队列？

- 前缀和数组 `pre` 长度为 n + 1，目标是找 i 小于 j 且 `pre[j] - pre[i]` 不小于 K 的最小 `j - i`。
- 维护下标递增、前缀和值递增的双端队列；对每个 j，若队首满足差值条件则弹出并更新答案。
- 弹出的队首不需要保留，因为更靠后的下标对后续 j 只会给出更短的区间。
- 入队前弹出队尾所有前缀和不小于当前值的下标，保持队列单调。
- 时间复杂度 O(n)，空间复杂度 O(n)。
- 边界：不存在满足条件的子数组时返回 -1；元素含负数时滑动窗口失效，本写法仍然成立。
- 常见错误是用滑动窗口处理含负数的数组，或漏掉队尾的单调维护。

```cpp
int shortestSubarray(const std::vector<int>& a, int k) {
    const int n = (int)a.size();
    std::vector<long long> pre(n + 1, 0);
    for (int i = 0; i < n; ++i) pre[i + 1] = pre[i] + a[i];
    std::deque<int> dq;                  // 下标递增，pre 值递增
    int ans = n + 1;
    for (int i = 0; i <= n; ++i) {
        while (!dq.empty() && pre[i] - pre[dq.front()] >= k) {
            ans = std::min(ans, i - dq.front());
            dq.pop_front();
        }
        while (!dq.empty() && pre[dq.back()] >= pre[i]) dq.pop_back();
        dq.push_back(i);
    }
    return ans == n + 1 ? -1 : ans;
}
```

### 12.20（场景）按时间窗口统计请求数该如何实现？

- 时间戳有序存放时，构造前缀和 `pre[i]` 表示前 i 条记录的数量。
- 窗口 [t, t + W] 内的数量为 `upper_bound` 与 `lower_bound` 的差值。
- 预处理 O(n)，单次查询 O(log n)，空间 O(n)。
- 时间戳存在重复时，开闭区间的定义要与业务口径一致，否则边界记录会多算或少算。
- 流式场景无法预先构建前缀和，改用双端队列维护窗口，单次更新均摊 O(1)。
- 常见错误是窗口右端按闭区间定义却在计算时少算一条记录。

```cpp
const auto lo = std::lower_bound(ts.begin(), ts.end(), t);
const auto hi = std::upper_bound(ts.begin(), ts.end(), t + w);
const int count = (int)(hi - lo);
```

---

## 13. 回溯与递归

### 13.1 回溯法有哪三个要素？

- 路径记录已经做出的选择，选择列表给出当前可选的候选，结束条件决定何时记录一个解。
- 递归进入前做选择，递归返回后撤销选择，两者必须成对出现。
- 剪枝在做出选择之前判断，避免进入注定失败的分支。
- 复杂度按解空间树的结点数估算，通常为指数级，输出代价也需要计入。
- 边界：空输入、单元素输入、目标值无解；路径为空时是否算一个解由题目定义。
- 常见错误是撤销不完整，或在提前返回的分支漏掉撤销。

### 13.2 递归与迭代如何互相转换？

- 尾递归可以改写为循环，把递归参数变成循环变量。
- 一般递归需要显式栈保存当前状态与「恢复到哪一步」，否则无法确定返回后继续执行的位置。
- 递归深度与输入规模线性相关时，最坏深度可能达到 10^5，默认栈空间可能不足。
- 两种写法时间复杂度相同，迭代省去函数调用开销，缓存局部性通常更好。
- C++ 标准不保证尾调用优化，依赖该优化消除栈增长并不可靠。
- 常见错误是显式栈只保存结点而不保存访问阶段，导致同一结点被重复展开。

```cpp
int sum(int n) { return n == 0 ? 0 : n + sum(n - 1); }   // 递归

int sumIter(int n) {                                     // 迭代
    int s = 0;
    while (n > 0) s += n--;
    return s;
}
```

### 13.3 子集如何枚举？

- 每个元素有选与不选两种状态，递归树深度为 n，叶子数为 2^n。
- 写法一按位置递归，先处理不选的分支再处理选的分支，到达叶子时记录路径。
- 写法二每层从 `start` 开始枚举下一个元素，每个结点都是一个解，天然避免重复。
- 两种写法都能覆盖全部子集，写法二更容易扩展为同层去重。
- 时间复杂度 O(n × 2^n)，其中 n 来自每个解的复制代价；空间 O(n)。
- 边界：空数组产生一个空子集，而不是零个解。
- 常见错误是在写法二中把下一层起点写成 `start`，导致同一元素被反复选取。

```cpp
void dfs(const std::vector<int>& a, int i,
         std::vector<int>& path, std::vector<std::vector<int>>& res) {
    if (i == (int)a.size()) { res.push_back(path); return; }
    dfs(a, i + 1, path, res);          // 不选 a[i]
    path.push_back(a[i]);
    dfs(a, i + 1, path, res);          // 选 a[i]
    path.pop_back();
}
```

### 13.4 子集 II 如何去重？

- 先排序，使相同元素相邻。
- 同一层中若当前元素与前一个相同则跳过，条件为 `i > start` 且 `a[i] == a[i - 1]`。
- 只在同层去重，不同层仍可使用相同值，这与「每个元素只用一次」并不冲突。
- 时间复杂度 O(n × 2^n)，空间 O(n)。
- 边界：全部元素相同；数组长度为 0 或 1。
- 常见错误是用 `used` 数组做同层判断，或把去重条件写成全局跳过导致漏解。

```cpp
for (int i = start; i < (int)a.size(); ++i) {
    if (i > start && a[i] == a[i - 1]) continue;   // 同层去重
    path.push_back(a[i]);
    dfs(a, i + 1, path, res);
    path.pop_back();
}
```

### 13.5 全排列的两种写法有何差异？

- 交换法把当前位置与后面的元素依次交换，递归结束后换回，原地完成且不需要额外数组。
- 标记法用 `used` 数组记录已选元素，按原顺序枚举候选。
- 交换法的输出顺序不稳定，遇到重复元素时去重困难；标记法配合排序容易去重。
- 时间复杂度 O(n × n!)，空间 O(n)。
- 边界：长度为 1 时只有一个排列；存在重复元素时需要额外去重。
- 常见错误是交换后忘记换回，或标记数组在递归返回后未复位。

```cpp
void dfs(std::vector<int>& path, std::vector<char>& used) {
    if (path.size() == a.size()) { res.push_back(path); return; }
    for (int i = 0; i < (int)a.size(); ++i) {
        if (used[i]) continue;
        used[i] = 1;
        path.push_back(a[i]);
        dfs(path, used);
        path.pop_back();
        used[i] = 0;
    }
}
```

### 13.6 全排列 II 如何去重？

- 排序后用 `used` 数组记录已选元素，跳过已使用的下标。
- 去重条件为 `i > 0` 且 `a[i] == a[i - 1]` 且 `!used[i - 1]`，含义是同一层中相同值只使用第一个。
- 条件成立时说明前一个相同值已经在本层被使用过，继续枚举只会产生重复排列。
- 时间复杂度 O(n × n!)，空间 O(n)。
- 边界：全部元素相同；长度为 0 或 1。
- 常见错误是把条件写成 `used[i - 1]`，把应当保留的分支剪掉。

### 13.7 组合总和如何允许元素重复使用？

- 递归时下一层的起点仍为 `i` 而不是 `i + 1`，表示当前元素可以再次选取。
- 排序后若当前元素大于剩余目标值，可直接结束本层循环。
- 路径和等于目标值时记录，路径长度不固定。
- 递归深度不超过目标值与最小元素之比，搜索规模为指数级。
- 边界：目标值为 0 时是否返回空组合由题目定义；元素含 0 时递归不会终止，需要提前排除。
- 常见错误是传 `i + 1`，把可重复选取退化为每个元素最多选一次。

### 13.8 组合总和 II 与组合总和有何不同？

- 每个元素只能使用一次，递归下一层从 `i + 1` 开始。
- 数组含重复元素，需要排序并做同层去重。
- 剪枝：当前元素大于剩余目标值时结束本层循环。
- 时间复杂度指数级，空间 O(n)。
- 边界：目标值小于最小元素时无解；数组含 0 时需要按题目语义处理。
- 常见错误是去重条件与「只用一次」互相干扰，或在递归入口处去重而不是同层去重。

### 13.9 括号生成如何用计数约束剪枝？

- 递归参数为已用左括号数与右括号数，路径为当前字符串。
- 约束一：左括号数小于 n 时可以放置左括号。
- 约束二：右括号数小于左括号数时可以放置右括号。
- 两个约束保证任意前缀都合法，不需要在生成完整串后再检查。
- 解的个数为第 n 个卡特兰数，复杂度与解的个数同阶。
- 常见错误是把第二个约束写成右括号数小于 n，生成不合法前缀。

### 13.10 N 皇后如何逐行放置并检测冲突？

- 每行放置一个皇后，递归深度为 n，每层枚举当前行的列。
- 用三个布尔数组记录列、主对角线（下标 `r + c`）与副对角线（下标 `r - c + n - 1`）是否被占用。
- 冲突检测为 O(1)，放置与撤销各需要三次赋值。
- 时间复杂度上界为 O(n!)，空间 O(n)。
- 边界：n 为 1 时有解；n 为 2 或 3 时无解。
- 常见错误是副对角线下标为负而未加偏移，造成越界访问。

```cpp
void dfs(int r, int n) {
    if (r == n) { ++count; return; }
    for (int c = 0; c < n; ++c) {
        if (col[c] || d1[r + c] || d2[r - c + n - 1]) continue;
        col[c] = d1[r + c] = d2[r - c + n - 1] = 1;
        dfs(r + 1, n);
        col[c] = d1[r + c] = d2[r - c + n - 1] = 0;
    }
}
```

### 13.11 N 皇后的位运算写法如何实现？

- 用三个整数表示列、左下方向与右下方向的占用，某位为 1 表示该位置不可用。
- 可用位置为 `~(cols | d1 | d2) & mask`，其中 `mask` 等于 `(1 << n) - 1`。
- 每次取最低位的 1：`p = avail & -avail`，再把该位从可用集合中清除。
- 递归时左下方向左移一位、右下方向右移一位，并与 `mask` 相与截断高位。
- 时间复杂度与布尔数组写法相同，常数更小。
- 常见错误是忘记与 `mask` 相与，高位符号位干扰可用位置的计算。

```cpp
void dfs(int row, int cols, int d1, int d2, int n, int& count) {
    if (row == n) { ++count; return; }
    const int mask = (1 << n) - 1;
    int avail = ~(cols | d1 | d2) & mask;
    while (avail) {
        const int p = avail & -avail;
        avail ^= p;
        dfs(row + 1, cols | p, ((d1 | p) << 1) & mask, (d2 | p) >> 1, n, count);
    }
}
```

### 13.12 解数独的回溯如何组织？

- 用三个布尔表分别记录每行、每列、每个九宫格已经使用的数字。
- 每次选一个空格，枚举 1 到 9，检查三张表后填入并递归。
- 找到一个解即可返回真，逐层向上传递，不需要继续搜索。
- 优先填充候选最少的空格（MRV 启发式）可以显著减少搜索量。
- 复杂度为指数级，实际规模受约束强度影响。
- 常见错误是递归返回后未撤销填入的数字，或返回值未向上传递。

### 13.13 单词搜索的网格回溯如何标记访问？

- 从每个格子出发做深度优先搜索，方向为上下左右四个相邻格。
- 访问标记可以原地修改字符，回溯时恢复原字符。
- 剪枝：首字符不匹配时直接跳过；剩余待匹配长度大于剩余可走步数时提前返回。
- 时间复杂度 O(mn × 4^L)，L 为单词长度；空间 O(L)。
- 边界：单词长度为 0 时返回真；单词长度大于格子总数时必然无解。
- 常见错误是使用额外的 `visited` 数组却在回溯时忘记复位，使后续路径无法访问该格。

### 13.14 分割回文串如何避免重复判断回文？

- 递归枚举切分点，当前段为回文时递归处理剩余部分。
- 预先用动态规划求出所有子串是否回文，`dp[i][j]` 依赖 `dp[i + 1][j - 1]` 与两端字符是否相等。
- 预处理 O(n^2)，回溯代价与解的个数同阶。
- 边界：空串返回空列表；单字符一定是回文。
- 常见错误是每段都用双指针重新判断，复杂度从 O(n^2) 退化到 O(n^3)。

### 13.15（复杂度）回溯的复杂度如何估算？

- 先数解空间树的结点数，再乘以每个结点的处理代价。
- 子集为 2^n，排列为 n!，组合为 C(n, k)，棋盘类问题按可行位置的数量估算。
- 输出每个解需要 O(n) 的复制代价，总输出代价为 O(n × 解的个数)。
- 剪枝改变常数与平均情况，最坏上界不变。
- 常见错误是把排列问题的复杂度写成 2^n，忽略每个解的长度。

### 13.16（陷阱）回溯中路径为何要用引用传递？

- 路径以引用传递并在回溯时撤销，避免每一层都复制整个路径。
- 结果收集必须按值复制，`res.push_back(path)` 会复制当前内容。
- 若结果中保存的是路径的引用或指针，后续修改会改变已经保存的解。
- 引用传递要求进入与退出时状态一致，提前返回的分支同样要撤销。
- 路径可以预先 `reserve(n)`，避免递归过程中反复扩容带来的复制。
- 常见错误是把路径的地址存入结果，最终得到一组内容相同的解。

### 13.17 回溯的递归深度由什么决定，何时需要改写为迭代？

- 回溯深度等于当前路径长度，子集与排列为 n，N 皇后为 n，组合总和受目标值与最小元素限制。
- 深度为 n 时栈帧数量与 n 同阶，n 在 20 以内通常安全，n 达到 10^5 时默认栈空间可能不足。
- 路径长度与输入规模线性相关的场景更容易触发栈溢出，例如图、网格与长链。
- 改写方式包括显式栈保存「路径与下一候选下标」、改用广度优先搜索，以及迭代加深。
- 增大线程栈大小依赖平台接口，不属于标准 C++ 的能力；C++ 标准不保证尾调用优化。
- 常见错误是认为尾递归一定被优化，从而在深递归中依赖这一假设。

### 13.18（场景）如何在一秒内枚举全部解？

- 先对输入排序，把最强的剪枝放在最前面，例如当前和已超过目标值就返回。
- 可行性剪枝优先于最优性剪枝，前者能砍掉整棵子树，后者只影响记录答案的时机。
- 同层去重放在循环入口，避免进入递归后再判断。
- 只统计解的个数时可以省去路径复制，代价下降一个量级。
- 用数组下标代替哈希表记录状态，减少常数开销。
- 常见错误是让剪枝条件依赖未排序的数据，导致剪枝失效。

### 13.19（代码阅读）缺少撤销语句会导致什么结果？

- 下面代码在递归返回后没有弹出当前元素，路径会持续累积。
- 结果中会出现包含前面分支元素的多余组合，解的数量与内容都不正确。
- 定位方法是检查每一处 `push_back` 是否有配对的 `pop_back`。
- 提前 `return` 的分支最容易漏掉撤销。
- 修正方式是在递归调用之后立即弹出，或改用值传递的路径副本。

```cpp
void dfs(int start, std::vector<int>& path) {
    res.push_back(path);
    for (int i = start; i < (int)a.size(); ++i) {
        path.push_back(a[i]);
        dfs(i + 1, path);      // 缺少 path.pop_back()
    }
}
```

### 13.20（实现）如何用位掩码枚举子集？

- 用 0 到 `2^n - 1` 的整数表示子集，第 i 位为 1 表示选取 `a[i]`。
- 内层循环检查每一位，收集对应元素。
- 时间复杂度 O(n × 2^n)，保存全部子集时空间为 O(n × 2^n)。
- 适用于 n 不超过 20 的场景，2^20 约为 10^6。
- 位数超过 31 时左移溢出，需要用 `1u` 或 `1ull` 并限制 n。
- 常见错误是写成 `1 << n` 且 n 为 31，有符号左移属于未定义行为。

```cpp
for (unsigned mask = 0; mask < (1u << n); ++mask) {
    std::vector<int> sub;
    for (int i = 0; i < n; ++i)
        if (mask >> i & 1u) sub.push_back(a[i]);
    res.push_back(std::move(sub));
}
```

---

## 14. 动态规划（线性）

### 14.1 线性动态规划有哪四个要素？

- 状态定义必须唯一描述一个子问题，且满足无后效性：当前状态确定后，后续决策不依赖到达该状态的路径。
- 转移方程枚举所有决策分支，漏掉一个分支会使答案偏大或偏小。
- 初值对应最小子问题，边界处理空输入与长度为 1 的情形。
- 遍历顺序保证依赖项已经计算；一维滚动时依赖方向决定正序还是倒序。
- 复杂度为状态数乘以单次转移的代价，空间为状态数，可用滚动数组压缩。
- 常见错误是初值错误导致整表偏移，或转移中引用了尚未计算的状态。

### 14.2 爬楼梯为何等价于斐波那契数列？

- 到达第 n 阶的最后一步只能来自第 n - 1 阶或第 n - 2 阶，因此 `f(n) = f(n - 1) + f(n - 2)`。
- 初值为 `f(0) = 1` 与 `f(1) = 1`；把 `f(0)` 设为 1 是为了让 `f(2)` 等于 2。
- 用两个滚动变量递推，空间为 O(1)，时间为 O(n)。
- n 较大时结果增长很快，题目通常要求对固定模数取模。
- 边界：n 为 0 时按「空走法」返回 1，n 为 1 时返回 1，具体取值需与题目定义一致。
- 常见错误是把 `f(0)` 设为 0，导致 `f(2)` 得到 1 而不是 2。

```cpp
int climbStairs(int n) {
    int a = 1, b = 1;                 // f(0), f(1)
    for (int i = 2; i <= n; ++i) {
        const int c = a + b;
        a = b;
        b = c;
    }
    return b;
}
```

### 14.3（实现）每次可走 1 到 m 阶时如何递推？

- 转移为 `f(n)` 等于前 m 项之和，初值 `f(0) = 1`。
- 朴素写法对每一项累加前 m 项，时间复杂度 O(nm)。
- 用滑动窗口维护前 m 项之和，每步加上新项并减去窗口外的项，复杂度降为 O(n)。
- 边界：m 大于 n 时只累加实际存在的项，不能访问负下标。
- n 较大时需要对结果取模，窗口和用 `long long` 保存，避免累加溢出。
- 常见错误是初始化时把超过 m 的项也计入窗口和。

```cpp
int climbStairs(int n, int m, int mod) {
    std::vector<long long> f(n + 1, 0);
    f[0] = 1;
    long long win = 1;                // 前 m 项之和
    for (int i = 1; i <= n; ++i) {
        f[i] = win % mod;
        win += f[i];
        if (i - m >= 0) win -= f[i - m];
    }
    return (int)f[n];
}
```

### 14.4 打家劫舍的转移如何写？

- 状态为「考虑前 i 间房屋时的最大金额」，转移为 `max(dp[i - 1], dp[i - 2] + a[i])`。
- 含义是第 i 间不偷则沿用前一间的结果，偷则加上前两间之前的最大值。
- 用两个滚动变量代替数组，空间为 O(1)，时间为 O(n)。
- 边界：空数组返回 0；单元素返回该元素。
- 常见错误是初值设置使首间房屋被跳过，例如把 `dp[0]` 与 `dp[1]` 都设为 0。
- 金额均为非负数时不需要额外判断，含负数时题目语义需要重新确认。

```cpp
int rob(const std::vector<int>& a) {
    int prev2 = 0, prev1 = 0;         // f(i-2), f(i-1)
    for (int x : a) {
        const int cur = std::max(prev1, prev2 + x);
        prev2 = prev1;
        prev1 = cur;
    }
    return prev1;
}
```

### 14.5 环形排列的打家劫舍如何处理首尾相邻？

- 首尾相邻意味着第一间与最后一间不能同时选取，按两种情况分别求解。
- 情况一取区间 [0, n - 2]，情况二取区间 [1, n - 1]，答案为两者中的较大值。
- 两种情况的并集覆盖了全部合法方案，交集是首尾都不选的方案，不影响最大值。
- 时间复杂度 O(n)，空间 O(1)。
- 边界：n 为 1 时直接返回该元素；n 为 2 时返回两者的较大值，此时两个区间各含一个元素。
- 常见错误是遗漏 n 为 1 的特判，导致区间为空而返回 0。

### 14.6 最小花费爬楼梯的状态如何定义？

- 定义 `dp[i]` 为从第 i 阶出发到达顶部的最小花费，转移为 `cost[i] + min(dp[i + 1], dp[i + 2])`。
- 从后往前递推，顶部之外的两阶花费为 0。
- 答案为 `min(dp[0], dp[1])`，因为起点可以是第 0 阶或第 1 阶。
- 时间复杂度 O(n)，空间 O(1)。
- 边界：楼梯只有两阶时答案为两阶花费的较小值。
- 常见错误是把状态定义为「到达第 i 阶的花费」后初值处理错，把 `cost[0]` 重复计算。

```cpp
int minCostClimbingStairs(const std::vector<int>& cost) {
    int next1 = 0, next2 = 0;         // dp[i+1], dp[i+2]
    for (int i = (int)cost.size() - 1; i >= 0; --i) {
        const int cur = cost[i] + std::min(next1, next2);
        next2 = next1;
        next1 = cur;
    }
    return std::min(next1, next2);
}
```

### 14.7（实现）编辑距离的状态与转移如何写？

- `dp[i][j]` 表示把 `s` 的前 i 个字符变成 `t` 的前 j 个字符所需的最少操作数。
- 两端字符相同时直接继承 `dp[i - 1][j - 1]`，不增加操作。
- 不同时取删除、插入、替换三者的最小值加一，分别对应 `dp[i - 1][j]`、`dp[i][j - 1]`、`dp[i - 1][j - 1]`。
- 初值为 `dp[i][0] = i` 与 `dp[0][j] = j`，对应删除全部或插入全部。
- 时间复杂度 O(mn)，空间 O(mn)。
- 边界：任一串为空时答案为另一串的长度。
- 常见错误是初值只填一行或一列，或把替换当成两次操作。

```cpp
int minDistance(const std::string& s, const std::string& t) {
    const int m = (int)s.size(), n = (int)t.size();
    std::vector<std::vector<int>> dp(m + 1, std::vector<int>(n + 1));
    for (int i = 0; i <= m; ++i) dp[i][0] = i;
    for (int j = 0; j <= n; ++j) dp[0][j] = j;
    for (int i = 1; i <= m; ++i) {
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1]) dp[i][j] = dp[i - 1][j - 1];
            else dp[i][j] = 1 + std::min({dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]});
        }
    }
    return dp[m][n];
}
```

### 14.8 编辑距离如何把空间降到一维？

- 一维数组 `dp[j]` 在一轮内先表示上一行的值，随后被当前行的值覆盖。
- 需要一个变量 `prev` 保存左上角的 `dp[i - 1][j - 1]`，因为它在覆盖后无法再从数组读到。
- 内层循环先保存旧的 `dp[j]` 到临时变量，计算完当前格再把临时值赋给 `prev`。
- 空间降为 O(n)，可通过交换两个串使 n 取较小值。
- 常见错误是 `prev` 更新顺序错，取到了本行已经计算过的值。
- 边界：空串时一维数组的初值就是长度序列。

```cpp
std::vector<int> dp(n + 1);
for (int j = 0; j <= n; ++j) dp[j] = j;
for (int i = 1; i <= m; ++i) {
    int prev = dp[0];                 // dp[i-1][0]
    dp[0] = i;
    for (int j = 1; j <= n; ++j) {
        const int old = dp[j];        // dp[i-1][j]
        if (s[i - 1] == t[j - 1]) dp[j] = prev;
        else dp[j] = 1 + std::min({dp[j], dp[j - 1], prev});
        prev = old;
    }
}
```

### 14.9 最长递增子序列的 O(n^2) 写法如何定义状态？

- `dp[i]` 表示以 `a[i]` 结尾的最长递增子序列长度。
- 转移枚举所有 `j < i` 且 `a[j] < a[i]` 的位置，取 `dp[j] + 1` 的最大值。
- 答案取所有 `dp[i]` 的最大值，而不是 `dp[n - 1]`。
- 时间复杂度 O(n^2)，空间 O(n)。
- 边界：空数组返回 0；全部元素相等时答案为 1。
- 常见错误是答案取末尾元素的状态，或把严格递增的比较写成不大于。

### 14.10（复杂度）最长递增子序列如何做到 O(n log n)？

- 维护数组 `tails`，其中 `tails[k]` 表示长度为 `k + 1` 的递增子序列的最小结尾值。
- 对每个元素 x，用 `lower_bound` 找到第一个不小于 x 的位置并替换，找不到则追加到末尾。
- `tails` 的长度即答案；替换操作保持每个长度的最小结尾，为后续元素留下最大空间。
- 严格递增用 `lower_bound`，非严格递增用 `upper_bound`。
- 时间复杂度 O(n log n)，空间 O(n)。
- 注意 `tails` 本身不一定是原数组中的合法子序列，只能用来求长度。
- 常见错误是用 `upper_bound` 求严格递增，得到非严格递增的长度。

```cpp
int lengthOfLIS(const std::vector<int>& a) {
    std::vector<int> tails;
    for (int x : a) {
        const auto it = std::lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else *it = x;
    }
    return (int)tails.size();
}
```

### 14.11 最长公共子序列与最长公共子串有何区别？

- 子序列不要求连续，子串要求连续，两者的状态定义不同。
- 子序列的 `dp[i][j]` 表示前 i 与前 j 个字符的最长公共子序列长度，字符不等时取上方与左方的较大值。
- 子串的 `dp[i][j]` 表示以 `s[i - 1]` 与 `t[j - 1]` 结尾的最长公共子串长度，字符不等时置 0。
- 子序列时间复杂度 O(mn)，空间可滚动到 O(min(m, n))。
- 边界：任一串为空时结果为 0。
- 常见错误是把子序列的转移套用到子串上，字符不等时仍取较大值。

### 14.12（陷阱）乘积最大子数组为何要同时维护最小值？

- 负数相乘会使最小值变为最大值，只维护最大值会漏掉这类情况。
- 状态为以当前位置结尾的最大乘积与最小乘积，二者都由上一轮的三个候选值产生。
- 候选包括当前元素本身、最大值乘当前元素、最小值乘当前元素。
- 时间复杂度 O(n)，空间 O(1)。
- 边界：数组中含 0 时乘积会归零，相当于重新开始；只有一个负数时答案为该负数。
- 常见错误是先用新值更新最大值再用它计算最小值，造成同一轮内的错误依赖。

```cpp
int maxProduct(const std::vector<int>& a) {
    int hi = a[0], lo = a[0], ans = a[0];
    for (int i = 1; i < (int)a.size(); ++i) {
        const int h = std::max({a[i], hi * a[i], lo * a[i]});
        const int l = std::min({a[i], hi * a[i], lo * a[i]});
        hi = h;
        lo = l;
        ans = std::max(ans, hi);
    }
    return ans;
}
```

### 14.13 解码方法的递推如何处理一位与两位数字？

- `dp[i]` 表示前 i 个字符的解码方式数。
- 一位数字：字符不为 `'0'` 时加上 `dp[i - 1]`。
- 两位数字：数值在 10 到 26 之间时加上 `dp[i - 2]`。
- 用两个滚动变量代替数组，空间为 O(1)。
- 边界：以 `'0'` 开头时结果为 0；"10" 与 "20" 只有一种解码。
- 常见错误是把两位判断写成 0 到 26，把 "05" 这类前导零组合当成合法。

```cpp
int numDecodings(const std::string& s) {
    if (s.empty()) return 0;
    int prev2 = 1, prev1 = s[0] != '0' ? 1 : 0;
    for (int i = 1; i < (int)s.size(); ++i) {
        int cur = 0;
        if (s[i] != '0') cur += prev1;
        const int two = (s[i - 1] - '0') * 10 + (s[i] - '0');
        if (two >= 10 && two <= 26) cur += prev2;
        prev2 = prev1;
        prev1 = cur;
    }
    return prev1;
}
```

### 14.14 单词拆分如何用线性动态规划判断？

- `dp[i]` 表示前 i 个字符能否由字典中的单词拼接而成，`dp[0]` 为真。
- 对每个 i 枚举切分点 j，若 `dp[j]` 为真且子串 `s[j, i)` 在字典中，则 `dp[i]` 为真。
- 字典用哈希集合存储，单次查询期望 O(1)；子串比较的代价为长度。
- 时间复杂度 O(n^2 × L)，L 为单词最大长度；空间 O(n)。
- 边界：空串视为可拆分；字典含空串时需要特判，否则转移会不断引用自身。
- 常见错误是使用 `substr` 生成临时串造成额外复制，或枚举 j 时漏掉 0。

### 14.15 只允许一次交易的股票利润如何求？

- 遍历价格，维护历史最低价，当前价格减去最低价即为当日卖出的利润。
- 答案为所有利润中的最大值，时间复杂度 O(n)，空间 O(1)。
- 边界：价格单调下降时没有正利润，返回 0。
- 常见错误是先更新最低价再计算利润，导致当日买卖的利润为 0。
- 也可以写成前缀最小值数组，但会多出 O(n) 空间，没有必要。

```cpp
int maxProfit(const std::vector<int>& p) {
    int low = p[0], ans = 0;
    for (int x : p) {
        ans = std::max(ans, x - low);
        low = std::min(low, x);
    }
    return ans;
}
```

### 14.16 最长摆动序列如何用两个状态递推？

- 定义 `up` 为以当前位置结尾、最后一步上升的最长摆动子序列长度，`down` 为最后一步下降的长度。
- 当前元素大于前一个时，`up` 更新为 `down + 1`；小于时 `down` 更新为 `up + 1`；相等时两者不变。
- 两个状态互相引用对方的历史值，因此更新时必须使用上一轮的值。
- 时间复杂度 O(n)，空间 O(1)。
- 边界：空数组返回 0；全部元素相等时答案为 1。
- 常见错误是按相邻差值的正负直接计数，遇到相等元素时没有跳过，导致结果偏大。

```cpp
int wiggleMaxLength(const std::vector<int>& a) {
    if (a.empty()) return 0;
    int up = 1, down = 1;
    for (int i = 1; i < (int)a.size(); ++i) {
        if (a[i] > a[i - 1]) up = down + 1;
        else if (a[i] < a[i - 1]) down = up + 1;
    }
    return std::max(up, down);
}
```

### 14.17（陷阱）含冷冻期的股票问题状态如何划分？

- 三个状态分别为持有股票、当天卖出、冷冻或不持有。
- 当天卖出的状态由上一轮的持有状态加上当前价格得到，卖出后下一天进入冷冻。
- 冷冻状态的转移来自上一轮的冷冻或上一轮的卖出。
- 买入只能从冷冻或不持有状态转移，不能从当天卖出的状态转移。
- 时间复杂度 O(n)，空间 O(1)。
- 常见错误是用本轮刚更新的持有状态计算卖出，相当于允许当天买入当天卖出，结果偏大。

```cpp
int maxProfit(const std::vector<int>& p) {
    int hold = -p[0], sold = 0, rest = 0;
    for (int i = 1; i < (int)p.size(); ++i) {
        const int h = std::max(hold, rest - p[i]);
        const int s = hold + p[i];
        const int r = std::max(rest, sold);
        hold = h; sold = s; rest = r;
    }
    return std::max(sold, rest);
}
```

### 14.18 线性动态规划有哪些常见优化手段？

- 滚动数组把空间从 O(n) 降到 O(1)，适用于转移只依赖固定几个历史状态的情形。
- 前缀和或滑动窗口优化把「枚举前 k 项求和」的转移从 O(n) 降到 O(1) 均摊。
- 单调队列优化适用于转移形如「区间最值加当前值」的情形。
- 决策单调性优化适用于区间动态规划，可把 O(n^3) 降到 O(n^2)。
- 状态压缩把多维状态编码为整数或位掩码，减少内存访问次数。
- 常见错误是滚动时依赖同轮已更新的值，或单调队列的弹出条件写错。

### 14.19（陷阱）动态规划的初值与不可达状态如何处理？

- 求最大值时不可达状态用足够小的负数，求最小值时用足够大的正数，避免参与比较后污染答案。
- 用 `INT_MAX` 直接做加法会溢出，常用 `INT_MAX / 2` 作为哨兵。
- 用 0 表示不可达会与「真实结果为 0」混淆，需要额外的标记或哨兵。
- 边界包括空输入、长度为 1、全为负数与目标值为 0 的情形。
- 取模运算后减法可能出现负值，需要先加模数再取模。
- 常见错误是哨兵值参与加法后溢出为负数，被误判为更优解。

### 14.20（辨析）记忆化搜索与递推该如何选择？

- 记忆化搜索按需计算，只访问可达状态，适合状态稀疏或转移复杂的问题。
- 递推需要显式确定遍历顺序，缓存局部性更好，常数通常更小。
- 两者时间复杂度相同，均为状态数乘以单次转移代价。
- 记忆化有递归深度与哈希查询开销；递推有填满整表的开销。
- 记忆化用 0 表示未计算时会与合法结果 0 混淆，应使用 -1 或额外的访问标记。
- 常见错误是在状态数很大时用哈希表记忆化，导致内存与常数同时上升。

---

## 15. 动态规划（区间、背包、树形）

### 15.1 0-1 背包的一维写法为何要倒序遍历容量？

- 状态 `dp[j]` 表示容量为 j 时能获得的最大价值，物品在外层、容量在内层。
- 内层倒序遍历时，`dp[j - w[i]]` 仍是上一轮（未考虑当前物品）的值，因此每件物品最多选一次。
- 若改为正序，`dp[j - w[i]]` 已被本轮更新，同一件物品会被重复选取。
- 时间复杂度 O(nW)，空间 O(W)。
- 边界：容量为 0 时结果为 0；物品重量大于容量时内层循环不执行。
- 常见错误是把物品循环放进内层，或在求方案数时也套用最大价值的循环顺序。

```cpp
int knapsack(const std::vector<int>& w, const std::vector<int>& v, int W) {
    std::vector<int> dp(W + 1, 0);
    for (int i = 0; i < (int)w.size(); ++i)
        for (int j = W; j >= w[i]; --j)
            dp[j] = std::max(dp[j], dp[j - w[i]] + v[i]);
    return dp[W];
}
```

### 15.2 完全背包为何改为正序遍历容量？

- 完全背包允许每件物品选取任意多次，正序时 `dp[j - w[i]]` 已经包含当前物品的选取。
- 状态与 0-1 背包相同，区别只在遍历方向。
- 时间复杂度 O(nW)，空间 O(W)。
- 求最大价值时两层循环可以交换，结果不变；求方案数时交换会改变计数语义。
- 边界：物品重量为 0 且价值为正时，正序写法会重复累加同一物品，需要单独处理。
- 常见错误是把完全背包与 0-1 背包的遍历方向混用，导致选取次数错误。

```cpp
for (int i = 0; i < (int)w.size(); ++i)
    for (int j = w[i]; j <= W; ++j)
        dp[j] = std::max(dp[j], dp[j - w[i]] + v[i]);
```

### 15.3 背包的初始化如何区分「恰好装满」与「不超过容量」？

- 求不超过容量的最大价值时，`dp` 全部初始化为 0，容量有剩余也允许。
- 求恰好装满时，`dp[0] = 0`，其余初始化为负无穷，表示该容量不可达。
- 负无穷用足够小的值，例如 `INT_MIN / 2`，避免加上价值后下溢。
- 答案检查：若 `dp[W]` 仍为负无穷，说明无法恰好装满。
- 两种初始化都不改变 O(nW) 的时间复杂度，只影响哪些容量被视为可达。
- 常见错误是两种语义混用，把不可达状态当作 0 参与比较，得到偏大的结果。
- 边界：容量为 0 且要求恰好装满时答案为 0；所有物品重量都大于容量时无解。

### 15.4 背包求方案数时循环顺序为何决定组合与排列？

- 外层物品、内层容量时，物品按固定顺序被考虑，方案不计选取顺序，得到组合数。
- 外层容量、内层物品时，不同顺序的选取会被分别计数，得到排列数。
- 两者都要求 `dp[0] = 1`，其余初值为 0。
- 典型对比：零钱兑换的方案数是组合，掷骰子到达某点数的方法是排列。
- 时间复杂度 O(nW)，空间 O(W)。
- 常见错误是循环顺序与题目语义不匹配，把组合题算成排列题。

### 15.5（实现）多重背包如何用二进制拆分降复杂度？

- 第 i 件物品有 `c` 个，把 `c` 拆成 1、2、4、8 直到剩余部分，得到 O(log c) 个新物品。
- 每个新物品的重量与价值按份数放大，再按 0-1 背包处理。
- 时间复杂度 O(W × Σlog c)，空间 O(W)。
- 拆分的正确性来自任意不超过 `c` 的数量都能由这些份数组合表示。
- 边界：数量为 0 时跳过该物品；剩余部分为 0 时不再生成新物品。
- 常见错误是拆分循环中先减后判断，导致最后一份重复或遗漏。

```cpp
for (int i = 0; i < n; ++i) {
    int c = cnt[i];
    for (int k = 1; k <= c; k <<= 1) {
        const int ww = k * w[i], vv = k * v[i];
        for (int j = W; j >= ww; --j)
            dp[j] = std::max(dp[j], dp[j - ww] + vv);
        c -= k;
    }
    if (c > 0) {
        const int ww = c * w[i], vv = c * v[i];
        for (int j = W; j >= ww; --j)
            dp[j] = std::max(dp[j], dp[j - ww] + vv);
    }
}
```

### 15.6 分组背包的循环顺序如何安排？

- 每组至多选一个物品，外层枚举组，内层倒序枚举容量，最内层枚举组内物品。
- 容量倒序保证同一组内的物品不会被重复选取。
- 时间复杂度 O(W × 总物品数)，空间 O(W)。
- 若把物品循环放在最外层，同一组会被多次选取，语义变成每组可选多个。
- 边界：组内物品重量都大于容量时该组不产生贡献。
- 常见错误是容量正序，或把组内物品循环写在容量循环之外。

### 15.7 背包的状态何时应该用价值而不是容量？

- 容量很大而价值总和较小时，可定义 `dp[v]` 为获得价值 v 所需的最小容量。
- 转移为 `dp[v] = min(dp[v], dp[v - val[i]] + w[i])`，答案为满足 `dp[v]` 不超过容量的最大 v。
- 时间复杂度 O(n × 价值和)，空间 O(价值和)。
- 该写法与容量作状态互为对偶，选择依据是两者中较小的那一维。
- 边界：价值和为 0 时答案为 0；容量不足以容纳任何物品时答案为 0。
- 常见错误是状态含义与初始化方向不一致，把最小值写成最大值。

### 15.8（复杂度）背包问题的复杂度为何称为伪多项式？

- O(nW) 中的 W 是容量的数值，而输入长度约为 `log W`，因此不是输入规模的多项式。
- 0-1 背包是 NP 完全问题，伪多项式算法不构成多项式时间解法。
- W 达到 10^9 时该算法不可行，需要改用近似算法或按价值做状态。
- 同一算法在不同数值范围下表现差异很大，复杂度分析必须写明 W 的取值。
- 常见错误是声称背包问题存在多项式时间精确解法。

### 15.9 区间动态规划如何求最长回文子序列？

- `dp[i][j]` 表示区间 [i, j] 内最长回文子序列的长度。
- 两端字符相等时 `dp[i][j] = dp[i + 1][j - 1] + 2`，否则取去掉左端或去掉右端的较大值。
- 长度 1 的区间初值为 1，长度 2 时 `dp[i + 1][j - 1]` 视为 0。
- 按区间长度从小到大遍历，保证依赖的更短区间已经计算。
- 时间复杂度 O(n^2)，空间 O(n^2)，可压缩到 O(n)。
- 边界：空串返回 0。
- 常见错误是按左端点递增遍历，导致 `dp[i + 1][j]` 尚未计算。

```cpp
int longestPalindromeSubseq(const std::string& s) {
    const int n = (int)s.size();
    std::vector<std::vector<int>> dp(n, std::vector<int>(n, 0));
    for (int i = 0; i < n; ++i) dp[i][i] = 1;
    for (int len = 2; len <= n; ++len)
        for (int i = 0; i + len - 1 < n; ++i) {
            const int j = i + len - 1;
            if (s[i] == s[j]) dp[i][j] = dp[i + 1][j - 1] + 2;
            else dp[i][j] = std::max(dp[i + 1][j], dp[i][j - 1]);
        }
    return n == 0 ? 0 : dp[0][n - 1];
}
```

### 15.10 戳气球的区间状态如何定义？

- 正向模拟戳破顺序会使子问题相互依赖，应反向考虑「最后戳破哪一个」。
- 在数组两端各加一个值为 1 的哨兵，定义 `dp[i][j]` 为开区间 (i, j) 内的最大收益。
- 枚举最后戳破的 k，收益为 `dp[i][k] + dp[k][j] + a[i] * a[k] * a[j]`。
- 按区间长度递增遍历，答案为 `dp[0][n - 1]`，n 为加上哨兵后的长度。
- 时间复杂度 O(n^3)，空间 O(n^2)。
- 边界：空数组返回 0；只有一个气球时收益为该气球的值。
- 常见错误是漏掉哨兵，或把区间定义为闭区间导致边界重复计算。

```cpp
int maxCoins(std::vector<int>& a) {
    a.insert(a.begin(), 1);
    a.push_back(1);
    const int n = (int)a.size();
    std::vector<std::vector<int>> dp(n, std::vector<int>(n, 0));
    for (int len = 2; len < n; ++len)
        for (int i = 0; i + len < n; ++i) {
            const int j = i + len;
            for (int k = i + 1; k < j; ++k)
                dp[i][j] = std::max(dp[i][j],
                    dp[i][k] + dp[k][j] + a[i] * a[k] * a[j]);
        }
    return dp[0][n - 1];
}
```

### 15.11 石子合并的区间转移如何写？

- `dp[i][j]` 表示把区间 [i, j] 的石子合并成一堆的最小代价。
- 枚举分割点 k，代价为左右两段的最小代价之和，再加上本次合并的区间总和。
- 区间总和用前缀和在 O(1) 内取得。
- 按区间长度递增遍历，时间复杂度 O(n^3)，空间 O(n^2)。
- 环形排列需要把数组复制一份接在后面，答案取长度为 n 的窗口中的最小值。
- 常见错误是区间总和的端点写错，或把合并代价重复累加。

```cpp
for (int len = 2; len <= n; ++len)
    for (int i = 0; i + len - 1 < n; ++i) {
        const int j = i + len - 1;
        dp[i][j] = INT_MAX;
        for (int k = i; k < j; ++k)
            dp[i][j] = std::min(dp[i][j], dp[i][k] + dp[k + 1][j]);
        dp[i][j] += pre[j + 1] - pre[i];   // 本次合并的代价
    }
```

### 15.12（陷阱）区间动态规划为何必须按长度遍历？

- `dp[i][j]` 依赖 `dp[i + 1][j]`、`dp[i][j - 1]` 与 `dp[i + 1][j - 1]`，三者对应的区间都更短。
- 按长度从小到大遍历，可以保证计算 `dp[i][j]` 时所有依赖项已经就绪。
- 若按左端点递增、右端点递增遍历，`dp[i + 1][j]` 位于下一行，尚未计算。
- 记忆化搜索按需递归，不需要显式规定顺序。
- 常见错误是把遍历顺序写成两层下标递增，得到错误结果却不报错。

### 15.13 二叉树的最大路径和如何用树形动态规划求解？

- 递归函数返回以当前节点为起点、向下延伸的最大贡献，负贡献截断为 0。
- 全局答案在每个节点处用「左贡献 + 右贡献 + 当前值」更新，对应经过该节点的路径。
- 返回值只能选择左右之一，因为路径不能在上层分叉。
- 时间复杂度 O(n)，空间 O(h)，h 为树高。
- 边界：空树返回 0；全部节点为负数时答案为最大的单节点值。
- 常见错误是把返回值也更新为全局答案，导致上层重复计算分叉路径。

```cpp
int gain(TreeNode* root, int& ans) {
    if (!root) return 0;
    const int l = std::max(0, gain(root->left, ans));
    const int r = std::max(0, gain(root->right, ans));
    ans = std::max(ans, root->val + l + r);   // 经过当前节点的路径
    return root->val + std::max(l, r);        // 向上返回单边贡献
}
```

### 15.14 换根动态规划如何求每个节点到其余节点的距离之和？

- 第一次后序遍历求出子树大小 `size[u]` 与子树内各节点到 `u` 的距离和 `down[u]`。
- 转移为 `down[u]` 等于各子节点 `down[v] + size[v]` 之和，因为每个子树的节点到 `u` 都多走一条边。
- 第二次前序遍历把父节点的答案传给子节点：`ans[v] = ans[u] + n - 2 * size[v]`。
- 含义是换根之后，`v` 子树内的节点距离各减少 1，其余节点距离各增加 1。
- 时间复杂度 O(n)，空间 O(n)；距离和可能超过 32 位，用 `long long` 保存。
- 边界：n 为 1 时答案为 0；链状树递归深度大，需要改用迭代遍历。
- 常见错误是第二次遍历仍用后序，此时父节点的答案尚未确定。

```cpp
void dfs1(int u) {
    size[u] = 1;
    for (int v : g[u]) {
        if (v == parent[u]) continue;
        parent[v] = u;
        dfs1(v);
        size[u] += size[v];
        down[u] += down[v] + size[v];
    }
}

void dfs2(int u, long long cur) {
    ans[u] = cur;
    for (int v : g[u]) {
        if (v == parent[u]) continue;
        dfs2(v, cur + n - 2 * size[v]);
    }
}
```

### 15.15 树上的「选或不选」问题如何转移？

- 每个节点有两个状态：选取该节点与不选取该节点。
- 不选当前节点时，子节点可以选也可以不选，取两者较大值后求和。
- 选当前节点时，子节点都不能选，求和后再加上当前节点的值。
- 后序遍历自底向上计算，时间复杂度 O(n)，空间 O(n)。
- 边界：单节点时答案为该节点的值与 0 的较大值。
- 常见错误是把「选」状态的初值设为 0 后忘记加上当前节点的值。

```cpp
std::pair<int, int> dfs(TreeNode* u) {     // {不选, 选}
    if (!u) return {0, 0};
    const auto l = dfs(u->left);
    const auto r = dfs(u->right);
    const int no = std::max(l.first, l.second) + std::max(r.first, r.second);
    const int yes = u->val + l.first + r.first;
    return {no, yes};
}
```

### 15.16 树形动态规划的遍历如何避免深递归？

- 递归后序遍历写法最直接，但深度等于树高，链状树可能达到 10^5 而耗尽栈空间。
- 迭代写法先用栈或队列得到父节点顺序，再按该顺序的逆序处理，效果等同后序。
- 只需要子树信息时逆序处理一次即可；还需要祖先方向的贡献时，再按正向顺序扫描一次。
- 两种写法时间复杂度都是 O(n)，迭代写法需要额外的顺序数组。
- 常见错误是只把递归改成手动栈却仍按先序处理，子节点信息尚未就绪。

### 15.17 旅行商问题的状态压缩如何定义状态？

- `dp[mask][i]` 表示已访问城市集合为 `mask`、当前位于城市 i 的最小代价。
- 转移枚举未访问的城市 j，新状态为 `mask | (1 << j)`，代价加上 `dist[i][j]`。
- 初值为 `dp[1][0] = 0`，其余为无穷大，表示从城市 0 出发。
- 答案为所有城市都访问后回到起点的最小值。
- 时间复杂度 O(2^n × n^2)，空间 O(2^n × n)。
- 边界：只有一个城市时答案为 0；存在不可达城市时无解。
- 常见错误是 mask 的位与城市编号错位，或忘记跳过不可达状态。

```cpp
std::vector<std::vector<int>> dp(1 << n, std::vector<int>(n, INF));
dp[1][0] = 0;
for (int mask = 1; mask < (1 << n); ++mask)
    for (int i = 0; i < n; ++i) {
        if (!(mask >> i & 1) || dp[mask][i] == INF) continue;
        for (int j = 0; j < n; ++j) {
            if (mask >> j & 1) continue;
            const int nm = mask | (1 << j);
            dp[nm][j] = std::min(dp[nm][j], dp[mask][i] + dist[i][j]);
        }
    }
int best = INF;
for (int i = 1; i < n; ++i) best = std::min(best, dp[(1 << n) - 1][i] + dist[i][0]);
```

### 15.18 棋盘覆盖类问题的状态压缩如何设计？

- 按行转移，`mask` 表示当前行向下一行突出的方块位置，1 表示该列被占用。
- 预处理每个 `mask` 是否合法：连续空位的长度必须为偶数，否则无法用横向方块填满。
- 相邻两行的 `mask` 需要满足不重叠，且并集满足同样的偶数空位条件。
- 状态转移为 `dp[i][mask]` 累加所有兼容的上一行状态，时间复杂度 O(n × 4^m)。
- 列数 m 较大时把棋盘转置，使状态维度取较小的那一侧。
- 常见错误是列数大于行数时未转置，导致 2^m 个状态无法承受。

```cpp
for (int mask = 0; mask < (1 << m); ++mask) {
    int cnt = 0;
    ok[mask] = true;
    for (int j = 0; j < m; ++j) {
        if (mask >> j & 1) {
            if (cnt & 1) ok[mask] = false;
            cnt = 0;
        } else {
            ++cnt;
        }
    }
    if (cnt & 1) ok[mask] = false;
}
```

### 15.19（陷阱）状态压缩中的位运算有哪些细节？

- 移位常量要用无符号类型，`1u << 31` 的结果无符号；有符号左移在 C++20 之前属于未定义行为。
- 判断某一位用 `mask >> i & 1`，清除某一位用 `mask & ~(1u << i)`。
- 枚举某个集合的全部子集可用 `for (int s = mask; s; s = (s - 1) & mask)`；对所有集合都枚举子集的总代价为 3^n 量级。
- `__builtin_popcount` 的参数是 `unsigned int`，64 位要用 `__builtin_popcountll`。
- C++20 之前有符号负数的右移结果由实现定义，C++20 起规定为算术右移，但代码不应依赖符号位参与掩码运算。
- 常见错误是对 32 位以上的集合使用 `int` 移位，或忘记把位掩码限制在有效列数内。

### 15.20（场景）n 不超过 25 时如何在状态压缩与搜索之间选择？

- 状态数为 2^n：n 为 20 时约 10^6，n 为 25 时约 3.3 × 10^7，后者需要严格控制常数与内存。
- 转移若为 O(n)，总操作数为 2^n × n，n 为 20 时约 2 × 10^7，属于可接受范围。
- 记忆化搜索实现简单，只访问可达状态；递推缓存友好，常数更小。
- 有大量不可达状态时，搜索配合剪枝往往快于填满整张表。
- 内存估算要按状态数乘以每个状态的字节数，n 为 25 时通常无法承受二维表。
- 常见错误是只估算 2^n 而忽略转移代价，或忽略每个状态的存储开销。

---

## 16. 贪心

### 16.1 贪心算法的两个基本性质是什么？

- 贪心选择性质指全局最优解可以由一系列局部最优选择构成，每一步选定后不回退，也不保留备选分支。
- 最优子结构指问题的最优解包含子问题的最优解，选定一步之后，剩余部分仍是同类型的子问题。
- 两个性质都需要单独证明，不能由「局部看起来最好」直接推出，反例通常出现在选择之间互相制约的场景。
- 证明贪心选择性质常用交换论证：把任一最优解的第一个选择替换为贪心选择，说明替换后的解仍然可行且不变差。
- 证明最优子结构时固定贪心选择，说明剩余问题的最优解与原问题的最优解一致。
- 无法证明时改用动态规划或带剪枝的搜索，贪心只作为上界估计或启发式。

### 16.2（辨析）贪心与动态规划如何区分？

- 贪心每一步只保留一个候选，选定即丢弃其余可能；动态规划保留全部子问题的结果，由状态转移合并。
- 问题满足贪心选择性质时贪心更简单，复杂度也更低；存在「当前最优导致后续变差」的依赖时只能用动态规划。
- 0-1 背包是典型反例，单位价值最高的物品可能占满容量并排除更优组合。
- 分数背包可以贪心，物品可分割，取走单位价值最高者不会破坏剩余容量的可用性。
- 区间调度的约束是两两不重叠，选定一个区间后，剩余可选集合只由它的结束时间决定，状态可压缩为一个标量。
- 若动态规划的状态可以压缩为一个标量且转移单调，通常能化简为贪心；否则需要保留完整状态。

### 16.3 区间调度：如何选出最多的互不重叠区间？

- 将全部区间按右端点升序排列，右端点相同时按左端点升序排列。
- 维护上一个被选中区间的右端点 `last`，初值取最小的整数，表示尚未选择。
- 依次遍历区间，当前区间左端点大于 `last` 时选中它并更新 `last`，否则跳过。
- 时间复杂度 O(n log n)，由排序决定，扫描部分是 O(n)；不计结果数组时额外空间为 O(1)。
- 边界：空输入返回 0，单个区间返回 1；闭区间端点相接算重叠，半开区间不算，判定条件相差一个等号。
- 易错点：按左端点排序；在遍历中与「前一个遍历到的区间」比较，正确做法是与「最后一个被选中的区间」比较。

```cpp
int maxIntervals(std::vector<std::pair<int, int>> iv) {
    std::sort(iv.begin(), iv.end(), [](const auto& a, const auto& b) {
        return a.second != b.second ? a.second < b.second : a.first < b.first;
    });
    int count = 0;
    long long last = LLONG_MIN;
    for (const auto& p : iv) {
        if (p.first > last) { ++count; last = p.second; }
    }
    return count;
}
```

### 16.4（辨析）区间调度按左端点还是按右端点排序？

- 按右端点排序保证每次选中的区间结束最早，为后续区间留下最大的剩余空间。
- 按左端点排序时，最早开始的区间可能很长，占用后续区间的位置，得到的结果可能少于最优。
- 反例：一个区间覆盖 0 至 10，另有若干短区间分布在 1 至 2、3 至 4 等位置，按左端点会先选中长区间。
- 交换论证：设最优解的首个区间为 O，贪心选中 G，G 的右端点不大于 O 的右端点，把 O 换成 G 后其余区间仍然可行。
- 问题改为「最少点覆盖全部区间」时，排序键仍是右端点，但判定条件与选中后的状态不同。
- 排序键由约束决定，先写出「选定一个元素后，剩余问题的可行集合如何变化」再确定。

### 16.5（陷阱）右端点相同的区间为何要按左端点再排序？

- 右端点相同时按左端点升序排列，较短的区间先被考察，避免长区间占用位置。
- 端点相同的区间在闭区间语义下互相重叠，最多只能选中一个，排序顺序不影响计数结果，但影响返回的具体区间。
- 题目要求返回区间本身时保存下标，仅存区间值无法区分端点相同的两项。
- `last` 的初值要能表示「尚未选择」，使用 `INT_MIN` 时注意左端点可能等于 `INT_MIN` 而导致误判。
- 端点接近 `INT_MAX` 时，计数与比较应使用更宽的整数类型，避免减法溢出。
- 判定条件写成「与前一个遍历到的区间不重叠」时，被跳过的区间会干扰判断，应改为与「上一个入选区间」比较。

### 16.6（实现）合并区间如何用一次扫描完成？

- 按左端点升序排序，排序后互相重叠的区间在序列中连续，一次扫描即可合并。
- 维护结果数组，新区间左端点不大于结果末尾区间的右端点时，扩展末尾区间的右端点。
- 扩展时取两者右端点的较大值，不能直接赋值，否则被包含的短区间会把右端点缩小。
- 时间复杂度 O(n log n)，空间为结果数组；原地合并可以做到 O(1) 额外空间。
- 边界：空输入返回空数组；端点相接是否合并按题意确定；单个区间原样返回。
- 输出按左端点有序，题目若要求无序需另行说明，不能默认有序即为答案。

```cpp
std::vector<std::vector<int>> merge(std::vector<std::vector<int>>& a) {
    std::sort(a.begin(), a.end());
    std::vector<std::vector<int>> out;
    for (const auto& seg : a) {
        if (!out.empty() && seg[0] <= out.back()[1]) {
            out.back()[1] = std::max(out.back()[1], seg[1]);
        } else {
            out.push_back(seg);
        }
    }
    return out;
}
```

### 16.7 用最少的箭引爆气球如何转化为区间选点？

- 每个气球对应闭区间 `[x - r, x + r]`，一支箭位于位置 p 时可引爆全部满足 `left <= p <= right` 的气球。
- 问题转化为区间选点：选最少的点，使每个区间至少包含一个点。
- 贪心策略是按右端点排序，在第一个尚未被覆盖的区间的右端点放箭，跳过所有包含该点的区间。
- 时间复杂度 O(n log n)，空间 O(1)，不计排序所用的栈空间。
- 边界：空数组返回 0；区间退化为点时一支箭即可覆盖；端点相接算覆盖。
- 与区间调度的区别在判定条件，选点用「左端点大于箭的位置」判断是否需要新箭。

```cpp
int minArrows(std::vector<std::vector<int>>& seg) {
    if (seg.empty()) return 0;
    std::sort(seg.begin(), seg.end(),
              [](const auto& a, const auto& b) { return a[1] < b[1]; });
    int arrows = 1;
    long long pos = seg[0][1];
    for (const auto& s : seg) {
        if (s[0] > pos) { ++arrows; pos = s[1]; }
    }
    return arrows;
}
```

### 16.8（实现）如何用扫描线求最少会议室数量？

- 问题等价于求区间集合的最大重叠数，即任一时刻同时进行的区间数的最大值。
- 事件法把开始与结束都视为事件，按时间排序，同一时刻先处理结束事件。
- 扫描事件，开始时计数加一，结束时计数减一，记录计数过程中出现过的最大值。
- 堆法按开始时间排序，用小顶堆维护各会议室的最早结束时间，堆顶不大于当前开始时间时弹出并复用。
- 两种方法的时间复杂度都是 O(n log n)，空间 O(n)。
- 边界：空输入返回 0；端点相接可以复用同一间会议室，事件排序时结束优先；全部区间互不重叠时答案为 1。
- 同一时刻先加后减会把相接的区间算成重叠，答案偏大。

```cpp
int minRooms(std::vector<std::pair<int, int>> iv) {
    std::vector<std::pair<int, int>> ev;   // (时间, 类型)，0 表示结束，1 表示开始
    for (const auto& p : iv) {
        ev.push_back({p.first, 1});
        ev.push_back({p.second, 0});
    }
    std::sort(ev.begin(), ev.end());
    int cur = 0, best = 0;
    for (const auto& e : ev) {
        cur += (e.second == 1) ? 1 : -1;
        best = std::max(best, cur);
    }
    return best;
}
```

### 16.9 跳跃游戏：如何判断能否到达最后一个下标？

- 维护当前可达的最远下标 `reach`，初值为 0，表示起点可达。
- 遍历下标 i，若 i 大于 `reach`，说明 i 及其后面都不可达，直接返回 false。
- 否则用 `i + nums[i]` 更新 `reach`，遍历结束返回 true。
- 时间复杂度 O(n)，空间 O(1)。
- 边界：数组长度为 1 时起点即终点，返回 true；元素为 0 时无法从该位置继续前进；`i + nums[i]` 可能溢出，用更宽的整数或先比较再相加。
- 终止条件应写 `reach >= n - 1`；写成 `reach >= n` 时，已经到达末尾的输入会被判为失败。

### 16.10（陷阱）跳跃游戏 II 中可达范围何时更新？

- 求最少跳跃次数时按层推进，`end` 记录当前步数能够到达的最远位置，`farthest` 记录下一层能够到达的最远位置。
- 在层内每访问一个下标就更新 `farthest`，到达 `end` 时才结算该层并令步数加一。
- 更新必须在到达 `end` 之前完成，顺序颠倒会漏掉本层末尾位置能到达的范围。
- 步数的初值为 0，第一次跨层时变为 1；若在起点就加一，结果会多算一次。
- 到达 `n - 1` 即可返回，不必处理最后一层，遍历范围通常取到 `n - 2`。
- 把 `end` 与 `farthest` 合并为一个变量，步数与层数会错位。

### 16.11（实现）跳跃游戏 II 的最少跳跃次数如何计算？

- 该问题可视为无权图上的最短路，每一层是当前步数能够到达的下标集合，按层扩展。
- 维护 `steps` 为已用步数，`end` 为当前层边界，`farthest` 为下一层边界。
- 遍历 `0` 到 `n - 2`，每步更新 `farthest`，当 `i == end` 时步数加一并令 `end = farthest`。
- 时间复杂度 O(n)，空间 O(1)。
- 边界：长度为 1 返回 0；题目不保证可达时应先判断最远可达是否覆盖终点，否则返回 -1。
- 遍历到 `n - 1` 会在终点处多加一步。

```cpp
int jump(const std::vector<int>& nums) {
    int n = (int)nums.size();
    if (n < 2) return 0;
    int steps = 0, end = 0, farthest = 0;
    for (int i = 0; i < n - 1; ++i) {
        farthest = std::max(farthest, i + nums[i]);
        if (i == end) { ++steps; end = farthest; }
    }
    return steps;
}
```

### 16.12 分发饼干：如何使满足的孩子最多？

- 将孩子的胃口与饼干尺寸分别升序排序，用双指针从最小值开始匹配。
- 当前饼干能满足当前孩子时，两者同时后移并计数；不能满足时只后移饼干指针，寻找更大的饼干。
- 每个孩子最多得到一块饼干，每块饼干最多给一个孩子，匹配成功后计数加一。
- 时间复杂度 O(m log m + n log n)，由排序决定，匹配部分为 O(m + n)；空间 O(1)。
- 边界：任一数组为空返回 0；胃口为 0 的孩子可被任意饼干满足；尺寸相同的饼干可以分别使用。
- 贪心正确性：把最小的可行饼干留给最容易满足的孩子不会使后续解变差，可用交换论证说明。

### 16.13（实现）分发糖果：相邻评分约束如何满足？

- 每个孩子至少一颗糖，评分高于相邻者必须得到更多糖，左右两个方向的约束彼此独立。
- 从左到右遍历，评分高于左邻时令当前糖果数等于左邻加一，满足左侧约束。
- 从右到左遍历，评分高于右邻时令当前糖果数取自身与右邻加一的较大值，满足右侧约束。
- 两次遍历后每个位置同时满足两侧约束，取最大值不会破坏已满足的一侧。
- 时间复杂度 O(n)，空间 O(n)；按上坡与下坡分段累加可把空间降到 O(1)，但边界处理更易出错。
- 边界：单元素返回 1；评分相等不要求更多；严格递增序列的总和为 n(n+1)/2。
- 只做一次遍历会漏掉一侧约束；第二次遍历直接赋值会覆盖第一次的结果。

```cpp
int candy(const std::vector<int>& r) {
    int n = (int)r.size();
    if (n == 0) return 0;
    std::vector<int> c(n, 1);
    for (int i = 1; i < n; ++i)
        if (r[i] > r[i - 1]) c[i] = c[i - 1] + 1;
    for (int i = n - 2; i >= 0; --i)
        if (r[i] > r[i + 1]) c[i] = std::max(c[i], c[i + 1] + 1);
    int sum = 0;
    for (int v : c) sum += v;
    return sum;
}
```

### 16.14（复杂度）分发糖果为何是 O(n)？

- 两次线性遍历，每次只访问当前元素与相邻元素，总操作数与元素个数成正比。
- 每步只做常数次比较与赋值，取较大值与加法都是 O(1) 操作。
- 空间 O(n) 来自糖果数组；只求总数时可用上坡长度与下坡长度分段累加，把空间降到 O(1)。
- 分段法需要在峰顶同时结算两侧，公式与边界都容易写错，面试中先给出 O(n) 空间版本，再说明优化方向。
- 排序解法为 O(n log n)，对比可以说明本题不需要排序，约束只来自相邻关系。
- 分析复杂度时区分遍历次数与每步代价，两次遍历仍是 O(n)，不构成 O(n²)。

### 16.15 加油站：从哪个加油站出发可以绕行一周？

- 总油量小于总消耗时无解，直接返回 -1。
- 从下标 0 开始累加 `tank += gas[i] - cost[i]`，累加值小于 0 时，从起点到 i 之间任何位置出发都无法到达 i + 1。
- 此时把起点设为 `i + 1`，累加值清零，继续扫描。
- 扫描结束后总油量非负时，最后记录的起点即为答案；题目保证有解时解唯一。
- 时间复杂度 O(n)，空间 O(1)；累加值用更宽的整数类型，避免油量与消耗接近上限时溢出。
- 边界：单站且油量不小于消耗时返回 0；总油量恰好等于总消耗时仍然可行；空输入按题意返回 -1。
- 累加值小于 0 时只清零而不移动起点，答案会落在错误的起点上；漏掉总油量检查则会把无解判为有解。

```cpp
int canCompleteCircuit(const std::vector<int>& gas, const std::vector<int>& cost) {
    long long tank = 0, total = 0;
    int start = 0;
    for (int i = 0; i < (int)gas.size(); ++i) {
        long long d = (long long)gas[i] - cost[i];
        tank += d;
        total += d;
        if (tank < 0) { start = i + 1; tank = 0; }
    }
    return total >= 0 ? start : -1;
}
```

### 16.16（辨析）加油站贪心的正确性依据是什么？

- 若从 i 出发无法到达 j + 1，则 i 到 j 之间任意位置 k 出发也无法到达 j + 1，这一段可以整体跳过。
- 依据是区间内的累计油量在 k 处取到最小值，从 k 出发时剩余油量只会更少，不会更多。
- 该性质保证候选起点互不重叠，扫描一遍即可得到答案，不需要回溯。
- 总油量非负保证最后的缺口能由前面的盈余补偿，起点取最后一次重置的位置。
- 若题目改为允许任意顺序经过加油站或允许多次绕行，模型改变，不能沿用单圈结论。
- 证明时把「无法到达」写成前缀和的最小值位置，比逐段枚举更清晰。

### 16.17 柠檬水找零为何可以用面额贪心？

- 每杯售价 5 美元，顾客只支付 5、10、20 美元，找零只涉及 5 与 10 两种面额。
- 收到 5 美元不需要找零；收到 10 美元找回一张 5 美元；收到 20 美元找回 15 美元。
- 找 15 美元时优先使用一张 10 美元加一张 5 美元，其次使用三张 5 美元。
- 优先消耗 10 美元是因为 5 美元更通用，能同时应对 10 美元与 20 美元两种找零需求。
- 时间复杂度 O(n)，空间 O(1)，只需记录 5 美元与 10 美元的张数。
- 边界：第一位顾客支付 10 或 20 美元时无法找零，直接返回 false；张数不足时同样失败。
- 找 15 美元时若先用三张 5 美元，后续 10 美元顾客会无零可找。

### 16.18 买卖股票的最佳时机 II 为何可以累加正收益？

- 允许同一天卖出后再买入，整段行情可以拆成若干相邻的上涨区间。
- 只要后一天价格高于前一天，就把差值计入收益，相当于在前一天收盘买入、次日收盘卖出。
- 全部正收益之和等于从第一个谷底买入、最后一个峰顶卖出的总收益，中间的回撤被跳过。
- 时间复杂度 O(n)，空间 O(1)。
- 边界：长度为 1 或价格单调不增时收益为 0；相邻两天价格相同不产生收益。
- 该结论依赖「可以无限次交易且无手续费、无税费」，加入手续费或交易次数限制后需要动态规划。

### 16.19 贪心正确性如何用交换论证证明？

- 交换论证的步骤：取一个最优解，找到它与贪心解第一个不同的选择，把最优解中的选择替换为贪心选择。
- 证明替换后仍然可行，这一步用贪心选择的定义，例如右端点最小、单位价值最高。
- 证明替换后目标值不变差，通常利用排序后的单调性或不等式推导。
- 替换后得到的新最优解与贪心解在更多前缀上一致，重复该过程直到两者完全一致。
- 归纳法版本：证明第一步的贪心选择包含在某个最优解中，再对剩余子问题归纳。
- 证明中需要写出「剩余问题的可行域不缩小」这一关键不等式，只写「最优」而不给出推导，不构成证明。

### 16.20（陷阱）0-1 背包为何不能贪心？

- 0-1 背包中物品不可分割，选择单位价值最高的物品可能占满容量并排除更优组合。
- 反例：容量为 10，物品 A 重 6 价值 6，物品 B 与 C 各重 5 价值 4.9；按单位价值先选 A 得到 6，最优为 B 加 C 共 9.8。
- 单位价值排序在分数背包中成立，因为剩余容量总能用分割后的物品填满。
- 0-1 背包需要记录容量维度的状态，用动态规划求解，复杂度 O(nW) 或 O(nV)。
- 贪心可以作为分支定界中的上界估计，不能单独给出最优解。
- 判断能否贪心时先构造「局部最优破坏全局」的反例，比直接套用模板可靠。

---

## 17. 图与搜索

### 17.1 邻接表与邻接矩阵如何选择？

- 邻接矩阵用 V 乘 V 的数组，判断两点是否相邻为 O(1)，空间 O(V²)，适合稠密图与频繁查边的场景。
- 邻接表为每个顶点保存出边列表，空间 O(V+E)，遍历某点的邻居代价与该点度数成正比，适合稀疏图。
- 稀疏图的边数远小于 V²，邻接矩阵的大部分空间未被使用，按行扫描时缓存利用率也低。
- 邻接表删除边需要线性查找，边操作频繁时可用哈希集合或排序后的边表加速。
- 带权图在邻接表中存终点的同时存权值，在矩阵中用无穷表示无边，并注意无穷与合法权值的区分。
- 需要同时枚举入边时额外维护反向邻接表，拓扑排序与 Bellman-Ford 常用这种做法。
- 顶点编号不连续时先用哈希表映射到 0 至 V-1，避免为少量顶点开辟大数组。

### 17.2（辨析）BFS 与 DFS 的复杂度与适用场景有何不同？

- 两种遍历都访问每个顶点与每条边一次，邻接表下为 O(V+E)，邻接矩阵下为 O(V²)。
- BFS 按层扩展，第一次到达某点时经过的边数最少，适用于无权图最短路径与层次遍历。
- DFS 沿路径深入，适合判断连通性、找环、求拓扑序、求强连通分量以及回溯枚举。
- BFS 的空间由队列的最大宽度决定，宽图上可能接近 V；DFS 的空间由递归深度决定，深链上也可能达到 V。
- 需要重建路径时记录父节点，只记录距离无法还原具体走法。
- 图不连通时需要对每个未访问顶点重新发起遍历，单次遍历只覆盖一个连通分量。

### 17.3（实现）BFS 如何记录最短步数？

- 距离数组初始化为 -1，起点置 0，入队时同步写入，出队时不再修改。
- 需要按层输出时记录队列当前长度，整层出队后步数加一，避免为每个节点单独记层号。
- 多源 BFS 把全部源点距离置 0 并一起入队，得到的结果是到最近源点的距离。
- 边权全为 1 时 BFS 给出最短路；边权不全相同时需要 Dijkstra 或 0-1 BFS。
- 边界：起点即终点返回 0；不可达返回 -1；自环与重边不影响结果，但要避免重复入队。
- 队列只存顶点编号即可，边权为 1 时距离由数组给出，不必随队元素一起存。

```cpp
int bfs(const std::vector<std::vector<int>>& g, int s, int t) {
    std::vector<int> dist(g.size(), -1);
    std::queue<int> q;
    dist[s] = 0;
    q.push(s);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        if (u == t) return dist[u];
        for (int v : g[u]) {
            if (dist[v] != -1) continue;
            dist[v] = dist[u] + 1;
            q.push(v);
        }
    }
    return -1;
}
```

### 17.4（陷阱）BFS 为何要在入队时标记访问？

- 若在出队时标记，同一顶点可能被多个邻居重复入队，队列规模膨胀，复杂度可能退化。
- 入队即标记保证每个顶点最多入队一次，队列长度不超过 V。
- 多源 BFS 中全部源点必须在开始前标记完毕，否则后处理的源点会把已确定的距离改大。
- 需要更新更短距离的变体（例如 0-1 BFS）不适用「入队即标记」，改为按距离比较决定是否入队。
- 统计路径条数时不能简单去重，需要按层累加，且要处理同一层内的多条入边。
- 标记数组与距离数组合并可以省一次判断，但语义要在注释中写清。

### 17.5 DFS 递归深度过大如何处理？

- 链状图深度可达 V，递归调用可能耗尽线程栈，V 较大时需要显式栈或调整栈大小。
- 显式栈保存「顶点与下一个待访问邻居的下标」，模拟递归的当前位置，避免重复扫描邻居。
- 只判断连通性时可以用并查集替代 DFS，绕开深度问题。
- C++ 不保证尾递归被优化，不能依赖编译器消除栈增长。
- 递归深度与图结构有关，最坏为 V，复杂度分析与测试都要按最坏情况估计。
- 显式栈的空间同样为 O(V)，与递归版本同阶，但不受线程栈上限约束。

### 17.6（实现）拓扑排序的 Kahn 算法如何实现？

- 统计每个顶点的入度，把全部入度为 0 的顶点入队。
- 每次取出一个顶点加入结果序列，把它所有出边终点的入度减一，减到 0 时入队。
- 结果序列长度等于顶点数说明图无环，否则存在环。
- 时间复杂度 O(V+E)，空间 O(V+E) 存图，队列与入度数组为 O(V)。
- 同时存在多个入度为 0 的顶点时顺序任意，队列与栈给出不同的合法序列。
- 边界：空图返回空序列；自环使该顶点入度永不为 0，直接判定有环。

```cpp
std::vector<int> topo(const std::vector<std::vector<int>>& g) {
    int n = (int)g.size();
    std::vector<int> deg(n, 0), order;
    for (int u = 0; u < n; ++u)
        for (int v : g[u]) ++deg[v];
    std::queue<int> q;
    for (int u = 0; u < n; ++u)
        if (deg[u] == 0) q.push(u);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        for (int v : g[u])
            if (--deg[v] == 0) q.push(v);
    }
    if ((int)order.size() != n) return {};   // 有环
    return order;
}
```

### 17.7 拓扑排序如何用 DFS 后序求得？

- 对每个未访问顶点做 DFS，在它的全部出边处理完之后把顶点加入序列。
- 得到的是后序序列，反转后即为拓扑序，因为出边终点总是先于起点完成。
- 用三色标记区分未访问、访问中、已完成，遇到「访问中」的顶点说明存在环。
- 时间复杂度 O(V+E)，空间 O(V)，递归深度最坏为 V。
- 该版本按依赖深度排列，天然给出逆后序，适合需要后序信息的场景，例如求 DAG 上的最长路径。
- 与 Kahn 算法相比，检测到环时只能报告存在环，较难直接给出环上的顶点。

### 17.8（辨析）拓扑排序的两种实现如何取舍？

- Kahn 算法基于入度逐层剥离，天然给出层次信息，便于按批处理与并行。
- DFS 版本基于出边完成顺序，代码更短，但递归深度受线程栈限制。
- 需要按字典序输出最小序列时，Kahn 算法把队列换成小顶堆即可。
- 需要枚举全部合法序列或计数时，两种方法都要改造成回溯搜索。
- 大图上 Kahn 算法没有递归风险，工程实现更常用。
- 两种方法都只能处理有向无环图，无向图的定向需要另行约定。

### 17.9 如何判断有向图中是否存在环？

- Kahn 算法结束后若输出顶点数少于 V，剩余顶点构成环或依赖环。
- DFS 三色标记遇到「访问中」的顶点即为环，配合调用栈可以还原环上的顶点。
- 并查集只能判断无向图的环，用于有向图会漏判。
- 自环是最简单的环，入度统计与 DFS 都能直接发现。
- 只需要布尔结果时 Kahn 算法不需要额外状态；需要输出环时 DFS 更直接。
- 复杂度的下界是 O(V+E)，必须至少检查每条边一次。

### 17.10 无向图的连通分量如何统计？

- 对每个未访问顶点发起一次 DFS 或 BFS，每次遍历覆盖一个连通分量，计数加一。
- 也可以对每条边的两个端点做并查集合并，最后统计不同根的数量。
- 邻接表下复杂度 O(V+E)；并查集版本为 O((V+E) α(V))。
- 边界：孤立点自身构成一个分量；空图返回 0；自环不改变分量数量。
- 需要分量编号时在遍历中给每个顶点写入编号，而不只是计数。
- 有向图的强连通分量需要 Tarjan 或 Kosaraju，不能直接套用无向图的做法。

### 17.11（实现）岛屿数量：如何统计网格中的连通块？

- 把网格看作图，陆地格子是顶点，上下左右相邻的陆地之间有边，岛屿数量等于连通分量数。
- 从每个未访问的陆地出发做 DFS，把访问过的陆地改为 `'0'`，省略额外的访问数组。
- 遍历整个网格，遇到 `'1'` 时计数加一并发起一次遍历。
- 时间复杂度 O(mn)，每个格子最多访问一次；空间为递归深度，最坏为 O(mn)。
- 边界：空网格返回 0；全为水返回 0；只有斜向相接不算连通。
- 原地修改会破坏输入，后续还要使用输入时应复制一份或改用访问数组。

```cpp
void sink(std::vector<std::vector<char>>& g, int i, int j) {
    if (i < 0 || i >= (int)g.size() || j < 0 || j >= (int)g[0].size()) return;
    if (g[i][j] != '1') return;
    g[i][j] = '0';
    sink(g, i + 1, j);
    sink(g, i - 1, j);
    sink(g, i, j + 1);
    sink(g, i, j - 1);
}
int numIslands(std::vector<std::vector<char>> g) {
    if (g.empty() || g[0].empty()) return 0;
    int cnt = 0;
    for (int i = 0; i < (int)g.size(); ++i)
        for (int j = 0; j < (int)g[0].size(); ++j)
            if (g[i][j] == '1') { ++cnt; sink(g, i, j); }
    return cnt;
}
```

### 17.12 岛屿的最大面积如何求？

- 与岛屿数量同一框架，遍历时返回当前连通块的面积，全局取最大值。
- DFS 返回 1 加上四个方向的面积之和，进入时把格子置 0 表示已访问。
- 也可以用 BFS 计数，避免深递归；网格边长达到 1000 时递归深度可能达到百万级。
- 时间复杂度 O(mn)，空间 O(mn) 最坏，来自递归或队列。
- 边界：全为水返回 0；单个陆地格返回 1。
- 进入时若只判断越界、不判断是否为陆地，会重复计数，也可能越界访问。

### 17.13（陷阱）网格 DFS 的边界与标记顺序容易错在哪里？

- 越界判断必须放在访问 `g[i][j]` 之前，短路求值的顺序要与下标使用顺序一致。
- 先标记后递归可以避免同一格被重复访问；先递归后标记在环状路径上会重复展开。
- 网格为空或首行为空时 `g[0].size()` 会越界，入口处先判空。
- 行列顺序写反在方阵上不会报错，测试需要用非方阵输入。
- 递归深度等于连通块最长路径，蛇形网格上接近格子总数。
- 参数用值传递 `std::vector<std::vector<char>>` 会付出 O(mn) 的复制成本；需要保留输入时这是有意为之，否则应传引用。

### 17.14（辨析）岛屿问题用 BFS、DFS 还是并查集？

- DFS 代码最短，适合面试手写，代价是递归深度受网格规模限制。
- BFS 用队列显式扩展，深度不受栈限制，但队列可能同时存放较多格子。
- 并查集把相邻陆地合并，适合需要动态加入陆地或反复查询连通性的场景。
- 静态网格上并查集的常数大于 DFS，且需要额外的父数组。
- 需要随操作变化维护岛屿数量时，并查集可以在合并时同步维护计数。
- 三种方法复杂度同阶，选择依据是深度限制与是否需要动态更新。

### 17.15 被围绕的区域：如何标记不被围绕的陆地？

- 与边界相连的 `'O'` 不会被围绕，先从四条边界上的 `'O'` 出发遍历，标记为临时字符。
- 遍历结束后，剩余的 `'O'` 改为 `'X'`，临时字符恢复为 `'O'`。
- 从边界反向标记的好处是不必逐个区域判断是否封闭，只做一次连通性扩展。
- 时间复杂度 O(mn)，空间为递归深度或队列长度。
- 边界：网格小于 3 乘 3 时内部不存在封闭区域，可以直接返回。
- 只从四个角出发会遗漏边界中段的入口，需要遍历整条边界。

### 17.16（实现）克隆图：如何复制一个连通的无向图？

- 用哈希表记录原节点到新节点的映射，遍历时先创建新节点再处理邻居。
- DFS 版本进入节点时创建副本并写入映射，递归处理每个邻居，映射命中时直接返回。
- BFS 版本用队列扩展，出队时遍历邻居，未创建的邻居创建后入队。
- 节点值可能重复，映射的键必须是节点指针，不能只用值。
- 时间复杂度 O(V+E)，空间 O(V)。
- 边界：空指针返回空；自环与重边要保留；图不连通时对每个未访问节点发起遍历。

```cpp
struct Node {
    int val;
    std::vector<Node*> neighbors;
};
Node* clone(Node* u, std::unordered_map<Node*, Node*>& seen) {
    if (!u) return nullptr;
    auto it = seen.find(u);
    if (it != seen.end()) return it->second;
    Node* copy = new Node{u->val, {}};
    seen[u] = copy;
    for (Node* v : u->neighbors) copy->neighbors.push_back(clone(v, seen));
    return copy;
}
```

### 17.17 二分图判定：染色法如何实现？

- 用两种颜色给顶点染色，相邻顶点颜色必须不同，出现冲突则不是二分图。
- 从每个未染色顶点出发做 BFS 或 DFS，起点染 0，邻居染相反颜色。
- 图不连通时需要对每个分量分别染色，任一分量冲突即返回 false。
- 时间复杂度 O(V+E)，空间 O(V)。
- 边界：单顶点与空图都是二分图；自环使顶点与自己相邻，直接判定不是二分图。
- 二分图等价于图中不存在奇数长度的环，染色冲突正是奇环的表现。

### 17.18 课程表：能否完成全部课程？

- 课程与先修关系构成有向图，能完成全部课程等价于图无环。
- 用 Kahn 算法统计入度并逐层剥离，输出顶点数等于课程数时返回 true。
- 也可以用 DFS 三色标记检测环，遇到「访问中」的顶点返回 false。
- 时间复杂度 O(V+E)，空间 O(V+E) 存图。
- 边界：没有先修关系时全部可完成；先修关系自相矛盾时返回 false。
- 输入中的重复边会同时增加入度与后续的减操作，结果仍正确，去重可以减少常数。

### 17.19（实现）多源 BFS：腐烂的橘子如何计算时间？

- 全部腐烂橘子作为源点同时入队，距离为 0，代表同一时刻开始扩散。
- 每出队一个格子，把相邻的新鲜橘子改为腐烂并入队，扩散时间等于层数。
- 统计新鲜橘子数量，扩散结束后仍有剩余则返回 -1。
- 时间等于 BFS 的最大层数，可用按层计数得到，不必单独维护距离数组。
- 时间复杂度 O(mn)，空间 O(mn)。
- 边界：没有新鲜橘子返回 0；没有腐烂橘子且有新鲜橘子返回 -1。

```cpp
int orangesRotting(std::vector<std::vector<int>>& g) {
    int m = (int)g.size(), n = (int)g[0].size();
    int fresh = 0, t = 0;
    std::queue<std::pair<int, int>> q;
    for (int i = 0; i < m; ++i)
        for (int j = 0; j < n; ++j) {
            if (g[i][j] == 2) q.push({i, j});
            else if (g[i][j] == 1) ++fresh;
        }
    const int d[5] = {0, 1, 0, -1, 0};
    while (!q.empty() && fresh > 0) {
        ++t;
        for (int k = (int)q.size(); k > 0; --k) {
            auto p = q.front(); q.pop();
            for (int dir = 0; dir < 4; ++dir) {
                int x = p.first + d[dir], y = p.second + d[dir + 1];
                if (x < 0 || x >= m || y < 0 || y >= n || g[x][y] != 1) continue;
                g[x][y] = 2;
                --fresh;
                q.push({x, y});
            }
        }
    }
    return fresh == 0 ? t : -1;
}
```

### 17.20（陷阱）网格搜索中原地修改有哪些副作用？

- 原地把陆地改为水会破坏输入，调用方之后无法复用网格。
- 需要保留输入时先复制一份网格，复制成本为 O(mn)。
- 原地标记的值要与合法值区分，例如用 `'2'` 表示已访问，恢复时再写回原值。
- 同一函数被调用两次时，若第一次已经改写网格，第二次的结果会变为 0。
- 需要同时求多个指标（数量、面积、周长）时在一次遍历内累计，避免反复修改。
- 并发或多线程环境下共享网格的原地修改存在数据竞争。

---

## 18. 最短路径与最小生成树

### 18.1 最短路径算法如何按图的特征选择？

- 无权图用 BFS，复杂度 O(V+E)，第一次到达某点时的层数即为最短距离。
- 非负权图用 Dijkstra，复杂度取决于优先队列实现，常用 O((V+E) log V)。
- 含负权边但无负环的图用 Bellman-Ford，复杂度 O(VE)；队列优化版本最坏仍为 O(VE)。
- 全源最短路且顶点数不大时用 Floyd-Warshall，复杂度 O(V³)。
- 需要判断负环时用 Bellman-Ford 的第 V 轮松弛。
- 图是有向无环图时可以按拓扑序做一次松弛，复杂度 O(V+E)，允许负权边。

| 图与需求 | 算法 | 复杂度 |
| --- | --- | --- |
| 无权图单源 | BFS | O(V+E) |
| 非负权单源 | Dijkstra | O((V+E) log V) |
| 含负权单源 | Bellman-Ford | O(VE) |
| 全源最短路 | Floyd-Warshall | O(V³) |
| 有向无环图单源 | 拓扑序松弛 | O(V+E) |

### 18.2 Dijkstra 的贪心依据是什么？

- 每次从未确定的顶点中取出距离最小者，断言它的最短距离已经确定。
- 依据是边权非负：任何经过未确定顶点的路径，长度都不会小于当前的最小距离。
- 确定一个顶点后用它松弛出边，更新邻居的暂定距离。
- 该论证依赖非负权，负权边会让绕路更短，贪心前提失效。
- 距离相同的顶点处理顺序任意，结果不受影响。
- 只需求单对最短路径时，可以在终点被确定时提前结束。

### 18.3（实现）Dijkstra 的优先队列实现怎么写？

- 用 `priority_queue` 存距离与顶点，按距离取最小；`std::priority_queue` 默认是大顶堆，需要传 `std::greater` 或存负距离。
- 距离数组初始化为无穷，起点为 0 并入堆。
- 每次弹出堆顶，若其距离大于当前记录值则跳过，该条目已经过期。
- 对每条出边尝试松弛，成功则更新距离并压入新条目。
- 时间复杂度 O((V+E) log V)，空间 O(V+E)。
- 省略过期判断时同一顶点被多次展开，常数显著增大。

```cpp
std::vector<long long> dijkstra(const std::vector<std::vector<std::pair<int, int>>>& g, int s) {
    const long long INF = std::numeric_limits<long long>::max() / 4;
    std::vector<long long> dist(g.size(), INF);
    using P = std::pair<long long, int>;
    std::priority_queue<P, std::vector<P>, std::greater<P>> pq;
    dist[s] = 0;
    pq.push({0, s});
    while (!pq.empty()) {
        auto top = pq.top();
        pq.pop();
        long long d = top.first;
        int u = top.second;
        if (d > dist[u]) continue;              // 过期条目
        for (const auto& e : g[u]) {
            int v = e.first, w = e.second;
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}
```

### 18.4（陷阱）Dijkstra 为何不能处理负权边？

- 负权边使已确定的顶点仍可能被更短的路径更新，出堆即确定的性质被破坏。
- 反例：A 到 B 权 2，A 到 C 权 5，C 到 B 权 -4；Dijkstra 先确定 B 的距离为 2，实际最短为 1。
- 存在负权边时可以用 Bellman-Ford，或先用 Johnson 算法重赋权再跑 Dijkstra。
- 存在负权环时最短路径没有定义，需要在算法中显式检测。
- 判断依据是边权而非顶点数，稀疏图上的负权边同样会使结论失效。
- 有些实现遇到负权边直接跳过，会静默返回错误结果，接口应说明输入约束。

### 18.5 Dijkstra 中的过期条目如何处理？

- 同一顶点可能因多次松弛被压入多个条目，弹出时距离大于记录值即为过期。
- 过期条目直接跳过，不展开其出边，避免重复工作。
- 另一种写法是用 `visited` 数组跳过已确定的顶点，效果相同。
- 过期条目的数量不超过松弛成功次数，上界为 O(E)，不影响复杂度的量级。
- 记录前驱时只在松弛成功时更新，过期条目不会污染路径。
- 用堆顶距离直接覆盖数组，后到的较大值会把较小值改掉。

### 18.6（复杂度）Dijkstra 的复杂度由什么决定？

- 朴素实现每次线性扫描找最小距离，复杂度 O(V²)，适合稠密图。
- 二叉堆实现为 O((V+E) log V)，稀疏图上明显优于朴素版本。
- 斐波那契堆把减小键操作降到摊还 O(1)，总复杂度 O(E + V log V)，常数较大，工程中少用。
- 边权只取 0 与 1 时可以用 0-1 BFS，双端队列实现 O(V+E)。
- 边权为小整数时可以用分桶队列，复杂度与最大权值有关。
- 复杂度中的对数来自堆操作次数，压入次数由边数决定。

### 18.7 Bellman-Ford 的松弛次数为何是 V-1？

- 最短路径最多含 V-1 条边，不含负环时路径不会重复顶点。
- 第 k 轮松弛后，边数不超过 k 的最短路径都已确定。
- 经过 V-1 轮后全部最短路径都已确定，再进行一轮若能松弛则说明存在负环。
- 每轮遍历全部边，复杂度 O(VE)。
- 某一轮没有发生任何松弛时可以提前退出。
- 边界：起点到自身的距离为 0；不可达顶点保持无穷，松弛时先判断起点距离是否为无穷再相加。

### 18.8（实现）Bellman-Ford 如何提前退出？

- 每轮开始时把「是否更新」标志置 false，任何一次松弛成功都置 true。
- 一轮结束仍为 false 时跳出循环，剩余轮次不必执行。
- 提前退出不改变结果，只减少常数，最坏复杂度仍为 O(VE)。
- 边集用结构体数组存起点、终点与权值，避免邻接表的遍历开销。
- 距离用足够宽的整数，松弛时判断起点距离是否为无穷，防止相加溢出。
- 提前退出后若直接用当前轮数判断负环会漏检，负环检测必须单独再遍历一次全部边。

```cpp
struct Edge { int u, v; long long w; };
bool bellman(int n, const std::vector<Edge>& es, int s, std::vector<long long>& dist) {
    const long long INF = std::numeric_limits<long long>::max() / 4;
    dist.assign(n, INF);
    dist[s] = 0;
    for (int k = 0; k < n - 1; ++k) {
        bool changed = false;
        for (const Edge& e : es) {
            if (dist[e.u] == INF) continue;
            if (dist[e.u] + e.w < dist[e.v]) {
                dist[e.v] = dist[e.u] + e.w;
                changed = true;
            }
        }
        if (!changed) break;
    }
    for (const Edge& e : es) {                  // 第 V 轮检测负环
        if (dist[e.u] != INF && dist[e.u] + e.w < dist[e.v]) return false;
    }
    return true;
}
```

### 18.9 负环检测：第 V 轮仍能松弛说明什么？

- 若第 V 轮仍能松弛某条边，说明存在一条边数不少于 V 的最短路径，必然含环。
- 该环的总权为负，否则去掉环会得到更短的路径，与松弛成功矛盾。
- 检测只需再遍历一次全部边，复杂度增加 O(E)。
- 需要输出环上顶点时记录每个顶点的前驱，从被松弛的顶点沿前驱走 V 步必落在环上。
- 从全部顶点出发的版本要把初始距离全部置 0，才能检测不连通分量中的负环。
- 负环存在时最短路径没有定义，返回值应表示无解，不能返回某个有限值。

### 18.10 SPFA 的思想与最坏复杂度是什么？

- 用队列保存距离被更新的顶点，只对这些顶点的出边做松弛，减少无效遍历。
- 顶点入队前检查是否已在队列中，避免重复入队。
- 记录每个顶点的入队次数，超过 V 次说明存在负环。
- 平均表现优于 Bellman-Ford，最坏复杂度仍为 O(VE)，构造性数据可以使其退化。
- 队列换成栈或双端队列会改变遍历顺序，不影响正确性，但影响实际耗时。
- 数据可控时可以用 SPFA，要求最坏复杂度保证时应选 Bellman-Ford 或其他算法。

### 18.11 Floyd-Warshall 的状态定义与循环顺序是什么？

- 状态 `d[k][i][j]` 表示只允许经过前 k 个顶点作为中间点时，i 到 j 的最短距离。
- 转移为 `d[k][i][j] = min(d[k-1][i][j], d[k-1][i][k] + d[k-1][k][j])`。
- 第一维可以滚动掉，得到原地更新的二维数组，但中间点 k 必须位于最外层。
- 初始化：`d[i][i] = 0`，有边时取最小的边权，无边为无穷。
- 复杂度 O(V³)，空间 O(V²)。
- 允许负权边，存在负环时结果无意义，可以检查 `d[i][i] < 0` 判断。

### 18.12（陷阱）Floyd 的中间点循环为何必须在最外层？

- 状态定义要求第 k 层只使用前 k 个顶点作为中间点，k 在外层才能保证依赖的上一层已经算完。
- 若把 i 或 j 放在外层，`d[i][k]` 与 `d[k][j]` 可能被当前层的更新污染，转移不再成立。
- 原地更新时 `d[i][k]` 与 `d[k][j]` 在第 k 层不会改变，因为经过 k 的路径不会更短，这一点以无负环为前提。
- 存在负环时上述性质不成立，结果不可靠。
- 循环顺序错误在小规模测试上可能仍然得到正确结果，需要构造多跳路径验证。
- 需要重建路径时另存 `next[i][j]`，在松弛成功时更新。

### 18.13 Floyd 如何重建路径？

- 维护 `next[i][j]` 表示从 i 到 j 的最短路径上 i 的下一个顶点，有边时初始为 j。
- 松弛成功时令 `next[i][j] = next[i][k]`，沿路径逐步前进。
- 输出时从 i 开始反复取 `next` 直到到达 j，步数上限为 V。
- 也可以维护前驱 `pre[i][j]`，方向相反，两种表示选一即可。
- 不存在路径时 `next` 保持哨兵值，输出前先判断距离是否为无穷。
- 负环会使路径无限绕行，重建前先检测 `d[i][i] < 0`。

### 18.14（辨析）Floyd 与多次 Dijkstra 如何取舍？

- Floyd 一次求出全源最短路，复杂度 O(V³)，实现短，适合顶点数在数百量级。
- 对每个顶点各跑一次 Dijkstra，稀疏图上总复杂度 O(V(V+E) log V)，通常快于 O(V³)。
- Floyd 允许负权边（无负环），Dijkstra 不允许。
- 需要任意两点间的路径条数或可达性时，Floyd 的框架更容易扩展。
- 图是静态的且查询次数多时，预先算好全源结果更划算。
- 顶点数达到数千时 O(V²) 的空间先成为瓶颈，应改为按需计算。

### 18.15（辨析）Prim 与 Kruskal 如何选择？

- Prim 从任意顶点出发，每次加入连接树内与树外顶点的最小边，适合稠密图，复杂度 O(V²) 或 O(E log V)。
- Kruskal 按边权升序选边，用并查集判断是否成环，适合稀疏图，复杂度 O(E log E)。
- 两者都基于割性质：跨越任意割的最小边必属于某棵最小生成树。
- 图不连通时得到的是最小生成森林，需要按分量分别处理或报告不连通。
- 边权相同时生成树可能不唯一，但总权值唯一。
- 需要输出边集时 Kruskal 更直接，需要在线扩展时 Prim 更自然。

| 维度 | Prim | Kruskal |
| --- | --- | --- |
| 适用图 | 稠密图 | 稀疏图 |
| 复杂度 | O(V²) 或 O(E log V) | O(E log E) |
| 核心结构 | 距离数组与堆 | 边表与并查集 |
| 输出形式 | 逐步扩展顶点 | 一次选出边集 |

### 18.16（实现）Kruskal 的实现要点有哪些？

- 把边存为起点、终点与权值，按权值升序排序。
- 依次取边，两端不在同一集合时合并并累计权值，否则跳过。
- 选够 V-1 条边即可停止，剩余边不必处理。
- 并查集使用路径压缩，单次 `find` 的摊还为 O(log n)，再加按秩合并可达到 O(α(n))。
- 时间复杂度 O(E log E)，由排序决定；空间 O(V+E)。
- 边界：空图或单顶点返回 0；不连通时返回森林权值或标记失败；重边只保留最小者。

```cpp
struct Edge { int u, v, w; };
int kruskal(int n, std::vector<Edge> es) {
    std::sort(es.begin(), es.end(),
              [](const Edge& a, const Edge& b) { return a.w < b.w; });
    std::vector<int> p(n);
    for (int i = 0; i < n; ++i) p[i] = i;
    std::function<int(int)> find = [&](int x) {
        return p[x] == x ? x : p[x] = find(p[x]);
    };
    int total = 0, used = 0;
    for (const Edge& e : es) {
        int a = find(e.u), b = find(e.v);
        if (a == b) continue;
        p[a] = b;
        total += e.w;
        if (++used == n - 1) break;
    }
    return used == n - 1 ? total : -1;
}
```

### 18.17（实现）Prim 的堆实现要点有哪些？

- 维护 `dist[v]` 表示 v 到当前树的最小边权，起点为 0，其余为无穷。
- 每次取出 `dist` 最小的未加入顶点，加入树并用它的出边更新邻居的 `dist`。
- 松弛条件为单条边权小于 `dist[v]`，与 Dijkstra 的路径累加不同。
- 用 `visited` 标记已加入的顶点，过期条目弹出时跳过。
- 复杂度 O(E log V)，空间 O(V+E)。
- 照搬 Dijkstra 写成累加距离，得到的是最短路径树，与最小生成树不同。

### 18.18（辨析）最小生成树是否唯一？

- 所有边权互不相同时，最小生成树唯一。
- 存在相同权值的边时，可能有多棵总权相同的最小生成树。
- 判定方法：对每条非树边，若它与树路径上的最大边权相等，则替换后得到另一棵最小生成树。
- 总权值在等权边存在时仍然唯一，这是割性质与环性质的直接推论。
- 题目要求输出任意一棵时不必去重，要求计数时需要枚举等权边的组合。
- 边权为浮点数时比较需要容差，唯一性判定会变得不稳定。

### 18.19（陷阱）最小生成树与最短路径树有何区别？

- 最小生成树最小化全部边权之和，最短路径树最小化根到各顶点的路径长度。
- 同一张图上两者可能不同，最小生成树中的路径不保证是最短路径。
- Prim 与 Dijkstra 的结构相似，差别在于松弛时累加路径还是取单条边权。
- 最短路径树依赖根的选择，最小生成树与根无关。
- 需要保证任意两点间路径的最大边权最小时，应求最小瓶颈生成树。
- 最小生成树的一个性质是任意两点间路径的最大边权最小，这正是最小瓶颈生成树的等价形式。

### 18.20 稠密图、稀疏图与不连通图有哪些边界情况？

- 顶点数约 1000、边数接近 V² 时优先邻接矩阵与 O(V²) 的 Prim。
- 边数接近 V 时优先邻接表与 Kruskal。
- 不连通图的单源最短路只覆盖起点所在分量，其余距离保持无穷。
- 不连通图不存在最小生成树，只能得到最小生成森林。
- 自环对非负权最短路没有影响，也不会进入最小生成树。
- 重边只保留最小权，Floyd 初始化时也要取最小值，不能按读入顺序直接赋值。

---

## 19. 并查集、Trie 与跳表

### 19.1 并查集的基本结构与两个优化是什么？

- 用父指针数组表示森林，每个集合的根节点指向自身，`find` 沿父指针上溯到根。
- `union` 把一棵树的根指向另一棵树的根，从而合并两个集合。
- 路径压缩在 `find` 过程中把路径上的节点直接挂到根上，降低后续查询深度。
- 按秩合并把较矮的树挂到较高的树下，控制树高。
- 两种优化同时使用时，单次操作的摊还复杂度为 O(α(n))，α 为反阿克曼函数，实际取值不超过 4。
- 只使用其中一种优化时，单次操作在最坏情况下为 O(log n) 量级。

### 19.2（实现）路径压缩的递归与迭代版本如何编写？

- 递归写法让 `find(x)` 返回 `p[x] = find(p[x])`，回溯时把路径上的节点指向根。
- 迭代写法先找到根，再沿路径二次遍历把每个节点指向根，避免递归深度。
- 迭代写法可以在压缩时把路径分成两半，进一步缩短后续查询路径。
- 递归深度等于当前树高，未压缩时最坏为 n，深链上可能栈溢出。
- 压缩只改变树的形状，不改变集合划分，秩的信息仍然有效。
- 递归写法不保证尾调用优化，编译器不一定消除栈帧。

```cpp
int p[100005];
int find(int x) {                     // 递归版本，路径压缩
    return p[x] == x ? x : p[x] = find(p[x]);
}
int findIter(int x) {                 // 迭代版本，两遍扫描
    int r = x;
    while (p[r] != r) r = p[r];
    while (p[x] != r) {
        int nxt = p[x];
        p[x] = r;
        x = nxt;
    }
    return r;
}
```

### 19.3（辨析）按秩合并与按大小合并如何取舍？

- 按秩合并记录树高的上界，秩小的根挂到秩大的根下，秩相等时合并后加一。
- 按大小合并记录集合元素个数，小集合挂到大集合下，只需要一个数组。
- 两者都能把树高控制在 O(log n)，与路径压缩配合后复杂度同阶。
- 需要查询集合大小时按大小合并更直接，秩无法从数组直接得到元素个数。
- 路径压缩会降低实际树高，秩只是上界，不需要因压缩而更新。
- 合并方向不影响正确性，只影响后续查询的代价。

### 19.4（复杂度）并查集的摊还复杂度如何分析？

- 只用路径压缩时，m 次操作的摊还复杂度为 O(m log n)。
- 只用按秩合并时，单次 `find` 为 O(log n)，因为树高不超过 log n。
- 两者结合时摊还复杂度为 O(m α(n))，α 是增长极慢的反阿克曼函数。
- 该结果是摊还界，单次操作最坏仍可能达到 O(log n)。
- 分析依赖压缩后树高下降的势能论证，不能把单次代价直接乘以操作次数。
- 实际使用中 α(n) 不超过 4，可以视为常数。

### 19.5 并查集如何判断无向图中的环？

- 逐条处理边，若两个端点已属于同一集合，加入该边会形成环。
- 否则合并两个集合，继续处理下一条边。
- 无向图中自环立即构成环，重边中的第二条也构成环。
- 时间复杂度 O(E α(V))，空间 O(V)。
- 只能判断无向图的环，有向图需要在 DFS 中区分「访问中」与「已完成」。
- 需要输出环上的顶点时，并查集不保留路径信息，只能报告存在环。

### 19.6 并查集在 Kruskal 中的作用是什么？

- 维护已选边构成的连通分量，判断新边的两个端点是否已经连通。
- 已连通说明加入会成环，跳过该边；否则合并并累计总权。
- 每条边至多两次 `find` 与一次合并，总代价 O(E α(V))。
- 选够 V-1 条边时停止，剩余边不必继续遍历。
- 并查集只负责连通性，边权的排序由外部完成。
- 图不连通时最终集合数大于 1，说明得到的是森林。

### 19.7（陷阱）路径压缩后 rank 还能用吗？

- rank 记录的是未压缩时树高的上界，压缩后实际高度变小，rank 仍是合法上界。
- 合并时按 rank 比较仍然正确，上界关系没有被破坏。
- 不能把 rank 当作集合元素个数使用，两者含义不同。
- rank 相等的两棵树合并后 rank 加一，这是唯一需要更新的情形。
- 改为按大小合并时，大小数组在每次合并后必须准确累加，不能只更新根。
- 混用两种策略时，合并方向与更新规则必须保持一致。

### 19.8 带权并查集如何维护节点到根的关系？

- 在父指针之外维护 `w[x]` 表示 x 到父节点的权值，`find` 时沿路径累加到根。
- 路径压缩需要把路径上的权值累加后再赋值，否则中间关系丢失。
- 合并时根据已知关系反推出两个根之间的权值，再建立连接。
- 典型问题是变量之间的倍数关系：已知 a 与 b 的比值、b 与 c 的比值，求 a 与 c 的比值。
- 冲突检测时比较推导出的权值与已记录的值是否一致。
- 权值类型要与题目量级匹配，链式乘法可能溢出，需要更宽的整数类型。

### 19.9（实现）Trie 的节点结构如何设计？

- 每个节点保存指向子节点的指针，以及一个标记表示是否为某个单词的结尾。
- 字符集固定且较小时用定长数组，访问为 O(1)，空间为节点数乘以字符集大小。
- 字符集较大或稀疏时用哈希表保存子节点，节省空间但常数更大。
- 需要统计前缀出现次数时在节点上增加计数，插入路径上逐节点累加。
- 根节点不代表任何字符，所有单词从根的子节点开始。
- 节点总数的上界为全部单词长度之和加一，可以预先估算内存。

```cpp
struct TrieNode {
    TrieNode* next[26] = {};
    int pass = 0;      // 经过该节点的单词数
    int end = 0;       // 以该节点结尾的单词数
};
void insert(TrieNode* root, const std::string& s) {
    TrieNode* p = root;
    for (char ch : s) {
        int c = ch - 'a';
        if (!p->next[c]) p->next[c] = new TrieNode();
        p = p->next[c];
        ++p->pass;
    }
    ++p->end;
}
```

### 19.10 Trie 如何支持前缀查询与通配符匹配？

- 前缀查询沿字符逐层下降，路径存在即说明存在该前缀，返回节点上的计数。
- 通配符 `.` 匹配任意字符时需要遍历当前节点的全部子节点，复杂度与分支数相关。
- 匹配函数写成递归，参数为当前节点与模式串下标，到达模式末尾时检查 `end` 标记。
- 最坏复杂度为 26 的 m 次方，m 为通配符个数，实际代价受节点数限制。
- 可以用记忆化避免同一组节点与下标被重复计算，但状态数可能很大。
- 边界：空模式串匹配根节点；模式串长度超过树深时直接失败。

### 19.11（复杂度）Trie 的时间与空间如何分析？

- 插入与查询的时间为 O(L)，L 为字符串长度，与集合中单词数量无关。
- 数组实现的空间为 O(节点数乘字符集大小)，哈希实现为 O(节点数)。
- 字符集为 26 时每个节点约占 26 个指针，节点多时内存占用显著。
- 共享前缀使实际节点数远小于全部单词长度之和，前缀重复度越高越省空间。
- 删除单词时若只清除 `end` 标记，节点保留；需要回收时按计数递减并释放空节点。
- 与哈希表相比，Trie 查询时间稳定，且天然支持前缀查询与字典序遍历。

### 19.12（辨析）Trie、哈希表与有序集合如何取舍？

- 哈希表查询平均 O(1)，不支持前缀查询，也不保证字典序。
- Trie 支持前缀与字典序遍历，代价是空间与指针跳转带来的缓存开销。
- 有序集合支持范围查询与前驱后继，单次操作 O(log n)。
- 需要按前缀列举候选时 Trie 最优，需要按排名查询时有序集合更合适。
- 字符串集合很小且只做精确匹配时，哈希表实现更简单。
- 内存受限时可以用压缩 Trie 合并单分支节点，即以基数树的形式存储。

### 19.13 0-1 Trie 如何求最大异或值？

- 把每个数按二进制从高位到低位插入 Trie，每个节点最多有两个子节点。
- 查询 x 的最大异或值时优先走与当前位相反的子节点，不存在时再走相同分支。
- 每一步都让高位尽可能为 1，异或结果最大，这是按位贪心。
- 插入与查询的复杂度均为 O(位数)，32 位整数为 32 步。
- 求两个不同数的最大异或时可以边插入边查询，先查询再插入避免与自身配对。
- 边界：空数组返回 0；负数按补码表示，位数需要覆盖符号位。

### 19.14 Trie 的删除操作如何实现？

- 沿路径下降，经过的节点计数减一，末尾节点的 `end` 标记减一。
- 计数减到 0 的节点可以释放，同时把父节点对应的子指针置空。
- 只在 `end` 减到 0 时才能删除整条路径，否则该路径仍是其他单词的前缀。
- 递归删除可以在回溯时判断子树是否为空，为空则释放当前节点。
- 时间复杂度 O(L)，不需要额外空间。
- 删除时直接释放节点，会让共享同一前缀的其他单词一起丢失，释放前需确认没有其他单词经过该节点。

### 19.15 跳表的结构与查找过程是怎样的？

- 跳表是多层链表，底层包含全部元素，上层是下层的抽样，形成索引。
- 每层链表有序，节点保存指向同层右侧节点与下方节点的指针。
- 查找从最高层的头节点开始，能右移则右移，不能右移则下移，直到到达底层。
- 期望查找长度为 O(log n)，空间为 O(n)，层数期望为 O(log n)。
- 与平衡树相比，跳表不需要旋转，插入与删除只涉及局部指针修改。
- 跳表的随机性来自层数生成，不依赖输入分布。

### 19.16（实现）跳表的插入如何实现，层数如何生成？

- 新节点的层数由随机函数生成，常见做法是每次以 1/2 的概率加一层，直到失败或达到上限。
- 查找插入位置时记录每层的最后一个小于目标键的节点，作为更新数组。
- 从底层向上把新节点插入到这些位置之后，先连右指针再连下指针。
- 已存在的键需要更新值，查找阶段先判断，不能重复插入。
- 期望复杂度 O(log n)，最坏 O(n)，取决于随机层数。
- 层数上限通常取 32 或与 log n 相关，防止极端情况下层数过大。

```cpp
struct Node {
    int key, val;
    std::vector<Node*> next;   // next[i] 为第 i 层的后继
};
int randomLevel(int maxLevel) {
    int lv = 1;
    while (lv < maxLevel && (std::rand() & 1)) ++lv;   // 以 1/2 概率升高
    return lv;
}
```

### 19.17 跳表的删除与索引维护如何实现？

- 查找目标时记录每层的前驱，删除时把这些前驱的 `next` 指向目标的同层后继。
- 只删除底层节点而保留上层索引会留下悬空指针，必须逐层摘除。
- 删除后若某层只剩头节点，可以降低当前层数，减少无效遍历。
- 前驱数组在查找阶段一次填好，删除时按层修改指针即可。
- 期望复杂度 O(log n)，空间不增加。
- 删除后忘记更新层数会影响性能，忘记释放节点则造成泄漏。

### 19.18（复杂度）跳表的期望复杂度如何得到？

- 层数以 1/2 的概率递增，第 k 层的节点数期望为 n 除以 2 的 k-1 次方。
- 层数超过 log n 的概率随 n 增大迅速下降，总层数期望为 O(log n)。
- 查找的比较次数等于每层右移次数之和，期望为 O(log n)。
- 插入与删除的期望复杂度同为 O(log n)，最坏为 O(n)。
- 空间期望为 O(n)，因为各层节点数按几何级数递减。
- 随机数质量差或层数上限过低会破坏期望界，退化到线性查找。

### 19.19（辨析）跳表与平衡树如何取舍？

- 跳表实现简单，插入删除只需修改指针，不需要旋转与再平衡。
- 平衡树的最坏复杂度有保证，跳表只有期望保证。
- 跳表的范围查询需要逐层下降，实现比平衡树的中序遍历繁琐。
- 并发场景下跳表的修改是局部的，更容易做无锁化；平衡树的旋转影响范围更大。
- 内存开销上跳表每个节点平均约两个指针，平衡树通常需要额外保存颜色或高度。
- 已有标准库容器可用时优先用 `std::map`，需要顺序统计或并发改造时再考虑跳表。

### 19.20（场景）跳表在有序集合中如何应用？

- Redis 的有序集合用跳表加哈希表实现，跳表维护顺序，哈希表提供 O(1) 的按成员查询。
- 跳表支持按分数范围遍历与按排名查询，这两类操作在排行榜类业务中常见。
- 排名查询通过在节点上记录跨度实现，累加跨度得到名次。
- 需要按分数更新时先删除旧节点再插入新节点，指针修改为局部操作。
- 单个有序集合的规模通常远小于内存上限，跳表的期望复杂度足够。
- 选择跳表而非平衡树的原因包括实现简单、范围查询直观与并发改造空间较大。

---

## 20. 设计类题目与代码阅读

### 20.1 LRU 缓存的结构如何设计？

- 用哈希表保存键到链表节点的映射，用双向链表按访问时间排序，头部为最近使用。
- `get` 命中时把节点移到头部并返回值，未命中返回 -1。
- `put` 时键已存在则更新值并移到头部；键不存在则新建节点插入头部，容量超限时删除尾部节点。
- 链表使用哨兵头尾节点，省去空链表与边界节点的特判。
- 全部操作 O(1)，空间 O(capacity)。
- 哈希表与链表必须同步维护，删除节点时同时从两处移除。

### 20.2（实现）LRU 的 get 与 put 有哪些细节？

- 节点保存键、值与前后指针；删除尾部节点时需要键来清除哈希表项，因此节点必须存键。
- `put` 更新已有键时不要新建节点，否则哈希表仍指向旧节点，链表出现重复。
- 容量为 0 时 `put` 直接返回，不插入任何节点。
- 移动节点到头部要先摘除再插入，顺序错误会破坏相邻节点的指针。
- 用 `std::list` 与迭代器可以缩短代码，`splice` 完成移动且不使迭代器失效。
- 删除尾节点后若忘记清除哈希表项，后续会命中已释放的节点。

```cpp
class LRUCache {
public:
    explicit LRUCache(int cap) : cap_(cap) {}
    int get(int key) {
        auto it = map_.find(key);
        if (it == map_.end()) return -1;
        items_.splice(items_.begin(), items_, it->second);   // 移到头部
        return it->second->second;
    }
    void put(int key, int value) {
        if (cap_ == 0) return;
        auto it = map_.find(key);
        if (it != map_.end()) {
            it->second->second = value;
            items_.splice(items_.begin(), items_, it->second);
            return;
        }
        if ((int)map_.size() == cap_) { map_.erase(items_.back().first); items_.pop_back(); }
        items_.emplace_front(key, value); map_[key] = items_.begin();
    }
private:
    int cap_;
    std::list<std::pair<int, int>> items_;                      // 头部最新
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> map_;
};
```

### 20.3（陷阱）LRU 中哈希表与链表为何必须同步更新？

- 哈希表负责 O(1) 定位，链表负责淘汰顺序，任一处更新遗漏都会让两者描述的集合不一致。
- 命中后只调整链表不修改映射，节点本身没有变化；插入与删除必须同时修改两处。
- 删除尾节点前先从节点取出键，再从哈希表移除，节点不保存键时无法反查。
- 修改容量需要清空或重建结构，只改容量字段会让淘汰条件与已有元素个数脱节。
- 异常安全：先插入链表再写哈希表时，若第二步抛出异常，链表会残留无法定位的节点，应先预留空间或在失败时回滚。
- 测试覆盖连续命中、连续淘汰与容量为 1 三种序列，检查链表长度与哈希表大小始终相等。

### 20.4 LFU 缓存的结构如何设计？

- 每个键记录访问频次，频次相同的键放在同一个桶中，桶内按最近使用排序。
- 维护频次到桶的映射，以及当前最小频次，用于淘汰。
- `get` 命中时把键从当前频次桶移到频次加一的桶，并更新最小频次。
- `put` 新键时频次为 1，容量已满时从最小频次桶的尾部淘汰。
- 全部操作 O(1)，空间 O(capacity)。
- 频次桶之间用双向链表串联，桶内元素也用双向链表，便于 O(1) 摘除。

### 20.5（实现）LFU 的 O(1) 实现要点有哪些？

- 用哈希表保存键到节点，节点中保存频次；另用哈希表保存频次到桶链表。
- 桶内保存键的双向链表以及键到链表迭代器的映射，便于 O(1) 删除。
- 每次访问后若原频次桶为空且等于最小频次，最小频次加一。
- 新键插入时最小频次置 1，即使此前的最小频次更大。
- 淘汰时取最小频次桶的尾部节点，同时从三个结构中移除。
- 删除节点后若忘记更新最小频次，淘汰时会访问空桶。

```cpp
struct Node { int key, val, freq; };
std::unordered_map<int, Node> kv;                     // 键到节点
std::unordered_map<int, std::list<int>> buckets;      // 频次到键链表
std::unordered_map<int, std::list<int>::iterator> pos;
int minFreq = 0;
void touch(int key) {
    Node& n = kv[key];
    auto& oldList = buckets[n.freq];
    oldList.erase(pos[key]);
    if (oldList.empty() && n.freq == minFreq) ++minFreq;
    ++n.freq;
    buckets[n.freq].push_front(key);
    pos[key] = buckets[n.freq].begin();
}
```

### 20.6（辨析）LRU 与 LFU 如何取舍？

- LRU 按最近访问时间淘汰，实现简单，适合访问模式随时间变化的场景。
- LFU 按累计频次淘汰，能保留长期热点，但对新键不友好，历史频次会长期占优。
- LFU 需要为频次维护额外结构，内存与实现复杂度高于 LRU。
- 访问模式存在突发扫描时，LRU 会把热点全部挤出，LFU 受影响较小。
- 频次相同时 LFU 通常再按最近使用排序，否则退化为近似随机淘汰。
- 业务上常用 LRU 及其变体，LFU 多用于命中率要求较高且访问分布稳定的场景。

### 20.7 如何设计一个支持前缀查询的 Trie 类？

- 接口包含 `insert`、`search`（完整单词）与 `startsWith`（前缀）。
- 节点保存子节点数组与 `isEnd` 标记，`search` 在路径末尾检查 `isEnd`。
- `startsWith` 只检查路径是否存在，不检查 `isEnd`。
- 三个操作的时间复杂度均为 O(L)，空间为全部单词的字符总数。
- 字符集只含小写字母时用长度 26 的数组，否则用哈希表保存子节点。
- 边界：空字符串插入后 `search("")` 返回 true，是否符合语义由接口文档约定。

### 20.8（实现）随机集合：如何在 O(1) 时间插入、删除与随机取？

- 用动态数组保存元素，用哈希表保存元素到数组下标的映射。
- 插入时元素已存在则返回 false，否则追加到末尾并写入下标。
- 删除时把待删元素与末尾元素交换，更新被交换元素的下标，再弹出末尾。
- 随机取用均匀随机数取数组下标，每个元素被选中的概率相等。
- 三个操作均为 O(1)，空间 O(n)。
- 边界：空集合上删除或随机取返回失败；删除末尾元素时交换是空操作。

```cpp
class RandomizedSet {
public:
    bool insert(int x) {
        if (pos_.count(x)) return false;
        pos_[x] = (int)data_.size();
        data_.push_back(x);
        return true;
    }
    bool remove(int x) {
        auto it = pos_.find(x);
        if (it == pos_.end()) return false;
        int i = it->second, last = data_.back();
        data_[i] = last;
        pos_[last] = i;
        data_.pop_back();
        pos_.erase(x);
        return true;
    }
    int random() const { return data_[std::rand() % data_.size()]; }
private:
    std::vector<int> data_;
    std::unordered_map<int, int> pos_;
};
```

### 20.9（陷阱）随机集合删除时交换顺序为何重要？

- 待删元素正好是末尾元素时，写回与更新下标都是对同一位置的操作，直接弹出即可。
- 必须先把末尾元素写到待删位置并更新其下标，再弹出末尾，顺序颠倒会丢失末尾元素。
- 更新下标要在 `erase` 之前完成，待删元素与末尾元素相同时映射会被提前删除。
- 下标类型要与哈希表的值类型一致，混用有符号与无符号类型会产生比较问题。
- 随机数生成器的取值范围要覆盖集合大小，`rand()` 的上限可能不足。
- 元素不允许重复时插入前必须判重，否则映射只保留一个下标，删除后出现残留。

### 20.10（场景）布隆过滤器如何设计，误判率由什么决定？

- 用长度为 m 的位数组与 k 个相互独立的哈希函数，插入时把 k 个位置置 1。
- 查询时检查 k 个位置，全部为 1 返回「可能存在」，任一为 0 返回「一定不存在」。
- 误判率随元素数 n 增加而上升，近似为 `(1 - e^(-kn/m))^k`；给定 m 与 n 时，k 取 m/n 与 ln2 的乘积附近最优。
- 标准布隆过滤器不支持删除，把某位置 0 会影响共享该位的其他元素；需要删除时改用计数布隆过滤器。
- 空间为 O(m) 位，插入与查询均为 O(k)，k 为常数。
- 边界：位数组全为 0 时任何查询都返回不存在；元素数远超设计容量时误判率接近 1。
- 典型用途是缓存穿透防护与集合去重的预过滤，输出只能作为近似判断。

### 20.11（实现）如何设计一个按权重随机抽样的结构？

- 把权重展开为前缀和数组，抽样时在 0 到总权重之间取均匀随机数，二分查找第一个大于该值的前缀和下标。
- 预处理 O(n)，单次抽样 O(log n)，空间 O(n)。
- 别名法把抽样降到 O(1)，代价是 O(n) 的预处理与两张长度为 n 的表。
- 权重为 0 的元素不参与抽样；前缀和存在相等值时，二分要返回第一个严格大于随机数的位置。
- 边界：总权重为 0 时没有可抽样元素；只有一个元素权重非 0 时直接返回该元素。
- 浮点权重会带来精度误差，随机数取整到定点或改用 64 位整数累加可以降低偏差。
- 权重频繁变化时前缀和需要重建，可用树状数组把单点更新降到 O(log n)。

### 20.12（场景）如何设计一个支持过期时间的缓存？

- 在 LRU 的基础上为每个节点增加到期时间戳，读写前先判断是否已经过期。
- 惰性删除在访问到过期键时移除并返回未命中，实现简单，但过期键可能长期占用内存。
- 定期删除由后台按固定间隔抽样若干键清理，抽样比例与频率决定内存与 CPU 的平衡。
- 时间轮把到期时间映射到槽位，适合大量定时任务，插入与删除均为 O(1)。
- 到期时间相同的键放在同一个桶中，按到期时间排序后可以批量清理。
- 边界：到期时间早于当前时间视为立即过期；系统时钟回拨会使判断异常，应使用单调时钟。
- 并发环境下删除与读取需要同步，惰性删除应在持有锁时完成状态变更。

### 20.13（实现）数据流中位数：如何用两个堆维护？

- 大顶堆保存较小的一半，小顶堆保存较大的一半，两堆大小之差不超过 1。
- 插入时与堆顶比较选择入堆，再调整两堆大小。
- 元素个数为奇数时中位数取大顶堆堆顶，偶数时取两堆顶的平均值。
- 插入 O(log n)，查询 O(1)，空间 O(n)。
- 边界：空数据流没有中位数；偶数个元素取平均时注意整数除法的精度。
- 只按大小关系插入而不调整，两堆大小会失衡。

```cpp
class MedianFinder {
public:
    void add(int x) {
        if (lo_.empty() || x <= lo_.top()) lo_.push(x); else hi_.push(x);
        if (lo_.size() > hi_.size() + 1) { hi_.push(lo_.top()); lo_.pop(); }
        else if (hi_.size() > lo_.size()) { lo_.push(hi_.top()); hi_.pop(); }
    }
    double median() const {
        double a = lo_.top();
        return lo_.size() == hi_.size() ? (a + hi_.top()) / 2.0 : a;
    }
private:
    std::priority_queue<int> lo_;                              // 大顶堆
    std::priority_queue<int, std::vector<int>, std::greater<int>> hi_;
};
```

### 20.14（代码阅读）这段 LRU 实现有哪些缺陷？

```cpp
int get(int key) {
    if (!cache.count(key)) return -1;
    return cache[key]->val;            // 命中后未把节点移到头部
}
void put(int key, int val) {
    if (cache.count(key)) { cache[key]->val = val; return; }
    if ((int)cache.size() == cap) {
        cache.erase(tail->key);        // 只清除哈希表项
        tail = tail->prev;             // 链表未摘除旧节点
    }
    Node* n = new Node{key, val};
    // 头插与 map 写入略
}
```

- 第一处缺陷：`get` 命中后没有把节点移到链表头部，淘汰顺序退化为插入顺序。
- 第二处缺陷：容量满时只清除哈希表项，链表仍保留旧节点，链表长度不减少，节点也无法释放。
- 第三处隐患：`put` 更新已有键时同样需要移动到头部，否则最近使用信息不更新。
- 修正方式是把摘除节点封装为一个函数，同时更新链表与哈希表，避免两处状态不一致。
- 这类缺陷在容量为 1 或连续访问同一个键时不一定暴露，测试要覆盖访问顺序的变化。
- 阅读代码时先写出数据结构的不变量，再逐条操作检查不变量是否维持。

### 20.15（代码阅读）这段二分查找错在哪里？

```cpp
int lowerBound(const std::vector<int>& a, int x) {
    int lo = 0, hi = (int)a.size() - 1;   // 闭区间
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;                     // 区间不缩小
    }
    return lo;
}
```

- 循环使用闭区间，但更新写成 `hi = mid`，当 `lo` 等于 `hi` 且 `a[mid]` 不小于 `x` 时区间不再缩小，陷入死循环。
- 正确写法是闭区间配合 `hi = mid - 1`，或改用左闭右开区间配合 `hi = mid`。
- `mid` 用 `(lo + hi) / 2` 在两者接近 `INT_MAX` 时溢出，应写 `lo + (hi - lo) / 2`。
- 返回值表示第一个不小于 `x` 的位置，可能等于 `n`，调用方需要判断。
- 测试应覆盖空数组、单元素、全部小于 `x`、全部不小于 `x` 四类输入。
- 二分查找的错误多来自区间定义与更新方式不一致，写代码前先固定区间语义。

### 20.16（代码阅读）这段拓扑排序错在哪里？

```cpp
std::vector<int> topo(int n, const std::vector<std::pair<int, int>>& edges) {
    std::vector<int> deg(n, 0);
    for (const auto& e : edges) ++deg[e.first];        // 统计对象错误
    std::queue<int> q;
    for (int i = 0; i < n; ++i) if (deg[i] == 0) q.push(i);
    std::vector<int> order;
    while (!q.empty()) {
        int u = q.front(); q.pop();
        order.push_back(u);
        for (const auto& e : edges)
            if (e.first == u && --deg[e.second] == 0) q.push(e.second);
    }
    return order;                                      // 未检查长度
}
```

- 第一处缺陷：入度累加的是起点，终点没有计入，入度分布错误，初始队列的判定随之失效。
- 第二处缺陷：函数没有检查输出长度是否等于顶点数，存在环时返回不完整序列而不报错。
- 第三处缺陷：每次出队都遍历全部边，复杂度退化为 O(VE)，应预先建好邻接表。
- 重复边会让入度与减操作同时增加，结果仍正确，但统计口径必须一致。
- 修正后用小规模有环图与无环图各验证一次。
- 阅读代码时用「入度等于指向该顶点的边数」这一不变量逐行核对。

### 20.17（代码阅读）这段快速排序错在哪里？

```cpp
void quickSort(std::vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int pivot = a[hi], i = lo;
    for (int j = lo; j < hi; ++j)
        if (a[j] <= pivot) std::swap(a[i++], a[j]);
    std::swap(a[i], a[hi]);
    quickSort(a, lo, i);          // 应为 lo 到 i - 1
    quickSort(a, i + 1, hi);
}
```

- 左半部分的递归区间包含已经就位的枢轴，子问题规模不缩小，导致无限递归与栈溢出。
- 正确写法是左侧递归 `[lo, i - 1]`，右侧递归 `[i + 1, hi]`，枢轴不再参与。
- 以末尾元素为枢轴时，已排序输入会退化为 O(n²)，随机选取枢轴或三数取中可以缓解。
- 划分使用 `<=` 时，等于枢轴的元素全部落到左侧，大量重复元素会使划分失衡。
- 递归深度最坏为 n，规模较大时应改为显式栈或只对较短区间递归。
- 测试应覆盖空数组、单元素、已排序、全部相等四类输入。

### 20.18（场景）白板设计题如何组织作答？

- 先复述功能与接口，明确容量、并发、持久化等约束；未给定的部分按最常见语义假设并说明。
- 给出核心数据结构与不变量，说明每个操作如何在 O(1) 或 O(log n) 内完成。
- 写出关键操作的骨架代码，边界条件单独列出。
- 分析复杂度与空间，指出淘汰策略、扩容与冲突处理方式。
- 主动给出测试用例：容量为 0、重复键、连续淘汰、极端访问顺序。
- 留出扩展点，例如线程安全、统计信息与序列化，按追问逐项展开。

### 20.19（代码阅读）这段缓存类有哪些资源管理缺陷？

```cpp
class Cache {
public:
    ~Cache() {}                                  // 未释放链表节点
    void put(int k, int v) {
        Node* n = new Node{k, v};
        map_[k] = n;                             // 同键覆盖时旧节点丢失
    }
private:
    std::unordered_map<int, Node*> map_;
};
```

- 析构函数为空，`new` 出来的节点全部泄漏，长时间运行的服务内存持续增长。
- `put` 覆盖同一个键时，旧节点既不释放也不从链表摘除，形成孤儿节点。
- 使用裸 `new` 时应成对提供 `delete`，或改用 `std::unique_ptr` 与容器管理生命周期。
- 复制构造与复制赋值默认生成，两个对象持有同一批指针，析构时重复释放。
- 异常安全：`new` 成功而后续插入抛出异常时节点泄漏，应使用 RAII 包装。
- 阅读代码时先找出全部 `new` 与 `delete`，再核对构造、析构与赋值三处的配对关系。

### 20.20（陷阱）设计题中容易忽略哪些边界？

- 容量为 0 或 1 时，淘汰逻辑与「先删除后插入」的顺序最容易出现空指针。
- 键不存在与键对应的值为 0 是两种情况，返回值不能用 0 表示失败。
- 重复写入同一个键不应触发淘汰，也不应改变容量占用。
- 空结构上的查询、删除与随机取需要定义返回值或抛出异常。
- 整数键的哈希函数对连续值要打散，否则桶链退化，查找变为线性。
- 并发访问需要外部同步，接口文档应写明线程安全级别。
