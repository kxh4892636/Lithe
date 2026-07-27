import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

void i18n.use(initReactI18next).init({
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  lng: 'zh-CN',
  resources: {
    'zh-CN': {
      translation: {
        app: {
          description: '轻、快、可信的本地工具底座',
          name: 'Lithe',
        },
        appMenu: {
          about: '关于',
          user: '用户菜单',
        },
        home: {
          architecture: '架构',
          emptyHint: '应用已经就绪，可以从这个轻量底座开始构建。',
          eyebrow: '本地运行台',
          platform: '操作系统',
          refreshedAt: '采样时间',
          refresh: '刷新运行信息',
          runtime: '运行环境',
          title: '一眼确认应用状态',
        },
        navigation: {
          home: '首页',
          settings: '设置',
          resizeSidebar: '调整侧栏宽度',
          toggleSidebar: '切换侧栏',
        },
        projects: {
          add: '添加项目',
          label: '项目',
          noPinned: '暂无置顶工作区',
          pinned: '置顶',
        },
        settings: {
          archive: '归档',
          dark: '深色',
          description: '主题会写入本地 SQLite，并在下次启动时恢复。',
          eyebrow: '个性化',
          light: '浅色',
          system: '跟随系统',
          theme: '外观主题',
          title: '让界面适应你的工作环境',
        },
        terminal: {
          defaultShell: '默认 Shell',
          defaultShellDescription: '仅可选择当前系统自动检测到的本机 Shell，新设置只影响之后创建的终端。',
          horizontalSplit: '水平拆分',
          new: '新建终端',
          restoring: '正在恢复工作区…',
          verticalSplit: '垂直拆分',
          workspaceLabel: '{{name}} 工作区',
        },
      },
    },
  },
})

export { i18n }
