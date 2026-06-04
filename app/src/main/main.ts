import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { DATABASE_FILE_NAME, DEFAULT_DEV_SERVER_URL } from '../common/constants'
import {
  addBusinessDays,
  getBusinessDaysDistance,
  parseIsoDate,
  toIsoDate as toBusinessIsoDate,
} from '../common/businessDays'
import type {
  CategoryCreatePayload,
  CategoryCreateResult,
  CategoryUpdatePayload,
  Category,
  CustomFreeDay,
  CustomFreeDayPayload,
  Dependency,
  DependencyCascadeConflict,
  DependencyPayload,
  ProjectCreatePayload,
  ProjectCreateResult,
  ProjectUpdatePayload,
  Project,
  TagCreatePayload,
  TagCreateResult,
  TagUpdatePayload,
  Tag,
  TaskCreatePayload,
  TaskCreateResult,
  TaskStatus,
  TaskType,
  TaskUpdatePayload,
  TaskUpdateResult,
  TaskWithRelations,
} from '../common/types'
import { applyMigrations, openDatabase, type AppDatabase } from '../database/db'
import { exportDataToZip } from './services/exportService'
import { importDataFromZip } from './services/importService'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let db: AppDatabase | null = null

const allowedStatuses: TaskStatus[] = ['todo', 'in_progress', 'done']
const allowedTaskTypes: TaskType[] = ['task', 'goal']
const allowedDeleteScopes = ['single', 'future', 'all'] as const
type DeleteScope = (typeof allowedDeleteScopes)[number]

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged) {
    mainWindow.loadURL(DEFAULT_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

async function ensureDatabaseReady(): Promise<AppDatabase> {
  const dbFilePath = path.join(app.getPath('userData'), DATABASE_FILE_NAME)
  const database = await openDatabase(dbFilePath)
  applyMigrations(database)
  ensureTaskMetadataColumns(database)
  ensureTrackingOnlyColumn(database)
  ensureCategoryMetadataColumns(database)
  return database
}

function registerIpcHandlers(database: AppDatabase): void {
  ipcMain.handle('dialogs:confirm-keep-associated', async (): Promise<boolean> => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined
    const result = await dialog.showMessageBox(focusedWindow, {
      type: 'question',
      title: 'Keep Associated Tasks',
      message: 'Keep associated tasks?',
      detail: 'Choose Keep to preserve associated tasks, or delete to remove them too.',
      buttons: ['Keep', 'delete'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })

    return result.response === 0
  })

  ipcMain.handle('tasks:list', (): TaskWithRelations[] => {
    return database.query<TaskWithRelations>(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.created_at,
        t.start_date,
        t.end_date,
        t.priority,
        t.story_points,
        t.project_id,
        t.category_id,
        t.parent_task_id,
        t.recurrence,
        t.recurrence_rule,
        t.previous_recurrent_id,
        t.status,
        t.start_time,
        t.end_time,
        t.type,
        t.tracking_only,
        p.name AS project_name,
        c.name AS category_name,
        GROUP_CONCAT(DISTINCT tt.tag_id) AS tag_ids,
        GROUP_CONCAT(DISTINCT tg.name) AS tag_names
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN task_tags tt ON tt.task_id = t.id
      LEFT JOIN tags tg ON tg.id = tt.tag_id
      GROUP BY t.id
      ORDER BY t.end_date ASC, t.priority DESC
    `)
  })

  ipcMain.handle('tasks:update', (_event, rawTaskId: number, payload: TaskUpdatePayload): TaskUpdateResult => {
    const taskId = Number(rawTaskId)

    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid task ID')
    }

    const currentTask = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE id = ${taskId}`)
    if (!currentTask) throw new Error('Task not found')

    if (
      payload.start_date !== undefined &&
      payload.end_date !== undefined &&
      payload.start_date &&
      payload.end_date &&
      payload.start_date > payload.end_date
    ) {
      throw new Error('Start date cannot be after end date')
    }

    if (
      payload.start_date !== undefined &&
      payload.start_date &&
      payload.end_date === undefined &&
      currentTask.end_date &&
      payload.start_date > currentTask.end_date
    ) {
      throw new Error('Start date cannot be after end date')
    }

    if (
      payload.end_date !== undefined &&
      payload.end_date &&
      payload.start_date === undefined &&
      currentTask.start_date &&
      currentTask.start_date > payload.end_date
    ) {
      throw new Error('End date cannot be before start date')
    }

    const setClauses: string[] = []
    let statusChangedToDone = false
    let endDateChanged = false
    let dateDiffDays = 0
    const nextRecurrence = payload.recurrence ?? currentTask.recurrence
    const nextRecurrenceRule = payload.recurrence_rule !== undefined ? payload.recurrence_rule : currentTask.recurrence_rule
    const recurrenceConfigurationChanged = payload.recurrence !== undefined || payload.recurrence_rule !== undefined
    const recurrenceActuallyChanged =
      recurrenceConfigurationChanged
      && (nextRecurrence !== currentTask.recurrence || (nextRecurrenceRule ?? null) !== (currentTask.recurrence_rule ?? null))
    const previousParentTaskId = currentTask.parent_task_id
    let nextParentTaskId = currentTask.parent_task_id

    if (typeof payload.title === 'string') {
      setClauses.push(`title = '${escapeSqlString(payload.title)}'`)
    }

    if (payload.description !== undefined) {
      setClauses.push(
        payload.description === null
          ? 'description = NULL'
          : `description = '${escapeSqlString(payload.description)}'`,
      )
    }

    if (payload.status !== undefined) {
      if (!allowedStatuses.includes(payload.status)) {
        throw new Error('Invalid task status')
      }

      setClauses.push(`status = '${payload.status}'`)
      if (payload.status === 'done' && currentTask.status !== 'done') {
        statusChangedToDone = true
      }
    }

    if (payload.type !== undefined) {
      if (!allowedTaskTypes.includes(payload.type)) {
        throw new Error('Invalid task type')
      }

      setClauses.push(`type = '${payload.type}'`)
    }

    if (payload.tracking_only !== undefined) {
      const trackingOnly = payload.tracking_only ? 1 : 0
      setClauses.push(`tracking_only = ${trackingOnly}`)
    }

    if (payload.priority !== undefined) {
      if (![1, 2, 3].includes(payload.priority)) {
        throw new Error('Invalid priority value')
      }

      setClauses.push(`priority = ${payload.priority}`)
    }

    if (payload.story_points !== undefined) {
      const storyPoints = Number(payload.story_points)

      if (!Number.isInteger(storyPoints) || storyPoints < 0) {
        throw new Error('Invalid story points value')
      }

      setClauses.push(`story_points = ${storyPoints}`)
    }

    if (payload.start_date !== undefined) {
      setClauses.push(
        payload.start_date === null ? 'start_date = NULL' : `start_date = '${escapeSqlString(payload.start_date)}'`,
      )
    }

    if (payload.end_date !== undefined) {
      setClauses.push(
        payload.end_date === null ? 'end_date = NULL' : `end_date = '${escapeSqlString(payload.end_date)}'`,
      )
      
      if (payload.end_date !== currentTask.end_date) {
        endDateChanged = true
        if (payload.end_date && currentTask.end_date) {
          const oldDate = parseIsoDate(currentTask.end_date)
          const newDate = parseIsoDate(payload.end_date)
          dateDiffDays = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24))
        }
      }
    }

    if (payload.project_id !== undefined) {
      if (payload.project_id === null) {
        setClauses.push('project_id = NULL')
      } else {
        const projectId = Number(payload.project_id)

        if (!Number.isInteger(projectId) || projectId <= 0) {
          throw new Error('Invalid project value')
        }

        setClauses.push(`project_id = ${projectId}`)
      }
    }

    if (payload.parent_task_id !== undefined) {
      if (payload.parent_task_id === null) {
        setClauses.push('parent_task_id = NULL')
        nextParentTaskId = null
      } else {
        const parentTaskId = Number(payload.parent_task_id)

        if (!Number.isInteger(parentTaskId) || parentTaskId <= 0) {
          throw new Error('Invalid parent task value')
        }

        if (parentTaskId === taskId) {
          throw new Error('A task cannot be its own parent')
        }

        const parentTask = database.first<{ id: number }>(`SELECT id FROM tasks WHERE id = ${parentTaskId} LIMIT 1;`)

        if (!parentTask) {
          throw new Error('Parent task not found')
        }

        setClauses.push(`parent_task_id = ${parentTaskId}`)
        nextParentTaskId = parentTaskId
      }
    }

    if (payload.category_id !== undefined) {
      if (payload.category_id === null) {
        setClauses.push('category_id = NULL')
      } else {
        const categoryId = Number(payload.category_id)

        if (!Number.isInteger(categoryId) || categoryId <= 0) {
          throw new Error('Invalid category value')
        }

        setClauses.push(`category_id = ${categoryId}`)
      }
    }

    if (payload.recurrence !== undefined) {
      setClauses.push(`recurrence = '${payload.recurrence}'`)
    }

    if (payload.recurrence_rule !== undefined) {
      setClauses.push(
        payload.recurrence_rule === null
          ? 'recurrence_rule = NULL'
          : `recurrence_rule = '${escapeSqlString(payload.recurrence_rule)}'`,
      )
    }

    if (payload.previous_recurrent_id !== undefined) {
      setClauses.push(
        payload.previous_recurrent_id === null
          ? 'previous_recurrent_id = NULL'
          : `previous_recurrent_id = ${payload.previous_recurrent_id}`,
      )
    }

    const statements: string[] = []

    if (setClauses.length > 0) {
      statements.push(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ${taskId};`)
    }

    if (payload.tag_ids !== undefined) {
      const normalizedTagIds = Array.from(
        new Set(payload.tag_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)),
      )

      statements.push(`DELETE FROM task_tags WHERE task_id = ${taskId};`)

      for (const tagId of normalizedTagIds) {
        statements.push(`INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (${taskId}, ${tagId});`)
      }
    }

    if (statements.length > 0) {
      database.transaction(statements)
    }

    // After transaction, handle logic
    if (statusChangedToDone) {
      // Break link: Update next task by changing its previous_recurrent_id to NULL
      const nextTask = database.first<TaskWithRelations>(`SELECT id FROM tasks WHERE previous_recurrent_id = ${taskId}`)
      if (nextTask) {
        database.execute(`UPDATE tasks SET previous_recurrent_id = NULL WHERE id = ${nextTask.id}`)
        // Append to end: ensure 4 iterations
        ensureIterations(database, nextTask.id)
      }
    }

    if (endDateChanged && dateDiffDays !== 0 && !recurrenceActuallyChanged) {
      handleChainShift(database, taskId, dateDiffDays)
    }

    if (recurrenceActuallyChanged) {
      deleteFutureRecurrenceChain(database, taskId)

      if (nextRecurrence && nextRecurrence !== 'none' && nextRecurrenceRule) {
        ensureIterations(database, taskId)
      }
    }

    if (currentTask.parent_task_id !== null) {
      recalculateGoalBounds(database, currentTask.parent_task_id)
    }

    if (nextParentTaskId !== null && nextParentTaskId !== currentTask.parent_task_id) {
      recalculateGoalBounds(database, nextParentTaskId)
    }

    if (nextParentTaskId !== previousParentTaskId && previousParentTaskId !== null) {
      recalculateGoalBounds(database, previousParentTaskId)
    }

    // Cascade dependency shift when this task's end_date moved.
    let conflicts: DependencyCascadeConflict[] = []

    if (endDateChanged) {
      const refreshed = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE id = ${taskId}`)

      if (refreshed?.end_date) {
        conflicts = cascadeDependencyShift(database, taskId, refreshed.end_date)
      }
    }

    return { conflicts }
  })

  ipcMain.handle('tasks:delete', (_event, rawTaskId: number, rawScope: DeleteScope = 'single'): void => {
    const taskId = Number(rawTaskId)
    const scope = rawScope ?? 'single'

    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid task ID')
    }

    if (!allowedDeleteScopes.includes(scope)) {
      throw new Error('Invalid delete scope')
    }

    const currentTask = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE id = ${taskId}`)
    if (!currentTask) return

    if (scope === 'future' || scope === 'all') {
      const chainStartId = scope === 'all' ? getRecurrenceChainHeadId(database, taskId) : taskId
      const chainIds = getForwardRecurrenceChainIds(database, chainStartId)

      if (chainIds.length === 0) {
        return
      }

      const parentTaskIds = getParentTaskIdsForTaskIds(database, chainIds)
      deleteTasksByIds(database, chainIds)

      for (const parentId of parentTaskIds) {
        recalculateGoalBounds(database, parentId)
      }

      return
    }

    const parentTaskId = currentTask.parent_task_id

    const prevId = currentTask.previous_recurrent_id
    const nextTask = database.first<TaskWithRelations>(`SELECT id FROM tasks WHERE previous_recurrent_id = ${taskId}`)

    database.transaction([
      `DELETE FROM task_tags WHERE task_id = ${taskId};`,
      `DELETE FROM dependencies WHERE task_id = ${taskId} OR depends_on_task_id = ${taskId};`,
      `DELETE FROM tasks WHERE id = ${taskId};`,
    ])

    if (nextTask) {
      database.execute(`UPDATE tasks SET previous_recurrent_id = ${prevId ?? 'NULL'} WHERE id = ${nextTask.id}`)
      // After relinking, ensure we still have 4 iterations from the start of the chain (or just ensure from current position)
      // Actually, to be safe, find the head and ensure iterations.
      let headId = nextTask.id
      while (true) {
        const p = database.first<{ previous_recurrent_id: number | null }>(`SELECT previous_recurrent_id FROM tasks WHERE id = ${headId}`)
        if (!p || !p.previous_recurrent_id) break
        headId = p.previous_recurrent_id
      }
      ensureIterations(database, headId)
    }

    if (parentTaskId !== null) {
      recalculateGoalBounds(database, parentTaskId)
    }
  })

  ipcMain.handle('tasks:create', (_event, payload: TaskCreatePayload): TaskCreateResult => {
    const title = payload.title.trim()

    if (!title) {
      throw new Error('Task title is required')
    }

    let projectId: number | null = payload.project_id ?? null

    if (payload.parent_task_id !== undefined && payload.parent_task_id !== null) {
      const parentTaskId = Number(payload.parent_task_id)

      if (!Number.isInteger(parentTaskId) || parentTaskId <= 0) {
        throw new Error('Invalid parent task ID')
      }

      const parentTask = database.first<{ project_id: number | null }>(
        `SELECT project_id FROM tasks WHERE id = ${parentTaskId} LIMIT 1;`,
      )

      if (!parentTask) {
        throw new Error('Parent task not found')
      }

      projectId = parentTask.project_id
    }

    let categoryId: number | null = payload.category_id ?? null

    let priority = payload.priority ?? 2

    if (![1, 2, 3].includes(priority)) {
      throw new Error('Invalid priority value')
    }

    if (categoryId !== null) {
      const catId = Number(categoryId)

      if (!Number.isInteger(catId) || catId <= 0) {
        throw new Error('Invalid category ID')
      }

      categoryId = catId
    }

    // Insert the task first
    const taskType = payload.type ?? 'task'

    if (!allowedTaskTypes.includes(taskType)) {
      throw new Error('Invalid task type')
    }

    database.execute(`
      INSERT INTO tasks (
        title,
        description,
        created_at,
        start_date,
        end_date,
        priority,
        story_points,
        project_id,
        category_id,
        parent_task_id,
        recurrence,
        recurrence_rule,
        previous_recurrent_id,
        status,
        start_time,
        end_time,
        type
      ) VALUES (
        '${escapeSqlString(title)}',
        NULL,
        datetime('now'),
        ${payload.start_date === undefined || payload.start_date === null ? 'NULL' : `'${escapeSqlString(payload.start_date)}'`},
        ${payload.end_date === undefined || payload.end_date === null ? 'NULL' : `'${escapeSqlString(payload.end_date)}'`},
        ${priority},
        1,
        ${projectId === null ? 'NULL' : projectId},
        ${categoryId === null ? 'NULL' : categoryId},
        ${payload.parent_task_id === undefined || payload.parent_task_id === null ? 'NULL' : Number(payload.parent_task_id)},
        '${payload.recurrence ?? 'none'}',
        ${payload.recurrence_rule === undefined || payload.recurrence_rule === null ? 'NULL' : `'${escapeSqlString(payload.recurrence_rule)}'`},
        ${payload.previous_recurrent_id === undefined || payload.previous_recurrent_id === null ? 'NULL' : Number(payload.previous_recurrent_id)},
        'todo',
        NULL,
        NULL,
        '${taskType}'
      );
    `)

    const row = database.first<{ taskId: number }>('SELECT last_insert_rowid() AS taskId')

    if (!row) {
      throw new Error('Unable to create task')
    }

    const taskId = row.taskId

    if (payload.recurrence && payload.recurrence !== 'none' && payload.recurrence_rule) {
      ensureIterations(database, taskId)
    }

    if (payload.parent_task_id !== undefined && payload.parent_task_id !== null) {
      recalculateGoalBounds(database, Number(payload.parent_task_id))
    }

    if (taskType === 'goal') {
      recalculateGoalBounds(database, taskId)
    }

    // Add tags if provided
    if (payload.tag_ids !== undefined && Array.isArray(payload.tag_ids)) {
      const normalizedTagIds = Array.from(
        new Set(
          payload.tag_ids
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
        ),
      )

      const tagStatements: string[] = []

      for (const tagId of normalizedTagIds) {
        tagStatements.push(`INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (${taskId}, ${tagId});`)
      }

      if (tagStatements.length > 0) {
        database.transaction(tagStatements)
      }
    }

    return { taskId }
  })

  ipcMain.handle('projects:list', (): Project[] => {
    return database.query<Project>('SELECT id, name, color, created_at FROM projects ORDER BY id ASC')
  })

  ipcMain.handle('projects:create', (_event, payload: ProjectCreatePayload): ProjectCreateResult => {
    const name = payload.name.trim()

    if (!name) {
      throw new Error('Project name is required')
    }

    const color = normalizeHexColor(payload.color)

    database.execute(`
      INSERT INTO projects (name, color, created_at)
      VALUES ('${escapeSqlString(name)}', '${color}', datetime('now'));
    `)

    const row = database.first<{ projectId: number }>('SELECT last_insert_rowid() AS projectId')

    if (!row) {
      throw new Error('Unable to create project')
    }

    return { projectId: row.projectId }
  })

  ipcMain.handle('projects:update', (_event, rawProjectId: number, payload: ProjectUpdatePayload): void => {
    const projectId = Number(rawProjectId)

    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new Error('Invalid project ID')
    }

    const setClauses: string[] = []

    if (typeof payload.name === 'string') {
      const name = payload.name.trim()

      if (!name) {
        throw new Error('Project name is required')
      }

      setClauses.push(`name = '${escapeSqlString(name)}'`)
    }

    if (typeof payload.color === 'string') {
      setClauses.push(`color = '${normalizeHexColor(payload.color)}'`)
    }

    if (setClauses.length === 0) {
      throw new Error('No project fields to update')
    }

    database.execute(`
      UPDATE projects
      SET ${setClauses.join(', ')}
      WHERE id = ${projectId};
    `)
  })

  ipcMain.handle('projects:delete', (_event, rawProjectId: number, keepAssociatedTasks: boolean): void => {
    const projectId = Number(rawProjectId)

    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new Error('Invalid project ID')
    }

    const statements: string[] = []

    if (!keepAssociatedTasks) {
      statements.push(...buildTaskDeletionStatements(`project_id = ${projectId}`))
    }

    statements.push(`DELETE FROM projects WHERE id = ${projectId};`)
    database.transaction(statements)
  })

  ipcMain.handle('tags:list', (): Tag[] => {
    return database.query<Tag>('SELECT id, name, color FROM tags ORDER BY name ASC')
  })

  ipcMain.handle('tags:create', (_event, payload: TagCreatePayload): TagCreateResult => {
    const name = payload.name.trim()

    if (!name) {
      throw new Error('Tag name is required')
    }

    const color = normalizeHexColor(payload.color)

    database.execute(`
      INSERT INTO tags (name, color)
      VALUES ('${escapeSqlString(name)}', '${color}');
    `)

    const row = database.first<{ tagId: number }>('SELECT last_insert_rowid() AS tagId')

    if (!row) {
      throw new Error('Unable to create tag')
    }

    return { tagId: row.tagId }
  })

  ipcMain.handle('tags:update', (_event, rawTagId: number, payload: TagUpdatePayload): void => {
    const tagId = Number(rawTagId)

    if (!Number.isInteger(tagId) || tagId <= 0) {
      throw new Error('Invalid tag ID')
    }

    const setClauses: string[] = []

    if (typeof payload.name === 'string') {
      const name = payload.name.trim()

      if (!name) {
        throw new Error('Tag name is required')
      }

      setClauses.push(`name = '${escapeSqlString(name)}'`)
    }

    if (typeof payload.color === 'string') {
      setClauses.push(`color = '${normalizeHexColor(payload.color)}'`)
    }

    if (setClauses.length === 0) {
      throw new Error('No tag fields to update')
    }

    database.execute(`
      UPDATE tags
      SET ${setClauses.join(', ')}
      WHERE id = ${tagId};
    `)
  })

  ipcMain.handle('tags:delete', (_event, rawTagId: number, keepAssociatedTasks: boolean): void => {
    const tagId = Number(rawTagId)

    if (!Number.isInteger(tagId) || tagId <= 0) {
      throw new Error('Invalid tag ID')
    }

    const statements: string[] = []

    if (!keepAssociatedTasks) {
      statements.push(
        ...buildTaskDeletionStatements(
          `id IN (SELECT task_id FROM task_tags WHERE tag_id = ${tagId})`,
        ),
      )
    }

    statements.push(`DELETE FROM tags WHERE id = ${tagId};`)
    database.transaction(statements)
  })

  ipcMain.handle('categories:list', (): Category[] => {
    return database.query<Category>("SELECT id, name, COALESCE(color, '#64748b') AS color, created_at FROM categories ORDER BY name ASC")
  })

  ipcMain.handle('categories:create', (_event, payload: CategoryCreatePayload): CategoryCreateResult => {
    const name = payload.name.trim()

    if (!name) {
      throw new Error('Category name is required')
    }

    database.execute(`
      INSERT INTO categories (name, color, created_at)
      VALUES ('${escapeSqlString(name)}', '#64748b', datetime('now'));
    `)

    const row = database.first<{ categoryId: number }>('SELECT last_insert_rowid() AS categoryId')

    if (!row) {
      throw new Error('Unable to create category')
    }

    return { categoryId: row.categoryId }
  })

  ipcMain.handle('categories:update', (_event, rawCategoryId: number, payload: CategoryUpdatePayload): void => {
    const categoryId = Number(rawCategoryId)

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new Error('Invalid category ID')
    }

    const setClauses: string[] = []

    if (typeof payload.name === 'string') {
      const name = payload.name.trim()

      if (!name) {
        throw new Error('Category name is required')
      }

      setClauses.push(`name = '${escapeSqlString(name)}'`)
    }

    if (typeof payload.color === 'string') {
      setClauses.push(`color = '${normalizeHexColor(payload.color)}'`)
    }

    if (setClauses.length === 0) {
      throw new Error('No category fields to update')
    }

    database.execute(`
      UPDATE categories
      SET ${setClauses.join(', ')}
      WHERE id = ${categoryId};
    `)
  })

  ipcMain.handle('categories:delete', (_event, rawCategoryId: number, keepAssociatedTasks: boolean): void => {
    const categoryId = Number(rawCategoryId)

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new Error('Invalid category ID')
    }

    const statements: string[] = []

    if (!keepAssociatedTasks) {
      statements.push(...buildTaskDeletionStatements(`category_id = ${categoryId}`))
    }

    statements.push(`DELETE FROM categories WHERE id = ${categoryId};`)
    database.transaction(statements)
  })

  // --- Dependencies ----------------------------------------------------------

  ipcMain.handle('dependencies:list', (): Dependency[] => {
    return database.query<Dependency>(
      'SELECT task_id, depends_on_task_id FROM dependencies ORDER BY task_id ASC, depends_on_task_id ASC',
    )
  })

  ipcMain.handle('dependencies:add', (_event, payload: DependencyPayload): void => {
    const taskId = Number(payload?.task_id)
    const dependsOnId = Number(payload?.depends_on_task_id)

    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid task ID')
    }

    if (!Number.isInteger(dependsOnId) || dependsOnId <= 0) {
      throw new Error('Invalid predecessor task ID')
    }

    if (taskId === dependsOnId) {
      throw new Error('A task cannot depend on itself')
    }

    if (!database.first<{ id: number }>(`SELECT id FROM tasks WHERE id = ${taskId} LIMIT 1;`)) {
      throw new Error('Task not found')
    }

    if (!database.first<{ id: number }>(`SELECT id FROM tasks WHERE id = ${dependsOnId} LIMIT 1;`)) {
      throw new Error('Predecessor task not found')
    }

    if (wouldCreateDependencyCycle(database, taskId, dependsOnId)) {
      throw new Error('Adding this dependency would create a cycle')
    }

    database.execute(
      `INSERT OR IGNORE INTO dependencies (task_id, depends_on_task_id) VALUES (${taskId}, ${dependsOnId});`,
    )
  })

  ipcMain.handle('dependencies:remove', (_event, payload: DependencyPayload): void => {
    const taskId = Number(payload?.task_id)
    const dependsOnId = Number(payload?.depends_on_task_id)

    if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isInteger(dependsOnId) || dependsOnId <= 0) {
      throw new Error('Invalid dependency identifiers')
    }

    database.execute(
      `DELETE FROM dependencies WHERE task_id = ${taskId} AND depends_on_task_id = ${dependsOnId};`,
    )
  })

  // --- Custom free days ------------------------------------------------------

  ipcMain.handle('freeDays:list', (): CustomFreeDay[] => {
    return database.query<CustomFreeDay>('SELECT date, note FROM custom_free_days ORDER BY date ASC')
  })

  ipcMain.handle('freeDays:add', (_event, payload: CustomFreeDayPayload): void => {
    const date = String(payload?.date ?? '').trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Free day must be a YYYY-MM-DD date')
    }

    const note = payload?.note ?? null
    const noteSql = note === null ? 'NULL' : `'${escapeSqlString(note)}'`

    database.execute(
      `INSERT INTO custom_free_days (date, note) VALUES ('${date}', ${noteSql}) ON CONFLICT(date) DO UPDATE SET note = ${noteSql};`,
    )
  })

  ipcMain.handle('freeDays:remove', (_event, rawDate: string): void => {
    const date = String(rawDate ?? '').trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Free day must be a YYYY-MM-DD date')
    }

    database.execute(`DELETE FROM custom_free_days WHERE date = '${date}';`)
  })

  // --- Data Export/Import ----------------------------------------------------

  ipcMain.handle('data:export', async (): Promise<{ success: boolean; taskCount?: number; error?: string }> => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export Data',
        defaultPath: `taskapp_backup_${today}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      })

      if (result.canceled || !result.filePath) {
        return { success: false }
      }

      const { taskCount, buffer } = exportDataToZip(database)
      writeFileSync(result.filePath, buffer)

      return { success: true, taskCount }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('data:import', async (): Promise<{ success: boolean; taskCount?: number; totalRecords?: number; error?: string }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Data',
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        properties: ['openFile'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false }
      }

      const zipBuffer = readFileSync(result.filePaths[0])
      const importResult = importDataFromZip(database, zipBuffer)

      return { success: true, taskCount: importResult.taskCount, totalRecords: importResult.totalRecords }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed'
      return { success: false, error: message }
    }
  })
}

