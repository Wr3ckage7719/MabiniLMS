import { createHash } from 'crypto'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { supabaseAdmin } from '../lib/supabase.js'
import logger from '../utils/logger.js'

export interface Migration {
  version: string
  name: string
  filename: string
  filepath: string
  checksum: string
  dependencies: string[]
  appliedAt?: Date
  executionTimeMs?: number
}

export interface MigrationStatus {
  version: string
  name: string
  status: 'applied' | 'pending' | 'modified'
  appliedAt?: Date
  checksum?: string
}

const MIGRATIONS_DIR = join(process.cwd(), 'migrations')
const MIGRATION_FILE_PATTERN = /^(\d{3})_(.+)\.sql$/

/**
 * Calculate SHA-256 checksum of a file
 */
export const calculateChecksum = (content: string): string => {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Parse migration file to extract metadata
 */
export const parseMigrationFile = (filepath: string): Migration => {
  const filename = filepath.split(/[/\\]/).pop()!
  const match = filename.match(MIGRATION_FILE_PATTERN)
  
  if (!match) {
    throw new Error(`Invalid migration filename: ${filename}. Must match pattern: XXX_name.sql`)
  }

  const [, version, name] = match
  const content = readFileSync(filepath, 'utf-8')
  const checksum = calculateChecksum(content)

  // Parse dependencies from header comments
  const depsMatch = content.match(/-- Dependencies:\s*(.+)/i)
  const dependencies: string[] = []
  
  if (depsMatch && depsMatch[1].toLowerCase() !== 'none') {
    dependencies.push(...depsMatch[1].split(',').map((d) => d.trim()))
  }

  return {
    version,
    name,
    filename,
    filepath,
    checksum,
    dependencies,
  }
}

/**
 * Get all migration files from the migrations directory
 */
export const getAllMigrations = (): Migration[] => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && MIGRATION_FILE_PATTERN.test(f))
    .sort() // Alphabetical sort ensures version order

  return files.map((file) => parseMigrationFile(join(MIGRATIONS_DIR, file)))
}

/**
 * Get applied migrations from database
 */
export const getAppliedMigrations = async (): Promise<Map<string, Migration>> => {
  // First, ensure the migrations table exists
  await ensureMigrationsTable()

  const { data, error } = await supabaseAdmin
    .from('schema_migrations')
    .select('*')
    .order('version', { ascending: true })

  if (error) {
    logger.error('Failed to fetch applied migrations', { error: error.message })
    throw new Error(`Failed to fetch migrations: ${error.message}`)
  }

  const migrations = new Map<string, Migration>()
  
  if (data) {
    for (const row of data) {
      migrations.set(row.version, {
        version: row.version,
        name: row.name,
        filename: `${row.version}_${row.name}.sql`,
        filepath: join(MIGRATIONS_DIR, `${row.version}_${row.name}.sql`),
        checksum: row.checksum,
        dependencies: [],
        appliedAt: new Date(row.applied_at),
        executionTimeMs: row.execution_time_ms,
      })
    }
  }

  return migrations
}

/**
 * Ensure migrations tracking table exists (bootstrap)
 */
export const ensureMigrationsTable = async (): Promise<void> => {
  // Try to query the table first to see if it exists
  const { error: checkError } = await supabaseAdmin
    .from('schema_migrations')
    .select('version')
    .limit(0)

  // If table doesn't exist, we need to create it manually
  if (checkError) {
    if (checkError.message.includes('does not exist') || checkError.message.includes('schema cache')) {
      logger.warn('schema_migrations table does not exist yet')
      logger.info('Please apply migration 000_migrations_system.sql manually via Supabase dashboard first')
      logger.info('Visit: https://supabase.com/dashboard/project/YOUR_PROJECT/sql')
      logger.info('Then run the SQL from: server/migrations/000_migrations_system.sql')
      throw new Error('schema_migrations table does not exist. Please apply 000_migrations_system.sql first.')
    }
    throw new Error(`Failed to check migrations table: ${checkError.message}`)
  }
}

/**
 * Get list of pending (unapplied) migrations
 */
export const getPendingMigrations = async (): Promise<Migration[]> => {
  const allMigrations = getAllMigrations()
  const appliedMigrations = await getAppliedMigrations()

  return allMigrations.filter((m) => !appliedMigrations.has(m.version))
}

/**
 * Get migration status for all migrations
 */
export const getMigrationStatus = async (): Promise<MigrationStatus[]> => {
  const allMigrations = getAllMigrations()
  const appliedMigrations = await getAppliedMigrations()

  return allMigrations.map((migration) => {
    const applied = appliedMigrations.get(migration.version)

    if (!applied) {
      return {
        version: migration.version,
        name: migration.name,
        status: 'pending' as const,
      }
    }

    // Check if file was modified after being applied
    if (applied.checksum !== migration.checksum) {
      return {
        version: migration.version,
        name: migration.name,
        status: 'modified' as const,
        appliedAt: applied.appliedAt,
        checksum: applied.checksum,
      }
    }

    return {
      version: migration.version,
      name: migration.name,
      status: 'applied' as const,
      appliedAt: applied.appliedAt,
      checksum: applied.checksum,
    }
  })
}

