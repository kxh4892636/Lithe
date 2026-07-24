# Quiet UI 的 Tailwind 原子契约

在实现或审查 Tailwind class、shadcn/ui 外观、组件 variant、响应式布局时读取本文件。目标仓库的 Tailwind 版本、现有组件和 class 约定是当前事实源。

## 输出边界

本 skill 只组合以下材料：

- Tailwind 已生成的 utility 与 state、responsive、dark variants。
- shadcn/ui primitive 已公开的 `className`、`variant`、`size` 和状态 API。
- CVA 中完整、静态的 utility 字符串。
- `cn` 对调用点 class 的条件组合与冲突合并。

视觉映射保持在组件 class 与 variant 内。新增 CSS variables、`@theme` 和 Tailwind theme extension 的数量均为零；平台能力所需的 CSS 继续遵循目标仓库约定。

## 表面与状态映射

使用 Tailwind 现成色阶表达参考图中的冷灰壳层、白色 canvas、近黑主操作和蓝色信息状态：

| UI 角色       | Light utilities                                           | Dark utilities                                                |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| 应用 canvas   | `bg-white text-zinc-900`                                  | `dark:bg-zinc-950 dark:text-zinc-100`                         |
| sidebar 壳层  | `border-slate-200 bg-slate-50 text-slate-800`             | `dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200` |
| 结构 panel    | `border border-zinc-200 bg-white text-zinc-900`           | `dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100`    |
| 临时 overlay  | `border border-zinc-200 bg-white text-zinc-900 shadow-sm` | `dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100`    |
| 次要表面      | `bg-zinc-100 text-zinc-600`                               | `dark:bg-zinc-800 dark:text-zinc-400`                         |
| 普通 hover    | `hover:bg-zinc-100 hover:text-zinc-900`                   | `dark:hover:bg-zinc-800 dark:hover:text-zinc-100`             |
| 当前导航      | `bg-slate-200/70 text-slate-900`                          | `dark:bg-slate-800 dark:text-slate-100`                       |
| 高强调操作    | `bg-zinc-900 text-white hover:bg-zinc-800`                | `dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white`     |
| 链接与信息    | `text-blue-600 hover:text-blue-700`                       | `dark:text-blue-400 dark:hover:text-blue-300`                 |
| focus-visible | `focus-visible:ring-2 focus-visible:ring-blue-500/40`     | 同一组 utilities                                              |
| 破坏性状态    | `text-red-600 hover:text-red-700`                         | `dark:text-red-400 dark:hover:text-red-300`                   |

同一组件固定使用一组中性色族。`slate` 承担冷灰壳层，`zinc` 承担内容与控件，`blue` 只承担链接、开关、焦点和进度，`red` 只承担破坏性状态。

## 原子尺度

以下是 Quiet UI 的默认密度档。目标仓库已有稳定尺度时沿用该尺度。

| 决策         | 首选 utilities                                         | 用法                          |
| ------------ | ------------------------------------------------------ | ----------------------------- |
| 微间距       | `gap-1`, `p-1`                                         | 图标内部、紧邻标记            |
| 控件内部     | `gap-2`, `px-3`, `py-2`                                | 按钮、输入框、导航项          |
| 内容分组     | `gap-3`, `gap-4`, `p-4`, `px-5`                        | 行、面板、工具栏              |
| 区段节奏     | `gap-6`, `py-8`, `py-10`                               | 页面标题到内容、组与组之间    |
| 紧凑控件     | `h-8`, `size-8`                                        | 图标按钮、窄工具栏            |
| 标准控件     | `h-9`, `h-10`                                          | Button、Input、Select         |
| 图标         | `size-4`, `size-5`                                     | 行内图标、导航图标            |
| 导航与列表行 | `min-h-9`, `min-h-10`                                  | 侧栏、目录、紧凑列表          |
| 设置行       | `min-h-16`                                             | 标题 + 说明 + 尾部控件        |
| 正文         | `text-sm leading-5`, `text-base leading-6`             | 工具 UI、阅读内容             |
| 元数据       | `text-xs`, `text-sm text-zinc-500`                     | 时间、来源、说明              |
| 页面标题     | `text-2xl`, `text-3xl`, `font-semibold tracking-tight` | 设置页、目录页                |
| 控件圆角     | `rounded-md`, `rounded-lg`                             | Button、Input、导航项         |
| 面板圆角     | `rounded-xl`                                           | 设置组、统计组                |
| 浮层圆角     | `rounded-xl`, `rounded-2xl`                            | Popover、composer、Dialog     |
| 结构边界     | `border`, `divide-y`                                   | panel、行组、栏间分隔         |
| 浮层高度     | `shadow-xs`, `shadow-sm`                               | overlay；持久 panel 靠 border |
| 状态动效     | `duration-150`, `duration-200`, `ease-out`             | hover、展开、选中反馈         |

