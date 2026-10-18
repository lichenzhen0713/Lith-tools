import { useMemo, useState } from 'react';
import { ArrowLeftRight, Banknote, RefreshCw } from 'lucide-react';
import { Field, Hint, Input, KeyValue, Panel, Result, Select, ToolSplit } from './kit';
import { Alert, Button, EmptyState, Spinner } from '../components/ui';
import { http } from '../lib/api';
import { useApi } from '../lib/hooks';
import { formatDate, relativeTime } from '../lib/utils';

interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
}

const CURRENCIES: { code: string; name: string }[] = [
  { code: 'CNY', name: '人民币' },
  { code: 'USD', name: '美元' },
  { code: 'EUR', name: '欧元' },
  { code: 'JPY', name: '日元' },
  { code: 'GBP', name: '英镑' },
  { code: 'HKD', name: '港币' },
  { code: 'KRW', name: '韩元' },
  { code: 'AUD', name: '澳大利亚元' },
  { code: 'CAD', name: '加拿大元' },
  { code: 'CHF', name: '瑞士法郎' },
  { code: 'SGD', name: '新加坡元' },
  { code: 'TWD', name: '新台币' },
  { code: 'MOP', name: '澳门元' },
  { code: 'THB', name: '泰铢' },
  { code: 'MYR', name: '马来西亚林吉特' },
  { code: 'PHP', name: '菲律宾比索' },
  { code: 'RUB', name: '俄罗斯卢布' },
  { code: 'SEK', name: '瑞典克朗' },
  { code: 'NOK', name: '挪威克朗' },
  { code: 'DKK', name: '丹麦克朗' },
  { code: 'NZD', name: '新西兰元' },
  { code: 'INR', name: '印度卢比' },
  { code: 'AED', name: '阿联酋迪拉姆' },
  { code: 'VND', name: '越南盾' },
];

const POPULAR = ['CNY', 'EUR', 'JPY', 'GBP', 'HKD', 'KRW', 'AUD', 'CAD'];
const AMOUNT_PRESETS = [100, 1000, 10000, 100000];

