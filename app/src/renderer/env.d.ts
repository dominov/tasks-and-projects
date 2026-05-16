import type { TaskAppApi } from '../main/preload'

declare global {
  interface Window {
    taskAppApi: TaskAppApi
  }
}

export {}
