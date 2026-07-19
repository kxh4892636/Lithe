import { contextBridge, ipcRenderer } from 'electron'

import type { LitheBridge, RuntimeInfo, Theme } from '../shared/app-contract'
import { ipcChannels } from '../shared/ipc-channels'

const bridge: LitheBridge = {
  preferences: {
    getTheme: async (): Promise<Theme> => ipcRenderer.invoke(ipcChannels.getTheme) as Promise<Theme>,
    setTheme: async (theme: Theme): Promise<void> => ipcRenderer.invoke(ipcChannels.setTheme, theme) as Promise<void>,
  },
  runtime: {
    getInfo: async (): Promise<RuntimeInfo> => ipcRenderer.invoke(ipcChannels.getRuntimeInfo) as Promise<RuntimeInfo>,
  },
}

contextBridge.exposeInMainWorld('lithe', bridge)
