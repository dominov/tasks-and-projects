import { useEffect, useMemo, useState, type FocusEvent, type MouseEvent, type RefObject } from 'react'
import type {
  Category,
  Project,
  Recurrence,
  Tag,
  TaskCreatePayload,
  TaskStatus,
  TaskUpdatePayload,
  TaskWithRelations,
} from '../../common/types'

interface TaskDraft {
  title: string
  description: string
  status: TaskStatus
  priority: number
  storyPoints: number
  startDate: string
  endDate: string
  projectId: number | null
  categoryId: number | null
  tagIds: number[]
  recurrence: Recurrence
  recurrenceRule: string | null
  trackingOnly: boolean
}

interface RecurrenceDialogDraft {
  recurrence: 'weekly' | 'monthly'
  weeklyDays: number[]
  monthlyDay: string
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
  onSelectTask: (taskId: number) => void
  onClose: () => void
}

function createEmptyDraft(): TaskDraft {
  return {
    title: '',
    description: '',
    status: 'todo',
    priority: 1,
    storyPoints: 1,
    startDate: '',
    endDate: '',
    projectId: null,
    categoryId: null,
    tagIds: [],
    recurrence: 'none',
    recurrenceRule: null,
    trackingOnly: false,
  }
}

function createRecurrenceDialogDraft(task: TaskWithRelations | null): RecurrenceDialogDraft {
  if (!task || task.recurrence === 'none') {
    return {
      recurrence: 'weekly',
      weeklyDays: [],
      monthlyDay: '',
    }
  }

  if (task.recurrence === 'weekly') {
    const weeklyDays = (task.recurrence_rule ?? '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)

    return {
      recurrence: 'weekly',
      weeklyDays: Array.from(new Set(weeklyDays)).sort((a, b) => a - b),
      monthlyDay: '',
    }
  }

  return {
    recurrence: 'monthly',
    weeklyDays: [],
    monthlyDay: task.recurrence_rule ?? '',
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
  onSelectTask,
  onClose,
}: TaskDetailsSidebarProps) {
  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId])
  const parentTask = useMemo(() => {
    if (!selectedTask?.parent_task_id) {
      return null
    }

    return tasks.find((task) => task.id === selectedTask.parent_task_id) ?? null
  }, [tasks, selectedTask])
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
  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false)
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceDialogDraft>(
    createRecurrenceDialogDraft(selectedTask),
  )
  const [recurrenceError, setRecurrenceError] = useState('')

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
      priority: selectedTask.priority,
      storyPoints: selectedTask.story_points,
      startDate: selectedTask.start_date ?? '',
      endDate: selectedTask.end_date ?? '',
      projectId: selectedTask.project_id,
      categoryId: selectedTask.category_id,
      tagIds: parseTagIds(selectedTask.tag_ids),
      recurrence: selectedTask.recurrence,
      recurrenceRule: selectedTask.recurrence_rule,
      trackingOnly: Boolean(selectedTask.tracking_only),
    })
    setTagInput(getTagNamesFromIds(parseTagIds(selectedTask.tag_ids), tags))
    setSubtaskTitle('')
    setSubtaskDate('')
    setRecurrenceDialogOpen(false)
    setRecurrenceDraft(createRecurrenceDialogDraft(selectedTask))
    setRecurrenceError('')
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

  function getRecurrenceSummary(): string {
    if (!selectedTask || selectedTask.recurrence === 'none') {
      return 'Not recurring yet.'
    }

    if (selectedTask.recurrence === 'weekly') {
      const labels = (selectedTask.recurrence_rule ?? '')
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
        .map((value) => {
          if (value === 1) return 'Mon'
          if (value === 2) return 'Tue'
          if (value === 3) return 'Wed'
          if (value === 4) return 'Thu'
          if (value === 5) return 'Fri'
          if (value === 6) return 'Sat'
          return 'Sun'
        })

      return labels.length > 0 ? `Weekly on ${labels.join(', ')}` : 'Weekly recurrence configured.'
    }

    return selectedTask.recurrence_rule ? `Monthly on day ${selectedTask.recurrence_rule}` : 'Monthly recurrence configured.'
  }

  function openRecurrenceDialog(): void {
    if (!selectedTask) {
      return
    }

    setRecurrenceDraft(createRecurrenceDialogDraft(selectedTask))
    setRecurrenceError('')
    setRecurrenceDialogOpen(true)
  }

  function closeRecurrenceDialog(): void {
    setRecurrenceDialogOpen(false)
    setRecurrenceError('')
  }

  function toggleWeeklyDay(dayValue: number, checked: boolean): void {
    setRecurrenceDraft((current) => {
      const nextSet = new Set(current.weeklyDays)

      if (checked) {
        nextSet.add(dayValue)
      } else {
        nextSet.delete(dayValue)
      }

      return {
        ...current,
        weeklyDays: Array.from(nextSet).sort((a, b) => a - b),
      }
    })
  }

  async function completeRecurrenceSetup(): Promise<void> {
    if (!selectedTask) {
      return
    }

    let recurrenceRule: string

    if (recurrenceDraft.recurrence === 'weekly') {
      if (recurrenceDraft.weeklyDays.length === 0) {
        setRecurrenceError('Choose at least one day for weekly recurrence.')
        return
      }

      recurrenceRule = recurrenceDraft.weeklyDays.join(',')
    } else {
      const dayOfMonth = Number(recurrenceDraft.monthlyDay)

      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        setRecurrenceError('Enter a day of month between 1 and 31.')
        return
      }

      recurrenceRule = String(dayOfMonth)
    }

    setRecurrenceError('')
    await persistUpdate(
      {
        recurrence: recurrenceDraft.recurrence,
        recurrence_rule: recurrenceRule,
      },
      'Recurring task saved.',
    )
    setRecurrenceDialogOpen(false)
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
        end_date: subtaskDate || selectedTask.end_date || null,
        start_date: selectedTask.start_date || null,
        parent_task_id: selectedTask.id,
        project_id: selectedTask.project_id,
        category_id: selectedTask.category_id,
        tag_ids: parseTagIds(selectedTask.tag_ids),
      })
      setSubtaskTitle('')
      setSubtaskDate('')
    } finally {
      setCreatingSubtask(false)
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
            {parentTask && (
              <p className="task-parent-link-row">
                Parent task:{' '}
                <button
                  type="button"
                  className="task-inline-link"
                  onClick={() => onSelectTask(parentTask.id)}
                >
                  {parentTask.title}
                </button>
              </p>
            )}
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

            <div className="detail-field detail-field--inline">
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


            <div className="detail-field detail-field--inline">
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

            <div className="detail-field detail-field--inline">
              <label className="detail-label" htmlFor="detail-tracking-only">Tracking only:</label>
              <input
                id="detail-tracking-only"
                type="checkbox"
                checked={draft.trackingOnly}
                onChange={(event) => {
                  const nextValue = event.target.checked
                  setDraft((current) => ({ ...current, trackingOnly: nextValue }))
                  void persistUpdate({ tracking_only: nextValue ? 1 : 0 }, 'Tracking status updated.')
                }}
              />
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

            <div className="detail-field detail-field--inline">
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
                  max={draft.endDate || undefined}
                  onClick={openDatePickerFromEvent}
                  onFocus={openDatePickerFromEvent}
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
                  min={draft.startDate || undefined}
                  onClick={openDatePickerFromEvent}
                  onFocus={openDatePickerFromEvent}
                  onChange={(event) => {
                    const nextEndDate = event.target.value
                    setDraft((current) => ({ ...current, endDate: nextEndDate }))
                    maybeCommitDueDate(nextEndDate)
                  }}
                />
              </div>
            </div>

            {selectedTask.type === 'goal' && subtasks.length > 0 && (
              <p className="muted">Goal dates are calculated automatically from its subtasks.</p>
            )}

            <section className="recurrence-actions-panel" aria-label="Recurring task setup">
              
              <button type="button" className="recurrence-open-btn" onClick={openRecurrenceDialog}>
                Recurrence
              </button>
              <p className="muted recurrence-summary">{getRecurrenceSummary()}</p>
            </section>

            {recurrenceDialogOpen && (
              <div className="recurrence-dialog-backdrop" role="presentation">
                <div className="recurrence-dialog" role="dialog" aria-modal="true" aria-labelledby="recurrence-dialog-title">
                  <h3 id="recurrence-dialog-title">Create Recurring Task</h3>

                  <div className="recurrence-frequency-options" role="radiogroup" aria-label="Recurrence frequency">
                    <label>
                      <input
                        type="radio"
                        name="recurrence-frequency"
                        checked={recurrenceDraft.recurrence === 'weekly'}
                        onChange={() =>
                          setRecurrenceDraft((current) => ({
                            ...current,
                            recurrence: 'weekly',
                          }))
                        }
                      />
                      Weekly
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="recurrence-frequency"
                        checked={recurrenceDraft.recurrence === 'monthly'}
                        onChange={() =>
                          setRecurrenceDraft((current) => ({
                            ...current,
                            recurrence: 'monthly',
                          }))
                        }
                      />
                      Monthly
                    </label>
                  </div>

                  {recurrenceDraft.recurrence === 'weekly' ? (
                    <fieldset className="recurrence-dialog-fieldset">
                      <legend>Weekly days</legend>
                      <div className="recurrence-weekday-grid">
                        {[
                          { label: 'Mon', value: 1 },
                          { label: 'Tue', value: 2 },
                          { label: 'Wed', value: 3 },
                          { label: 'Thu', value: 4 },
                          { label: 'Fri', value: 5 },
                          { label: 'Sat', value: 6 },
                          { label: 'Sun', value: 0 },
                        ].map((day) => (
                          <label key={day.value} className="recurrence-weekday-toggle">
                            <input
                              type="checkbox"
                              checked={recurrenceDraft.weeklyDays.includes(day.value)}
                              onChange={(event) => toggleWeeklyDay(day.value, event.target.checked)}
                            />
                            <span>{day.label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <div className="detail-field">
                      <label className="detail-label" htmlFor="recurrence-day-of-month">Day of Month:</label>
                      <input
                        id="recurrence-day-of-month"
                        type="number"
                        min={1}
                        max={31}
                        value={recurrenceDraft.monthlyDay}
                        onChange={(event) =>
                          setRecurrenceDraft((current) => ({
                            ...current,
                            monthlyDay: event.target.value,
                          }))
                        }
                        placeholder="1-31"
                      />
                    </div>
                  )}

                  {recurrenceError && <p className="error">{recurrenceError}</p>}

                  <div className="recurrence-dialog-actions">
                    <button
                      type="button"
                      className="new-task-add"
                      onClick={() => void completeRecurrenceSetup()}
                      disabled={saving}
                    >
                      Complete
                    </button>
                    <button type="button" className="ghost recurrence-cancel-btn" onClick={closeRecurrenceDialog}>
                      Cancel
                    </button>
                  </div>
                </div>
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

            <section className="subtask-panel" aria-label="Create and list subtasks">
              <p className="status-title">Create Subtask</p>
              <div className="subtask-form">
                <div className="subtask-input-row">
                  <input
                    className="subtask-title-input"
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && subtaskTitle.trim()) {
                        void handleCreateSubtaskClick()
                      }
                    }}
                    placeholder="Subtask title"
                  />
                  <label className="subtask-date-picker" htmlFor="subtask-date" aria-label="Select subtask date">
                    <input
                      id="subtask-date"
                      className="subtask-date-input"
                      type="date"
                      value={subtaskDate}
                      onClick={openDatePickerFromEvent}
                      onFocus={openDatePickerFromEvent}
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
                  <button
                    type="button"
                    key={subtask.id}
                    className="subtask-item subtask-item--link"
                    role="listitem"
                    onClick={() => onSelectTask(subtask.id)}
                  >
                    <span className="subtask-item__title">{subtask.title}</span>
                    <span className="subtask-item__date">{formatSubtaskDate(subtask.end_date)}</span>
                  </button>
                ))}
              </div>
            </section>


            <div className="details-footer">
              <button type="button" className="delete-task" onClick={() => void handleDeleteClick()} disabled={!selectedTask}>
                Delete
              </button>
            </div>

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
