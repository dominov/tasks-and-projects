import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { DATABASE_FILE_NAME, DEFAULT_DEV_SERVER_URL } from '../common/constants'
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
  TaskStatus,
  TaskUpdatePayload,
  TaskWithRelations,
} from '../common/types'
import { applyMigrations, openDatabase, seedIfEmpty, type AppDatabase } from '../database/db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let db: AppDatabase | null = null

const allowedStatuses: TaskStatus[] = ['todo', 'in_progress', 'done']

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
  seedIfEmpty(database)
  return database
}

function registerIpcHandlers(database: AppDatabase): void {
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
        t.status,
        t.start_time,
        t.end_time,
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

  ipcMain.handle('tasks:update', (_event, rawTaskId: number, payload: TaskUpdatePayload): void => {
    const taskId = Number(rawTaskId)

    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid task ID')
    }

    const setClauses: string[] = []

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

    if (payload.end_date !== undefined) {
      setClauses.push(
        payload.end_date === null ? 'end_date = NULL' : `end_date = '${escapeSqlString(payload.end_date)}'`,
      )
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
  })

  ipcMain.handle('tasks:delete', (_event, rawTaskId: number): void => {
    const taskId = Number(rawTaskId)

    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid task ID')
    }

    database.transaction([
      `DELETE FROM task_tags WHERE task_id = ${taskId};`,
      `DELETE FROM dependencies WHERE task_id = ${taskId} OR depends_on_task_id = ${taskId};`,
      `DELETE FROM tasks WHERE id = ${taskId};`,
    ])
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

    if (categoryId !== null) {
      const catId = Number(categoryId)

      if (!Number.isInteger(catId) || catId <= 0) {
        throw new Error('Invalid category ID')
      }

      categoryId = catId
    }

    // Insert the task first
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
        status,
        start_time,
        end_time
      ) VALUES (
        '${escapeSqlString(title)}',
        NULL,
        datetime('now'),
        NULL,
        ${payload.end_date === undefined || payload.end_date === null ? 'NULL' : `'${escapeSqlString(payload.end_date)}'`},
        2,
        1,
        ${projectId === null ? 'NULL' : projectId},
        ${categoryId === null ? 'NULL' : categoryId},
        ${payload.parent_task_id === undefined || payload.parent_task_id === null ? 'NULL' : Number(payload.parent_task_id)},
        'none',
        'todo',
        NULL,
        NULL
      );
    `)

    const row = database.first<{ taskId: number }>('SELECT last_insert_rowid() AS taskId')

    if (!row) {
      throw new Error('Unable to create task')
    }

    const taskId = row.taskId

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
    return database.query<Category>('SELECT id, name, created_at FROM categories ORDER BY name ASC')
  })

  ipcMain.handle('categories:create', (_event, payload: CategoryCreatePayload): CategoryCreateResult => {
    const name = payload.name.trim()

    if (!name) {
      throw new Error('Category name is required')
    }

    database.execute(`
      INSERT INTO categories (name, created_at)
      VALUES ('${escapeSqlString(name)}', datetime('now'));
    `)

    const row = database.first<{ categoryId: number }>('SELECT last_insert_rowid() AS categoryId')

    if (!row) {
      throw new Error('Unable to create category')
    }

    return { categoryId: row.categoryId }
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

  if (!hasCreatedAtColumn) {
    database.execute('ALTER TABLE tasks ADD COLUMN created_at TEXT;')
  }

  database.execute("UPDATE tasks SET created_at = datetime('now') WHERE created_at IS NULL;")
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
