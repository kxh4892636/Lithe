import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const ShellSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [defaultShell, setDefaultShell] = useState('')
  const [shells, setShells] = useState<string[]>([])

  useEffect((): void => {
    void Promise.all([window.lithe.shells.list(), window.lithe.shells.getDefault()])
      .then(([detected, selected]): void => {
        setShells(detected)
        setDefaultShell(selected)
      })
      .catch((error: unknown): void => {
        globalThis.console.error('Lithe shell settings hydration failed', error)
      })
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('terminal.defaultShell')}</CardTitle>
        <CardDescription>{t('terminal.defaultShellDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <select
          aria-label={t('terminal.defaultShell')}
          className="border-input bg-background h-9 min-w-64 rounded-md border px-3 text-sm"
          onChange={(event): void => {
            const shell = event.currentTarget.value
            setDefaultShell(shell)
            void window.lithe.shells.setDefault(shell).catch((error: unknown): void => {
              globalThis.console.error('Lithe default shell persistence failed', error)
            })
          }}
          value={defaultShell}
        >
          {shells.map((shell) => (
            <option key={shell} value={shell}>
              {shell}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  )
}
