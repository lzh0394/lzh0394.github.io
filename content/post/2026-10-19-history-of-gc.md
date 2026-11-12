---
title: GC 的历史
slug: "history-of-gc"
date: 2026-10-19
categories: ["计算机基础"]
tags:
  - 垃圾回收/GC
  - 内存管理
draft: false
summary: 从 1959 年 McCarthy 为 Lisp 设计的标记-清扫，到 Collins 的引用计数、Cheney 的半空间复制、Dijkstra 的三色标记、1980 年代的分代假说、Boehm 的保守式收集，再到 2000 年代以后 G1、ZGC 的低延迟路线与 Go、Ruby、Lua、Python 各自的分岔：按时间线梳理垃圾回收六十余年的主线，并区分当年的设计动机、规范保证与今天的实现现状。
---

> 垃圾回收（garbage collection，GC）指运行时自动判断哪些堆对象已经不可达，并回收它们占用的存储。它今天几乎是所有托管语言和脚本语言的标配，但最初只是 Lisp 实现里的一个工程选择。本文按时间顺序梳理这条线：1959 年前后 McCarthy 的标记-清扫、1960 年 Collins 的引用计数、1970 年代 Cheney 的复制式收集与 Baker 的实时收集、1978 年 Dijkstra 的三色标记、1983–1984 年的分代假说、1988 年 Boehm 的保守式收集，以及 1990 年代以后托管运行时、低延迟收集器和脚本语言各自的分岔。依据是原始论文、OpenJDK JEP 和语言官方文档；英文维基只用来找线索，结论落到一手来源上。

---

## 零、时间线

| 年份 | 事件 | 出处 |
| --- | --- | --- |
| 1958–1959 | McCarthy 在 IBM 704 上为 Lisp 实现标记-清扫 | McCarthy《History of Lisp》 |
| 1960 | Collins 在 48 位 CDC 计算机上使用引用计数 | 同上 |
| 1960-04 | McCarthy 的 CACM 论文描述 Lisp 与存储回收 | 《Recursive Functions of Symbolic Expressions》 |
| 1970 | Cheney 提出非递归的复制式紧凑算法 | CACM 13(11) |
| 1975 | Steele 提出多处理器上的紧凑式收集 | CACM 18(9) |
| 1978 | Dijkstra 等提出 on-the-fly 三色标记 | CACM 21(11)，EWD630 |
| 1978 | Baker 提出实时增量复制收集 | CACM 21(4) |
| 1983 | Lieberman 与 Hewitt 提出基于对象生命周期的收集 | CACM 26(6) |
| 1984 | Ungar 在 Smalltalk-80 上实现 Generation Scavenging | SIGPLAN Notices 19(5) |
| 1988 | Boehm 与 Weiser 提出保守式 C GC | SPE 18(8) |
| 1991 | Python 0.9.0 发布，用引用计数管理对象 | CPython 文档 |
| 1995–1996 | Java 发布；JVM 规范不规定 GC 算法 | JVM 规范 |
| 2000 | Python 2.0 加入循环垃圾检测 | Python 2.0 What's New |
| 2002 | .NET Framework 1.0 自带分代、标记-压缩 GC | .NET 文档 |
| 2004 | G1 论文发表 | ISMM 2004 |
| 2008 | C++0x 加入“最小 GC 支持”（N2670）；Immix 论文发表 | WG21 论文、PLDI 2008 |
| 2011 | Azul C4 并发压缩收集器 | ISMM 2011 |
| 2013 | Ruby 2.1 引入 RGenGC | Ruby 发布说明 |
| 2015 | Go 1.5 改为并发三色标记清扫 | Go 官方博客 |
| 2019 | V8 总结 Orinoco 的并行、并发与增量化 | V8 博客 |
| 2020 | Lua 5.4 引入分代模式 | Lua 5.4 参考手册 |
| 2021 | P2186R2 提议从 C++23 移除 GC 支持 | WG21 论文 |
| 2022 | OCaml 5.0 重写支持多核的运行时 | OCaml 发布说明 |
| 2024 | JDK 23 让 ZGC 默认分代；Ruby 3.4 提供模块化 GC | JEP 474、Ruby 发布说明 |
| 2025 | JDK 24 删除 ZGC 非分代模式；Python 3.14 增量循环 GC；Go 1.25 实验性 Green Tea | JEP 490、Python 文档、Go 博客 |

