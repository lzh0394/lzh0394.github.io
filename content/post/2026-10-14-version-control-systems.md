---
title: "版本管理软件简介"
slug: "version-control-systems"
date: "2026-10-14"
tags: ["版本控制", "Git"]
draft: false
summary: "先把版本控制从 SCCS/RCS 到 Git、GitHub、Sapling 的演变按时间线串起来，再按本地、集中式、分布式三代模型梳理，重点讲 Git 的对象模型与三区结构，并对比 Subversion、CVS、Perforce P4、TFVC、Mercurial、Fossil、Bazaar、Unity Version Control 等工具的定位与现状；另用一节区分快照模式与 delta 模式（语义层 vs 存储层、Git packfile delta、restic 内容定义分块、备份的全量/增量/差异），最后给出大文件、权限与选型建议。"
---

> 版本管理软件（Version Control System, VCS）解决的核心问题只有一个：**谁在什么时候改了什么，以及为什么改**。本文先讲历史，再讲模型与具体软件，最后给选型。

---

## 0. 总览

本地与集中式：

| 工具 | 模型 | 现状 | 典型场景 |
|---|---|---|---|
| SCCS / RCS | 本地、单文件 | 已退出主流 | 单文件留痕（RCS 仍在维护） |
| CVS | 集中式 | 停止维护（末版 2008） | 老项目遗留 |
| Subversion | 集中式 | 维护中 | 需要目录级权限、线性历史 |
| Perforce P4（原 Helix Core） | 集中式 | 商业活跃 | 超大二进制资产（游戏） |
| TFVC | 集中式 | feature complete，新项目不推荐 | 旧微软技术栈 |

分布式与混合模型：

| 工具 | 模型 | 现状 | 典型场景 |
|---|---|---|---|
| Git | 分布式 | 事实标准 | 通用开发 |
| Mercurial | 分布式 | 维护中 | Python 生态、命令一致性偏好 |
| Fossil | 分布式 + 内置协作 | 活跃 | 想单文件部署的小团队 |
| Bazaar (bzr) | 分布式 | 已冻结（Breezy 分支续存） | 无 |
| Pijul / Darcs | 分布式、补丁理论 | 小众但活跃 | 对补丁语义感兴趣 |
| Unity Version Control | 集中式 + 分布式 | 商业活跃 | 游戏与美术资源 |

一句话结论：新项目的默认选择是 Git，但这是生态、托管平台与招人成本上的默认，不等于技术上全面胜出。在「超大二进制资产」「需要目录级权限」「内网合规」这几类场景下，集中式工具（SVN、Perforce、TFVC）至今仍在大量生产环境里跑着。

---

## 1. 历史

版本控制工具的形态，取决于三件事：同一时刻有多少人改同一份代码、历史存在谁的机器上、以及一次提交被当成什么。按这三条线索，五十多年大致可以分为五段。

### 1.1 文件级与加锁（1970s–1980s）

最早的版本控制是单文件的。SCCS 于 1972 年底由 Marc J. Rochkind 在贝尔实验室为 IBM System/370 上的 OS/360 写出，1973 年用 C 重写，1977-02-18 随 PWB/UNIX 发布第 4 版。它把每个文件的历史以交错 delta（interleaved delta，也称 weave）存进 `s.` 开头的文件，取出某个版本时再重建。这个格式后来被 Solaris TeamWare 与 BitKeeper 沿用。

1982 年 Walter F. Tichy 在普渡大学发布 RCS，改用反向 delta：最新版整份保存，旧版存「如何退回上一版」的编辑指令，因此取最新版最快。RCS 用 `ci`/`co` 存取，默认给文件加锁，同一时间只允许一个人改。两者都只管单个文件，没有项目概念，也没有跨文件的原子提交；分支语法笨重，团队实际上多半只维护一条主线。

这一段的前提是「一个文件同时只有一位作者」。锁在当时是合理的：没有可靠的自动合并，同时改就是事故。

### 1.2 集中式与合并模型（1986–2000s）

