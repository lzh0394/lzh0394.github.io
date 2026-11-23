---
title: "别名分析概述"
slug: "alias-analysis"
date: "2026-10-22"
tags: ["编译器"]
draft: false
summary: "别名分析判断两个指针是否指向同一块存储，NoAlias、MayAlias、MustAlias 三种判定各自支持哪些优化，restrict 这类语言承诺又如何变成编译器的不别名假设。"
---

别名分析（alias analysis）判断两个指针是否指向同一块存储。两个指针指向同一地址就互为别名；两次访问覆盖同一块存储、哪怕只是部分重叠，也算别名。它和指针分析（pointer analysis）回答的问题不同。指针分析问一个指针可能指向哪些对象，别名分析问两个指针是否指向同一个对象。两者在文献里常被混用，LLVM 的文档就写成「Alias Analysis (aka Pointer Analysis)」。

别名分析的核心任务，是判断在程序某个执行点，两个指针是必然不同、可能相同，还是必然相同。这个问题没有精确答案。Landi 在 1992 年证明，对含过程与动态存储分配的类 C 语言，可能别名（may-alias）问题不可判定（[Undecidability of Static Analysis](https://doi.org/10.1145/161494.161501)，LOPLAS 1(4)）。因此工业级实现的别名分析只能保守近似，牺牲精度以换取可计算性和实用性。

## 1. 别名分析的判定结果

传统别名分析把回答归纳为 `NoAlias`、`MayAlias`、`MustAlias` 三种，其中 `MayAlias` 是证据不足时的回退，`NoAlias` 与 `MustAlias` 都需要证据。LLVM 的 `AliasResult` 在此之外多一个 `PartialAlias`，已知两次访问的内存有重叠、起始地址未必相同，仅当查询携带访问大小时才会返回。`MustAlias` 只保证起始地址相同，不表示两个指针比较相等（[LLVM AliasAnalysis 文档](https://llvm.org/docs/AliasAnalysis.html)）。

---

## 2. 判定结果支持的优化

`NoAlias` 让编译器把两次访问视为互不影响。重排 load 与 store、把循环内的 load 提升到循环外、向量化前确认两组访问不重叠，这些优化都以 `NoAlias` 为前提。`MustAlias` 保证两次访问指向的内存对象从同一地址开始，一次读取的结果可以替换另一次，一次写入的值可供另一处读取。

`MayAlias` 是保守结果，只保证分析正确，凡是要求 `NoAlias` 的优化都无法进行。修改与引用信息（mod/ref）仍然可用。两个只读调用之间即使访问的地址完全一样，也能判定为无读写依赖。

---

## 3. restrict 如何变成不别名假设

restrict（C99）是程序员对编译器的承诺。在声明该指针的块执行期间，若经该指针访问并修改某个对象，则其余访问该对象的左值也必须基于该指针。编译器据此假设经该指针的访问与经其他指针的访问不别名，违反该约束是未定义行为（undefined behavior）。

C++ 标准没有 restrict，GCC 与 Clang 提供 `__restrict` 扩展，GCC 还允许将其用于引用类型（[GCC Restricted Pointers](https://gcc.gnu.org/onlinedocs/gcc/Restricted-Pointers.html)）。LLVM 处理这类承诺有两种方式。函数参数上的 restrict 对应为 `noalias` 参数属性。更细的作用域用 `!alias.scope` 与 `!noalias` 元数据表达，由 ScopedNoAliasAA 处理。同一 domain 内，一条访问的 `!noalias` 集合包含另一条访问的全部 `!alias.scope` 时，两者判为 `NoAlias`（[ScopedNoAliasAA.cpp](https://github.com/llvm/llvm-project/blob/main/llvm/lib/Analysis/ScopedNoAliasAA.cpp)）。

---

## 参考资料

- Landi，Undecidability of Static Analysis（LOPLAS 1(4)，1992）：<https://doi.org/10.1145/161494.161501>
- LLVM 项目，LLVM Alias Analysis Infrastructure：<https://llvm.org/docs/AliasAnalysis.html>（Must/May/No 三档与 PartialAlias 的语义、查询要求）
- LLVM 源码 `llvm/lib/Analysis/ScopedNoAliasAA.cpp`：<https://github.com/llvm/llvm-project/blob/main/llvm/lib/Analysis/ScopedNoAliasAA.cpp>（`!alias.scope` 与 `!noalias` 的匹配规则）
- Clang 源码 `clang/lib/CodeGen/CGCall.cpp`：<https://github.com/llvm/llvm-project/blob/main/clang/lib/CodeGen/CGCall.cpp>（restrict 参数对应为 `noalias` 属性）
- GCC 项目，Restricted Pointers：<https://gcc.gnu.org/onlinedocs/gcc/Restricted-Pointers.html>（C++ 里的 `__restrict` 扩展）
- ISO/IEC 9899:1999（C99）6.7.3.1，N1256 委员会草案：<https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1256.pdf>（restrict 的定义与违约为未定义行为）
