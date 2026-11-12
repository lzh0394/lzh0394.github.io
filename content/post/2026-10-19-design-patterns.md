---
title: 设计模式
slug: "design-patterns"
date: 2026-10-19
categories: ["工程"]
tags:
  - 设计模式
  - 面向对象
draft: false
summary: 按 GoF《设计模式》1994 年版梳理 23 个模式的整体脉络：模式的定义与四要素（名字、问题、解法、后果）、按目的与范围构成的 3×2 分类、创建型/结构型/行为型三族各自回答的问题、23 个模式的一句话意图与别名、结构相近而意图不同的模式对与常见组合、从八类重设计原因反查模式的选型表，以及「模式常是语言缺口的补丁」这一批评（Norvig 的 16/23、作者 2009 年的自我修正、JUnit 3 到 4 的模式消失）；末附版本与出处。
---

> 底本为 Gamma、Helm、Johnson、Vlissides 的《Design Patterns: Elements of Reusable Object-Oriented Software》（Addison-Wesley，1994；版权页记 1995）。原书没有可引的编号条款，引用按章节名与模式名；不同印次页码有出入，故不标页码。

「设计模式」在中文语境里常被当成「套路」的同义词，GoF 的原意要窄得多：它描述的是特定上下文里反复出现的一类设计问题，以及一组类与对象如何协作解决它。书里的说法是，设计模式是对相互通信的类与对象的描述，这些描述针对特定上下文中的一般设计问题做了定制。

更早的出处是建筑学家 Christopher Alexander 的《A Pattern Language》（1977），GoF 在第一章解释「什么是设计模式」时，引的就是他那段定义：

> Each pattern describes a problem which occurs over and over again in our environment, and then describes the core of the solution to that problem, in such a way that you can use this solution a million times over, without ever doing it the same way twice.

意思是：每个模式描述我们环境中反复出现的一个问题，然后描述该问题解法的核心，使这个解法可以被使用上百万次，而两次使用的方式从不相同。

最后半句是关键：模式给的是「解法的核心」，不是可以照抄的代码。同一个模式在不同语言、不同代码库里长得并不一样，硬套结构图往往比不用更糟。

## 一、模式是什么

### 四个要素

GoF 把模式拆成四样东西：

- 名字（pattern name）：一个可讨论的把手。有了名字，设计评审里才能说「这里用 Observer」，而不是比划半天。
- 问题（problem）：什么时候该用它，以及它适用的上下文。
- 解法（solution）：参与者、职责、协作关系的一般性描述，不含具体实现。
- 后果（consequences）：用它的结果与取舍，包括空间时间开销，以及对灵活性、可扩展性、可移植性的影响。

多数人只记前两样，而真正决定该不该用某个模式的是第四样。

### 一个模式条目长什么样

原书每个模式按十二节展开：

1. Intent（意图）
2. Also Known As（别名）
3. Motivation（动机）
4. Applicability（适用性）
5. Structure（结构）
6. Participants（参与者）
7. Collaborations（协作）
8. Consequences（后果）
9. Implementation（实现要点）
10. Sample Code（示例代码）
11. Known Uses（已知应用）
12. Related Patterns（相关模式）

读目录时最有用的顺序是先 Intent、再 Applicability、再 Consequences。Structure 只是达成意图的一种画法，不是模式的本质；把它当成本质，就会写出「有 Strategy 的类图但没有可替换算法」的代码。

### 与算法、框架、惯用法的区别

模式不是算法：算法是有限的、可终止的计算步骤，模式描述的是一组对象的分工。模式也不是框架：框架是别人写好、你来填充的可复用设计，模式是你自己往设计里放的协作结构。惯用法（idiom）则更小、更依赖具体语言，比如 C++ 里的 RAII、PIMPL，通常不算在设计模式目录里。

## 二、两个分类轴

GoF 用两个维度切 23 个模式：目的（purpose）说明它解决哪类问题，范围（scope）说明它主要靠继承还是靠组合。

| 目的 | 类模式（继承，编译期固定） | 对象模式（组合/委托，运行期可换） |
| --- | --- | --- |
| 创建型 | Factory Method | Abstract Factory、Builder、Prototype、Singleton |
| 结构型 | Adapter（类适配器） | Adapter（对象适配器）、Bridge、Composite、Decorator、Facade、Flyweight、Proxy |
| 行为型 | Interpreter、Template Method | Chain of Responsibility、Command、Iterator、Mediator、Memento、Observer、State、Strategy、Visitor |

类模式通过继承把关系写死在编译期，子类在编译时就确定；对象模式通过持有与委托把关系推迟到运行期，可以动态更换。这也是全书反复强调的两条原则的来源：

