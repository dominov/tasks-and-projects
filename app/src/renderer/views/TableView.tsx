import type { Project, TaskWithRelations } from '../../common/types'
import TaskTable from '../components/TaskTable'
import type { QuickCreateOptions } from '../components/ViewManager'

interface TableViewProps {
  title?: string
  description?: string
  createType?: 'task' | 'goal'
  tasks: TaskWithRelations[]
  projects: Project[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<void>
  onCreateGoalSubtask?: (goalId: number, title: string) => Promise<void>
}

function TableView({
  title = 'My Tasks',
  description = 'Table view for all tasks in your current context.',
  createType = 'task',
  tasks,
  projects,
  onSelectTask,
  selectedTaskId,
  projectId,
  categoryId,
  tagId,
  onCreateTask,
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
        projects={projects}
        onSelectTask={onSelectTask}
        selectedTaskId={selectedTaskId}
        projectId={projectId}
        categoryId={categoryId}
        tagId={tagId}
        createType={createType}
        onCreateTask={onCreateTask}
        onCreateGoalSubtask={onCreateGoalSubtask}
      />
    </section>
  )
}

export default TableView
