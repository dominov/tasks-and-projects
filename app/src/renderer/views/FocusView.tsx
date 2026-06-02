import { useMemo, useState } from 'react'
import { format, isToday, isTomorrow, isThisWeek } from 'date-fns'
import type { Project, TaskStatus, TaskUpdatePayload, TaskWithRelations } from '../../common/types'
import type { QuickCreateOptions } from '../components/ViewManager'

type SortBy = 'priority' | 'project' | 'story_points'

interface FocusViewProps {
  tasks: TaskWithRelations[]
  projects: Project[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<number | null>
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  projectId: number | null
}

const STATUS_FLOW: TaskStatus[] = ['todo', 'in_progress', 'done']

function formatCurrentDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getCategoryIcon(categoryName: string | null): string {
  if (!categoryName) return 'folder'
  const lower = categoryName.toLowerCase()
  if (lower.includes('report')) return 'bar-chart-3'
  if (lower.includes('develop') || lower.includes('dev')) return 'code-xml'
  if (lower.includes('design')) return 'palette'
  if (lower.includes('test')) return 'flask'
  if (lower.includes('doc')) return 'file-text'
  if (lower.includes('bug') || lower.includes('fix')) return 'bug'
  if (lower.includes('meeting') || lower.includes('sync')) return 'users'
  return 'folder'
}

function sortTasks(tasks: TaskWithRelations[], sortBy: SortBy): TaskWithRelations[] {
  return [...tasks].sort((a, b) => {
    if (sortBy === 'priority') return b.priority - a.priority
    if (sortBy === 'story_points') return b.story_points - a.story_points
    if (sortBy === 'project') {
      const pa = a.project_name ?? ''
      const pb = b.project_name ?? ''
      return pa.localeCompare(pb)
    }
    return 0
  })
}

function formatFriendlyDate(dateString: string | null): string {
  if (!dateString) return '-'

  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  if (isThisWeek(date)) return format(date, 'EEEE')

  return format(date, 'd MMM')
}

function FocusView({ tasks, projects, onSelectTask, selectedTaskId, onCreateTask, onUpdateTask, projectId }: FocusViewProps) {
  const [sortBy, setSortBy] = useState<SortBy>('priority')
  const [addingStatus, setAddingStatus] = useState<'todo' | 'in_progress' | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<number>>(new Set())
  const today = new Date().toISOString().slice(0, 10)

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.type !== 'goal' && !t.tracking_only),
    [tasks],
  )

  const todayTasks = useMemo(
    () => activeTasks.filter((t) => t.end_date === today),
    [activeTasks, today],
  )

  const overdueTasks = useMemo(
    () => activeTasks.filter((t) => t.status !== 'done' && !!t.end_date && t.end_date < today),
    [activeTasks, today],
  )

  const todoToday = useMemo(
    () => sortTasks(todayTasks.filter((t) => t.status === 'todo'), sortBy),
    [todayTasks, sortBy],
  )

  const inProgressToday = useMemo(
    () => sortTasks(todayTasks.filter((t) => t.status === 'in_progress'), sortBy),
    [todayTasks, sortBy],
  )

  const doneToday = useMemo(
    () => sortTasks(todayTasks.filter((t) => t.status === 'done'), sortBy),
    [todayTasks, sortBy],
  )

  const sortedOverdue = useMemo(
    () => sortTasks(overdueTasks, sortBy),
    [overdueTasks, sortBy],
  )

  const projectColorMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of projects) {
      map.set(p.id, p.color)
    }
    return map
  }, [projects])

  async function handleCreateFocusTask(status: 'todo' | 'in_progress'): Promise<void> {
    if (!newTaskTitle.trim()) {
      setAddingStatus(null)
      return
    }

    setCreatingTask(true)

    try {
      await onCreateTask(newTaskTitle.trim(), 'task', {
        startDate: today,
        endDate: today,
        projectId,
        status,
        priority: 1,
      })
      setNewTaskTitle('')
      setAddingStatus(null)
    } finally {
      setCreatingTask(false)
    }
  }

  function openAddTask(status: 'todo' | 'in_progress'): void {
    setAddingStatus(status)
    setNewTaskTitle('')
  }

  function getAdjacentStatus(currentStatus: TaskStatus, direction: 'prev' | 'next'): TaskStatus | null {
    const currentIndex = STATUS_FLOW.indexOf(currentStatus)

    if (currentIndex < 0) {
      return null
    }

    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (targetIndex < 0 || targetIndex >= STATUS_FLOW.length) {
      return null
    }

    return STATUS_FLOW[targetIndex]
  }

  function getStatusLabel(status: TaskStatus): string {
    if (status === 'todo') return 'To-do'
    if (status === 'in_progress') return 'In Progress'
    return 'Done'
  }

  async function handleMoveTaskStatus(task: TaskWithRelations, direction: 'prev' | 'next'): Promise<void> {
    const targetStatus = getAdjacentStatus(task.status, direction)

    if (!targetStatus || updatingTaskIds.has(task.id)) {
      return
    }

    setUpdatingTaskIds((current) => {
      const next = new Set(current)
      next.add(task.id)
      return next
    })

    try {
      await onUpdateTask(task.id, { status: targetStatus }, `Task moved to ${getStatusLabel(targetStatus)}.`)
    } finally {
      setUpdatingTaskIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
    }
  }

  return (
    <div className="focus-view">
      {/* Header */}
      <header className="focus-header">
        <div className="focus-header__left">
          <h1 className="focus-header__title">
            <ZapIcon />
            My Workday
          </h1>
          <p className="focus-header__date">{formatCurrentDate()}</p>
        </div>
        <div className="focus-header__right">
          <label className="focus-sort-label" htmlFor="focus-sort">Sort by</label>
          <select
            id="focus-sort"
            className="focus-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="priority">Priority</option>
            <option value="project">Project</option>
            <option value="story_points">Story Points</option>
          </select>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="focus-scroll">
        {/* BOX 1: Today's Priorities */}
        <section className="focus-box focus-box--today">
          <h2 className="focus-box__title">Priorities for Today</h2>
          <div className="focus-kanban">
            {/* In Progress */}
            <div className="focus-kanban__col">
              <div className="focus-kanban__col-header focus-kanban__col-header--progress">
                <ProgressIcon />
                <span>IN PROGRESS</span>
              </div>
              <div className="focus-kanban__col-body">
                {inProgressToday.length === 0 && <EmptyState text="Nothing running" />}
                {inProgressToday.map((task) => (
                  <FocusCard
                    key={task.id}
                    task={task}
                    selected={selectedTaskId === task.id}
                    projectColor={task.project_id ? projectColorMap.get(task.project_id) : undefined}
                    onSelect={onSelectTask}
                    showPulse
                    onMoveStatus={handleMoveTaskStatus}
                    statusUpdating={updatingTaskIds.has(task.id)}
                  />
                ))}
                <div className="focus-add-task-wrap">
                  {addingStatus === 'in_progress' ? (
                    <input
                      type="text"
                      autoFocus
                      className="add-task-input"
                      value={newTaskTitle}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      onBlur={() => {
                        if (!creatingTask) {
                          setAddingStatus(null)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleCreateFocusTask('in_progress')
                        }

                        if (event.key === 'Escape') {
                          setAddingStatus(null)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="add-task-btn"
                      onClick={() => openAddTask('in_progress')}
                    >
                      + Add task
                    </button>
                  )}
                </div>
              </div>
              <div className="focus-kanban__col-count">{inProgressToday.length}</div>
            </div>

            {/* To Do */}
            <div className="focus-kanban__col">
              <div className="focus-kanban__col-header">
                <CircleIcon />
                <span>TO DO</span>
              </div>
              <div className="focus-kanban__col-body">
                {todoToday.length === 0 && <EmptyState text="All clear" />}
                {todoToday.map((task) => (
                  <FocusCard
                    key={task.id}
                    task={task}
                    selected={selectedTaskId === task.id}
                    projectColor={task.project_id ? projectColorMap.get(task.project_id) : undefined}
                    onSelect={onSelectTask}
                    onMoveStatus={handleMoveTaskStatus}
                    statusUpdating={updatingTaskIds.has(task.id)}
                  />
                ))}
                <div className="focus-add-task-wrap">
                  {addingStatus === 'todo' ? (
                    <input
                      type="text"
                      autoFocus
                      className="add-task-input"
                      value={newTaskTitle}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      onBlur={() => {
                        if (!creatingTask) {
                          setAddingStatus(null)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleCreateFocusTask('todo')
                        }

                        if (event.key === 'Escape') {
                          setAddingStatus(null)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="add-task-btn"
                      onClick={() => openAddTask('todo')}
                    >
                      + Add task
                    </button>
                  )}
                </div>
              </div>
              <div className="focus-kanban__col-count">{todoToday.length}</div>
            </div>

            {/* Done */}
            <div className="focus-kanban__col">
              <div className="focus-kanban__col-header focus-kanban__col-header--done">
                <CheckIcon />
                <span>DONE</span>
              </div>
              <div className="focus-kanban__col-body">
                {doneToday.length === 0 && <EmptyState text="Complete tasks to see them here" />}
                {doneToday.map((task) => (
                  <FocusCard
                    key={task.id}
                    task={task}
                    selected={selectedTaskId === task.id}
                    projectColor={task.project_id ? projectColorMap.get(task.project_id) : undefined}
                    onSelect={onSelectTask}
                    onMoveStatus={handleMoveTaskStatus}
                    statusUpdating={updatingTaskIds.has(task.id)}
                  />
                ))}
              </div>
              <div className="focus-kanban__col-count">{doneToday.length}</div>
            </div>
          </div>
        </section>

        <div className="focus-secondary-grid">
          {/* BOX 2: Overdue */}
          {sortedOverdue.length > 0 && (
            <section className="focus-box focus-box--overdue">
              <h2 className="focus-box__title focus-box__title--overdue">
                <AlertIcon />
                Overdue Tasks
              </h2>
              <div className="focus-overdue-list">
                {sortedOverdue.map((task) => (
                  <FocusCard
                    key={task.id}
                    task={task}
                    selected={selectedTaskId === task.id}
                    projectColor={task.project_id ? projectColorMap.get(task.project_id) : undefined}
                    onSelect={onSelectTask}
                    overdue
                    onMoveStatus={handleMoveTaskStatus}
                    statusUpdating={updatingTaskIds.has(task.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Task Card ─────────────────────────────────────────────────── */

interface FocusCardProps {
  task: TaskWithRelations
  selected: boolean
  projectColor?: string
  onSelect: (taskId: number) => void
  onMoveStatus: (task: TaskWithRelations, direction: 'prev' | 'next') => Promise<void>
  statusUpdating: boolean
  overdue?: boolean
  showPulse?: boolean
}

function getPriorityTone(priority: number): 'low' | 'medium' | 'high' {
  if (priority === 3) {
    return 'high'
  }

  if (priority === 1) {
    return 'low'
  }

  return 'medium'
}

function FocusCard({ task, selected, projectColor, onSelect, onMoveStatus, statusUpdating, overdue, showPulse }: FocusCardProps) {
  const tags = task.tag_names ? task.tag_names.split(',').map((t) => t.trim()) : []
  const categoryIcon = getCategoryIcon(task.category_name)
  const canMovePrev = task.status !== 'todo'
  const canMoveNext = task.status !== 'done'
  const priorityTone = getPriorityTone(task.priority)

  return (
    <div
      role="button"
      tabIndex={0}
      data-details-trigger="open"
      className={[
        'focus-card',
        `weekly-task--priority-${priorityTone}`,
        selected && 'focus-card--selected',
        overdue && 'focus-card--overdue',
        showPulse && 'focus-card--pulse',
        statusUpdating && 'focus-card--status-updating',
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(task.id)
        }
      }}
      aria-busy={statusUpdating}
    >
      {canMovePrev && (
        <button
          type="button"
          className="focus-card__status-btn focus-card__status-btn--left"
          aria-label="Move task to previous status"
          onClick={(event) => {
            event.stopPropagation()
            void onMoveStatus(task, 'prev')
          }}
          disabled={statusUpdating}
        >
          <StatusArrowLeftIcon />
        </button>
      )}

      {canMoveNext && (
        <button
          type="button"
          className="focus-card__status-btn focus-card__status-btn--right"
          aria-label="Move task to next status"
          onClick={(event) => {
            event.stopPropagation()
            void onMoveStatus(task, 'next')
          }}
          disabled={statusUpdating}
        >
          <StatusArrowRightIcon />
        </button>
      )}

      {/* Top row: title + SP */}
      <div className="focus-card__top">
        <div className="focus-card__title-wrap">
          <span className="focus-card__title">{task.title}</span>
          {overdue && task.end_date && (
            <span className="focus-card__due-date">{formatFriendlyDate(task.end_date)}</span>
          )}
        </div>
        {task.story_points > 0 && (
          <span className="focus-card__sp">{task.story_points} SP</span>
        )}
      </div>

      {/* Footer: attributes */}
      <div className="focus-card__footer">
        {task.project_name && (
          <span
            className="focus-card__project"
            style={projectColor ? { background: projectColor, color: '#fff' } : undefined}
          >
            {task.project_name}
          </span>
        )}
        {task.category_name && (
          <span className="focus-card__category">
            <CategoryIconSvg name={categoryIcon} />
            {task.category_name}
          </span>
        )}
        {tags.map((tag) => (
          <span key={tag} className="focus-card__tag">#{tag}</span>
        ))}
      </div>
    </div>
  )
}

/* ─── Icons ─────────────────────────────────────────────────────── */

function ZapIcon() {
  return (
    <svg className="focus-icon focus-icon--zap" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function CircleIcon() {
  return (
    <svg className="focus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function ProgressIcon() {
  return (
    <svg className="focus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function StatusArrowLeftIcon() {
  return (
    <svg className="focus-icon focus-icon--small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function StatusArrowRightIcon() {
  return (
    <svg className="focus-icon focus-icon--small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="focus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function AlertIcon({ small }: { small?: boolean }) {
  return (
    <svg className={small ? 'focus-icon focus-icon--small' : 'focus-icon'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function CategoryIconSvg({ name }: { name: string }) {
  if (name === 'bar-chart-3') {
    return (
      <svg className="focus-icon focus-icon--small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    )
  }
  if (name === 'code-xml') {
    return (
      <svg className="focus-icon focus-icon--small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    )
  }
  if (name === 'palette') {
    return (
      <svg className="focus-icon focus-icon--small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    )
  }
  return (
    <svg className="focus-icon focus-icon--small" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="focus-empty">{text}</p>
}

export default FocusView
