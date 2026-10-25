import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { get, nowIso, run, transaction } from '../db/client.js';
import { createSession, getClientIp, requestOrigin, setSessionCookie } from '../lib/auth.js';
import { hashPassword, randomToken } from '../lib/security.js';

/**
 * 「使用 LCZOJ 账号登录」——OAuth 2.0 授权码客户端。
 *
 * 流程：
 *   1. 浏览器访问 /api/auth/lczoj，生成随机 state（HttpOnly Cookie），302 到 LCZOJ 授权页；
 *   2. 用户在 LCZOJ 登录并同意授权，LCZOJ 回跳 /api/auth/lczoj/callback?code&state；
 *   3. 服务端用 code + client_secret 换 access_token，再取 userinfo；
 *   4. 按 LCZOJ 的永久 sub 查找绑定：已绑定 → 登录；未绑定 → 自动创建本地账号；
 *   5. 建立 Lith Tools 会话并回到 next（默认 /dashboard）。
 *
 * 安全要点：state 双提交校验、client_secret 只存在服务端、本地账号一律 role=0（不继承 LCZOJ 管理权限）。
 */

const PROVIDER = 'lczoj';
const STATE_COOKIE = 'lith_lczoj_state';
const NEXT_COOKIE = 'lith_lczoj_next';
const FLOW_TTL_SECONDS = 600;
const UPSTREAM_TIMEOUT_MS = 10_000;

interface LczojProfile {
  sub: string;
  id?: number;
  username: string;
  nickname?: string;
  email?: string;
  emailVerified?: boolean;
}

interface UserRow {
  id: number;
  username: string;
  email: string;
  banned_until: string | null;
}

