import { applyMigrations, openDatabase, resolveDefaultDbPath } from './db'

const dbPath = process.env.DB_PATH ?? resolveDefaultDbPath()

async function main(): Promise<void> {
  const db = await openDatabase(dbPath)

  try {
    applyMigrations(db)
    console.log(`Schema ready at ${dbPath}`)
  } finally {
    db.close()
  }
}

main().catch((error: unknown) => {
  console.error('Database migration failed', error)
  process.exit(1)
})
