import type { FastifyInstance } from 'fastify';
import { currentUser } from '../lib/auth.js';
import { all, count, get } from '../db/client.js';
import type { PublicStats, ToolCategoryDTO, ToolDTO } from '../../shared/types.js';

interface ToolRow {
  id: number;
  slug: string | null;
  name: string;
  description: string;
  link: string;
  icon: string;
  is_external: number;
  disabled: number;
  category_id: number | null;
}

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  icon: string;
  description: string;
}

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------- catalogue
  app.get('/tools', async (req) => {
    const user = currentUser(req);
    const isAdmin = Boolean(user && user.role >= 2);
    const categories = all<CategoryRow>('SELECT * FROM tool_categories ORDER BY sort_order, id');
    const tools = all<ToolRow>(
      `SELECT * FROM tools ${isAdmin ? '' : 'WHERE disabled = 0'} ORDER BY sort_order, id`,
    );
    const counts = new Map<number, number>();
    for (const tool of tools) {
      if (tool.category_id) counts.set(tool.category_id, (counts.get(tool.category_id) ?? 0) + 1);
    }
    const categoryDTOs: ToolCategoryDTO[] = categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      description: category.description,
      toolCount: counts.get(category.id) ?? 0,
    }));
    const categoryById = new Map(categoryDTOs.map((category) => [category.id, category]));
    const toolDTOs: ToolDTO[] = tools.map((tool) => ({
      id: tool.id,
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      href: tool.link || (tool.slug ? `/tools/${tool.slug}` : '#'),
      icon: tool.icon,
      isExternal: Boolean(tool.is_external),
      disabled: Boolean(tool.disabled),
      category: tool.category_id ? categoryById.get(tool.category_id) ?? null : null,
    }));
    return { categories: categoryDTOs, tools: toolDTOs };
  });

  app.get('/tools/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const row = get<ToolRow & { category_slug: string | null; category_name: string | null; category_icon: string | null }>(
      `SELECT t.*, c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon
         FROM tools t LEFT JOIN tool_categories c ON c.id = t.category_id
        WHERE t.slug = ?`,
      slug,
    );
    if (!row) return reply.code(404).send({ error: '工具不存在' });
    if (row.disabled) return reply.code(403).send({ error: '该工具已被管理员禁用' });
    return {
      tool: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        href: row.link,
        icon: row.icon,
        isExternal: Boolean(row.is_external),
        disabled: Boolean(row.disabled),
        category: row.category_id
          ? {
              id: row.category_id,
              slug: row.category_slug ?? '',
              name: row.category_name ?? '未分类',
              icon: row.category_icon ?? 'Sparkles',
              description: '',
            }
          : null,
      },
    };
  });

  // --------------------------------------------------------------- home stats
  app.get('/stats/public', async () => {
    const stats: PublicStats = {
      tools: count('SELECT COUNT(*) FROM tools WHERE disabled = 0'),
      categories: count('SELECT COUNT(*) FROM tool_categories'),
      blogs: count('SELECT COUNT(*) FROM blogs WHERE is_public = 1'),
      threads: count('SELECT COUNT(*) FROM threads'),
      posts: count('SELECT COUNT(*) FROM posts'),
      users: count('SELECT COUNT(*) FROM users'),
    };
    return stats;
  });

  // ------------------------------------------------------------- site config
  app.get('/site', async () => {
    const { config } = await import('../config.js');
    return {
      name: config.appName,
      version: '2.0.0',
      smtpConfigured: Boolean(config.smtp.host && config.smtp.user),
      assistantConfigured: Boolean(config.deepseek.apiKey),
      registrationOpen: true,
    };
  });
}