时间线里最值得注意的对子不是“最早的算法”而是“同一个想法被重新启用”：三色标记在 1978 年只是可行性论证，分代在 1983 年只是实时系统的技巧，两者都在 2010 年代之后成了默认。下面按主题展开。

---

## 一、1959–1960：Lisp 的 erasure 问题与两种答案

McCarthy 在 1979 年的回忆里把时间点写得很清楚：LISP 的实现始于 1958 年秋。当时要解决的一个问题是存储的“erasure”——程序员用完的表结构必须显式释放，否则堆很快耗尽。他考虑过两种方案：引用计数，以及垃圾回收。

引用计数在当时的机器上不可行。IBM 704 的一个字是 36 位，CAR 和 CDR 各占 15 位，剩下的 6 个位还不连续，放不下一个可靠的计数字段。于是只剩垃圾回收：当空闲表用完时，从程序变量和栈出发标记所有可达的存储，再把未标记的部分重新串成空闲表。原文是：

> storage is abandoned until the free storage list is exhausted, the storage accessible from program variables and the stack is marked, and the unmarked storage is made into a new free storage list

这个选择的后果比算法本身更重要：一旦运行时能自动回收，编译器就不必在每次赋值后插入释放代码，实现可以推迟到运行时再做。语言语义与内存管理从此解耦，这是后来所有托管语言的起点。

引用计数并没有消失。McCarthy 在同一篇回忆里提到，Collins 于 1960 年在 48 位 CDC 计算机上用了引用计数方案。RC 的优点是即时回收、局部性好、不需要全局暂停；缺点是每次指针赋值都要改计数（并发下还要原子操作），而且收不掉环。环的问题要等到 2000 年 Python 2.0 才在主流运行时里补上。

McCarthy 在 1960 年 4 月的 CACM 论文里正式描述了 Lisp 与它的存储回收机制，这篇论文后来成了整个分支的引用起点。

---

## 二、1970s：复制、紧凑与“边分配边回收”

标记-清扫有个长期麻烦：空闲区被切成大小不一的碎块，分配器要在 free list 里找合适的一块，堆越用越碎。

1970 年 Cheney 的算法改变了这一点：把堆分成两块半空间（semispace），回收时把存活对象复制到另一块，然后整体切换。算法用 scan 指针隐式地做广度优先遍历，不需要递归栈，也不需要在对象里留标记位——这就是今天所有 copying/scavenging 收集器的祖先。

复制式收集的代价是有效堆只有一半，而且复制成本与存活对象数成正比。这个代价恰好和一条经验观察对上了：大多数对象分配后很快就死。于是复制式在年轻代里反而便宜——只复制少数活下来的对象，其余空间整块丢弃。

同一时期还有两条支线：

- 1975 年 Steele 的《Multiprocessing Compactifying Garbage Collection》把紧凑式收集搬到多处理器上，是最早的并发收集尝试之一。
- 1978 年 Baker 的《List Processing in Real Time on a Serial Computer》面向实时系统，把收集工作摊到每次分配上，并用 to-space invariant 保证 mutator 永远看不到“只复制了一半”的对象。

---

## 三、1978：三色标记与并发收集的框架

Dijkstra、Lamport、Martin、Scholten、Steffens 在 1978 年的《On-the-fly garbage collection: an exercise in cooperation》里给出了一个至今仍在用的框架。

对象被分成三种颜色：白色表示尚未访问、可能已死；灰色表示已访问但其子对象还没扫完；黑色表示已访问且子对象都扫完。收集器从根出发把对象涂灰、扫完涂黑；结束时仍是白色的就是垃圾。

