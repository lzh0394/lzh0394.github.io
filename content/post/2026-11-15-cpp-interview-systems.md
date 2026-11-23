---
title: "C++ 系统编程面试题"
slug: "cpp-interview-systems"
date: "2026-11-15"
tags: ["C++", "面试", "操作系统", "系统编程"]
series: "C++ 开发岗面试"
series_order: 2
draft: false
summary: "按进程与内存、文件与 IPC、事件驱动、调度与容器、观测与设计题组织 20 章，共 400 道系统编程面试题；每题给出内核机制、调用路径、失败边界与性能代价。"

---

## 1. 进程与线程模型

### 1.1 进程与线程在 Linux 中如何区分？

- 进程是资源分配单位，持有独立的地址空间、文件描述符表、信号处置与凭证；线程是调度单位，共享所属进程的上述资源。
- Linux 内核不区分进程与线程，两者都由 `task_struct` 表示，区别来自 `clone` 传入的共享标志，如 `CLONE_VM`、`CLONE_FILES`、`CLONE_SIGHAND`、`CLONE_THREAD`。
- 每个线程有独立的用户栈、内核栈、寄存器上下文与 `task_struct`；同一进程的线程共用 `mm_struct`。
- 同一进程内线程切换不切换页表，通常不刷新 TLB；跨进程切换要写 `CR3`，可能使 TLB 项失效。
- 隔离性不同。一个线程触发 `SIGSEGV` 会使整个进程终止；进程之间通过退出状态与信号隔离。
- 创建代价不同。`fork` 需要复制页表并建立写时复制映射，`pthread_create` 主要分配栈与任务结构。
- 线程调用 `exit` 会终止整个进程，线程入口应返回或调用 `pthread_exit`。

### 1.2 进程地址空间包含哪些区域？

- 用户态区域包括代码段、只读数据、已初始化数据、未初始化数据、堆、内存映射区、栈，以及 `vDSO` 与 `vvar`。
- 区域由 VMA 描述，`/proc/pid/maps` 逐行列出地址范围、权限、偏移、设备、inode 与路径。
- 可执行文件由内核的 ELF 加载器映射，动态链接器负责重定位与共享库加载。
- `mm_struct` 保存 `pgd`、VMA 链表与红黑树，以及 `start_brk`、`brk`、`start_stack` 等边界字段。
- 内核态部分使用独立的内核栈，x86-64 上通常为 16 KiB，由 `THREAD_SIZE` 决定。
- 内核地址空间在所有进程中共享，用户态不可访问，数据通过 `copy_from_user` 与 `copy_to_user` 交换。
- 地址随机化由 `/proc/sys/kernel/randomize_va_space` 控制，影响栈、mmap 基址、堆与 PIE 可执行文件。

### 1.3 PCB 与 task_struct 保存哪些状态？

- 标识与关系。`pid`、`tgid`、`pgid`、`sid`，以及 `real_parent`、`parent`、`children`。
- 调度状态。`__state`、`prio`、`static_prio`、`se`、`on_rq` 与 `sched_class`。
- 内存描述符。`mm` 指向用户地址空间；内核线程的 `mm` 为空，通过 `active_mm` 借用上一个任务的地址空间。
- 文件与命名空间。`files_struct`、`fs_struct`、`nsproxy` 分别描述打开文件、根目录与命名空间。
- 信号相关。`signal_struct` 在线程组内共享，`sighand_struct` 保存信号处置，`pending` 与 `blocked` 分别为待决队列与阻塞掩码。
- 上下文。`thread_struct` 保存切换所需的栈指针、FPU 状态、TLS 基址与调试寄存器。
- 内核栈。`stack` 指向 `thread_info` 所在的内核栈，`flags` 保存 `TIF_*` 标志。

### 1.4 fork 的实现过程是什么？

- 用户态 `fork` 由 glibc 封装为 `clone(SIGCHLD, ...)`，内核入口为 `kernel_clone`。
- `copy_process` 复制 `task_struct` 与内核栈，复制或共享 `files_struct`、`fs_struct` 与信号处置。
- `copy_mm` 为子进程建立新的 `mm_struct`，`copy_page_range` 复制页表项但不复制物理页。
- 父子的 PTE 被清写位并设为只读，物理页引用计数加一，形成写时复制映射。
- 任一进程写入时触发保护缺页，由 `do_wp_page` 决定复用原页还是分配新页并复制内容。
- 子进程经 `ret_from_fork` 返回 0，父进程从 `kernel_clone` 得到子进程的 `pid`。
- 失败路径包括 `ENOMEM`（任务结构或页表分配失败）与 `EAGAIN`（触及 `RLIMIT_NPROC` 或线程上限）。

### 1.5（辨析）fork、vfork 与 clone 有什么区别？

- `fork` 创建独立地址空间并采用写时复制；`vfork` 与父进程共享地址空间，同时阻塞父进程直到子进程 `exec` 或退出。
- `clone` 是通用系统调用，通过标志位选择共享哪些资源，`fork` 与 `vfork` 在内核中都可由此表达。
- `CLONE_VM` 共享地址空间，`CLONE_FILES` 共享文件描述符表，`CLONE_FS` 共享根目录与当前目录，`CLONE_SIGHAND` 共享信号处置。
- `CLONE_THREAD` 使新任务与调用者属于同一线程组，`getpid` 返回相同值，`gettid` 不同。
- glibc 的 `pthread_create` 调用 `clone`，传入 `CLONE_VM`、`CLONE_FS`、`CLONE_FILES`、`CLONE_SIGHAND`、`CLONE_THREAD` 等标志，并指定新栈。
- `CLONE_VFORK` 使父进程进入不可中断睡眠，等待子进程 `execve` 或 `_exit` 后唤醒。
- `CLONE_NEWPID`、`CLONE_NEWNS` 等标志创建命名空间，用于容器隔离，`fork` 无法表达这类组合。
- `clone` 的栈由调用者提供，`fork` 的子进程沿用与父进程相同的虚拟地址。

### 1.6（陷阱）fork 之后父子进程共享哪些资源？

- 共享打开文件描述。父子 fd 指向同一 `struct file`，共享文件偏移与状态标志。
- 共享文件偏移意味着并发读写会交错，追加写的行为取决于 `O_APPEND`。
- 不共享地址空间。写时复制使修改互不可见，除非使用共享映射。
- 不共享 `fcntl` 记录锁，子进程不继承；`flock` 锁绑定打开文件描述，会被继承。
- 子进程不继承 `mlock` 与 `mlockall` 的内存锁，也不继承定时器与待决信号。
- 子进程继承信号处置、信号掩码、`umask`、资源限制、当前目录与环境变量。
- `stdio` 缓冲区在 `fork` 时被复制，父子各自刷新会在输出中产生重复内容。

### 1.7（辨析）1:1、N:1 与 N:M 线程模型有何差异？

- 1:1 模型为每个用户线程创建一个内核调度实体，Linux 的 NPTL 采用该模型。
- N:1 模型在用户态调度多个执行流，只占用一个内核线程；切换不进入内核，但阻塞系统调用会阻塞整个进程，也无法利用多核。
- N:M 模型把多个用户线程复用到少量内核线程，需要用户态调度器与内核协作，实现复杂，Linux 主线不支持。
- 1:1 的代价是创建与切换都进入内核，线程数受内存、`RLIMIT_NPROC` 与 cgroup 的 `pids.max` 限制。
- 1:1 的优势是阻塞调用只影响当前线程，多核并行直接由内核调度器处理。
- 用户态协程通常建立在 N:1 或 M:N 之上，切换只保存少量寄存器，代价在数十纳秒量级，由实现决定。
- 线程标识有两套。`pthread_t` 是用户态句柄，`gettid` 返回内核线程号。

### 1.8 用户态栈与内核态栈如何组织？

- 每个线程有独立的用户栈，glibc 默认 8 MiB，由 `mmap` 分配，低地址处放置 `PROT_NONE` 的 guard page。
- 主线程栈在 `exec` 时由内核建立，初始 VMA 较小，缺页时向下扩展，上限为 `RLIMIT_STACK`。
- 进入内核时使用该线程的内核栈，x86-64 上通常 16 KiB，保存 `pt_regs`、返回地址与局部变量。
- 系统调用通过 `syscall` 指令切换到内核栈，栈指针来自 per-CPU 入口栈或 `TSS.sp0`。
- 内核栈没有硬件 guard，溢出会破坏相邻内存；`CONFIG_VMAP_STACK` 用 `vmalloc` 加保护页检测。
- 信号处理函数默认运行在用户栈上，`sigaltstack` 配合 `SA_ONSTACK` 可改用备用栈。
- 用户栈越界访问触发 `SIGSEGV`，内核在 `expand_stack` 中判断是否允许扩展。

### 1.9 上下文切换保存与恢复哪些状态？

- 调度器在 `__schedule` 中选出下一个任务，调用 `context_switch`，最终进入 `switch_to` 汇编。
- 保存 callee-saved 寄存器，包括 `rbx`、`rbp`、`r12` 至 `r15`，以及栈指针与指令指针。
- FPU 与向量寄存器保存在 XSAVE 区域，是否延迟恢复由内核配置与 CPU 特性决定。
- 切换地址空间时写入 `CR3`；启用 PCID 时保留带标记的 TLB 项，否则相关项失效。
- 用户态与内核态之间的切换不更换 `current`，只切换栈与特权级，代价低于任务切换。
- 一次任务切换的耗时在微秒量级，实际值取决于缓存工作集、是否更换页表与 CPU 微架构。
- 频繁切换的代价包括 TLB 与缓存失效，绑核与减少唤醒可降低开销。

### 1.10 系统调用的执行过程是什么？

- 用户态把调用号放入 `rax`，前六个参数放入 `rdi`、`rsi`、`rdx`、`r10`、`r8`、`r9`，然后执行 `syscall`。
- CPU 依据 `MSR_LSTAR` 跳转到 `entry_SYSCALL_64`，切换到内核栈并保存 `pt_regs`。
- 内核以调用号为索引查 `sys_call_table` 分派，参数超过六个时通过指针传递。
- 返回值放在 `rax`，负值表示 `-errno`，glibc 转换为 -1 并设置 `errno`。
- 返回用户态通常使用 `sysretq`，部分缓解配置下改用 `iretq`。
- 一次空系统调用在几十到几百纳秒量级，受 Spectre 缓解与硬件影响，具体由实现决定。
- `vDSO` 把 `clock_gettime`、`gettimeofday` 等实现映射到用户态，避免陷入内核。

### 1.11 进程状态与僵尸进程是什么关系？

- 常见状态包括 `TASK_RUNNING`、`TASK_INTERRUPTIBLE`、`TASK_UNINTERRUPTIBLE`、`__TASK_STOPPED`、`EXIT_ZOMBIE` 与 `EXIT_DEAD`。
- 退出时 `do_exit` 释放地址空间与打开文件，保留 `task_struct` 与退出状态供父进程读取。
- 父进程调用 `wait` 或 `waitpid` 后，内核执行 `release_task` 释放剩余结构。
- 父进程未回收时子进程停留在僵尸态，占用 `pid` 与少量内核内存，不占用用户内存。
- `SIGCHLD` 的默认处置是忽略，但忽略不会自动回收；显式设为 `SIG_IGN` 或使用 `SA_NOCLDWAIT` 才会自动回收。
- `PR_SET_CHILD_SUBREAPER` 让指定进程收养孤儿，容器 init 进程依赖该机制。
- 大量僵尸会耗尽 `pid` 空间，上限由 `/proc/sys/kernel/pid_max` 决定。

### 1.12 孤儿进程由谁回收？

- 父进程先退出时，子进程被挂到 `init` 或最近的 subreaper 下，成为孤儿进程。
- 收养者需要调用 `wait` 回收，否则孤儿退出后仍会成为僵尸。
- `daemon` 化通常连续 `fork` 两次并调用 `setsid`，使进程脱离控制终端且不是会话首进程。
- 孤儿进程保留原进程组与会话关系，除非主动调用 `setsid`。
- 进程组组长不能调用 `setsid`，因此第一次 `fork` 后由子进程执行该调用。
- 现代服务由 systemd 直接管理，`Type=simple` 或 `Type=notify` 省去自行 daemon 化。
- 容器内 pid 1 需要承担回收职责，否则僵尸会累积。

### 1.13 进程组、会话与控制终端有什么关系？

- `setpgid` 创建或加入进程组，`setsid` 创建新会话并使调用进程成为会话首进程。
- 会话首进程打开终端后获得控制终端，同一时刻只有一个前台进程组。
- 终端驱动把 `SIGINT`、`SIGQUIT`、`SIGTSTP` 发送给前台进程组。
- 后台进程组读取终端会收到 `SIGTTIN`，写入会收到 `SIGTTOU`，除非信号被忽略或终端配置允许。
- `tcsetpgrp` 切换前台进程组，shell 的作业控制依赖该调用。
- 守护进程调用 `setsid` 后没有控制终端，打开 `/dev/tty` 会失败并返回 `ENXIO`。
- 终端关闭时 `SIGHUP` 发送给会话首进程，常用于通知重载配置。

### 1.14 从 pthread_create 到 clone 经历了什么？

- glibc 为线程分配一块 `mmap` 区域，低地址放 `pthread` 结构，高地址作为栈，默认 8 MiB。
- `pthread_create` 最终调用 `clone`，带 `CLONE_VM`、`CLONE_THREAD`、`CLONE_SETTLS`、`CLONE_CHILD_CLEARTID` 等标志。
- 新线程从 `start_thread` 进入，设置 TLS 后调用用户入口函数。
- `pthread_join` 在线程描述符的 `tid` 字段上等待 futex，`CLONE_CHILD_CLEARTID` 在线程退出时清零并唤醒等待者。
- 未 join 且未 detach 的线程退出后，栈与描述符不会释放，效果类似僵尸。
- `pthread_detach` 让线程退出时自动回收资源。
- 线程创建失败返回 `EAGAIN`，原因包括资源限制与内存不足。

### 1.15 线程局部存储如何实现？

- 每个线程有独立的 TLS 块，x86-64 上通过 `%fs` 段基址访问，基址由 `arch_prctl(ARCH_SET_FS)` 设置。
- 静态 TLS 在程序加载时为每个线程分配固定偏移，动态 TLS 通过 `__tls_get_addr` 惰性分配。
- `thread_local` 变量自 C++11 起每线程一份，动态初始化在首次经过声明时完成。
- TLS 访问是段基址加偏移，代价接近普通全局变量；动态模型多一次函数调用。
- `fork` 后子进程只保留调用线程的 TLS 内容副本，其他线程的数据不存在于子进程。
- `errno` 是 TLS 变量，信号处理函数与主流程看到的是同一线程的副本。
- `dlopen` 与 `dlclose` 会分配与回收动态 TLS 的模块号，模块卸载后访问对应变量行为未定义。

### 1.16 信号在多线程进程中如何分发？

- 信号处置由线程组共享，`sigaction` 的修改对所有线程生效。
- 信号掩码是线程级属性，`pthread_sigmask` 只改变调用线程的掩码。
- 进程级信号送达任一未阻塞该信号的线程，内核通常选择主线程。
- 同步信号由触发异常的线程处理，如 `SIGSEGV`、`SIGFPE`、`SIGILL`。
- 常见做法是在所有线程阻塞信号，再由专用线程调用 `sigwait` 或 `sigwaitinfo` 集中处理。
- 信号处理函数只能调用 async-signal-safe 函数，`malloc`、`printf`、`pthread_mutex_lock` 不在其中。
- `SIGKILL` 与 `SIGSTOP` 不能被捕获、阻塞或忽略。

### 1.17 CPU 亲和性与调度器如何影响性能？

- `sched_setaffinity` 限定线程可运行的 CPU 集合，减少迁移带来的缓存失效。
- Linux 6.6 起默认调度器为 EEVDF，此前为 CFS；两者都按虚拟运行时间选择任务。
- 调度类按优先级排列，依次为 `stop`、`dl`、`rt`、`fair`、`idle`。
- `nice` 值影响权重与分到的 CPU 时间比例，不直接决定时间片长度。
- `SCHED_FIFO` 与 `SCHED_RR` 属于实时策略，优先于普通任务，配置不当会饿死其他任务。
- 过度绑核会削弱负载均衡，NUMA 系统还需考虑内存节点的亲和性。
- `sched_yield` 只把当前任务移到队列尾部，不保证让出给特定任务。

### 1.18 进程间通信方式如何选择？

- 管道提供字节流，没有消息边界，`pipe` 创建，默认容量 64 KiB。
- POSIX 消息队列保留消息边界，`mq_open` 返回文件描述符，可用 `select` 与 `epoll` 监听。
- 共享内存由 `shm_open` 加 `mmap` 建立，零复制，同步需自行实现。
- 信号量用于计数与互斥，`sem_open` 提供命名信号量，`eventfd` 适合通知。
- `AF_UNIX` 套接字支持传递文件描述符（`SCM_RIGHTS`）与对端凭据。
- 信号只承载有限信息，适合通知，不适合传输数据。
- 选择依据包括数据量、同步需求、跨主机能力与生命周期管理。

### 1.19（场景）服务线程数持续增长如何排查？

- 读取 `/proc/pid/status` 的 `Threads` 字段与 `/proc/pid/task` 下的线程目录，确认增长速率。
- 用 `gdb -p` 附加后执行 `thread apply all bt`，观察线程阻塞在哪个调用。
- 检查是否为每个请求创建线程且未 join 或 detach，或线程池队列无界。
- 检查阻塞 I/O 是否缺少超时，线程堆积在 `read`、`connect` 或 `accept`。
- 检查 `pthread_create` 的返回值，失败时 `errno` 为 `EAGAIN`。
- 查看 `/proc/pid/limits` 的 `Max processes` 与 cgroup 的 `pids.max`。
- 修复方向包括固定大小线程池、异步 I/O 与为阻塞调用设置超时。

### 1.20（实现）如何用 clone 创建共享地址空间的执行单元？

```cpp
#define _GNU_SOURCE
#include <sched.h>
#include <sys/wait.h>
#include <unistd.h>

static char stack[1 << 20];

static int child(void*) {
    write(1, "child\n", 6);
    _exit(0);
}

int main() {
    pid_t p = clone(child, stack + sizeof stack, CLONE_VM | SIGCHLD, nullptr);
    return waitpid(p, nullptr, 0) < 0;
}
```

- 栈由调用者提供，从高地址向下增长，示例使用静态数组，实际应避免共享全局栈。
- `CLONE_VM` 共享地址空间，子进程不可在共享栈上 `return`，应调用 `_exit`。
- 未传 `CLONE_THREAD` 时子进程是新进程，`getpid` 与父进程不同；传 `CLONE_THREAD` 才属于同一线程组。
- 未传 `CLONE_FILES` 时子进程复制 fd 表，关闭 fd 不影响父进程。
- `CLONE_SIGHAND` 必须与 `CLONE_VM` 同时使用，否则返回 `EINVAL`。
- 返回值是子进程的 TID，失败返回 -1 并设置 `errno`。
- 直接使用 `clone` 需自行处理 TLS、信号栈与退出流程，通常由 `pthread` 封装。

---

## 2. 虚拟内存与页表

### 2.1 虚拟内存解决了什么问题？

- 隔离。每个进程有独立地址空间，越界访问触发 `SIGSEGV`，不会破坏其他进程的内存。
- 抽象。物理页可以不连续，链接器与加载器按统一的虚拟地址布局工作。
- 超额分配。虚拟地址总量可以超过物理内存，物理页按访问逐步分配。
- 共享。同一物理页可以映射到多个进程，用于共享库、共享内存与写时复制。
- 保护。PTE 的读、写、执行权限由硬件检查，写时复制依赖清除写位实现。
- 文件映射。文件内容可以按内存语义访问，省去显式的 `read` 与 `write`。
- 代价。地址翻译依赖页表与 TLB，缺页需要陷入内核，页表本身占用内存。

### 2.2 分页与页表的基本结构是什么？

- 虚拟地址拆为页号与页内偏移，页大小通常 4 KiB，x86-64 另有 2 MiB 与 1 GiB 大页。
- 页表项保存物理页帧号与标志位，包括存在位、读写位、用户态位、访问位、脏位与执行禁用位。
- x86-64 四级页表依次为 PGD、PUD、PMD、PTE，每级 9 位索引，页内偏移 12 位。
- 48 位虚拟地址是常见配置，启用 5 级页表后扩展到 57 位。
- 一次翻译最多需要四次内存访问，TLB 命中可以避免遍历。
- 页表由 `mm_struct` 的 `pgd` 指向，进程切换时写入 `CR3`。
- 页表本身占用内存，48 位地址空间若全部映射，单级页表需要 512 GiB。

### 2.3（辨析）多级页表为什么能节省空间？

- 单级页表需要为整个虚拟地址范围连续存放表项，稀疏地址空间下浪费极大。
- 多级结构只为已映射区域分配下级表页，未使用范围的上级表项为空。
- 典型进程的页表只有数 MiB，与虚拟地址空间的理论大小无关。
- 代价是翻译路径变长，缺页时需逐级分配页表页，分配失败返回 `ENOMEM`。
- 大页减少层级，2 MiB 页在 PMD 层终止，不再需要 PTE 表页。
- 页表页不可换出，其内存计入内核内存，在容器中表现为不可回收开销。
- 页表共享只发生在 `fork` 的只读复制与 KSM 合并等场景，普通进程之间不共享。

### 2.4 TLB 的作用与失效时机是什么？

- TLB 缓存虚拟页到物理页的映射，一级容量几十项，二级上千项，分为指令与数据两类。
- 命中时翻译只需一个周期量级，未命中触发硬件页表遍历。
- 进程切换写入 `CR3` 后非全局项失效；启用 PCID 时用地址空间标识保留部分表项。
- 修改 PTE 后需用 `invlpg` 使单页失效，批量修改用 `flush_tlb_range`。
- 全局页不随 `CR3` 切换失效，内核映射通常设为全局。
- 工作集超过 TLB 覆盖范围时出现抖动，表现为页表遍历与缓存未命中上升。
- 大页扩大单个表项的覆盖范围，2 MiB 页使一项覆盖 512 个 4 KiB 页。

### 2.5 缺页异常的处理流程是什么？

- 访问未映射或权限不符的地址触发 `#PF`，`CR2` 保存故障地址，错误码区分读写、用户态与保护违规。
- 入口 `exc_page_fault` 调用 `handle_mm_fault`，按地址查找 VMA 并判断访问是否合法。
- 匿名页缺页时分配零页或从 swap 读入，建立 PTE 并设置权限。
- 文件页缺页时在页缓存中查找，缺失则提交读请求，进程睡眠直到 I/O 完成。
- 写时复制缺页发现 PTE 只读而 VMA 可写，分配新页并复制内容。
- 地址落在栈 VMA 下方且未超过 `RLIMIT_STACK` 时扩展栈。
- 无法处理时向进程发送 `SIGSEGV`，`si_code` 区分 `SEGV_MAPERR` 与 `SEGV_ACCERR`。

### 2.6 写时复制如何实现？

- `fork` 时 `copy_page_range` 把父子 PTE 都设为只读，物理页的 `mapcount` 加一。
- 任一进程写入触发保护缺页，`do_wp_page` 检查 `mapcount`，为 1 时直接恢复写权限。
- `mapcount` 大于 1 时分配新页，复制原内容，更新 PTE 并减少旧页引用。
- 复制粒度是单页，写入大块内存会引发大量缺页；`fork` 后立即 `exec` 的场景收益最大。
- `MADV_DONTFORK` 阻止映射被继承，`MADV_WIPEONFORK` 让子进程看到清零后的页。
- 页被页缓存或 `get_user_pages` 持有时引用计数不为 1，本可复用的页仍会被复制。
- 与 `vmsplice`、`sendfile` 等零复制路径交互时可能触发额外复制。

### 2.7 按需分页与零页如何工作？

- `mmap` 只建立 VMA，不分配物理页，首次访问才触发缺页。
- 匿名映射的读缺页映射到全局零页，写缺页才分配实际物理页。
- 文件映射按页缓存填充，顺序访问会触发预读。
- 缺页代价包括异常入口、VMA 查找、页分配或 I/O，在微秒到毫秒量级。
- `MAP_POPULATE` 或 `madvise(MADV_WILLNEED)` 可以提前填充页表。
- 大量小缺页会成为启动或反序列化阶段的瓶颈，预填充可换取确定性。

### 2.8 mmap 有哪几种映射方式？

- 匿名私有映射用于大块内存分配，典型参数为 `MAP_PRIVATE | MAP_ANONYMOUS`。
- 文件私有映射的写操作触发写时复制，修改不会写回文件。
- 文件共享映射的修改进入页缓存，并由回写机制写入文件。
- 共享匿名映射用于有共同祖先的进程共享内存，属于 Linux 扩展。
- `MAP_FIXED` 强制覆盖已有映射，通常改用 `MAP_FIXED_NOREPLACE`。
- `munmap` 按页对齐，部分解除映射会拆分 VMA。
- 失败返回 `MAP_FAILED`，需检查 `errno`，常见值为 `ENOMEM`、`EACCES`、`EINVAL`。

### 2.9 反向映射的作用是什么？

- 给定物理页找到所有映射它的 PTE，用于回收、迁移与写时复制。
- 匿名页通过 `anon_vma` 链表与 interval tree 组织。
- 文件页通过 `address_space` 的 `i_mmap` 区间树按偏移索引。
- 回收时 `try_to_unmap` 遍历反向映射，修改 PTE 并使 TLB 失效。
- 缺少反向映射时回收需要扫描所有进程页表，代价不可接受。
- 反向映射的维护在 `fork`、`mmap`、`munmap` 时增加开销，内核用对象缓存降低分配频率。

### 2.10 页表项里有哪些标志位？

- `_PAGE_PRESENT` 表示页在内存中，清零时其余位由内核解释为 swap 项。
- `_PAGE_RW` 控制写权限，写时复制依赖清除该位。
- `_PAGE_USER` 决定用户态是否可访问，内核访问用户页需通过 `copy_from_user` 等接口。
- `_PAGE_NX` 阻止取指，需要 CPU 支持 `EFER.NXE`。
- `_PAGE_ACCESSED` 与 `_PAGE_DIRTY` 由硬件置位，回收算法据此判断冷热。
- `_PAGE_SOFT_DIRTY` 由内核维护，用于迁移与 `userfaultfd` 场景。
- `PROT_NONE` 映射保留地址空间，访问时触发 `SIGSEGV`。

### 2.11 地址空间布局与 ASLR 有什么关系？

- 典型 x86-64 布局为低地址放可执行文件与堆，中间是 mmap 区，高地址放栈。
- mmap 基址自顶向下分配，与栈之间保留随机间隙。
- `randomize_va_space` 为 0 时关闭，为 1 时随机化栈与 mmap，为 2 时增加堆随机化。
- PIE 可执行文件整体随机化，非 PIE 文件的基址由链接器决定，通常接近 `0x400000`。
- 共享库为 `ET_DYN`，加载时通过重定位修正地址。
- 随机化降低漏洞利用的确定性，不阻止信息泄露后的绕过。

### 2.12（场景）如何借助 maps 与 smaps 排查内存问题？

- `/proc/pid/maps` 每行描述一个 VMA，包含地址范围、权限、偏移、设备、inode 与路径。
- 权限字符串中 `p` 表示私有映射，`s` 表示共享映射。
- 匿名映射的路径为空，或显示为 `[heap]`、`[stack]`、`[vdso]`。
- `smaps` 额外给出 `Rss`、`Pss`、`Shared_Clean`、`Private_Dirty`。
- `Pss` 把共享页按映射数均摊，适合估算进程的真实占用。
- VMA 数量过多说明映射碎片化，可能来自频繁 `mmap` 与 `munmap`。
- `maps` 与 `gdb` 的 `info proc mappings` 对应，可用于定位崩溃地址所属的映射。

### 2.13（辨析）major fault 与 minor fault 有什么区别？

- minor fault 不需要块设备 I/O，例如写时复制、零页映射、页已在页缓存。
- major fault 需要从块设备读入或从 swap 换入。
- `/proc/vmstat` 的 `pgfault` 与 `pgmajfault` 分别统计两类缺页。
- `perf stat -e page-faults` 只统计总数，不区分类型。
- 首次读文件映射通常是 major fault，之后同一文件的其他映射为 minor fault。
- 大量 major fault 说明工作集超过页缓存容量或换页频繁。
- 启动阶段的 major fault 可通过预读或预填充降低。

### 2.14 共享内存与文件映射是什么关系？

- `shm_open` 在 tmpfs 上创建对象，`ftruncate` 设定长度，`mmap` 建立映射。
- `MAP_SHARED` 的写入对其他映射者可见，同步需进程间互斥量。
- `MAP_SHARED | MAP_ANONYMOUS` 只适用于有共同祖先的进程。
- 共享内存本身不提供同步，互斥量需设置 `PTHREAD_PROCESS_SHARED` 属性并放在共享区。
- 映射长度变化需重新 `mmap`，已映射区域不会自动扩展。
- 对象的生命周期由 `shm_unlink` 与最后一个映射关闭共同决定。
- 共享内存省去用户态与内核态之间的数据复制，仍受缺页与 NUMA 局部性影响。

### 2.15 栈如何增长，guard page 起什么作用？

- 主线程栈 VMA 初始较小，缺页时向下扩展，扩展受 `RLIMIT_STACK` 与 guard gap 限制。
- VMA 下方保留 guard 区，越界访问触发 `SIGSEGV` 而非静默破坏内存。
- 线程栈由 glibc 用 `mmap` 分配，低地址带 `PROT_NONE` 的 guard page。
- `-fstack-protector` 检测栈帧内的缓冲区溢出，guard page 检测越界访问，两者机制不同。
- 超大局部数组可能一次越过 guard 区，使保护失效。
- `pthread_attr_setstacksize` 可调整线程栈大小，设置过小会导致溢出。
- 栈的物理页按需分配，RSS 通常远小于预留的虚拟大小。

### 2.16 堆与 mmap 区是什么关系？

- 小分配通过 `brk` 扩展堆区，大分配通过 `mmap` 建立独立映射。
- glibc 的 `M_MMAP_THRESHOLD` 默认 128 KiB，动态调整上限为 32 MiB。
- `mmap` 块在 `free` 时通常立即 `munmap`，`brk` 堆顶回收需满足空闲条件。
- 堆向高地址增长，mmap 区向低地址增长，二者之间为空洞。
- `sbrk` 是 `brk` 的历史接口，不可用于多线程环境。
- 直接调用 `brk` 与 `malloc` 混用会破坏分配器状态。

### 2.17 x86-64 的地址翻译步骤是什么？

- `CR3` 给出 PGD 基址，虚拟地址最高 9 位索引 PGD，取出 PUD 基址。
- 依次用接下来的 9 位索引 PUD、PMD、PTE，最后 12 位作为页内偏移。
- 每级检查存在位，缺失触发缺页；同时检查读写位、用户态位与执行禁用位。
- 物理地址等于页帧基址加页内偏移。
- 启用 PCID 时 `CR3` 低位保存地址空间标识。
- 大页在 PUD 或 PMD 层终止，剩余低位直接作为偏移。
- 页表遍历器可缓存中间层结果，减少重复遍历的开销。

### 2.18（场景）VSZ 很大而 RSS 很小，是否说明内存泄漏？

- VSZ 是映射的虚拟地址总量，包含未触碰的匿名映射与预留区。
- RSS 是驻留物理页，包含共享页，不包含已换出页。
- 大 VSZ 常见于线程栈预留（每线程 8 MiB）、mmap 预留与 glibc 的 arena。
- 大块 `malloc` 后只写少量页时，VSZ 增长而 RSS 基本不变。
- 判断泄漏应看 RSS、Pss 与 `Private_Dirty` 随时间的趋势。
- `VmSwap` 与 cgroup 的 `memory.current` 提供另一视角。
- 容器中 `memory.current` 包含页缓存，需结合 `memory.stat` 的 `anon` 与 `file` 判断。

### 2.19 madvise 的常见建议值有哪些？

- `MADV_DONTNEED` 对匿名私有映射释放物理页，内容丢失；对文件映射只丢弃干净页。
- `MADV_FREE` 标记页可回收，内存压力下才真正释放，期间读到的值不确定。
- `MADV_WILLNEED` 触发预读，`MADV_SEQUENTIAL` 调整预读窗口。
- `MADV_HUGEPAGE` 与 `MADV_NOHUGEPAGE` 控制透明大页的使用。
- `MADV_DONTFORK` 与 `MADV_WIPEONFORK` 影响 `fork` 后的继承行为。
- `MADV_POPULATE_READ` 预填充页表，失败时返回 `EFAULT`。
- 这些建议值只影响内核策略，不保证立即生效。

### 2.20（实现）如何用 mmap 建立父子进程共享的计数器？

```cpp
#include <atomic>
#include <new>
#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>

int main() {
    void* m = mmap(nullptr, 4096, PROT_READ | PROT_WRITE,
                   MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    auto* p = new (m) std::atomic<int>(0);
    if (fork() == 0) { p->fetch_add(1); _exit(0); }
    wait(nullptr);
    p->fetch_add(1);
    return p->load();
}
```

- `MAP_SHARED` 使父子映射到同一物理页，`MAP_ANONYMOUS` 表示不关联文件。
- 计数器需使用原子类型或互斥量，普通 `int` 的并发自增存在数据竞争。
- `fork` 后两个进程的虚拟地址相同，映射指向同一物理页。
- `wait` 保证子进程完成后父进程再读取，否则存在顺序问题。
- 进程退出时映射自动解除，显式 `munmap` 可提前释放。
- 映射长度按页取整，示例使用 4096 字节。
- 若改为 `MAP_PRIVATE`，子进程写入会触发写时复制，父进程看不到更新。

---

## 3. 内存分配与系统调用

### 3.1（辨析）brk 与 mmap 分配内存有什么区别？

- `brk` 调整堆顶，分配区域连续，只能整体伸缩；`mmap` 在映射区建立独立的 VMA。
- `brk` 释放的内存不一定归还，堆顶收缩要求顶部连续空闲。
- `mmap` 块释放时直接 `munmap`，归还彻底，代价是系统调用与 VMA 维护开销。
- `brk` 在多线程下需要 arena 锁，`mmap` 每次调用相互独立。
- 小块分配倾向 `brk` 以减少 VMA 数量，大块分配倾向 `mmap`。
- 碎片形态不同。堆中的空洞无法单独归还，mmap 区按块回收。
- 阈值由 `M_MMAP_THRESHOLD` 控制，可用 `mallopt` 调整。

### 3.2 malloc 的 arena 是什么？

- 主 arena 使用 `brk`，非主 arena 通过 `mmap` 分配 64 MiB 的堆区域。
- 线程首次分配时绑定 arena，数量上限为 CPU 数的 8 倍（64 位），可被 `MALLOC_ARENA_MAX` 限制。
- 每个 arena 有独立的互斥量与 bin，减少跨线程锁竞争。
- arena 创建后不销毁，线程退出后其 arena 仍然保留，虚拟内存因此偏高。
- 分配路径优先查 tcache，未命中再进入 arena。
- arena 过多会加剧碎片，arena 过少会增加竞争。
- `malloc_info` 可输出各 arena 的统计。

### 3.3 malloc 的 bin 如何组织？

- tcache 是每线程缓存，共 64 个 bin，每个最多 7 块，后进先出，访问不加锁。
- fastbin 存放小于 `global_max_fast` 的块，单链表，后进先出，默认不合并。
- smallbin 存放小于 1024 字节的块，双向循环链表，按大小分为 62 个。
- largebin 存放更大的块，按大小区间组织，区间内有序。
- unsorted bin 接收刚释放的块，下次分配时归位到对应 bin。
- 合并依赖块头中的 `prev_inuse` 位与 `size` 字段，合并后的块进入 unsorted bin。
- 每块都有元数据开销，64 位上至少 16 字节，并按 16 字节对齐。

### 3.4 mmap 阈值如何影响分配？

- 默认 `M_MMAP_THRESHOLD` 为 128 KiB，超过该值的分配走 `mmap`。
- 释放 mmap 块时阈值会动态提升到该块大小，上限为 32 MiB。
- 动态提升减少 `mmap` 与 `munmap` 次数，代价是堆内存增长。
- `mallopt(M_MMAP_THRESHOLD, n)` 可固定阈值并关闭动态调整。
- `M_TRIM_THRESHOLD` 控制空闲堆顶达到多少时收缩。
- 对 RSS 敏感的服务可降低阈值，让大块及时归还。
- 分配大小频繁跨越阈值会导致分配路径抖动。

### 3.5 free 之后内存何时归还操作系统？

- `free` 通常只把块放回 bin，不调用 `brk` 或 `munmap`。
- 只有 mmap 块或堆顶足够大时，内存才归还内核。
- `malloc_trim` 主动收缩堆顶，遍历并释放可回收的页。
- `M_TRIM_THRESHOLD` 决定堆顶空闲多少才触发 `brk` 收缩。
- 释放的内存仍计入 RSS，直到被复用或被回收。
- 多 arena 使空闲内存分散，堆顶收缩只作用于单个 arena。

### 3.6 内存碎片有哪几类？

- 内部碎片来自对齐与最小块取整，指块内未被使用的部分。
- 外部碎片指空闲块总量足够但没有连续大块满足请求。
- 长期运行的服务因不同大小对象交错分配产生外部碎片，RSS 上升而活跃数据不变。
- jemalloc 用 size class 与 slab 降低外部碎片。
- glibc 通过合并相邻空闲块降低外部碎片，代价是释放路径变慢。
- 大块走 `mmap` 可绕过堆内碎片，但增加缺页与 TLB 压力。
- 监控 `malloc_info` 的空闲块统计与 `smaps` 的 `Private_Dirty`。

### 3.7 透明大页与显式大页有什么区别？

- 透明大页由内核自动把 4 KiB 页合并为 2 MiB 页，`enabled` 可取 `always`、`madvise`、`never`。
- `madvise` 模式只在标记 `MADV_HUGEPAGE` 的区域启用。
- 显式大页通过 hugetlbfs 或 `MAP_HUGETLB` 使用，需要预留 `nr_hugepages`。
- `khugepaged` 后台合并会造成延迟抖动，`defrag` 策略影响分配成功率。
- 大页减少 TLB 未命中与页表层级，适合大工作集与顺序访问。
- 小对象分配收益有限，还可能因内部碎片浪费内存。
- 数据库类负载常关闭透明大页，改用显式大页控制布局。

### 3.8 OOM killer 如何选择进程？

- 触发条件为内存与 swap 耗尽，或 cgroup 限额触顶且回收失败。
- 选择依据 `oom_score`，由 `oom_score_adj`（-1000 到 1000）、内存占用与运行时长调整。
- 内核向选中进程发送 `SIGKILL`，该信号不可捕获。
- `oom_score_adj` 设为 -1000 可豁免，但系统整体耗尽时仍可能被杀。
- cgroup v2 的 `memory.oom.group` 让整组进程一起终止。
- 记录出现在 `dmesg` 中，包含各进程的 `oom_score` 与内存统计。
- 预防手段包括限制 cgroup 内存、设置 `memory.high` 提前节流、监控 `memory.events`。

### 3.9 overcommit 策略如何影响分配？

- `overcommit_memory` 为 0 时使用启发式检查，明显超额的请求被拒绝。
- 为 1 时总是允许，可能在触碰内存时触发 OOM。
- 为 2 时按 `CommitLimit` 拒绝，`CommitLimit` 由 swap 与内存乘以 `overcommit_ratio` 决定。
- 允许超额分配使大块 `malloc` 在不触碰内存时不会失败。
- `MAP_NORESERVE` 可显式跳过预留检查。
- 数据库与实时系统倾向模式 2，避免 OOM 随机终止进程。
- 模式 2 下 `fork` 大进程可能因预留失败返回 `ENOMEM`。

### 3.10 cgroup 内存限制如何生效？

- `memory.max` 是硬限制，超过时先回收，回收失败触发 OOM。
- `memory.high` 是节流阈值，超过后进程被限速并承受回收压力。
- `memory.current` 包含匿名页与页缓存，`memory.stat` 细分 `anon`、`file`、`slab`。
- 回收优先丢弃干净页缓存，再写回脏页或换出匿名页。
- `memory.swap.max` 控制 swap 使用量。
- 容器中 RSS 与 `memory.current` 不一致，后者包含页缓存。
- `memory.pressure` 提供 PSI 指标，可用于判断内存压力来源。

### 3.11（场景）如何排查内存泄漏？

- 观察 RSS 与 `Private_Dirty` 的长期趋势，排除页缓存与共享库的干扰。
- AddressSanitizer 的 LeakSanitizer 在退出时报告未释放的分配。
- `valgrind --leak-check=full` 适合测试环境，运行代价高。
- `heaptrack` 与 massif 采样堆分配，定位增长的调用栈。
- `malloc_info` 输出各 arena 的空闲块统计，用于区分碎片与泄漏。
- 区分泄漏与缓存增长，检查容器是否有上限与淘汰策略。
- 用 bpf 或 `gdb` 在 `malloc` 上采样，获取分配栈。

### 3.12 free 之后 RSS 为什么不下降？

- glibc 保留空闲块以备复用，只有 mmap 块与堆顶会归还。
- `MADV_DONTNEED` 可释放物理页但保留 VMA，之后访问重新缺页。
- `malloc_trim(0)` 收缩堆顶，释放可回收的页。
- tcache 与 fastbin 中的块不参与合并，长期占用内存。
- 多 arena 导致空闲内存分散，`MALLOC_ARENA_MAX` 可限制数量。
- 判断是否泄漏应看活跃对象数，不能只看 RSS。
- 容器中页缓存也计入 `memory.current`，需要用 `memory.stat` 区分。

### 3.13（实现）如何基于 mmap 实现简单的顺序分配器？

```cpp
#include <cstddef>
#include <sys/mman.h>

char* base; std::size_t used, cap;

void init(std::size_t n) {
    base = static_cast<char*>(mmap(nullptr, n, PROT_READ | PROT_WRITE,
                                   MAP_PRIVATE | MAP_ANONYMOUS, -1, 0));
    cap = n, used = 0;
}

void* bump(std::size_t n) {
    std::size_t a = (n + 15) & ~std::size_t(15);
    if (used + a > cap) return nullptr;
    used += a;
    return base + used - a;
}
```

- 一次映射大块虚拟内存，分配只是指针递增，单次分配为常数时间。
- 按 16 字节对齐，满足常见类型的对齐要求。
- 不支持单独释放，回收以整体 `munmap` 为单位。
- 适合生命周期一致、批量创建的对象，如解析阶段产生的节点。
- 失败路径包括 `mmap` 返回 `MAP_FAILED` 与容量耗尽返回空指针。
- 不对内存清零，匿名映射首次访问由零页提供。
- 多线程使用需加锁，或为每个线程划分独立区域。

### 3.14 malloc_trim 与 mallopt 有什么作用？

- `malloc_trim(pad)` 从堆顶回收空闲内存，并保留 `pad` 字节。
- `mallopt(M_TRIM_THRESHOLD, n)` 调整触发收缩的空闲阈值。
- `mallopt(M_MMAP_THRESHOLD, n)` 固定 mmap 阈值并关闭动态调整。
- `mallopt(M_ARENA_MAX, n)` 限制 arena 数量。
- 这些接口是 glibc 扩展，其他分配器不一定提供。
- 频繁调用 `malloc_trim` 会增加系统调用与后续缺页，需要权衡。
- 可在低峰期调用，降低 RSS 与容器的内存计费。

### 3.15 多线程分配竞争如何影响性能？

- 所有线程争用同一 arena 的互斥量会导致自旋与上下文切换。
- tcache 让小块分配免锁，但缓存满后仍进入 arena。
- arena 数量随线程增长，碎片与虚拟内存随之上升。
- `MALLOC_ARENA_MAX` 限制 arena，牺牲并发换取内存占用。
- jemalloc 与 tcmalloc 用线程缓存、size class 与 slab 降低竞争。
- `perf` 可观察 futex 竞争与 `malloc` 调用热点。
- 高频分配的小对象应改为对象池或批量分配。

### 3.16（陷阱）malloc(0)、realloc 与 calloc 有哪些边界？

- `malloc(0)` 返回可 `free` 的唯一指针或空指针，由实现定义。
- `realloc(p, 0)` 自 C23 起行为未定义，此前由实现定义。
- `realloc` 失败时返回空指针，原块保持有效。
- `realloc` 可能移动块并返回新地址，旧指针随即失效。
- `calloc` 的零初始化对大块可由内核零页满足，不一定逐字节写入。
- 请求大小超过 `PTRDIFF_MAX` 时行为由实现定义，glibc 返回空指针并设置 `ENOMEM`。
- 对空指针调用 `free` 是合法的空操作。

### 3.17（输出题）下列程序输出什么？

```cpp
#include <cstdio>
#include <cstdlib>
#include <malloc.h>

int main() {
    void* p = std::malloc(1);
    std::printf("%zu\n", malloc_usable_size(p));
    std::free(p);
}
```

- 输出由实现定义，glibc 在 64 位上通常输出 24。
- glibc 的最小块为 32 字节，包含 16 字节头部并满足 16 字节对齐。
- 可用大小可能大于请求大小，写入超过请求大小的字节不属于可移植行为。
- `malloc_usable_size` 是 glibc 扩展，不属于 C 标准。
- `free` 之后调用该函数行为未定义。
- 依赖该值做序列化会把程序绑定到具体分配器。

### 3.18（辨析）页缓存与匿名页的回收有什么差异？

- 文件页有磁盘后备，干净页可直接丢弃，脏页需先写回。
- 匿名页没有后备存储，需要 swap 或由 OOM 处理。
- 回收优先级受 `vm.swappiness` 与 active/inactive LRU 链表影响。
- `kswapd` 在低于水位时后台回收，直接回收在分配路径上阻塞。
- `drop_caches` 只丢弃干净页缓存，不影响脏页与匿名页。
- 容器中页缓存计入 `memory.current`，压力下先被丢弃。
- `mlock` 的页不可回收，计入 unevictable 统计。

### 3.19（场景）服务 RSS 缓慢增长但无明显泄漏，如何定位？

- 检查分配器碎片，`malloc_info` 中空闲块数量与总大小是否持续上升。
- 检查 arena 与线程数量是否同步增长。
- 检查缓存结构是否只增不删，如无上限的哈希表。
- 检查 mmap 映射是否累积，`maps` 行数是否增长。
- 检查透明大页是否把页合并为 2 MiB，造成 RSS 阶跃。
- 用 `Pss` 排除共享库与页缓存干扰。
- `perf record -g` 定位分配热点。

### 3.20（场景）容器内进程被 OOM 杀死如何定位？

- 查看 `dmesg` 中的 `oom-kill` 记录，确认 cgroup 与进程。
- 读取 `memory.events` 的 `oom` 与 `oom_kill` 计数。
- 读取 `memory.peak` 与 `memory.current`，判断峰值与当前值。
- 用 `memory.stat` 区分匿名页与页缓存的占比。
- 检查 `memory.max` 与 `memory.high` 是否设置过小。
- 检查是否存在大块 `mmap` 后集中触碰造成的瞬时峰值。
- 复现时限制 `memory.high` 观察节流点，或降低并发度。

---

## 4. 文件 I/O 与文件描述符

### 4.1 open 的常用标志有哪些？

- `O_RDONLY`、`O_WRONLY`、`O_RDWR` 三者选一，决定访问模式。
- `O_CREAT` 需要 `mode` 参数，最终权限受 `umask` 影响。
- `O_EXCL` 与 `O_CREAT` 合用保证原子创建，文件已存在时返回 `EEXIST`。
- `O_TRUNC` 清空已有文件，`O_APPEND` 在每次写入前定位到末尾。
- `O_CLOEXEC` 在 `exec` 时自动关闭，避免 fd 泄漏到子进程。
- `O_NONBLOCK`、`O_SYNC`、`O_DIRECT` 改变 I/O 语义，部分标志需要文件系统支持。
- 失败返回 -1，`errno` 区分 `ENOENT`、`EACCES`、`EISDIR`、`EMFILE`、`ENFILE`。

### 4.2 文件描述符表、file 与 inode 是什么关系？

- `files_struct` 中的 `fdtable` 把整数索引映射到 `struct file` 指针。
- `struct file` 表示打开文件描述，保存偏移 `f_pos`、状态标志、`f_op` 与引用计数。
- `struct inode` 表示文件本身，保存元数据、权限、大小与块映射。
- `dentry` 把路径分量连接到 inode，并缓存在 dcache 中。
- 多次 `open` 同一路径产生不同的 `struct file`，偏移相互独立。
- `dup` 让两个 fd 指向同一 `struct file`，共享偏移与标志。
- `fork` 复制 fd 表，父子共享 `struct file` 与偏移。

### 4.3（辨析）dup、dup2 与 dup3 有什么区别？

- `dup` 返回最小可用 fd，新 fd 指向同一 `struct file`。
- `dup2(old, new)` 先关闭 `new`（若已打开）再复制，可指定目标 fd。
- `dup2` 的关闭与复制对调用者而言是原子的，`dup3` 在其基础上增加 `flags` 参数以设置 `O_CLOEXEC`。
- `dup3` 要求 `old` 与 `new` 不同，并接受 `flags` 参数。
- 复制后两个 fd 共享偏移与状态标志，关闭其中一个不影响另一个。
- `fcntl(F_DUPFD_CLOEXEC)` 可指定最小 fd 并设置 close-on-exec。
- fd 耗尽时返回 `EMFILE`。

### 4.4 文件偏移量在哪些情况下共享？

- `lseek` 修改 `struct file` 中的 `f_pos`，返回新偏移。
- `pread` 与 `pwrite` 带显式偏移，不改变 `f_pos`，适合多线程并发读。
- 共享 `struct file` 的 fd 共享偏移，并发读写会交错。
- `O_APPEND` 使每次 `write` 在内核中原子定位到末尾。
- 管道与套接字不支持定位，`lseek` 返回 `ESPIPE`。
- 超过 32 位范围需启用 64 位文件偏移接口。
- 稀疏文件中 `lseek` 越过末尾再写入会创建空洞。

### 4.5 read 与 write 的返回值如何处理？

- `read` 返回实际读取的字节数，可能小于请求长度。
- `read` 返回 0 表示到达文件末尾。
- 返回 -1 且 `errno` 为 `EINTR` 表示被信号中断，通常重试。
- `errno` 为 `EAGAIN` 表示非阻塞模式下暂无数据。
- `write` 可能部分写入，需要循环处理剩余部分。
- `write` 成功只表示数据进入页缓存，不表示已落盘。
- 请求长度超过 `SSIZE_MAX` 时行为由实现定义。

### 4.6 阻塞与非阻塞 I/O 的差异是什么？

- 阻塞 fd 在无数据时使进程进入 `TASK_INTERRUPTIBLE`，由等待队列唤醒。
- `O_NONBLOCK` 使操作立即返回 `EAGAIN`，由调用者轮询或配合多路复用。
- 阻塞状态可被信号打断，返回 `EINTR`。
- `select`、`poll`、`epoll` 配合非阻塞 fd 可避免边缘触发下的阻塞。
- 常规文件的读写通常不阻塞，页缓存未命中时仍需等待 I/O。
- 套接字可用 `SO_RCVTIMEO` 与 `SO_SNDTIMEO` 设置超时。
- 阻塞调用占用线程，线程数受栈大小与调度开销限制。

### 4.7（辨析）flock 与 fcntl 记录锁有什么区别？

- `flock` 基于打开文件描述，锁随 `struct file` 共享，`fork` 后被继承。
- `fcntl` 记录锁基于进程与 inode，`fork` 后子进程不继承。
- `flock` 只有共享锁与排他锁，`fcntl` 支持字节范围锁。
- `fcntl` 锁在进程关闭该文件的任一 fd 时全部释放，容易误释放。
- `F_OFD_SETLK` 基于打开文件描述，解决上述问题。
- 锁只在协作进程之间有效，不阻止其他进程直接 `write`。
- NFS 上的语义由实现与挂载选项决定。

### 4.8 ioctl 的用途与边界是什么？

- 通用控制接口，命令号编码方向、大小与类型，由 `_IOR`、`_IOW`、`_IOWR` 构造。
- 终端使用 `TCGETS` 与 `TCSETS`，网络设备使用 `SIOCGIFADDR` 等命令。
- 参数多为指针，内核需通过 `copy_from_user` 校验并复制。
- 命令号冲突会导致未定义行为，需要按设备类型分配。
- 不适合传输大量数据，数据传输应走 `read` 与 `write`。
- 失败路径包括 `ENOTTY`、`EFAULT`、`EINVAL`。
- 新接口倾向使用 sysfs 或 `io_uring`，设备控制仍以 `ioctl` 为主。

### 4.9 缓冲 I/O 有哪几个层次？

- 用户态 `stdio` 缓冲、内核页缓存、块层与设备缓存构成多层缓冲。
- `write` 返回时数据通常在页缓存，`fsync` 才保证落盘。
- `setvbuf` 控制 `stdio` 的缓冲模式与大小。
- 行缓冲在终端下遇到换行刷新，全缓冲在缓冲区满时刷新。
- `O_SYNC` 使每次 `write` 等待数据与元数据落盘，代价高。
- `O_DSYNC` 只等待数据与检索所需的元数据。
- 直接 I/O 绕过页缓存，需要自行处理对齐与缓存一致性。

### 4.10（场景）如何排查文件描述符泄漏？

- `/proc/pid/fd` 列出打开的 fd 及目标，`ls -l` 可见管道与套接字。
- `/proc/pid/fdinfo` 给出偏移与标志。
- `lsof -p pid` 汇总，`ls /proc/pid/fd | wc -l` 计数。
- 对照 `RLIMIT_NOFILE` 判断是否接近上限。
- 常见原因包括异常路径未 `close`、`accept` 后未关闭、`dup` 后遗留。
- 缺少 `O_CLOEXEC` 会使 fd 泄漏到 `exec` 后的子进程。
- 出现 `EMFILE` 时应先定位增长速率，不宜直接提高上限。

### 4.11 epoll 与文件描述符是什么关系？

- `epoll_create1` 返回 fd，内核维护 interest list 与 ready list。
- `epoll_ctl` 注册 fd 与事件，`epoll_wait` 返回就绪项。
- 水平触发在未处理完时持续返回，边缘触发只在状态变化时返回一次。
- 边缘触发必须配合非阻塞 fd，并循环读到 `EAGAIN`。
- 同一 `struct file` 的多个 fd 注册到同一 epoll 只保留一个。
- `EPOLLONESHOT` 使事件只报告一次，之后需重新注册。
- 关闭 fd 会自动从 epoll 移除，前提是没有其他引用。

### 4.12（输出题）fork 之后父子进程的读偏移如何变化？

```cpp
int fd = open("a.txt", O_RDONLY);   // 文件内容为 abc
char c;
read(fd, &c, 1);
if (fork() == 0) {
    read(fd, &c, 1);
    printf("%c\n", c);
    _exit(0);
}
wait(nullptr);
```

- 输出为 b。父子共享同一 `struct file`，偏移已前进到 1。
- `fork` 复制 fd 表，但 `struct file` 只有一份，引用计数加一。
- 若父子各自 `open` 同一路径，则各自持有独立偏移，都会读到第一个字节。
- 子进程的 `c` 是修改后的副本，父进程的 `c` 不受影响。
- `O_APPEND` 只影响写入定位，不改变读取偏移的共享性质。
- 重定向与 `dup` 产生的 fd 同样共享偏移。

### 4.13（实现）如何用 dup2 重定向标准输出？

```cpp
#include <fcntl.h>
#include <unistd.h>
#include <cstdio>

int main() {
    int fd = open("out.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) return 1;
    dup2(fd, STDOUT_FILENO);
    close(fd);
    std::printf("hello\n");
}
```

- `dup2` 关闭目标 fd 后复制，目标与源指向同一 `struct file`。
- 关闭原 fd 可避免重复引用，标准输出仍然有效。
- `printf` 使用 `stdio` 缓冲，进程退出时刷新。
- 若在 `dup2` 之前已有缓冲内容，需要先 `fflush`，避免残留输出写到旧目标。
- `exec` 后 fd 默认保留，除非设置了 `O_CLOEXEC` 或 `FD_CLOEXEC`。
- 失败时返回 -1，需要检查 `errno`。

### 4.14 O_APPEND 的原子性如何保证？

- 每次 `write` 时内核在 inode 锁内把偏移设为末尾并写入。
- 多进程追加日志不会互相覆盖。
- 单次写入的数据量过大时仍可能被拆分，但定位与写入处于同一临界区。
- `O_APPEND` 与 `lseek` 混用时，`lseek` 的结果不影响写入位置。
- 管道写入的原子性由 `PIPE_BUF` 界定，与文件追加无关。
- 追加写并发受 inode 锁限制，高并发下吞吐受限。
- NFS 上的原子性由服务器实现决定。

### 4.15 文件描述符上限由什么决定？

- `RLIMIT_NOFILE` 是每进程的软硬限制，`ulimit -n` 查看。
- `/proc/sys/fs/nr_open` 是 `RLIMIT_NOFILE` 的上限。
- `/proc/sys/fs/file-max` 是系统级文件句柄上限。
- 提高限制需修改 `limits.conf` 或 systemd 的 `LimitNOFILE`。
- 每个 fd 占用内核内存，包括 `struct file` 与 dentry 引用。
- `select` 受 `FD_SETSIZE` 限制，`poll` 与 `epoll` 不受此限制。
- 进程还可能受 cgroup 或其他资源限制约束。

### 4.16 EINTR 如何正确处理？

- 信号处理函数返回后，被中断的慢速系统调用可能返回 `EINTR`。
- `SA_RESTART` 让部分调用自动重启，但不覆盖所有调用。
- `read`、`write`、`open`、`wait` 属于可重启集合，`epoll_wait` 与 `select` 的行为依配置而异。
- 正确做法是循环重试，并同时检查其他错误。
- 若 `write` 已写入部分数据，返回值是已写字节数；仅在未写入任何字节时返回 `EINTR`。
- 使用 `sigaction` 而非 `signal`，行为更可控。
- 非阻塞调用通常不因信号返回 `EINTR`。

### 4.17（辨析）同步、异步、阻塞、非阻塞如何区分？

- 阻塞与非阻塞描述调用是否立即返回。
- 同步与异步描述数据就绪与复制由谁完成。
- 阻塞 I/O 属于同步 I/O；非阻塞轮询仍属于同步 I/O。
- `select`、`poll`、`epoll` 属于 I/O 多路复用，就绪后仍需同步读写。
- POSIX aio 与 `io_uring` 提供异步提交与完成通知。
- 完成通知可通过信号、回调或完成队列传递。
- 选择取决于并发连接数、延迟目标与运行时支持。

### 4.18 close 的语义与注意事项是什么？

- `close` 减少 `struct file` 的引用计数，减到 0 时调用 `f_op->release`。
- Linux 上 `close` 不会返回 `EINTR`，fd 总是被释放。
- 关闭失败时不应重试，因为 fd 已被释放，重试可能关闭新分配的 fd。
- `SO_LINGER` 影响套接字的关闭行为，不影响普通文件。
- 多线程共享 fd 时，一个线程 `close` 后其他线程的读写行为不确定。
- 用引用计数或 `dup` 管理生命周期更安全。
- `close_range` 可批量关闭一段 fd。

### 4.19 零复制接口有哪些？

- `sendfile` 在文件与套接字之间传输，避免用户态缓冲区。
- `splice` 通过管道在两个 fd 之间移动页，至少一端需要是管道。
- `vmsplice` 把用户页映射进管道，需注意页的生命周期。
- `copy_file_range` 在文件系统内复制，可能由服务器端完成。
- 零复制减少 CPU 复制与上下文切换，仍需经过页缓存与 DMA。
- 对端不支持时回退到普通读写。
- 小文件场景收益有限，系统调用开销占比较高。

### 4.20（场景）大量小文件写入为何慢？

- 每次 `open`、`write`、`close` 都有路径解析与元数据更新开销。
- `O_SYNC` 或逐次 `fsync` 会放大延迟。
- 目录项与 inode 缓存未命中时触发磁盘读。
- 批量写入可合并为大文件，或用 `writev` 减少调用次数。
- 提高 `dirty_ratio` 可延迟写回，但增加掉电丢失风险。
- `io_uring` 批量提交可减少系统调用。
- 文件系统与挂载选项影响元数据性能，ext4 与 xfs 在小文件场景表现不同。

---

## 5. 文件系统与页缓存

### 5.1 inode 与 dentry 的职责是什么？

- inode 保存文件类型、权限、大小、时间戳、链接数与块映射。
- inode 还保存 `i_op`、`i_fop` 操作表与引用计数。
- dentry 保存路径分量到 inode 的映射，带引用计数与状态标志。
- dcache 缓存 dentry，加速路径解析。
- 硬链接让多个 dentry 指向同一 inode，链接数随之增加。
- inode 数量在格式化时确定，`df -i` 查看使用率。
- dentry 在无引用时进入 LRU，内存压力下被回收。

### 5.2 VFS 的四个基本对象是什么？

- `super_block` 表示挂载的文件系统实例，保存块大小、挂载选项与操作表。
- `inode` 表示文件元数据，`file` 表示进程打开的文件，`dentry` 表示目录项。
- 四者通过 `i_op`、`i_fop`、`d_op`、`s_op` 分派到具体文件系统。
- 路径解析从根目录或当前目录开始，逐分量查找或创建 dentry。
- `vfsmount` 与 `mount` 结构把 `super_block` 连接到挂载点。
- 打开文件时依次解析路径、取得 inode、分配 `struct file`。
- 具体文件系统只需实现操作表，无需关心系统调用入口。

### 5.3 ext4 的主要特性有哪些？

- 使用 extent 树描述连续块，替代 ext3 的间接块映射。
- 日志保证元数据一致性，默认模式为 `data=ordered`。
- `data=journal` 记录数据与元数据，最安全但最慢。
- `data=writeback` 只保证元数据一致，崩溃后可能读到旧数据。
- 延迟分配减少碎片，但增加掉电丢失的窗口。
- `flex_bg` 与多块分配器改善大文件的连续性。
- 异常后先重放日志，再运行 `e2fsck` 检查。

### 5.4 页缓存如何工作？

- 以 `address_space` 与 xarray 索引文件页，键为页索引。
- 读文件先查页缓存，命中则复制到用户缓冲区，未命中发起读与预读。
- 写文件先写页缓存并标记脏页，由回写线程刷盘。
- 页缓存与匿名页共享物理内存，回收策略不同。
- `mmap` 的文件页与 `read` 共用同一页缓存。
- 页缓存大小受可用内存与 `vm.vfs_cache_pressure` 影响。
- `posix_fadvise` 可提示顺序或随机访问模式。

### 5.5 脏页写回机制是什么？

- 脏页比例超过 `vm.dirty_ratio` 时写进程被阻塞，超过 `dirty_background_ratio` 时启动后台回写。
- 回写由 flusher 线程与工作队列完成，按 inode 组织。
- `vm.dirty_expire_centisecs` 控制脏页的最长停留时间。
- ext4 的 `data=ordered` 先写数据再写元数据。
- 大量脏页会造成写入风暴与延迟抖动。
- cgroup v2 的 `memory.high` 会触发回写与回收。
- `sync` 等待所有脏页，`syncfs` 只作用于一个文件系统。

### 5.6（辨析）fsync 与 fdatasync 有什么区别？

- `fsync` 刷新数据与 inode 元数据，包括文件大小与时间戳。
- `fdatasync` 只刷新数据与检索所需的元数据，不保证时间戳落盘。
- 两者都要求文件系统与块设备执行 `FLUSH`。
- 目录的 `fsync` 保证目录项落盘，`rename` 后需要对目录调用。
- 写文件后 `fsync` 再 `rename` 是原子替换的常见顺序。
- 每次 `fsync` 有毫秒级延迟，批量提交可降低开销。
- `sync_file_range` 只提示回写，不等待完成，也不保证元数据。

### 5.7 O_DIRECT 的语义与限制是什么？

- 绕过页缓存，在用户缓冲区与设备之间直接传输。
- 要求缓冲区地址、长度与文件偏移按逻辑块大小对齐，通常为 512 或 4096 字节。
- 不保证元数据落盘，需要配合 `fsync`。
- 适合自建缓存的应用，如数据库。
- 未对齐的请求返回 `EINVAL`。
- 与 `mmap` 混用时一致性由实现定义。
- 减少内存复制与页缓存占用，但失去预读与写合并。

### 5.8 稀疏文件如何表示与操作？

- 文件逻辑大小大于实际占用块数，空洞部分不分配块。
- `lseek` 越过末尾写入与 `ftruncate` 扩展都会产生空洞。
- 读空洞返回零字节。
- `stat` 的 `st_size` 是逻辑大小，`st_blocks` 以 512 字节为单位反映实际分配。
- `du` 与 `ls -l` 的差异来自空洞与块占用。
- 复制时使用 `SEEK_DATA` 与 `SEEK_HOLE` 保留稀疏性。
- 部分工具与文件系统会填充空洞，导致实际占用上升。

### 5.9 硬链接与软链接有什么区别？

- 硬链接是同一 inode 的另一个目录项，链接数增加，不能跨文件系统。
- 软链接是独立文件，内容为路径字符串，可以跨文件系统。
- 删除原文件后硬链接仍可访问，软链接悬空。
- `symlink` 的权限位被忽略，`lstat` 读取链接本身。
- 硬链接不能指向目录，`.` 与 `..` 除外。
- 软链接解析有长度限制，并检测循环。
- `open` 默认跟随软链接，`O_NOFOLLOW` 阻止跟随。

### 5.10（场景）删除文件后空间为什么没有释放？

- 进程仍持有 fd 时 inode 引用未归零，数据块不释放。
- `lsof +L1` 可查找链接数为 0 的已打开文件。
- 通过 `/proc/pid/fd` 找到 fd，可 `truncate` 或重启进程。
- 被 `mmap` 的文件同样占用空间。
- 日志轮转后未重新打开文件，会持续写入旧 inode。
- ext4 默认保留 5% 的块给 root，`df` 与预期存在差异。
- 已删除但仍被引用的文件继续计入已用块。

### 5.11（场景）fsync 之后掉电为何仍会丢数据？

- 磁盘写缓存未执行 `FLUSH` 时，`fsync` 无法保证数据到达介质。
- 虚拟化层与 RAID 卡缓存需配置写穿或带电池保护。
- `data=writeback` 模式下崩溃可能丢失数据，即使元数据一致。
- `rename` 后未对目录 `fsync`，目录项更新可能丢失。
- `O_DIRECT` 只绕过页缓存，不保证元数据持久。
- 检查设备写缓存状态，例如使用 `hdparm -W`。
- 应用层需定义持久化顺序与恢复流程。

### 5.12（输出题）稀疏文件的 stat 输出是什么？

```cpp
int fd = open("f", O_CREAT | O_WRONLY, 0644);
lseek(fd, 1 << 20, SEEK_SET);
write(fd, "x", 1);
struct stat st;
fstat(fd, &st);
printf("%lld %lld\n", (long long)st.st_size, (long long)st.st_blocks);
```

- 输出由文件系统决定，ext4 上通常为 `1048577 8`。
- `st_size` 是逻辑大小，等于写入偏移加写入长度。
- `st_blocks` 以 512 字节为单位，实际只分配一个 4 KiB 块时为 8。
- 空洞部分不占块，读取时由内核返回零。
- `stat` 与 `fstat` 读取 inode 元数据，不读取文件内容。
- 具体的块数取决于文件系统、块大小与预分配策略。

### 5.13（实现）如何用 mmap 写文件并保证落盘？

```cpp
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <cstring>

int main() {
    int fd = open("m.txt", O_RDWR | O_CREAT, 0644);
    ftruncate(fd, 4096);
    char* p = static_cast<char*>(mmap(nullptr, 4096, PROT_READ | PROT_WRITE,
                                      MAP_SHARED, fd, 0));
    std::strcpy(p, "hello");
    msync(p, 4096, MS_SYNC);
    munmap(p, 4096);
    close(fd);
}
```

- `ftruncate` 先设定长度，访问超出文件末尾的映射页会触发 `SIGBUS`。
- `MAP_SHARED` 的修改写入页缓存，`msync` 等待写回。
- `MS_SYNC` 等待完成，`MS_ASYNC` 只排队，不等待。
- `munmap` 不保证数据落盘，持久化需 `msync` 或 `fsync`。
- 映射长度按页取整。
- 多进程映射同一文件可共享修改。
- 需要检查 `mmap` 与 `msync` 的返回值。

### 5.14（辨析）buffer_head 与 bio 有什么区别？

- `buffer_head` 描述块设备上的一个缓冲块，历史上连接页缓存与块映射。
- `bio` 描述一组块 I/O 向量，是块层的提交单位。
- 现代内核用 iomap 与 `bio` 直接提交，`buffer_head` 仍用于元数据。
- `bio` 可合并相邻请求，减少设备寻道。
- 多页 I/O 通过 `bio_add_page` 组装。
- 完成回调常在软中断上下文执行，不能睡眠。

### 5.15 rename 的原子性如何保证？

- 同一文件系统内的 `rename` 原子替换目标。
- 跨文件系统返回 `EXDEV`，需要复制后删除。
- `renameat2` 支持 `RENAME_NOREPLACE` 与 `RENAME_EXCHANGE`。
- 替换后旧目标的链接数减一，仍有打开 fd 时空间不释放。
- 崩溃一致性要求对源目录与目标目录 `fsync`。
- 原子性只针对目录项，不涉及文件内容。
- 目标存在且为目录时，源必须是空目录。

### 5.16 dcache 何时回收？

- dentry 引用计数为 0 时进入 LRU 链表。
- `vm.vfs_cache_pressure` 控制回收倾向，值越大越倾向回收 dentry 与 inode。
- `drop_caches` 可手动清理，但会影响后续路径解析性能。
- 大量小文件占用 dcache，表现为 Slab 增长。
- `/proc/slabinfo` 与 `slabtop` 可查看 `dentry` 与 `inode_cache`。
- 回收 dentry 前需处理脏 inode。
- 目录项缓存不占文件数据空间，但计入内核内存。

### 5.17（场景）日志写入延迟抖动如何降低？

- 每次 `write` 后 `fsync` 使延迟等于一次设备往返。
- 批量提交把多条记录合并到一次 `fsync`。
- `O_DSYNC` 与 `O_SYNC` 的代价不同，应按需选择。
- 页缓存回写与 `fsync` 竞争同一设备队列。
- 用 `fio` 测量 `fsync` 的尾延迟。
- `io_uring` 的链接操作可把写与 `fsync` 串成一次提交。
- 分离日志设备可降低数据写入对日志的干扰。

### 5.18（辨析）缓冲 I/O 与页缓存是什么关系？

- 普通 `read` 与 `write` 经过页缓存，属于缓冲 I/O。
- `stdio` 缓冲在用户态，页缓存在内核态，两者相互独立。
- `O_DIRECT` 绕过页缓存，但仍可能经过设备缓存。
- `mmap` 直接映射页缓存，不经过 `read` 与 `write`。
- 页缓存提升重复读性能，代价是内存占用。
- `posix_fadvise` 的 `POSIX_FADV_DONTNEED` 可释放干净页。
- 缓冲 I/O 的写合并可减少设备请求数。

### 5.19 df 与 du 的结果为什么不同？

- `df` 基于 `statfs` 与 `statvfs`，报告块总数、可用块与 inode 数。
- 保留块不计入普通用户可用空间。
- `df -i` 报告 inode 使用，耗尽时创建文件返回 `ENOSPC`。
- 已删除但被打开的文件仍计入已用块。
- `du` 汇总目录树，与 `df` 的差异来自保留块、稀疏文件与打开的文件。
- 网络文件系统的数值可能延迟更新。
- 容器中的挂载与配额会影响可见容量。

### 5.20（场景）inode 耗尽如何处理？

- 小文件过多导致 inode 用尽，`df -i` 显示使用率 100%。
- ext4 的 inode 数量在 `mkfs` 时按 `-i` 或 `-T` 估算。
- 删除大量小文件可释放 inode，但被打开的文件仍占用。
- 重建文件系统或迁移到动态分配 inode 的文件系统可缓解。
- 监控 inode 使用率，并与空间使用率分开告警。
- 临时文件未清理是常见原因。
- 目录项缓存不占 inode，但 inode 用尽仍会阻止创建文件。

---

## 6. 进程间通信

### 6.1 管道在内核中如何表示？

- `pipe()` 创建的两个描述符指向同一个 `pipe_inode_info`，其中保存环形缓冲区、读写位置、等待队列与读写两端的计数。
- 缓冲区由 `pipe_buffer` 数组描述，每项指向一个页，默认 16 项、容量 64 KiB；`fcntl` 的 `F_SETPIPE_SZ` 可以调整容量，上限受 `/proc/sys/fs/pipe-max-size` 约束。
- 写入把用户数据复制到页中，读取再复制回用户缓冲区，数据至少经过两次复制。
- `splice` 可以在管道与文件之间移动页引用，避免复制；`vmsplice` 允许把用户页映射进管道。
- 读端在缓冲区为空时睡眠在 `pipe_inode_info` 的等待队列上，写端在缓冲区满时同样睡眠。
- 缓冲区为空且写端计数为 0 时 `read` 返回 0；`pipe_poll` 向 `poll` 与 `epoll` 报告 `EPOLLIN`、`EPOLLOUT`。

### 6.2（辨析）匿名管道与 FIFO 的区别？

- 匿名管道由 `pipe()` 创建，没有名字，只能通过 `fork` 继承或 `SCM_RIGHTS` 传递，最后一个描述符关闭后消失。
- FIFO 由 `mkfifo()` 在文件系统中创建路径，任意进程用 `open()` 打开，权限位与属主决定访问控制。
- FIFO 的打开会与对端同步：以只读打开会阻塞到有写者打开，除非指定 `O_NONBLOCK`；匿名管道不涉及打开操作。
- 两者都提供字节流语义，不保留消息边界，`PIPE_BUF` 以内的写入具有原子性。
- FIFO 关闭后路径仍然存在，需要 `unlink` 删除，残留的 FIFO 文件是常见的部署问题。
- 两者的数据通路复用同一套管道代码，路径查找只发生在 `open` 阶段，读写性能没有差别。

### 6.3 管道读写的原子性与 PIPE_BUF 的边界？

- 不超过 `PIPE_BUF`（Linux 上为 4096 字节）的写入是原子的：内核在一次持锁操作中完成复制，多个写者的数据不会交错。
- 超过 `PIPE_BUF` 的写入可能被分成多次，与其他写者的数据交错；POSIX 只保证这类写入最终全部完成。
- 缓冲区剩余空间不足请求长度时，小写入会阻塞到空间足够，而不是部分写入。
- 非阻塞写端在空间不足时返回 `EAGAIN`；长度超过 `PIPE_BUF` 且已写入部分数据时，返回值是已写入的字节数。
- 读操作没有原子性保证，一次 `read` 只取当前缓冲区中的连续片段，返回长度可以小于请求长度。
- 依赖消息边界的协议需要自行加长度前缀，或改用 `SOCK_SEQPACKET` 与消息队列。

### 6.4（陷阱）写端未关闭为什么读端收不到 EOF？

- `read` 返回 0 的条件是管道中无数据且写端计数为 0，计数按打开的文件描述符累计，不按进程数计。
- `fork` 后子进程继承了写端，即使父进程关闭自己的写端，子进程持有的那份仍使计数大于 0。
- 常见场景是父进程创建管道后立即 `fork`，两个进程都持有两端描述符，却没有关闭不用的那一端。
- 修复方式是在每个进程中关闭不需要的端点；多级管道需要在 `fork` 后立即关闭不属于自己的描述符。
- `exec` 会把未设置 `FD_CLOEXEC` 的描述符带到新程序，长期运行的守护进程可能因此一直持有写端。
- 排查手段是检查 `/proc/<pid>/fd` 中的管道 inode，确认还有哪些进程持有写端。

### 6.5（场景）父子进程互相发送大量数据为什么会死锁？

- 管道容量有限，写端在缓冲区满时阻塞，读端在缓冲区空时阻塞，双方都先写后读时互相等待。
- 典型代码是父进程向子进程写入 1 MiB 再读取回应，子进程同样先写后读，两个方向都在缓冲区满时停住。
- 解决办法是让一方只写、另一方只读，或者用两个管道分别承担一个方向。
- 需要双向通信时可用 `socketpair()`，每个方向有独立的发送缓冲区，双方同时大量发送时仍会阻塞。
- 引入 `O_NONBLOCK` 与 `poll` 可以避免永久阻塞，但需要处理部分写入与用户态缓冲。
- 排查阻塞点可以查看 `/proc/<pid>/wchan` 与 `/proc/<pid>/stack`，确认进程停在管道的等待队列上。

### 6.6（辨析）System V 消息队列与 POSIX 消息队列的区别？

- 标识方式不同：System V 用 `msgget` 返回的 `msqid`，键由 `ftok` 或 `IPC_PRIVATE` 生成；POSIX 用 `mq_open` 返回的描述符，名字形如 `/name`。
- 优先级语义不同：System V 消息带 `long` 类型，`msgrcv` 可按类型选择；POSIX 消息带无符号优先级，接收总是取最高优先级，同级按先进先出。
- 通知机制不同：POSIX 提供 `mq_notify`，可在消息到达时投递信号或启动线程；System V 没有内核通知，只能轮询。
- 限制来源不同：System V 的限制在 `/proc/sys/kernel/msgmax`、`msgmnb`、`msgmni`；POSIX 队列受 `RLIMIT_MSGQUEUE` 与挂载点容量约束。
- 生命周期不同：System V 队列独立于创建进程，需要 `msgctl(IPC_RMID)` 删除；POSIX 队列在 `mq_unlink` 后随最后一个描述符关闭而消失。
- 两者都保留消息边界，都要把消息复制到内核对象再复制回用户态，数据量大时成本高于共享内存。

### 6.7 POSIX 消息队列的通知机制有哪些边界？

- `mq_notify` 为队列注册一个通知，触发方式有 `SIGEV_SIGNAL`、`SIGEV_THREAD` 与 `SIGEV_NONE`，每个队列同时只能有一个注册。
- 通知是一次性的：触发后注册被消费，需要重新调用 `mq_notify` 才能接收下一次通知。
- `SIGEV_THREAD` 由 C 库在通知到达时创建线程执行回调，线程创建失败时没有返回值可以报告。
- 通知在队列由空变为非空时触发；注册时队列已有消息，会立即触发一次。
- 信号方式下通知可能与其他来源的信号合并，处理函数必须循环调用 `mq_receive` 取空队列，不能假定通知次数与消息条数一致。
- 多线程程序中通知信号投递到哪个线程取决于信号掩码，通常需要在所有线程阻塞该信号并由专用线程处理。

### 6.8 共享内存有哪几种建立方式？

- System V 方式：`shmget` 创建或获取共享内存段，`shmat` 映射到进程地址空间，`shmdt` 解除映射，`shmctl(IPC_RMID)` 标记删除。
- POSIX 方式：`shm_open` 打开或创建共享内存对象，`ftruncate` 设置大小，再用 `mmap` 映射；对象位于 tmpfs，通常挂载在 `/dev/shm`。
- 匿名映射：`mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0)` 只能由相关进程通过继承共享。
- 文件映射：`open` 普通文件后用 `mmap(MAP_SHARED)` 映射，数据进入页缓存并按需写回文件，适合需要持久化的场景。
- 这些方式都要求参与进程把同一物理页映射到各自地址空间，虚拟地址可以不同，指针不能跨进程直接传递。
- System V 段的删除是标记式的，`IPC_RMID` 之后已有映射的进程仍可继续访问，直到最后一个映射解除。

### 6.9 共享内存为什么必须另行同步？

- 内核只负责建立映射，读写由各进程的普通访存指令完成，没有加锁、没有序列化，也没有跨操作的原子性。
- 多核上不同处理器可能持有同一缓存行的不同副本，缓存一致性协议保证最终一致，但不保证复合操作原子。
- 编译器与处理器都可能重排访存：一个进程先写数据再写标志位，另一个进程可能先看到标志位。
- 常见做法是把互斥量与条件变量设置为 `PTHREAD_PROCESS_SHARED` 后放在共享内存中，或使用命名信号量、文件锁。
- C++ 标准没有为 `std::mutex` 提供进程间共享的接口；libstdc++ 的实现基于默认属性的 `pthread_mutex_t`，使用私有 futex，不能跨进程使用。
- 进程在持有锁时崩溃无法由内核自动恢复，需要设计超时、锁文件或由监督进程重建状态。

### 6.10（陷阱）共享内存中的指针为什么不能直接传递？

- 每个进程用 `mmap` 得到的虚拟地址不同，共享内存中的绝对指针只在映射地址相同的进程中有效。
- 正确做法是保存相对偏移，访问时用各自基地址加偏移计算地址。
- 若用 `MAP_FIXED` 指定相同地址，需要处理地址空间冲突，并与 ASLR 和加载器布局相互影响。
- 结构体中的指针还受对齐与 ABI 影响，32 位与 64 位进程共享同一段内存时需要显式使用固定宽度类型。
- 共享内存中的容器对象同样不可跨进程使用，`std::vector` 的内部指针与分配器状态属于创建它的进程。
- 调试时可以把两端映射到的地址打印出来比对，地址不同即可确认问题来源。

### 6.11（辨析）POSIX 信号量与 System V 信号量的区别？

- POSIX 信号量以单个计数为单位，接口是 `sem_init`、`sem_open`、`sem_wait`、`sem_post`、`sem_getvalue`。
- System V 信号量以信号量集为单位，`semget` 创建集合，`semop` 一次可对多个信号量做原子操作。
- POSIX 命名信号量在 glibc 上表现为 `/dev/shm/sem.` 开头的文件，权限由文件系统控制；System V 用键与 `IPC_CREAT` 标志创建。
- System V 支持 `SEM_UNDO`，进程退出时内核回滚未撤销的操作，可缓解持锁进程崩溃导致的死锁；POSIX 信号量没有该机制。
- `sem_post` 是异步信号安全的，可在信号处理函数中使用；`semop` 不在安全清单内。
- 两者都允许计数大于 1，都不绑定持有者，不能替代互斥量的所有权语义。

### 6.12 信号量的等待路径与 futex 有什么关系？

- glibc 的 POSIX 信号量在用户态维护计数，`sem_wait` 先用原子减尝试，成功即返回，不发生系统调用。
- 计数不足时回退到内核，在计数地址上调用 `futex(FUTEX_WAIT)` 睡眠；`sem_post` 递增计数后调用 `FUTEX_WAKE`。
- System V 信号量没有用户态快速路径，每次 `semop` 都是系统调用，内核在 `sem_array` 上维护等待队列。
- 等待者可被信号中断，`sem_wait` 返回 `-1` 并把 `errno` 置为 `EINTR`，需要重新尝试。
- 唤醒后必须重新检查计数，多个等待者同时被唤醒时只有一个能成功减一。
- 命名信号量与匿名信号量的差别只在建立方式，等待与唤醒的路径相同。

### 6.13（辨析）Unix domain socket 与 TCP 回环 socket 的差异？

- 地址族不同：UDS 使用 `AF_UNIX` 与文件系统路径或抽象名字，TCP 使用 `AF_INET`、`AF_INET6` 与 IP 加端口。
- UDS 不经过网络协议栈，没有 IP 头、TCP 段、校验和与路由查找，数据从发送缓冲区直接复制到接收缓冲区。
- UDS 的访问控制依赖文件权限，路径所在目录的写权限决定能否创建，socket 文件的权限决定能否连接。
- TCP 回环仍要经过完整协议栈与校验和计算，开销高于 UDS，优势是可以跨主机。
- UDS 支持 `SOCK_SEQPACKET`，保留消息边界并按序交付；TCP 只提供字节流。
- UDS 可以在连接时传递文件描述符与进程凭证，TCP 没有对应机制。

### 6.14（陷阱）Unix domain socket 的路径长度与抽象命名空间有哪些坑？

- `sockaddr_un` 的 `sun_path` 在 Linux 上为 108 字节，包含结尾的空字符，路径过长时 `bind` 返回 `ENAMETOOLONG` 或发生截断。
- 抽象命名空间用 `sun_path[0] == 0` 表示，名字不落到文件系统，进程退出后自动消失，也没有文件权限检查。
- 抽象名字的剩余字节按定长处理，名字中间允许出现空字节，比较时不能用 `strlen`。
- 绑定已存在的路径会返回 `EADDRINUSE`，服务重启前需要 `unlink` 旧 socket 文件。
- 相对路径的解析依赖当前工作目录，守护进程切换目录后可能找不到原路径。
- `getsockname` 返回的地址长度需要按 `sun_path` 的实际内容计算，不能直接使用 `sizeof(sockaddr_un)`。

### 6.15 如何获取对端进程的凭证？

- Linux 提供 `SO_PEERCRED`，连接建立后用 `getsockopt` 取得 `struct ucred`，包含对端的 pid、uid、gid。
- `SO_PEERCRED` 返回连接时刻的凭证，对端之后调用 `setuid` 不会反映到已取得的副本中。
- 需要逐条消息的凭证时，接收端设置 `SO_PASSCRED`，发送端用 `sendmsg` 附带 `SCM_CREDENTIALS`，内核会校验并填充真实凭证。
- 凭证由内核生成，用户态无法伪造其中的 pid 与 uid，`SCM_CREDENTIALS` 中只能提供自身进程的有效 uid。
- 凭证只在本机有意义，容器中的 pid 属于所在 pid 命名空间，需要结合命名空间判断对端身份。
- 凭证中的 pid 可能被复用，长期持有 pid 不能作为唯一身份标识，应结合连接本身与进程启动时间判断。

### 6.16（条款）文件描述符传递的原理是什么？

- 发送端用 `sendmsg` 在控制消息中放置 `SCM_RIGHTS`，数据部分是类型为 `int` 的描述符数组，一次最多 `SCM_MAX_FD`（253）个。
- 内核不传递数字本身，而是在接收端进程的描述符表中新建一项，指向同一个 `struct file`，引用计数加一。
- 传递过程中内核把该 `struct file` 记入 `unix_inflight` 集合，即使发送端关闭描述符，文件也不会被释放。
- 接收端用 `recvmsg` 取得新的描述符，编号由接收进程分配，与发送端的编号无关。
- 接收端在读取控制消息前关闭 socket，内核会回收这些在途描述符，避免泄漏。
- 控制消息缓冲区需要按 `CMSG_SPACE` 计算大小，缓冲区不足时控制消息被截断，描述符不会安装，且错误不易察觉。

### 6.17（陷阱）传递后的描述符共享哪些状态？

- 两端指向同一个 `struct file`，共享文件偏移量、文件状态标志与异步 IO 的所有权。
- `FD_CLOEXEC` 是描述符表项的属性，不随传递继承，接收端得到的是未设置该标志的新描述符。
- 用 `recvmsg` 配合 `MSG_CMSG_CLOEXEC` 可以原子地设置 `FD_CLOEXEC`，避免多线程 `fork` 与 `exec` 之间的窗口。
- 关闭任意一端只减少引用计数，文件在最后一个引用消失时才释放。
- 传递管道读端后，两端共享同一个管道缓冲区，一方读取会消耗另一方本可读到的数据。
- 传递 socket 后，两个进程可以同时读写同一连接，需要应用层协议区分消息归属。

### 6.18（场景）如何判断 Unix domain socket 的对端已经关闭？

- `read` 或 `recv` 返回 0 表示对端关闭了写方向，并且缓冲区中没有剩余数据。
- 对端调用 `shutdown(SHUT_WR)` 只关闭写方向，本端仍可继续发送，这种半关闭需要单独处理。
- 注册 `EPOLLRDHUP` 可以在事件循环中直接得到对端关闭写方向的通知，不必等到读操作返回 0。
- 对端在接收缓冲区仍有未读数据时关闭连接，本端继续写会收到 `SIGPIPE`，忽略该信号后 `write` 返回 `EPIPE`。
- `send` 返回 `ECONNRESET` 表示对端异常终止，或关闭时接收队列中还有数据。
- 只依赖定时器与心跳判断存活会引入延迟，描述符层面的关闭通知更及时。

### 6.19（实现）如何用 socketpair 与 SCM_RIGHTS 传递描述符？

```cpp
int sv[2];
socketpair(AF_UNIX, SOCK_DGRAM, 0, sv);

int fd = open("/etc/hostname", O_RDONLY);
char cbuf[CMSG_SPACE(sizeof(int))] = {};
msghdr msg = {};
msg.msg_control = cbuf;
msg.msg_controllen = sizeof cbuf;

cmsghdr* c = CMSG_FIRSTHDR(&msg);
c->cmsg_level = SOL_SOCKET;
c->cmsg_type = SCM_RIGHTS;
c->cmsg_len = CMSG_LEN(sizeof(int));
memcpy(CMSG_DATA(c), &fd, sizeof fd);
sendmsg(sv[0], &msg, 0);
```

- `socketpair` 创建一对已连接的 socket，`SOCK_DGRAM` 保留消息边界，适合配合控制消息使用。
- 控制消息缓冲区必须用 `CMSG_SPACE` 计算，包含对齐填充；用 `sizeof(int)` 会偏小。
- 接收端先调用 `recvmsg` 并检查 `MSG_CTRUNC`，被截断时描述符不会安装，需要关闭通道并重试。
- 发送成功后可以立即关闭本端描述符，文件因在途引用而继续存在。
- 接收端得到的新描述符默认不带 `FD_CLOEXEC`，多线程程序应使用 `MSG_CMSG_CLOEXEC`。
- 该机制只能在本机的 Unix domain socket 上使用，不能跨主机传递。

### 6.20 几种 IPC 机制的数据复制次数与适用边界？

- 管道与 FIFO：写入时复制一次到内核页，读出时再复制一次，共两次；`splice` 可以避免其中一次。
- 消息队列：`msgsnd` 把消息复制到内核对象，`msgrcv` 复制回用户态，共两次，并受单条消息大小限制。
- 共享内存：建立映射后没有数据复制，只有缺页时的按需映射，适合大数据量与高频访问。
- Unix domain socket：数据从发送缓冲区复制到接收缓冲区，接收端再复制一次，共两次，同时保留消息边界。
- 信号：只传递编号，`sigqueue` 可附带一个 `sigval`，适合事件通知而不是数据传输。
- 选择依据是数据量、是否需要消息边界、是否需要跨主机以及同步复杂度，数据量大时共享内存加信号量通常是首选。

---

## 7. 信号与异步信号安全

### 7.1（辨析）signal 与 sigaction 的区别？

- `signal` 的语义在 POSIX 中未规定，glibc 采用 BSD 行为：处理函数执行期间阻塞该信号，处理函数不会被重置为默认处置，被中断的系统调用自动重启。
- `sigaction` 显式指定处理函数、`sa_mask` 与 `sa_flags`，行为可移植且可控。
- `sigaction` 可以取得旧的处理方式，便于保存与恢复；`signal` 的返回值也能保存，但含义依赖实现。
- `sigaction` 支持 `SA_SIGINFO`，处理函数可以取得 `siginfo_t` 与 `ucontext_t`，从而区分信号来源。
- `SA_RESTART`、`SA_NODEFER`、`SA_RESETHAND`、`SA_NOCLDWAIT` 只能在 `sigaction` 中设置。
- 新代码应统一使用 `sigaction`，`signal` 只适合不关心细节的示例。

### 7.2 信号从产生到递送经历哪些步骤？

- 产生：内核或其他进程调用 `kill`、`tgkill`、`raise`、`sigqueue`，硬件异常与终端驱动也会生成信号。
- 记账：信号进入目标线程或进程的 `pending` 集合，标准信号用位图表示，同一信号多次产生只保留一位。
- 阻塞：目标线程的信号掩码决定信号能否递送，被阻塞的信号保持 pending。
- 选择线程：进程定向信号由内核挑选一个未阻塞该信号的线程，线程定向信号只能投递到指定线程。
- 递送：返回用户态前，内核在用户栈上构造信号帧，保存寄存器上下文，把控制流转到处理函数。
- 返回：处理函数通过 restorer 调用 `rt_sigreturn`，内核恢复上下文，被中断的系统调用按 `SA_RESTART` 决定是否重启。

### 7.3 什么是异步信号安全函数？

- 异步信号安全指函数在信号处理函数中被调用时仍能正确工作，不会与主流程产生竞态。
- 不安全的根源是共享状态：`malloc` 持有 arena 锁时被中断，处理函数再次调用 `malloc` 会死锁或破坏堆。
- `printf` 系列持有 stdio 锁并使用全局缓冲区，`strerror` 返回指向静态缓冲区的指针，二者都不安全。
- POSIX 在 `signal-safety(7)` 中给出完整清单，`write`、`read`、`_exit`、`sem_post`、`sigaction` 等在其中。
- `errno` 是线程局部变量，处理函数中调用的函数可能改写它，返回前应保存并恢复。
- 需要记录日志时，可以写入预先打开的管道，或用 `write` 直接输出固定格式的字节串。

### 7.4（辨析）可重入与异步信号安全有什么区别？

- 可重入描述函数可以被多个执行流交错调用而不依赖共享的可变状态，只使用参数与栈上变量。
- 异步信号安全是更强的约束，要求函数在信号处理函数中调用时既不产生竞态，也不依赖锁。
- 可重入函数通常异步信号安全，反向关系不成立：`write` 是异步信号安全的，却依赖内核状态，不是纯粹的可重入函数。
- 使用 `errno` 的函数可能可重入但不异步信号安全，因为处理函数返回后 `errno` 可能已被覆盖。
- `memcpy`、`strlen` 这类无状态函数通常可以认为可重入，但判断依据仍是 POSIX 清单。
- 线程安全与异步信号安全是不同维度：前者靠锁保护共享状态，锁在信号处理函数中不可用。

### 7.5 sig_atomic_t 提供什么保证？

- `sig_atomic_t` 是能在一次访存中完成读写的整型，保证信号处理函数与主流程之间的赋值不会读到中间状态。
- 它不保证复合操作原子，`flag++` 是读、改、写三步，仍可能丢失更新。
- 与处理函数共享的变量应声明为 `volatile sig_atomic_t`，`volatile` 阻止编译器把值长期缓存在寄存器中。
- C++ 标准允许处理函数使用锁自由的 `std::atomic` 对象，前提是实现保证该对象锁自由（`[support.runtime]`）。
- `sig_atomic_t` 的宽度由实现定义，不能假定它能保存指针或 64 位计数。
- 需要传递更多数据时，用 `volatile sig_atomic_t` 作标志，数据本身通过管道或无锁队列传递。

### 7.6 信号处理函数中可以做哪些事？

- 修改 `volatile sig_atomic_t` 标志，供主循环轮询。
- 向预先创建的自管道写一个字节，把事件转化为描述符上的可读事件。
- 调用 `write`、`read`、`close`、`_exit`、`sem_post` 等清单内的函数。
- 保存并恢复 `errno`，避免影响主流程的错误处理。
- 不在处理函数中分配内存、加互斥锁、调用 `printf`、使用 `std::string` 或抛出异常。
- 处理函数执行时间应尽可能短，长时间运行会推迟主流程恢复，也会掩盖其他信号。

### 7.7（场景）self-pipe 模式如何工作？

- 主循环用 `poll` 或 `epoll` 监听管道读端，信号处理函数只向写端写入一个字节。
- `write` 是异步信号安全的，写端设为非阻塞后，缓冲区满时丢弃字节也不会阻塞处理函数。
- 主循环被唤醒后读取管道，执行真正的工作，此时处于普通上下文，可以调用任意函数。
- 与 `signalfd` 相比，self-pipe 不依赖 Linux 专有接口，代价是多一次 `read` 与两个描述符。
- 多个信号可以合并为一个字节，处理函数只负责通知，具体是哪个信号由主循环通过其他状态判断。
- 需要区分信号种类时可以写入信号编号，缓冲区容量足以容纳标准信号与实时信号的编号。

```cpp
static int g_pipe[2];
static void on_signal(int) {
    int saved = errno;
    char b = 1;
    write(g_pipe[1], &b, 1);   // 异步信号安全
    errno = saved;
}
```

### 7.8（辨析）sigprocmask 与 pthread_sigmask 的区别？

- `sigprocmask` 在 POSIX 中只对单线程进程有确定语义，多线程程序中的行为未规定。
- `pthread_sigmask` 修改调用线程的掩码，是线程级操作，多线程程序应使用它。
- 线程创建时继承创建者的信号掩码，因此在创建线程之前统一阻塞信号是常见做法。
- 进程定向信号只递送给未阻塞该信号的线程；所有线程都阻塞时信号保持 pending。
- 被阻塞的信号不会丢失，解除阻塞后按优先级递送，标准信号仍可能合并。
- `sigsuspend` 原子地替换掩码并挂起，用于消除检查标志与进入等待之间的窗口。

### 7.9 sigaction 的 sa_mask 在什么时候生效？

- 处理函数执行期间，`sa_mask` 中的信号与触发本次处理的信号一起被阻塞。
- 触发信号默认被阻塞，设置 `SA_NODEFER` 后允许同一信号在处理函数中递归递送。
- 阻塞只作用于当前线程，其他线程仍可接收这些信号。
- `sa_mask` 应包含处理函数会修改的共享状态所对应的信号，避免嵌套修改。
- `SA_RESETHAND` 在处理函数入口把处置重置为默认动作，效果接近一次性处理。
- 用 `sigemptyset` 与 `sigaddset` 构造掩码，不要依赖未初始化的 `sigset_t`。

### 7.10（陷阱）哪些系统调用不会被 SA_RESTART 重启？

- `poll`、`epoll_wait`、`select`、`pselect` 在信号到达时返回 `EINTR`，即使设置了 `SA_RESTART`。
- `nanosleep` 与 `clock_nanosleep` 返回 `EINTR`，剩余时间通过参数返回。
- `semop`、`sigtimedwait`、`sigsuspend` 同样不会被重启。
- `read`、`write`、`accept`、`wait` 等慢速系统调用在 `SA_RESTART` 下自动重启，已传输部分数据时不重启。
- 循环调用 `epoll_wait` 时必须显式处理 `EINTR`，否则事件循环可能意外退出。
- 需要精确超时时，应使用 `ppoll` 或 `epoll_pwait2` 配合 `timespec`，并在 `EINTR` 后重新计算剩余时间。

### 7.11 SIGCHLD 的默认语义与陷阱？

- `SIGCHLD` 在子进程终止、停止或继续时产生，默认处置是忽略，但忽略与显式设为 `SIG_IGN` 的效果不同。
- 默认忽略时子进程仍保留僵尸状态，需要 `wait` 回收；显式 `SIG_IGN` 或 `SA_NOCLDWAIT` 时内核自动回收。
- 标准信号不排队，多个子进程同时退出时可能只递送一次 `SIGCHLD`。
- 处理函数中应循环调用 `waitpid(-1, &status, WNOHANG)` 直到返回 0 或 `-1`，不能只调用一次。
- 处理函数执行期间新到的 `SIGCHLD` 被阻塞，返回后合并为一次递送，循环回收可以覆盖这种情况。
- `waitpid` 返回 `ECHILD` 表示没有可回收的子进程，可据此结束循环。

### 7.12（场景）SIGCHLD 处理函数中调用 waitpid 有哪些竞态？

- 信号可能在 `fork` 返回后、父进程进入 `waitpid` 之前到达，处理函数先回收子进程，主流程的 `waitpid` 随后返回 `ECHILD`。
- 处理函数与其他线程的 `waitpid` 竞争同一个子进程，一个子进程只能被回收一次。
- 在 `SIGCHLD` 处理函数中调用非异步信号安全的函数可能死锁，`printf` 与 `malloc` 都属于此类。
- 主流程若在 `sigaction` 安装之前 `fork`，子进程可能在处置生效前退出，信号丢失。
- 可靠做法是用 `signalfd` 或 self-pipe 把 `SIGCHLD` 转入事件循环，由同一线程回收。
- 也可以在 `fork` 之前阻塞 `SIGCHLD`，`fork` 之后再解除阻塞，消除安装与创建之间的窗口。

### 7.13 信号如何递送到多线程进程？

- 进程定向信号由内核在未阻塞该信号的线程中挑选一个，通常避开正在执行信号处理函数的线程。
- 线程定向信号通过 `tgkill` 或 `pthread_kill` 发送，只能由指定线程处理。
- 硬件异常信号，例如 `SIGSEGV`、`SIGFPE`，递送到触发异常的线程。
- 所有线程都阻塞某个信号时，该信号保持 pending，直到有线程解除阻塞。
- 无法控制的线程，例如第三方库创建的线程，可能意外接收进程定向信号，导致处理函数在非预期上下文运行。
- 常用模式是在创建任何线程之前阻塞需要集中处理的信号，再由专用线程用 `sigwait` 或 `signalfd` 接收。

### 7.14（实现）集中处理信号的线程如何写？

```cpp
sigset_t set;
sigemptyset(&set);
sigaddset(&set, SIGINT);
sigaddset(&set, SIGTERM);
pthread_sigmask(SIG_BLOCK, &set, nullptr);   // 创建线程之前

// 工作线程创建之后
int sig = 0;
while (sigwait(&set, &sig) == 0) {
    if (sig == SIGTERM) break;
}
```

- `sigwait` 要求信号在所有线程中被阻塞，否则信号可能被其他线程取走。
- `sigwait` 返回时信号已从 pending 集合移除，处理逻辑不需要再安装处理函数。
- `sigwaitinfo` 可以取得 `siginfo_t`，用于区分 `SI_USER`、`SI_KERNEL` 等来源。
- `signalfd` 把信号变成可读的描述符，适合与 `epoll` 集成，读取时取得 `signalfd_siginfo`。
- 专用线程收到信号后应通过队列把事件交给工作线程，避免在信号线程中执行耗时操作。
- 退出时需要唤醒阻塞在 `sigwait` 的线程，可以发送一个专用信号或关闭 `signalfd`。

### 7.15（辨析）标准信号与实时信号的差异？

- 标准信号编号为 1 至 31，实时信号范围为 `SIGRTMIN` 至 `SIGRTMAX`，Linux 上通常有 32 个。
- 标准信号不排队，同一信号多次产生只保留一个 pending 位；实时信号排队，按产生顺序递送。
- 实时信号按编号排序，编号小的先递送；标准信号的递送顺序未规定。
- 实时信号可以用 `sigqueue` 携带一个 `sigval`，标准信号只能通过 `kill` 传递编号。
- 实时信号需要 `SA_SIGINFO` 才能取得伴随数据，`sigqueue` 受 `RLIMIT_SIGPENDING` 限制。
- `SIGRTMIN` 的实际值会被线程库占用几个编号，编程时应使用宏而不是硬编码数字。

### 7.16（陷阱）为什么处理函数中调用 printf 会卡死？

- `printf` 在持有 stdio 锁时被信号中断，处理函数再次调用 `printf` 会等待同一把锁，形成自死锁。
- 即使没有死锁，处理函数改写 stdio 缓冲区也会破坏主流程的输出状态。
- `malloc` 的 arena 锁、`syslog` 的内部锁、`pthread_mutex_lock` 都有相同问题。
- 替代方案是用 `write` 直接写已打开的日志描述符，或把消息投递到无锁队列由主线程输出。
- 调试阶段可以用 `gdb` 查看处理函数的调用栈，确认是否停在锁的等待路径上。
- `snprintf`、`strerror_r` 等功能相似，同样不在异步信号安全清单内。

### 7.17 信号处置与掩码在 fork 与 exec 后如何继承？

- `fork` 后子进程继承父进程的信号处置、掩码以及 pending 集合中的进程定向信号，线程定向信号不继承。
- `exec` 后处置为 `SIG_DFL` 的信号恢复默认，处置为 `SIG_IGN` 的信号保持忽略。
- `exec` 保留信号掩码，被阻塞的信号在新程序中仍然被阻塞。
- 多线程程序调用 `exec` 后只保留调用线程，掩码取自该线程。
- 守护进程通常在 `fork` 之后重置信号处置，避免继承父进程的处理函数。
- `FD_CLOEXEC` 与信号无关，但管道写端的继承会影响读端能否收到 EOF，两者常在排错时一起检查。

### 7.18（场景）如何安全地终止事件循环？

- `SIGINT` 与 `SIGTERM` 的处理函数只设置 `volatile sig_atomic_t` 标志或写 self-pipe，不直接清理资源。
- 事件循环在 `epoll_wait` 返回 `EINTR` 后检查标志，退出循环并执行正常的析构与 `close`。
- 需要唤醒阻塞在 `epoll_wait` 的线程时，可以写 `eventfd`，并把该描述符加入监听集合。
- 退出前应停止接收新连接、排空已就绪事件、按依赖顺序关闭资源。
- 两次信号可以分别表示优雅退出与强制退出，第二次直接调用 `_exit`。
- 不在处理函数中调用 `exit`，它会运行 `atexit` 与静态析构，涉及锁与内存分配。

### 7.19（填空）补全阻塞信号并安装处理函数的代码，空处应填什么？

```cpp
struct sigaction sa = {};
sa.______ = handler;          // 处理函数
______(&sa.sa_mask);          // 清空掩码
sa.sa_flags = SA_RESTART;     // 自动重启被中断的调用
sigaction(SIGINT, &sa, nullptr);
```

- 第一个空填 `sa_handler`；若使用 `SA_SIGINFO`，则改填 `sa_sigaction` 并把 `sa_flags` 加上该标志。
- 第二个空填 `sigemptyset`，它把 `sigset_t` 初始化为空集，未初始化的掩码会阻塞不可预测的信号。
- `sigaction` 的返回值需要检查，失败时返回 `-1` 并设置 `errno`。
- `sa_flags` 还可以组合 `SA_NOCLDSTOP`、`SA_SIGINFO` 等，含义依信号类型而定。
- 若要阻塞其他信号，用 `sigaddset` 在 `sa_mask` 中加入，处理函数执行期间生效。
- 多线程程序中，`sigaction` 是进程级操作，处理函数对所有线程生效，掩码才是线程级。

### 7.20（输出题）信号计数为什么少于发送次数？

```cpp
volatile sig_atomic_t n = 0;
void on_usr1(int) { ++n; }

for (int i = 0; i < 1000; ++i)
    kill(getpid(), SIGUSR1);
printf("%d\n", n);
```

- 标准信号不排队，连续发送的 `SIGUSR1` 在递送前合并为一次，`n` 通常远小于 1000。
- `kill` 返回 0 只表示信号已进入 pending，不表示处理函数已经执行。
- `++n` 不是原子操作，处理函数与主流程并发访问时结果还取决于时序。
- 输出不确定，取决于调度与信号合并的时机，不能作为可移植的测试断言。
- 需要精确计数时改用实时信号 `SIGRTMIN`，或把事件写入管道由主循环统计。
- 该程序还存在与 `printf` 的竞争，严格来说应先阻塞信号再读取计数。

---

## 8. 多路复用与事件驱动

### 8.1 select 的实现与限制？

- `fd_set` 是位图，长度由 `FD_SETSIZE` 决定，Linux 上通常为 1024，描述符编号超过该值会越界写入。
- 每次调用把三组位图从用户态复制到内核，返回时再复制回来并就地修改，调用前必须重新构造集合。
- 内核线性扫描所有位，时间复杂度与最大描述符编号成正比，描述符稀疏时浪费明显。
- `timeval` 精度为微秒，返回时被改写为剩余时间，循环中不能复用同一个结构体。
- `pselect` 增加原子替换信号掩码的能力，消除检查标志与进入等待之间的窗口。
- 描述符为负或超出范围时返回 `EBADF`，但无法指出是哪一个描述符。

### 8.2 poll 相对 select 的改进与遗留问题？

- `pollfd` 数组把 `events` 与 `revents` 分开，不需要每次重建集合，也不修改输入。
- 没有 `FD_SETSIZE` 限制，描述符数量只受数组大小与内存约束。
- 仍需把整个数组复制到内核并线性扫描，复杂度为 `O(n)`，大并发下开销随注册量增长。
- `revents` 由内核填写，调用方需要清零或依赖内核覆盖，数组很大时清零本身有成本。
- `ppoll` 用 `timespec` 提供纳秒精度，并能原子替换信号掩码。
- 水平触发语义：条件持续成立时每次调用都会报告，未处理的描述符反复出现。

### 8.3 epoll 的三个系统调用分别做什么？

- `epoll_create1` 创建 `eventpoll` 对象并返回描述符，`EPOLL_CLOEXEC` 让描述符在 `exec` 时关闭。
- `epoll_ctl` 用 `EPOLL_CTL_ADD`、`EPOLL_CTL_MOD`、`EPOLL_CTL_DEL` 维护关注集合，每个被关注的文件对应一个 `epitem`。
- `epoll_wait` 等待就绪链表非空，把就绪事件复制到用户数组并返回事件个数。
- `epoll_pwait` 与 `epoll_pwait2` 增加信号掩码与纳秒超时，后者使用 `timespec`。
- 关注集合由内核持久保存，不需要每次调用重新注册，这是与 `select`、`poll` 的核心差别。
- 三个调用都可能返回 `EINTR`，事件循环需要显式处理。

### 8.4 epoll 在内核中用什么数据结构？

- 每个 `eventpoll` 有一棵红黑树 `rbr`，按描述符与文件索引 `epitem`，插入、删除、查找为 `O(log n)`。
- 就绪的 `epitem` 通过 `rdllist` 双向链表串联，`epoll_wait` 只遍历该链表。
- 注册时内核在目标文件的等待队列上挂载回调 `ep_poll_callback`，事件发生时由回调把 `epitem` 加入就绪链表。
- `epoll_wait` 自身睡眠在 `eventpoll` 的等待队列上，回调同时唤醒它。
- 同一文件被多个描述符注册时会产生多个 `epitem`，各自独立报告事件。
- 红黑树与就绪链表都占用内核内存，注册量很大时内存开销需要与连接数一起评估。

### 8.5（辨析）水平触发与边缘触发的语义差异？

- 水平触发在条件持续成立期间每次 `epoll_wait` 都报告，未读完的数据会再次触发。
- 边缘触发只在状态变化时报告一次，例如从无数据变为有数据、从不可写变为可写。
- 边缘触发要求描述符为非阻塞，并在一次事件中循环读写到 `EAGAIN`，否则剩余数据不会再次触发。
- 水平触发编程简单，漏读只会导致下一次重复通知；边缘触发效率高，漏读会导致连接停滞。
- 边缘触发下 `EPOLLOUT` 也需要一次写操作触发，注册时若一直可写会先报告一次。
- 两种模式都会报告 `EPOLLERR` 与 `EPOLLHUP`，与注册的事件掩码无关。

### 8.6（陷阱）边缘触发下最后一次 read 为什么会阻塞？

- 边缘触发要求读循环直到 `EAGAIN`，若描述符是阻塞的，读到没有数据时 `read` 会睡眠。
- 睡眠发生在事件循环线程中，整个循环停止，其他连接得不到处理。
- 正确做法是用 `O_NONBLOCK` 设置描述符，或在 `accept4` 时传入 `SOCK_NONBLOCK`。
- 非阻塞读返回 `EAGAIN` 表示已读空，此时可以安全退出循环。
- 写方向同理，`write` 返回 `EAGAIN` 表示发送缓冲区满，需要缓存剩余数据并等待可写事件。
- 只注册可读事件却在边缘触发下写出，可能永远收不到可写通知，需要按需修改注册的事件。

### 8.7 EPOLLONESHOT 解决什么问题？

- 默认情况下同一就绪事件可能被多个 `epoll_wait` 线程同时取得，导致同一连接被并发处理。
- `EPOLLONESHOT` 在报告一次事件后禁用该 `epitem`，直到用 `EPOLL_CTL_MOD` 重新设置。
- 处理线程完成读写后重新注册，保证同一时刻只有一个线程操作该连接。
- 忘记重新注册会导致连接再也收不到事件，表现为连接挂起。
- 与边缘触发组合时，应先读空数据再重新注册，否则重新注册后可能立即再次触发。
- 代价是每次事件多一次 `epoll_ctl` 系统调用。

### 8.8 惊群问题在 accept 上如何表现？

- 多个进程或线程阻塞在同一个监听 socket 的 `accept` 上，新连接到达时内核唤醒全部等待者。
- 只有一个等待者能成功 `accept`，其余返回 `EAGAIN` 或 `EINTR`，造成无效调度。
- 传统解决方法是应用层加锁，或用 `SO_REUSEPORT` 让每个进程持有独立的监听 socket。
- Linux 4.5 起 `EPOLLEXCLUSIVE` 让同一文件的多个 `epoll` 等待者中只唤醒一个。
- `EPOLLEXCLUSIVE` 只能用于 `EPOLL_CTL_ADD`，不能与 `EPOLLONESHOT` 同时设置。
- 线程池场景更常用一个线程 `accept` 后分发给工作线程，从结构上避免多个等待者。

### 8.9（场景）fork 之后 epoll 描述符为何导致事件丢失？

- 子进程继承 `epoll` 描述符，父子共享同一个 `eventpoll` 对象与就绪链表。
- 两个进程同时 `epoll_wait` 会竞争同一批事件，一个进程取走的事件另一个看不到。
- 监听 socket 也被继承，父子都可能 `accept`，连接被随机分配到其中一个进程。
- 边缘触发下事件被一方取走后不会重复通知，另一方负责的连接可能长期得不到处理。
- 正确做法是 `fork` 后由单一进程负责事件循环，或每个进程各自创建 `epoll` 并注册自己的描述符。
- `EPOLL_CLOEXEC` 只影响 `exec`，不能阻止 `fork` 继承。

### 8.10 epoll 的注册键是什么？

- 内核用描述符编号与 `struct file` 指针共同标识一个注册项，同一个文件的不同描述符可以分别注册。
- `dup` 产生的描述符指向同一 `struct file`，注册后各自产生 `epitem`，事件分别报告。
- 关闭一个描述符只移除对应的 `epitem`，其他指向同一文件的描述符仍然有效。
- 用 `dup2` 覆盖已注册的描述符编号时，内核在关闭路径上自动移除旧注册。
- 对同一描述符重复 `EPOLL_CTL_ADD` 返回 `EEXIST`。
- 注册针对文件而不是编号本身，编号被复用后不会与旧注册混淆。

### 8.11 select、poll、epoll 的复杂度对比？

| 机制 | 注册方式 | 每次调用开销 | 描述符规模 |
| --- | --- | --- | --- |
| `select` | 每次传入位图 | 复制位图并线性扫描 | 受 `FD_SETSIZE` 限制 |
| `poll` | 每次传入数组 | 复制数组并线性扫描 | 受内存限制 |
| `epoll` | 一次注册，内核持久保存 | 只遍历就绪链表 | 受内存与 `RLIMIT_NOFILE` 限制 |

- 活跃连接占比高时，`epoll` 的相对优势缩小，因为每次调用仍要复制就绪事件。
- 连接数少且调用频繁时，`poll` 的固定开销可以接受，代码也更简单。
- `epoll` 的优势在于关注集合与等待分离，注册成本与每次等待无关。
- 三种机制都受文件描述符上限约束，`epoll` 还额外占用内核内存。
- 选择时应结合连接数、活跃比例与超时精度，而不是只看理论复杂度。

### 8.12（陷阱）epoll_wait 的返回值与数据量不一致？

- 返回值是就绪事件个数，不是可读字节数，一个事件可能只对应少量数据。
- 事件数组容量小于就绪数时，剩余事件留在就绪链表中，下次调用继续返回。
- 水平触发下未处理的事件会重复出现，导致 `epoll_wait` 立即返回，形成忙循环。
- 边缘触发下若读取不彻底，剩余数据不会产生新事件，连接看起来停滞。
- `EPOLLERR` 与 `EPOLLHUP` 可能伴随零字节可读，读操作返回 0 表示对端关闭。
- 需要区分半关闭与错误时，应注册 `EPOLLRDHUP` 并检查事件掩码。

### 8.13 io_uring 的基本结构是什么？

- 用户态与内核共享两个环形队列：提交队列 `SQ` 与完成队列 `CQ`，由 `io_uring_setup` 建立并用 `mmap` 映射。
- 提交操作是把 `io_uring_sqe` 写入提交数组并推进尾指针，完成时内核写入 `io_uring_cqe` 并推进完成队列的尾指针，用户态消费后推进头指针。
- 批量提交与收割由 `io_uring_enter` 完成，一次调用可以提交多个操作并取得多个完成事件。
- `IORING_SETUP_SQPOLL` 让内核线程轮询提交队列，应用无需每次提交都进入内核，代价是占用一个处理器。
- 操作类型由 `opcode` 指定，`IORING_OP_READV`、`IORING_OP_SEND`、`IORING_OP_ACCEPT` 覆盖常见系统调用。
- 相比 `epoll`，io_uring 把等待就绪与执行操作合并，减少系统调用次数与用户态内核态往返。

### 8.14 io_uring 如何减少系统调用与数据复制？

- 提交与完成通过共享内存中的环形队列传递，不需要为每个操作把参数复制到内核栈。
- `IORING_REGISTER_FILES` 预注册描述符，后续操作直接使用索引，省去每次查找与引用计数。
- `IORING_REGISTER_BUFFERS` 预注册缓冲区，内核提前锁定页面，省去每次操作的页表检查。
- `IOSQE_IO_LINK` 把多个操作串成链，前一个完成才执行后一个，减少用户态往返。
- 多 shot 操作在一次提交后产生多个完成事件，例如持续接收连接或持续读取数据。
- 并非所有操作都零复制，普通读写仍需在用户缓冲区与页缓存之间复制数据。

### 8.15（辨析）Reactor 与 Proactor 的区别？

- Reactor 等待就绪事件，由应用执行实际的读写，事件循环在数据可用后被唤醒。
- Proactor 提交操作并等待完成事件，读写由内核或运行库执行，应用只处理结果。
- `epoll` 配合非阻塞 IO 是典型的 Reactor；`io_uring` 与 Windows 的 IOCP 更接近 Proactor。
- Reactor 实现简单，回调中必须避免阻塞，否则整个循环停摆。
- Proactor 把 IO 交给内核，回调在数据就位后执行，但缓冲区的生命周期需要内核与用户共同管理。
- 两种模型都需要处理背压、超时与取消，差异主要在谁执行复制与谁持有缓冲区。

### 8.16 Reactor 的基本结构包含哪些部分？

- 事件多路分解器负责等待事件，通常是 `epoll_wait`，并把就绪事件映射到对应处理器。
- 事件处理器注册读、写、错误回调，回调中执行非阻塞 IO 与协议解析。
- 定时器通常用 `timerfd` 或最小堆管理，超时事件与 IO 事件在同一个循环中处理。
- 线程模型可以是单线程循环、主从 Reactor（主线程 `accept`，从线程处理连接）或多线程共享 `epoll`。
- 回调中不允许阻塞调用，耗时任务应投递到工作线程池，完成后用 `eventfd` 唤醒循环。
- 连接关闭需要处理半关闭、未发送完的数据与资源释放顺序。

### 8.17（场景）如何把定时器接入 epoll？

- `timerfd_create` 创建定时器描述符，`timerfd_settime` 设置相对或绝对超时，到期后描述符可读。
- 把 `timerfd` 加入 `epoll`，读到过期次数后重新设置下一次超时。
- 大量定时器时使用最小堆或时间轮，`epoll_wait` 的超时取最近到期时间。
- `timerfd` 的精度受内核时钟粒度影响，`clock_gettime` 在 vDSO 中完成，读取成本低。
- 定时器回调中不应执行阻塞操作，否则会影响其他定时器的准时性。
- `epoll_wait` 的超时参数需要与定时器协调，避免忙等或延迟到期。

### 8.18（场景）排错：epoll_wait 一直返回却不处理数据？

- 检查是否在水平触发下没有读取数据，导致同一事件反复就绪。
- 检查是否注册了可写事件但从未写数据，可写事件会持续触发。
- 检查事件数组是否过小，剩余事件留在内核，下一次调用立即返回。
- 用 `strace -e epoll_wait,read,recvfrom` 观察返回的事件掩码与后续读取结果。
- 检查是否有多个线程共享同一个 `epoll` 描述符，事件被其他线程取走。
- 检查 `EPOLLONESHOT` 是否忘记重新注册，表现为事件只出现一次。

### 8.19（输出题）边缘触发下事件触发几次？

```cpp
// fd 为非阻塞，注册 EPOLLIN | EPOLLET
epoll_wait(ep, evs, 1, -1);   // 第一次，返回 1
read(fd, buf, 16);            // 缓冲区还有数据，未读到 EAGAIN
epoll_wait(ep, evs, 1, 0);    // 第二次
```

- 第二次 `epoll_wait` 返回 0，剩余数据没有引起新的状态变化。
- 若把 `EPOLLET` 换成水平触发，第二次会立即返回可读事件。
- 若第一次读到 `EAGAIN`，之后对端写入新数据才会再次触发。
- 超时参数为 0 表示立即返回，不改变触发语义。
- 该结果依赖描述符为非阻塞，阻塞描述符在第一次读取时可能已经停住。

### 8.20（条款）EPOLLERR 与 EPOLLHUP 何时报告？

- 这两个事件总是被报告，不需要在注册的事件掩码中声明。
- `EPOLLERR` 表示描述符出现错误条件，例如管道读端对应的写端已关闭。
- `EPOLLHUP` 表示挂断，例如对端完全关闭连接，读写都无法继续。
- `EPOLLRDHUP` 表示对端关闭写方向，需要显式注册，用于区分半关闭。
- 回调应先处理错误与挂断，再处理可读可写，避免在已失效的描述符上读写。
- 错误与挂断不一定伴随可读事件，只检查可读标志会漏掉这两类状态。

---

## 9. 系统调用与特权级切换

### 9.1 一次系统调用在 x86-64 上经历哪些步骤？

- 用户态把调用号放入 `rax`，参数放入 `rdi`、`rsi`、`rdx`、`r10`、`r8`、`r9`，执行 `syscall` 指令。
- 处理器从 `MSR_LSTAR` 取得入口地址，切换到内核栈，并把返回地址与标志寄存器保存到 `rcx` 与 `r11`。
- 入口代码执行 `swapgs` 取得内核数据结构，把通用寄存器保存到 `pt_regs`。
- 内核按 `rax` 在系统调用表中查找处理函数，参数从 `pt_regs` 中取出。
- 返回时把结果放入 `rax`，恢复寄存器，执行 `sysretq` 回到用户态。
- 整个过程包含特权级切换、栈切换与页表切换（启用 KPTI 时），开销远高于普通函数调用。

### 9.2 系统调用的参数与返回值如何传递？

- x86-64 用 `rdi`、`rsi`、`rdx`、`r10`、`r8`、`r9` 传递前六个参数，第四个参数使用 `r10` 而不是 `rcx`。
- 超过六个参数时使用指针指向用户态结构体，内核用 `copy_from_user` 读取。
- 返回值放在 `rax`，负值表示错误，范围为 `-4095` 至 `-1`，其绝对值是 `errno`。
- C 库包装函数检查该范围，把负值取反写入 `errno` 并返回 `-1`，应用看到的是 `-1` 与 `errno`。
- glibc 的 `syscall()` 同样转换错误并设置 `errno`；直接写汇编发起调用时没有这一层。
- 32 位 x86 使用 `int 0x80` 或 `sysenter`，调用号与参数寄存器规则不同。

### 9.3 系统调用的开销由哪些部分组成？

- 特权级切换需要保存与恢复寄存器、切换内核栈，现代处理器上这部分是固定成本。
- 启用 KPTI 后每次进出内核都要切换页表，TLB 与分支预测受到影响，开销明显增加。
- 内核入口与出口的审计、跟踪、seccomp 过滤与 `ptrace` 检查都计入固定成本。
- 处理函数内部的参数校验、`copy_from_user`、锁竞争与内存分配属于可变成本。
- 与普通函数调用相比，系统调用通常高出一到两个数量级，具体倍数由处理器、缓解措施与调用内容决定。
- 减少调用次数的手段包括批量接口、`vDSO`、io_uring 与用户态缓存，单纯优化单次调用的空间有限。

### 9.4（条款）copy_from_user 与 copy_to_user 为什么不能直接解引用？

- 用户传入的指针不可信，可能指向未映射、只读或内核空间的地址，直接解引用会导致内核崩溃或提权。
- `copy_from_user` 先用 `access_ok` 检查地址范围落在用户地址空间，再执行复制。
- 复制过程中发生页错误时，内核通过异常表跳转到修复代码，返回未复制的字节数而不是崩溃。
- `copy_from_user` 发生部分复制时把目标缓冲区的剩余部分清零，避免把未初始化数据带入内核。
- 启用 SMAP 后，内核访问用户页需要 `stac` 与 `clac` 临时放开限制，复制函数内部会处理。
- 大块复制可能触发缺页与调度，不能在持有自旋锁或关闭抢占的上下文中调用。

### 9.5 vDSO 如何避免一次特权级切换？

- 内核在装载程序时把 vDSO 映像映射到用户地址空间，并把地址写入辅助向量 `AT_SYSINFO_EHDR`，进程映射中显示为 `linux-vdso.so.1`。
- C 库在初始化时解析该映像，取得 `__vdso_clock_gettime` 等函数的地址，符号解析只发生在启动阶段。
- 调用这些函数执行的是用户态代码，没有 `syscall` 指令、没有栈切换，也没有页表切换。
- 时间值放在与 vDSO 相邻的 `vvar` 页中，内核写入时用序列号保护，用户态在读取前后各读一次序列号，发现变化就重试。
- 该路径把一次系统调用降为几十条指令，代价是内核必须长期维护一份可被用户态直接读取的数据格式。
- vDSO 的代码由内核提供，C 库只负责找到并调用它，因此不同内核版本的行为可以不同。

### 9.6 系统调用号与系统调用表如何保持稳定？

- 调用号属于内核 ABI，已分配的编号不会复用，被删除的调用在表中留下占位项，调用时返回 `ENOSYS`。
- x86-64 的 `sys_call_table` 按编号索引，`__NR_*` 宏由 `asm/unistd.h` 提供，新调用追加到表尾。
- 32 位兼容程序使用独立的调用表与编号空间，`compat_sys_*` 负责结构体布局与指针宽度的转换。
- x32 ABI 与 x86-64 共用编号，但调用号带有 `__X32_SYSCALL_BIT` 标志，内核据此选择不同的参数布局。
- 不同架构的编号不同，用户态应使用 `SYS_*` 宏，硬编码数字会在跨架构时失效。
- 调用表随内核版本增长，程序不应假设某个编号在所有内核上都存在，缺失时应处理 `ENOSYS`。

### 9.7（辨析）seccomp 的两种模式有什么区别？

- 严格模式只允许 `read`、`write`、`_exit`、`sigreturn` 四个系统调用，其他调用直接终止进程。
- 过滤模式用 BPF 程序检查 `seccomp_data`，可以按调用号、架构与参数值决定动作。
- 过滤模式通过 `prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog)` 或 `seccomp()` 安装。
- 非特权进程安装过滤器前需要设置 `no_new_privs`，防止通过 `setuid` 程序绕过限制。
- 过滤器安装后不能移除，默认被所有线程继承，`SECCOMP_FILTER_FLAG_TSYNC` 可以同步到已有线程。
- 过滤模式的动作包括 `ALLOW`、`ERRNO`、`KILL_PROCESS`、`TRAP`、`TRACE`、`LOG` 与 `USER_NOTIF`。

### 9.8 seccomp 过滤器能检查哪些内容？

- 输入是 `struct seccomp_data`，包含系统调用号、架构、指令指针与六个参数寄存器的值。
- 过滤器只能看到参数的数值，不能解引用指针，因此无法检查路径字符串或结构体内容。
- 参数检查适合限制标志位、描述符范围或常量值，例如禁止 `open` 带写标志。
- 需要检查路径时，可以用 `SECCOMP_RET_TRACE` 交给 `ptrace` 读取内存，或用 `SECCOMP_RET_USER_NOTIF` 交给监督进程。
- BPF 程序长度有上限，复杂策略需要拆分为多个过滤器或借助监督进程。
- 架构字段用于阻止通过 32 位兼容调用绕过检查，策略中应同时校验 `arch`。

### 9.9（场景）容器运行时如何用 seccomp 收紧权限？

- 白名单策略只放行必要调用，比黑名单更难绕过，但兼容性问题更多，需要覆盖程序启动阶段的调用。
- 白名单至少要包含动态链接、线程创建、内存映射、信号处理相关调用，否则容器无法启动。
- 对 `mount`、`ptrace`、`kexec_load`、`bpf` 等危险调用返回 `EPERM`，让程序得到可处理的错误而不是被杀。
- 需要同时拦截 `clone` 与 `clone3`，只拦旧接口会被新接口绕过。
- 过滤器按线程安装，多线程程序应在启动早期安装，或用 `TSYNC` 同步到已有线程。
- 调试时先把动作设为 `LOG` 记录被拦截的调用，确认策略后再改为 `ERRNO`。

### 9.10 ptrace 的工作机制是什么？

- 跟踪者调用 `PTRACE_ATTACH` 或 `PTRACE_SEIZE` 附加到目标进程，目标进入停止状态或保持运行等待事件。
- 跟踪者用 `waitpid` 等待停止事件，读取 `status` 判断是信号、系统调用还是断点。
- `PTRACE_GETREGS` 与 `PTRACE_SETREGS` 读写寄存器，`PTRACE_PEEKDATA` 与 `PTRACE_POKEDATA` 读写内存。
- `PTRACE_SYSCALL` 让目标在每次系统调用入口与出口各停止一次，`PTRACE_CONT` 继续执行。
- `PTRACE_O_TRACESYSGOOD` 让系统调用停止以 `SIGTRAP | 0x80` 报告，便于与真正的断点区分。
- 被跟踪进程的父进程关系改变，跟踪者接管 `wait` 语义，目标退出时由跟踪者回收。

### 9.11 ptrace 的代价与限制有哪些？

- 每次停止需要两次上下文切换，目标停止时唤醒跟踪者，跟踪者恢复时唤醒目标，开销可达原程序的数十倍。
- 同一时刻一个进程只能被一个跟踪者附加，附加失败返回 `EPERM`。
- 不能附加到 init 进程或内核线程；`ptrace_scope` 为 1 时只能附加到后代进程。
- 跟踪会改变时序，依赖时间的程序在 `strace` 下行为可能不同。
- `PTRACE_SEIZE` 不会让目标立即停止，适合先附加再按需设置选项，减少侵入。
- 容器中需要 `CAP_SYS_PTRACE` 或相应的 seccomp 放行，默认策略通常禁止 `ptrace`。

### 9.12（场景）如何用 ptrace 统计系统调用次数？

- 附加目标后用 `PTRACE_SYSCALL` 循环，入口停顿时读取 `orig_rax` 得到系统调用号。
- 出口停顿时读取 `rax` 得到返回值，可以统计失败次数与耗时。
- 维护按调用号索引的计数数组，退出时统一输出。
- 需要处理多线程：`PTRACE_O_TRACECLONE` 让新建线程自动被跟踪，每个线程单独处理停止事件。
- 停止事件可能来自任意线程，事件循环要用 `waitpid(-1, ...)` 并按 tid 区分。
- 只统计而不修改时，可以交替使用 `PTRACE_SYSCALL` 与 `PTRACE_CONT` 降低开销。

### 9.13 seccomp 与 ptrace 如何配合？

- `SECCOMP_RET_TRACE` 让匹配的系统调用暂停并把控制权交给跟踪者，跟踪者可以读取参数、修改寄存器或跳过调用。
- 跟踪者需要用 `PTRACE_SETOPTIONS` 设置 `PTRACE_O_TRACESECCOMP` 才能收到通知。
- 过滤器先于跟踪判断生效，未被过滤器匹配的调用不会通知跟踪者。
- 跟踪者可以通过修改 `rax` 伪造返回值，实现调用拦截或参数改写。
- `SECCOMP_RET_USER_NOTIF` 提供不依赖 `ptrace` 的监督进程接口，适合容器运行时。
- 两种机制都会增加每次调用的开销，热路径上的调用应尽量放行。

### 9.14 系统调用失败时的返回值约定是什么？

- 内核返回负的错误码，范围为 `-4095` 至 `-1`，`-4096` 及以下被视为合法返回值。
- C 库包装函数检查该范围，把值取反写入 `errno` 并返回 `-1`；成功时返回非负值。
- 部分调用成功时也可能返回 0，例如 `read` 读到文件末尾。
- glibc 的 `syscall()` 同样设置 `errno`；直接用汇编指令发起调用时拿到的是原始负值。
- `errno` 在成功调用后不会被清零，判断错误只能看返回值。
- `EINTR` 表示被信号中断，通常需要重试；`EAGAIN` 表示非阻塞条件下暂不可用。

### 9.15（实现）如何直接发起一次系统调用？

```cpp
#include <sys/syscall.h>
#include <unistd.h>

long tid = syscall(SYS_gettid);
if (tid == -1) {
    // errno 已由 C 库设置
}
```

- `syscall()` 是 C 库提供的通用入口，第一个参数是调用号，其余参数按顺序传入。
- 调用号在不同架构上不同，应使用 `SYS_*` 宏而不是硬编码数字。
- 某些调用没有专用包装，例如 `futex`、`io_uring_setup`，只能通过 `syscall()` 使用。
- 绕过 C 库可能影响取消点与内部状态，只在没有包装或需要精确控制时使用。
- `syscall()` 的参数类型是 `long`，指针参数需要显式转换。
- 该接口不保证参数个数与类型的编译期检查，调用号与参数不匹配时错误难以发现。

### 9.16（辨析）系统调用、库函数与 vDSO 的关系？

- 库函数可能完全在用户态实现，例如 `strlen`，也可能封装系统调用，例如 `open`。
- `open` 在 C 库中通常转为 `openat`，并处理可变参数与标志位差异。
- vDSO 函数由内核提供用户态实现，不产生特权级切换，调用形式与普通函数相同。
- 系统调用是程序主动进入内核的稳定接口，异常与中断也会进入内核，但不由程序发起。
- 判断是否发生系统调用可以用 `strace`，被 vDSO 处理的调用不会出现在输出中。
- 性能分析中 `sys` 时间占比高说明系统调用或内核处理耗时多，`user` 时间高说明计算密集。

### 9.17（场景）strace 的输出如何解读？

- 每行格式为调用名与参数，后接返回值，失败时附加错误名与描述。
- `= -1 ENOENT (No such file or directory)` 表示调用到达内核并失败，文件不存在。
- `= ?` 表示进程在调用返回前被信号杀死或被跟踪器中断。
- `+++ exited with 0 +++` 表示进程正常退出并给出状态码。
- `strace -f` 跟踪子进程与线程，输出中以 pid 前缀区分不同执行流。
- `strace -c` 汇总每个调用的次数、耗时与错误数，适合定位热点调用。

### 9.18（陷阱）内核如何决定重启还是返回 EINTR？

- 可中断的等待在收到信号时返回内部码 `-ERESTARTSYS`，由返回用户态的路径统一处理。
- 若处理函数设置了 `SA_RESTART`，内核把返回地址与寄存器调整为重新执行该系统调用。
- 未设置 `SA_RESTART` 时，内部码被转换为 `-EINTR`，用户态看到 `-1` 与 `errno`。
- `-ERESTARTNOINTR` 总是重启，`-ERESTARTNOHAND` 在有处理函数时不重启。
- `-ERESTART_RESTARTBLOCK` 通过 `restart_syscall` 重启，用于需要保留剩余时间的调用，例如 `nanosleep`。
- 重启对用户态透明，但信号处理函数已经执行，应用需要保证副作用只发生一次。

### 9.19 缺页异常与系统调用有什么区别？

- 缺页是处理器执行访存指令时产生的异常，不是程序主动发起的调用。
- 缺页处理发生在内核态，可能分配物理页、读取文件或建立写时复制映射。
- 次缺页只建立映射，主缺页需要 IO，延迟高得多。
- 缺页次数可以从 `/proc/<pid>/stat` 的 `min_flt` 与 `maj_flt` 字段观察。
- 处理完成后内核直接返回触发指令重新执行，不需要用户态重新发起。
- `mmap` 后的首次访问、栈增长与 `fork` 后的写时复制都会触发缺页。

### 9.20（填空）补全直接发起系统调用的汇编片段，空处应填什么？

```cpp
long ret;
__asm__ volatile ("syscall"
                  : "=a"(ret)
                  : "a"(__NR_getpid)
                  : "rcx", "r11", "memory");
```

- `__NR_getpid` 是系统调用号，定义在 `asm/unistd.h` 中。
- 约束 `"=a"` 与 `"a"` 表示输入输出都使用 `rax`，调用号在进入内核前写入。
- `rcx` 与 `r11` 被 `syscall` 指令破坏，必须列入破坏列表，否则寄存器分配可能出错。
- `"memory"` 告知编译器内存可能被修改，阻止跨调用的重排。
- 返回值是内核的原始返回值，负值表示错误，需要自行转换为 `errno`。
- 该写法依赖 x86-64 的调用约定与寄存器用途，不可移植到其他架构。

---

## 10. 同步原语的内核实现

### 10.1 futex 的基本语义是什么？

- futex 是一块 4 字节对齐的用户态整数，内核只在需要睡眠或唤醒时介入。
- 加锁快路径用原子指令在用户态完成，失败后才调用 `futex(FUTEX_WAIT)` 睡眠。
- `FUTEX_WAIT` 在睡眠前比较用户态的值，只有等于期望值时才睡眠，避免丢失唤醒。
- `FUTEX_WAKE` 唤醒指定地址上最多 n 个等待者，返回实际唤醒的数量。
- 内核不解释该整数的含义，等待与唤醒的配对完全由用户态协议决定。
- 未发生竞争时没有系统调用，这是 futex 相对 System V 信号量的主要优势。

### 10.2 futex 的等待队列如何组织？

- 内核用哈希表按 futex 键组织等待队列，键由地址空间的标识、用户地址与共享标志决定。
- 私有 futex 设置 `FUTEX_PRIVATE_FLAG`，键只包含 `mm` 与地址，不参与跨进程查找。
- 共享 futex 的键还包含底层文件的映射标识与页偏移，使不同进程映射同一文件时能对应同一个等待队列。
- 每个等待者对应一个 `futex_q`，挂在 `futex_hash_bucket` 的链表上。
- 哈希冲突时不同地址的等待者共享同一个桶，唤醒时按地址过滤。
- 等待队列长度影响唤醒开销，等待者很多时 `FUTEX_WAKE` 的遍历成本上升。

### 10.3（陷阱）futex 的丢失唤醒如何产生？

- 用户态检查到锁被占用，准备睡眠，但在调用 `FUTEX_WAIT` 之前锁被释放，唤醒没有对应等待者。
- 内核的 `FUTEX_WAIT` 会再次比较值，值已变化时返回 `EAGAIN` 而不睡眠，从而避免这种丢失。
- 若用户态在比较与等待之间修改了值却没有配套唤醒，仍可能丢失唤醒。
- 值必须由同一组原子操作维护，混用普通读写会破坏 futex 的配对条件。
- 虚假唤醒与 `EAGAIN` 都需要重新检查条件，等待必须放在循环中。
- `FUTEX_WAIT_BITSET` 用位集区分等待类别，可以只唤醒特定的等待组。

### 10.4（实现）如何用 futex 实现最小互斥量？

```cpp
int v = 0;   // 0 空闲，1 加锁无等待，2 加锁有等待
void lock() {
    int z = 0;
    if (__atomic_compare_exchange_n(&v, &z, 1, false, __ATOMIC_ACQUIRE, __ATOMIC_RELAXED))
        return;
    if (z != 2) z = __atomic_exchange_n(&v, 2, __ATOMIC_ACQUIRE);
    while (z != 0) {
        syscall(SYS_futex, &v, FUTEX_WAIT_PRIVATE, 2, nullptr);
        z = __atomic_exchange_n(&v, 2, __ATOMIC_ACQUIRE);
    }
}
void unlock() {
    if (__atomic_fetch_sub(&v, 1, __ATOMIC_RELEASE) != 1)
        syscall(SYS_futex, &v, FUTEX_WAKE_PRIVATE, 1);
}
```

- 三个状态分别表示空闲、已加锁且无等待者、已加锁且有等待者，状态 2 让解锁方知道需要唤醒。
- 竞争时把状态置为 2，再用期望值 2 进入 `FUTEX_WAIT`，确保解锁发生在入睡之前时不会丢失唤醒。
- 唤醒返回后重新用交换取得锁，循环条件覆盖虚假唤醒与竞争失败。
- 解锁用减一区分是否有等待者，只有从 2 减到 1 时才需要调用 `FUTEX_WAKE`。
- 内存序使用 acquire 与 release，临界区内的访存不会外移。
- 该实现省略了错误处理与超时，`SYS_futex` 需要包含 `linux/futex.h` 与 `sys/syscall.h`。

### 10.5 pthread_mutex 的加锁路径是怎样的？

- 快路径用一条原子比较交换把 `__lock` 从 0 改为 1，成功即返回，不发生系统调用。
- 竞争时进入慢路径，把状态改为 2 并调用 `futex(FUTEX_WAIT_PRIVATE)` 睡眠。
- 解锁快路径把 `__lock` 置 0；存在等待者时调用 `FUTEX_WAKE_PRIVATE` 唤醒一个。
- glibc 在慢路径中会短暂自旋，期望持锁者很快释放，减少睡眠与唤醒的次数。
- `PTHREAD_MUTEX_ADAPTIVE_NP` 允许更长的自旋，适合临界区极短的场景。
- 递归锁与错误检查锁在同一个字中编码类型与状态，路径相同但语义不同。

### 10.6（辨析）互斥量与二值信号量的区别？

- 互斥量有所有者，解锁必须由加锁的线程执行；信号量没有所有者，任何线程都可以 `post`。
- 互斥量可以实现优先级继承，信号量不能。
- 互斥量不能在信号处理函数中使用；`sem_post` 是异步信号安全的，可用于唤醒。
- 信号量计数可以大于 1，用于控制并发度；互斥量只允许一个持有者。
- 互斥量支持递归与错误检查属性，信号量没有对应语义。
- 用二值信号量做互斥时，持锁线程崩溃无法自动释放，需要超时或 `SEM_UNDO`。

### 10.7 条件变量的实现如何避免丢失唤醒？

- `pthread_cond_wait` 必须在释放互斥量之前完成等待登记，否则通知可能发生在登记之前。
- glibc 的实现用 64 位序列号与 futex 位集：等待者在释放互斥量之前完成等待登记，随后进入 `FUTEX_WAIT_BITSET`。
- 通知方递增序列号并调用 `FUTEX_WAKE_BITSET` 唤醒对应组，无需持有互斥量。
- 序列号让等待者能判断通知是否发生在自己入睡之前，从而避免丢失。
- 等待返回后必须重新获取互斥量，再在循环中检查条件。
- 被唤醒但条件不成立时继续等待，这就是对虚假唤醒的处理方式。

### 10.8（陷阱）条件变量为什么必须放在循环中等待？

- POSIX 允许虚假唤醒，`pthread_cond_wait` 可能在没有任何通知的情况下返回。
- 多个等待者被唤醒时只有一个能获得条件，其余需要重新等待。
- 通知可能在等待者获得互斥量之前被另一个线程消费。
- 正确的写法是 `while (!pred) pthread_cond_wait(&cv, &m);`，不能用 `if`。
- 通知方修改条件时必须持有互斥量，否则等待者可能错过状态变化。
- `pthread_cond_signal` 只唤醒一个等待者，状态变化影响全部等待者时才使用广播。

### 10.9（场景）条件变量广播为什么会导致惊群？

- `pthread_cond_broadcast` 唤醒所有等待者，它们同时竞争互斥量，只有一个能继续。
- 其余线程醒来后发现条件不成立，重新进入等待，产生无效的上下文切换。
- 惊群的代价与等待者数量成正比，连接数多时表现为 `sys` 时间升高。
- 用 `pthread_cond_signal` 只唤醒一个，配合每个等待者处理一个任务的队列语义。
- 需要唤醒多个时，可以按任务数量分多次 `signal`，或用多个条件变量分组。
- futex 的 `FUTEX_REQUEUE` 与 `FUTEX_CMP_REQUEUE` 可以把等待者迁移到另一个 futex，减少无效唤醒。

### 10.10 读写锁在内核与用户态如何实现？

- 用户态 `pthread_rwlock_t` 用读取计数与写入标志，读锁递增计数，写锁独占。
- 默认策略偏向读操作，持续到来的读请求可能使写锁饥饿。
- `PTHREAD_RWLOCK_PREFER_WRITER_NONRECURSIVE_NP` 让新到的读锁在写锁等待时排队，缓解写锁饥饿。
- 内核的 `rw_semaphore` 允许多个读锁并发、写锁独占，等待者在信号量队列上排队。
- 内核的 `rwlock_t` 是自旋版本，临界区必须极短且不能睡眠。
- 读多写少时 RCU 通常优于读写锁，读侧几乎没有原子操作。

### 10.11 自旋锁适用于什么场景？

- 临界区极短且持锁期间不能睡眠时使用，等待者原地循环检查锁状态。
- 单核上自旋会浪费整个时间片，需要配合关闭抢占或让出处理器。
- 持有自旋锁时不能调用可能睡眠的函数，否则可能死锁。
- 中断上下文中只能使用自旋锁，因为中断处理不能睡眠。
- 自旋锁的公平性差，竞争激烈时缓存行在处理器之间反复传递，扩展性下降。
- 内核的 `qspinlock` 用队列减少缓存行争用，`ticket spinlock` 保证先来先服务。

### 10.12 内核自旋锁的队列化实现解决了什么问题？

- 朴素自旋锁让所有等待者在同一缓存行上忙等，释放时缓存行被多个处理器争抢。
- ticket 锁用两个计数器保证公平，但等待者仍在同一变量上自旋。
- `qspinlock` 用一个字编码锁定位与等待队列尾，等待者在自己的节点上自旋。
- 释放时只唤醒队首，减少缓存行无效化与总线流量。
- MCS 锁按处理器节点排队，NUMA 系统上的优势更明显。
- 队列化增加代码复杂度，临界区极短且竞争很少时收益有限。

### 10.13（辨析）优先级继承与优先级天花板有什么区别？

- 优先级继承在阻塞发生时把持锁者的优先级提升到等待者的水平，释放锁后恢复；优先级天花板在任务进入临界区时就提升到预设上限。
- 继承是反应式的，只在发生阻塞后传播；天花板是预防式的，进入临界区即生效。
- 天花板可以避免同一把锁上的链式阻塞，继承只能逐级传递，深链仍会累积延迟。
- 继承需要维护等待者与持有者的对应关系，实现复杂；天花板只需为每把锁记录一个优先级。
- 天花板要求事先知道所有可能使用该锁的任务优先级，任务动态创建时难以维护。
- POSIX 只标准化了优先级继承，对应 `PTHREAD_PRIO_INHERIT`；天花板没有可移植接口，Linux 的 `FUTEX_LOCK_PI` 提供的是继承。

### 10.14（条款）优先级继承在内核中如何实现？

- `rt_mutex` 在等待者红黑树上按优先级排序，持锁者的有效优先级取自身与所有等待者的最大值。
- 提升优先级需要调整运行队列中的位置，涉及运行队列锁与调度记账。
- 释放锁时恢复原优先级，若仍有等待者则继续传播。
- 继承链可能跨多个锁，内核沿持有关系逐级传播，传播深度受限制。
- 用户态 `PTHREAD_PRIO_INHERIT` 互斥量通过 `FUTEX_LOCK_PI` 使用内核的 `rt_mutex`。
- 优先级继承只影响调度优先级，不改变锁的公平性与所有权语义。

### 10.15 信号量在内核中如何实现？

- 内核的 `struct semaphore` 包含计数、自旋锁与等待队列，`down` 在计数为 0 时睡眠。
- `down_interruptible` 允许被信号中断并返回 `-EINTR`，`down` 不可中断。
- `up` 递增计数并在有等待者时唤醒一个。
- 内核信号量可以在进程上下文睡眠，不能在中断上下文使用。
- 互斥量可以看作计数为 1 的特例，但 `mutex` 有所有者并支持乐观自旋。
- 用户态 POSIX 信号量用 futex 实现，System V 信号量由内核单独维护计数与撤销列表。

### 10.16（场景）高 sys 时间与 futex 争用如何排查？

- `perf top` 中 `futex_wait`、`futex_wake` 占比高说明锁竞争严重。
- `strace -c -e futex` 统计调用次数与耗时，`FUTEX_WAIT` 远多于 `FUTEX_WAKE` 时需要检查唤醒策略。
- `perf lock` 可以按锁地址统计争用次数与等待时间。
- `/proc/<pid>/status` 的 `voluntary_ctxt_switches` 增长快说明线程频繁睡眠。
- 缩短临界区、减少共享、按数据分片加锁是常见优化方向。
- 伪共享也会表现为缓存行争用，需要检查锁与热点数据是否落在同一缓存行。

### 10.17（辨析）RCU 与读写锁的差异？

- RCU 读侧不加锁、不修改共享计数，读操作几乎没有额外开销。
- 写侧复制数据、修改副本，再用原子指针替换，旧版本在宽限期结束后释放。
- 宽限期保证所有已开始的读侧临界区结束后才回收旧数据。
- 读写锁的读侧仍需原子操作修改计数，缓存行争用随处理器数量增加。
- RCU 适合读多写少且读侧不能睡眠的场景，写侧延迟较高。
- 用户态没有标准 RCU，需要自行实现或使用外部库。

### 10.18（陷阱）为什么不能在持有自旋锁时调用 copy_to_user？

- `copy_to_user` 可能触发缺页，缺页处理需要睡眠等待 IO。
- 自旋锁持有期间禁止睡眠，睡眠会导致其他处理器长时间自旋，甚至死锁。
- 内核在 `might_sleep` 检查中会对这类调用发出警告。
- 正确做法是先复制到内核缓冲区，释放锁之后再复制到用户态。
- 同样不能在持锁时调用 `kmalloc(GFP_KERNEL)`、`mutex_lock` 或文件操作。
- 需要睡眠的临界区应改用互斥量或信号量。

### 10.19 自旋锁、互斥量、信号量、条件变量如何选择？

| 原语 | 等待方式 | 持有时能否睡眠 | 典型用途 |
| --- | --- | --- | --- |
| 自旋锁 | 忙等 | 否 | 极短临界区、中断上下文 |
| 互斥量 | 睡眠 | 是 | 一般临界区，需要所有权 |
| 信号量 | 睡眠 | 是 | 控制并发数量、事件通知 |
| 条件变量 | 睡眠 | 是 | 等待条件成立，配合互斥量 |

- 临界区短且确定不睡眠时选自旋锁，临界区可能睡眠时选互斥量。
- 需要限制同时进入的线程数量时选信号量，它的计数可以大于 1。
- 等待某个条件成立时选条件变量，并且必须与互斥量配合使用。
- 读多写少时考虑读写锁或 RCU，写侧延迟可以接受时 RCU 的读侧开销更低。
- 选择原语时要同时考虑所有权、优先级继承与持有期间的调用限制。

### 10.20（场景）多核扩展性差，锁该如何改进？

- 用 `perf c2c` 检查缓存行争用，确认是否多个处理器写同一行。
- 把全局锁拆分为按哈希或按对象分片的多把锁，降低冲突概率。
- 读多写少时改用读写锁或 RCU，减少写侧独占的时间。
- 用每线程本地缓冲加批量合并，降低共享数据的访问频率。
- 用无锁队列或乐观并发替代粗粒度锁，但需要评估 ABA 与内存回收。
- 锁的排队方式也影响扩展性，MCS 队列锁在高竞争下优于简单自旋。

---

## 11. 调度与优先级

### 11.1 CFS 如何计算并更新 vruntime？

- `vruntime` 以纳秒为单位累计，增量等于实际运行时间乘以权重比 `NICE_0_LOAD / weight`，其中 `NICE_0_LOAD` 取 1024。
- 每个 CPU 的运行队列用红黑树按 `vruntime` 排序，取最左节点作为下一个运行实体；`min_vruntime` 单调推进，新唤醒任务的位置取 `se->vruntime` 与 `cfs_rq->min_vruntime` 减去一个偏移后的较大值，避免长期霸占 CPU 或长期饥饿。
- 时间片由 `sched_slice` 按权重比例切分，受 `sched_latency` 与 `sched_min_granularity` 约束；就绪任务数超过 `sched_nr_latency` 后，时间片退化为最小粒度。
- Linux 6.6 起默认调度器改为 EEVDF，用 lag 与 eligible 判断取代单纯的 `vruntime` 最左选择，部分旧参数被 `sched_base_slice` 取代。
- 累计值在任务新建、`setpriority`、跨 CPU 迁移时会被归一化，跨核直接比较 `vruntime` 没有意义。
- 记账点在 `update_curr`，由时钟中断、调度点与唤醒路径触发；单次更新为 O(log n)，与就绪任务数无关。
- 精度受时钟中断周期与虚拟时间记账配置影响，短任务的记账存在误差，具体程度取决于内核版本与配置。

### 11.2（陷阱）nice 值的取值范围与效果是什么？

- `nice` 取值 -20 到 19，默认 0，数值越小优先级越高；普通进程只能调高 nice 值，调低需要 `CAP_SYS_NICE`。
- 相邻两级的 CPU 份额比约为 1.25，nice 0 的权重为 1024，nice 1 为 820，nice -1 为 1277；相差 10 级的两个任务份额相差约 10 倍，并非线性。
- nice 只影响普通调度类的权重，对 `SCHED_FIFO`、`SCHED_RR`、`SCHED_DEADLINE` 无效。
- 接口为 `setpriority(PRIO_PROCESS, pid, nice)`；`getpriority` 可以返回 -1，必须同时检查 `errno` 才能区分合法返回值与错误。
- 权重只在任务可运行时参与竞争，阻塞在 I/O、锁或页故障上的任务即使 nice 很低也拿不到 CPU。
- cgroup 的 `cpu.weight` 与 nice 是两层机制：先按组分配，再在组内按 nice 分配。
- 修改 nice 不触发迁移，只改变所在运行队列中的排序权重，负载均衡仍按原有策略进行。

### 11.3（辨析）SCHED_FIFO 与 SCHED_RR 的区别是什么？

- 两者都属于实时调度类，优先级范围 1 到 99，数值大者优先，实时任务总是抢占普通任务。
- `SCHED_FIFO` 没有时间片，任务运行到主动阻塞、调用 `sched_yield` 或被更高优先级任务抢占为止；同优先级任务按入队顺序排队。
- `SCHED_RR` 在同优先级任务之间轮转，时间片由 `sched_rr_timeslice_ms` 决定，默认 100 毫秒，耗尽后移到队尾。
- 两者都受实时带宽限制：`sched_rt_runtime_us` 默认 950000、`sched_rt_period_us` 默认 1000000，即每个周期最多占用 95% 的 CPU，超出部分推迟到下一周期。
- 设置实时策略需要 `CAP_SYS_NICE`，或不超过 `RLIMIT_RTPRIO` 的优先级；`RLIMIT_RTTIME` 限制实时任务连续不阻塞运行的时间，超限发送 `SIGXCPU`。
- 实时任务不参与 nice 权重计算，调整 nice 不改变其优先级，也不改变同优先级轮转顺序。

```cpp
struct sched_param sp = {};
sp.sched_priority = 40;
if (sched_setscheduler(0, SCHED_FIFO, &sp) == -1) {
    // EPERM：缺少 CAP_SYS_NICE 或超出 RLIMIT_RTPRIO
    perror("sched_setscheduler");
}
```

### 11.4（场景）实时线程占满 CPU 后系统失去响应，如何定位与处置？

- 先判断是否触发实时节流：读取 `/proc/sys/kernel/sched_rt_runtime_us`，观察 `/proc/<pid>/sched` 中的 `rt_time`，以及 `perf sched` 的延迟分布。
- 确认策略与优先级：`chrt -p <pid>`、`ps -eo pid,cls,rtprio,comm`，检查是否存在长期处于运行态的 99 级任务。
- 判断是否在实时上下文中自旋：`perf top` 看用户态热点，`cat /proc/<pid>/stack` 看内核栈，`cat /proc/<pid>/wchan` 判断阻塞位置。
- 处置手段包括降低优先级、改回 `SCHED_OTHER`、临时把 `sched_rt_runtime_us` 设为 -1 关闭节流（只用于诊断，会放大风险），或用 cgroup 的 `cpu.max` 限制配额。
- 若任务受中断或软中断驱动，需要检查中断亲和性与内核抢占配置；非实时内核中自旋锁临界区不可抢占，会成倍放大阻塞时间。
- 预防措施：实时线程避免在临界区内做内存分配、日志写入与阻塞调用，把耗时工作交给普通优先级线程。
- `dmesg` 中的 `watchdog: BUG: soft lockup` 与 `NMI watchdog` 报告是长时间关中断或关抢占的直接线索。

### 11.5 sched_setscheduler 的失败路径与权限要求是什么？

- 原型为 `sched_setscheduler(pid_t pid, int policy, const struct sched_param *param)`，`pid` 为 0 表示调用线程，`param->sched_priority` 只对实时策略有意义。
- 需要 `CAP_SYS_NICE`，或在 `RLIMIT_RTPRIO` 非零时设置不超过该值的实时优先级；把实时策略改回 `SCHED_OTHER` 同样需要权限。
- 失败返回 -1 并置 `errno`：`EINVAL` 表示策略未知或优先级越界，`EPERM` 表示权限不足，`ESRCH` 表示目标线程不存在。
- 优先级取值随策略变化：`SCHED_FIFO` 与 `SCHED_RR` 为 1 到 99，`SCHED_OTHER`、`SCHED_BATCH`、`SCHED_IDLE` 必须为 0。
- `SCHED_DEADLINE` 不能通过此接口设置，必须用 `sched_setattr` 填写 `sched_runtime`、`sched_deadline`、`sched_period`。
- 多线程程序应使用 `pthread_setschedparam` 或 `pthread_attr_setschedpolicy`，并设置 `PTHREAD_EXPLICIT_SCHED`，否则新线程继承创建者的策略。
- 策略变化会引起运行队列重排，若目标线程正在运行且被降级，可能在系统调用返回前就被抢占。

### 11.6（实现）优先级反转如何发生，PI 互斥量如何缓解？

- 典型顺序：低优先级任务 L 持有锁，高优先级任务 H 阻塞在该锁上，中优先级任务 M 就绪并抢占 L，H 的等待时间被 M 拉长。
- 内核侧对应 `rt_mutex`；用户态由 `PTHREAD_PRIO_INHERIT` 触发，glibc 把加锁映射到 `FUTEX_LOCK_PI`，解锁映射到 `FUTEX_UNLOCK_PI`。
- 继承的做法是把持有者优先级临时提升到等待者中的最高值，释放后恢复原值，链式阻塞沿等待链逐级传播。
- PI 只覆盖内核可见的阻塞；用户态自旋、忙轮询与无锁结构中的等待不在继承范围内。
- 代价：每次 PI 加锁可能落到 futex 系统调用（无竞争时走快速路径），持有者优先级变化引发运行队列调整，链过深时开销上升。
- `PTHREAD_PRIO_PROTECT` 提供优先级天花板，持锁即提升到固定值；Linux 对该属性的支持有限，进程间共享场景通常不可用。
- 更彻底的做法是缩短临界区、避免在实时线程中持有跨线程锁，或用无锁队列把数据转交给低优先级线程。

```cpp
pthread_mutexattr_t attr;
pthread_mutexattr_init(&attr);
pthread_mutexattr_setpshared(&attr, PTHREAD_PROCESS_SHARED);
pthread_mutexattr_setprotocol(&attr, PTHREAD_PRIO_INHERIT);
pthread_mutex_init(&mtx, &attr);
```

### 11.7 SCHED_DEADLINE 的语义与三个参数是什么？

- 基于最早截止时间优先（EDF）与恒定带宽服务器（CBS），三个参数为 `sched_runtime`、`sched_deadline`、`sched_period`，单位纳秒，必须满足 runtime 不大于 deadline、deadline 不大于 period。
- 通过 `sched_setattr` 设置，`sched_flags` 可带 `SCHED_FLAG_RESET_ON_FORK`；需要 `CAP_SYS_NICE`。
- 设置时执行准入控制，所有 deadline 任务的带宽之和超过根域上限会返回 `EBUSY`，上限由内核参数决定。
- 任务在 runtime 内完成可以主动让出；运行时间超出 runtime 会被节流到下一周期，表现为延迟尖峰。
- 调度优先级高于实时类，但只在截止时间临近时获得 CPU；长临界区与关抢占区间会破坏可调度性分析的前提。
- 与 `SCHED_FIFO` 混用时，实时任务可能挤占 deadline 任务的时间，实践上把 deadline 任务绑核并隔离。
- 观测点：`/proc/<pid>/sched` 中的 `dl_runtime`、`dl_deadline`、`dl_period`，以及 `/proc/sched_debug` 中的带宽占用。

### 11.8（场景）CPU 亲和性如何设置，绑核为什么可能降低性能？

- 接口为 `sched_setaffinity` 与 `sched_getaffinity`，配合 `cpu_set_t`、`CPU_ZERO`、`CPU_SET`；命令行用 `taskset -c`，线程用 `pthread_setaffinity_np`。
- 亲和性是掩码，内核仍可在掩码内迁移；cgroup 的 `cpuset.cpus` 是上层约束，两者取交集。
- 绑核切断负载均衡，热点集中在一个核上，其余核空转，多线程吞吐型负载通常因此下降。
- 绑核后无法借助其他核吸收中断、软中断与内核线程，`ksoftirqd`、`kworker` 争抢同一核会放大尾延迟。
- NUMA 机器上绑核需同时约束内存，`numactl --cpunodebind --membind`，否则远端内存访问会抵消收益。
- 合理用法是隔离专用核：`isolcpus` 与 `nohz_full` 配合 `cpuset`，延迟敏感线程独占，其他负载放到剩余核。
- 排查手段：`/proc/<pid>/status` 的 `Cpus_allowed_list`、`perf sched` 的迁移次数、`/proc/stat` 中各核的负载分布。

```cpp
cpu_set_t set;
CPU_ZERO(&set);
CPU_SET(2, &set);
if (sched_setaffinity(0, sizeof(set), &set) == -1) {
    perror("sched_setaffinity");   // EINVAL：掩码为空
}
```

### 11.9 负载均衡在何时触发？

- 周期性均衡由时钟中断驱动，沿 `sched_domain` 层级自底向上比较组负载，`sd->balance_interval` 随层级放大。
- 唤醒时均衡在 `select_task_rq_fair` 中完成，优先选择唤醒者所在 CPU 或共享缓存域，减少迁移与缓存失效。
- 新建任务、`exec`、`sched_setaffinity` 变化、CPU 热插拔都会触发重新选择运行队列。
- 迁移的最小单位是任务，代价是缓存与 TLB 失效；`sched_migration_cost`（默认 500 微秒）用于估算迁移是否值得。
- 域标志 `SD_BALANCE_WAKE`、`SD_SHARE_PKG_RESOURCES` 决定各层行为，NUMA 层还会考虑内存亲和性。
- 空闲拉取在 CPU 进入空闲前触发，`newidle` 路径上的锁竞争在高核数机器上可能成为瓶颈。
- 绑核与 `cpuset` 会切断均衡域，被隔离的核不参与拉取，负载不均只能靠人为规划。

### 11.10（陷阱）多核环境下 nice 值与 CPU 占用率之间是什么关系？

- nice 决定同一运行队列内可运行任务的份额，不限制绝对用量；单任务独占一核时，nice 19 也能跑到 100%。
- 两个同 nice 的任务平分一个 CPU，各约 50%；nice 0 与 nice 5 并存时按权重比分配，约 3 比 1。
- 多核上任务会被均衡迁移，长期平均占用率由所在核的竞争者决定，瞬时观测容易误判。
- `top` 的 `%CPU` 以单核为 100%，多线程程序可以超过 100%，与 cgroup 视角下的统计口径不同。
- nice 不阻止抢占，也不改变 I/O 与内存带宽的竞争结果，CPU 空闲不代表任务完成得快。
- 需要限制绝对用量时应使用 cgroup 的 `cpu.max`，nice 只调整相对份额。
- 核对实际份额可读 `/proc/<pid>/schedstat` 的运行时间与等待时间，或用 `perf sched latency` 观察。

### 11.11（输出题）sched_yield 的实际行为是什么？

- 语义是把调用线程移到所在运行队列队尾，让同优先级或更高优先级的任务先运行；没有其他可运行任务时立即返回。
- 对 `SCHED_FIFO`，让出给同优先级的下一个任务；对 `SCHED_RR`，效果接近时间片提前耗尽；对普通任务，通常接近空操作。
- 成功返回 0，失败情形极少，误用不会报错，只表现为 CPU 占用升高或延迟抖动。
- 常见误用是自旋等锁时反复调用，在单核上让出后立即回来，形成忙等。
- 代价包括一次调度器调用、可能的上下文切换与缓存失效，高频调用拉低吞吐。
- 替代方案是 futex 等待、条件变量、`eventfd` 或 `io_uring`，把阻塞与唤醒交给内核。
- 实时场景下 `sched_yield` 不保证让出给特定任务，需要确定性时应使用显式同步。

### 11.12 调度延迟与唤醒延迟如何度量？

- 调度延迟指任务变为可运行到实际获得 CPU 的时间；唤醒延迟还包含中断处理到被唤醒任务开始运行的整段路径。
- `perf sched latency` 给出按任务的等待统计，`perf sched record` 记录 `sched_switch` 与 `sched_wakeup` 事件。
- eBPF 工具 `runqlat` 以直方图展示运行队列等待时间，`runqlen` 展示队列长度，适合定位尾延迟。
- `/proc/<pid>/schedstat` 三个字段依次为运行时间、等待时间、时间片次数，单位为纳秒。
- `/proc/<pid>/sched` 提供 `se.wait_sum`、`se.nr_migrations` 与平均值字段，需要打开调度调试配置。
- 测量本身有开销，高频采样与 eBPF 探针会引入抖动，生产环境应限制采样率与作用范围。
- 尾延迟比均值更重要，P99 受实时任务、中断、内存回收与 NUMA 迁移共同影响，需结合多种工具交叉验证。

### 11.13（场景）调度周期与最小粒度如何影响交互延迟？

- `sched_latency` 是目标轮转周期，`sched_min_granularity` 是单个任务的最小运行时间，二者之商给出就绪任务数上限。
- 就绪任务超过上限后，每个任务只运行最小粒度，总周期随任务数线性增长，交互延迟随之恶化。
- 调小周期能降低延迟，但上下文切换增多、缓存局部性变差，吞吐下降。
- 调大最小粒度减少切换，适合批处理，不适合低延迟服务。
- 这些参数位于 `/proc/sys/kernel/` 下，属于整机级调优，容器内修改会影响宿主机全部负载。
- EEVDF 下部分参数被 `sched_base_slice` 取代，调优前应确认内核版本对应的参数名。
- 观测方法是 `perf sched latency` 的最大值与均值，配合 `/proc/sched_debug` 的 `nr_running` 判断是否长期超限。

### 11.14（辨析）autogroup 与 cgroup CPU 控制器有什么区别？

- autogroup 按会话自动分组，目的是让前台会话在与后台编译任务竞争时获得接近对等的份额，内核 2.6.38 引入。
- cgroup 的 CPU 控制器提供两种手段：`cpu.weight` 按比例分配，`cpu.max` 限制绝对带宽。
- autogroup 粒度是会话，不能嵌套，也不能指定进程集合；cgroup 支持层级、委派与任意划分。
- autogroup 只影响普通调度类；cgroup 的 `cpu.max` 同样只节流普通调度类，实时带宽由 `sched_rt_runtime_us` 单独控制。
- 开关位于 `/proc/sys/kernel/sched_autogroup_enabled`，调用 `setsid` 会生成新的 autogroup。
- 容器运行时依赖 cgroup 做隔离与配额，autogroup 在容器内通常关闭。
- 排错时先确认生效的是哪套机制：`/proc/<pid>/cgroup` 与 `/proc/<pid>/autogroup` 给出直接答案。

### 11.15（实现）CFS 的红黑树与 EEVDF 的选择方式有何差别？

- CFS 以 `vruntime` 为键维护红黑树，最左节点即下一个运行实体，插入、删除、取最小均为 O(log n)。
- EEVDF 以虚拟截止时间选择，键由 `vruntime` 与时间片、权重派生，同时维护 eligible 集合，只有 lag 非负的任务可被选中。
- lag 衡量任务应得 CPU 与实际获得 CPU 之差，改善了延迟敏感任务的响应，也削弱了 slept 任务累积的抢占优势。
- 两者都依赖 `min_vruntime` 单调推进与唤醒位置修正，防止新任务长期占用 CPU。
- 切换数据结构不改变接口，`sched_setscheduler`、nice 与 cgroup 权重的语义保持兼容。
- `/proc/sched_debug` 的字段随版本变化，排障应以当前内核文档为准，旧字段名不能直接套用。
- 对应用的可观测差异主要在尾延迟与唤醒抢占频率，需要实测确认，不能由版本号推断。

### 11.16（陷阱）线程优先级与互斥量阻塞之间是什么关系？

- 阻塞在互斥量上的线程不消耗 CPU，优先级高低不影响它何时被唤醒，唤醒顺序由 futex 等待队列决定。
- futex 等待队列按入队顺序唤醒，不按优先级排序；未启用 PI 时，高优先级线程可能排在后到的低优先级线程之后。
- 被唤醒的线程仍需参与调度竞争，能否立即运行取决于运行队列状态与 CPU 亲和性。
- 用户态自旋锁在竞争时不睡眠，高优先级线程自旋会持续占用 CPU，比阻塞更不利。
- 条件变量的 `signal` 只唤醒一个等待者，选中哪个由实现决定，不能依赖优先级。
- 实时场景应使用 PI 互斥量，并把临界区压缩到只覆盖共享数据访问。
- 排查饥饿可看 `/proc/<pid>/status` 的 `voluntary_ctxt_switches`，内核锁用 `perf lock`，用户态锁需要自行埋点。

### 11.17 中断与软中断如何影响调度延迟？

- 硬中断在中断上下文执行，屏蔽本 CPU 的部分中断，处理时间过长会直接推迟调度。
- 软中断在网络收发路径上大量出现，`ksoftirqd` 以普通线程身份参与调度，与业务线程竞争 CPU。
- 中断亲和性可绑定到指定核：`/proc/irq/<num>/smp_affinity`，`irqbalance` 会在运行期动态调整。
- 网卡多队列配合 RPS、RFS 把处理分散到多核，减少单核争抢，代价是跨核缓存失效。
- 实时内核把大部分软中断改为可抢占的内核线程，显著降低最坏延迟，吞吐略降。
- 观测入口为 `/proc/interrupts`、`/proc/softirqs`、`mpstat -I SUM`，以及 `perf stat -e irq:softirq_entry`。
- 被隔离的核上仍有定时器、RCU 回调与工作队列，需要 `nohz_full` 与 `rcu_nocbs` 配合才能接近独占。

### 11.18（辨析）SCHED_BATCH 与 SCHED_IDLE 的适用边界是什么？

- `SCHED_BATCH` 面向批处理：保留普通任务的权重语义，降低唤醒抢占倾向，让任务连续运行更久。
- `SCHED_IDLE` 权重最低，只在 CPU 空闲时运行，适合后台维护、预取、延迟可无限容忍的工作。
- 两者都不需要特权，nice 值仍然有效，但 `SCHED_IDLE` 的权重固定在最低档。
- `SCHED_BATCH` 会放大交互延迟，不适合有响应时间要求的线程；`SCHED_IDLE` 在满载时可能长期得不到 CPU。
- `SCHED_IDLE` 任务仍会被负载均衡迁移，绑核后可能长时间无法执行。
- cgroup 配额独立于这两种策略，`cpu.max` 用尽后即使空闲类任务也会被节流。
- 选择依据是延迟敏感度与可推迟程度，不是 CPU 占用率高低。

### 11.19（场景）CPU 隔离如何配置，隔离后还有哪些干扰？

- 启动参数 `isolcpus=2-7` 把指定核移出调度器均衡域，`nohz_full=2-7` 让单任务运行时不产生周期性时钟中断。
- `rcu_nocbs=2-7` 把 RCU 回调移到其他核，`irqaffinity=0-1` 把中断引开，三者通常一起配置。
- 隔离不阻止显式绑核，仍可用 `sched_setaffinity` 把线程放上去；容器场景用 `cpuset` 约束。
- 剩余干扰包括每核定时器、`kworker`、`migration` 线程、TLB shootdown 以及未迁移的中断。
- `nohz_full` 只在一个可运行任务时生效，多任务并存时周期性时钟会重新开启。
- 隔离核上的任务若进入睡眠，唤醒路径可能引入核间中断，需要评估实时内核或忙轮询方案。
- 验证入口：`/sys/devices/system/cpu/isolated`、`/proc/cmdline`、`turbostat` 观察各核的 C-state 与频率。

### 11.20 如何观测上下文切换与运行队列长度？

- `vmstat` 的 `cs` 列给出系统级切换次数，`/proc/<pid>/status` 的 `voluntary_ctxt_switches` 与 `nonvoluntary_ctxt_switches` 区分主动与被动切换。
- 主动切换多来自阻塞调用，被动切换来自时间片耗尽或被抢占，两者的调优方向不同。
- `runqlen` 采样队列长度，`runqlat` 给出等待时间分布，二者结合可区分 CPU 不足与调度策略问题。
- `perf sched` 能还原单个时间窗口的切换链，`ftrace` 的 `sched_switch` 与 `sched_wakeup` 提供原始事件。
- 切换代价包括寄存器保存、地址空间切换（同进程线程不换页表基址）、缓存与 TLB 污染，量级由硬件决定。
- 高频切换不一定有害，短任务密集时切换是吞吐的组成部分，判断标准是切换是否伴随有效工作。
- 采集会改变系统状态，探针与采样都应限制频率，并在同一基线下比较。

---

## 12. 时间与定时器

### 12.1（辨析）CLOCK_REALTIME 与 CLOCK_MONOTONIC 的区别是什么？

- `CLOCK_REALTIME` 表示日历时间，受 `settimeofday`、`clock_settime` 与 NTP 步进调整影响，可能出现回退或跳变。
- `CLOCK_MONOTONIC` 从系统启动开始单调递增，不受时间设置影响，但会被 NTP 的频率调整缓慢校正。
- `CLOCK_REALTIME` 适合记录时间戳、日志与协议字段；测量间隔、计算超时应用 `CLOCK_MONOTONIC`。
- 内核通过 `timekeeper` 维护各时钟的基准与偏移，读取时用序列锁保证一致性，避免读到撕裂的时间值。
- `CLOCK_MONOTONIC` 的起点是启动时刻，不包含挂起时间，跨机器比较无意义。
- 容器的 time namespace 只能偏移 `CLOCK_MONOTONIC` 与 `CLOCK_BOOTTIME`，无法改变 `CLOCK_REALTIME`。
- 修改 `CLOCK_REALTIME` 需要 `CAP_SYS_TIME`，失败路径为 `EPERM` 或 `EINVAL`（时间值非法）。

### 12.2 CLOCK_MONOTONIC 在系统挂起期间如何变化？

- `CLOCK_MONOTONIC` 在挂起（suspend to RAM）期间停止推进，恢复后从挂起前的值继续，因此不能用于跨挂起的超时计算。
- `CLOCK_BOOTTIME` 包含挂起时间，语义等于单调时钟加挂起时长，适合实现看门狗与休眠唤醒后的超时。
- 两者都不受用户修改系统时间的影响，区别只在是否累计挂起区间。
- `CLOCK_MONOTONIC_RAW` 不做 NTP 频率校正，硬件计数器的原始值直接暴露，适合校准与追踪。
- 定时器可以基于 `CLOCK_BOOTTIME` 创建，`timerfd_create` 接受该时钟，到期判断在恢复后立即生效。
- 挂起期间到期的定时器在恢复时集中触发，应用需要处理批量到期带来的尖峰。
- 读取这些时钟不改变系统状态，失败仅来自无效的时钟标识或非法地址。

### 12.3（陷阱）clock_gettime 的返回值与精度是什么？

- 成功返回 0；失败返回 -1 并置 `errno`，常见值为 `EINVAL`（时钟标识无效）与 `EFAULT`（指针不可写）。
- `clock_getres` 报告名义分辨率，通常为 1 纳秒，实际精度取决于时钟源与架构，由实现决定。
- 结构体 `timespec` 的 `tv_nsec` 必须落在 0 到 999999999，越界的时间值在设置类接口中会被拒绝。
- 返回值不能直接与 0 比较后忽略错误，封装函数应把错误码向上传递，而不是返回零值时间。
- 精度不等于准确度：`CLOCK_REALTIME` 受 NTP 与晶振漂移影响，`CLOCK_MONOTONIC` 受频率校正影响。
- 32 位平台上 `time_t` 的宽度会影响 `clock_gettime` 的接口选择，需要启用 64 位时间支持。
- 与 `gettimeofday` 相比，`clock_gettime` 提供纳秒字段并支持多种时钟，新代码应优先使用。

### 12.4 vDSO 如何加速 clock_gettime？

- 内核在进程地址空间中映射一页只读代码与数据，即 `linux-vdso.so.1`，导出 `__vdso_clock_gettime` 等符号。
- 调用时无需陷入内核，普通函数调用即可完成读取，代价从系统调用的一千纳秒量级降到几十纳秒量级，具体数字由硬件决定。
- 实现依赖 `timekeeper` 数据与序列锁：读前取序号，读后校验序号是否变化，变化则重试，保证不读到半更新的时间。
- 仅部分时钟源适合该路径，底层计数器无法在用户态完成换算时，库函数回退到真正的系统调用。
- vDSO 数据页由内核更新，用户态只读；读取过程中若发生时钟源切换，序列锁校验会发现并重试。
- 静态链接或使用 musl 时同样存在 vDSO 支持，但符号解析方式不同，需确认工具链是否启用。
- 排查时可用 `ldd` 观察 `linux-vdso` 是否存在，用 `strace -e trace=clock_gettime` 确认是否仍产生系统调用。

### 12.5（场景）Y2038 问题的影响范围与迁移路径是什么？

- 32 位有符号 `time_t` 在 2038 年 1 月 19 日溢出，依赖该类型的系统调用、文件系统时间戳与协议字段都受影响。
- 受影响的接口包括 `time`、`stat`、`utime`、`select` 的超时结构，以及部分网络与数据库协议的时间字段。
- 迁移手段是把 `time_t` 加宽到 64 位：glibc 2.34 起可定义 `_TIME_BITS=64` 并配合 `_FILE_OFFSET_BITS=64`。
- 内核侧通过新的系统调用与结构体承载 64 位时间，旧接口保留兼容层，32 位程序需要重新编译才能受益。
- 文件系统的时间戳另有独立宽度，ext4 在 inode 额外字段中保存超出范围的时间，具体行为取决于文件系统。
- 只修改应用代码不够，第三方库与序列化格式同样需要审计，跨进程共享的结构体布局必须一致。
- 检测手段包括静态扫描 `time_t` 的使用、在目标平台上把系统时间调到 2038 年附近做验证，以及检查编译器警告。

### 12.6（辨析）timerfd、POSIX 定时器与 sleep 的区别是什么？

- `timerfd_create` 返回文件描述符，到期时变为可读，能与 `epoll`、`poll` 统一处理，适合事件循环。
- POSIX 定时器 `timer_create` 支持 `SIGEV_SIGNAL`、`SIGEV_THREAD` 与 `SIGEV_THREAD_ID`，信号方式受信号处理限制，线程方式每次到期创建线程，开销较大。
- `nanosleep` 与 `clock_nanosleep` 阻塞当前线程，无法与其他事件复用，且被信号打断后需要自行续睡。
- `setitimer` 精度受时钟中断限制，属于低分辨率定时器，且信号可能丢失，不适合精确计时。
- `timerfd` 的到期计数可以累积，读取一次取得多次到期，天然支持合并处理；信号方式则可能合并或丢失。
- `timerfd` 支持绝对时间（`TFD_TIMER_ABSTIME`），避免相对时间累积漂移；`nanosleep` 需要手动换算绝对截止时间。
- 选择依据是是否处于事件循环、是否需要精度、是否能接受信号语义，而非接口新旧。

### 12.7（输出题）timerfd 的读取语义是什么？

- `read` 必须提供至少 8 字节缓冲区，内核写入一个 `uint64_t` 表示自上次读取以来到期的次数，返回值为 8。
- 读取会重置计数；到期多次但只读一次时，返回累计值而非 1，例如每秒到期而 5 秒后读取，返回 5。
- 缓冲区小于 8 字节返回 -1 并置 `EINVAL`；非阻塞模式下未到期返回 -1 并置 `EAGAIN`。
- 计数上限受内核实现限制，长时间不读且周期极短时可能饱和，不能把计数当作精确的到期时间序列。
- `TFD_TIMER_ABSTIME` 让到期时间基于绝对时刻；`TFD_TIMER_CANCEL_ON_SET` 在实时时钟被步进修改时让读取失败并置 `ECANCELED`。
- 边沿触发模式下必须循环读取直到 `EAGAIN`，否则后续到期不会再产生可读事件。
- 关闭描述符即取消定时器，未读取的到期计数直接丢弃。

```cpp
int tfd = timerfd_create(CLOCK_MONOTONIC, TFD_NONBLOCK | TFD_CLOEXEC);
itimerspec its = {};
its.it_value.tv_sec = 1;
its.it_interval.tv_nsec = 100 * 1000 * 1000;   // 100 毫秒
timerfd_settime(tfd, 0, &its, nullptr);

uint64_t expirations = 0;
ssize_t n = read(tfd, &expirations, sizeof(expirations));
// n == 8 表示读取成功；-1 且 errno == EAGAIN 表示尚未到期
```

### 12.8（实现）高精度定时器在内核中如何实现？

- 高精度定时器（hrtimer）以每 CPU 的红黑树组织，按到期时间排序，最早节点决定下一次时钟事件。
- 时钟事件设备提供单次触发能力，内核据此编程下一次到期时刻，取代固定周期的时钟中断。
- 时钟基准分为 `CLOCK_MONOTONIC`、`CLOCK_REALTIME`、`CLOCK_BOOTTIME` 等，各自维护一棵树，读取时按需换算。
- 精度名义上为 1 纳秒，实际受时钟源、中断延迟与关中断区间影响，由实现与硬件共同决定。
- 未开启高精度模式时回退到周期时钟，定时器按时钟中断边界取整，精度降到毫秒级。
- 到期处理在硬中断上下文执行回调，回调应尽量短；耗时工作通常转交工作队列或唤醒线程。
- 定时器合并（timer slack）会给非实时定时器一个允许的延迟窗口，减少唤醒次数与功耗。

### 12.9（陷阱）nanosleep 被信号打断后剩余时间如何处理？

- 被信号处理函数打断时返回 -1 并置 `EINTR`，第三个参数写回剩余时间；该参数为 `NULL` 时剩余时间丢失。
- 正确做法是循环调用并把剩余时间作为新的请求，直到返回 0，或改用 `clock_nanosleep` 配合 `TIMER_ABSTIME`。
- `clock_nanosleep` 失败时直接返回错误码而非 -1，且不设置 `errno`，与 `nanosleep` 的约定不同。
- 使用绝对时间可以避免「剩余时间再加一次」的误差累积，也能抵御系统时间被调整的影响。
- 剩余时间在被打断时计算，信号处理函数的执行时间不计入睡眠，实际等待会因此变长。
- 睡眠精度受定时器松弛影响，默认允许几十微秒的偏移，需要更严格时可用 `prctl(PR_SET_TIMERSLACK, 1)` 调整。
- 被频繁信号打断的睡眠可能长期无法完成，应改用 `ppoll`、`epoll_wait` 或事件驱动等待。

### 12.10 哪些配置会影响定时器精度？

- 内核时钟频率 `CONFIG_HZ` 决定周期时钟的粒度，低分辨率模式下定时器按该粒度取整。
- `CONFIG_HIGH_RES_TIMERS` 与硬件是否支持单次触发时钟事件决定能否进入高精度模式。
- `CONFIG_NO_HZ_IDLE` 与 `CONFIG_NO_HZ_FULL` 在空闲或单任务时停掉周期时钟，降低唤醒与功耗，但要求时钟事件设备可靠。
- 定时器松弛值放大到期窗口，批量合并到期可以省电，代价是延迟增加。
- 虚拟化环境中，时钟事件可能由宿主机注入，退出的开销与注入延迟直接影响精度。
- 长时间关中断、禁用抢占的临界区会推迟到期回调，表现为偶发的延迟尖峰。
- 观测手段包括 `/proc/timer_list`、`tracefs` 中的 timer 事件，以及 `cyclictest` 的延迟分布。

### 12.11 时间轮与最小堆的取舍是什么？

- 最小堆按到期时间排序，插入与删除为 O(log n)，取最早到期为 O(1)，适合到期时间分布任意且需要精确顺序的场景。
- 时间轮把时间轴划分为槽，插入为 O(1)，到期扫描按槽推进，适合大量定时器且时间范围有界的场景。
- 简单时间轮存在范围与精度矛盾：槽越少精度越差，槽越多内存占用越大。
- 分层时间轮用多级轮盘覆盖大范围，类似时钟的秒、分、时，插入时按跨度选择层级。
- 时间轮对「取消」不友好，通常采用惰性删除，节点被摘除后仍需在扫描时判断有效性。
- 内核的低分辨率定时器使用时间轮，高精度定时器使用红黑树；两者的分工正对应精度与规模的权衡。
- 事件循环库常采用「最小堆加缓存」或分层时间轮，选择依据是定时器数量、超时跨度与取消频率。

### 12.12（场景）百万级连接的定时器如何组织？

- 每个连接一个 `timerfd` 会耗尽文件描述符并放大 `epoll` 的监视成本，不适合大规模场景。
- 常见做法是全局最小堆加惰性删除：超时时间更新时插入新节点，旧节点到期时比对版本号后丢弃。
- 分层时间轮适合超时时间集中在秒级到分钟级的场景，插入与删除接近常数时间。
- 定时器数量大时应避免每次事件都重新分配节点，使用对象池或侵入式链表降低分配开销。
- 批量处理到期定时器，把同一轮扫描到的超时连接集中关闭，减少系统调用次数。
- 精度要求提高时，可在时间轮之上叠加少量高精度定时器，处理临近到期的任务。
- 需要观测定时器数量与扫描耗时，避免单轮扫描过长阻塞事件循环。

### 12.13（陷阱）系统时间被调整后定时器如何变化？

- 基于 `CLOCK_REALTIME` 的相对定时器以真实时间为基准，系统时间向前跳变时可能立即到期，向后跳变时被推迟。
- 基于 `CLOCK_MONOTONIC` 的定时器不受时间设置影响，只受频率校正的缓慢影响。
- NTP 的步进（step）会直接改变 `CLOCK_REALTIME`，而 slew 以调整频率的方式渐进修正，影响较小。
- `timerfd` 的 `TFD_TIMER_CANCEL_ON_SET` 能在实时时钟被步进时让读取返回 `ECANCELED`，便于重新计算。
- POSIX 定时器基于实时时钟时同样受跳变影响，超时可能提前或延后，重试逻辑必须幂等。
- 定时任务应记录单调时钟的截止点，用绝对时间重新计算下一次触发，而不是累加固定间隔。
- 守护进程常监听时间变化事件或定期比对两个时钟，发现跳变后重建定时器。

### 12.14（辨析）CLOCK_MONOTONIC_RAW 与 CLOCK_MONOTONIC 的区别是什么？

- `CLOCK_MONOTONIC` 经过 NTP 的频率调整，长期看更接近真实时间，但相邻读数之间的间隔不严格等于硬件计数。
- `CLOCK_MONOTONIC_RAW` 直接暴露硬件计数器，不做频率校正，适合测量极短间隔与做时钟校准。
- 两者都不受系统时间设置影响，起点都是启动时刻附近，数值接近但不相等。
- 长时间运行后两者会因频率校正产生偏移，偏移量取决于晶振误差与校正幅度。
- 需要与其他机器或外部时间源比对时用 `CLOCK_MONOTONIC` 更合适；分析性能计数器与硬件事件时用 `CLOCK_MONOTONIC_RAW`。
- 虚拟化平台上原始计数器的稳定性取决于宿主机的时钟虚拟化方式，可能不如物理机可靠。
- 选择时钟应写入接口约定，混用两种时钟计算间隔会产生难以解释的偏差。

### 12.15 测量函数耗时的正确做法是什么？

- 用 `CLOCK_MONOTONIC` 取前后时间戳，差值即实际经过的时间；不要用 `CLOCK_REALTIME` 以免时间跳变干扰。
- 单次测量受调度、缓存与中断影响，应多次采样并报告中位数与尾部分位数，而不是只看一次结果。
- 测量本身的开销要计入评估：`clock_gettime` 走 vDSO 时开销小，但仍会污染被测代码的缓存与分支预测。
- 需要 CPU 时间而非实际时间时用 `CLOCK_PROCESS_CPUTIME_ID` 或 `CLOCK_THREAD_CPUTIME_ID`，可区分阻塞与计算。
- 编译器可能重排或删除没有可见副作用的计算，基准测试需通过屏障或输出结果阻止优化。
- 短于时钟分辨率或计时开销的区间无法可靠测量，应放大工作量或改用性能计数器。
- 生产环境可用 eBPF 或内核追踪减少侵入，但采样偏差需要在结论中说明。

### 12.16（实现）epoll_wait 的超时精度如何？

- 超时参数单位为毫秒，内部换算为纳秒，但接口只接受整毫秒，小于 1 毫秒的取值无法表达。
- 实现使用高精度定时器加松弛窗口，内核可以把唤醒推迟到松弛范围末端以减少功耗。
- `epoll_pwait2` 接受 `timespec`，提供纳秒字段，Linux 5.11 起可用。
- 返回 0 表示超时且无就绪描述符，返回 -1 并置 `EINTR` 表示被信号打断，此时超时是否已过需要重新计算。
- 超时是相对时间，循环中反复调用会累积误差，需要维护绝对截止点并换算剩余毫秒。
- 监视的描述符数量不影响超时精度，但事件处理耗时会计入下一轮的剩余时间。
- 大量短超时会增加系统调用与定时器操作次数，应合并超时或使用批量接口。

### 12.17（场景）周期任务的漂移如何消除？

- 相对睡眠每轮都会累加处理时间与调度延迟，长期运行后触发时刻持续后移。
- 消除方法是计算绝对截止点：`next += period`，每次用 `clock_nanosleep(TIMER_ABSTIME)` 或 `timerfd_settime(TFD_TIMER_ABSTIME)` 等到该时刻。
- 处理时间超过周期时，绝对时间方案会出现连续追赶，需要定义丢弃策略或动态调整周期。
- `timerfd` 的到期计数累积特性可以在错过多次后一次性得知，便于统计丢弃次数。
- 周期与外部系统的对齐（如整秒、整分钟）需要以日历时间为基准计算，同时防范时间跳变。
- 测量漂移应记录计划时刻与实际唤醒时刻的差值，观察分布而非单点。
- 多线程定时器共享同一截止点时，应由单一线程驱动并用条件变量分发，避免各自计时产生偏差。

### 12.18 CPU 时间与真实时间的区别是什么？

- `CLOCK_PROCESS_CPUTIME_ID` 统计进程所有线程消耗的 CPU 时间，阻塞、睡眠与等待 I/O 的时间不计入。
- `CLOCK_THREAD_CPUTIME_ID` 只统计当前线程，多线程进程中两者差异明显。
- 真实时间包含调度等待、页故障、I/O 与睡眠，CPU 时间通常远小于真实时间。
- 超时控制应使用真实时间，CPU 配额应使用 CPU 时间，混用会导致超时行为与预期不符。
- `RLIMIT_CPU` 以 CPU 秒数为单位，软限制到达发送 `SIGXCPU`，硬限制到达发送 `SIGKILL`。
- 虚拟化环境中的 CPU 时间统计可能包含 steal time，容器内的可见值取决于 cgroup 的统计口径。
- 分析性能瓶颈时同时采集两者，CPU 时间占比高说明计算密集，真实时间远大于 CPU 时间说明存在等待。

### 12.19（实现）timerfd 与 epoll 的边沿触发如何配合？

- 边沿触发要求描述符状态发生变化时才报告，`timerfd` 在到期计数从 0 变为非 0 时满足该条件。
- 事件处理中必须循环 `read` 直到返回 `EAGAIN`，否则计数值残留会让后续到期不再触发新事件。
- 读取时缓冲区必须是 8 字节，返回值不等于 8 时按错误处理，不能假设一次读取对应一次到期。
- 非阻塞标志应在创建时设置，避免处理线程在读取上意外阻塞。
- `EPOLLONESHOT` 适合把定时器处理分发到工作线程，处理完成后需要重新注册。
- 关闭描述符前应从 `epoll` 中注销，或依赖关闭自动移除，但多线程下自动移除存在时序窗口。
- `EPOLLERR` 与 `EPOLLHUP` 也需要处理，定时器描述符在异常情况下可能被提前唤醒。

### 12.20 容器中的时钟命名空间如何工作？

- time namespace 自 Linux 5.6 起可用，允许每个命名空间为 `CLOCK_MONOTONIC` 与 `CLOCK_BOOTTIME` 设置偏移。
- `CLOCK_REALTIME` 不在虚拟化范围内，所有命名空间共享同一日历时间，修改它仍然影响全局。
- 偏移只影响读取结果，不影响定时器的实际到期时刻，内核内部仍按真实时间排队。
- 容器运行时通过 `/proc/<pid>/timens_offsets` 写入偏移，进程迁移到其他命名空间后视角随之改变。
- 该机制用于容器迁移与检查点恢复，让应用认为单调时钟连续，避免超时逻辑被破坏。
- 依赖 `CLOCK_MONOTONIC` 做跨进程时间比较的程序在同一命名空间内保持一致，跨命名空间比较无意义。
- 排查时读取 `/proc/self/timens_offsets`，确认偏移是否被运行时设置，而不是假设单调时钟全局一致。

---

## 13. 内存映射与共享内存

### 13.1（辨析）mmap 的 MAP_SHARED 与 MAP_PRIVATE 有什么区别？

- `MAP_SHARED` 的修改对其他映射同一对象的进程可见，并最终回写到文件；`MAP_PRIVATE` 的修改触发写时复制，只对当前映射可见。
- 私有映射的写时复制以页为单位，首次写入产生缺页异常并分配新页，原来的文件页仍留在 page cache 中供其他进程读取。
- 私有映射的修改不会写回文件，进程退出后丢弃；共享映射的脏页由回写线程或 `msync` 写入。
- 未指定 `MAP_SHARED` 或 `MAP_PRIVATE` 时行为未定义，二者必须择一。
- `MAP_SHARED_VALIDATE` 在共享语义之上增加标志校验，未知标志会返回 `EOPNOTSUPP`，而不是被静默忽略。
- 共享映射上的读写需要考虑并发一致性，私有映射不需要，但私有映射无法用于进程间传递数据。
- 文件被截断时，共享映射与私有映射都可能触发 `SIGBUS`，与映射类型无关。

### 13.2（陷阱）msync 的必要性与返回值是什么？

- `msync` 把指定范围的脏页写回后备存储，`MS_SYNC` 等到写完才返回，`MS_ASYNC` 只安排回写。
- 不调用 `msync` 数据也不会立即丢失，脏页仍由内核回写线程在后台写入，`msync` 提供的是时机控制与持久化保证。
- 地址必须页对齐，长度不必对齐；不对齐返回 -1 并置 `EINVAL`，范围未映射返回 `ENOMEM`。
- 对匿名映射调用 `msync` 没有实际意义，成功返回并不代表数据进入了任何持久介质。
- `MS_INVALIDATE` 用于使其他映射的缓存副本失效，Linux 上的语义有限，跨平台代码不应依赖其行为。
- `msync` 只保证数据到达存储设备，不保证设备自身缓存的持久化，掉电语义需要额外的刷盘手段。
- 返回 0 表示请求被接受，部分页写失败可能通过后续的 `fsync` 或错误上报体现。

### 13.3（场景）mmap 写入之后何时真正落盘？

- 写入只修改 page cache 中的页并标记为脏，不会立即产生磁盘 I/O。
- 后台回写由内核线程按阈值触发：`dirty_writeback_centisecs` 控制唤醒间隔，`dirty_expire_centisecs` 控制脏页最长驻留时间。
- `dirty_ratio` 与 `dirty_background_ratio` 限制脏页占比，超过后台阈值时提前回写，超过硬阈值时写入方被阻塞。
- 调用 `msync(MS_SYNC)` 或 `fsync` 可以强制写入，`msync` 作用于映射范围，`fsync` 作用于整个文件。
- 存储设备自身的写缓存可能延迟真正的持久化，需要 `O_DIRECT`、`fsync` 与设备缓存策略配合。
- 崩溃一致性依赖文件系统的事务与日志，mmap 写入不提供跨页的原子性。
- 观测手段包括 `/proc/meminfo` 的 `Dirty` 字段、`/proc/vmstat` 的回写计数与 `bpftrace` 的块层追踪。

### 13.4 munmap 的语义与代价是什么？

- `munmap` 解除地址区间映射，区间内的页表项被清除，后续访问产生缺页异常或段错误。
- 共享映射的脏页不会因解除映射而丢失，仍留在 page cache 中等待回写；私有映射的修改直接丢弃。
- 解除映射需要遍历页表并刷新 TLB，其他线程共享同一地址空间时还要发送核间中断，开销与区间大小相关。
- 未对齐的地址返回 -1 并置 `EINVAL`；区间包含未映射部分时同样失败，不会部分解除。
- 进程退出时内核自动解除全部映射，显式调用主要用于长生命周期进程控制地址空间。
- 解除映射不保证数据已持久化，需要持久化时应先 `msync`。
- 频繁映射与解除会造成地址空间碎片与页表开销，长期运行的服务宜复用映射或使用池化策略。

### 13.5（辨析）匿名共享映射与 shm_open 加 mmap 有什么区别？

- `mmap(MAP_SHARED | MAP_ANONYMOUS)` 创建由 tmpfs 支撑的匿名对象，只能通过 `fork` 继承给子进程，无法被无亲缘关系的进程按名字打开。
- `shm_open` 在 tmpfs 上创建有名字的对象，其他进程可用同一名字打开，再 `mmap` 到各自地址空间。
- 匿名映射的生命周期止于最后一个映射解除，没有名字需要清理；命名对象需要 `shm_unlink`，否则会残留。
- 两者都由内存支撑，不经过块设备，掉电即丢失，不适合作为持久化存储。
- 匿名映射适合父子进程协作，命名对象适合独立启动的服务之间共享。
- `memfd_create` 提供第三种方式：无名字但有文件描述符，可通过 Unix 域套接字传递，兼具匿名性与跨进程能力。
- 三者的页分配都按需进行，首次写入才实际占用内存，`MAP_POPULATE` 可以提前触发分配。

### 13.6（场景）大页如何影响缺页与 TLB？

- 常规页为 4 KiB，一个 TLB 表项只覆盖 4 KiB；2 MiB 大页让单个表项覆盖 512 倍的范围，显著降低 TLB 缺失。
- 显式大页通过 `MAP_HUGETLB` 与 `MAP_HUGE_2MB` 申请，需要预先在 `/proc/sys/vm/nr_hugepages` 或启动参数中预留。
- 透明大页由内核自动合并，`madvise(MADV_HUGEPAGE)` 提示优先使用，`khugepaged` 在后台尝试合并。
- 大页的缺页代价更高：一次缺页要清零并建立 2 MiB 映射，首次访问的延迟上升。
- 内存碎片会阻止大页分配，`/proc/meminfo` 的 `HugePages_Free` 与 `compact_*` 计数可用于判断。
- 大页会放大内存占用与内部碎片，小对象密集的堆不适合无条件启用。
- 显式大页不可换出、不可回收，容量规划必须按峰值预留。

### 13.7（陷阱）访问 mmap 区域为什么会收到 SIGBUS？

- 文件被截断到小于映射长度后，访问已不存在的页触发 `SIGBUS`，这是最常见的来源。
- 映射长度超过文件大小时，最后一页中超出文件末尾的部分按零填充可读，再往后的整页访问触发 `SIGBUS`。
- 显式大页在缺页时无法分配到预留页，同样以 `SIGBUS` 报告，而不是返回错误码。
- `SIGBUS` 与 `SIGSEGV` 不同：前者表示地址合法但对象不可用，后者表示地址本身无效。
- 处理方式包括忽略该信号（默认终止进程）、为映射范围安装处理函数并 `longjmp` 跳出，或在设计上避免映射超过文件长度。
- 文件系统错误与设备 I/O 错误也可能在缺页路径上以 `SIGBUS` 呈现，需要结合 `dmesg` 判断。
- 避免该问题的方法是映射前用 `fstat` 取得真实大小，并在访问前确认文件不会被并发截断。

### 13.8（实现）POSIX 共享内存的生命周期由谁管理？

- `shm_open` 创建的名字存在于 tmpfs 中，内核对象在 `shm_unlink` 之后仍然存在，直到最后一个引用关闭或解除映射。
- 名字的删除与对象的释放是两件事，先 `unlink` 再使用描述符是常见做法，可避免残留。
- 进程崩溃不会自动清理命名对象，重启后可能打开到旧内容，初始化时需要显式清零或重建。
- 对象大小通过 `ftruncate` 设置，映射长度超过对象大小时访问会触发 `SIGBUS`。
- 权限由 `mode` 参数与 `fchmod`、`fchown` 控制，跨用户共享需要正确设置属主与权限位。
- 系统重启后 tmpfs 内容丢失，不能作为持久化存储；需要持久化时应落在真实文件系统上。
- 排查残留可使用 `ls -l /dev/shm`、`fuser -m` 与 `/proc/<pid>/maps`。

### 13.9（场景）共享内存上的进程间同步如何实现？

- 互斥量需要设置 `PTHREAD_PROCESS_SHARED`，并放置在共享映射内，普通互斥量的内部状态无法跨进程使用。
- 进程可能在持锁期间崩溃，应使用健壮互斥量（`PTHREAD_MUTEX_ROBUST`），加锁返回 `EOWNERDEAD` 时调用 `pthread_mutex_consistent` 修复状态。
- 条件变量同样需要进程间属性，且必须与互斥量位于同一共享区域，否则等待队列无法互通。
- 信号量可用 `sem_init` 的 `pshared` 参数设为 1，Linux 上由 futex 实现，适合计数型同步。
- 无锁结构依赖原子操作与内存序，要求共享区域按缓存行对齐，避免伪共享导致性能塌陷。
- 同步对象的初始化只能执行一次，通常用原子标志或文件锁保证，重复初始化会破坏等待队列。
- 跨进程的 futex 要求映射为共享且地址对齐，私有映射上的 futex 唤醒无效。

```cpp
struct shared_state {
    pthread_mutex_t mtx;
    pthread_cond_t cond;
    int ready;
};

// 初始化方：只执行一次
pthread_mutexattr_t ma;
pthread_mutexattr_init(&ma);
pthread_mutexattr_setpshared(&ma, PTHREAD_PROCESS_SHARED);
pthread_mutexattr_setrobust(&ma, PTHREAD_MUTEX_ROBUST);
pthread_mutex_init(&st->mtx, &ma);
```

### 13.10（陷阱）两个进程共享映射同一文件时会写时复制吗？

- `MAP_SHARED` 不触发写时复制，两个进程的页表指向 page cache 中的同一物理页，写入互相可见。
- 写时复制只发生在 `MAP_PRIVATE` 映射上，且只在写入时发生，读取始终共享文件页。
- 共享映射的并发写入没有原子性保证，跨页写入可能被观察到部分更新，需要显式同步。
- 同一进程内两次 `mmap` 同一文件区域也会得到共享页，除非其中一次使用私有映射。
- 页缓存是全局的，即使两个进程使用不同地址映射，物理页仍是同一份。
- 文件被替换（rename 或新建同名文件）不会影响已建立的映射，映射仍指向旧 inode。
- 需要隔离时使用私有映射或各自 `read` 到独立缓冲区。

### 13.11（实现）缺页异常与 page cache 之间是什么关系？

- 访问未建立页表项的地址触发缺页异常，内核区分匿名页、文件页与交换页，分别走不同路径。
- 文件页缺页时先在 page cache 中查找，命中则直接建立页表项，未命中则发起读 I/O 并等待。
- 命中 page cache 的缺页为次缺页（minor fault），需要读盘的为主缺页（major fault），后者延迟高两个数量级以上。
- 内核会做缺页预取（fault-around），一次缺页顺带建立相邻若干页的映射，提升顺序访问效率。
- 匿名页缺页时分配零页或从交换区读回，写时复制缺页则复制内容并改为可写。
- 页表项建立后再次访问不再陷入内核，直到页面被回收或映射改变。
- 观测手段包括 `/proc/<pid>/stat` 的 minflt 与 majflt、`perf stat -e page-faults`、`/proc/vmstat` 的 `pgfault`。

### 13.12 mmap 与 read/write 该如何取舍？

- `mmap` 避免用户态与内核态之间的数据复制，适合对大文件做反复随机访问。
- `read` 每次都有复制开销，但内存占用可控，适合流式处理与一次性读取。
- `mmap` 的代价是缺页异常、页表开销与 TLB 压力，小文件或小块随机读写时可能比 `read` 更慢。
- `mmap` 访问会触发 `SIGBUS`，错误处理比返回码复杂；`read` 的失败路径更直接。
- `read` 可以与 `io_uring`、`O_DIRECT` 配合实现异步与零复制，`mmap` 难以表达异步完成语义。
- 多进程共享只读文件时 `mmap` 能共享 page cache 页，节省内存；`read` 各自持有副本。
- 选择依据是访问模式、文件大小、错误处理要求与是否需要异步，而不是单看吞吐数字。

### 13.13（陷阱）munmap 之前没有 msync 会丢数据吗？

- 不会立即丢失，共享映射的脏页属于 page cache，解除映射后仍然存在，由回写线程写入磁盘。
- 掉电或内核崩溃时未回写的数据会丢失，`msync` 提供的是持久化时机而非唯一写入途径。
- 私有映射的修改本来就不写回，解除映射后直接丢弃，与是否调用 `msync` 无关。
- 需要确保数据落盘时应调用 `msync(MS_SYNC)` 或 `fsync`，并在返回后检查错误。
- 文件被删除但仍有映射时，数据随 inode 的最后一个引用消失，及时 `msync` 也无济于事。
- 依赖后台回写的程序在正常关机时通常安全，异常掉电时不安全，持久性要求高的场景必须显式同步。
- 测量落盘完成与否可观察 `/proc/meminfo` 的 `Dirty` 与 `Writeback` 是否归零。

### 13.14 MAP_POPULATE 与 MAP_LOCKED 的作用是什么？

- `MAP_POPULATE` 在映射建立时预读文件页并建立页表项，把缺页开销提前到 `mmap` 调用中。
- 预读只对文件映射有效，匿名映射上的效果取决于内核版本，不能假定内存已经分配。
- `MAP_LOCKED` 等价于对映射范围调用 `mlock`，阻止页面被换出与回收。
- 锁定受 `RLIMIT_MEMLOCK` 限制，超出时 `mmap` 失败或锁定被部分忽略，需检查返回值与 `/proc/<pid>/status` 的 `VmLck`。
- 锁定页会计入不可回收内存，过量使用会触发系统的 OOM 路径。
- `MAP_POPULATE` 会拖慢启动并一次性占用大量内存，只适合确定会全量访问的场景。
- 实时程序常用二者组合避免运行期缺页抖动，代价是启动时间与内存占用上升。

### 13.15 memfd_create 适合哪些用途？

- 创建无名字的内存文件，返回文件描述符，内容由 tmpfs 支撑，不需要文件系统路径。
- 通过 Unix 域套接字的 `SCM_RIGHTS` 传递描述符，接收方 `mmap` 后与发送方共享同一份页。
- 支持密封（`F_ADD_SEALS`），可禁止写入、增长与收缩，适合把不可变数据交给不受信任的进程。
- 常用于图形栈的缓冲区共享、容器运行时的内存传递与测试中的临时大对象。
- 与 `shm_open` 相比没有名字残留问题，描述符关闭即释放，生命周期清晰。
- 与匿名映射相比可以跨无亲缘关系的进程共享，且能控制可见性与权限。
- 需要设置 `MFD_CLOEXEC` 避免描述符泄漏到子进程，除非有意传递。

### 13.16（实现）shm_open 创建的对象存放在哪里？

- POSIX 共享内存对象位于 tmpfs，通常挂载在 `/dev/shm`，名字以斜杠开头且不能包含其他斜杠。
- 对象不经过块设备，读写直接作用于内存页，速度接近匿名内存。
- 大小通过 `ftruncate` 设置，未设置时长度为 0，映射后访问会触发 `SIGBUS`。
- tmpfs 占用系统的页缓存与交换空间，容量受挂载选项 `size` 限制，写满时返回 `ENOSPC`。
- `shm_unlink` 删除名字，已打开的描述符继续有效，最后一个引用释放后内存归还。
- 容器中 `/dev/shm` 默认大小常为 64 MiB，大块共享内存需要显式调大挂载参数。
- 文件权限与属主遵循常规文件语义，跨用户访问需要调整模式位。

### 13.17 大文件随机读应该用 mmap 还是 pread？

- `pread` 每次读取都有复制，但只触碰实际读取的区间，页表与 TLB 压力小。
- `mmap` 适合反复访问同一批页，页表项建立后无需系统调用，但随机跨页访问会造成大量缺页。
- 访问跨度大于内存容量时，`mmap` 依赖内核的页回收，可能引发频繁的换入换出。
- `pread` 可以精确控制每次读取的字节数与偏移，错误处理简单，适合按记录读取。
- `mmap` 的优势在顺序扫描与多进程共享只读数据，随机小读通常不占优。
- 需要异步 I/O 时 `pread` 更容易与 `io_uring` 结合，`mmap` 的缺页无法异步完成。
- 判断依据是访问局部性、并发进程数与内存预算，需要测量缺页率与系统调用次数。

### 13.18（陷阱）共享内存中能存放指针吗？

- 不同进程的映射地址通常不同，绝对指针在对方进程中指向无效地址或无关数据。
- 即使使用 `MAP_FIXED` 强制相同地址，也会破坏地址空间布局并与其他映射冲突，风险很高。
- 正确做法是存放相对偏移，使用时加上映射基址，偏移量与结构布局需要显式约定。
- 结构体对齐与字段宽度必须一致，32 位与 64 位进程混用时布局不同，指针宽度也不同。
- C++ 对象含虚表指针时，虚表地址在进程间不同，不能直接共享；应使用 POD 或显式序列化。
- 共享区域中的指针还可能因进程重启或重新映射而失效，偏移方案不受影响。
- 跨语言共享时还要固定字节序与填充规则，必要时使用显式打包结构。

```cpp
struct ring_header {
    uint64_t write_pos;   // 相对数据区起点的偏移，不是指针
    uint64_t read_pos;
    uint32_t capacity;
    uint32_t pad;
};
```

### 13.19 DAX 与 mmap 持久内存的关系是什么？

- DAX 让文件映射直接指向持久内存的物理地址，绕过 page cache，读写不产生数据复制。
- 需要文件系统与设备同时支持，挂载时启用 DAX 选项，且映射偏移与长度满足对齐要求。
- 绕过 page cache 意味着失去页缓存带来的预读与共享，随机小块访问的收益取决于设备延迟。
- 持久化顺序需要显式刷写，常用 `clwb` 与 `sfence` 保证写入顺序，仅调用 `msync` 不足以保证介质顺序。
- 崩溃一致性依赖应用设计的日志或影子写，文件系统只保证元数据的一致性。
- 不同内核对 DAX 的支持程度不同，设备与文件系统的组合需要查阅对应文档。
- 容量规划与普通内存不同，持久内存的带宽与延迟特征介于内存与固态盘之间。

### 13.20 如何排查共享内存泄漏？

- 统计 `/dev/shm` 下的对象与大小，残留的命名对象是最常见的泄漏来源。
- 检查进程的 `/proc/<pid>/maps` 与 `smaps`，观察映射数量与 `Rss` 是否持续增长。
- 对 SysV 共享内存使用 `ipcs -m` 与 `ipcrm`，关注 `nattch` 与 `key` 的残留。
- 描述符泄漏会阻止对象释放，用 `ls -l /proc/<pid>/fd` 与 `lsof` 确认是否仍持有 `/dev/shm` 下的文件。
- 代码层面确认 `shm_unlink` 在创建后立即调用，异常路径也要覆盖。
- 容器场景检查挂载参数与运行时是否清理了上一轮的对象，重建容器不会自动清空宿主机的 tmpfs。
- 长期监控 `/dev/shm` 使用量与进程映射数量，比事后排查更有效。

---

## 14. 进程生命周期与守护进程

### 14.1 fork 与 exec 的分工是什么？

- `fork` 复制当前进程得到子进程，子进程从 `fork` 返回处继续执行，父子进程共享代码段、各自拥有地址空间副本。
- `exec` 系列用新程序替换当前进程的地址空间、代码与数据，进程标识保持不变，调用成功后不返回。
- 二者组合实现「先复制再替换」：子进程在 `fork` 与 `exec` 之间可以修改描述符、环境变量、信号掩码与资源限制。
- `posix_spawn` 把这一组合封装为一次调用，在部分平台上可以避免复制页表，适合频繁创建进程的场景。
- `fork` 失败返回 -1 并置 `EAGAIN`（进程数或内存超限）、`ENOMEM`；`exec` 失败返回 -1，进程继续运行原程序。
- 只 `fork` 不 `exec` 的用法见于并行计算与守护进程，需要自行管理内存与描述符的复制语义。
- 现代内核的 `fork` 依靠写时复制，代价主要在页表复制与后续写入引发的缺页。

### 14.2 fork 之后子进程继承与重置了哪些状态？

- 继承的内容包括地址空间（写时复制）、打开的文件描述符（共享同一个文件偏移）、当前工作目录、根目录、资源限制、信号掩码、环境变量与进程组归属。
- 信号处理函数被重置为默认动作，被忽略的信号保持忽略；未决信号在子进程中清空。
- 定时器不继承，`alarm` 与 `setitimer` 的计时在子进程中清零，POSIX 定时器同样不继承。
- 锁的状态随地址空间一起被复制，持有锁的线程却不存在于子进程中，互斥量可能永远停留在加锁状态，这是多线程 `fork` 的主要风险。
- 子进程的进程标识不同，父进程标识在父进程退出后会改变，需要在需要时重新获取。
- 记录型锁（`fcntl` 的文件锁）不继承，`flock` 锁与打开的文件描述绑定，复制描述符后仍然有效。
- 资源使用统计在子进程中清零，CPU 时间与内存峰值重新累计。

### 14.3（场景）僵尸进程如何产生与回收？

- 子进程退出后，内核保留其退出状态与进程槽位，等待父进程读取，此时进程处于僵尸状态，显示为 `defunct`。
- 父进程调用 `wait` 或 `waitpid` 读取状态后，内核释放进程结构，僵尸消失。
- 僵尸不占用 CPU 与内存页，但保留进程结构与进程号，数量增长会耗尽进程表。
- 父进程先退出时，子进程被收养，退出后由收养者回收，不会长期残留。
- 父进程显式忽略 `SIGCHLD`（`SIG_IGN`）或设置 `SA_NOCLDWAIT` 时，子进程退出后自动回收，不产生僵尸。
- 容器中 PID 1 若不适当地回收子进程，僵尸会持续累积，需要在入口程序中实现回收逻辑。
- 排查手段是 `ps -eo pid,ppid,stat,comm` 过滤 `Z` 状态，结合父进程的回收逻辑定位。

### 14.4（陷阱）孤儿进程由谁收养？

- 父进程先于子进程退出时，子进程成为孤儿，被重新挂到收养者名下，父进程标识随之改变。
- 传统上收养者是 PID 1，即 init 或 systemd；容器中则是容器的 1 号进程。
- 通过 `prctl(PR_SET_CHILD_SUBREAPER, 1)` 可以把当前进程设为收养者，其所有后代中的孤儿都会挂到它名下。
- 收养者负责回收这些子进程，若不调用 `wait`，同样会产生僵尸。
- 孤儿进程继续运行，不会因为父进程退出而收到信号，除非终端会话整体结束。
- 守护进程常利用这一机制：两次 `fork` 后中间进程退出，孙进程被 PID 1 收养，从而脱离原会话。
- 调试时若发现大量进程的父进程为 1，需要确认是正常的守护化还是回收逻辑缺失。

### 14.5 两次 fork 为什么能脱离终端？

- 第一次 `fork` 后父进程退出，子进程调用 `setsid` 创建新会话并成为会话首进程，同时成为新进程组的组长。
- 会话首进程在首次打开终端设备时会获得控制终端，仍可能被终端信号影响，因此需要第二次 `fork`。
- 第二次 `fork` 产生的孙进程不再是会话首进程，按规则无法再获得控制终端，终端断开时不会收到 `SIGHUP`。
- 中间进程退出后，孙进程被收养，父进程标识变为 1 或 subreaper，与原终端彻底脱离。
- `setsid` 在调用者已是进程组组长时会失败并置 `EPERM`，所以必须由 `fork` 出的子进程调用。
- 脱离终端只是第一步，还需要重定向标准输入输出、切换工作目录、清除文件创建掩码。
- 该流程与 `daemon` 函数的行为一致，现代服务管理更倾向于由 systemd 负责守护化。

```cpp
pid_t pid = fork();
if (pid > 0) {
    _exit(0);              // 父进程退出，子进程被收养
}
if (setsid() == -1) {      // 新会话，脱离控制终端
    _exit(1);
}
if (fork() > 0) {          // 第二次 fork，孙进程不再是会话首进程
    _exit(0);
}
chdir("/");
```

### 14.6（场景）daemon 的标准步骤与 systemd 的推荐做法有什么区别？

- 传统步骤包括 `fork` 后父进程退出、`setsid`、再次 `fork`、切换工作目录到根、重设文件创建掩码、关闭或重定向标准描述符。
- 关闭全部描述符会误关日志与网络连接，应按范围关闭或使用 `close_range` 并保留必要描述符。
- 标准输出与标准错误应重定向到 `/dev/null` 或日志设施，否则写操作可能失败并触发 `SIGPIPE`。
- systemd 推荐程序保持前台运行，由服务管理器负责后台化、重启与日志收集，即 `Type=simple` 或 `Type=exec`。
- 自行守护化会破坏 systemd 的进程跟踪，需要使用 `Type=forking` 并配合 `PIDFile` 才能正确判断启动完成。
- 使用 `sd_notify` 报告就绪状态可以实现精确的就绪通知，避免靠轮询或固定延时判断。
- 选择哪种方式取决于服务管理器，容器中通常要求前台运行，由容器的 1 号进程承担回收职责。

### 14.7（陷阱）pid 文件的竞态如何避免？

- 先检查文件存在再创建存在竞态，两个实例可能同时通过检查，正确做法是用 `O_CREAT | O_EXCL` 原子创建。
- 更可靠的是对固定的锁文件加 `flock` 或记录锁，锁随进程退出自动释放，不存在陈旧锁问题。
- 写入 pid 时应先写临时文件再重命名，避免其他进程读到空文件或不完整内容。
- 进程崩溃后 pid 文件残留，启动时读到旧 pid 可能指向无关进程，需要通过进程名或启动时间二次校验。
- 文件锁在 `fork` 后的子进程中继承，需要明确由哪个进程持有，避免锁被意外释放。
- 容器与多实例部署下，pid 文件路径应位于实例独占的目录，共享路径会互相覆盖。
- 排查时用 `fuser` 或 `lsof` 确认文件是否被占用，再判断残留是否安全删除。

### 14.8 进程组、会话与控制终端之间是什么关系？

- 进程组是一组进程的集合，组标识等于组长进程的标识，信号可以发给整个进程组。
- 会话是一组进程组的集合，由 `setsid` 创建，会话首进程的标识即会话标识。
- 控制终端属于会话，一个会话最多有一个控制终端，终端的前台进程组接收键盘信号。
- 会话首进程首次打开终端设备且未指定 `O_NOCTTY` 时，该终端成为控制终端。
- 后台进程组读写控制终端会收到 `SIGTTIN` 或 `SIGTTOU`，是否停止取决于终端的 `tostop` 设置。
- `tcsetpgrp` 切换前台进程组，作业控制依赖这一机制在多个管道之间切换。
- 会话首进程退出或终端断开时，`SIGHUP` 发送到前台进程组，守护进程需要脱离这一路径。

### 14.9 终端断开时 SIGHUP 会发给谁？

- 终端挂断时内核向该终端的会话首进程发送 `SIGHUP`，并向前台进程组发送 `SIGHUP` 与 `SIGCONT`。
- 会话首进程通常是登录 shell，其退出又会向作业发送 `SIGHUP`，形成级联。
- 忽略 `SIGHUP` 可以让进程继续运行，但标准输入输出已失效，后续读写会失败。
- `nohup` 的实现就是忽略 `SIGHUP` 并把输出重定向到文件，同时把进程放入后台。
- 使用 `setsid` 或两次 `fork` 脱离控制终端后，终端断开不再影响该进程。
- systemd 管理的服务默认不在登录会话中，终端断开不会触发重启，除非显式配置。
- 排错时用 `ps -o pid,sid,pgid,tpgid` 确认会话与进程组归属，判断信号的实际接收者。

### 14.10（输出题）退出状态是如何编码与解读的？

- `exit(status)` 只保留低 8 位，`exit(256)` 等价于 0，`exit(-1)` 等价于 255。
- 父进程通过 `wait` 系列取得状态字，用 `WIFEXITED` 判断正常退出，用 `WEXITSTATUS` 取出低 8 位。
- 被信号终止时 `WIFSIGNALED` 为真，`WTERMSIG` 给出信号编号，`WCOREDUMP` 指示是否产生核心转储。
- shell 的 `$?` 对正常退出取退出码，对信号终止取 128 加信号编号，因此 130 通常表示被 `SIGINT` 终止。
- 停止与继续不属于退出状态，通过 `WIFSTOPPED` 与 `WSTOPSIG` 获取，需要 `WUNTRACED` 才会报告。
- 退出码 0 表示成功，非 0 的具体含义由程序约定，脚本中应区分「命令不存在」（126、127）与业务失败。
- 容器与编排系统按退出码判断重启策略，信号终止与正常失败的处理路径不同。

```cpp
pid_t pid = fork();
if (pid == 0) {
    _exit(3);
}
int status = 0;
waitpid(pid, &status, 0);
// WIFEXITED(status) 为真，WEXITSTATUS(status) 为 3
```

### 14.11（陷阱）waitpid 的 EINTR 与 WNOHANG 如何处理？

- 被信号打断时 `waitpid` 返回 -1 并置 `EINTR`，必须检查该错误并重新调用，不能当作「没有子进程」。
- 带 `WNOHANG` 时若无子进程状态变化返回 0，这是正常的「暂无」，与 -1 的含义不同。
- 没有可等待的子进程时返回 -1 并置 `ECHILD`，通常表示子进程已被回收或其他线程已处理。
- `pid` 为 -1 表示等待任意子进程，为正数表示等待指定子进程，为 0 表示等待同进程组的子进程。
- 信号处理函数中调用 `waitpid` 应使用 `WNOHANG` 循环，避免在信号上下文中阻塞。
- 多个线程同时等待时，状态只会被其中一个取走，需要集中回收或使用 `SIGCHLD` 加队列分发。
- 循环终止条件应是 `ECHILD`，而不是固定的子进程数量，后者在动态创建场景下不可靠。

### 14.12 SIGCHLD 的可靠处理方式是什么？

- `SIGCHLD` 默认动作是忽略，但与显式 `SIG_IGN` 不同：默认忽略仍会产生僵尸，显式忽略会自动回收。
- 信号可能合并，多个子进程同时退出时只递送一次，因此处理函数必须循环等待所有已退出的子进程。
- 处理函数中只应调用异步信号安全函数，`waitpid` 属于安全函数，`printf`、`malloc` 不属于。
- 注册时使用 `SA_NOCLDSTOP` 避免子进程停止与继续也触发信号，使用 `SA_RESTART` 是否合适取决于其他阻塞调用。
- 对已退出的子进程，处理函数中调 `waitpid(-1, &st, WNOHANG)` 直到返回 0 或 -1。
- 更稳妥的架构是用 `signalfd` 把信号转为文件描述符事件，在主循环中同步处理，避免信号上下文限制。
- 若同时使用线程，应把信号屏蔽到专用线程，防止递送目标随机导致回收竞态。

### 14.13（场景）多线程程序中 fork 有什么风险？

- `fork` 只复制调用线程，其他线程在子进程中消失，但它们持有的锁仍然处于加锁状态，子进程再次加锁会永久阻塞。
- `malloc` 的内部锁、标准库的 IO 锁、日志框架的锁都可能成为死锁点，子进程只能调用异步信号安全函数。
- 子进程在 `fork` 与 `exec` 之间执行任意代码都是危险的，正确做法是立即 `exec`。
- `pthread_atfork` 可以在 fork 前后加锁与解锁，但只能处理显式注册的锁，无法覆盖第三方库。
- 使用 `posix_spawn` 或在父进程中预先创建进程，可以规避大部分风险。
- 必须在多线程程序中 `fork` 时，应缩小窗口、避免内存分配，并在子进程中用 `_exit` 而非 `exit`。
- 该问题在日志、监控等后台线程存在的服务中尤其隐蔽，表现为偶发的子进程挂起。

### 14.14 vfork 与 posix_spawn 的取舍是什么？

- `vfork` 创建的子进程与父进程共享地址空间，父进程被挂起直到子进程调用 `exec` 或 `_exit`。
- 子进程在 `vfork` 之后修改变量会影响父进程，因此只能做极少量准备工作，规范要求立即 `exec`。
- `vfork` 避免了页表复制，在 `fork` 开销显著的平台上更快，但语义危险，现代代码不应直接使用。
- `posix_spawn` 由 C 库实现，内部可能使用 `CLONE_VFORK | CLONE_VM` 完成创建，再执行 `exec`。
- `posix_spawn` 支持文件动作与属性对象，可以原子地设置描述符、信号掩码与调度参数。
- 需要复杂准备工作（如 chdir、自定义栈、大量 fd 操作）时，`fork` 加 `exec` 更灵活。
- 在内存紧张或进程创建频繁的场景，`posix_spawn` 的失败路径与资源回收更清晰。

### 14.15（场景）exec 失败后应该如何退出？

- `exec` 失败返回 -1 并保留原进程，子进程必须输出错误并立即退出，否则会继续执行父进程的后续逻辑。
- 应使用 `_exit` 或 `_Exit` 而不是 `exit`，后者会刷新继承来的标准 IO 缓冲区，导致输出重复。
- `exit` 还会执行 `atexit` 注册的函数与静态对象析构，在子进程中可能触碰不一致的状态。
- 诊断信息应写入标准错误并带上 `errno` 的文本，父进程可据此判断是路径错误还是权限问题。
- 常见退出码约定为 127 表示命令未找到、126 表示不可执行，脚本与调用方依赖这一约定。
- 在 `fork` 与 `exec` 之间应避免任何可能失败的复杂操作，减少需要清理的状态。
- 使用 `posix_spawn` 时失败直接返回错误码，不需要在子进程中处理。

### 14.16 文件描述符的 CLOEXEC 竞态是什么？

- 未设置 `FD_CLOEXEC` 的描述符会被 `exec` 继承，可能泄漏给无关程序，造成资源占用与安全风险。
- 先 `open` 再 `fcntl(F_SETFD)` 之间存在窗口，其他线程在此期间 `fork` 并 `exec` 会继承该描述符。
- 解决办法是使用 `O_CLOEXEC` 在打开时原子设置，或使用 `accept4`、`pipe2`、`dup3` 等带标志的接口。
- 多线程程序无法用加锁彻底消除该窗口，原子标志是唯一可靠方案。
- 需要故意传递描述符时应在 `exec` 前显式清除该标志，并确认目标程序会接管。
- 排查泄漏可用 `lsof -p` 对比父子进程的描述符集合，或在目标程序中读取 `/proc/self/fd`。
- 标准输入输出与错误按约定保留，其余描述符默认应设置关闭标志。

### 14.17（输出题）父进程退出后子进程写标准输出会发生什么？

- 若标准输出是管道且读端已关闭，写操作触发 `SIGPIPE`，默认动作是终止进程，`write` 返回 -1 并置 `EPIPE`。
- 忽略 `SIGPIPE` 后，写操作返回 `EPIPE`，程序需要显式处理该错误，否则会在循环中反复失败。
- 若标准输出是终端，父进程退出不影响子进程写入，终端仍由会话持有，除非会话整体结束。
- 子进程若仍在原进程组且终端关闭，写入可能收到 `SIGTTOU`，取决于终端设置与是否后台。
- 守护进程重定向到 `/dev/null` 后写入总是成功，错误被静默丢弃，日志因此容易缺失。
- 服务端程序应统一处理 `EPIPE`，关闭连接并清理状态，而不是依赖默认信号终止。
- 判断依据是描述符类型与对端状态，可用 `fstat` 与 `getsockopt` 检查，但无法完全避免竞态。

### 14.18 进程退出时内核做了哪些事？

- `exit_group` 终止进程内所有线程，C 库的 `exit` 与 `_exit` 最终都调用它；只终止调用线程的是 `exit` 系统调用。
- C 库在系统调用前刷新标准 IO 缓冲区、执行 `atexit` 注册的函数、析构静态对象。
- 内核侧依次释放地址空间、关闭文件描述符、释放信号量、清理定时器与信号处理结构。
- 子进程被重新挂到收养者名下，父进程收到 `SIGCHLD`，进程进入僵尸状态等待回收。
- 退出状态与资源使用统计保存在进程结构中，`wait` 读取后才释放。
- 进程组的最后一个进程退出时，进程组消亡，终端的前台进程组可能被重置。
- 未回收的僵尸不占用内存页，但占用进程号，长期运行的服务必须保证回收路径完整。

### 14.19（场景）systemd 的 Type 如何影响服务就绪判断？

- `Type=simple` 在启动命令后立即认为服务已启动，适合前台运行且自行处理就绪的服务。
- `Type=exec` 等到 `exec` 成功才认为启动完成，能捕获路径错误与权限问题，多数服务应优先选择。
- `Type=forking` 等待父进程退出，并按 `PIDFile` 跟踪真实进程，适用于传统守护进程。
- `Type=notify` 要求程序调用 `sd_notify(0, "READY=1")`，就绪时刻最准确，需要链接对应库或直接写套接字。
- `Type=dbus` 适用于在总线上注册名字的服务，注册完成即视为就绪。
- 就绪判断错误会导致依赖服务过早启动，表现为连接被拒绝或初始化超时。
- 超时由 `TimeoutStartSec` 控制，超时后 systemd 终止服务并按重启策略处理。

### 14.20 如何可靠等待全部子进程？

- 使用 `waitpid(-1, &status, 0)` 循环，直到返回 -1 且 `errno` 为 `ECHILD`，表示没有更多子进程。
- 每次返回 -1 时先判断 `errno`，`EINTR` 应重试，`ECHILD` 才终止循环。
- 在信号处理函数中使用 `WNOHANG` 循环可以一次性回收多个已退出子进程，避免信号合并导致的遗漏。
- 需要区分具体子进程时，维护 pid 到业务对象的映射，回收后更新状态并触发后续流程。
- 主循环退出前应主动回收剩余子进程，必要时先发送终止信号再等待，避免残留僵尸。
- 使用 `signalfd` 或 `pidfd` 可以把子进程退出转为文件描述符事件，与事件循环统一处理。
- `pidfd_open` 与 `waitid(P_PIDFD)` 提供无竞态的等待方式，适合需要精确定位子进程的场景。

---

## 15. 资源限制与 cgroup

### 15.1 rlimit 与 cgroup 的区别是什么？

- rlimit 是每进程的限额，随 `fork` 继承、随 `exec` 保留，由内核在系统调用路径上直接检查。
- cgroup 是分组限额，按层级组织进程，由控制器在分配与回收路径上执行，可以覆盖一组进程的总量。
- rlimit 的典型对象是描述符数量、地址空间、CPU 秒数、核心转储大小；cgroup 的典型对象是 CPU 带宽、内存上限、IO 权重与进程数。
- rlimit 超限通常表现为系统调用失败并置 `errno`；cgroup 超限可能表现为节流、回收甚至杀死进程。
- rlimit 不能限制一组进程的合计用量，cgroup 不能表达单进程的地址空间上限，两者互补而非替代。
- 容器运行时同时使用两者：`--ulimit` 设置进程级限制，`--memory`、`--cpus` 设置 cgroup 级限制。
- 权限模型不同：提高硬限制需要 `CAP_SYS_RESOURCE`，调整 cgroup 需要对应层级的写权限。

### 15.2（场景）RLIMIT_NOFILE 的软硬限制如何调整？

- 软限制是当前生效值，硬限制是软限制的上限；非特权进程可以把软限制提高到硬限制，不能超过硬限制。
- `setrlimit(RLIMIT_NOFILE, ...)` 只能降低硬限制，除非拥有 `CAP_SYS_RESOURCE`。
- 提高硬限制还受 `/proc/sys/fs/nr_open` 约束，超过该值返回 `EPERM`。
- 子进程继承父进程的限制，服务应在启动早期调整，之后创建的文件描述符才能受益。
- systemd 服务通过 `LimitNOFILE` 设置，容器通过 `--ulimit nofile=` 设置，登录会话由 `/etc/security/limits.conf` 控制。
- 调大限制会增加内核为每个描述符预留的内存，过量设置没有收益。
- 检查方式为 `ulimit -n`（软限制）、`ulimit -Hn`（硬限制）与 `/proc/<pid>/limits`。

```cpp
struct rlimit rl;
if (getrlimit(RLIMIT_NOFILE, &rl) == 0) {
    rl.rlim_cur = rl.rlim_max;      // 软限制提到硬限制
    if (setrlimit(RLIMIT_NOFILE, &rl) == -1) {
        perror("setrlimit");         // EPERM：硬限制不足或超出 fs.nr_open
    }
}
```

### 15.3（陷阱）文件描述符上限有哪几个层次？

- 第一层是进程级 `RLIMIT_NOFILE`，决定单个进程能打开的描述符数量。
- 第二层是 `/proc/sys/fs/nr_open`，限制 `RLIMIT_NOFILE` 能达到的最大值。
- 第三层是系统级 `/proc/sys/fs/file-max`，限制全系统同时打开的文件对象总数。
- `/proc/sys/fs/file-nr` 的三个字段依次为已分配、已释放待复用、系统上限。
- 达到进程级限制时 `open` 返回 `EMFILE`，达到系统级限制时返回 `ENFILE`。
- 描述符数量不等于文件数量，`dup`、`fork` 与 `mmap` 都会增加引用计数而不增加新文件。
- 容器内的 `file-max` 是宿主机全局值，多个容器共享同一上限。

### 15.4 RLIMIT_AS 与 RLIMIT_DATA 的区别是什么？

- `RLIMIT_AS` 限制进程地址空间的总大小，包括代码段、堆、栈、共享库与所有映射，超限时 `mmap` 或 `brk` 返回 `ENOMEM`。
- `RLIMIT_DATA` 传统上限制 `brk` 管理的堆，Linux 4.7 起还把部分私有可写映射计入，具体范围随版本变化。
- 地址空间是虚拟量，与物理内存占用无关；限制 `RLIMIT_AS` 不能防止实际内存被耗尽。
- 线程栈与共享库映射计入 `RLIMIT_AS`，设置过小时程序可能在加载阶段就失败。
- `RLIMIT_DATA` 的口径随内核版本变化，用它约束以 `mmap` 为主的分配器并不可靠。
- 需要限制实际内存时应使用 cgroup 的 `memory.max` 或 `RLIMIT_RSS`（Linux 上不生效）。
- 排查时读取 `/proc/<pid>/status` 的 `VmSize` 与 `VmData`，区分虚拟大小与数据段大小。

### 15.5（场景）cgroup 内存上限触发 OOM 时如何处理？

- cgroup v2 的 `memory.max` 是硬上限，超过且回收失败时在组内触发 OOM killer。
- `memory.high` 是软上限，超过后对组内进程节流并触发回收，不等同于 OOM。
- 组内目标仍按 `oom_badness` 评分选择，`memory.oom.group` 置 1 时整组一起终止，适合容器。
- `memory.events` 的 `oom` 与 `oom_kill` 计数用于判断是否发生过组内 OOM，`memory.events.local` 只看本层。
- 容器运行时通常把 `memory.max` 设为容器限额，并在宿主机保留系统预留内存，避免全局 OOM。
- 用户态可监控 `memory.current` 与 `memory.events` 提前告警，或调低 `memory.high` 施加背压。

### 15.6 cgroup v2 的层级与控制器如何启用？

- v2 采用单一层级，挂载点通常为 `/sys/fs/cgroup`，所有控制器共用一棵树。
- 可用控制器列在 `cgroup.controllers`，父节点通过 `cgroup.subtree_control` 把控制器下放给子节点。
- 只有启用了对应控制器的子节点才出现相应接口文件，未启用时创建子目录不会自动获得配额能力。
- 非根节点默认不能同时存放进程与子节点（no internal process 约束），进程应放在叶子节点。
- 委派通过把子目录的属主改为普通用户实现，用户可以在自己的子树内创建层级并启用控制器。
- 查看进程归属读取 `/proc/<pid>/cgroup`，查看层级结构读取 `/sys/fs/cgroup/cgroup.controllers` 与各级 `cgroup.subtree_control`。
- 控制器包括 `cpu`、`memory`、`io`、`pids`、`cpuset`、`hugetlb`，启用顺序自顶向下。

### 15.7（场景）cpu.max 的配额与节流如何影响延迟？

- `cpu.max` 的格式为「配额 周期」，单位微秒，周期默认 100000，即 100 毫秒。
- 配额在周期内累计消耗，用尽后组内任务被节流，直到下一个周期开始才能继续运行。
- 节流带来的停顿最长接近一个周期，对延迟敏感的服务表现为周期性抖动。
- `cpu.stat` 的 `nr_throttled` 与 `throttled_usec` 可以直接确认是否发生节流。
- 缩短周期能减小单次停顿，但增加调度开销；增大周期让突发更平滑，停顿更长。
- `cpu.max.burst` 允许在空闲周期积累额度，缓解短时突发被立即节流的问题。
- 若目标是按比例分配而非硬上限，应使用 `cpu.weight`，它不会产生节流停顿。

### 15.8（陷阱）memory.max 与 memory.high 的行为差异是什么？

- `memory.max` 是硬上限，超过时先强制回收，回收失败则触发 cgroup OOM 杀死进程。
- `memory.high` 是软上限，超过时对分配进行节流并加回收压力，不直接杀死进程。
- `memory.low` 与 `memory.min` 用于保护，标记为受保护的内存优先不被回收。
- `memory.events` 记录 `high`、`max`、`oom`、`oom_kill` 的累计次数，是判断触发了哪条路径的直接证据。
- 写入 `memory.max` 时若当前用量已超限，内核会同步尝试回收，写入本身可能阻塞。
- `memory.high` 设置过低会造成持续节流，表现为分配变慢而非失败，容易误判为性能问题。
- 容器场景通常同时设置两者，用 high 提前施压、用 max 兜底。

### 15.9 memory.current 中包含哪些内容？

- `memory.current` 是组内匿名页、文件页缓存与内核内存的合计用量，不等于进程的常驻内存之和。
- 文件页缓存属于可回收部分，用量接近上限时内核会优先丢弃干净的页缓存，因此 current 高不一定触发 OOM。
- `memory.stat` 细分 `anon`、`file`、`slab`、`sock`、`shmem` 等字段，可判断内存去向。
- 共享内存与 tmpfs 计入 `shmem`，多个组映射同一对象时按映射计入各自组，统计可能重复。
- 页表、内核栈与套接字缓冲区计入 `kernel` 相关字段，容器内存超限有时来自这些不可回收部分。
- `memory.current` 的读取是瞬时值，监控应采集 `memory.peak` 或按时间序列观察。
- 与 `RSS` 的口径不同，`RSS` 按进程统计且包含共享页，cgroup 统计按组归属，两者不应直接比较。

### 15.10（场景）容器内存未超过限制却被 OOM 杀死，原因有哪些？

- `memory.current` 包含页缓存，若工作负载大量读写文件，缓存会把用量推高到上限附近。
- 内核内存（页表、套接字缓冲、slab）不可回收，达到上限时同样触发 OOM。
- 进程内部的虚拟内存预留不影响 cgroup 统计，但实际触碰的页会计入，稀疏访问的大映射容易被低估。
- 多个容器共享同一 cgroup 父节点时，父节点的上限可能先于子节点触发。
- `memory.swap.max` 设为 0 时没有交换空间缓冲，瞬时峰值直接触发 OOM。
- 检查 `memory.events` 与 `dmesg` 中的 cgroup 记录，确认是组内 OOM 还是全局 OOM。
- 监控应同时采集 `memory.current`、`memory.stat` 与 `memory.pressure`，仅看百分比容易漏判。

### 15.11 cgroup v1 与 v2 的差异是什么？

- v1 为每个控制器建立独立层级，进程在不同控制器树中的位置可以不同，管理复杂且容易出现不一致。
- v2 使用单一层级，所有控制器共享同一棵树，进程归属唯一。
- v1 的 CPU 配额接口为 `cpu.cfs_quota_us` 与 `cpu.cfs_period_us`，v2 合并为 `cpu.max`。
- v1 的内存控制器区分 `memory.limit_in_bytes` 与 `memory.memsw.limit_in_bytes`，v2 用 `memory.max` 与 `memory.swap.max` 表达。
- v1 的 `memory.kmem` 系列接口在 v2 中取消，内核内存统一计入 `memory.current`。
- v2 引入 PSI 与 `memory.high` 等机制，压力信号与软限制的表达更完整。
- 混合模式下部分控制器仍挂在 v1，排查前应确认挂载方式与 `/proc/<pid>/cgroup` 的内容。

### 15.12（场景）文件描述符泄漏如何定位？

- 统计 `/proc/<pid>/fd` 下的条目数量，与业务预期和 `RLIMIT_NOFILE` 对比，判断是否持续增长。
- 用 `ls -l /proc/<pid>/fd` 观察描述符指向的对象，套接字、管道与普通文件的异常比例能指向具体模块。
- `lsof -p` 提供更完整的类型与状态信息，`ss -p` 可确认套接字归属。
- 用 `strace -f -e trace=openat,close,dup` 追踪打开与关闭的配对，注意多线程下输出交错。
- 代码层面检查所有失败路径是否关闭描述符，特别是 `accept`、`open`、`pipe` 之后的错误分支。
- RAII 封装可以把关闭动作绑定到作用域，但要注意 `fork` 与 `exec` 时的继承语义。
- 长期监控 `/proc/sys/fs/file-nr` 的已分配数量，可以在耗尽前发现趋势。

### 15.13（陷阱）RLIMIT_NPROC 限制的是进程还是线程？

- 限制对象是真实用户标识下的任务数，Linux 中线程同样是任务，因此线程也计入。
- 达到限制时 `fork`、`clone` 与 `pthread_create` 失败，返回 `EAGAIN`。
- 计数按真实用户标识统计，与有效用户标识无关，切换用户运行的进程归属原用户。
- 该限制在容器中容易误伤：同一用户运行的多个服务共享配额，线程数增长会触发创建失败。
- 拥有 `CAP_SYS_RESOURCE` 或 `CAP_SYS_ADMIN` 的进程可以绕过该检查。
- 需要限制进程数而非线程数时，cgroup 的 `pids.max` 更直接，且按组统计。
- 排查 `EAGAIN` 时应同时检查 `RLIMIT_NPROC`、`pids.max` 与内核线程数上限。

### 15.14 RLIMIT_CORE 与核心转储的关系是什么？

- `RLIMIT_CORE` 限制核心文件的最大字节数，设为 0 时禁止生成，超限的文件被截断。
- 核心文件的命名与存放位置由 `/proc/sys/kernel/core_pattern` 决定，可以包含进程名、pid 与信号编号。
- 管道形式的 core_pattern 可以把转储交给外部程序处理，常用于统一收集与压缩。
- `RLIMIT_FSIZE` 同样会截断核心文件，两个限制取较小值生效。
- `coredump_filter` 控制哪些内存区域被写入，匿名私有页与文件映射页可以分别排除。
- 容器中核心转储默认可能被禁用，需要在运行时配置 `ulimit -c` 与 core_pattern。
- 分析转储需要匹配的可执行文件与调试符号，版本不一致会导致回溯失真。

### 15.15（场景）CPU 配额导致延迟抖动，如何缓解？

- 确认节流：读取 `cpu.stat` 的 `nr_throttled` 与 `throttled_usec`，结合业务延迟的时间分布判断是否同周期。
- 提高配额或改用 `cpu.weight`，让调度按比例分配而不是硬性截断。
- 缩短 `cpu.max` 的周期可以减小单次停顿上限，代价是调度与记账开销增加。
- 设置 `cpu.max.burst`，为短时突发保留额度，减少周期边界处的排队。
- 把延迟敏感的线程放在独立 cgroup 或独立核，避免与批处理任务共享配额。
- 减少锁竞争与不必要的唤醒，配额耗尽往往由短时大量可运行线程放大。
- 观测 `cpu.pressure` 的 `some` 与 `full` 指标，可以区分「有任务等待」与「全部任务被阻塞」。

### 15.16 memory.oom.group 与 PSI 的作用是什么？

- `memory.oom.group` 设为 1 时，cgroup 内发生 OOM 会杀死组内全部进程，而不是挑选单个目标。
- 整组杀死避免了部分进程存活导致的共享状态不一致，适合一个容器对应一个服务的部署方式。
- 该设置只影响组内 OOM 的选择方式，不改变全局 OOM 的行为。
- PSI 提供 `cpu`、`memory`、`io` 三类压力指标，位于 `/proc/pressure/` 与各级 cgroup 目录下。
- 每类指标包含 `some` 与 `full` 两行，给出最近 10 秒、60 秒、300 秒的平均停滞占比与累计微秒数。
- `memory` 的 `full` 表示所有任务都因内存回收而停滞，是判断内存压力的强信号。
- 基于 PSI 做告警比基于用量百分比更贴近实际影响，可以在 OOM 之前触发扩容或限流。

### 15.17（陷阱）overcommit 与 OOM 之间是什么关系？

- `/proc/sys/vm/overcommit_memory` 为 0 时按启发式规则估算，允许适度超量分配。
- 为 1 时总是允许分配，虚拟内存可以远超物理内存与交换区之和，OOM 风险最高。
- 为 2 时禁止超量，分配受 `CommitLimit` 约束，`mmap` 可能直接返回 `ENOMEM`。
- 无论哪种模式，物理页都在首次写入时才分配，OOM 发生在缺页路径而不是 `malloc` 返回时。
- 因此 `malloc` 成功不代表内存可用，程序需要对分配后的触碰失败有预案。
- `CommitLimit` 由交换区大小与 `overcommit_ratio` 计算，调整参数会改变可用承诺量。
- 容器中的 OOM 首先由 cgroup 上限触发，与全局 overcommit 策略相互独立。

### 15.18（场景）如何为子进程设置限制？

- 在 `fork` 之后、`exec` 之前调用 `setrlimit`，限制随 `exec` 保留并作用于新程序。
- 子进程只能降低硬限制，若需要提高到超过父进程的硬限制，父进程必须先行调整。
- `prlimit` 可以在运行期修改其他进程的限制，需要 `ptrace` 权限或相同用户身份。
- 设置 `RLIMIT_NOFILE` 之后再打开日志与套接字，顺序错误会让新限制不生效。
- 需要按组限制时使用 cgroup，把子进程写入目标组的 `cgroup.procs`，再设置 `memory.max`、`cpu.max` 与 `pids.max`。
- systemd 服务用 `LimitNOFILE`、`MemoryMax`、`CPUQuota` 等指令统一表达两类限制。
- 失败处理要区分 `EINVAL`（参数非法）与 `EPERM`（超出硬限制），后者需要调整父进程或权限。

```cpp
pid_t pid = fork();
if (pid == 0) {
    struct rlimit rl = {1024, 1024};
    setrlimit(RLIMIT_NOFILE, &rl);      // 在 exec 前收紧限制
    execl("/usr/bin/server", "server", nullptr);
    _exit(127);
}
```

### 15.19 RLIMIT_STACK 与线程栈有什么关系？

- `RLIMIT_STACK` 决定主线程栈的最大可增长尺寸，栈按需增长，触及上限时收到 `SIGSEGV`。
- 线程栈在创建时通过 `mmap` 一次性保留固定大小，默认为 8 MiB，由 `pthread_attr_setstacksize` 调整。
- 线程栈不受 `RLIMIT_STACK` 约束，而受 `RLIMIT_AS` 与可用内存约束，这是常见的误解来源。
- 线程栈末尾设有保护页，溢出时立即触发段错误，而不是悄悄破坏相邻映射。
- 主线程栈溢出与线程栈溢出的诊断方式不同，前者看 `ulimit -s`，后者看创建时指定的尺寸。
- 递归深度大的代码应显式评估栈需求，或改用显式栈结构避免依赖默认值。
- 容器中 `ulimit -s` 通常继承自运行时，过大的值会放大每个线程的虚拟内存占用。

### 15.20（场景）容器中的 ulimit 从哪来？

- 容器进程的限制继承自运行时创建进程时的设置，`docker run --ulimit` 与 Kubernetes 的对应字段可以覆盖。
- 未显式指定时，默认值来自容器运行时的配置或守护进程自身的限制，随版本与运行时变化。
- 容器内的 `/proc/<pid>/limits` 显示实际生效值，是排查的第一手依据。
- 提高硬限制需要容器运行时具备相应能力，普通用户无法在容器内自行突破。
- systemd 管理的容器，守护进程的 `LimitNOFILE` 会影响其创建的所有容器，表现为同一配置在不同机器上行为不同。
- 容器内修改 `/etc/security/limits.conf` 通常无效，该文件由登录会话的 PAM 模块读取。
- 需要按容器隔离总量时使用 cgroup 的 `pids.max` 与 `memory.max`，而不是依赖 per-process 的 ulimit。

---

## 16. 容器与命名空间

### 16.1 namespace 提供了哪些隔离维度？

- Linux 提供八类命名空间：挂载（mnt）、PID、网络（net）、IPC、UTS、用户（user）、cgroup 与时间（time，Linux 5.6 起）。
- 每个进程的 `task_struct` 通过 `nsproxy` 指向所属命名空间的集合，`clone(2)` 与 `unshare(2)` 以 `CLONE_NEW*` 标志创建新的命名空间。
- 隔离的对象是内核全局资源的视图，系统调用表仍然共享，内核代码路径不因命名空间而改变。
- PID 命名空间只隔离 pid 的编号空间与可见性，父命名空间可以看到子命名空间中的进程，反之不成立。
- 命名空间不负责资源配额，CPU、内存与 IO 的计量和限制由 cgroup 完成。
- 进入已有命名空间用 `setns(2)`，需要目标命名空间中的相应能力；对 PID 命名空间的 `setns` 只影响之后创建的子进程。

### 16.2（辨析）chroot 与 pivot_root 有什么区别？

- `chroot(2)` 只修改进程的根目录与路径解析起点，不创建新的挂载命名空间，挂载表仍是全局的。
- `chroot` 不改变当前工作目录。工作目录若在旧根之外，相对路径仍可访问旧根下的文件，因此通常需要紧接着调用 `chdir("/")`。
- `chroot` 的逃逸路径是已持有的目录文件描述符：以 `fchdir` 切到旧根之外再 `chroot(".")` 即可脱离，前提是仍持有相应能力。
- `pivot_root(2)` 交换当前根挂载与 `new_root`，旧根被移动到 `put_old`，随后可以卸载，整个操作限定在挂载命名空间内。
- `pivot_root` 要求 `new_root` 与 `put_old` 是挂载点、`new_root` 不能与当前根在同一挂载上、`put_old` 必须位于 `new_root` 之下，否则返回 `EINVAL`。
- `chroot` 需要 `CAP_SYS_CHROOT`，`pivot_root` 需要 `CAP_SYS_ADMIN`。两者都只有配合 `CLONE_NEWNS` 才能限制影响范围。

### 16.3 capabilities 如何划分特权？

- root 的权限被拆成若干项能力，例如 `CAP_NET_ADMIN`、`CAP_SYS_PTRACE`、`CAP_DAC_OVERRIDE`、`CAP_SYS_ADMIN`。
- 能力按线程维护，包含 permitted、effective、inheritable、bounding 与 ambient 五个集合，ambient 自 Linux 4.3 起提供。
- `execve` 时按固定公式重新计算：新 permitted 集合由文件 permitted 与线程 bounding 的交集、线程 inheritable 与文件 inheritable 的交集、以及 ambient 集合合并得到。
- 文件能力存放在 `security.capability` 扩展属性中，用 `setcap(8)` 设置、`getcap(8)` 读取。
- `prctl(PR_SET_NO_NEW_PRIVS)` 禁止 `execve` 通过 setuid 位或文件能力获得新特权，是容器内降权的常见前提。
- `CAP_SYS_ADMIN` 覆盖挂载、命名空间、设备与大量管理操作，粒度接近 root，容器默认策略通常直接丢弃。

### 16.4 seccomp 的过滤模型是什么？

- `seccomp(SECCOMP_SET_MODE_FILTER)` 安装一段经典 BPF 程序，输入是 `seccomp_data`，包含系统调用号、架构、指令指针与六个参数。
- 返回值决定动作：`SECCOMP_RET_ALLOW`、`SECCOMP_RET_ERRNO`、`SECCOMP_RET_TRAP`、`SECCOMP_RET_TRACE`、`SECCOMP_RET_KILL_PROCESS`、`SECCOMP_RET_USER_NOTIF`（Linux 5.0 起）。
- `SECCOMP_RET_ERRNO` 让系统调用直接返回指定错误码，不需要进入具体实现，是拦截的主要手段。
- 多个过滤器按安装顺序组成链，结果取最严格的动作，后装的过滤器无法放宽先前过滤器的限制。
- 装载过滤器要求线程已设置 `no_new_privs`，或调用者具有 `CAP_SYS_ADMIN`；`SECCOMP_FILTER_FLAG_TSYNC` 可把过滤器同步到整个线程组。
- 参数只能按值比较，无法解引用指针，因此不能按路径过滤文件访问，只能按系统调用号与标量参数限制。
- 每次系统调用都要执行过滤器指令，开销与过滤器长度相关；较新的内核会为每个线程缓存过滤结果，重复的调用号与参数组合可以命中。

### 16.5 容器运行时分几层？

- 底层运行时按 OCI 运行时规范创建容器进程并管理生命周期，代表实现是 `runc` 与 `crun`，输入是 OCI bundle，即 `config.json` 加 rootfs。
- 高层运行时负责镜像、快照与网络，调用底层运行时启动容器，代表实现是 `containerd` 与 `CRI-O`。
- 命令行工具（Docker、Podman）在高层运行时之上提供构建、镜像管理与用户接口。
- `runc` 的启动路径大致为：解析 bundle，创建同步管道，以 `clone` 带命名空间标志创建 init 进程，在子进程中执行 `pivot_root`、挂载 `/proc`、设置 `no_new_privs` 与 seccomp，最后写入 cgroup 并 `execve` 用户程序。
- 容器状态记录在 `state` 目录中，`create`、`start`、`kill`、`delete` 构成生命周期接口。
- 安全边界仍由内核提供，Kata Containers 与 gVisor 用轻量虚拟机或用户态内核替换共享内核模型。

### 16.6（场景）容器内看到的 CPU 数量与内存接近宿主机，程序却明显变慢，如何排查？

- `/proc/cpuinfo` 与 `/sys/devices/system/cpu` 默认反映宿主机，命名空间不虚拟化这些文件，容器内看到的核数可能远大于可用配额。
- 读取 cgroup 的 `cpu.max`（v2）或 `cpu.cfs_quota_us` 与 `cpu.cfs_period_us`（v1）得到实际配额，`cpu.stat` 的 `nr_throttled` 与 `throttled_usec` 反映限流次数与时长。
- `sched_getaffinity` 受 cpuset 控制器影响，与配额是两套机制：前者限制可运行的 CPU 集合，后者限制时间片总量。
- 按 `sysconf(_SC_NPROCESSORS_ONLN)` 决定线程数的运行时会按宿主机核数创建线程，配额受限时加剧上下文切换与限流。
- 内存方面 `/proc/meminfo` 同样反映宿主机，应读 `memory.max`、`memory.current` 与 `memory.events` 的 `oom` 计数。
- 结论是把配额当作容量上限来判断，不要以容器内可见的核数与内存总量为依据。

### 16.7 文件系统隔离依赖哪些机制？

- 挂载命名空间提供独立的挂载表，配合 `pivot_root` 或 `chroot` 改变根目录视图。
- 镜像层用 overlayfs 叠加：`lowerdir` 多层只读，`upperdir` 承接写入，`workdir` 供内部使用，合并视图为 `merged`。
- 挂载选项承担部分安全职责：`MS_RDONLY`、`nosuid`、`nodev`、`noexec` 分别限制写入、setuid 位、设备节点与可执行映射。
- `/proc` 需要在容器内重新挂载，可用 `hidepid` 与 `subset=pid` 减少暴露；`/sys` 通常以只读方式挂载。
- 删除下层文件时在上层生成 whiteout（字符设备 0/0），删除目录则用 `trusted.overlay.opaque` 扩展属性标记为不透明。
- 失败路径集中在 `EBUSY`（仍有进程使用挂载点）与 `EINVAL`（overlayfs 对下层数量与目录位置有限制）。

### 16.8（辨析）namespace 与 cgroup 的分工是什么？

- 命名空间改变进程能看到什么，cgroup 改变进程能用多少，两者正交，可以单独使用。
- cgroup v1 允许每类控制器挂载成独立层级，v2 改为单一层级，控制器通过 `cgroup.subtree_control` 逐级下发。
- 常用控制器包括 `cpu`、`memory`、`io`、`pids`、`cpuset` 与 `hugetlb`，限制值以文件读写方式设置。
- `memory.max` 触发回收失败后由 OOM killer 选择牺牲者，选择依据是 `oom_score`，可用 `oom_score_adj` 调整。
- `pids.max` 限制任务数，达到上限后 `fork` 返回 `EAGAIN`，这是限制进程数失控增长的主要手段。
- cgroup 命名空间只虚拟化 `/proc/self/cgroup` 的视图，不改变资源的归属。

### 16.9 user namespace 的映射规则与安全边界是什么？

- `/proc/PID/uid_map` 与 `gid_map` 定义内部 id 到外部 id 的映射，写入一次后不可修改；Linux 4.15 起最多 340 行，此前为 5 行。
- 在用户命名空间内以 `uid 0` 运行只在该命名空间内具备特权，对父命名空间中的资源仍需相应授权。
- 文件系统报告的 uid 依赖调用者所在的用户命名空间，无法映射的 id 显示为 `overflowuid` 与 `overflowgid`，通常为 65534。
- 创建用户命名空间后，setuid 程序与文件能力默认不再生效，需显式授权才可保留，这一限制降低了提权面。
- 非特权用户创建用户命名空间扩大了内核攻击面，部分发行版通过 `kernel.unprivileged_userns_clone` 或 `user.max_user_namespaces` 限制。
- 在用户命名空间中获得 `CAP_SYS_ADMIN` 即可在该命名空间内挂载 `proc`、`tmpfs` 与 overlayfs（具体范围由内核版本决定），这也是 rootless 容器的基础。

### 16.10（陷阱）PID 命名空间中的 1 号进程有哪些特殊行为？

- 命名空间内的 1 号进程若未安装处理函数，收到的信号会被丢弃；来自祖先命名空间的 `SIGKILL` 与 `SIGSTOP` 仍然生效。
- 命名空间内的孤儿进程被 1 号进程收养，而不是宿主机的 init。1 号进程不调用 `wait` 就会积累僵尸进程。
- 1 号进程退出时，内核向该命名空间内所有进程发送 `SIGKILL`，命名空间随之销毁。
- `/proc` 中的 pid 视图按命名空间裁剪，`/proc/PID/status` 的 `NSpid` 行按从外到内的顺序列出各层 pid。
- `clone(CLONE_NEWPID)` 创建的新命名空间只对子进程生效，调用者本身仍留在原命名空间。
- 判断进程是否位于独立 PID 命名空间的直接方法是比较 `/proc/self/ns/pid` 与 `/proc/1/ns/pid` 的链接目标。

### 16.11 如何在容器内降低权限？

- 以非 root 用户运行，在镜像中显式设置用户，并以只读根文件系统启动。
- 丢弃不需要的能力，只保留绑定低端口等必需项，禁止 `--privileged` 与宿主命名空间共享。
- 启用默认 seccomp 配置与 LSM（AppArmor 或 SELinux），两者分别限制系统调用与路径级访问。
- 设置 `no_new_privs`，阻止 `execve` 借助 setuid 位或文件能力提权。
- 限制设备访问（device cgroup）与挂载点，`/proc`、`/sys` 尽量只读。
- 运行时核对 `/proc/self/status` 中的 `CapEff`、`NoNewPrivs`、`Seccomp` 字段，确认策略真正生效。

### 16.12（实现）用 unshare 与 mount 建立一个最小隔离环境？

```cpp
if (unshare(CLONE_NEWNS | CLONE_NEWUTS | CLONE_NEWPID) == -1)
    return -1;                        // 需要 CAP_SYS_ADMIN 或用户命名空间
if (mount("", "/", nullptr, MS_REC | MS_PRIVATE, nullptr) == -1)
    return -1;                        // 先切断向宿主的传播
if (mount("proc", "/proc", "proc", 0, nullptr) == -1)
    return -1;
pid_t pid = fork();                   // CLONE_NEWPID 只对子进程生效
if (pid == 0) {
    chdir("/");
    execl("/bin/sh", "sh", nullptr);
    _exit(127);
}
waitpid(pid, nullptr, 0);
umount2("/proc", MNT_DETACH);
```

- `MS_REC | MS_PRIVATE` 必须在新挂载之前执行，否则新建的挂载会传播回宿主命名空间。
- `CLONE_NEWPID` 只影响之后 `fork` 出的子进程，当前进程仍在原命名空间。
- 挂载 `proc` 之前需要存在可用的 `/proc` 目录，挂载点必须已经建立。
- 每一步都要检查返回值并区分 `EPERM`、`EINVAL` 与 `ENOENT`，失败时按相反顺序清理。
- 退出时用 `MNT_DETACH` 惰性卸载，避免仍有进程占用时卸载失败。

### 16.13 挂载传播类型有哪些？

- `MS_SHARED` 让挂载与挂载事件在同组内双向传播，`MS_SLAVE` 只接收不发出，`MS_PRIVATE` 完全隔离，`MS_UNBINDABLE` 还禁止 bind 挂载。
- 传播属性挂在挂载点上，以 peer group 组织，同一组内的成员共享事件。
- `MS_REC` 使属性递归应用到子树，容器运行时通常对整个根执行一次。
- 新建挂载默认是 private，systemd 启动时把 `/` 改为 shared，因此容器内需要显式改为 private 或 slave。
- 属性设置失败通常返回 `EINVAL`，原因多为挂载点不存在或标志组合非法。

### 16.14 overlayfs 的读写路径与限制是什么？

- 读取时按 `lowerdir` 从上层到下层查找，同名目录合并，同名文件由最上层遮蔽。
- 写入触发 copy-up：先把整个文件复制到 `upperdir`，再在原位置修改，首次写大文件有明显延迟。
- 删除下层文件会在 `upperdir` 中生成 whiteout，删除目录则额外设置不透明标记，使下层同名目录不再合并。
- `upperdir` 与 `workdir` 必须位于同一文件系统，`workdir` 必须为空目录，否则挂载返回 `EINVAL`。
- 目录重命名需要 `redirect_dir` 支持，未启用时跨层重命名可能返回 `EXDEV`。
- 层数增加会拉长查找路径，镜像层数应受控。

### 16.15（辨析）容器与虚拟机的隔离边界有何不同？

- 容器共享宿主内核，系统调用直达内核；虚拟机有独立内核，Hypervisor 暴露的是设备与内存接口。
- 容器的攻击面是内核的系统调用实现与配置疏漏；虚拟机的攻击面是虚拟设备与 Hypervisor。
- 容器启动在秒级、开销以 MB 计；虚拟机启动在秒到十秒级、开销以百 MB 计。
- 容器的快照与迁移依赖文件系统与内存转储，虚拟机可以直接保存设备与内存状态。
- 混合方案用轻量虚拟机承载容器（Kata Containers），或在用户态实现系统调用层（gVisor），以性能换取隔离强度。
- 容器隔离强度取决于配置与内核版本，不能默认等同于安全边界。

### 16.16 network namespace 中的网络如何隔离？

- 每个网络命名空间有独立的网络设备、路由表、ARP 表、防火墙规则与端口空间。
- 命名空间之间用 veth 对连接，两端分别位于不同命名空间，常配合网桥接入宿主。
- 回环设备在新命名空间中处于 down 状态，需要显式执行 `ip link set lo up`。
- 命名空间句柄可通过 `/proc/PID/ns/net` 或绑定挂载到 `/var/run/netns` 下持久化。
- `setns` 进入网络命名空间需要目标命名空间中的 `CAP_SYS_ADMIN`。
- 网络栈仍然共享，socket 缓冲区计入 cgroup 的内存统计。

### 16.17（场景）容器内 getpid 得到的值与宿主侧不一致，日志如何对齐？

- `/proc/PID/status` 的 `NSpid` 行按从外到内的顺序给出同一进程在各层 PID 命名空间中的编号。
- 宿主侧可通过 `/proc/PID/root` 与 `/proc/PID/ns` 访问容器内的文件系统与命名空间视图。
- cgroup 路径与容器 id 可作为关联键，日志中记录容器 id 比记录 pid 更可靠。
- `getpid` 只在当前命名空间内有意义，不能作为全局唯一标识，跨进程关联应使用启动时间加 pid 或显式 id。
- 采集侧可在宿主命名空间通过 eBPF 或 procfs 读取真实 pid，再按 `NSpid` 映射到容器内编号。

### 16.18 seccomp 与 capabilities 能否互相替代？

- capabilities 决定权限检查能否通过，seccomp 决定系统调用能否进入内核实现，两者作用点不同。
- seccomp 无法判断文件路径与 socket 地址，只能比较标量参数，因此不能替代基于路径的访问控制。
- capabilities 无法阻止已获准的系统调用访问任意对象，例如持有 `CAP_DAC_OVERRIDE` 时 `open` 不受文件权限约束。
- 组合使用才形成分层：先丢弃能力缩小权限集，再用 seccomp 白名单削减系统调用面，最后由 LSM 限制路径与标签。
- `SECCOMP_RET_USER_NOTIF` 把系统调用交给监督进程处理，可在用户态实现路径级策略，代价是每次调用一次进程间往返。

### 16.19 cgroup v2 与 v1 的差异对程序有什么影响？

- v2 采用单一层级，所有控制器在同一棵树上，通过 `cgroup.controllers` 与 `cgroup.subtree_control` 启用。
- 限额接口改名：`cpu.max` 取代 `cpu.cfs_quota_us` 与 `cpu.cfs_period_us`，`cpu.weight` 取代 `cpu.shares`。
- 「无内部进程」规则要求启用域控制器的 cgroup 不直接承载进程，进程必须位于叶子节点。
- `/proc/self/cgroup` 在 v2 中只有一行，格式为 `0::` 加路径，解析逻辑需要区分两种格式。
- `memory.stat`、`memory.events`、`cpu.stat` 提供累计计数，`memory.current` 与 `memory.max` 提供当前值与上限。
- `/proc/pressure` 下的文件给出 CPU、内存与 IO 的压力停顿时间，可用于判断限流是否影响响应时间。

### 16.20（实现）如何判断当前进程是否运行在容器中？

- 检查 `/.dockerenv` 或 `/run/.containerenv` 是否存在，这类标记由运行时写入，实现之间不统一。
- 比较 `/proc/self/ns/pid` 与 `/proc/1/ns/pid` 的链接目标，不同则说明处于独立 PID 命名空间。
- 读取 `/proc/self/cgroup` 查找 `docker`、`kubepods`、`lxc` 等路径片段，v2 下路径形态不同。
- 读取 `/proc/1/comm` 或 `/proc/1/sched`，容器内 1 号进程通常是应用进程而非 init 系统。
- 环境变量 `container` 由部分运行时设置，缺失不能作为否定证据。
- 没有权威判据，工程上组合多个信号并允许配置覆盖。

---

## 17. 性能观测与系统工具

### 17.1 perf 的采样是如何实现的？

- `perf_event_open(2)` 创建事件并返回文件描述符，内核把计数器或采样缓冲区绑定到该描述符。
- 计数器溢出时触发采样，默认在 NMI 上下文中记录指令指针与可选调用栈，写入 `mmap` 映射的环形缓冲区。
- `sample_period` 按事件计数采样，`sample_freq` 按频率采样，后者由内核换算为周期。
- 采样点存在 skid：中断到达时指令指针可能已越过触发指令，Intel PEBS 与 AMD IBS 用硬件缓冲降低偏差。
- 读取方通过 `mmap` 的元数据页获取写指针，按 `PERF_RECORD_*` 记录解析；队列满时样本丢失并计数。
- 权限受 `kernel.perf_event_paranoid` 约束，取值 2 时普通用户不能做内核态采样。
- 开销来自采样频率与调用栈展开方式，帧指针展开最便宜，DWARF 展开需要读取栈上数据，开销显著上升。

### 17.2（辨析）perf stat 与 perf record 的区别？

- `perf stat` 只读计数器总量，用 `enable` 与 `disable` 包住目标区间，输出次数、比率与平均值。
- `perf record` 打开采样，把事件流写入 `perf.data`，后续用 `perf report` 按符号聚合。
- 硬件计数器数量有限，事件数超过可用计数器时内核做多路复用，按启用时间比例折算，结果有误差。
- `perf stat` 输出中的百分比方括号表示该事件实际被启用的时间比例，接近 100% 时计数才可信。
- `perf record` 依赖符号解析，缺少调试信息时热点退化为十六进制地址。
- 评估改动前后的差异用 `perf stat`，定位热点函数用 `perf record`。

### 17.3 火焰图如何阅读？

- 纵轴是调用栈深度，横轴是样本占比，条带宽度表示该栈帧在采样中占用的比例。
- 火焰图统计样本数而非调用次数，宽度对应 CPU 时间，不表示调用频次。
- on-CPU 火焰图基于周期事件采样，off-CPU 火焰图基于调度切换事件，两者回答的问题不同。
- 相同栈合并后按分号连接生成折叠格式，再交给绘图工具渲染。
- 出现 `[unknown]` 或纯地址说明符号缺失，需要补调试信息或指定符号路径。
- inline 函数在栈中没有独立帧，DWARF 展开可以还原部分 inline 层级。
- 自顶向下读是调用关系，自底向上读是聚合的叶子消耗。

### 17.4 strace 的实现方式与代价？

- `strace` 通过 `ptrace(PTRACE_SEIZE)` 接管目标，再用 `PTRACE_SYSCALL` 在系统调用入口与出口各停一次。
- 每次停靠都伴随上下文切换与调度，开销通常在数倍到数十倍之间，具体幅度由调用密度与实现决定。
- `-f` 跟踪所有线程，`-c` 汇总每个系统调用的次数、耗时与错误数，`-T` 显示单次耗时。
- `-T` 的时间包含 ptrace 停靠开销，不能当作系统调用的真实延迟。
- `strace` 会改变进程时序，可能掩盖或暴露竞态，不宜用于对时序敏感的复现。
- `perf trace` 基于 `raw_syscalls` 跟踪点采集，开销明显低于 `strace`，输出细节较少。
- 被 seccomp 以 `SECCOMP_RET_TRACE` 拦截的调用同样交给跟踪者处理。

### 17.5 ltrace 与 strace 的差别？

- `ltrace` 在动态链接的可执行文件中把断点设在 PLT 桩上，记录库函数调用与参数。
- 静态链接或经过内联优化的调用不经过 PLT，`ltrace` 无法观察。
- 断点数量与库调用密度成正比，开销高于 `strace`。
- `ltrace` 看不到系统调用，内核路径仍需 `strace` 或 `perf trace`。
- 替代方案是 uprobe 或 `LD_PRELOAD` 打桩，前者不需要重启进程，后者可以只替换特定符号。
- 现代发行版中 `ltrace` 的维护活跃度低于 `strace`，可用性需按平台确认。

### 17.6 /proc 中哪些文件对性能诊断最有用？

- `/proc/PID/stat` 提供用户态与内核态时间、状态、优先级与页错误计数。
- `/proc/PID/status` 提供 `VmRSS`、`Threads`、`voluntary_ctxt_switches` 与 `nonvoluntary_ctxt_switches`。
- `/proc/PID/io` 的 `read_bytes` 与 `write_bytes` 统计实际到达块层的字节数，与 `rchar`、`wchar` 不同。
- `/proc/PID/schedstat` 给出在 CPU 上运行的时间、在运行队列等待的时间与时间片次数。
- `/proc/PID/smaps_rollup` 汇总映射的内存；`/proc/PID/stack` 与 `/proc/PID/wchan` 显示内核栈与等待点，需要权限。
- `/proc/stat`、`/proc/meminfo`、`/proc/vmstat` 与 `/proc/pressure` 下的文件提供系统级计数与压力指标。

### 17.7（陷阱）解析 /proc/PID/stat 需要注意什么？

- 第二个字段 `comm` 用括号包围且可以包含空格与右括号，必须从行内最后一个右括号之后开始解析。
- 字段编号随内核版本增加，`starttime` 是第 22 个字段，硬编码偏移在旧内核上会错位。
- `utime` 与 `stime` 的单位是 jiffies，需要除以 `sysconf(_SC_CLK_TCK)` 换算为秒。
- `rss` 字段的单位是页，换算为字节需要乘以页大小。
- 连续读取同一文件的不同字段不是原子快照，前后两次读取可能对应不同状态。
- 稳妥做法是使用 `procps` 或 `libproc2` 的封装，或一次性读取整行后解析。

### 17.8 ftrace 的组成与用法？

- 接口挂在 tracefs（通常为 `/sys/kernel/tracing`）上，通过 `available_tracers`、`current_tracer`、`trace`、`trace_pipe` 操作。
- `function` 记录函数入口，`function_graph` 记录入口与返回并给出耗时，`nop` 关闭跟踪。
- `set_ftrace_filter` 与 `set_graph_function` 限定跟踪范围，范围过大时开销上升且容易丢数据。
- `irqsoff`、`preemptoff`、`wakeup` 属于延迟跟踪器，测量关中断、关抢占与唤醒延迟的最大值。
- 环形缓冲区大小由 `buffer_size_kb` 设置，写入时覆盖旧数据，读取 `trace_pipe` 是消费式读取。
- `function_graph` 的耗时包含子调用，读图时要注意累加关系。

### 17.9 kprobe、uprobe 与 tracepoint 的区别？

- tracepoint 是内核源码中的静态埋点，接口稳定，有格式描述，开销最低。
- kprobe 在运行时替换内核函数入口的指令，可探测任意符号，依赖内核版本与符号可见性。
- uprobe 作用于用户态可执行文件或共享库的指定偏移，需要符号表或已知偏移。
- fentry 与 fexit 基于 BPF trampoline，性能优于 kprobe，但要求内核提供 BTF。
- 参数读取依赖架构调用约定与 BTF，缺少类型信息时只能按寄存器读取原始值。
- 部分函数被标记为不可探测，或在 NMI 上下文中执行，探测会失败或带来风险。

### 17.10 eBPF 程序如何加载与校验？

- 用户态通过 `bpf(BPF_PROG_LOAD)` 提交字节码与程序类型，内核校验器先做静态检查再允许执行。
- 校验器验证指针来源、边界、循环有界性、栈使用与辅助函数调用，拒绝时返回 `EACCES` 并给出日志。
- 程序类型决定可用的上下文与辅助函数，例如 kprobe、tracepoint、perf_event、xdp、cgroup 各有约束。
- map 用于内核与用户态共享数据，查找与更新通过辅助函数完成。
- BTF 与 CO-RE 重定位让同一份程序适配不同内核的结构体布局。
- 权限要求 `CAP_BPF` 与 `CAP_PERFMON`（Linux 5.8 起），旧内核要求 `CAP_SYS_ADMIN`。
- 指令数、复杂度与循环展开都有上限，超限时加载失败。

### 17.11（场景）线上 CPU 使用率高，perf 却找不到热点，如何排查？

- 确认采样范围：漏掉 `-a` 只会采集当前进程，容器场景需要用 `--cgroup` 或进入相应命名空间。
- 短命进程与高频 `fork` 让样本落在进程之外，改用系统级采样或统计 `sched_process_exec` 事件。
- 内核态占比高时热点在系统调用实现中，用 `perf record -e cycles:k` 或 `--call-graph` 观察内核栈。
- CPU 忙而指令数不高可能是访存受限，用 `perf stat -e cycles,instructions,cache-misses` 看 IPC 与缺失率。
- 虚拟化环境检查 `/proc/stat` 的 `steal` 字段，CPU 时间可能被 Hypervisor 占用。
- 频率与功耗限制会影响结果，查看 `cpufreq` 的当前频率与 `thermal` 的降频记录。
- 确认工具没有把时间算到 `iowait` 或 `softirq` 上。

### 17.12 CPU 使用率的几种口径如何区分？

- 系统级使用率来自 `/proc/stat` 的 `cpu` 行两次采样之差，分母是全部时间片。
- 进程级使用率是用户态时间加内核态时间除以进程存活时间，多线程进程可以超过 100%。
- `guest` 与 `guest_nice` 已经计入 `user` 与 `nice`，重复相加会高估。
- `steal` 表示被 Hypervisor 抢占的时间，容器与虚拟机中应单独观察。
- `iowait` 表示 CPU 空闲且存在未完成的 IO，部分工具把它算作忙碌，口径需要统一。
- 采样间隔决定能否观察到短命进程，间隔过长时这类进程完全不出现。

### 17.13 内存指标 RSS、VSZ 与 PSS 的差别？

- `VSZ` 是虚拟地址空间大小，包含未触碰的映射与保留区域，不代表物理占用。
- `RSS` 是常驻物理页数量，共享页在每个进程中重复计入，多进程相加会高估。
- `PSS` 把共享页按映射进程数分摊，适合评估一组进程的真实占用，数据来自 `smaps`。
- `USS` 只统计私有页，进程退出即可释放。
- cgroup 的 `memory.current` 包含页缓存与内核内存，与 `RSS` 的口径不同。
- 匿名页与文件页的回收行为不同，文件页在内存压力下可以直接丢弃。

### 17.14（陷阱）RSS 持续增长是否一定是内存泄漏？

- 分配器会保留已释放的内存块，glibc 的 arena 与 `mmap` 阈值决定是否归还内核。
- 页缓存与 tmpfs 占用会计入进程或 cgroup 的内存，但属于可回收部分。
- 透明大页与内存碎片会让空闲内存无法合并归还，表现为 `RSS` 不下降。
- 区分方法是查看 `smaps` 中的 `Anonymous` 与 `Heap`，以及 `malloc_info` 的 arena 统计。
- `malloc_trim` 可以主动归还空闲堆顶，`MALLOC_ARENA_MAX` 限制 arena 数量。
- 真实泄漏的特征是匿名页单调增长，且在业务空闲期不回落。

### 17.15 如何观察上下文切换与调度延迟？

- `perf sched record` 采集 `sched_switch` 与 `sched_wakeup` 事件，`perf sched latency` 汇总每个任务的等待时间。
- `perf sched timehist` 按时间顺序展示唤醒、等待与运行区间。
- `/proc/PID/schedstat` 的第二个字段是累计在运行队列等待的纳秒数。
- `/proc/PID/status` 的 `voluntary_ctxt_switches` 与 `nonvoluntary_ctxt_switches` 区分主动让出与被抢占。
- `sched:sched_migrate_task` 反映跨 CPU 迁移，频繁迁移会影响缓存命中。
- 跟踪点频率高，长时间采集会显著增加开销，应限定范围与时长。

### 17.16（填空）现象与工具的对应关系？

| 现象 | 首选工具 | 关键指标 |
| --- | --- | --- |
| 系统调用频繁且慢 | `strace -c`、`perf trace` | 调用次数、单次耗时、错误码 |
| 缺页与内存回收 | `perf stat`、`/proc/vmstat` | `page-faults`、扫描与回收计数 |
| 锁竞争 | `perf lock`、futex 跟踪点 | 等待次数、等待时长 |
| 磁盘 IO 延迟 | `iostat`、`blktrace` | 平均等待时间、队列深度 |
| 网络丢包与重传 | `ss -s`、`nstat` | 重传数、丢弃数 |
| 函数级热点 | `perf record` | 样本占比、调用栈 |

- 工具的选择取决于要回答的问题：计数类问题用统计接口，时序类问题用采样或跟踪。
- 同一现象往往需要两个层级的数据，例如 IO 延迟要同时看块层与应用层。
- 指标名称随内核版本变化，读取前先用 procfs 确认字段存在。
- 观测工具本身有开销，压测对比时要保证观测条件一致。

### 17.17（辨析）on-CPU 与 off-CPU 分析的分工？

- on-CPU 分析回答 CPU 时间被谁消耗，数据来自周期事件采样。
- off-CPU 分析回答线程为何没有运行，数据来自调度切换事件，记录阻塞起止与栈。
- 两类火焰图不能互相替代，CPU 使用率低但延迟高的问题只在 off-CPU 图上可见。
- off-CPU 采样每次切换都产生记录，开销高于周期采样，应限定进程或时长。
- IO 等待、锁等待与调度延迟在 off-CPU 图中都表现为栈帧，需要结合 `wchan` 或内核栈区分。

### 17.18 perf 权限不足或符号缺失如何处理？

- `kernel.perf_event_paranoid` 取值从 -1 到 3，数值越大限制越多，2 是多数发行版的默认值。
- `kernel.kptr_restrict` 控制内核地址是否对普通用户可见，影响符号与调用栈解析。
- 内核符号来自 `/proc/kallsyms` 或 `vmlinux`，发行版通常需要单独安装调试包。
- 用户态符号要求二进制未被 strip，或用 build-id 关联分离的调试文件。
- JIT 生成的代码需要 `/tmp/perf-` 加进程号加 `.map` 才能解析为函数名。
- 容器内采集还需要宿主命名空间与相应权限，否则只能看到容器内的部分事件。

### 17.19（场景）如何度量一次系统调用的实际开销？

- 先用微基准循环调用，用 `clock_gettime(CLOCK_MONOTONIC)` 包围多次调用并扣除循环自身开销。
- 区分 vDSO 与真正陷入内核：`clock_gettime`、`gettimeofday`、`getcpu` 通常不进入内核，耗时在纳秒级。
- 用 `perf stat` 对比用户态与内核态周期数，判断时间花在哪一侧。
- `strace -T` 的数值包含 ptrace 停靠，不能作为真实延迟。
- 缓存与 TLB 状态会影响结果，测量前应让数据与代码进入缓存，并固定 CPU 与频率策略。
- 单次结果波动大，应报告中位数与分位数。

### 17.20 eBPF 观测对生产环境的影响如何控制？

- 优先在 map 中聚合计数，避免逐事件输出到用户态。
- 使用采样或有条件过滤，例如按 pid、cgroup 或调用号筛选，减少热路径开销。
- `ringbuf` 与 perf buffer 的大小按事件速率设置，溢出会导致数据丢失而不是阻塞内核。
- 避免在程序内做字符串格式化与内存分配，这些操作在部分上下文中不可用，且有额外开销。
- 比较跟踪点与 kprobe 的开销差异，能用静态跟踪点就不使用动态探测。
- 先在灰度实例验证，记录附加前后的 CPU 与延迟变化，并准备卸载路径。

---

## 18. 崩溃、core dump 与符号

### 18.1 哪些信号默认产生 core dump？

- 默认动作为 core 的信号包括 `SIGQUIT`、`SIGILL`、`SIGABRT`、`SIGFPE`、`SIGSEGV`、`SIGBUS`、`SIGSYS`、`SIGTRAP`、`SIGXCPU`、`SIGXFSZ`。
- 是否真正写入文件还取决于 `RLIMIT_CORE`、`core_pattern`、进程的 dumpable 标志与文件系统剩余空间。
- 信号被安装处理函数后不再执行默认动作，是否产生 core 由处理函数是否返回决定。
- `SIGKILL` 与 `SIGTERM` 的默认动作是终止，不产生 core。
- `abort()` 会先解除 `SIGABRT` 的阻塞再触发，默认路径产生 core。

### 18.2（辨析）SIGSEGV 与 SIGBUS 的触发条件？

- `SIGSEGV` 来自无效的内存访问：地址未映射、权限不符、访问非规范地址。
- `siginfo_t` 的 `si_code` 可以区分 `SEGV_MAPERR`（未映射）与 `SEGV_ACCERR`（权限不符）。
- `SIGBUS` 常见于访问 `mmap` 文件超出文件末尾、地址对齐不满足要求（部分架构）、硬件或介质错误。
- 对映射文件截断后再访问，通常得到 `SIGBUS` 而非 `SIGSEGV`。
- 两者都可以通过 `SA_SIGINFO` 获取出错地址 `si_addr`。
- 在信号处理函数中再次触发同一错误会导致默认动作，进程终止。

### 18.3 core dump 在内核中的产生路径？

- 内核在终止进程前调用 `do_coredump`，先检查信号、dumpable 标志与 `RLIMIT_CORE`。
- `core_pattern` 为普通路径时按模板展开（`%p` 进程号、`%e` 可执行文件名、`%s` 信号、`%t` 时间），以独占方式创建文件。
- `core_pattern` 以竖线开头时改为管道模式，内核把 core 写入该程序的标准输入，并发数受 `core_pipe_limit` 限制。
- 生成的文件是 ELF core，包含 `PT_NOTE`（`NT_PRSTATUS`、`NT_PRPSINFO`、`NT_AUXV`、`NT_FILE`）与各映射段。
- 失败路径包括磁盘空间不足、目录不可写、`RLIMIT_CORE` 为 0、目标路径已被占用。
- setuid 程序默认不产生 core，可通过 `fs.suid_dumpable` 调整。

### 18.4 线上环境如何配置 core dump？

- 用 `systemd-coredump` 接管，通过 `coredumpctl list` 与 `coredumpctl info` 查看，`coredumpctl gdb` 直接进入调试。
- 改用管道模式写入自定义收集器，可在落盘前压缩、加标签并上传。
- `/etc/systemd/coredump.conf` 的 `Storage`、`MaxUse`、`KeepFree` 控制保留策略，避免占满磁盘。
- `ulimit -c` 或 `RLIMIT_CORE` 必须非零；`core_pattern` 是全局参数，容器场景需要在宿主侧配置。
- 容器内默认不产生 core：转储路径由宿主决定，路径在容器内通常不可见。
- 生产环境需要评估转储的体量与数据敏感性，必要时只保留栈与寄存器信息。

### 18.5（实现）如何在信号处理器中获取回溯？

- `backtrace()` 与 `backtrace_symbols()` 不是异步信号安全的，首次调用还会通过 `dlopen` 加载 `libgcc_s`，在信号处理器中直接调用有死锁风险。
- 常见做法是在 `main` 开始时预热调用一次，使运行库已经加载，信号处理器再使用。
- 栈溢出场景必须使用 `sigaltstack` 并在 `sigaction` 中设置 `SA_ONSTACK`，否则处理器没有可用栈。
- 处理器中只能调用异步信号安全的函数，如 `write` 与 `_exit`，格式化输出应写入预分配的缓冲区。
- 寄存器可从 `ucontext_t` 的 `uc_mcontext` 读取，该结构随架构与 C 库不同。
- 更稳妥的方案是让进程崩溃并保留 core，由外部工具解析，避免在已损坏的进程中执行复杂逻辑。

### 18.6 backtrace 与栈展开的差别？

- `backtrace()` 是 glibc 提供的接口，x86-64 上基于 `_Unwind_Backtrace`，读取 `.eh_frame` 展开。
- 基于帧指针的展开要求编译时保留帧指针，`-fomit-frame-pointer` 会破坏这条链。
- 使用展开表的方案不依赖帧指针，但需要 `.eh_frame` 存在，strip 时不能删除该节。
- inline 函数没有独立栈帧，展开结果中不出现，DWARF 信息可以还原 inline 展开层级。
- `-fasynchronous-unwind-tables` 可以在不使用异常的语言中保留展开表。
- 栈被破坏后两种方式都会给出错误结果，需要人工核对返回地址是否落在可执行映射内。

### 18.7（陷阱）栈被破坏后回溯为什么不可信？

- 溢出的写操作会覆盖保存的返回地址与前一帧的帧指针，展开沿伪造的链继续。
- 大型局部数组越过栈保护页会直接触发 `SIGSEGV`，此时栈上数据已不可用。
- 栈保护选项在函数返回时检测 canary，能终止进程，但无法给出完整栈。
- `_FORTIFY_SOURCE` 在编译期检查已知长度的操作，能提前拦截部分越界。
- 分析 core 时应核对栈指针是否在栈映射范围内、返回地址是否落在可执行段。
- 栈损坏后的调用栈只能作为线索，不能作为事实。

### 18.8 符号表、调试信息与 strip 的关系？

- `.symtab` 保存全部符号，`.dynsym` 保存动态链接需要的符号，二者用途不同。
- `strip` 删除 `.symtab` 与调试节，保留 `.dynsym`，因此动态链接不受影响，静态符号消失。
- `-g` 生成 DWARF 调试节，包含类型、变量、行号与 inline 信息，体积可能超过代码本身。
- build-id 是链接器写入 `.note.gnu.build-id` 的唯一标识，用于把二进制与调试文件对应起来。
- `objcopy --only-keep-debug` 可分离调试信息，`--add-gnu-debuglink` 在二进制中记录引用。
- 发布流程应保留未 strip 的二进制或分离的调试文件，并按 build-id 归档。

### 18.9 debuginfod 解决什么问题？

- 按 build-id 从 HTTP 服务端按需获取调试信息与源码，客户端包括 gdb、perf 与 elfutils 工具。
- 通过环境变量 `DEBUGINFOD_URLS` 配置服务端地址，多个地址以空格分隔。
- 发行版维护公共实例，覆盖官方仓库中的二进制；自建实例需要先索引本地构建产物。
- 请求中包含 build-id，会暴露正在调试的二进制标识，内网环境需要评估。
- 服务不可达时客户端超时后回退到本地路径，可用超时变量控制等待时间。
- 与 `debug-file-directory` 配合时，本地已有调试文件优先于远端获取。

### 18.10 如何从 core 定位崩溃点？

- 用 `gdb 可执行文件 core` 打开，`bt` 查看调用栈，`frame` 切换栈帧。
- `info registers` 与 `x/i $pc` 查看崩溃时的指令，`p $_siginfo` 查看信号与出错地址。
- `thread apply all bt` 查看所有线程，崩溃线程通常由 `info threads` 标出。
- 源码路径不匹配时用 `set substitute-path` 重映射，或用 `debug-file-directory` 指定调试文件目录。
- core 中的 `NT_FILE` 记录映射的文件名与基址，可用于还原共享库版本。
- 崩溃点可能只是症状，应结合参数值与内存内容回溯到上游逻辑。

### 18.11（场景）发布版本已 strip，线上崩溃如何还原符号？

- 依靠 build-id 匹配归档的未 strip 二进制或分离的调试文件。
- 若部署了 debuginfod，gdb 会按 build-id 自动拉取，不需要手工准备文件。
- 确认 core 与二进制的 build-id 一致，版本不一致时行号与栈都会错位。
- 共享库同样需要对应版本，容器镜像应记录依赖库的构建标识。
- 建立发布流程约束：每次构建归档二进制、调试文件与 build-id 清单。

### 18.12 core 文件为何可能不完整？

- `RLIMIT_CORE` 既是开关也是大小上限，超过上限时文件被截断或完全不写。
- `core_pipe_limit` 为 0 时内核不等待收集器，收集器可能读到不完整的数据。
- 管道模式下收集器退出或管道关闭时，内核放弃后续写入。
- 进程被 `SIGKILL` 终止时不产生 core，内存不足触发的 OOM 属于这一类。
- 文件系统空间不足或路径不可写时写入中断，内核只在日志中记录。

### 18.13 SIGKILL、SIGTERM 与 core 的关系？

- `SIGKILL` 不可捕获、不可阻塞，默认动作是终止且不产生 core。
- `SIGTERM` 可以被捕获，默认动作是终止且不产生 core。
- `SIGABRT` 默认产生 core，`abort()` 与断言失败通常走这条路径。
- 内核 OOM killer 使用 `SIGKILL`，因此内存耗尽导致的崩溃没有 core，需要依赖内核日志与监控。
- 需要 core 的退出路径应主动触发 `abort()` 或调用 `raise(SIGSEGV)`。

### 18.14 如何让崩溃报告带上调用栈与寄存器？

```cpp
static char g_buf[8192];
void on_fatal(int sig, siginfo_t* si, void* uc) {
    int n = 0;
    n += put_str(g_buf + n, "signal=");   // 自实现的定长写入
    n += put_int(g_buf + n, sig);
    n += put_ptr(g_buf + n, si->si_addr);
    write(STDERR_FILENO, g_buf, n);       // 异步信号安全
    _exit(128 + sig);
}
```

- 用 `sigaction` 安装处理器，设置 `SA_SIGINFO` 获取 `siginfo_t` 与 `ucontext_t`，设置 `SA_ONSTACK` 使用备用栈。
- 从 `ucontext_t` 中取出通用寄存器与指令指针，按架构差异封装。
- 先把报告写入预分配的静态缓冲区或固定映射的区域，再调用 `write` 落盘。
- 处理器内不做堆分配、不调用 stdio、不加锁，避免在已损坏的状态下再次崩溃。
- 写入完成后用 `_exit` 结束进程，不返回原现场。
- 同时保留 core 与文本报告，两者互补。

### 18.15 ELF core 文件包含哪些 note？

- `NT_PRSTATUS` 保存每个线程的寄存器与信号信息，是定位崩溃指令的主要来源。
- `NT_PRPSINFO` 保存进程名、参数与用户信息。
- `NT_AUXV` 保存辅助向量，包含入口地址与页大小等。
- `NT_FILE` 记录映射的文件路径、起始地址与页偏移，用于还原共享库。
- `NT_SIGINFO` 保存触发终止的信号与出错地址。
- 架构相关的 note（如 `NT_X86_XSTATE`）保存扩展寄存器状态，包括浮点与向量寄存器。

### 18.16 崩溃转储与日志如何互补？

- core 给出崩溃瞬间的内存与寄存器快照，日志给出崩溃前的事件序列。
- 在环形缓冲区中持续记录关键状态，崩溃处理器只负责把缓冲区落盘，可以显著缩短定位时间。
- 异步日志库在崩溃时可能还有未刷新的数据，处理器需要能主动冲刷。
- 日志时间戳与 core 的生成时间要对齐，便于关联上下游。
- 高并发场景可以只保留最近若干秒的详细日志，降低常态开销。

### 18.17（陷阱）在崩溃处理中调用 malloc 会有什么后果？

- 堆结构可能已被破坏，分配器遍历空闲链表时会再次触发段错误。
- 分配器使用的锁可能正被崩溃线程持有，重入会死锁，进程挂起且不产生 core。
- 异步信号处理器中只有异步信号安全的函数可以调用，`malloc` 与 `free` 不在其中。
- 替代方案是使用预分配缓冲区、固定映射区域或静态数组。
- 输出用 `write` 直接写文件描述符，避免 stdio 的锁与缓冲。

### 18.18 gdb 中如何检查内存损坏？

- 硬件观察点（`watch`、`rwatch`、`awatch`）可以捕获对指定地址的写，数量受硬件限制，通常为四个。
- valgrind 的 memcheck 与 `-fsanitize=address` 在运行期检测越界、重复释放与使用后释放。
- `MALLOC_CHECK_` 让 glibc 在检测到堆元数据异常时终止，代价较低，覆盖范围有限。
- `_FORTIFY_SOURCE` 在编译期把部分库调用替换为带长度检查的版本。
- 静态分析工具可以发现固定模式的越界，无法覆盖依赖运行期数据的问题。
- 复现依赖确定性：固定随机种子、单线程化、禁用地址随机化可以提高命中率。

### 18.19（场景）程序在客户环境崩溃而本地无法复现，如何收集信息？

- 确保客户环境开启 core 与 `ulimit -c`，并约定回传方式与脱敏要求。
- 收集二进制与全部依赖库的 build-id、内核版本、C 库版本与 CPU 特性。
- 记录挂载参数、cgroup 限额与容器运行时版本，限额与内核参数会改变行为。
- 在客户环境用 `strace -f -c` 或采样工具获取概要，避免长时间全量跟踪。
- 请求提供崩溃前的应用日志与内核日志片段，段错误地址与映射信息常在其中。
- 本地复现时对齐上述环境，包括同一内核版本与同一指令集基线。

### 18.20 coredumpctl 的常用操作？

- `coredumpctl list` 列出已收集的转储，包含时间、pid、信号与可执行文件。
- `coredumpctl info PID` 显示概要，`coredumpctl gdb PID` 直接加载到调试器。
- `coredumpctl dump PID --output=FILE` 导出 core 文件，供离线分析。
- 存储位置与保留策略由 `/etc/systemd/coredump.conf` 的 `Storage`、`MaxUse`、`KeepFree` 控制。
- 二进制不匹配时需要在 gdb 中指定可执行文件路径，并依赖 build-id 校验。
- 容器场景的 core 由宿主收集，需要在宿主侧查询，容器内通常看不到。

---

## 19. 可移植性与 POSIX

### 19.1 POSIX 覆盖哪些范围？

- POSIX.1 定义系统接口、C 库接口、shell 与常用工具的行为，最新完整版本是 POSIX.1-2017。
- 规范描述接口语义而不规定实现方式，只要可观察行为一致即可通过一致性测试。
- 实时扩展（含线程、信号量、消息队列与定时器）在 2001 年并入主标准。
- 头文件与函数命名由标准规定，例如 `unistd.h` 中的 `fork`、`execve` 与 `read`。
- 标准不覆盖调度策略、文件系统实现与性能，这些属于实现质量。
- POSIX 与 Single UNIX Specification 在系统接口部分内容一致，后者额外规定品牌认证。

### 19.2（辨析）POSIX 接口与 Linux 专有接口的差别？

- POSIX 提供 `poll`、`select`、`pipe`、`signal` 与 `pthread_*` 等可移植接口。
- Linux 专有接口包括 `epoll`、`eventfd`、`timerfd`、`signalfd`、`prctl`、`io_uring` 与 `clone`。
- 专有接口通常为解决可移植接口的扩展性问题而设计，例如 `epoll` 避免了 `poll` 的线性扫描。
- 可移植替代方案存在，但能力与性能不同：`epoll` 可用 `poll` 替代，`eventfd` 可用管道替代，`signalfd` 可用 `sigwait` 替代。
- 隔离手段是把专有接口限制在少数文件中，用条件编译选择实现。
- 依赖层级按目标平台决定，不必要的层次不引入专有接口。

### 19.3 如何用条件编译隔离平台差异？

- 预定义宏包括 `__linux__`、`__APPLE__`、`_WIN32` 与 `__unix__`，按平台选择实现文件。
- 特性测试宏必须在包含任何系统头文件之前定义，通常放在构建系统或统一的前置头文件中。
- 用 `check_symbol_exists` 与 `check_function_exists` 在配置阶段探测能力，比按平台名猜测可靠。
- 把差异收敛到薄封装层，业务代码只调用封装后的接口。
- 避免在业务代码中散布条件编译，否则组合数量会随平台与版本增长。
- 对不可移植的假设（类型宽度、字节序、对齐）使用 `static_assert` 在编译期暴露。

### 19.4（陷阱）_GNU_SOURCE 与 _POSIX_C_SOURCE 的关系？

- `_GNU_SOURCE` 打开全部 GNU 扩展，并隐含 `_POSIX_C_SOURCE=200809L` 与 `_XOPEN_SOURCE=700`。
- 多个特性测试宏同时定义时取并集，冲突组合的优先级由实现决定。
- 定义位置必须在首个系统头文件之前，否则部分声明不会出现。
- 这些宏会改变头文件中的结构体成员与函数声明，例如 `struct sigaction` 与 `struct dirent` 的字段集合。
- 同一程序的不同翻译单元必须使用一致的定义，否则会出现结构体布局不一致。
- 推荐在构建系统中统一定义，不在源文件中零散书写。

### 19.5 32 位与 64 位的主要差异有哪些？

- 数据模型不同：LP64 下 `long` 与指针为 64 位，LLP64（Windows）下 `long` 为 32 位而指针为 64 位。
- `size_t`、`ptrdiff_t` 与 `intptr_t` 随指针宽度变化，格式化输出要用 `%zu` 或 `PRId64`。
- `time_t` 的宽度影响 2038 问题，`off_t` 的宽度影响大文件支持。
- 结构体对齐与填充随成员宽度变化，同一结构体在两种位宽下大小不同。
- 系统调用号与参数传递约定不同，汇编层代码不可直接移植。
- 行内汇编、原子操作与内存序实现依赖架构，跨位宽时需要重新验证。

### 19.6（陷阱）long 与指针宽度相同这一假设何时失效？

- LP64 平台（Linux、macOS）上指针与 `long` 都是 64 位，该假设成立。
- LLP64 平台（64 位 Windows）上 `long` 是 32 位，指针是 64 位，赋值时会发生截断。
- 正确类型是 `intptr_t` 与 `uintptr_t`，用于整数与指针之间的往返转换。
- 表示大小用 `size_t`，表示差值用 `ptrdiff_t`，表示文件偏移用 `off_t`。
- `printf` 的格式串要与类型匹配，跨平台代码使用 `PRIuPTR` 这类宏。
- 编译器告警 `-Wconversion` 与 `-Wpointer-to-int-cast` 能暴露大部分问题。

### 19.7 time_t 的 2038 问题如何处理？

- 32 位有符号 `time_t` 的上限是 2038-01-19 03:14:07 UTC，之后回绕为负值。
- 解决方向是把 `time_t` 扩为 64 位，Linux 5.1 起为 32 位架构提供 64 位时间的系统调用。
- glibc 2.34 起在 32 位平台上可通过 `_TIME_BITS=64` 启用 64 位 `time_t`，并要求同时定义 `_FILE_OFFSET_BITS=64`。
- 改动会改变结构体布局与函数符号，全部依赖库必须使用相同配置，否则 ABI 不兼容。
- 文件系统时间戳、实时时钟与外部协议中的 32 位字段需要单独处理。
- 只修改应用层而不更新 C 库与内核，无法真正推迟溢出。

### 19.8（辨析）_FILE_OFFSET_BITS=64 改变了什么？

- 把 `off_t` 定义为 64 位，并把 `open`、`stat`、`lseek`、`readdir` 等调用重定向到 64 位变体符号。
- 结构体布局随之改变，例如 `struct stat` 的字段宽度与顺序。
- 该宏必须对整个程序一致定义，混用会导致结构体大小不一致与内存越界。
- 32 位平台打开大文件时还需要 `O_LARGEFILE`，启用该宏后 C 库会自动加上。
- 只影响文件偏移与大小相关的类型，不改变 `size_t` 与指针宽度。
- 64 位平台上该宏通常无效果，仍建议显式定义以保持源码一致。

### 19.9 Linux 的系统调用 ABI 如何保持稳定？

- 系统调用号与参数寄存器一旦分配就不复用，新增调用只能追加编号，旧编号永久保留。
- 结构体参数由内核通过 `copy_from_user` 读取，已有字段的偏移与宽度不能改变；新增字段只能追加并配合长度或版本号。
- 错误通过返回值表示：-4095 到 -1 视为 `errno` 的负值，C 库包装函数把它转换为 -1 并设置 `errno`。
- 32 位兼容层通过 `compat` 系统调用与独立的结构体布局维持旧 ABI，同一进程不能混用两种位宽的系统调用。
- `vDSO` 把 `clock_gettime` 等只读调用映射到用户态，其导出符号与版本同样属于 ABI。
- glibc 用符号版本化（如 `GLIBC_2.2.5`）允许多个版本并存，升级时旧二进制仍能绑定到旧符号。

### 19.10（场景）同一结构体在 32 位与 64 位下大小不同，如何避免问题？

- 原因是成员宽度与对齐要求变化，`struct { char c; long l; }` 在 32 位下通常为 8 字节，在 64 位下为 16 字节。
- 持久化与网络传输不要直接写入结构体，应逐字段序列化并使用固定宽度类型（`int32_t`、`uint64_t`）。
- `#pragma pack` 只能改变编译器行为，不能解决类型宽度差异，还会引入非对齐访问。
- 需要固定布局时使用显式填充，并用静态断言校验大小。
- 跨进程共享内存的结构体必须使用相同的编译选项与位宽，否则需要版本化。

### 19.11 如何检测代码中的可移植性问题？

- 编译告警 `-Wall -Wextra -Wconversion -Wsign-conversion -Wshadow` 能暴露类型转换与名称遮蔽问题。
- 在持续集成中使用多种编译器（GCC、Clang）与 `-m32`、`-m64` 两种位宽构建。
- 用 `-fsanitize=undefined` 捕获对齐、溢出与类型双关等问题。
- 静态分析工具可以发现平台相关的接口使用与未定义行为。
- 引入 `-Werror` 之前先清理存量问题，否则会阻塞正常提交。
- 定期在目标平台之外构建一次，可以提早发现头文件与宏的差异。

### 19.12（辨析）POSIX 线程与 Linux clone 的关系？

- POSIX 只规定线程语义，不规定实现方式。glibc 的 `pthread_create` 通过 `clone` 创建任务，共享地址空间、文件描述符表与信号处理等资源。
- `clone` 的标志位决定共享哪些资源，可以组合出介于进程与线程之间的形态。
- Linux 内核不用独立结构表示线程，统一用 `task_struct` 表示任务，线程组由 `tgid` 关联。
- `getpid` 返回线程组 id，`gettid` 返回内核任务 id，二者在单线程进程中相同。
- 信号可以按进程或按线程处理，`pthread_kill` 面向指定线程。
- POSIX 语义与 Linux 实现分层，移植时依赖语义而不是实现细节。

### 19.13 如何处理 errno 与错误码？

- `errno` 是线程局部的宏，展开为可修改的左值，只在调用失败后有意义。
- 成功的调用可能不改动 `errno`，因此必须先判断返回值再读取。
- 在调用其他可能修改 `errno` 的函数前保存原值，例如在错误处理路径中。
- `strerror` 不保证线程安全，`strerror_r` 有 GNU 与 XSI 两个版本，返回值语义不同。
- 系统调用在 C 库包装层把负返回值转换为 `-1` 并设置 `errno`，直接使用 `syscall` 时要自行处理。
- 错误码在不同系统上可能不同，跨平台代码应比较符号常量而不是数值。

### 19.14（陷阱）指针与函数指针转换有哪些可移植性问题？

- C 标准不保证数据指针与函数指针可以互相转换；POSIX 要求 `dlsym` 的返回值可以转换为函数指针。
- 指针与整数互转必须使用 `intptr_t` 与 `uintptr_t`，并保证宽度足够。
- 不同对象类型的指针之间转换后解引用，可能违反对齐要求。
- `void*` 与字符类型指针可以访问任意对象的字节表示，其他类型不保证。
- 使用 `reinterpret_cast` 转换时应确认目标平台的对齐与表示要求。

### 19.15 可移植代码如何处理字节序与对齐？

- 网络字节序用 `htonl`、`htons`、`ntohl` 与 `ntohs` 转换，浮点数需要按位拆分。
- 序列化时逐字段写入固定宽度类型，不依赖内存布局。
- 检测主机字节序可在运行期用联合体判断，也可用预定义宏。
- 避免类型双关，C++ 中用 `memcpy` 或 `std::bit_cast`（C++20）。
- 对齐用 `alignas` 指定，动态分配的对齐用 `aligned_alloc` 或 `posix_memalign`。
- `#pragma pack` 产生的非对齐成员在某些架构上访问代价高，或者直接触发异常。

### 19.16（场景）程序在 ARM64 上崩溃于非对齐访问，原因是什么？

- x86 对多数非对齐访问容忍，ARM64 的普通加载与存储允许非对齐，但原子与独占访问要求自然对齐。
- 打包结构体后取成员地址做原子操作，会触发对齐异常或产生不符合预期的行为。
- 部分 SIMD 指令与原子内建函数要求严格对齐。
- 修复方式是避免对打包成员取地址，先把值复制到对齐的局部变量再操作。
- `-Waddress-of-packed-member` 可以让编译器提示此类取址。
- 把对齐要求写进接口约定，不依赖架构的容忍度。

### 19.17 Linux 专有接口有哪些可移植替代？

- `epoll` 可用 `poll` 或 `select` 替代，代价是高连接数下的线性扫描。
- `eventfd` 可用管道替代，`timerfd` 可用 `timer_create` 加信号或超时参数替代。
- `signalfd` 可用 `sigwait` 或自管道替代。
- `io_uring` 在可移植层没有等价物，只能退回同步 IO 加线程池。
- `accept4`、`dup3` 与 `pipe2` 的原子标志位可用 `fcntl` 补设，但存在竞态窗口。
- 抽象命名空间的 UNIX 域套接字没有可移植替代，只能改用文件系统路径。

### 19.18（填空）需求与接口的对应关系？

| 需求 | POSIX 接口 | Linux 扩展 |
| --- | --- | --- |
| 多路复用 | `poll`、`select` | `epoll` |
| 事件通知 | 管道 | `eventfd` |
| 定时 | `timer_create`、`setitimer` | `timerfd` |
| 信号同步等待 | `sigwait` | `signalfd` |
| 异步 IO | `aio_read`、`aio_write` | `io_uring` |
| 获取对端凭据 | 无标准接口 | `SO_PEERCRED` |

- 表格中的 Linux 扩展只在目标内核支持时可用，使用前应做运行期或配置期探测。
- 可移植接口的能力有时更强，例如 `poll` 的返回结构比 `epoll` 的事件更通用。
- 替代不总是等价，管道没有 `eventfd` 的计数器语义，需要自行累加。
- 抽象命名空间套接字只在 Linux 上存在，跨平台实现只能使用路径名。

### 19.19 如何设计跨平台的系统调用封装？

- 封装层只暴露需要的语义，不暴露平台特有的句柄类型。
- 错误码统一为项目内定义的枚举，避免上层依赖 `errno` 数值。
- 条件编译集中在封装层的实现文件中，头文件保持平台无关。
- 句柄用 RAII 包装，析构时调用平台对应的关闭函数。
- 对不可移植的能力（如边缘触发）在接口上显式标注，或提供能力查询。
- 为封装层编写契约测试，在支持的平台上分别运行。

### 19.20 POSIX 中的未指定行为与实现定义如何区分？

- 未定义行为不要求任何结果；未指定行为在若干允许结果中由实现选择，程序仍然有效。
- 实现定义行为要求实现文档化其选择，例如位域的分配方向与 `char` 的符号性。
- 未指定行为的例子包括函数参数的求值顺序与 `printf` 中多个转换的求值次序。
- POSIX 允许实现提供扩展，开启扩展宏后代码不再严格符合标准，但仍是合法程序。
- `fork` 后子进程继承 stdio 缓冲，未刷新就退出会导致重复输出，标准对此有明确说明。
- 跨平台代码应只依赖标准明确规定的部分，把其余部分封装并测试。

---

## 20. 系统编程设计题

### 20.1（实现）如何设计低开销的异步日志库？

- 前端只做两件事：把时间戳、级别与参数写入固定大小的记录槽，再把槽的序号发布到无锁队列。
- 队列按生产者数量选择：每线程一个单生产者队列，或多生产者队列；前者实现简单且无争用。
- 后端线程批量取出记录，统一格式化后用 `writev` 一次写出，减少系统调用次数。
- 格式化放在后端完成，前端不解析格式串，避免在热路径上做字符串拼接。
- 背压策略要显式：队列满时丢弃并计数、阻塞等待，或降级为只记录元数据。
- 落盘策略区分 `write` 与 `fdatasync`，前者只进入页缓存，后者才保证数据落盘，频繁同步会显著降低吞吐。

### 20.2 日志的级别、采样与限流如何实现？

- 级别过滤在编译期可用宏消除，运行期用原子变量读取，避免每条日志都付出一次分支代价。
- 令牌桶按时间补充令牌，桶容量决定突发上限，超出时丢弃并累计丢弃计数。
- 相同日志去重：对格式串与关键参数取哈希，在滑动窗口内只输出首次与累计次数。
- 采样要保证关键级别不被丢弃，通常只对调试与信息级别采样。
- 限流状态需要可观测，否则丢日志的行为无法被发现。

### 20.3（实现）线程池的核心结构？

```cpp
void worker() {
    for (;;) {
        task t;
        {
            std::unique_lock lk(mu);
            cv.wait(lk, [&] { return closed || !q.empty(); });
            if (q.empty()) return;        // 已关闭且队列排空
            t = std::move(q.front());
            q.pop_front();
        }
        t();                              // 锁外执行，不阻塞提交方
    }
}
```

- 固定数量的工作线程，共享一个有界任务队列，用互斥量与条件变量或 futex 同步。
- 提交接口返回 `future` 或接受回调，任务以类型擦除的可调用对象存放。
- 关闭语义分两种：排空队列后退出，或立即取消未开始的任务；接口必须明确选择。
- 线程数默认取可用 CPU 数，容器中应按 cgroup 配额而非可见核数计算。
- 工作线程应处理任务抛出的异常，避免单个任务导致线程退出。
- 队列长度是背压信号，无界队列会把过载转化为内存增长。

### 20.4（辨析）线程池与事件循环如何选择？

- 阻塞式接口与 CPU 密集任务适合线程池，任务之间互不感知。
- 高并发短连接适合事件循环，单线程即可管理大量文件描述符。
- 事件循环中的回调不能阻塞，否则整个循环停摆；阻塞操作需要转移到线程池。
- 线程池的扩展受线程数与栈内存限制，事件循环的扩展受单核处理能力限制。
- 混合模型常见：IO 线程负责收发，工作线程负责计算。
- 状态共享复杂度不同：线程池需要锁或消息传递，事件循环天然单线程，但要注意回调重入。

### 20.5（实现）基于 epoll 的事件循环如何组织？

```cpp
int ep = epoll_create1(EPOLL_CLOEXEC);
int wake = eventfd(0, EFD_NONBLOCK | EFD_CLOEXEC);
epoll_event ev{};
ev.events = EPOLLIN;
ev.data.fd = wake;
epoll_ctl(ep, EPOLL_CTL_ADD, wake, &ev);
for (;;) {
    int n = epoll_wait(ep, events, 64, -1);
    for (int i = 0; i < n; ++i)
        dispatch(events[i]);   // 事件只表示就绪，不携带数据
}
```

- `epoll_create1(EPOLL_CLOEXEC)` 避免文件描述符泄漏到子进程。
- 用 `eventfd` 加入监听集合，其他线程通过写入唤醒循环，替代信号或超时轮询。
- `epoll_wait` 返回就绪事件列表，事件中的 `data` 由注册时指定，通常存放描述符或对象指针。
- 边缘触发必须配合非阻塞描述符，并在回调中循环读写到 `EAGAIN`。
- 定时任务用 `timerfd` 或最小堆实现，取最近到期时间作为 `epoll_wait` 的超时。
- 退出时按注册顺序关闭描述符，并在关闭前从集合中删除。

### 20.6（陷阱）边缘触发下为什么要循环读到 EAGAIN？

- 边缘触发只在状态变化时通知一次，未读尽的数据不会产生新的通知。
- 未读尽就返回，剩余数据滞留，连接表现为挂起。
- 描述符必须设为非阻塞，否则循环读取会在最后一次调用上阻塞。
- 读到 `EAGAIN` 或 `EWOULDBLOCK` 才表示内核缓冲区已空。
- 写方向同理，遇到 `EAGAIN` 应注册可写事件并缓存剩余数据。
- 水平触发下不读尽只会反复通知，不会丢事件，但会浪费 CPU。

### 20.7 事件循环中的定时器如何高效管理？

- 最小堆按到期时间排序，插入与删除为对数复杂度，适合定时器数量中等的场景。
- 时间轮按固定刻度分桶，插入与删除为常数复杂度，适合大量短定时器。
- 只用一个 `timerfd` 表示最近到期时间，到期后重新设置，避免为每个定时器创建描述符。
- 计时使用 `CLOCK_MONOTONIC`，避免系统时间调整影响超时。
- 定时器回调中注册或取消定时器要防止迭代器失效，通常先收集变更再统一应用。
- 到期处理要限制单轮处理数量，避免大量同时到期阻塞事件循环。

### 20.8（实现）内存池如何减少分配开销？

- 按固定大小分级，每个尺寸类维护空闲链表，分配与释放都是常数时间。
- 向系统批量申请大块内存（`mmap` 或 `sbrk`），再切分为对象，降低系统调用频率。
- 线程本地缓存避免每次分配都加锁，跨线程释放时归还到所属线程的远端链表。
- 对象的构造与析构仍由调用方负责，内存池只管理存储。
- 适用边界是频繁分配且生命周期相近的小对象，长生命周期对象的收益有限。
- 与通用分配器的差异在于放弃尺寸合并与碎片整理，换取分配速度。

### 20.9 内存池的回收与碎片如何控制？

- 设置空闲阈值，超过阈值时把整块归还系统，避免长期占用。
- 尺寸类之间的空闲块不能互换，碎片表现为某几个类耗尽而整体空闲充足。
- 大对象直接走 `mmap` 并在释放时归还，避免污染小对象池。
- 长时间运行的服务应定期统计各尺寸类的使用率，调整分级边界。
- 主动归还需要在合适的时机触发，不能放在热路径上。

### 20.10（实现）守护进程的标准步骤？

- 第一次 `fork` 后父进程退出，子进程调用 `setsid` 脱离控制终端并成为新会话首进程。
- 可选第二次 `fork`，使进程不再是会话首进程，避免后续打开终端设备时重新获得控制终端。
- `chdir("/")` 防止占用可卸载的目录，`umask(0)` 显式设定后续创建文件的权限。
- 把标准输入、标准输出与标准错误重定向到 `/dev/null`，或改接日志文件。
- 写入 pid 文件并用 `flock` 加锁，防止重复启动。
- 由 systemd 管理的环境不需要自行 daemon 化，使用 `Type=simple` 或 `Type=notify` 更利于监督与重启。

### 20.11（陷阱）daemon 化后日志为何丢失？

- `fork` 后子进程继承 stdio 缓冲区，缓冲区中的内容在退出时可能被重复写入或丢失。
- 关闭或重定向标准描述符后，原先指向终端的输出无处可去。
- `setvbuf` 设置的行缓冲在非终端设备上变为全缓冲，日志延迟明显。
- 应改为写 `syslog` 或独立日志文件，并在 daemon 化之前刷新所有缓冲区。
- 使用日志库时确认其在 `fork` 后有重新初始化描述符与锁的接口。

### 20.12（实现）基于 UNIX 域套接字的 IPC 框架如何设计？

- 选择类型：`SOCK_STREAM` 提供字节流，`SOCK_SEQPACKET` 保留消息边界并保证顺序。
- 地址长度受 `sun_path` 限制（通常 108 字节），长路径需要用抽象命名空间或 `chdir` 配合。
- 用 `SO_PEERCRED` 获取对端 uid、gid 与 pid，作为访问控制的依据。
- 消息用长度前缀加类型字段编码，接收方按长度读取，避免粘包与截断。
- 文件描述符传递用 `SCM_RIGHTS` 辅助数据，配合 `sendmsg` 与 `recvmsg`。
- 背压通过阻塞写或返回 `EAGAIN` 表达，框架需要提供明确的流控语义。

### 20.13（辨析）管道、消息队列与共享内存的分工？

- 管道提供字节流，没有消息边界，容量有限，适合父子进程或线程之间传递小数据。
- POSIX 消息队列保留消息边界并支持优先级，由内核持久化，适合同步请求响应。
- 共享内存避免数据复制，适合大数据量传递，但需要额外的同步机制。
- UNIX 域套接字支持双向通信、凭据传递与描述符传递，适合同机服务间通信。
- 选择依据是数据量、边界语义与同步成本，跨主机时只能用套接字。

### 20.14 共享内存方案的同步与生命周期如何设计？

- `shm_open` 加 `ftruncate` 加 `mmap(MAP_SHARED)` 是 POSIX 共享内存的标准路径。
- 跨进程互斥用 `pthread_mutex_t` 并设置 `PTHREAD_PROCESS_SHARED` 属性，或使用命名信号量。
- 持有者异常退出会使互斥量永久锁定，健壮互斥量（`PTHREAD_MUTEX_ROBUST`）让下一个加锁者得到 `EOWNERDEAD` 并修复状态。
- 生命周期用引用计数或外部协调者管理，`shm_unlink` 只删除名字，已映射的进程仍可访问。
- 布局必须固定：结构体大小、对齐与版本号写入头部，升级时校验版本。
- 崩溃恢复要考虑半写入的数据，用序号或校验和判断记录是否完整。

### 20.15 信号与事件循环如何安全集成？

- 用 `signalfd` 把信号转为文件描述符的可读事件，直接加入 `epoll` 集合，属于 Linux 专有方案。
- 可移植方案是自管道技巧：信号处理器只向管道写入一个字节，错误码保存为 `errno` 的副本。
- 处理器内只能调用异步信号安全的函数，不能加锁，不能分配内存。
- 用 `pthread_sigmask` 在主线程屏蔽信号，再由专用线程处理，避免信号打断任意线程。
- `SA_RESTART` 决定被中断的系统调用是否自动重启，事件循环通常不希望自动重启。
- 信号处理与事件循环共享的数据要用原子变量或 `sig_atomic_t` 传递。

### 20.16（场景）单机连接数上万时，文件描述符与内存如何估算？

- 每个连接至少占用一个文件描述符，需要检查 `RLIMIT_NOFILE` 与 `/proc/sys/fs/file-max`。
- 内核为每个 socket 分配读写缓冲区，大小受 `net.ipv4.tcp_rmem`、`tcp_wmem` 与 `SO_RCVBUF` 约束。
- 应用层缓冲区按连接数乘以单连接缓冲大小估算，应设置上限并支持按需分配。
- 内存总量要与 cgroup 限额对比，socket 缓冲区计入 `memory.current`。
- 连接状态结构体与定时器也占内存，估算时不能只算缓冲区。
- 达到上限时的行为要明确定义：拒绝新连接还是关闭空闲连接。

### 20.17（实现）如何实现平滑重启？

- 新进程启动后先完成初始化，再开始接受连接；旧进程停止受理新连接但继续处理在途请求。
- 监听描述符可以通过 `fork` 继承，或用 `SCM_RIGHTS` 从旧进程传递，避免端口短暂不可用。
- 使用 `SO_REUSEPORT` 时内核按连接分发，新旧进程可以同时监听，但连接分布不可控。
- 旧进程在空闲后退出，同时设置最长等待时间强制结束。
- 用 `sd_notify` 通知 systemd 就绪状态，避免监督器在初始化完成前转发流量。
- 升级失败要有回滚路径，旧进程在确认新进程就绪之前不能退出。

### 20.18（场景）日志写入阻塞导致主线程卡顿，如何定位与解决？

- 先用 `strace -T` 或 perf 观察 `write` 的耗时分布，确认阻塞发生在写入还是同步。
- 磁盘写满、配额耗尽或后端存储抖动都会让 `write` 阻塞，检查内核日志与挂载参数。
- 每次写入后调用 `fsync` 会把延迟直接暴露给调用方，改为批量同步可以显著降低抖动。
- 同步日志在多线程下还会争用同一把锁，锁等待表现为用户态自旋或睡眠。
- 解决方向是异步化并设置队列上限，同时保留一条同步通道用于致命错误。
- 日志路径的延迟必须与业务路径隔离。

### 20.19 错误处理与资源管理的统一策略？

- 文件描述符用 RAII 包装，析构时关闭，移动语义表达所有权转移。
- 系统调用失败时立即保存 `errno` 并转换为项目内的错误类型，避免被后续调用覆盖。
- 部分失败需要回滚：按获取的逆序释放资源，或使用作用域守卫。
- C 接口边界不使用异常，C++ 内部可以用异常表达不可恢复错误。
- 可恢复错误（`EAGAIN`、`EINTR`）与致命错误分开处理，前者重试，后者上报。
- 每个资源获取点都要有对应的失败路径测试。

### 20.20（场景）设计可观测的 IPC 框架需要哪些指标？

- 请求延迟按分位数统计，并配合超时计数。
- 队列深度与背压次数，反映消费者是否跟得上。
- 错误码分布，按接口与对端聚合。
- 连接数与文件描述符使用量，接近上限时提前告警。
- 消息大小分布，用于判断缓冲区配置是否合理。
- 指标采集本身要低开销，内置计数器加定期导出优于逐请求日志。