function buildTaskDeletionStatements(taskFilterSql: string): string[] {
  return [
    `DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE ${taskFilterSql});`,
    `DELETE FROM dependencies WHERE task_id IN (SELECT id FROM tasks WHERE ${taskFilterSql}) OR depends_on_task_id IN (SELECT id FROM tasks WHERE ${taskFilterSql});`,
    `DELETE FROM tasks WHERE ${taskFilterSql};`,
  ]
}

function ensureTaskMetadataColumns(database: AppDatabase): void {
  const columns = database.query<{ name: string }>('PRAGMA table_info(tasks);')
  const hasCreatedAtColumn = columns.some((column) => column.name === 'created_at')
  const hasTypeColumn = columns.some((column) => column.name === 'type')
  const hasRecurrenceColumn = columns.some((column) => column.name === 'recurrence')
  const hasRecurrenceRuleColumn = columns.some((column) => column.name === 'recurrence_rule')
  const hasPreviousRecurrentIdColumn = columns.some((column) => column.name === 'previous_recurrent_id')

  if (!hasCreatedAtColumn) {
    database.execute('ALTER TABLE tasks ADD COLUMN created_at TEXT;')
  }

  if (!hasTypeColumn) {
    database.execute("ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'task' CHECK(type IN ('task', 'goal'));")
  }

  if (!hasRecurrenceColumn) {
    database.execute("ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none' CHECK(recurrence IN ('none', 'weekly', 'monthly'));")
  }

  if (!hasRecurrenceRuleColumn) {
    database.execute('ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT;')
  }

  if (!hasPreviousRecurrentIdColumn) {
    database.execute('ALTER TABLE tasks ADD COLUMN previous_recurrent_id INTEGER;')
  }

  database.execute("UPDATE tasks SET created_at = datetime('now') WHERE created_at IS NULL;")
  database.execute("UPDATE tasks SET type = 'task' WHERE type IS NULL OR type NOT IN ('task', 'goal');")
  database.execute("UPDATE tasks SET recurrence = 'none' WHERE recurrence IS NULL OR recurrence NOT IN ('none', 'weekly', 'monthly');")
}