- 「面向接口编程，而不是面向实现编程」（原书 p.18）；
- 「优先使用对象组合，而不是类继承」（原书 p.20）。

Adapter 同时出现在两栏，是个好例子：类适配器用多继承把被适配类的接口「继承」进来，对象适配器则持有一个被适配对象、转发请求。前者在只支持单继承的语言里根本写不出来。

## 三、三族的内在逻辑

23 个名字单独背很难记住，按「它们各自把什么东西从客户代码里拿走」来串就顺得多。

### 创建型：把「new 哪个类」挪出客户代码

五个创建型模式都在回答同一个问题——谁来决定实例化哪个具体类、什么时候实例化——差别只在把决定权交给了谁：

- Factory Method 交给子类，用继承在编译期决定；
- Abstract Factory 交给一个工厂对象，一次造出一族相关产品；
- Builder 把构造拆成步骤，由客户控制流程、由具体建造者决定每步做什么；
- Prototype 交给已有实例，靠克隆复制；
- Singleton 把「只造一个」写进类本身。

### 结构型：把对象拼起来

七个结构型模式都在处理「类与对象怎么组合成更大的结构」，按拼接的层面分：

- 接口层面：Adapter 做接口转换，Bridge 把抽象与实现拆成两维各自变化，Facade 把子系统收成一个入口；
- 整体与部分：Composite 把对象组织成树，让单个对象和组合对象用同一套接口；
- 单个对象的包装：Decorator 动态加职责，Proxy 控制访问；
- 共享：Flyweight 把大量细粒度对象的公共部分共享出去。

### 行为型：职责与通信怎么分

十一个行为型模式都在分配职责、规定对象之间怎么通信，按「变的是什么」分：

- 算法可变：Strategy 整体替换算法，Template Method 固定骨架、只让个别步骤可变；
- 状态可变：State 把状态相关的行为放进状态对象，行为随状态迁移而变；
- 请求的处理：Command 把请求封装成对象，Chain of Responsibility 让请求沿处理者链传递，Mediator 把多对多的交互收进一个中介；
- 遍历：Iterator 顺序访问元素而不暴露内部表示；
- 通知：Observer 建立一对多依赖，状态变化时广播；
- 对结构的操作：Visitor 把操作从元素类里拿出来，Interpreter 用类表示文法并求值；
- 快照：Memento 在不破坏封装的前提下保存与恢复内部状态。

## 四、23 个模式一览

下面按原书目录顺序列出，意图用一句话概括；别名一栏是原书「Also Known As」里给出的名字，读其他代码库时有用。

### 创建型（5 个）

| 模式 | 别名 | 意图 |
| --- | --- | --- |
| Abstract Factory | Kit | 创建一系列相关或相互依赖的对象，而不指定具体类 |
| Builder | — | 把复杂对象的构建与表示分离，同一构建过程可造出不同表示 |
| Factory Method | Virtual Constructor | 定义创建对象的接口，让子类决定实例化哪个类 |
| Prototype | — | 用原型实例克隆出新对象 |
| Singleton | — | 保证一个类只有一个实例，并提供全局访问点 |

### 结构型（7 个）

| 模式 | 别名 | 意图 |
| --- | --- | --- |
| Adapter | Wrapper | 把一个类的接口转换成客户期望的另一个接口 |
| Bridge | Handle/Body | 把抽象部分与实现部分分离，使二者可独立变化 |
| Composite | — | 把对象组合成树形结构，使单个对象与组合对象的使用一致 |
| Decorator | Wrapper | 动态地给对象添加职责，比继承更灵活 |
| Facade | — | 为子系统提供统一的高层接口 |
| Flyweight | — | 用共享技术高效支持大量细粒度对象 |
| Proxy | Surrogate | 为其他对象提供代理以控制对它的访问 |

### 行为型（11 个）

| 模式 | 别名 | 意图 |
| --- | --- | --- |
| Chain of Responsibility | — | 把请求沿处理者链传递，直到有一个处理者处理它 |
| Command | Action、Transaction | 把请求封装成对象，从而可参数化、排队、记录日志、撤销 |
| Interpreter | — | 给定一种语言，定义其文法的表示，并给出解释器 |
| Iterator | Cursor | 顺序访问聚合对象的元素，而不暴露其内部表示 |
| Mediator | — | 用一个中介对象封装一组对象的交互，降低耦合 |
| Memento | Token | 在不破坏封装的前提下捕获并恢复对象的内部状态 |
| Observer | Dependents、Publish-Subscribe | 定义一对多依赖，状态变化时通知所有依赖者 |
| State | Objects for States | 状态改变时改变对象行为，看起来像换了类 |
| Strategy | Policy | 定义一族算法，封装起来并可互换 |
| Template Method | — | 在基类定义算法骨架，把部分步骤延迟到子类 |
| Visitor | — | 把作用于某对象结构各元素的操作分离出来 |

