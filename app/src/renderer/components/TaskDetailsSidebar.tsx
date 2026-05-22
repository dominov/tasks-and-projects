import { useEffect, useMemo, useState, type RefObject } from 'react'
import type {
  Category,
  Project,
  Recurrence,
  Tag,
  TaskCreatePayload,
  TaskStatus,
  TaskType,
  TaskUpdatePayload,
  TaskWithRelations,
} from '../../common/types'

interface TaskDraft {
  title: string
  description: string
  status: TaskStatus
  type: TaskType
  priority: number
  storyPoints: number
  startDate: string
  endDate: string
  projectId: number | null
  categoryId: number | null
  tagIds: number[]
  recurrence: Recurrence
  recurrenceRule: string | null
}

interface TaskDetailsSidebarProps {
  containerRef: RefObject<HTMLElement | null>
  open: boolean
  selectedTaskId: number | null
  tasks: TaskWithRelations[]
  projects: Project[]
  tags: Tag[]
  categories: Category[]
  onUpdateTask: (taskId: number, payload: TaskUpdatePayload, successMessage: string) => Promise<void>
  onCreateSubtask: (payload: TaskCreatePayload) => Promise<void>
  onDeleteTask: (taskId: number) => Promise<void>
  onClose: () => void
}

function createEmptyDraft(): TaskDraft {
  return {
    title: '',
    description: '',
    status: 'todo',
    type: 'task',
    priority: 2,
    storyPoints: 1,
    startDate: '',
    endDate: '',
    projectId: null,
    categoryId: null,
    tagIds: [],
    recurrence: 'none',
    recurrenceRule: null,
  }
}

