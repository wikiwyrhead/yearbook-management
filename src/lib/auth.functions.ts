import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

function getSessionCookie(sessionId: string, maxAge = 2592000): string {
  let isHttps = false;
  try {
    const req = getRequest();
    const proto = req?.headers?.get
      ? req.headers.get("x-forwarded-proto") || req.headers.get("x-forwarded-protocol")
      : (req?.headers as any)?.["x-forwarded-proto"];
    const url = req?.url || "";
    isHttps = proto === "https" || url.startsWith("https://");
  } catch {
    isHttps = false;
  }
  const secureFlag = isHttps ? "; Secure" : "";
  if (maxAge === 0) {
    return `milestone_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`;
  }
  return `milestone_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

export const getCurrentUser = createServerFn({ method: "POST" }).handler(async () => {
  const isLocal = (process.env["DATA_BACKEND"] || "local") === "local";
  if (!isLocal) return { user: null };

  let cookieHeader: string | null | undefined = null;
  try {
    const request = getRequest();
    cookieHeader = request?.headers?.get
      ? request.headers.get("cookie")
      : (request?.headers as any)?.["cookie"];
  } catch {
    // ignore
  }

  const { parseSessionCookie, validateSession } = await import("./auth/session.server");
  const sessionId = parseSessionCookie(cookieHeader);

  if (!sessionId) return { user: null };
  const user = await validateSession(sessionId);
  return { user };
});

export const loginWithPassword = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email(), password: z.string() }))
  .handler(async ({ data }) => {
    const isLocal = (process.env["DATA_BACKEND"] || "local") === "local";
    if (!isLocal) {
      throw new Error("Only local backend is supported in this deployment.");
    }

    const { query } = await import("./db/pool.server");
    const { verifyPassword } = await import("./auth/password.server");
    const { createSession } = await import("./auth/session.server");

    const res = await query(
      `SELECT id, email, password_hash, full_name, avatar_url FROM public.users WHERE email = $1`,
      [data.email.toLowerCase().trim()],
    );

    if (res.rows.length === 0) {
      throw new Error("Invalid email or password.");
    }

    const user = res.rows[0];
    const isValid = await verifyPassword(data.password, user.password_hash);
    if (!isValid) {
      throw new Error("Invalid email or password.");
    }

    const { sessionId } = await createSession(user.id);
    const cookie = getSessionCookie(sessionId);
    setResponseHeader("Set-Cookie", cookie);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
      },
    };
  });

export const signupWithPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      fullName: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const isLocal = (process.env["DATA_BACKEND"] || "local") === "local";
    if (!isLocal) {
      throw new Error("Only local backend is supported in this deployment.");
    }

    const { query } = await import("./db/pool.server");
    const { hashPassword } = await import("./auth/password.server");
    const { createSession } = await import("./auth/session.server");

    const existing = await query(`SELECT id FROM public.users WHERE email = $1`, [
      data.email.toLowerCase().trim(),
    ]);

    if (existing.rows.length > 0) {
      throw new Error("An account with this email already exists.");
    }

    const passwordHash = await hashPassword(data.password);
    const userRes = await query(
      `INSERT INTO public.users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, avatar_url`,
      [data.email.toLowerCase().trim(), passwordHash, data.fullName || null],
    );

    const user = userRes.rows[0];

    await query(
      `INSERT INTO public.profiles (id, email, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name`,
      [user.id, user.email, user.full_name],
    );

    await query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, 'coordinator')
       ON CONFLICT DO NOTHING`,
      [user.id],
    );

    const { sessionId } = await createSession(user.id);
    const cookie = getSessionCookie(sessionId);
    setResponseHeader("Set-Cookie", cookie);

    return { success: true, user };
  });

export const loginWithDemoRole = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      role: z.enum([
        "coordinator",
        "admin",
        "teacher",
        "member",
        "student",
        "coordinator_b",
        "student_b",
      ]),
    }),
  )
  .handler(async ({ data }) => {
    const isLocal = (process.env["DATA_BACKEND"] || "local") === "local";
    if (!isLocal) {
      throw new Error("Demo role login is only available in local/demo deployments.");
    }

    const emailMap: Record<string, string> = {
      coordinator: "coordinator@test.yearbook",
      admin: "admin@test.yearbook",
      teacher: "teacher@test.yearbook",
      member: "member@test.yearbook",
      student: "student@test.yearbook",
      coordinator_b: "coordinator-b@test.yearbook",
      student_b: "student-b@test.yearbook",
    };

    const targetEmail = emailMap[data.role];
    if (!targetEmail) {
      throw new Error("Invalid demo role selected.");
    }

    const { query } = await import("./db/pool.server");
    const { createSession } = await import("./auth/session.server");

    const res = await query(
      `SELECT id, email, full_name, avatar_url FROM public.users WHERE email = $1`,
      [targetEmail],
    );

    if (res.rows.length === 0) {
      throw new Error(`Demo account for ${data.role} (${targetEmail}) was not found in the database. Please run seed-demo-data.mjs first.`);
    }

    const user = res.rows[0];
    const { sessionId } = await createSession(user.id);
    const cookie = getSessionCookie(sessionId);
    setResponseHeader("Set-Cookie", cookie);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
      },
    };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request?.headers?.get("cookie");
  const { parseSessionCookie, deleteSession } = await import("./auth/session.server");
  const sessionId = parseSessionCookie(cookieHeader);

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const expiredCookie = getSessionCookie("", 0);
  setResponseHeader("Set-Cookie", cookieHeader ? expiredCookie : "");

  return { success: true };
});