class OAuthFlowError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = 'OAuthFlowError';
    this.code = code;
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(sha256(a), 'hex');
  const right = Buffer.from(sha256(b), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function cookieOptions() {
  return {
    path: '/api/auth/lczoj',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.session.cookieSecure,
    maxAge: FLOW_TTL_SECONDS,
  };
}

/** 只允许站内绝对路径，避免开放重定向。 */
function sanitizeNext(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/dashboard';
  return raw;
}

function redirectUriFor(req: FastifyRequest): string {
  return config.lczoj.redirectUri || `${requestOrigin(req)}/api/auth/lczoj/callback`;
}

function loginError(code: string): string {
  return `/login?error=${encodeURIComponent(code)}`;
}

function stringField(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseProfile(payload: unknown): LczojProfile {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OAuthFlowError('profile');
  }
  const data = payload as Record<string, unknown>;
  const sub = stringField(data.sub, 128);
  const username = stringField(data.username, 64);
  if (!sub || !username) throw new OAuthFlowError('profile');
  const id = typeof data.id === 'number' && Number.isInteger(data.id) && data.id > 0 ? data.id : undefined;
  return {
    sub,
    id,
    username,
    nickname: stringField(data.nickname, 64),
    email: stringField(data.email, 254),
    emailVerified: data.email_verified === true,
  };
}

async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.lczoj.clientId,
    client_secret: config.lczoj.clientSecret,
    redirect_uri: redirectUri,
  });

  let response: Response;
  try {
    response = await fetch(`${config.lczoj.baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new OAuthFlowError('upstream');
  }

  const text = await response.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    data = null;
  }
  const token = typeof data?.access_token === 'string' ? data.access_token.trim() : '';
  if (!response.ok || !token) throw new OAuthFlowError('token');
  return token;
}

async function fetchProfile(token: string): Promise<LczojProfile> {
  let response: Response;
  try {
    response = await fetch(`${config.lczoj.baseUrl}/api/oauth/userinfo`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new OAuthFlowError('upstream');
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) throw new OAuthFlowError('profile');
  return parseProfile(data);
}

/** 把 LCZOJ 用户名收敛为 Lith Tools 允许的字符集（3–32 位）。 */
function sanitizeUsername(raw: string, sub: string): string {
  let name = String(raw || '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_\u4e00-\u9fa5.-]/gu, '')
    .slice(0, 32);
  if (name.length < 3) name = `oj_${sub.replace(/^u_/, '').slice(0, 8)}`;
  if (name.length < 3) name = 'lczoj_user';
  return name;
}

function pickUsername(raw: string, sub: string): string {
  const base = sanitizeUsername(raw, sub);
  let candidate = base;
  for (let index = 1; index <= 999; index += 1) {
    if (!get<{ id: number }>('SELECT id FROM users WHERE username = ?', candidate)) return candidate;
    const suffix = `_${index}`;
    candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
  }
  throw new OAuthFlowError('username');
}

function pickEmail(profile: LczojProfile): string {
  const email = profile.email?.trim() ?? '';
  if (email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (!get<{ id: number }>('SELECT id FROM users WHERE email = ?', email)) return email;
  }
  // 邮箱为空、格式不合法或已被其他账号占用时，使用不会与真实邮箱冲突的保留域名地址。
  const local = profile.sub.replace(/[^a-z0-9]/gi, '').slice(0, 48);
  return `lczoj+${local}@users.lczoj.local`;
}

/**
 * 找到（或创建）本地账号并写入绑定。
 * 以永久 sub 为键；LCZOJ 的 uid 会被复用，因此绝不使用 id 作为绑定主键。
 */
function resolveLocalUser(profile: LczojProfile, ip: string): number {
  return transaction(() => {
    const linked = get<{ user_id: number }>(
      'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
      PROVIDER,
      profile.sub,
    );

    if (linked) {
      const user = get<UserRow>('SELECT id, username, email, banned_until FROM users WHERE id = ?', linked.user_id);
      if (user) {
        if (user.banned_until && user.banned_until > nowIso()) throw new OAuthFlowError('banned');
        run('UPDATE users SET last_ip = ? WHERE id = ?', ip, user.id);
        run(
          'UPDATE oauth_accounts SET provider_username = ?, provider_email = ? WHERE provider = ? AND provider_user_id = ?',
          profile.username,
          profile.email ?? '',
          PROVIDER,
          profile.sub,
        );
        return user.id;
      }
      // 本地用户已被删除：清掉悬挂绑定，按首次登录重新创建。
      run('DELETE FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?', PROVIDER, profile.sub);
    }

    const username = pickUsername(profile.username, profile.sub);
    const email = pickEmail(profile);
    const created = run(
      `INSERT INTO users (username, email, password_hash, role, created_at, email_verified_at, last_ip)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
      username,
      email,
      // OAuth 账号不使用密码登录；写入一个随机不可用的哈希，满足表约束。
      hashPassword(randomToken(32)),
      nowIso(),
      // 与 LCZOJ 的邮箱验证状态保持一致；未验证时 Lith Tools 侧保留「未验证」提示。
      profile.emailVerified ? nowIso() : null,
      ip,
    );
    run(
      `INSERT INTO oauth_accounts (provider, provider_user_id, user_id, provider_username, provider_email, linked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      PROVIDER,
      profile.sub,
      created.lastInsertRowid,
      profile.username,
      profile.email ?? '',
      nowIso(),
    );
    return created.lastInsertRowid;
  });
}

function clearFlowCookies(reply: FastifyReply): void {
  reply.clearCookie(STATE_COOKIE, { path: '/api/auth/lczoj' });
  reply.clearCookie(NEXT_COOKIE, { path: '/api/auth/lczoj' });
}

export async function lczojRoutes(app: FastifyInstance): Promise<void> {
  /** 登录页用它决定是否显示「使用 LCZOJ 账号登录」按钮。 */
  app.get('/lczoj/status', async () => ({
    enabled: config.lczoj.enabled,
    name: config.lczoj.name,
  }));

  app.get('/lczoj', async (req, reply) => {
    if (!config.lczoj.enabled) {
      return reply.code(503).send({ error: 'LCZOJ 授权登录尚未配置' });
    }

    const query = req.query as Record<string, unknown> | undefined;
    const state = randomToken(24);
    reply.setCookie(STATE_COOKIE, state, cookieOptions());
    reply.setCookie(NEXT_COOKIE, sanitizeNext(query?.next), cookieOptions());

    const target = new URL(`${config.lczoj.baseUrl}/api/oauth/authorize`);
    target.searchParams.set('response_type', 'code');
    target.searchParams.set('client_id', config.lczoj.clientId);
    target.searchParams.set('redirect_uri', redirectUriFor(req));
    target.searchParams.set('scope', 'profile');
    target.searchParams.set('state', state);
    return reply.redirect(target.toString());
  });

  app.get('/lczoj/callback', async (req, reply) => {
    const query = (req.query ?? {}) as Record<string, unknown>;
    const state = stringField(query.state, 200);
    const code = stringField(query.code, 512);
    const upstreamError = stringField(query.error, 80);
    const cookieState = req.cookies[STATE_COOKIE] ?? '';
    const next = sanitizeNext(req.cookies[NEXT_COOKIE]);
    clearFlowCookies(reply);

    if (!config.lczoj.enabled) return reply.redirect(loginError('lczoj_unconfigured'));
    if (upstreamError) {
      const localCode =
        upstreamError === 'access_denied'
          ? 'lczoj_denied'
          : upstreamError === 'account_banned'
            ? 'lczoj_banned'
            : 'lczoj_failed';
      return reply.redirect(loginError(localCode));
    }
    if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
      return reply.redirect(loginError('lczoj_state'));
    }

    try {
      const token = await exchangeCode(code, redirectUriFor(req));
      const profile = await fetchProfile(token);
      const userId = resolveLocalUser(profile, getClientIp(req));
      const session = createSession(userId, getClientIp(req), String(req.headers['user-agent'] ?? '').slice(0, 300));
      setSessionCookie(reply, session.id);
      return reply.redirect(next);
    } catch (error) {
      if (error instanceof OAuthFlowError) {
        req.log.warn({ code: error.code }, 'LCZOJ OAuth login failed');
        return reply.redirect(loginError(error.code === 'banned' ? 'lczoj_banned' : 'lczoj_failed'));
      }
      req.log.warn({ error }, 'LCZOJ OAuth login failed');
      return reply.redirect(loginError('lczoj_failed'));
    }
  });
}
