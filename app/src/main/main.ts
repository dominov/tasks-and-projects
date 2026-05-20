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
import { applyMigrations, openDatabase, type AppDatabase } from '../database/db'

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
        t.recurrence_rule,
        t.previous_recurrent_id,
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

    const currentTask = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE id = ${taskId}`)
    if (!currentTask) throw new Error('Task not found')

    const setClauses: string[] = []
    let statusChangedToDone = false
    let endDateChanged = false
    let dateDiffDays = 0

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
          const oldDate = new Date(currentTask.end_date)
          const newDate = new Date(payload.end_date)
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

    if (endDateChanged && dateDiffDays !== 0) {
      handleChainShift(database, taskId, dateDiffDays)
    }

    if (payload.recurrence && payload.recurrence !== 'none' && payload.recurrence_rule) {
       ensureIterations(database, taskId)
    }
  })

  ipcMain.handle('tasks:delete', (_event, rawTaskId: number): void => {
    const taskId = Number(rawTaskId)

    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid task ID')
    }

    const currentTask = database.first<TaskWithRelations>(`SELECT * FROM tasks WHERE id = ${taskId}`)
    if (!currentTask) return

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
        recurrence_rule,
        previous_recurrent_id,
        status,
        start_time,
        end_time
      ) VALUES (
        '${escapeSqlString(title)}',
        NULL,
        datetime('now'),
        ${payload.start_date === undefined || payload.start_date === null ? 'NULL' : `'${escapeSqlString(payload.start_date)}'`},
        ${payload.end_date === undefined || payload.end_date === null ? 'NULL' : `'${escapeSqlString(payload.end_date)}'`},
        2,
        1,
        ${projectId === null ? 'NULL' : projectId},
        ${categoryId === null ? 'NULL' : categoryId},
        ${payload.parent_task_id === undefined || payload.parent_task_id === null ? 'NULL' : Number(payload.parent_task_id)},
        '${payload.recurrence ?? 'none'}',
        ${payload.recurrence_rule === undefined || payload.recurrence_rule === null ? 'NULL' : `'${escapeSqlString(payload.recurrence_rule)}'`},
        ${payload.previous_recurrent_id === undefined || payload.previous_recurrent_id === null ? 'NULL' : Number(payload.previous_recurrent_id)},
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

    if (payload.recurrence && payload.recurrence !== 'none' && payload.recurrence_rule) {
      ensureIterations(database, taskId)
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
  return date.toISOString().split('T')[0]
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

    const baseDate = lastTask.end_date ? new Date(lastTask.end_date) : new Date()
    const nextDate = getNextValidDate(
      baseDate,
      task.recurrence as 'weekly' | 'monthly',
      task.recurrence_rule!
    )

    // Calculate start date by keeping the same duration if possible
    let nextStartDate: string | null = null
    if (task.start_date && task.end_date) {
      const duration = new Date(task.end_date).getTime() - new Date(task.start_date).getTime()
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
    const d = new Date(nextTask.start_date)
    d.setDate(d.getDate() + dateDiffDays)
    statements.push(`UPDATE tasks SET start_date = '${toIsoDate(d)}' WHERE id = ${nextTask.id}`)
  }
  
  if (nextTask.end_date) {
    const d = new Date(nextTask.end_date)
    d.setDate(d.getDate() + dateDiffDays)
    statements.push(`UPDATE tasks SET end_date = '${toIsoDate(d)}' WHERE id = ${nextTask.id}`)
  }

  if (statements.length > 0) {
    database.transaction(statements)
    handleChainShift(database, nextTask.id, dateDiffDays)
  }
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
