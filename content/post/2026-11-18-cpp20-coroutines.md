---
title: "C++20 协程的语言机制"
slug: "cpp20-coroutines"
date: "2026-11-18"
tags: ["C++", "协程", "异步"]
series: "异步与协程"
series_order: 2
draft: false
summary: "拆解 C++20 协程的编译器改写：协程帧的布局与分配、promise_type 的接口、co_await 的展开顺序、await_suspend 的三种返回、对称转移、异常与取消，以及引用参数、临时量、final_suspend 和跨线程恢复引发的生命周期问题。"
---

> 范围：C++20 协程的语言层机制，不展开任务库与 I/O 库的设计。条款引用以 C++26 最终草案 N5050 为准，C++20 措辞用 N4861 对照；提案以 WG21 编号标注。
>
> 本文是系列第 2 篇。第 1 篇比较异步模型，第 3 篇讨论任务库的设计空间，第 4 篇讨论异步 I/O、执行器与 senders/receivers。

## 0. 结论摘要

1. 函数体出现 `co_await`、`co_yield` 或 `co_return` 时，该函数成为协程。编译器把它改写成状态机，并生成一块协程帧保存跨挂起点的状态。
2. 协程帧包含 promise 对象、参数副本、局部变量、跨挂起点的临时量、挂起状态与恢复函数指针。帧大小在编译期确定，分配可以省略，标准不保证。
3. 返回类型通过 `std::coroutine_traits` 找到 `promise_type`。返回对象由 `get_return_object` 生成，在 `initial_suspend` 之前交给调用者。
4. `initial_suspend` 决定协程是立即执行还是延迟启动；`final_suspend` 决定结束后帧由谁销毁。`final_suspend` 必须不抛异常，返回 `suspend_never` 时帧自动销毁。
5. `co_await` 先取 awaiter，再依次调用 `await_ready`、`await_suspend`、`await_resume`。`await_ready` 为真时整段挂起逻辑被跳过。
6. `await_suspend` 返回 `void` 表示挂起，返回 `bool` 决定是否挂起，返回 `coroutine_handle` 表示对称转移：当前协程保持挂起，控制权直接交给另一个协程。
7. 对称转移把「恢复下一个协程」变成尾调用，避免恢复链增长调用栈；`std::noop_coroutine` 用作没有续接者时的安全目标。
8. 异常不会穿过挂起点自动传播。协程体内的异常交给 `unhandled_exception`，任务类型通常把它存进 `exception_ptr`，在 `await_resume` 中重抛。
9. 取消不是语言特性。语言只提供挂起与恢复，取消要靠 `std::stop_token`、库的取消槽或 promise 中的状态实现，并且是协作式的。
10. 最常见的错误集中在生命周期：引用参数、被捕获的 `this`、`final_suspend` 后继续恢复、销毁正在运行的帧，以及在另一个线程恢复时缺少同步。

---

## 1. 语言定位

### 1.1 三个关键字与识别规则

一个函数满足下面任一条件就是协程：

- 函数体包含 `co_await` 表达式。
- 函数体包含 `co_yield` 表达式。
- 函数体包含 `co_return` 语句。

识别发生在语法层，与返回类型无关。普通函数也可以返回一个带 `promise_type` 的类型，只要函数体里没有上述关键字，它就不是协程。

`co_yield e` 等价于 `co_await promise.yield_value(e)`。`co_return e` 调用 `promise.return_value(e)`，`co_return;` 调用 `promise.return_void()`，随后进入最终挂起点。promise 定义了 `return_void` 时，函数体执行到末尾等价于 `co_return;`。

### 1.2 与协程 TS 的关系

C++20 协程来自 Coroutines TS（ISO/IEC TS 22277:2017）。P0912R5 把 TS 合并进 C++20 工作草案；合并后的草案包含对称转移与 `std::noop_coroutine` 等机制。语言只规定改写规则与接口约定，不提供任务类型、生成器或调度器；这些由库实现。

因此 C++20 的「协程」是一套编译器与库之间的协议，标准库没有提供开箱可用的 async/await。标准库在 C++20 只在 `<coroutine>` 中提供 `coroutine_handle`、`coroutine_traits`、`suspend_always`/`suspend_never` 与 `noop_coroutine`，任务类型要自己写或使用第三方库。

