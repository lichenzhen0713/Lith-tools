import path from 'node:path';
import process from 'node:process';

// Load .env if present (Node >= 20.12 built-in, no dotenv dependency).
try {
  process.loadEnvFile();
} catch {
  /* no .env file — use defaults */
}

const rootDir = process.cwd();
const env = process.env.NODE_ENV ?? 'development';
const isProd = env === 'production';

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  env,
  isProd,
  appName: 'Lith Tools',
  rootDir,
  host: process.env.HOST ?? '127.0.0.1',
  port: int(process.env.PORT, 8787),
  /** Public origin used in outgoing links; defaults to the request host. */
  publicOrigin: process.env.PUBLIC_ORIGIN ?? '',
  dbPath: process.env.DB_PATH ?? path.join(rootDir, 'data', 'lith-tools.db'),
  distDir: path.join(rootDir, 'dist'),
  session: {
    cookieName: 'lith_session',
    ttlDays: int(process.env.SESSION_TTL_DAYS, 30),
    /** Secure cookies by default in production; override for local HTTP testing. */
    cookieSecure: bool(process.env.COOKIE_SECURE, isProd),
  },
  trustProxy: bool(process.env.TRUST_PROXY, false),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
    password: process.env.ADMIN_PASSWORD ?? 'admin123456',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseUrl: (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    chatModel: process.env.DEEPSEEK_CHAT_MODEL ?? 'deepseek-chat',
    reasoningModel: process.env.DEEPSEEK_REASONING_MODEL ?? 'deepseek-reasoner',
  },
  /** Demo data (blog posts, forum threads) created by `npm run db:seed`. */
  seedDemo: bool(process.env.SEED_DEMO, true),
} as const;

export const hasSmtp = Boolean(config.smtp.host && config.smtp.user);
