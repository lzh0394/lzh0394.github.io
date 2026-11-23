---
title: "控制流语句的种类"
slug: "control-flow-statements"
date: "2026-10-20"
tags: ["编程语言"]
draft: false
summary: "从「改变执行次序的方式」出发给控制流语句分类：顺序与复合、选择、迭代、跳转、异常、作用域退出钩子、挂起与恢复；对照 C、C++、Rust、Go、Zig、Java、Python、JavaScript 的官方规范落点，并单列版本差异（C++11/17/20/23/26、Java 5/7/14/21、Python 3.8/3.10/3.11/3.14、Go 1.22/1.23、Rust 1.13/1.39/1.65、ES2015/2018/2019）。"
---

> 分类骨架取自 C++ 工作草案第 8 章 [\[stmt\]](https://eel.is/c++draft/stmt) 与 C23 草案 6.8 节，其余语言按各自官方规范对照。C++ 引的是现行工作草案（<https://eel.is/c++draft/>，2026-08 快照，C++29 方向）；涉及 C++26 才有的语句时单独标注。

---

## 1. 边界：什么算控制流语句

语句默认按书写顺序逐条执行。C++ 草案 [\[stmt.pre\]](https://eel.is/c++draft/stmt.pre) 第 1 段把这句写成规范措辞：Except as indicated, statements are executed in sequence. 控制流语句就是那些「另有指示」的语句——它们改变下一条要执行的语句是哪条。

任何控制流机制都在回答三个问题之一：走哪条分支（选择）、同一段代码执行几遍（迭代）、从当前位置提前离开并去哪里（跳转、返回、抛出、挂起）。

按规范的语句分类，C++ 第 8 章有：带标签语句、表达式语句、复合语句、选择语句、迭代语句、展开语句（C++26）、跳转语句、断言语句（C++26）、声明语句、try 块。C23 草案 6.8 节只有 labeled、compound、expression、selection、iteration、jump 六类——异常处理不在其中，因为 C 没有 `try`。

先记住三组术语边界，后面反复要用：

- 语句与表达式。Rust 里几乎所有控制流都是表达式，`if`、`match`、`loop` 都能产生值；C/C++/Java/Python 里 `if` 是语句。Java 14 起 `switch` 同时有语句与表达式两种形式；C++ 的 `throw` 是表达式，Java 的 `throw` 是语句，Python 的 `raise` 是简单语句。
- 语句与声明。C++ 的 `for` 头部可以放声明（init-statement），Python 的 `for` 目标是赋值目标，不是声明。
- 控制流与作用域退出。`defer`、析构函数、`with` 不是「跳转」，但它们在离开作用域时插入一段执行，效果等价于 `finally`，所以讨论控制流时绕不开。

按控制手段分，常见类别如下。

| 类别 | 作用 | 典型形式 |
| --- | --- | --- |
| 顺序与复合 | 打包语句、建立作用域 | `{ ... }` |
| 选择 | 按条件挑一条分支 | `if`、`switch`、`match`、`?:` |
| 迭代 | 重复执行一段 | `while`、`do-while`、`for`、range-for |
| 跳转 | 无条件转移控制 | `break`、`continue`、`return`、`goto` |
| 异常 | 沿调用栈向上转移并展开 | `throw`/`try`/`catch`/`finally` |
| 挂起与恢复 | 保存执行点，之后从同一点继续 | `co_await`、`await`、`yield` |
| 作用域退出钩子 | 离开作用域时自动执行 | `defer`、`errdefer`、`with`、析构函数 |

传统教材只说「顺序、选择、循环」三类，把跳转当作破坏结构化的例外。这个三分法对应 Böhm 与 Jacopini 1966 年的结论：任何流程图都可以改写成只用顺序、选择与 while 循环的形式（代价是可能重复代码）。goto 因此不是必需的——但 C、C++、Go 仍然保留它，理由通常是错误处理与生成代码。

---

## 2. 选择语句

### 2.1 if

C 系的基本形状是 `if (cond) statement else statement`，else 与最近的未配对 if 结合（C++ [\[stmt.if\]](https://eel.is/c++draft/stmt.if) 第 1 段把这点写成规范要求，否则程序 ill-formed）。差异在于条件位置能放什么：

- C/C++/Java：条件可以是任意可转 bool 的表达式；C++ 还可放声明（`if (auto [k, v] = m.find(x); ...)`，C++17 起）与结构化绑定。
- Go：条件必须是 bool，不接受整数；没有三元运算符，只有 if。
- Rust：`if` 是表达式，两个分支类型必须一致；`if let` 把模式匹配塞进条件位置，`else if let` 可串联。
- Python：`if` 是复合语句，`elif` 是语法糖，套件靠缩进界定。
- C++17：`if constexpr` 的条件必须是常量表达式，未选中的分支成为 discarded statement，在模板实例化时不实例化。
- C++23：`if consteval`，在明显常量求值的上下文里走第一分支，否则走 else（[\[stmt.if\]](https://eel.is/c++draft/stmt.if) 第 4–5 段）。

`switch` 之外还有条件表达式：C/C++/Java/JS 用 `?:`，Python 用 `x if c else y`，Rust 直接用 `if` 表达式，Go 没有。

### 2.2 switch 与 match

多路分支有两套血统：C 系的 `switch` 与模式匹配的 `match`。

C/C++/Java/JS 的 `switch` 本质是「跳转表加贯穿」：`case` 标签只标位置，执行完一个分支不会自动停下，需要 `break`。C++17 起可以用 `[[fallthrough]]` 声明「故意贯穿」，编译器据此不再告警。C++ 的 `case` 标签要求整型常量表达式，switch 条件可带初始化语句（C++17 起）。

Go 把默认行为反了过来：每个 case 结束即跳出，需要贯穿时显式写 `fallthrough`；`switch { case cond: }` 形式等价于 if-else 链，`switch x := f(); x` 可带初始化，另有 `type switch`。Zig 的 `switch` 同样是表达式、无贯穿，还支持区间与类型分支。

Java 的演进最明显：Java 14 的 switch 表达式（JEP 361）引入 `->` 分支与 `yield` 返回值，Java 21 的模式匹配（JEP 441）让 case 可以带类型模式与 `when` 守卫。Python 3.10 的 `match`（PEP 634）是语句而非表达式，有模式、守卫与捕获绑定，没有贯穿。Rust 的 `match` 是表达式，分支必须穷尽，`_` 兜底；绑定与守卫都在模式里完成。

JS 的 `switch` 保持 C 的形状，贯穿靠 `break` 阻断——漏写 break 仍是常见 bug。

---

## 3. 迭代语句

循环按「何时判断条件」与「怎么推进」分成四类。

1. 前测试：`while (cond)`，条件假则一次也不执行。C/C++/Java/JS/Python/Rust/Zig 都有；Go 没有 `while`，写成 `for cond {}`。
2. 后测试：`do { } while (cond)`，至少执行一次。C/C++/Java/JS 有；Go、Rust、Python、Zig 都没有。
3. 三段式计数：`for (init; cond; post)`。C/C++/Java/JS/Go 有；Python 与 Rust 没有，用遍历代替。
4. 遍历：对区间、容器或迭代器逐个取值。C++ 的 range-for（C++11 起）、Java 的 enhanced for（Java 5 起）、Python 的 `for ... in`、JS 的 `for-of`/`for-in`、Go 的 `for range`、Rust 的 `for pat in expr`、Zig 的 `for`。

各语言的独有细节：

- Go 的 `for` 是唯一循环关键字，四种形态共用：`for {}`、`for cond {}`、`for init; cond; post {}`、`for range`。Go 1.22 起 `range` 可遍历整数，1.23 起可遍历函数（range-over-func 迭代器）。
- Python 的循环可以带 `else`：循环正常结束才执行，`break` 跳过它。这是 Python 独有语法。
- Rust 的 `loop` 是无限循环，且可 `break value` 从循环返回值；`while let` 在模式匹配成功时继续。Rust 1.65 的 `let-else` 是语句层面的新增形式：`let Some(x) = opt else { return; };`。
- Zig 的 `while` 可带 `: (i += 1)` 形式的 continue 表达式，也可带 `else`（条件为可选值且为空时执行）；`for` 可带 `if` 过滤。
- JS 的 `for-in` 枚举属性名（含原型链上的可枚举属性），`for-of` 迭代值；`for await...of`（ES2018）用于异步迭代。

---

## 4. 跳转语句

跳转是无条件转移控制。C++ [\[stmt.jump\]](https://eel.is/c++draft/stmt.jump) 的语法是 `break`、`continue`、`return`、`co_return`、`goto` 五种，共性是「无条件」，区别是去向。

`break` 退出最近的循环或 switch。C/C++ 的 break 不能带标签，只能退最内层；Java 的 `break label` 可跳出任意带标签语句；Go 的 `break Label` 只能跳出带标签的 for/switch/select；Rust 的 `break 'label` 跳出外层循环、`break value` 从 loop 返回值；Zig 的 `break :label` 可跳出带标签的块或循环。

`continue` 跳过本次迭代的剩余部分。Java 与 Go 支持 `continue label`；Rust 支持 `continue 'label`；C/C++ 没有标签形式。

`return` 从函数返回。C++ 里 return 是跳转语句；Rust 里 return 是表达式，所以可以出现在 `let x = if c { return 1; } else { 2 };` 这种位置。C++20 协程用 `co_return`（[\[stmt.return.coroutine\]](https://eel.is/c++draft/stmt.return.coroutine)），且协程体内不允许出现 `return`——两者互斥。

`goto` 只存在于 C、C++、Go。C++ 的 goto 不能跳过带非平凡初始化的声明，否则 ill-formed；Go 的 goto 不能跳进变量作用域（跳转点不能引入跳转时尚不在作用域的变量）。Java 把 `goto` 保留为关键字却不用，跳转靠 labeled break/continue；Python、Rust、JS、Zig 都没有 goto。

`yield` 有两个不相干的含义，容易混：Python 与 JS 生成器里的 `yield` 是「产出值并挂起」；Java 14 的 `yield` 是 switch 表达式里返回值的关键字，与生成器无关。

---

## 5. 异常与清理

异常是「沿调用栈向上转移」的非局部控制流：`throw` 之后，控制权不回到调用点的下一条语句，而是逐层展开栈，直到遇到匹配的处理器。展开过程中要执行的清理动作，就把异常和「作用域退出钩子」绑在了一起。

各语言的路线：

- C++：`throw` 表达式加 try 块。异常展开时析构函数自动执行，这是 RAII 的基础。
- Java：`throw` 语句、try/catch/finally；Java 7 起 try-with-resources 自动关闭资源。
- Python：`raise` 简单语句、try/except/else/finally；3.11 起增加 `except*` 处理异常组（PEP 654）。
- JS：throw/try/catch/finally；ES2019 起 `catch` 可省略绑定。
- Go：没有异常。函数返回 error 值，调用方显式检查；`panic`/`recover` 只作兜底，`defer` 负责清理。
- Rust：没有 try/catch 语句。错误用 `Result` 与 `?` 运算符传递；`panic` 默认 unwind，可用 `catch_unwind` 拦截，但没有语言级 catch。
- Zig：错误是 error union 的一部分，`try`/`catch` 是表达式；没有异常。
- C：只有 `setjmp`/`longjmp` 这类库设施，不是语句。

清理钩子不是跳转语句，但承担了 `finally` 的职责：

- C++：析构函数，作用域退出（含异常展开）时自动执行。
- Go：`defer`，函数返回时按后进先出执行。
- Zig：`defer` 在块退出时执行，`errdefer` 只在错误返回时执行。
- Python：`with` 语句，语义上是 try/finally 的封装，3.10 起支持括号内的多个上下文管理器。
- Java：try-with-resources（Java 7 起）与 finally。
- JS：只有 try/finally，没有 RAII。

断言是特殊一类：Java 的 `assert`（JLS 14.10）、Python 的 `assert`、C 的 `assert` 宏、Rust 的 `assert!`/`debug_assert!`、C++26 的 `contract_assert`（[\[stmt.contract.assert\]](https://eel.is/c++draft/stmt.contract.assert)）。断言失败不是「正常」控制流，通常直接抛出或中止；Go 与 Zig 没有内建断言语句。

---

## 6. 挂起与恢复

生成器与协程把「执行点」保存下来，稍后从同一点继续，这是与跳转最本质的区别：跳转是单向的，挂起是可恢复的。

- 生成器：Python 的 `yield`、JS 的 `function*` 加 `yield`。单向产出，调用方用 `next()` 推进一步。
- 协程：C++20 的 `co_await`、`co_yield`、`co_return`；Python 3.5 起的 `async`/`await`（PEP 492）；JS 的 async/await（ES2017）；Rust 的 async/await（1.39）。
- C++ 的 `co_await` 与 `co_yield` 是表达式，`co_return` 是跳转语句；函数体里出现三者中任何一个，函数就成为协程。

Go 的 `go` 语句是并发原语而非协程挂起：goroutine 一旦启动就独立运行，函数内部没有「暂停当前栈」的语句。Go 的 `select` 同样如此，它是等待多个通道操作的控制结构，归在并发原语里更合适。

---

## 7. 跨语言对照

下表按「控制流需求」列，不追求列出每个语言的完整语法，只标要不要得到、叫什么。

分支与循环（C、C++、Rust、Go）：

| 需求 | C | C++ | Rust | Go |
| --- | --- | --- | --- | --- |
| 条件分支 | if/else | if、if constexpr、if consteval | if、if let（表达式） | if（条件须 bool） |
| 多路分支 | switch（贯穿） | switch（贯穿，`[[fallthrough]]`） | match（表达式，穷尽） | switch（默认不贯穿，`fallthrough` 显式）、type switch |
| 前测循环 | while | while | while、while let | for 条件形式 |
| 后测循环 | do-while | do-while | 无 | 无 |
| 三段式计数 | for(;;) | for(;;) | 无 | for 三段式 |
| 遍历 | 无（手写指针） | range-for（11 起） | for-in | for range |
| 无限循环 | for(;;) | for(;;) | loop | for {} |

分支与循环（Zig、Java、Python、JavaScript）：

| 需求 | Zig | Java | Python | JavaScript |
| --- | --- | --- | --- | --- |
| 条件分支 | if（表达式） | if/else | if/elif/else | if/else |
| 多路分支 | switch（表达式，无贯穿） | switch 语句/表达式（14 起），模式匹配（21 起） | match（3.10 起） | switch（贯穿） |
| 前测循环 | while | while | while（可带 else） | while |
| 后测循环 | 无 | do-while | 无 | do-while |
| 三段式计数 | 无 | for(;;) | 无 | for(;;) |
| 遍历 | for | enhanced for（5 起） | for-in | for-of、for-in |
| 无限循环 | while (true) | for(;;) | while True | for(;;) |

跳转、返回与清理（C、C++、Rust、Go）：

| 需求 | C | C++ | Rust | Go |
| --- | --- | --- | --- | --- |
| 提前退出 | break | break | break（可带值） | break |
| 跳过本次 | continue | continue | continue | continue |
| 跳转 | goto | goto | 无 | goto（有作用域限制） |
| 函数返回 | return | return | return（表达式） | return |
| 非局部转移 | setjmp/longjmp（库） | 异常 | panic（无语言级 catch） | panic/recover |
| 清理钩子 | 无 | 析构（RAII） | Drop | defer |
| 挂起与恢复 | 无 | 协程（20 起） | async/await（1.39 起） | go/select（并发原语） |

跳转、返回与清理（Zig、Java、Python、JavaScript）：

| 需求 | Zig | Java | Python | JavaScript |
| --- | --- | --- | --- | --- |
| 提前退出 | break | break（可带标签） | break | break（可带标签） |
| 跳过本次 | continue | continue（可带标签） | continue | continue（可带标签） |
| 跳转 | 无 | 无（labeled break/continue） | 无 | 无（labeled break/continue） |
| 函数返回 | return | return | return | return |
| 非局部转移 | 错误值 | 异常 | 异常 | 异常 |
| 清理钩子 | defer/errdefer | finally、try-with-resources | with、finally | finally |
| 挂起与恢复 | 无 | 无 | async/await（3.5 起） | async/await、生成器 |

---

## 8. 容易混淆的几处

switch 是否贯穿。C/C++/Java/JS 默认贯穿，Go/Zig 默认不贯穿。C++17 的 `[[fallthrough]]` 只是告诉编译器「这是故意的」，不改变语义。

for 的三套语义。三段式 for 是「初始化、判断、推进」的循环；遍历式 for 是「取下一个元素直到取完」的迭代；Rust 的 `for` 是 `IntoIterator` 的语法糖。三者不能互相套用：C 的 for 循环变量在循环结束后仍可见（C99 起可在 init 里声明，作用域限于循环），Python 的循环变量在循环结束后保留，Rust 的循环变量每次迭代重新绑定。

break 的标签。Java 的 `break label` 能跳出任意带标签语句，Go 的 `break Label` 只能跳出标签标注的 for/switch/select，Rust 与 Zig 的标签只标循环或块，C/C++ 根本没有标签形式。

goto 的存废。Java 保留关键字但禁用；Go 保留但限制跳转不越过变量声明；C++ 限制跳转不越过带初始化的声明。这些限制都是在防「跳到一半、变量未初始化」的未定义行为。

异常与语句。C++ 的 `throw` 是表达式，所以能出现在 `a ? throw 1 : 2` 这种位置；Python 的 `raise` 是简单语句；Go 的 `panic` 是内建函数，不是语句。

defer 与 with 不是跳转。它们挂在作用域退出上，控制权仍然按 return/break/异常的正常路径走，只是附加了清理动作。

---

## 9. 版本差异

只列「语句种类或形态发生变化」的节点，不列语义微调。

C++ 与 C：

| 语言 | 变化 | 版本 |
| --- | --- | --- |
| C++ | range-for 进入标准 | C++11 |
| C++ | if/switch 的 init-statement；`if constexpr` | C++17 |
| C++ | 协程：`co_await`、`co_yield` 为表达式，`co_return` 进入跳转语句 | C++20 |
| C++ | `if consteval` | C++23 |
| C++ | 展开语句 `template for`；`contract_assert` | C++26 |
| C | 语句类别（labeled/compound/expression/selection/iteration/jump）自 C89 未增删；C99 允许声明与语句混排，C23 未新增控制流语句 | C89–C23 |

Java 与 Python：

| 语言 | 变化 | 版本 |
| --- | --- | --- |
| Java | enhanced for | 5 |
| Java | try-with-resources | 7 |
| Java | switch 表达式与 `yield`（JEP 361） | 14 |
| Java | 模式匹配 switch（JEP 441） | 21 |
| Python | `continue` 在 `finally` 中合法（此前非法） | 3.8 |
| Python | `match`（PEP 634） | 3.10 |
| Python | `except*`（PEP 654） | 3.11 |
| Python | `except` 多类型可省括号（PEP 758）；`finally` 中 `return`/`break`/`continue` 发 SyntaxWarning（PEP 765） | 3.14 |

Go、Rust 与 JavaScript：

| 语言 | 变化 | 版本 |
| --- | --- | --- |
| Go | `range` 可遍历整数 | 1.22 |
| Go | `range` 可遍历函数（迭代器） | 1.23 |
| Rust | `?` 运算符 | 1.13 |
| Rust | async/await | 1.39 |
| Rust | `let-else` | 1.65 |
| JS | `for-of` | ES2015 |
| JS | `for await...of` | ES2018 |
| JS | `catch` 可省略绑定 | ES2019 |

版本标记的依据要分清：C++ 以草案条款与提案为准（草案不等于正式标准，正式文本是 ISO/IEC 14882）；Python 以文档里的 Changed in version 标注为准；Java 以 JEP 为准；Go 以语言规范的 Go 1.x 标注为准；ECMAScript 以提案进入的版本为准。

---

## 参考

- C++ 草案第 8 章：<https://eel.is/c++draft/stmt>，子条款 [\[stmt.pre\]](https://eel.is/c++draft/stmt.pre)、[\[stmt.jump\]](https://eel.is/c++draft/stmt.jump)、[\[stmt.if\]](https://eel.is/c++draft/stmt.if)、[\[stmt.expand\]](https://eel.is/c++draft/stmt.expand)、[\[stmt.contract.assert\]](https://eel.is/c++draft/stmt.contract.assert)。
- C23 草案：WG14 文档页 <https://www.open-std.org/jtc1/sc22/wg14/www/docs/>，语句部分见 6.8 节。
- Go 语言规范：<https://go.dev/ref/spec#Statements>。
- Rust Reference：<https://doc.rust-lang.org/reference/statements-and-expressions.html> 与 <https://doc.rust-lang.org/reference/expressions.html>。
- Python 语言参考：<https://docs.python.org/3/reference/compound_stmts.html> 与 <https://docs.python.org/3/reference/simple_stmts.html>。
- Java 语言规范第 14 章：<https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html>。
- ECMAScript 语句部分：<https://tc39.es/ecma262/#sec-statements>。
- Zig 语言参考：<https://ziglang.org/documentation/master/>。
