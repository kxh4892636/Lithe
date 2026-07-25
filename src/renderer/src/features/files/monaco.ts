import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

self.MonacoEnvironment = {
  getWorker: (): Worker => new EditorWorker(),
}

loader.config({ monaco })

export { monaco }
