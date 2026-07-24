import { contextBridge, ipcRenderer } from 'electron'

import type {
  LitheBridge,
  ProjectWithWorkspaces,
  RuntimeInfo,
  Theme,
  WorkspaceNavigation,
} from '../shared/app-contract'
import { ipcChannels } from '../shared/ipc-channels'

const bridge: LitheBridge = {
  preferences: {
    getPinnedGroupOpen: async (): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.getPinnedGroupOpen) as Promise<boolean>,
    getProjectGroupOpen: async (): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.getProjectGroupOpen) as Promise<boolean>,
    getSidebarOpen: async (): Promise<boolean> => ipcRenderer.invoke(ipcChannels.getSidebarOpen) as Promise<boolean>,
    getSidebarWidth: async (): Promise<number> => ipcRenderer.invoke(ipcChannels.getSidebarWidth) as Promise<number>,
    getTheme: async (): Promise<Theme> => ipcRenderer.invoke(ipcChannels.getTheme) as Promise<Theme>,
    setPinnedGroupOpen: async (isOpen: boolean): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setPinnedGroupOpen, isOpen) as Promise<void>,
    setProjectGroupOpen: async (isOpen: boolean): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setProjectGroupOpen, isOpen) as Promise<void>,
    setSidebarOpen: async (isOpen: boolean): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setSidebarOpen, isOpen) as Promise<void>,
    setSidebarWidth: async (width: number): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setSidebarWidth, width) as Promise<void>,
    setTheme: async (theme: Theme): Promise<void> => ipcRenderer.invoke(ipcChannels.setTheme, theme) as Promise<void>,
  },
  runtime: {
    getInfo: async (): Promise<RuntimeInfo> => ipcRenderer.invoke(ipcChannels.getRuntimeInfo) as Promise<RuntimeInfo>,
  },
  projects: {
    addDirectory: async (): Promise<ProjectWithWorkspaces | null> =>
      ipcRenderer.invoke(ipcChannels.addProjectDirectory) as Promise<ProjectWithWorkspaces | null>,
    getNavigation: async (): Promise<WorkspaceNavigation> =>
      ipcRenderer.invoke(ipcChannels.getWorkspaceNavigation) as Promise<WorkspaceNavigation>,
    selectWorkspace: async (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.selectWorkspace, workspaceId) as Promise<void>,
  },
}

contextBridge.exposeInMainWorld('lithe', bridge)
