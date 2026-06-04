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
  const [lastCreatedTaskId, setLastCreatedTaskId] = useState<number | null>(null)
  const [isSideMenuVisible, setIsSideMenuVisible] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [tagId, setTagId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [showTrackingTasks, setShowTrackingTasks] = useState(true)
  const [presentationMode, setPresentationMode] = useState(false)
  const [isDataOperationLoading, setIsDataOperationLoading] = useState(false)
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
    let result = filteredTasks

    if (!showCompletedTasks && viewType !== 'focus') {
      result = result.filter((task) => task.status !== 'done')
    }

    if (!showTrackingTasks) {
      result = result.filter((task) => !task.tracking_only)
    }

    return result
  }, [filteredTasks, showCompletedTasks, showTrackingTasks, viewType])

  useEffect(() => {
    if (error) {
      showBanner(error, 'error')
    }
  }, [error, showBanner])

  useEffect(() => {
    if (lastCreatedTaskId === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setLastCreatedTaskId(null)
    }, 4000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [lastCreatedTaskId])

  function handleSelectTask(taskId: number): void {
    setSelectedTaskId(taskId)
    setDetailsOpen(true)
  }

  const handleUpdateTask = useCallback(
    async (taskId: number, payload: TaskUpdatePayload, successMessage: string) => {
      try {
        const result = await window.taskAppApi.updateTask(taskId, payload)
        await refreshWorkspaceData()

        if (result?.conflicts && result.conflicts.length > 0) {
          const titles = result.conflicts.map((conflict) => `"${conflict.task_title}"`).join(', ')
          showBanner(
            `Conflicto de Cronograma: ${titles} no se desplazaron porque están en progreso o completadas.`,
            'warning',
          )
        } else {
          showBanner(successMessage, 'info')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update task changes.'
        showBanner(message, 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleShiftTasks = useCallback(
    async (
      updates: Array<{ taskId: number; payload: TaskUpdatePayload }>,
      successMessage: string,
    ) => {
      if (updates.length === 0) {
        return
      }

      try {
        const conflictTitles = new Set<string>()

        for (const update of updates) {
          const result = await window.taskAppApi.updateTask(update.taskId, update.payload)
          for (const conflict of result.conflicts ?? []) {
            conflictTitles.add(`"${conflict.task_title}"`)
          }
        }

        await refreshWorkspaceData()

        if (conflictTitles.size > 0) {
          showBanner(
            `Conflicto de Cronograma: ${Array.from(conflictTitles).join(', ')} no se desplazaron porque están en progreso o completadas.`,
            'warning',
          )
        } else {
          showBanner(successMessage, 'info')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update task changes.'
        showBanner(message, 'error')
      }
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleDeleteTask = useCallback(
    async (taskId: number) => {
      try {
        const task = workspaceTasks.find((item) => item.id === taskId) ?? null
        const hasPreviousInChain = task?.previous_recurrent_id !== null
        const hasNextInChain = workspaceTasks.some((item) => item.previous_recurrent_id === taskId)
        const isRecurringChainTask = hasPreviousInChain || hasNextInChain
        let deleteScope: 'single' | 'future' | 'all' = 'single'

        if (isRecurringChainTask) {
          const rawChoice = window.prompt(
            'This task is recurring. Choose deletion scope:\n1) Only this task\n2) This and subsequent tasks\n3) All related tasks (previous and subsequent)\n\nEnter 1, 2, or 3:',
            '1',
          )

          if (rawChoice === null) {
            return
          }

          const choice = rawChoice.trim()

          if (choice === '2') {
            deleteScope = 'future'
          } else if (choice === '3') {
            deleteScope = 'all'
          } else if (choice !== '1') {
            window.alert('Invalid option. Please enter 1, 2, or 3.')
            return
          }
        }

        const confirmationMessage =
          deleteScope === 'single'
            ? 'Delete this task?'
            : deleteScope === 'future'
              ? 'Delete this task and all subsequent recurring tasks?'
              : 'Delete all related recurring tasks (previous and subsequent)?'

        const confirmed = window.confirm(confirmationMessage)

        if (!confirmed) {
          return
        }

        await window.taskAppApi.deleteTask(taskId, deleteScope)
        await refreshWorkspaceData()
        setDetailsOpen(false)
        setSelectedTaskId(null)
        showBanner('Task deleted.', 'info')
      } catch {
        showBanner('Unable to delete task.', 'error')
      }
    },
    [workspaceTasks, refreshWorkspaceData, showBanner],
  )

  const handleCreateSubtask = useCallback(
    async (payload: TaskCreatePayload) => {
      if (!selectedTask) {
        showBanner('Select a parent task first.', 'warning')
        return
      }

      try {
        const createResult = await window.taskAppApi.createTask({
          title: payload.title,
          start_date: payload.start_date ?? null,
          end_date: payload.end_date ?? null,
          parent_task_id: selectedTask.id,
          project_id: payload.project_id ?? null,
          category_id: payload.category_id ?? null,
          tag_ids: payload.tag_ids,
        })
        const createdTaskId = Number(createResult.taskId)
        if (Number.isInteger(createdTaskId) && createdTaskId > 0) {
          setLastCreatedTaskId(createdTaskId)
        }
        await refreshWorkspaceData()
        showBanner('Subtask created.', 'info')
      } catch {
        showBanner('Unable to create subtask.', 'error')
      }
    },
    [refreshWorkspaceData, selectedTask, showBanner],
  )

  const handleCreateTask = useCallback(
    async (title: string, type: 'task' | 'goal' = 'task', options?: QuickCreateOptions): Promise<number | null> => {
      if (!title.trim()) {
        return null
      }

      try {
        const projectValue = options?.projectId !== undefined ? options.projectId : projectId
        const createResult = await window.taskAppApi.createTask({
          title: title.trim(),
          type,
          start_date: options?.startDate ?? null,
          end_date: options?.endDate ?? null,
          priority: options?.priority,
          project_id: projectValue,
          category_id: categoryId,
          tag_ids: tagId ? [tagId] : undefined,
        })
        const createdTaskId = Number(createResult.taskId)

        if (options?.status && Number.isInteger(createdTaskId) && createdTaskId > 0) {
          await window.taskAppApi.updateTask(createdTaskId, { status: options.status })
        }

        if (Number.isInteger(createdTaskId) && createdTaskId > 0) {
          setLastCreatedTaskId(createdTaskId)
        }

        await refreshWorkspaceData()
        showBanner('Task created.', 'info')
        return Number.isInteger(createdTaskId) && createdTaskId > 0 ? createdTaskId : null
      } catch {
        showBanner('Unable to create task.', 'error')
        return null
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
        const createResult = await window.taskAppApi.createTask({
          title: title.trim(),
          type: 'task',
          parent_task_id: goalId,
        })
        const createdTaskId = Number(createResult.taskId)
        if (Number.isInteger(createdTaskId) && createdTaskId > 0) {
          setLastCreatedTaskId(createdTaskId)
        }
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

      const keepAssociatedTasks = await window.taskAppApi.confirmKeepAssociatedTasks()

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

      const keepAssociatedTasks = await window.taskAppApi.confirmKeepAssociatedTasks()

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

      const keepAssociatedTasks = await window.taskAppApi.confirmKeepAssociatedTasks()

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

  const handleUpdateProject = useCallback(
    async (projectIdToUpdate: number, payload: { name?: string; color?: string }) => {
      await window.taskAppApi.updateProject(projectIdToUpdate, payload)
      await refreshWorkspaceData()
      showBanner('Project updated.', 'info')
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleUpdateTag = useCallback(
    async (tagIdToUpdate: number, payload: { name?: string; color?: string }) => {
      await window.taskAppApi.updateTag(tagIdToUpdate, payload)
      await refreshWorkspaceData()
      showBanner('Tag updated.', 'info')
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleUpdateCategory = useCallback(
    async (categoryIdToUpdate: number, payload: { name?: string; color?: string }) => {
      await window.taskAppApi.updateCategory(categoryIdToUpdate, payload)
      await refreshWorkspaceData()
      showBanner('Category updated.', 'info')
    },
    [refreshWorkspaceData, showBanner],
  )

  const handleExportData = useCallback(async () => {
    setIsDataOperationLoading(true)
    try {
      const result = await window.taskAppApi.exportData()
      if (result.success) {
        showBanner(`Export successful: ${result.taskCount} tasks backed up.`, 'info')
      } else if (result.error) {
        showBanner(`Export failed: ${result.error}`, 'error')
      }
    } catch {
      showBanner('Unable to export data.', 'error')
    } finally {
      setIsDataOperationLoading(false)
    }
  }, [showBanner])

  const handleImportData = useCallback(async () => {
    const confirmed = window.confirm(
      'Importing data will overwrite existing records with matching IDs. Continue?',
    )
    if (!confirmed) return

    setIsDataOperationLoading(true)
    try {
      const result = await window.taskAppApi.importData()
      if (result.success) {
        await refreshWorkspaceData()
        showBanner(`Import successful: ${result.totalRecords} records imported (${result.taskCount} tasks).`, 'info')
      } else if (result.error) {
        showBanner(`Import failed: ${result.error}`, 'error')
      }
    } catch {
      showBanner('Unable to import data.', 'error')
    } finally {
      setIsDataOperationLoading(false)
    }
  }, [refreshWorkspaceData, showBanner])

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
    <div className={presentationMode ? 'app-root presentation-mode' : 'app-root'}>
    <main className={[
      'trip-layout',
      detailsOpen ? 'sidebar-open' : '',
      isSideMenuVisible ? '' : 'side-menu-hidden',
    ].filter(Boolean).join(' ')}>
      {isSideMenuVisible && (
        <SideMenu
          viewType={viewType}
          projects={projects}
          tags={tags}
          categories={categories}
          showCompletedTasks={showCompletedTasks}
          showTrackingTasks={showTrackingTasks}
          selectedProjectId={projectId}
          selectedTagId={tagId}
          selectedCategoryId={categoryId}
          isDataOperationLoading={isDataOperationLoading}
          onChangeView={setViewType}
          onToggleCompletedTasks={setShowCompletedTasks}
          onToggleTrackingTasks={setShowTrackingTasks}
          onSelectProject={setProjectId}
          onSelectTag={setTagId}
          onSelectCategory={setCategoryId}
          onOpenProjectCreateView={() => setViewType('create-project')}
          onOpenTagCreateView={() => setViewType('create-tag')}
          onOpenCategoryCreateView={() => setViewType('create-category')}
          onDeleteProject={handleDeleteProject}
          onDeleteTag={handleDeleteTag}
          onDeleteCategory={handleDeleteCategory}
          onUpdateProject={handleUpdateProject}
          onUpdateTag={handleUpdateTag}
          onUpdateCategory={handleUpdateCategory}
          onExportData={handleExportData}
          onImportData={handleImportData}
          onHide={() => setIsSideMenuVisible(false)}
          onClearFilters={() => { setProjectId(null); setTagId(null); setCategoryId(null) }}
        />
      )}

      <section className="main-canvas" aria-live="polite">
        {isDataOperationLoading && (
          <div className="data-operation-overlay">
            <div className="data-operation-spinner" />
            <span>Processing data...</span>
          </div>
        )}
        <header className="canvas-head">
          <div>
            <p className="eyebrow">View Manager</p>
            <h1>Personal Task Management</h1>
          </div>
          <button
            type="button"
            className="side-menu-toggle"
            onClick={() => setIsSideMenuVisible((value) => !value)}
          >
            {isSideMenuVisible ? 'Hide menu' : 'Show menu'}
          </button>
        </header>

        {loading && <p>Loading workspace data...</p>}
        {!loading && (
          <ViewManager
            viewType={viewType}
            tasks={displayedTasks}
            lastCreatedTaskId={lastCreatedTaskId}
            projects={projects}
            categories={categories}
            tags={tags}
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
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onShiftTasks={handleShiftTasks}
            presentationMode={presentationMode}
            onTogglePresentationMode={() => setPresentationMode((value) => !value)}
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
        onSelectTask={handleSelectTask}
        onClose={handleClearDetailsView}
      />
    </main>
    <AppBanner message={banner} onDismiss={dismissBanner} />
    </div>
  )
}

export default App
