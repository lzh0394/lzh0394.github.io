---
title: "包管理器（三）：语言级包管理器"
slug: "package-managers-language"
date: "2026-09-24"
categories: ["其他"]
tags: ["包管理器", "编程语言"]
series: "包管理器"
series_order: 3
draft: false
summary: "包管理器系列第三篇：按语言生态梳理语言级包管理器——npm 及其对手、Python 工具链、Cargo、Go modules、Maven/Gradle、NuGet、C/C++ 的空白、Bundler 与 Composer、其余生态速览，末节对比设计取舍。"
---

目录（1 章，10 节）：

| 章 | 标题 |
| --- | --- |
| 1 | [语言级包管理器](#1-语言级包管理器) |

| 节 | 标题 |
| --- | --- |
| 1.1 | [JavaScript：npm 与它的对手们](#11-javascriptnpm-与它的对手们) |
| 1.2 | [Python：从 requirements.txt 到 uv](#12-python从-requirementstxt-到-uv) |
| 1.3 | [Rust：Cargo 的一体化设计](#13-rustcargo-的一体化设计) |
| 1.4 | [Go：GOPATH 的教训与最小版本选择](#14-gogopath-的教训与最小版本选择) |
| 1.5 | [JVM：Maven 的约定与 Gradle 的灵活](#15-jvmmaven-的约定与-gradle-的灵活) |
| 1.6 | [.NET：NuGet 与 PackageReference](#16-netnuget-与-packagereference) |
| 1.7 | [C/C++：没有标准答案的领域](#17-cc没有标准答案的领域) |
| 1.8 | [Ruby 与 PHP：Bundler 与 Composer](#18-ruby-与-phpbundler-与-composer) |
| 1.9 | [其余生态速览：从 Cabal 到 tlmgr](#19-其余生态速览从-cabal-到-tlmgr) |
| 1.10 | [语言级横向对比与设计取舍](#110-语言级横向对比与设计取舍) |

## 1. 语言级包管理器

### 1.1 JavaScript：npm 与它的对手们

JavaScript 生态是包管理的实验场：包的数量最多、工具更替最快、几乎所有设计争论都先在这里发生。理解 npm 的历史，等于看一遍「取舍如何层层累积」。

#### 1.1.1 npm 的演化：每个决定都在还上一个决定的债

npm 最初的设计很直接：包声明依赖范围，安装时求解，每个包在自己的目录下带一份自己的依赖。这保证了近乎完美的隔离——`node_modules/a/node_modules/b` 与 `node_modules/c/node_modules/b` 可以是两个版本。

代价很快就来了：路径极深（Windows 的路径长度限制一度是真问题）、同一个版本被复制几十份、安装耗时随依赖树增长。

npm 3（2015）改为扁平化安装：尽量把共用依赖提升（hoist）到顶层的 `node_modules`。磁盘和速度问题缓解了，但引入了两个长期后果：一是幻影依赖（代码能 `require` 到没声明过的包），二是安装结果受顺序影响（谁先被处理，谁占据顶层位置）。

锁文件随后补齐确定性：npm 5（2017）引入 `package-lock.json`（lockfileVersion 1，本质是一份「当时的依赖树快照」）；npm 7 升级为 v2，同时记录 `packages` 树与旧格式快照以保证向后兼容；npm 9 起常见 v3，只保留 `packages`。v1 描述的是「那一刻的样子」，v2/v3 描述的是「确定的树加完整性哈希」。

同一时期还有 `peerDependencies` 的语义变化：npm 7 之前只在冲突时警告，npm 7 起会自动安装 peer 依赖。好处是消灭了一类「插件找不到宿主框架」的运行时错误，代价是求解器要同时满足更多约束，意外引入的包也更多。

#### 1.1.2 Yarn：两个世代，一套问题

Yarn 1（classic，2016）针对当时 npm 的确定性与速度短板，`yarn.lock` 很快成为行业标配，离线缓存也先于 npm 提供。但它的安装模型仍是 `node_modules` 加提升，所以幻影依赖依旧存在。

Yarn 2 及之后的 Berry 走了另一条路：PnP（Plug'n'Play）。它不生成 `node_modules`，而是生成一份解析映射（`.pnp.cjs`），由运行时插件按映射加载包。收益很实在：依赖必须显式声明（幻影依赖在机制上不可能）、安装更快、磁盘占用更小。

代价同样实在：任何依赖 `node_modules` 物理布局的工具都可能出错——部分编辑器、打包器、原生模块、以及一些历史版本的测试框架。迁移需要引入 SDK 适配，这也是 Berry 的接受度始终不如 classic 的原因。

Berry 还提出过 zero-installs（把 `.yarn/cache` 提交进仓库），启动快，但仓库体积激增，社区争议很大。

#### 1.1.3 pnpm：内容寻址 + 严格布局

pnpm 用两个机制同时解决「省空间」和「边界清晰」：

- 全局内容寻址 store：包按内容哈希存放，项目里的文件通过硬链接指向 store，于是同一版本在全机器只存一份，跨项目也共享。
- 严格的 `node_modules` 布局：顶层只放直接依赖的符号链接，每个包的依赖放在 `.pnpm/` 下的独立目录里。因此代码无法解析到未声明的包——幻影依赖会立刻以「找不到模块」暴露，而不是在换机器时才发作。

它的锁文件（`pnpm-lock.yaml`）记录了导入者与依赖的关系，支持 workspace，冻结安装用 `--frozen-lockfile`。需要兼容旧工具时，可以用 `public-hoist-pattern` 或 `shamefully-hoist` 显式打开提升——注意是「显式」，代价写在配置里，而不是藏在默认行为中。

#### 1.1.4 bun 与 deno：两个方向的激进

bun 是一体化工具链（运行时 + 包管理 + 打包 + 测试），用 Zig 实现，目标是与 npm 生态兼容且显著更快。它早期使用二进制锁文件 `bun.lockb`，后来引入文本格式以改善 diff 与冲突处理。它的激进之处在于愿意跳过部分兼容性检查来换速度，这让它在个别依赖上出现与 npm 不同的行为。

deno 的方向不同：默认不依赖中心化仓库，用 URL 导入模块，权限模型显式（网络、文件、环境变量都要授权），后续加入的 npm 兼容层让它能消费 npm 包。它和 JSR 一起，是对「npm 无命名空间、包名先到先得」这一现实的回应——包名抢注与 typosquatting 在无命名空间的仓库里几乎是必然产物。

#### 1.1.5 workspace、npx 与 corepack

- workspaces：npm、yarn、pnpm 都支持，本地包通过符号链接互相引用，一次提交可以同时改多个包，避免「发布—安装—再改」的循环。
- npx：临时获取并执行一次性 CLI，不污染项目依赖。
- corepack：按 `package.json` 里的 `packageManager` 字段激活指定版本的包管理器，解决「团队里每个人 yarn/pnpm 版本不同、锁文件格式不同」的问题。注意它自 Node.js 25 起不再随 Node 分发，需要单独安装。

#### 1.1.6 命令速查与常见坑

| 任务 | npm | pnpm |
|---|---|---|
| 冻结安装 | `npm ci` | `pnpm i --frozen-lockfile` |
| 加依赖 | `npm i x` | `pnpm add x` |
| 开发依赖 | `npm i -D x` | `pnpm add -D x` |
| 查依赖来源 | `npm ls x` | `pnpm why x` |
| 更新 | `npm update` | `pnpm update` |
| 跑脚本 | `npm run x` | `pnpm run x` |

常见坑，几乎全部与「隔离和确定性」有关：

- 原生模块重编译：node-gyp 需要 Python 与 C++ 编译工具链，Windows 上还依赖 VS Build Tools；而 npm 12 起安装脚本默认不放行（见[《包管理器（一）》第 3.8 节](/post/2026/09/24/package-managers-principles/#38-安装时执行代码一切矛盾的根源)），所以先确认这个包在 allowlist 里——否则失败原因不是缺编译器，而是脚本没被允许。优先选提供预编译二进制的版本，或把安装放进容器。
- 可选依赖的平台差异：esbuild、rollup、sharp 这类包按平台声明可选依赖，跨平台锁文件因此容易「只在 CI 上失败」（见[《包管理器（一）》第 3.5 节](/post/2026/09/24/package-managers-principles/#35-锁文件可复现性的最小代价)）。
- 锁文件合并冲突：不要手工合并，取一方的 `package.json` 重新生成并核对差异。
- `npm install` 与 `npm ci` 混用：前者会改锁文件，后者会拒绝不一致。CI 必须用后者。
- 全局安装的 CLI 与项目依赖打架：把工具声明为开发依赖，通过项目脚本或 `npx` 调用。
- `rm -rf node_modules && npm install`：它是排查手段而不是解决方案。如果它能修好问题，说明之前的状态不可复现——那才是要修的地方。

> 一句话总结：JS 生态的每个工具都在回答同一个问题——当「允许共存」成为默认，谁来保证依赖边界不被污染。

### 1.2 Python：从 requirements.txt 到 uv

Python 的包管理是全系列里「历史层积」最厚的一节：语言本身没有内置依赖管理（第 1.3 节的 Cargo、第 1.4 节的 Go 都是语言自带），于是标准、仓库与外部工具各自演化了二十年，留下的是一堆能互相兼容但不完全等价的东西。

#### 1.2.1 分发形态：sdist、wheel 与平台标签

PyPI 上同一个版本通常有两种文件：源码分发（sdist，一般是 `.tar.gz`）与二进制分发（wheel）。sdist 安装时要执行构建后端（见[《包管理器（一）》第 3.8 节](/post/2026/09/24/package-managers-principles/#38-安装时执行代码一切矛盾的根源)）；wheel 是已构建好的 zip，安装基本等于解压加写元数据。

wheel 文件名在 `包名-版本-` 之后编码了 `python 标签-ABI 标签-平台标签`：

```text
cryptography-46.0.5-cp311-abi3-manylinux_2_34_x86_64.whl
```

- `cp311`：CPython 3.11 及以上（`abi3` 表示用稳定 ABI 编译，一份二进制可供多个版本共用）
- `manylinux_2_34`：Linux + glibc ≥ 2.34；老机器上是 `manylinux2014`（等价于 `manylinux_2_17`）
- `musllinux_1_2`：Alpine 那类 musl libc 系统（[《包管理器（二）》第 1.4 节](/post/2026/09/24/package-managers-os/#14-apk-与-alpine容器时代的极小系统)），与 manylinux 不是一类标签
- `win_amd64` / `macosx_11_0_arm64`：Windows 与 macOS

于是「装不上」绝大多数不是包不存在，而是没有匹配当前平台的 wheel。pip 会退回去下载 sdist 并现场编译，失败信息通常是 `error: Microsoft Visual C++ 14.0 or greater is required`、`gcc: command not found`、`fatal error: Python.h: No such file or directory`。结论是：这类故障是环境问题，不是版本问题，换版本号、加 `--force-reinstall` 都不会有用。

诊断顺序：

```bash
python -c "import sysconfig; print(sysconfig.get_platform())"
pip index versions cryptography   # 看某包在该源上有哪些版本（实验性命令）
pip download cryptography --only-binary=:all: -d /tmp/wheels
```

最后一条最有用：`--only-binary=:all:` 明确禁止编译，报「找不到匹配的发行版」就把「缺 wheel」与「编译不过」分开了。`--no-binary=:all:` 则强制源码构建，只在需要按本机 CPU 指令集优化时才用，代价是时间长、失败率高。

还有一个容易忽略的变量：MSYS2、Windows Store 版、conda 环境里的解释器传给 PyPI 的标签组合各不相同，同一个包在其中一个上装得了、换一个就装不了，是正常的。

标签差异解释了几种常见困惑。Windows 用 `win_amd64`、`win_arm64` 而非「位数」，解释器位数直接决定能装哪个。Alpine 镜像里的 Python 只认 `musllinux_*`，所以同一个包在 `python:3.13-slim`（Debian）能直接装、在 `python:3.13-alpine` 里却要编译，这是很多团队在数据科学镜像上放弃 Alpine 的实际原因（[《包管理器（四）》第 1.2 节](/post/2026/09/24/package-managers-practice/#12-容器与-oci-镜像分发单元的迁移)）。`pip install` 输出里「Using cached …」后面跟着 `.tar.gz` 而不是 `.whl`，就是「接下来要编译」的预告。

#### 1.2.2 虚拟环境：venv 做了什么

`venv` 是标准库自带的隔离机制（[《包管理器（一）》第 3.6 节](/post/2026/09/24/package-managers-principles/#36-隔离从全局到项目级)）。它不复制解释器，而是建出 `pyvenv.cfg` 加一套目录，用路径改写让解释器优先看 `.venv/Lib/site-packages`（Windows）或 `.venv/lib/python3.13/site-packages`（Linux/macOS）：

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # bash/zsh
python -m pip install -r requirements.txt
```

它隔离的是依赖与可执行文件，不隔离解释器版本，也不隔离构建环境（编译 sdist 用的 C 编译器仍来自系统）。`--system-site-packages` 会把全局 site-packages 挂进来，代价是「这个包到底从哪来」重新变得不可预测。

#### 1.2.3 标准的演进：从 setup.py 到 pyproject.toml

早期唯一可执行的是 `setup.py`，于是「包的元数据」实质上是「一段必须被执行的 Python 代码」，这正是[《包管理器（一）》第 3.8 节](/post/2026/09/24/package-managers-principles/#38-安装时执行代码一切矛盾的根源)那类问题的源头。四份 PEP 把它拆成声明式的两层：

- PEP 518：引入 `pyproject.toml` 与 `[build-system]`，声明构建需要哪些工具；
- PEP 517：定义构建后端接口（`build_wheel`、`build_sdist` 等钩子），前端（pip/uv）与后端（setuptools、hatchling、flit、poetry-core、maturin）解耦；
- PEP 621：把项目元数据（名字、版本、依赖、入口点）标准化进 `[project]` 表；
- PEP 735：把「开发依赖分组」标准化为 `[dependency-groups]`。

于是今天一个普通项目的清单可以相当统一：

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "myapp"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "httpx>=0.27,<1",
  "pydantic~=2.7",
]

[project.optional-dependencies]      # 面向使用者：pip install "myapp[postgres]"
postgres = ["psycopg[binary]>=3.1"]

[dependency-groups]                  # 面向开发者：uv sync --group dev
dev = ["pytest>=8", "ruff>=0.6"]

[project.scripts]
myapp = "myapp.cli:main"
```

`[build-system]` 与 `[project]` 分开不是冗余：前者只在「构建这个包」时需要，后者是「这个包是谁」的元数据。对应用（不发布）来说，用 uv 这类把项目当 non-package 处理的工具时，`[build-system]` 甚至可以省略，直接只用 `[dependency-groups]` 加 `dependencies`；但一旦要 `pip install -e .`，构建后端仍然必需（缺省回退到 setuptools）。

#### 1.2.4 requirements.txt 与 requirements.in 的定位差异

这两个文件常被混用，但角色完全不同：

| 文件 | 内容 | 角色 |
|---|---|---|
| `requirements.in` | 手写的直接依赖，可以带范围 | 约束（manifest） |
| `requirements.txt` | `pip-compile` 生成的完整闭合集合，全部 `==` 并带来源注释 | 求解结果（lock） |

也就是说，`requirements.in` 对应[《包管理器（一）》第 3.5 节](/post/2026/09/24/package-managers-principles/#35-锁文件可复现性的最小代价)说的「清单」，`requirements.txt` 对应「锁文件」；前者人写，后者机器生成。把两者都提交，并在 CI 里校验「重新编译结果是否与本文件一致」，才拿到可复现性。

而 `pip freeze > requirements.txt` 是另一回事：它导出当前环境里所有已安装的包，包括从未声明过的传递依赖、以及可能来自本地路径安装的东西（在 Windows 上会写出 `-e file:///C:/...` 这类绝对路径）。临时冻结一台机器时它有用，在正经项目里会把环境里的脏东西一并固化。

#### 1.2.5 工具谱系：从 pip 到 uv

`pip` 只做一件事：把给定的要求装进当前环境。它不生成锁文件、不管项目结构、也不管当前在哪个环境里。

pip-tools 用两个命令补上锁定这一环：`pip-compile` 把 `.in` 编译成完全固定的 `.txt`，`pip-sync` 让环境精确等于 `.txt`（会卸载多余的包）。一个关键限制是它按当前环境求解：Python 版本、操作系统、甚至已装包都会影响输出，所以不同平台需要各自编译一份 `.txt`，并明确按平台与 Python 版本命名区分。

Poetry 走一体化路线：`pyproject.toml` + `poetry.lock`，配 `poetry add`/`install`/`run`。它在 2.0 之后把元数据写进标准的 `[project]` 表，只在 `[tool.poetry]` 里保留标准没有的部分，这是一次重要的收敛。代价是它自带一套环境与安装逻辑，和 `pip` 的行为不总是逐条一致。

PDM 与 Hatch 是同一层里的另两个选择。PDM 强调同时兼容 PEP 621 与 `[dependency-groups]`，并能导出 `requirements.txt` 给不认 `pyproject.toml` 的部署环境；Hatch 的核心是构建后端 `hatchling` 加可声明的环境矩阵，更偏项目任务编排而非依赖求解。

uv 是 Rust 实现的一体化工具，把这些前端、锁文件、venv、Python 版本安装、`pipx` 式工具运行收进了一个二进制。两个关键设计：求解器基于 PubGrub（[《包管理器（一）》第 3.3 节](/post/2026/09/24/package-managers-principles/#33-依赖求解从贪心到-sat)讨论的冲突学习型算法），并且生成跨平台通用锁文件 `uv.lock`——不像 `pip-compile` 那样每个平台各锁一份。

迁移路径是 `uv pip` 这层兼容接口：`uv pip install`、`uv pip compile`、`uv pip sync` 的参数尽量贴近 `pip`/`pip-tools`，不用重写脚本。取舍是：`uv pip` 默认仍按当前环境求解、不产生 `uv.lock`（那要 `uv lock` + `uv sync`），所以它解决的是「快」，不自动解决「可复现」；要可复现就得接受 uv 的项目模型，而不是只换命令前缀。

截至 2026 年中，uv 的版本仍在 0.x 阶段（PyPI 上为 0.12.x 系列），但已被声明为生产就绪，并把 0.x 的次版本号当作可能的破坏性变更边界——升级前值得读 changelog。Poetry 则在 2.x 系列。这两个事实都易变，使用前以官方文档为准。

#### 1.2.6 为什么 pip 的求解曾经那么慢

「pip 装得慢」经常被归因于 Python 慢，这不准确。真实原因有三层，按影响排序：

一，回溯求解需要元数据，而元数据曾经必须下载整包才能拿到。pip 在 20.3 之前用的是「只取最新版」的贪心求解，20.3 起默认换成带回溯的求解器，遇到冲突会退回尝试别的版本。正确性大幅提升，代价是它要读取大量候选版本的依赖声明。在 PEP 658 之前，PyPI 的 Simple API 只提供文件链接，要读 `.dist-info/METADATA` 就得把整个 wheel 下下来——求解一个包等于下载几十个 wheel。PEP 658 增加了紧随其后的 `.metadata` 文件，pip 也支持用 HTTP range 请求只取 zip 中央目录里的那一段；但只发 sdist 的包没有这个便利，仍要下载甚至构建，这就是某些包求解特别慢的原因。

二，回溯本身在冲突严重时是指数级的（[《包管理器（一）》第 3.3 节](/post/2026/09/24/package-managers-principles/#33-依赖求解从贪心到-sat)）。约束互相矛盾的依赖图会让求解器反复试错，典型表现是输出不断刷新的「Downloading …」与最终一句 `ResolutionImpossible`。

三，大包的体积与网络。torch 这类包的 wheel 动辄几百 MB 到数 GB，这一步耗时与求解器无关。

uv 之所以快，是同时在这三层上做了事：Rust 实现与并行下载只是表象，更关键的是它优先读 PEP 658 元数据、激进缓存、用 PubGrub 减少无效回溯、并且用硬链接/写时复制从全局缓存「安装」（[《包管理器（一）》第 3.6 节](/post/2026/09/24/package-managers-principles/#36-隔离从全局到项目级)里 pnpm 的同类思路）。所以在依赖图复杂、需要多次求解的项目上，两者的差距比在简单项目上大得多。

#### 1.2.7 conda / mamba / pixi：另一条路线

conda 不是 Python 包管理器，而是跨语言的二进制分发与环境管理器。它的包可以装 Python 解释器、编译器、MPI、CUDA runtime、`ffmpeg`、R 语言。对「numpy + 一块匹配驱动的 CUDA + cudnn」这种需求，conda 是少数能一次说清的方案；pip 只能管 Python 那一半。

机制上它以环境为中心：一个环境就是一个前缀目录，里面有自己的解释器、库和 `bin/`；求解由 conda 自己做，历史上默认求解器性能一般，后来换成基于 libsolv 的 libmamba（`conda-libmamba-solver`，从 conda 23.10 起成为默认）。`mamba` 是最早用上 libmamba 的独立客户端。`pixi` 是较新的一代：同样基于 conda 生态的包，但把项目清单、锁文件（`pixi.toml` + `pixi.lock`）与任务运行做成了 Cargo 式的体验。

conda 与 pip 混用的现实问题值得单独说：conda 不知道 pip 装了什么。在环境里 `pip install` 一个包，之后 `conda install` 另一个需要同类依赖的包，conda 会按自己的视图重新安排文件，pip 装的那份可能被覆盖或变得不一致。可见的做法是先用 conda 装尽可能多的东西、最后用 pip 补；或干脆用 pixi/uv 把两类依赖声明在同一份清单里，让工具去协调。

#### 1.2.8 PEP 668 与 externally-managed-environment

这是近年最常见的报错之一：

```text
error: externally-managed-environment
× This environment is externally managed
```

原因不是 pip 坏了，而是发行版在 Python 的 `stdlib` 目录里放了标记文件 `EXTERNALLY-MANAGED`（PEP 668 规定的位置），它标记的是整个解释器安装。触发它的历史事故是真实存在的：用 pip 升级系统 Python 的某个库，把 `dnf`、`apt` 的 Python 依赖搞坏，甚至 `pip uninstall` 删掉发行版拥有的文件（[《包管理器（二）》第 1.9 节](/post/2026/09/24/package-managers-os/#19-系统级横向对比与共存策略)）。

这个标记在虚拟环境里不会触发，因为规则本来就是「虚拟环境内任意安装」。所以在 Debian 12、Ubuntu 23.04+、Fedora、Homebrew 的 Python 上，三种正确做法是：

1. 项目依赖 → venv。`python -m venv .venv` 后在里面装。这是默认答案，覆盖 90% 的场景。
2. 命令行工具 → pipx。`pipx install ruff` 会给每个工具建一个独立 venv 并把可执行文件暴露到 `~/.local/bin`，工具之间互不干扰，也不碰系统 Python。`uv tool install` 是同类能力。
3. 系统集成 → 发行版包。如果某个东西要被系统服务、系统脚本导入，就用 `apt install python3-xxx`，让它受发行版的生命周期管理。

命令行的逃生门是 `--break-system-packages`（环境变量 `PIP_BREAK_SYSTEM_PACKAGES=1`），把它当成「明确在改系统 Python」的显式声明，不要写进任何文档或脚本模板——一写进去就会被复制到别人机器上。

#### 1.2.9 命令速查

| 目的 | pip / venv | uv（项目模式） |
|---|---|---|
| 建环境 | `python -m venv .venv` | `uv venv`（默认 `.venv`） |
| 加依赖 | 编辑文件后 `pip install -r requirements.txt` | `uv add httpx` |
| 装全部 | `pip install -r requirements.txt` | `uv sync` |
| 加开发依赖 | `pip install -r dev-requirements.txt` | `uv add --group dev pytest` |
| 升级单个 | `pip install -U httpx` | `uv lock --upgrade-package httpx && uv sync` |
| CI 冻结安装 | `pip install --require-hashes -r req.txt` | `uv sync --locked` |
| 导出兼容锁 | `pip-compile --generate-hashes` | `uv export --format requirements-txt` |

`--locked` 的含义是「锁文件与清单不一致就直接失败」，这正是 CI 想要的语义；`uv sync --frozen` 则是「不重新求解，直接用现有锁文件装」，两者别混。

#### 1.2.10 常见坑

`==` 与 `~=` 的语义差别。`~=2.2` 表示 `>=2.2, ==2.*`；`~=1.4.5` 表示 `>=1.4.5, ==1.4.*`。也就是说尾部组件数决定了「锁到哪一位」，`~=1.4.5` 允许升到 1.4.9 但不允许 1.5.0。写 `~=` 之前先确认自己想要的边界，它的行为跟 npm 的 `~` 不是一回事。

dev 依赖分组要选一种并写清。三种写法并存是常见的混乱源：`[project.optional-dependencies]`（使用者可见，`pip install "pkg[dev]"`）、`[dependency-groups]`（PEP 735，开发专用）、以及 Poetry/uv 的私有分组表。前两者是标准，第三方工具也能读；后者只有对应工具认。给库用前者，给应用用后者，别两边都写一遍。

锁文件与 CI 必须配套。提交了锁文件但 CI 里仍跑 `pip install -r requirements.txt`（没有哈希校验、且会按需升版本），等于没有锁。生产镜像里推荐 `--require-hashes` 或工具自带的冻结模式（[《包管理器（四）》第 2.2 节](/post/2026/09/24/package-managers-practice/#22-防御一锁定校验与最小权限)会展开）。

`--index-url` 与 `--extra-index-url` 的优先级陷阱。`--index-url` 是替换默认索引（也就是不指定时用的 PyPI），`--extra-index-url` 是追加。关键点在于 pip 会把所有源合并成一个候选池，然后选版本号最高的那个：它没有「私有源优先」的概念。于是当一个内部包名恰好也存在于公网 PyPI 上，攻击者只要发一个版本号更高的同名包，pip 就会从公网装它——这就是依赖混淆（dependency confusion，详见[《包管理器（四）》第 2.1 节](/post/2026/09/24/package-managers-practice/#21-威胁模型依赖链为什么脆弱)）。稳妥做法是：`--index-url` 指向唯一可用的源；需要多源时按包名配置而不是全局混合；用哈希校验（`--require-hashes`）让「内容不对」直接失败，而不是靠源顺序赌运气。

`pip freeze` 当作锁文件。它导出的是环境快照而不是求解结果（前面讲 `requirements.txt` 时已经解释过），后果很具体：环境里的脏东西会被一并固化。

`python -m pip` 而不是 `pip`。PATH 里存在多个 Python（系统、pyenv、conda、uv 装的）时，裸 `pip` 可能指向另一个解释器；`python -m pip` 才保证装进当前解释器，这是排查「装上了但 import 不到」的第一条命令。

> 一句话总结：Python 打包的标准已经收敛，剩下的分歧在于求解、锁与隔离这三件事分别交给谁来做。

### 1.3 Rust：Cargo 的一体化设计

#### 1.3.1 它替代了哪些工具

在 Cargo 出现之前，Rust 项目靠 Makefile 加 rustc 自己拼装；C 语言生态到今天仍在为「构建脚本该用哪一套」争论（见第 1.7 节）。Cargo 把依赖声明、构建、测试、文档、发布压进一个命令，配置全部落在 `Cargo.toml`：一个 `[dependencies]` 表既是清单（约束），也是构建输入的来源。`cargo test`、`cargo doc`、`cargo publish`、`cargo bench` 不需要额外的插件或脚本。

这种一体化买来的是一致性：任何 Rust 项目用同一条命令还原、构建、测试，CI 配置几乎可以照抄。代价是 Cargo 成了一个很难替换的单点，任何它不支持的构建需求（自研工具链、非常规产物布局）都只能靠 `build.rs` 绕过。

#### 1.3.2 SemVer 假设与 resolver 版本

Cargo 假定 crate 遵守 SemVer。`bitflags = "1.0"` 的含义是 `>=1.0.0,<2.0.0`；只要能统一，Cargo 会尽量复用同一个版本，以减少编译时间和让类型在 API 之间可以互换。`0.x` 是特例：`^0.1.2` 的实际范围是 `>=0.1.2,<0.2.0`，前导非零段才定义兼容性。这是承认 0.x 天然不稳定，也意味着升级到下一个次版本就可能是破坏性变更。

求解器版本按 edition 演进（截至 2026 年）：`edition = "2021"` 默认 resolver v2，它改变了 feature 与 target 的合并方式；`edition = "2024"` 默认 resolver v3（resolver v3 需要 Rust 1.84+，而 edition 2024 本身需要 Rust 1.85+），它把 `resolver.incompatible-rust-versions` 的默认值从 `allow` 改成 `fallback`。也就是说 v3 的主要变化不是 feature，而是让求解器倾向选择不超出 `rust-version` 声明的依赖版本。

#### 1.3.3 features 合并是抱怨的源头

一个包依赖 `im` 并开 `serde`，另一个依赖 `im` 并开 `rayon`，Cargo 会同时打开两个，因为它们是一份编译产物。这样设计是为了减少重复编译、让类型可以跨 API 传递；代价是 feature 集合会渗透到所有使用方，一个下游启用重型 feature，整个依赖图就跟着变重。社区讨论最多的例子就是 `serde`、`schemars` 这类会被下游顺手打开的 feature，根源在于这个机制没有反向的隔离手段。

resolver v2 的修正是把合并拆细：目标平台不匹配的 target-specific feature 不再启用；`build-dependencies`、proc-macro 的 feature 不再和普通依赖合并；dev-dependencies 只在真正构建测试时才合并。workspace 一起构建时（`--workspace` 或多次 `-p`）feature 仍然统一，想避开只能分成多次 cargo 调用。

排查靠命令：

```bash
cargo tree -d                      # 列出重复出现的依赖版本
cargo tree --invert serde          # 谁引入了 serde
cargo tree --edges features        # 哪个包打开了这个 feature
```

`-d` 特别有用：同一 crate 出现两个不兼容版本时，类型会被编译器视为不同类型，`downcast_ref` 之类通常会在编译期就报错，偶尔才表现为运行期行为异常——这与第 1.5 节 JVM 的「运行时缺类」是同一类问题的不同表现。

#### 1.3.4 安全卫生与生态现实

`cargo audit` 和 `cargo deny` 不是 Cargo 自带的子命令，而是两个独立工具（`cargo install cargo-audit`、`cargo install cargo-deny` 装上后以子命令形式调用）。前者查 RustSec advisory 数据库里的漏洞；后者读一份 `deny.toml`，把许可证白名单、重复依赖、禁用来源、advisory 检查放进同一个策略文件，更适合当 CI 门禁。`rust-version` 字段声明 MSRV，工具链过旧时 Cargo 会直接报错；resolver v3 的 `fallback` 是在此之外再让解析器避开超出 MSRV 的依赖版本。

生态层面的现实是 crates.io 没有命名空间：包名全局独一无二，`serde` 只能有一个所有者，抢注之后基本没有回收机制。加上「依赖大量小 crate」的惯例，一个中等项目的依赖图动辄几十上百个包，编译时间成为主要成本，`cargo vendor` 和离线构建则把网络风险换成了仓库体积。

> 一句话总结：Cargo 用一体化换来了确定性，代价是 feature 合并无法真正隔离，只能靠拆包规避。

### 1.4 Go：GOPATH 的教训与最小版本选择

#### 1.4.1 从 GOPATH 到 modules

GOPATH 时代只有一个目录树，所有项目的依赖按 import 路径平铺在 `$GOPATH/src` 下，谁也无法声明「需要哪个版本」。两个项目需要同一个库的不同版本时，没有解。社区先是用 `vendor/` 目录做项目内快照，再出现 dep 这类工具，最后由 modules 接管。

modules 给出的答案不是更聪明的求解器，而是把问题从根上削掉一半：版本以模块为单位，约束是「最低要求」而不是「精确要求」，并且用主版本后缀（`example.com/mod/v2`）让不兼容版本成为不同的模块路径。两个主版本可以合法共存，diamond dependency 不再是矛盾，而是两个不同名字的依赖。

#### 1.4.2 MVS 到底选了什么

最小版本选择（Minimal Version Selection）的规则一句话：从主模块出发遍历依赖图，每个模块记录所有约束里最高的那个最低要求，遍历结束时这组版本就是构建列表。官方文档的例子很直白——主模块要求 A 1.2 和 B 1.2，A 1.2 要 C 1.3、B 1.2 要 C 1.4，而 C 1.3 与 C 1.4 都要 D 1.2，结果是 A 1.2、B 1.2、C 1.4、D 1.2；即使 B 和 D 有更新版本，没有东西要求它们，就不会被选中。

这不是「取最新兼容版」，而是「取所有约束里最高的最小版本」，它是可判定的、不需要回溯求解的。

好处是可预测和不漂移：MVS 是确定性的，新的依赖版本发布不会改变构建列表，所以 Go 不需要锁文件，`go list -m all` 每次都能重算。坏处同样明显——它「升级不积极」。`go get -u` 是显式的，没有它，间接依赖就一直停在首次引入的最低版本上，一个已知漏洞可能在完全不碰 go.mod 的情况下继续存在。

还有一处容易被误解的细节：MVS 的计算要读取被选中版本的 `go.mod`，所以当某个依赖（由人工或升级工具）升到新的 patch 版本时，如果它在新版本里提高了自己某个依赖的最低要求，构建列表会被一起推高。写下 `require C v1.3.0`，得到的可能是 C 1.5.0。

#### 1.4.3 go.sum、校验数据库与私有模块

`go.sum` 不是锁文件，它记录的是模块内容的校验和（包括 go.mod 文件本身的哈希），作用是校验完整性；构建列表由 MVS 每次算出来。`go mod tidy` 默认会按 `go` 指令的版本往前一个版本记录校验和，`-compat` 可以改这个默认。校验和不匹配时构建直接失败——这是[《包管理器（四）》第 2.2 节](/post/2026/09/24/package-managers-practice/#22-防御一锁定校验与最小权限)「哈希只能证明内容一致，不能证明首次没被投毒」的具体形态。

`GOPROXY` 是一个逗号分隔的列表，元素可以是代理 URL，也可以是关键字 `direct`（直接走 VCS）或 `off`。go 命令按顺序尝试：某个源返回 404 或 410 才继续下一个，其他错误则停下。因此「公司代理在前、proxy.golang.org 在后」的顺序会同时得到内网优先和公网兜底。

`GOPRIVATE` 声明不走代理、也不查校验数据库的模块路径（例如 `*.corp.example.com`），是私有模块最常用的一个开关；`GONOPROXY` 和 `GONOSUMDB` 可以分别覆盖这两个维度。校验数据库由 `GOSUMDB` 控制，默认是 `sum.golang.org`，设为 `off` 就整体关闭。

#### 1.4.4 工具链也归包管理器管

Go 1.21 起，`go` 命令和工具链分离，`go.mod` 里的 `go` 行声明最低要求的 Go 版本，`toolchain` 行声明偏好的版本（缺省时视作与 `go` 行一致）。当默认工具链比它旧时，go 命令先找 PATH 里名为 `go1.21.9` 的可执行文件，找不到就下载并校验后再运行。

`GOTOOLCHAIN` 默认是 `auto`；设为 `local` 强制只用内置工具链（此时遇到要求更新的模块会直接报错），设为 `GOTOOLCHAIN=go1.21rc3` 这类具体值则强制使用指定版本。有一个值得知道的不对称：工具链是以 `golang.org/toolchain` 模块的形式下载的，但因为具体版本取决于系统默认工具链和 GOOS/GOARCH，它的校验和不写进 `go.sum`，而是靠校验数据库验证——所以 `GOSUMDB=off` 会让工具链下载因缺少校验而失败，且 `GOPRIVATE`、`GONOSUMDB` 对工具链不生效。

排查和离线：

```bash
go mod graph        # 模块依赖图
go mod why -m pkg   # 为什么这个模块在构建列表里
go mod vendor       # 生成 vendor/，离线构建用
```

两个常见坑。一是 `replace` 滥用：指向本地路径的 replace 在 CI 里通常解析不到，或者让本地通过、CI 失败。二是 `go.work` 是否提交——官方建议一般不要提交，因为它会让 CI 选中与「本模块被别人依赖时」不同的版本组合。

> 一句话总结：MVS 用「最低要求取最高」换掉了求解器和锁文件，代价是依赖不会自己变新。

### 1.5 JVM：Maven 的约定与 Gradle 的灵活

#### 1.5.1 Maven 的模型

Maven 用坐标（groupId/artifactId/version）标识依赖，用固定的构建生命周期组织编译、测试、打包、发布，中央仓库提供默认源。依赖声明直接写在 `pom.xml` 的 `<dependencies>` 里，传递依赖自动引入且没有层数限制。所有依赖最终挂到一个扁平 classpath 上，一个类加载器，没有版本隔离——这一点决定了后面所有问题。

#### 1.5.2 nearest-wins 与「运行时缺类」

依赖版本的仲裁规则叫最近优先（nearest definition wins）：选依赖树里离项目最近的那个版本；两个版本深度相同时，先声明的那一条胜出。官方文档的例子是 A → B → C → D 2.0 与 A → E → D 1.0，因为经过 E 的路径更短，D 1.0 会被选中。

这为什么会导致运行时错误而不是求解失败？因为仲裁一定会选出一个版本，从不因为冲突而中止构建。被淘汰的版本里存在的类就成了「编译期能引用、运行时不存在」：编译时 classpath 上恰好有那个类，运行时挂载的 jar 里没有，于是抛 `NoClassDefFoundError` 或 `ClassNotFoundException`。更麻烦的是方法签名变化——两个版本都有这个类，但方法不同，报错位置和真实原因相隔很远。

根本原因是 JVM 类路径没有原生隔离机制（模块系统和自定义类加载器是绕行方案，但代价大），所以「选一个版本」是框架层面的必然，而不是 Maven 的懒惰。

#### 1.5.3 dependencyManagement 与作用域

`<dependencyManagement>` 是官方给的补救：它只声明版本、作用域和排除规则，不引入依赖；但它的优先级高于传递依赖的仲裁。父 POM 里集中写一遍，子模块引用时连版本都不必写。三条来自文档的注意点：dependencyManagement 不影响插件的传递依赖，只影响项目依赖；导入 BOM 用 `<type>pom</type>` 加 `<scope>import</scope>`，多个 BOM 里都有某个 artifact 时，先导入的赢；导入方仍然要自己为传递依赖指定版本，否则会因为缺版本而构建失败。

作用域共六种，常用的四组差别值得记牢：`compile` 是默认，参与所有 classpath 且向下传递；`provided` 参与编译和测试但不进运行 classpath（典型是 Servlet API，由容器提供），且不传递；`runtime` 不进编译 classpath、进运行 classpath；`test` 只用于测试编译与执行，不传递。传递依赖的作用域会按文档里的合并表裁剪，例如 `compile` 依赖带来的 `provided` 传递依赖会被直接丢弃。排除用 `<exclusions>`，按坐标匹配。

排查靠 `mvn dependency:tree`，先看是哪条路径把错误版本拉进来的，再决定用 exclusion 还是用 dependencyManagement 钉版本。

#### 1.5.4 Gradle 的不同答案

Gradle 的等价机制是配置约束而不是先来后到：`implementation(platform("..."))` 导入 BOM 作为约束，`enforcedPlatform` 则强制其版本覆盖其他来源；`dependencies { constraints { ... } }` 声明约束而不引入依赖；`resolutionStrategy.force` 和 `resolutionStrategy.failOnVersionConflict()` 提供更硬的开关。Gradle 默认的冲突解法是选最高版本而不是最近版本，这一点与 Maven 相反，两边行为不一致是混用两个构建工具时最容易踩的坑。

版本目录（version catalog）是另一件事：`gradle/libs.versions.toml` 用 `[versions]`、`[libraries]`、`[bundles]`、`[plugins]` 四张表集中声明版本，build 脚本里以类型安全的 `libs.xxx` 访问。它解决的是多模块仓库里版本散落各处的可维护性问题，本身不是求解策略——同一个版本仍是全仓库一个值，改一处即全改。

JVM 生态有一个别处少见的强约束：Maven Central 不允许对同一坐标重新发布，这让版本号大致可信，也让「重新发布修正版」这种诱人做法行不通——代价是得发新版本号。sbt 和 Mill 在 Scala 与混合语言构建里各有一批用户，但整个生态的冲突模型是同一套。

> 一句话总结：JVM 的扁平类路径决定了它只能选一个版本，运行时缺类是这个选择的必然产物。

### 1.6 .NET：NuGet 与 PackageReference

#### 1.6.1 从 packages.config 到 PackageReference

旧式 `packages.config` 是一个独立的 XML 文件，列出项目直接依赖的包及其版本，还原时把包解到解决方案旁边的 `packages/` 目录，项目文件里逐条写入 `HintPath` 引用。它的结构性缺陷是：每个包都算顶层依赖，传递依赖不会自动出现，必须手动装一遍；升级一个库往往要连带调整一串引用。

PackageReference 把依赖声明直接写进 MSBuild 项目文件：

```xml
<ItemGroup>
  <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
</ItemGroup>
```

这一步换来的是传递依赖、项目级统一的版本选择、`PrivateAssets`/`IncludeAssets` 对资产流的控制，以及不再污染解决方案目录。代价是引入了版本选择问题：`Version="4.0.0"` 的含义是「>=4.0.0，且偏好最低的那个」，官方文档把这个取向叫「最近的最低版本」（nearest minimum version）。它带来一个反直觉的后果：即使仓库里已经有 4.1.0、4.2.0、4.3.0，只要 4.0.0 尚未发布，它就会解析到 4.1.0；等 4.0.0 真正发布，它反而会换成 4.0.0。想看清实际选了哪个版本，需要锁文件和 `dotnet list package --include-transitive`，这也是下面这套可复现性机制存在的原因。

#### 1.6.2 packages.lock.json 与集中版本管理

锁文件默认不生成。在项目文件里设 `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` 之后，第一次 restore 会生成 `packages.lock.json`，把直接与传递依赖的完整闭包连同版本一起记下来（官方文档给出的一个理由很具体：`Version="4.0.0"` 在某天可能因为 4.0.0 还没发布而被解析成 4.1.0，等 4.0.0 真的发布，还原结果又会变）。此后在清单未变时，restore 会先按锁文件跑、不再重新求值依赖图；一旦项目文件有变化，它仍会重新解析并在需要时更新锁文件。

CI 应该用 `dotnet restore --locked-mode`。锁文件与项目不一致时不会静默升级，而是直接报错 NU1004，错误信息会明确写出差异，例如目标框架从 `net5.0,net6.0` 变成 `net6.0`，或者某个 `PackageReference` 的版本范围从 `[2.0.0, )` 改成了 `[1.2.3, )`。这条报错在 CI 里出现，基本都意味着有人改了依赖但忘了更新锁文件。

锁文件该不该提交，官方建议和[《包管理器（一）》第 3.5 节](/post/2026/09/24/package-managers-principles/#35-锁文件可复现性的最小代价)讲的一般惯例一致：应用（处在依赖链起始位置、要交付可执行文件的项目）提交；被别的项目引用的库不提交，因为库自己的锁文件管不到上层项目的还原结果。

版本浮动（floating version）会削弱锁文件的价值：`Version="3.6.*"` 表示取区间内最新，没有锁文件时，新版本一发布就会改变下次还原的结果；有锁文件时它停在锁定的那一个，除非显式加 `--force-evaluate` 重新求值。浮动版本是「永远自动升级」和「永远不动」之间的第三个选项，代价是本地与 CI 有可能在同一份代码上得到不同版本。

集中包管理（Central Package Management，CPM）解决的是另一个维度：多项目仓库里同一个包的版本号散落在几十个项目文件里。在仓库根放 `Directory.Packages.props`：

```xml
<PropertyGroup>
  <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
</PropertyGroup>
<ItemGroup>
  <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
</ItemGroup>
```

各项目文件里只写 `<PackageReference Include="Newtonsoft.Json" />`，不写 `Version`，值统一由 props 文件提供；个别项目需要偏离时用 `VersionOverride`。它是逐级向上查找的，所以可以在子目录再放一份覆盖。注意 CPM 和锁文件是两件独立的事，同时启用时两边都要维护。

#### 1.6.3 源、缓存与多目标框架

`NuGet.config` 沿目录层级向上合并，`<packageSources>` 里的顺序就是优先级；在某一层的配置里用 `<clear />` 可以清空继承来的源列表——这是企业内网最常见的写法，目的是防止内部包名意外从公网同名包还原下来。`<packageSourceMapping>` 做得更细：为包名模式绑定允许的源。

全局包缓存默认在用户配置文件下的 `.nuget\packages`（Windows）或 `~/.nuget/packages`，`dotnet nuget locals all --list` 能打印各个缓存的实际路径，`dotnet nuget locals all --clear` 清空。缓存内容错乱和源顺序错乱的症状很像：还原出来的版本或内容不对，先清缓存再复现，能区分是源的问题还是本地状态的问题。

多目标框架（TFM）是 .NET 特有的一层复杂度，`<TargetFrameworks>net8.0;net48</TargetFrameworks>` 会让依赖出现条件分支：用 `Condition="'$(TargetFramework)' == 'net48'"` 给不同框架配不同包。它直接反映在锁文件里——锁文件按框架分别记录，所以加一个目标框架就会让 NU1004 触发。

> 一句话总结：PackageReference 换来了传递依赖，也换来了必须自己维护的锁文件与集中版本表。

### 1.7 C/C++：没有标准答案的领域

#### 1.7.1 为什么这里没有中心化包管理器

JS、Python、Rust、Go 的包管理器都有中心仓库，C/C++ 没有，原因不在社区懒，而在三个技术前提都不成立。

第一，C++ 没有稳定的 ABI。Linux 上 GCC 与 Clang 默认都用 libstdc++、同属 Itanium ABI，通常可以互链；真正的分界线是标准库实现（libstdc++ 与 libc++）、`_GLIBCXX_USE_CXX11_ABI`（改一次，`std::string` 的内存布局就变了）、MSVC 与 MinGW、以及 glibc 与 musl。第二，没有统一构建系统：Autotools、CMake、Meson、手写 Makefile 长期并存，且每个项目的安装布局各不相同。第三，库的来源本身是分裂的：zlib、OpenSSL 通常由系统包管理器提供，而 header-only 的 fmt、Catch2 往往直接塞进源码树。

于是「装一个包」在这里必须回答两个别处不用问的问题：用哪个编译器编？链接动态库还是静态库？这两个问题不解决，二进制就无法复用。这就是 C/C++ 的「包管理」实质是可复现的构建配置管理。

#### 1.7.2 四条路线与各自代价

| 路线 | 拿到什么 | 代价 |
|---|---|---|
| Conan | 配方 + 二进制缓存，跨平台构建矩阵 | 要自建或租用制品库，profile 概念陡峭 |
| vcpkg | 清单模式 + triplet，与 CMake 工具链自动集成 | 大型三元组（triplet）组合下构建量大，需自建二进制缓存 |
| CMake 自带机制 | 零外部依赖，依赖随项目源码一起编 | 无缓存、无版本求解，同步发生在 configure 期 |
| Spack | 源码构建 + 编译器/MPI 变体，环境可整体重现 | 一个变体组合就是一次构建，时间成本高 |

四者不互斥：HPC 之外的项目常见组合是系统包管理器提供基础库、vcpkg 或 Conan 提供其余依赖。

#### 1.7.3 Conan：把二进制缓存当第一批公民

Conan 2 的核心概念是配方（recipe，`conanfile.py`）、profile（编译器、架构、构建类型）和二进制包 ID。包 ID 由 settings、options 与依赖共同哈希得出，因此「换编译器」不是覆盖安装，而是多出一个可并存的二进制。

```python
from conan import ConanFile
from conan.tools.cmake import CMakeDeps, CMakeToolchain

class AppConan(ConanFile):
    settings = "os", "arch", "compiler", "build_type"
    requires = "zlib/1.3.1", "fmt/11.0.2"
    generators = "CMakeDeps", "CMakeToolchain"
```

```bash
conan install . --build=missing -s build_type=Release
```

`--build=missing` 的语义值得记住：缺少匹配二进制时回落到源码构建，而不是自动降级到旧版本。如果想装旧版本，必须在配方里写死；默认行为是缺二进制就报错。Conan 也有锁文件：`--lockfile-out=conan.lock` 生成，下次 `conan install` 会优先读取同目录的 `conan.lock`（Conan 2.32 文档口径，2026 年）。

#### 1.7.4 vcpkg：用工具链文件接管 `find_package`

vcpkg 的巧妙之处是不发明新构建流程，而是把自己伪装成一个 CMake 工具链文件。在 `CMakePresets.json` 里声明：

```json
{
  "version": 3,
  "configurePresets": [
    {
      "name": "release",
      "binaryDir": "${sourceDir}/build",
      "cacheVariables": {
        "CMAKE_TOOLCHAIN_FILE": "$env{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake",
        "VCPKG_TARGET_TRIPLET": "x64-windows"
      }
    }
  ]
}
```

`vcpkg.json` 里声明依赖，configure 阶段会自动执行安装。两个容易踩的点：所有影响 vcpkg 的变量必须写在第一个 `project()` 之前；清单模式下依赖装到 `${CMAKE_BINARY_DIR}/vcpkg_installed`（经典模式才是 `$VCPKG_ROOT/installed`），因此构建目录一换就等于重装，二进制缓存（`VCPKG_BINARY_SOURCES`）在生产里几乎是必需的。

#### 1.7.5 CMake 自带机制：把依赖当源码

`FetchContent` 是最朴素的一条路：在 configure 期把依赖源码拉下来，用 `add_subdirectory` 编进同一个构建树。

```cmake
include(FetchContent)
FetchContent_Declare(fmt
  GIT_REPOSITORY https://github.com/fmtlib/fmt.git
  GIT_TAG 11.0.2)
FetchContent_MakeAvailable(fmt)
target_link_libraries(app PRIVATE fmt::fmt)
```

它省掉了所有外部基础设施，代价也来自同一处：没有版本求解——两个依赖分别要 fmt 10 和 11，冲突只会在编译或链接时暴露；没有二进制缓存，每次干净构建都要重编整棵依赖树；版本可变性靠 `GIT_TAG` 人工保证，没有锁文件。CPM.cmake 是它的一层薄封装，补上版本声明与包缓存，但求解能力依然为零。适合依赖少、构建时间可接受的库和示例项目。

#### 1.7.6 Spack：HPC 场景的另一种答案

Spack 面向的是「同一台机器上要并存二十种编译配置」，把它当包管理器用会很别扭。它的模型与[《包管理器（二）》第 1.8 节](/post/2026/09/24/package-managers-os/#18-nix-与-guix把包管理器当成构建系统)的 Nix 接近：manifest（`spack.yaml`）加锁文件（`spack.lock`），`spack concretize` 求解，「安装」是前缀目录加一个 view（符号链接聚合的目录树）。

```bash
spack env create sim
spack -e sim add "hdf5+mpi+fortran %gcc@13 ^openmpi"
spack -e sim concretize
spack -e sim install
```

同一个 `hdf5`，`+mpi` 与 `~mpi` 是两个不同的 concretized spec，可以同时在环境里存在——这正是系统包管理器做不到、科学计算又必须要的能力。代价是变体组合爆炸，以及大量包本来就不支持源码外构建（out-of-source build）。

#### 1.7.7 结论

判断标准可以简化成一句话：是否需要二进制缓存？

需要，并且在企业内网分发、要管理自己的构建矩阵，选 Conan 或 vcpkg；依赖少且都是源码友好型，用 `FetchContent` 加 CPM 就够，引入 Conan 只会多一层要维护的制品库；吃编译期变体（MPI、CUDA、不同编译器），只有 Spack 这类模型撑得住。

真正的成本不在选哪个工具，而在构建矩阵有多大：编译器版本 × C 库（glibc 与 musl 不可互换）× 构建类型 × 特性开关，每多一维，需要构建和验证的二进制就翻倍。工具只能管理这些组合，不能减少它们。

外链参考：[Conan 2 `conan install`](https://docs.conan.io/2/reference/commands/install.html)、[vcpkg in CMake projects](https://learn.microsoft.com/en-us/vcpkg/users/buildsystems/cmake-integration)。

> 一句话总结：C/C++ 的包管理是构建配置管理，选型取决于是否需要二进制缓存。

### 1.8 Ruby 与 PHP：Bundler 与 Composer

#### 1.8.1 先有语言级分发，后有项目级锁定

Ruby 与 PHP 的演化路径几乎一样，值得单独讲，因为它是理解第 1.1 至 1.6 节的一条暗线。RubyGems 与 Packagist 先解决了「把包发出去、让别人装得上」这一层；若干年后，Bundler（2010 年前后）与 Composer 才补上「这个项目到底用了哪几个具体版本」。

这个先后顺序决定了工具的默认行为。`gem install` 是包级的：装进一组共享的 gem 集合，激活哪个版本由运行时决定，两个依赖要同一个 gem 的不同版本时，冲突往往不在安装期暴露，而拖到运行期才炸。`composer install` 恰好相反：只有在没有 `composer.lock` 时它才等同于重新求解，环境换了，装出来的东西也就换了。

Bundler 与 Composer 都是项目级的：清单声明约束，锁文件保存求解结果，求解结果才是「这个项目用哪些版本」的答案。前者的清单是 `Gemfile`、锁文件是 `Gemfile.lock`，另外还有 `gemspec` 描述「这个 gem 对别人的要求」；后者是 `composer.json` 与 `composer.lock`。一个容易混淆的点：`gemspec` 面向的是 gem 的用户，`Gemfile` 面向的是当前开发仓库——前者不该锁死版本，后者必须锁。

#### 1.8.2 `bundle exec` 为什么存在

这是这一节最该讲清楚的机制。`bundle exec rspec` 做的事是：按 `Gemfile.lock` 设置 `BUNDLE_GEMFILE`、`BUNDLE_BIN_PATH`、`RUBYOPT`（`-rbundler/setup`）与 `PATH`，让子进程只看见这份锁文件里的 gem，再执行目标命令。

不写 `bundle exec` 也能跑通，是因为系统里恰好有一个同名的可执行文件；官方文档把这种情形称为「不可靠且痛苦的一大来源」。rails、rspec 这类命令在机器上可能来自另一个版本，所测的东西就不是锁文件里的东西。binstubs 是它的替代品：`bundle binstubs rspec-core` 在 `bin/rspec` 生成一个绑定到本 bundle 的启动脚本，提交进仓库后团队成员直接跑 `bin/rspec` 即可。

部署侧的配置语义也值得记牢（Bundler 4 文档）：deployment 模式要求存在 `Gemfile.lock`、要求它与 `Gemfile` 同步，并把 gem 装到项目的 `vendor/bundle` 而不是系统目录。其中一条设计细节解释了 Bundler 为什么可靠：`without` 只跳过安装被排除的分组，仍然会下载这些 gem 并参与求解，这样生产和开发解出的是同一个依赖图，不会因为分组不同而换掉 Rack 的大版本。

版本约束的方言是 `~>`（pessimistic operator）：`~> 2.2` 等价于 `>= 2.2` 且 `< 3.0`，`~> 2` 则是 `>= 2` 且 `< 3.0`，位数决定上限抬到哪一位。RubyGems 官方指南给的判断很克制——在 `gemspec` 里优先只写下限，因为悲观约束会连锁锁死使用者的整个依赖图。另外两条硬事实：RubyGems 不强制 SemVer，但一个版本号一旦发布永不复用，yank 也不会释放这个号码。

#### 1.8.3 Composer：把 PHP 的短板变成了自己的职责

PHP 没有内置模块系统，所以 Composer 多了一项别家没有的工作：生成自动加载器。实现方式是 PSR-4 把命名空间前缀映射到目录，开发期按需查找，`composer install --optimize-autoloader` 转成 classmap 以提升性能；`--classmap-authoritative` 更进一步，只认 classmap，不再回退到文件系统查找——快，而且能把类名拼写错误提前暴露成失败。生产部署的惯用组合因此是：

```bash
composer install --no-dev --optimize-autoloader --classmap-authoritative
```

另一处独特设计是把 PHP 本身和扩展当成虚拟包：`php`、`ext-mbstring`、`lib-curl` 都可以写进 `require`。这解决了 PHP 生态的老问题——构建机的 PHP 版本不代表部署机。`config.platform` 可以声明目标环境版本，让求解按目标而不是按当前解释器进行；无法满足的依赖在解析期就报错，而不是留到生产。`--ignore-platform-reqs` 是逃生门，用它的代价是把失败从今天推迟到部署之后。

Composer 的退出码值得记：0 表示成功，2 表示依赖求解失败，`--strict-psr-autoloader` 这类严格模式还会用 6 表示 PSR-4 映射错误。CI 里把 2 和通用失败 1 分开处理，可以直接区分「代码提交错了」和「依赖解不开了」。

#### 1.8.4 共同的坑

两个生态的坑几乎可以互相翻译。第一是锁文件与清单不同步：`Gemfile` 改了没跑 `bundle install`，或 `composer.json` 改了没跑 `composer update`，Composer 会给出锁文件过期的警告，此时 `composer install` 装的是过期版本。第二是平台要求泄漏：在 PHP 8.3 上求解、部署到 8.1，或在 macOS 上求解、部署到 Linux（原生扩展的预编译 gem 与平台相关，`Gemfile.lock` 里的 `PLATFORMS` 段会因此变化）。第三是 dev 依赖混入生产，用 `--no-dev` 或 deployment 模式隔离即可。

> 一句话总结：Bundler 与 Composer 的价值不在装包，而在把「项目用哪几个版本」变成可提交的文件。

### 1.9 其余生态速览：从 Cabal 到 tlmgr

这一节按「最独特的一点 + 一个代表性命令」处理，不追求覆盖全部功能。

Haskell（Cabal/Stack）。独特之处是两条路线并存：`cabal` 走普通约束求解，用 `cabal freeze` 把解出的版本与 flag 固化到 `cabal.project.freeze`；`stack` 走快照路线，`stack.yaml` 里的 `snapshot` 键（旧名 resolver）指向一个 Stackage LTS 快照，一次性钉住 GHC 版本与整批包版本，再把补丁信息写进 `stack.yaml.lock`。Cabal 官方建议 freeze 文件随可执行程序分发，库则不要提交——因为库的用户需要自行决定版本组合。

```bash
cabal freeze
```

OCaml（opam）。独特之处是 switch 即前缀：每个 switch 是一套独立的编译器加包集合，目录形式的 switch 会在进入该目录时自动生效，项目因此能各自钉住 OCaml 版本而不需要虚拟环境。

```bash
opam switch create . 5.2.0
```

Elixir/Erlang（Hex/Mix）。`mix deps.get` 把 Hex 上的依赖拉到 `deps/` 并写入 `mix.lock`，锁文件记录每个依赖的精确版本与内容哈希，`mix deps.get --check-locked` 可以在 CI 里禁止它顺手升级。

```bash
mix deps.get --check-locked
```

Dart（pub）。首次 `dart pub get` 会解出完整依赖图并生成 `pubspec.lock`，应用提交它、纯库按惯例不提交；`dart pub outdated` 用 Current / Upgradable / Resolvable / Latest 四列，把「当前装的」「能升到的」「约束允许的」「最新的」分开。

```bash
dart pub outdated
```

Swift（SwiftPM 与 CocoaPods）。同一个工程里两套依赖机制同时存在是常态，冲突通常发生在原生依赖的版本约束和构建方式上；SwiftPM 用 `Package.resolved` 记录求解结果，用 `swift package resolve` 复现。

```bash
swift package resolve
```

R（CRAN 与 renv）。独特之处是「库」本身就是隔离单位：renv 为每个项目建一个独立的包库，把整库状态写进 `renv.lock`，再用 `renv::restore()` 在另一台机器上重建，不需要虚拟环境这个概念。

```r
renv::restore()
```

Julia（Pkg）。环境由 `Project.toml`（直接依赖）加 `Manifest.toml`（完整求解结果，含版本与哈希）两文件描述，项目目录就是环境，`Pkg.instantiate()` 按 manifest 精确还原。

```julia
using Pkg; Pkg.instantiate()
```

Perl（CPAN）。历史最久，也最缺项目级锁定：`cpanfile` 声明依赖、`cpanm` 安装是后来的补救，`cpanm --installdeps .` 只保证「装得上」，不保证「装得一样」。

```bash
cpanm --installdeps .
```

Lua（LuaRocks）。与系统库关系最紧：rockspec 里可以直接依赖 C 库，装不上通常不是 Lua 包的问题，而是缺开发头文件。`luarocks --tree ./lua_modules install ...` 给了一个轻量的项目级目录，但没有锁文件。

```bash
luarocks --tree ./lua_modules install luafilesystem
```

TeX（tlmgr）。最反常的一点是常受发行版约束：Debian 打包的 tlmgr 只以用户模式运行，而 Debian 仓库里的 TeX Live 通常落后于 CTAN，因此别在系统安装上直接跑在线自更新。稳妥做法是用官方安装器装到独立目录，让发行版包和 TeX Live 互不干涉。

```bash
tlmgr update --list
```

PowerShell（PSGallery）。PSResourceGet（PowerShellGet 3.x）默认把 PSGallery 注册为优先级 50 且标记为不受信任，需要显式信任；安装是可写全局模块目录的，因此这不只是提示，而是一次信任决策。

```pwsh
Set-PSResourceRepository -Name PSGallery -Trusted
```

Nim、Zig、V 等新兴语言。共同取向是不自建中央仓库，改用 URL 加哈希。Zig 的 `build.zig.zon` 里每个依赖声明 `url` 与 `hash`，官方文档的表述很直白：包来自 `hash` 而非 `url`，URL 只是众多镜像之一；改了 URL 必须删掉旧 hash，否则等于声明仍期望在那个新地址拿到旧内容。

#### 1.9.1 三条规律

第一，越年轻的语言越倾向内置一体化工具。Go 把模块、构建、工具链版本写进 `go.mod`，Zig 把依赖表放进 `build.zig.zon`，它们没有「先有一个社区工具、再被官方收编」的阶段，也就没有工具间互相摩擦的成本。

第二，依赖锁定几乎是共识。差异只在形式与惯例：从 `cabal.project.freeze`、`stack.yaml.lock`、`mix.lock`、`renv.lock`、`Manifest.toml` 到 `Package.resolved`，都在记录「上次解出的是什么」。没有锁文件的 CPAN 和 LuaRocks 不是想反潮流，而是成型太早。

第三，生态规模决定「别人先行踩坑」的速度。包多、用户多，失败模式会被反复记录成文档和默认值；包少的小生态里，失败往往只能靠读构建日志自己定位——这比任何设计差异都更影响日常体验。

> 一句话总结：小生态的工具差异不大，没有锁文件的那些才是真正的风险点。

### 1.10 语言级横向对比与设计取舍

这一节只做跨生态比较，各工具的细节见第 1.1 至 1.9 节；系统级工具的对比见[《包管理器（二）》第 1.9 节](/post/2026/09/24/package-managers-os/#19-系统级横向对比与共存策略)。

#### 1.10.1 对比表（一）：工具、锁文件、求解策略

| 语言 | 工具 | 锁文件 | 求解策略 |
|---|---|---|---|
| JS | npm / yarn / pnpm | package-lock.json / yarn.lock / pnpm-lock.yaml | 回溯 + 扁平化提升，冲突时嵌套 |
| Python | pip、venv、uv、Poetry、conda | uv.lock / poetry.lock（conda 侧用 conda-lock 或 `--explicit`） | pip 20.3 起为带回溯的求解；uv、Poetry 用 PubGrub |
| Rust | Cargo | Cargo.lock | 深度优先回溯 + 冲突缓存（非 PubGrub）；resolver v2/v3 区分 feature 与 target |
| Go | go 命令 | go.sum 加 go.mod 的精确 require | 最小版本选择（MVS），无回溯 |
| JVM | Maven / Gradle | 默认不生成（Gradle 可显式启用） | Maven 最近优先、Gradle 默认取最高版本；遇冲突不报错，静默选一个 |
| .NET | NuGet + MSBuild | packages.lock.json（开启后生成） | 最近优先 + 统一版本 |
| C/C++ | Conan / vcpkg / FetchContent | conan.lock / vcpkg 清单 + 基线 | 版本区间求解或干脆不求解，见第 1.7 节 |
| Ruby | Bundler | Gemfile.lock | 回溯求解；Gemfile 只约束 bundle update |
| PHP | Composer | composer.lock | 回溯求解，支持 platform 虚拟包 |

#### 1.10.2 对比表（二）：隔离、仓库、脚本、坑

| 语言 | 隔离方式 | 仓库与治理 | 安装脚本 | 常见坑 |
|---|---|---|---|---|
| JS | node_modules 扁平化；pnpm 用内容寻址 store | npm registry，命名空间收费，可撤销 | postinstall、prepare 默认执行 | 跨平台可选依赖、锁文件合并冲突 |
| Python | venv 或 conda 前缀 | PyPI 先到先得，现在支持 Trusted Publishing | 有：sdist 构建执行后端代码 | 缺 wheel 就得本地编译；PEP 668 拦系统安装 |
| Rust | 源码编译进 target 目录 | crates.io 无命名空间 | build.rs 在构建期执行 | feature 合并导致意外启用 |
| Go | 模块缓存，全局共享只读 | 代理协议，无中心所有权概念 | 无标准钩子，靠代码生成 | replace 指令滥用、间接依赖膨胀 |
| JVM | 全局本地仓库加本地缓存 | Maven Central 不可变 | 插件可在构建期下载并执行任意代码 | 运行时缺类而非求解失败 |
| .NET | 全局包缓存，按项目配置 | nuget.org，签名可验 | 有：build 目标可执行代码 | 缓存中毒、源顺序导致同名包选错 |
| C/C++ | 构建目录或安装前缀 | Conan Center、vcpkg registry，均可自建 | 全在构建期，等价于执行代码 | ABI 与 libc 不兼容，见第 1.7 节 |
| Ruby | 全局 gem 集合，或 vendor/bundle | rubygems.org，版本号永不复用 | 原生扩展编译、extconf | 依赖系统 gem 而漏掉 bundle exec |
| PHP | vendor/ 目录 + 生成自动加载器 | packagist.org，命名空间为 vendor/name | 有：scripts 钩子 | 锁文件与 composer.json 不同步 |

#### 1.10.3 四条设计轴

一体化程度。Go、Rust、Dart 是一条龙：包管理、构建、测试、发布在同一份配置里，好处是依赖与构建配置天然一致，代价是「换掉工具」的成本极高。Python 与 JS 是松耦合：pip、venv、构建后端、lock 工具各管一段，好处是每层可独立演进，坏处是组合方式多到需要专门写文档，而且边界处最容易出问题——「装了但 import 不到」几乎都发生在这里。C/C++ 属于第三种情况：不是选择分离，而是从来没有过合一的可能。

求解策略。回溯（PubGrub、Bundler、Composer、Conan）能证明无解并给出原因，代价是冲突多时耗时不可预测；贪心或最近优先（Maven、NuGet）几乎不会失败，但失败被转移成运行期的 `NoClassDefFoundError`；激进策略（npm 默认取最新兼容版本）让新项目省事，却把「某次干净安装突然换了一批版本」变成常态；MVS（Go）取所有约束中最低版本里的最高者，结果可预测但社区升级意愿低。这里没有优劣，只有成本放在解析期还是运行期的区别。

隔离模型。嵌套结构兼容性最好，幻影依赖与磁盘放大是它的代价；内容寻址加符号链接（pnpm）几乎消除重复与幻影依赖，代价是依赖布局不合常规，某些工具会假设依赖在 `node_modules` 顶层；环境级隔离（venv、conda、opam switch、renv 库）隔离的是环境本身而不仅是版本，代价是必须显式激活。C/C++ 的隔离落在构建前缀上，因为「同一个库的两个版本」在链接层面的处理方式，与脚本语言完全不同。

发布治理。crates.io 与 npm 没有强制命名空间（npm 的 scope 可选），PyPI 长期是先到先得，Go 干脆用模块路径即 URL 来绕开所有权问题，Maven 的 groupId 靠域名反写来约定，RubyGems 的规则是版本号永不复用。这些差异直接决定了[《包管理器（四）》第 2.1 节](/post/2026/09/24/package-managers-practice/#21-威胁模型依赖链为什么脆弱)那些攻击的形态：没有命名空间的地方，抢注与依赖混淆（dependency confusion）成本最低。

#### 1.10.4 判断框架

拿到一个新生态，按这个顺序问四个问题就够：

第一，锁文件是什么、提交了吗、CI 用的是冻结模式还是重新求解？这一步决定构建可不可复现。

第二，依赖如何求解、冲突时是报错还是静默挑一个？静默挑一个的工具，需要额外手段才能查出实际生效的版本。

第三，隔离边界在哪里、安装或构建时会不会执行代码（见[《包管理器（一）》第 3.8 节](/post/2026/09/24/package-managers-principles/#38-安装时执行代码一切矛盾的根源)）？会执行的话，信任范围就是这个生态的全部上游维护者。

第四，社区治理：命名空间、撤销政策、签名与证明机制成熟到什么程度（[《包管理器（四）》第 2.1 至 2.4 节](/post/2026/09/24/package-managers-practice/#21-威胁模型依赖链为什么脆弱)展开）。

最后回到一个反直觉的判断：为什么「最好的包管理器」不可比。MVS 之所以在 Go 里成立，是因为 Go 编译快、无原生依赖、依赖图相对窄；同一套策略搬到需要编译 C 扩展的生态会立刻失效。工具的设计空间由语言的构建特性、生态的年龄和包的数量级共同决定，而这些条件不可迁移。有用的比较不是「谁更好」，而是「它在哪个约束下做了取舍，那个约束在当前项目里是否成立」。

> 一句话总结：先看锁文件与求解器，再看隔离与脚本执行，最后才轮到工具口碑。
