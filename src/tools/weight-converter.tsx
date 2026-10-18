import { useMemo, useState } from 'react';
import { ArrowLeftRight, Minus, Plus, Scale } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Result, Select, ToolSplit } from './kit';
import { Alert, Button, EmptyState } from '../components/ui';
import { cn } from '../lib/utils';

interface WeightUnit {
  id: string;
  label: string;
  symbol: string;
  /** How many kilograms one unit equals. */
  kg: number;
  group: '公制' | '英制' | '市制';
}

const UNITS: WeightUnit[] = [
  { id: 'mg', label: '毫克', symbol: 'mg', kg: 1e-6, group: '公制' },
  { id: 'g', label: '克', symbol: 'g', kg: 1e-3, group: '公制' },
  { id: 'kg', label: '千克', symbol: 'kg', kg: 1, group: '公制' },
  { id: 't', label: '吨', symbol: 't', kg: 1000, group: '公制' },
  { id: 'ct', label: '克拉', symbol: 'ct', kg: 0.0002, group: '公制' },
  { id: 'lb', label: '磅', symbol: 'lb', kg: 0.45359237, group: '英制' },
  { id: 'oz', label: '盎司', symbol: 'oz', kg: 0.028349523125, group: '英制' },
  { id: 'st', label: '英石', symbol: 'st', kg: 6.35029318, group: '英制' },
  { id: 'jin', label: '斤', symbol: '斤', kg: 0.5, group: '市制' },
  { id: 'liang', label: '两', symbol: '两', kg: 0.05, group: '市制' },
  { id: 'qian', label: '钱', symbol: '钱', kg: 0.005, group: '市制' },
];

const UNIT_GROUPS = ['公制', '英制', '市制'] as const;
const STEP_CHOICES = [0.01, 0.1, 1, 10];
const PRECISION_CHOICES = [
  { value: '6', label: '6 位有效数字' },
  { value: '10', label: '10 位有效数字' },
  { value: '12', label: '12 位有效数字（默认）' },
  { value: '15', label: '15 位有效数字' },
];

function parseNumberText(text: string): number | null {
  const cleaned = text.trim().replace(/[,，\s]/g, '');
  if (!cleaned) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

/** Formats with a configurable number of significant digits, switching to scientific notation at the extremes. */
function formatWeight(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) {
    const exponential = value.toExponential(Math.max(0, digits - 1));
    return exponential.replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
  }
  const rounded = Number(value.toPrecision(digits));
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 }).format(rounded);
}

