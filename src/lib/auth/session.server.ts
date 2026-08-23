import { randomBytes } from "node:crypto";
import { query } from "../db/pool.server";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  roles: string[];
}

export async function createSession(
  userId: string,
): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await query(`INSERT INTO public.sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`, [
    sessionId,
    userId,
    expiresAt,
  ]);

  return { sessionId, expiresAt };
}

export async function validateSession(sessionId: string): Promise<SessionUser | null> {
  if (!sessionId) return null;

  const res = await query(
    `SELECT s.id as session_id, s.expires_at, u.id, u.email, u.full_name, u.avatar_url,
            COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') as roles
     FROM public.sessions s
     JOIN public.users u ON u.id = s.user_id
     LEFT JOIN public.user_roles r ON r.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > now()
     GROUP BY s.id, s.expires_at, u.id, u.email, u.full_name, u.avatar_url`,
    [sessionId],
  );

  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    roles: row.roles,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await query(`DELETE FROM public.sessions WHERE id = $1`, [sessionId]);
}

export function parseSessionCookie(cookieHeader?: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/milestone_session=([^;]+)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}