function ensureTrackingOnlyColumn(database: AppDatabase): void {
  const columns = database.query<{ name: string }>('PRAGMA table_info(tasks);')
  const hasTrackingOnly = columns.some((column) => column.name === 'tracking_only')

  if (!hasTrackingOnly) {
    database.execute('ALTER TABLE tasks ADD COLUMN tracking_only INTEGER NOT NULL DEFAULT 0;')
  }
}

function ensureCategoryMetadataColumns(database: AppDatabase): void {
  const columns = database.query<{ name: string }>("PRAGMA table_info('categories');")
  const hasColorColumn = columns.some((column) => column.name === 'color')

  if (!hasColorColumn) {
    database.execute("ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '#64748b';")
  }

  database.execute("UPDATE categories SET color = '#64748b' WHERE color IS NULL OR TRIM(color) = '';")
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

function normalizeHexColor(value: string): string {
  const normalized = value.trim()
  const hexColorPattern = /^#[0-9A-Fa-f]{6}$/

  if (!hexColorPattern.test(normalized)) {
    throw new Error('Color must be a valid hex value')
  }

  return normalized.toLowerCase()
}

// --- Recurrence & Date Helpers ---

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // 0 is Sunday, 6 is Saturday
}

function isHoliday(date: Date): boolean {
  const m = date.getMonth()
  const d = date.getDate()
  // Basic Colombian fixed holidays
  if (m === 0 && d === 1) return true // Jan 1
  if (m === 4 && d === 1) return true // May 1
  if (m === 6 && d === 20) return true // Jul 20
  if (m === 7 && d === 7) return true // Aug 7
  if (m === 11 && d === 8) return true // Dec 8
  if (m === 11 && d === 25) return true // Dec 25
  return false
}

