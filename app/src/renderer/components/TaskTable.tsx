import { Fragment, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from 'react'
import type { Project, TaskWithRelations } from '../../common/types'
import type { QuickCreateOptions } from './ViewManager'
import { buildTaskTree, groupTasks, type GroupBy, type TaskNode } from '../utils/taskGrouping'
import { format, isToday, isTomorrow, isThisWeek } from 'date-fns';

type SortField = 'title' | 'project' | 'category' | 'priority' | 'story_points' | 'status' | 'end_date'
type TableGroupBy = GroupBy | 'none'

interface TaskTableProps {
  tasks: TaskWithRelations[]
  projects: Project[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  createType: 'task' | 'goal'
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<void>
  onCreateGoalSubtask?: (goalId: number, title: string) => Promise<void>
}

function TaskTable({
  tasks,
  projects,
  onSelectTask,
  selectedTaskId,
  projectId,
  createType,
  onCreateTask,
  onCreateGoalSubtask,
}: TaskTableProps) {
  const isGoalView = createType === 'goal'
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [groupBy, setGroupBy] = useState<TableGroupBy>('none')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [quickDueDate, setQuickDueDate] = useState('')
  const [quickPriority, setQuickPriority] = useState<'' | '1' | '2' | '3'>('')
  const [quickProjectId, setQuickProjectId] = useState('')
  const [goalSubtaskTitles, setGoalSubtaskTitles] = useState<Record<number, string>>({})
  const [creatingGoalSubtaskId, setCreatingGoalSubtaskId] = useState<number | null>(null)

  function handleSortClick(field: SortField): void {
    if (sortField === field) {
      setSortAsc((prev) => !prev)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const sortedTasks = getSortedTasks(tasks, sortField, sortAsc)
  const taskTree = buildTaskTree(sortedTasks)
  const groupedTaskTree = groupBy === 'none' ? [] : groupTasks(taskTree, groupBy)

  const groupOptions: Array<{ value: TableGroupBy; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'category', label: 'Category' },
    { value: 'project', label: 'Project' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
  ]

  async function handleCreateNewTask(): Promise<void> {
    if (!newTaskTitle.trim()) {
      return
    }

    setCreatingTask(true)

    try {
      await onCreateTask(newTaskTitle.trim(), createType, {
        endDate: isGoalView ? undefined : quickDueDate || null,
        priority: isGoalView ? undefined : quickPriority ? (Number(quickPriority) as 1 | 2 | 3) : undefined,
        projectId:
          quickProjectId === ''
            ? projectId
            : quickProjectId === 'none'
              ? null
              : Number(quickProjectId),
      })

      setNewTaskTitle('')
      setQuickDueDate('')
      setQuickPriority('')
      setQuickProjectId('')
    } finally {
      setCreatingTask(false)
    }
  }

  async function handleCreateGoalSubtask(goalId: number): Promise<void> {
    if (!onCreateGoalSubtask) {
      return
    }

    const title = (goalSubtaskTitles[goalId] ?? '').trim()

    if (!title) {
      return
    }

    setCreatingGoalSubtaskId(goalId)

    try {
      await onCreateGoalSubtask(goalId, title)
      setGoalSubtaskTitles((current) => ({ ...current, [goalId]: '' }))
    } finally {
      setCreatingGoalSubtaskId(null)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      void handleCreateNewTask()
    }
  }

  return (
    <div className="table-wrap">
      <div className={`quick-add-toolbar ${isGoalView ? 'quick-add-toolbar--goal' : ''}`}>
        <input
          type="text"
          className="quick-add-input"
          placeholder={createType === 'goal' ? 'Title (new goal)...' : 'Title (new task)...'}
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={creatingTask}
        />
        {!isGoalView && (
          <>
            <input
              type="date"
              className="quick-add-date"
              placeholder="Due date"
              value={quickDueDate}
              onChange={(event) => setQuickDueDate(event.target.value)}
              disabled={creatingTask}
            />
            <select
              className="quick-add-select"
              value={quickPriority}
              onChange={(event) => setQuickPriority(event.target.value as '' | '1' | '2' | '3')}
              disabled={creatingTask}
            >
              <option value="">Priority...</option>
              <option value="1">Low</option>
              <option value="2">Medium</option>
              <option value="3">High</option>
            </select>
          </>
        )}
        <select
          className="quick-add-select"
          value={quickProjectId}
          onChange={(event) => setQuickProjectId(event.target.value)}
          disabled={creatingTask}
        >
          <option value="">Project...</option>
          <option value="none">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="new-task-add"
          onClick={() => void handleCreateNewTask()}
          disabled={!newTaskTitle.trim() || creatingTask}
        >
          Create
        </button>
      </div>

      <div className="table-toolbar">
        <label htmlFor="group-by-select">Group by:</label>
        <select id="group-by-select" value={groupBy} onChange={(event) => setGroupBy(event.target.value as TableGroupBy)}>
          {groupOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th className="sortable" onClick={() => handleSortClick('title')}>
              Title {sortField === 'title' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('end_date')}>
              End Date {sortField === 'end_date' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('priority')}>
              Priority {sortField === 'priority' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('project')}>
              Project {sortField === 'project' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('category')}>
              Category {sortField === 'category' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('story_points')}>
              Story Points {sortField === 'story_points' && (sortAsc ? '↑' : '↓')}
            </th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {groupBy === 'none'
            ? taskTree.flatMap((node) =>
                renderTaskRow(
                  node,
                  0,
                  selectedTaskId,
                  onSelectTask,
                  isGoalView,
                  createType === 'goal',
                  goalSubtaskTitles,
                  setGoalSubtaskTitles,
                  creatingGoalSubtaskId,
                  handleCreateGoalSubtask,
                ),
              )
            : groupedTaskTree.map((section) => (
                <Fragment key={`${section.groupBy}-${section.groupLabel}`}>
                  <tr className={getGroupRowClassName(section.groupBy, section.groupLabel)}>
                    <td colSpan={7}>
                      <strong>{section.groupTitle}</strong>
                    </td>
                  </tr>
                  {section.nodes.flatMap((node) =>
                    renderTaskRow(
                      node,
                      0,
                      selectedTaskId,
                      onSelectTask,
                      isGoalView,
                      createType === 'goal',
                      goalSubtaskTitles,
                      setGoalSubtaskTitles,
                      creatingGoalSubtaskId,
                      handleCreateGoalSubtask,
                    ),
                  )}
                </Fragment>
              ))}
        </tbody>
      </table>
    </div>
  )
}

function renderTaskRow(
  node: TaskNode,
  depth: number,
  selectedTaskId: number | null,
  onSelectTask: (taskId: number) => void,
  isGoalView: boolean,
  showGoalCreateField: boolean,
  goalSubtaskTitles: Record<number, string>,
  setGoalSubtaskTitles: Dispatch<SetStateAction<Record<number, string>>>,
  creatingGoalSubtaskId: number | null,
  onCreateGoalSubtask: (goalId: number) => Promise<void>,
): ReactNode[] {
  const { task, children } = node;
  const isSubtask = depth > 0;
  const canCreateUnderGoal = showGoalCreateField && task.type === 'goal'
  const goalSubtaskTitle = goalSubtaskTitles[task.id] ?? ''
  // Calculate progress for GOALs (only for parent, not subtasks)
  let goalProgress: null | { percent: number; completed: number; total: number } = null
  if (task.type === 'goal' && !isSubtask && children.length > 0) {
    const total = children.length
    const completed = children.filter((c) => c.task.status === 'done').length
    const percent = Math.round((completed / total) * 100)
    goalProgress = { percent, completed, total }
  }

  // isGoalView is now passed as an argument

  const mainRow = (
    <tr
      key={task.id}
      data-details-trigger="open"
      className={
        selectedTaskId === task.id
          ? `row-selected ${isSubtask ? 'task-row--subtask' : ''}`
          : isSubtask
            ? 'task-row--subtask'
            : undefined
      }
      onClick={() => onSelectTask(task.id)}
    >
      <td className={isSubtask ? 'task-title-cell task-title-cell--subtask' : 'task-title-cell'}>
        {/* Status icon to the left of the title (hidden for GOAL parent rows in GOAL view) */}
        {!(isGoalView && task.type === 'goal' && !isSubtask) && (
          <span className={getStatusIndicatorClassName(task.status)} title={task.status}>
            {task.status === 'done' ? '✓' : ''}
          </span>
        )}
        {/* Recurring or Goal icon to the left of the title */}
        {task.type === 'goal' && (
          <span className="goal-icon" title="Goal" style={{ marginRight: '0.3rem', fontSize: '1.1em' }}>🎯</span>
        )}
        {task.recurrence !== 'none' && (
          <span className="recurrence-icon" title={`Recurring: ${task.recurrence}`} style={{ marginRight: '0.3rem', fontSize: '1.1em' }}>
            🔄
          </span>
        )}
        {isSubtask && <span className="task-subtask-marker" aria-hidden="true">↳</span>}
        {/* GOAL title as headline in GOAL view */}
        {isGoalView && task.type === 'goal' && !isSubtask ? (
          <span className="goal-title-headline">{task.title}</span>
        ) : (
          <span className="task-title-text">{task.title}</span>
        )}
        {/* Progress for GOALs in GOAL view */}
        {isGoalView && goalProgress && (
          <span className="goal-progress">{` (${goalProgress.percent}% - ${goalProgress.completed}/${goalProgress.total})`}</span>
        )}
      </td>
      <td>{isGoalView && task.type === 'goal' ? '-' : formatDate(task.end_date)}</td>
      <td>
        <span className={getPriorityClassName(task.priority)}>
          {task.priority === 1 ? 'Low' : task.priority === 2 ? 'Medium' : 'High'}
        </span>
      </td>
      <td>
        <span className={getProjectBadgeClassName(task.project_id)}>{task.project_name ?? '-'}</span>
      </td>
      <td>{task.category_name ?? '-'}</td>
      <td>{task.story_points}</td>
      <td>
        {/* Render tags as plain text, comma separated, no circles */}
        {task.tag_names
          ? task.tag_names
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
              .map((tag, i, arr) => (
                <span key={tag} className="task-tag-text">
                  #{tag}
                  {i < arr.length - 1 ? ', ' : ''}
                </span>
              ))
          : '-'}
      </td>
    </tr>
  )

  // Render children (subtasks)
  const childRows = children.flatMap((child) =>
    renderTaskRow(
      child,
      depth + 1,
      selectedTaskId,
      onSelectTask,
        isGoalView,
      showGoalCreateField,
      goalSubtaskTitles,
      setGoalSubtaskTitles,
      creatingGoalSubtaskId,
      onCreateGoalSubtask,
    ),
  )

  // For goals, place subtask creation row after all subtasks
  let goalCreateRow: ReactNode[] = []
  if (canCreateUnderGoal) {
    goalCreateRow = [
      <tr key={`goal-create-${task.id}`} className="goal-subtask-create-row">
        <td colSpan={7}>
          <div className="goal-subtask-create-wrap">
            <input
              type="text"
              className="goal-subtask-input"
              placeholder="Create subtask for this goal..."
              value={goalSubtaskTitle}
              onChange={(event) =>
                setGoalSubtaskTitles((current) => ({ ...current, [task.id]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void onCreateGoalSubtask(task.id)
                }
              }}
              disabled={creatingGoalSubtaskId === task.id}
            />
            <button
              type="button"
              className="goal-subtask-add"
              onClick={() => void onCreateGoalSubtask(task.id)}
              disabled={!goalSubtaskTitle.trim() || creatingGoalSubtaskId === task.id}
            >
              ADD TASK
            </button>
          </div>
        </td>
      </tr>,
    ]
  }

  // Compose rows: main row, all children, then subtask creation row for goals
  return [mainRow, ...childRows, ...goalCreateRow]
}

function getGroupRowClassName(groupBy: GroupBy, groupLabel: string): string {
  if (groupBy !== 'category') {
    return 'group-row'
  }

  const normalized = groupLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `group-row group-row--category group-row--${normalized || 'uncategorized'}`
}

function getStatusIndicatorClassName(status: TaskWithRelations['status']): string {
  if (status === 'in_progress') {
    return 'status-dot status-dot--progress'
  }

  if (status === 'done') {
    return 'status-dot status-dot--done'
  }

  return 'status-dot status-dot--todo'
}

function getPriorityClassName(priority: number): string {
  if (priority === 3) {
    return 'priority-pill priority-pill--high'
  }

  if (priority === 1) {
    return 'priority-pill priority-pill--low'
  }

  return 'priority-pill priority-pill--medium'
}

function getProjectBadgeClassName(projectId: number | null): string {
  if (projectId === null) {
    return 'project-badge project-badge--none'
  }

  const tone = projectId % 6
  return `project-badge project-badge--tone-${tone}`
}

function getSortedTasks(tasks: TaskWithRelations[], field: SortField | null, ascending: boolean): TaskWithRelations[] {
  if (!field) {
    return tasks
  }

  const sorted = [...tasks].sort((a, b) => {
    let aVal: string | number = ''
    let bVal: string | number = ''

    switch (field) {
      case 'title':
        aVal = a.title
        bVal = b.title
        break
      case 'project':
        aVal = a.project_name ?? ''
        bVal = b.project_name ?? ''
        break
      case 'category':
        aVal = a.category_name ?? ''
        bVal = b.category_name ?? ''
        break
      case 'priority':
        aVal = a.priority
        bVal = b.priority
        break
      case 'story_points':
        aVal = a.story_points
        bVal = b.story_points
        break
      case 'status':
        aVal = a.status
        bVal = b.status
        break
      case 'end_date':
        aVal = a.end_date ?? ''
        bVal = b.end_date ?? ''
        break
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }

    return ascending ? (aVal > bVal ? 1 : -1) : (aVal > bVal ? -1 : 1)
  })

  return sorted
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isThisWeek(date)) return format(date, 'EEEE');

  return format(date, 'd MMM');
}

export default TaskTable
