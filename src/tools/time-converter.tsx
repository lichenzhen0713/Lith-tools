import { useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarClock, Clock, RotateCcw } from 'lucide-react';
import { CopyButton, Field, Hint, Input, KeyValue, Panel, Result, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState } from '../components/ui';
import { useInterval } from '../lib/hooks';

const UNITS = [
  { key: 'ms', label: '毫秒', short: 'ms', ms: 1 },
  { key: 's', label: '秒', short: 's', ms: 1_000 },
  { key: 'min', label: '分钟', short: 'min', ms: 60_000 },
  { key: 'h', label: '小时', short: 'h', ms: 3_600_000 },
  { key: 'd', label: '天', short: 'd', ms: 86_400_000 },
  { key: 'w', label: '周', short: 'w', ms: 604_800_000 },
] as const;

type UnitKey = (typeof UNITS)[number]['key'];
type TimestampUnit = 'auto' | 's' | 'ms';

const MAX_DATE_MS = 8.64e15;
const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 });

const EXAMPLES: { label: string; amount: string; unit: UnitKey }[] = [
  { label: '90 分钟', amount: '90', unit: 'min' },
  { label: '3600 秒', amount: '3600', unit: 's' },
  { label: '1.5 天', amount: '1.5', unit: 'd' },
  { label: '2 周', amount: '2', unit: 'w' },
  { label: '86400000 毫秒', amount: '86400000', unit: 'ms' },
];

function unitMetaOf(key: UnitKey): { label: string; short: string; ms: number } {
  return UNITS.find((unit) => unit.key === key) ?? UNITS[0];
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && abs < 0.000001) return value.toExponential(4);
  return numberFormatter.format(value);
}

function humanize(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms === 0) return '0 秒';
  const negative = ms < 0;
  let rest = Math.round(Math.abs(ms));
  const parts: string[] = [];

  const weeks = Math.floor(rest / 604_800_000);
  rest -= weeks * 604_800_000;
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1_000);
  rest -= seconds * 1_000;
  const millis = rest;

  if (weeks) parts.push(`${weeks} 周`);
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (minutes) parts.push(`${minutes} 分钟`);
  if (seconds) parts.push(`${seconds} 秒`);
  if (millis) parts.push(`${millis} 毫秒`);

  return `${negative ? '-' : ''}${parts.join(' ') || '0 秒'}`;
}

function timestampToMs(value: number, unit: TimestampUnit): number {
  if (unit === 'ms') return value;
  if (unit === 's') return value * 1_000;
  return Math.abs(value) >= 1e11 ? value : value * 1_000;
}

function timestampUnitLabel(value: number, unit: TimestampUnit): string {
  if (unit === 'ms') return '毫秒级时间戳';
  if (unit === 's') return '秒级时间戳';
  return Math.abs(value) >= 1e11 ? '毫秒级（自动识别）' : '秒级（自动识别）';
}

function relativeLabel(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) return '—';
  const abs = Math.abs(deltaMs);
  if (abs < 2_000) return '刚刚';
  const suffix = deltaMs >= 0 ? '后' : '前';
  if (abs < 60_000) return `${Math.round(abs / 1_000)} 秒${suffix}`;
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)} 分钟${suffix}`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)} 小时${suffix}`;
  if (abs < 2_592_000_000) return `${Math.round(abs / 86_400_000)} 天${suffix}`;
  return `${Math.round(abs / 2_592_000_000)} 个月${suffix}`;
}

function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function weekdayOf(date: Date): string {
  try {
    return date.toLocaleDateString('zh-CN', { weekday: 'long' });
  } catch {
    return '—';
  }
}

function localDateTime(date: Date): string {
  try {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return date.toString();
  }
}