function TaskDetailsSidebar({
  containerRef,
  open,
  selectedTaskId,
  tasks,
  projects,
  tags,
  categories,
  onUpdateTask,
  onCreateSubtask,
  onDeleteTask,
  onClose,
}: TaskDetailsSidebarProps) {
  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId])
  const subtasks = useMemo(() => {
    if (!selectedTask) {
      return []
    }

    return tasks
      .filter((task) => task.parent_task_id === selectedTask.id)
      .sort((a, b) => {
        const aDate = a.end_date ?? '9999-12-31'
        const bDate = b.end_date ?? '9999-12-31'
        if (aDate !== bDate) {
          return aDate.localeCompare(bDate)
        }

        return a.id - b.id
      })
  }, [tasks, selectedTask])
  const [draft, setDraft] = useState<TaskDraft>(createEmptyDraft())
  const [saving, setSaving] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [subtaskDate, setSubtaskDate] = useState('')
  const [creatingSubtask, setCreatingSubtask] = useState(false)
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    if (!open) {
      setDraft(createEmptyDraft())
      setSubtaskTitle('')
      setSubtaskDate('')
      return
    }

    if (!selectedTask) {
      setDraft(createEmptyDraft())
      setSubtaskTitle('')
      setSubtaskDate('')
      return
    }

    setDraft({
      title: selectedTask.title,
      description: selectedTask.description ?? '',
      status: selectedTask.status,
      type: selectedTask.type,
      priority: selectedTask.priority,
      storyPoints: selectedTask.story_points,
      startDate: selectedTask.start_date ?? '',
      endDate: selectedTask.end_date ?? '',
      projectId: selectedTask.project_id,
      categoryId: selectedTask.category_id,
      tagIds: parseTagIds(selectedTask.tag_ids),
      recurrence: selectedTask.recurrence,
      recurrenceRule: selectedTask.recurrence_rule,
    })
    setTagInput(getTagNamesFromIds(parseTagIds(selectedTask.tag_ids), tags))
    setSubtaskTitle('')
    setSubtaskDate('')
  }, [open, selectedTask, tags])

  async function persistUpdate(payload: TaskUpdatePayload, successMessage: string): Promise<void> {
    if (!selectedTask) {
      return
    }

    setSaving(true)

    try {
      await onUpdateTask(selectedTask.id, payload, successMessage)
    } finally {
      setSaving(false)
    }
  }

  function formatCreatedAt(value: string | null): string {
    if (!value) {
      return '-'
    }

    const createdAt = new Date(value)

    if (Number.isNaN(createdAt.getTime())) {
      return value
    }

    return createdAt.toLocaleString()
  }

  function getStatusLabel(status: TaskStatus): string {
    if (status === 'todo') {
      return 'To Do'
    }

    if (status === 'in_progress') {
      return 'In Progress'
    }

    return 'Done'
  }

  function getPriorityLabel(priority: number): string {
    if (priority === 1) {
      return 'Low'
    }

    if (priority === 2) {
      return 'Medium'
    }

    return 'High'
  }

  function maybeCommitTextField(field: 'title' | 'description', value: string): void {
    if (!selectedTask) {
      return
    }

    const sourceValue = (selectedTask[field] ?? '').trim()
    const nextValue = value.trim()

    if (sourceValue === nextValue) {
      return
    }

    void persistUpdate({ [field]: nextValue } as TaskUpdatePayload, `${field === 'title' ? 'Title' : 'Description'} updated.`)
  }

  function maybeCommitProject(value: number | null): void {
    if (!selectedTask || selectedTask.project_id === value) {
      return
    }

    void persistUpdate({ project_id: value }, 'Project updated.')
  }

  function maybeCommitCategory(value: number | null): void {
    if (!selectedTask || selectedTask.category_id === value) {
      return
    }

    void persistUpdate({ category_id: value }, 'Category updated.')
  }

  function maybeCommitPriority(value: number): void {
    if (!selectedTask || selectedTask.priority === value) {
      return
    }

    void persistUpdate({ priority: value as 1 | 2 | 3 }, 'Priority updated.')
  }

  function maybeCommitType(value: TaskType): void {
    if (!selectedTask || selectedTask.type === value) {
      return
    }

    void persistUpdate({ type: value }, 'Task type updated.')
  }

  function maybeCommitStartDate(value: string): void {
    if (!selectedTask) {
      return
    }

    const nextStartDate = value || null

    if ((selectedTask.start_date ?? null) === nextStartDate) {
      return
    }

    const endDate = draft.endDate || null
    if (nextStartDate && endDate && nextStartDate > endDate) {
      return
    }

    void persistUpdate({ start_date: nextStartDate }, 'Start date updated.')
  }

  function maybeCommitDueDate(value: string): void {
    if (!selectedTask) {
      return
    }

    const nextDueDate = value || null

    if ((selectedTask.end_date ?? null) === nextDueDate) {
      return
    }

    const startDate = draft.startDate || null
    if (startDate && nextDueDate && startDate > nextDueDate) {
      return
    }

    void persistUpdate({ end_date: nextDueDate }, 'Due date updated.')
  }

  function handleStatusChange(nextStatus: TaskStatus): void {
    if (draft.status === nextStatus) {
      return
    }

    setDraft((current) => ({ ...current, status: nextStatus }))
    void persistUpdate({ status: nextStatus }, `Status changed to ${getStatusLabel(nextStatus)}.`)
  }

  function handlePriorityChange(nextPriority: number): void {
    if (draft.priority === nextPriority) {
      return
    }

    setDraft((current) => ({ ...current, priority: nextPriority }))
    maybeCommitPriority(nextPriority)
  }

  function maybeCommitTagsFromInput(value: string): void {
    if (!selectedTask) {
      return
    }

    const nextTagIds = parseTagInputToIds(value, tags)
    const currentTagIds = [...draft.tagIds].sort((a, b) => a - b)
    const sortedNextTagIds = [...nextTagIds].sort((a, b) => a - b)

    const didChange =
      currentTagIds.length !== sortedNextTagIds.length ||
      currentTagIds.some((tagId, index) => tagId !== sortedNextTagIds[index])

    if (!didChange) {
      setTagInput(getTagNamesFromIds(draft.tagIds, tags))
      return
    }

    setDraft((current) => ({ ...current, tagIds: sortedNextTagIds }))
    setTagInput(getTagNamesFromIds(sortedNextTagIds, tags))
    void persistUpdate({ tag_ids: sortedNextTagIds }, 'Tags updated.')
  }

  async function handleDeleteClick(): Promise<void> {
    if (!selectedTask) {
      return
    }

    await onDeleteTask(selectedTask.id)
  }

  async function handleCreateSubtaskClick(): Promise<void> {
    if (!selectedTask || !subtaskTitle.trim()) {
      return
    }

    setCreatingSubtask(true)

    try {
      await onCreateSubtask({
        title: subtaskTitle.trim(),
        end_date: subtaskDate || null,
        parent_task_id: selectedTask.id,
        project_id: selectedTask.project_id,
      })
      setSubtaskTitle('')
      setSubtaskDate('')
    } finally {
      setCreatingSubtask(false)
    }
  }

  return (
    <aside ref={containerRef} className={open ? 'details-sidebar open' : 'details-sidebar'}>
      <header className="details-head">
        <h2>{selectedTask ? 'Task Details' : 'Add Task'}</h2>
        <button type="button" className="ghost icon-close" onClick={onClose} aria-label="Close details">
          X
        </button>
      </header>

      <div className="details-body">
        {!selectedTask && <p className="muted">Select a task to view and update its details.</p>}

        {selectedTask && (
          <>
            <p className="muted">Selected task ID: {selectedTask.id} | Created at: {formatCreatedAt(selectedTask.created_at)}</p>
            <hr className="detail-separator" />

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-title">Title:</label>
              <input
                id="detail-title"
                className="detail-title-input"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                onBlur={(event) => maybeCommitTextField('title', event.target.value)}
                placeholder="Task title"
              />
            </div>

            <section className="status-section">
              <p className="status-title">Status Switch</p>
              <div className="status-switch" role="group" aria-label="Task status updates">
                {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((status) => (
                  <button
                    type="button"
                    key={status}
                    className={`status-option status-option--${status}${draft.status === status ? ' status-option--active' : ''}`}
                    onClick={() => handleStatusChange(status)}
                  >
                    {getStatusLabel(status)}
                  </button>
                ))}
              </div>
            </section>

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-description">Description:</label>
              <textarea
                id="detail-description"
                rows={5}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                onBlur={(event) => maybeCommitTextField('description', event.target.value)}
                placeholder="Add context"
              />
            </div>

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-project">Project:</label>
              <select
                id="detail-project"
                value={draft.projectId ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value === '' ? null : Number(event.target.value)
                  setDraft((current) => ({ ...current, projectId: nextValue }))
                  maybeCommitProject(nextValue)
                }}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-category">Category:</label>
              <select
                id="detail-category"
                value={draft.categoryId ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value === '' ? null : Number(event.target.value)
                  setDraft((current) => ({ ...current, categoryId: nextValue }))
                  maybeCommitCategory(nextValue)
                }}
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-type">Type:</label>
              <select
                id="detail-type"
                value={draft.type}
                onChange={(event) => {
                  const nextType = event.target.value as TaskType
                  setDraft((current) => ({ ...current, type: nextType }))
                  maybeCommitType(nextType)
                }}
              >
                <option value="task">Task</option>
                <option value="goal">Goal</option>
              </select>
            </div>

            <section className="priority-section">
              <p className="status-title">Priority Switch</p>
              <div className="priority-switch" role="group" aria-label="Task priority updates">
                {[1, 2, 3].map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    className={`priority-option priority-option--${priority}${draft.priority === priority ? ' priority-option--active' : ''}`}
                    onClick={() => handlePriorityChange(priority)}
                  >
                    {getPriorityLabel(priority)}
                  </button>
                ))}
              </div>
            </section>

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-story-points">Story Points:</label>
              <input
                id="detail-story-points"
                type="number"
                min={0}
                step={1}
                value={draft.storyPoints}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, storyPoints: Number(event.target.value) || 0 }))
                }}
                onBlur={(event) => {
                  const nextStoryPoints = Math.max(0, Number(event.target.value) || 0)
                  setDraft((current) => ({ ...current, storyPoints: nextStoryPoints }))

                  if (nextStoryPoints !== selectedTask.story_points) {
                    void persistUpdate({ story_points: nextStoryPoints }, 'Story points updated.')
                  }
                }}
              />
            </div>

            <div className="detail-date-grid">
              <div className="detail-field">
                <label className="detail-label" htmlFor="detail-start-date">Start Date:</label>
                <input
                  id="detail-start-date"
                  type="date"
                  value={draft.startDate}
                  disabled={draft.type === 'goal'}
                  max={draft.endDate || undefined}
                  onChange={(event) => {
                    const nextStartDate = event.target.value
                    setDraft((current) => ({ ...current, startDate: nextStartDate }))
                    maybeCommitStartDate(nextStartDate)
                  }}
                />
              </div>
              <div className="detail-field">
                <label className="detail-label" htmlFor="detail-due-date">Due Date:</label>
                <input
                  id="detail-due-date"
                  type="date"
                  value={draft.endDate}
                  disabled={draft.type === 'goal'}
                  min={draft.startDate || undefined}
                  onChange={(event) => {
                    const nextEndDate = event.target.value
                    setDraft((current) => ({ ...current, endDate: nextEndDate }))
                    maybeCommitDueDate(nextEndDate)
                  }}
                />
              </div>
            </div>

            {draft.type === 'goal' && (
              <p className="muted">Goal dates are calculated automatically from its subtasks.</p>
            )}

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-recurrence">Recurrence:</label>
              <select
                id="detail-recurrence"
                value={draft.recurrence}
                onChange={(event) => {
                  const nextValue = event.target.value as Recurrence
                  setDraft((current) => ({ ...current, recurrence: nextValue }))
                  if (nextValue === 'none') {
                    void persistUpdate({ recurrence: 'none', recurrence_rule: null }, 'Recurrence removed.')
                  }
                }}
              >
                <option value="none">None</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {draft.recurrence === 'weekly' && (
              <fieldset className="recurrence-fieldset">
                <legend>Weekly Days</legend>
                <div className="days-selector">
                  {[
                    { label: 'Mon', value: 1 },
                    { label: 'Tue', value: 2 },
                    { label: 'Wed', value: 3 },
                    { label: 'Thu', value: 4 },
                    { label: 'Fri', value: 5 },
                    { label: 'Sat', value: 6 },
                    { label: 'Sun', value: 0 },
                  ].map((day) => (
                    <label key={day.value} className="day-toggle">
                      <input
                        type="checkbox"
                        checked={(draft.recurrenceRule ?? '').split(',').includes(day.value.toString())}
                        onChange={(event) => {
                          const currentDays = (draft.recurrenceRule ?? '').split(',').filter(Boolean)
                          const nextDays = event.target.checked
                            ? [...currentDays, day.value.toString()]
                            : currentDays.filter((d) => d !== day.value.toString())
                          const rule = nextDays.sort().join(',')
                          setDraft((current) => ({ ...current, recurrenceRule: rule }))
                          void persistUpdate({ recurrence: 'weekly', recurrence_rule: rule }, 'Weekly recurrence updated.')
                        }}
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {draft.recurrence === 'monthly' && (
              <div className="detail-field">
                <label className="detail-label" htmlFor="detail-day-of-month">Day of Month:</label>
                <input
                  id="detail-day-of-month"
                  type="number"
                  min={1}
                  max={31}
                  value={draft.recurrenceRule ?? ''}
                  onChange={(event) => {
                    const rule = event.target.value
                    setDraft((current) => ({ ...current, recurrenceRule: rule }))
                  }}
                  onBlur={(event) => {
                    const rule = event.target.value
                    if (rule) {
                      void persistUpdate({ recurrence: 'monthly', recurrence_rule: rule }, 'Monthly recurrence updated.')
                    }
                  }}
                  placeholder="1-31"
                />
              </div>
            )}

            <div className="detail-field">
              <label className="detail-label" htmlFor="detail-tags">Tags:</label>
              <input
                id="detail-tags"
                list="task-tags-options"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onBlur={(event) => maybeCommitTagsFromInput(event.target.value)}
                placeholder="Type tags separated by comma"
              />
              <datalist id="task-tags-options">
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name} />
                ))}
              </datalist>
              <p className="muted">Use existing tag names separated by comma.</p>
            </div>

            {saving && <p className="muted">Saving changes...</p>}

            <div className="details-footer">
              <button type="button" className="delete-task" onClick={() => void handleDeleteClick()} disabled={!selectedTask}>
                Delete
              </button>
            </div>

            <section className="subtask-panel" aria-label="Create and list subtasks">
              <p className="status-title">Create Subtask</p>
              <div className="subtask-form">
                <div className="subtask-input-row">
                  <input
                    className="subtask-title-input"
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    placeholder="Subtask title"
                  />
                  <label className="subtask-date-picker" htmlFor="subtask-date" aria-label="Select subtask date">
                    <input
                      id="subtask-date"
                      className="subtask-date-input"
                      type="date"
                      value={subtaskDate}
                      onChange={(event) => setSubtaskDate(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="subtask-add"
                  onClick={() => void handleCreateSubtaskClick()}
                  disabled={!subtaskTitle.trim() || creatingSubtask}
                >
                  Add
                </button>
              </div>
              <div className="subtask-list" role="list" aria-label="Subtasks list">
                {subtasks.length === 0 && <p className="muted">No subtasks yet.</p>}
                {subtasks.map((subtask) => (
                  <div key={subtask.id} className="subtask-item" role="listitem">
                    <span className="subtask-item__title">{subtask.title}</span>
                    <span className="subtask-item__date">{formatSubtaskDate(subtask.end_date)}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  )
}

function parseTagIds(tagIds: string | null): number[] {
  if (!tagIds) {
    return []
  }

  return tagIds
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
}

function getTagNamesFromIds(tagIds: number[], tags: Tag[]): string {
  const tagMap = new Map(tags.map((tag) => [tag.id, tag.name]))

  return tagIds
    .map((tagId) => tagMap.get(tagId))
    .filter((name): name is string => Boolean(name))
    .join(', ')
}

function parseTagInputToIds(inputValue: string, tags: Tag[]): number[] {
  const names = inputValue
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  if (names.length === 0) {
    return []
  }

  const tagIdByName = new Map(tags.map((tag) => [tag.name.trim().toLowerCase(), tag.id]))
  const nextTagIds: number[] = []

  for (const name of names) {
    const tagId = tagIdByName.get(name)
    if (tagId && !nextTagIds.includes(tagId)) {
      nextTagIds.push(tagId)
    }
  }

  return nextTagIds
}

function formatSubtaskDate(dateValue: string | null): string {
  if (!dateValue) {
    return '-'
  }

  const date = new Date(`${dateValue}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default TaskDetailsSidebar
