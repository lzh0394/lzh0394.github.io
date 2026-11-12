---
title: Windows GUI 框架
slug: "windows-gui-frameworks"
date: 2026-10-18
categories: ["工程"]
tags:
  - Windows
  - GUI
  - 跨平台
draft: false
summary: 按"谁在画控件"把 Windows 上的 GUI 方案分成系统原生、自绘引擎、浏览器内核三层，逐一列出微软原生栈（Win32、MFC/ATL、WPF、WinForms、UWP、WinUI 3）、C++ 跨平台工具包（Qt、wxWidgets、GTK、FLTK、Dear ImGui、Slint、egui）、.NET 生态（MAUI、Avalonia、Uno）、Web 技术壳（Electron、Tauri、Wails、WebView2、Blazor Hybrid）与其他运行时（Flutter、Compose、JavaFX、Python、Delphi），并给出按场景的选型表与许可、分发、输入法、无障碍几处容易踩的坑。
---

Windows 上的 GUI 方案，先看"谁在画控件"，再挑语言和框架；顺序反了，容易在输入法、无障碍和高 DPI 上栽跟头。底层无非三种：系统控件、自绘引擎、浏览器内核。

---

## 一、系统原生栈

微软这条线按"底层到高层"排：Win32（User32、GDI、Comctl32）是底座，MFC 与 ATL 是 C++ 的类封装，WPF 与 WinForms 是 .NET 的托管封装，UWP（XAML + WinRT）是 Windows 10 的应用模型，WinUI 3 是最新的一层，随 Windows App SDK 独立分发。

- WinUI 3 是微软当前对"新写一个 Windows 专用桌面程序"的推荐项，Fluent 控件、C# 与 C++ 共用一套 XAML，支持 Windows 10 1809 及以上。
- WPF 与 WinForms 明确没有废弃，各自仍在更新；WPF 有 .NET 与 .NET Framework 4.8 两个实现，只在 Windows 上跑。
- UWP 未废弃但不再推荐新项目，Xbox、HoloLens、标准 Surface Hub 这类场景仍得用它；配套的 WinUI 2 是 UWP 的控件库，与 WinUI 3 命名空间不同、不二进制兼容。
- MFC（1992）与 ATL（1996）随 Visual Studio 维护，前者是文档/视图那套 C++ 封装，后者偏向 COM，只有最薄的窗口封装。

这套栈的长处是与系统集成最深：Fluent 材质、通知、MSIX 打包、无障碍、输入法都是原生水准；短处是只覆盖 Windows。

## 二、C++ 跨平台工具包

Qt 6 是这条线上最完整的方案。Widgets 走原生控件风格，Qt Quick 走自绘，同一份代码能编到 Windows、macOS、Linux。许可要看清：开源版是 LGPLv3，动态链接即可商用，静态链接或修改源码就得走商业许可。Qt 6 起要求 Windows 10 以上，要覆盖 Windows 7/8 只能留在 Qt 5。

wxWidgets 是对各平台原生控件的薄封装，体积小，许可宽松（wxWindows Licence，基于 LGPL 并带例外），但 API 风格老派，生态远不如 Qt。

GTK 4 在 Windows 上能用（MSYS2 分发），但属于"能编译能跑"的级别，主题、输入法、高 DPI 常要自己调，不是一等公民。

轻量的还有 FLTK（极小、老派）、Dear ImGui（即时模式，适合工具面板、编辑器、调试界面，不适合表单型业务应用），以及 Rust 生态的 Slint 与 egui——前者 GPLv3/商业双许可，后者 MIT/Apache。

## 三、.NET 生态

除了 WPF、WinForms、MAUI，第三方里有两个值得知道。

Avalonia 是事实上的"跨平台 WPF"：XAML、数据绑定、样式模板的思路和 WPF 接近，MIT 许可，Windows、macOS、Linux 都支持，从 WPF 迁移的成本相对低。

Uno Platform 走另一条路，把 WinUI 的 API 和 XAML 搬到别的平台，Windows 上就是 WinUI 3，同一套代码还能出 iOS、Android、WebAssembly，Apache 2.0。代价是它本质在模拟 WinUI，遇到平台差异要写条件代码。

