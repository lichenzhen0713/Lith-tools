import { config } from '../config.js';
import { migrate } from '../db/schema.js';
import { seedDatabase } from '../db/seed.js';

migrate();
const result = await seedDatabase();
console.log('数据库已就绪：', {
  database: config.dbPath,
  tools: result.tools,
  toolCategories: result.categories,
  adminCreated: result.adminCreated,
  demoContent: result.demoContent,
});
if (result.adminCreated) {
  console.log(
    `超级管理员：${config.admin.username} / ${config.admin.password}（请登录后修改密码）`,
  );
}
