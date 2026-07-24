import { Layout, type TabNode } from 'flexlayout-react'
import { Columns2Icon, Rows2Icon, SquareTerminalIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { Workspace } from '../../../../shared/app-contract'
import { createLayoutAdapter, type TerminalPanelConfig, type WorkspaceLayoutAdapter } from './layout-adapter'
import { TerminalPanel } from './terminal-panel'

interface WorkspaceViewProps {
  workspace: Workspace
}

type TerminalPlacement = 'center' | 'right' | 'bottom'

interface WorkspaceToolbarProps {
  addTerminal: (placement: TerminalPlacement) => Promise<void>
}

const WorkspaceToolbar = ({ addTerminal }: WorkspaceToolbarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const button = (
    placement: TerminalPlacement,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
  ): React.JSX.Element => (
    <Button
      onClick={(): void => {
        void addTerminal(placement).catch((error: unknown): void => {
          globalThis.console.error('Lithe terminal panel creation failed', error)
        })
      }}
      size="sm"
      variant="ghost"
    >
      <Icon />
      {label}
    </Button>
  )

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
      {button('center', t('terminal.new'), SquareTerminalIcon)}
      {button('right', t('terminal.horizontalSplit'), Columns2Icon)}
      {button('bottom', t('terminal.verticalSplit'), Rows2Icon)}
    </div>
  )
}

export const WorkspaceView = ({ workspace }: WorkspaceViewProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [layout, setLayout] = useState<WorkspaceLayoutAdapter>()

  useEffect((): (() => void) => {
    let active = true
    setLayout(undefined)
    void window.lithe.workspaceLayouts
      .get(workspace.id)
      .then((snapshot): void => {
        if (active) setLayout(createLayoutAdapter(snapshot ?? undefined))
      })
      .catch((error: unknown): void => {
        if (active) setLayout(createLayoutAdapter())
        globalThis.console.error('Lithe workspace layout hydration failed', error)
      })
    return (): void => {
      active = false
    }
  }, [workspace.id])

  const addTerminal = async (placement: TerminalPlacement): Promise<void> => {
    if (!layout) return
    const source = placement === 'center' ? undefined : layout.getActiveTerminalConfig()
    const shell = source?.shell ?? (await window.lithe.shells.getDefault())
    const panel: TerminalPanelConfig = {
      cwd: source?.cwd ?? workspace.rootPath,
      panelId: crypto.randomUUID(),
      shell,
    }
    layout.addTerminal(panel, {
      placement,
      targetGroupId: layout.getActiveGroupId(),
    })
  }

  if (!layout) {
    return (
      <div className="text-muted-foreground grid size-full place-items-center text-sm">{t('terminal.restoring')}</div>
    )
  }

  const factory = (node: TabNode): React.ReactNode => {
    const config = node.getConfig() as TerminalPanelConfig
    return <TerminalPanel config={config} updateTerminal={layout.updateTerminal} workspaceId={workspace.id} />
  }

  return (
    <section
      className="flex size-full min-h-0 flex-col"
      aria-label={t('terminal.workspaceLabel', { name: workspace.name })}
    >
      <WorkspaceToolbar addTerminal={addTerminal} />
      <div className="relative min-h-0 flex-1">
        <Layout
          factory={factory}
          model={layout.getModel()}
          onModelChange={(): void => {
            void window.lithe.workspaceLayouts.save(workspace.id, layout.serialize()).catch((error: unknown): void => {
              globalThis.console.error('Lithe workspace layout persistence failed', error)
            })
          }}
          realtimeResize
        />
      </div>
    </section>
  )
}
