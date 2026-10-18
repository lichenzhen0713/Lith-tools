import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Brain,
  ChevronDown,
  Code2,
  Copy,
  Languages,
  Loader2,
  MessageCircle,
  PenLine,
  RotateCcw,
  Send,
  Sparkles,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { ApiError, errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Alert, Badge, Button, Card } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { copyText, cn } from '../lib/utils';

interface ModeInfo {
  id: string;
  name: string;
  description: string;
  model: string;
}

interface AssistantStatus {
  configured: boolean;
  provider: string;
  defaultMode: string;
  modes: ModeInfo[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string | null;
  modeName?: string;
  model?: string;
}

const MODE_ICONS: Record<string, LucideIcon> = {
  chat: MessageCircle,
  reasoning: Brain,
  code: Code2,
  translate: Languages,
  writing: PenLine,
};

const MODE_GREETING: Record<string, string> = {
  chat: '你好！我是 Lith Tools 的 AI 助手。可以帮你解释工具用法、写代码、整理思路，或者推荐合适的工具。',
  reasoning: '深度思考模式已就绪。把复杂问题交给我：我会先拆解、列假设，再给出有依据的结论。',
  code: '代码助手已就绪。告诉我语言、版本和目标，我会给出可运行、类型安全的实现。',
  translate: '翻译润色模式已就绪。贴一段中英文，我会给出地道译文并说明关键措辞。',
  writing: '写作助手已就绪。告诉我读者、语气和篇幅，我可以写提纲、文案或润色现有文本。',
};

const SUGGESTIONS: Record<string, string[]> = {
  chat: [
    '帮我推荐一个压缩图片但不明显损失画质的工具',
    'JSON 和 YAML 的主要区别是什么？',
    '如何用 Web Crypto 安全地加密一段文本？',
  ],
  reasoning: [
    '分析一下这个工具站可能的性能瓶颈在哪',
    '如何设计一个可扩展的工具注册机制？',
    '比较 SQLite 与 Postgres 在这个项目里的取舍',
  ],
  code: [
    '用 TypeScript 写一个防抖函数，并解释原理',
    '帮我审查一个 React 自定义 Hook 的写法',
    '如何给 Fastify 路由写类型安全的请求校验？',
  ],
  translate: [
    '把这句话翻译成自然的英文：打开即用，文件不会离开浏览器。',
    '润色这封英文邮件，让语气更专业：Hi, I want to ask...',
    '解释一下这句英文里的语气差异',
  ],
  writing: [
    '写一段 Lith Tools 的产品介绍（100 字以内）',
    '帮我列一篇「自托管工具箱」教程的提纲',
    '把这段说明改得更简洁、更有说服力',
  ],
};

export default function Assistant() {
  useDocumentTitle('AI 助手');
  const { user } = useAuth();
  const toast = useToast();
  const status = useApi(() => http.get<AssistantStatus>('/api/assistant/status'), []);
  const [modeId, setModeId] = useState('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status.data?.defaultMode) setModeId(status.data.defaultMode);
  }, [status.data?.defaultMode]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  const modes = status.data?.modes ?? [];
  const activeMode = modes.find((mode) => mode.id === modeId);
  const configured = status.data?.configured ?? false;
  const suggestions = SUGGESTIONS[modeId] ?? SUGGESTIONS.chat;

  const switchMode = (id: string) => {
    if (sending || id === modeId) return;
    setModeId(id);
    setError(null);
    const name = modes.find((mode) => mode.id === id)?.name ?? id;
    toast.info(`已切换到「${name}」模式`);
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    if (!user) {
      toast.info('登录后即可与 AI 助手对话');
      return;
    }
    setError(null);
    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const data = await http.post<{
        reply: string;
        reasoning?: string | null;
        model?: string;
        modeName?: string;
        tokens?: number | null;
      }>('/api/assistant/chat', {
        messages: next
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => ({ role: message.role, content: message.content }))
          .slice(-20),
        mode: modeId,
      });
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.reply,
          reasoning: data.reasoning ?? null,
          modeName: data.modeName,
          model: data.model,
        },
      ]);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        setError('请先登录后再使用 AI 助手。');
      } else {
        setError(errorMessage(reason));
      }
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">AI 助手</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">多种模式，按需切换</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
            基于 DeepSeek：通用对话、深度思考、代码、翻译与写作。密钥只存在服务端。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.data ? (
            <Badge tone={configured ? 'success' : 'warning'}>
              {configured ? 'DeepSeek 已连接' : '未配置'}
            </Badge>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            disabled={sending}
          >
            新对话
          </Button>
        </div>
      </div>

      {!configured && !status.loading ? (
        <Alert tone="warning" title="AI 助手尚未配置" className="mt-5">
          管理员需要在服务端设置{' '}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">DEEPSEEK_API_KEY</code>
          （可选 <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">DEEPSEEK_BASE_URL</code>），然后重启服务。
        </Alert>
      ) : null}

      {/* ------------------------------------------------------------ modes */}
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {modes.map((mode) => {
          const Icon = MODE_ICONS[mode.id] ?? Sparkles;
          const active = mode.id === modeId;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => switchMode(mode.id)}
              disabled={sending}
              className={cn(
                'rounded-xl border p-3 text-left transition-all duration-150',
                active
                  ? 'border-transparent bg-[linear-gradient(135deg,#4f46e5,#06b6d4)] text-white shadow-[0_14px_30px_-18px_rgba(79,70,229,0.7)]'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--border-strong)] hover:bg-[var(--hover-bg)]',
              )}
              aria-pressed={active}
            >
              <span className="flex items-center gap-2">
                <Icon className={cn('size-4', active ? 'text-white' : 'text-[var(--brand)]')} />
                <span className="text-sm font-semibold">{mode.name}</span>
              </span>
              <span className={cn('mt-1 block text-[11px] leading-relaxed', active ? 'text-white/80' : 'text-[var(--text-muted)]')}>
                {mode.description}
              </span>
              <span className={cn('mt-2 inline-block rounded-full px-1.5 py-0.5 font-mono text-[10px]', active ? 'bg-white/15 text-white/85' : 'bg-[var(--hover-bg)] text-[var(--text-muted)]')}>
                {mode.model}
              </span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------- chat */}
      <Card className="mt-4 flex h-[min(60vh,600px)] flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5 text-xs text-[var(--text-muted)]">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>{activeMode?.name ?? '通用对话'} · {activeMode?.model ?? 'deepseek-chat'}</span>
          <span className="ml-auto flex items-center gap-1">
            {user ? `${user.username}` : '未登录'}
            <ChevronDown className="size-3" />
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25">
                <Bot className="size-7" />
              </div>
              <p className="mt-4 max-w-md text-sm leading-relaxed muted">{MODE_GREETING[modeId] ?? MODE_GREETING.chat}</p>
              <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="chip text-left"
                    disabled={!user || sending || !configured}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {!user ? (
                <p className="mt-6 text-xs subtle">
                  对话需要登录，{' '}
                  <Link to="/login" className="text-[var(--brand)] hover:underline">
                    去登录
                  </Link>{' '}
                  或{' '}
                  <Link to="/register" className="text-[var(--brand)] hover:underline">
                    注册
                  </Link>
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div key={index} className={cn('flex gap-3', message.role === 'user' ? 'flex-row-reverse' : '')}>
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-lg text-white',
                      message.role === 'user' ? 'bg-slate-500 dark:bg-slate-600' : 'bg-gradient-to-br from-indigo-500 to-cyan-500',
                    )}
                  >
                    {message.role === 'user' ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
                  </span>
                  <div
                    className={cn(
                      'max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 text-sm',
                      message.role === 'user' ? 'bg-indigo-600 text-white' : 'border bg-[var(--hover-bg)]',
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <>
                        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--brand)]">{message.modeName ?? 'AI'}</span>
                          {message.model ? <span className="font-mono">{message.model}</span> : null}
                        </div>
                        {message.reasoning ? (
                          <details className="mb-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2">
                            <summary className="cursor-pointer text-xs font-medium text-[var(--text-muted)]">
                              查看思考过程
                            </summary>
                            <pre className="mt-2 max-h-52 overflow-auto text-xs leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">
                              {message.reasoning}
                            </pre>
                          </details>
                        ) : null}
                        <Markdown content={message.content} className="text-sm" />
                        <button
                          type="button"
                          className="mt-2 flex items-center gap-1 text-[11px] subtle hover:text-[var(--brand)]"
                          onClick={async () => {
                            if (await copyText(message.content)) toast.success('已复制回复');
                          }}
                        >
                          <Copy className="size-3" /> 复制
                        </button>
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="flex items-center gap-2 text-sm subtle">
                  <Loader2 className="size-4 animate-spin" /> {modeId === 'reasoning' ? '正在深度思考…' : '助手正在回复…'}
                </div>
              ) : null}
            </>
          )}
        </div>

        {error ? <div className="border-t px-4 py-2 text-xs text-rose-500">{error}</div> : null}

        <div className="border-t p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={user ? '输入问题，Enter 发送，Shift + Enter 换行…' : '登录后即可对话'}
              disabled={!user || sending || !configured}
              className="input min-h-10 flex-1 resize-none py-2.5"
              aria-label="消息输入框"
            />
            <Button
              type="button"
              icon={Send}
              loading={sending}
              disabled={!user || !input.trim() || !configured}
              onClick={() => void send()}
              className="shrink-0"
            >
              发送
            </Button>
          </div>
          <p className="mt-2 text-[11px] subtle">
            由 DeepSeek 提供 · AI 生成内容可能不准确，请自行核实 · 请勿输入敏感个人信息
          </p>
        </div>
      </Card>
    </div>
  );
}
