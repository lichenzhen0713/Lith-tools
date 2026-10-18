import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { all, get, nowIso, run } from '../db/client.js';
import { ApiError, randomToken } from './security.js';

export type Role = 0 | 1 | 2;

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  createdAt: string;
  emailVerified: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  lastIp: string | null;
}

interface SessionRow {
  user_id: number;
  username: string;
  email: string;
  role: number;
  created_at: string;
  email_verified_at: string | null;
  banned_until: string | null;
  ban_reason: string | null;
  last_ip: string | null;
}

export function getClientIp(req: FastifyRequest): string {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (first) {
      const candidate = first.split(',')[0]?.trim();
      if (candidate) return candidate;
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  }
  return req.ip ?? '0.0.0.0';
}

export function createSession(userId: number, ip: string, userAgent: string): { id: string; expiresAt: string } {
  const id = randomToken(32);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + config.session.ttlDays * 86_400_000).toISOString();
  run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    userId,
    createdAt,
    expiresAt,
    ip.slice(0, 64),
    userAgent.slice(0, 300),
  );
  return { id, expiresAt };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(config.session.cookieName, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.cookieSecure,
    maxAge: config.session.ttlDays * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.session.cookieName, { path: '/' });
}

export function destroySession(req: FastifyRequest, reply: FastifyReply): void {
  const sessionId = req.cookies[config.session.cookieName];
  if (sessionId) run('DELETE FROM sessions WHERE id = ?', sessionId);
  clearSessionCookie(reply);
}

/** Resolve the current user (null when anonymous, expired or banned). */
export function currentUser(req: FastifyRequest): SessionUser | null {
  const sessionId = req.cookies[config.session.cookieName];
  if (!sessionId) return null;
  const row = get<SessionRow>(
    `SELECT u.id AS user_id, u.username, u.email, u.role, u.created_at, u.email_verified_at,
            u.banned_until, u.ban_reason, u.last_ip
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
    sessionId,
    nowIso(),
  );
  if (!row) return null;
  if (row.banned_until && row.banned_until > nowIso()) {
    run('DELETE FROM sessions WHERE id = ?', sessionId);
    return null;
  }
  return {
    id: row.user_id,
    username: row.username,
    email: row.email,
    role: row.role as Role,
    createdAt: row.created_at,
    emailVerified: Boolean(row.email_verified_at),
    bannedUntil: row.banned_until,
    banReason: row.ban_reason,
    lastIp: row.last_ip,
  };
}

export function requireUser(req: FastifyRequest): SessionUser {
  const user = currentUser(req);
  if (!user) throw ApiError.unauthorized();
  return user;
}

export function requireAdmin(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (user.role < 1) throw ApiError.forbidden('需要管理员权限');
  return user;
}

export function requireSuperAdmin(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (user.role !== 2) throw ApiError.forbidden('需要超级管理员权限');
  return user;
}

/** Purge expired session rows (called periodically by the server). */
export function purgeExpiredSessions(): void {
  run('DELETE FROM sessions WHERE expires_at <= ?', nowIso());
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    emailVerified: user.emailVerified,
    bannedUntil: user.bannedUntil,
    banReason: user.banReason,
  };
}

export function findUserByUsername(username: string): SessionUser | null {
  const row = get<SessionRow & { id: number }>(
    `SELECT id, id AS user_id, username, email, role, created_at, email_verified_at,
            banned_until, ban_reason, last_ip
       FROM users WHERE username = ?`,
    username,
  );
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role as Role,
    createdAt: row.created_at,
    emailVerified: Boolean(row.email_verified_at),
    bannedUntil: row.banned_until,
    banReason: row.ban_reason,
    lastIp: row.last_ip,
  };
}

export function sessionCountFor(userId: number): number {
  const rows = all<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', userId);
  return Number(rows[0]?.n ?? 0);
}
