import Editor from '@monaco-editor/react'
import { SaveIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

import { fileDocumentKey, useFileDocumentStore } from './file-document-store'
import { monaco } from './monaco'

interface FileEditorPanelProps {
  relativePath: string
  workspaceId: string
}

export const FileEditorPanel = ({ relativePath, workspaceId }: FileEditorPanelProps): React.JSX.Element => {
  const key = fileDocumentKey(workspaceId, relativePath)
  const document = useFileDocumentStore((state) => state.documents[key])
  const acceptDisk = useFileDocumentStore((state) => state.acceptDisk)
  const load = useFileDocumentStore((state) => state.load)
  const save = useFileDocumentStore((state) => state.save)
  const update = useFileDocumentStore((state) => state.update)

  useEffect((): void => {
    void load(workspaceId, relativePath)
  }, [load, relativePath, workspaceId])

  if (!document) {
    return <div className="text-muted-foreground grid size-full place-items-center text-xs">正在载入文件…</div>
  }

  return (
    <div className="flex size-full min-h-0 flex-col bg-[#1e1e1e]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/10 px-2 text-xs text-zinc-300">
        <span className="min-w-0 flex-1 truncate font-mono">{relativePath}</span>
        {document.dirty ? <span className="text-amber-300">未保存</span> : null}
        <Button
          aria-label="保存文件"
          className="text-zinc-300 hover:bg-white/10 hover:text-white"
          onClick={(): void => void save(workspaceId, relativePath)}
          size="icon-xs"
          variant="ghost"
        >
          <SaveIcon />
        </Button>
      </div>
      {document.conflict ? (
        <div className="flex items-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          <TriangleAlertIcon className="size-3.5" />
          <span className="flex-1">磁盘内容已改变，本地未保存内容未被覆盖。</span>
          <Button onClick={(): void => acceptDisk(workspaceId, relativePath)} size="xs" variant="outline">
            使用磁盘版本
          </Button>
          <Button onClick={(): void => void save(workspaceId, relativePath, true)} size="xs">
            覆盖保存
          </Button>
        </div>
      ) : null}
      {document.error ? <p className="bg-destructive/15 text-destructive px-3 py-1 text-xs">{document.error}</p> : null}
      <Editor
        onChange={(value): void => update(workspaceId, relativePath, value ?? '')}
        onMount={(editor): void => {
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, (): void => {
            void save(workspaceId, relativePath)
          })
        }}
        options={{
          automaticLayout: true,
          fontFamily: 'Cascadia Mono, Consolas, monospace',
          fontSize: 13,
          minimap: { enabled: false },
          padding: { top: 10 },
          scrollBeyondLastLine: false,
        }}
        path={`lithe://${workspaceId}/${relativePath}`}
        theme="vs-dark"
        value={document.content}
      />
    </div>
  )
}
