import { MoonIcon, SunIcon, SunMoonIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { ArchivedTaskSettings } from '@/features/tasks/archived-task-settings'

import type { Theme } from '../../../../shared/app-contract'
import { AdapterSettings } from './adapter-settings'
import { useSettingsNavigationStore } from './settings-navigation-store'
import { ShellSettings } from './shell-settings'
import { useThemeStore } from './theme-store'

const themeOptions: ReadonlyArray<{
  icon: React.ComponentType<{ className?: string }>
  labelKey: string
  value: Theme
}> = [
  { icon: SunIcon, labelKey: 'settings.light', value: 'light' },
  { icon: MoonIcon, labelKey: 'settings.dark', value: 'dark' },
  { icon: SunMoonIcon, labelKey: 'settings.system', value: 'system' },
]

export const SettingsPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const theme = useThemeStore((state): Theme => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const category = useSettingsNavigationStore((state) => state.category)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  useEffect((): void => {
    void window.lithe.preferences
      .getNotificationsEnabled()
      .then(setNotificationsEnabled)
      .catch(globalThis.console.error)
  }, [])

  return (
    <section className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 overflow-y-auto p-6 lg:p-10">
      <header className="max-w-2xl space-y-3">
        <p className="text-primary text-xs font-semibold tracking-[0.22em] uppercase">{t('settings.eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{t('settings.title')}</h1>
      </header>

      {category === 'general' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.theme')}</CardTitle>
            <CardDescription>{t('settings.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              aria-label={t('settings.theme')}
              className="grid gap-3 sm:grid-cols-3"
              onValueChange={(value: unknown): void => {
                if (value === 'light' || value === 'dark' || value === 'system') void setTheme(value)
              }}
              value={theme}
            >
              {themeOptions.map(({ icon: Icon, labelKey, value }) => (
                <label
                  className="text-foreground! has-data-[checked]:border-primary has-data-[checked]:bg-primary/5 flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors"
                  key={value}
                >
                  <RadioGroupItem value={value} />
                  <Icon className="text-muted-foreground size-4" />
                  <span className="text-sm font-medium">{t(labelKey)}</span>
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      ) : null}
      {category === 'general' ? (
        <Card>
          <CardHeader>
            <CardTitle>任务通知</CardTitle>
            <CardDescription>后台任务标记未读时，只显示项目、工作区与任务名称，不包含 Agent 内容。</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center justify-between gap-4 text-sm" htmlFor="notifications-enabled">
              <span>启用系统通知</span>
              <Switch
                checked={notificationsEnabled}
                id="notifications-enabled"
                onCheckedChange={(enabled: boolean): void => {
                  setNotificationsEnabled(enabled)
                  void window.lithe.preferences.setNotificationsEnabled(enabled).catch(globalThis.console.error)
                }}
              />
            </label>
          </CardContent>
        </Card>
      ) : null}
      {category === 'agents' ? <AdapterSettings /> : null}
      {category === 'terminal' ? <ShellSettings /> : null}
      {category === 'archive' ? <ArchivedTaskSettings /> : null}
    </section>
  )
}
