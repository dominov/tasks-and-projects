import type { TaskWithRelations } from '../../common/types'
import TaskTable from '../components/TaskTable'

interface TableViewProps {
  title?: string
  description?: string
  createType?: 'task' | 'goal'
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  onCreateTask: (title: string, type?: 'task' | 'goal') => Promise<void>
  onCreateGoalSubtask?: (goalId: number, title: string) => Promise<void>
}

function TableView({
  title = 'My Tasks',
  description = 'Table view for all tasks in your current context.',
  createType = 'task',
  tasks,
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
