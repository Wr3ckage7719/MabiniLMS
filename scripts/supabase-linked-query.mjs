#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function readFromDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return '';
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    if (!trimmed.startsWith('DATABASE_URL=')) {
      continue;
    }

    return trimmed.slice('DATABASE_URL='.length).trim();
  }

  return '';
}

function getDatabaseUrl() {
  const value = ((process.env.DATABASE_URL || '').trim() || readFromDotEnv()).trim();
  if (!value) {
    throw new Error('DATABASE_URL is not set. Add it to .env before running this command.');
  }
  if (!value.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must start with postgresql://');
  }
  return value;
}

function extractPasswordFromDatabaseUrl(databaseUrl) {
  // Use a manual parse so this works even when password contains unencoded '@'.
  const body = databaseUrl.slice('postgresql://'.length);
  const atIndex = body.lastIndexOf('@');
  if (atIndex < 0) {
    throw new Error('DATABASE_URL is missing the host separator (@).');
  }

  const credentials = body.slice(0, atIndex);
  const colonIndex = credentials.indexOf(':');
  if (colonIndex < 0) {
    throw new Error('DATABASE_URL is missing username/password separator (:).');
  }

  const rawPassword = credentials.slice(colonIndex + 1);
  return decodeURIComponent(rawPassword);
}

function getSqlFromArgs() {
  const sql = process.argv.slice(2).join(' ').trim();
  return sql || 'select 1 as ok;';
}

function run() {
  const databaseUrl = getDatabaseUrl();
  const dbPassword = extractPasswordFromDatabaseUrl(databaseUrl);
  const sql = getSqlFromArgs();

  const env = {
    ...process.env,
    SUPABASE_DB_PASSWORD: dbPassword,
  };

  // JSON.stringify safely wraps/escapes SQL for shell execution.
  const command = `npx supabase db query ${JSON.stringify(sql)} --linked --dns-resolver https`;

  try {
    execSync(command, {
      stdio: 'inherit',
      env,
    });
    process.exit(0);
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error
      ? Number(error.status)
      : 1;
    process.exit(Number.isFinite(status) ? status : 1);
  }
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