问题在于收集器和 mutator 并发运行，指针随时可能被改：mutator 可能把黑对象指向白对象的唯一引用挪走，让收集器漏掉这个白对象。解法是写屏障——mutator 写指针时顺手把目标对象“shade”成灰色，从而维持“没有黑色对象指向白色对象”的不变量。

这篇论文的自我定位很克制。它说目的不是给垃圾回收这门技艺做贡献（“It is not our purpose to contribute specifically to the art of garbage collection”），也没有声称有实际意义，而是把 GC 当作一个并发算法的练习：两个进程在共享存储上协作，一个改堆、一个回收，如何保证正确性。论文里也因此留下了 mutator 和 collector 这两个术语。

讽刺的是，这个“练习”成了后来所有低延迟收集器的骨架。Go 1.5 的博客直接写明并发三色标记“idea first proposed by Dijkstra in 1978”；ZGC、Shenandoah 的并发标记也是同一套颜色与屏障。真正把它变成工程默认要等到 2010 年代：多核普及、写屏障成本可接受、卡表和位图等辅助结构成熟。

---

## 四、1983–1984：分代假说

分代的出发点是一条关于对象寿命的观察，通常拆成两条假说：

- 弱分代假说：大多数对象死得早。
- 强分代假说：活得越久的对象，越可能继续活下去。

Lieberman 与 Hewitt 在 1983 年的《A Real-Time Garbage Collector Based on the Lifetimes of Objects》里把这条观察做成了收集器结构；Ungar 在 1984 年的《Generation Scavenging》里把它落到了 Smalltalk-80 上，成为后来几乎所有分代收集器的模板。

结构大体是：

- 年轻代用复制式 scavenger，只扫这一小块，暂停短。
- 存活过若干轮的对象晋升到老年代，老年代用标记-清扫或标记-压缩，收集频率低得多。
- 用写屏障维护一个“老年代指向年轻代”的引用集合（remembered set），scavenger 把它当额外根，不必遍历整个老年代。

收益是收集频率与堆总量解耦：年轻代可以收得很勤而不碰老年代，老年代可以很久才收一次。代价是写屏障、跨代引用的簿记，以及老年代的碎片（所以老年代最终仍需压缩式或标记-压缩式回收）。

分代从此成为托管运行时的默认结构：HotSpot、.NET、V8、Ruby 的 RGenGC、Lua 5.4、JDK 21 起的分代 ZGC 都是。真正拒绝分代的只有 Go（见第八节）。

---

## 五、1988：保守式收集与 C/C++ 的库方案

Boehm 与 Weiser 在 1988 年的《Garbage Collection in an Uncooperative Environment》里换了个思路：不要求编译器配合，也不要求程序把指针放在特定位置。收集器把栈和寄存器里的每个字都当作“可能的指针”去尝试标记，能标记到就保守地认为对象还活着。

代价有两条：一是可能误留（一个恰好等于堆地址的整数会让对象多活一阵），二是不能移动对象（保守扫描无法安全更新所有指针）。但对 C/C++ 来说这是唯一可行的路线——编译器不会告诉你哪个字是指针。

这条路线的影响一直延续到今天：Boehm GC 仍是 C/C++ 生态最常用的收集器，Unity 引擎依赖它。它也说明，在 C/C++ 里 GC 是库层面的方案，不是语言方案。C++ 标准曾经反过来尝试过，结果见第九节。

---

## 六、1990s–2000s：托管运行时把 GC 变成平台契约

Java 在 1995–1996 年出现时，JVM 规范只要求“堆由运行时自动回收”，不规定用什么算法。这给了实现自由，也让收集器成了各 JVM 的竞争点。HotSpot（Java 1.3 起）采用分代结构：年轻代复制，老年代标记-压缩或标记-清扫；先是串行收集，然后有并行的年轻代收集（`-XX:+UseParallelGC`），再到 CMS（并发标记清扫，1.4 时代引入，5.0 起正式）。CMS 后来在 JDK 9 被弃用（JEP 291）、JDK 14 移除（JEP 363）——原因正是并发标记清扫留下的碎片在长时间运行的服务里不可接受。

