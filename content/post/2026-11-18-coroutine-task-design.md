---
title: "协程任务库的设计空间"
slug: "coroutine-task-design"
date: "2026-11-18"
tags: ["C++", "协程"]
series: "异步与协程"
series_order: 4
draft: false
summary: "围绕惰性、所有权、结果与错误、取消、执行位置五个问题，拆解协程任务类型、生成器、回调桥接、结构化并发与帧分配的设计取舍，并给出最小 task 实现、取消传播顺序与 API 检查清单。"
---

> 范围：协程库的设计取舍与接口形状，不逐条解释语言机制。语言部分见系列第 3 篇《C++20 协程的语言机制》，I/O 与执行器见第 5 篇。
>
> 标准侧以 C++26 最终草案 N5050 为基线；库侧对照 Asio、cppcoro、libunifex 与 stdexec 的公开接口。

## 0. 结论摘要

1. 任务库要先回答五个问题：任务是否惰性、帧由谁拥有、结果与异常如何保存、取消如何传播、恢复到哪个执行器。接口形状由这五个答案决定。
2. 惰性任务用 `initial_suspend` 返回 `suspend_always`，在 `co_await` 或显式启动时才执行；立即执行的任务用 `suspend_never`，错误可能在任何 `co_await` 之前发生。
3. 帧的所有权可以归任务对象、归 awaiter、或归调度器。无论选哪种，都必须保证「恢复」与「销毁」不会同时发生。
4. 任务作为 awaiter 时，在 `await_suspend` 中记录等待者句柄，在 `final_suspend` 中对称转移回等待者。没有等待者时转移到 `noop_coroutine`。
5. 生成器把 `co_yield` 映射为「保存值并挂起」，迭代器推进时恢复。元素的引用语义与生命周期是生成器接口最容易出错的部分。
6. 桥接回调 API 时，awaiter 持有操作状态与完成标志。完成回调只能恢复一次，取消与超时都要走同一条完成路径。
7. 取消是协作式的。`std::stop_token` 适合表达「请求停止」，`stop_callback` 用于把停止请求转成底层取消，`inplace_stop_source` 适合嵌入任务对象。
8. 结构化并发要求父任务等待全部子任务结束，失败时向其余子任务传播停止请求，最后聚合错误。分离（detach）会破坏这个性质，除非有独立的生命周期所有者。
9. 执行位置必须在类型或接口中显式表达。协程恢复的线程由 awaiter 决定，跨线程恢复需要执行器提供同步。
10. 帧分配是主要开销之一。池化、按任务定制 `operator new`、复用帧都能降低成本，但分配省略不可依赖。

---

## 1. 设计空间

### 1.1 五个问题

| 问题 | 选项 | 影响 |
| --- | --- | --- |
| 启动时机 | 惰性、立即 | 错误发生点、组合方式 |
| 帧所有权 | 任务对象、awaiter、调度器 | 析构、移动、取消 |
| 结果 | 值、引用、`void`、`expected` | 接口与存储 |
| 错误 | 异常、错误码、停止通道 | 传播与聚合 |
| 执行位置 | 当前线程、指定执行器、继承 | 线程安全与延迟 |

这五个问题互相牵制。惰性任务把错误推迟到 `co_await`，因此更需要异常通道；立即执行的任务在构造时就可能失败，接口要提供同步检查点；把帧交给调度器可以支持「发射后不管」，代价是所有权不再跟随任务对象。

### 1.2 任务与协程句柄的分工

`coroutine_handle` 只提供 `resume`、`destroy`、`done` 与 promise 访问，不表达所有权、不表达值、不表达取消。任务类型在这些原语之上定义语义：

- 构造与析构管理帧。
- `operator co_await` 把任务接入另一个协程。
- `promise_type` 保存结果、异常与续接者。
- 可选的 `start`/`schedule` 接口把任务交给执行器。

库的设计空间主要在这四层之间分配职责。

---

## 2. 惰性任务

### 2.1 返回对象与句柄所有权

惰性任务的返回对象通常只保存一个 `coroutine_handle`。它必须可移动、不可复制，析构时销毁帧：

```cpp
template<class T>
class task {
public:
  struct promise_type;
  using handle_type = std::coroutine_handle<promise_type>;

  explicit task(handle_type h) noexcept : handle_(h) {}
  task(task&& other) noexcept
      : handle_(std::exchange(other.handle_, handle_type{})) {}
  task(const task&) = delete;
  task& operator=(const task&) = delete;
  ~task() { if (handle_) handle_.destroy(); }

private:
  handle_type handle_{};
};
```

