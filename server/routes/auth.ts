import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { addMinutes, count, get, nowIso, run, all } from '../db/client.js';
import {
  clearSessionCookie,
  createSession,
  currentUser,
  destroySession,
  getClientIp,
  publicUser,
  requireUser,
  setSessionCookie,
} from '../lib/auth.js';
import { resetMail, sendMail, verificationMail } from '../lib/email.js';
import { ApiError, hashPassword, randomCode, randomToken, rateLimit, sha256, verifyPassword } from '../lib/security.js';
import { emailSchema, parse, passwordSchema, usernameSchema } from '../lib/validation.js';
import type { AuthResponse, MessageResponse } from '../../shared/types.js';

function requestOrigin(req: FastifyRequest): string {
  if (config.publicOrigin) return config.publicOrigin.replace(/\/$/, '');
  const host = req.headers.host ?? 'localhost';
  return `http://${host}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', async (req) => {
    const user = currentUser(req);
    return { user: user ? publicUser(user) : null };
  });

  app.post('/send-code', async (req, reply) => {
    const body = parse(z.object({ email: emailSchema }), req.body);
    const ip = getClientIp(req);
    rateLimit(`send-code:ip:${ip}`, 10, 15 * 60_000);
    rateLimit(`send-code:email:${body.email.toLowerCase()}`, 3, 15 * 60_000);

    const code = randomCode(6);
    run(
      'INSERT INTO email_verifications (email, verification_code, created_at, expires_at) VALUES (?, ?, ?, ?)',
      body.email,
      code,
      nowIso(),
      addMinutes(15),
    );

    const mail = verificationMail(code);
    const result = await sendMail(body.email, mail.subject, mail.html);
    const response: MessageResponse = {
      message: result.delivered
        ? '验证码已发送，请检查您的邮箱'
        : '邮件服务未配置，验证码已写入服务端日志',
      delivered: result.delivered,
    };
    if (!result.delivered && !config.isProd) response.devCode = code;
    return reply.send(response);
  });

  app.post('/register', async (req, reply) => {
    const body = parse(
      z.object({
        username: usernameSchema,
        email: emailSchema,
        code: z.string().trim().regex(/^\d{6}$/, '请输入 6 位数字验证码'),
        password: passwordSchema,
      }),
      req.body,
    );
    const ip = getClientIp(req);
    rateLimit(`register:${ip}`, 5, 60 * 60_000);

    const verification = get<{ id: number; attempts: number }>(
      `SELECT id, attempts FROM email_verifications
        WHERE email = ? AND verification_code = ? AND consumed_at IS NULL AND expires_at > ?
        ORDER BY id DESC LIMIT 1`,
      body.email,
      body.code,
      nowIso(),
    );
    if (!verification) throw ApiError.badRequest('验证码无效或已过期');
    if (verification.attempts >= 5) throw ApiError.badRequest('验证码尝试次数过多，请重新获取');

    const taken = get<{ id: number }>('SELECT id FROM users WHERE username = ? OR email = ?', body.username, body.email);
    if (taken) throw ApiError.conflict('用户名或邮箱已被使用');

    const user = run(
      `INSERT INTO users (username, email, password_hash, role, created_at, email_verified_at, last_ip)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
      body.username,
      body.email,
      hashPassword(body.password),
      nowIso(),
      nowIso(),
      ip,
    );
    run('UPDATE email_verifications SET consumed_at = ? WHERE id = ?', nowIso(), verification.id);

    const session = createSession(user.lastInsertRowid, ip, req.headers['user-agent'] ?? '');
    setSessionCookie(reply, session.id);
    const created = currentUserFromId(user.lastInsertRowid);
    return reply.code(201).send({ user: created } satisfies AuthResponse);
  });

  app.post('/login', async (req, reply) => {
    const body = parse(
      z.object({
        username: z.string().trim().min(1, '请输入用户名'),
        password: z.string().min(1, '请输入密码'),
      }),
      req.body,
    );
    const ip = getClientIp(req);
    rateLimit(`login:${ip}`, 10, 15 * 60_000);
    rateLimit(`login:user:${body.username.toLowerCase()}`, 10, 15 * 60_000);

    const row = get<{
      id: number;
      username: string;
      email: string;
      password_hash: string;
      role: number;
      created_at: string;
      email_verified_at: string | null;
      banned_until: string | null;
      ban_reason: string | null;
    }>('SELECT * FROM users WHERE username = ?', body.username);

    if (!row || !verifyPassword(body.password, row.password_hash)) {
      throw ApiError.unauthorized('用户名或密码错误');
    }
    if (row.banned_until && row.banned_until > nowIso()) {
      throw new ApiError(403, `您的账户已被封禁，直到 ${formatDateTime(row.banned_until)}`);
    }

    run('UPDATE users SET last_ip = ? WHERE id = ?', ip, row.id);
    const session = createSession(row.id, ip, req.headers['user-agent'] ?? '');
    setSessionCookie(reply, session.id);
    const user = currentUserFromId(row.id);
    return reply.send({ user } satisfies AuthResponse);
  });

  app.post('/logout', async (req, reply) => {
    destroySession(req, reply);
    return reply.send({ message: '已退出登录' } satisfies MessageResponse);
  });

  app.post('/forgot', async (req, reply) => {
    const body = parse(z.object({ email: emailSchema }), req.body);
    rateLimit(`forgot:ip:${getClientIp(req)}`, 5, 30 * 60_000);
    rateLimit(`forgot:email:${body.email.toLowerCase()}`, 3, 30 * 60_000);

    const user = get<{ id: number; username: string }>('SELECT id, username FROM users WHERE email = ?', body.email);
    if (user) {
      const token = randomToken(32);
      run(
        'INSERT INTO password_resets (email, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)',
        body.email,
        sha256(token),
        nowIso(),
        addMinutes(60),
      );
      const link = `${requestOrigin(req)}/reset-password?token=${token}`;
      const mail = resetMail(link);
      void sendMail(body.email, mail.subject, mail.html);
    }
    // Same response either way: never disclose whether an email is registered.
    return reply.send({ message: '如果该邮箱已注册，重置链接已发送，请查收。' } satisfies MessageResponse);
  });

  app.post('/reset', async (req, reply) => {
    const body = parse(
      z.object({ token: z.string().trim().min(10, '重置链接无效'), password: passwordSchema }),
      req.body,
    );
    rateLimit(`reset:${getClientIp(req)}`, 10, 30 * 60_000);

    const reset = get<{ id: number; email: string }>(
      'SELECT id, email FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
      sha256(body.token),
      nowIso(),
    );
    if (!reset) throw ApiError.badRequest('链接无效或已过期');

    run('UPDATE users SET password_hash = ? WHERE email = ?', hashPassword(body.password), reset.email);
    run('UPDATE password_resets SET used_at = ? WHERE id = ?', nowIso(), reset.id);
    run('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)', reset.email);
    return reply.send({ message: '密码重置成功，请使用新密码登录' } satisfies MessageResponse);
  });

  app.post('/change-password', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(
      z.object({ currentPassword: z.string().min(1, '请输入当前密码'), newPassword: passwordSchema }),
      req.body,
    );
    const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) {
      throw ApiError.badRequest('当前密码不正确');
    }
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.newPassword), user.id);
    run(
      'DELETE FROM sessions WHERE user_id = ? AND id <> ?',
      user.id,
      req.cookies[config.session.cookieName] ?? '',
    );
    return reply.send({ message: '密码已更新' } satisfies MessageResponse);
  });

  app.patch('/profile', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(
      z.object({ username: usernameSchema, email: emailSchema }).partial(),
      req.body,
    );
    const username = body.username ?? user.username;
    const email = body.email ?? user.email;
    const taken = get<{ id: number }>(
      'SELECT id FROM users WHERE id <> ? AND (username = ? OR email = ?)',
      user.id,
      username,
      email,
    );
    if (taken) throw ApiError.conflict('用户名或邮箱已被使用');
    if (username !== user.username && count('SELECT COUNT(*) FROM users WHERE username = ?', username) > 0) {
      throw ApiError.conflict('用户名已被使用');
    }
    run('UPDATE users SET username = ?, email = ? WHERE id = ?', username, email, user.id);
    const updated = currentUserFromId(user.id);
    return reply.send({ user: updated } satisfies AuthResponse);
  });

  app.get('/sessions', async (req) => {
    const user = requireUser(req);
    const rows = getSessions(user.id, req.cookies[config.session.cookieName] ?? '');
    return { items: rows };
  });

  app.delete('/sessions/:id', async (req, reply) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    run('DELETE FROM sessions WHERE id = ? AND user_id = ?', id, user.id);
    return reply.send({ message: '会话已退出' } satisfies MessageResponse);
  });

  app.delete('/account', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(z.object({ password: z.string().min(1, '请输入密码') }), req.body);
    const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      throw ApiError.badRequest('密码不正确');
    }
    if (user.role === 2) throw ApiError.forbidden('超级管理员账户不能自行删除');
    run('DELETE FROM users WHERE id = ?', user.id);
    clearSessionCookie(reply);
    return reply.send({ message: '账户已注销' } satisfies MessageResponse);
  });
}

function currentUserFromId(id: number) {
  const row = get<{
    id: number;
    username: string;
    email: string;
    role: number;
    created_at: string;
    email_verified_at: string | null;
    banned_until: string | null;
    ban_reason: string | null;
  }>('SELECT * FROM users WHERE id = ?', id);
  if (!row) throw ApiError.notFound('用户不存在');
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role as 0 | 1 | 2,
    createdAt: row.created_at,
    emailVerified: Boolean(row.email_verified_at),
    bannedUntil: row.banned_until,
    banReason: row.ban_reason,
  };
}

function getSessions(userId: number, currentSessionId: string) {
  const rows = all<{
    id: string;
    created_at: string;
    expires_at: string;
    ip: string | null;
    user_agent: string | null;
  }>(
    'SELECT id, created_at, expires_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
    userId,
  );
  return rows.map((row) => ({
    id: row.id,
    current: row.id === currentSessionId,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ip: row.ip,
    userAgent: row.user_agent,
  }));
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false });
}
