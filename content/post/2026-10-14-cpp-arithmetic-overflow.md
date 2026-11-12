---
title: C++ 算术运算溢出
slug: "cpp-arithmetic-overflow"
date: 2026-10-14
categories: ["编程语言"]
tags:
  - C++
  - 整数溢出
  - 未定义行为
draft: false
summary: 区分无符号回绕（定义良好）与有符号溢出（UB），澄清补码表示不等于溢出行为被定义；列举加减乘、取负、除法、移位、浮点转整型等触发点，并给出 -ftrapv、-fwrapv、UBSan、`__builtin_*_overflow` 与前置检查等防护手段。
---

---

## 零、总览：先分清「哪种溢出」

| 运算 | 溢出后的性质 |
|---|---|
| 无符号整数 `+ - * <<` | **定义良好**：按 2^N 取模回绕，语言保证 |
| 有符号整数 `+ - *` | **未定义行为 (UB)** |
| 有符号取负 `-x`（`x == INT_MIN`） | **UB** |
| `INT_MIN / -1`、`INT_MIN % -1` | **UB** |
| 左移到符号位（`1 << 31`）、位移量 ≥ 位宽（`1 << 32`）、负位移量 | **UB** |
| 浮点运算溢出 | **不是 UB**（IEC 559 平台返回 ±inf / 0） |
| 浮点 → 整数，值超出目标范围 | **UB**（静默返回垃圾值） |
| 指针算术越界 | **UB** |

### 关键澄清：补码 ≠ 溢出被定义

C++20 起标准**强制**有符号整数用二进制补码表示（P0907R4），但——

> **有符号溢出依然是 UB。** 标准只是规定了「表示形式」，没有规定「溢出行为」。

所以「现在都是补码机器了，有符号溢出就是回绕」这个说法是**错的**。回绕只是当前编译器**碰巧**的实现选择，随时可能被优化改变。

---

## 一、无符号：语言保证的回绕

```cpp
unsigned u = 0;
u - 1          // 4294967295
UINT_MAX + 1   // 0
```

模 2^32 运算，完全定义良好，编译器**不得**做「不会溢出」的假设。所以实现哈希、环形缓冲、模运算时，无符号回绕是**可依赖的工具**，不是 bug。

---

## 二、有符号：UB，而且 `-O0` 就已经咬人

很多人以为 UB 只在 `-O2` 才发作，实测**不是**：

```cpp
__attribute__((noinline)) bool add_one_gt(int x) { return x + 1 > x; }
__attribute__((noinline)) bool plus100_lt(int x)  { return x + 100 < x; }
// 调用点传入 x = INT_MAX
```

`-O0` 生成的汇编（函数体只剩两条指令）：

```asm
_Z10add_one_gti:
    movl  %ecx, 16(%rbp)     ; 参数照常入栈
    movl  $1, %eax           ; 直接返回 true！
    ret
```

编译器用「有符号加法不会溢出」这一前提**反推出 `x != INT_MAX`**，于是 `x + 1 > x` 恒真、`x + 100 < x` 恒假，比较被整段删除。`-O0` 和 `-O2` 结果一致。

用 `-fwrapv`（强制有符号回绕）重新编译 `-O2`，语义立刻回到真实回绕：

```text
(x+1) > x   = false     // INT_MAX+1 回绕成 INT_MIN，确实不大于
(x+100) < x = true      // 真实回绕
```

**教训**：`x + 1 > x`、`x + k < x`、`if (x < 0) ... x++` 这类「靠溢出判断」的写法，不是"在极端情况下才出错"，而是**从一开始就不成立**。

---

## 三、触发点清单（溢出远不止加减乘）

```cpp
int a = INT_MAX;
a + 1;              // UB
a * 2;              // UB
-INT_MIN;           // UB（结果无法用 int 表示）
abs(INT_MIN);       // UB（std::abs 同样）
INT_MIN / -1;       // UB（x86 上直接触发 #DE 异常）
INT_MIN % -1;       // UB

1 << 31;            // UB（左移到符号位）
1 << 32;            // UB（位移量 >= 位宽）
x << -1;            // UB
```