1986 年 Dick Grune 为和两个学生协作写出 CVS 的脚本版，1989 年 4 月 Brian Berliner 重写，1990-11-19 发布 1.0。CVS 在 RCS 的存储之上加了客户端-服务器与「复制—修改—合并」：每人一份工作副本，提交时服务器只接受基于最新版的改动，冲突留给人工解决。1990 年代的开源项目大多用它。

CVS 的缺陷很具体：多文件提交不是原子的，不能重命名文件，目录不纳入版本控制，分支是对每个文件分别打标签，合并几乎无法追踪。商业工具走了另一条路：Atria 1992 年的 ClearCase 用版本化文件系统（MVFS）与动态视图把版本控制做进文件系统；Perforce 1995 年发布，主打高并发与二进制文件锁；微软 1995 年的 Visual SourceSafe 把仓库放在共享目录，简单但容易损坏。

2000 年 CollabNet 启动 Subversion，目标是「CVS done right」：原子提交、目录版本化、真正支持重命名，2004-02-23 发布 1.0。2005 年前后微软的 TFVC 随 TFS 推出。集中式在这一阶段胜出，靠的是网络与权限的现实：服务器是唯一真相，管理员能审计一切，目录级 ACL 可以直接落地。代价是单点，以及离线时只能看不能提交。

### 1.3 分布式的一年（2001–2005）

分布式的想法不是 2005 年才有的。Sun 的 TeamWare 在 1990 年代就把完整历史放在本地；2001 年 Tom Lord 的 GNU Arch、2003 年 David Roundy 的 Darcs（补丁理论）、2003 年 Graydon Hoare 的 Monotone（内容寻址与密码学哈希）、2003 年 Chia-liang Kao 的 SVK 都在试。它们证明「每个克隆都有完整历史」可行，但都没同时解决速度与易用性。

转折点是 BitKeeper。它 2000-05-04 首次公开发布，2002 年起被 Linux 内核采用；许可是专有的，免费版还禁止使用者参与开发竞争工具。2005 年 4 月，Andrew Tridgell 写出能读取 BitKeeper 元数据的客户端，BitMover 随即收回社区免费授权，免费支持在 2005-07-01 终止，内核必须换掉版本控制。

Git 在 2005 年 4 月初由 Linus Torvalds 动手，4 月 7 日 Git 仓库里出现第一个提交；Mercurial 由 Matt Mackall 在 4 月 19 日公布；Bazaar 在 3 月 26 日已经发布。Git 的设计直接对着内核的需求：内容寻址的对象库、不可变的历史、几乎零成本的分支、足够快的本地操作。分布式从此不只是「能离线提交」，而是「分支便宜到可以每人一条」。

这里还有一层影响：BitKeeper 事件说明，工具的所有权会直接变成开发流程的风险。后来开源项目偏好能自己托管的开源工具，多少有这件事的影子。

### 1.4 平台化（2008–2015）

2008 年 4 月 GitHub 上线，把 fork 与 pull request 做成默认协作方式；GitLab 2011 年出现，Bitbucket 也在 2008 年上线（2010 年被 Atlassian 收购）。托管平台补上了 Git 最弱的一环——权限、评审与项目发现：仓库仍然是分布式的，日常协作却围绕一个中央平台展开。

这一时期 Git 从「Linux 内核的工具」变成默认工具：IDE、CI、代码评审、包管理器都围着它建。2015 年 Git LFS 发布，用指针文件把大文件挪出仓库，算是给对象模型打的补丁。Mercurial 在 Mozilla 从 2007 年用到 2023 年前后（之后迁回 Git）；Meta 把 Mercurial 改造成能扛超大仓库的版本，这些实践后来变成了 Sapling。微软这边，TFVC 随 TFS 进入 Azure DevOps，官方后来把它标为 feature complete，新项目默认导向 Git；2017 年的 GVFS（后来的 VFS for Git）则是为了在 Windows 上克隆超大仓库。

### 1.5 收敛与再分化（2015–）

