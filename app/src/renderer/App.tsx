import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppBanner from './components/AppBanner'
import SideMenu from './components/SideMenu'
import TaskDetailsSidebar from './components/TaskDetailsSidebar'
import ViewManager, { type QuickCreateOptions, type ViewType } from './components/ViewManager'
import { useBanner } from './hooks/useBanner'
import { useWorkspaceData } from './hooks/useWorkspaceData'
import type { TaskCreatePayload, TaskUpdatePayload } from '../common/types'

function App() {
  const [viewType, setViewType] = useState<ViewType>('tasks')
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [tagId, setTagId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const { banner, showBanner, dismissBanner } = useBanner()
  const detailsSidebarRef = useRef<HTMLElement | null>(null)

  const {
    tasks: workspaceTasks,
    filteredTasks,
    projects,
    tags,
    categories,
    loading,
    error,
    refreshWorkspaceData,
  } = useWorkspaceData({
    projectId,
    tagId,
    categoryId,
  })

  const selectedTask = useMemo(
    () => workspaceTasks.find((task) => task.id === selectedTaskId) ?? null,
    [workspaceTasks, selectedTaskId],
  )

  const displayedTasks = useMemo(() => {
    if (showCompletedTasks) {
      return filteredTasks
    }

    return filteredTasks.filter((task) => task.status !== 'done')
  }, [filteredTasks, showCompletedTasks])

  useEffect(() => {
    if (error) {
      showBanner(error, 'error')
    }
  }, [error, showBanner])

  function handleSelectTask(taskId: number): void {
    setSelectedTaskId(taskId)
    setDetailsOpen(true)
  }

  const handleUpdateTask = useCallback(
    async (taskId: number, payload: TaskUpdatePayload, successMessage: string) => {
      try {
        await window.taskAppApi.updateTask(taskId, payload)
        await refreshWorkspaceData()
        showBanner(successMessage, 'info')
      } catch {
        showBanner('Unable to update task changes.', 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleDeleteTask = useCallback(
    async (taskId: number) => {
      try {
        const confirmed = window.confirm('Delete this task?')

        if (!confirmed) {
          return
        }

        await window.taskAppApi.deleteTask(taskId)
        await refreshWorkspaceData()
        setDetailsOpen(false)
        setSelectedTaskId(null)
        showBanner('Task deleted.', 'info')
      } catch {
        showBanner('Unable to delete task.', 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleCreateSubtask = useCallback(
    async (payload: TaskCreatePayload) => {
      if (!selectedTask) {
        showBanner('Select a parent task first.', 'warning')
        return
      }

      try {
        await window.taskAppApi.createTask({
          title: payload.title,
          end_date: payload.end_date ?? null,
          parent_task_id: selectedTask.id,
        })
        await refreshWorkspaceData()
        showBanner('Subtask created.', 'info')
      } catch {
        showBanner('Unable to create subtask.', 'error')
      }
    },
    [refreshWorkspaceData, selectedTask, showBanner],
  )

  const handleCreateTask = useCallback(
    async (title: string, type: 'task' | 'goal' = 'task', options?: QuickCreateOptions) => {
      if (!title.trim()) {
        return
      }

      try {
        const projectValue = options?.projectId !== undefined ? options.projectId : projectId
        const createResult = await window.taskAppApi.createTask({
          title: title.trim(),
          type,
          end_date: options?.endDate ?? null,
          project_id: projectValue,
          category_id: categoryId,
          tag_ids: tagId ? [tagId] : undefined,
        })

        if (options?.priority) {
          const createdTaskIdRaw = (createResult as { taskId?: unknown; taskid?: unknown }).taskId
            ?? (createResult as { taskId?: unknown; taskid?: unknown }).taskid
          const createdTaskId = Number(createdTaskIdRaw)

          if (Number.isInteger(createdTaskId) && createdTaskId > 0) {
            await window.taskAppApi.updateTask(createdTaskId, { priority: options.priority })
          }
        }

        await refreshWorkspaceData()
        showBanner('Task created.', 'info')
      } catch {
        showBanner('Unable to create task.', 'error')
      }
    },
    [projectId, categoryId, tagId, refreshWorkspaceData, showBanner],
  )

  const handleCreateGoalSubtask = useCallback(
    async (goalId: number, title: string) => {
      if (!title.trim()) {
        return
      }

      try {
        await window.taskAppApi.createTask({
          title: title.trim(),
          type: 'task',
          parent_task_id: goalId,
        })
        await refreshWorkspaceData()
        showBanner('Subtask created for goal.', 'info')
      } catch {
        showBanner('Unable to create subtask for goal.', 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleCreateProject = useCallback(
    async (name: string, color: string) => {
      try {
        await window.taskAppApi.createProject({
          name,
          color,
        })
        await refreshWorkspaceData()
        showBanner('Project created.', 'info')
        setViewType('tasks')
      } catch {
        showBanner('Unable to create project.', 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleCreateTag = useCallback(
    async (name: string, color: string) => {
      try {
        await window.taskAppApi.createTag({
          name,
          color,
        })
        await refreshWorkspaceData()
        showBanner('Tag created.', 'info')
        setViewType('tasks')
      } catch {
        showBanner('Unable to create tag.', 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleCreateCategory = useCallback(
    async (name: string) => {
      try {
        await window.taskAppApi.createCategory({
          name,
        })
        await refreshWorkspaceData()
        showBanner('Category created.', 'info')
        setViewType('tasks')
      } catch {
        showBanner('Unable to create category.', 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleDeleteProject = useCallback(
    async (project: { id: number; name: string }) => {
      const confirmed = window.confirm(`Delete project "${project.name}"?`)

      if (!confirmed) {
        return
      }

      const keepAssociatedTasks = window.confirm(
        'Keep associated tasks? Click OK to keep tasks, or Cancel to delete associated tasks too.',
      )

      try {
        await window.taskAppApi.deleteProject(project.id, keepAssociatedTasks)

        if (projectId === project.id) {
          setProjectId(null)
        }

        await refreshWorkspaceData()
        showBanner('Project deleted.', 'info')
      } catch {
        showBanner('Unable to delete project.', 'error')
      }
    },
    [projectId, refreshWorkspaceData, showBanner],
  )

  const handleDeleteTag = useCallback(
    async (tag: { id: number; name: string }) => {
      const confirmed = window.confirm(`Delete tag "${tag.name}"?`)

      if (!confirmed) {
        return
      }

      const keepAssociatedTasks = window.confirm(
        'Keep associated tasks? Click OK to keep tasks, or Cancel to delete associated tasks too.',
      )

      try {
        await window.taskAppApi.deleteTag(tag.id, keepAssociatedTasks)

        if (tagId === tag.id) {
          setTagId(null)
        }

        await refreshWorkspaceData()
        showBanner('Tag deleted.', 'info')
      } catch {
        showBanner('Unable to delete tag.', 'error')
      }
    },
    [tagId, refreshWorkspaceData, showBanner],
  )

  const handleDeleteCategory = useCallback(
    async (category: { id: number; name: string }) => {
      const confirmed = window.confirm(`Delete category "${category.name}"?`)

      if (!confirmed) {
        return
      }

      const keepAssociatedTasks = window.confirm(
        'Keep associated tasks? Click OK to keep tasks, or Cancel to delete associated tasks too.',
      )

      try {
        await window.taskAppApi.deleteCategory(category.id, keepAssociatedTasks)

        if (categoryId === category.id) {
          setCategoryId(null)
        }

        await refreshWorkspaceData()
        showBanner('Category deleted.', 'info')
      } catch {
        showBanner('Unable to delete category.', 'error')
      }
    },
    [categoryId, refreshWorkspaceData, showBanner],
  )

  const handleClearDetailsView = useCallback(() => {
    setDetailsOpen(false)
    setSelectedTaskId(null)

    if (banner) {
      dismissBanner(banner.id)
    }
  }, [banner, dismissBanner])

  useEffect(() => {
    if (!detailsOpen) {
      return
    }

    function handleOutsideClick(event: MouseEvent): void {
      const target = event.target as Node
      const targetElement = event.target as HTMLElement | null
      const clickPath = typeof event.composedPath === 'function' ? event.composedPath() : []

      if (targetElement?.closest('[data-details-trigger="open"]')) {
        return
      }

      if (targetElement?.closest('.details-sidebar')) {
        return
      }

      if (detailsSidebarRef.current && clickPath.includes(detailsSidebarRef.current)) {
        return
      }

      if (detailsSidebarRef.current?.contains(target)) {
        return
      }

      handleClearDetailsView()
    }

    document.addEventListener('click', handleOutsideClick)

    return () => {
      document.removeEventListener('click', handleOutsideClick)
    }
  }, [detailsOpen, handleClearDetailsView])

  return (
    <div className="app-root">
    <main className={detailsOpen ? 'trip-layout sidebar-open' : 'trip-layout'}>
      <SideMenu
        viewType={viewType}
        projects={projects}
        tags={tags}
        categories={categories}
        showCompletedTasks={showCompletedTasks}
        selectedProjectId={projectId}
        selectedTagId={tagId}
        selectedCategoryId={categoryId}
        onChangeView={setViewType}
        onToggleCompletedTasks={setShowCompletedTasks}
        onSelectProject={setProjectId}
        onSelectTag={setTagId}
        onSelectCategory={setCategoryId}
        onOpenProjectCreateView={() => setViewType('create-project')}
        onOpenTagCreateView={() => setViewType('create-tag')}
        onOpenCategoryCreateView={() => setViewType('create-category')}
        onDeleteProject={handleDeleteProject}
        onDeleteTag={handleDeleteTag}
        onDeleteCategory={handleDeleteCategory}
      />

      <section className="main-canvas" aria-live="polite">
        <header className="canvas-head">
          <div>
            <p className="eyebrow">View Manager</p>
            <h1>Personal Task Management</h1>
          </div>
        </header>

        {loading && <p>Loading workspace data...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && (
          <ViewManager
            viewType={viewType}
            tasks={displayedTasks}
            projects={projects}
            onSelectTask={handleSelectTask}
            selectedTaskId={selectedTask?.id ?? null}
            projectId={projectId}
            categoryId={categoryId}
            tagId={tagId}
            onCreateTask={handleCreateTask}
            onCreateGoalSubtask={handleCreateGoalSubtask}
            onCreateProject={handleCreateProject}
            onCreateTag={handleCreateTag}
            onCreateCategory={handleCreateCategory}
          />
        )}
      </section>

      <TaskDetailsSidebar
        containerRef={detailsSidebarRef}
        open={detailsOpen}
        selectedTaskId={selectedTask?.id ?? null}
        tasks={workspaceTasks}
        projects={projects}
        tags={tags}
        categories={categories}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        onCreateSubtask={handleCreateSubtask}
        onClose={handleClearDetailsView}
      />
    </main>
    <AppBanner message={banner} onDismiss={dismissBanner} />
    </div>
  )
}

export default App
