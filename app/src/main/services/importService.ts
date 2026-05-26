import AdmZip from 'adm-zip'
import type { AppDatabase } from '../../database/db'

interface CsvParseResult {
  columns: string[]
  rows: Record<string, string | null>[]
}

function parseCsv(content: string): CsvParseResult {
  const lines = splitCsvLines(content)

  if (lines.length === 0) {
    return { columns: [], rows: [] }
  }

  const columns = parseCsvRow(lines[0])
  const rows: Record<string, string | null>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCsvRow(line)
    const row: Record<string, string | null> = {}

    for (let j = 0; j < columns.length; j++) {
      const raw = values[j] ?? ''
      row[columns[j]] = raw === '' ? null : raw
    }

    rows.push(row)
  }

  return { columns, rows }
}

function splitCsvLines(content: string): string[] {
  const lines: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]

    if (char === '"') {
      if (insideQuotes && content[i + 1] === '"') {
        current += '"'
        i++
      } else {
        insideQuotes = !insideQuotes
        current += char
      }
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && content[i + 1] === '\n') {
        i++
      }
      if (current.trim()) {
        lines.push(current)
      }
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    lines.push(current)
  }

  return lines
}

function parseCsvRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (!insideQuotes) {
        insideQuotes = true
      } else if (line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        insideQuotes = false
      }
    } else if (char === ',' && !insideQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }

  fields.push(current)
  return fields
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

function buildInsertStatement(table: string, columns: string[], row: Record<string, string | null>): string {
  const values = columns.map((col) => {
    const val = row[col]
    if (val === null) return 'NULL'
    return `'${escapeSql(val)}'`
  })

  return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`
}

export interface ImportResult {
  taskCount: number
  totalRecords: number
}

const IMPORT_ORDER = [
  'projects',
  'categories',
  'tags',
  'custom_free_days',
  'tasks',
  'task_tags',
  'dependencies',
]

export function importDataFromZip(database: AppDatabase, zipBuffer: Buffer): ImportResult {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()

  const csvFiles = new Map<string, string>()

  for (const entry of entries) {
    if (entry.entryName.endsWith('.csv')) {
      const tableName = entry.entryName.replace('.csv', '').replace(/^.*\//, '')
      csvFiles.set(tableName, entry.getData().toString('utf-8'))
    }
  }

  const statements: string[] = []
  let taskCount = 0
  let totalRecords = 0

  statements.push('PRAGMA foreign_keys = OFF;')

  for (const tableName of IMPORT_ORDER) {
    const csvContent = csvFiles.get(tableName)
    if (!csvContent) continue

    const { columns, rows } = parseCsv(csvContent)
    if (columns.length === 0 || rows.length === 0) continue

    for (const row of rows) {
      statements.push(buildInsertStatement(tableName, columns, row))
      totalRecords++

      if (tableName === 'tasks') {
        taskCount++
      }
    }
  }

  statements.push('PRAGMA foreign_keys = ON;')

  database.transaction(statements)

  return { taskCount, totalRecords }
}
