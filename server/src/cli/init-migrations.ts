/**
 * Bootstrap script to initialize migration system
 * Applies 000_migrations_system.sql directly to Supabase
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import { supabaseAdmin } from '../lib/supabase.js'

dotenv.config()

const initMigrationSystem = async () => {
  console.log('🚀 Initializing migration system...\n')
  
  try {
    // Read the migrations system SQL file
    const migrationPath = join(process.cwd(), 'migrations', '000_migrations_system.sql')
    const sql = readFileSync(migrationPath, 'utf-8')
    
    // Extract just the UP section (between -- UP and -- DOWN)
    const upMatch = sql.match(/-- UP[\s\S]*?-- DOWN/m)
    if (!upMatch) {
      throw new Error('Could not find UP section in migration file')
    }
    
    const upSql = upMatch[0]
      .replace(/^-- UP[\s\S]*?-- Apply migration:.*$/m, '')
      .replace(/^-- DOWN.*$/m, '')
      .trim()
    
    // Execute the SQL using Supabase's RPC
    console.log('  📝 Creating schema_migrations table...')
    
    // Use raw SQL execution via Supabase Admin
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: upSql
    })
    
    if (error) {
      // If RPC doesn't exist, try using the client directly
      // Split SQL into individual statements
      const statements = upSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))
      
      for (const statement of statements) {
        if (statement.toLowerCase().startsWith('create table')) {
          // Check if table already exists
          const { error: checkError } = await supabaseAdmin
            .from('schema_migrations')
            .select('version')
            .limit(0)
          
          if (!checkError) {
            console.log('  ✅ schema_migrations table already exists')
            return
          }
        }
      }
      
      throw new Error(`Failed to create migrations table: ${error.message}`)
    }
    
    console.log('  ✅ Migration system initialized successfully!\n')
    console.log('  You can now run: npm run db:migrate\n')
    
  } catch (error) {
    console.error('  ❌ Failed to initialize migration system')
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}\n`)
    console.log('  Please apply 000_migrations_system.sql manually via Supabase dashboard:')
    console.log('  1. Go to: https://supabase.com/dashboard')
    console.log('  2. Select your project → SQL Editor')
    console.log('  3. Copy and paste the contents of: server/migrations/000_migrations_system.sql')
    console.log('  4. Run the SQL\n')
    process.exit(1)
  }
}

initMigrationSystem()
