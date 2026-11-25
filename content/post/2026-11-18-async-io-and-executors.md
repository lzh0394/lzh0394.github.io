---
title: "异步 I/O、执行器与 senders/receivers"
slug: "async-io-and-executors"
date: "2026-11-18"
tags: ["C++", "异步"]
series: "异步与协程"
series_order: 5
draft: false
summary: "从 epoll 的就绪通知与 io_uring 的完成通知出发，梳理事件循环、执行器、strand 与背压的实现要点，再进入 P2300 的 sender/receiver、完成签名、connect/start 与组合算法，说明协程与 sender 如何互操作以及选型时需要核对的能力。"
---

> 范围：操作系统异步 I/O 接口、用户态执行器与 C++26 的 `std::execution`。语言机制见第 3 篇，任务库见第 4 篇。
>
> 标准侧以 C++26 最终草案 N5050 为基线；平台接口以 Linux、Windows 与 BSD 的公开文档为准，不绑定内核小版本。

## 0. 结论摘要

1. 内核提供的异步接口分两类：就绪通知（epoll、kqueue）与完成通知（IOCP、io_uring）。前者告诉程序「可以读了」，后者告诉程序「读完了」。
2. Reactor 把就绪事件分发给回调，核心难点在非阻塞读写、部分写、accept 竞争、定时器与唤醒，不在事件注册本身。
3. io_uring 用共享的提交队列与完成队列减少系统调用，支持注册文件与缓冲区、批量提交、多-shot accept 与提供缓冲区；代价是平台绑定与安全策略限制。
4. 执行器决定任务在哪个线程、以何种顺序运行。就地执行延迟低但会占用完成线程，排队执行隔离性好但多一次调度。
5. strand 提供串行执行保证，不保证固定线程。会话状态绑定 strand 可以避免锁，但不能依赖线程局部存储。
6. P2300 把异步操作拆成 sender、receiver 与 operation state：`connect` 建立连接，`start` 启动，完成通过值、错误、停止三个通道报告。
7. 完成签名在类型层面描述可能的结果，组合算法据此检查接收者是否可调用；调度通过 `scheduler` 表达，工作在哪执行成为类型的一部分。
8. `std::execution::task` 把协程接入 sender 模型：它是惰性的 sender，完成时先销毁帧再调用接收者，并在协程内提供 `await_transform` 以等待其他 sender。
9. 协程与 sender 的分工在控制流与组合：协程写顺序流程，sender 写组合与调度；两者通过 `as_awaitable` 与任务类型互相转换。
10. 选型先看平台与工具链：Linux 专用可以评估 io_uring，跨平台优先 Asio；需要标准演进路径时评估 `std::execution` 的实现成熟度。

---

## 1. 两种内核接口

### 1.1 就绪通知

就绪通知接口的工作方式是：程序把文件描述符注册到内核，内核在描述符可读、可写或出错时通知程序，程序再发起实际的读写调用。

- `select`：描述符集合有上限，每次调用都要在全量集合上扫描。
- `poll`：用数组代替位图，仍然要扫描全部条目。
- `epoll`：内核维护兴趣列表与就绪列表，`epoll_wait` 返回就绪条目，复杂度与就绪数相关。
- `kqueue`：BSD 的事件队列，支持文件描述符、信号、定时器、进程事件等过滤器。

就绪通知不携带数据，也不保证下一次读写一定成功。非阻塞 `read` 可能只读到一部分，`write` 可能返回 `EAGAIN` 或只写入一部分字节。

### 1.2 完成通知

完成通知接口的工作方式是：程序提交一个操作（读、写、接受连接），内核在操作完成后把结果放入完成队列。

- IOCP：Windows 的完成端口，配合 overlapped I/O 使用，`GetQueuedCompletionStatusEx` 可以一次取出多个完成包。
- io_uring：Linux 的环形队列接口，提交队列（SQ）与完成队列（CQ）通过 `mmap` 与内核共享。

