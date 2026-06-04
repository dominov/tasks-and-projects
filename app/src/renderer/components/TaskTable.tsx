import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { Category, Project, Tag, TaskUpdatePayload, TaskWithRelations } from '../../common/types'
import type { QuickCreateOptions } from './ViewManager'
import { buildTaskTree, groupTasks, type GroupBy, type TaskNode } from '../utils/taskGrouping'
import { format, isToday, isTomorrow, isThisWeek } from 'date-fns';

type SortField = 'title' | 'project' | 'category' | 'priority' | 'story_points' | 'status' | 'end_date'
type TableGroupBy = GroupBy | 'none'

const TABLE_GROUP_BY_STORAGE_KEY = 'task-table-group-by'
const GOAL_GROUP_BY_STORAGE_KEY = 'goal-table-group-by'

interface TaskTableProps {
  tasks: TaskWithRelations[]
  lastCreatedTaskId: number | null
  projects: Project[]
  categories: Category[]
  tags: Tag[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  createType: 'task' | 'goal'
  onCreateTask: (title: string, type?: 'task' | 'goal', options?: QuickCreateOptions) => Promise<number | null>
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  onDeleteTask: (taskId: number) => Promise<void>
  onCreateGoalSubtask?: (goalId: number, title: string) => Promise<void>
}

function TaskTable({
  tasks,
  lastCreatedTaskId,
  projects,
  categories,
  tags: _tags,
  onSelectTask,
  selectedTaskId,
  projectId,
  categoryId: _categoryId,
  tagId: _tagId,
  createType,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCreateGoalSubtask,
}: TaskTableProps) {
  const isGoalView = createType === 'goal'
  const groupByStorageKey = isGoalView ? GOAL_GROUP_BY_STORAGE_KEY : TABLE_GROUP_BY_STORAGE_KEY
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [groupBy, setGroupBy] = useState<TableGroupBy>(() => readStoredGroupBy(groupByStorageKey))
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Record<string, boolean>>({})
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [quickDueDate, setQuickDueDate] = useState('')
  const [quickPriority, setQuickPriority] = useState<'1' | '2' | '3'>('1')
  const [quickProjectId, setQuickProjectId] = useState('')
  const [goalSubtaskTitles, setGoalSubtaskTitles] = useState<Record<number, string>>({})
  const [creatingGoalSubtaskId, setCreatingGoalSubtaskId] = useState<number | null>(null)
  const [shouldRefocusQuickAdd, setShouldRefocusQuickAdd] = useState(false)
  const quickAddInputRef = useRef<HTMLInputElement | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: TaskWithRelations } | null>(null)
  const [convertSubmenuOpen, setConvertSubmenuOpen] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ taskId: number; field: string } | null>(null)
  const [editingValue, setEditingValue] = useState('')

  function handleSortClick(field: SortField): void {
    if (sortField === field) {
      setSortAsc((prev) => !prev)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const visibleTasks = isGoalView ? tasks : tasks.filter((task) => task.type !== 'goal')
  const sortedTasks = getSortedTasks(visibleTasks, sortField, sortAsc)
  const taskTree = buildTaskTree(sortedTasks)
  const groupedTaskTree = groupBy === 'none' ? [] : groupTasks(taskTree, groupBy)
  const taskById = useMemo(() => {
    const byId = new Map<number, TaskWithRelations>()
    tasks.forEach((task) => {
      byId.set(task.id, task)
    })
    return byId
  }, [tasks])

  const goalTitleByTaskId = useMemo(() => {
    const byTaskId = new Map<number, string>()

    visibleTasks.forEach((task) => {
      const goalTitle = findGoalAncestorTitle(task, taskById)
      if (goalTitle) {
        byTaskId.set(task.id, goalTitle)
      }
    })

    return byTaskId
  }, [visibleTasks, taskById])

  const groupOptions: Array<{ value: TableGroupBy; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'category', label: 'Category' },
    { value: 'project', label: 'Project' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
  ]

  useEffect(() => {
    storeGroupBy(groupByStorageKey, groupBy)
  }, [groupBy, groupByStorageKey])

  useEffect(() => {
    if (!shouldRefocusQuickAdd || creatingTask) {
      return
    }

    const focusId = window.requestAnimationFrame(() => {
      quickAddInputRef.current?.focus()
    })

    setShouldRefocusQuickAdd(false)

    return () => {
      window.cancelAnimationFrame(focusId)
    }
  }, [shouldRefocusQuickAdd, creatingTask])

  async function handleCreateNewTask(): Promise<void> {
    if (creatingTask || !newTaskTitle.trim()) {
      return
    }

    setCreatingTask(true)

    try {
      const createdTaskId = await onCreateTask(newTaskTitle.trim(), createType, {
        endDate: isGoalView ? undefined : quickDueDate || null,
        priority: isGoalView ? undefined : (Number(quickPriority) as 1 | 2 | 3),
        projectId:
          quickProjectId === ''
            ? projectId
            : quickProjectId === 'none'
              ? null
              : Number(quickProjectId),
      })

      setNewTaskTitle('')
      setQuickDueDate('')
      setQuickPriority('1')
      setQuickProjectId('')
    } finally {
      setCreatingTask(false)
      setShouldRefocusQuickAdd(true)
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

  function openDatePickerFromEvent(event: MouseEvent<HTMLInputElement> | FocusEvent<HTMLInputElement>): void {
    const input = event.currentTarget
    if (input.disabled || input.readOnly) {
      return
    }

    if ('showPicker' in input && typeof input.showPicker === 'function') {
      input.showPicker()
    }
  }

  // ─── Context Menu ─────────────────────────────────────────────
  useEffect(() => {
    if (!contextMenu) return

    function handleClickOutside(event: globalThis.MouseEvent): void {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
        setConvertSubmenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu])

  function openTaskMenu(task: TaskWithRelations, x: number, y: number): void {
    setContextMenu({ x, y, task })
    setConvertSubmenuOpen(false)
  }

  function handleContextMenu(event: globalThis.MouseEvent, task: TaskWithRelations): void {
    event.preventDefault()
    openTaskMenu(task, event.clientX, event.clientY)
  }

  const handleContextStatusChange = useCallback(
    (status: 'in_progress' | 'done') => {
      if (!contextMenu) return
      const label = status === 'in_progress' ? 'In Progress' : 'Done'
      void onUpdateTask(contextMenu.task.id, { status }, `Status changed to ${label}.`)
      setContextMenu(null)
    },
    [contextMenu, onUpdateTask],
  )

  const handleContextDuplicate = useCallback(async () => {
    if (!contextMenu) return
    const task = contextMenu.task
    setContextMenu(null)
    await onCreateTask(task.title, task.type, {
      startDate: task.start_date,
      endDate: task.end_date,
      priority: task.priority as 1 | 2 | 3,
      projectId: task.project_id,
      status: task.status,
    })
  }, [contextMenu, onCreateTask])

  const handleContextDelete = useCallback(async () => {
    if (!contextMenu) return
    const taskId = contextMenu.task.id
    setContextMenu(null)
    await onDeleteTask(taskId)
  }, [contextMenu, onDeleteTask])

  const handleContextConvertToSubtask = useCallback(
    (parentId: number) => {
      if (!contextMenu) return
      void onUpdateTask(contextMenu.task.id, { parent_task_id: parentId }, 'Converted to subtask.')
      setContextMenu(null)
      setConvertSubmenuOpen(false)
    },
    [contextMenu, onUpdateTask],
  )

  const handleContextConvertToTask = useCallback(() => {
    if (!contextMenu) return
    void onUpdateTask(contextMenu.task.id, { parent_task_id: null }, 'Converted to independent task.')
    setContextMenu(null)
  }, [contextMenu, onUpdateTask])

  const handleContextConvertTaskType = useCallback(() => {
    if (!contextMenu) return

    const nextType = contextMenu.task.type === 'task' ? 'goal' : 'task'
    const successMessage = nextType === 'goal' ? 'Converted to goal.' : 'Converted to task.'

    void onUpdateTask(contextMenu.task.id, { type: nextType }, successMessage)
    setContextMenu(null)
  }, [contextMenu, onUpdateTask])

  // ─── Inline editing ───────────────────────────────────────────
  function startEditing(taskId: number, field: string, currentValue: string): void {
    setEditingCell({ taskId, field })
    setEditingValue(currentValue)
  }

  function cancelEditing(): void {
    setEditingCell(null)
    setEditingValue('')
  }

  function commitEditing(overrideValue?: string): void {
    if (!editingCell) return
    const { taskId, field } = editingCell
    const task = taskById.get(taskId)
    if (!task) { cancelEditing(); return }

    const value = overrideValue !== undefined ? overrideValue : editingValue

    if (field === 'title') {
      const trimmed = value.trim()
      if (trimmed && trimmed !== task.title) {
        void onUpdateTask(taskId, { title: trimmed }, 'Title updated.')
      }
    } else if (field === 'end_date') {
      const nextDate = value || null
      if (nextDate !== (task.end_date ?? null)) {
        void onUpdateTask(taskId, { end_date: nextDate }, 'Due date updated.')
      }
    } else if (field === 'priority') {
      const nextPriority = Number(value) as 1 | 2 | 3
      if (nextPriority !== task.priority) {
        void onUpdateTask(taskId, { priority: nextPriority }, 'Priority updated.')
      }
    } else if (field === 'project') {
      const nextProjectId = value === '' ? null : Number(value)
      if (nextProjectId !== task.project_id) {
        void onUpdateTask(taskId, { project_id: nextProjectId }, 'Project updated.')
      }
    } else if (field === 'category') {
      const nextCategoryId = value === '' ? null : Number(value)
      if (nextCategoryId !== task.category_id) {
        void onUpdateTask(taskId, { category_id: nextCategoryId }, 'Category updated.')
      }
    } else if (field === 'story_points') {
      const nextSP = Math.max(0, Number(value) || 0)
      if (nextSP !== task.story_points) {
        void onUpdateTask(taskId, { story_points: nextSP }, 'Story points updated.')
      }
    }
    cancelEditing()
  }

  return (
    <div className="table-wrap">
      <div className={`quick-add-toolbar ${isGoalView ? 'quick-add-toolbar--goal' : ''}`}>
        <input
          ref={quickAddInputRef}
          type="text"
          className="quick-add-input"
          placeholder={createType === 'goal' ? 'Title (new goal)...' : 'Title (new task)...'}
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={creatingTask}
          aria-busy={creatingTask}
        />
        {!isGoalView && (
          <>
            <input
              type="date"
              className="quick-add-date"
              placeholder="Due date"
              value={quickDueDate}
              onClick={openDatePickerFromEvent}
              onFocus={openDatePickerFromEvent}
              onChange={(event) => setQuickDueDate(event.target.value)}
              disabled={creatingTask}
            />
            <select
              className="quick-add-select"
              value={quickPriority}
              onChange={(event) => setQuickPriority(event.target.value as '1' | '2' | '3')}
              disabled={creatingTask}
            >
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
                  goalTitleByTaskId.get(node.task.id) ?? null,
                  selectedTaskId,
                  onSelectTask,
                  isGoalView,
                  createType === 'goal',
                  goalSubtaskTitles,
                  setGoalSubtaskTitles,
                  creatingGoalSubtaskId,
                  handleCreateGoalSubtask,
                  lastCreatedTaskId,
                  handleContextMenu,
                  editingCell,
                  editingValue,
                  setEditingValue,
                  startEditing,
                  commitEditing,
                  cancelEditing,
                  projects,
                  categories,
                ),
              )
            : groupedTaskTree.map((section) => {
                const groupKey = `${section.groupBy}:${section.groupLabel}`
                const isCollapsed = collapsedGroupKeys[groupKey] === true

                return (
                <Fragment key={`${section.groupBy}-${section.groupLabel}`}>
                  <tr className={getGroupRowClassName(section.groupBy, section.groupLabel)}>
                    <td colSpan={7}>
                      <button
                        type="button"
                        className="group-row-toggle"
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? `Expand ${formatGroupTitle(section.groupTitle)}` : `Collapse ${formatGroupTitle(section.groupTitle)}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setCollapsedGroupKeys((previous) => ({
                            ...previous,
                            [groupKey]: !isCollapsed,
                          }))
                        }}
                      >
                        <span className="group-row-toggle__triangle" aria-hidden="true">
                          {isCollapsed ? '▸' : '▾'}
                        </span>
                      </button>
                      <strong>{formatGroupTitle(section.groupTitle)}</strong>
                    </td>
                  </tr>
                  {!isCollapsed && section.nodes.flatMap((node) =>
                    renderTaskRow(
                      node,
                      0,
                      goalTitleByTaskId.get(node.task.id) ?? null,
                      selectedTaskId,
                      onSelectTask,
                      isGoalView,
                      createType === 'goal',
                      goalSubtaskTitles,
                      setGoalSubtaskTitles,
                      creatingGoalSubtaskId,
                      handleCreateGoalSubtask,
                      lastCreatedTaskId,
                      handleContextMenu,
                      editingCell,
                      editingValue,
                      setEditingValue,
                      startEditing,
                      commitEditing,
                      cancelEditing,
                      projects,
                      categories,
                    ),
                  )}
                </Fragment>
              )})}
        </tbody>
      </table>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="task-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.task.status !== 'in_progress' && (
            <button type="button" onClick={() => handleContextStatusChange('in_progress')}>
              Mark In Progress
            </button>
          )}
          {contextMenu.task.status !== 'done' && (
            <button type="button" onClick={() => handleContextStatusChange('done')}>
              Mark Done
            </button>
          )}
          <button type="button" onClick={() => void handleContextDuplicate()}>
            Duplicate
          </button>
          <button type="button" onClick={handleContextConvertTaskType}>
            {contextMenu.task.type === 'task' ? 'Convert to Goal' : 'Convert to Task'}
          </button>
          <button type="button" className="task-context-menu__danger" onClick={() => void handleContextDelete()}>
            Delete
          </button>
          {contextMenu.task.parent_task_id !== null ? (
            <button type="button" onClick={handleContextConvertToTask}>
              Convert to Independent Task
            </button>
          ) : (
            (contextMenu.task.status === 'todo' || contextMenu.task.status === 'in_progress') && (
              <div className="task-context-menu__submenu-wrap">
                <button type="button" onClick={() => setConvertSubmenuOpen((v) => !v)}>
                  Convert to Subtask ▸
                </button>
                {convertSubmenuOpen && (
                  <div className="task-context-menu__submenu">
                    {visibleTasks
                      .filter((t) => t.id !== contextMenu.task.id && t.parent_task_id === null)
                      .slice(0, 20)
                      .map((t) => (
                        <button key={t.id} type="button" onClick={() => handleContextConvertToSubtask(t.id)}>
                          {t.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

function renderTaskRow(
  node: TaskNode,
  depth: number,
  goalParentTitle: string | null,
  selectedTaskId: number | null,
  onSelectTask: (taskId: number) => void,
  isGoalView: boolean,
  showGoalCreateField: boolean,
  goalSubtaskTitles: Record<number, string>,
  setGoalSubtaskTitles: Dispatch<SetStateAction<Record<number, string>>>,
  creatingGoalSubtaskId: number | null,
  onCreateGoalSubtask: (goalId: number) => Promise<void>,
  newlyCreatedTaskId: number | null,
  onContextMenu: (event: globalThis.MouseEvent, task: TaskWithRelations) => void,
  editingCell: { taskId: number; field: string } | null,
  editingValue: string,
  setEditingValue: Dispatch<SetStateAction<string>>,
  startEditing: (taskId: number, field: string, currentValue: string) => void,
  commitEditing: (overrideValue?: string) => void,
  cancelEditing: () => void,
  projects: Project[],
  categories: Category[],
): ReactNode[] {
  const { task, children } = node;
  const isSubtask = depth > 0;
  const nextGoalParentTitle = task.type === 'goal' ? task.title : goalParentTitle
  const goalSubtitle = !isGoalView && task.type !== 'goal' ? goalParentTitle : null
  const canCreateUnderGoal = showGoalCreateField && task.type === 'goal'
  const goalSubtaskTitle = goalSubtaskTitles[task.id] ?? ''
  const isNewlyCreatedTask = !isGoalView && newlyCreatedTaskId !== null && Number(newlyCreatedTaskId) === Number(task.id)
  const rowClassName = [
    selectedTaskId === task.id ? 'row-selected' : '',
    isSubtask ? 'task-row--subtask' : '',
    isNewlyCreatedTask ? 'task-row--new' : '',
    task.tracking_only ? 'task-row--tracking' : '',
  ]
    .filter(Boolean)
    .join(' ')
  // Calculate progress for GOALs (only for parent, not subtasks)
  let goalProgress: null | { percent: number; completed: number; total: number } = null
  if (task.type === 'goal' && !isSubtask && children.length > 0) {
    const total = children.length
    const completed = children.filter((c) => c.task.status === 'done').length
    const percent = Math.round((completed / total) * 100)
    goalProgress = { percent, completed, total }
  }

  const isEditing = (field: string) => editingCell?.taskId === task.id && editingCell?.field === field

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void {
    if (event.key === 'Enter') {
      commitEditing()
    } else if (event.key === 'Escape') {
      cancelEditing()
    }
  }

  const mainRow = (
    <tr
      key={task.id}
      data-details-trigger="open"
      className={rowClassName || undefined}
      onClick={() => onSelectTask(task.id)}
      onContextMenu={(e) => onContextMenu(e.nativeEvent, task)}
    >
      {/* Title cell */}
      <td
        className={isSubtask ? 'task-title-cell task-title-cell--subtask' : 'task-title-cell'}
        onDoubleClick={(e) => {
          e.stopPropagation()
          startEditing(task.id, 'title', task.title)
        }}
      >
        {isEditing('title') ? (
          <input
            type="text"
            className="inline-edit-input"
            value={editingValue}
            autoFocus
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => commitEditing()}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            {!(isGoalView && task.type === 'goal' && !isSubtask) && (
              <span
                className={`${getStatusIndicatorClassName(task.status)}${isNewlyCreatedTask ? ' status-dot--new-task' : ''}`}
                title={task.status}
              >
                {task.status === 'done' ? '✓' : ''}
              </span>
            )}
            {task.type === 'goal' && (
              <span className="goal-icon" title="Goal" style={{ marginRight: '0.3rem', fontSize: '1.1em' }}>🎯</span>
            )}
            {task.recurrence !== 'none' && (
              <span className="recurrence-icon" title={`Recurring: ${task.recurrence}`} style={{ marginRight: '0.3rem', fontSize: '1.1em' }}>
                🔄
              </span>
            )}
            {isSubtask && <span className="task-subtask-marker" aria-hidden="true">↳</span>}
            <div className="task-title-block">
              {goalSubtitle && <span className="task-title-subtitle">{goalSubtitle}</span>}
              {isGoalView && task.type === 'goal' && !isSubtask ? (
                <span className="goal-title-headline">{task.title}</span>
              ) : (
                <span className="task-title-text">{task.title}</span>
              )}
            </div>
            {isGoalView && goalProgress && (
              <span className="goal-progress">{` (${goalProgress.percent}% - ${goalProgress.completed}/${goalProgress.total})`}</span>
            )}
          </>
        )}
      </td>

      {/* End Date cell */}
      <td
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (!(isGoalView && task.type === 'goal')) {
            startEditing(task.id, 'end_date', task.end_date ?? '')
          }
        }}
      >
        {isEditing('end_date') ? (
          <input
            type="date"
            className="inline-edit-input"
            value={editingValue}
            autoFocus
            onChange={(e) => { setEditingValue(e.target.value); }}
            onBlur={() => commitEditing()}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          isGoalView && task.type === 'goal' ? '-' : formatDate(task.end_date)
        )}
      </td>

      {/* Priority cell */}
      <td
        onDoubleClick={(e) => {
          e.stopPropagation()
          startEditing(task.id, 'priority', String(task.priority))
        }}
      >
        {isEditing('priority') ? (
          <select
            className="inline-edit-select"
            value={editingValue}
            autoFocus
            onChange={(e) => commitEditing(e.target.value)}
            onBlur={cancelEditing}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="1">Low</option>
            <option value="2">Medium</option>
            <option value="3">High</option>
          </select>
        ) : (
          <span className={getPriorityClassName(task.priority)}>
            {task.priority === 1 ? 'Low' : task.priority === 2 ? 'Medium' : 'High'}
          </span>
        )}
      </td>

      {/* Project cell */}
      <td
        onDoubleClick={(e) => {
          e.stopPropagation()
          startEditing(task.id, 'project', String(task.project_id ?? ''))
        }}
      >
        {isEditing('project') ? (
          <select
            className="inline-edit-select"
            value={editingValue}
            autoFocus
            onChange={(e) => commitEditing(e.target.value)}
            onBlur={cancelEditing}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span className={getProjectBadgeClassName(task.project_id)}>{task.project_name ?? '-'}</span>
        )}
      </td>

      {/* Category cell */}
      <td
        onDoubleClick={(e) => {
          e.stopPropagation()
          startEditing(task.id, 'category', String(task.category_id ?? ''))
        }}
      >
        {isEditing('category') ? (
          <select
            className="inline-edit-select"
            value={editingValue}
            autoFocus
            onChange={(e) => commitEditing(e.target.value)}
            onBlur={cancelEditing}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          task.category_name ?? '-'
        )}
      </td>

      {/* Story Points cell */}
      <td
        onDoubleClick={(e) => {
          e.stopPropagation()
          startEditing(task.id, 'story_points', String(task.story_points))
        }}
      >
        {isEditing('story_points') ? (
          <input
            type="number"
            className="inline-edit-input inline-edit-input--sm"
            min={0}
            value={editingValue}
            autoFocus
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => commitEditing()}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          task.story_points
        )}
      </td>

      {/* Tags cell */}
      <td>
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
      nextGoalParentTitle,
      selectedTaskId,
      onSelectTask,
      isGoalView,
      showGoalCreateField,
      goalSubtaskTitles,
      setGoalSubtaskTitles,
      creatingGoalSubtaskId,
      onCreateGoalSubtask,
      newlyCreatedTaskId,
      onContextMenu,
      editingCell,
      editingValue,
      setEditingValue,
      startEditing,
      commitEditing,
      cancelEditing,
      projects,
      categories,
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

function formatGroupTitle(groupTitle: string): string {
  const separatorIndex = groupTitle.indexOf(':')

  if (separatorIndex === -1) {
    return groupTitle.trim()
  }

  return groupTitle.slice(separatorIndex + 1).trim()
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
    if (field === 'end_date') {
      const aHasDate = Boolean(a.end_date)
      const bHasDate = Boolean(b.end_date)

      // Keep undated tasks at the end regardless of sort direction.
      if (aHasDate !== bHasDate) {
        return aHasDate ? -1 : 1
      }
    }

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

    if (aVal === bVal) {
      return 0
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

function findGoalAncestorTitle(task: TaskWithRelations, taskById: Map<number, TaskWithRelations>): string | null {
  const visited = new Set<number>()
  let parentId = task.parent_task_id

  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId)
    const parentTask = taskById.get(parentId)

    if (!parentTask) {
      return null
    }

    if (parentTask.type === 'goal') {
      return parentTask.title
    }

    parentId = parentTask.parent_task_id
  }

  return null
}

function readStoredGroupBy(storageKey: string): TableGroupBy {
  if (typeof window === 'undefined') {
    return 'none'
  }

  const value = window.localStorage.getItem(storageKey)

  if (value === 'none' || value === 'category' || value === 'project' || value === 'status' || value === 'priority') {
    return value
  }

  return 'none'
}

function storeGroupBy(storageKey: string, groupBy: TableGroupBy): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(storageKey, groupBy)
}

export default TaskTable
