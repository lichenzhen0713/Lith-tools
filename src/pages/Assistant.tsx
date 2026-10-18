import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Copy, Loader2, RotateCcw, Send, Sparkles, User as UserIcon } from 'lucide-react';
import { ApiError, errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Alert, Badge, Button, Card } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { copyText, cn } from '../lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  '你好！我是 Lith Tools 的 AI 助手。可以帮你解释工具用法、写代码、整理思路，或者推荐合适的工具。有什么想聊的？';

const SUGGESTIONS = [
  '帮我推荐一个压缩图片但不明显损失画质的工具',
  '用 TypeScript 写一个防抖函数，并解释原理',
  'JSON 和 YAML 的主要区别是什么？',
  '如何用 Web Crypto 安全地加密一段文本？',
];

export default function Assistant() {
  useDocumentTitle('AI 助手');
  const { user } = useAuth();
  const toast = useToast();
  const status = useApi(() => http.get<{ configured: boolean; model: string }>('/api/assistant/status'), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      const data = await http.post<{ reply: string; model?: string; tokens?: number | null }>(
        '/api/assistant/chat',
        { messages: next.slice(-20) },
      );
      setMessages((current) => [...current, { role: 'assistant', content: data.reply }]);
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

  const configured = status.data?.configured ?? false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="brand">
            <Sparkles className="size-3.5" /> AI 助手
          </Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">和 Lith 助手聊聊</h1>
          <p className="mt-2 text-sm muted">工具使用答疑、代码解释、写作思路 —— 由服务端安全代理，密钥不会出现在浏览器里。</p>
        </div>
        <div className="flex items-center gap-2">
          {status.data ? <Badge tone={configured ? 'success' : 'warning'}>{configured ? `已连接 · ${status.data.model}` : '未配置'}</Badge> : null}
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => { setMessages([]); setError(null); }} disabled={sending}>
            新对话
          </Button>
        </div>
      </div>

      {!configured && !status.loading ? (
        <Alert tone="warning" title="AI 助手尚未配置" className="mt-5">
          管理员需要在服务端环境变量中设置 <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">OPENROUTER_API_KEY</code>
          （可选 <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">OPENROUTER_MODEL</code>）后重启服务。配置前页面仍可浏览。
        </Alert>
      ) : null}

      <Card className="mt-5 flex h-[min(68vh,640px)] flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
                <Bot className="size-7" />
              </div>
              <p className="mt-4 max-w-md text-sm leading-relaxed muted">{GREETING}</p>
              <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="chip text-left" disabled={!user || sending}>
                    {suggestion}
                  </button>
                ))}
              </div>
              {!user ? (
                <p className="mt-6 text-xs subtle">
                  对话需要登录，{' '}
                  <Link to="/login" className="text-indigo-600 hover:underline dark:text-indigo-400">去登录</Link>
                  {' '}或{' '}
                  <Link to="/register" className="text-indigo-600 hover:underline dark:text-indigo-400">注册</Link>
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
                      message.role === 'user' ? 'bg-slate-500 dark:bg-slate-600' : 'bg-gradient-to-br from-indigo-500 to-violet-600',
                    )}
                  >
                    {message.role === 'user' ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
                  </span>
                  <div className={cn('max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 text-sm', message.role === 'user' ? 'bg-indigo-600 text-white' : 'border bg-[var(--hover-bg)]')}>
                    {message.role === 'assistant' ? (
                      <>
                        <Markdown content={message.content} className="text-sm" />
                        <button
                          type="button"
                          className="mt-2 flex items-center gap-1 text-[11px] subtle hover:text-indigo-600"
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
                  <Loader2 className="size-4 animate-spin" /> 助手正在思考…
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
          <p className="mt-2 text-[11px] subtle">AI 生成内容可能不准确，请自行核实。请勿输入敏感个人信息。</p>
        </div>
      </Card>
    </div>
  );
}