完成通知把「发起」与「完成」分开，程序不需要在就绪后再次调用读写。代价是操作状态由内核或库持有，取消与缓冲区生命周期的规则更复杂。

### 1.3 对比

| 维度 | 就绪通知 | 完成通知 |
| --- | --- | --- |
| 典型接口 | epoll、kqueue | IOCP、io_uring |
| 通知内容 | 可以操作 | 操作结果 |
| 系统调用 | 每次读写一次 | 批量提交与收割 |
| 缓冲区 | 调用时传入 | 提交时绑定，完成前不可复用 |
| 取消 | 关闭描述符或注销 | 显式取消操作 |
| 编程模型 | reactor | proactor |

两种模型都能支撑高并发。选择取决于平台、库生态与团队熟悉度，不取决于理论上的吞吐上限。

---

## 2. Reactor 实现要点

### 2.1 事件循环的阶段

一个典型的事件循环按固定顺序执行：

1. 计算最近的定时器截止时间。
2. 调用 `epoll_wait`，超时时间为到最近定时器的间隔。
3. 处理就绪的文件描述符。
4. 处理到期的定时器。
5. 执行跨线程投递的任务队列。
6. 回到第 1 步。

阶段顺序影响延迟与公平性。若就绪事件一直很多，定时器可能饥饿；常见做法是限制每轮处理的事件数，或把定时器放在独立阶段。

### 2.2 非阻塞读写与部分写

非阻塞套接字的读写需要处理四种结果：

- 成功，返回字节数。
- `EAGAIN`/`EWOULDBLOCK`，当前不可读写，注册下一次兴趣。
- `EINTR`，被信号打断，重试。
- 其他错误，关闭连接。

写操作尤其要注意部分写。应用层缓冲区中未写完的部分要保留，等 `EPOLLOUT` 再次触发时继续写。直接把「写成功」当作「全部写完」会截断响应。

### 2.3 accept 竞争

多个线程或进程在同一监听套接字上 `accept` 时，可能出现惊群（thundering herd）：一个连接到达，全部等待者被唤醒，只有一个成功。

缓解手段：

- `EPOLLEXCLUSIVE`：让内核只唤醒一个等待者。
- `SO_REUSEPORT`：每个工作进程绑定独立监听套接字，由内核分发连接。
- 单线程 accept，把连接分发给工作线程。

选择取决于连接建立频率与负载均衡需求。`SO_REUSEPORT` 的分发按四元组哈希，连接分布可能不均匀。

### 2.4 定时器

定时器通常用最小堆、时间轮或有序结构组织。需要处理：

- 超时精度与事件循环的等待时间。
- 定时器取消：从结构中删除，或标记为失效。
- 大量短定时器：时间轮更合适。
- 定时器回调不能阻塞事件循环。

### 2.5 strand 与串行化

Asio 的 `strand` 是一个执行器适配器，保证投递到同一个 strand 的处理函数不会并发执行。实现方式通常是一个互斥的队列与「正在执行」标志：

- 若没有处理函数在执行，当前调用就地执行。
- 若有，则把新处理函数放入队列，由当前执行者依次取出。

strand 的保证限于「不并发」，不保证「固定线程」。同一个 strand 上的协程可能在不同线程恢复，线程局部变量不能作为会话状态。

---

## 3. io_uring

### 3.1 环形队列与批量提交

io_uring 由三个系统调用支撑：

- `io_uring_setup`：创建 ring，返回文件描述符。
- `io_uring_enter`：提交 SQ 中的条目、等待完成、或两者兼做。
- `io_uring_register`：注册文件、缓冲区、事件文件描述符等资源。

SQ 与 CQ 是共享内存中的环形数组。应用填充 SQE（提交队列条目），更新尾指针，调用 `io_uring_enter` 通知内核；内核填充 CQE（完成队列条目），应用读取头指针。

批量提交把多个操作合并为一次系统调用，减少上下文切换。高吞吐场景下，这项收益通常大于单次操作的复杂度。