function toIsoDate(date: Date): string {
  return toBusinessIsoDate(date)
}

function getNextValidDate(date: Date, recurrence: 'weekly' | 'monthly', rule: string): Date {
  const next = new Date(date)
  
  if (recurrence === 'weekly') {
    const allowedDays = rule.split(',').map(Number) // 0-6 (Sun-Sat)
    if (allowedDays.length === 0) return next
    
    do {
      next.setDate(next.getDate() + 1)
    } while (!allowedDays.includes(next.getDay()) || isHoliday(next))
    
    // If it's a weekend and not in allowedDays, it will be skipped by the while loop.
    // If it's a holiday, it will be skipped.
  } else if (recurrence === 'monthly') {
    const dayOfMonth = Number(rule)
    next.setMonth(next.getMonth() + 1)
    next.setDate(dayOfMonth)
    // Handle months with fewer days
    if (next.getDate() !== dayOfMonth) {
      next.setDate(0) // Last day of previous month
    }
    
    // If it falls on weekend/holiday, move to next business day
    while (isWeekend(next) || isHoliday(next)) {
      next.setDate(next.getDate() + 1)
    }
  }
  
  return next
}

function ensureIterations(database: AppDatabase, taskId: number): void {
  const task = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE id = ${taskId}`)
  if (!task || task.recurrence === 'none' || !task.recurrence_rule) return

  // Check how many iterations we already have
  let count = 0
  let lastId = taskId
  let lastTask = task
  
  let nextTaskFound = true
  while (nextTaskFound) {
    const nextTask = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE previous_recurrent_id = ${lastId}`)
    if (nextTask) {
      lastId = nextTask.id
      lastTask = nextTask
      count++
    } else {
      nextTaskFound = false
    }
  }

  // Generate up to 4 iterations in total (previews)
  const needed = 4 - count
  for (let i = 0; i < needed; i++) {
    if (!lastTask) break

    const baseDate = lastTask.end_date ? parseIsoDate(lastTask.end_date) : new Date()
    const nextDate = getNextValidDate(
      baseDate,
      task.recurrence as 'weekly' | 'monthly',
      task.recurrence_rule!
    )

    // Calculate start date by keeping the same duration if possible
    let nextStartDate: string | null = null
    if (task.start_date && task.end_date) {
      const duration = parseIsoDate(task.end_date).getTime() - parseIsoDate(task.start_date).getTime()
      const start = new Date(nextDate.getTime() - duration)
      nextStartDate = toIsoDate(start)
    }

    database.execute(`
      INSERT INTO tasks (
        title, description, created_at, start_date, end_date, priority, story_points,
        project_id, category_id, parent_task_id, recurrence, recurrence_rule,
        previous_recurrent_id, status
      ) VALUES (
        '${escapeSqlString(task.title)}',
        ${task.description ? `'${escapeSqlString(task.description)}'` : 'NULL'},
        datetime('now'),
        ${nextStartDate ? `'${nextStartDate}'` : 'NULL'},
        '${toIsoDate(nextDate)}',
        ${task.priority},
        ${task.story_points},
        ${task.project_id ?? 'NULL'},
        ${task.category_id ?? 'NULL'},
        ${task.parent_task_id ?? 'NULL'},
        '${task.recurrence}',
        '${escapeSqlString(task.recurrence_rule!)}',
        ${lastId},
        'todo'
      )
    `)

    const row = database.first<{ id: number }>('SELECT last_insert_rowid() AS id')
    if (!row) break
    lastId = row.id
    const fetched = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE id = ${lastId}`)
    if (!fetched) break
    lastTask = fetched
  }
}

function handleChainShift(database: AppDatabase, taskId: number, dateDiffDays: number): void {
  const nextTask = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE previous_recurrent_id = ${taskId}`)
  if (!nextTask) return

  const statements: string[] = []
  
  if (nextTask.start_date) {
    const d = parseIsoDate(nextTask.start_date)
    d.setDate(d.getDate() + dateDiffDays)
    statements.push(`UPDATE tasks SET start_date = '${toIsoDate(d)}' WHERE id = ${nextTask.id}`)
  }
  
  if (nextTask.end_date) {
    const d = parseIsoDate(nextTask.end_date)
    d.setDate(d.getDate() + dateDiffDays)
    statements.push(`UPDATE tasks SET end_date = '${toIsoDate(d)}' WHERE id = ${nextTask.id}`)
  }

  if (statements.length > 0) {
    database.transaction(statements)
    handleChainShift(database, nextTask.id, dateDiffDays)
  }
}

