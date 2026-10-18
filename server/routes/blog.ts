import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SqlValue } from '../db/client.js';
import { all, count, get, nowIso, run } from '../db/client.js';
import { currentUser, getClientIp, requireUser, type SessionUser } from '../lib/auth.js';
import { ApiError, rateLimit } from '../lib/security.js';
import {
  contentSchema,
  pagination,
  parse,
  parseId,
  stripMarkdown,
  titleSchema,
} from '../lib/validation.js';
import type {
  AuthorDTO,
  BlogCommentDTO,
  BlogDetail,
  BlogListItem,
  CategoryDTO,
  Paginated,
} from '../../shared/types.js';

interface BlogRow {
  id: number;
  title: string;
  content: string;
  summary_raw: string;
  created_at: string;
  latest_at: string;
  views: number;
  is_public: number;
  author_id: number;
  username: string;
  author_role: number;
  category_id: number | null;
  category_name: string | null;
  likes: number;
  comments: number;
}

function visibility(user: SessionUser | null): { sql: string; params: SqlValue[] } {
  if (user?.role === 2) return { sql: '1 = 1', params: [] };
  if (user) return { sql: '(b.is_public = 1 OR b.author_id = ?)', params: [user.id] };
  return { sql: 'b.is_public = 1', params: [] };
}

function author(row: { author_id: number; username: string; author_role?: number }): AuthorDTO {
  return { id: row.author_id, username: row.username, role: (row.author_role ?? 0) as AuthorDTO['role'] };
}

function summaryOf(row: BlogRow): string {
  const raw = row.summary_raw?.trim() ?? '';
  if (raw) return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  return stripMarkdown(row.content ?? '', 160);
}

function toListItem(row: BlogRow, user: SessionUser | null): BlogListItem {
  return {
    id: row.id,
    title: row.title,
    summary: summaryOf(row),
    author: author(row),
    category: row.category_id ? { id: row.category_id, name: row.category_name ?? '未分类' } : null,
    isPublic: Boolean(row.is_public),
    views: row.views,
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    createdAt: row.created_at,
    updatedAt: row.latest_at,
    canEdit: Boolean(user && (user.role === 2 || user.id === row.author_id)),
  };
}

const blogSelect = `
  SELECT b.id, b.title, b.content, b.created_at, b.latest_at, b.views, b.is_public, b.author_id,
         u.username, u.role AS author_role,
         c.id AS category_id, c.name AS category_name,
         (SELECT COUNT(*) FROM blog_likes l WHERE l.blog_id = b.id) AS likes,
         (SELECT COUNT(*) FROM blog_comments cm WHERE cm.blog_id = b.id) AS comments,
         CASE WHEN b.summary <> '' THEN b.summary ELSE substr(b.content, 1, 300) END AS summary_raw
    FROM blogs b
    JOIN users u ON u.id = b.author_id
    LEFT JOIN categories c ON c.id = b.category_id`;

function getBlogRow(id: number): BlogRow | undefined {
  return get<BlogRow>(`${blogSelect} WHERE b.id = ?`, id);
}

function canView(row: BlogRow, user: SessionUser | null): boolean {
  if (user?.role === 2) return true;
  if (row.is_public) return true;
  return Boolean(user && user.id === row.author_id);
}

export function assertCanView(row: BlogRow, user: SessionUser | null): void {
  if (!canView(row, user)) throw ApiError.notFound('博客不存在或未公开');
}