复制被删除，因为两个任务对象持有同一帧会重复销毁。移动把句柄转移出去，源对象置空。

### 2.2 惰性启动

`promise_type` 的 `initial_suspend` 返回 `suspend_always`：

```cpp
std::suspend_always initial_suspend() noexcept { return {}; }
```

调用协程函数只创建帧与返回对象，协程体不执行。错误延迟到第一次 `resume` 后才发生。调用者因此可以先把任务组合起来，再统一启动。

惰性任务的代价是启动需要一次显式的 `resume`。这个动作通常由 `co_await` 的 `await_suspend` 完成，或者由执行器的 `start` 完成。

### 2.3 续接者与最终挂起

任务被 `co_await` 时，等待者句柄写入 promise，任务作为 awaiter 返回自己的句柄，形成对称转移。任务执行到 `co_return` 后进入 `final_suspend`，把控制权交回等待者：

```cpp
struct final_awaiter {
  bool await_ready() const noexcept { return false; }

  std::coroutine_handle<> await_suspend(handle_type h) const noexcept {
    auto cont = h.promise().continuation;
    return cont ? cont : std::noop_coroutine();
  }

  void await_resume() const noexcept {}
};
```

这里有两个所有权细节：

- 任务帧在最终挂起点保留，等待者在 `await_resume` 中读取结果后销毁。
- 若等待者先销毁，任务对象的析构必须销毁帧；因此 `operator co_await` 要把句柄从任务对象转移给 awaiter。

### 2.4 一个最小实现

下面的实现省略 `void` 特化与分配器定制，只保留核心状态：

```cpp
template<class T>
class task {
public:
  struct promise_type {
    struct final_awaiter {
      bool await_ready() const noexcept { return false; }

      std::coroutine_handle<> await_suspend(
          std::coroutine_handle<promise_type> h) const noexcept {
        auto cont = h.promise().continuation;
        return cont ? cont : std::noop_coroutine();
      }

      void await_resume() const noexcept {}
    };

    std::optional<T> value;
    std::exception_ptr error;
    std::coroutine_handle<> continuation{};

    task get_return_object() noexcept {
      return task{
          std::coroutine_handle<promise_type>::from_promise(*this)};
    }
    std::suspend_always initial_suspend() noexcept { return {}; }
    final_awaiter final_suspend() noexcept { return {}; }
    void return_value(T v) { value.emplace(std::move(v)); }
    void unhandled_exception() noexcept {
      error = std::current_exception();
    }
  };

  using handle_type = std::coroutine_handle<promise_type>;

  struct awaiter {
    handle_type h;

    explicit awaiter(handle_type handle) noexcept : h(handle) {}
    awaiter(awaiter&& other) noexcept
        : h(std::exchange(other.h, handle_type{})) {}
    awaiter(const awaiter&) = delete;
    awaiter& operator=(const awaiter&) = delete;

    bool await_ready() const noexcept { return false; }

    std::coroutine_handle<> await_suspend(
        std::coroutine_handle<> caller) noexcept {
      h.promise().continuation = caller;
      return h;                  // 对称转移到任务
    }

    T await_resume() {
      if (h.promise().error) {
        std::rethrow_exception(h.promise().error);
      }
      return std::move(*h.promise().value);
    }

    ~awaiter() { if (h) h.destroy(); }
  };

  explicit task(handle_type h) noexcept : handle_(h) {}
  task(task&& other) noexcept
      : handle_(std::exchange(other.handle_, handle_type{})) {}
  task(const task&) = delete;
  task& operator=(const task&) = delete;
  ~task() { if (handle_) handle_.destroy(); }

  awaiter operator co_await() && noexcept {
    return awaiter{std::exchange(handle_, handle_type{})};
  }

private:
  handle_type handle_{};
};
```

`await_suspend` 返回任务句柄，当前协程挂起，任务开始执行。任务完成后，`final_suspend` 把控制权交回 `caller`。`caller` 恢复，执行 `await_resume`，读取结果并销毁任务帧。

### 2.5 移动与析构顺序

任务作为函数返回值时，编译器可能做复制省略，也可能调用移动构造。移动构造必须把源句柄置空，否则两个对象析构同一帧。

任务作为成员时，析构顺序由成员声明顺序决定。若任务持有外部缓冲区或执行器的引用，这些对象的生命周期必须长于任务，或者任务在析构时先取消并等待。