### 3.2 SQPOLL

设置 `IORING_SETUP_SQPOLL` 后，内核创建轮询线程，持续检查 SQ 尾指针，应用不再需要每次提交都调用 `io_uring_enter`。代价是轮询线程占用一个 CPU 核心，空闲时也消耗资源。

SQPOLL 适合持续高负载的场景。低负载或突发流量下，轮询线程的 CPU 开销可能超过系统调用节省。

### 3.3 注册文件与缓冲区

- `IORING_REGISTER_FILES` 注册文件描述符表，SQE 用 `IOSQE_FIXED_FILE` 引用下标，省去每次操作的 `fdget`/`fdput`。
- `IORING_REGISTER_BUFFERS` 注册缓冲区，内核提前锁定页面，减少每次 I/O 的映射与验证。
- 提供缓冲区（provided buffers）：应用预先提交一组缓冲区，接收操作通过 `IOSQE_BUFFER_SELECT` 选择，完成后返回缓冲区 id。

注册资源适合长期存活的连接与固定大小的缓冲区。动态创建销毁的连接需要额外的注册/注销管理。

### 3.4 多-shot 操作

多-shot accept 允许一次提交持续接收连接，直到取消或出错。多-shot 接收类似，配合提供缓冲区可以持续收取数据报。

这些操作减少了「完成一次、再提交一次」的往返，适合高连接建立速率或高包速率的场景。代价是完成事件的解析更复杂，取消语义需要仔细处理。

### 3.5 取消

io_uring 的取消通过 `IORING_OP_ASYNC_CANCEL` 提交，可以按用户数据、文件描述符或请求取消全部。取消是异步的：

- 取消请求本身是一个操作，取消结果与目标操作的完成是两条 CQE。
- 目标操作可能已经完成，取消返回 `-ENOENT`。
- 完成队列中可能同时出现目标操作的完成与取消的完成。

因此，缓冲区与操作状态必须等到目标操作的 CQE 到达后才能释放，不能以取消请求提交为释放点。

### 3.6 平台与安全限制

io_uring 是 Linux 专用接口。部分发行版或容器运行时通过 seccomp 限制 `io_uring_setup`，或通过 sysctl 禁用。部署前需要确认内核版本、特性位与安全策略。

跨平台服务通常把 io_uring 作为可选后端，保留 epoll 或 IOCP 路径。

---

## 4. 执行器模型

### 4.1 执行器与调度器

执行器（executor）负责提交与运行任务；调度器（scheduler）是 P2300 中的概念，负责产生「在某个执行资源上运行」的 sender。两者的区别在抽象层次：

- 执行器是运行任务的接口，通常有 `execute`、`post`、`dispatch` 等方法。
- 调度器是异步计算的起点，`schedule()` 返回一个 sender，完成后把控制权交给后续操作。

Asio 的 `any_io_executor` 属于执行器；P2300 的 `scheduler` 属于调度器。任务库可以把执行器包装成调度器，也可以直接使用调度器。

### 4.2 就地执行与排队执行

提交任务有两种基本策略：

- 就地执行：若当前线程允许，直接调用任务。延迟最低，但任务可能在 I/O 完成线程上运行，阻塞该线程会影响其他操作。
- 排队执行：把任务放入队列，由工作线程取出。隔离性好，但多一次入队、唤醒与上下文切换。

Asio 用 `dispatch` 表达「能就地就地」，用 `post` 表达「一定排队」，用 `defer` 表达「稍后排队」。协程恢复使用哪种策略，取决于 awaiter 与关联执行器。

### 4.3 亲和性与工作窃取

执行器可以表达线程亲和：任务必须在指定线程、指定 NUMA 节点或指定 strand 上运行。亲和性减少跨线程同步与缓存失效，代价是负载不均。

工作窃取（work stealing）让空闲线程从其他队列取任务，改善负载均衡。窃取会破坏亲和性，因此需要区分「可窃取」与「绑定」的任务。