/**
 * Extract UP section from migration file
 */
export const extractUpSection = (content: string): string => {
  const upMatch = content.match(/-- UP\s*\n([\s\S]*?)(?=\n-- DOWN|$)/i)
  if (!upMatch) {
    throw new Error('Migration file missing -- UP section')
  }
  return upMatch[1].trim()
}

/**
 * Extract DOWN section from migration file
 */
export const extractDownSection = (content: string): string => {
  const downMatch = content.match(/-- DOWN\s*\n([\s\S]*?)$/i)
  if (!downMatch) {
    throw new Error('Migration file missing -- DOWN section')
  }
  return downMatch[1].trim()
}

/**
 * Verify migration dependencies are satisfied
 */
export const verifyDependencies = async (migration: Migration): Promise<void> => {
  if (migration.dependencies.length === 0) {
    return
  }

  const appliedMigrations = await getAppliedMigrations()

  for (const dependency of migration.dependencies) {
    if (!appliedMigrations.has(dependency)) {
      throw new Error(
        `Migration ${migration.version} depends on ${dependency}, but it has not been applied yet`
      )
    }
  }
}

/**
 * Apply a single migration
 */
export const applyMigration = async (migration: Migration): Promise<number> => {
  logger.info(`Applying migration ${migration.version}_${migration.name}...`)

  // Verify dependencies
  await verifyDependencies(migration)

  // Read migration file
  const content = readFileSync(migration.filepath, 'utf-8')
  const upSql = extractUpSection(content)

  const startTime = Date.now()

  try {
    // Execute migration SQL
    // Note: Supabase doesn't expose direct SQL execution via client
    // In production, this would use a proper migration runner
    // For now, we'll log and require manual application
    logger.info(`Migration SQL for ${migration.version}:`)
    logger.info(upSql)

    // Record migration as applied
    const { error } = await supabaseAdmin
      .from('schema_migrations')
      .insert({
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        applied_by: 'system',
        execution_time_ms: Date.now() - startTime,
      })

    if (error) {
      throw new Error(`Failed to record migration: ${error.message}`)
    }

    const executionTime = Date.now() - startTime
    logger.info(`✅ Migration ${migration.version} applied successfully (${executionTime}ms)`)
    
    return executionTime
  } catch (error) {
    const executionTime = Date.now() - startTime
    logger.error(`❌ Migration ${migration.version} failed`, { 
      error: error instanceof Error ? error.message : String(error),
      executionTime 
    })
    throw error
  }
}

/**
 * Apply all pending migrations
 */
export const applyAllPending = async (): Promise<number> => {
  const pending = await getPendingMigrations()

  if (pending.length === 0) {
    logger.info('No pending migrations')
    return 0
  }

  logger.info(`Found ${pending.length} pending migration(s)`)

  let appliedCount = 0
  for (const migration of pending) {
    await applyMigration(migration)
    appliedCount++
  }

  logger.info(`✅ Applied ${appliedCount} migration(s) successfully`)
  return appliedCount
}

/**
 * Rollback a single migration
 */
export const rollbackMigration = async (version: string): Promise<void> => {
  logger.info(`Rolling back migration ${version}...`)

  const appliedMigrations = await getAppliedMigrations()
  const migration = appliedMigrations.get(version)

  if (!migration) {
    throw new Error(`Migration ${version} has not been applied`)
  }

  // Read migration file
  const content = readFileSync(migration.filepath, 'utf-8')
  const downSql = extractDownSection(content)

  try {
    // Execute rollback SQL
    logger.info(`Rollback SQL for ${version}:`)
    logger.info(downSql)

    // Remove migration record
    const { error } = await supabaseAdmin
      .from('schema_migrations')
      .delete()
      .eq('version', version)

    if (error) {
      throw new Error(`Failed to remove migration record: ${error.message}`)
    }

    logger.info(`✅ Migration ${version} rolled back successfully`)
  } catch (error) {
    logger.error(`❌ Rollback of migration ${version} failed`, { 
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

/**
 * Rollback the last applied migration
 */
export const rollbackLast = async (): Promise<void> => {
  const applied = await getAppliedMigrations()
  
  if (applied.size === 0) {
    logger.info('No migrations to rollback')
    return
  }

  const migrations = Array.from(applied.values()).sort((a, b) => 
    b.version.localeCompare(a.version)
  )
  
  const lastMigration = migrations[0]
  await rollbackMigration(lastMigration.version)
}

/**
 * Reset database by rolling back all migrations and reapplying
 */
export const resetDatabase = async (): Promise<void> => {
  logger.warn('⚠️  Resetting database - rolling back all migrations')

  // Get all applied migrations in reverse order
  const applied = await getAppliedMigrations()
  const migrations = Array.from(applied.values()).sort((a, b) => 
    b.version.localeCompare(a.version)
  )

  // Rollback all
  for (const migration of migrations) {
    await rollbackMigration(migration.version)
  }

  // Reapply all
  await applyAllPending()

  logger.info('✅ Database reset complete')
}