### 1.3 无栈、对称、可恢复

无栈（stackless）指协程没有独立栈，挂起时只保存帧中的状态。协程不能在普通函数调用的中间挂起，挂起点必须写在协程体内。

对称（symmetric）指协程可以把控制权直接交给另一个协程，而不必返回恢复者。对称转移让协程链的恢复不消耗调用栈。

可恢复（resumable）指挂起后可以通过 `coroutine_handle::resume` 从挂起点继续。恢复者可以是事件循环、线程池、另一个协程或当前线程。

---

## 2. 协程帧

### 2.1 帧里有什么

协程帧（coroutine frame）是编译器生成的堆上对象，逻辑上包含以下区域：

| 区域 | 内容 | 生命周期 |
| --- | --- | --- |
| promise | `promise_type` 的对象 | 帧创建到帧销毁 |
| 参数 | 按值参数的副本、引用参数的引用 | 帧创建到帧销毁 |
| 局部变量 | 跨挂起点仍然存活的自动变量 | 进入作用域到离开作用域 |
| 临时量 | 跨挂起点使用的临时对象 | 所在完整表达式结束 |
| 挂起状态 | 当前挂起点、恢复位置 | 每次挂起更新 |
| 控制信息 | `resume`、`destroy` 函数指针 | 帧创建到帧销毁 |

帧的实际布局由实现决定，标准不规定大小与对齐。编译器只把「跨挂起点仍然需要」的变量放进帧；不跨挂起点的变量仍可放在寄存器或普通栈上。

### 2.2 分配与释放

协程帧通过 `operator new` 分配。查找顺序如下：

1. 如果 `promise_type` 定义了匹配的 `operator new`，使用它。
2. 否则使用全局 `operator new`。
3. 对应的 `operator delete` 在帧销毁时调用，查找规则相同。

分配大小由编译器计算，包含帧的全部区域。实现可以省略这次分配，把帧放到调用者的栈上或直接优化掉；标准允许省略，即使 `operator new` 有可观察副作用。依赖「一定发生一次分配」的计数器或内存统计不可移植。

如果 `promise_type` 定义了 `get_return_object_on_allocation_failure`，编译器使用不抛异常的分配形式，失败时直接返回该函数的结果，不进入协程体。

### 2.3 生命周期时间线

一次协程调用按下面的顺序推进：

1. 分配协程帧。
2. 把参数复制或移动到帧中。
3. 在帧中构造 `promise_type`。
4. 调用 `get_return_object()` 生成返回对象。
5. `co_await` `initial_suspend()`。若挂起，控制权返回调用者。
6. 执行协程体，遇到 `co_await` 时可能挂起。
7. 执行 `co_return` 或到达函数体末尾，调用 `return_void`/`return_value`。
8. `co_await` `final_suspend()`。若不挂起，帧自动销毁；若挂起，帧保留，等待拥有者销毁。
9. 帧销毁时，局部变量与参数按构造逆序析构，promise 析构，内存释放。

第 5 步决定了协程是「惰性」还是「立即执行」。第 8 步决定了谁拥有帧：返回对象、续接者或执行器。

---

## 3. promise_type

### 3.1 接口

`promise_type` 是协程与返回类型之间的契约。编译器按需调用下表成员，缺少必需成员会产生编译错误。

| 成员 | 是否必需 | 作用 |
| --- | --- | --- |
| `get_return_object` | 必需 | 生成返回给调用者的对象 |
| `initial_suspend` | 必需 | 决定是否立即执行 |
| `final_suspend` | 必需 | 决定结束后是否挂起 |
| `return_void` | 二选一 | `co_return;` 的落点 |
| `return_value` | 二选一 | `co_return e;` 的落点 |
| `unhandled_exception` | 必需 | 处理逃出协程体的异常 |
| `yield_value` | 可选 | `co_yield` 的落点 |
| `await_transform` | 可选 | 改写 `co_await` 的操作数 |
| `operator new` | 可选 | 定制帧分配 |
| `get_return_object_on_allocation_failure` | 可选 | 分配失败时的返回对象 |

`return_void` 与 `return_value` 不能同时定义。两者都不定义，或返回值类型与 `co_return` 不匹配，程序不符合标准。

### 3.2 get_return_object

