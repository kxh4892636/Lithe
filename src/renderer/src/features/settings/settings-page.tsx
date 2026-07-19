import { MoonIcon, SunIcon, SunMoonIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import type { Theme } from '../../../../shared/app-contract'
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

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-8 lg:p-12">
      <header className="max-w-2xl space-y-3">
        <p className="text-primary text-xs font-semibold tracking-[0.22em] uppercase">{t('settings.eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{t('settings.title')}</h1>
      </header>

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
    </section>
  )
}
