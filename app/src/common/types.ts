export type Priority = 1 | 2 | 3
export type Recurrence = 'none' | 'weekly' | 'monthly'
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Project {
  id: number
  name: string
  color: string
  created_at: string
}

export interface Category {
  id: number
  name: string
  created_at: string
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface Task {
  id: number
  title: string
  description: string | null
  created_at: string | null
  start_date: string | null
  end_date: string | null
  priority: Priority
  story_points: number
  project_id: number | null
  category_id: number | null
  parent_task_id: number | null
  recurrence: Recurrence
  recurrence_rule: string | null
  previous_recurrent_id: number | null
  status: TaskStatus
  start_time: string | null
  end_time: string | null
}

export interface TaskWithRelations extends Task {
  project_name: string | null
  category_name: string | null
  tag_ids: string | null
  tag_names: string | null
}

export interface TaskUpdatePayload {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: Priority
  story_points?: number
  start_date?: string | null
  end_date?: string | null
  project_id?: number | null
  category_id?: number | null
  tag_ids?: number[]
  recurrence?: Recurrence
  recurrence_rule?: string | null
  previous_recurrent_id?: number | null
}

export interface TaskCreatePayload {
  title: string
  start_date?: string | null
  end_date?: string | null
  parent_task_id?: number | null
  project_id?: number | null
  category_id?: number | null
  tag_ids?: number[]
  recurrence?: Recurrence
  recurrence_rule?: string | null
  previous_recurrent_id?: number | null
}

export interface TaskCreateResult {
  taskId: number
}

export interface ProjectCreatePayload {
  name: string
  color: string
}

export interface ProjectCreateResult {
  projectId: number
}

export interface TagCreatePayload {
  name: string
  color: string
}

export interface TagCreateResult {
  tagId: number
}

export interface CategoryCreatePayload {
  name: string
}

export interface CategoryCreateResult {
  categoryId: number
}

export interface Dependency {
  task_id: number
  depends_on_task_id: number
}