function deleteFutureRecurrenceChain(database: AppDatabase, taskId: number): void {
  const futureTaskIds = database.query<{ id: number }>(`
    WITH RECURSIVE future_chain(id) AS (
      SELECT id FROM tasks WHERE previous_recurrent_id = ${taskId}
      UNION ALL
      SELECT t.id
      FROM tasks t
      JOIN future_chain chain ON t.previous_recurrent_id = chain.id
    )
    SELECT id FROM future_chain;
  `)

  if (futureTaskIds.length === 0) {
    return
  }

  const idList = futureTaskIds.map((row) => row.id).join(', ')

  database.transaction([
    `DELETE FROM task_tags WHERE task_id IN (${idList});`,
    `DELETE FROM dependencies WHERE task_id IN (${idList}) OR depends_on_task_id IN (${idList});`,
    `DELETE FROM tasks WHERE id IN (${idList});`,
  ])
}

function getRecurrenceChainHeadId(database: AppDatabase, taskId: number): number {
  let headId = taskId

  while (true) {
    const previous = database.first<{ previous_recurrent_id: number | null }>(
      `SELECT previous_recurrent_id FROM tasks WHERE id = ${headId} LIMIT 1`,
    )

    if (!previous || previous.previous_recurrent_id === null) {
      break
    }

    headId = previous.previous_recurrent_id
  }

  return headId
}