### 2.6 嵌套等待

任务 A `co_await` 任务 B 时，A 的帧保存 B 的 awaiter，B 的 promise 保存 A 的句柄。B 完成时对称转移回 A，A 继续执行，B 的 awaiter 析构销毁 B 的帧。整条链的栈深度保持常数。

这条链的每一环都要求「只有一个恢复者」。若 B 的完成回调与超时回调可能同时触发，必须用原子标志或锁保证只恢复一次，否则 A 会被恢复两次，帧状态被并发访问。

---

## 3. 生成器

### 3.1 yield_value

生成器把 `co_yield e` 改写为 `co_await promise.yield_value(e)`。`yield_value` 通常把值保存到 promise，返回一个总是挂起的 awaiter：

```cpp
std::suspend_always yield_value(T value) {
  current = std::move(value);
  return {};
}
```

恢复后，协程从 `co_yield` 之后继续，直到下一次 `co_yield` 或结束。生成器的迭代器在 `++` 时恢复协程，在 `*` 时返回当前值。

### 3.2 迭代器与状态

生成器至少需要保存：

- 协程句柄。
- 当前元素或指向当前元素的指针。
- 结束标志。
- 可选的分配器与取消状态。

迭代器通常是输入迭代器（input iterator），只支持单遍遍历。把生成器做成前向迭代器需要缓存历史元素，成本与语义都会变化。

### 3.3 std::generator 的取舍

C++23 的 `std::generator` 规定了以下行为：

- `initial_suspend` 与 `final_suspend` 都挂起，帧由生成器对象拥有。
- `begin()` 恢复协程到第一个 `co_yield`，`end()` 表示结束。
- 支持嵌套生成器，内层 `co_yield` 产生的元素直接传给外层调用者。
- 支持 `generator<T>` 与 `generator<T&>`，元素可以按值或按引用产生。
- 支持通过 `allocator_arg` 定制帧分配。

生成器的元素引用语义需要特别注意：按引用产生时，引用指向协程帧内的对象，迭代器推进后该对象可能被覆盖。调用者若要长期保存，需要复制。

### 3.4 生成器的适用面

- 递归遍历树、图、目录。
- 分页读取、流式解析。
- 惰性序列与管道。
- 把「生产者循环 + 消费者回调」改写成范围循环。

生成器是同步的，不解决 I/O 等待。异步流需要 `async_generator` 一类类型，其 `co_yield` 在挂起期间等待消费者，接口比同步生成器复杂。

---

## 4. 回调桥接

### 4.1 awaiter 持有操作状态

把回调式 API 接入协程，需要一个 awaiter 保存：

- 操作对象或句柄。
- 结果缓冲区。
- 完成标志与结果码。
- 等待者句柄。
- 取消槽或停止令牌。

`await_suspend` 发起操作并注册完成回调；完成回调恢复等待者；`await_resume` 检查结果并返回。

```cpp
struct read_awaiter {
  socket& s;
  span<char> buf;
  std::coroutine_handle<> waiter{};
  error_code ec{};
  size_t n{};

  bool await_ready() const noexcept { return false; }

  void await_suspend(std::coroutine_handle<> h) {
    waiter = h;
    s.async_read_some(buf, [this](error_code e, size_t count) {
      ec = e;
      n = count;
      waiter.resume();
    });
  }

  size_t await_resume() {
    if (ec) throw system_error(ec);
    return n;
  }
};
```

这个简化版本有一个严重问题：`this` 指向 awaiter，awaiter 是协程帧中的临时对象。操作完成前协程挂起，帧仍然有效，因此 `this` 有效；协程被销毁时，操作必须先取消，否则回调访问已释放的 awaiter。

### 4.2 完成只恢复一次

一个操作可能通过成功、错误、取消、超时四条路径完成。四条路径都必须经过同一个完成函数，用原子标志保证只恢复一次：

```cpp
void complete(error_code e, size_t count) {
  if (done.exchange(true, std::memory_order_acq_rel)) return;
  ec = e;
  n = count;
  waiter.resume();
}
```

如果没有这个标志，超时与成功同时到达会恢复两次，协程帧被并发访问。

### 4.3 取消与超时

取消与超时都表现为「操作提前完成」。区别在于结果：

- 取消通常映射为 `operation_aborted` 或停止通道。
- 超时通常映射为 `timed_out`。