### 4.4 定时器与背压

定时器通常由执行器提供，避免每个任务自带线程。背压（backpressure）指上游生产速度超过下游处理速度时的限流机制：

- 有界队列满时阻塞生产者或拒绝任务。
- 用信号量限制在途请求数。
- 用异步生成器按消费者速度拉取。

没有背压的异步系统会把排队延迟转化为内存增长，最终触发超时或 OOM。

---

## 5. P2300 的 sender/receiver

### 5.1 三个角色

P2300 把异步操作拆成三个角色：

- sender：描述一段尚未开始的异步工作，携带完成签名与属性。
- receiver：接收完成通知，提供三个通道 `set_value`、`set_error`、`set_stopped`。
- operation state：`connect(sender, receiver)` 返回的对象，保存一次执行的全部状态。

`start(op)` 启动操作，必须调用一次。操作完成后，receiver 的三个通道之一被调用，operation state 的生命周期由调用者管理。

### 5.2 完成签名

完成签名描述 sender 可能产生的结果：

```cpp
using sigs = std::execution::completion_signatures<
    std::execution::set_value_t(int),
    std::execution::set_error_t(std::exception_ptr),
    std::execution::set_stopped_t()>;
```

接收者必须对每一组签名都可调用。组合算法在编译期合并签名，检查接收者是否满足要求。签名是类型的一部分，错误的处理路径在编译期可见。

### 5.3 connect 与 start

`connect` 把 sender 与 receiver 绑定，返回 operation state。`connect` 本身不执行工作，只建立状态；`start` 才提交或就地执行。

这个分离带来两个好处：

- 组合可以在启动前完成，失败可以在启动前发现。
- operation state 可以放在栈上或调用者提供的存储中，避免堆分配。

代价是 operation state 的类型由 sender 与 receiver 共同决定，接口模板化程度高，编译期开销大。

### 5.4 组合算法

P2300 提供一组适配器：

| 算法 | 作用 |
| --- | --- |
| `then` | 值完成后调用函数，返回值继续传递 |
| `upon_error` | 错误通道完成后调用函数 |
| `upon_stopped` | 停止通道完成后调用函数 |
| `let_value` | 用值构造下一个 sender，串联异步操作 |
| `when_all` | 等待全部完成，聚合结果 |
| `bulk` | 对每个下标执行函数，可并行 |
| `split` | 共享一个 sender 的结果给多个消费者 |
| `transfer` | 把后续操作切换到指定调度器 |

算法组合的对象是「描述」；每个算法返回新的 sender，操作在 `start` 之后才真正启动。

### 5.5 调度器

`scheduler` 的核心接口是 `schedule()`，返回一个 sender，完成后在对应执行资源上调用接收者。调度器可以携带：

- 执行资源（线程池、事件循环、GPU 流）。
- 亲和性（线程、NUMA 节点）。
- 完成调度器（后续操作默认在哪里运行）。

`transfer` 把值通道转发到另一个调度器，实现执行位置的切换。

### 5.6 sync_wait

`std::this_thread::sync_wait(sender)` 在当前线程驱动 sender 直到完成：

- 成功时返回 `optional<tuple<...>>`，包含值完成的结果。
- 错误时重新抛出异常。
- 停止时返回空 `optional`。

它用于把异步流程接回同步代码，例如程序入口、测试与命令行工具。在事件循环内部调用 `sync_wait` 会阻塞循环，通常应避免。

### 5.7 结构化并发

`when_all` 等待所有子操作完成。首个错误出现时，它向其余子操作发出停止请求，但仍然等待全部子操作结束后才完成。这个语义保证 operation state 与缓冲区在所有子操作结束后才释放。

停止请求通过 receiver 的环境传播：子操作从 `get_env(receiver)` 中读取 `stop_token`，在合适的检查点响应。

### 5.8 定制点

P2300 通过定制点对象（customization point object）扩展：

