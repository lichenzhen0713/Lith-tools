import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getClientIp, requireUser } from '../lib/auth.js';
import { ApiError } from '../lib/security.js';
import { parse } from '../lib/validation.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

const PRIVATE_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isPrivateAddress(address: string): boolean {
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(address));
}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

export async function networkRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------- IP lookup
  app.get('/net/ip', async (req) => {
    const query = req.query as { ip?: string };
    const target = (query.ip ?? '').trim() || getClientIp(req);
    if (!net.isIP(target)) throw ApiError.badRequest('请输入合法的 IP 地址');
    if (isPrivateAddress(target)) {
      return {
        ip: target,
        local: true,
        city: '',
        region: '',
        country: '',
        org: '内网 / 本地地址',
        timezone: '',
      };
    }
    const data = await cached(`ip:${target}`, 10 * 60_000, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(`https://ipinfo.io/${encodeURIComponent(target)}/json`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new ApiError(502, 'IP 查询服务暂时不可用');
        return (await response.json()) as Record<string, string>;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, 'IP 查询超时，请稍后重试');
      } finally {
        clearTimeout(timer);
      }
    });
    return {
      ip: data.ip ?? target,
      local: false,
      city: data.city ?? '',
      region: data.region ?? '',
      country: data.country ?? '',
      org: data.org ?? '',
      timezone: data.timezone ?? '',
      loc: data.loc ?? '',
    };
  });

  // -------------------------------------------------------------- DNS lookup
  app.get('/net/dns', async (req) => {
    const query = req.query as { name?: string; type?: string };
    const name = (query.name ?? '').trim();
    const type = (query.type ?? 'A').toUpperCase();
    if (!name || name.length > 253 || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      throw ApiError.badRequest('请输入合法的域名');
    }
    const allowed = new Set(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME']);
    if (!allowed.has(type)) throw ApiError.badRequest('不支持的记录类型');

    try {
      const records = await cached(`dns:${type}:${name.toLowerCase()}`, 60_000, async () => {
        switch (type) {
          case 'AAAA':
            return dns.resolve6(name);
          case 'MX':
            return dns.resolveMx(name);
          case 'TXT':
            return dns.resolveTxt(name);
          case 'NS':
            return dns.resolveNs(name);
          case 'CNAME':
            return dns.resolveCname(name);
          default:
            return dns.resolve4(name);
        }
      });
      return { name, type, records };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      const message =
        code === 'ENOTFOUND' || code === 'ENODATA'
          ? '未找到该域名或记录'
          : code === 'ETIMEOUT'
            ? 'DNS 查询超时'
            : 'DNS 查询失败';
      return { name, type, records: [], error: message };
    }
  });

  // ------------------------------------------------------------- TCP latency
  app.post('/net/ping', async (req) => {
    const body = parse(
      z.object({
        host: z.string().trim().min(1, '请输入域名或 IP').max(253),
        port: z.number().int().min(1).max(65_535).optional().default(443),
      }),
      req.body,
    );
    if (!/^[a-zA-Z0-9.-]+$/.test(body.host) || body.host.startsWith('.') || body.host.endsWith('.')) {
      throw ApiError.badRequest('主机格式不正确');
    }
    if (!ALLOWED_PORTS.has(body.port)) {
      throw ApiError.badRequest('为了安全，仅支持探测 80 / 443 / 8080 / 8443 端口');
    }

    let address: string;
    try {
      const resolved = await dns.lookup(body.host);
      address = resolved.address;
    } catch {
      return { host: body.host, port: body.port, attempts: [], error: '无法解析该主机' };
    }
    if (isPrivateAddress(address)) throw ApiError.badRequest('不允许探测内网地址');

    const attempts: { success: boolean; latency: number | null; error?: string }[] = [];
    for (let index = 0; index < 3; index += 1) {
      const started = Date.now();
      attempts.push(await connect(address, body.port, started));
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return { host: body.host, address, port: body.port, attempts };
  });

  // ------------------------------------------------------------ exchange rates
  app.get('/net/rates', async (req) => {
    const query = req.query as { base?: string };
    const base = (query.base ?? 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(base)) throw ApiError.badRequest('货币代码应为 3 位字母');
    const data = await cached(`rates:${base}`, 60 * 60_000, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new ApiError(502, '汇率服务暂时不可用');
        const payload = (await response.json()) as {
          result?: string;
          time_last_update_utc?: string;
          rates?: Record<string, number>;
        };
        if (payload.result !== 'success' || !payload.rates) {
          throw new ApiError(502, '汇率数据异常，请稍后重试');
        }
        return { rates: payload.rates, updatedAt: payload.time_last_update_utc ?? '' };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, '汇率查询超时，请稍后重试');
      } finally {
        clearTimeout(timer);
      }
    });
    return { base, rates: data.rates, updatedAt: data.updatedAt };
  });

  // Keep auth helper import meaningful for future authenticated endpoints.
  void requireUser;
}

function connect(host: string, port: number, started: number): Promise<{ success: boolean; latency: number | null; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (success: boolean, error?: string) => {
      socket.destroy();
      resolve({ success, latency: success ? Date.now() - started : null, error });
    };
    socket.setTimeout(4_000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, '超时'));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(false, error.code ?? '连接失败'));
    socket.connect(port, host);
  });
}