两者都应先请求底层取消，再等待完成回调，最后恢复协程。直接在超时回调里恢复协程，而底层操作仍在访问缓冲区，会造成数据竞争。

### 4.4 Asio 的协程接口

Asio 提供三种接入方式：

- `asio::awaitable<T>`：协程返回类型，配 `co_spawn` 启动。
- `asio::use_awaitable`：完成令牌，把任意异步操作变成可 `co_await` 的表达式。
- `asio::this_coro::executor`：在协程内取关联执行器。

```cpp
asio::awaitable<void> echo(tcp::socket socket) {
  std::array<char, 4096> buf;
  for (;;) {
    auto n = co_await socket.async_read_some(
        asio::buffer(buf), asio::use_awaitable);
    co_await asio::async_write(
        socket, asio::buffer(buf, n), asio::use_awaitable);
  }
}
```

Asio 的 `awaitable` 默认在关联执行器上恢复，异常通过 `co_await` 重抛。取消通过 `cancellation_slot` 传播，超时可以用 `asio::steady_timer` 与 `cancel` 组合。

---

## 5. 取消

### 5.1 协作式语义

取消请求不强制终止协程。协程在挂起点、循环边界或检查点读取停止状态，决定是否提前返回。这个设计避免了异步取消留下的资源不一致，代价是每个可能长时间运行的操作都要参与检查。

### 5.2 stop_token

C++20 提供 `std::stop_source`、`std::stop_token` 与 `std::stop_callback`。C++26 的 `std::inplace_stop_source` 把停止状态直接嵌入对象，适合任务与操作状态。

典型用法：

```cpp
void run(std::stop_token token) {
  while (!token.stop_requested()) {
    auto item = queue.pop();
    process(item);
  }
}
```

`stop_callback` 在请求停止时同步调用注册的函数，运行在请求线程上。回调应当短，不能阻塞，也不能抛出异常。

### 5.3 传播方向

取消可以沿两个方向传播：

- 父到子：父任务取消时，向所有子任务发出停止请求。
- 子到父：子任务失败时，父任务请求其余子任务停止，然后聚合结果。

两种方向都需要明确「谁负责发出请求」。常见规则是：组合算法持有 `stop_source`，把 `stop_token` 放入子任务的环境；任一子任务失败时，组合算法请求停止，等待全部子任务结束。

### 5.4 取消与销毁顺序

安全顺序如下：

1. 停止接受新操作。
2. 向在途操作发出取消请求。
3. 等待完成回调或确认操作已终止。
4. 释放缓冲区与对象。
5. 销毁协程帧。

第 3 步不能省略。许多 I/O 库的取消是异步的：`cancel` 返回时操作可能仍在执行，完成回调稍后才到。提前销毁帧会让回调访问已释放内存。

---

## 6. 结构化并发

### 6.1 nursery

nursery 是一个作用域对象，负责启动子任务、等待全部子任务结束、传播取消与异常。接口形状通常如下：

```cpp
async_scope scope;
scope.spawn(child_a());
scope.spawn(child_b());
co_await scope.join();   // 等待全部结束，必要时重抛异常
```

作用域析构时若仍有子任务，应当请求取消并等待；直接销毁会留下访问已释放对象的回调。这个规则把「任务泄漏」变成编译期或运行期的显式错误。

### 6.2 when_all

`when_all` 等待所有子操作完成，收集结果。失败语义有两种常见设计：

- 首个错误立即完成，其余子操作请求停止，但仍等待它们结束。
- 等待全部完成，返回全部结果与全部错误。

前者延迟低，后者信息完整。接口应当明确选择，并保证停止请求传播到所有子操作。

### 6.3 异常聚合

多个子任务同时失败时，父任务需要决定抛出哪个异常。常见做法：

- 抛出首个异常，其余记录到日志。
- 抛出 `exception_list` 一类聚合类型。
- 把异常转换为错误码，放入结果类型。

无论哪种，都要保证所有子任务已经结束，否则析构顺序无法确定。

### 6.4 分离

detach 把任务的生命周期从作用域中移出，父任务不再等待。它适合守护任务、后台清理一类场景，但需要独立的所有者与关闭协议。没有所有者时，程序退出或作用域结束时任务可能仍在访问已销毁的对象。

结构化并发的默认规则是不分离；需要分离时，显式创建所有者并在关闭时等待。

---

## 7. 执行位置

### 7.1 恢复线程

协程挂起后由谁恢复，决定后续代码在哪个线程运行。三种常见策略：

