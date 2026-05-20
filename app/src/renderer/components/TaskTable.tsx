import { Fragment, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from 'react'
import type { TaskWithRelations } from '../../common/types'
import { buildTaskTree, groupTasks, type GroupBy, type TaskNode } from '../utils/taskGrouping'

type SortField = 'title' | 'project' | 'category' | 'priority' | 'story_points' | 'status' | 'end_date'

interface TaskTableProps {
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  createType: 'task' | 'goal'
  onCreateTask: (title: string, type?: 'task' | 'goal') => Promise<void>
  onCreateGoalSubtask?: (goalId: number, title: string) => Promise<void>
}

function TaskTable({
  tasks,
  onSelectTask,
  selectedTaskId,
  projectId,
  categoryId,
  tagId,
  createType,
  onCreateTask,
  onCreateGoalSubtask,
}: TaskTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>('category')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
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
  const groupedTaskTree = groupTasks(taskTree, groupBy)

  const groupOptions: Array<{ value: GroupBy; label: string }> = [
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
      await onCreateTask(newTaskTitle.trim(), createType)
      setNewTaskTitle('')
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
      <div className="table-toolbar">
        <label htmlFor="group-by-select">Group by:</label>
        <select id="group-by-select" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
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
            <th className="sortable" onClick={() => handleSortClick('status')}>
              Status {sortField === 'status' && (sortAsc ? '↑' : '↓')}
            </th>
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
          <tr className="new-task-row">
            <td>-</td>
            <td>
              <input
                type="text"
                className="new-task-input"
                placeholder={createType === 'goal' ? 'Add new goal...' : 'Add new task...'}
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={creatingTask}
              />
            </td>
            <td>-</td>
            <td>-</td>
            <td>{projectId ? '(inherited)' : '-'}</td>
            <td>{categoryId ? '(inherited)' : '-'}</td>
            <td>-</td>
            <td className="new-task-actions">
              <span>{tagId ? '(inherited)' : '-'}</span>
              <button
                type="button"
                className="new-task-add"
                onClick={() => void handleCreateNewTask()}
                disabled={!newTaskTitle.trim() || creatingTask}
              >
                ADD
              </button>
            </td>
          </tr>
          {groupedTaskTree.map((section) => (
            <Fragment key={`${section.groupBy}-${section.groupLabel}`}>
              <tr className="group-row">
                <td colSpan={8}>
                  <strong>{section.groupTitle}</strong>
                </td>
              </tr>
              {section.nodes.flatMap((node) =>
                renderTaskRow(
                  node,
                  0,
                  selectedTaskId,
                  onSelectTask,
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
  showGoalCreateField: boolean,
  goalSubtaskTitles: Record<number, string>,
  setGoalSubtaskTitles: Dispatch<SetStateAction<Record<number, string>>>,
  creatingGoalSubtaskId: number | null,
  onCreateGoalSubtask: (goalId: number) => Promise<void>,
): ReactNode[] {
  const { task, children } = node
  const isSubtask = depth > 0
  const canCreateUnderGoal = showGoalCreateField && task.type === 'goal'
  const goalSubtaskTitle = goalSubtaskTitles[task.id] ?? ''

  return [
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
      <td>{task.status}</td>
      <td className={isSubtask ? 'task-title-cell task-title-cell--subtask' : 'task-title-cell'}>
        {isSubtask && <span className="task-subtask-marker" aria-hidden="true">↳</span>}
        <span>{task.title}</span>
        {task.type === 'goal' && <span className="task-goal-badge">Goal</span>}
        {task.recurrence !== 'none' && (
          <span className="recurrence-icon" title={`Recurring: ${task.recurrence}`}>
            🔄
          </span>
        )}
        {isSubtask && <span className="task-subtask-badge">Subtask</span>}
      </td>
      <td>{task.end_date ?? '-'}</td>
      <td>{task.priority === 1 ? 'Low' : task.priority === 2 ? 'Medium' : 'High'}</td>
      <td>{task.project_name ?? '-'}</td>
      <td>{task.category_name ?? '-'}</td>
      <td>{task.story_points}</td>
      <td>{task.tag_names ?? '-'}</td>
    </tr>,
    ...(canCreateUnderGoal
      ? [
          <tr key={`goal-create-${task.id}`} className="goal-subtask-create-row">
            <td colSpan={8}>
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
      : []),
    ...children.flatMap((child) =>
      renderTaskRow(
        child,
        depth + 1,
        selectedTaskId,
        onSelectTask,
        showGoalCreateField,
        goalSubtaskTitles,
        setGoalSubtaskTitles,
        creatingGoalSubtaskId,
        onCreateGoalSubtask,
      ),
    ),
  ]
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

export default TaskTable
