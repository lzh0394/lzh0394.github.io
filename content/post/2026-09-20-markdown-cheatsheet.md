---
title: "Markdown 与公式速查"
slug: "markdown-cheatsheet"
date: 2026-09-20
author: "我的名字"
categories: ["写作"]
tags: ["Markdown"]
draft: true
---

这是一篇供你自己参考的语法示例。读完删掉即可。

## 行内样式

**粗体**、*斜体*、~~删除线~~、`行内代码`、[链接](https://gohugo.io/)。

## 代码块

xmin 默认关闭了语法高亮，代码块只做等宽+边框处理，好处是页面不加载任何高亮脚本：

    def fib(n):
        a, b = 0, 1
        while a < n:
            print(a, end=' ')
            a, b = b, a + b

缩进四个空格，或者用三个反引号围起来都可以。

## 表格

| 方案 | 依赖 | 构建速度 |
|---|---|---|
| Hugo | 无 | 极快 |
| Hexo | Node | 中等 |
| Astro | Node | 中等 |

## 数学公式

`hugo.yaml` 里已经开启了 passthrough，所以 LaTeX 可以直接写：

行内公式：当 \(a \ne 0\) 时，方程 \(ax^2 + bx + c = 0\) 有两个解。

独立公式：

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

## 图片

把图片放进 `static/images/`，然后引用：

```markdown
![说明文字](/images/screenshot.png)
```

## 脚注

Hugo 原生支持脚注[^1]，点击可以回到原文。

[^1]: 这就是脚注的样子。
