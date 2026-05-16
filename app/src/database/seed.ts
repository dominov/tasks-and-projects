import { applyMigrations, openDatabase, resolveDefaultDbPath, seedIfEmpty } from './db'

const dbPath = process.env.DB_PATH ?? resolveDefaultDbPath()

async function main(): Promise<void> {
  const db = await openDatabase(dbPath)

  try {
    applyMigrations(db)
    const seeded = seedIfEmpty(db)
    console.log(seeded ? `Seeded test data at ${dbPath}` : 'Seed skipped because tasks already exist')
  } finally {
    db.close()
  }
}

main().catch((error: unknown) => {
  console.error('Database seed failed', error)
  process.exit(1)
})
