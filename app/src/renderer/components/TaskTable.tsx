import { useState, type ReactNode } from 'react'
import type { TaskWithRelations } from '../../common/types'

type SortField = 'title' | 'project' | 'category' | 'priority' | 'story_points' | 'status' | 'end_date'

interface TaskTableProps {
  tasks: TaskWithRelations[]
  onSelectTask: (taskId: number) => void
  selectedTaskId: number | null
  projectId: number | null
  categoryId: number | null
  tagId: number | null
  onCreateTask: (title: string) => Promise<void>
}

function TaskTable({ tasks, onSelectTask, selectedTaskId, projectId, categoryId, tagId, onCreateTask }: TaskTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

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

  async function handleCreateNewTask(): Promise<void> {
    if (!newTaskTitle.trim()) {
      return
    }

    setCreatingTask(true)

    try {
      await onCreateTask(newTaskTitle.trim())
      setNewTaskTitle('')
    } finally {
      setCreatingTask(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      void handleCreateNewTask()
    }
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="sortable" onClick={() => handleSortClick('title')}>
              Title {sortField === 'title' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('project')}>
              Project {sortField === 'project' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('category')}>
              Category {sortField === 'category' && (sortAsc ? '↑' : '↓')}
            </th>
            <th>Tags</th>
            <th className="sortable" onClick={() => handleSortClick('priority')}>
              Priority {sortField === 'priority' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('story_points')}>
              Story Points {sortField === 'story_points' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('status')}>
              Status {sortField === 'status' && (sortAsc ? '↑' : '↓')}
            </th>
            <th className="sortable" onClick={() => handleSortClick('end_date')}>
              End Date {sortField === 'end_date' && (sortAsc ? '↑' : '↓')}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="new-task-row">
            <td>
              <input
                type="text"
                className="new-task-input"
                placeholder="Add new task..."
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={creatingTask}
              />
            </td>
            <td>{projectId ? '(inherited)' : '-'}</td>
            <td>{categoryId ? '(inherited)' : '-'}</td>
            <td>{tagId ? '(inherited)' : '-'}</td>
            <td colSpan={4} className="new-task-actions">
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
          {taskTree.map((node) => renderTaskRow(node, 0, selectedTaskId, onSelectTask))}
        </tbody>
      </table>
    </div>
  )
}

interface TaskNode {
  task: TaskWithRelations
  children: TaskNode[]
  orderIndex: number
}

function buildTaskTree(tasks: TaskWithRelations[]): TaskNode[] {
  const nodeById = new Map<number, TaskNode>()
  const childMap = new Map<number, TaskNode[]>()
  const roots: TaskNode[] = []

  tasks.forEach((task, orderIndex) => {
    nodeById.set(task.id, { task, children: [], orderIndex })
  })

  for (const node of nodeById.values()) {
    const parentKey = node.task.parent_task_id

    if (parentKey === null || !nodeById.has(parentKey)) {
      roots.push(node)
    } else {
      const siblings = childMap.get(parentKey) ?? []
      siblings.push(node)
      childMap.set(parentKey, siblings)
    }
  }

  const sortByOrder = (left: TaskNode, right: TaskNode) => left.orderIndex - right.orderIndex

  for (const node of nodeById.values()) {
    node.children = (childMap.get(node.task.id) ?? []).sort(sortByOrder)
  }

  return roots.sort(sortByOrder)
}

function renderTaskRow(
  node: TaskNode,
  depth: number,
  selectedTaskId: number | null,
  onSelectTask: (taskId: number) => void,
): ReactNode[] {
  const { task, children } = node
  const isSubtask = depth > 0

  return [
    <tr
      key={task.id}
      data-details-trigger="open"
      className={selectedTaskId === task.id ? `row-selected ${isSubtask ? 'task-row--subtask' : ''}` : isSubtask ? 'task-row--subtask' : undefined}
      onClick={() => onSelectTask(task.id)}
    >
      <td className={isSubtask ? 'task-title-cell task-title-cell--subtask' : 'task-title-cell'}>
        {isSubtask && <span className="task-subtask-marker" aria-hidden="true">↳</span>}
        <span>{task.title}</span>
        {isSubtask && <span className="task-subtask-badge">Subtask</span>}
      </td>
      <td>{task.project_name ?? '-'}</td>
      <td>{task.category_name ?? '-'}</td>
      <td>{task.tag_names ?? '-'}</td>
      <td>{task.priority === 1 ? 'Low' : task.priority === 2 ? 'Medium' : 'High'}</td>
      <td>{task.story_points}</td>
      <td>{task.status}</td>
      <td>{task.end_date ?? '-'}</td>
    </tr>,
    ...children.flatMap((child) => renderTaskRow(child, depth + 1, selectedTaskId, onSelectTask)),
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