`get_return_object` 在 `initial_suspend` 之前调用，返回的对象就是调用者看到的协程句柄包装。典型实现从 `this` 构造 `coroutine_handle`：

```cpp
task get_return_object() {
  return task{std::coroutine_handle<promise_type>::from_promise(*this)};
}
```

返回对象通常只保存一个 `coroutine_handle`，大小为一个指针。它决定帧的所有权：析构时是否 `destroy`、移动时如何转移、是否允许复制。这些选择属于任务库设计，第 3 篇展开。

### 3.3 initial_suspend 与 final_suspend

两个挂起点各有两种常见选择：

| `initial_suspend` | 行为 | 适用 |
| --- | --- | --- |
| `suspend_always` | 调用后立即返回，协程体尚未执行 | 惰性任务、生成器 |
| `suspend_never` | 立即执行到第一个挂起点或结束 | 立即启动的任务 |

| `final_suspend` | 行为 | 适用 |
| --- | --- | --- |
| `suspend_always` | 结束后保留帧，由拥有者销毁 | 需要读取结果或续接 |
| `suspend_never` | 结束后自动销毁帧 | 不需要结果、无续接 |

`final_suspend` 返回的 awaiter 必须满足不抛异常的等待要求：`await_ready`、`await_suspend`、`await_resume` 以及 `final_suspend()` 本身都不能抛异常，否则程序不符合标准。返回 `suspend_never` 时，协程结束后帧立即销毁，此后任何 `resume` 或 `destroy` 都是未定义行为。

### 3.4 return_void 与 return_value

`co_return;` 调用 `return_void()`。`co_return e;` 调用 `return_value(e)`，实参按 `e` 的值类别传递。任务类型通常在 `return_value` 中把结果存入 promise 的 `optional` 或联合体。

函数体执行到末尾且没有 `co_return` 时，若 promise 定义了 `return_void`，等价于 `co_return;`；若只定义了 `return_value`，执行到函数体末尾在运行期是未定义行为。

### 3.5 unhandled_exception

协程体内的异常逃出函数体时，编译器在 `catch` 块中调用 `unhandled_exception()`。典型实现保存当前异常：

```cpp
void unhandled_exception() {
  error_ = std::current_exception();
}
```

`unhandled_exception` 自身抛出异常时，程序调用 `std::terminate`。它运行在异常处理上下文中，内部不应再抛。

保存异常后，协程进入最终挂起点。等待者恢复协程时，`await_resume` 检查 `error_` 并重抛，异常才回到调用链。第 6 节展开这条路径。

### 3.6 yield_value 与 await_transform

`co_yield e` 被改写为 `co_await promise.yield_value(e)`。`yield_value` 返回一个 awaiter，通常把值保存到 promise，然后挂起；生成器在下次 `resume` 时从 `co_yield` 之后继续。

`await_transform` 改写 `co_await` 的操作数。promise 定义它时，表达式 `co_await e` 先变成 `co_await promise.await_transform(e)`，再按 awaiter 协议处理。它常用于：

- 禁止在某个协程中直接 `co_await` 任意类型。
- 把 `sender` 转换成 awaiter。
- 给 `co_await` 注入执行器、取消令牌或分配器。

---

## 4. co_await 协议

### 4.1 展开顺序

对源码中的表达式 `co_await e`，编译器按下面的顺序生成代码：

1. 计算 `e`。
2. 如果 promise 有 `await_transform`，令 `e = promise.await_transform(e)`。
3. 如果 `e` 有成员或非成员 `operator co_await`，调用它得到 awaiter；否则 `e` 本身就是 awaiter。
4. 调用 `awaiter.await_ready()`。返回 `true` 时跳过挂起，直接进入第 7 步。
5. 调用 `awaiter.await_suspend(handle)`，`handle` 是当前协程的句柄。
6. 根据 `await_suspend` 的返回类型决定是否挂起、恢复哪个协程。
7. 协程恢复后调用 `awaiter.await_resume()`，其结果就是 `co_await` 表达式的结果。

`await_ready` 返回 `true` 时不调用 `await_suspend`，但 `await_resume` 仍会调用。这个分支用于「结果已经就绪」的快路径。

### 4.2 await_ready

`await_ready` 返回 `bool`，用于避免不必要的挂起。典型场景是结果已经在缓存中、锁已经被持有、或者操作可以同步完成。