function parseNumberText(text: string): number | null {
  const cleaned = text.trim().replace(/[,，\s]/g, '');
  if (!cleaned) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function currencyName(code: string): string {
  return CURRENCIES.find((item) => item.code === code)?.name ?? code;
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs > 0 && abs < 1e-6) return value.toExponential(4);
  const fractionDigits = abs > 0 && abs < 1 ? 6 : 2;
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export default function CurrencyConverterTool() {
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('CNY');

  const { data, error, loading, reload } = useApi<RatesResponse>(
    () => http.get<RatesResponse>('/api/net/rates?base=USD'),
    [],
  );

  const parsed = parseNumberText(amount);
  const numeric = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
  const fieldError =
    parsed !== null && Number.isNaN(parsed)
      ? '请输入有效金额，例如 100 或 99.5'
      : numeric !== null && numeric < 0
        ? '金额不能为负数'
        : null;

  const rate = useMemo(() => {
    if (!data) return null;
    const fromRate = data.rates[from];
    const toRate = data.rates[to];
    if (!fromRate || !toRate) return null;
    return toRate / fromRate;
  }, [data, from, to]);

  const converted = numeric !== null && fieldError === null && rate !== null ? numeric * rate : null;
  const displayValue = converted !== null && Number.isFinite(converted) ? converted : null;

  const reference = useMemo(() => {
    if (!data) return [];
    const fromRate = data.rates[from];
    if (!fromRate) return [];
    return POPULAR.filter((code) => code !== from && data.rates[code]).map((code) => ({
      code,
      value: data.rates[code] / fromRate,
    }));
  }, [data, from]);

  const missingCurrency = Boolean(data) && (!data?.rates[from] || !data?.rates[to]);
  const updatedLabel = data?.updatedAt ? formatDate(data.updatedAt, 'datetime') : '—';

  return (
    <div className="space-y-4">
      <Panel title="货币转换" description="使用本站汇率代理查询，支持人民币、美元、欧元、日元等常用货币。">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <Field label="从" htmlFor="currency-from">
              <Select id="currency-from" value={from} onChange={(event) => setFrom(event.target.value)}>
                {CURRENCIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}（{item.code}）
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-center sm:pb-1">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
                aria-label="交换货币"
                title="交换货币"
              >
                <ArrowLeftRight className="size-4" />
              </Button>
            </div>
            <Field label="到" htmlFor="currency-to">
              <Select id="currency-to" value={to} onChange={(event) => setTo(event.target.value)}>
                {CURRENCIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}（{item.code}）
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="金额" htmlFor="currency-amount" error={fieldError}>
              <Input
                id="currency-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="例如 100"
                className="tabular-nums"
                autoComplete="off"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2 sm:pb-2.5">
              <span className="text-xs subtle">快捷金额</span>
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="chip px-2.5 py-1 tabular-nums"
                  onClick={() => setAmount(String(preset))}
                >
                  {preset.toLocaleString('zh-CN')}
                </button>
              ))}
            </div>
          </div>
        </form>
      </Panel>

      <ToolSplit>
        <Panel title="兑换结果" description={`${currencyName(from)}（${from}） → ${currencyName(to)}（${to}）`}>
          {loading && !data ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3">
              <Spinner />
              <p className="text-sm subtle">正在获取汇率…</p>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <Alert tone="error" title="汇率加载失败">
                {error}
              </Alert>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={reload}>
                重试
              </Button>
            </div>
          ) : missingCurrency ? (
            <Alert tone="warning" title="暂无该货币汇率">
              汇率表中缺少 {from} 或 {to} 的数据，请更换货币后重试。
            </Alert>
          ) : amount.trim() === '' ? (
            <EmptyState
              icon={Banknote}
              title="等待输入金额"
              description="输入金额后自动按最新汇率换算，可随时交换货币。"
            />
          ) : fieldError ? (
            <Alert tone="error" title="无法换算">
              {fieldError}
            </Alert>
          ) : displayValue !== null && rate !== null ? (
            <div className="space-y-3">
              <Result
                label={`${formatMoney(numeric ?? 0)} ${from} ≈`}
                value={`${formatMoney(displayValue)} ${to}`}
                mono
                hint={`1 ${from} = ${formatMoney(rate)} ${to}`}
              />
              <KeyValue
                items={[
                  { label: '当前汇率', value: `1 ${from} = ${rate.toPrecision(8)} ${to}` },
                  { label: '反向汇率', value: `1 ${to} = ${(1 / rate).toPrecision(8)} ${from}` },
                  { label: '汇率更新时间', value: updatedLabel },
                  { label: '数据来源', value: 'open.er-api.com（本站代理，缓存约 1 小时）' },
                ]}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={reload}>
                  刷新汇率
                </Button>
                <span className="text-xs subtle">
                  {data?.updatedAt ? `更新于 ${relativeTime(data.updatedAt)}` : '服务未提供更新时间'}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState icon={Banknote} title="暂无结果" description="请检查金额与货币设置。" />
          )}
        </Panel>

        <Panel title="参考汇率" description={`以 1 ${from} 为基准的常用货币兑换值。`}>
          {error ? (
            <Alert tone="error" title="暂无汇率数据">
              无法获取汇率，请点击上方「重试」。
            </Alert>
          ) : loading && !data ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : reference.length > 0 ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {reference.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setTo(item.code)}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-[var(--hover-bg)] px-3 py-2.5 text-left transition-colors hover:border-indigo-300 dark:hover:border-indigo-500/40"
                    title={`设为${currencyName(item.code)}`}
                  >
                    <span className="min-w-0 truncate text-sm">
                      {currencyName(item.code)}
                      <span className="ml-1.5 text-xs subtle">{item.code}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {formatMoney(item.value)}
                    </span>
                  </button>
                ))}
              </div>
              <Hint>
                汇率由第三方汇率服务经本站接口获取，约每小时更新一次，仅供参考，不构成交易或投资建议。
              </Hint>
              <div className="text-xs subtle">
                基准货币：USD · 数据更新时间：{updatedLabel}
              </div>
            </div>
          ) : (
            <EmptyState icon={Banknote} title="暂时没有参考汇率" description="稍后重试或更换货币。" />
          )}
        </Panel>
      </ToolSplit>

      <div className="text-xs subtle">
        当前汇率表：
        {data ? `${Object.keys(data.rates).length} 种货币` : '未加载'} · 所有计算在浏览器本地完成，仅向本站接口请求汇率数据。
      </div>
    </div>
  );
}
