import { CheckIcon, PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import type { AdapterDefinition, AdapterSummary } from '../../../../shared/app-contract'

const emptyDefinition: AdapterDefinition = {
  executable: '',
  start: [],
  resume: null,
  fork: null,
}

const serialize = (definition: AdapterDefinition): string => JSON.stringify(definition, null, 2)

interface AdapterRowProps {
  adapter: AdapterSummary
  onDefault: (adapter: AdapterSummary) => void
  onDelete: (adapter: AdapterSummary) => void
  onEdit: (adapter: AdapterSummary) => void
}

const AdapterRow = ({ adapter, onDefault, onDelete, onEdit }: AdapterRowProps): React.JSX.Element => (
  <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
    <button className="min-w-0 flex-1 text-left" onClick={(): void => onEdit(adapter)} type="button">
      <span className="block truncate text-sm font-medium">{adapter.name}</span>
      <span className="text-muted-foreground block truncate text-xs">
        v{adapter.currentVersion.version} · {adapter.currentVersion.definition.executable}
      </span>
    </button>
    <span className={adapter.isAvailable ? 'text-emerald-600 text-xs' : 'text-destructive text-xs'}>
      {adapter.isAvailable ? '可用' : '不可用'}
    </span>
    <Button
      aria-label={`设为默认 ${adapter.name}`}
      disabled={!adapter.isAvailable || adapter.isDefault}
      onClick={(): void => onDefault(adapter)}
      size="icon"
      variant="ghost"
    >
      <CheckIcon />
    </Button>
    {adapter.kind === 'custom' ? (
      <Button
        aria-label={`删除 ${adapter.name}`}
        disabled={adapter.isDefault}
        onClick={(): void => onDelete(adapter)}
        size="icon"
        variant="ghost"
      >
        <Trash2Icon />
      </Button>
    ) : null}
  </div>
)

export const AdapterSettings = (): React.JSX.Element => {
  const [adapters, setAdapters] = useState<AdapterSummary[]>([])
  const [editing, setEditing] = useState<AdapterSummary | null>(null)
  const [name, setName] = useState('')
  const [definition, setDefinition] = useState(serialize(emptyDefinition))
  const [error, setError] = useState<string | null>(null)
  const refresh = async (): Promise<void> => setAdapters(await window.lithe.adapters.list())
  useEffect((): void => {
    void refresh().catch((reason: unknown): void => setError(String(reason)))
  }, [])

  const edit = (adapter: AdapterSummary | null): void => {
    setEditing(adapter?.kind === 'custom' ? adapter : null)
    setName(adapter?.kind === 'builtin' ? `${adapter.name} 副本` : (adapter?.name ?? ''))
    setDefinition(serialize(adapter?.currentVersion.definition ?? emptyDefinition))
    setError(null)
  }
  const save = async (): Promise<void> => {
    try {
      const parsed = JSON.parse(definition) as AdapterDefinition
      if (editing) await window.lithe.adapters.update(editing.id, name, parsed)
      else await window.lithe.adapters.create(name, parsed)
      edit(null)
      await refresh()
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const apply = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action()
      await refresh()
      setError(null)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coding Agent Adapter</CardTitle>
        <CardDescription>选择唯一的全局默认 Adapter，或使用声明式 JSON 添加命令适配。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {adapters.map((adapter) => (
            <AdapterRow
              adapter={adapter}
              key={adapter.id}
              onDefault={(value: AdapterSummary): void => {
                void apply((): Promise<void> => window.lithe.adapters.setDefault(value.id))
              }}
              onDelete={(value: AdapterSummary): void => {
                void apply((): Promise<void> => window.lithe.adapters.delete(value.id))
              }}
              onEdit={edit}
            />
          ))}
        </div>
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <Input onChange={(event): void => setName(event.target.value)} placeholder="Adapter 名称" value={name} />
            <Button onClick={(): void => edit(null)} size="icon" variant="outline">
              <PlusIcon />
            </Button>
          </div>
          <textarea
            aria-label="Adapter 声明"
            className="bg-background min-h-48 w-full rounded-md border p-3 font-mono text-xs"
            onChange={(event): void => setDefinition(event.target.value)}
            spellCheck={false}
            value={definition}
          />
          <Button disabled={!name.trim()} onClick={(): void => void save()}>
            <SaveIcon />
            {editing ? '保存新版本' : '创建 Adapter'}
          </Button>
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}