Adapter 与 Decorator 的别名都叫 Wrapper，这是英文文献里常见的歧义来源，看到 Wrapper 要按上下文判断是「转接口」还是「加职责」。

## 五、模式之间

### 结构相近、意图不同

这些模式画出来几乎一样，区别只在意图与使用时机；选错时编译能过、行为却不对。

| 对比 | 差别 |
| --- | --- |
| Adapter / Bridge | 都是「接口转换」的结构。Adapter 适配已经存在的接口，是事后补救；Bridge 在设计时就把抽象与实现拆成两维，是事前预防 |
| Decorator / Proxy | 都包一层并转发请求。Decorator 叠加职责，可以叠多层；Proxy 控制访问（延迟加载、权限、远程、引用计数），通常一层 |
| Decorator / Composite | 都递归持有同类型的对象。Decorator 是一条链上逐层加职责，Composite 是一棵树 |
| Facade / Mediator | 都面对多个对象。Facade 单向简化子系统的入口，子系统不知道 Facade；Mediator 双向协调同级对象的交互，参与者知道中介 |
| Strategy / State | 都把行为委托给另一个对象。Strategy 由客户选择算法、通常在生命周期内不变；State 由状态迁移驱动，对象的行为随状态改变而改变 |
| Template Method / Strategy | 都固定骨架、变化局部。Template Method 用继承在编译期绑定可变步骤，Strategy 用组合在运行期替换整个算法 |
| Abstract Factory / Factory Method / Builder | Abstract Factory 造一族产品，常以 Factory Method 实现；Builder 分步造一个复杂对象，最后才交出产品 |
| Observer / Mediator | 都解耦通信。Observer 是一对多广播，Mediator 是多对多集中转发 |
| Visitor / Iterator | 都遍历结构。Iterator 负责取出元素，Visitor 负责对元素施加操作 |

### 经常一起出现

- Abstract Factory 的方法通常返回产品，具体工厂里再用 Factory Method 或 Prototype 造产品。
- Builder 内部常用 Composite 组织部件；Director 决定步骤顺序。
- Interpreter 的语法树就是 Composite；求值与优化常再挂一个 Visitor。
- Command 常配 Memento 做撤销：Command 记录「做了什么」，Memento 记录「做之前是什么」。
- Decorator 常配 Composite：给树的节点套装饰，或把装饰本身也当成节点。
- Chain of Responsibility 与 Decorator 结构相同，区别在语义：链上是「谁处理」，装饰上是「都处理」。

## 六、怎么选

### 从「什么会变」反查

原书列了八类导致重设计的原因，并给出对治的模式。这是整本书里最实用的一张表：先找到自己代码里最可能变的那一处，再查表。

| 会导致重设计的原因 | 对治的模式 |
| --- | --- |
| 显式指定类来创建对象 | Abstract Factory、Factory Method、Prototype |
| 依赖特定操作 | Chain of Responsibility、Command |
| 依赖硬件或软件平台 | Abstract Factory、Bridge |
| 依赖对象的表示或实现 | Abstract Factory、Bridge、Memento、Proxy |
| 依赖具体算法 | Builder、Iterator、Strategy、Template Method、Visitor |
| 紧耦合 | Abstract Factory、Bridge、Chain of Responsibility、Command、Facade、Mediator、Observer |
| 靠子类扩展功能 | Bridge、Chain of Responsibility、Composite、Decorator、Observer、Strategy |
| 无法方便地修改某个类 | Adapter、Decorator、Visitor |

### 五步选法

原书给的选法是自上而下的，适合还不确定问题在哪的时候：

1. 先看设计模式如何解决设计问题：找对象、定粒度、定接口、定实现、用复用机制；
2. 扫一遍各模式的 Intent，挑出听起来相关的几个；
3. 看模式之间如何关联，顺着关系网找到同一族的其他模式；
4. 比较同一目的下模式之间的差异，尤其是 Consequences；
5. 反过来问：设计里到底什么需要可变？把那个概念封装起来。

第 5 步是核心。模式不是清单，选型的落点是「把变化点隔离出去」：变化点在创建过程上，就看创建型；在结构组合上，就看结构型；在职责分配与通信上，就看行为型。

## 七、代价与批评

### 后果不是附注

每个模式都引入了一层间接：多一个接口、多一个转发、多一个对象。换来的是某个方向上的可变性，代价是类数量增加、控制流难跟、调试时多跳几层、运行期多一次派发。原书的 Consequences 一节写的就是这笔账，选型时如果算不清这笔账，多半是不该用。

