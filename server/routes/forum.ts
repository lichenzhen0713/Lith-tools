import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, count, get, nowIso, run } from '../db/client.js';
import { currentUser, requireUser, type SessionUser } from '../lib/auth.js';
import { ApiError, rateLimit } from '../lib/security.js';
import { contentSchema, pagination, parse, parseId, titleSchema } from '../lib/validation.js';
import type {
  AuthorDTO,
  ForumDTO,
  ForumThreadPostDTO,
  Paginated,
  ThreadDetail,
  ThreadListItem,
} from '../../shared/types.js';

async function requireModerator(req: Parameters<typeof requireUser>[0]): Promise<SessionUser> {
  const user = requireUser(req);
  if (user.role !== 2) throw ApiError.forbidden('需要超级管理员权限');
  return user;
}

function toForum(row: {
  id: number;
  name: string;
  description: string;
  created_at: string;
  threads: number;
  posts: number;
  last_activity: string | null;
}): ForumDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    threadCount: Number(row.threads ?? 0),
    postCount: Number(row.posts ?? 0),
    lastActivityAt: row.last_activity,
  };
}

const forumSelect = `
  SELECT f.id, f.name, f.description, f.created_at,
         (SELECT COUNT(*) FROM threads t WHERE t.forum_id = f.id) AS threads,
         (SELECT COUNT(*) FROM posts p JOIN threads t ON t.id = p.thread_id WHERE t.forum_id = f.id) AS posts,
         (SELECT MAX(p.created_at) FROM posts p JOIN threads t ON t.id = p.thread_id WHERE t.forum_id = f.id) AS last_activity
    FROM forums f`;

interface ThreadRow {
  id: number;
  forum_id: number;
  forum_name: string;
  title: string;
  author_id: number;
  username: string;
  author_role: number;
  created_at: string;
  updated_at: string;
  replies: number;
  last_reply_at: string | null;
}

function toThread(row: ThreadRow): ThreadListItem {
  return {
    id: row.id,
    forumId: row.forum_id,
    forumName: row.forum_name,
    title: row.title,
    author: { id: row.author_id, username: row.username, role: row.author_role as AuthorDTO['role'] },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replyCount: Number(row.replies ?? 0),
    lastReplyAt: row.last_reply_at,
  };
}

const threadSelect = `
  SELECT t.id, t.forum_id, f.name AS forum_name, t.title, t.author_id, u.username, u.role AS author_role,
         t.created_at, t.updated_at,
         (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS replies,
         (SELECT MAX(p.created_at) FROM posts p WHERE p.thread_id = t.id) AS last_reply_at
    FROM threads t
    JOIN users u ON u.id = t.author_id
    JOIN forums f ON f.id = t.forum_id`;

function getForum(id: number): ForumDTO {
  const row = get<Parameters<typeof toForum>[0]>(`${forumSelect} WHERE f.id = ?`, id);
  if (!row) throw ApiError.notFound('论坛板块不存在');
  return toForum(row);
}

function canModerate(user: SessionUser | null): boolean {
  return Boolean(user && user.role >= 1);
}

