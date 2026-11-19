---
title: "协程定制的层级"
slug: "coroutine-customization-layers"
date: "2026-11-19"
tags: ["C++", "协程", "定制点", "库设计"]
series: "异步与协程"
series_order: 5
draft: false
summary: "按查找时机把 C++20 协程的定制分成五层：编译器固定的改写、coroutine_traits 映射、promise 接口、await 表达式协议与返回对象。说明每层的作用域、冲突与开销，并给出帧分配与隐式挂起的例外。"
---

> 范围：讨论 C++20 协程的定制入口如何分层，不重复语言改写细节。机制见系列第 2 篇《C++20 协程的语言机制》，任务库设计见第 3 篇，执行器与 sender 见第 4 篇。条款引用以 C++26 最终草案 N5050 为准，C++20 措辞用 N4861 对照；提案以 WG21 编号标注。

## 0. 结论摘要

1. 协程的定制点按「谁在什么时刻查找、作用范围多大」分层；编译器固定的改写规则不在定制范围内。
2. 最底层是 `std::coroutine_traits`，把返回类型与参数映射到 promise 类型，默认取 `R::promise_type`。
3. 第二层是 promise 的接口：构造函数、生命周期钩子、结果与异常通道、帧分配与释放。
4. `await_transform` 是 promise 层的入口，只作用于显式 `co_await`；`co_yield`、初始挂起与最终挂起产生的隐式等待不受它改写。
5. `operator co_await` 属于被等待类型，可以是成员或非成员；找不到可行的重载时，操作数本身就是 awaiter。
6. 查找顺序固定：先 `await_transform`，再 `operator co_await`，最后按 awaiter 协议展开。
7. 第四层是返回对象与任务类型，标准只规定 `get_return_object` 的来源，所有权、惰性、取消、续接与执行位置都由库决定。
8. 任务类型之上是生成器、sender/receiver、组合算法与执行器等库设施，它们通过前四层接入语言，不增加新的语言钩子。
9. 层级越高，作用域越大、耦合越强。同样的需求优先落在作用域最小的层。
10. 常见错误来自层级混用：用 `await_transform` 拦截隐式挂起、在 promise 中声明分配函数后仍期望全局回退、把 `coroutine_traits` 特化写在首次使用之后。

---

## 1. 分层的依据

### 1.1 编译器固定的部分

C++20 协程的改写是固定的。函数体变成状态机，局部变量与跨挂起点的临时量放进协程状态，挂起点保存恢复位置，参数按值复制，逃出函数体的异常交给 `unhandled_exception`。这些规则由 [dcl.fct.def.coroutine]/5 的等价改写规定，用户代码无法替换。

因此「定制」发生在编译器预留的接口位置：编译器查找约定的名字与签名，满足要求时使用用户实现，不满足时回到默认行为，或者编译失败。帧布局、恢复入口与状态机标签由实现决定，语言不提供接口。

### 1.2 三个查找入口

定制由三个查找入口串起来：

- 返回类型与参数到 promise 类型：`std::coroutine_traits<R, Args...>::promise_type`。
- promise 对象到生命周期、结果与异常：成员函数调用。
- 被等待表达式到 awaiter：`await_transform`、`operator co_await` 与 awaiter 的成员调用。

三次查找发生在不同阶段，作用域也不同。`coroutine_traits` 按返回类型与参数匹配，影响某一类协程的全部实例；promise 的成员按协程类型生效；`await_transform` 按 promise 生效，`operator co_await` 按被等待类型生效。作用域决定了改动的传播范围，也决定了冲突的规模。

### 1.3 五层结构

| 层 | 入口 | 查找时机 | 作用范围 | 典型用途 |
| --- | --- | --- | --- | --- |
| 0 | 无 | 编译期固定 | 全部协程 | 帧布局、状态机、恢复入口 |
| 1 | `coroutine_traits` | 确定 promise 类型时 | 某返回类型的协程 | 接入无法修改的返回类型 |
| 2 | `promise_type` 成员 | 协程创建、运行与销毁时 | 单个协程类型 | 启动、结果、异常、分配 |
| 3 | `await_transform`、`operator co_await` | 展开 `co_await` 时 | 单个 promise 或某个被等待类型 | 限制可等待类型、适配 sender |
| 4 | 返回对象与库设施 | 库调用时 | 库的用户 | 所有权、取消、执行器、组合 |

表里的层号只表示查找顺序与影响范围，不表示重要性。实际实现通常只使用其中两三层，其余保持默认。