今天 Git 是默认答案，短板也清楚：二进制大文件、超大 monorepo 的克隆与状态查询、以及命令界面的历史包袱。应对分两类。一类是在 Git 内部加机制：partial clone、commit-graph、reftable、SHA-256，加上 LFS。另一类是换模型：Jujutsu 把工作副本当成一个可修改的提交，用 change ID 把「改动」与「提交」分开；Sapling 沿用 Mercurial 的血缘，提供更接近集中式的体验并兼容 Git 仓库；Pijul 继续走 Darcs 的补丁代数；Fossil 从 2006 年起把 wiki、缺陷跟踪与 Web 界面塞进一个 SQLite 文件。商业阵营里，Perforce 与 Unity Version Control 仍然守着超大二进制资产。

集中式的需求也以另一种形式回来了：monorepo 需要一个权威的中央仓库，服务端权限、code owners、CI 门禁都长在平台上。所谓「分布式取代集中式」，描述的是模型，不是日常协作的实际形状。

### 1.6 一条时间线

1972–1995：

| 时间 | 事件 | 留下的东西 |
|---|---|---|
| 1972 | SCCS 在贝尔实验室开始开发 | 第一个被广泛使用的版本控制系统；文件级、加锁、weave 存储 |
| 1977-02-18 | SCCS 第 4 版随 PWB/UNIX 发布 | 文本历史文件格式定型 |
| 1982 | RCS 发布 | 反向 delta；单文件、`ci`/`co`、加锁 |
| 1985 | PVCS 发布 | 文件级工具的早期商业化 |
| 1986 | CVS 脚本版发布 | 并发编辑与合并模型 |
| 1989–1990 | CVS 重写并发布 1.0 | 客户端-服务器；1990 年代开源项目的默认工具 |
| 1992 | ClearCase 发布 | 版本化文件系统与动态视图 |
| 1995 | Perforce、Visual SourceSafe 发布 | 商业集中式的两条路线：高性能与微软生态 |

2000 年以后：

| 时间 | 事件 | 留下的东西 |
|---|---|---|
| 2000 | Subversion 立项 | 原子提交、目录版本化；1.0 于 2004 年发布 |
| 2001 | GNU Arch | 早期分布式尝试 |
| 2003 | Darcs、Monotone、SVK | 补丁理论、内容寻址、SVN 前端 |
| 2005 | BitKeeper 收回免费授权；Git 与 Mercurial 发布 | 分布式在一年内集中爆发 |
| 2008 | GitHub 上线 | fork + pull request 成为标准流程 |
| 2011 | GitLab 出现 | 自建托管 |
| 2015 | Git LFS 发布 | 给大文件打补丁 |
| 2020 | Unity 收购 Plastic SCM | 游戏资产路线延续 |
| 2022 | Sapling 开源 | 大规模仓库的新尝试 |

这条线上有一件事反复出现：每次解决旧问题都会带来新问题。SVN 解决了 CVS 的原子性，却没有解决分支成本；Git 解决了分支与离线，却把大文件与易用性留给了 LFS、partial clone 与新一代工具。下一节按「历史存在哪里」重新切一遍，正好能看清这些取舍。

---

## 2. 三代模型

上一节按时间讲；这一节换一个切法，按「历史存在哪里」划分。三代模型的依据不是功能多少，而是历史的存放位置。

### 2.1 本地版本控制

工具只在单机管理单个文件的历史：SCCS（Marc J. Rochkind，贝尔实验室，1972 年底开发，1977-02-18 公开发布）与 RCS（Walter F. Tichy，普渡大学，1982 年首发，现由 GNU 维护，末版 5.10.1 / 2022-02-02）。RCS 把最新版整份存进 `file,v`，旧版以反向差异接着存，用 `ci`/`co` 存取，并对单个文件加锁。

它没有「项目」概念，也没有协作概念。RCS 至今仍在维护，但用途基本只剩「给单个配置或脚本文件留历史」；SCCS 已过时，其文件格式还被 BitKeeper、Solaris TeamWare 等沿用。

### 2.2 集中式（CVCS）

一台服务器持有全部历史，客户端只取一份工作副本。