function getForwardRecurrenceChainIds(database: AppDatabase, startTaskId: number): number[] {
  const rows = database.query<{ id: number }>(`
    WITH RECURSIVE recurrence_chain(id) AS (
      SELECT id FROM tasks WHERE id = ${startTaskId}
      UNION ALL
      SELECT t.id
      FROM tasks t
      JOIN recurrence_chain chain ON t.previous_recurrent_id = chain.id
    )
    SELECT id FROM recurrence_chain;
  `)

  return rows.map((row) => row.id)
}

function getParentTaskIdsForTaskIds(database: AppDatabase, taskIds: number[]): number[] {
  if (taskIds.length === 0) {
    return []
  }

  const idList = taskIds.join(', ')
  const rows = database.query<{ parent_task_id: number | null }>(`
    SELECT DISTINCT parent_task_id
    FROM tasks
    WHERE id IN (${idList}) AND parent_task_id IS NOT NULL;
  `)

  return rows
    .map((row) => row.parent_task_id)
    .filter((parentId): parentId is number => Number.isInteger(parentId) && parentId > 0)
}

function deleteTasksByIds(database: AppDatabase, taskIds: number[]): void {
  if (taskIds.length === 0) {
    return
  }

  const idList = taskIds.join(', ')

  database.transaction([
    `DELETE FROM task_tags WHERE task_id IN (${idList});`,
    `DELETE FROM dependencies WHERE task_id IN (${idList}) OR depends_on_task_id IN (${idList});`,
    `DELETE FROM tasks WHERE id IN (${idList});`,
  ])
}

