import type { Category, Project, Tag, TaskUpdatePayload, TaskWithRelations } from '../../common/types'
import TaskTable from '../components/TaskTable'
import type { QuickCreateOptions } from '../components/ViewManager'

interface TableViewProps {
  title?: string
  description?: string
  createType?: 'task' | 'goal'
  tasks: TaskWithRelations[]
  lastCreatedTaskId: number | null
  projects: Project[]
  categories: Category[]
  tags: Tag[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<number | null>
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  onDeleteTask: (taskId: number) => Promise<void>
  onCreateGoalSubtask?: (goalId: number, title: string) => Promise<void>
}

function TableView({
  title = 'My Tasks',
  description = 'Table view for all tasks in your current context.',
  createType = 'task',
  tasks,
  lastCreatedTaskId,
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
  onCreateGoalSubtask,
}: TableViewProps) {
  return (
    <section className="view-card">
      <header className="view-head">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <TaskTable
        tasks={tasks}
        lastCreatedTaskId={lastCreatedTaskId}
        projects={projects}
        categories={categories}
        tags={tags}
        onSelectTask={onSelectTask}
        selectedTaskId={selectedTaskId}
        projectId={projectId}
        categoryId={categoryId}
        tagId={tagId}
        createType={createType}
        onCreateTask={onCreateTask}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onCreateGoalSubtask={onCreateGoalSubtask}
      />
    </section>
  )
}

export default TableView