- 提交必须能连上服务器。
- 版本号是服务器分配的全局递增整数（如 SVN 的 r1234），因此版本号有序、可比较、可当发布号。
- 权限是服务器原生的，可以做到目录级 ACL，管理员能看到并审计一切。
- 代价是单点：服务器挂了谁都提交不了，服务器数据丢了所有人都丢。所谓「备份」就是备份那一台机器。
- 分支实现代价高。SVN 的分支本质是服务端的一次目录复制，合并需要服务器记录 `svn:mergeinfo` 才能正确判断哪些改动已经合过。

### 2.3 分布式（DVCS）

每个克隆都是包含全部历史的完整仓库。

- 提交是纯本地操作，联网只用于 push / pull 这类「交换提交」的动作。
- 历史不再是一条直线，而是有向无环图（DAG），节点由内容哈希标识，没有全局递增编号。
- 分支是廉价的指针操作，于是 feature branch + code review 成了默认工作方式。
- 权限控制是短板：Git 本身不认识目录权限，只能靠服务端钩子、CI 校验或把仓库拆开。

### 2.4 两种模型对照

| 维度 | 集中式 | 分布式 |
|---|---|---|
| 历史存放 | 仅服务器 | 每个克隆都有 |
| 提交 | 需连服务器 | 本地即可 |
| 版本标识 | 递增整数 | 内容哈希 |
| 分支代价 | 高 | 几乎为零 |
| 离线能力 | 受限（可 diff，不能 commit） | 完整 |
| 权限控制 | 服务器原生，可到目录 | 弱，靠钩子或拆仓库 |
| 单点故障 | 集中在服务器 | 任一克隆可重建 |
| 学习成本 | 低 | 高（暂存区、rebase 等概念） |

### 2.5 更准确的说法：Git 赢了，不是「分布式赢了」

常见的叙事是「分布式取代了集中式」，这个说法要打折扣。

Git 的高占有率是三件事叠加的结果：分支足够便宜，使「开分支做特性、合并前评审」成为可行流程；GitHub 这类托管平台把 fork + PR 固化成标准协作流程；以及 Linux 内核这种量级的项目背书。起作用的是 Git 这一个实现连同它的生态，而不是「分布式」这个性质本身——同样分布式的 Mercurial、Bazaar 并没有跟着赢。

集中式也没有退出：SVN 至今仍是 Apache 顶级项目、持续发布新版本，大量企业与内网项目靠它承载需要目录级权限和线性递增版本号的仓库；Perforce 在游戏、影视、芯片行业的地位基本不受 Git 影响；TFVC 在存量微软项目里仍在服役；Mercurial、Fossil 也各有稳定的用户群。

还有一点值得注意：绝大多数团队用 Git 的方式其实是集中式的——一个中央裸仓库加一圈克隆，开发者日常只跟它交互。除开「分支便宜」和「能离线提交」，日常体验和用 SVN 的差别没有想象中那么大。

所以准确的说法是「新项目的默认选择是 Git」，而不是「分布式在技术上全面胜出」。

---

## 3. Git

### 3.1 由来

Git 的诞生经过见 1.3 节：2002–2005 年 Linux 内核用 BitKeeper，2005 年 4 月 BitMover 收回社区免费授权，Linus Torvalds 随即写出替代品，2005-04-07 首次提交，以 GPL-2.0 发布。

设计目标写在他的定位里：快、完全分布式、支持非线性历史、能扛住内核规模、以及完整性（内容寻址加哈希校验）。

### 3.2 对象模型：一切皆对象

Git 的仓库就是一堆内容寻址的对象，共四类：

- blob：文件内容，不含文件名。
- tree：一个目录，记录「名字 → 模式位 + blob/tree 哈希」的列表。
- commit：指向一个 tree，加上父提交哈希、作者与提交者及时间、提交信息。
- tag（附注标签）：指向某个对象并带签名与说明。

对象以「内容哈希」命名，存放在 `.git/objects` 下。相同内容天然只存一份（自动去重）；而提交的哈希取决于内容和父提交，所以改写一个历史提交，它之后的所有提交哈希都会变——这是 rebase、`git commit --amend` 影响远端一切后果的根源。

