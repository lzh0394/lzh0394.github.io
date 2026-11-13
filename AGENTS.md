# AGENTS.md

> KISS

给在本仓库工作的编码 agent 的项目说明。项目是中文技术博客，不是通用软件工程仓库。

## TODO

- [ ] 修改主题，从 vendored 的 xmin 迁移到自建主题

## 项目概况

- Hugo 静态站点
- 部署在 GitHub Pages：<https://lzh0394.github.io/>
- 远端：`https://github.com/lzh0394/lzh0394.github.io.git`，主分支 `main`
- 内容全部是中文技术文章
- 站点配置在 `hugo.yaml`
- 构建只依赖 Hugo 二进制
- markdownlint 依赖 npx

## 构建与预览

| 目的 | 命令 |
| --- | --- |
| 构建 | `./.tools/hugo/hugo.exe --minify` |
| 本地预览（含草稿） | `./.tools/hugo/hugo.exe server -D` → <http://localhost:1313/> |
| 构建到临时目录验证 | `./.tools/hugo/hugo.exe --minify --destination tmp/build` |
| Markdown 排版检查（提交前） | `npx --yes markdownlint-cli2@0.24.1` |

- 提交前至少跑一次构建，必须 0 错误 0 警告
- 构建统一用 `./.tools/hugo/hugo.exe`（Hugo 0.169.0，与 CI 一致）；该文件不在仓库内，新环境需自备

## 边界

- 不修改 `themes/` 或者重装主题
- 不手动修改 `public/`
- 不引入评论/搜索/统计
- 提交不参考 Conventional Commits，使用一句话简单描述提交内容

## 分类清单

categories 从以下列表选择

- 编程语言
- 计算机基础
- 其他（原 `工程` 分类并入）

## 写文章步骤

- 新建草稿使用手写文件，不使用 `hugo new`
- 草稿放 `content/draft/<slug>.md`，文件名不带日期，front matter 必须 `draft: true`
- 发布时才移到 `content/post/YYYY-MM-DD-slug.md`，将 front matter 改为 `draft: false`
- 已发布文章路径：`content/post/YYYY-MM-DD-slug.md`；`slug` 与文件名中日期之后的部分一致。
- 永久链接规则：`/post/:year/:month/:day/:slug/`（改 `slug` 等于换 URL，已发布文章不要改）

## 发布步骤

- 将草稿从 `content/draft` 移动到 `content/post`
- date 对齐到文件名日期
- 将 front matter 改为 `draft: false`
- 补齐 `categories`/`tags`
- 构建验证

## front matter 格式

```yaml
---
title: "模运算 modulo"
slug: "modulo"
date: "2026-10-14"
categories: ["计算机基础"]
tags: ["数学", "取模", "整数运算", "C++"]
draft: true
summary: "一两句中文摘要，概括全文结论。"
---
```

- categories 的数量控制在 1-2 之间，尽量复用已有的分类
- tag 的数量控制在 1-4 之间
- 字符串一律用双引号包围，注意是否有需要转义的字符，summary 里避免裸尖括号，或用行内代码包裹。
- 列表统一使用行内数组

## 其他要求

- 以下规则适用于全部文章。
- 正文总体篇幅不限
- 不声明由 AI 生成，默认整个博客内容都包含 AI 生成内容。
- 标题编号使用数字格式
  - 不使用 h1，标题在 front matter 的 title 字段
  - h2 使用 `x.`
  - h3 使用 `x.y.`
  - h4 使用 `x.y.z.`
  - 不使用 h5 和更低级的标题
  - x 应当从 0 或者 1 开始
  - 参考文献章和包含的节不编号
- 附录章编号用大写拉丁字母，例如 `附录 A：索引`
- h2 之间插入分割线 `---`，开头不插入分割线。
- 段落应当简短，不宜出现超长段落。
- 适当使用有序列表和无序列表。
- 控制表格的行数和列数，列数过多或者列过长的时候应当考虑调整。
  - 列数不大于 5
  - 行数不大于 10
- 中英术语对照的频率视情况而定，默认写作 `中文（English）`。只对容易混淆的或者比较生僻的术语给出对照。
- 引号的使用规则
  - ASCII 直引号用于代码块与行内代码；
  - 全文正文部分使用直角引号 `「」`，不使用中文弯引号 `“”`
- 不使用 emoji
- 不使用原生 HTML
- 不使用脚注
- 链接的使用方式
  - 两种格式
    - 带有说明：`[text](url)`
    - 不带说明 `<url>`
    - 不得使用裸链接
- 中文与拉丁字母、数字之间应当保有半角空格
- 代码块仅使用围栏式，不使用缩进式。
- 代码块应当标注语言。
  - shell 使用 `bash` 或者 `pwsh`
  - shell 命令之间的输出使用注释展示
  - 纯文本和单独的输出使用 `text`
- 以下内容应当使用行内代码
  - 标识符
  - 条款锚点
  - 命令
  - 字段名
  - 字面量
- C++ 版本号应当写作 `C++11`，不写作 `C++ 11`
- 有需要的情况下，可以在开头定下术语表
- 不使用粗体（除去引用）
- 不使用强调（除去引用）
- 没有显式说明的情况下，不使用人称（包括你，我，我们，读者等）
- 写作风格中立，不带感情色彩
- C++ 相关
  - 引用草案应当标注条款锚点 + 段号
  - 引用提案写出 编号 + 修订号，例如 `P1234R5`

## 不合适的做法

以下写法应当减少使用

- 不是 A，而是 B
- 是 A，不是 B
- 口语（例如「栽跟头」「咬人」「翻车」「爆了」）
- 比喻（例如「地雷」「单程票」「拱心石」），除非是对引用的翻译，或者是俗语（例如 pitfall 和 free lunch）
- 排比
- 设问 (除去 Q&A 形式)
- 反问 (除去 Q&A 形式)