.NET MAUI 官方只覆盖 Windows、macOS、Android、iOS，Linux 不在官方支持列表里，这是它与 Avalonia、Uno 的主要差别。

## 四、Web 技术壳

Electron 自带 Chromium 与 Node，生态最全（VS Code 就是它），代价是安装包上百 MB、内存占用高。

Tauri 用系统自带的 WebView2 渲染、Rust 写后端，体积能压到几 MB；代价是各平台 WebView 版本不一致，兼容性要自己兜。

Wails 是 Go 版的同类思路，Photino、Neutralino 更轻。如果只需要在原生窗口里嵌一块网页，直接用 WebView2 控件（C++、C#、WinForms、WPF 都能宿主）比套整个壳省事。.NET 这边还有 Blazor Hybrid，用 BlazorWebView 把 Razor 组件塞进 MAUI、WPF、WinForms。

PWA 严格说不算桌面壳，但 Windows 上可以安装、进开始菜单、拿部分系统集成，适合"先有网页"的场景。

## 五、其他运行时

Flutter 用 Dart 写、Skia 自绘，Windows 桌面是 stable 支持，一套代码连移动端，渲染一致性最好；代价是控件观感与 Windows 原生有距离、包体不小。

Compose Multiplatform（Kotlin/JVM，Skia 渲染）在 JVM 圈子里是 JavaFX 之外的现代选择。JavaFX 从 JDK 11 起与 JDK 分离，要靠 jlink/jpackage 自己打包。

Python 这边 PySide6/PyQt6 是 Qt 的绑定，Tkinter 是标准库自带的最小方案，wxPython 是 wxWidgets 绑定。

Delphi 的 FMX（跨平台自绘）与 C++ Builder 的 VCL（仅 Windows）在传统企业软件里仍有存量。Unity、Unreal 拿来做常规 GUI 属于过度设计，除非本来就是游戏或实时 3D 场景。

## 六、按场景选

| 情况 | 首选 | 次选 |
| --- | --- | --- |
| 新的 Windows 专用商业桌面 | WinUI 3 | WPF |
| .NET 团队、要跨平台 | Avalonia | MAUI |
| C++ 团队、要 Win/macOS/Linux | Qt 6 | wxWidgets |
| Web 团队、在意体积 | Tauri | Electron |
| 内部工具、编辑器面板 | Dear ImGui | WinForms |
| 存量项目维护 | WPF / WinForms / MFC | — |
| JVM 生态 | JavaFX | Compose Multiplatform |
| 一套代码连移动端 | Flutter | MAUI / Uno |

## 七、几个容易忽略的点

许可要先算清楚：Qt 的 LGPL 静态链接、Slint 的 GPL、Electron 的 MIT 加 Chromium 的 BSD，差别在"能不能闭源、能不能静态链接、要不要公开修改"。

分发形态决定运行时依赖。WinUI 3 要 Windows App SDK 运行时；Tauri 与 WebView2 方案要 WebView2 Runtime（Windows 11 自带，Windows 10 多数已预装但仍需兜底）；.NET 应用要对应 .NET 运行时；Qt 要带一组 DLL。自带运行时省心但包大，依赖系统组件包小但可能装不上。

跨平台框架在 Windows 上最容易失分的是中文输入法、无障碍（UI Automation）、高 DPI 缩放和系统深浅色主题，选之前最好拿这四项做一次原型验证，别只看截图。

最后是维护成本：生态大、用的人多的方案，出问题能搜到答案；小众框架省下的开发时间，往往在三年后以"没人会改"的形式还回来。

## 参考

- [Windows 开发常见问题](https://learn.microsoft.com/en-us/windows/apps/get-started/windows-developer-faq)：微软对各框架的官方定位与推荐。
- [WinUI 3](https://learn.microsoft.com/en-us/windows/apps/winui/winui3/)：Windows App SDK 中的原生 UI 框架。
- [Qt](https://www.qt.io/)、[Avalonia](https://avaloniaui.net/)、[Uno Platform](https://platform.uno/)、[Tauri](https://tauri.app/)、[Electron](https://www.electronjs.org/)、[Flutter 桌面](https://docs.flutter.dev/platform-integration/desktop)：各项目官方站点。