哈希算法方面，Git 2.29（2020）起可以创建 SHA-256 仓库，但迁移至今没有走完：SHA-1 与 SHA-256 仓库之间没有互操作机制，既有仓库也无法原地转换；公网服务器使用 SHA-256 目前仍被强烈不建议，GitHub 也不支持，官方计划是等到 Git 3.0 再把 SHA-256 作为默认。

### 3.3 三个区域

| 区域 | 内容 | 相关命令 |
|---|---|---|
| 工作区 working tree | 实际编辑的文件 | —— |
| 暂存区 index / staging | 下一次提交的快照 | `git add`、`git restore --staged` |
| 仓库 .git | 对象库与引用 | `git commit`、`git push` |

`git add` 把工作区内容写入索引，`git commit` 把索引固化成一个提交对象。暂存区是 Git 相对其他工具最独特的一层，它让「只提交一部分改动」成为一等操作。

### 3.4 引用与分支

分支就是一个文本文件，内容是某个提交的哈希（`.git/refs/heads/<name>`），所以创建、切换、删除分支都是 O(1)。HEAD 指向当前分支；直接指向提交时就是 detached HEAD。

标签（`.git/refs/tags/`）同样是引用，区别是它约定不动；附注标签本身还是一个 tag 对象。

### 3.5 与 Subversion 的术语对照

| SVN | Git |
|---|---|
| 仓库（服务器端） | 每个克隆都是完整仓库 |
| 修订号 r1234 | 提交哈希 |
| trunk / branches / tags 目录约定 | 分支与标签是引用，没有目录约定 |
| 分支 = 服务端目录复制 | 分支 = 一个指针 |
| `svn update` | `git pull`（fetch + merge/rebase） |
| `svn commit` 直接进服务器 | `git commit` 本地，`git push` 才发布 |
| 可选文件锁 | 无锁，冲突留到合并时解决 |

注意「trunk / branches / tags」只是约定，不是 Git 的功能；反过来，SVN 里也可以用任意目录承载分支，但代价是真实复制。

### 3.6 几个容易搞混的点

- 分支不「重」。它只是一个几十字节的引用文件。
- `git checkout -- <file>`（新写法 `git restore <file>`）会丢弃工作区未提交的改动，且这些内容没有进过对象库，不可恢复。
- merge 与 rebase 的差别在历史形状：merge 保留分叉并产生一个合并提交，rebase 把提交逐个重放到新基底上并重写哈希。两者的取舍是「保留真实历史」与「得到线性历史」。
- 分布式不等于没有中心。实际项目仍然有一个上游仓库，只是它在技术上不再是必需品。
- Git 不跟踪空目录，也不跟踪文件权限位之外的模式信息（除可执行位）。

### 3.7 大文件

Git 的对象模型对二进制大文件不友好：文件每次改动都整体存成一个新 blob，而克隆默认拉取全部历史，于是仓库体积会随修改次数线性膨胀。Git LFS 的做法是在仓库里只存一个文本指针，真实内容放到远端大文件存储（如 GitHub 的 LFS 服务），克隆时按需拉取。当前版本 3.8.0。

---

## 4. 集中式阵营

### 4.1 Apache Subversion

2000-10-20 由 CollabNet 发布，定位就是 CVS 的替代品；2009 年 11 月进入 Apache 孵化器，2010-02-17 成为 Apache 顶级项目，以 Apache-2.0 发布，是目前集中式阵营里最主流的一个。相对 CVS 的关键改进是原子提交（一次提交要么全成功要么全失败）、目录也被纳入版本控制、真正支持重命名与移动、以及可自定义属性。缺点是分支仍然昂贵，合并依赖 `mergeinfo`，网络不可达时无法提交。

### 4.2 CVS

1986 年由 Dick Grune 以脚本形式实现，1989 年 4 月起由 Brian Berliner 重写为现在的代码库，1990-11-19 发布 1.0。长期是开源界的默认选择，但没有原子提交、不能重命名文件、分支成本高，最终被 SVN 取代。末版 1.11.23（2008-05-08），事实上已停止维护，现在只在老项目的归档里见到。

### 4.3 Perforce P4（原 Helix Core）

