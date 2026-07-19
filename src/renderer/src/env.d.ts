/// <reference types="vite/client" />

import type { LitheBridge } from '../../shared/app-contract'

declare global {
  interface Window {
    lithe: LitheBridge
  }
}