---

## 2. 第 0 层：不可定制的部分

### 2.1 帧与参数副本

协程状态的大小、布局与对齐由实现决定，标准只规定其中必须能容纳 promise 对象、参数副本、挂起点信息与跨挂起点的局部变量。恢复与销毁通过 `coroutine_handle` 的成员完成，调用约定属于 ABI，不属于可定制接口。

参数处理是固定规则的一部分。调用协程时，每个参数都会生成一个副本，副本的初始化先于 promise 构造，生命周期与 promise 对象同时结束 [dcl.fct.def.coroutine]/14。引用参数复制的是引用本身，被引用对象的生命周期不受协程管理。恢复时若原对象已经销毁，访问该引用是未定义行为。

这条规则解释了按值与按引用的取舍：按值传参把所有权移入帧，代价是复制或移动；按引用传参避免复制，但要求调用者保证对象活到协程结束。异步接口通常对引用参数保持谨慎，除非返回对象能表达「调用者必须等待」的约束。

### 2.2 关闭的扩展点

`std::coroutine_handle` 不允许显式特化或偏特化，违反这一条的程序行为未定义 [coroutine.handle.general]/2。想给句柄增加接口，只能包装句柄，或者把接口放到返回对象上。

第 0 层没有直接的用户接口；与帧分配相关的调节点位于 promise 的成员，见第 4.4 节。

---

## 3. 第 1 层：返回类型到 promise

### 3.1 默认映射

`std::coroutine_traits<R, Args...>` 的主模板做一件事：若 `R::promise_type` 是有效类型，就把它定义为成员 `promise_type`；否则模板没有成员 [coroutine.traits.primary]/1。协程定义要求 promise 类型是类类型 [dcl.fct.def.coroutine]/3。

`Args...` 不是随意排列的参数列表。标准规定它是非对象参数的类型序列，非静态成员函数还要在最前面加上对象参数的类型 [dcl.fct.def.coroutine]/3。因此返回值相同、参数列表不同的协程，可以映射到不同的 promise 类型，只要 traits 特化按参数区分。

默认映射只看返回类型，不看参数。嵌套的 `R::promise_type` 对同一返回类型是唯一的；需要按参数改变 promise 时，只能特化 traits。

### 3.2 特化 traits

无法修改的返回类型没有嵌套 `promise_type`，这是 traits 特化的主要场景：

```cpp
struct legacy_task {
  // 没有嵌套 promise_type
};

struct legacy_promise {
  // 省略生命周期钩子与结果存储
};

namespace std {
template <class... Args>
struct coroutine_traits<legacy_task, Args...> {
  using promise_type = legacy_promise;
};
}
```

特化必须定义公开可访问的嵌套类型 `promise_type` [coroutine.traits.primary]/2，并且要在首次使用该特化之前声明；否则程序在特化可见前已经按主模板实例化，行为不符合标准。特化只应针对程序自定义类型；向标准库类型添加特化通常不被允许。

### 3.3 与嵌套 promise_type 的优先级

traits 特化一旦匹配，默认映射就被替换，`R::promise_type` 不再参与选择。若返回类型本身带有嵌套 `promise_type`，同时又有匹配的特化，最终使用的是特化里的类型。两个库对同一返回类型声明不同的 traits 特化时，同一特化出现两份定义，程序违反 ODR。

选择规则可以归结为：拥有返回类型时用嵌套 `promise_type`；返回类型来自外部且无法修改时，才用 traits。traits 的影响面覆盖该返回类型的全部协程，代价也最大。

---

## 4. 第 2 层：promise 的接口

### 4.1 构造与返回对象

promise 对象在参数副本之后构造。编译器用协程参数副本的左值尝试匹配 promise 的构造函数；没有可行构造函数时使用默认构造 [dcl.fct.def.coroutine]/5。这条规则让分配器、执行上下文、停止令牌等依赖可以从调用点传入，不必经过全局状态。

`get_return_object()` 在 `initial_suspend` 之前调用，且至多调用一次 [dcl.fct.def.coroutine]/8。它的返回值就是调用者看到的返回对象。返回对象通常保存 `coroutine_handle`，决定帧的所有权、移动语义与析构行为；这些语义标准不规定，属于第 4 层。

### 4.2 生命周期钩子

两个必需钩子是 `initial_suspend()` 与 `final_suspend()`。前者决定协程创建后立即执行还是先返回调用者，后者决定结束后帧保留还是销毁。两者都返回 awaitable，按 awaiter 协议等待。

