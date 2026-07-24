---
name: design-philosophy
description: Quiet UI 设计理念；构建或重塑桌面工具、设置页和工作区等产品界面，依据 Codex 式参考图建立安静层级，或将 shadcn/ui 组件直接对齐 Tailwind CSS 原子 utilities 时使用。
---

# Quiet UI

Quiet UI 让壳层退后、内容向前、状态只在需要时发声。它适合生产力工具和桌面应用：界面长时间停留在用户视野中，清晰、稳定与低视觉噪声比展示性更重要。

本 skill 定义产品 UI 的共享基线。需要为具体品牌寻找独特视觉身份时，由 `/frontend-design` 决定个性；当 brief 明确指定其他视觉方向时，以 brief 为准。

## 视觉语法

### 壳层退后

把持久界面分成 `shell → canvas → panel → overlay`：

- `shell` 承载侧栏、标题栏和导航，用低彩度冷灰与细边界形成应用外壳。
- `canvas` 是主要工作面，保持最安静、最明亮，让内容成为视觉中心。
- `panel` 只在一组内容确实共享边界时出现；设置组、统计组和代码块属于此层。
- `overlay` 承载临时任务，使用边框与轻阴影明确浮层关系。

每个持续存在的区域只承担一个表面角色。层级变化优先使用明度差、边界、间距和字重。

### 差值形成层级

界面的颜色保持低彩度，通过小而一致的差值建立顺序：

- 正文与关键标签使用最深的中性色。
- 描述、占位和次要元数据使用中等对比度的中性色。
- hover、selected 与当前导航使用相邻一至两档的浅中性色底。
- 高强调操作使用近黑实色；链接、焦点和进度统一使用蓝色档；破坏性状态使用红色档。

强调是一笔有限预算。一个视区通常只有一个最高强调对象，其余控件通过层级而非竞争获得可见性。

### 密度来自节奏

以 Tailwind 默认 spacing 基线组织界面。桌面控件保持紧凑而可点，图标与文字比例稳定；相邻元素、组件内部、内容分组和页面区段分别使用逐级放大的原子尺度。

主内容保留明确 measure：设置与目录页使用居中的中宽列，长文使用更窄的阅读列，工作台才让 canvas 吃满剩余空间。留白服务于分组与阅读，不承担装饰任务。

### 字体保持工具感

使用系统 sans 或 Inter 一类高可读无衬线字体。正文、标签与页面标题只跨少量相邻字号和字重，形成紧凑而清楚的层级。代码、路径和快捷键使用 mono 角色。

文案采用用户能识别的对象和动作。标签简短，说明补充后果或条件，按钮直接命名动作。

### 边界说明结构

结构面优先使用 1px 边框；阴影集中在 popover、dialog、浮动输入区等脱离文档流的对象。圆角随层级递增：紧凑控件较小，分组面板居中，浮层与大型输入区较大；每种角色固定使用一个 Tailwind 圆角档位。

### 状态短促而完整

hover 使用浅表面变化，selected 使用稳定填充，focus 使用清晰 ring，disabled 降低对比度，loading 保留原控件尺寸。动效短促并在状态变化完成后立即安静下来，同时为 reduced motion 提供静态结果。

## 应用

1. 读取 brief、参考图和目标仓库的 Tailwind 版本、现有组件与 class 约定，列出页面的持久区域、临时区域和交互状态。为每个区域指定一个表面角色，为每个交互列出适用状态。
   **完成标准：** 每个可见区域都已归入 `shell`、`canvas`、`panel` 或 `overlay`，每个交互都已列出其实际需要的状态。

2. 建立原子 utility 契约。涉及 Tailwind class、shadcn/ui 外观、组件 recipe 或样式审查时，完整读取 [`TAILWIND.md`](TAILWIND.md)。只使用 Tailwind 已提供的 utilities 与组件 variant；CSS variables、`@theme` 和 theme extension 不属于本 skill 的输出。
   **完成标准：** 每个重复出现的颜色、间距、尺寸、字体、圆角、阴影和动效都映射到现成 Tailwind utility 或组件 variant；新增 CSS variables、theme extension 与重复 arbitrary value 的数量均为零。

3. 用 shadcn/ui primitive 组合界面，把视觉变体收敛在组件 variant，把页面保留为布局与内容编排。保留 primitive 的键盘、焦点和可访问语义。
   **完成标准：** 每个组件的适用 `default / hover / active / focus-visible / disabled / loading / error` 状态均可到达且布局稳定，每个图标按钮都有 accessible name。

4. 在目标视口渲染并截图，对照 brief 或参考图检查表面层级、measure、密度、文字换行、滚动边界与状态强调；适用时同时检查窄视口和 dark mode。
   **完成标准：** 所有可见偏差都已修正，或作为带原因的已知偏差报告；实现中不存在未归属的重复视觉值。

## 交付说明

说明最终采用的视觉命题、表面映射、组件 variant、关键 Tailwind atoms，以及实际截图或运行态检查结果。若只做设计方案，给出同样四项的可执行映射。
