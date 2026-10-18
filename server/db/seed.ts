import { toolCatalog, toolCategories } from '../../shared/catalog.js';
import { config } from '../config.js';
import { count, get, nowIso, run, transaction } from './client.js';
import { hashPassword } from '../lib/security.js';

export interface SeedResult {
  adminCreated: boolean;
  tools: number;
  categories: number;
  demoContent: boolean;
}

const BLOG_CATEGORIES = ['技术', '教程', '生活', '随笔'];

/**
 * Idempotent seeding: safe to run on every boot.
 * - tool categories / tools: inserted only when missing (admin edits survive).
 * - blog categories: inserted only when missing.
 * - bootstrap admin: created only when no super admin exists.
 * - demo content: only for a completely empty database.
 */
export async function seedDatabase(): Promise<SeedResult> {
  const now = nowIso();
  let adminCreated = false;

  const result = transaction(() => {
    // ---------------------------------------------------------- tool taxonomy
    const categoryIds = new Map<string, number>();
    for (const [index, category] of toolCategories.entries()) {
      run(
        `INSERT INTO tool_categories (slug, name, icon, description, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           icon = excluded.icon,
           description = excluded.description,
           sort_order = excluded.sort_order`,
        category.id,
        category.name,
        category.icon,
        category.description,
        index,
      );
      const row = get<{ id: number }>('SELECT id FROM tool_categories WHERE slug = ?', category.id);
      if (row) categoryIds.set(category.id, row.id);
    }

    // ------------------------------------------------------------------ tools
    for (const [index, tool] of toolCatalog.entries()) {
      const categoryId = categoryIds.get(tool.category) ?? null;
      run(
        `INSERT INTO tools (slug, name, description, link, category_id, icon, is_external, disabled, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
         ON CONFLICT(slug) DO NOTHING`,
        tool.slug,
        tool.name,
        tool.description,
        `/tools/${tool.slug}`,
        categoryId,
        tool.icon,
        index,
        now,
      );
    }

    // -------------------------------------------------------- blog categories
    for (const name of BLOG_CATEGORIES) {
      run('INSERT OR IGNORE INTO categories (name, created_at) VALUES (?, ?)', name, now);
    }

    // --------------------------------------------------------- bootstrap admin
    const superAdmins = count('SELECT COUNT(*) FROM users WHERE role = 2');
    const existingAdmin = get<{ id: number }>('SELECT id FROM users WHERE username = ?', config.admin.username);
    if (superAdmins === 0 && !existingAdmin) {
      run(
        `INSERT INTO users (username, email, password_hash, role, created_at, email_verified_at)
         VALUES (?, ?, ?, 2, ?, ?)`,
        config.admin.username,
        config.admin.email,
        hashPassword(config.admin.password),
        now,
        now,
      );
      adminCreated = true;
    }

    return {
      adminCreated,
      tools: count('SELECT COUNT(*) FROM tools'),
      categories: count('SELECT COUNT(*) FROM tool_categories'),
      demoContent: false,
    };
  });

  if (config.seedDemo && count('SELECT COUNT(*) FROM blogs') === 0) {
    createDemoContent();
    result.demoContent = true;
  }

  return result;
}

function createDemoContent(): void {
  const admin = get<{ id: number }>("SELECT id FROM users WHERE role = 2 ORDER BY id LIMIT 1");
  if (!admin) return;
  const now = nowIso();
  const techCategory = get<{ id: number }>('SELECT id FROM categories WHERE name = ?', '技术');

  transaction(() => {
    run(
      `INSERT INTO blogs (title, content, summary, author_id, category_id, is_public, views, created_at, latest_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      'Lith Tools 2.0：一次彻底的重写',
      `# Lith Tools 2.0

欢迎来到全新版本的 Lith Tools。我们对整站进行了重写，目标是让每一个小工具都更快、更好用。

## 这次改变了什么？

- **全新的技术栈**：Node.js + TypeScript + React，替换了原来的 PHP 页面。
- **统一的设计系统**：浅色 / 深色主题、响应式布局、可搜索的工具库。
- **真正安全的账户体系**：密码使用 scrypt 哈希、会话 Cookie 不可被脚本读取、所有写操作都校验来源。
- **博客与论坛**：Markdown 渲染经过消毒，支持和评论、点赞、分类与审核。
- **数据落在 SQLite**：单文件数据库，备份只需要复制一个文件。

## 内置的示例工具

你可以从首页直接打开任意工具，例如：

1. [JSON 格式化器](/tools/json-formatter)
2. [图片压缩器](/tools/image-compress)
3. [二维码生成器](/tools/qr-code)
4. [世界时钟](/tools/world-clock)

> 所有工具都在浏览器本地处理数据，文件不会上传到服务器。

如果发现问题，欢迎通过「意见反馈」告诉我们。`,
      'Lith Tools 2.0 正式上线：全新的界面、更快的加载速度、更安全的账户体系。',
      admin.id,
      techCategory?.id ?? null,
      now,
      now,
    );

    run(
      `INSERT INTO blogs (title, content, summary, author_id, category_id, is_public, views, created_at, latest_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      'Markdown 写作小贴士',
      `# Markdown 写作小贴士

本站的博客内容使用 **Markdown** 编写，编辑器提供实时预览。

## 常用语法

\`\`\`md
# 一级标题
## 二级标题

**加粗** 与 *斜体*

- 列表项
- 列表项

[链接](https://example.com)
\`\`\`

## 数学公式

行内公式写作 \`$E = mc^2$\`，块级公式：

$$
\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

## 代码块

\`\`\`ts
const greeting = (name: string) => \`你好，\${name}\`;
\`\`\`

写作完成后可以直接发布，也可以在投稿中心提交审核。`,
      'Markdown 语法速查与公式、代码块的写法示例。',
      admin.id,
      techCategory?.id ?? null,
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() - 86_400_000).toISOString(),
    );

    const general = run(
      'INSERT INTO forums (name, description, created_at) VALUES (?, ?, ?)',
      '综合讨论',
      '聊聊工具、效率与日常使用心得。',
      now,
    );
    const meta = run(
      'INSERT INTO forums (name, description, created_at) VALUES (?, ?, ?)',
      '意见与建议',
      '对本站有任何想法，都可以在这里提出。',
      now,
    );

    const thread = run(
      'INSERT INTO threads (forum_id, title, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      general.lastInsertRowid,
      '欢迎来到 Lith Tools 社区',
      admin.id,
      now,
      now,
    );
    run(
      'INSERT INTO posts (thread_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
      thread.lastInsertRowid,
      admin.id,
      '这是新版论坛的第一条帖子。欢迎在这里交流工具使用技巧，或者分享你希望新增的功能。',
      now,
    );
    run(
      'INSERT INTO posts (thread_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
      thread.lastInsertRowid,
      admin.id,
      '提示：发帖与回复需要先登录，注册只需要一个邮箱验证码。',
      now,
    );

    const feedbackThread = run(
      'INSERT INTO threads (forum_id, title, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      meta.lastInsertRowid,
      '意见反馈的正确打开方式',
      admin.id,
      now,
      now,
    );
    run(
      'INSERT INTO posts (thread_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
      feedbackThread.lastInsertRowid,
      admin.id,
      '如果发现某个工具无法使用，请附上浏览器版本与复现步骤，方便我们定位问题。',
      now,
    );
  });
}