### 模式常常是语言缺口的补丁

这是对 GoF 最有力的一类批评，而且作者本人也承认。Peter Norvig 在 1996 年的讲稿（1998 年整理上网）里逐个演示：23 个模式中有 16 个在 Lisp 或 Dylan 这类语言里要么根本不需要、要么只剩一两行。比如 Strategy 与 Command 在一等函数面前退化成传一个函数，Iterator 退化成语言自带的遍历，Visitor 在多分派语言里失去意义。

Paul Graham 在《Revenge of the Nerds》里的说法更直接：看到自己的程序里出现模式，他会认为这是个麻烦的信号，因为程序的结构本应只反映要解决的问题。

Ralph Johnson 在 2009 年的访谈里把范围说得更清楚：这些模式是给「介于 C++ 与 Smalltalk 之间」的语言用的，并不是每种语言都需要；别的语言会有自己的一套模式。

### 作者自己的修正

同一场访谈里，Erich Gamma 说 2005 年四个人做过一次「如果重写这本书」的讨论，结论是只调整分类、增删少量模式：把 Interpreter 与 Flyweight 挪进「Other/Compound」，把 Factory Method 泛化为 Factory，新增 Null Object、Type Object、Dependency Injection、Extension Object/Interface；分类改成 Core、Creational、Peripheral、Other。Gamma 本人主张删掉 Singleton，理由是「它的使用几乎总是设计坏味道」，但四人没有达成一致。

这些只是草稿性质的笔记，没有变成新版；但它说明 23 这个数字不是教条，连作者自己都觉得它该变。

### 模式会随语言特性消失

最具体的例子来自 Gamma 在同一场访谈里的描述：JUnit 3 用了 Composite、Template Method、Command 等好几个模式；到 JUnit 4，注解（annotation）这类元编程设施把同样的职责接了过去，模式在代码里「消失」了，框架变成一组注解加一个测试运行器。

同类的事情一直在发生：一等函数吃掉 Strategy、Command、Template Method 的一部分；和类型加模式匹配吃掉 Visitor；泛型吃掉一部分工厂；依赖注入容器吃掉 Abstract Factory 的一部分。模式没有消失，只是从「手写结构」退回到「语言或框架已经内建」。

### 过度设计的边界

模式名是用来沟通的，不是验收标准。判断是否过度设计，可以问三个问题：

- 是先有问题，还是先想用某个模式？后者通常要出问题。
- 这个模式引入的间接层，换来的是哪一个具体的可变点？说不出来就是多余的。
- 如果这段代码明天就被删掉，损失有多大？损失为零的抽象不该存在。

另外要记得这 23 个只覆盖单进程内对象之间的协作。原书明确不涉及并发、分布式与实时编程，这些领域后来各自长出了自己的模式目录。

## 八、出处与版本

- 原书：Erich Gamma、Richard Helm、Ralph Johnson、John Vlissides，《Design Patterns: Elements of Reusable Object-Oriented Software》，Addison-Wesley，1994 年 10 月出版（版权页记 1995），ISBN 0-201-63361-2，395 页。全书分两部分：前两章讲面向对象设计的取舍，第 2 章用文档编辑器 Lexi 做完整案例；第 3 到 5 章分别是创建型、结构型、行为型目录，示例用 C++ 与 Smalltalk。此后多次重印，正文未改。有中译本（机械工业出版社）。
- 模式概念的来源：Christopher Alexander，《A Pattern Language: Towns, Buildings, Construction》，Oxford University Press，1977。
- 语言相关性批评：Peter Norvig，《Design Patterns in Dynamic Languages》，1996 年首次演讲、1998 年上网，<https://www.norvig.com/design-patterns/>。
- 作者回顾：Larry O'Brien 访谈，《Design Patterns 15 Years Later: An Interview with Erich Gamma, Richard Helm, and Ralph Johnson》，InformIT，2009 年 10 月 22 日，<http://www.informit.com/articles/article.aspx?p=1404056>（[存档](https://web.archive.org/web/20190220090254/http://www.informit.com/articles/article.aspx?p=1404056)）。
- Paul Graham，《Revenge of the Nerds》，2002，<http://www.paulgraham.com/icad.html>。
- 后续的目录：POSA（1996）、Patterns of Enterprise Application Architecture（2002）、Enterprise Integration Patterns（2003）、Domain-Driven Design（2003）、Game Programming Patterns（2014）。它们各自覆盖不同的层次，与 GoF 的 23 个不构成替代关系。

英文维基百科的 Design Patterns 条目只用来找线索（出版信息、访谈出处），事实以上面的原书与访谈为准。