export async function forumRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------ forums
  app.get('/forum/forums', async () => {
    const rows = all<Parameters<typeof toForum>[0]>(`${forumSelect} ORDER BY f.id`);
    return { items: rows.map(toForum) };
  });

  app.get('/forum/recent', async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 5) || 5, 20);
    const rows = all<ThreadRow>(`${threadSelect} ORDER BY t.updated_at DESC LIMIT ?`, limit);
    return { items: rows.map(toThread) };
  });

  app.post('/forum/forums', async (req, reply) => {
    await requireModerator(req);
    const body = parse(
      z.object({
        name: z.string().trim().min(1, '请输入板块名称').max(80, '板块名称最多 80 字'),
        description: z.string().trim().max(500, '板块描述最多 500 字').optional().default(''),
      }),
      req.body,
    );
    const existing = get<{ id: number }>('SELECT id FROM forums WHERE name = ?', body.name);
    if (existing) throw ApiError.conflict('板块名称已存在');
    const result = run(
      'INSERT INTO forums (name, description, created_at) VALUES (?, ?, ?)',
      body.name,
      body.description,
      nowIso(),
    );
    return reply.code(201).send({ forum: getForum(result.lastInsertRowid) });
  });

  app.patch('/forum/forums/:id', async (req) => {
    await requireModerator(req);
    const id = parseId((req.params as { id: string }).id, '板块 ID');
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500).optional().default(''),
      }),
      req.body,
    );
    const forum = get<{ id: number }>('SELECT id FROM forums WHERE id = ?', id);
    if (!forum) throw ApiError.notFound('论坛板块不存在');
    run('UPDATE forums SET name = ?, description = ? WHERE id = ?', body.name, body.description, id);
    return { forum: getForum(id) };
  });

  app.delete('/forum/forums/:id', async (req) => {
    await requireModerator(req);
    const id = parseId((req.params as { id: string }).id, '板块 ID');
    const forum = get<{ id: number }>('SELECT id FROM forums WHERE id = ?', id);
    if (!forum) throw ApiError.notFound('论坛板块不存在');
    run('DELETE FROM forums WHERE id = ?', id);
    return { message: '板块已删除' };
  });

  // ------------------------------------------------------------------ threads
  app.get('/forum/forums/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id, '板块 ID');
    const forum = getForum(id);
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 15 });
    const total = count('SELECT COUNT(*) FROM threads WHERE forum_id = ?', id);
    const rows = all<ThreadRow>(
      `${threadSelect} WHERE t.forum_id = ? ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
      id,
      pageSize,
      offset,
    );
    const threads: Paginated<ThreadListItem> = {
      items: rows.map(toThread),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
    return { forum, threads };
  });

  app.post('/forum/forums/:id/threads', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`forum:thread:${user.id}`, 10, 60 * 60_000);
    const id = parseId((req.params as { id: string }).id, '板块 ID');
    const forum = get<{ id: number }>('SELECT id FROM forums WHERE id = ?', id);
    if (!forum) throw ApiError.notFound('论坛板块不存在');
    const body = parse(
      z.object({ title: titleSchema, content: contentSchema.max(20_000, '内容最多 20000 字') }),
      req.body,
    );
    const now = nowIso();
    const result = run(
      'INSERT INTO threads (forum_id, title, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      id,
      body.title,
      user.id,
      now,
      now,
    );
    run(
      'INSERT INTO posts (thread_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
      result.lastInsertRowid,
      user.id,
      body.content,
      now,
    );
    return reply.code(201).send({ threadId: result.lastInsertRowid });
  });

  app.get('/forum/threads/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id, '主题 ID');
    const row = get<ThreadRow>(`${threadSelect} WHERE t.id = ?`, id);
    if (!row) throw ApiError.notFound('主题不存在');
    const user = currentUser(req);
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 20, maxPageSize: 100 });
    const total = count('SELECT COUNT(*) FROM posts WHERE thread_id = ?', id);
    const posts = all<{
      id: number;
      content: string;
      created_at: string;
      author_id: number;
      username: string;
      author_role: number;
    }>(
      `SELECT p.id, p.content, p.created_at, p.author_id, u.username, u.role AS author_role
         FROM posts p JOIN users u ON u.id = p.author_id
        WHERE p.thread_id = ? ORDER BY p.created_at ASC, p.id ASC LIMIT ? OFFSET ?`,
      id,
      pageSize,
      offset,
    );
    const postList: Paginated<ForumThreadPostDTO> = {
      items: posts.map((post) => ({
        id: post.id,
        content: post.content,
        createdAt: post.created_at,
        author: { id: post.author_id, username: post.username, role: post.author_role as AuthorDTO['role'] },
        canDelete: canModerate(user) || Boolean(user && user.id === post.author_id),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
    const detail: ThreadDetail = {
      thread: toThread(row),
      forum: getForum(row.forum_id),
      posts: postList,
    };
    return detail;
  });

  app.post('/forum/threads/:id/posts', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`forum:reply:${user.id}`, 30, 60 * 60_000);
    const id = parseId((req.params as { id: string }).id, '主题 ID');
    const thread = get<{ id: number }>('SELECT id FROM threads WHERE id = ?', id);
    if (!thread) throw ApiError.notFound('主题不存在');
    const body = parse(z.object({ content: contentSchema.max(20_000, '内容最多 20000 字') }), req.body);
    const now = nowIso();
    const result = run(
      'INSERT INTO posts (thread_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
      id,
      user.id,
      body.content,
      now,
    );
    run('UPDATE threads SET updated_at = ? WHERE id = ?', now, id);
    return reply.code(201).send({ postId: result.lastInsertRowid });
  });

  app.patch('/forum/posts/:id', async (req) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '帖子 ID');
    const row = get<{ author_id: number; thread_id: number }>(
      'SELECT author_id, thread_id FROM posts WHERE id = ?',
      id,
    );
    if (!row) throw ApiError.notFound('帖子不存在');
    if (row.author_id !== user.id && user.role < 1) throw ApiError.forbidden();
    const body = parse(z.object({ content: contentSchema.max(20_000, '内容最多 20000 字') }), req.body);
    run('UPDATE posts SET content = ? WHERE id = ?', body.content, id);
    return { message: '回复已更新' };
  });

  app.delete('/forum/posts/:id', async (req) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '帖子 ID');
    const row = get<{ author_id: number }>('SELECT author_id FROM posts WHERE id = ?', id);
    if (!row) throw ApiError.notFound('帖子不存在');
    if (row.author_id !== user.id && user.role < 1) throw ApiError.forbidden();
    run('DELETE FROM posts WHERE id = ?', id);
    return { message: '回复已删除' };
  });

  app.delete('/forum/threads/:id', async (req) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '主题 ID');
    const row = get<{ author_id: number; forum_id: number }>(
      'SELECT author_id, forum_id FROM threads WHERE id = ?',
      id,
    );
    if (!row) throw ApiError.notFound('主题不存在');
    if (row.author_id !== user.id && user.role !== 2) throw ApiError.forbidden();
    run('DELETE FROM threads WHERE id = ?', id);
    return { message: '主题已删除' };
  });
}