export default function TimeConverterTool() {
  const [amount, setAmount] = useState('90');
  const [unitKey, setUnitKey] = useState<UnitKey>('min');

  const [tsInput, setTsInput] = useState(() => String(Math.floor(Date.now() / 1_000)));
  const [tsUnit, setTsUnit] = useState<TimestampUnit>('s');
  const [dateInput, setDateInput] = useState(() => localInputValue(new Date()));

  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 1_000);

  const localZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区';
    } catch {
      return '本地时区';
    }
  }, []);

  const unitMeta = unitMetaOf(unitKey);
  const numeric = amount.trim() === '' ? null : Number(amount);
  const amountInvalid = numeric !== null && !Number.isFinite(numeric);
  const totalMs = numeric !== null && Number.isFinite(numeric) ? numeric * unitMeta.ms : null;
  const unsafe = totalMs !== null && Math.abs(totalMs) > Number.MAX_SAFE_INTEGER;

  const tsNumeric = tsInput.trim() === '' ? null : Number(tsInput);
  const tsInvalid = tsNumeric !== null && !Number.isFinite(tsNumeric);
  const tsMs = tsNumeric !== null && Number.isFinite(tsNumeric) ? timestampToMs(tsNumeric, tsUnit) : null;
  const tsOutOfRange = tsMs !== null && Math.abs(tsMs) > MAX_DATE_MS;
  const timestampDate = tsMs !== null && !tsOutOfRange ? new Date(tsMs) : null;

  const dateValue = dateInput ? new Date(dateInput) : null;
  const dateValid = dateValue !== null && Number.isFinite(dateValue.getTime());

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel
          title="单位换算"
          description="在毫秒、秒、分钟、小时、天、周之间互转，同时给出易读形式。"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setAmount('')}>
                清空
              </Button>
              <span className="ml-auto text-xs subtle">结果保留最多 6 位小数</span>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Field label="数值" error={amountInvalid ? '请输入有效的数字' : null}>
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                value={amount}
                placeholder="例如 90"
                error={amountInvalid}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field label="单位">
              <Select value={unitKey} onChange={(event) => setUnitKey(event.target.value as UnitKey)}>
                {UNITS.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs subtle">示例：</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="chip font-mono"
                onClick={() => {
                  setAmount(example.amount);
                  setUnitKey(example.unit);
                }}
              >
                {example.label}
              </button>
            ))}
          </div>

          {amountInvalid ? (
            <Alert tone="error" className="mt-4">
              请输入有效的数字，支持负数与小数。
            </Alert>
          ) : totalMs === null ? (
            <EmptyState
              icon={Clock}
              title="还没有输入数值"
              description="输入一个数值并选择单位，即可看到所有时间单位的换算结果。"
              className="mt-4"
            />
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
                <p className="text-xs subtle">易读形式（按毫秒取整）</p>
                <p className="mt-1 text-lg font-semibold break-words">{humanize(totalMs)}</p>
                <div className="mt-2">
                  <CopyButton text={humanize(totalMs)} label="复制易读形式" />
                </div>
              </div>

              <div className="space-y-2">
                {UNITS.map((unit) => {
                  const value = totalMs / unit.ms;
                  const text = formatValue(value);
                  return (
                    <div key={unit.key} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                      <span className="w-14 shrink-0 text-xs subtle">{unit.label}</span>
                      <span className="min-w-0 flex-1 font-mono text-sm break-all">
                        {text} <span className="text-xs subtle">{unit.short}</span>
                      </span>
                      <CopyButton text={text} label="复制" />
                    </div>
                  );
                })}
              </div>

              {unsafe ? (
                <Alert tone="warning" title="数值较大">
                  换算结果超出 JavaScript 安全整数范围，末位可能存在舍入误差。
                </Alert>
              ) : null}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="时间戳 → 日期" description="自动或手动选择时间戳单位，按本地时区显示。">
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Field label="Unix 时间戳" error={tsInvalid ? '请输入有效的数字' : null}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={tsInput}
                  placeholder="例如 1700000000"
                  error={tsInvalid}
                  onChange={(event) => setTsInput(event.target.value)}
                />
              </Field>
              <Field label="单位">
                <Select value={tsUnit} onChange={(event) => setTsUnit(event.target.value as TimestampUnit)}>
                  <option value="auto">自动识别</option>
                  <option value="s">秒</option>
                  <option value="ms">毫秒</option>
                </Select>
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Clock}
                onClick={() => {
                  setTsInput(String(Math.floor(Date.now() / 1_000)));
                  setTsUnit('s');
                }}
              >
                当前时间
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                onClick={() => setTsInput('')}
              >
                清空
              </Button>
              <span className="ml-auto text-xs subtle">
                当前时间戳：<span className="font-mono">{Math.floor(now / 1_000)}</span>
              </span>
            </div>

            <div className="mt-4">
              {tsInput.trim() === '' ? (
                <EmptyState
                  icon={CalendarClock}
                  title="还没有时间戳"
                  description="输入 Unix 时间戳即可查看对应的本地日期时间。"
                />
              ) : tsInvalid ? (
                <Alert tone="error">请输入有效的数字时间戳。</Alert>
              ) : tsOutOfRange ? (
                <Alert tone="error" title="超出可表示范围">
                  时间戳换算后超出 JavaScript Date 的有效范围（约 ±8.64×10¹⁵ 毫秒），无法显示日期。
                </Alert>
              ) : timestampDate ? (
                <div className="space-y-3">
                  <Result
                    label="本地日期时间"
                    value={localDateTime(timestampDate)}
                    hint={`${localZone} · ${weekdayOf(timestampDate)}`}
                  />
                  <KeyValue
                    items={[
                      { label: 'ISO 8601（UTC）', value: <span className="font-mono text-xs">{timestampDate.toISOString()}</span> },
                      { label: '相对现在', value: relativeLabel(timestampDate.getTime() - now) },
                      {
                        label: '识别为',
                        value: tsNumeric !== null ? timestampUnitLabel(tsNumeric, tsUnit) : '—',
                      },
                    ]}
                  />
                  <CopyButton text={String(Math.floor(timestampDate.getTime() / 1_000))} label="复制秒级时间戳" />
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="日期 → 时间戳" description="选择本地日期时间，输出对应的 Unix 时间戳。">
            <Field label="日期与时间（本地时区）" hint={`当前时区：${localZone}`}>
              <Input
                type="datetime-local"
                value={dateInput}
                step={1}
                onChange={(event) => setDateInput(event.target.value)}
              />
            </Field>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon={Clock} onClick={() => setDateInput(localInputValue(new Date()))}>
                现在
              </Button>
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setDateInput('')}>
                清空
              </Button>
            </div>

            <div className="mt-4">
              {!dateInput ? (
                <EmptyState
                  icon={CalendarClock}
                  title="还没有选择日期"
                  description="选择日期与时间后即可得到秒级和毫秒级时间戳。"
                />
              ) : !dateValid || !dateValue ? (
                <Alert tone="error">日期格式无效，请重新选择。</Alert>
              ) : (
                <div className="space-y-3">
                  <Result
                    label="秒级时间戳"
                    value={String(Math.floor(dateValue.getTime() / 1_000))}
                    mono
                    hint={`${weekdayOf(dateValue)} · ${localDateTime(dateValue)}`}
                  />
                  <Result label="毫秒级时间戳" value={String(dateValue.getTime())} mono hint="可用于 JavaScript Date 构造" />
                  <KeyValue
                    items={[
                      { label: 'ISO 8601（UTC）', value: <span className="font-mono text-xs">{dateValue.toISOString()}</span> },
                      { label: '相对现在', value: relativeLabel(dateValue.getTime() - now) },
                    ]}
                  />
                </div>
              )}
            </div>
          </Panel>
        </div>
      </ToolSplit>

      <Panel title="说明">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 text-sm muted">
            <p className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
              <ArrowLeftRight className="size-4" /> 换算规则
            </p>
            <p>1 周 = 7 天 = 168 小时，1 天 = 24 小时，1 小时 = 60 分钟，1 分钟 = 60 秒，1 秒 = 1000 毫秒。</p>
            <p>支持负数与小数，换算结果为精确的十进制显示（最多 6 位小数）。</p>
          </div>
          <div className="space-y-2 text-sm muted">
            <p className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
              <CalendarClock className="size-4" /> 时间戳说明
            </p>
            <p>时间戳为 Unix Epoch（1970-01-01T00:00:00Z）以来的秒数或毫秒数，与本地时区无关。</p>
            <p>日期显示使用浏览器本地时区（{localZone}），夏令时由系统自动处理。</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge>纯本地计算</Badge>
          <Badge>不上传数据</Badge>
          <Badge>支持大数时间戳</Badge>
        </div>
        <Hint>
          提示：自动识别时间戳单位时，绝对值大于等于 10¹¹ 按毫秒处理，否则按秒处理。若结果不符合预期，可手动切换单位。
        </Hint>
      </Panel>
    </div>
  );
}