function preciseToString(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  if (Math.abs(value) < 1e-9 || Math.abs(value) >= 1e15) {
    return value.toExponential(10).replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
  }
  return String(Number(value.toPrecision(15)));
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

export default function WeightConverterTool() {
  const [amount, setAmount] = useState('1');
  const [fromId, setFromId] = useState('kg');
  const [toId, setToId] = useState('jin');
  const [step, setStep] = useState(0.1);
  const [digits, setDigits] = useState(12);

  const fromUnit = UNITS.find((unit) => unit.id === fromId) ?? UNITS[2];
  const toUnit = UNITS.find((unit) => unit.id === toId) ?? UNITS[8];

  const parsed = parseNumberText(amount);
  const numeric = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
  const fieldError =
    parsed !== null && Number.isNaN(parsed)
      ? '请输入有效数字，例如 2.5 或 4.2e-3'
      : numeric !== null && numeric < 0
        ? '重量不能为负数'
        : null;

  const converted = numeric !== null && fieldError === null ? (numeric * fromUnit.kg) / toUnit.kg : null;
  const displayValue = converted !== null && Number.isFinite(converted) ? converted : null;
  const amountInKg = numeric !== null && fieldError === null ? numeric * fromUnit.kg : null;
  const formatted = useMemo(() => (displayValue !== null ? formatWeight(displayValue, digits) : null), [displayValue, digits]);

  function nudge(direction: 1 | -1) {
    const base = numeric ?? 0;
    const next = Math.max(0, base + direction * step);
    setAmount(preciseToString(Number(next.toPrecision(15))));
  }

  function swapUnits() {
    if (displayValue !== null) setAmount(preciseToString(displayValue));
    setFromId(toId);
    setToId(fromId);
  }

  return (
    <div className="space-y-4">
      <Panel title="重量换算" description="克、千克、吨、毫克、磅、盎司、斤、两等任意互转，可调显示精度。">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="数值"
              htmlFor="weight-amount"
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
                  id="weight-amount"
                  className="text-center text-base tabular-nums"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="例如 2.5"
                  autoComplete="off"
                />
                <Button variant="secondary" size="icon" onClick={() => nudge(1)} aria-label="增加一个步进">
                  <Plus className="size-4" />
                </Button>
              </div>
            </Field>

            <Field label="显示精度" htmlFor="weight-precision" hint="JavaScript 双精度浮点数最多提供约 15–17 位有效数字。">
              <Select
                id="weight-precision"
                value={String(digits)}
                onChange={(event) => setDigits(Number(event.target.value))}
              >
                {PRECISION_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label="从" htmlFor="weight-from">
              <Select id="weight-from" value={fromId} onChange={(event) => setFromId(event.target.value)}>
                <UnitOptions />
              </Select>
            </Field>
            <div className="flex justify-center sm:pb-1">
              <Button variant="secondary" size="icon" onClick={swapUnits} aria-label="交换单位" title="交换单位（保留等值数值）">
                <ArrowLeftRight className="size-4" />
              </Button>
            </div>
            <Field label="到" htmlFor="weight-to">
              <Select id="weight-to" value={toId} onChange={(event) => setToId(event.target.value)}>
                <UnitOptions />
              </Select>
            </Field>
          </div>
        </form>
      </Panel>

      <ToolSplit>
        <Panel title="换算结果" description={`${fromUnit.label}（${fromUnit.symbol}） → ${toUnit.label}（${toUnit.symbol}）`}>
          {amount.trim() === '' ? (
            <EmptyState icon={Scale} title="等待输入重量" description="输入数值后立即显示换算结果，支持公制、英制与市制单位。" />
          ) : fieldError ? (
            <Alert tone="error" title="无法换算">
              {fieldError}
            </Alert>
          ) : converted !== null && !Number.isFinite(converted) ? (
            <Alert tone="error" title="结果超出范围">
              换算结果超出 JavaScript 数值范围，请减小输入或更换单位。
            </Alert>
          ) : displayValue !== null && formatted !== null && amountInKg !== null ? (
            <div className="space-y-3">
              <Result
                label={`${fromUnit.label} → ${toUnit.label}`}
                value={`${formatted} ${toUnit.symbol}`}
                mono
                hint={`1 ${fromUnit.symbol} = ${formatWeight(toUnit.kg / fromUnit.kg, digits)} ${toUnit.symbol}`}
              />
              <KeyValue
                items={[
                  { label: '换算基准', value: `1 ${fromUnit.symbol} = ${formatWeight(toUnit.kg / fromUnit.kg, digits)} ${toUnit.symbol}` },
                  { label: '反向换算', value: `1 ${toUnit.symbol} = ${formatWeight(fromUnit.kg / toUnit.kg, digits)} ${fromUnit.symbol}` },
                  { label: '以千克为基准', value: `${formatWeight(amountInKg, digits)} kg` },
                  { label: '精确值（15 位）', value: `${displayValue.toPrecision(15)} ${toUnit.symbol}` },
                ]}
              />
              <Hint>「斤」「两」「钱」按市制 1 斤 = 500 克、1 两 = 50 克、1 钱 = 5 克换算；磅与盎司采用国际常衡制。</Hint>
            </div>
          ) : (
            <EmptyState icon={Scale} title="暂无结果" description="请检查输入与单位设置。" />
          )}
        </Panel>

        <Panel title="所有单位" description={displayValue !== null ? '点击任意单位可设为目标单位。' : '输入数值后显示各单位的换算值。'}>
          {displayValue !== null && amountInKg !== null ? (
            <div className="space-y-2">
              {UNITS.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => setToId(unit.id)}
                  title={`设为目标单位：${unit.label}`}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
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
                    {formatWeight(amountInKg / unit.kg, digits)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={Scale} title="还没有可展示的换算" description="先在左侧输入有效数值。" />
          )}
        </Panel>
      </ToolSplit>

      <Actions className="mt-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAmount('1');
            setFromId('kg');
            setToId('jin');
            setStep(0.1);
            setDigits(12);
          }}
        >
          重置
        </Button>
        <span className="text-xs subtle">所有换算均在浏览器本地完成，不上传任何数据。</span>
      </Actions>
    </div>
  );
}
