import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, get, nowIso, run } from '../db/client.js';
import { getClientIp, requireUser } from '../lib/auth.js';
import { rateLimit } from '../lib/security.js';
import { httpUrlSchema, parse } from '../lib/validation.js';
import type { SubmissionDTO } from '../../shared/types.js';

export async function engagementRoutes(app: FastifyInstance): Promise<void> {
  // ----------------------------------------------------------------- feedback
  app.post('/feedback', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`feedback:${user.id}`, 5, 24 * 60 * 60_000);
    const body = parse(
      z.object({
        rating: z.number().int().min(1, '评分需在 1-5 之间').max(5, '评分需在 1-5 之间'),
        feedback: z.string().trim().min(1, '请输入反馈内容').max(2000, '反馈内容最多 2000 字'),
      }),
      req.body,
    );
    const result = run(
      'INSERT INTO user_feedback (user_id, username, rating, feedback, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      user.id,
      user.username,
      body.rating,
      body.feedback,
      'open',
      nowIso(),
    );
    return reply.code(201).send({ message: '感谢您的反馈！', id: result.lastInsertRowid });
  });

  app.get('/feedback/mine', async (req) => {
    const user = requireUser(req);
    const rows = all<{
      id: number;
      rating: number;
      feedback: string;
      status: string;
      created_at: string;
    }>(
      'SELECT id, rating, feedback, status, created_at FROM user_feedback WHERE user_id = ? ORDER BY created_at DESC',
      user.id,
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        feedback: row.feedback,
        status: row.status,
        createdAt: row.created_at,
      })),
    };
  });

  // -------------------------------------------------------- tool submissions
  app.post('/submissions/tool', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`tool-submit:${user.id}`, 5, 24 * 60 * 60_000);
    const body = parse(
      z.object({
        toolName: z.string().trim().min(1, '请输入工具名称').max(120, '工具名称最多 120 字'),
        description: z.string().trim().min(1, '请输入工具描述').max(2000, '描述最多 2000 字'),
        toolLink: httpUrlSchema.min(1, '请输入工具链接'),
      }),
      req.body,
    );
    const result = run(
      `INSERT INTO user_submissions (user_id, username, tool_name, description, tool_link, status, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      user.id,
      user.username,
      body.toolName,
      body.description,
      body.toolLink,
      getClientIp(req),
      nowIso(),
    );
    return reply.code(201).send({ message: '投稿成功！等待管理员审核', id: result.lastInsertRowid });
  });

  app.get('/submissions/tool/mine', async (req) => {
    const user = requireUser(req);
    const rows = all<{
      id: number;
      tool_name: string;
      description: string;
      tool_link: string;
      status: string;
      created_at: string;
    }>(
      `SELECT id, tool_name, description, tool_link, status, created_at
         FROM user_submissions WHERE user_id = ? ORDER BY created_at DESC`,
      user.id,
    );
    const items: SubmissionDTO[] = rows.map((row) => ({
      id: row.id,
      username: user.username,
      toolName: row.tool_name,
      description: row.description,
      toolLink: row.tool_link,
      status: row.status as SubmissionDTO['status'],
      createdAt: row.created_at,
    }));
    return { items };
  });

  // ------------------------------------------------------------- my profile
  app.get('/profile/overview', async (req) => {
    const user = requireUser(req);
    const rows = all<{ kind: string; total: number }>('SELECT 1 AS kind, 0 AS total WHERE 1 = 0');
    void rows;
    const blogs = all<{ id: number; title: string; is_public: number; views: number; created_at: string }>(
      'SELECT id, title, is_public, views, created_at FROM blogs WHERE author_id = ? ORDER BY created_at DESC LIMIT 20',
      user.id,
    );
    const counts = {
      blogs: Number(
        (get<{ n: number }>('SELECT COUNT(*) AS n FROM blogs WHERE author_id = ?', user.id) as { n: number }).n,
      ),
      threads: Number(
        (get<{ n: number }>('SELECT COUNT(*) AS n FROM threads WHERE author_id = ?', user.id) as { n: number }).n,
      ),
      posts: Number(
        (get<{ n: number }>('SELECT COUNT(*) AS n FROM posts WHERE author_id = ?', user.id) as { n: number }).n,
      ),
      comments: Number(
        (get<{ n: number }>('SELECT COUNT(*) AS n FROM blog_comments WHERE user_id = ?', user.id) as { n: number }).n,
      ),
      feedback: Number(
        (get<{ n: number }>('SELECT COUNT(*) AS n FROM user_feedback WHERE user_id = ?', user.id) as { n: number }).n,
      ),
      submissions: Number(
        (get<{ n: number }>('SELECT COUNT(*) AS n FROM user_submissions WHERE user_id = ?', user.id) as { n: number })
          .n,
      ),
    };
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        bannedUntil: user.bannedUntil,
        lastIp: user.lastIp,
      },
      counts,
      blogs: blogs.map((blog) => ({
        id: blog.id,
        title: blog.title,
        isPublic: Boolean(blog.is_public),
        views: blog.views,
        createdAt: blog.created_at,
      })),
    };
  });

  app.get('/users/:id/public', async (req) => {
    const { id } = req.params as { id: string };
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return { error: '用户不存在' };
    }
    const row = get<{ id: number; username: string; role: number; created_at: string }>(
      'SELECT id, username, role, created_at FROM users WHERE id = ?',
      userId,
    );
    if (!row) return { error: '用户不存在' };
    return {
      user: { id: row.id, username: row.username, role: row.role, createdAt: row.created_at },
      stats: {
        blogs: Number((get<{ n: number }>('SELECT COUNT(*) AS n FROM blogs WHERE author_id = ?', userId) as { n: number }).n),
        threads: Number((get<{ n: number }>('SELECT COUNT(*) AS n FROM threads WHERE author_id = ?', userId) as { n: number }).n),
        posts: Number((get<{ n: number }>('SELECT COUNT(*) AS n FROM posts WHERE author_id = ?', userId) as { n: number }).n),
      },
    };
  });
}
