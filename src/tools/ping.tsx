import { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Play, RefreshCw, Wifi, XCircle } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Select } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Spinner } from '../components/ui';
import { errorMessage, http } from '../lib/api';
import { useToast } from '../lib/toast';

const PORTS = [80, 443, 8080, 8443] as const;
type Port = (typeof PORTS)[number];

const PORT_LABEL: Record<Port, string> = {
  80: '80（HTTP）',
  443: '443（HTTPS）',
  8080: '8080（HTTP 备用）',
  8443: '8443（HTTPS 备用）',
};

const SAMPLE_HOSTS = ['example.com', 'github.com', 'cloudflare.com', 'www.baidu.com'];

const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;

interface PingAttempt {
  success: boolean;
  latency: number | null;
  error: string;
}

interface PingResponse {
  host: string;
  address: string;
  port: number;
  attempts: PingAttempt[];
  error?: string;
}

type BadgeTone = 'default' | 'brand' | 'success' | 'warning' | 'danger';

/** Accepts bare hosts as well as pasted URLs, returning the hostname only. */
function normalizeHost(raw: string): string {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.split('/')[0] ?? '';
  value = value.replace(/^[^@]*@/, '');
  value = value.replace(/:\d+$/, '');
  value = value.replace(/\.+$/, '');
  return value;
}

function isHostLike(value: string): boolean {
  if (!value || value.length > 253) return false;
  if (!HOST_PATTERN.test(value)) return false;
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) return false;
  return value
    .split('.')
    .every((label) => label.length > 0 && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'));
}

/** Mirror of the server-side guard so users get an instant, friendly message. */
function isPrivateHost(value: string): boolean {
  const host = value.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
  if (host.includes(':') && /^(?:fc|fd|fe80)/.test(host)) return true;
  return false;
}

function toPingResponse(raw: unknown, fallbackHost: string, fallbackPort: number): PingResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const host = typeof source.host === 'string' && source.host ? source.host : fallbackHost;
  const address = typeof source.address === 'string' ? source.address : '';
  const port = typeof source.port === 'number' ? source.port : fallbackPort;
  const error = typeof source.error === 'string' && source.error ? source.error : undefined;
  const rawAttempts = Array.isArray(source.attempts) ? source.attempts : [];

  const attempts: PingAttempt[] = rawAttempts.map((item) => {
    if (!item || typeof item !== 'object') return { success: false, latency: null, error: '未知结果' };
    const record = item as Record<string, unknown>;
    const latency =
      typeof record.latency === 'number' && Number.isFinite(record.latency) ? Math.round(record.latency) : null;
    return {
      success: record.success === true,
      latency,
      error: typeof record.error === 'string' ? record.error : '',
    };
  });

  return { host, address, port, attempts, error };
}

function latencyQuality(ms: number | null): { label: string; tone: BadgeTone } {
  if (ms === null) return { label: '无数据', tone: 'default' };
  if (ms < 50) return { label: '延迟优秀', tone: 'success' };
  if (ms < 150) return { label: '延迟良好', tone: 'success' };
  if (ms < 400) return { label: '延迟一般', tone: 'warning' };
  return { label: '延迟较高', tone: 'danger' };
}

