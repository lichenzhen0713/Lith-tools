import { config } from '../config.js';
import { ApiError } from './security.js';

export type AssistantModeId = 'chat' | 'reasoning' | 'code' | 'translate' | 'writing';

export interface AssistantMode {
  id: AssistantModeId;
  name: string;
  description: string;
  model: string;
  temperature?: number;
  systemPrompt: string;
}

const BASE_PROMPT =
  '你是 Lith Tools 内置的 AI 助手。使用简体中文回答，保持准确、简洁、可操作；涉及代码时使用 Markdown 代码块；不确定的内容要明确说明，不要编造。';

/**
 * Five modes share one OpenAI-compatible endpoint. `deepseek-reasoner` returns
 * an extra `reasoning_content` field which the UI renders as a collapsible
 * "thinking" block; the other modes use `deepseek-chat` with different prompts.
 */
export const assistantModes: AssistantMode[] = [
  {
    id: 'chat',
    name: '通用对话',
    description: '日常问答、工具用法与想法整理',
    model: config.deepseek.chatModel,
    temperature: 0.7,
    systemPrompt: BASE_PROMPT,
  },
  {
    id: 'reasoning',
    name: '深度思考',
    description: '复杂问题拆解，展示推理过程',
    model: config.deepseek.reasoningModel,
    systemPrompt: `${BASE_PROMPT}\n\n当前为深度思考模式：先充分分析问题、列出关键假设，再给出结论。结论要有条理，必要时给出步骤或验证方法。`,
  },
  {
    id: 'code',
    name: '代码助手',
    description: '写代码、查 Bug、解释实现',
    model: config.deepseek.chatModel,
    temperature: 0.2,
    systemPrompt: `${BASE_PROMPT}\n\n当前为代码助手模式：优先给出可运行、类型安全的代码；指明语言与版本；解释关键取舍；如果信息不足，先说明需要的上下文。`,
  },
  {
    id: 'translate',
    name: '翻译润色',
    description: '中英互译与语气润色',
    model: config.deepseek.chatModel,
    temperature: 0.3,
    systemPrompt: `${BASE_PROMPT}\n\n当前为翻译润色模式：先给出自然、地道的译文，再简要说明关键用词或语气选择；保留原文格式与专有名词。`,
  },
  {
    id: 'writing',
    name: '写作助手',
    description: '提纲、文案、文章修改',
    model: config.deepseek.chatModel,
    temperature: 0.85,
    systemPrompt: `${BASE_PROMPT}\n\n当前为写作助手模式：先理解目标读者与语气，再给出结构清晰、有细节的文本；避免空泛套话，必要时提供两个版本。`,
  },
];

export function assistantConfigured(): boolean {
  return Boolean(config.deepseek.apiKey);
}

export function modeById(id: string | undefined): AssistantMode {
  return assistantModes.find((mode) => mode.id === id) ?? assistantModes[0];
}

export function assistantStatus() {
  return {
    configured: assistantConfigured(),
    provider: 'deepseek' as const,
    defaultMode: assistantModes[0].id,
    modes: assistantModes.map((mode) => ({
      id: mode.id,
      name: mode.name,
      description: mode.description,
      model: mode.model,
    })),
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  reply: string;
  reasoning: string | null;
  model: string;
  tokens: number | null;
}

export async function chatWithDeepSeek(mode: AssistantMode, messages: ChatMessage[]): Promise<ChatResult> {
  if (!config.deepseek.apiKey) {
    throw new ApiError(503, 'AI 助手尚未配置。请设置 DEEPSEEK_API_KEY 后重启服务。');
  }

  const controller = new AbortController();
  const timeout = mode.id === 'reasoning' ? 120_000 : 60_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const body: Record<string, unknown> = {
    model: mode.model,
    messages: [{ role: 'system', content: mode.systemPrompt }, ...messages],
    max_tokens: 4096,
    stream: false,
  };
  // deepseek-reasoner does not accept sampling parameters; keep its defaults.
  if (mode.temperature !== undefined) body.temperature = mode.temperature;

  try {
    const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.deepseek.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const detail = text.slice(0, 300);
      if (response.status === 401) throw new ApiError(502, 'DeepSeek API Key 无效或已过期');
      if (response.status === 402) throw new ApiError(502, 'DeepSeek 账户余额不足，请充值后重试');
      if (response.status === 429) throw new ApiError(429, 'DeepSeek 请求过于频繁，请稍后再试');
      if (response.status === 400) throw new ApiError(502, 'AI 请求参数不被接受，请换一种问法或切换模式');
      console.warn('[ai] DeepSeek upstream error', response.status, detail);
      throw new ApiError(502, 'DeepSeek 服务暂时不可用，请稍后重试');
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[];
      model?: string;
      usage?: { total_tokens?: number };
    };
    const message = payload.choices?.[0]?.message;
    const reply = message?.content?.trim() ?? '';
    if (!reply) {
      if (payload.choices?.[0]?.finish_reason === 'length') {
        throw new ApiError(502, '回答被长度限制截断，请缩短问题后重试');
      }
      throw new ApiError(502, 'AI 未返回内容，请重试');
    }

    return {
      reply,
      reasoning: message?.reasoning_content?.trim() || null,
      model: payload.model ?? mode.model,
      tokens: payload.usage?.total_tokens ?? null,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === 'AbortError') throw new ApiError(504, 'AI 响应超时，请重试');
    throw new ApiError(502, '无法连接 DeepSeek 服务，请检查服务器出网设置');
  } finally {
    clearTimeout(timer);
  }
}