`co_await promise.final_suspend()` 不得是可能抛出的表达式 [dcl.fct.def.coroutine]/16。`final_suspend` 本身与其返回的 awaiter 的 `await_ready`、`await_suspend`、`await_resume` 都不应抛出异常；违反这条的程序不符合标准。最终挂起点通常用于把控制权交给续接者，因此它的 `await_suspend` 往往返回 `coroutine_handle`，形成对称转移。

### 4.3 结果与异常通道

`return_void()` 与 `return_value(e)` 二选一。若两个名字都能在 promise 作用域中找到声明，程序不符合标准 [dcl.fct.def.coroutine]/7。函数体执行到末尾时，只有存在 `return_void` 才等价于 `co_return;`；否则行为未定义。

协程体内的异常由 `unhandled_exception()` 接收。异常处理结束后协程进入最终挂起点，异常本身不会自动穿过挂起点传播。任务类型通常在 promise 中保存 `std::exception_ptr`，在 `await_resume` 中重新抛出，让异常沿等待链回到调用者。`unhandled_exception` 自身抛出异常时，协程被视为停在最终挂起点，异常传给恢复者 [dcl.fct.def.coroutine]/15。

### 4.4 帧分配与释放

协程状态需要分配时，分配函数的名字先在 promise 作用域中查找。找到声明后，用「大小 + 参数副本左值」做重载决议；没有可行函数时，退回只用大小做决议。promise 作用域没有声明时，才在全局作用域查找，并且只传大小 [dcl.fct.def.coroutine]/10。promise 中只要有声明，就不会回退到全局分配函数。

释放函数的查找顺序相同，先 promise 后全局。若同时找到只接受指针的版本与接受指针加大小的版本，选择后者；找不到通常的释放函数时，程序不符合标准 [dcl.fct.def.coroutine]/13。

若 promise 定义了 `get_return_object_on_allocation_failure()`，分配失败被假定为返回空指针；若最终使用全局分配函数，则改用 `::operator new(size_t, nothrow_t)` 形式；此时使用的分配函数必须声明为不抛异常。返回空指针时，协程直接返回调用者，返回值来自该成员函数 [dcl.fct.def.coroutine]/11。

### 4.5 分配器示例

下面的 promise 把帧分配接到固定大小的池上。分配与释放必须成对定义，否则帧可能由全局释放函数回收，而该函数不认识池的地址。

```cpp
struct promise_type {
  static void* operator new(std::size_t size) {
    return frame_pool::instance().allocate(size);
  }

  static void operator delete(void* p, std::size_t size) noexcept {
    frame_pool::instance().deallocate(p, size);
  }
};
```

分配函数是少数会出现在每次协程创建路径上的定制点。是否真的调用它由实现决定，标准不保证分配一定发生，因此不能依赖分配函数的副作用来判断协程是否创建。

---

## 5. 第 3 层：await_transform 与 operator co_await

### 5.1 await_transform 的适用范围

对显式写出的 `co_await e`，编译器先在 promise 类型的作用域中查找 `await_transform`。找到声明后，表达式变成 `p.await_transform(e)`；没有可行重载就编译失败，不会退回恒等变换 [expr.await]/3。

`co_yield`、初始挂起与最终挂起产生的等待是隐式的。标准明确规定，由 yield 表达式、初始 await 表达式或最终 await 表达式产生的等待不进行 `await_transform` 查找 [expr.await]/3。因此 `co_yield e` 虽然等价于 `co_await p.yield_value(e)`，但 `yield_value` 返回的 awaitable 不经过 `await_transform`。

这条例外影响两类设计。用 `await_transform` 统一注入执行器、日志或取消检查时，隐式挂起不会经过注入；这些逻辑必须放到 promise 的钩子或 awaiter 内部。用 `await_transform` 限制可等待类型时，`co_yield` 仍可能绕过限制，因为它的等待对象由 `yield_value` 决定。

### 5.2 operator co_await 的查找

经过 `await_transform` 后，编译器枚举可用的 `operator co_await`，用重载决议选出最佳者；没有可行函数时，操作数本身就是 awaiter [expr.await]/3。成员与非成员形式都参与，非成员形式依赖无限定查找与实参依赖查找（argument-dependent lookup，ADL）。

非成员形式适合给已有类型补充等待能力，又不想修改类型定义：

```cpp
struct request {
  // 请求状态
};

auto operator co_await(request& req) {
  return request_awaiter{req};
}
```

