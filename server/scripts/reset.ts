import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { migrate } from '../db/schema.js';
import { seedDatabase } from '../db/seed.js';

// Safety: only ever delete database files inside <project>/data.
const dataDir = path.resolve(config.rootDir, 'data');
const dbFile = path.resolve(config.dbPath);
if (!dbFile.startsWith(dataDir + path.sep)) {
  console.error(`拒绝删除 data 目录之外的数据库文件: ${dbFile}`);
  process.exit(1);
}

for (const suffix of ['', '-wal', '-shm']) {
  const target = dbFile + suffix;
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    console.log(`已删除 ${target}`);
  }
}

migrate();
const result = await seedDatabase();
console.log('数据库已重建：', {
  database: dbFile,
  tools: result.tools,
  admin: `${config.admin.username} / ${config.admin.password}`,
});
