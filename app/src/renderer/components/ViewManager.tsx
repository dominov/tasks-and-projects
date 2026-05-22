import { Suspense, lazy } from 'react'
import type { Project, TaskUpdatePayload, TaskWithRelations } from '../../common/types'
import TableView from '../views/TableView'
import FocusView from '../views/FocusView'
import CreateCategoryView from '../views/CreateCategoryView'
import CreateProjectView from '../views/CreateProjectView'
import CreateTagView from '../views/CreateTagView'

export type ViewType =
  | 'tasks'
  | 'goals'
  | 'focus'
  | 'calendar'
  | 'gantt'
  | 'create-project'
  | 'create-tag'
  | 'create-category'

export interface QuickCreateOptions {
  startDate?: string | null
  endDate?: string | null
  priority?: 1 | 2 | 3
  projectId?: number | null
}

interface ViewManagerProps {
  viewType: ViewType
  tasks: TaskWithRelations[]
  projects: Project[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<void>
  onCreateGoalSubtask: (goalId: number, title: string) => Promise<void>
  onCreateProject: (name: string, color: string) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
  onCreateCategory: (name: string) => Promise<void>
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  presentationMode: boolean
  onTogglePresentationMode: () => void
}

const CalendarView = lazy(() => import('../views/CalendarView'))
const GanttView = lazy(() => import('../views/GanttView'))

function ViewManager({
  viewType,
  tasks,
  projects,
  onSelectTask,
  selectedTaskId,
  projectId,
  categoryId,
  tagId,
  onCreateTask,
  onCreateGoalSubtask,
  onCreateProject,
  onCreateTag,
  onCreateCategory,
  onUpdateTask,
  presentationMode,
  onTogglePresentationMode,
}: ViewManagerProps) {
  const objectiveTasks = getObjectiveScopedTasks(tasks)

  if (viewType === 'tasks') {
    return (
      <TableView
        tasks={tasks.filter((task) => task.type !== 'goal')}
        projects={projects}
        onSelectTask={onSelectTask}
        selectedTaskId={selectedTaskId}
        projectId={projectId}
        categoryId={categoryId}
        tagId={tagId}
        onCreateTask={onCreateTask}
      />
    )
  }

  if (viewType === 'goals') {
    return (
      <TableView
        title="Goals"
        description="Objectives and tasks linked to each objective."
        createType="goal"
        tasks={objectiveTasks}
        projects={projects}
        onSelectTask={onSelectTask}
        selectedTaskId={selectedTaskId}
        projectId={projectId}
        categoryId={categoryId}
        tagId={tagId}
        onCreateTask={onCreateTask}
        onCreateGoalSubtask={onCreateGoalSubtask}
      />
    )
  }


  if (viewType === 'focus') {
    return <FocusView tasks={tasks} projects={projects} onSelectTask={onSelectTask} selectedTaskId={selectedTaskId} />
  }

  if (viewType === 'create-project') {
    return <CreateProjectView onCreateProject={onCreateProject} />
  }

  if (viewType === 'create-tag') {
    return <CreateTagView onCreateTag={onCreateTag} />
  }

  if (viewType === 'create-category') {
    return <CreateCategoryView onCreateCategory={onCreateCategory} />
  }

  return (
    <Suspense fallback={<p>Loading view...</p>}>
      {viewType === 'calendar' ? (
        <CalendarView
          tasks={tasks}
          onSelectTask={onSelectTask}
          selectedTaskId={selectedTaskId}
          onCreateTask={onCreateTask}
          projectId={projectId}
        />
      ) : (
        <GanttView
          tasks={tasks}
          projects={projects}
          onSelectTask={onSelectTask}
          selectedTaskId={selectedTaskId}
          onUpdateTask={onUpdateTask}
          presentationMode={presentationMode}
          onTogglePresentationMode={onTogglePresentationMode}
        />
      )}
    </Suspense>
  )
}

function getObjectiveScopedTasks(tasks: TaskWithRelations[]): TaskWithRelations[] {
  const byId = new Map<number, TaskWithRelations>()
  const childrenByParent = new Map<number, TaskWithRelations[]>()
  const objectiveIds = new Set<number>()
  const visibleIds = new Set<number>()

  for (const task of tasks) {
    byId.set(task.id, task)

    if (task.type === 'goal') {
      objectiveIds.add(task.id)
      visibleIds.add(task.id)
    }
  }

  for (const task of tasks) {
    if (task.parent_task_id === null) {
      continue
    }

    const siblings = childrenByParent.get(task.parent_task_id) ?? []
    siblings.push(task)
    childrenByParent.set(task.parent_task_id, siblings)
  }

  const queue = [...objectiveIds]

  while (queue.length > 0) {
    const parentId = queue.shift()

    if (parentId === undefined) {
      continue
    }

    const children = childrenByParent.get(parentId) ?? []

    for (const child of children) {
      if (visibleIds.has(child.id)) {
        continue
      }

      visibleIds.add(child.id)
      queue.push(child.id)
    }
  }

  return tasks.filter((task) => visibleIds.has(task.id) && (task.type === 'goal' || task.parent_task_id !== null))
}

export default ViewManager