容易忽略的几类：

1. **整型提升让窄类型反而"安全"**：`uint16_t u = 65535; u + u` 先提升为 `int`，结果 131070，**不溢出**。真正的问题在**赋回窄类型时**的截断——有符号的目标类型是 *implementation-defined*（C++20 起是补码截断，不再是 UB）。所以「窄类型不会溢出」和「窄类型不会出错」是两回事。
2. **`std::accumulate` / `std::abs` / `-x`**：容器求和默认用 `int` 初值，几十万个元素就爆了；`std::abs(INT_MIN)` 是 UB。
3. **裸循环的归纳变量**：`for (int i = 0; i <= n; i++)` 当 `n == INT_MAX` 时 `i++` 溢出 → UB，编译器可据此假设 `n != INT_MAX`，把循环检查优化掉。
4. **`size_t` / `unsigned` 与 `int` 混算**：这不是溢出，而是**符号转换**，见 [C++有符号无符号转换](/post/2026/10/14/cpp-signed-unsigned-conversion/) 第 5 节。
5. **浮点 → 整数（静默）**：

   ```cpp
   volatile double d = 1e300;
   (int)d;      // UB，实测输出 -2147483648，且不报错、不崩溃
   ```

   这是最危险的一类：**结果看起来像个正常数字**。

---

## 四、为什么「全用 unsigned」不是解药

用无符号换掉 UB，代价是引入符号转换陷阱（`x > -1` 恒真、`i >= 0` 死循环、`a - b` 得到巨大正数）。**C++ 核心指南 ES.106** 的建议是：**默认用有符号 `int`，只在确实要做位运算 / 模运算时用无符号**。

有符号溢出的正确应对是**检测**，而不是换成无符号。

---

## 五、防护手段（按成本从低到高）

### 1. 编译期开关

| 选项 | 作用 | 代价 |
|---|---|---|
| `-ftrapv` | 有符号 `+ - *` 溢出时**立即崩溃**（而非静默继续） | 性能损失，GCC 实现有历史缺陷 |
| `-fsanitize=signed-integer-overflow,unsigned-integer-overflow` | UBSan，精确报出位置（Clang 完整；`unsigned` 项需 Clang） | 需运行 libubsan |
| `-fwrapv` | 把有符号溢出**变成**补码回绕（定义行为） | 关闭部分优化，**非标准** |
| `-fno-strict-overflow` | 只禁止基于溢出的优化，不承诺回绕 | 较温和 |

实测 `-ftrapv`：

```text
无 -ftrapv :  INT_MAX + 1 -> -2147483648      done (exit 0)      ← 静默
有 -ftrapv :  INT_MAX + 1 -> <崩溃>            exit 0xC0000409    ← 立即暴露
有 -ftrapv :  INT_MIN / -1 -> <崩溃>           exit 0xC0000409
```

> 注：Windows 上 `-ftrapv` 需要 `-static`（否则缺 libgcc DLL）；本次 MSYS2 安装**没有 `libubsan`**，`-fsanitize=undefined` 链接失败，UBSan 请用 Clang 或 Linux 环境。

### 2. 运行时内置函数（推荐，GCC/Clang 都有）

```cpp
int r;
if (__builtin_add_overflow(a, b, &r)) { /* 溢出 */ }   // 实测可用
if (__builtin_sub_overflow(a, b, &r)) { /* 溢出 */ }
if (__builtin_mul_overflow(a, b, &r)) { /* 溢出 */ }
```

**零 UB、无符号提升问题、可被优化成单条指令**（x86 上带 OF 标志的 `add` + `jo`）。MSVC 没有等价物，但 Clang-cl 支持。

### 3. 前置条件检查

```cpp
// 加法：b > 0 时检查上界，b < 0 时检查下界
if (b > 0 && a > INT_MAX - b)  /* 上溢 */;
if (b < 0 && a < INT_MIN - b)  /* 下溢 */;
```

