import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge } from '../../../../shared/app-contract'
import { navigationRowPreferenceKey, useNavigationRowCollapse } from './navigation-row-collapse'

describe('navigation row collapse', (): void => {
  beforeEach((): void => {
    useNavigationRowCollapse.setState({ openByKey: {} })
  })

  it('derives preference keys from the row kind and id', (): void => {
    expect(navigationRowPreferenceKey('project', 'project-1')).toBe('project-row-open:project-1')
    expect(navigationRowPreferenceKey('workspace', 'workspace-1')).toBe('workspace-row-open:workspace-1')
  })

  it('toggles from expanded by default and persists the new state', (): void => {
    const setRowOpen = vi.fn<LitheBridge['preferences']['setRowOpen']>().mockResolvedValue(undefined)
    window.lithe = { preferences: { setRowOpen } } as unknown as LitheBridge

    useNavigationRowCollapse.getState().toggleRow('workspace', 'workspace-1')

    expect(useNavigationRowCollapse.getState().openByKey['workspace-row-open:workspace-1']).toBe(false)
    expect(setRowOpen).toHaveBeenCalledWith('workspace-row-open:workspace-1', false)

    useNavigationRowCollapse.getState().toggleRow('workspace', 'workspace-1')

    expect(useNavigationRowCollapse.getState().openByKey['workspace-row-open:workspace-1']).toBe(true)
    expect(setRowOpen).toHaveBeenLastCalledWith('workspace-row-open:workspace-1', true)
  })

  it('hydrates the persisted state once without overwriting a user toggle', async (): Promise<void> => {
    const getRowOpen = vi.fn<LitheBridge['preferences']['getRowOpen']>().mockResolvedValue(false)
    window.lithe = {
      preferences: {
        getRowOpen,
        setRowOpen: vi.fn<LitheBridge['preferences']['setRowOpen']>().mockResolvedValue(undefined),
      },
    } as unknown as LitheBridge

    useNavigationRowCollapse.getState().hydrateRow('project', 'project-1')
    useNavigationRowCollapse.getState().hydrateRow('project', 'project-1')
    await vi.waitFor((): void => {
      expect(useNavigationRowCollapse.getState().openByKey['project-row-open:project-1']).toBe(false)
    })
    expect(getRowOpen).toHaveBeenCalledOnce()

    useNavigationRowCollapse.setState({ openByKey: {} })
    const lateGetRowOpen = vi
      .fn<LitheBridge['preferences']['getRowOpen']>()
      .mockImplementation(async (): Promise<boolean> => {
        useNavigationRowCollapse.getState().toggleRow('workspace', 'workspace-2')
        return true
      })
    window.lithe = {
      preferences: {
        getRowOpen: lateGetRowOpen,
        setRowOpen: vi.fn<LitheBridge['preferences']['setRowOpen']>().mockResolvedValue(undefined),
      },
    } as unknown as LitheBridge

    useNavigationRowCollapse.getState().hydrateRow('workspace', 'workspace-2')
    await vi.waitFor((): void => {
      expect(lateGetRowOpen).toHaveBeenCalled()
    })
    await new Promise((resolve): void => {
      setTimeout(resolve, 0)
    })

    expect(useNavigationRowCollapse.getState().openByKey['workspace-row-open:workspace-2']).toBe(false)
  })
})
