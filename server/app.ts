import Fastify, { type FastifyInstance } from 'fastify';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { findActiveBan, logAccess, banPageHtml } from './lib/access.js';
import { getClientIp } from './lib/auth.js';
import { ApiError } from './lib/security.js';
import { adminRoutes } from './routes/admin.js';
import { adminSettingsRoutes } from './routes/admin-settings.js';
import { assistantRoutes } from './routes/assistant.js';
import { authRoutes } from './routes/auth.js';
import { lczojRoutes } from './routes/lczoj.js';
import { blogRoutes } from './routes/blog.js';
import { engagementRoutes } from './routes/engagement.js';
import { forumRoutes } from './routes/forum.js';
import { networkRoutes } from './routes/network.js';
import { publicRoutes } from './routes/public.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.isProd ? 'info' : 'warn',
    },
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip'],
  });

  // Global request pipeline: headers → origin check → IP ban → visit counter.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');

    const ip = getClientIp(req);
    const banned = findActiveBan(ip);
    if (banned) {
      if (req.url.startsWith('/api/')) {
        return reply.code(403).send({
          error: '您的 IP 地址已被封禁',
          bannedUntil: banned.bannedUntil,
          reason: banned.reason,
        });
      }
      return reply.code(403).type('text/html; charset=utf-8').send(banPageHtml(banned));
    }

    // CSRF defense: state-changing requests must come from the same origin.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        try {
          const originHost = new URL(origin).host;
          const host = req.headers.host ?? '';
          const configuredHost = config.publicOrigin ? new URL(config.publicOrigin).host : '';
          if (originHost !== host && originHost !== configuredHost) {
            return reply.code(403).send({ error: '请求来源校验失败' });
          }
        } catch {
          return reply.code(403).send({ error: '请求来源校验失败' });
        }
      }
    }

    // Visit counter for document navigations only (mirrors the original log_access).
    const isDocument =
      req.method === 'GET' &&
      !req.url.startsWith('/api') &&
      !req.url.startsWith('/assets') &&
      !req.url.startsWith('/favicon') &&
      (req.headers.accept ?? '').includes('text/html');
    if (isDocument) {
      try {
        logAccess(ip);
      } catch (error) {
        req.log.warn({ err: error }, 'access log failed');
      }
    }
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.status).send({ error: error.message, details: error.details });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: (error as Error).message });
    }
    req.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: '服务器开小差了，请稍后再试' });
  });

  // ------------------------------------------------------------------- routes
  app.get('/api/health', async () => ({ ok: true, uptime: process.uptime() }));

  await app.register(publicRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(lczojRoutes, { prefix: '/api/auth' });
  await app.register(blogRoutes, { prefix: '/api' });
  await app.register(forumRoutes, { prefix: '/api' });
  await app.register(engagementRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(adminSettingsRoutes, { prefix: '/api' });
  await app.register(networkRoutes, { prefix: '/api' });
  await app.register(assistantRoutes, { prefix: '/api' });

  // ------------------------------------------------------------- static files
  const distIndex = path.join(config.distDir, 'index.html');
  if (fs.existsSync(distIndex)) {
    await app.register(fastifyStatic, {
      root: config.distDir,
      wildcard: false,
      cacheControl: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (/(logo|favicon)\.svg$|site\.webmanifest$|index\.html$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: '接口不存在' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: '接口不存在' });
      }
      return reply.code(404).send({
        error: '前端资源尚未构建。开发模式请访问 Vite（5173 端口），生产模式请先运行 npm run build。',
      });
    });
  }

  return app;
}
