import { Fragment, useState } from 'react'
import type { TaskWithRelations } from '../../common/types'
import { buildTaskTree, groupTasks, type GroupBy, type TaskNode } from '../utils/taskGrouping'

interface TodayViewProps {
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
}

function TodayView({ tasks, onSelectTask, selectedTaskId }: TodayViewProps) {
  const today = new Date().toISOString().slice(0, 10)
  const activeTasks = tasks.filter((task) => task.type !== 'goal')
  const overdue = activeTasks.filter((task) => task.status !== 'done' && !!task.end_date && task.end_date < today)
  const dueToday = activeTasks.filter((task) => task.status !== 'done' && task.end_date === today)

  const [groupBy, setGroupBy] = useState<GroupBy>('status')

  // Group due today tasks according to the selected grouping (default: status)
  const dueTodayTree = buildTaskTree(dueToday)
  const groupedDueToday = groupTasks(dueTodayTree, groupBy)

  return (
    <section className="view-card">
      <header className="view-head">
        <h2>Today</h2>
        <p>Your immediate focus: due today and overdue tasks.</p>
      </header>

      <div className="today-grid">
        <article className="today-column">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Due Today</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label htmlFor="today-group-by" style={{ fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Group:</label>
              <select
                id="today-group-by"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                style={{ minWidth: 140, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.25rem 0.5rem', background: '#fff' }}
              >
                <option value="status">Status</option>
                <option value="category">Category</option>
                <option value="project">Project</option>
                <option value="priority">Priority</option>
              </select>
            </div>
          </div>

          {dueToday.length === 0 && <p className="muted">No tasks due today.</p>}
          {groupedDueToday.map((section) => (
            <Fragment key={`${section.groupBy}-${section.groupLabel}`}>
              {groupedDueToday.length > 1 && (
                <div className="group-label" style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                  <small style={{ color: '#64748b', fontWeight: 500 }}>{section.groupTitle}</small>
                </div>
              )}
              {section.nodes.flatMap((node) => renderTaskPill(node, selectedTaskId, onSelectTask))}
            </Fragment>
          ))}
        </article>

        {overdue.length > 0 && (
          <article className="today-column overdue">
            <h3>Overdue</h3>
            {overdue.map((task) => (
              <button
                key={task.id}
                type="button"
                data-details-trigger="open"
                className={selectedTaskId === task.id ? 'task-pill active' : 'task-pill'}
                onClick={() => onSelectTask(task.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <strong>{task.title}</strong>
                  {task.recurrence !== 'none' && (
                    <span title={`Recurring: ${task.recurrence}`}>🔄</span>
                  )}
                </div>
                <span>Due: {task.end_date}</span>
              </button>
            ))}
          </article>
        )}
      </div>
    </section>
  )
}

function renderTaskPill(node: TaskNode, selectedTaskId: number | null, onSelectTask: (taskId: number) => void) {
  const { task, children } = node

  return [
    <button
      key={task.id}
      type="button"
      data-details-trigger="open"
      className={selectedTaskId === task.id ? 'task-pill active' : 'task-pill'}
      onClick={() => onSelectTask(task.id)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <strong>{task.title}</strong>
        {task.recurrence !== 'none' && (
          <span title={`Recurring: ${task.recurrence}`}>🔄</span>
        )}
      </div>
      <span>{task.project_name ?? 'No project'}</span>
    </button>,
    ...children.flatMap((child: TaskNode) => renderTaskPill(child, selectedTaskId, onSelectTask)),
  ]
}

export default TodayView