Perforce Software 的商业产品，集中式客户端-服务器，专门针对超大规模二进制资产与高并发优化：支持文件锁、大批量二进制差异、细粒度权限，在游戏、影视、芯片设计行业常见。它提供 Git 前端（Git Connector / Helix4Git）让习惯 Git 的开发者接入 Perforce 后端。官方免费版是「最多 5 用户、20 个工作区，功能不受限、无到期日」，适合小团队评估。

### 4.4 TFVC

微软的 Team Foundation Version Control，集中式，随 TFS / Azure DevOps Server 提供，有服务器工作区与本地工作区两种模式。微软的官方表述是 TFVC 已经 feature complete——「Azure DevOps 会继续维持与 TFVC 的兼容，但未来的投入都会给 Git」，2024 年路线图进一步计划在新项目中默认停用 TFVC。严格说它没有被宣布弃用，但对新项目已是明确不推荐。

---

## 5. 分布式阵营的其他成员

### 5.1 Mercurial

2005-04-19 首次公布（作者 Olivia Mackall），Python 实现，GPL-2.0-or-later，分布式。命令行风格比 Git 更一致，Mozilla 从 2007 年用到 2023 年后迁往 Git，Meta、Google 也曾采用。目前仍在维护，但生态与托管平台支持远不如 Git。

### 5.2 Fossil

SQLite 作者 D. Richard Hipp 在 2006 年发起的分布式版本控制，特点是单文件可执行、无外部依赖，并且把 wiki、缺陷跟踪、论坛、文档与 Web 界面全部内置，所有内容都存在一个 SQLite 数据库文件里。2010 年起采用 BSD-2-Clause 许可。适合「不想搭服务器、又要协作功能」的小团队，SQLite 与 Tcl 自身就用它。

### 5.3 Bazaar (bzr)

Martin Pool 创建、Canonical 主导，2005-03-26 首发，2008 年成为 GNU 项目，分布式，以易用性为卖点，曾是 Launchpad 的主力工具。末版 2.7.0（2016-02-15）之后冻结；Canonical 于 2025 年 6 月宣布逐步停止 Launchpad 上的 Bazaar 托管，社区分支 Breezy 继续维护，主线已不再适合新项目。

### 5.4 Darcs 与 Pijul

两者都基于补丁理论（patch theory），把历史看作一组可交换的补丁而不是快照链，因此 cherry-pick 与变基在语义上更自然。Darcs 用 Haskell 实现，2003-03-03 首发，仍在维护（2.18.5 / 2025-01-09），但合并性能长期受诟病；Pijul 用 Rust 重写了这套模型，目前仍是 1.0.0-beta。都属于小众选择。

### 5.5 BitKeeper 的定位

商业分布式工具，2002 年起被 Linux 内核使用，2005 年的授权争议直接催生了 Git 与 Mercurial。2016-05-09 起转为 Apache-2.0，末版 7.3.3（2018-12-29）后停止开发。它本身已退出历史舞台，但它是理解「DVCS 为什么在 2005 年集中爆发」的关键事件。

### 5.6 Unity Version Control

原名 Plastic SCM，其厂商 Codice Software 于 2020 年 8 月被 Unity 收购，插件 2.0.1（2023-02-17）起改用 Unity Version Control 品牌。支持集中式与分布式两种工作模式，主打游戏开发中的大文件与美术资源、以及大团队的分支管理。属于 Git 之外的一种商业选择。

---

## 6. 跨工具的横向维度

选工具时真正拉开差距的，往往不是「分布式还是集中式」，而是下面这些：

- 大文件与二进制：Perforce、Unity Version Control 原生支持；Git 需要 LFS；SVN 对二进制中立但同样会膨胀。
- 权限粒度：SVN、Perforce 可到目录级；Git 只能到仓库级，加钩子与代码评审补偿。
- 托管平台：Git 有 GitHub、GitLab、Gitea、Bitbucket 等；SVN 基本要自建；Perforce 有 P4 Code Review 与云端托管。
- 历史模型：文件级（RCS/SCCS）、目录树快照（SVN）、内容寻址 DAG（Git/Mercurial）、补丁代数（Darcs/Pijul）。
- 生态与招人成本：Git 压倒性领先，CI/CD、IDE、代码评审工具默认围绕它设计。

