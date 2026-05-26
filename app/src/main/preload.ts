import { contextBridge, ipcRenderer } from 'electron'
import type {
  CategoryCreatePayload,
  CategoryCreateResult,
  Category,
  CustomFreeDay,
  CustomFreeDayPayload,
  Dependency,
  DependencyPayload,
  ProjectCreatePayload,
  ProjectCreateResult,
  Project,
  TagCreatePayload,
  TagCreateResult,
  Tag,
  TaskCreatePayload,
  TaskCreateResult,
  TaskUpdatePayload,
  TaskUpdateResult,
  TaskWithRelations,
} from '../common/types'

const taskAppApi = {
  listTasks: (): Promise<TaskWithRelations[]> => ipcRenderer.invoke('tasks:list'),
  updateTask: (taskId: number, payload: TaskUpdatePayload): Promise<TaskUpdateResult> =>
    ipcRenderer.invoke('tasks:update', taskId, payload),
  deleteTask: (taskId: number, scope: 'single' | 'future' | 'all' = 'single'): Promise<void> =>
    ipcRenderer.invoke('tasks:delete', taskId, scope),
  createTask: (payload: TaskCreatePayload): Promise<TaskCreateResult> => ipcRenderer.invoke('tasks:create', payload),
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  createProject: (payload: ProjectCreatePayload): Promise<ProjectCreateResult> =>
    ipcRenderer.invoke('projects:create', payload),
  deleteProject: (projectId: number, keepAssociatedTasks: boolean): Promise<void> =>
    ipcRenderer.invoke('projects:delete', projectId, keepAssociatedTasks),
  listTags: (): Promise<Tag[]> => ipcRenderer.invoke('tags:list'),
  createTag: (payload: TagCreatePayload): Promise<TagCreateResult> => ipcRenderer.invoke('tags:create', payload),
  deleteTag: (tagId: number, keepAssociatedTasks: boolean): Promise<void> =>
    ipcRenderer.invoke('tags:delete', tagId, keepAssociatedTasks),
  listCategories: (): Promise<Category[]> => ipcRenderer.invoke('categories:list'),
  createCategory: (payload: CategoryCreatePayload): Promise<CategoryCreateResult> =>
    ipcRenderer.invoke('categories:create', payload),
  deleteCategory: (categoryId: number, keepAssociatedTasks: boolean): Promise<void> =>
    ipcRenderer.invoke('categories:delete', categoryId, keepAssociatedTasks),
  listDependencies: (): Promise<Dependency[]> => ipcRenderer.invoke('dependencies:list'),
  addDependency: (payload: DependencyPayload): Promise<void> =>
    ipcRenderer.invoke('dependencies:add', payload),
  removeDependency: (payload: DependencyPayload): Promise<void> =>
    ipcRenderer.invoke('dependencies:remove', payload),
  listFreeDays: (): Promise<CustomFreeDay[]> => ipcRenderer.invoke('freeDays:list'),
  addFreeDay: (payload: CustomFreeDayPayload): Promise<void> => ipcRenderer.invoke('freeDays:add', payload),
  removeFreeDay: (date: string): Promise<void> => ipcRenderer.invoke('freeDays:remove', date),
  exportData: (): Promise<{ success: boolean; taskCount?: number; error?: string }> =>
    ipcRenderer.invoke('data:export'),
  importData: (): Promise<{ success: boolean; taskCount?: number; totalRecords?: number; error?: string }> =>
    ipcRenderer.invoke('data:import'),
}

contextBridge.exposeInMainWorld('taskAppApi', taskAppApi)

export type TaskAppApi = typeof taskAppApi
