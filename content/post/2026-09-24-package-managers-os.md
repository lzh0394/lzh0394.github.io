---
title: "包管理器（二）：系统级包管理器"
slug: "package-managers-os"
date: "2026-09-24"
categories: ["其他"]
tags: ["包管理器", "Linux"]
draft: false
summary: "包管理器系列第二篇：逐个拆解系统级包管理器——dpkg/apt、rpm/dnf、pacman/AUR、apk、Portage、Homebrew、winget/Scoop/Chocolatey、Nix/Guix，末节做横向对比与共存策略。"
---

本系列共四篇：[（一）依赖管理的原理](/post/2026/09/24/package-managers-principles/)、（二）系统级包管理器（本篇）、[（三）语言级包管理器](/post/2026/09/24/package-managers-language/)、[（四）应用层、供应链与实践](/post/2026/09/24/package-managers-practice/)。

目录（1 章，9 节）：

| 章 | 标题 |
| --- | --- |
| 1 | [系统级包管理器](#1-系统级包管理器) |

| 节 | 标题 |
| --- | --- |
| 1.1 | [dpkg 与 apt：Debian 系的基石](#11-dpkg-与-aptdebian-系的基石) |
| 1.2 | [rpm 与 dnf：Fedora 与 RHEL 系](#12-rpm-与-dnffedora-与-rhel-系) |
| 1.3 | [pacman 与 AUR：Arch 的滚动哲学](#13-pacman-与-aurarch-的滚动哲学) |
| 1.4 | [apk 与 Alpine：容器时代的极小系统](#14-apk-与-alpine容器时代的极小系统) |
| 1.5 | [Portage 与 USE 标记：可配置性的极限](#15-portage-与-use-标记可配置性的极限) |
| 1.6 | [Homebrew：macOS 的社区事实标准](#16-homebrewmacos-的社区事实标准) |
| 1.7 | [Windows 的三条路线：winget、Scoop、Chocolatey](#17-windows-的三条路线wingetscoopchocolatey) |
| 1.8 | [Nix 与 Guix：把包管理器当成构建系统](#18-nix-与-guix把包管理器当成构建系统) |
| 1.9 | [系统级横向对比与共存策略](#19-系统级横向对比与共存策略) |

## 1. 系统级包管理器

### 1.1 dpkg 与 apt：Debian 系的基石

#### 1.1.1 两层分工：装单个包，和管整个依赖图

Debian 系把一件事拆给了两个程序。dpkg 做最底层的工作：解开一个 `.deb`、把文件写到文件系统、在 `/var/lib/dpkg/` 里登记状态。它不联网、不认识仓库、不解决依赖。apt 建在 dpkg 之上，负责索引、求解与下载，最后把一串操作交给 dpkg 依次执行。

这个分工解释了最常见的翻车方式：`dpkg -i foo.deb` 缺依赖时不会回滚，而是把包解包完成、状态标成未配置，于是系统进入「半装」状态，后续所有 apt 操作都被这一个坏包卡住。正确做法是把本地文件也交给 apt：

```bash
sudo apt install ./foo.deb
```

前导的 `./` 不是风格问题，没有它 apt 会把参数当包名去仓库里找。真被 `dpkg -i` 弄坏了，用 `sudo apt --fix-broken install` 让求解器补齐缺失依赖，这比逐个手工 `dpkg -i` 依赖干净。

#### 1.1.2 sources：旧格式与 deb822

索引来自 `/etc/apt/sources.list` 与 `/etc/apt/sources.list.d/`。传统格式一行一个源：

```text
deb https://deb.debian.org/debian trixie main contrib non-free
```

新的 deb822 格式把每个源写成一个小节，字段化、天然支持多行与逐源签名密钥，文件名以 `.sources` 结尾：

```text
Types: deb
URIs: https://deb.debian.org/debian
Suites: trixie
Components: main contrib non-free
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
```

两者可以共存，apt 都读，所以迁移不必一次性完成；Debian 13 与 Ubuntu 24.04 起，安装器默认生成 deb822 的 `.sources` 文件，旧的一行式 `sources.list` 仍被支持但已进入弃用过程（Debian 13 为此提供了 `apt modernize-sources`）。`apt update` 只刷新索引，不安装任何东西；只跑 `upgrade` 而不先 `update`，等于用过期库存做决策，是「明明有新版本却装不上」的常见原因。

#### 1.1.3 upgrade 与 full-upgrade：差别不在激进度

- `apt upgrade` 只会升级已经装好的包，不安装新包，也不删除任何包。当新版本需要新的依赖或与旧包冲突时，apt 把它列进「kept back」直接跳过，系统可以停在混合状态。
- `apt full-upgrade` 允许为完成升级而安装新包、删除挡路的旧包。它不会主动卸载无关软件，但在发行版内滚动（Debian testing/sid）或大版本升级时，它删除的包可能恰恰是原本以为还在的东西。

因此判断条件很简单：升级前先跑 `apt -s full-upgrade`（`-s` 是模拟），看清「将被删除」那一段，再决定是否执行。`apt-get` 是这套逻辑的脚本友好界面，输出稳定、默认行为常年不变，适合写进自动化；`apt-cache` 负责查询元数据。较新的 `apt` 命令把两者合并并加上进度条和更短的输出，为人类交互设计，官方明确不保证其输出格式稳定——脚本里解析 `apt` 的文本属于自找麻烦。

#### 1.1.4 版本优先级：一个容易失控的旋钮

同一个包在多个源里出现时，apt 按优先级选版本，规则比大多数人想的更硬：

| 优先级 P | 含义 |
|---|---|
| ≥ 1000 | 允许降级安装 |
| 990–999 | 即使不属于目标发行版也安装（除非已装版本更新） |
| 500–989 | 目标发行版没有版本时才用 |
| 100–499 | 已装版本或其它发行版优先 |
| 0 < P < 100 | 仅在完全未安装时安装（P = 0 属未定义行为，不要使用） |
| < 0 | 永不安装 |

默认情况下已装版本是 100、其它可用版本是 500；Debian backports 因 `NotAutomatic: yes` 加 `ButAutomaticUpgrades: yes` 而落在 100。规则写在 `/etc/apt/preferences` 或 `/etc/apt/preferences.d/`（文件名必须以 `.pref` 结尾或不带扩展名，且按字典序解析）。pin 是强力的东西：写错一个负优先级就能让包永远装不上，而 apt 不会质疑配置里的偏好，它只会照做。

hold 是另一个粒度更粗的锁：`apt-mark hold <pkg>` 阻止该包被自动升级（`apt-mark unhold` 解除，`apt-mark showhold` 查看）。它和「kept back」不是一回事：前者是显式决定，后者是求解器拒绝了这次变更。第三方源（PPA、厂商仓库）的风险也要在这里理解——它们的包和系统包装在同一套路径下、以 root 权限运行维护者脚本，信任等级等同于发行版本身；deb822 的 `Signed-By` 让密钥按源隔离，比传统的全局 `trusted.gpg` 好，但 `trusted=yes` 一写，签名校验就没了。

#### 1.1.5 查询与清理

| 目的 | 命令 |
|---|---|
| 列出所有可升级包 | `apt list --upgradable` |
| 看某包为何是这个版本 | `apt-cache policy <pkg>` |
| 查某包装了哪些文件 | `dpkg -L <pkg>` |
| 查某文件属于哪个包 | `dpkg -S /path/to/file` |
| 查某包的状态与版本 | `dpkg -l <pkg>` |
| 删除不再需要的自动依赖 | `sudo apt autoremove` |
| 清空下载的包缓存 | `sudo apt-get clean` |
| 只清过期缓存 | `sudo apt-get autoclean` |

`autoremove` 的依据是安装时标记的「自动安装」位。早期用 `dpkg -i` 安装的包可能被标成手动，导致该删的留下；`apt-mark auto <pkg>` 可以纠正这个标记。安全更新方面，`unattended-upgrades` 默认只装安全源里的更新；内核或 glibc 升级后，运行中的进程不会自动换成新文件，`needrestart` 就是用来提示哪些服务需要重启、哪些情况必须重启机器——Ubuntu 24.04 起 server 镜像自带它并在 APT 事务末尾运行，Debian 上则需要自行安装该包才会有这个钩子。见[《包管理器（四）》第 1.2 节](/post/2026/09/24/package-managers-practice/#12-容器与-oci-镜像分发单元的迁移)关于容器里 `apt-get update` 与 `install` 必须写在同一层 `RUN` 的讨论。

> 一句话总结：apt 的价值在求解器和优先级表，dpkg 只是执行器；搞混两者就是「半装」状态的来源。

### 1.2 rpm 与 dnf：Fedora 与 RHEL 系

#### 1.2.1 rpm 是格式加本地库，不是包管理器

`.rpm` 既是包格式也是那个查询工具的名字。`rpm` 命令直接读 `/var/lib/rpm` 里的数据库，回答「装了什么、文件属于谁、包的元数据长什么样」，但它不联网、不解决依赖。Red Hat 系的历史就是在这之上叠求解器的历史：yum（Python）→ dnf4（Python + libdnf/hawkey，用 libsolv 做 SAT 求解）→ dnf5。装配依赖、下载、事务这一层才算包管理器。

dnf5 是一次架构重写：C++ 实现，库是 libdnf5，不再是 Python 包加插件的组合。它在 Fedora 41 起成为默认的 `/usr/bin/dnf`；Fedora 46 的变更提案（截至 2026 年秋仍在提案阶段）计划整体移除 dnf4 套件（`dnf`、`microdnf`、`libdnf` v1、`python3-dnf`、`dnf-plugins-core`）。dnf4 与 dnf5 混用被官方明确劝阻：两者的历史数据库与安装原因记录不兼容。

#### 1.2.2 dnf5 与 dnf4 的 CLI 差异

大部分交互命令长相不变，但脚本会踩到下面这些：

- 子命令不再可省略：`dnf history <id>` 必须写成 `dnf history info <id>`；`dnf updateinfo` 变成 `dnf advisory summary`。
- 旧别名被移除：`groupinstall`/`grouplist`/`groupinfo` 一律改成 `dnf group install` 等形式。
- `dnf -v` 目前未实现；`--downloaddir` 改为 `--destdir`；`--sec-severity` 改名 `--advisory-severities`。
- 新增按源过滤的选项：`--from-repo=<id>`（只在指定源里找命令行给出的包）与 `--installed-from-repo=<id>`，取代了被删掉的 `repository-packages` 命令族。
- `config-manager` 从选项变成子命令（`dnf config-manager addrepo`、`setopt`），并且不再改原文件，而是写 drop-in 覆盖文件。
- 缓存目录变了：root 侧是 `/var/cache/libdnf5`，用户侧是 `~/.cache/libdnf5`，dnf4 的 `dnf clean all` 清不到 libdnf5 的新缓存目录。
- `best` 的默认值从 false 改成 true：求解器更倾向于「报错」而不是「跳过装不上的包」，这会让以前被静默略过的依赖问题暴露出来。

#### 1.2.3 模块流的现状

modularity（模块流）曾是 Fedora 解决「同一个包要提供多个版本」的方案：一个模块给多条流（stream），如 `nodejs:18` 与 `nodejs:20`。

结论要说得克制：Fedora 官方已在 Fedora 39 退役模块化构建，此后系统包不再以模块流分发；Fedora 46 的提案进一步把遗留的 `libmodulemd` 一并移除。但第三方仓库仍可能携带模块元数据，dnf5 也仍保留 `module` 子命令。新项目不应再依赖模块流;需要多版本共存时，容器或语言级版本管理器是更稳的路径（见[《包管理器（四）》第 1.4 节](/post/2026/09/24/package-managers-practice/#14-版本管理器不是包管理器nvmpyenvrustupasdfmise)）。

#### 1.2.4 事务、回滚与 zypper

dnf 会记录每一次事务，这是它相对 apt 的一个明显优势：

```bash
sudo dnf history list          # 看事务编号
sudo dnf history info 42       # 看某次事务装删了什么
sudo dnf history undo 42       # 反向执行
```

`undo` 的可靠边界要说清楚：它反的是包集合与版本，不反服务重启、不反配置文件改动、也不保证当时仓库里还有那个旧版本可用（包已被淘汰时 undo 会失败）。跨大版本升级走 `dnf system-upgrade download --releasever=<N>` 加 `dnf system-upgrade reboot`，这是离线事务：下载完、重启、在 systemd 的离线环境里完成升级，避免升级到一半的中间态。它不做回滚，回滚要么靠 `history undo`，要么靠文件系统快照——Fedora 上的 Btrfs + snapper 与 openSUSE 的同类方案，属于文件系统能力而不是包管理器能力。

openSUSE 的 zypper 共享 rpm 与 libsolv，但更新语义不同：Leap 用 `zypper up`（升级已装包，不删除），Tumbleweed 用 `zypper dup`（把系统对齐到当前快照，可以删除包，也能处理厂商变更）。在 Tumbleweed 上只跑 `up` 会留下跨快照的混合状态，和 Arch 的部分升级是同一类错误。SUSE 的补丁模型也值得知道：zypper 以 patch 为单位组织更新，`zypper patch` 装的是标记为安全或推荐的补丁，与按包升级不是一回事。

#### 1.2.5 速查

| 目的 | 命令 |
|---|---|
| 列出已装包 | `rpm -qa` |
| 列出包内文件 | `rpm -ql <pkg>` |
| 查文件属于哪个包 | `rpm -qf /path/to/file` |
| 查未安装的 rpm 文件 | `rpm -qpi foo.rpm` |
| 查某个能力由谁提供 | `dnf provides '*/bin/nc'` 或 `dnf repoquery --whatprovides` |
| 查谁依赖某包 | `dnf repoquery --whatrequires <pkg>` |
| 装一组包 | `dnf group install '<组名>'` |
| 查可用更新 | `dnf check-upgrade` |

`dnf repoquery` 是 dnf 系最有价值的一条命令：它查的是仓库元数据而非本地状态，可以问「哪些包提供这个文件」「哪些包依赖这个库」，配合 `--queryformat` 能输出机器可读的清单。`rpm -qf` 与 `dnf provides` 的分工正是本地库与仓库索引的分工，与 dpkg/apt 那对关系同构，见第 1.1 节。

> 一句话总结：dnf 的差异化优势是事务历史与离线升级，但 dnf4/dnf5 混用会污染这份历史。

### 1.3 pacman 与 AUR：Arch 的滚动哲学

#### 1.3.1 部分升级为什么危险

Arch 不区分「发行版版本」，仓库里的包始终是当前的一套。这意味着一个硬约束：本地已安装的包必须互相匹配（coherent），因为共享库的主版本会在任意一次更新中一起前移。

`pacman -Sy` 只刷新仓库索引，不升级任何已安装的包。之后单独执行 `pacman -S foo`，会得到最新版的 foo，但它链接的库版本可能是系统上还不存在的新版本——于是 foo 拒绝启动，报的是某个 `.so` 找不到或符号未定义。这就是部分升级（partial upgrade），Arch 官方明确不支持这种状态，也不为它排错。

```bash
# 错的：只刷索引，再单装一个包
sudo pacman -Sy
sudo pacman -S foo

# 对的：刷索引与全量升级在同一个操作里完成
sudo pacman -Syu

# 镜像元数据不同步时，强制重取后整体升级
sudo pacman -Syyu
```

规则可以总结成一句：`-Sy` 之后除了 `-u` 不要再接任何安装动作。`-Syu` 是原子的升级；`-Sy` 单独使用只在一种场景下合理——确认索引损坏需要重取，随后立即跑 `-Su`。同样的约束也解释了为什么 Arch 要求「升级前读新闻」：当变更需要人工介入（比如某个包被合并、需要先重建 AUR 包、或者手动的迁移步骤），pacman 自己无法知道，新闻页是这套契约的一部分。跨月不升级的系统，一次 `-Syu` 可能带来几十个需要人读的变更，此时更稳妥的是分批升并处理每批的提示。

#### 1.3.2 本地数据库与查询

pacman 的本地库是 `/var/lib/pacman/local/`，每个包一个目录，里面有 `desc`（元数据）与 `files`（文件清单）。`-Q` 系列就是查这个目录：

| 目的 | 命令 |
|---|---|
| 列出已装包 | `pacman -Q` |
| 只看显式安装的 | `pacman -Qe` |
| 只看外部包（AUR 或已从仓库移除） | `pacman -Qm` |
| 列出某包的文件 | `pacman -Ql <pkg>` |
| 查文件属于哪个包 | `pacman -Qo /path/to/file` |
| 列出孤儿依赖（安静输出） | `pacman -Qtdq` |

`pacman -Qm` 是滚动发行版里最有用的一条查询：它把系统分成「仓库管的」和「自行负责的」两半。而 `pacman -Qtdq | sudo pacman -Rns -` 是标准清理套路——`-Qtdq` 找出没有任何包依赖、自己也不是显式安装的包，`-Rns` 表示连同依赖（`-s`）与配置文件（`-n`）一起删。`-n`（`--nosave`）会直接删除配置文件；不加 `-n` 时 pacman 才把被修改过的配置保留成 `.pacsave`，这才是 `-Rns` 与 `-Rn` 的关键差别。缓存清理则是 `pacman -Sc`（删除已卸载包的缓存）与 `pacman -Scc`（清空整个 `/var/cache/pacman/pkg`），后者意味着之后任何回滚降级都得重新下载——在滚动发行版里，本地缓存是最省事的降级来源（Arch Linux Archive 也能取到历史包），别随手清空。

#### 1.3.3 AUR 的本质

AUR 不是仓库。它是一堆 PKGBUILD 构建脚本加元数据，没有二进制、没有签名、没有任何人代审内容。`makepkg -si` 的 `-s` 会装构建依赖、`-i` 会在构建成功后调用 pacman 安装；也可以在 PKGBUILD 所在目录直接 `makepkg -si`。本地机器负责编译，构建脚本也就在本地以本地权限运行。

yay、paru 这类 AUR helper 只是自动化：解析 AUR 元数据、递归装依赖、下载快照。它们不改变信任链——helper 的便利恰恰在于让「读一遍 PKGBUILD」这一步变得更容易被跳过。Arch 与「不打包主义」的关系也在这里：官方仓库只收录主流软件，长尾软件和冷门变体全靠 AUR 与用户自己。这换来的是仓库规模可控、维护负担低；代价是用户实际上承担了打包者的角色，安全边界也随之从发行版维护者位移到每个用户。

> 一句话总结：滚动发行版的代价不是更新频繁，而是任何一次更新都必须整体完成。

### 1.4 apk 与 Alpine：容器时代的极小系统

#### 1.4.1 设计取向：小、快、少依赖

Alpine 的基础镜像能压到几 MB，靠的是三件事：BusyBox 提供精简的 coreutils、shell 与 init；包被拆成细粒度子包，只装用得上的部分；apk 本身是 C 写的，索引是单个签名过的 `APKINDEX.tar.gz`，解析快、内存占用低。这在容器里是实打实的优势：拉取快、攻击面小、层数少。

但极小系统建立在一个硬选择上：Alpine 用 musl libc，不是 glibc。这不是口味问题，而是兼容边界。任何在别处编译、动态链接 glibc 的二进制拿到 Alpine 上都跑不起来，报错通常是 `not found`（看起来像文件不存在，实际是解释器 `/lib64/ld-linux-x86-64.so.2` 不存在）。Python 生态里这一点最明显：PyPI 上的 manylinux wheel 链的是 glibc，Alpine 需要 musllinux wheel，而发布 musllinux wheel 的项目远少于 manylinux——于是同一个 `pip install` 在 Debian 镜像里是下载，在 Alpine 里是源码编译，需要 gcc、Python 头文件和几十秒到几分钟。

#### 1.4.2 --virtual：容器构建的标准套路

容器里装构建依赖再清理，最干净的做法是用虚拟包把临时依赖打成一捆：

```dockerfile
RUN apk add --no-cache --virtual .build-deps gcc musl-dev python3-dev \
 && pip install --no-cache-dir -r requirements.txt \
 && apk del .build-deps
```

`--virtual .build-deps` 让这一串依赖注册成一个名为 `.build-deps` 的虚拟包，`apk del .build-deps` 一次清掉全部，不用手写长列表、也不怕漏。`--no-cache` 让 apk 不把索引写进 `/var/cache/apk`，省掉后续 `rm -rf` 那一步。这两点合起来才能让构建依赖不留在最终层里——注意最后一条 `apk del` 与 `apk add` 必须在同一个 `RUN` 里，否则中间层已经把依赖固化进镜像了，与[《包管理器（四）》第 1.2 节](/post/2026/09/24/package-managers-practice/#12-容器与-oci-镜像分发单元的迁移)讲的分层语义是同一个问题。

#### 1.4.3 world、repositories 与查询

`/etc/apk/world` 记录的是「要求系统满足的约束」，每行 `名称{@标签}{版本条件}`，而不是已安装包的完整列表——依赖是求解出来的副作用。手工改过这个文件后要跑 `apk fix` 让它与实际安装状态重新对齐。仓库列表在 `/etc/apk/repositories`；官方镜像与常规安装通常已启用 `community`，但如果是只开 `main` 的精简或自建 rootfs，就得手动追加，否则 `apk add` 会报 `unable to select packages`（包在别的仓库里）。要固定版本，可以直接往 world 里写条件：`apk add 'asterisk<1.6.1'` 之后，`apk upgrade` 会升级其余一切而放过它。

| 目的 | 命令 |
|---|---|
| 刷新索引 | `apk update` |
| 升级全部已装包 | `apk upgrade` |
| 列出已装包 | `apk info` |
| 列出包内文件 | `apk info -L <pkg>` |
| 查文件属于哪个包 | `apk info --who-owns /path` |
| 查依赖 / 反向依赖 | `apk info -R <pkg>` / `apk info -r <pkg>` |
| 看版本来自哪个仓库 | `apk policy <pkg>` |
| 清理本地缓存 | `apk cache clean` |

#### 1.4.4 什么时候不该用 Alpine

以下情况选 Debian slim 或 Ubuntu 基础镜像会更省事，理由都是同一个：正在为 musl 支付重编译成本，而省下的体积在应用层面前微不足道。

- 依赖大量预编译二进制或闭源产物（数据库客户端、厂商 SDK、部分 JVM 原生库）。
- Python 或 Node 技术栈里有需要编译的原生扩展，构建时间会显著拉长。
- 需要 glibc 专属行为，例如某些 NSS 模块、`nsswitch.conf` 驱动的目录服务集成；musl 的解析器实现与 glibc 不同，混合环境和内网域名解析出过不少难查的问题。
- 团队成员不熟悉 musl，出问题时排查成本会超过镜像体积带来的收益。

再往极简走就是 distroless 与 scratch：不装包管理器，只放运行时与产物，结合多阶段构建（见[《包管理器（四）》第 1.2 节](/post/2026/09/24/package-managers-practice/#12-容器与-oci-镜像分发单元的迁移)）。那是另一个取舍点——镜像更小更安全，但失去了在容器里临时排查的工具，只能在构建阶段或独立调试镜像里做。

> 一句话总结：Alpine 省下的是镜像体积，付出的是 musl 带来的重编译与生态兼容成本。

### 1.5 Portage 与 USE 标记：可配置性的极限

#### 1.5.1 USE 标记把功能开关变成依赖维度

多数发行版把「要不要 X11 支持」「要不要 IPv6」这类编译期开关定死在包里，用户只能接受。Gentoo 的 USE 标记（USE flag）把这个决定权交出来：每个包声明一组可选的编译特性，用户通过设置这些标记影响配置与编译参数。配置文件分两层——`/etc/portage/make.conf` 里的 `USE=` 是全局默认，`/etc/portage/package.use/` 下按包覆盖，`-flag` 表示关闭。

这个设计的代价是组合爆炸。一个包的输出取决于它自身的 USE 集、依赖的 USE 集、以及 profile 里定义的基础集；依赖图上的每一层都参与，可能的构建配置数量随包数指数增长。这也是为什么 Gentoo 不能简单地共享二进制包：同一个包在不同 USE 集下是不同的构建产物，ABI 与文件清单都可能不一致。binhost 提供的二进制包必须与本地 USE 配置匹配，否则只能退回源码编译。反过来说，二进制发行版之所以能存在，前提正是它把这份组合空间收窄成了一个固定点——这是两者最根本的交换。

#### 1.5.2 ebuild、overlay 与日常操作

每个包由一个 ebuild（`*.ebuild`，本质是 bash 脚本）描述：从哪下源码、用什么参数配置、装什么文件、依赖是什么。overlay 是额外的 ebuild 集合，官方仓库之外的东西（第三方软件、本地修改）放进去，用 `eselect repository` 之类的工具管理，或直接写进 `/etc/portage/repos.conf`。

```bash
emerge --ask --verbose firefox          # 交互确认，并打印将执行的编译选项
emerge --ask --verbose --update --deep --newuse @world
emerge --ask --depclean                 # 删除不再需要的包
emerge --ask @preserved-rebuild         # 重建链接到被保留旧库的包
```

`--newuse`（`-N`）让 Portage 在 USE 集变化时重建受影响的包；`--deep`（`-D`）让更新递归到依赖；`@world` 是系统集与显式安装的集合的并集，记录在 `/var/lib/portage/world`。`--depclean` 是危险但必要的一步：它按依赖图删除无人需要的包，误删的典型来源是手工编译安装、没进 world 的东西。`@preserved-rebuild` 解决的是库升级的特有麻烦——升级一个共享库时，旧版本会被临时保留（preserve-libs 特性），因为还有包链接在它上面；Portage 把这些包放进 `@preserved-rebuild` 集合，重跑一次这个集合就能清掉旧库。这是源码编译发行版才有的问题：没有稳定的 ABI 边界，就得靠「重建所有依赖者」来保证一致性。

#### 1.5.3 真实的代价

- 时间：每个包在本机编译。日常更新是分钟级到小时级，浏览器、LibreOffice、LLVM 这类大包是小时级；换一次 CFLAGS 或补一次 `--newuse` 意味着一轮大规模重建。
- 磁盘：编译工作目录默认在 `/var/tmp/portage`，大包需要数 GB 临时空间；再加上包数据库、distfiles 缓存与 binhost 包，根分区规划要留余量。
- 可复现性：系统本身是「自身 USE 组合 + 编译器版本 + profile」的产物。这既是它最大的价值（同一个包能编译出真正贴合用途的形态），也意味着出现问题时几乎没有第二个人能复现同样的构建，社区支持很难提供现成答案。

Portage 值得读的原因不在于要不要用 Gentoo，而在于它把「包管理器能承担多少策略」推到了边界：它把依赖求解、编译配置、构建调度、二进制缓存、集合管理等全部收进一个工具。多数发行版选择放弃这套能力，不是因为想不明白，而是因为它的代价必须以用户时间为单位支付——这笔账在服务器和桌面上都算不过来，只在少数需要极致裁剪的场景（嵌入式、特定硬件、极端体积约束）才划算。理解了这一点，也就理解了第 1.9 节里各家取舍的分界线在哪。

> 一句话总结：USE 标记把编译期决策交给用户，代价是构建组合爆炸与无法共享的二进制。

### 1.6 Homebrew：macOS 的社区事实标准

macOS 随系统附带的命令行工具很少，真正的用户态软件长期没有官方分发渠道：要么去官网下载 `.dmg`，要么自己编译。Homebrew 填补的就是这个空白，而它的设计几乎全部围绕一个约束展开——不碰系统目录，因此不需要 sudo。

#### 1.6.1 formula、cask 与 prefix

formula 是从源码或官方构建好的 bottle（预编译二进制包）安装的命令行软件，装进 `$(brew --prefix)/Cellar`；cask 分发的是 macOS 上的图形应用和 `.pkg` 安装包，通常落到 `/Applications`。两者共用同一套命令，但信任模型不同：formula 的安装过程受 Homebrew 控制，cask 走的是上游的签名与公证体系，所以 cask 会因为 Gatekeeper 检查失败而被停用甚至移除，这并不等于它被判定为恶意软件。

prefix 由架构决定，不是可随意选择的品味问题：

| 平台 | 默认 prefix |
|---|---|
| macOS Apple Silicon | `/opt/homebrew` |
| macOS Intel | `/usr/local` |
| Linux / WSL2 | `/home/linuxbrew/.linuxbrew` |

Apple Silicon 用 `/opt/homebrew` 是为了和 Rosetta 2 下的 `/usr/local` 并存，且两者都能用 bottle。自定义 prefix 也能用 bottle，但要求更严；默认位置才是被测试最多的那条路。

PATH 必须显式接入，装完不做这一步 `brew` 就不可用：

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

`shellenv` 会把 `$(brew --prefix)/bin`、`sbin` 加进 PATH。这里有个常被忽略的后果：GUI 应用默认拿不到 Homebrew 的 PATH，从 Dock 启动的编辑器因此找不到 `node`、`python3`。另外 `brew install python@3.13` 这类包是 keg-only——只进 Cellar，不链接到 prefix，因为链接会遮蔽系统同名工具；`brew info` 会说明该怎么把它加进 PATH。

#### 1.6.2 命令与机器复现

日常只用得起少数几个：`brew install`/`uninstall`/`upgrade`、`brew list`、`brew info`、`brew deps <formula>` 与反查方向的 `brew uses --installed <formula>`、`brew doctor`、`brew cleanup`。`brew outdated` 先列出哪些能升，`brew pin <formula>` 可以按住某个包不升级。

机器复现靠 `brew bundle`：`brew bundle dump --global --force` 把当前状态写成 `~/.Brewfile`，`brew bundle` 负责把机器拉回该状态，`brew bundle cleanup --force` 删掉清单之外的包。Brewfile 不只是 Homebrew 的清单，还能写 `mas`、`vscode`、`cargo`、`uv`、`flatpak`，WSL 里甚至能写 `winget`。但要说清它的边界：Brewfile 没有锁。官方文档明确表示不会提供类似 `Gemfile.lock` 的机制，因为 Homebrew 是滚动发布的，不保证任意旧版本可安装。Brewfile 记录的是「装了哪些包」，不是「钉在哪些版本」。要真正冻结版本，只能把一部分软件交给别的工具（见第 1.8 节、[《包管理器（四）》第 3.1 节](/post/2026/09/24/package-managers-practice/#31-决策指南什么场景用什么)）。

#### 1.6.3 代价与边界

Homebrew 不支持任意版本混搭，升级时会连带升级依赖它的包和它依赖的包，`brew upgrade` 一次性动几十个 formula 是常态。旧版本在升级后会被自动清理，想保留得关掉自动 cleanup。

它不接管系统依赖，这是刻意的：系统组件（libxml2、Python、OpenSSL 等）必须用系统自带的，覆盖它们会破坏签名校验和系统更新。Linux 上的 Homebrew 定位是「发行版没打包或太旧的软件」，它不依赖宿主库（只需要够新的 glibc 和 gcc），因此同一个可执行文件可能链接到 `/home/linuxbrew` 下的另一份 libc 依赖树，与发行版包管理器并存时容易出现「同名命令指向不同实现」。第三方 tap 过去是纯信任关系，Homebrew 6.0.0 起引入 tap trust，非官方 tap 需要 `brew trust` 显式授权才会被加载——它的理由是 formula 和 cask 是可执行的 Ruby 包定义，而不是纯元数据。

> 一句话总结：Homebrew 的价值在于不碰系统、免 sudo，代价是没有版本锁定与系统集成。

### 1.7 Windows 的三条路线：winget、Scoop、Chocolatey

Windows 上「装软件」有三层并存的状态：MSIX/Store 应用、传统安装器（`.exe`/`.msi`，状态写在注册表里）、绿色软件目录（状态只在文件系统里）。三个包管理器都在这块地基上工作。

#### 1.7.1 winget：官方出品的安装器编排器

winget 是微软官方的命令行包管理器，也是系统组件，随 Windows 交付并在商店里更新。它最容易误解的地方是：winget 不分发软件。仓库 `winget-pkgs` 存的是 manifest——包标识、版本、安装器 URL、哈希与静默安装参数。所谓安装，是下载上游安装器再按其静默参数调用。

后果有两个。第一，升级能力受上游限制：上游没提供静默参数，或安装器升级时会弹交互界面，`winget upgrade` 就可能失败、挂起或什么都没做。第二，它判断「已安装」「可升级」时的信息源不止一个（自有数据库与系统已安装程序记录），不一致就会误报。这是「编排安装器」这条路线固有的弱点。

```pwsh
winget search 7zip
winget list <name>
winget upgrade --all
winget install --id <Publisher.Package> --source winget
```

写作时在 Windows 上核对：`winget --version` 与 `winget search` 均执行失败（进程以非零状态退出，无输出），因此本节不引用任何 winget 版本号；manifest 的字段与可用子命令请以 `winget --help` 和官方文档为准。

#### 1.7.2 Chocolatey：NuGet 生态 + PowerShell 脚本

Chocolatey 是三者中历史最久的，包格式建立在 NuGet 之上（`.nupkg` 加 `chocolateyInstall.ps1` 等脚本）。安装脚本以管理员权限执行 PowerShell，能力最大，风险也最大：装一个社区包等于执行一段第三方代码，脚本行为决定了软件最终装在哪、注册了什么。

`choco --version` 输出 `2.5.0`，`ChocolateyInstall` 指向 `C:\ProgramData\chocolatey`，shim 在 `bin` 下，包体与解包内容分别在 `lib` 与 `tools` 下。`choco list` 列出已安装的包，`choco upgrade all -y` 是全量升级的常见写法。

因为要写 `C:\ProgramData` 和注册表，它基本需要管理员权限，所谓绿色版安装只是「脚本没写注册表」的特例。企业场景关心的是许可版本提供的内部源、自建包与包审核流程。社区仓库的包经过审核，但审核不等于审计。

#### 1.7.3 Scoop：不写注册表的用户级目录

Scoop 反其道而行：默认装到用户目录，不写注册表，不需要管理员权限。默认根路径 `C:\Users\<user>\scoop`，含 `apps`、`buckets`、`shims`、`persist`、`cache` 等子目录。`buckets` 就是 Git 仓库，`git pull` 即更新软件清单，可读性与可审计性远高于二进制脚本。`shims` 为每个可执行文件生成 `.cmd`/`.ps1` 转发脚本，靠 PATH 生效——shims 目录里的转发脚本数量大致等于可用命令数。`persist` 存放跨版本保留的配置，是另外两者没有的设计。

`scoop --version` 输出当前版本并提示可升级（当时为 0.5.3）；`scoop config` 显示 `root_path` 为用户目录下的 `scoop`、`scoop_repo` 指向 GitHub 上的 Scoop 仓库。`scoop update *` 更新全部应用，`scoop cleanup *` 清理旧版本。

代价很直接：需要注册表的软件装不了或装了不工作——服务、Shell 扩展、要写 HKLM 的驱动类工具都属此类；GUI 覆盖也不如另外两者。

#### 1.7.4 共存与冲突

三者都只持有「引用」而非所有权，所以同一个软件被两个管理器装了，双方都不会知道，也没有机制阻止。「不要用多个管理器管同一个软件」只是一条靠人遵守的约定；真重叠了，先让一个卸载干净再由另一个接管，日常调用哪个由 PATH 顺序决定。

三者的差异可以压成一张表：

| 维度 | winget | Chocolatey | Scoop |
|---|---|---|---|
| 分发内容 | manifest，指向上游安装器 | `.nupkg` + PowerShell 脚本 | bucket 里的清单 + 归档 |
| 权限 | 视安装器而定，常需提权 | 基本需要管理员 | 默认不需要 |
| 安装位置 | 由上游安装器决定 | `C:\ProgramData\chocolatey` | 用户目录 `~\scoop` |
| 注册表 | 由安装器写入 | 由脚本写入 | 不写 |
| 生态规模 | 官方仓库 + 商店 | NuGet/社区仓库，历史最长 | 官方 bucket + 社区 bucket |

判断顺序是：需要系统集成（服务、驱动、Shell 扩展）走 winget 或 Chocolatey；开发工具、CLI、绿色软件走 Scoop；条件允许时优先用软件自带的更新机制，因为包管理器只是在猜上游的静默参数。Windows 上手工安装的比例至今很高，原因是大量商业软件既不提供稳定的静默参数，也不提供可脚本化的下载地址。

> 一句话总结：Windows 三条路线的分野在权限与状态存放位置，而不在命令风格。

### 1.8 Nix 与 Guix：把包管理器当成构建系统

多数包管理器的核心数据是「已安装了什么」，Nix 的核心数据是「如何构建出这个产物」。这个差别派生出了它全部的性质，也派生出它全部的代价。

#### 1.8.1 derivation：构建计划本身是数据

一个 derivation（派生）是一段描述构建过程的 Nix 表达式：builder（通常是 bash）、参数、输入路径、环境变量、输出名。它不执行任何操作，只是数据。

真正的关键在下一步。Nix 把这个 derivation 的序列化内容（ATerm 形式）连同全部输入的路径一起哈希，取 SHA-256 的前 160 位做 base-32 编码，得到 store 路径：

```text
/nix/store/<digest>-<name>
```

也就是说，路径本身就是输入的函数（Guix 同构，只是 store 目录换成 `/gnu/store`）。这带来一个反直觉但极其有力的结果：不存在「升级」这个动作，只有「另一个路径出现了」。

- 依赖 A 从 1.0 换成 1.1 → 所有下游的哈希全部改变 → 得到一批全新路径。旧路径不动，随时可以指回去。
- 两个项目分别需要同一个库的不同版本 → 两个路径同时存在于 store，互不覆盖。
- 安装是原子的：新路径构建成功后切换符号链接指向，中途失败就什么也没变。

所有构建在沙箱里进行，默认无网络（声明了输出哈希的 fixed-output derivation 例外）。「可复现构建」在这里第一次成为默认而非附加选项。

#### 1.8.2 profile 与 generations：回滚为什么几乎免费

用户可见的一层是 profile：一个装着大量符号链接的目录，链接指向 store 里的包。每次改动都会生成新的一代——`~/.local/state/nix/profiles/profile` 指向 `profile-N-link`，而后者又指向 store。回滚就是改一个符号链接，没有文件复制，没有重新构建。

```bash
nix-env -iA nixpkgs.ripgrep        # 传统的命令式安装
nix profile install nixpkgs#ripgrep
nix profile list
nix profile rollback
nix-env --list-generations
nix develop                        # 进入由 flake 定义的开发环境
nix build .#hello
nix store gc
```

需要留意两点。其一，`nix profile` 属于实验性的 `nix-command` 特性，接口仍可能变；而且一旦用过 `nix profile`，`nix-env` 会直接拒绝操作同一个 profile，报 profile 与 `nix-env` 不兼容。其二，旧的 generation 是垃圾回收的根，只要它们还留着，对应的 store 路径就不能被删——「随时能回滚」的代价就是磁盘不会自己变小。`nix store gc` 与 `nix profile wipe-history` 才是真正释放空间的动作。

#### 1.8.3 flakes：把「环境」变成可锁定对象

flakes 之前，Nix 表达式依赖 channel：一个指向 nixpkgs 某次提交的全局状态，和项目没有绑定。`flake.nix` + `flake.lock` 把依赖的提交哈希写进仓库，「环境」因此可被 git 追踪，`nix build .#x` 在不同机器上取到同一份 nixpkgs。

争议也在这里。flakes 长期停留在实验性特性上：需要显式打开，接口不保证稳定，社区对它的设计（锁文件语义、registry、与旧命令的割裂）持续争论，一部分用户坚持用 channel 或 pin 版本的旧写法。它同时是「事实上的标准」和「官方尚未定型的实验特性」，这个状态本身就是决策风险。

#### 1.8.4 代价

- 非 FHS 路径的适配：包不在 `/usr` 下，而是 `/nix/store/<hash>-foo/bin`。Nix 靠包装脚本、修补 ELF 的 rpath/interpreter 让它们工作。这对生态里其他工具是破坏性的：预编译二进制、硬编码 `/usr/lib` 的构建脚本、依赖 `#!/usr/bin/env python` 找到解释器的脚本，都可能失效，需要 patch 或加包装层。这不是读几页文档就能绕开的边角问题，而是长期要付的适配成本。
- 磁盘：不同 closure 各带一份依赖，同一个库在 store 里可能有多份；`nix store optimise` 能去重，但要主动执行。
- 学习曲线：Nix 是一门惰性求值的函数式语言，官方文档、社区 wiki 与那个著名的「非官方教程」长期并存，新手看到的多套写法经常互不兼容。

#### 1.8.5 Guix 的差异

Guix 与 Nix 同源（构建守护进程、store 哈希机制、沙箱思路都来自 Nix），差别在语言与立场：配置与包定义全用 Scheme（Guile），没有 Nix 那样混杂的 DSL；更严格地只收录自由软件，非自由固件与驱动需要另开渠道；store 目录是 `/gnu/store`；Guix System 用一份 Scheme 配置声明整个操作系统，对位 NixOS。它的生态规模明显小于 nixpkgs，包数量与二进制缓存覆盖率都差一个量级，这是选型时的硬约束。

#### 1.8.6 什么时候值得用

三件事同时成立时它才划算：要的是很强的可复现性（不只是「有锁文件」，而是构建过程本身可复现）、机器上确实需要多版本长期并存、并且愿意把开发环境写成代码（`flake.nix`、devShell、NixOS 模块）而不是维护一长串安装脚本。反过来，如果只是想在 macOS 上快速装几个 CLI 工具，Homebrew 的边际成本低得多（见第 1.6 节）。

> 一句话总结：Nix 把「安装」变成「计算路径」，换来原子回滚与多版本共存，代价是适配与学习成本。

### 1.9 系统级横向对比与共存策略

第 1.1–1.8 节的工具各自解决同一类问题的不同侧面，并排比较取舍关系会清楚很多。

发行版原生的管理器：

| 管理器 | 包格式 / 仓库 | 求解方式 | 发布模型与回滚 | 系统状态所在 |
| --- | --- | --- | --- | --- |
| apt（dpkg） | `.deb` / 发行版镜像 | 贪心 + 局部回溯 | 固定发行版，无内建回滚 | `/var/lib/dpkg` |
| dnf（rpm） | `.rpm` / 仓库 + 模块 | libsolv 的 SAT 求解 | 固定发行版，`dnf history undo` | `/var/lib/rpm` |
| pacman（Arch） | `.pkg.tar.zst` / 滚动仓库 | 依赖图整体求解 | 滚动，靠降级缓存 | `/var/lib/pacman/local` |
| apk（Alpine） | `.apk` / 仓库 | 依赖图求解 | 固定发行版 + edge | `/lib/apk/db` |
| Portage（Gentoo） | ebuild 源码 + binhost | 依赖图 + USE 标记 | 滚动，配置即状态 | `/var/db/pkg`、`world` |

跨平台与 Windows 上的管理器：

| 管理器 | 包格式 / 仓库 | 求解方式 | 发布模型与回滚 | 系统状态所在 |
| --- | --- | --- | --- | --- |
| Homebrew | formula / cask + tap | 版本唯一，尽量不混搭 | 滚动，旧版本被清理 | prefix 下的 Cellar |
| winget | manifest → 上游安装器 | 无跨包求解 | 跟随上游安装器 | 注册表 + winget DB |
| Chocolatey | NuGet 包 + 脚本 | 无跨包求解 | 脚本驱动升级 | `C:\ProgramData\chocolatey` |
| Scoop | bucket 清单 + 归档 | 无跨包求解 | 目录切换，可保留旧版 | 用户目录 `~\scoop` |
| Nix | derivation / nixpkgs | 求解 + 哈希寻址 | 任意回滚（generations） | `/nix/store` + profile |
| Guix | Scheme 包定义 | 求解 + 哈希寻址 | 任意回滚 | `/gnu/store` + profile |

沙箱与安装脚本：

- apt（dpkg）：有 maintainer script，无强沙箱
- dnf（rpm）：有 scriptlet
- pacman（Arch）：有 install script，无沙箱
- apk（Alpine）：有脚本，极小依赖
- Portage（Gentoo）：本地编译，几乎无隔离
- Homebrew：用户权限构建，无沙箱
- winget：由安装器决定
- Chocolatey：PowerShell 以管理员执行
- Scoop：用户权限，不写注册表
- Nix：沙箱构建，默认无网
- Guix：沙箱构建

表里最值得记住的一列是「系统状态所在」。状态在数据库里的（dpkg、rpm、pacman、apk）能回答「这个文件属于哪个包」「谁依赖它」，因此有能力做一致性诊断；状态在目录里的（Scoop、Nix profile）回滚便宜但反查能力弱；状态散在注册表与上游安装器里的（winget、Chocolatey），包管理器自己也说不清当前到底是什么。

另一条轴是求解粒度。apt/dnf/pacman/apk 和 Nix 做整机或整 profile 范围的依赖求解；三个 Windows 管理器不做跨包求解，每个包各管各的，因此「装 A 破坏了 B」在 Windows 上没有求解器能提前发现。

#### 1.9.1 混装顺序

一台机器上同时存在多个管理器是常态。可行的分层顺序是：

1. 系统关键库与系统服务：只交给发行版包管理器（Linux）或系统自带机制（macOS 的 `/usr`、Windows 的 MSVC 运行时与系统 DLL）。任何跨平台工具都不该覆盖这一层。
2. 语言运行时：交给版本管理器（见[《包管理器（四）》第 1.4 节](/post/2026/09/24/package-managers-practice/#14-版本管理器不是包管理器nvmpyenvrustupasdfmise)），不要用系统包管理器装的解释器去做项目构建，也不要用语言级包管理器去升级系统解释器。
3. 项目依赖：语言级包管理器 + 虚拟环境，装到项目目录或用户目录，永不写系统路径（见[《包管理器（三）》第 1.1–1.10 节](/post/2026/09/24/package-managers-language/#11-javascriptnpm-与它的对手们)）。
4. 用户级 CLI 工具：Homebrew、Scoop、Nix profile、pipx 这一层，属于「用户自己用得爽」的区域，坏了不影响系统。

判断谁在生效永远看 PATH 顺序，不要凭记忆。第一步 `which -a <命令>`（Windows 上是 `Get-Command <命令> -All`），第二步看该路径属于哪个 prefix。这能解决大部分「明明升级了但版本没变」的情形。

风险集中在两处。一是跨平台工具覆盖系统关键组件：Linux 上装 Homebrew 或 Nix 后，若让它们的 `bin` 排在 PATH 前面，`python3`、`openssl`、`curl` 可能整批换成另一套，而系统工具仍按老路径调用，于是出现「同一个名字、两个 ABI」的错乱；NixOS 这类由 Nix 接管全系统的发行版要求「全有或全无」，原因就在这里。二是反向覆盖：用系统包管理器装某工具的「系统版」，再用 Homebrew/Nix 装同一个工具，两者争抢同一个命令名。

#### 1.9.2 经典事故：系统 Python 被污染

最出名的一类事故是往系统 Python 里 `pip install`。发行版自带的 Python 是系统工具（`dnf`、部分 apt 组件、桌面环境脚本）的运行环境，直接装包会替换它们依赖的库版本，症状是命令突然报 `ImportError`，而报错里的名字和用户最近装的东西毫无关系。

这个问题的现代答案是 PEP 668：发行版可以在 Python 环境里放一个 `EXTERNALLY-MANAGED` 标记文件，pip 检测到后拒绝安装，报 `externally-managed-environment`。它把「不要这样做」从文档建议变成工具层面的拒绝，代价是用户必须改用 venv、pipx 或发行版包。细节与正确做法见[《包管理器（三）》第 1.2 节](/post/2026/09/24/package-managers-language/#12-python从-requirementstxt-到-uv)；系统级视角只要记住一条：任何直接写进系统解释器 site-packages 的操作，都应当被当成对系统的修改来对待。

#### 1.9.3 容器与虚拟机

把系统包管理的问题外包给容器镜像是另一条路：容器镜像天然一次性、可重建，回滚靠换 tag 或 digest，隔离靠命名空间——比任何「共存策略」都彻底。代价是镜像内的包级状态不可回滚（换层就是换整个环境）、锁粒度从 lockfile 变成 digest、基础镜像本身成了需要长期维护的依赖。对「多个管理器打架」这类问题，容器是回避而不是解决；什么时候该回避、什么时候该正面解决，见[《包管理器（四）》第 1.2 节](/post/2026/09/24/package-managers-practice/#12-容器与-oci-镜像分发单元的迁移)与[《包管理器（四）》第 3.1 节](/post/2026/09/24/package-managers-practice/#31-决策指南什么场景用什么)。

> 一句话总结：分层放置、看 PATH 定胜负、绝不覆盖系统运行时，是共存的全部规则。