需要注意一点：「GitHub 是托管平台，Git 是工具」，二者不是一回事，GitLab、Gitea 可以自建，也可以完全不用平台只靠 SSH 交换提交。

---

## 7. 选型速查

| 需求 | 建议 |
|---|---|
| 通用软件开发 | Git |
| 超大二进制资产（游戏、影视、芯片） | Perforce P4 或 Unity Version Control（Git + LFS 为次选） |
| 需要目录级权限、线性递增版本号 | Subversion |
| 想单文件部署、wiki 与缺陷跟踪一体 | Fossil |
| 已有微软技术栈 | Azure DevOps + Git（不要新开 TFVC） |
| 只是给单文件留历史 | RCS 足够，但通常仍建议直接用 Git |

最后一条经验：不要为了「支持分布式」而选分布式，也不要为了「有中心服务器」而放弃分布式——中心服务器在分布式模型里依然可以有，而且通常确实有。

---

## 8. 存储模型：快照与 delta

前面几节讲的是「历史怎么组织」，这一节讲「每个版本的数据怎么存」。这里最容易出错的地方，是把语义和物理存储混在一起谈——Git 恰好是两者分离的典型。

### 8.1 两个层面

- 语义层：一个版本被建模成完整状态的记录，还是相对上一个版本的差异。
- 存储层：这段数据落盘时原样保存，还是被压缩成相对某个基线的补丁。

两者不必一致。Git 的文档反复强调 「Git stores snapshots, not deltas」，而同一套文档里的 `pack-format` 又定义了 `OBJ_OFS_DELTA` 与 `OBJ_REF_DELTA`。前者说的是对象模型（语义快照），后者说的是打包压缩方式（物理 delta）。

### 8.2 快照模式

每个提交或备份记录一个逻辑上自包含的完整视图。共享底层数据（去重、硬链接、写时复制）只是优化，不改变「单个版本可独立还原」这个性质。

- 取任意版本是 O(1)：Git 里就是 `commit → tree → blob` 逐级查哈希，与历史长度无关。
- 版本之间没有依赖链，删掉中间某个版本不牵连其他版本。
- 代价在写入与空间：不做去重的话，N 个版本就是 N 份数据。

卷级快照（LVM、ZFS、VMware 与各家云盘）是这一类的物理实现：写时复制（COW）或重定向写（ROW）。快照创建近乎瞬时、初始占用接近零，因为它只是引用尚未被覆盖的原块，新写入落到别处。

### 8.3 delta 模式

只记录相对基线（上次全量、上个版本、或某个 base 对象）的差异。

- 写入快、增量小，适合变化频繁的大数据。
- 读一个版本要把 delta 链从头重放，链越长恢复越慢，典型的「备份快、恢复慢」。
- 链式风险：全量 + 增量 1 + 增量 2 … 中任何一环损坏，它之后的版本全部不可用。所以实践中要周期性做全量，或由服务端合并出 synthetic full（合成全量）来截断链条。

delta 的方向也分两种。Git 的 packfile 存的是正向 delta，base 是较老的对象，指令是「从 base 复制一段 / 插入新数据」；反向 delta 则以最新版为 base，存「如何回退」，让访问最热的最新版读取最快。

### 8.4 对比

| 维度 | 快照模式 | delta 模式 |
|---|---|---|
| 单版本读取 | O(1)，与历史长度无关 | O(链长)，逐级应用 |
| 写入成本 | 较高，靠去重与 COW 抵消 | 低，只写差异 |
| 空间 | 理论上更大，靠共享压回来 | 更省，但差异大小不可控 |
| 可靠性 | 版本之间彼此独立 | 断链即失效 |
| 删除与回收 | 引用不可达即可回收 | 常需重写整条链 |
| 合并与比对 | 需两两算 diff | 本身就是 diff |

### 8.5 现实系统几乎都是混合的

