# AGENTS.md

给在本仓库工作的编码 agent 的项目说明。项目是中文技术博客，不是通用软件工程仓库。

## 项目概况

- Hugo 静态站点，主题 `hugo-xmin`（已就地改造），部署在 GitHub Pages：<https://lzh0394.github.io/>
- 远端：`https://github.com/lzh0394/lzh0394.github.io.git`，主分支 `main`
- 内容全部是中文技术长文，站点配置集中在 `hugo.yaml`
- 构建只依赖 Hugo 二进制，不需要 Node/npm

## 构建与预览

| 目的 | 命令 |
| --- | --- |
| 构建（与 CI 行为一致） | `./.tools/hugo/hugo.exe --minify` |
| 本地预览（含草稿） | `./.tools/hugo/hugo.exe server -D` → <http://localhost:1313/> |
| 构建到临时目录验证 | `./.tools/hugo/hugo.exe --minify --destination tmp/build` |

- CI 固定 Hugo **0.166.0**（`.github/workflows/pages.yml`），本地 `.tools/hugo/hugo.exe` 同为 0.166.0，优先用它。
- PATH 上可能有更新版本（如 0.169.0），也能构建，但不要据此判断 CI 一定通过。
- 主题要求 Hugo **>= 0.146**（新版 `layouts/_partials/` 目录结构）；不要降级。
- 提交前至少跑一次构建，必须 0 错误；产物默认写到 `public/`（已被忽略，不要手动修改、不要提交）。

## 目录

```
hugo.yaml                  # 唯一站点配置：baseURL、菜单、permalinks、markup
content/_index.md          # 首页正文
content/about.md           # 「关于」页面
content/post/              # 已发布文章
content/draft/             # 未发布草稿（draft: true，不进生产构建）
archetypes/default.md      # hugo new 模板（TOML）
themes/hugo-xmin/          # 主题，本地已改过，见下
.github/workflows/pages.yml# push main → 构建 → 部署 Pages
public/ tmp/ _tmp/         # 构建与临时产物，均已 .gitignore
```

- `themes/hugo-xmin/` 是 vendored 且已被修改：`terms.html` 重命名为 `taxonomy.html` 以适配 Hugo 0.146+ 的布局查找。**不要用 `git clone` / 覆盖方式重装主题**，否则会丢掉这处适配。
- `.tools/`（约 60 MB 的 Hugo 二进制）不进仓库；新环境需自行准备 Hugo，或直接用 PATH 上的兼容版本。

## 写文章

- 草稿放 `content/draft/<slug>.md`，文件名不带日期；发布时才移到 `content/post/YYYY-MM-DD-slug.md`。
- 已发布文章路径：`content/post/YYYY-MM-DD-slug.md`；`slug` 与文件名中日期之后的部分一致。
- 永久链接规则：`/post/:year/:month/:day/:slug/`（改 `slug` 等于换 URL，已发布文章不要改）。
- front matter 用 **YAML**（`---`），现有 19 篇文章都是这个形状：

```yaml
---
title: 模运算 modulo
slug: "modulo"
date: 2026-10-14
categories: ["计算机基础"]
tags: ["数学", "取模", "整数运算", "C++"]
draft: false
summary: 一两句中文摘要，概括全文结论。
---
```

- `categories` 现有且仅有的四个：`工程`、`计算机基础`、`编程语言`、`建站`。优先复用，新增会产生新的分类页。
- `tags` 用简短词，中英混排可接受（如 `C++`、`LLVM`、`取模`）。
- `date` 用 `YYYY-MM-DD`，发布后与文件名日期一致；`draft: false` 才会上线（`server -D` 可看草稿）。
- 草稿 front matter 同样用 YAML：至少写 `title`、`slug`、`date`（计划发布日期）、`summary` 和 **`draft: true`**；`categories`/`tags` 可以发布前再补。
- `content/draft/_index.md` 自身是 `draft: true`，所以生产构建里不会出现 `/draft/` 这个空列表页；本地 `-D` 时它正常显示草稿索引。
- `summary` 主题当前不渲染，但保留：它是文章元数据的一部分，别省。
- 正文惯例（与现有长文保持一致）：开头用 `> ` 引用块交代底本、参考资料和引用口径；正文用 `## 一、`、`## 二、` 分节，必要时 `###`；末段附出处/版本说明。
- 中文技术写作：术语首次出现给中英对照，引用外部资料带链接，陈述克制、可扫读；不要 emoji、不要营销腔、不要堆砌小标题。
- 原生 HTML 可用（`goldmark unsafe: true`，现有文章用 `<details>` 做目录），但能用 Markdown 就不用 HTML。
- 代码块**没有语法高亮**（`markup.highlight.codeFences: false`），不要指望渲染出配色。
- 数学：`goldmark.passthrough` 已为 `\[ \]`、`$$ $$`、`\( \)` 开启，但站点**没有引入 KaTeX/MathJax**，公式不会排版。现有文章用行内代码或文字表达（如 `a mod m`）；要真正渲染公式得先加渲染器，别只写 `$$`。
- `hugo new` 生成的是 TOML（`+++`）front matter，和仓库惯例不符；要么手写 YAML，要么改完再提交。

## 发布

- 发布流程：把 `content/draft/<slug>.md` 移动/重命名为 `content/post/YYYY-MM-DD-<slug>.md`，`date` 对齐文件名日期，`draft` 改为 `false`，补上 `categories`/`tags`，构建验证后再提交。
- 只有 push 到 `main`（或手动 `workflow_dispatch`）才触发构建部署；部署串行执行，不取消进行中的部署。
- CI 用 `hugo --minify --baseURL <Pages 提供的地址>/`，会覆盖 `hugo.yaml` 里的 `baseURL`；本地不要把 `baseURL` 改成 localhost。
- 提交信息用中文、一句话说清改动，例如「新增长文《包管理器全景》并加入 AI 生成标记」。历史里没有 Conventional Commits 格式，别混用。
- **不要提交**：`public/`、`.tools/`、`tmp/`、`_tmp/`、`.hugo_build.lock`、`node_modules/`。

## 边界

- 不要手改构建产物 `public/`，改源文件后重新构建。
- 不要升级 Hugo 版本而不改 `pages.yml` 里的 `hugo-version`，两者必须同步。
- 不要引入评论、搜索、RSS、统计脚本等额外依赖（见 commit `d4f32c2`、`3864615` 的取舍）。
- 临时文件写到 `/tmp`（README 约定），不要留在仓库里；`tmp/`、`_tmp/` 虽被忽略，也不要长期存放。
- 不要让 `content/draft/_index.md` 的 `draft` 变成 `false`：生产站点会多出一个空的 `/draft/` 列表页并进 sitemap。
- 不要在 `content/draft/` 里放 `draft: false` 的文章：它会被发布到 `/draft/<slug>/`，既不在 `/post/` 下，又会混进首页列表。
