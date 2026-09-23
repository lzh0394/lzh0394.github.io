---
title: 关于
---

这是一个使用 **Hugo + xmin** 搭建的极简静态博客。

## 为什么选这套

- **零依赖**：xmin 主题总共约 140 行代码（HTML + CSS），不存在"依赖腐坏"的问题
- **构建极快**：Hugo 用 Go 编写，几百篇文章也是毫秒级构建
- **单二进制**：Hugo 就是一个可执行文件，不需要 Node、Ruby 或 Python 运行时
- **纯静态**：产物是一堆 HTML/CSS 文件，可以放在任何静态托管上

## 怎么发文章

```bash
# 新建一篇（会自动带上日期和 draft 状态）
hugo new content post/2026-09-21-my-post.md

# 本地预览（含草稿）
hugo server --buildDrafts

# 构建生产版本
hugo
```

## 目录结构

| 路径 | 用途 |
|---|---|
| `content/post/` | 博客文章 |
| `content/about.md` | 本页 |
| `hugo.yaml` | 全部站点配置 |
| `themes/hugo-xmin/` | 主题（约 140 行代码） |
| `public/` | 构建产物 |

## 联系我

- GitHub: [your-name](https://github.com/)
- 邮箱: you@example.com
