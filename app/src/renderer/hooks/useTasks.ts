import { useEffect, useState } from 'react'
import type { TaskWithRelations } from '../../common/types'

interface UseTasksResult {
  tasks: TaskWithRelations[]
  loading: boolean
  error: string | null
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadTasks(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const list = await window.taskAppApi.listTasks()
        if (active) {
          setTasks(list)
        }
      } catch {
        if (active) {
          setError('Unable to load tasks from the local database.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadTasks()

    return () => {
      active = false
    }
  }, [])

  return { tasks, loading, error }
}
