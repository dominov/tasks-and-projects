import { useEffect, useMemo, useState, type RefObject } from 'react'
import type {
  Category,
  Project,
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
  endDate: string
  projectId: number | null
  categoryId: number | null
  tagIds: number[]
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
    priority: 2,
    storyPoints: 1,
    endDate: '',
    projectId: null,
    categoryId: null,
    tagIds: [],
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
      priority: selectedTask.priority,
      storyPoints: selectedTask.story_points,
      endDate: selectedTask.end_date ?? '',
      projectId: selectedTask.project_id,
      categoryId: selectedTask.category_id,
      tagIds: parseTagIds(selectedTask.tag_ids),
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
              <table className="subtask-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <input
                        value={subtaskTitle}
                        onChange={(event) => setSubtaskTitle(event.target.value)}
                        placeholder="Subtask name"
                      />
                    </td>
                    <td>
                      <input type="date" value={subtaskDate} onChange={(event) => setSubtaskDate(event.target.value)} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="subtask-add"
                        onClick={() => void handleCreateSubtaskClick()}
                        disabled={!subtaskTitle.trim() || creatingSubtask}
                      >
                        ADD
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
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
              <span className="field-label">Due Date:</span>
              <input
                type="date"
                value={draft.endDate}
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setDraft((current) => ({ ...current, endDate: nextEndDate }))
                }}
                onBlur={(event) => maybeCommitDueDate(event.target.value)}
              />
            </label>

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
