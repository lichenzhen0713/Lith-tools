import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SqlValue } from '../db/client.js';
import { all, count, get, nowIso, run } from '../db/client.js';
import { requireAdmin, requireSuperAdmin } from '../lib/auth.js';
import { banNoticeMail, feedbackResultMail, sendMail, submissionResultMail } from '../lib/email.js';
import { ApiError, hashPassword, rateLimit } from '../lib/security.js';
import { httpUrlSchema, pagination, parse, parseDays, parseId, passwordSchema, stripMarkdown, titleSchema, usernameSchema, emailSchema } from '../lib/validation.js';
import { banIp, unbanIp } from '../lib/access.js';
import type {
  AccessLogDTO,
  AdminStats,
  AdminUserDTO,
  BanHistoryDTO,
  BanRecordDTO,
  CategoryDTO,
  FeedbackDTO,
  SubmissionDTO,
  ToolCategoryDTO,
  ToolDTO,
} from '../../shared/types.js';

function emailOf(userId: number | null): string | null {
  if (!userId) return null;
  const row = get<{ email: string }>('SELECT email FROM users WHERE id = ?', userId);
  return row?.email ?? null;
}

function roleOf(userId: number): number {
  return Number(get<{ role: number }>('SELECT role FROM users WHERE id = ?', userId)?.role ?? 0);
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    requireAdmin(req);
  });

  // ------------------------------------------------------------------- stats
  app.get('/admin/stats', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const stats: AdminStats = {
      users: count('SELECT COUNT(*) FROM users'),
      admins: count('SELECT COUNT(*) FROM users WHERE role >= 1'),
      tools: count('SELECT COUNT(*) FROM tools'),
      disabledTools: count('SELECT COUNT(*) FROM tools WHERE disabled = 1'),
      blogs: count('SELECT COUNT(*) FROM blogs'),
      comments: count('SELECT COUNT(*) FROM blog_comments'),
      threads: count('SELECT COUNT(*) FROM threads'),
      posts: count('SELECT COUNT(*) FROM posts'),
      feedbackOpen: count("SELECT COUNT(*) FROM user_feedback WHERE status = 'open'"),
      toolSubmissionsPending: count("SELECT COUNT(*) FROM user_submissions WHERE status = 'pending'"),
      blogSubmissionsPending: count("SELECT COUNT(*) FROM blog_submissions WHERE status = 'pending'"),
      bannedIps: count('SELECT COUNT(*) FROM banned_ips WHERE banned_until > ?', nowIso()),
      visits:
        count('SELECT COALESCE(SUM(access_count), 0) FROM access_logs') +
        count('SELECT COALESCE(SUM(access_count), 0) FROM temporary_access_logs'),
      todayVisits: count('SELECT COUNT(*) FROM access_logs WHERE access_time >= ?', today.toISOString()),
    };
    return stats;
  });

  // ------------------------------------------------------------------- users
  app.get('/admin/users', async (req) => {
    requireSuperAdmin(req);
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 20 });
    const filters: string[] = ['1 = 1'];
    const params: SqlValue[] = [];
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    if (q) {
      filters.push('(username LIKE ? OR email LIKE ? OR CAST(id AS TEXT) = ?)');
      params.push(`%${q}%`, `%${q}%`, q);
    }
    if (query.role !== undefined && query.role !== 'all' && query.role !== '') {
      filters.push('role = ?');
      params.push(Number(query.role));
    }
    if (query.banned === '1') filters.push('banned_until IS NOT NULL AND banned_until > ' + `'${nowIso()}'`);
    if (query.banned === '0') filters.push('(banned_until IS NULL OR banned_until <= ' + `'${nowIso()}'` + ')');

    const where = filters.join(' AND ');
    const total = count(`SELECT COUNT(*) FROM users WHERE ${where}`, ...params);
    const rows = all<{
      id: number;
      username: string;
      email: string;
      role: number;
      created_at: string;
      email_verified_at: string | null;
      banned_until: string | null;
      ban_reason: string | null;
      last_ip: string | null;
      sessions: number;
      blogs: number;
    }>(
      `SELECT u.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions,
              (SELECT COUNT(*) FROM blogs b WHERE b.author_id = u.id) AS blogs
         FROM users u WHERE ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      nowIso(),
      ...params,
      pageSize,
      offset,
    );
    const items: AdminUserDTO[] = rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as AdminUserDTO['role'],
      createdAt: row.created_at,
      emailVerified: Boolean(row.email_verified_at),
      bannedUntil: row.banned_until,
      banReason: row.ban_reason,
      lastIp: row.last_ip,
      sessions: Number(row.sessions ?? 0),
      blogCount: Number(row.blogs ?? 0),
    }));
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });

  app.post('/admin/users', async (req, reply) => {
    requireSuperAdmin(req);
    const body = parse(
      z.object({
        username: usernameSchema,
        email: emailSchema,
        password: passwordSchema,
        role: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().default(0),
      }),
      req.body,
    );
    const taken = get<{ id: number }>('SELECT id FROM users WHERE username = ? OR email = ?', body.username, body.email);
    if (taken) throw ApiError.conflict('用户名或邮箱已被使用');
    const result = run(
      `INSERT INTO users (username, email, password_hash, role, created_at, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      body.username,
      body.email,
      hashPassword(body.password),
      body.role,
      nowIso(),
      nowIso(),
    );
    return reply.code(201).send({ message: '新用户已添加', id: result.lastInsertRowid });
  });

  app.patch('/admin/users/:id', async (req) => {
    const admin = requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '用户 ID');
    const target = get<{ id: number; role: number }>('SELECT id, role FROM users WHERE id = ?', id);
    if (!target) throw ApiError.notFound('用户不存在');
    if (id === admin.id && req.body && typeof req.body === 'object' && 'role' in req.body) {
      throw ApiError.badRequest('不能修改自己的角色');
    }
    const requestedRole = (req.body as { role?: number } | null)?.role;
    if (requestedRole !== undefined && target.role === 2 && requestedRole !== 2) {
      const supers = count('SELECT COUNT(*) FROM users WHERE role = 2');
      if (supers <= 1) throw ApiError.badRequest('至少需要保留一个超级管理员');
    }
    const body = parse(
      z.object({
        username: usernameSchema.optional(),
        email: emailSchema.optional(),
        role: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
        password: passwordSchema.optional(),
        bannedUntil: z.string().nullable().optional(),
        banReason: z.string().max(500).nullable().optional(),
        emailVerified: z.boolean().optional(),
      }),
      req.body,
    );
    const current = get<{
      username: string;
      email: string;
      role: number;
      banned_until: string | null;
      ban_reason: string | null;
      email_verified_at: string | null;
    }>('SELECT * FROM users WHERE id = ?', id);
    if (!current) throw ApiError.notFound('用户不存在');
    const username = body.username ?? current.username;
    const email = body.email ?? current.email;
    const taken = get<{ id: number }>(
      'SELECT id FROM users WHERE id <> ? AND (username = ? OR email = ?)',
      id,
      username,
      email,
    );
    if (taken) throw ApiError.conflict('用户名或邮箱已被使用');

    run(
      `UPDATE users SET username = ?, email = ?, role = ?, banned_until = ?, ban_reason = ?, email_verified_at = ?
        WHERE id = ?`,
      username,
      email,
      body.role ?? current.role,
      body.bannedUntil === undefined ? current.banned_until : body.bannedUntil,
      body.banReason === undefined ? current.ban_reason : body.banReason,
      body.emailVerified === undefined
        ? current.email_verified_at
        : body.emailVerified
          ? (current.email_verified_at ?? nowIso())
          : null,
      id,
    );
    if (body.password) {
      run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.password), id);
      run('DELETE FROM sessions WHERE user_id = ?', id);
    }
    return { message: '用户信息已更新' };
  });

  app.delete('/admin/users/:id', async (req) => {
    const admin = requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '用户 ID');
    if (id === admin.id) throw ApiError.badRequest('不能删除自己的账户');
    const target = get<{ role: number }>('SELECT role FROM users WHERE id = ?', id);
    if (!target) throw ApiError.notFound('用户不存在');
    if (target.role === 2) throw ApiError.forbidden('超级管理员无法被删除');
    run('DELETE FROM users WHERE id = ?', id);
    return { message: '用户已删除' };
  });

  app.post('/admin/users/:id/ban', async (req) => {
    requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '用户 ID');
    const target = get<{ id: number; role: number; email: string }>('SELECT id, role, email FROM users WHERE id = ?', id);
    if (!target) throw ApiError.notFound('用户不存在');
    if (target.role === 2) throw ApiError.forbidden('不能封禁超级管理员');
    const body = parse(
      z.object({ days: z.number().int().positive().max(3650).default(30), reason: z.string().max(500).optional().default('') }),
      req.body,
    );
    const until = new Date(Date.now() + body.days * 86_400_000).toISOString();
    run('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?', until, body.reason, id);
    run('DELETE FROM sessions WHERE user_id = ?', id);
    const mail = banNoticeMail(until, body.reason, true);
    void sendMail(target.email, mail.subject, mail.html);
    return { message: '用户已封禁，并通知了用户', bannedUntil: until };
  });

  app.post('/admin/users/:id/unban', async (req) => {
    requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '用户 ID');
    const target = get<{ email: string }>('SELECT email FROM users WHERE id = ?', id);
    if (!target) throw ApiError.notFound('用户不存在');
    run('UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ?', id);
    const mail = banNoticeMail('', '', false);
    void sendMail(target.email, mail.subject, mail.html);
    return { message: '用户已解封，并通知了用户' };
  });

  // ------------------------------------------------------------------- tools
  app.get('/admin/tools', async (req) => {
    requireSuperAdmin(req);
    const rows = all<{
      id: number;
      slug: string | null;
      name: string;
      description: string;
      link: string;
      icon: string;
      is_external: number;
      disabled: number;
      sort_order: number;
      category_id: number | null;
      category_name: string | null;
    }>(
      `SELECT t.*, c.name AS category_name FROM tools t
         LEFT JOIN tool_categories c ON c.id = t.category_id
        ORDER BY t.sort_order, t.id`,
    );
    const items: ToolDTO[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      href: row.link,
      icon: row.icon,
      isExternal: Boolean(row.is_external),
      disabled: Boolean(row.disabled),
      category: row.category_id
        ? { id: row.category_id, slug: '', name: row.category_name ?? '未分类', icon: 'Sparkles', description: '' }
        : null,
    }));
    return { items };
  });

  app.get('/admin/tool-categories', async (req) => {
    requireSuperAdmin(req);
    const rows = all<{ id: number; slug: string; name: string; icon: string; description: string; n: number }>(
      `SELECT c.*, (SELECT COUNT(*) FROM tools t WHERE t.category_id = c.id) AS n
         FROM tool_categories c ORDER BY c.sort_order, c.id`,
    );
    const items: ToolCategoryDTO[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      description: row.description,
      toolCount: Number(row.n),
    }));
    return { items };
  });

  app.post('/admin/tools', async (req, reply) => {
    requireSuperAdmin(req);
    const body = parse(
      z.object({
        name: z.string().trim().min(1, '请输入工具名称').max(120),
        description: z.string().trim().max(500).optional().default(''),
        link: httpUrlSchema.min(1, '请输入工具链接'),
        icon: z.string().max(60).optional().default('ExternalLink'),
        categoryId: z.number().int().positive().nullable().optional(),
        disabled: z.boolean().optional().default(false),
      }),
      req.body,
    );
    const result = run(
      `INSERT INTO tools (slug, name, description, link, category_id, icon, is_external, disabled, sort_order, created_at)
       VALUES (NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      body.name,
      body.description,
      body.link,
      body.categoryId ?? null,
      body.icon,
      body.disabled ? 1 : 0,
      9999,
      nowIso(),
    );
    return reply.code(201).send({ message: '工具已添加', id: result.lastInsertRowid });
  });

  app.patch('/admin/tools/:id', async (req) => {
    requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '工具 ID');
    const tool = get<{ id: number; is_external: number; link: string; name: string; description: string; category_id: number | null; icon: string; disabled: number; sort_order: number }>(
      'SELECT * FROM tools WHERE id = ?',
      id,
    );
    if (!tool) throw ApiError.notFound('工具不存在');
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).optional(),
        link: httpUrlSchema.optional(),
        icon: z.string().max(60).optional(),
        categoryId: z.number().int().positive().nullable().optional(),
        disabled: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }),
      req.body,
    );
    run(
      `UPDATE tools SET name = ?, description = ?, link = ?, category_id = ?, icon = ?, disabled = ?, sort_order = ?
        WHERE id = ?`,
      body.name ?? tool.name,
      body.description ?? tool.description,
      tool.is_external && body.link ? body.link : tool.link,
      body.categoryId === undefined ? tool.category_id : body.categoryId,
      body.icon ?? tool.icon,
      body.disabled === undefined ? tool.disabled : body.disabled ? 1 : 0,
      body.sortOrder ?? tool.sort_order,
      id,
    );
    return { message: '工具已更新' };
  });

  app.delete('/admin/tools/:id', async (req) => {
    requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '工具 ID');
    const tool = get<{ id: number }>('SELECT id FROM tools WHERE id = ?', id);
    if (!tool) throw ApiError.notFound('工具不存在');
    run('DELETE FROM tools WHERE id = ?', id);
    return { message: '工具已删除' };
  });

  // ---------------------------------------------------------------- feedback
  app.get('/admin/feedback', async (req) => {
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 20 });
    const status = typeof query.status === 'string' && query.status ? query.status : 'all';
    const where = status === 'all' ? '1 = 1' : 'f.status = ?';
    const params: SqlValue[] = status === 'all' ? [] : [status];
    const total = count(`SELECT COUNT(*) FROM user_feedback f WHERE ${where}`, ...params);
    const rows = all<{
      id: number;
      username: string;
      rating: number;
      feedback: string;
      status: string;
      created_at: string;
      user_id: number | null;
    }>(
      `SELECT f.* FROM user_feedback f WHERE ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    const items: FeedbackDTO[] = rows.map((row) => ({
      id: row.id,
      username: row.username,
      rating: row.rating,
      feedback: row.feedback,
      status: row.status as FeedbackDTO['status'],
      createdAt: row.created_at,
    }));
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });

  app.patch('/admin/feedback/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = parseId((req.params as { id: string }).id, '反馈 ID');
    const row = get<{ id: number; user_id: number | null; status: string }>(
      'SELECT id, user_id, status FROM user_feedback WHERE id = ?',
      id,
    );
    if (!row) throw ApiError.notFound('反馈不存在');
    const body = parse(z.object({ status: z.enum(['open', 'resolved', 'ignored']) }), req.body);
    run('UPDATE user_feedback SET status = ? WHERE id = ?', body.status, id);
    if (body.status !== 'open') {
      const email = emailOf(row.user_id);
      if (email) {
        const mail = feedbackResultMail(body.status === 'resolved');
        void sendMail(email, mail.subject, mail.html);
      }
    }
    void admin;
    return { message: body.status === 'resolved' ? '反馈已标记为解决' : '反馈已标记为忽略' };
  });

  // ------------------------------------------------------------- submissions
  app.get('/admin/submissions', async (req) => {
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 20 });
    const type = query.type === 'blog' ? 'blog' : 'tool';
    const status = typeof query.status === 'string' && query.status ? query.status : 'pending';
    const table = type === 'blog' ? 'blog_submissions' : 'user_submissions';
    const total = count(`SELECT COUNT(*) FROM ${table} WHERE status = ?`, status);
    const items =
      type === 'blog'
        ? all<{
            id: number;
            title: string;
            username: string;
            created_at: string;
            status: string;
          }>(
            `SELECT s.id, s.title, u.username, s.created_at, s.status
               FROM blog_submissions s JOIN users u ON u.id = s.author_id
              WHERE s.status = ? ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
            status,
            pageSize,
            offset,
          )
        : all<{
            id: number;
            tool_name: string;
            username: string;
            created_at: string;
            status: string;
            ip_address: string;
          }>(
            `SELECT id, tool_name, username, created_at, status, ip_address
               FROM user_submissions WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            status,
            pageSize,
            offset,
          );
    return {
      type,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

  app.get('/admin/submissions/tool/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id, '投稿 ID');
    const row = get<{
      id: number;
      tool_name: string;
      description: string;
      tool_link: string;
      status: string;
      ip_address: string;
      created_at: string;
      username: string;
      user_id: number | null;
    }>(
      `SELECT s.*, u.username FROM user_submissions s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
      id,
    );
    if (!row) throw ApiError.notFound('投稿不存在');
    const item: SubmissionDTO = {
      id: row.id,
      username: row.username ?? '未知用户',
      toolName: row.tool_name,
      description: row.description,
      toolLink: row.tool_link,
      status: row.status as SubmissionDTO['status'],
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    };
    return { submission: item };
  });

  app.post('/admin/submissions/tool/:id/review', async (req) => {
    const admin = requireAdmin(req);
    const id = parseId((req.params as { id: string }).id, '投稿 ID');
    const body = parse(
      z.object({
        action: z.enum(['approve', 'reject']),
        categoryId: z.number().int().positive().nullable().optional(),
        reason: z.string().max(500).optional().default(''),
      }),
      req.body,
    );
    const row = get<{
      id: number;
      tool_name: string;
      description: string;
      tool_link: string;
      user_id: number | null;
      status: string;
    }>('SELECT id, tool_name, description, tool_link, user_id, status FROM user_submissions WHERE id = ?', id);
    if (!row) throw ApiError.notFound('投稿不存在');
    if (row.status !== 'pending') throw ApiError.badRequest('该投稿已处理');

    run(
      `UPDATE user_submissions SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`,
      body.action === 'approve' ? 'approved' : 'rejected',
      nowIso(),
      admin.id,
      id,
    );

    if (body.action === 'approve') {
      run(
        `INSERT INTO tools (slug, name, description, link, category_id, icon, is_external, disabled, sort_order, created_at)
         VALUES (NULL, ?, ?, ?, ?, 'ExternalLink', 1, 0, 9999, ?)`,
        row.tool_name,
        row.description,
        row.tool_link,
        body.categoryId ?? null,
        nowIso(),
      );
    }

    const email = emailOf(row.user_id);
    if (email) {
      const mail = submissionResultMail(
        row.tool_name,
        body.action === 'approve',
        body.reason || (body.action === 'approve' ? '工具已收录到工具库。' : ''),
      );
      void sendMail(email, mail.subject, mail.html);
    }
    return { message: body.action === 'approve' ? '投稿已通过并上架工具库' : '投稿已驳回并通知用户' };
  });

  app.get('/admin/submissions/blog/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id, '投稿 ID');
    const row = get<{
      id: number;
      title: string;
      content: string;
      status: string;
      created_at: string;
      username: string;
      author_id: number;
    }>(
      `SELECT s.*, u.username FROM blog_submissions s JOIN users u ON u.id = s.author_id WHERE s.id = ?`,
      id,
    );
    if (!row) throw ApiError.notFound('投稿不存在');
    return {
      submission: {
        id: row.id,
        title: row.title,
        content: row.content,
        username: row.username,
        authorId: row.author_id,
        status: row.status,
        createdAt: row.created_at,
      },
    };
  });

  app.post('/admin/submissions/blog/:id/review', async (req) => {
    const admin = requireAdmin(req);
    const id = parseId((req.params as { id: string }).id, '投稿 ID');
    const body = parse(
      z.object({
        action: z.enum(['approve', 'reject']),
        categoryId: z.number().int().positive().nullable().optional(),
        title: titleSchema.optional(),
        content: z.string().max(200_000).optional(),
        reason: z.string().max(500).optional().default(''),
      }),
      req.body,
    );
    const row = get<{
      id: number;
      title: string;
      content: string;
      author_id: number;
      status: string;
      created_at: string;
    }>('SELECT * FROM blog_submissions WHERE id = ?', id);
    if (!row) throw ApiError.notFound('投稿不存在');
    if (row.status !== 'pending') throw ApiError.badRequest('该投稿已处理');

    const title = body.title?.trim() || row.title;
    const content = body.content?.trim() || row.content;

    run(
      'UPDATE blog_submissions SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?',
      body.action === 'approve' ? 'approved' : 'rejected',
      nowIso(),
      admin.id,
      id,
    );

    if (body.action === 'approve') {
      run(
        `INSERT INTO blogs (title, content, summary, author_id, category_id, is_public, views, created_at, latest_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        title,
        content,
        stripMarkdown(content, 160),
        row.author_id,
        body.categoryId ?? null,
        row.created_at,
        nowIso(),
      );
    }

    const email = emailOf(row.author_id);
    if (email) {
      const mail = submissionResultMail(
        title,
        body.action === 'approve',
        body.reason || (body.action === 'approve' ? '文章已发布到博客。' : ''),
      );
      void sendMail(email, mail.subject, mail.html);
    }
    return { message: body.action === 'approve' ? '博客投稿已批准并发布' : '博客投稿已拒绝' };
  });

  // ------------------------------------------------------------------- blogs
  app.get('/admin/blogs', async (req) => {
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 20 });
    const total = count('SELECT COUNT(*) FROM blogs');
    const rows = all<{
      id: number;
      title: string;
      is_public: number;
      views: number;
      created_at: string;
      latest_at: string;
      username: string;
      author_id: number;
    }>(
      `SELECT b.id, b.title, b.is_public, b.views, b.created_at, b.latest_at, u.username, u.id AS author_id
         FROM blogs b JOIN users u ON u.id = b.author_id ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      pageSize,
      offset,
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        isPublic: Boolean(row.is_public),
        views: row.views,
        createdAt: row.created_at,
        updatedAt: row.latest_at,
        author: { id: row.author_id, username: row.username },
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

  // ------------------------------------------------------------------- bans
  app.get('/admin/bans', async (req) => {
    requireSuperAdmin(req);
    const rows = all<{ ip_address: string; reason: string; banned_until: string; created_at: string }>(
      'SELECT ip_address, reason, banned_until, created_at FROM banned_ips ORDER BY created_at DESC',
    );
    const items: BanRecordDTO[] = rows.map((row) => ({
      ipAddress: row.ip_address,
      reason: row.reason,
      bannedUntil: row.banned_until,
      createdAt: row.created_at,
    }));
    return { items };
  });

  app.get('/admin/ban-history', async (req) => {
    requireSuperAdmin(req);
    const { page, pageSize, offset } = pagination(req.query as Record<string, unknown>, { pageSize: 30 });
    const total = count('SELECT COUNT(*) FROM ban_history');
    const rows = all<{
      id: number;
      ip_address: string;
      reason: string;
      banned_until: string;
      banned_at: string;
      unban_time: string | null;
    }>(
      'SELECT * FROM ban_history ORDER BY COALESCE(unban_time, banned_at) DESC LIMIT ? OFFSET ?',
      pageSize,
      offset,
    );
    const items: BanHistoryDTO[] = rows.map((row) => ({
      id: row.id,
      ipAddress: row.ip_address,
      reason: row.reason,
      bannedUntil: row.banned_until,
      bannedAt: row.banned_at,
      unbanTime: row.unban_time,
    }));
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });

  app.post('/admin/bans', async (req, reply) => {
    const admin = requireSuperAdmin(req);
    const body = parse(
      z.object({
        ip: z.string().trim().min(3, '请输入 IP 地址').max(64),
        days: z.number().int().positive().max(3650).default(30),
        reason: z.string().max(500).optional().default(''),
      }),
      req.body,
    );
    rateLimit(`admin-ban:${admin.id}`, 60, 60_000);
    const until = banIp(body.ip, body.days, body.reason, admin.id);
    return reply.code(201).send({ message: 'IP 地址已封禁', bannedUntil: until });
  });

  app.delete('/admin/bans/:ip', async (req) => {
    const admin = requireSuperAdmin(req);
    const ip = decodeURIComponent((req.params as { ip: string }).ip);
    const ok = unbanIp(ip, admin.id);
    if (!ok) throw ApiError.notFound('未找到该 IP 的封禁记录');
    return { message: 'IP 地址已解封' };
  });

  app.get('/admin/access-logs', async (req) => {
    const { page, pageSize, offset } = pagination(req.query as Record<string, unknown>, { pageSize: 30 });
    const total = count('SELECT COUNT(*) FROM access_logs');
    const now = nowIso();
    const rows = all<{ ip_address: string; access_time: string; access_count: number; banned_until: string | null }>(
      `SELECT a.ip_address, a.access_time, a.access_count, b.banned_until
         FROM access_logs a LEFT JOIN banned_ips b ON b.ip_address = a.ip_address
        ORDER BY a.access_time DESC LIMIT ? OFFSET ?`,
      pageSize,
      offset,
    );
    const items: AccessLogDTO[] = rows.map((row) => ({
      ipAddress: row.ip_address,
      accessTime: row.access_time,
      accessCount: Number(row.access_count),
      banned: Boolean(row.banned_until && row.banned_until > now),
    }));
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });

  // -------------------------------------------------------- blog categories
  app.get('/admin/categories', async (req) => {
    requireSuperAdmin(req);
    const rows = all<{ id: number; name: string; n: number }>(
      `SELECT c.id, c.name, (SELECT COUNT(*) FROM blogs b WHERE b.category_id = c.id) AS n
         FROM categories c ORDER BY c.name`,
    );
    const items: CategoryDTO[] = rows.map((row) => ({ id: row.id, name: row.name, blogCount: Number(row.n) }));
    return { items };
  });

  app.post('/admin/categories', async (req, reply) => {
    requireSuperAdmin(req);
    const body = parse(z.object({ name: z.string().trim().min(1, '请输入分类名称').max(50) }), req.body);
    const existing = get<{ id: number }>('SELECT id FROM categories WHERE name = ?', body.name);
    if (existing) throw ApiError.conflict('分类名称已存在');
    const result = run('INSERT INTO categories (name, created_at) VALUES (?, ?)', body.name, nowIso());
    return reply.code(201).send({ message: '分类已添加', id: result.lastInsertRowid });
  });

  app.patch('/admin/categories/:id', async (req) => {
    requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '分类 ID');
    const body = parse(z.object({ name: z.string().trim().min(1).max(50) }), req.body);
    const category = get<{ id: number }>('SELECT id FROM categories WHERE id = ?', id);
    if (!category) throw ApiError.notFound('分类不存在');
    run('UPDATE categories SET name = ? WHERE id = ?', body.name, id);
    return { message: '分类已更新' };
  });

  app.delete('/admin/categories/:id', async (req) => {
    requireSuperAdmin(req);
    const id = parseId((req.params as { id: string }).id, '分类 ID');
    const category = get<{ id: number }>('SELECT id FROM categories WHERE id = ?', id);
    if (!category) throw ApiError.notFound('分类不存在');
    run('DELETE FROM categories WHERE id = ?', id);
    return { message: '分类已删除' };
  });

  // Keep validation helpers referenced for future endpoints.
  void parseDays;
  void passwordSchema;
}
