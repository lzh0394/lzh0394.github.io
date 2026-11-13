# 静态博客（Hugo + xmin）

## 提交前检查

Markdown 排版用 markdownlint 检查，**不写进项目依赖**，用 npx 临时调用：

```text
npx --yes markdownlint-cli2@0.24.1
```

一次性启用 git 钩子（之后每次 `git commit` 只要暂存了 `.md` 就自动跑）：

```text
git config core.hooksPath .githooks
git update-index --chmod=+x .githooks/pre-commit
```

规则配置在 `.markdownlint-cli2.jsonc`；临时跳过用 `git commit --no-verify`。

## 目录结构

临时文件写入`/tmp`

```text
.
├── hugo.yaml                       # 全部站点配置，改这个文件就够了
├── content/
│   ├── _index.md                   # 首页正文
│   ├── about.md                    # 「关于」页面
│   ├── post/                       # 已发布文章（Markdown）
│   └── draft/                      # 未发布草稿（draft: true，不进生产构建）
├── themes/hugo-xmin/               # 主题（已改：terms.html 重命名为 taxonomy.html，适配 Hugo 0.146+，当前 0.169）         
├── .github/workflows/pages.yml     
└── public/                         # 构建产物（不要手动改）
```