.NET Framework 1.0 于 2002 年发布，从第一版就是分代（第 0/1/2 代，大对象堆另算）、标记-压缩，并提供工作站与服务器两种模式，后来加入后台 GC。和 Java 一样，GC 是平台契约的一部分，程序员默认不写释放代码。

Python 走的是另一条路：1991 年的 0.9.0 就用引用计数，每个对象维护计数，计数归零立即回收。2000 年的 2.0 加入循环垃圾检测（`gc` 模块），用一个周期性的标记-清扫收集器补上 RC 收不掉的环。这条“RC 主干 + 周期收集器”的路线一直保留到今天，3.14 只是把周期收集器改成了增量式。

共同的变化是：GC 从“实现细节”变成“语言契约”。程序员开始默认内存会自动回收，手动 `free` 从常态变成特例。

---

## 七、2000s–2020s：低延迟成为主要目标

堆变大、服务常驻之后，目标从“吞吐最大化”转向“暂停时间可控”。

G1 是这一转向的标志。Detlefs 等人的论文（ISMM 2004）把堆划分成大小固定的 region，用并发标记（SATB）找出各 region 的存活率，再按“垃圾优先”挑选回收收益最高的 region，配合 `-XX:MaxGCPauseMillis` 的停顿预测模型。G1 在 JDK 7u4 引入，JDK 9 成为默认（JEP 248），理由写得很直白：限制暂停通常比最大化吞吐更重要。

CMS 的退场和 G1 的上位说明一件事：并发标记清扫解决了暂停，却留下碎片；分代复制解决了碎片，却要求能移动对象。低延迟收集器要在两者之间找平衡。

- Azul C4（ISMM 2011）用读屏障加自愈（self-healing）实现并发压缩：mutator 读到过期指针时顺手把它修好，收集器不必停下来更新所有引用。
- ZGC 在 JDK 11 以实验形式出现（JEP 333），JDK 15 生产可用（JEP 377）。它用 colored pointer 把元数据放进指针低位，用 load barrier 在读取时修正被移动的对象，暂停目标是不超过 1ms，堆从几百 MB 到数 TB。最初它不分代。
- Shenandoah 在 JDK 12 实验（JEP 189）、JDK 15 生产（JEP 379），用 Brooks forwarding pointer 加 load reference barrier 做并发疏散。
- Immix（PLDI 2008）走的是另一条路：mark-region，把标记与复制结合起来，按块回收，既减少碎片又不必整堆复制。

这一阶段的主题是：暂停从几百毫秒压到毫秒甚至亚毫秒，代价是屏障、并发正确性和实现复杂度。

---

## 八、2010s–2020s：分代回归与各语言的分岔

### ZGC 绕回分代

JEP 439（JDK 21）给 ZGC 加了分代模式，用 `-XX:+ZGenerational` 启用。理由很实际：非分代 ZGC 每次都要标记整个堆，分配率高时成本太高。分代版用双缓冲的位图 remembered set、SATB 标记、两次遍历（先标记年轻代与老年代，再重定位），可以只压缩年轻代而不额外占堆。JEP 474（JDK 23）把分代设为默认，JEP 490（JDK 24）直接删掉了非分代模式。

这是一个有意思的回归：低延迟收集器绕了一圈，还是回到了 1984 年的分代结构。

### Go：拒绝分代

Go 1.5（2015-08）把 GC 改成并发三色标记清扫，官方博客明确引用 Dijkstra 1978 的想法，目标是暂停低于 10ms，并用 `GOGC` 一个旋钮控制堆增长。此后 Go 一直不分代，理由是分代的写屏障与调参成本不值得，靠并发标记、快速分配和后续优化来压暂停（1.5 时仍需在标记前后短暂 STW 扫根）。