桌面 sidebar 从 `w-64` 或 `w-72` 起步；居中产品页从 `max-w-4xl` 或 `max-w-5xl` 起步；长文从 `max-w-3xl` 起步。内容、语言长度和目标窗口共同决定最终档位。

## shadcn/ui 组合

| 构图           | primitives                                                | Tailwind 职责                      |
| -------------- | --------------------------------------------------------- | ---------------------------------- |
| 工作台         | `SidebarProvider`, `Sidebar`, `SidebarInset`, `Resizable` | 壳层宽度、canvas 占满、栏间边界    |
| 设置页         | `Sidebar`, `Item`, `Separator`, `Switch`, `Select`        | 居中 measure、行高、组间节奏       |
| 目录或技能列表 | `Input`, `Button`, `Item`, `ScrollArea`                   | 工具栏、两列/单列切换、截断        |
| 资料或统计页   | `Avatar`, `Card`, `Chart`, `Tabs`, `Tooltip`              | 居中 measure、指标对齐、低对比底色 |
| 浮动输入区     | `Textarea`, `Button`, `Popover`                           | 大圆角、轻阴影、底部留白           |
| 临时任务       | `Popover`, `DropdownMenu`, `Dialog`, `Sheet`              | overlay 层级、窄视口替代           |
| 长文或消息     | shadcn Typeset 或仓库现有 prose renderer                  | 阅读 measure、容器内字号与流间距   |

primitive 拥有行为与 accessibility，variant 拥有复用的 utility 组合，页面只拥有布局和内容。

## Variant 与例外值

把可枚举差异写成完整 class：

```ts
const density = {
  compact: 'h-8 gap-1 px-2 text-xs',
  default: 'h-9 gap-2 px-3 text-sm',
}
```

运行时选择 `density[mode]`，让 Tailwind 静态发现每个 utility。CVA 适合公开组件 variant，`cn` 适合调用点组合。

真实且只出现一次的结构测量可以使用 arbitrary value，例如平台 titlebar 的固定高度。重复出现时把完整 class 收敛进组件或 variant，由这一处复用；仍然保持在 Tailwind class 层。

## 审查清单

- 新增 CSS variables、`@theme` 与 theme extension 均为零。
- 每个重复视觉值都能追溯到现成 Tailwind utility 或 component variant。
- 同一组件固定使用一组中性色族和一组尺寸档。
- selected、hover、focus、disabled、loading 与 error 各有单一、可辨识信号。
- 结构 panel 依靠表面差与 border，overlay 才增加明显 shadow。
- 窄视口保留任务顺序：sidebar 转为 `Sheet`，多栏按重要性折叠，主要动作保持可达。
- Windows 缩放、长中文、长英文与键盘导航下不截断关键动作。

## 官方参考

- [Tailwind CSS utility-first fundamentals](https://tailwindcss.com/docs/styling-with-utility-classes)
- [Tailwind CSS colors](https://tailwindcss.com/docs/colors)
- [shadcn/ui components](https://ui.shadcn.com/docs/components)
- [shadcn/ui Sidebar](https://ui.shadcn.com/docs/components/sidebar)
