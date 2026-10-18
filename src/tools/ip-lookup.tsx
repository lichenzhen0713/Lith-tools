import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, RefreshCw, Search } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Result, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Spinner } from '../components/ui';
import { errorMessage, http } from '../lib/api';

interface IpInfo {
  ip: string;
  local: boolean;
  city: string;
  region: string;
  country: string;
  org: string;
  timezone: string;
  loc: string;
}

const SAMPLE_IPS: { ip: string; label: string }[] = [
  { ip: '8.8.8.8', label: 'Google Public DNS' },
  { ip: '1.1.1.1', label: 'Cloudflare DNS' },
  { ip: '9.9.9.9', label: 'Quad9 DNS' },
  { ip: '114.114.114.114', label: '114 DNS' },
  { ip: '223.5.5.5', label: '阿里 AliDNS' },
];

const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/** Loose client-side check: the server is the authority, this only catches obvious typos early. */
function isIpLike(value: string): boolean {
  if (IPV4_PATTERN.test(value)) return true;
  if (!value.includes(':') || value.length > 45) return false;
  return /^[0-9a-fA-F:]+$/.test(value) && (value.match(/:/g)?.length ?? 0) >= 2;
}

function toIpInfo(raw: unknown): IpInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const ip = source.ip;
  if (typeof ip !== 'string' || !ip) return null;
  const text = (key: string): string => (typeof source[key] === 'string' ? (source[key] as string) : '');
  return {
    ip,
    local: source.local === true,
    city: text('city'),
    region: text('region'),
    country: text('country'),
    org: text('org'),
    timezone: text('timezone'),
    loc: text('loc'),
  };
}

function orDash(value: string): string {
  return value.trim() ? value : '—';
}

function formatLocation(loc: string): string {
  const parts = loc
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 2 ? `${parts[0]}，${parts[1]}` : '—';
}

