export const themeValues = ['light', 'dark', 'system'] as const

export type Theme = (typeof themeValues)[number]

export interface RuntimeInfo {
  appVersion: string
  electronVersion: string
  platform: string
  architecture: string
  refreshedAt: string
}

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

export interface LitheBridge {
  preferences: {
    getTheme: () => Promise<Theme>
    setTheme: (theme: Theme) => Promise<void>
  }
  runtime: {
    getInfo: () => Promise<RuntimeInfo>
  }
}