它应当是轻量的。把耗时检查放进 `await_ready` 会阻塞调用线程，且这段代码不在挂起语义的保护下。

### 4.3 await_suspend 的三种返回

`await_suspend` 接收当前协程的 `coroutine_handle<promise_type>`，返回类型有三种语义：

| 返回类型 | 语义 |
| --- | --- |
| `void` | 无条件挂起，控制权返回恢复者 |
| `bool` | `true` 挂起；`false` 立即恢复当前协程 |
| `coroutine_handle<Z>` | 当前协程保持挂起，控制权转移给 `Z` |

返回 `bool` 的 `false` 分支用于「挂起条件在最后一刻失效」：经过 `await_ready` 与 `await_suspend` 的检查后，操作已经完成，不需要挂起。

返回句柄的分支就是对称转移。`await_suspend` 返回后，当前协程不会被恢复，控制权直接交给返回的句柄。

如果 `await_suspend` 抛出异常，当前协程被恢复，异常从 `co_await` 表达式重新抛出。挂起前已经发布出去的句柄需要由 awaiter 自己处理，否则可能被恢复两次。

### 4.4 await_resume

`await_resume` 在协程恢复后调用，返回值成为 `co_await` 的结果。它可以返回 `void`、值或引用。异常可以从这里抛出，沿协程的调用链传播。

对于任务类型，`await_resume` 通常做三件事：检查 `exception_ptr` 并重抛、取出结果、清理 awaiter 持有的临时状态。

### 4.5 一个最小 awaiter

下面的 awaiter 把当前协程交给一个队列，由另一个线程恢复：

```cpp
struct suspend_to_queue {
  std::queue<std::coroutine_handle<>>& q;

  bool await_ready() const noexcept { return false; }

  void await_suspend(std::coroutine_handle<> h) const {
    q.push(h);
  }

  void await_resume() const noexcept {}
};
```

`await_suspend` 返回 `void`，协程在 `q.push` 后挂起。恢复者从队列取出句柄并调用 `resume()`。队列的同步由实现负责，锁或无锁队列都可以。

### 4.6 await_transform 的优先级

promise 定义 `await_transform` 时，所有显式 `co_await` 的操作数都先经过它，包括本来可以直接作为 awaiter 的类型。若 `await_transform` 对某个类型没有合适的重载，编译失败。由 `co_yield`、初始挂起与最终挂起产生的隐式等待不经过 `await_transform` [expr.await]/3。

这个机制让任务类型可以限制可等待的类型集合，也带来一个常见问题：在协程中 `co_await` 一个普通 awaiter 时，如果 `await_transform` 只接受 sender，编译会失败。库通常提供恒等重载或 `as_awaitable` 适配。

---

## 5. 对称转移

### 5.1 恢复链

没有对称转移时，协程 A 等待协程 B 的完成，B 完成后在 `await_suspend` 中调用 `A.resume()`。A 恢复后可能继续等待 C，C 完成后再恢复 A。每次恢复都通过普通函数调用压栈，长链会消耗栈空间。

对称转移把「恢复下一个协程」变成 `await_suspend` 的返回值。编译器生成的代码在当前协程挂起后直接跳转到目标协程，当前栈帧不再保留。链式恢复的栈深度保持常数。

### 5.2 返回 handle

任务类型的 `final_suspend` 常用对称转移把控制权交给等待者：

```cpp
struct final_awaiter {
  bool await_ready() const noexcept { return false; }

  std::coroutine_handle<> await_suspend(
      std::coroutine_handle<promise_type> h) const noexcept {
    auto cont = h.promise().continuation;
    return cont ? cont : std::noop_coroutine();
  }

  void await_resume() const noexcept {}
};
```

`continuation` 是等待者句柄，在 `await_suspend` 中写入。没有等待者时返回 `noop_coroutine`，避免恢复空句柄。

### 5.3 noop_coroutine

`std::noop_coroutine()` 返回一个句柄，恢复它不做任何事，立即返回。它用于「必须返回一个句柄，但没有实际续接者」的场合，例如最终挂起点、调度器的空任务、对称转移的默认分支。

`noop_coroutine` 的帧是静态的，不需要销毁。把它的句柄与普通协程句柄混用是安全的，只要不调用 `destroy`。

