#!/usr/bin/env node

/**
 * Database Migration CLI
 * 
 * Commands:
 * - npm run db:migrate              Apply all pending migrations
 * - npm run db:migrate:status       Show migration status
 * - npm run db:migrate:up           Apply next pending migration
 * - npm run db:migrate:down         Rollback last migration
 * - npm run db:migrate:create NAME  Create new migration file
 * - npm run db:migrate:reset        Reset database (rollback all + reapply all)
 */

import { writeFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import * as migrationService from '../services/migration.js'

// Load environment variables
dotenv.config()

const command = process.argv[2]
const args = process.argv.slice(3)

/**
 * Format timestamp for display
 */
const formatDate = (date: Date | undefined): string => {
  if (!date) return ''
  return date.toISOString().split('T')[0]
}

/**
 * Show migration status
 */
const showStatus = async () => {
  console.log('📋 Database Migration Status\n')

  try {
    const status = await migrationService.getMigrationStatus()

    if (status.length === 0) {
      console.log('  No migrations found\n')
      return
    }

    let appliedCount = 0
    let pendingCount = 0
    let modifiedCount = 0

    for (const migration of status) {
      let icon = ''
      let statusText = ''
      let details = ''

      if (migration.status === 'applied') {
        icon = '✅'
        statusText = 'applied'
        details = formatDate(migration.appliedAt)
        appliedCount++
      } else if (migration.status === 'pending') {
        icon = '⏳'
        statusText = 'pending'
        pendingCount++
      } else if (migration.status === 'modified') {
        icon = '⚠️ '
        statusText = 'MODIFIED'
        details = `applied ${formatDate(migration.appliedAt)} but file changed!`
        modifiedCount++
      }

      const versionName = `${migration.version}_${migration.name}`
      console.log(`  ${icon} ${versionName.padEnd(40)} ${statusText} ${details}`)
    }

    console.log()
    console.log(`  Total: ${status.length} | Applied: ${appliedCount} | Pending: ${pendingCount} | Modified: ${modifiedCount}`)
    
    if (modifiedCount > 0) {
      console.log()
      console.log('  ⚠️  WARNING: Some applied migrations have been modified!')
      console.log('  This may indicate tampering or accidental edits.')
      console.log('  Create new migrations instead of modifying applied ones.')
    }

    console.log()
  } catch (error) {
    // If table doesn't exist, just show pending migrations
    const errorMsg = error instanceof Error ? error.message : String(error)
    if (errorMsg.includes('schema_migrations table does not exist')) {
      console.log('  ⚠️  Migration tracking table not initialized yet\n')
      console.log('  Available migrations (all pending):\n')
      
      const allMigrations = migrationService.getAllMigrations()
      for (const migration of allMigrations) {
        console.log(`  ⏳ ${migration.version}_${migration.name.padEnd(40)} pending`)
      }
      console.log()
      console.log(`  Total: ${allMigrations.length} | All pending`)
      console.log()
      console.log('  📌 To initialize: Apply migration 000_migrations_system.sql via Supabase dashboard')
      console.log('     https://supabase.com/dashboard/project/YOUR_PROJECT/sql')
      console.log()
      return
    }
    
    console.error('❌ Error fetching migration status:', error)
    process.exit(1)
  }
}

/**
 * Apply all pending migrations
 */
const migrateAll = async () => {
  console.log('🚀 Applying pending migrations...\n')

  try {
    const count = await migrationService.applyAllPending()
    
    if (count === 0) {
      console.log('  ✅ Database is up to date\n')
    } else {
      console.log(`\n  ✅ Successfully applied ${count} migration(s)\n`)
    }
  } catch (error) {
    console.error('\n  ❌ Migration failed:', error)
    process.exit(1)
  }
}

/**
 * Apply next pending migration
 */
const migrateUp = async () => {
  console.log('🚀 Applying next pending migration...\n')

  try {
    const pending = await migrationService.getPendingMigrations()
    
    if (pending.length === 0) {
      console.log('  ✅ No pending migrations\n')
      return
    }

    const migration = pending[0]
    await migrationService.applyMigration(migration)
    console.log()
  } catch (error) {
    console.error('\n  ❌ Migration failed:', error)
    process.exit(1)
  }
}

/**
 * Rollback last migration
 */
const migrateDown = async () => {
  console.log('⏮️  Rolling back last migration...\n')

  try {
    await migrationService.rollbackLast()
    console.log()
  } catch (error) {
    console.error('\n  ❌ Rollback failed:', error)
    process.exit(1)
  }
}

/**
 * Create new migration file
 */
const createMigration = async (name: string) => {
  if (!name) {
    console.error('❌ Error: Migration name is required')
    console.log('\nUsage: npm run db:migrate:create <name>')
    console.log('Example: npm run db:migrate:create add_user_preferences\n')
    process.exit(1)
  }

  try {
    // Get next version number
    const allMigrations = migrationService.getAllMigrations()
    const lastVersion = allMigrations.length > 0 
      ? parseInt(allMigrations[allMigrations.length - 1].version) 
      : -1
    const nextVersion = String(lastVersion + 1).padStart(3, '0')

    // Generate filename
    const filename = `${nextVersion}_${name}.sql`
    const filepath = join(process.cwd(), 'migrations', filename)

    // Create template
    const template = `-- ============================================
-- Migration: ${nextVersion}_${name}
-- Description: TODO: Add description
-- Dependencies: None
-- Author: MabiniLMS Team
-- Created: ${new Date().toISOString().split('T')[0]}
-- ============================================

-- UP
-- Apply migration: TODO: Add description

-- TODO: Add SQL statements to apply migration
-- Example:
-- CREATE TABLE public.example (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- DOWN
-- Rollback migration: TODO: Add description

-- TODO: Add SQL statements to rollback migration
-- Example:
-- DROP TABLE IF EXISTS public.example CASCADE;
`

    writeFileSync(filepath, template, 'utf-8')

    console.log('✅ Created new migration file:\n')
    console.log(`  📄 ${filename}`)
    console.log(`  📁 ${filepath}\n`)
    console.log('Next steps:')
    console.log('  1. Edit the migration file')
    console.log('  2. Add UP section SQL (apply migration)')
    console.log('  3. Add DOWN section SQL (rollback migration)')
    console.log('  4. Run: npm run db:migrate:up\n')
  } catch (error) {
    console.error('❌ Error creating migration:', error)
    process.exit(1)
  }
}

/**
 * Reset database (rollback all, then reapply all)
 */
const resetDatabase = async () => {
  console.log('⚠️  WARNING: This will rollback and reapply ALL migrations!\n')

  // In production, you'd want to add a confirmation prompt here
  console.log('🔄 Resetting database...\n')

  try {
    await migrationService.resetDatabase()
    console.log()
  } catch (error) {
    console.error('\n  ❌ Reset failed:', error)
    process.exit(1)
  }
}

/**
 * Show help
 */
const showHelp = () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                   Database Migration CLI                             ║
╚══════════════════════════════════════════════════════════════════════╝

Commands:

  npm run db:migrate                 Apply all pending migrations
  npm run db:migrate:status          Show migration status
  npm run db:migrate:up              Apply next pending migration
  npm run db:migrate:down            Rollback last migration
  npm run db:migrate:create <name>   Create new migration file
  npm run db:migrate:reset           Reset database (rollback all + reapply)

Examples:

  npm run db:migrate:status
    Show which migrations are applied/pending

  npm run db:migrate
    Apply all pending migrations

  npm run db:migrate:create add_user_preferences
    Create new migration: 003_add_user_preferences.sql

  npm run db:migrate:up
    Apply only the next pending migration

  npm run db:migrate:down
    Rollback the last applied migration

  npm run db:migrate:reset
    Rollback all migrations and reapply them

Workflow:

  1. Create migration:      npm run db:migrate:create <name>
  2. Edit migration file:   Add UP and DOWN SQL
  3. Check status:          npm run db:migrate:status
  4. Apply migration:       npm run db:migrate:up
  5. Test rollback:         npm run db:migrate:down
  6. Reapply:               npm run db:migrate:up
  7. Commit to Git:         git add migrations/XXX_name.sql

`)
}

// Command router
const main = async () => {
  switch (command) {
    case 'status':
      await showStatus()
      break
    case 'up':
      await migrateUp()
      break
    case 'down':
      await migrateDown()
      break
    case 'create':
      await createMigration(args[0])
      break
    case 'reset':
      await resetDatabase()
      break
    case 'help':
    case '--help':
    case '-h':
      showHelp()
      break
    case undefined:
      // Default: apply all pending
      await migrateAll()
      break
    default:
      console.error(`❌ Unknown command: ${command}\n`)
      showHelp()
      process.exit(1)
  }
}

// Run CLI
main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
