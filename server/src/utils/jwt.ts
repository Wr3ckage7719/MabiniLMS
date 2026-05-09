/**
 * Decodes the payload of a JWT without verifying its signature.
 * Verification is always handled by Supabase Auth — this is only
 * used to read standard claims (iat, sub, session_id, role) from
 * an already-verified token.
 */
export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};
