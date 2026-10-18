import { useMemo, useState } from 'react';
import { Thermometer } from 'lucide-react';
import { Field, Hint, Input, KeyValue, Panel, Result, Select } from './kit';
import { Alert, Badge, Button, EmptyState } from '../components/ui';
import { cn } from '../lib/utils';

type TempUnit = 'C' | 'F' | 'K' | 'R';

interface TempUnitInfo {
  id: TempUnit;
  label: string;
  symbol: string;
  /** Lowest physically possible value in this unit. */
  absoluteZero: number;
}

const UNITS: TempUnitInfo[] = [
  { id: 'C', label: '摄氏度', symbol: '°C', absoluteZero: -273.15 },
  { id: 'F', label: '华氏度', symbol: '°F', absoluteZero: -459.67 },
  { id: 'K', label: '开尔文', symbol: 'K', absoluteZero: 0 },
  { id: 'R', label: '兰氏度', symbol: '°R', absoluteZero: 0 },
];

const PRESETS: { label: string; value: number; unit: TempUnit }[] = [
  { label: '绝对零度', value: -273.15, unit: 'C' },
  { label: '水的冰点', value: 0, unit: 'C' },
  { label: '人体温度', value: 37, unit: 'C' },
  { label: '水的沸点', value: 100, unit: 'C' },
  { label: '太阳表面', value: 5500, unit: 'C' },
  { label: '室温', value: 25, unit: 'C' },
];

const DECIMAL_CHOICES = [0, 2, 4, 6];

function parseNumberText(text: string): number | null {
  const cleaned = text.trim().replace(/[,，\s]/g, '');
  if (!cleaned) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function toCelsius(value: number, unit: TempUnit): number {
  switch (unit) {
    case 'F':
      return (value - 32) * (5 / 9);
    case 'K':
      return value - 273.15;
    case 'R':
      return (value - 491.67) * (5 / 9);
    case 'C':
    default:
      return value;
  }
}

function fromCelsius(celsius: number, unit: TempUnit): number {
  switch (unit) {
    case 'F':
      return celsius * (9 / 5) + 32;
    case 'K':
      return celsius + 273.15;
    case 'R':
      return (celsius + 273.15) * (9 / 5);
    case 'C':
    default:
      return celsius;
  }
}

function formatTemperature(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(decimals));
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded);
}

function unitInfo(id: TempUnit): TempUnitInfo {
  return UNITS.find((unit) => unit.id === id) ?? UNITS[0];
}

export default function TemperatureConverterTool() {
  const [unit, setUnit] = useState<TempUnit>('C');
  const [raw, setRaw] = useState('25');
  const [decimals, setDecimals] = useState(2);

  const info = unitInfo(unit);
  const parsed = parseNumberText(raw);
  const numeric = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
  const fieldError =
    parsed !== null && Number.isNaN(parsed) ? '请输入有效数字，例如 36.5 或 -40' : null;

  const celsius = useMemo(() => (numeric === null ? null : toCelsius(numeric, unit)), [numeric, unit]);
  const belowAbsoluteZero = celsius !== null && celsius < -273.15 - 1e-9;
  const values = useMemo(() => {
    if (celsius === null) return null;
    return UNITS.map((item) => ({ ...item, value: fromCelsius(celsius, item.id) }));
  }, [celsius]);

  function applyPreset(value: number, presetUnit: TempUnit) {
    setUnit(presetUnit);
    setRaw(String(value));
  }

  function selectUnit(next: TempUnit) {
    if (celsius !== null && !belowAbsoluteZero) {
      setRaw(String(Number(fromCelsius(celsius, next).toPrecision(12))));
    }
    setUnit(next);
  }

  const hasInput = raw.trim() !== '';

  return (
    <div className="space-y-4">
      <Panel title="温度转换" description="摄氏、华氏、开尔文与兰氏度，输入后实时显示四种单位。">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="温度值" htmlFor="temperature-value" error={fieldError}>
            <Input
              id="temperature-value"
              inputMode="decimal"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder="例如 36.5"
              className="tabular-nums"
              autoComplete="off"
            />
          </Field>
          <Field label="输入单位" htmlFor="temperature-unit">
            <Select id="temperature-unit" value={unit} onChange={(event) => setUnit(event.target.value as TempUnit)}>
              {UNITS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}（{item.symbol}）
                </option>
              ))}
            </Select>
          </Field>
          <Field label="小数位" htmlFor="temperature-decimals">
            <Select
              id="temperature-decimals"
              value={String(decimals)}
              onChange={(event) => setDecimals(Number(event.target.value))}
            >
              {DECIMAL_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice === 0 ? '整数' : `${choice} 位`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs subtle">常用温度</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="chip"
              onClick={() => applyPreset(preset.value, preset.unit)}
            >
              {preset.label}
              <span className="text-[10px] opacity-70">{preset.value}°C</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="转换结果"
        description={values ? '点击任意结果可切换为该单位继续编辑。' : '输入温度后同时显示四种单位。'}
      >
        {!hasInput ? (
          <EmptyState
            icon={Thermometer}
            title="等待输入温度"
            description="输入任意温度，下方会同时给出摄氏、华氏、开尔文与兰氏度的数值。"
          />
        ) : fieldError ? (
          <Alert tone="error" title="无法转换">
            {fieldError}
          </Alert>
        ) : belowAbsoluteZero ? (
          <Alert tone="error" title="低于绝对零度">
            {formatTemperature(numeric ?? 0, decimals)} {info.symbol} 低于绝对零度（-273.15 °C / 0 K /
            -459.67 °F / 0 °R），这样的温度在物理上不存在。
          </Alert>
        ) : values ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs subtle">以此单位继续编辑</span>
              {UNITS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectUnit(item.id)}
                  className={cn('chip px-2.5 py-1', item.id === unit && 'chip-active')}
                  aria-pressed={item.id === unit}
                >
                  {item.symbol}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {values.map((item) => (
                <Result
                  key={item.id}
                  label={
                    <span className="inline-flex items-center gap-2">
                      {item.label}（{item.symbol}）
                      {item.id === unit ? <Badge tone="brand">输入</Badge> : null}
                    </span>
                  }
                  value={`${formatTemperature(item.value, decimals)} ${item.symbol}`}
                  mono
                />
              ))}
            </div>

            <KeyValue
              items={[
                { label: '摄氏 → 华氏', value: '°F = °C × 9/5 + 32' },
                { label: '摄氏 → 开尔文', value: 'K = °C + 273.15' },
                { label: '摄氏 → 兰氏度', value: '°R = (°C + 273.15) × 9/5' },
                {
                  label: '兰氏度说明',
                  value: '0 °R = 0 K = -459.67 °F',
                },
              ]}
            />
            <Hint>换算使用精确公式；开尔文与兰氏度从绝对零度起算，因此不会出现负值。</Hint>
          </div>
        ) : (
          <EmptyState icon={Thermometer} title="暂无结果" description="请检查输入数值。" />
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setUnit('C');
            setRaw('25');
            setDecimals(2);
          }}
        >
          重置
        </Button>
        <span className="text-xs subtle">输入实时同步，无需点击转换按钮。</span>
      </div>
    </div>
  );
}