/** TCP reachability probe (3 handshakes) through the server-side endpoint. */
export default function PingTool() {
  const toast = useToast();
  const [hostInput, setHostInput] = useState('');
  const [port, setPort] = useState<Port>(443);
  const [result, setResult] = useState<PingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const requestIdRef = useRef(0);

  const host = normalizeHost(hostInput);
  const hostError = !touched
    ? null
    : !host
      ? '请输入要探测的主机名或 IPv4 地址'
      : !isHostLike(host)
        ? '主机格式不正确：只能包含字母、数字、点和连字符'
        : isPrivateHost(host)
          ? '出于安全原因，不能探测内网或保留地址'
          : null;

  const probes = useCallback(async (rawHost: string, targetPort: Port) => {
    const target = normalizeHost(rawHost);
    if (!target || !isHostLike(target) || isPrivateHost(target)) {
      setTouched(true);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const parsed = toPingResponse(
        await http.post<unknown>('/api/net/ping', { host: target, port: targetPort }),
        target,
        targetPort,
      );
      if (requestId !== requestIdRef.current) return;
      if (!parsed) {
        setError('接口返回的数据格式异常，请稍后重试');
        return;
      }
      setResult(parsed);

      const succeeded = parsed.attempts.filter((attempt) => attempt.success).length;
      if (parsed.error) toast.error(parsed.error);
      else if (succeeded > 0) toast.success(`探测完成：${succeeded}/${parsed.attempts.length} 次连接成功`);
      else toast.error('三次 TCP 连接均失败，目标端口可能未开放');
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(requestError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [toast]);

  const stats = useMemo(() => {
    if (!result) return null;
    const latencies = result.attempts
      .map((attempt) => attempt.latency)
      .filter((value): value is number => typeof value === 'number');
    const successCount = result.attempts.filter((attempt) => attempt.success).length;
    return {
      successCount,
      total: result.attempts.length,
      avg: latencies.length > 0 ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
      min: latencies.length > 0 ? Math.min(...latencies) : null,
      max: latencies.length > 0 ? Math.max(...latencies) : null,
    };
  }, [result]);

  const quality = latencyQuality(stats?.avg ?? null);
  const reachable = stats !== null && stats.total > 0 && stats.successCount > 0;

  const summary = useMemo(() => {
    if (!result || !stats) return '';
    const lines = [
      `目标：${result.host}:${result.port}`,
      `解析地址：${result.address || '—'}`,
      ...result.attempts.map(
        (attempt, index) =>
          `第 ${index + 1} 次：${attempt.success ? `${attempt.latency ?? '—'} ms` : `失败（${attempt.error || '连接失败'}）`}`,
      ),
      `成功次数：${stats.successCount}/${stats.total}`,
      `平均 / 最小 / 最大：${stats.avg ?? '—'} / ${stats.min ?? '—'} / ${stats.max ?? '—'} ms`,
    ];
    if (result.error) lines.push(`错误：${result.error}`);
    return lines.join('\n');
  }, [result, stats]);

  return (
    <div className="space-y-4">
      <Panel
        title="TCP 连通性探测"
        description="从本站服务器向目标端口发起 3 次 TCP 连接，测量握手耗时，判断目标是否可达。"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs subtle">示例主机：</span>
            {SAMPLE_HOSTS.map((sample) => (
              <button
                key={sample}
                type="button"
                className="chip font-mono"
                onClick={() => {
                  setHostInput(sample);
                  setTouched(false);
                  void probes(sample, port);
                }}
              >
                {sample}
              </button>
            ))}
          </div>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            void probes(hostInput, port);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_13rem] sm:items-start">
            <Field
              label="主机"
              htmlFor="ping-host"
              error={hostError}
              hint="支持域名或 IPv4 地址，也可以直接粘贴网址，会自动提取主机名"
            >
              <Input
                id="ping-host"
                value={hostInput}
                onChange={(event) => setHostInput(event.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="example.com"
                autoComplete="off"
                spellCheck={false}
                error={Boolean(hostError)}
              />
            </Field>

            <Field label="端口" htmlFor="ping-port" hint="仅支持以下常用端口">
              <Select
                id="ping-port"
                value={String(port)}
                onChange={(event) => setPort(Number(event.target.value) as Port)}
              >
                {PORTS.map((item) => (
                  <option key={item} value={item}>
                    {PORT_LABEL[item]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Actions className="mt-1">
            <Button type="submit" icon={Play} loading={loading}>
              开始探测
            </Button>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => void probes(hostInput, port)}
              disabled={loading || !hostInput.trim()}
            >
              重新探测
            </Button>
          </Actions>
        </form>
      </Panel>

      <Alert tone="warning" title="禁止探测内网地址">
        为保护内网安全，本工具不允许探测内网、回环与保留地址，例如 127.0.0.1、10.x.x.x、192.168.x.x、172.16–31.x.x、localhost 与
        *.local。服务端会校验目标解析结果并直接拒绝此类请求。
      </Alert>

      <Alert tone="info" title="这是 TCP 探测，不是 ICMP Ping">
        服务器会对指定端口发起 3 次 TCP 握手并测量耗时，因此端口未开放时会显示失败，即使主机本身在线。结果不能用于统计丢包率，也仅支持 80 /
        443 / 8080 / 8443 端口。
      </Alert>

      <Panel
        title="探测结果"
        description={
          loading
            ? '正在建立 TCP 连接（共 3 次，最长约 12 秒）…'
            : result
              ? `${result.host}:${result.port}${result.address ? ` · ${result.address}` : ''}`
              : '探测完成后在这里查看每次延迟与统计'
        }
        footer={
          result ? (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={summary} label="复制结果" />
              <span className="text-xs subtle">结果为 3 次 TCP 握手耗时，受网络与服务器负载影响</span>
            </div>
          ) : null
        }
      >
        {loading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3">
            <Spinner />
            <p className="text-sm subtle">正在向目标端口发起 TCP 连接，请稍候…</p>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <Alert tone="error" title="探测失败">
              {error}
            </Alert>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void probes(hostInput, port)}>
              重试
            </Button>
          </div>
        ) : result ? (
          result.error ? (
            <Alert tone="warning" title="无法完成探测">
              <p>{result.error}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-90">
                <li>确认主机名拼写正确，并且该域名可以解析到公网地址。</li>
                <li>内网地址会被安全策略拒绝，请改用公网域名。</li>
                <li>稍后重试，或换一个端口（如 443 / 80）再试。</li>
              </ul>
            </Alert>
          ) : stats ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={reachable ? 'success' : 'danger'}>
                  {reachable ? (stats.successCount === stats.total ? '全部成功' : '部分成功') : '不可达'}
                </Badge>
                <Badge tone={quality.tone}>{quality.label}</Badge>
                <Badge>{result.port} 端口</Badge>
                {result.address ? <Badge>解析到 {result.address}</Badge> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: '平均延迟', value: stats.avg },
                  { label: '最小延迟', value: stats.min },
                  { label: '最大延迟', value: stats.max },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                    <p className="text-xs subtle">{item.label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {item.value !== null ? `${item.value} ms` : '—'}
                    </p>
                  </div>
                ))}
              </div>

              <ul className="space-y-2">
                {result.attempts.map((attempt, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      {attempt.success ? (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      ) : (
                        <XCircle className="size-4 text-rose-500" />
                      )}
                      第 {index + 1} 次
                    </span>
                    <span
                      className={
                        attempt.success
                          ? 'font-mono text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400'
                          : 'text-sm text-rose-500'
                      }
                    >
                      {attempt.success ? `${attempt.latency ?? '—'} ms` : attempt.error || '连接失败'}
                    </span>
                  </li>
                ))}
              </ul>

              {!reachable ? (
                <Alert tone="warning" title="三次连接均失败">
                  目标端口可能未开放、被防火墙拦截，或服务端无法访问该地址。注意：这并不代表主机离线，ICMP 可达性请使用系统 ping 命令验证。
                </Alert>
              ) : null}

              <KeyValue
                items={[
                  { label: '目标主机', value: result.host },
                  { label: '解析地址', value: result.address || '—' },
                  { label: '探测端口', value: String(result.port) },
                  {
                    label: '成功次数',
                    value: `${stats.successCount} / ${stats.total}`,
                  },
                ]}
              />

              <Hint>
                延迟为服务器到目标 TCP 握手的往返耗时，通常在 20–200 ms 之间；超过 400 ms 可能是链路较远或目标负载较高。
              </Hint>
            </div>
          ) : (
            <EmptyState icon={Wifi} title="暂无统计结果" description="探测返回的数据不完整，请重新探测。" />
          )
        ) : (
          <EmptyState
            icon={Wifi}
            title="还没有探测结果"
            description="填写主机与端口后点击「开始探测」，或点击上方示例主机快速体验。"
            action={
              <Button variant="secondary" size="sm" icon={Play} onClick={() => void probes('example.com', 443)}>
                探测 example.com:443
              </Button>
            }
          />
        )}
      </Panel>
    </div>
  );
}
