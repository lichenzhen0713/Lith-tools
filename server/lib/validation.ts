import { z } from 'zod';
import { ApiError } from './security.js';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    throw ApiError.badRequest(`${path}${issue?.message ?? '参数不合法'}`, result.error.issues);
  }
  return result.data;
}

export const usernameSchema = z
  .string()
  .trim()
  .min(3, '用户名至少 3 个字符')
  .max(32, '用户名最多 32 个字符')
  .regex(/^[\w\u4e00-\u9fa5.-]+$/u, '用户名只能包含字母、数字、下划线、点、短横线或中文');

export const emailSchema = z
  .string()
  .trim()
  .min(3, '请输入邮箱')
  .max(254, '邮箱过长')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确');

export const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(128, '密码最多 128 位')
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/\d/, '密码需包含数字');

export const titleSchema = z.string().trim().min(1, '标题不能为空').max(200, '标题最多 200 字');

export const contentSchema = z.string().trim().min(1, '内容不能为空').max(200_000, '内容过长');

export interface PageQuery {
  page: number;
  pageSize: number;
  offset: number;
}

export function pagination(
  query: Record<string, unknown> | undefined,
  defaults: { pageSize?: number; maxPageSize?: number } = {},
): PageQuery {
  const pageSizeDefault = defaults.pageSize ?? 10;
  const maxPageSize = defaults.maxPageSize ?? 50;
  const rawPage = Number(query?.page ?? 1);
  const rawPageSize = Number(query?.pageSize ?? pageSizeDefault);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(Math.floor(rawPageSize), 1), maxPageSize)
    : pageSizeDefault;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function parseId(value: unknown, label = 'ID'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest(`${label} 不合法`);
  return id;
}

export function parseDays(value: unknown, fallback = 30): number {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return fallback;
  return Math.min(Math.floor(days), 3650);
}

/** Only allow http(s) URLs for user-supplied links. */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(500, '链接过长')
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, '请输入 http(s) 开头的有效链接');

export function stripMarkdown(markdown: string, maxLength = 160): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
