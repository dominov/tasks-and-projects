import { Suspense, lazy } from 'react'
import type { TaskWithRelations } from '../../common/types'
import TableView from '../views/TableView'
import TodayView from '../views/TodayView'
import CreateCategoryView from '../views/CreateCategoryView'
import CreateProjectView from '../views/CreateProjectView'
import CreateTagView from '../views/CreateTagView'

export type ViewType = 'tasks' | 'today' | 'calendar' | 'gantt' | 'create-project' | 'create-tag' | 'create-category'

interface ViewManagerProps {
  viewType: ViewType
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  onCreateTask: (title: string) => Promise<void>
  onCreateProject: (name: string, color: string) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
  onCreateCategory: (name: string) => Promise<void>
}

const CalendarView = lazy(() => import('../views/CalendarView'))
const GanttView = lazy(() => import('../views/GanttView'))

function ViewManager({
  viewType,
  tasks,
  onSelectTask,
  selectedTaskId,
  projectId,
  categoryId,
  tagId,
  onCreateTask,
  onCreateProject,
  onCreateTag,
  onCreateCategory,
}: ViewManagerProps) {
  if (viewType === 'tasks') {
    return (
      <TableView
        tasks={tasks}
        onSelectTask={onSelectTask}
        selectedTaskId={selectedTaskId}
        projectId={projectId}
        categoryId={categoryId}
        tagId={tagId}
        onCreateTask={onCreateTask}
      />
    )
  }

  if (viewType === 'today') {
    return <TodayView tasks={tasks} onSelectTask={onSelectTask} selectedTaskId={selectedTaskId} />
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
        <CalendarView tasks={tasks} onSelectTask={onSelectTask} selectedTaskId={selectedTaskId} />
      ) : (
        <GanttView tasks={tasks} onSelectTask={onSelectTask} selectedTaskId={selectedTaskId} />
      )}
    </Suspense>
  )
}

export default ViewManager
