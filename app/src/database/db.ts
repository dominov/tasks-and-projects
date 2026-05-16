import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database as SqlJsDatabase, type QueryExecResult, type SqlJsStatic } from 'sql.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

const bundledMigrationsPath = path.join(__dirname, 'migrations')
const sourceMigrationsPath = path.resolve(process.cwd(), 'src', 'database', 'migrations')

let sqlJsRuntimePromise: Promise<SqlJsStatic> | null = null

export interface AppDatabase {
  execute(sql: string): void
  transaction(statements: string[]): void
  query<T>(sql: string): T[]
  first<T>(sql: string): T | undefined
  close(): void
}

class SqlJsAppDatabase implements AppDatabase {
  constructor(
    private readonly filePath: string,
    private readonly database: SqlJsDatabase,
  ) {}

  execute(sql: string): void {
    this.database.exec(sql)
    this.persist()
  }

  transaction(statements: string[]): void {
    this.database.exec('BEGIN TRANSACTION;')

    try {
      for (const statement of statements) {
        this.database.exec(statement)
      }

      this.database.exec('COMMIT;')
      this.persist()
    } catch (error) {
      try {
        this.database.exec('ROLLBACK;')
      } catch {
        // Ignore rollback failures when the transaction was already aborted.
      }

      throw error
    }
  }

  query<T>(sql: string): T[] {
    const [result] = this.database.exec(sql)

    if (!result) {
      return []
    }

    return mapRows<T>(result)
  }

  first<T>(sql: string): T | undefined {
    return this.query<T>(sql)[0]
  }

  close(): void {
    this.persist()
    this.database.close()
  }

  private persist(): void {
    const bytes = this.database.export()
    writeFileSync(this.filePath, Buffer.from(bytes))
  }
}

export async function openDatabase(dbFilePath: string): Promise<AppDatabase> {
  const directory = path.dirname(dbFilePath)

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }

  const SQL = await getSqlJsRuntime()
  const fileBuffer = existsSync(dbFilePath) ? readFileSync(dbFilePath) : undefined
  const database = new SQL.Database(fileBuffer ? new Uint8Array(fileBuffer) : undefined)
  const appDatabase = new SqlJsAppDatabase(dbFilePath, database)

  appDatabase.execute('PRAGMA foreign_keys = ON;')

  return appDatabase
}

export function applyMigrations(db: AppDatabase): void {
  const migrationFiles = readdirSync(resolveMigrationsPath())
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()

  for (const fileName of migrationFiles) {
    const migrationSql = readFileSync(path.join(resolveMigrationsPath(), fileName), 'utf8')
    db.execute(migrationSql)
  }
}

export function seedIfEmpty(db: AppDatabase): boolean {
  const row = db.first<{ total: number }>('SELECT COUNT(*) AS total FROM tasks')

  if ((row?.total ?? 0) > 0) {
    return false
  }

  const seedSql = readFileSync(path.join(resolveMigrationsPath(), '002_seed_data.sql'), 'utf8')
  db.execute(seedSql)
  return true
}

export function resolveDefaultDbPath(): string {
  return path.resolve(process.cwd(), 'local-data', 'tasks.db')
}

async function getSqlJsRuntime(): Promise<SqlJsStatic> {
  if (!sqlJsRuntimePromise) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    sqlJsRuntimePromise = initSqlJs({
      locateFile: () => wasmPath,
    })
  }

  return sqlJsRuntimePromise
}

function resolveMigrationsPath(): string {
  if (existsSync(sourceMigrationsPath)) {
    return sourceMigrationsPath
  }

  if (existsSync(bundledMigrationsPath)) {
    return bundledMigrationsPath
  }

  throw new Error('Could not locate database migration files')
}

function mapRows<T>(result: QueryExecResult): T[] {
  return result.values.map((valueRow) => {
    const row = Object.fromEntries(result.columns.map((column, index) => [column, valueRow[index]]))
    return row as T
  })
}
