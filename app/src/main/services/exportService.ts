import AdmZip from 'adm-zip'
import type { AppDatabase } from '../../database/db'

interface TableConfig {
  name: string
  query: string
}

const TABLES: TableConfig[] = [
  { name: 'projects', query: 'SELECT id, name, color, created_at FROM projects ORDER BY id ASC' },
  { name: 'categories', query: 'SELECT id, name, created_at FROM categories ORDER BY id ASC' },
  { name: 'tags', query: 'SELECT id, name, color FROM tags ORDER BY id ASC' },
  {
    name: 'tasks',
    query: `SELECT id, title, description, created_at, start_date, end_date, priority, story_points,
            project_id, category_id, parent_task_id, recurrence, recurrence_rule,
            previous_recurrent_id, status, start_time, end_time, type
            FROM tasks ORDER BY id ASC`,
  },
  { name: 'task_tags', query: 'SELECT task_id, tag_id FROM task_tags ORDER BY task_id ASC, tag_id ASC' },
  { name: 'dependencies', query: 'SELECT task_id, depends_on_task_id FROM dependencies ORDER BY task_id ASC' },
  { name: 'custom_free_days', query: 'SELECT date, note FROM custom_free_days ORDER BY date ASC' },
]

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return `"${str}"`
}

function tableToCsv(database: AppDatabase, config: TableConfig): string {
  const rows = database.query<Record<string, unknown>>(config.query)

  if (rows.length === 0) {
    const columnMatch = config.query.match(/SELECT\s+(.+?)\s+FROM/is)
    if (columnMatch) {
      const columns = columnMatch[1]
        .split(',')
        .map((col) => col.trim().split(/\s+AS\s+/i).pop()!.trim())
      return columns.join(',') + '\n'
    }
    return ''
  }

  const columns = Object.keys(rows[0])
  const header = columns.join(',')
  const lines = rows.map((row) => columns.map((col) => escapeCsvField(row[col])).join(','))

  return [header, ...lines].join('\n') + '\n'
}

export interface ExportResult {
  taskCount: number
  buffer: Buffer
}

export function exportDataToZip(database: AppDatabase): ExportResult {
  const zip = new AdmZip()
  let taskCount = 0

  for (const table of TABLES) {
    const csv = tableToCsv(database, table)
    zip.addFile(`${table.name}.csv`, Buffer.from(csv, 'utf-8'))

    if (table.name === 'tasks') {
      taskCount = csv.split('\n').filter((line) => line.trim()).length - 1
    }
  }

  return { taskCount, buffer: zip.toBuffer() }
}
