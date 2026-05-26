import type { TaskWithRelations } from '../../common/types'

export type GroupBy = 'category' | 'project' | 'status' | 'priority'

export interface TaskNode {
  task: TaskWithRelations
  children: TaskNode[]
  orderIndex: number
}

export interface TaskGroupSection {
  groupBy: GroupBy
  groupLabel: string
  groupTitle: string
  nodes: TaskNode[]
}

export function buildTaskTree(tasks: TaskWithRelations[]): TaskNode[] {
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

export function groupTasks(tasks: TaskNode[], groupBy: GroupBy): TaskGroupSection[] {
  const groups = new Map<string, TaskGroupSection>()

  tasks.forEach((node) => {
    const groupLabel = getGroupLabel(node.task, groupBy)
    const groupTitle = `${getGroupLabelHeading(groupBy)}: ${groupLabel}`

    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, {
        groupBy,
        groupLabel,
        groupTitle,
        nodes: [node],
      })
      return
    }

    groups.get(groupLabel)?.nodes.push(node)
  })

  return Array.from(groups.values()).sort((left, right) => {
    const leftIsFallback = isFallbackGroupLabel(left.groupLabel)
    const rightIsFallback = isFallbackGroupLabel(right.groupLabel)

    if (leftIsFallback !== rightIsFallback) {
      return leftIsFallback ? 1 : -1
    }

    return left.groupLabel.localeCompare(right.groupLabel)
  })
}

function isFallbackGroupLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase()
  return normalized.startsWith('no ') || normalized === 'none' || normalized === '-'
}

export function getGroupLabel(task: TaskWithRelations, groupBy: GroupBy): string {
  if (groupBy === 'project') {
    return task.project_name ?? 'No project'
  }

  if (groupBy === 'category') {
    return task.category_name ?? 'No category'
  }

  if (groupBy === 'priority') {
    return formatPriorityLabel(task.priority)
  }

  return formatStatusLabel(task.status)
}

export function getGroupLabelHeading(groupBy: GroupBy): string {
  return groupBy.charAt(0).toUpperCase() + groupBy.slice(1)
}

export function formatStatusLabel(status: TaskWithRelations['status']): string {
  const statusMap: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
  }

  return statusMap[status] ?? status
}

export function formatPriorityLabel(priority: number): string {
  const priorityMap: Record<number, string> = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
  }

  return priorityMap[priority] ?? `Priority ${priority}`
}