export async function blogRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------- list
  app.get('/blog/posts', async (req) => {
    const user = currentUser(req);
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 9 });
    const vis = visibility(user);
    const filters: string[] = [vis.sql];
    const params: SqlValue[] = [...vis.params];

    const categoryId = Number(query.categoryId ?? 0);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      filters.push('b.category_id = ?');
      params.push(categoryId);
    }
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    if (q) {
      filters.push('(b.title LIKE ? OR b.content LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (query.authorId) {
      filters.push('b.author_id = ?');
      params.push(parseId(query.authorId, '作者 ID'));
    }
    if (query.mine === '1' && user) {
      filters.push('b.author_id = ?');
      params.push(user.id);
    }

    const where = filters.join(' AND ');
    const total = count(`SELECT COUNT(*) FROM blogs b WHERE ${where}`, ...params);
    const order = query.sort === 'views' ? 'b.views DESC' : 'b.latest_at DESC, b.id DESC';
    const rows = all<BlogRow>(
      `${blogSelect} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );

    const result: Paginated<BlogListItem> = {
      items: rows.map((row) => toListItem(row, user)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });

  app.get('/blog/recent', async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 3) || 3, 10);
    const rows = all<BlogRow>(
      `${blogSelect} WHERE b.is_public = 1 ORDER BY b.latest_at DESC LIMIT ?`,
      limit,
    );
    return { items: rows.map((row) => toListItem(row, null)) };
  });

  app.get('/blog/categories', async () => {
    const rows = all<{ id: number; name: string; n: number }>(
      `SELECT c.id, c.name, (SELECT COUNT(*) FROM blogs b WHERE b.category_id = c.id AND b.is_public = 1) AS n
         FROM categories c ORDER BY c.name`,
    );
    return { items: rows.map((row) => ({ id: row.id, name: row.name, blogCount: Number(row.n) }) as CategoryDTO) };
  });

  // ------------------------------------------------------------------ detail
  app.get('/blog/posts/:id', async (req) => {
    const user = currentUser(req);
    const id = parseId((req.params as { id: string }).id, '博客 ID');
    const row = getBlogRow(id);
    if (!row) throw ApiError.notFound('博客不存在');
    assertCanView(row, user);

    run('UPDATE blogs SET views = views + 1 WHERE id = ?', id);
    row.views += 1;

    const liked = user
      ? Boolean(get('SELECT id FROM blog_likes WHERE blog_id = ? AND user_id = ?', id, user.id))
      : false;

    const commentTotal = count('SELECT COUNT(*) FROM blog_comments WHERE blog_id = ?', id);
    const comments = all<{
      id: number;
      comment: string;
      created_at: string;
      user_id: number;
      username: string;
      user_role: number;
    }>(
      `SELECT bc.id, bc.comment, bc.created_at, bc.user_id, u.username, u.role AS user_role
         FROM blog_comments bc JOIN users u ON u.id = bc.user_id
        WHERE bc.blog_id = ? ORDER BY bc.created_at DESC, bc.id DESC LIMIT 5 OFFSET 0`,
      id,
    );
    const commentsList: Paginated<BlogCommentDTO> = {
      items: comments.map((comment) => ({
        id: comment.id,
        content: comment.comment,
        author: { id: comment.user_id, username: comment.username, role: comment.user_role as AuthorDTO['role'] },
        createdAt: comment.created_at,
        canDelete: Boolean(
          user && (user.id === comment.user_id || user.id === row.author_id || user.role >= 1),
        ),
      })),
      total: commentTotal,
      page: 1,
      pageSize: 5,
      totalPages: Math.max(1, Math.ceil(commentTotal / 5)),
    };

    const detail: BlogDetail = {
      ...toListItem(row, user),
      content: row.content,
      likedByMe: liked,
      commentsList,
      canDelete: Boolean(user && (user.id === row.author_id || user.role === 2)),
    };
    return detail;
  });

  // ------------------------------------------------------------------ create
  app.post('/blog/posts', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`blog:create:${user.id}`, 10, 60 * 60_000);
    const body = parse(
      z.object({
        title: titleSchema,
        content: contentSchema,
        categoryId: z.number().int().positive().nullable().optional(),
        isPublic: z.boolean().optional().default(true),
      }),
      req.body,
    );
    if (body.categoryId) {
      const category = get<{ id: number }>('SELECT id FROM categories WHERE id = ?', body.categoryId);
      if (!category) throw ApiError.badRequest('分类不存在');
    }
    const now = nowIso();
    const result = run(
      `INSERT INTO blogs (title, content, summary, author_id, category_id, is_public, views, created_at, latest_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      body.title,
      body.content,
      stripMarkdown(body.content, 160),
      user.id,
      body.categoryId ?? null,
      body.isPublic ? 1 : 0,
      now,
      now,
    );
    const row = getBlogRow(result.lastInsertRowid);
    if (!row) throw new ApiError(500, '创建博客失败');
    return reply.code(201).send({ post: toListItem(row, user) });
  });

  // -------------------------------------------------------------------- edit
  app.patch('/blog/posts/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '博客 ID');
    const row = get<{ author_id: number }>('SELECT author_id FROM blogs WHERE id = ?', id);
    if (!row) throw ApiError.notFound('博客不存在');
    if (user.role !== 2 && row.author_id !== user.id) {
      throw ApiError.forbidden('您没有权限编辑此博客文章');
    }
    const body = parse(
      z.object({
        title: titleSchema,
        content: contentSchema,
        categoryId: z.number().int().positive().nullable().optional(),
        isPublic: z.boolean().optional(),
      }),
      req.body,
    );
    const updated = getBlogRow(id);
    if (!updated) throw ApiError.notFound('博客不存在');
    if (body.categoryId) {
      const category = get<{ id: number }>('SELECT id FROM categories WHERE id = ?', body.categoryId);
      if (!category) throw ApiError.badRequest('分类不存在');
    }
    run(
      `UPDATE blogs SET title = ?, content = ?, summary = ?, category_id = ?, is_public = ?, latest_at = ?
        WHERE id = ?`,
      body.title,
      body.content,
      stripMarkdown(body.content, 160),
      body.categoryId === undefined ? (updated.category_id ?? null) : body.categoryId,
      body.isPublic === undefined ? updated.is_public : body.isPublic ? 1 : 0,
      nowIso(),
      id,
    );
    return reply.send({ post: toListItem(getBlogRow(id)!, user) });
  });

  app.delete('/blog/posts/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '博客 ID');
    const row = get<{ author_id: number }>('SELECT author_id FROM blogs WHERE id = ?', id);
    if (!row) throw ApiError.notFound('博客不存在');
    if (user.role < 1 && row.author_id !== user.id) {
      throw ApiError.forbidden('您没有权限删除此博客文章');
    }
    run('DELETE FROM blogs WHERE id = ?', id);
    return reply.send({ message: '博客文章已删除' });
  });

  // -------------------------------------------------------------------- like
  app.post('/blog/posts/:id/like', async (req, reply) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '博客 ID');
    rateLimit(`blog:like:${user.id}`, 120, 60 * 60_000);
    const row = getBlogRow(id);
    if (!row) throw ApiError.notFound('博客不存在');
    assertCanView(row, user);

    const existing = get<{ id: number }>('SELECT id FROM blog_likes WHERE blog_id = ? AND user_id = ?', id, user.id);
    if (existing) {
      run('DELETE FROM blog_likes WHERE id = ?', existing.id);
    } else {
      run('INSERT INTO blog_likes (blog_id, user_id, created_at) VALUES (?, ?, ?)', id, user.id, nowIso());
    }
    const likes = count('SELECT COUNT(*) FROM blog_likes WHERE blog_id = ?', id);
    return reply.send({ liked: !existing, likes });
  });

  // ---------------------------------------------------------------- comments
  app.get('/blog/posts/:id/comments', async (req) => {
    const user = currentUser(req);
    const id = parseId((req.params as { id: string }).id, '博客 ID');
    const row = get<{ author_id: number; is_public: number }>(
      'SELECT author_id, is_public FROM blogs WHERE id = ?',
      id,
    );
    if (!row) throw ApiError.notFound('博客不存在');
    if (!canView({ ...row, is_public: row.is_public } as BlogRow, user)) {
      throw ApiError.notFound('博客不存在或未公开');
    }
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = pagination(query, { pageSize: 5, maxPageSize: 50 });
    const total = count('SELECT COUNT(*) FROM blog_comments WHERE blog_id = ?', id);
    const comments = all<{
      id: number;
      comment: string;
      created_at: string;
      user_id: number;
      username: string;
      user_role: number;
    }>(
      `SELECT bc.id, bc.comment, bc.created_at, bc.user_id, u.username, u.role AS user_role
         FROM blog_comments bc JOIN users u ON u.id = bc.user_id
        WHERE bc.blog_id = ? ORDER BY bc.created_at DESC, bc.id DESC LIMIT ? OFFSET ?`,
      id,
      pageSize,
      offset,
    );
    const result: Paginated<BlogCommentDTO> = {
      items: comments.map((comment) => ({
        id: comment.id,
        content: comment.comment,
        author: { id: comment.user_id, username: comment.username, role: comment.user_role as AuthorDTO['role'] },
        createdAt: comment.created_at,
        canDelete: Boolean(
          user && (user.id === comment.user_id || user.id === row.author_id || user.role >= 1),
        ),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });

  app.post('/blog/posts/:id/comments', async (req, reply) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '博客 ID');
    rateLimit(`blog:comment:${user.id}`, 30, 60 * 60_000);
    const row = get<{ author_id: number; is_public: number }>(
      'SELECT author_id, is_public FROM blogs WHERE id = ?',
      id,
    );
    if (!row) throw ApiError.notFound('博客不存在');
    if (!canView(row as unknown as BlogRow, user)) throw ApiError.notFound('博客不存在或未公开');
    const body = parse(
      z.object({ comment: z.string().trim().min(1, '请输入评论内容').max(2000, '评论最多 2000 字') }),
      req.body,
    );
    const result = run(
      'INSERT INTO blog_comments (blog_id, user_id, comment, created_at) VALUES (?, ?, ?, ?)',
      id,
      user.id,
      body.comment,
      nowIso(),
    );
    return reply.code(201).send({
      comment: {
        id: result.lastInsertRowid,
        content: body.comment,
        author: { id: user.id, username: user.username, role: user.role },
        createdAt: nowIso(),
        canDelete: true,
      } satisfies BlogCommentDTO,
    });
  });

  app.delete('/blog/comments/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '评论 ID');
    const row = get<{ user_id: number; blog_id: number }>(
      'SELECT user_id, blog_id FROM blog_comments WHERE id = ?',
      id,
    );
    if (!row) throw ApiError.notFound('评论不存在');
    const blog = get<{ author_id: number }>('SELECT author_id FROM blogs WHERE id = ?', row.blog_id);
    if (user.id !== row.user_id && user.role < 1 && blog?.author_id !== user.id) {
      throw ApiError.forbidden('您没有权限删除此评论');
    }
    run('DELETE FROM blog_comments WHERE id = ?', id);
    return reply.send({ message: '评论已删除' });
  });

  // --------------------------------------------------- submissions (reviewed)
  app.post('/blog/submissions', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`blog:submit:${user.id}`, 10, 60 * 60_000);
    const body = parse(z.object({ title: titleSchema, content: contentSchema }), req.body);
    const result = run(
      'INSERT INTO blog_submissions (title, content, author_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      body.title,
      body.content,
      user.id,
      'pending',
      nowIso(),
    );
    return reply.code(201).send({
      message: '博客已提交，等待审核',
      id: result.lastInsertRowid,
    });
  });

  app.get('/blog/submissions/mine', async (req) => {
    const user = requireUser(req);
    const rows = all<{ id: number; title: string; status: string; created_at: string }>(
      'SELECT id, title, status, created_at FROM blog_submissions WHERE author_id = ? ORDER BY created_at DESC',
      user.id,
    );
    return {
      items: rows.map((row) => ({ id: row.id, title: row.title, status: row.status, createdAt: row.created_at })),
    };
  });

  app.get('/blog/submissions/:id', async (req) => {
    const user = requireUser(req);
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
    if (row.author_id !== user.id && user.role < 1) throw ApiError.forbidden();
    return {
      submission: {
        id: row.id,
        title: row.title,
        content: row.content,
        status: row.status,
        username: row.username,
        createdAt: row.created_at,
      },
    };
  });

  app.patch('/blog/submissions/:id', async (req) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '投稿 ID');
    const row = get<{ author_id: number; status: string }>(
      'SELECT author_id, status FROM blog_submissions WHERE id = ?',
      id,
    );
    if (!row) throw ApiError.notFound('投稿不存在');
    if (row.author_id !== user.id) throw ApiError.forbidden();
    if (row.status !== 'pending') throw ApiError.badRequest('该投稿已审核，无法修改');
    const body = parse(z.object({ title: titleSchema, content: contentSchema }), req.body);
    run('UPDATE blog_submissions SET title = ?, content = ? WHERE id = ?', body.title, body.content, id);
    return { message: '投稿已更新' };
  });

  app.delete('/blog/submissions/:id', async (req) => {
    const user = requireUser(req);
    const id = parseId((req.params as { id: string }).id, '投稿 ID');
    const row = get<{ author_id: number }>('SELECT author_id FROM blog_submissions WHERE id = ?', id);
    if (!row) throw ApiError.notFound('投稿不存在');
    if (row.author_id !== user.id && user.role < 1) throw ApiError.forbidden();
    run('DELETE FROM blog_submissions WHERE id = ?', id);
    return { message: '投稿已删除' };
  });

  // Keep a reference so the helper is not tree-shaken away in future builds.
  void getClientIp;
}
