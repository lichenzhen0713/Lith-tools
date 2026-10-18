import { useCallback, useMemo, useRef, useState } from 'react';
import { Copy, Network, RefreshCw, Search } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel, Select } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Spinner } from '../components/ui';
import { errorMessage, http } from '../lib/api';
import { copyText } from '../lib/utils';
import { useToast } from '../lib/toast';

const DNS_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'] as const;
type DnsType = (typeof DNS_TYPES)[number];

const TYPE_LABEL: Record<DnsType, string> = {
  A: 'A（IPv4 地址）',
  AAAA: 'AAAA（IPv6 地址）',
  MX: 'MX（邮件交换）',
  TXT: 'TXT（文本记录）',
  NS: 'NS（名称服务器）',
  CNAME: 'CNAME（别名）',
};

const TYPE_COLUMN: Record<DnsType, string> = {
  A: 'IPv4 地址',
  AAAA: 'IPv6 地址',
  MX: '邮件服务器',
  TXT: '文本内容（多段自动拼接）',
  NS: '名称服务器',
  CNAME: '目标域名',
};

const SAMPLE_DOMAINS = ['example.com', 'google.com', 'cloudflare.com', 'github.com', 'baidu.com'];

interface DnsResponse {
  name: string;
  type: DnsType;
  records: unknown[];
  error?: string;
}

interface DnsRow {
  id: string;
  priority: number | null;
  value: string;
}

function isDnsType(value: string): value is DnsType {
  return (DNS_TYPES as readonly string[]).includes(value);
}

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '')
    .trim();
}

function isDomainLike(value: string): boolean {
  if (!value || value.length > 253) return false;
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) return false;
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) return false;
  return value.split('.').every((label) => label.length > 0 && label.length <= 63);
}

function toDnsResponse(raw: unknown): DnsResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name : '';
  const type = typeof source.type === 'string' ? source.type.toUpperCase() : '';
  const records = Array.isArray(source.records) ? source.records : [];
  const error = typeof source.error === 'string' && source.error ? source.error : undefined;
  if (!name || !isDnsType(type)) return null;
  return { name, type, records, error };
}

function normalizeRecords(records: unknown[], type: DnsType): DnsRow[] {
  const rows: DnsRow[] = records.map((record, index) => {
    if (type === 'MX') {
      if (record && typeof record === 'object' && !Array.isArray(record)) {
        const mx = record as Record<string, unknown>;
        const exchange = typeof mx.exchange === 'string' ? mx.exchange : '';
        const priority =
          typeof mx.priority === 'number' ? mx.priority : typeof mx.preference === 'number' ? mx.preference : null;
        return { id: `mx-${index}-${exchange}`, priority, value: exchange };
      }
      return { id: `mx-${index}`, priority: null, value: String(record ?? '') };
    }
    if (Array.isArray(record)) {
      // TXT records arrive as chunks that must be concatenated in order.
      return { id: `chunks-${index}`, priority: null, value: record.map((chunk) => String(chunk)).join('') };
    }
    if (record && typeof record === 'object') {
      return { id: `object-${index}`, priority: null, value: JSON.stringify(record) };
    }
    return { id: `record-${index}`, priority: null, value: String(record ?? '') };
  });

  const filled = rows.filter((row) => row.value.trim().length > 0);
  if (type === 'MX') filled.sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER));
  return filled;
}

