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
  const [draft, setDraft] = useState<TaskDraft>(createEmptyDraft())
  const [saving, setSaving] = useState(false)
  const [showSubtaskCreator, setShowSubtaskCreator] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [subtaskDate, setSubtaskDate] = useState('')
  const [creatingSubtask, setCreatingSubtask] = useState(false)

  useEffect(() => {
    if (!open) {
      setDraft(createEmptyDraft())
      setShowSubtaskCreator(false)
      setSubtaskTitle('')
      setSubtaskDate('')
      return
    }

    if (!selectedTask) {
      setDraft(createEmptyDraft())
      setShowSubtaskCreator(false)
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
    setShowSubtaskCreator(false)
    setSubtaskTitle('')
    setSubtaskDate('')
  }, [open, selectedTask])

  const statusTargets = useMemo(() => {
    if (draft.status === 'todo') {
      return ['in_progress'] as TaskStatus[]
    }

    if (draft.status === 'in_progress') {
      return ['todo', 'done'] as TaskStatus[]
    }

    return ['in_progress'] as TaskStatus[]
  }, [draft.status])

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

    void persistUpdate({ end_date: nextDueDate }, 'Due date updated.')
  }

  function handleStatusChange(nextStatus: TaskStatus): void {
    setDraft((current) => ({ ...current, status: nextStatus }))
    void persistUpdate({ status: nextStatus }, `Status changed to ${getStatusLabel(nextStatus)}.`)
  }

  function handleTagToggle(tagId: number): void {
    setDraft((current) => {
      const exists = current.tagIds.includes(tagId)
      const nextTagIds = exists ? current.tagIds.filter((id) => id !== tagId) : [...current.tagIds, tagId]
      void persistUpdate({ tag_ids: nextTagIds }, 'Tags updated.')
      return { ...current, tagIds: nextTagIds }
    })
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
      setShowSubtaskCreator(false)
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

            <section className="status-section">
              <p className="status-title">Status Switch</p>
              <div className="status-switch" role="group" aria-label="Task status updates">
                {statusTargets.map((status) => (
                  <button
                    type="button"
                    key={status}
                    className="status-option"
                    onClick={() => handleStatusChange(status)}
                  >
                    {getStatusLabel(status)}
                  </button>
                ))}
              </div>
            </section>

            <div className="subtask-actions">
              <button
                type="button"
                className="subtask-toggle"
                onClick={() => setShowSubtaskCreator((current) => !current)}
                disabled={!selectedTask}
              >
                Create Subtask
              </button>
              <p className="muted">The subtask inherits the parent project automatically.</p>
            </div>

            {showSubtaskCreator && (
              <div className="subtask-form" role="group" aria-label="Create subtask">
                <input
                  value={subtaskTitle}
                  onChange={(event) => setSubtaskTitle(event.target.value)}
                  placeholder="Subtask name"
                />
                <input type="date" value={subtaskDate} onChange={(event) => setSubtaskDate(event.target.value)} />
                <button
                  type="button"
                  className="subtask-add"
                  onClick={() => void handleCreateSubtaskClick()}
                  disabled={!subtaskTitle.trim() || creatingSubtask}
                >
                  ADD
                </button>
              </div>
            )}

            <label className="field-row">
              <span className="field-label">Title:</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                onBlur={(event) => maybeCommitTextField('title', event.target.value)}
                placeholder="Task title"
              />
            </label>

            <label className="field-row field-row--multiline">
              <span className="field-label">Description:</span>
              <textarea
                rows={5}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                onBlur={(event) => maybeCommitTextField('description', event.target.value)}
                placeholder="Add context"
              />
            </label>

            <label className="field-row">
              <span className="field-label">Project:</span>
              <select
                value={draft.projectId ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value === '' ? null : Number(event.target.value)
                  setDraft((current) => ({ ...current, projectId: nextValue }))
                }}
                onBlur={(event) => maybeCommitProject(event.target.value === '' ? null : Number(event.target.value))}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-row">
              <span className="field-label">Category:</span>
              <select
                value={draft.categoryId ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value === '' ? null : Number(event.target.value)
                  setDraft((current) => ({ ...current, categoryId: nextValue }))
                }}
                onBlur={(event) => maybeCommitCategory(event.target.value === '' ? null : Number(event.target.value))}
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-row">
              <span className="field-label">Type:</span>
              <select
                value={draft.type}
                onChange={(event) => {
                  const nextType = event.target.value as TaskType
                  setDraft((current) => ({ ...current, type: nextType }))
                }}
                onBlur={(event) => maybeCommitType(event.target.value as TaskType)}
              >
                <option value="task">Task</option>
                <option value="goal">Goal</option>
              </select>
            </label>

            <label className="field-row">
              <span className="field-label">Priority:</span>
              <select
                value={draft.priority}
                onChange={(event) => {
                  const nextPriority = Number(event.target.value)

                  setDraft((current) => ({
                    ...current,
                    priority: nextPriority,
                  }))
                }}
                onBlur={(event) => maybeCommitPriority(Number(event.target.value))}
              >
                <option value={1}>Low</option>
                <option value={2}>Medium</option>
                <option value={3}>High</option>
              </select>
            </label>

            <label className="field-row">
              <span className="field-label">Story Points:</span>
              <input
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
            </label>

            <label className="field-row">
              <span className="field-label">Start Date:</span>
              <input
                type="date"
                value={draft.startDate}
                disabled={draft.type === 'goal'}
                onChange={(event) => {
                  const nextStartDate = event.target.value
                  setDraft((current) => ({ ...current, startDate: nextStartDate }))
                }}
                onBlur={(event) => maybeCommitStartDate(event.target.value)}
              />
            </label>

            <label className="field-row">
              <span className="field-label">Due Date:</span>
              <input
                type="date"
                value={draft.endDate}
                disabled={draft.type === 'goal'}
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setDraft((current) => ({ ...current, endDate: nextEndDate }))
                }}
                onBlur={(event) => maybeCommitDueDate(event.target.value)}
              />
            </label>

            {draft.type === 'goal' && (
              <p className="muted">Goal dates are calculated automatically from its subtasks.</p>
            )}

            <label className="field-row">
              <span className="field-label">Recurrence:</span>
              <select
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
            </label>

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
              <label className="field-row">
                <span className="field-label">Day of Month:</span>
                <input
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
              </label>
            )}

            <fieldset className="tags-fieldset">
              <legend>Tags</legend>
              <div className="tags-editor">
                {tags.map((tag) => (
                  <label key={tag.id} className="tag-toggle">
                    <input
                      type="checkbox"
                      checked={draft.tagIds.includes(tag.id)}
                      onChange={() => handleTagToggle(tag.id)}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {saving && <p className="muted">Saving changes...</p>}

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

export default TaskDetailsSidebar
