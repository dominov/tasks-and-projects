import type { TaskWithRelations } from '../../common/types'

interface TodayViewProps {
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
}

function TodayView({ tasks, onSelectTask, selectedTaskId }: TodayViewProps) {
  const today = new Date().toISOString().slice(0, 10)
  const overdue = tasks.filter((task) => task.status !== 'done' && !!task.end_date && task.end_date < today)
  const dueToday = tasks.filter((task) => task.status !== 'done' && task.end_date === today)

  return (
    <section className="view-card">
      <header className="view-head">
        <h2>Today</h2>
        <p>Your immediate focus: due today and overdue tasks.</p>
      </header>

      <div className="today-grid">
        <article className="today-column">
          <h3>Due Today</h3>
          {dueToday.length === 0 && <p className="muted">No tasks due today.</p>}
          {dueToday.map((task) => (
            <button
              key={task.id}
              type="button"
              data-details-trigger="open"
              className={selectedTaskId === task.id ? 'task-pill active' : 'task-pill'}
              onClick={() => onSelectTask(task.id)}
            >
              <strong>{task.title}</strong>
              <span>{task.project_name ?? 'No project'}</span>
            </button>
          ))}
        </article>

        <article className="today-column overdue">
          <h3>Overdue</h3>
          {overdue.length === 0 && <p className="muted">No overdue tasks.</p>}
          {overdue.map((task) => (
            <button
              key={task.id}
              type="button"
              data-details-trigger="open"
              className={selectedTaskId === task.id ? 'task-pill active' : 'task-pill'}
              onClick={() => onSelectTask(task.id)}
            >
              <strong>{task.title}</strong>
              <span>Due: {task.end_date}</span>
            </button>
          ))}
        </article>
      </div>
    </section>
  )
}

export default TodayView
