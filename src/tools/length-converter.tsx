import { useState } from 'react';
import { ArrowLeftRight, Minus, Plus, Ruler } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Result, Select, ToolSplit } from './kit';
import { Alert, Button, EmptyState } from '../components/ui';
import { cn } from '../lib/utils';

interface LengthUnit {
  id: string;
  label: string;
  symbol: string;
  /** How many metres one unit equals. */
  meters: number;
  group: '公制' | '英制' | '市制';
}

const UNITS: LengthUnit[] = [
  { id: 'nm', label: '纳米', symbol: 'nm', meters: 1e-9, group: '公制' },
  { id: 'um', label: '微米', symbol: 'µm', meters: 1e-6, group: '公制' },
  { id: 'mm', label: '毫米', symbol: 'mm', meters: 1e-3, group: '公制' },
  { id: 'cm', label: '厘米', symbol: 'cm', meters: 1e-2, group: '公制' },
  { id: 'dm', label: '分米', symbol: 'dm', meters: 0.1, group: '公制' },
  { id: 'm', label: '米', symbol: 'm', meters: 1, group: '公制' },
  { id: 'km', label: '千米', symbol: 'km', meters: 1000, group: '公制' },
  { id: 'in', label: '英寸', symbol: 'in', meters: 0.0254, group: '英制' },
  { id: 'ft', label: '英尺', symbol: 'ft', meters: 0.3048, group: '英制' },
  { id: 'yd', label: '码', symbol: 'yd', meters: 0.9144, group: '英制' },
  { id: 'mi', label: '英里', symbol: 'mi', meters: 1609.344, group: '英制' },
  { id: 'nmi', label: '海里', symbol: 'nmi', meters: 1852, group: '英制' },
  { id: 'li', label: '里', symbol: '里', meters: 500, group: '市制' },
  { id: 'chi', label: '尺', symbol: '尺', meters: 1 / 3, group: '市制' },
  { id: 'cun', label: '寸', symbol: '寸', meters: 1 / 30, group: '市制' },
];

const UNIT_GROUPS = ['公制', '英制', '市制'] as const;
const STEP_CHOICES = [0.01, 0.1, 1, 10];

/** Empty string → null, invalid text → NaN, otherwise the parsed number. */
function parseNumberText(text: string): number | null {
  const cleaned = text.trim().replace(/[,，\s]/g, '');
  if (!cleaned) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function formatLength(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) {
    return value.toExponential(6).replace(/\.?0+e/, 'e');
  }
  const rounded = Number(value.toPrecision(12));
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 12 }).format(rounded);
}

function preciseToString(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  if (Math.abs(value) < 1e-9 || Math.abs(value) >= 1e15) {
    return value.toExponential(8).replace(/\.?0+e/, 'e');
  }
  return String(Number(value.toPrecision(12)));
}