/** DNS record lookup through the site's resolver proxy, with per-record and bulk copy. */
export default function DnsLookupTool() {
  const toast = useToast();
  const [domain, setDomain] = useState('');
  const [type, setType] = useState<DnsType>('A');
  const [response, setResponse] = useState<DnsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [lastQuery, setLastQuery] = useState<{ name: string; type: DnsType } | null>(null);
  const requestIdRef = useRef(0);

  const normalizedInput = normalizeDomain(domain);
  const domainError =
    touched && !normalizedInput
      ? '请输入要查询的域名，例如 example.com'
      : touched && !isDomainLike(normalizedInput)
        ? '域名格式不正确：只能包含字母、数字、连字符、下划线和点'
        : null;

  const rows = useMemo(() => (response ? normalizeRecords(response.records, response.type) : []), [response]);

  const bulkText = useMemo(
    () => rows.map((row) => (row.priority !== null ? `${row.priority}\t${row.value}` : row.value)).join('\n'),
    [rows],
  );

  const runQuery = useCallback(async (rawDomain: string, recordType: DnsType) => {
    const name = normalizeDomain(rawDomain);
    if (!isDomainLike(name)) {
      setTouched(true);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setResponse(null);
    setLastQuery({ name, type: recordType });

    try {
      const parsed = toDnsResponse(
        await http.get<unknown>(`/api/net/dns?name=${encodeURIComponent(name)}&type=${recordType}`),
      );
      if (requestId !== requestIdRef.current) return;
      if (!parsed) {
        setError('接口返回的数据格式异常，请稍后重试');
        return;
      }
      setResponse(parsed);
      setDomain(parsed.name);
      setType(parsed.type);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(requestError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const retry = () => {
    if (lastQuery) void runQuery(lastQuery.name, lastQuery.type);
    else void runQuery(domain, type);
  };

  return (
    <div className="space-y-4">
      <Panel
        title="DNS 记录查询"
        description="查询域名的 A / AAAA / MX / TXT / NS / CNAME 记录，结果由本站服务端解析。"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs subtle">示例域名：</span>
            {SAMPLE_DOMAINS.map((sample) => (
              <button
                key={sample}
                type="button"
                className="chip font-mono"
                onClick={() => {
                  setDomain(sample);
                  setTouched(false);
                  void runQuery(sample, type);
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
            void runQuery(domain, type);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_13rem] sm:items-start">
            <Field
              label="域名"
              htmlFor="dns-domain"
              error={domainError}
              hint="可粘贴完整网址，会自动提取域名；支持 _dmarc 等带下划线的主机名"
            >
              <Input
                id="dns-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="example.com"
                autoComplete="off"
                spellCheck={false}
                error={Boolean(domainError)}
              />
            </Field>

            <Field label="记录类型" htmlFor="dns-type">
              <Select
                id="dns-type"
                value={type}
                onChange={(event) => {
                  const next = event.target.value as DnsType;
                  setType(next);
                  if (lastQuery) void runQuery(lastQuery.name, next);
                }}
              >
                {DNS_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {TYPE_LABEL[item]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Actions className="mt-1">
            <Button type="submit" icon={Search} loading={loading}>
              查询记录
            </Button>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={retry}
              disabled={loading || (!lastQuery && !domain.trim())}
            >
              重新查询
            </Button>
          </Actions>
        </form>
      </Panel>

      <Panel
        title="查询结果"
        description={
          loading
            ? '正在解析域名…'
            : response
              ? `${response.name} · ${response.type} 记录${rows.length > 0 ? ` · 共 ${rows.length} 条` : ''}`
              : '输入域名与记录类型后点击「查询记录」'
        }
        footer={
          rows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={bulkText} label="复制全部记录" />
              <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={retry}>
                重新查询
              </Button>
              <span className="ml-auto text-xs subtle">MX 记录按优先级从低到高排列</span>
            </div>
          ) : null
        }
      >
        {loading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3">
            <Spinner />
            <p className="text-sm subtle">正在向本站接口查询 DNS 记录…</p>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <Alert tone="error" title="查询失败">
              {error}
            </Alert>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={retry}>
              重试
            </Button>
          </div>
        ) : response ? (
          response.error ? (
            <div className="space-y-3">
              <Alert tone="warning" title="未查询到记录">
                <p>{response.error}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-90">
                  <li>确认域名拼写正确，且没有多余的空格或路径。</li>
                  <li>该域名可能确实没有此类型的记录，可切换到 A / AAAA / MX 再试。</li>
                  <li>部分记录（如 CNAME 与 A）不能同时存在，这是 DNS 规范限制。</li>
                </ul>
              </Alert>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={retry}>
                重新查询
              </Button>
            </div>
          ) : rows.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{response.type}</Badge>
                <Badge>{rows.length} 条记录</Badge>
                <Badge>{response.name}</Badge>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <table className="table min-w-[32rem]">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      {response.type === 'MX' ? <th className="w-20">优先级</th> : null}
                      <th>{TYPE_COLUMN[response.type]}</th>
                      <th className="w-16 text-right">复制</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.id}>
                        <td className="text-xs tabular-nums subtle">{index + 1}</td>
                        {response.type === 'MX' ? (
                          <td className="font-mono text-xs tabular-nums">{row.priority ?? '—'}</td>
                        ) : null}
                        <td className="font-mono text-xs leading-6 break-all whitespace-pre-wrap">{row.value}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                            title="复制该记录"
                            aria-label={`复制第 ${index + 1} 条记录`}
                            onClick={async () => {
                              const ok = await copyText(row.value);
                              if (ok) toast.success('已复制该条记录');
                              else toast.error('复制失败，请手动选择文本');
                            }}
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Hint>
                TXT 记录的多个文本片段已按顺序拼接；MX 的优先级数字越小优先级越高，填 0 表示最高优先级。
              </Hint>
            </div>
          ) : (
            <EmptyState
              icon={Network}
              title="没有返回任何记录"
              description="该域名存在，但没有找到所选类型的记录。可以换一个记录类型再查询。"
            />
          )
        ) : (
          <EmptyState
            icon={Network}
            title="还没有查询结果"
            description="输入域名、选择记录类型后点击「查询记录」，或直接点击上方示例域名快速体验。"
          />
        )}
      </Panel>

      <Panel title="记录类型说明">
        <div className="grid gap-3 sm:grid-cols-2">
          {DNS_TYPES.map((item) => (
            <div key={item} className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge tone="brand">{item}</Badge>
                <span className="text-sm font-medium">{TYPE_LABEL[item].replace(/（.*）/, '')}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed subtle">
                {item === 'A'
                  ? '把域名解析到 IPv4 地址，一个域名可以有多条 A 记录。'
                  : item === 'AAAA'
                    ? '把域名解析到 IPv6 地址，常用于 IPv6 网络接入。'
                    : item === 'MX'
                      ? '指定接收该域名邮件的服务器，数值越小优先级越高。'
                      : item === 'TXT'
                        ? '存放任意文本，常用于 SPF、DKIM、DMARC 等域名验证。'
                        : item === 'NS'
                          ? '把域名委派给哪些权威名称服务器。'
                          : '把一个域名指向另一个域名，解析时会继续追踪目标。'}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Hint>查询结果在本站服务端缓存约 60 秒；修改 DNS 后可能需要等待 TTL 到期才能看到变化。</Hint>
        </div>
      </Panel>
    </div>
  );
}
