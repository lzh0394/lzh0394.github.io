# 静态博客（Hugo + 自建主题）

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

临时文件写入 `tmp/`

```text
.
├── hugo.yaml                       # 全部站点配置，改这个文件就够了
├── layouts/                        # 自建主题模板：baseof、list/single/taxonomy/term/404、_markup/render-table
├── static/
│   ├── css/style.css               # 自建主题样式
│   └── fonts/                      # 自托管代码字体 Sarasa Mono SC 子集 + OFL 许可
├── content/
│   ├── _index.md                   # 首页正文
│   ├── about.md                    # 「关于」页面
│   ├── post/                       # 已发布文章（Markdown）
│   └── draft/                      # 未发布草稿（draft: true，不进生产构建）
├── .github/workflows/pages.yml
└── public/                         # 构建产物（不要手动改）
```

主题为自建，模板与样式都在仓库内，`themes/` 已移除。页面结构与默认样式参考
[hugo-xmin](https://github.com/yihui/hugo-xmin)（MIT）重写。

代码字体为 Sarasa Mono SC（等距更纱黑体 SC），整字体自托管为 woff2（约 5.1 MB，未裁剪），
许可为 SIL OFL 1.1，见 `static/fonts/LICENSE-SarasaGothic.txt`。