2025 年的 Green Tea（Go 1.25 以 `GOEXPERIMENT=greenteagc` 提供）把标记从按对象改为按页，官方数据是 GC 的 CPU 成本降低 10%–40%（中位约 10%），并计划在 Go 1.26 转为默认、加入 AVX-512 向量化。它仍然是并发三色标记清扫，不是分代。

### V8 Orinoco

V8 的 Orinoco 项目把原本顺序、stop-the-world 的收集器改造成并行加并发为主、增量兜底（2019 年的博客做了总结）。结构是分代的：年轻代用 scavenger（半空间复制，nursery 与 intermediate 两级），老年代用标记-压缩/标记-清扫，压缩只对碎片化严重的页做。博客把三个词定义得很清楚：

- parallel：主线程与辅助线程同时做同样的工作，仍然是 STW，暂停时间约除以线程数。
- incremental：主线程间歇做一小片，工作总量不降反略增，但把延迟摊开。
- concurrent：辅助线程完全在后台做，主线程继续跑 JavaScript，最难，因为有读写竞争。

Orinoco 还引入了空闲时间 GC：由嵌入者（Chrome）在 16.6ms 的帧预算空隙里触发，官方数据是 Gmail 空闲时堆内存下降 45%。

### 脚本语言

- Lua 5.4（2020-06）同时提供增量与分代两种模式，用 `collectgarbage` 切换，参数是 pause、step multiplier、step size。手册明确说 GC 行为在不同平台和不同 Lua 版本之间不可移植。
- Ruby 2.1（2013-12）引入 RGenGC：用写屏障支持分代，但只对部分对象分代，以控制写屏障成本。Ruby 3.4（2024-12）进一步把 GC 模块化：构建时 `--with-modular-gc`，运行时 `RUBY_GC_LIBRARY` 选择实现，并提供了实验性的 MMTk 后端。
- Python 3.14（2025-10）把循环 GC 改成增量式，不再一次扫完；同时 free-threaded 模式的性能损失降到约 5%–10%。
- OCaml 5.0（2022-12）为共享内存并行重写运行时：多个 domain 并行，每个 domain 有独立的年轻代，主堆共享。这是“GC 跟上多核”的又一次重写。

---

## 九、C++ 标准里的 GC 支线

C++ 曾经在标准层面尝试过 GC 支持。2008 年 N2670 给 C++0x 加入了“最小 GC 支持”：核心语言定义 strict pointer safety 与 safely-derived pointer，库提供 `declare_reachable`、`undeclare_reachable`、`declare_no_pointers`、`undeclare_no_pointers`、`get_pointer_safety`，以及 `pointer_safety` 枚举和 `__STDCPP_STRICT_POINTER_SAFETY__` 宏。

这套设施没有实现。2021 年 4 月的 P2186R2 提议移除（不是弃用），理由是：作者不知道有任何实现，ISOCpp code search 只在 GCC 和 LLVM 里命中过，而 libc++、libstdc++、MSVC 三家都只有 relaxed pointer safety；规范本身也自相矛盾，比如用 placement new 在局部数组上构造对象得到的指针不是 safely-derived，而 `declare_reachable` 又要求参数已经是 safely-derived；WG14 十年来没有跟进；C 分配函数隐含 reachable 的规定也含混。EWG 在 2020-07-30 以 3/9/4/0/1 表决“在 C++23 移除（不弃用）”，LEWG 在 2020-12-14 以 10/4/3/0/0 通过。这套设施在 C++23 中删除，名字进入 zombie names。

值得记的一点：这不是“GC 在 C++ 里行不通”，而是“标准层面的最小支持没有实现，而生态用库解决了”。P2186R2 自己也列了成功的例子：Boehm GC、Unity、WebKit JSC 的 Riptide、Chromium Blink 的 Oilpan、V8 的 Orinoco、SpiderMonkey、Lua/LuaJIT。

---

## 十、今天的共识与分歧

共识部分相当稳定：三色标记、写屏障、分代、并发/并行、增量兜底，几乎是所有现代收集器的配方，暂停时间以毫秒计。1980 年代的两个发明——三色标记（1978）与分代（1983–1984）——至今没有被替代。

