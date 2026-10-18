import { config } from './config.js';
import { buildApp } from './app.js';
import { migrate } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { purgeExpiredSessions } from './lib/auth.js';
import { sweepExpiredBans } from './lib/access.js';

async function main(): Promise<void> {
  migrate();
  const seed = await seedDatabase();

  console.log(`[db] ${seed.tools} tools · ${seed.categories} tool categories`);
  if (seed.adminCreated) {
    console.log(
      `[seed] 已创建超级管理员「${config.admin.username}」，密码「${config.admin.password}」——请登录后立即修改。`,
    );
  }
  if (seed.demoContent) console.log('[seed] 已写入欢迎博客与论坛示例内容');

  const removedBans = sweepExpiredBans();
  if (removedBans > 0) console.log(`[ban] archived ${removedBans} expired IP ban(s)`);

  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
  console.log(`[server] Lith Tools API + web listening on http://${config.host}:${config.port}`);

  const interval = setInterval(() => {
    try {
      purgeExpiredSessions();
      sweepExpiredBans();
    } catch (error) {
      console.error('[maintenance]', error);
    }
  }, 10 * 60_000);
  interval.unref();

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down`);
    clearInterval(interval);
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});
