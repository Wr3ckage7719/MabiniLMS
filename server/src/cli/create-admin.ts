#!/usr/bin/env node
/**
 * CLI command to create the first admin user
 * Usage: npm run create-admin -- --email=admin@school.edu --password=secret123
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { parseArgs } from 'util';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAdmin() {
  // Parse command line arguments
  const { values } = parseArgs({
    options: {
      email: { type: 'string', short: 'e' },
      password: { type: 'string', short: 'p' },
      'first-name': { type: 'string', short: 'f' },
      'last-name': { type: 'string', short: 'l' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`
Create Admin User CLI

Usage:
  npm run create-admin -- --email=admin@school.edu --password=secret123

Options:
  -e, --email        Admin email address (required)
  -p, --password     Admin password (required, min 8 chars)
  -f, --first-name   Admin first name (default: "System")
  -l, --last-name    Admin last name (default: "Administrator")
  -h, --help         Show this help message

Example:
  npm run create-admin -- --email=admin@school.edu --password=MySecure123 --first-name=John --last-name=Admin
`);
    return;
  }

  const email = values.email;
  const password = values.password;
  const firstName = values['first-name'] || 'System';
  const lastName = values['last-name'] || 'Administrator';

  if (!email || !password) {
    console.error('❌ Error: --email and --password are required');
    console.log('   Run with --help for usage information');
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error('❌ Error: Password must be at least 8 characters');
    process.exitCode = 1;
    return;
  }

  console.log(`\n🔧 Creating admin user: ${email}`);

  try {
    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('email', email)
      .single();

    if (existingProfile) {
      if (existingProfile.role === 'admin') {
        console.log('ℹ️  User already exists and is an admin');
        return;
      }

      // Update existing user to admin
      console.log('📝 User exists, updating role to admin...');
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ role: 'admin', updated_at: new Date().toISOString() })
        .eq('id', existingProfile.id);

      if (updateError) throw updateError;

      console.log('✅ User role updated to admin successfully!');
      console.log(`   Email: ${email}`);
      return;
    }

    // Create new user in Supabase Auth
    console.log('📝 Creating new admin user...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Pre-verify admin email
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'admin',
      },
    });

    if (authError) throw authError;

    if (!authData.user) {
      throw new Error('User creation failed - no user returned');
    }

    // Create profile with admin role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role: 'admin',
        email_verified: true,
        pending_approval: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileError) throw profileError;

    console.log('\n✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Email:      ${email}`);
    console.log(`   Name:       ${firstName} ${lastName}`);
    console.log(`   Role:       admin`);
    console.log(`   User ID:    ${authData.user.id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📌 You can now log in at: /admin/login');

  } catch (error: any) {
    console.error('\n❌ Failed to create admin user:');
    console.error(`   ${error.message}`);
    
    if (error.message?.includes('already registered')) {
      console.log('\n💡 Tip: If you need to make an existing user an admin, run this SQL:');
      console.log(`   UPDATE profiles SET role = 'admin' WHERE email = '${email}';`);
    }
    
    process.exitCode = 1;
  }
}

void createAdmin().catch((error: unknown) => {
  console.error('\n❌ Unhandled error while creating admin user:');
  console.error(`   ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 1;
});
