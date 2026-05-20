import type { TaskWithRelations } from '../../common/types'

interface CalendarViewProps {
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
}

function CalendarView({ tasks, onSelectTask, selectedTaskId }: CalendarViewProps) {
  return (
    <section className="view-card">
      <header className="view-head">
        <h2>Calendar</h2>
        <p>Lazy-loaded view scaffold ready for drag and drop scheduling.</p>
      </header>
      <div className="placeholder-grid">
        {tasks.slice(0, 8).map((task) => (
          <button
            key={task.id}
            type="button"
            className={selectedTaskId === task.id ? 'task-pill active' : 'task-pill'}
            onClick={() => onSelectTask(task.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <strong>{task.title}</strong>
              {task.recurrence !== 'none' && (
                <span title={`Recurring: ${task.recurrence}`}>🔄</span>
              )}
            </div>
            <span>{task.start_date ?? 'No start'} - {task.end_date ?? 'No end'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default CalendarView
