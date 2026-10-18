import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireSuperAdmin } from '../lib/auth.js';
import { chatWithDeepSeek, modeById } from '../lib/deepseek.js';
import { sendMail, verifyMail } from '../lib/email.js';
import { adminSettingsView, saveAiSettings, saveMailSettings } from '../lib/settings.js';
import { ApiError, rateLimit } from '../lib/security.js';
import { emailSchema, parse } from '../lib/validation.js';

const mailSchema = z.object({
  host: z.string().trim().max(255).default(''),
  port: z.coerce.number().int().min(1).max(65535).default(465),
  secure: z.boolean().default(true),
  user: z.string().trim().max(255).default(''),
  from: z.string().trim().max(255).default(''),
  pass: z.string().max(500).optional(),
  clearPassword: z.boolean().optional().default(false),
});

const aiSchema = z.object({
  baseUrl: z.string().trim().url('接口地址必须是完整 URL').max(300).default('https://api.deepseek.com/v1'),
  chatModel: z.string().trim().min(1).max(100).default('deepseek-chat'),
  reasoningModel: z.string().trim().min(1).max(100).default('deepseek-reasoner'),
  apiKey: z.string().max(500).optional(),
  clearApiKey: z.boolean().optional().default(false),
});

export async function adminSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    requireAdmin(req);
  });
  app.get('/admin/settings', async (req) => {
    requireSuperAdmin(req);
    return adminSettingsView();
  });

  app.put('/admin/settings/mail', async (req) => {
    requireSuperAdmin(req);
    const body = parse(mailSchema, req.body);
    saveMailSettings(body);
    return { message: '邮件设置已保存', settings: adminSettingsView() };
  });

  app.put('/admin/settings/ai', async (req) => {
    requireSuperAdmin(req);
    const body = parse(aiSchema, req.body);
    saveAiSettings(body);
    return { message: 'AI 设置已保存', settings: adminSettingsView() };
  });

  app.post('/admin/settings/test-mail', async (req) => {
    const user = requireSuperAdmin(req);
    rateLimit(`settings:mail:${user.id}`, 5, 10 * 60_000);
    const body = parse(z.object({ to: emailSchema.optional() }), req.body ?? {});
    const to = body.to || user.email;

    const check = await verifyMail();
    if (!check.delivered) {
      throw new ApiError(502, `SMTP 连接失败：${check.error ?? '未知错误'}`);
    }
    const result = await sendMail(
      to,
      '【Lith Tools】SMTP 测试邮件',
      '<p>这是一封来自 Lith Tools 管理后台的测试邮件，说明 SMTP 配置已生效。</p>',
    );
    if (!result.delivered) throw new ApiError(502, `测试邮件发送失败：${result.error ?? '未知错误'}`);
    return { message: `测试邮件已发送到 ${to}`, to };
  });

  app.post('/admin/settings/test-ai', async (req) => {
    const user = requireSuperAdmin(req);
    rateLimit(`settings:ai:${user.id}`, 5, 10 * 60_000);
    const body = parse(z.object({ prompt: z.string().trim().max(200).optional() }), req.body ?? {});
    const result = await chatWithDeepSeek(modeById('chat'), [
      { role: 'user', content: body.prompt || '请只回复四个字：连接成功' },
    ]);
    return { message: 'AI 连接正常', reply: result.reply, model: result.model, tokens: result.tokens };
  });
}
