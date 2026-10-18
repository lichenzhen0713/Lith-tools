import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../lib/auth.js';
import {
  assistantConfigured,
  assistantModes,
  assistantStatus,
  chatWithDeepSeek,
  modeById,
  type AssistantModeId,
} from '../lib/deepseek.js';
import { ApiError, rateLimit } from '../lib/security.js';
import { parse } from '../lib/validation.js';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(6000),
});

const modeIds = assistantModes.map((mode) => mode.id) as [AssistantModeId, ...AssistantModeId[]];

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/assistant/status', async () => assistantStatus());

  app.post('/assistant/chat', async (req, reply) => {
    const user = requireUser(req);
    rateLimit(`assistant:${user.id}`, 30, 60 * 60_000);

    if (!assistantConfigured()) {
      throw new ApiError(503, 'AI 助手尚未配置。管理员设置 DEEPSEEK_API_KEY 后重启服务即可使用。');
    }

    const body = parse(
      z.object({
        messages: z.array(messageSchema).min(1, '请输入内容').max(20, '对话轮次过多，请刷新页面重试'),
        mode: z.enum(modeIds).optional().default('chat'),
      }),
      req.body,
    );

    const mode = modeById(body.mode);
    const result = await chatWithDeepSeek(mode, body.messages);
    return reply.send({
      reply: result.reply,
      reasoning: result.reasoning,
      model: result.model,
      mode: mode.id,
      modeName: mode.name,
      tokens: result.tokens,
    });
  });
}