成员与非成员同时匹配且无法分出优劣时，重载决议有歧义，程序不符合标准。把非成员形式写成隐藏友元，可以缩小查找范围，也能借助 ADL 找到它。

### 5.3 awaiter 协议

拿到 awaiter 后，展开顺序是 `await_ready`、`await_suspend`、`await_resume`。`await_ready` 返回真时跳过挂起，但 `await_resume` 仍会调用。`await_suspend` 的返回类型决定挂起语义：`void` 无条件挂起，`bool` 用返回值决定是否挂起，`coroutine_handle` 表示对称转移。`await_suspend` 抛出异常时，协程被恢复，异常从 `co_await` 表达式重新抛出 [expr.await]/5。

`await_resume` 的结果类型就是 `co_await` 表达式的类型。它可以返回 `void`、值或引用。任务类型通常在 `await_resume` 中检查异常、取出结果并清理 awaiter 的状态。

### 5.4 两层叠加的顺序

| 挂起表达式 | 经过 `await_transform` | 说明 |
| --- | --- | --- |
| `co_await e` | 是 | 只有显式写法进入 promise 的改写 |
| `co_yield e` | 否 | 隐式等待，`yield_value` 的返回值直接进入 `operator co_await` 或 awaiter |
| `initial_suspend()` | 否 | 初始 await 表达式跳过改写 |
| `final_suspend()` | 否 | 最终 await 表达式跳过改写 |

顺序固定为「先 promise，后被等待类型」。`await_transform` 返回的对象仍然可以定义 `operator co_await`，两层可以叠加；若 `await_transform` 把原对象包装成新类型，原类型的 `operator co_await` 不再参与，除非包装器显式转发。

---

## 6. 第 4 层：返回对象与任务类型

### 6.1 所有权与惰性

`get_return_object` 的返回值承载帧的所有权。常见做法是保存一个 `coroutine_handle`，析构时调用 `destroy`，移动时转移句柄，复制通常被删除。另一种做法是把帧的所有权交给调度器或等待者，返回对象只保留弱引用。

惰性由 `initial_suspend` 决定。返回 `suspend_always` 时，协程创建后停在初始挂起点，调用者必须通过 `co_await`、`start` 或调度器启动；返回 `suspend_never` 时，协程立即执行到第一个挂起点或结束，错误可能在返回对象构造完成前发生。任务类型的接口要能表达这两种时序。

### 6.2 执行位置与续接

协程恢复到哪个线程由 awaiter 的 `await_suspend` 决定，语言没有执行器概念。awaiter 可以把句柄投递到线程池、事件循环或就地恢复；任务类型的最终挂起点通常记录等待者句柄，在 `final_suspend` 中返回该句柄，完成对称转移。

执行位置一旦进入类型，组合规则也随之确定：在哪个执行器上启动、完成后回到哪个执行器、跨执行器等待是否需要同步。这些都属于返回对象与任务类型的约定，不属于语言机制。

### 6.3 取消与组合

取消不是语言特性。promise 可以保存 `std::stop_token` 或库的取消槽，awaiter 在挂起前注册停止回调，恢复路径统一走完成处理。组合算法在任务类型之上构造，例如全部等待、任一等待、超时与重试；它们不改变语言层的查找规则，只调用返回对象的接口。

C++26 的 `std::execution::task` 是一个把多层接起来的例子。它的 promise 提供 `await_transform(Sender&&)`，把 sender 适配成 awaiter；任务完成后先销毁帧，再通过接收者报告值、错误或停止 [P3552R3]。这里同时用到了 promise 层、awaiter 层与库的组合层。

---

## 7. 层与层的冲突

### 7.1 await_transform 改变所有显式等待

promise 中一旦存在 `await_transform`，所有显式 `co_await` 都要经过它。加入一个日志包装器，可能改变重载决议、临时量生命周期与异常路径；若包装器只接受某几类参数，原本可用的 awaiter 会突然无法等待。库通常提供恒等重载，或者用约束把影响限制在目标类型上。

### 7.2 traits 特化与可见性

`coroutine_traits` 特化必须在使用前可见，这一点与普通类模板特化相同。把特化放进某个实现文件，其他翻译单元看不到，就会按主模板实例化并失败，或者产生两份不同的 promise 类型。特化的声明应放在返回类型定义附近的公共头文件中。

### 7.3 分配函数的回退

