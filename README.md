# 静态博客（Hugo + xmin）

## 目录结构

临时文件写入`/tmp`

```
.
├── hugo.yaml                       # 全部站点配置，改这个文件就够了
├── content/
│   ├── _index.md                   # 首页正文
│   ├── about.md                    # 「关于」页面
│   ├── post/                       # 已发布文章（Markdown）
│   └── draft/                      # 未发布草稿（draft: true，不进生产构建）
├── themes/hugo-xmin/               # 主题（已改：terms.html 重命名为 taxonomy.html，适配 Hugo 0.166）         
├── .github/workflows/pages.yml     
└── public/                         # 构建产物（不要手动改）
```