function UnitOptions() {
  return (
    <>
      {UNIT_GROUPS.map((group) => (
        <optgroup key={group} label={group}>
          {UNITS.filter((unit) => unit.group === group).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}（{unit.symbol}）
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export default function LengthConverterTool() {
  const [amount, setAmount] = useState('1');
  const [fromId, setFromId] = useState('m');
  const [toId, setToId] = useState('ft');
  const [step, setStep] = useState(1);

  const fromUnit = UNITS.find((unit) => unit.id === fromId) ?? UNITS[5];
  const toUnit = UNITS.find((unit) => unit.id === toId) ?? UNITS[8];

  const parsed = parseNumberText(amount);
  const numeric = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
  const fieldError =
    parsed !== null && Number.isNaN(parsed)
      ? '请输入有效数字，例如 1.85 或 3.5e3'
      : numeric !== null && numeric < 0
        ? '长度不能为负数'
        : null;

  const converted = numeric !== null && fieldError === null ? (numeric * fromUnit.meters) / toUnit.meters : null;
  const displayValue = converted !== null && Number.isFinite(converted) ? converted : null;
  const amountInMeters = numeric !== null && fieldError === null ? numeric * fromUnit.meters : null;
  const sameUnit = fromId === toId;

  function nudge(direction: 1 | -1) {
    const base = numeric ?? 0;
    const next = Math.max(0, base + direction * step);
    setAmount(preciseToString(Number(next.toPrecision(12))));
  }

  function swapUnits() {
    if (displayValue !== null) setAmount(preciseToString(displayValue));
    setFromId(toId);
    setToId(fromId);
  }

  return (
    <div className="space-y-4">
      <Panel title="长度换算" description="公制、英制与市制单位任意互转，输入即时计算。">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Field
            label="数值"
            htmlFor="length-amount"
            error={fieldError}
            hint={fieldError ? undefined : '支持小数与科学计数法，可用 − / + 按步进微调。'}
          >
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => nudge(-1)}
                aria-label="减少一个步进"
                disabled={numeric === null || numeric <= 0}
              >
                <Minus className="size-4" />
              </Button>
              <Input
                id="length-amount"
                className="text-center text-base tabular-nums"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="例如 1.85"
                autoComplete="off"
              />
              <Button variant="secondary" size="icon" onClick={() => nudge(1)} aria-label="增加一个步进">
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs subtle">步进</span>
              {STEP_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setStep(choice)}
                  className={cn('chip px-2.5 py-1 tabular-nums', step === choice && 'chip-active')}
                  aria-pressed={step === choice}
                >
                  {choice}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label="从" htmlFor="length-from">
              <Select id="length-from" value={fromId} onChange={(event) => setFromId(event.target.value)}>
                <UnitOptions />
              </Select>
            </Field>
            <div className="flex justify-center sm:pb-1">
              <Button
                variant="secondary"
                size="icon"
                onClick={swapUnits}
                aria-label="交换单位"
                title="交换单位（保留等值数值）"
              >
                <ArrowLeftRight className="size-4" />
              </Button>
            </div>
            <Field label="到" htmlFor="length-to">
              <Select id="length-to" value={toId} onChange={(event) => setToId(event.target.value)}>
                <UnitOptions />
              </Select>
            </Field>
          </div>

          {sameUnit ? <Alert tone="info">来源与目标单位相同，结果与输入一致。</Alert> : null}
        </form>
      </Panel>

      <ToolSplit>
        <Panel
          title="换算结果"
          description={`${fromUnit.label}（${fromUnit.symbol}） → ${toUnit.label}（${toUnit.symbol}）`}
        >
          {amount.trim() === '' ? (
            <EmptyState
              icon={Ruler}
              title="等待输入数值"
              description="输入任意长度后立即显示换算结果，支持公制、英制与市制单位。"
            />
          ) : fieldError ? (
            <Alert tone="error" title="无法换算">
              {fieldError}
            </Alert>
          ) : converted !== null && !Number.isFinite(converted) ? (
            <Alert tone="error" title="结果超出范围">
              换算结果超出 JavaScript 数值范围，请减小输入或更换单位。
            </Alert>
          ) : displayValue !== null && amountInMeters !== null ? (
            <div className="space-y-3">
              <Result
                label={`${fromUnit.label} → ${toUnit.label}`}
                value={`${formatLength(displayValue)} ${toUnit.symbol}`}
                mono
                hint={`1 ${fromUnit.symbol} = ${formatLength(toUnit.meters / fromUnit.meters)} ${toUnit.symbol}`}
              />
              <KeyValue
                items={[
                  {
                    label: '换算基准',
                    value: `1 ${fromUnit.symbol} = ${formatLength(toUnit.meters / fromUnit.meters)} ${toUnit.symbol}`,
                  },
                  {
                    label: '反向换算',
                    value: `1 ${toUnit.symbol} = ${formatLength(fromUnit.meters / toUnit.meters)} ${fromUnit.symbol}`,
                  },
                  { label: '以米为基准', value: `${formatLength(amountInMeters)} m` },
                  { label: '科学计数法', value: `${displayValue.toExponential(6)} ${toUnit.symbol}` },
                ]}
              />
            </div>
          ) : (
            <EmptyState icon={Ruler} title="暂无结果" description="请检查输入与单位设置。" />
          )}
        </Panel>

        <Panel
          title="所有单位"
          description={displayValue !== null ? '点击任意单位可设为目标单位。' : '输入数值后显示各单位的换算值。'}
        >
          {displayValue !== null && amountInMeters !== null ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {UNITS.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => setToId(unit.id)}
                  title={`设为目标单位：${unit.label}`}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    unit.id === toId
                      ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                      : 'bg-[var(--hover-bg)] hover:border-indigo-300 dark:hover:border-indigo-500/40',
                  )}
                >
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{unit.label}</span>
                    <span className="ml-1.5 text-xs subtle">{unit.symbol}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                    {formatLength(amountInMeters / unit.meters)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={Ruler} title="还没有可展示的换算" description="先在左侧输入有效数值。" />
          )}
          <div className="mt-4">
            <Hint>
              「里」「尺」「寸」按市制换算：1 里 = 500 米，1 尺 = 1/3 米，1 寸 = 1/30 米；英制与海里采用国际标准定义（1 英寸 =
              2.54 厘米、1 海里 = 1852 米）。
            </Hint>
          </div>
        </Panel>
      </ToolSplit>

      <Actions className="mt-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAmount('1');
            setFromId('m');
            setToId('ft');
            setStep(1);
          }}
        >
          重置
        </Button>
        <span className="text-xs subtle">所有换算均在浏览器本地完成，不上传任何数据。</span>
      </Actions>
    </div>
  );
}
