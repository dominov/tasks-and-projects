import { useMemo, useState } from 'react'
import type { Category, Project, Tag, TaskUpdatePayload, TaskWithRelations } from '../../common/types'
import TaskTable from '../components/TaskTable'
import type { QuickCreateOptions } from '../components/ViewManager'

type CompletionWindow = '7' | '15' | '30'

interface CompletedViewProps {
  tasks: TaskWithRelations[]
  projects: Project[]
  categories: Category[]
  tags: Tag[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  /**
   * Provided by the parent so the read-only `TaskTable` keeps the same prop
   * surface, even though task creation is disabled in this view.
   */
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<number | null>
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  onDeleteTask: (taskId: number) => Promise<void>
}

const WINDOW_OPTIONS: Array<{ value: CompletionWindow; label: string; days: number }> = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '15', label: 'Last 15 days', days: 15 },
  { value: '30', label: 'Last month', days: 30 },
]

/**
 * Read-only view that mirrors the "My Tasks" table but is restricted to
 * completed (`status === 'done'`) tasks within a configurable completion
 * window. Defaults to the last 7 days.
 */
function CompletedView({
  tasks,
  projects,
  categories,
  tags,
  onSelectTask,
  selectedTaskId,
  projectId,
  categoryId,
  tagId,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}: CompletedViewProps) {
  const [completionWindow, setCompletionWindow] = useState<CompletionWindow>('7')

  const completedTasks = useMemo<TaskWithRelations[]>(() => {
    const days = WINDOW_OPTIONS.find((option) => option.value === completionWindow)?.days ?? 7
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - days)

    const taskById = new Map<number, TaskWithRelations>()
    for (const task of tasks) {
      taskById.set(task.id, task)
    }

    const isWithinWindow = (task: TaskWithRelations): boolean => {
      if (task.status !== 'done') {
        return false
      }

      // Fall back to end_date for legacy rows where completed_at was never set.
      const completionIso = task.completed_at ?? task.end_date

      if (!completionIso) {
        return false
      }

      const completionDate = new Date(completionIso)

      if (Number.isNaN(completionDate.getTime())) {
        return false
      }

      return completionDate.getTime() >= cutoff.getTime()
    }

    // 1. Direct hits: tasks and goals completed within the window.
    const includedIds = new Set<number>()
    for (const task of tasks) {
      if (isWithinWindow(task)) {
        includedIds.add(task.id)
      }
    }

    // 2. Pull in the full ancestor chain (so the parent goal renders as a
    //    header even when only one of its subtasks is in the window) AND any
    //    descendants of completed goals (so a completed goal always shows the
    //    breakdown of its subtasks below it).
    const visited = new Set<number>()
    const queue: number[] = Array.from(includedIds)

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (currentId === undefined || visited.has(currentId)) {
        continue
      }
      visited.add(currentId)

      const current = taskById.get(currentId)
      if (!current) {
        continue
      }

      // Walk up to the root so the hierarchy is intact.
      if (current.parent_task_id !== null && !includedIds.has(current.parent_task_id)) {
        includedIds.add(current.parent_task_id)
        queue.push(current.parent_task_id)
      }

      // For completed goals, surface their subtasks even if those subtasks
      // were not closed inside the window — the user wants to see what was
      // inside the goal.
      if (current.type === 'goal') {
        for (const candidate of tasks) {
          if (candidate.parent_task_id === current.id && !includedIds.has(candidate.id)) {
            includedIds.add(candidate.id)
            queue.push(candidate.id)
          }
        }
      }
    }

    return tasks.filter((task) => includedIds.has(task.id))
  }, [tasks, completionWindow])

  return (
    <section className="view-card">
      <header className="view-head">
        <h2>Completed</h2>
        <p>Tasks marked as done within the selected window. Read-only — task creation is disabled.</p>
      </header>

      <div className="table-toolbar" style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="completed-window-select">Completed within:</label>
        <select
          id="completed-window-select"
          value={completionWindow}
          onChange={(event) => setCompletionWindow(event.target.value as CompletionWindow)}
        >
          {WINDOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <TaskTable
        tasks={completedTasks}
        lastCreatedTaskId={null}
        projects={projects}
        categories={categories}
        tags={tags}
        onSelectTask={onSelectTask}
        selectedTaskId={selectedTaskId}
        projectId={projectId}
        categoryId={categoryId}
        tagId={tagId}
        createType="goal"
        onCreateTask={onCreateTask}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        readOnly
      />
    </section>
  )
}

export default CompletedView
