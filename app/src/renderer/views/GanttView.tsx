import type { TaskWithRelations } from '../../common/types'

interface GanttViewProps {
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
}

function GanttView({ tasks, onSelectTask, selectedTaskId }: GanttViewProps) {
  return (
    <section className="view-card">
      <header className="view-head">
        <h2>Gantt</h2>
        <p>Lazy-loaded timeline scaffold ready for dependency and shifting logic.</p>
      </header>
      <div className="placeholder-grid">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            className={selectedTaskId === task.id ? 'task-pill active' : 'task-pill'}
            onClick={() => onSelectTask(task.id)}
          >
            <strong>{task.title}</strong>
            <span>{task.end_date ?? 'No due date'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default GanttView