减法同理转成加法检查。**乘法**用这个套路很容易写错（符号组合、`INT_MIN / -1`），直接用 `__builtin_mul_overflow` 或提升到更宽类型。

### 4. 用更宽的类型计算

```cpp
long long r = (long long)a * b;   // 但 long long 之间相乘仍会溢出
```

只在**确定中间结果放得下**时有效；`long long` 对 `long long` 本身无效，需要 `__int128`（GCC/Clang 扩展）。

### 5. C++26 饱和运算（尚未落地）

`<numeric>` 计划加入 `std::add_sat` / `sub_sat` / `mul_sat` / `div_sat` / `saturate_cast`。
**实测 GCC 16.2.0 + `-std=c++26` 尚未实现**（`error: 'add_sat' is not a member of 'std'`）。目前只能自己实现或依赖硬件指令。

---

## 六、合法的溢出用法

以下场景**依赖**无符号回绕是正当的（标准保证）：

```cpp
uint32_t hash = 2166136261u;
for (char c : s) hash = (hash ^ c) * 16777619u;   // FNV-1a，靠模 2^32 回绕
uint32_t fnv = (h * 16777619u);                    // 同上

size_t idx = (head + 1) % CAP;                     // 环形缓冲
size_t idx = (tail - 1 + CAP) % CAP;               // 借回绕避免负数
```

关键区别：**这些是刻意写在无符号类型上的**，并且语义就是「模 2^N」。
一旦有人在里面混进一个有符号数（如 `head + 1 - n`，`n` 是 `int`），性质立刻从「定义良好」变成「按转换规则运行」，往往还不是 UB，只是**错的**——更难查。

---

## 七、编译器实测输出

以下为 g++ 16.2.0 (MSYS2, x86-64, `-std=c++20`) 下的实测输出。`-O0` 与 `-O2` 输出**完全一致**（这点本身就说明问题）：

```text
[unsigned] 0u - 1            = 4294967295   (回绕，定义良好)
[unsigned] UINT_MAX + 1      = 0   (回绕，定义良好)
[signed]   INT_MAX           = 2147483647
[signed]   INT_MAX + 1       = -2147483648   <-- UB，结果不可信
[UB-opt]   (x+1) > x 判定为 true（UB 让编译器假设不溢出）
[signed]   100000*100000     = 1410065408   <-- 100 亿远超 int，UB
[unsigned] 100000u*100000u    = 1410065408   (mod 2^32)
[signed]   INT_MIN           = -2147483648
[signed]   -INT_MIN          = -2147483648   <-- UB（无法用 int 表示）
[signed]   INT_MIN / -1      = -2147483648   <-- UB
[signed]   1 << 31           = -2147483648   <-- UB（应写 1u << 31）
[safe]     加法前置检查：会溢出
[safe]     __builtin_add_overflow 检测到溢出
```

补充实测：

```text
-ftrapv  INT_MAX + 1     -> 立即崩溃, exit 0xC0000409   （无 -ftrapv 则静默输出 -2147483648）
-ftrapv  INT_MIN / -1    -> 立即崩溃, exit 0xC0000409
-fwrapv  (x+1) > x       -> false / (x+100) < x -> true （真实回绕语义）
(int)1e300               -> -2147483648, 不崩溃, 静默错误
g++ -std=c++26 std::add_sat -> 不存在（GCC 16.2.0 尚未实现）
```

---

## 八、速查结论

1. 无符号溢出 = 回绕，是**工具**；有符号溢出 = UB，是**地雷**。
2. 补码≠有符号溢出被定义，二者无关。
3. `x + 1 > x` 恒真这类判断**从 -O0 起就失效**，不是"只在优化时出问题"。
4. 检查用 `__builtin_*_overflow`；临时排查用 `-ftrapv`；正式测试用 UBSan（Clang）。
5. 浮点转整型出界是**静默** UB，最容易被忽略。
6. 默认用有符号 `int`（ES.106），只在位运算/模运算处用无符号。