/** IP geolocation lookup through the site's own proxy (no third-party requests from the browser). */
export default function IpLookupTool() {
  const [input, setInput] = useState('');
  const [info, setInfo] = useState<IpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const requestIdRef = useRef(0);
  const initialisedRef = useRef(false);

  const trimmed = input.trim();
  const inputError =
    touched && trimmed && !isIpLike(trimmed) ? '请输入合法的 IPv4 或 IPv6 地址；留空则查询本机 IP' : null;

  const lookup = useCallback(async (raw: string) => {
    const target = raw.trim();
    if (target && !isIpLike(target)) {
      setTouched(true);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setInfo(null);
    setLastQuery(target);

    try {
      const path = target ? `/api/net/ip?ip=${encodeURIComponent(target)}` : '/api/net/ip';
      const parsed = toIpInfo(await http.get<unknown>(path));
      if (requestId !== requestIdRef.current) return;
      if (!parsed) {
        setError('接口返回的数据格式异常，请稍后重试');
        return;
      }
      setInfo(parsed);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(requestError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  // Query the visitor's own IP once on mount; the ref keeps StrictMode from firing twice.
  useEffect(() => {
    if (initialisedRef.current) return;
    initialisedRef.current = true;
    void lookup('');
  }, [lookup]);

  const summary = useMemo(() => {
    if (!info) return '';
    return [
      `IP 地址：${info.ip}`,
      `城市：${orDash(info.city)}`,
      `地区：${orDash(info.region)}`,
      `国家/地区：${orDash(info.country)}`,
      `组织/运营商：${orDash(info.org)}`,
      `时区：${orDash(info.timezone)}`,
      `经纬度：${formatLocation(info.loc)}`,
    ].join('\n');
  }, [info]);

  return (
    <div className="space-y-4">
      <Panel
        title="IP 地址查询"
        description="输入 IPv4 / IPv6 地址查询归属地；留空则查询你当前的出口 IP。"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs subtle">常用示例：</span>
            {SAMPLE_IPS.map((sample) => (
              <button
                key={sample.ip}
                type="button"
                className="chip font-mono"
                title={sample.label}
                onClick={() => {
                  setInput(sample.ip);
                  setTouched(false);
                  void lookup(sample.ip);
                }}
              >
                {sample.ip}
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
            void lookup(input);
          }}
        >
          <Field
            label="IP 地址"
            htmlFor="ip-lookup-input"
            error={inputError}
            hint="支持 IPv4 与 IPv6，例如 8.8.8.8 或 2001:4860:4860::8888"
          >
            <Input
              id="ip-lookup-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="留空查询本机 IP"
              autoComplete="off"
              spellCheck={false}
              error={Boolean(inputError)}
            />
          </Field>

          <Actions className="mt-1">
            <Button type="submit" icon={Search} loading={loading}>
              查询
            </Button>
            <Button
              variant="secondary"
              icon={Globe}
              onClick={() => {
                setInput('');
                setTouched(false);
                void lookup('');
              }}
              disabled={loading}
            >
              查询本机 IP
            </Button>
            {info ? (
              <Button
                variant="ghost"
                icon={RefreshCw}
                onClick={() => void lookup(lastQuery)}
                disabled={loading}
              >
                重新查询
              </Button>
            ) : null}
          </Actions>
        </form>
      </Panel>

      <ToolSplit>
        <Panel
          title="查询结果"
          description={
            loading
              ? '正在查询归属地…'
              : info
                ? info.local
                  ? '该地址属于内网或保留地址'
                  : '地理位置为运营商出口的近似位置'
                : '查询后在这里查看 IP 归属地信息'
          }
          footer={
            info ? (
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={summary} label="复制结果" />
                <span className="text-xs subtle">已复制内容包含全部字段</span>
              </div>
            ) : null
          }
        >
          {loading ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3">
              <Spinner />
              <p className="text-sm subtle">正在向本站接口查询，请稍候…</p>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <Alert tone="error" title="查询失败">
                {error}
              </Alert>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void lookup(lastQuery)}>
                重试
              </Button>
            </div>
          ) : info ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={info.local ? 'warning' : 'brand'}>{info.local ? '内网 / 本地地址' : '公网地址'}</Badge>
                {info.country ? <Badge>{info.country}</Badge> : null}
                {info.timezone ? <Badge>{info.timezone}</Badge> : null}
              </div>

              {info.local ? (
                <Alert tone="info" title="内网地址不做地理定位">
                  该地址属于内网或保留地址（例如 10.x、192.168.x、127.x），仅返回地址本身，不会向外部服务查询位置。
                </Alert>
              ) : null}

              <Result label="IP 地址" value={info.ip} mono />

              <KeyValue
                items={[
                  { label: '城市', value: orDash(info.city) },
                  { label: '地区', value: orDash(info.region) },
                  { label: '国家 / 地区', value: orDash(info.country) },
                  { label: '组织 / 运营商', value: orDash(info.org) },
                  { label: '时区', value: orDash(info.timezone) },
                  { label: '经纬度', value: formatLocation(info.loc) },
                ]}
              />

              <Hint>经纬度来自 IP 数据库的估算位置，通常精确到城市级别，不能用于定位具体地址。</Hint>
            </div>
          ) : (
            <EmptyState
              icon={Globe}
              title="还没有查询结果"
              description="在上方输入 IP 地址并点击「查询」，或直接留空查询本机出口 IP。"
              action={
                <Button variant="secondary" size="sm" onClick={() => void lookup('')}>
                  查询本机 IP
                </Button>
              }
            />
          )}
        </Panel>

        <Panel title="关于 IP 归属地">
          <ul className="list-disc space-y-2 pl-5 text-sm muted">
            <li>查询由本站服务端代理完成，浏览器不会直接请求第三方接口，也不会暴露你的真实网络环境。</li>
            <li>留空查询时，服务端根据请求来源判断你的出口 IP；如果你使用了代理或 CDN，结果可能是节点地址。</li>
            <li>归属地数据来自公开 IP 库（ipinfo.io），仅供网络排查与参考，不作为法律或商业依据。</li>
            <li>内网、保留与回环地址只返回地址本身，不查询地理位置。</li>
          </ul>
          <div className="mt-4 rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
            <p className="text-sm font-medium">示例字段</p>
            <p className="mt-1 font-mono text-xs leading-6 break-all subtle">
              8.8.8.8 · Mountain View · California · US · Google LLC · America/Los_Angeles · 37.40,-122.07
            </p>
          </div>
          <div className="mt-4">
            <Hint>仅支持 IPv4 / IPv6 字面地址，不支持域名或 CIDR 网段；需要解析域名请使用「DNS 查询」。</Hint>
          </div>
        </Panel>
      </ToolSplit>
    </div>
  );
}
