# 静态博客（Hugo + xmin + Pagefind）

一个极简静态博客。站点本体零依赖：Hugo 二进制 + xmin 主题（约 140 行）+ 你的 Markdown 文章。
搜索用 [Pagefind](https://pagefind.app/)，只在构建时需要一个 Node 工具，访客侧不接触任何第三方服务。

## 目录结构

```
.
├── hugo.yaml                       # 全部站点配置，改这个文件就够了
├── content/
│   ├── _index.md                   # 首页正文
│   ├── about.md                    # 「关于」页面
│   ├── search.md                   # 「搜索」页面（内容为空，版式在 layout 里）
│   └── post/                       # 博客文章（Markdown）
├── layouts/                        # 站点级布局覆盖（见下方说明）
│   ├── single.html                 # 文章页：把评论区插到正文之后
│   ├── search.html                 # 搜索页版式
│   └── _partials/
│       ├── head_custom.html        # 按页面类型引入 CSS / 主题探测脚本
│       └── comments.html           # 评论区（Giscus）
├── themes/hugo-xmin/               # 主题，保持原版未改动
├── static/css/search.css           # 搜索页样式
├── static/css/comments.css         # 评论区样式
├── scripts/build.mjs               # 构建脚本：先 Hugo，后 Pagefind
├── scripts/setup.ps1               # 下载 Hugo 二进制到 .tools/
├── wrangler.toml                   # Cloudflare 配置（已停用，当前不参与部署）
├── .github/workflows/pages.yml     # 推送到 main 后自动构建并部署到 GitHub Pages
├── .tools/hugo/hugo.exe            # Hugo 二进制（被 gitignore，由 setup.ps1 下载）
├── public/                         # 构建产物（不要手动改）
│   └── pagefind/                   # Pagefind 生成的索引 + UI 资源
├── node_modules/                   # 只为 Pagefind 存在
├── package.json                    # 构建脚本与 Pagefind 依赖
└── package-lock.json               # 锁定索引器版本，建议提交
```

### 为什么定制放在 `layouts/` 而不是改主题

Hugo 的查找顺序是 **站点目录优先于主题目录**。所以 `layouts/_partials/head_custom.html` 会自动覆盖主题里同名文件，`layouts/search.html` 会为 `layout: search` 的页面提供版式。

这样做的意义：`themes/hugo-xmin/` 里保持的是**上游原版文件**，将来升级主题只要整个目录替换即可，你的定制不会丢也不会冲突。想看看跟原版的差异，`git log -- themes/` 应该永远是空的。

一句话：**要改主题，就在站点根目录建同名文件，别动 `themes/` 里面的东西。**

## 上手（克隆仓库后第一次）

只有两步：

```powershell
# 1. 下载 Hugo 到 .tools/hugo/（约 60 MB，只做一次）
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

# 2. 安装 Pagefind
npm install
```

> **为什么 Hugo 要单独下载？** 那个二进制接近 60 MB，超过 GitHub 建议的 50 MB 单文件上限，
> 所以没提交进仓库。`setup.ps1` 把版本写死成 0.166.0，和 CI 用的完全一致。
> 如果你已经装了 Hugo，可以跳过第 1 步，改用环境变量 `HUGO_BIN` 指向它。

## 日常命令

```powershell
# 【推荐】完整构建：Hugo 出站点，再用 Pagefind 建搜索索引
npm run build

# 本地预览（含草稿），改文件自动刷新 → http://localhost:1313/
npm run dev

# 只重建搜索索引（public/ 已存在时）
npm run index

# 新建一篇文章
hugo new content post/2026-09-22-my-post.md
```

> **顺序不能反。** Pagefind 是「索引一个已经构建好的站点」，它读的是 `public/` 里生成的 HTML。
> 所以必须 Hugo 先跑完。`npm run build` 已经帮你按正确顺序串好了。
>
> `npm run dev` 不做索引（开发服务器是长驻进程）。要在本地看到搜索效果，
> 先跑一次 `npm run build`，再用任意静态服务器托管 `public/`（例如 `npx serve public`）。

> 上面假设 `hugo` 已在 PATH 中。没配的话，把 `C:\workspaces\blog\.tools\hugo` 加进系统 PATH，
> 或改用完整路径 `.\.tools\hugo\hugo.exe`。CI 里不需要它，GitHub Actions 会自己装 Hugo。

## 搜索是怎么工作的

1. `hugo` 生成静态 HTML 到 `public/`
2. `pagefind --site public` 扫描这些 HTML，把正文切块、压缩，写出索引到 `public/pagefind/`
3. 访客打开 `/search/`，页面加载 `pagefind-ui.js`（含 WASM），输入关键词时**按需下载**对应的索引分片，检索完全在浏览器里完成

所以：**没有后端、没有 API key、没有外部请求**。整个索引就是一坨静态文件。

### 涉及的文件

| 文件 | 作用 |
|---|---|
| `content/search.md` | 搜索页的入口，`layout: search` 指定用哪个版式 |
| `themes/hugo-xmin/layouts/search.html` | 搜索框容器 + 初始化脚本（中文文案在这里） |
| `themes/hugo-xmin/layouts/_partials/head_custom.html` | 只在该页引入 Pagefind 的 CSS，其他页面零开销 |
| `static/css/search.css` | 把 Pagefind 自带 UI 调成与 xmin 一致的极简风格 |
| `hugo.yaml` 的 `menu.main` | 导航栏里的「搜索」入口 |

### 几个已知的取舍

- **中文分词**：Pagefind 用 `--force-language zh` 后可以正常搜中文，但它**不做词干还原**（构建时会打印 `doesn't support stemming for the language zh`）。意思是搜「静态」能命中，但不会把「静态化」「静态的」当作同一词根自动合并。对博客足够用。
- **用的是 Pagefind 的 Default UI**：构建时 Pagefind 会提示 1.5.0 起推荐 Component UI（带搜索弹窗、更好的无障碍）。那是给用打包器的项目准备的；这里刻意保持零打包器、零构建链，所以继续用 Default UI——它仍然被官方支持。
- **搜索页自身不会被索引**：容器上加了 `data-pagefind-ignore`，否则「搜索」这个页面会出现在自己的结果里。

## 发一篇文章

在 `content/post/` 下新建 `.md` 文件：

```markdown
---
title: "文章标题"
slug: "my-post"
date: 2026-09-22
categories: ["随笔"]
tags: ["标签一"]
draft: false
---

正文……
```

三个容易踩的坑：

1. **文件名里的日期前缀会被 Hugo 剥掉，然后拿标题去生成路径**。中文标题会变成一长串 URL 编码（`/post/2026/09/21/%E8%BF%99%E4%B8%AA...`）。所以**务必写 `slug`**，用纯英文短横线格式，URL 才会是 `/post/2026/09/21/my-post/`。
2. `draft: true` 的文章不会出现在正式构建里。写完记得改成 `false`，否则 push 了也看不到。构建脚本也会在草稿构建时自动跳过索引。
3. 分类名和标签名会直接变成 URL 路径。用中文（如 `建站`）完全没问题，但访客看到的地址会是一串百分号编码。介意的话用英文分类名。

## 发布上线（GitHub Pages）

站点部署在 **GitHub Pages 用户站点**，域名 <https://lzh0394.github.io/>。

```
本地 push → GitHub Actions → hugo → pagefind → 上传产物 → GitHub Pages
```

仓库名就是 `lzh0394.github.io`。GitHub 有个约定：**仓库名等于 `<用户名>.github.io` 时，站点发布在根路径**，不需要 `/blog/` 这类子路径，也不需要 CNAME 文件。

### 相关文件

| 文件 | 作用 |
|---|---|
| `.github/workflows/pages.yml` | 推送到 `main` 后自动构建并部署 |
| `hugo.yaml` 的 `baseURL` | 必须是 `https://lzh0394.github.io/`，RSS 和 sitemap 靠它拼绝对链接 |

### 只需要配一次的东西

仓库建好后，Pages 的发布来源要设成 **GitHub Actions**（不是「从分支部署」）：

```powershell
# 把 Pages 的构建类型设为 workflow
gh api -X POST repos/lzh0394/lzh0394.github.io/pages -f build_type=workflow
```

或者去仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。

**不需要配置任何 Secrets**。`pages.yml` 用的是 GitHub 自动提供的 `GITHUB_TOKEN` 和 OIDC 令牌，权限由 workflow 顶部的 `permissions` 声明。这是从 Cloudflare 迁过来最大的简化：原来那两个 `CLOUDFLARE_*` secret 可以删掉了。

### 为什么 build 步骤要跑 `npm run build` 而不是 `hugo`

官方 starter workflow 用的是 `hugo --minify`，那样**不会生成 Pagefind 索引，站内搜索会失效**。这里改成调用本项目的 `scripts/build.mjs`，由它保证顺序：Hugo 先出站点，Pagefind 再建索引。

### 手工部署（不走 CI）

一般不需要——push 到 `main` 就会自动部署。真要本地构建后手动发布：

```powershell
npm run build
# 然后把 public/ 里的内容推到 Pages 分支，或改用其他托管
```

### `wrangler.toml` 还留着，但已经不参与部署

仓库根目录的 `wrangler.toml`（Cloudflare Workers 配置）和自定义域名 `blog.lzh0394.com` 是之前方案的遗留。**当前没有任何流程会用它**，`pages.yml` 只管 GitHub Pages。留着是为了将来想切回 Cloudflare 时省事；如果你确定不再用，删掉 `wrangler.toml` 即可，不影响 Pages。

那个自定义域名也不会自己消失——它仍然解析到 Cloudflare，除非你去 Cloudflare 面板里删掉那条 Worker 路由。

### 手动部署到 Cloudflare（已停用，仅供备查）

```powershell
npm run build
$env:CLOUDFLARE_API_TOKEN = "你的 token"
$env:CLOUDFLARE_ACCOUNT_ID = "你的 account id"
npx wrangler deploy
```

### 如果以后想换托管

产物就是 `public/` 里的纯静态文件，换平台本身不用改代码：

| 平台 | 构建命令 | 输出目录 |
|---|---|---|
| GitHub Pages | 用 Actions 跑 `npm run build` | `public` |
| Cloudflare Pages | `npm run build` | `public` |
| Vercel / Netlify | `npm run build` | `public` |
| 对象存储 + CDN | 本地 `npm run build` 后上传 | `public` 里的内容 |

注意**托管平台必须能跑 Node**，因为要执行 Pagefind。只能上传静态文件的托管，需要你本地构建好再上传。

**换域名时别忘了改 `hugo.yaml` 的 `baseURL`**，否则 RSS、sitemap 和 Open Graph 里的链接会指向旧站点。若换成项目仓库（如 `lzh0394/blog`），要写成 `https://lzh0394.github.io/blog/`，末尾斜杠不能少。

## 评论（Giscus）

评论用 [Giscus](https://giscus.app/)，把 GitHub Discussions 当作评论存储。没有数据库、没有第三方服务商、没有广告，但**评论者需要一个 GitHub 账号**——这是它唯一的门槛。

### 为什么评论单独用一个仓库

当初拆成两个仓库，是因为博客源码仓库是 **private**，而 Giscus 必须能公开读写一个仓库的 Discussions，两者不能是同一个仓库：

| 仓库 | 可见性 | 用途 |
|---|---|---|
| `hzl9900/blog` | private | 博客源码 |
| `hzl9900/blog-comments` | **public** | 只放评论，不含任何源码 |

**迁移到 GitHub Pages 后这条理由变了**：Pages 用户站点需要源码仓库是 public（免费账号），所以源码仓库已经公开，其实可以和评论合并。

但**现在不必动**——`blog-comments` 与站点的评论数据完全解耦，合并只会把历史评论弄丢。保持现状即可。

### 配置已完成，无需再动

`hugo.yaml` 里的四个值都已填好并核对过：

| 字段 | 值 | 来源 |
|---|---|---|
| `repo` | `hzl9900/blog-comments` | 公开评论仓库 |
| `repoId` | `R_kgDOUj4Ufg` | GitHub GraphQL API |
| `category` | `Announcements` | Discussions 分类 |
| `categoryId` | `DIC_kwDOUj4Ufs4DGIgA` | GitHub GraphQL API |

前置条件也都满足了：`blog-comments` 已开启 Discussions，giscus App 已授权。

> 万一以后需要重新核对这两个 ID（比如换了仓库），用 GitHub GraphQL API 可以直接查，
> 不必依赖 giscus.app 生成的代码：
>
> ```bash
> gh api graphql -f query='
> {
>   repository(owner: "hzl9900", name: "blog-comments") {
>     id
>     hasDiscussionsEnabled
>     discussionCategories(first: 10) { nodes { id name } }
>   }
> }'
> ```

`Announcements` 类型的分类只有维护者能发起新讨论，可以避免有人在 Discussions 里乱开帖子。

### 配置项说明（都在 `hugo.yaml` 的 `params.giscus` 下）

| 字段 | 作用 |
|---|---|
| `enabled` | 全站开关 |
| `repo` / `repoId` | 仓库。留空则整个评论区不输出 |
| `category` / `categoryId` | Discussion 分类。留空则用仓库默认分类 |
| `mapping` | 文章与 Discussion 的对应方式。**默认 `pathname`**，即用 URL 路径匹配 |
| `inputPosition` | 评论框在列表上方还是下方 |
| `reactionsEnabled` | 是否显示 GitHub 表情回应 |
| `loading` | `lazy` = 滚动到附近才加载 iframe，首屏零开销 |
| `theme` | `light` / `dark`，会被下面的自动切换覆盖 |

### 深色模式是怎么处理的

Giscus 的 iframe 是一个**独立文档**，站点的 CSS 管不到它内部。所以：

- `head_custom.html` 里有一小段脚本，读访客的 `prefers-color-scheme`，把结果写到 `<html data-giscus-theme="light|dark">` 上，并监听系统主题变化
- `comments.html` 里的脚本再把这个值同步给 iframe（改 iframe URL 的 `theme` 参数，这是 giscus 官方推荐的做法）

因为 xmin 本身是纯浅色主题，所以正常情况下访客看到的是浅色页面配浅色评论区；如果访客系统是深色模式，评论区的输入框会是深色。想改掉这个行为，把 `params.giscus.theme` 定死即可。

### 单个页面的开关

文章 front matter 里加 `comments: false` 就能单独关掉这一篇的评论：

```yaml
---
title: "某篇不想被评论的文章"
comments: false
---
```

评论区只出现在**文章页**。首页、关于页、分类页、标签页、搜索页都不会有。

## 还想加什么

xmin 刻意什么都不带。需要扩展时，编辑 `themes/hugo-xmin/layouts/_partials/foot_custom.html`（它现在是空文件，专门留给你放这类脚本）：

- **访问统计** → 放统计服务的脚本（Umami / Plausible / GoatCounter 等）

## 这个站点的环境

- Hugo v0.166.0 (windows/amd64)
- xmin 主题（要求 Hugo ≥ 0.146.0，因为用了新的 `layouts/_partials/` 目录结构）
- Pagefind v1.5.2（devDependency，仅在构建时使用）
- Giscus（运行时从 `giscus.app` 加载，无构建依赖）
