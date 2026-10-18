/** Generate docs/URL-MAP.md from shared/catalog.ts (legacy PHP path → SPA route). */
import fs from 'node:fs';

const source = fs.readFileSync('shared/catalog.ts', 'utf8');
const pattern = /slug: '([^']+)',\s*name: '([^']+)',\s*category: '([^']+)',[\s\S]*?legacyPath: '([^']+)'/g;
const categoryNames = {
  calculator: '计算器',
  math: '数学工具',
  time: '时间工具',
  conversion: '单位转换',
  text: '文本处理',
  color: '颜色工具',
  development: '开发工具',
  file: '文件工具',
  health: '健康工具',
  photo: '图像处理',
  internet: '网络工具',
  happy: '娱乐工具',
  others: '其它工具',
};

const rows = [];
for (const match of source.matchAll(pattern)) {
  rows.push({ slug: match[1], name: match[2], category: match[3], legacy: match[4] });
}

const platform = [
  ['index.php', '/', '首页与工具目录'],
  ['admin_login.html', '/login', '登录'],
  ['register.html + verify_code.html', '/register', '邮箱验证码注册（单页两步）'],
  ['forgot_password.php', '/forgot-password', '找回密码'],
  ['reset_password.php', '/reset-password?token=…', '重置密码'],
  ['user_dashboard.php', '/dashboard', '个人中心'],
  ['edit_profile.php', '/dashboard?tab=settings', '账户设置'],
  ['submit_tool.php', '/submit/tool', '推荐工具'],
  ['feedback.php', '/feedback', '意见反馈'],
  ['submit_blog.php', '/submit/blog', '博客投稿'],
  ['blog/blog_list.php', '/blog', '博客列表'],
  ['blog/view_blog.php?id=N', '/blog/N', '博客详情'],
  ['blog/create_blog.php', '/blog/new', '新建博客'],
  ['blog/edit_blog.php?id=N', '/blog/N/edit', '编辑博客'],
  ['blog/admin_blog.php', '/admin/blogs、/admin/categories、/admin/submissions', '管理后台对应页面'],
  ['forum/index.php', '/forum', '论坛板块'],
  ['forum/view_forum.php?id=N', '/forum/N', '主题列表'],
  ['forum/view_thread.php?id=N', '/forum/thread/N', '主题详情'],
  ['chat.php', '/assistant', 'AI 助手（密钥移至服务端）'],
  ['admin_dashboard.php', '/admin', '管理后台概览'],
  ['edit_user.php?id=N', '/admin/users', '用户管理'],
  ['ban_history.php', '/admin/bans', '封禁历史'],
  ['manage_categories.php', '/admin/categories', '博客分类管理'],
  ['feedback_detail.php?id=N', '/admin/feedback', '反馈处理'],
  ['submission_detail.php?id=N', '/admin/submissions', '投稿审核'],
  ['banned.php', '（服务端直接渲染 403 页）', 'IP 封禁提示'],
];

let output = '# 旧版 URL → 新版路由对照\n\n';
output += '旧版页面位于旧版 PHP 站点根目录，新版为 SPA 路由（开发环境 `http://localhost:5173`，生产环境同域名根路径）。\n\n';
output += '## 工具页面\n\n| 旧版路径 | 新版路由 | 工具 | 分类 |\n| --- | --- | --- | --- |\n';
for (const row of rows) {
  output += `| \`${row.legacy}\` | \`/tools/${row.slug}\` | ${row.name} | ${categoryNames[row.category] ?? row.category} |\n`;
}
output += '\n## 平台页面\n\n| 旧版 | 新版 | 说明 |\n| --- | --- | --- |\n';
for (const [legacy, next, note] of platform) {
  output += `| \`${legacy}\` | \`${next}\` | ${note} |\n`;
}
output += `\n## 旧版静态资源\n
- \`styles.css\` / \`dark-mode.css\` / \`button.css\` / \`da_styles.css\` → 统一为 \`src/styles/index.css\`（Tailwind 设计令牌与组件类）。
- \`script.js\`（搜索/暗色模式/首页跳转）→ React 组件与 \`ThemeProvider\`、\`SearchPalette\`。
- \`font-awesome-4.7.0/\`、\`all.min.css\` → \`lucide-react\` 图标。
- \`PHPMailer/\`、\`src/\` → \`nodemailer\`（可选邮件服务）。
- \`chat.php\` 中暴露的 API Key 已删除，改由服务端环境变量 \`OPENROUTER_API_KEY\` 提供。
`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/URL-MAP.md', output, 'utf8');
console.log(`docs/URL-MAP.md written with ${rows.length} tool rows`);
