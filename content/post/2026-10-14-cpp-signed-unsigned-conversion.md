---
title: C++ 中有符号数与无符号数的转换
slug: "cpp-signed-unsigned-conversion"
date: 2026-10-14
categories: ["编程语言"]
tags:
  - C++
  - 类型转换
draft: false
summary: 讲解有符号与无符号互转按 2^N 取模、位模式不变的规则，重点区分整型提升与通常算术转换，指出混比导致的陷阱（x > -1 恒真、i >= 0 死循环），并给出 std::cmp_less、循环变量写法、警告开关等工程建议。
---

---

## 一、核心规则（语言层面）

### 1. 有符号 → 无符号：模 2^N，完全定义良好

转换成目标无符号类型的位宽 N（`unsigned int` 通常 N = 32），结果是**原值对 2^N 取模**：

```cpp
(unsigned)(-1)  == 4294967295 == 0xFFFFFFFF
(unsigned)(-2)  == 4294967294 == 0xFFFFFFFE
(unsigned)(-5)  == 4294967291
```

数学上就是 `x + 2^N`（当 x < 0 时），没有任何未定义行为，编译器可以放心优化。

### 2. 无符号 → 有符号：能放下就不变，放不下则「回绕」

- 若值能用目标有符号类型表示 → 值不变。
- 否则：**C++20 之前是实现定义**（implementation-defined，各平台基本都按补码回绕）；**C++20 起标准强制要求二进制补码**，所以规则是确定的：按 2^N 取模得到位模式，再按补码解释。

```cpp
(int)(unsigned)4294967295 == -1
```

### 3. 结论：同宽互转 = 位模式不变

在补码机器上（现在所有主流平台），`int32_t ↔ uint32_t` 互转**只改解释方式，不改比特**：

```cpp
-5 -> 4294967291 -> -5     // 往返无损
```

所以标准里的 `static_cast` 在这一点上是「零成本」的（寄存器里根本不会产生指令）。

---

## 二、真正会咬人的地方：整型提升 vs 通常算术转换

这两件事经常被混为一谈，但后果完全不同。

### 4. 窄类型先做「整型提升」（提升到 int，值是安全的）

`uint8_t / uint16_t / bool / char` 参与运算前先提升为 `int`（因为 int 能表示它们的全部值）：

```cpp
uint8_t u8 = 200;
u8 + u8          // -> 400，int 运算，不溢出
(uint8_t)(u8+u8) // -> 144，赋回 uint8_t 才截断
```

注意最后一行的 `144` 也**不是**未定义行为：无符号运算本身就是模 2^8。

### 5. 同宽的「通常算术转换」：有符号被悄悄转成无符号 ← 最大的坑

当 `int` 和 `unsigned int`（同 rank）一起运算时，**有符号操作数被转换成无符号**：

```cpp
unsigned x = 1;
x > -1    // false！-1 先变成 4294967295，1 > 4294967295 不成立
x == -1   // false
```

经典事故：

```cpp
for (unsigned i = n; i >= 0; --i)   // i >= 0 恒真 → 死循环（i 到 0 后再减成 UINT_MAX）
if (v.size() - 1 > 10)              // size() 是 size_t，-1 变成巨大正数
int n = -1; if (n < sizeof(buf))    // sizeof 是 size_t，n 被转成巨大正数 → 判断失效
```

`-Wall -Wextra` 会给出 `-Wsign-compare` 警告，**务必打开并清零**。

### 6. 字面量的类型也很微妙

`0xFFFFFFFF`：十六进制字面量按 `int → unsigned int → long → ...` 顺序取第一个能放下的类型。在 32 位 `int` 平台上它是 `unsigned int`，于是：

```cpp
if (x < 0xFFFFFFFF)   // 若 x 是 unsigned，这跟你想的可能不一样
```

十进制 `4294967295` 则会是 `long` / `long long`（因为十进制字面量不允许落到无符号类型）。这是十进制和十六进制字面量的**实质区别**。

### 7. `char` 的符号性是实现定义的

`char` 到底是 signed 还是 unsigned 由实现决定；要确定就用 `signed char` / `unsigned char`。

---

## 三、工程上的正确做法

| 场景 | 做法 |
|---|---|
| 只想要位模式 | `static_cast<T>(v)`（同宽互转安全，C++20 起语义确定） |
| 跨符号比较 | C++20 `std::cmp_less` / `cmp_greater` / `cmp_equal`（`<utility>`） |
| 循环变量 | 用 `int` / 有符号 `ptrdiff_t`，或写成 `for (unsigned i = n; i-- > 0;)` |
| 容器大小运算 | 别和 `size_t` 混算，先 `static_cast<std::ptrdiff_t>` |
| 打印 | 类型和 `%d` / `%u` 必须匹配；不确定就 `static_cast<unsigned>` 或用 `<format>` / `<iostream>` |
| 编译期防御 | `-Wall -Wextra -Wconversion -Wsign-conversion`（MSVC 用 `/W4 /w14656`） |

`std::cmp_greater(1u, -1)` 返回 **true**——它按数学值比较，不受符号转换影响，这是替代混比 `%d` 的推荐写法。

---

## 四、编译器实测输出

以下为 g++ (MSYS2, x86-64, `-std=c++20 -Wall -O0`) 下的实测输出：

```text
(unsigned)(int)-1         = 4294967295   (0xFFFFFFFF)
(unsigned)(int)-2         = 4294967294   (0xFFFFFFFE)
(int)(unsigned)4294967295 = -1           (0xFFFFFFFF)
-5 -> 4294967291 -> -5    (往返无损)
uint8_t 200 + 200         = 400          (提升为 int，不溢出)
(uint8_t)(200+200)        = 144          (赋回 uint8_t 才截断)
1u > -1  : false
1u == -1 : false
std::cmp_greater(1u, -1)  = true
0xFFFFFFFFu 是 unsigned, 值 = 4294967295
```

编译时只有两条 `-Wsign-compare` 警告，正是第 5 条规则在提醒你——**这些警告不是噪音，是真 bug**。