---

## 6. 异常与取消

### 6.1 异常如何保存

协程体内的异常被 `unhandled_exception` 捕获后，通常保存为 `std::exception_ptr`。保存动作发生在最终挂起点之前，因此帧必须保留到等待者读取结果。

```cpp
void unhandled_exception() noexcept {
  error_ = std::current_exception();
}
```

把 `unhandled_exception` 声明为 `noexcept` 是常见做法：它内部只做保存，不抛出。

### 6.2 恢复时重抛

等待者的 `await_resume` 检查 `error_`：

```cpp
void await_resume() {
  if (error_) std::rethrow_exception(error_);
}
```

异常在恢复点重新抛出，沿等待者的调用链传播。协程帧在结果被取走后销毁；如果等待者提前销毁，任务对象的析构负责清理帧。

### 6.3 取消

语言没有取消指令。`co_await` 只能挂起与恢复，不能中断一个正在执行的协程。取消需要库在挂起点与恢复点检查状态：

- 使用 `std::stop_token` 查询是否请求停止。
- 在 `await_suspend` 中把停止回调注册到 `stop_source`。
- 在 `await_resume` 中检查停止状态，返回 `set_stopped` 或抛出取消异常。
- 组合算法在子操作失败时向其他子操作传播停止请求。

取消是协作式的：协程不检查，取消就不会生效。阻塞在系统调用里的操作还需要底层接口支持取消，例如关闭句柄、发送信号或使用支持取消的异步接口。

---

## 7. 生命周期陷阱

### 7.1 引用参数

引用参数在帧中保存引用，不保存对象副本。调用者传入临时对象或局部对象，协程挂起后对象销毁，恢复时引用悬垂：

```cpp
task<void> use(const std::string& s) {
  co_await something();   // 挂起，调用者可能已经离开作用域
  std::cout << s;         // s 可能已经销毁
}
```

按值传参会把对象复制或移动到帧中，生命周期与帧一致。需要引用时，调用者必须保证对象活到协程结束，或者用 `shared_ptr` 明确共享所有权。

### 7.2 临时量与完整表达式

协程帧会保存跨挂起点的临时量。`co_await f(std::string("tmp"))` 中的临时字符串在完整表达式结束时销毁，而完整表达式在恢复之后才结束，因此它在挂起期间仍然有效。

容易出错的是把临时对象的引用保存到帧外：

```cpp
const std::string& r = co_await get_string(); // get_string 返回临时对象
co_await something();
use(r); // 临时对象已销毁
```

引用的生命周期不随 `co_await` 延长。需要长期保存时，按值接收。

### 7.3 lambda 捕获

协程 lambda 的捕获对象保存在闭包中，闭包的生命周期由调用者决定。按引用捕获局部变量，协程挂起后变量销毁，恢复时悬垂。按值捕获 `this` 只保存指针，不延长对象生命周期。

```cpp
auto f = [&counter]() -> task<void> {
  co_await something();
  ++counter;   // counter 可能已经销毁
};
```

需要跨挂起点使用的外部状态，用值捕获、`shared_ptr` 或显式传入的所有权对象。

### 7.4 final_suspend 之后

`final_suspend` 返回 `suspend_always` 时，协程在结束后保持挂起。此时 `handle.done()` 返回 `true`，帧仍然有效，可以读取 promise 中的结果，也可以 `destroy`。再次 `resume` 是未定义行为。

`final_suspend` 返回 `suspend_never` 时，帧在结束后自动销毁，句柄立即失效。此后调用 `done`、`resume`、`destroy` 都是未定义行为。任务类型通常选择 `suspend_always`，由拥有者决定销毁时机。

### 7.5 销毁正在运行的帧

`coroutine_handle::destroy` 销毁帧并调用局部变量析构。对正在运行或已经销毁的帧调用 `destroy` 是未定义行为。销毁一个挂起的帧是允许的，前提是挂起点之后不会再被恢复。

取消与销毁的顺序因此很重要：先撤销在途操作的回调注册，再销毁帧。操作完成回调可能在另一个线程排队，帧销毁后回调再访问句柄会造成 use-after-free。

### 7.6 跨线程恢复

