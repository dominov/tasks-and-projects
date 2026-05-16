import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Category, Project, Tag, TaskWithRelations } from '../../common/types'

export interface AppFilters {
  projectId: number | null
  tagId: number | null
  categoryId: number | null
}

interface WorkspaceData {
  tasks: TaskWithRelations[]
  projects: Project[]
  tags: Tag[]
  categories: Category[]
  loading: boolean
  error: string | null
}

interface UseWorkspaceDataResult extends WorkspaceData {
  filteredTasks: TaskWithRelations[]
  refreshWorkspaceData: () => Promise<void>
}

/**
 * Centralized loader for all entities needed by the tripartite layout.
 * It keeps fetching concerns in one place and provides a filtered task list.
 */
export function useWorkspaceData(filters: AppFilters): UseWorkspaceDataResult {
  const [data, setData] = useState<WorkspaceData>({
    tasks: [],
    projects: [],
    tags: [],
    categories: [],
    loading: true,
    error: null,
  })

  const refreshWorkspaceData = useCallback(async () => {
    setData((previous) => ({ ...previous, loading: true, error: null }))

    try {
      const [tasks, projects, tags, categories] = await Promise.all([
        window.taskAppApi.listTasks(),
        window.taskAppApi.listProjects(),
        window.taskAppApi.listTags(),
        window.taskAppApi.listCategories(),
      ])

      setData({
        tasks,
        projects,
        tags,
        categories,
        loading: false,
        error: null,
      })
    } catch {
      setData((previous) => ({
        ...previous,
        loading: false,
        error: 'Unable to load local workspace data.',
      }))
    }
  }, [])

  useEffect(() => {
    refreshWorkspaceData()
  }, [refreshWorkspaceData])

  const filteredTasks = useMemo(() => {
    return data.tasks.filter((task) => {
      if (filters.projectId !== null && task.project_id !== filters.projectId) {
        return false
      }

      if (filters.categoryId !== null && task.category_id !== filters.categoryId) {
        return false
      }

      if (filters.tagId !== null) {
        const tagIds = parseTagIds(task.tag_ids)

        if (!tagIds.includes(filters.tagId)) {
          return false
        }
      }

      return true
    })
  }, [data.tasks, filters.categoryId, filters.projectId, filters.tagId])

  return {
    ...data,
    filteredTasks,
    refreshWorkspaceData,
  }
}

function parseTagIds(tagIds: string | null): number[] {
  if (!tagIds) {
    return []
  }

  return tagIds
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}
