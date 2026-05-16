import type { TaskWithRelations } from '../../common/types'
import TaskTable from '../components/TaskTable'

interface TableViewProps {
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  onCreateTask: (title: string) => Promise<void>
}

function TableView({ tasks, onSelectTask, selectedTaskId, projectId, categoryId, tagId, onCreateTask }: TableViewProps) {
  return (
    <section className="view-card">
      <header className="view-head">
        <h2>My Tasks</h2>
        <p>Table view for all tasks in your current context.</p>
      </header>
      <TaskTable
        tasks={tasks}
        onSelectTask={onSelectTask}
        selectedTaskId={selectedTaskId}
        projectId={projectId}
        categoryId={categoryId}
        tagId={tagId}
        onCreateTask={onCreateTask}
      />
    </section>
  )
}

export default TableView