- `connect`、`start`、`set_value` 等可以针对用户类型重载。
- `get_completion_signatures` 描述签名。
- `get_env` 查询 receiver 或 sender 的属性。
- `as_awaitable` 把 sender 转换为 awaiter。

定制点让库与用户类型解耦，也让错误信息变长。模板约束不满足时，编译器输出通常需要工具辅助阅读。

---

## 6. 协程与 sender 的桥

### 6.1 as_awaitable

`as_awaitable(expr, promise)` 把表达式转换为 awaiter。默认情况下，若表达式本身是 awaiter，直接返回；若它是 sender，则连接一个内部 receiver，把完成通道映射为 `co_await` 的返回值与异常。

协程的 promise 可以提供 `await_transform`，在 `co_await` 之前调用 `as_awaitable`。这样协程内部可以统一等待 sender、awaiter 与普通值。

### 6.2 std::execution::task

C++26 的 `std::execution::task` 是 sender，也是协程返回类型：

- `initial_suspend` 返回 `suspend_always`，连接到 receiver 并 `start` 后才执行。
- `co_return` 的值通过 `set_value` 完成，异常通过 `set_error(exception_ptr)` 完成，停止通过 `set_stopped` 完成。
- promise 提供 `await_transform(Sender&&)`，在 task 内可以 `co_await` 其他 sender；当起始调度器不是 `inline_scheduler` 时，内部用 `affine` 保持调度亲和。
- 完成前先销毁协程帧，再把结果交给 receiver，避免结果引用帧内存储。

### 6.3 Asio 的集成

Asio 的 `awaitable` 与 sender 模型不同，但可以互操作：

- 用 `co_spawn` 启动协程，用 `use_awaitable` 等待 Asio 操作。
- 用自定义 awaiter 在协程中等待 sender。
- 把 Asio 的完成令牌接口包装成 sender，或把 sender 通过 `as_awaitable` 接入协程。

跨模型集成要统一取消与执行位置：Asio 用 `cancellation_slot`，P2300 用 `stop_token`。适配层需要把两者双向映射，否则取消会在边界处丢失。

### 6.4 常见问题

- 在 sender 的 `set_value` 中直接恢复协程，可能递归过深；用调度器或对称转移打断递归。
- 在协程中 `co_await` 一个临时 sender，sender 的 operation state 生命周期由 awaiter 管理，必须保证完成前不销毁。
- 把 `sync_wait` 放进事件循环回调，阻塞整个循环。
- 忽略停止通道，把取消当作错误处理，导致重试逻辑误触发。

---

## 7. 取消

### 7.1 两种表达

- `std::stop_token`：C++20 的标准停止机制，查询式，适合线程与协程。
- Asio 的 `cancellation_slot`：逐操作的取消槽，支持 `terminal`、`partial`、`total` 三种类型。

两者都是协作式的。底层操作是否支持取消，取决于接口实现。

### 7.2 set_stopped

在 P2300 中，取消对应停止通道：

- 子操作检测到停止请求后调用 `set_stopped(receiver)`。
- 组合算法把停止传播给其他子操作。
- `sync_wait` 收到停止时返回空结果。

停止不是错误。把停止映射为异常会让上层误以为发生了故障，触发重试或告警。

### 7.3 传播与确认

取消的完整路径包括请求、传播、确认与清理：

1. 组合算法请求停止。
2. 子操作在检查点读取停止状态，发起底层取消。
3. 底层操作完成后调用 `set_stopped`。
4. 组合算法等待全部子操作结束。
5. 释放缓冲区与 operation state。

第 4 步不能省略。取消请求返回不代表操作已经结束。

---

## 8. 性能结构

### 8.1 系统调用摊销

高并发下，系统调用次数往往比单次调用开销更重要：

- 批量提交与批量收割减少 `io_uring_enter` 次数。
- `writev`、`sendmmsg`、`recvmmsg` 合并多次读写。
- 多 shot accept 一次提交持续接收连接。
- 事件循环一次等待处理多个就绪描述符。

