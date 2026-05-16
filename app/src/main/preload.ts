import { contextBridge, ipcRenderer } from 'electron'
import type {
  CategoryCreatePayload,
  CategoryCreateResult,
  Category,
  ProjectCreatePayload,
  ProjectCreateResult,
  Project,
  TagCreatePayload,
  TagCreateResult,
  Tag,
  TaskCreatePayload,
  TaskCreateResult,
  TaskUpdatePayload,
  TaskWithRelations,
} from '../common/types'

const taskAppApi = {
  listTasks: (): Promise<TaskWithRelations[]> => ipcRenderer.invoke('tasks:list'),
  updateTask: (taskId: number, payload: TaskUpdatePayload): Promise<void> =>
    ipcRenderer.invoke('tasks:update', taskId, payload),
  deleteTask: (taskId: number): Promise<void> => ipcRenderer.invoke('tasks:delete', taskId),
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
}

contextBridge.exposeInMainWorld('taskAppApi', taskAppApi)

export type TaskAppApi = typeof taskAppApi
