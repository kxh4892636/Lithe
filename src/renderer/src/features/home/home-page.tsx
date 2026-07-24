import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { CpuIcon, MonitorCogIcon, RefreshCwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { findActiveProject, useProjectStore } from '@/features/projects/project-store'
import { WorkspaceView } from '@/features/workspace/workspace-view'

dayjs.extend(utc)

export const HomePage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const activeWorkspaceId = useProjectStore((state) => state.activeWorkspaceId)
  const projects = useProjectStore((state) => state.projects)
  const activeProject = findActiveProject(projects, activeWorkspaceId)
  const activeWorkspace = activeProject?.workspaces.find((workspace): boolean => workspace.id === activeWorkspaceId)
  const runtimeQuery = useQuery({
    queryFn: window.lithe.runtime.getInfo,
    queryKey: ['runtime-info'],
    staleTime: Number.POSITIVE_INFINITY,
  })

  if (activeWorkspace) return <WorkspaceView workspace={activeWorkspace} />

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8 lg:p-12">
      <header className="max-w-2xl space-y-3">
        <p className="text-primary text-xs font-semibold tracking-[0.22em] uppercase">{t('home.eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{activeProject?.name ?? t('home.title')}</h1>
        <p className="text-muted-foreground text-sm leading-6">
          {activeProject ? activeProject.rootPath : t('home.emptyHint')}
        </p>
        {activeProject ? <h2 className="sr-only">{t('home.title')}</h2> : null}
      </header>

      <Card className="runtime-card relative overflow-hidden border-black/8 shadow-[0_20px_70px_-45px_rgba(15,23,42,0.45)] dark:border-white/10">
        <div className="runtime-pulse" aria-hidden="true" />
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorCogIcon className="text-primary size-4" />
              {t('home.runtime')}
            </CardTitle>
            <CardDescription>{t('app.description')}</CardDescription>
          </div>
          <Button
            aria-label={t('home.refresh')}
            disabled={runtimeQuery.isFetching}
            onClick={(): void => {
              void runtimeQuery.refetch()
            }}
            size="icon-sm"
            variant="outline"
          >
            <RefreshCwIcon className={runtimeQuery.isFetching ? 'animate-spin' : ''} />
          </Button>
        </CardHeader>
        <CardContent>
          {runtimeQuery.data ? (
            <div className="grid gap-6 md:grid-cols-[1.25fr_1fr]">
              <div className="rounded-xl border bg-zinc-950 p-5 text-zinc-50 dark:bg-black/40">
                <div className="mb-8 flex items-center justify-between">
                  <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-300" variant="outline">
                    <span className="mr-1.5 size-1.5 rounded-full bg-emerald-400" />
                    ONLINE
                  </Badge>
                  <CpuIcon className="size-4 text-zinc-500" />
                </div>
                <p className="font-mono text-3xl font-medium tracking-tight">
                  Electron {runtimeQuery.data.electronVersion}
                </p>
                <p className="mt-2 font-mono text-xs text-zinc-500">Lithe v{runtimeQuery.data.appVersion}</p>
              </div>
              <dl className="grid content-start gap-4 text-sm">
                <RuntimeDatum label={t('home.platform')} value={runtimeQuery.data.platform} />
                <RuntimeDatum label={t('home.architecture')} value={runtimeQuery.data.architecture} />
                <RuntimeDatum
                  label={t('home.refreshedAt')}
                  value={dayjs.utc(runtimeQuery.data.refreshedAt).format('YYYY-MM-DD HH:mm:ss [UTC]')}
                />
              </dl>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

interface RuntimeDatumProps {
  label: string
  value: string
}

const RuntimeDatum: React.FC<RuntimeDatumProps> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-mono text-xs font-medium">{value}</dd>
  </div>
)
