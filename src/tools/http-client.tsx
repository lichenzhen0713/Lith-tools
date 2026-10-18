import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Globe, Plus, Send, ShieldAlert, Trash2, X } from 'lucide-react';
import { Panel, Field, Input, Select, Actions, Textarea, KeyValue, Hint } from './kit';
import { Alert, Badge, Button, EmptyState, Tabs } from '../components/ui';
import { cn, download, formatBytes, formatNumber } from '../lib/utils';
import { useToast } from '../lib/toast';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

const BODY_METHODS: Method[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

const TIMEOUT_MS = 20_000;

const MAX_DISPLAY_BYTES = 300_000;

interface HeaderRow {
  id: number;
  key: string;
  value: string;
}

interface ResponseState {
  status: number;
  statusText: string;
  duration: number;
  headers: [string, string][];
  body: string;
  bytes: number;
  truncated: boolean;
  url: string;
  method: Method;
}

function formatBody(raw: string, contentType: string): { body: string; truncated: boolean } {
  let body = raw;
  const looksJson = /json/i.test(contentType) || /^\s*[[{]/.test(raw);
  if (looksJson) {
    try {
      body = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      body = raw;
    }
  }
  if (body.length > MAX_DISPLAY_BYTES) {
    return { body: `${body.slice(0, MAX_DISPLAY_BYTES)}\n\n…（已截断，完整内容共 ${formatNumber(body.length)} 字符）`, truncated: true };
  }
  return { body, truncated: false };
}

export default function HttpClientTool() {
  const [method, setMethod] = useState<Method>('GET');
  const [url, setUrl] = useState('');
  const [rows, setRows] = useState<HeaderRow[]>([{ id: 1, key: 'Accept', value: 'application/json' }]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [tab, setTab] = useState<'body' | 'headers'>('body');
  const toast = useToast();

  const controllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const rowIdRef = useRef(2);

  const canSendBody = BODY_METHODS.includes(method);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const addRow = () => {
    setRows((previous) => [...previous, { id: rowIdRef.current++, key: '', value: '' }]);
  };

  const updateRow = (id: number, patch: Partial<Pick<HeaderRow, 'key' | 'value'>>) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: number) => {
    setRows((previous) => (previous.length > 1 ? previous.filter((row) => row.id !== id) : previous.map((row) => (row.id === id ? { ...row, key: '', value: '' } : row))));
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLoading(false);
    setError('请求已取消');
  };

  const handleSend = async () => {
    if (loading) return;
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('请输入请求地址，例如 https://example.com/api/items');
      return;
    }

    let target: URL;
    try {
      target = new URL(trimmedUrl);
    } catch {
      setError('URL 格式不正确，请包含协议头，例如 https://example.com/path');
      return;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      setError('只支持 http:// 或 https:// 协议');
      return;
    }
    if (target.origin === window.location.origin && /^\/api(\/|$)/.test(target.pathname)) {
      setError('出于安全考虑，不允许请求本站 /api 内部管理接口。请填写外部地址。');
      return;
    }

    let headers: Headers;
    try {
      headers = new Headers();
      for (const row of rows) {
        const key = row.key.trim();
        if (!key) continue;
        headers.set(key, row.value);
      }
    } catch (headerError) {
      setError(`请求头不合法：${headerError instanceof Error ? headerError.message : '请检查自定义请求头'}`);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    timeoutRef.current = window.setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
    setLoading(true);
    setResponse(null);
    const startedAt = performance.now();

    try {
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
        credentials: 'omit',
        mode: 'cors',
        redirect: 'follow',
        cache: 'no-store',
      };
      if (canSendBody && body.trim()) init.body = body;

      const res = await fetch(target.toString(), init);
      const raw = await res.text();
      const contentType = res.headers.get('content-type') ?? '';
      const formatted = formatBody(raw, contentType);
      const bytes = new TextEncoder().encode(raw).length;

      setResponse({
        status: res.status,
        statusText: res.statusText,
        duration: Math.round(performance.now() - startedAt),
        headers: Array.from(res.headers.entries()),
        body: formatted.body,
        bytes,
        truncated: formatted.truncated,
        url: res.url || target.toString(),
        method,
      });
      setTab('body');
    } catch (requestError) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        setError(reason === 'timeout' ? `请求超时（${TIMEOUT_MS / 1000} 秒），已自动取消` : '请求已取消');
      } else if (requestError instanceof TypeError) {
        setError(
          '请求未能完成。常见原因：目标服务器未开启 CORS 跨域许可、地址无法访问、证书错误，或浏览器拦截了混合内容（HTTPS 页面请求 HTTP 接口）。',
        );
      } else {
        setError(requestError instanceof Error ? requestError.message : '请求失败，请稍后重试');
      }
    } finally {
      controllerRef.current = null;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setLoading(false);
    }
  };

  const requestSummary = useMemo(() => {
    const active = rows.filter((row) => row.key.trim().length > 0);
    return [
      { label: '方法', value: method },
      { label: '请求头数量', value: active.length },
      { label: '请求体', value: canSendBody && body.trim() ? `${formatBytes(new TextEncoder().encode(body).length)}` : '无' },
    ];
  }, [rows, method, body, canSendBody]);

  const statusTone = response ? (response.status >= 400 ? 'danger' : response.status >= 300 ? 'warning' : 'success') : 'default';

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
        className="space-y-4"
      >
        <Panel title="请求配置" description="在浏览器中直接发送 HTTP 请求，响应只在本机显示，不会上传到本站。">
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field label="方法" htmlFor="hc-method">
              <Select id="hc-method" value={method} onChange={(event) => setMethod(event.target.value as Method)}>
                {METHODS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="请求地址" htmlFor="hc-url" hint="需要完整地址，包含 http:// 或 https://">
              <Input
                id="hc-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/api/items"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="label mb-0">自定义请求头</span>
              <Button variant="ghost" size="sm" icon={Plus} onClick={addRow}>
                添加一行
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    value={row.key}
                    onChange={(event) => updateRow(row.id, { key: event.target.value })}
                    placeholder="Header 名称"
                    className="min-w-0 flex-1 font-mono text-xs"
                    aria-label="请求头名称"
                  />
                  <Input
                    value={row.value}
                    onChange={(event) => updateRow(row.id, { value: event.target.value })}
                    placeholder="值"
                    className="min-w-0 flex-1 font-mono text-xs"
                    aria-label="请求头值"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeRow(row.id)}
                    aria-label="删除该请求头"
                    title="删除该请求头"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Field
            label="请求体"
            htmlFor="hc-body"
            className="mt-4"
            hint={canSendBody ? '通常为 JSON 或表单文本；留空则不发送 body。' : `${method} 请求不支持请求体，切换为 POST / PUT / PATCH / DELETE 后可编辑。`}
          >
            <Textarea
              id="hc-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={!canSendBody}
              spellCheck={false}
              placeholder={'{\n  "name": "lith",\n  "value": 42\n}'}
              className={cn('min-h-32 font-mono text-[13px] leading-6', !canSendBody && 'opacity-60')}
            />
          </Field>

          <Actions>
            <Button type="submit" icon={Send} loading={loading}>
              发送请求
            </Button>
            {loading ? (
              <Button variant="secondary" icon={X} onClick={handleCancel}>
                取消
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUrl('');
                setResponse(null);
                setError(null);
              }}
            >
              重置地址
            </Button>
          </Actions>
        </Panel>
      </form>

      <Alert tone="info" title="关于浏览器跨域（CORS）限制">
        浏览器会拦截跨域请求的响应，除非目标服务器返回 <code className="font-mono text-xs">Access-Control-Allow-Origin</code>。
        因此对任意站点发包时可能看到「Failed to fetch」，这是浏览器安全策略而非工具故障；此时响应头与状态码也无法读取。建议请求自己可控、已开启 CORS 的接口。
      </Alert>

      {error ? (
        <Alert tone="error" title="请求失败">
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </span>
        </Alert>
      ) : null}

      <Panel
        title="响应"
        description={
          response
            ? `${response.method} ${response.url}`
            : '发送请求后在这里查看状态码、耗时、响应头与响应体'
        }
      >
        {!response ? (
          loading ? (
            <div className="space-y-3 py-6 text-center">
              <div className="mx-auto size-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-400" />
              <p className="text-sm muted">正在等待响应…（最长 {TIMEOUT_MS / 1000} 秒）</p>
            </div>
          ) : (
            <EmptyState
              icon={Globe}
              title="还没有发送请求"
              description="填写上面的地址并点击「发送请求」，即可在本地查看状态码、耗时与响应内容。"
            />
          )
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone}>
                {response.status} {response.statusText}
              </Badge>
              <Badge>{response.duration} ms</Badge>
              <Badge>{formatBytes(response.bytes)}</Badge>
              <Badge>{response.headers.length} 个响应头</Badge>
              {response.truncated ? <Badge tone="warning">响应体过大，已截断显示</Badge> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {requestSummary.map((item) => (
                <KeyValue key={item.label} items={[{ label: item.label, value: item.value }]} />
              ))}
            </div>

            <Tabs
              items={[
                { value: 'body' as const, label: '响应体' },
                { value: 'headers' as const, label: '响应头', count: response.headers.length },
              ]}
              value={tab}
              onChange={setTab}
            />

            {tab === 'body' ? (
              <div className="space-y-3">
                {response.body ? (
                  <pre className="max-h-96 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6 whitespace-pre-wrap break-words">
                    {response.body}
                  </pre>
                ) : (
                  <Hint>响应体为空（例如 204 No Content 或 HEAD 请求）。</Hint>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!response.body}
                    onClick={() => {
                      download(response.body, 'response.txt');
                      toast.success('响应体已下载');
                    }}
                  >
                    下载响应体
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {response.headers.length > 0 ? (
                  <KeyValue items={response.headers.map(([key, value]) => ({ label: key, value: value || '—' }))} />
                ) : (
                  <Alert tone="warning" title="无法读取响应头">
                    响应头为空。多数情况下是目标服务器没有暴露 <code className="font-mono text-xs">Access-Control-Expose-Headers</code>，
                    或者这是一个不透明（opaque）的跨域响应。
                  </Alert>
                )}
              </div>
            )}

            <Hint>
              <ShieldAlert className="mr-1 inline size-3.5 align-[-2px]" />
              请求由你的浏览器直接发往目标服务器，本站不代理、不记录。请勿在请求体或请求头中填写密码、令牌等敏感信息到不可信的地址。
            </Hint>
          </div>
        )}
      </Panel>
    </div>
  );
}
