import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'

import {
  validateAdapterDefinition,
  type AdapterSummary,
  type AgentLaunch,
  type Task,
} from '../../shared/agent-contract'
import { ipcChannels } from '../../shared/ipc-channels'
import type { AppDatabase } from '../database/app-database'
import type { AdapterService } from './adapter-service'
import type { AgentApplication } from './agent-application'

interface RegisterAgentIpcOptions {
  adapters: AdapterService
  application: AgentApplication
  database: AppDatabase
  window: BrowserWindow
}

const assertTrustedSender = (event: IpcMainInvokeEvent, window: BrowserWindow): void => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('拒绝来自非主窗口的 Agent IPC 请求')
  }
}

const assertIdentifier = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0 && value.length <= 128) return value
  throw new TypeError('Invalid identifier')
}

const assertName = (value: unknown): string => {
  if (typeof value === 'string' && value.trim().length > 0 && value.length <= 80) return value
  throw new TypeError('Invalid name')
}

export const registerAgentIpc = ({ adapters, application, database, window }: RegisterAgentIpcOptions): void => {
  ipcMain.handle(ipcChannels.adapterList, (event: IpcMainInvokeEvent): Promise<AdapterSummary[]> => {
    assertTrustedSender(event, window)
    return adapters.list()
  })
  ipcMain.handle(ipcChannels.adapterSetDefault, async (event: IpcMainInvokeEvent, value: unknown): Promise<void> => {
    assertTrustedSender(event, window)
    await adapters.setDefault(assertIdentifier(value))
  })
  ipcMain.handle(
    ipcChannels.adapterCreate,
    async (event: IpcMainInvokeEvent, name: unknown, definition: unknown): Promise<AdapterSummary> => {
      assertTrustedSender(event, window)
      return adapters.create(assertName(name), validateAdapterDefinition(definition))
    },
  )
  ipcMain.handle(
    ipcChannels.adapterUpdate,
    async (
      event: IpcMainInvokeEvent,
      adapterId: unknown,
      name: unknown,
      definition: unknown,
    ): Promise<AdapterSummary> => {
      assertTrustedSender(event, window)
      return adapters.update(assertIdentifier(adapterId), assertName(name), validateAdapterDefinition(definition))
    },
  )
  ipcMain.handle(ipcChannels.adapterDelete, (event: IpcMainInvokeEvent, adapterId: unknown): void => {
    assertTrustedSender(event, window)
    adapters.delete(assertIdentifier(adapterId))
  })
  ipcMain.handle(
    ipcChannels.adapterGet,
    async (event: IpcMainInvokeEvent, versionId: unknown): Promise<AdapterSummary | null> => {
      assertTrustedSender(event, window)
      return adapters.get(assertIdentifier(versionId))
    },
  )
  ipcMain.handle(ipcChannels.taskList, (event: IpcMainInvokeEvent, workspaceId: unknown): Task[] => {
    assertTrustedSender(event, window)
    return database.tasks.list(assertIdentifier(workspaceId))
  })
  ipcMain.handle(
    ipcChannels.taskCreate,
    async (event: IpcMainInvokeEvent, workspaceId: unknown, name: unknown): Promise<AgentLaunch> => {
      assertTrustedSender(event, window)
      return application.createTask(assertIdentifier(workspaceId), assertName(name))
    },
  )
  ipcMain.handle(ipcChannels.taskRename, (event: IpcMainInvokeEvent, taskId: unknown, name: unknown): Task => {
    assertTrustedSender(event, window)
    return application.renameTask(assertIdentifier(taskId), assertName(name))
  })
  ipcMain.handle(ipcChannels.agentStart, (event: IpcMainInvokeEvent, taskId: unknown): AgentLaunch => {
    assertTrustedSender(event, window)
    return application.start(assertIdentifier(taskId))
  })
  ipcMain.handle(ipcChannels.agentResume, async (event: IpcMainInvokeEvent, taskId: unknown): Promise<AgentLaunch> => {
    assertTrustedSender(event, window)
    return application.resume(assertIdentifier(taskId))
  })
  ipcMain.handle(ipcChannels.agentStop, (event: IpcMainInvokeEvent, taskId: unknown): void => {
    assertTrustedSender(event, window)
    application.stop(assertIdentifier(taskId))
  })
  ipcMain.handle(ipcChannels.agentFork, async (event: IpcMainInvokeEvent, taskId: unknown): Promise<AgentLaunch> => {
    assertTrustedSender(event, window)
    return application.fork(assertIdentifier(taskId))
  })
}

export const removeAgentIpc = (): void => {
  ipcMain.removeHandler(ipcChannels.adapterList)
  ipcMain.removeHandler(ipcChannels.adapterSetDefault)
  ipcMain.removeHandler(ipcChannels.adapterCreate)
  ipcMain.removeHandler(ipcChannels.adapterUpdate)
  ipcMain.removeHandler(ipcChannels.adapterDelete)
  ipcMain.removeHandler(ipcChannels.adapterGet)
  ipcMain.removeHandler(ipcChannels.taskList)
  ipcMain.removeHandler(ipcChannels.taskCreate)
  ipcMain.removeHandler(ipcChannels.taskRename)
  ipcMain.removeHandler(ipcChannels.agentStart)
  ipcMain.removeHandler(ipcChannels.agentResume)
  ipcMain.removeHandler(ipcChannels.agentStop)
  ipcMain.removeHandler(ipcChannels.agentFork)
}
