import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../lib/auth.js';
import { ApiError, rateLimit } from '../lib/security.js';
import { parse } from '../lib/validation.js';

const SYSTEM_PROMPT =
  '你是 Lith Tools 网站内置的友好助手。请用简洁、准确的中文回答；涉及代码时使用 Markdown 代码块；不知道的内容请直接说明。';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(6000),
});

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/assistant/status', async () => ({
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
  }));

  app.post('/assistant/chat', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`assistant:${user.id}`, 20, 60 * 60_000);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new ApiError(503, 'AI 助手尚未配置。管理员设置 OPENROUTER_API_KEY 后即可使用。');
    }

    const body = parse(
      z.object({
        messages: z.array(messageSchema).min(1, '请输入内容').max(20, '对话轮次过多，请刷新页面重试'),
      }),
      req.body,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`${process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.PUBLIC_ORIGIN ?? 'http://localhost',
          'X-Title': 'Lith Tools',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...body.messages],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        req.log.warn({ status: response.status, text: text.slice(0, 300) }, 'assistant upstream error');
        throw new ApiError(502, 'AI 服务暂时不可用，请稍后重试');
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        model?: string;
        usage?: { total_tokens?: number };
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) throw new ApiError(502, 'AI 未返回内容，请重试');
      return reply.send({ reply: content, model: payload.model, tokens: payload.usage?.total_tokens ?? null });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as Error).name === 'AbortError') throw new ApiError(504, 'AI 响应超时，请重试');
      throw new ApiError(502, '无法连接 AI 服务，请稍后重试');
    } finally {
      clearTimeout(timer);
    }
  });
}
