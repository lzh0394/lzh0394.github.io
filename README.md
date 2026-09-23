# 静态博客（Hugo + xmin）

一个极简静态博客。**零 Node 依赖、零构建链**：Hugo 二进制 + xmin 主题（约 140 行）+ 你的 Markdown 文章。构建就是把 Markdown 变成 HTML，没有别的步骤。

评论用 Giscus，在运行时从 `giscus.app` 加载（可选、可关）。

## 目录结构

```
.
├── hugo.yaml                       # 全部站点配置，改这个文件就够了
├── content/
│   ├── _index.md                   # 首页正文
│   ├── about.md                    # 「关于」页面
│   └── post/                       # 博客文章（Markdown）
├── layouts/                        # 站点级布局覆盖（见下方说明）
│   ├── single.html                 # 文章页：把评论区插到正文之后
│   └── _partials/
│       ├── head_custom.html        # 引入评论区 CSS / 主题探测脚本
│       └── comments.html           # 评论区（Giscus）
├── themes/hugo-xmin/               # 主题，保持原版未改动
├── static/css/comments.css         # 评论区样式
├── scripts/setup.ps1               # 下载 Hugo 二进制到 .tools/
├── .github/workflows/pages.yml     # 推送到 main 后自动构建并部署到 GitHub Pages
├── .tools/hugo/hugo.exe            # Hugo 二进制（被 gitignore，由 setup.ps1 下载）
└── public/                         # 构建产物（不要手动改）
```

### 为什么定制放在 `layouts/` 而不是改主题

Hugo 的查找顺序是 **站点目录优先于主题目录**。所以 `layouts/_partials/head_custom.html` 会自动覆盖主题里同名文件。

这样做的意义：`themes/hugo-xmin/` 里保持的是**上游原版文件**，将来升级主题只要整个目录替换即可，你的定制不会丢也不会冲突。想看看跟原版的差异，`git log -- themes/` 应该永远是空的。

一句话：**要改主题，就在站点根目录建同名文件，别动 `themes/` 里面的东西。**

## 上手（克隆仓库后第一次）

只有一步：

```powershell
# 下载 Hugo 到 .tools/hugo/（约 60 MB，只做一次）
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

> **为什么 Hugo 要单独下载？** 那个二进制接近 60 MB，超过 GitHub 建议的 50 MB 单文件上限，
> 所以没提交进仓库。`setup.ps1` 把版本写死成 0.166.0，和 CI 用的完全一致。
> 如果你已经装了 Hugo，可以跳过这一步，直接用你自己的 `hugo`。

## 日常命令

`.tools/hugo` 建议加进系统 PATH，之后就能直接用 `hugo`：

```powershell
# 本地预览（含草稿），改文件自动刷新 → http://localhost:1313/
hugo server --buildDrafts

# 构建到 public/
hugo

# 构建并压缩（CI 用的就是这条）
hugo --minify

# 新建一篇文章
hugo new content post/2026-09-22-my-post.md
```

没配 PATH 的话用完整路径：`.\.tools\hugo\hugo.exe server --buildDrafts`。

> CI 里不需要你操心 Hugo——GitHub Actions 会自己装。

## 搜索：已移除

本站曾经用 [Pagefind](https://pagefind.app/) 做站内搜索，现已**整体移除**，包括 `/search/` 页面、导航栏入口、样式与相关依赖。

移除的原因：Pagefind 需要在 Hugo 之后额外跑一个索引步骤，而它是整个项目唯一的 Node 依赖——就为了让构建脚本去调用它。为了一个搜索框，仓库里要长期维护 `package.json`、`package-lock.json`、`node_modules` 和一个 `build.mjs` 胶水脚本。这个博客规模（十几篇文章）不值得，所以砍掉，构建回归「Hugo 一条命令」。

**如果以后还想加搜索**，Pagefind 仍是最省事的选择，恢复步骤：

1. 加回 `content/search.md`（`layout: search`）与 `layouts/search.html`，导航栏加回入口
2. `npm init -y && npm i -D pagefind`
3. 构建改成两步：`hugo` 然后 `pagefind --site public --glob "**/*.html" --force-language zh`
4. `pages.yml` 的 build 步骤里重新加上 `actions/setup-node` + `npm ci`

也可以换别的方案：Hugo 自带 `hugo new` 之外的检索能力有限，但可以考虑 [Fuse.js](https://www.fusejs.io/)（把文章列表塞进 JSON，客户端模糊匹配，零构建步骤）或直接依赖外部的站内搜索服务。

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
本地 push → GitHub Actions → hugo --minify → 上传产物 → GitHub Pages
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

### 构建命令与 baseURL

workflow 里用的是：

```bash
hugo --minify --baseURL "${{ steps.pages.outputs.base_url }}/"
```

`baseURL` 取自 `actions/configure-pages` 的输出，而不是写死 `hugo.yaml` 里的值。这样仓库改名、换域名或改用项目仓库时，CI 会自动跟上，不需要你记得同步两个地方。

### 手工部署（不走 CI）

一般不需要——push 到 `main` 就会自动部署。真要本地构建：

```powershell
hugo --minify --baseURL "https://lzh0394.github.io/"
# 产物在 public/，把它交给任何静态托管即可
```

### 如果以后想换托管

产物就是 `public/` 里的纯静态文件，换平台本身不用改代码：

| 平台 | 构建命令 | 输出目录 |
|---|---|---|
| GitHub Pages | Actions 里跑 `hugo --minify` | `public` |
| Cloudflare Pages | `hugo` | `public` |
| Vercel / Netlify | `hugo` | `public` |
| 对象存储 + CDN | 本地 `hugo` 后上传 | `public` 里的内容 |

**任何能跑 Hugo 或能接收静态文件的地方都行**，不再有 Node 依赖。CI 由 `.github/workflows/pages.yml` 负责，它用 `actions/configure-pages` 输出的地址作为 `baseURL`，所以换仓库名或域名时 CI 会自动跟上。

**换域名时记得同步改 `hugo.yaml` 的 `baseURL`**（本地构建时用得到），否则 RSS、sitemap 和 Open Graph 里的链接会指向旧站点。若换成项目仓库（如 `lzh0394/blog`），要写成 `https://lzh0394.github.io/blog/`，末尾斜杠不能少。

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
- Giscus（运行时从 `giscus.app` 加载，无构建依赖）
- 无 Node 依赖（Pagefind 已移除）