promise 中声明了 `operator new` 但重载决议失败时，编译器只会退回「只传大小」的调用，不会退回全局分配函数。声明了自定义分配函数却只提供带额外参数的版本，会让协程无法创建。释放函数同理：自定义分配必须配一个签名匹配的释放函数。

### 7.4 noexcept 边界

最终挂起、`unhandled_exception` 与 `await_suspend` 的异常行为都有明确规定。`final_suspend` 及其 awaiter 抛异常不符合标准；`await_suspend` 抛异常会恢复当前协程并重抛；`unhandled_exception` 抛出的异常传给恢复者。实现这些钩子时，异常规范要与标准要求一致，不能依靠运行期捕获处理。

---

## 8. 选择哪一层

### 8.1 判断顺序

1. 返回类型由自己定义：优先在返回类型中嵌套 `promise_type`。
2. 返回类型无法修改：用 `coroutine_traits` 特化，并把特化放在公共头文件。
3. 需要改变单个协程类型的启动、结果、异常或分配：改 promise 的成员。
4. 需要改变某个被等待类型的等待方式：给它加成员或非成员 `operator co_await`。
5. 需要统一改写某个 promise 中所有显式等待：用受约束的 `await_transform`。
6. 需要调度、取消、组合：在返回对象、awaiter 与库设施上实现，不要试图改语言机制。
7. 只有一个调用点需要适配：写一个局部包装类型，不扩大定制面。

### 8.2 作用域与代价

| 层 | 影响面 | 主要代价 | 常见风险 |
| --- | --- | --- | --- |
| `coroutine_traits` | 某返回类型的全部协程 | 需要特化标准模板，编译期依赖 | 可见性、ODR |
| promise 成员 | 单个协程类型 | 每次创建与运行的钩子调用 | 异常规范、所有权 |
| `await_transform` | 某个 promise 的全部显式等待 | 重载决议与模板实例化 | 语义被意外改写 |
| `operator co_await` | 某个被等待类型 | ADL 查找与适配层 | 歧义、临时量生命周期 |
| 分配函数 | 每次帧分配 | 池的线程安全与大小匹配 | 分配释放不配对 |

### 8.3 检查表

- traits 特化在首次使用前可见，并且只针对自定义类型。
- promise 类型是类类型，`promise_type` 公开可访问。
- `return_void` 与 `return_value` 只定义其中一个。
- `final_suspend` 及其 awaiter 不抛异常。
- `await_transform` 有约束或恒等重载，不改变隐式等待的语义。
- 自定义 `operator new` 与 `operator delete` 成对，签名匹配。
- 使用 `get_return_object_on_allocation_failure` 时，分配函数声明为 `noexcept`。
- 不特化 `coroutine_handle`，需要扩展时包装句柄。
- 引用参数的生命周期有明确约束，返回对象能表达等待关系。
- 文档写明 `await_transform` 是否改变等待语义，以及取消如何传播。

---

## 9. 小结

C++20 协程的定制点组成一条查找链：类型映射决定 promise，promise 决定生命周期与结果，`await_transform` 与 `operator co_await` 决定表达式如何变成 awaiter，返回对象与库设施决定所有权、调度与组合。每往上一层，能改的东西越多，作用域越大，冲突也越难局部化。

设计协程类型时，优先使用作用域最小的层：自己的返回类型用嵌套 `promise_type`，外部类型才用 traits；被等待类型的语义放在 `operator co_await`，协程的接收策略放在受约束的 `await_transform`；分配器只在测量出分配开销后引入。把定制限制在必要的层，生命周期与错误路径才容易推理。

语言机制的细节见系列第 2 篇，任务库的取舍见第 3 篇，执行器与 sender 的接入见第 4 篇。

---

## 参考

- [C++ 协程定义 [dcl.fct.def.coroutine]](https://eel.is/c++draft/dcl.fct.def.coroutine)
- [co_await 表达式 [expr.await]](https://eel.is/c++draft/expr.await)
- [yield 表达式 [expr.yield]](https://eel.is/c++draft/expr.yield)
- [协程 traits [coroutine.traits]](https://eel.is/c++draft/coroutine.traits)
- [coroutine_handle [coroutine.handle.general]](https://eel.is/c++draft/coroutine.handle.general)
- [P0912R5：Merge coroutines TS into C++20](https://wg21.link/p0912r5)
- [P3552R3：Add a coroutine task type](https://wg21.link/p3552r3)
- [cppcoro 库](https://github.com/lewissbaker/cppcoro)