function recalculateGoalBounds(database: AppDatabase, taskId: number): void {
  const parentTask = database.first<{ id: number; type: TaskType }>(
    `SELECT id, type FROM tasks WHERE id = ${taskId} LIMIT 1;`,
  )

  if (!parentTask || parentTask.type !== 'goal') {
    return
  }

  const bounds = database.first<{
    subtask_count: number
    min_start_date: string | null
    fallback_start_date: string | null
    max_end_date: string | null
  }>(`
    SELECT
      COUNT(*) AS subtask_count,
      MIN(start_date) AS min_start_date,
      MIN(end_date) AS fallback_start_date,
      MAX(end_date) AS max_end_date
    FROM tasks
    WHERE parent_task_id = ${taskId};
  `)

  if (!bounds || bounds.subtask_count === 0) {
    return
  }

  const hasAnySubtaskDate = Boolean(bounds.min_start_date || bounds.fallback_start_date || bounds.max_end_date)

  if (!hasAnySubtaskDate) {
    return
  }

  const nextGoalStartDate = bounds.min_start_date ?? bounds.fallback_start_date ?? null

  database.execute(`
    UPDATE tasks
    SET
      start_date = ${nextGoalStartDate ? `'${escapeSqlString(nextGoalStartDate)}'` : 'NULL'},
      end_date = ${bounds.max_end_date ? `'${escapeSqlString(bounds.max_end_date)}'` : 'NULL'}
    WHERE id = ${taskId};
  `)
}