摊销的代价是延迟增加：批次越大，单个请求等待越久。吞吐与尾延迟需要分别测量。

### 8.2 分配

异步路径上的分配来源：

- 协程帧。
- operation state。
- 回调闭包与 `shared_ptr` 控制块。
- 缓冲区与队列节点。

减少分配的手段包括：栈上 operation state、对象池、缓冲区复用、协程帧定制分配器。分配次数通常比分配字节数更能解释性能差异。

### 8.3 缓存与 NUMA

跨核迁移会让任务访问远程 NUMA 节点的内存，延迟上升。绑定执行器、按 NUMA 节点分片、避免在热路径上共享缓存行，都能降低尾延迟。

伪共享（false sharing）常出现在统计计数器与队列头尾指针上。把频繁写入的字段分开到不同缓存行，代价是内存占用增加。

### 8.4 尾延迟

尾延迟的来源：

- 事件循环被长回调阻塞。
- 队列头部的大任务阻塞后续小任务。
- 锁竞争与优先级反转。
- 批量清理或内存回收的停顿。
- 超时与重试风暴。

观测尾延迟需要分位数指标与直方图，平均值会掩盖长尾。

---

## 9. 选型

### 9.1 Asio

- 跨平台，覆盖 epoll、kqueue、IOCP、select。
- 提供回调、future、协程、strand、取消槽。
- 生态成熟，文档与示例多。
- 学习曲线集中在执行器、关联器与取消模型。

### 9.2 stdexec 与 libunifex

- stdexec 实现 P2300 的 sender/receiver 模型；libunifex 是早期实现，接口与 P2300 有差异。
- 组合算法丰富，适合构建异步管线。
- 编译期开销大，错误信息长。
- 标准库实现仍在补齐，生产使用需要核对工具链。

### 9.3 自研

自研适合有明确平台与性能目标的场景：

- 只支持 Linux，使用 io_uring 或 epoll。
- 事件循环与任务模型与业务高度耦合。
- 需要精确控制分配与调度。

代价是取消、定时器、跨平台与测试需要自己建设。多数项目可以从 Asio 或现有框架开始，遇到明确瓶颈再替换局部。

### 9.4 C++26 的状态

C++26 纳入 `std::execution`（P2300R10）与 `std::execution::task`（P3552R3），标准第一次给出异步组合与协程任务的公共模型。标准仍然不包含网络库与通用 I/O 接口，平台适配仍由库完成。

采用标准模型时，需要核对：

- 编译器与标准库对 `<execution>` 的覆盖度。
- 现有 I/O 库是否提供 sender 适配。
- 取消、分配器与调度器属性是否贯通。
- 调试与性能工具是否能识别新模型。

---

## 10. 小结

异步 I/O 的底层选择是就绪通知与完成通知，上层选择是回调、协程与 sender。三者的边界不在性能数字，而在控制流、组合方式、取消传播与生命周期管理。

C++26 的 `std::execution` 把组合与调度提升到类型层面，协程继续负责顺序控制流。两者结合，可以用协程写业务流程，用 sender 写并行、批量与调度策略。工程落地时，平台接口、库生态与工具链成熟度仍然是决定因素。

---

## 参考

- [P2300R10：std::execution](https://wg21.link/p2300r10)
- [P3552R3：Add a coroutine task type](https://wg21.link/p3552r3)
- [C++26 执行控制库 [exec]](https://eel.is/c++draft/exec)
- [io_uring 设计说明](https://kernel.dk/io_uring.pdf)
- [io_uring 手册页](https://man7.org/linux/man-pages/man7/io_uring.7.html)
- [epoll 手册页](https://man7.org/linux/man-pages/man7/epoll.7.html)
- [Asio 文档](https://think-async.com/Asio/)
- [stdexec 参考实现](https://github.com/NVIDIA/stdexec)