Git：语义快照加物理 delta。blob 存的是整份文件内容并按内容哈希寻址，所以任意版本都能随机访问；`git gc` / `repack` 之后，packfile 会对相似对象做 delta 压缩，`OBJ_OFS_DELTA` 用包内负偏移指向 base，`OBJ_REF_DELTA` 直接写 base 的对象名，base 自身也可以是 delta，于是形成链，解压时要先转成规范形式。`git log -p` 看到的 diff 是算出来的，不是存下来的。

restic / borg：可以理解为「带去重的快照」。文件切成块，块用 SHA-256 标识，快照只是块 ID 的列表。难点在分块方式：固定大小分块下，在文件开头插入一个字节会让之后所有块的边界整体错位，等于整份文件都变了。它们改用内容定义分块（CDC），用 64 字节窗口的滚动哈希（Rabin 指纹）在指纹低位为 0 处切分，边界只依赖前 64 字节，插入字节后后续块边界不变，只有真正改变的块需要新存。官方示例里 400MiB 数据（含大量重复与插入）只让仓库增长了约 10MiB。

备份软件：全量、增量（相对上次任意一次备份）、差异（相对上次全量）三件套本质就是「基线加 delta」的工程折中。增量最省空间，但恢复要按序重放整条链；差异恢复只需全量加一份差异，代价是每天都重复保存相同的变化。

Time Machine：用硬链接把没变的文件指向上一次备份的同一份 inode，语义上是快照，物理上靠共享。

### 8.6 什么时候选哪个

- 需要频繁随机读取历史版本、且要求单个版本可靠：快照，配去重或 COW。
- 写入受带宽或备份窗口限制、空间是主要矛盾：delta，但必须设基线刷新周期，否则恢复时间和断链风险会线性恶化。
- 两者都想要：快照语义加内容定义分块去重，这是目前主流现代备份工具的路线。

### 8.7 两个常见误区

- 「存了 diff 就是 delta 模式」。要看语义：如果每个版本的元数据自包含（如 Git 的 tree 指向完整 blob 哈希），它就是快照模式，diff 只是展示层或压缩层的产物。
- 把卷快照当备份。快照解决的是回滚速度，不解决独立副本；同一存储上的快照与源数据共享故障域。

---

## 参考资料

- 英文维基「Version control」条目（仅作历史线索）：<https://en.wikipedia.org/wiki/Version_control>
- Rochkind, The Source Code Control System（1975）：<https://doi.org/10.1109/TSE.1975.6312866>
- Tichy, RCS—A System for Version Control（1985）：<https://doi.org/10.1002/spe.4380150703>
- CVS 起源说明（Dick Grune）：<https://dickgrune.com/Programs/CVS.orig/>
- Subversion 官方书：<https://svnbook.red-bean.com/>
- Pro Git「A Short History of Git」：<https://git-scm.com/book/en/v2/Getting-Started-A-Short-History-of-Git>
- Sapling：<https://sapling-scm.com/>
- Jujutsu：<https://github.com/jj-vcs/jj>
- Pijul：<https://pijul.org/>
- Git 官方文档：<https://git-scm.com/doc>
- Git pack-format（delta 表示）：<https://git-scm.com/docs/pack-format>
- restic 内容定义分块说明：<https://restic.net/blog/2015-09-12/restic-foundation1-cdc/>
- 备份类型对比：<https://github.com/mchittineni/ultimate-devops-guide/blob/main/backup-and-disaster-recovery/what-are-different-types-of-backups.md>
- Pro Git（中文版）：<https://git-scm.com/book/zh/v2>
- Git 哈希算法迁移说明：<https://git-scm.com/docs/hash-function-transition>
- Apache Subversion：<https://subversion.apache.org/>
- Mercurial：<https://www.mercurial-scm.org/>
- Fossil：<https://fossil-scm.org/>
- Perforce P4（免费版）：<https://www.perforce.com/p/p4/free-version-control>
- Git 与 TFVC 对比（微软官方）：<https://learn.microsoft.com/en-us/azure/devops/repos/tfvc/comparison-git-tfvc>
- Git LFS：<https://git-lfs.com/>