// --- Dependency cascade engine ---------------------------------------------

interface CascadeTaskRow {
  id: number
  title: string
  start_date: string | null
  end_date: string | null
  status: TaskStatus
}

/**
 * Walk the dependency graph downstream from `predecessorId` and shift every
 * successor whose predecessor now ends on `predecessorEndDateIso`. The whole
 * batch is committed inside one atomic transaction; if any statement fails,
 * `database.transaction` rolls back so the original cronograma stays intact.
 *
 * Successors with status `in_progress` or `done` are not shifted: the branch
 * is stopped and surfaced as a `DependencyCascadeConflict` for the renderer
 * to display ("Conflicto de Cronograma").
 */
function cascadeDependencyShift(
  database: AppDatabase,
  predecessorId: number,
  predecessorEndDateIso: string,
): DependencyCascadeConflict[] {
  const freeDays = loadFreeDaySet(database)
  const conflicts: DependencyCascadeConflict[] = []
  const statements: string[] = []
  const visited = new Set<number>([predecessorId])

  type Frame = { taskId: number; endDateIso: string }
  const queue: Frame[] = [{ taskId: predecessorId, endDateIso: predecessorEndDateIso }]

  while (queue.length > 0) {
    const { taskId, endDateIso } = queue.shift() as Frame

    const successors = database.query<{ task_id: number }>(
      `SELECT task_id FROM dependencies WHERE depends_on_task_id = ${taskId};`,
    )

    for (const { task_id: successorId } of successors) {
      if (visited.has(successorId)) {
        continue
      }
      visited.add(successorId)

      const successor = database.first<CascadeTaskRow>(
        `SELECT id, title, start_date, end_date, status FROM tasks WHERE id = ${successorId} LIMIT 1;`,
      )

      if (!successor) {
        continue
      }

      if (successor.status === 'in_progress' || successor.status === 'done') {
        conflicts.push({
          task_id: successor.id,
          task_title: successor.title,
          reason: successor.status,
        })
        continue
      }

      const predecessorEndDate = parseIsoDate(endDateIso)
      const nextStartDate = addBusinessDays(predecessorEndDate, 1, freeDays)

      const originalDuration = successor.start_date && successor.end_date
        ? Math.max(1, getBusinessDaysDistance(parseIsoDate(successor.start_date), parseIsoDate(successor.end_date), freeDays))
        : 1

      const nextEndDate = addBusinessDays(nextStartDate, originalDuration - 1, freeDays)
      const nextStartIso = toBusinessIsoDate(nextStartDate)
      const nextEndIso = toBusinessIsoDate(nextEndDate)

      if (nextStartIso === successor.start_date && nextEndIso === successor.end_date) {
        // No movement needed but still propagate in case downstream chain was already shifted.
        queue.push({ taskId: successor.id, endDateIso: nextEndIso })
        continue
      }

      statements.push(
        `UPDATE tasks SET start_date = '${nextStartIso}', end_date = '${nextEndIso}' WHERE id = ${successor.id};`,
      )

      queue.push({ taskId: successor.id, endDateIso: nextEndIso })
    }
  }

  if (statements.length > 0) {
    database.transaction(statements)
  }

  return conflicts
}

/**
 * Returns true if adding the edge `successorId` depends on `predecessorId`
 * would close a cycle. We DFS forward from `successorId` (following its own
 * successors) and check whether we ever reach `predecessorId`.
 */
function wouldCreateDependencyCycle(
  database: AppDatabase,
  successorId: number,
  predecessorId: number,
): boolean {
  if (successorId === predecessorId) {
    return true
  }

  const stack: number[] = [successorId]
  const seen = new Set<number>([successorId])

  while (stack.length > 0) {
    const current = stack.pop() as number
    const children = database.query<{ task_id: number }>(
      `SELECT task_id FROM dependencies WHERE depends_on_task_id = ${current};`,
    )

    for (const { task_id: childId } of children) {
      if (childId === predecessorId) {
        return true
      }
      if (!seen.has(childId)) {
        seen.add(childId)
        stack.push(childId)
      }
    }
  }

  return false
}

// --- Holiday/free-day loader -----------------------------------------------

let cachedHolidayDates: ReadonlySet<string> | null = null

function loadColombiaHolidays(): ReadonlySet<string> {
  if (cachedHolidayDates) {
    return cachedHolidayDates
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'src', 'common', 'colombia-holidays.json'),
    path.join(__dirname, 'colombia-holidays.json'),
    path.join(__dirname, '..', 'src', 'common', 'colombia-holidays.json'),
  ]

  for (const candidate of candidatePaths) {
    if (!existsSync(candidate)) {
      continue
    }

    try {
      const raw = readFileSync(candidate, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
        )
        cachedHolidayDates = new Set(valid)
        return cachedHolidayDates
      }
    } catch (error) {
      console.warn('Failed to read colombia-holidays.json', error)
    }
  }

  cachedHolidayDates = new Set<string>()
  return cachedHolidayDates
}

function loadFreeDaySet(database: AppDatabase): ReadonlySet<string> {
  const holidays = loadColombiaHolidays()
  const custom = database.query<{ date: string }>('SELECT date FROM custom_free_days;')
  const set = new Set<string>(holidays)

  for (const { date } of custom) {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      set.add(date)
    }
  }

  return set
}

// --- End Helpers ---

app.whenReady()
  .then(async () => {
    db = await ensureDatabaseReady()
    registerIpcHandlers(db)
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })
  .catch((error: unknown) => {
    console.error('Failed to start Electron application', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (db) {
    db.close()
    db = null
  }
})