协程帧不是线程安全的容器。协程在 A 线程挂起、在 B 线程恢复时，B 线程必须通过同步操作看到 A 线程写入的帧状态。执行器的任务队列通常提供这种同步：A 把句柄放入队列，队列的互斥量或原子操作建立 happens-before。

如果 awaiter 自己保存句柄并在另一个线程恢复，需要保证：

- 句柄只被恢复一次。
- 恢复前帧没有被销毁。
- 帧内数据的写入与读取之间有同步关系。

---

## 8. 标准库设施

### 8.1 coroutine_handle 与 coroutine_traits

`std::coroutine_handle<P>` 是对协程帧的轻量句柄，通常只含一个指针。主要操作：

- `resume()`：从当前挂起点恢复。
- `destroy()`：销毁帧。
- `done()`：是否停在最终挂起点。
- `promise()`：访问 promise 对象。
- `from_promise(p)`：从 promise 构造句柄。
- `address()`：取底层地址。

`std::coroutine_handle<>` 擦除 promise 类型，只保留恢复与销毁能力。对称转移常使用这个类型，因为续接者不需要知道对方的 promise 类型。

`std::coroutine_traits<R, Args...>` 把返回类型与参数映射到 `promise_type`。默认实现取 `R::promise_type`；特化它可以支持没有嵌套类型的返回类型。

### 8.2 std::generator

C++23 加入 `std::generator`（P2502R2），定义在 `<generator>`。它把同步生成器写成协程：

```cpp
std::generator<int> iota(int n) {
  for (int i = 0; i < n; ++i) {
    co_yield i;
  }
}
```

`std::generator<T>` 满足 `input_range`，迭代器在 `++` 时恢复协程，在 `*` 时读取当前值。它支持嵌套生成器、分配器与元素引用，初始挂起、最终挂起都由标准规定。

生成器是同步的：调用 `begin()` 的线程执行协程体，没有调度器参与。它适合把递归遍历、分页读取、惰性序列写成顺序代码。

### 8.3 std::execution::task

C++26 在 `std::execution` 中加入 `task`（P3552R3），定义在 `<execution>`。它是一个 sender，也是协程的返回类型：

- `initial_suspend` 返回 `suspend_always`，任务在 `start` 时才执行。
- `co_return` 的值通过 `set_value` 完成，异常通过 `set_error(exception_ptr)` 完成，停止通过 `set_stopped` 完成。
- 完成签名至少包含 `set_value_t(T)`、`set_error_t(exception_ptr)` 与 `set_stopped_t()`。
- promise 提供 `await_transform(Sender&&)`，在 task 协程内可以直接 `co_await` 一个 sender，内部用 `as_awaitable` 转换。
- 帧在完成接收者之前销毁，接收者拿到的结果已经脱离协程帧。

### 8.4 标准缺口

C++20 只给语言机制，C++23 给同步生成器，C++26 给 sender 模型与 `task`。标准仍然不提供：

- 通用的异步 I/O 接口。
- 标准的执行器或线程池。
- 标准的取消异常类型。
- 跨平台的网络库。

这些空白由 Asio、libunifex、stdexec、cppcoro 等库填补。选择库时，需要看它如何映射到语言机制，以及是否与 `std::execution` 的模型兼容。

---

## 9. 小结

C++20 协程把「跨挂起点的状态」交给编译器，把「何时挂起、恢复到哪」交给 awaiter，把「结果与异常如何保存」交给 promise。三者的接口都很小，组合起来的表达能力很强，代价是生命周期规则需要设计者自己维护。

理解语言机制之后，任务库的设计问题才清晰：返回对象是否惰性、帧由谁销毁、续接者如何记录、取消如何传播、异常如何聚合。这些是第 3 篇的主题。

---

## 参考

- [C++ 协程定义 [dcl.fct.def.coroutine]](https://eel.is/c++draft/dcl.fct.def.coroutine)
- [co_await 表达式 [expr.await]](https://eel.is/c++draft/expr.await)
- [协程支持库 [support.coroutine]](https://eel.is/c++draft/support.coroutine)
- [P0912R5：Merge coroutines TS into C++20](https://wg21.link/p0912r5)
- [P2502R2：std::generator](https://wg21.link/p2502r2)
- [P3552R3：Add a coroutine task type](https://wg21.link/p3552r3)
- [cppcoro 库](https://github.com/lewissbaker/cppcoro)
