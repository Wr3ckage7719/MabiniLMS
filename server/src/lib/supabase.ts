import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory (go up 2 levels: lib -> src -> server)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const normalizeEnvValue = (value?: string): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

type JwtPayload = {
  role?: unknown;
};

type SupabaseKeyKind =
  | 'jwt_anon'
  | 'jwt_service_role'
  | 'jwt_other'
  | 'secret'
  | 'publishable'
  | 'unknown';

type KeyCandidate = {
  source: string;
  value: string;
  kind: SupabaseKeyKind;
};

const decodeJwtPayload = (token: string): JwtPayload | null => {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }
};

const classifySupabaseKey = (key: string): SupabaseKeyKind => {
  if (!key) {
    return 'unknown';
  }

  if (key.startsWith('sb_secret_')) {
    return 'secret';
  }

  if (key.startsWith('sb_publishable_')) {
    return 'publishable';
  }

  const payload = decodeJwtPayload(key);
  if (!payload) {
    return 'unknown';
  }

  const role = typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : '';
  if (role === 'service_role') {
    return 'jwt_service_role';
  }

  if (role === 'anon') {
    return 'jwt_anon';
  }

  return 'jwt_other';
};

const buildKeyCandidates = (
  entries: Array<{ source: string; rawValue: string | undefined }>
): KeyCandidate[] => {
  return entries
    .map(({ source, rawValue }) => ({
      source,
      value: normalizeEnvValue(rawValue),
    }))
    .filter(({ value }) => Boolean(value))
    .map(({ source, value }) => ({
      source,
      value,
      kind: classifySupabaseKey(value),
    }));
};

const selectPreferredKeyCandidate = (
  candidates: KeyCandidate[],
  preferredKinds: SupabaseKeyKind[]
): KeyCandidate | null => {
  for (const candidate of candidates) {
    if (preferredKinds.includes(candidate.kind)) {
      return candidate;
    }
  }

  return candidates[0] || null;
};

const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL);
const anonKeyCandidates = buildKeyCandidates([
  { source: 'SUPABASE_ANON_KEY', rawValue: process.env.SUPABASE_ANON_KEY },
  { source: 'SUPABASE_PUBLISHABLE_KEY', rawValue: process.env.SUPABASE_PUBLISHABLE_KEY },
]);
const serviceKeyCandidates = buildKeyCandidates([
  { source: 'SUPABASE_SECRET_KEY', rawValue: process.env.SUPABASE_SECRET_KEY },
  { source: 'SUPABASE_SERVICE_ROLE_KEY', rawValue: process.env.SUPABASE_SERVICE_ROLE_KEY },
  { source: 'SUPABASE_SERVICE_KEY', rawValue: process.env.SUPABASE_SERVICE_KEY },
]);

const selectedAnonKey = selectPreferredKeyCandidate(anonKeyCandidates, ['publishable', 'jwt_anon']);
const selectedServiceKey = selectPreferredKeyCandidate(serviceKeyCandidates, ['secret', 'jwt_service_role']);

const supabaseAnonKey = selectedAnonKey?.value || '';
const supabaseServiceKey = selectedServiceKey?.value || '';
const supabaseAnonKeySource = selectedAnonKey?.source || 'UNSET';
const supabaseServiceKeySource = selectedServiceKey?.source || 'UNSET';

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)');
  if (!supabaseServiceKey) {
    missing.push('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY)');
  }
  throw new Error(`Missing Supabase environment variables: ${missing.join(', ')}`);
}

const assertSupabaseKeyConfiguration = (): void => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (supabaseServiceKey === supabaseAnonKey) {
    throw new Error(
      'Invalid Supabase key configuration: server write key matches anon/publishable key. Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY with your service role/secret key.'
    );
  }

  const serviceKeyKind = classifySupabaseKey(supabaseServiceKey);
  const anonKeyKind = classifySupabaseKey(supabaseAnonKey);

  const hasPrivilegedServiceKeyKind = serviceKeyKind === 'secret' || serviceKeyKind === 'jwt_service_role';
  const hasPublicClientKeyKind = anonKeyKind === 'publishable' || anonKeyKind === 'jwt_anon';

  if (!hasPrivilegedServiceKeyKind) {
    throw new Error(
      `Invalid Supabase key configuration: backend write key from ${supabaseServiceKeySource} is not a privileged key (detected ${serviceKeyKind}). Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY with a service role/secret key.`
    );
  }

  if (!hasPublicClientKeyKind) {
    throw new Error(
      `Invalid Supabase key configuration: public key from ${supabaseAnonKeySource} is not an anon/publishable key (detected ${anonKeyKind}). Use SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY for public client access.`
    );
  }
};

assertSupabaseKeyConfiguration();

// Server-side client with service role (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Use a request-scoped auth client for sign-in/refresh flows so sessions never
// mutate the shared service-role client state.
export const createIsolatedAuthClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

// Client with anon key (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const verifySupabaseAdminCapabilities = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (!error) {
    return;
  }

  const normalizedError = String(error.message || '').toLowerCase();
  const isPrivilegeError =
    normalizedError.includes('not_admin') ||
    normalizedError.includes('insufficient') ||
    normalizedError.includes('permission') ||
    normalizedError.includes('forbidden') ||
    normalizedError.includes('unauthorized');

  if (isPrivilegeError) {
    throw new Error(
      'Supabase admin capability check failed: server key does not have admin privileges. Verify SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY and ensure it is not the anon/publishable key.'
    );
  }

  throw new Error(`Supabase admin capability check failed: ${error.message}`);
};

console.log('Supabase clients initialized successfully');
