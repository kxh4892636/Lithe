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
        },
        settings: {
          dark: '深色',
          description: '主题会写入本地 SQLite，并在下次启动时恢复。',
          eyebrow: '个性化',
          light: '浅色',
          system: '跟随系统',
          theme: '外观主题',
          title: '让界面适应你的工作环境',
        },
      },
    },
  },
})

export { i18n }