- 在完成回调的线程就地恢复。
- 把恢复投递到指定执行器。
- 把恢复投递到当前协程的关联执行器。

就地恢复延迟最低，但业务代码可能在 I/O 线程上执行，阻塞该线程会影响其他连接。投递到执行器增加一次排队，换来线程亲和与隔离。

### 7.2 strand

Asio 的 `strand` 提供串行执行保证：投递到同一个 strand 的处理函数不会并发执行，即使底层有多个线程。协程可以用 `strand` 绑定会话状态，避免在每个访问点加锁。

`strand` 不保证固定在某个线程，只保证不并发。协程在 strand 上恢复时，仍然可能在不同线程之间迁移，线程局部存储不能作为会话状态。

### 7.3 线程迁移的同步

协程从 A 线程挂起、在 B 线程恢复时，A 写入帧的数据必须对 B 可见。执行器的任务队列通常通过互斥量或原子操作建立 happens-before。自定义 awaiter 若绕过执行器直接恢复，需要自己提供同步。

C++ 的内存模型不关心「协程」这一抽象，只关心线程与原子操作。帧内数据的跨线程访问与普通对象相同，缺少同步就是数据竞争。

---

## 8. 分配

### 8.1 帧分配的成本

每次协程调用可能分配一块帧。帧大小由局部变量与 promise 决定，通常几十到几百字节。高频短任务会把分配器推到热点：

- 分配与释放的锁竞争。
- 内存碎片。
- 缓存局部性下降。

协程帧的分配次数与任务数同阶，不能按「每个请求一次」粗略估算，组合操作会创建更多中间协程。

### 8.2 池化

常见优化：

- 在 `promise_type` 中重载 `operator new`，从任务专属的内存池分配。
- 用 `allocator_arg` 把分配器传入协程，随任务传播。
- 复用固定大小的帧，按任务类型分桶。
- 把短生命周期任务合并到一个批次，减少分配次数。

池化要求帧大小稳定。模板实例化会产生不同大小的帧，按类型分桶可以缓解，但会增加池的数量。

### 8.3 分配省略

编译器可以对协程帧做分配省略（HALO），把帧放在调用者栈上或完全消除。是否发生取决于编译器、优化级别与内联决策。标准允许省略，不保证省略。

因此：

- 不能依赖「每次调用都有一次分配」做计数。
- 不能依赖「分配一定不发生」做实时性保证。
- 需要确定性延迟时，使用自定义分配器或预分配帧。

---

## 9. API 检查清单

| 检查项 | 需要确认的内容 |
| --- | --- |
| 启动 | 惰性还是立即，错误在哪个点暴露 |
| 所有权 | 帧由谁销毁，移动后源对象是否为空 |
| 结果 | 值、引用、`void` 的接口是否一致 |
| 错误 | 异常、错误码、停止通道的优先级 |
| 取消 | 请求、传播、确认、销毁的顺序 |
| 执行器 | 默认恢复位置，是否允许切换 |
| 分配 | 分配器如何传入，是否可池化 |
| 组合 | 是否支持 `when_all`、超时、重试 |
| 生命周期 | 缓冲区、回调、帧的存活关系 |

接口文档应当逐项写明。协程库的多数缺陷来自这些约定没有写清楚，语法错误只占少数。

---

## 10. 与 sender 的分工

协程擅长顺序组合：读、处理、写、循环。sender 擅长描述与组合异步计算：完成签名、调度、停止传播、批量执行。

两者的边界：

- 协程提供语法与控制流，sender 提供组合与调度语义。
- `std::execution::task` 同时是 sender 与协程返回类型，把两者接在一起。
- 协程内可以 `co_await` sender，sender 图里也可以启动协程。
- 纯顺序流程用协程更直接；需要并行、批量、类型级组合时用 sender 算法。

第 5 篇展开 sender/receiver 模型与执行器。

---

## 参考

- [C++ 协程定义 [dcl.fct.def.coroutine]](https://eel.is/c++draft/dcl.fct.def.coroutine)
- [P2502R2：std::generator](https://wg21.link/p2502r2)
- [P3552R3：Add a coroutine task type](https://wg21.link/p3552r3)
- [P3149R11：async_scope](https://wg21.link/p3149r11)
- [Asio 协程支持](https://think-async.com/Asio/asio-1.30.2/doc/asio/overview/composition/coroutine.html)
- [cppcoro 库](https://github.com/lewissbaker/cppcoro)
- [libunifex](https://github.com/facebook/libunifex)