分歧主要有三处：

分代要不要。Go 认为分代带来的写屏障与调参成本不值得，靠并发标记与页级优化压暂停；ZGC 则从非分代回到分代，因为分配率高时全堆标记太贵。两边都对，取决于分配率、堆大小和延迟目标。

引用计数还是 tracing。Python 仍以 RC 为主干，优点是即时回收、无全局暂停，代价是环与计数开销；其余主流运行时都是 tracing。

移动还是不移动。复制/压缩解决碎片、加快分配，但需要 forwarding 与读写屏障，而且不能和保守式扫描共存；Boehm 这类 C/C++ 方案只能不移动。

一句话概括：GC 的历史是“把释放内存的决定从程序员手里拿走”的历史，前半程解决正确性，后半程解决延迟，而它至今仍站在 1959 年那个选择的基础上——既然运行时知道哪些存储可达，就不该让程序员手动去数。

---

## 参考资料

- John McCarthy，*History of Lisp*（1979-02-12），<http://www-formal.stanford.edu/jmc/history/lisp/node3.html>
- John McCarthy，*Recursive Functions of Symbolic Expressions and Their Computation by Machine, Part I*，CACM，1960-04，<http://www-formal.stanford.edu/jmc/recursive/recursive.html>
- C. J. Cheney，*A Nonrecursive List Compacting Algorithm*，CACM 13(11)，1970
- Guy L. Steele Jr.，*Multiprocessing Compactifying Garbage Collection*，CACM 18(9)，1975
- Edsger W. Dijkstra 等，*On-the-fly Garbage Collection: An Exercise in Cooperation*，CACM 21(11)，1978，<https://www.cs.utexas.edu/~EWD/transcriptions/EWD06xx/EWD630.html>
- Henry G. Baker，*List Processing in Real Time on a Serial Computer*，CACM 21(4)，1978
- Henry Lieberman、Carl Hewitt，*A Real-Time Garbage Collector Based on the Lifetimes of Objects*，CACM 26(6)，1983
- David Ungar，*Generation Scavenging: A Non-disruptive High Performance Storage Reclamation Algorithm*，SIGPLAN Notices 19(5)，1984
- Hans-J. Boehm、Mark Weiser，*Garbage Collection in an Uncooperative Environment*，Software: Practice and Experience 18(8)，1988
- David Detlefs 等，*Garbage-First Garbage Collection*，ISMM 2004
- Gil Tene 等，*C4: The Continuously Concurrent Compacting Collector*，ISMM 2011
- Stephen M. Blackburn、Kathryn S. McKinley，*Immix: A Mark-Region Garbage Collector*，PLDI 2008
- OpenJDK JEP：JEP 248、JEP 333、JEP 363、JEP 377、JEP 379、JEP 439、JEP 474、JEP 490，<https://openjdk.org/jeps/>
- Go 博客，*Go 1.5 concurrent garbage collector pacing*，<https://go.dev/blog/go15gc>；*Green Tea*，<https://go.dev/blog/greenteagc>
- V8 博客，*Trash talk: the Orinoco garbage collector*（2019-01-03），<https://v8.dev/blog/trash-talk>
- Lua 5.4 参考手册，<https://www.lua.org/manual/5.4/manual.html>
- Python 文档，*What's New in Python 2.0*（循环 GC），<https://docs.python.org/3/whatsnew/2.0.html>；*What's New in Python 3.14*（增量 GC），<https://docs.python.org/3.14/whatsnew/3.14.html>
- Ruby 发布说明，Ruby 2.1.0（2013-12-25）、Ruby 3.4.0（2024-12-25），<https://www.ruby-lang.org/en/news/>
- .NET 文档，*Fundamentals of garbage collection*，<https://learn.microsoft.com/dotnet/standard/garbage-collection/fundamentals>
- OCaml 5.0 发布说明，<https://ocaml.org/releases/5.0.0>
- WG21 P2186R2，*Removing Garbage Collection Support*（2021-04-16），<https://wg21.link/P2186R2>
