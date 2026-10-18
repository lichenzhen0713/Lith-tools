import { useMemo, useState } from 'react';
import { Gauge, RotateCcw } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel, Result, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Tabs } from '../components/ui';
import { clamp, cn } from '../lib/utils';

type Unit = 'metric' | 'imperial';
type Level = { label: string; tone: 'success' | 'warning' | 'danger'; note: string };

const BMI_FLOOR = 15;
const BMI_CEIL = 35;

const SEGMENTS = [
  { label: '偏瘦', from: BMI_FLOOR, to: 18.5, range: '<18.5', color: 'bg-sky-400' },
  { label: '正常', from: 18.5, to: 24, range: '18.5–23.9', color: 'bg-emerald-500' },
  { label: '超重', from: 24, to: 28, range: '24.0–27.9', color: 'bg-amber-500' },
  { label: '肥胖', from: 28, to: BMI_CEIL, range: '≥28', color: 'bg-rose-500' },
] as const;

const LB_PER_KG = 2.20462262;

function classify(bmi: number): Level {
  if (bmi < 18.5) {
    return { label: '偏瘦', tone: 'warning', note: 'BMI 低于 18.5，体重偏轻，注意保证足够的热量与蛋白质摄入。' };
  }
  if (bmi < 24) {
    return { label: '正常', tone: 'success', note: 'BMI 处于 18.5–23.9 的健康区间。' };
  }
  if (bmi < 28) {
    return { label: '超重', tone: 'warning', note: 'BMI 处于 24–27.9 的超重区间，建议控制热量并增加日常运动。' };
  }
  return { label: '肥胖', tone: 'danger', note: 'BMI 达到 28 及以上，建议咨询专业人士制定减重计划。' };
}

export default function BmiTool() {
  const [unit, setUnit] = useState<Unit>('metric');
  const [cm, setCm] = useState('');
  const [kg, setKg] = useState('');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [lb, setLb] = useState('');

  const { heightCm, weightKg } = useMemo(() => {
    if (unit === 'metric') {
      const height = Number(cm);
      const weight = Number(kg);
      return {
        heightCm: cm.trim() !== '' && Number.isFinite(height) ? height : null,
        weightKg: kg.trim() !== '' && Number.isFinite(weight) ? weight : null,
      };
    }
    const feet = Number(ft);
    const inches = Number(inch.trim() === '' ? 0 : inch);
    const pounds = Number(lb);
    const totalInches =
      ft.trim() !== '' && Number.isFinite(feet) && Number.isFinite(inches) ? feet * 12 + inches : null;
    return {
      heightCm: totalInches !== null && totalInches > 0 ? totalInches * 2.54 : null,
      weightKg: lb.trim() !== '' && Number.isFinite(pounds) ? pounds / LB_PER_KG : null,
    };
  }, [unit, cm, kg, ft, inch, lb]);

  const inchError =
    unit === 'imperial' && inch.trim() !== '' && (Number(inch) < 0 || Number(inch) >= 12)
      ? '英寸请填 0–11.9'
      : null;
  const heightError =
    heightCm === null
      ? null
      : heightCm < 100 || heightCm > 250
        ? '请输入 100–250 cm 之间的身高'
        : null;
  const weightError =
    weightKg === null ? null : weightKg < 25 || weightKg > 400 ? '请输入 25–400 kg 之间的体重' : null;

  const isEmpty =
    unit === 'metric' ? cm.trim() === '' && kg.trim() === '' : ft.trim() === '' && lb.trim() === '';

  const result = useMemo(() => {
    if (
      heightCm === null ||
      weightKg === null ||
      heightError !== null ||
      weightError !== null ||
      inchError !== null
    ) {
      return null;
    }
    const bmi = weightKg / (heightCm / 100) ** 2;
    if (!Number.isFinite(bmi) || bmi <= 0) return null;

    const level = classify(bmi);
    const minKg = 18.5 * (heightCm / 100) ** 2;
    const maxKg = 23.9 * (heightCm / 100) ** 2;
    const metric = unit === 'metric';
    const showWeight = (value: number) => (metric ? `${value.toFixed(1)} kg` : `${(value * LB_PER_KG).toFixed(1)} lb`);
    const heightText = metric
      ? `${heightCm.toFixed(1)} cm`
      : `${Math.floor(heightCm / 2.54 / 12)} 英尺 ${((heightCm / 2.54) % 12).toFixed(1)} 英寸`;
    const weightText = showWeight(weightKg);
    const rangeText = `${showWeight(minKg)} – ${showWeight(maxKg)}`;
    const gap = bmi < 18.5 ? minKg - weightKg : bmi >= 24 ? weightKg - maxKg : 0;
    const advice =
      gap <= 0.05
        ? '体重处于健康区间，继续保持规律饮食与运动。'
        : bmi < 18.5
          ? `距健康区间下限约 ${showWeight(gap)}，建议适度增重。`
          : `超出健康区间上限约 ${showWeight(gap)}，建议适度减重。`;
    const summary = `BMI ${bmi.toFixed(1)}（${level.label}）｜身高 ${heightText}｜体重 ${weightText}｜健康体重范围 ${rangeText}`;

    return { bmi, level, heightText, weightText, rangeText, advice, summary };
  }, [heightCm, weightKg, heightError, weightError, inchError, unit]);

  const switchUnit = (next: Unit) => {
    if (next === unit) return;
    if (next === 'imperial') {
      const height = Number(cm);
      if (cm.trim() !== '' && Number.isFinite(height) && height > 0) {
        const totalInches = height / 2.54;
        setFt(String(Math.floor(totalInches / 12)));
        setInch((totalInches % 12).toFixed(1));
      }
      const weight = Number(kg);
      if (kg.trim() !== '' && Number.isFinite(weight) && weight > 0) {
        setLb((weight * LB_PER_KG).toFixed(1));
      }
    } else {
      const feet = Number(ft);
      const inches = Number(inch.trim() === '' ? 0 : inch);
      if (ft.trim() !== '' && Number.isFinite(feet) && Number.isFinite(inches)) {
        setCm(((feet * 12 + inches) * 2.54).toFixed(1));
      }
      const pounds = Number(lb);
      if (lb.trim() !== '' && Number.isFinite(pounds)) {
        setKg((pounds / LB_PER_KG).toFixed(1));
      }
    }
    setUnit(next);
  };

  const reset = () => {
    setCm('');
    setKg('');
    setFt('');
    setInch('');
    setLb('');
  };

  const marker = result ? clamp(((result.bmi - BMI_FLOOR) / (BMI_CEIL - BMI_FLOOR)) * 100, 0, 100) : 0;

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="输入身高与体重" description="支持公制与英制，输入后即时计算。">
          <div className="space-y-4">
            <Tabs<Unit>
              items={[
                { value: 'metric', label: '公制 (cm / kg)' },
                { value: 'imperial', label: '英制 (ft / lb)' },
              ]}
              value={unit}
              onChange={switchUnit}
            />

            {unit === 'metric' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="身高" htmlFor="bmi-height-cm" error={heightError} required>
                  <Input
                    id="bmi-height-cm"
                    type="number"
                    inputMode="decimal"
                    min={100}
                    max={250}
                    step={0.1}
                    placeholder="例如 170"
                    value={cm}
                    error={Boolean(heightError)}
                    onChange={(event) => setCm(event.target.value)}
                  />
                </Field>
                <Field label="体重" htmlFor="bmi-weight-kg" error={weightError} required>
                  <Input
                    id="bmi-weight-kg"
                    type="number"
                    inputMode="decimal"
                    min={25}
                    max={400}
                    step={0.1}
                    placeholder="例如 65"
                    value={kg}
                    error={Boolean(weightError)}
                    onChange={(event) => setKg(event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="身高" hint="英尺 + 英寸" error={heightError} required>
                  <div className="flex gap-2">
                    <Input
                      aria-label="英尺"
                      type="number"
                      inputMode="numeric"
                      min={3}
                      max={8}
                      step={1}
                      placeholder="英尺"
                      value={ft}
                      error={Boolean(heightError)}
                      onChange={(event) => setFt(event.target.value)}
                    />
                    <Input
                      aria-label="英寸"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={11.9}
                      step={0.1}
                      placeholder="英寸"
                      value={inch}
                      error={Boolean(inchError)}
                      onChange={(event) => setInch(event.target.value)}
                    />
                  </div>
                </Field>
                <Field label="体重" hint="磅 (lb)" error={weightError} required>
                  <Input
                    aria-label="体重（磅）"
                    type="number"
                    inputMode="decimal"
                    min={55}
                    max={880}
                    step={0.1}
                    placeholder="例如 143"
                    value={lb}
                    error={Boolean(weightError)}
                    onChange={(event) => setLb(event.target.value)}
                  />
                </Field>
                {inchError ? <p className="text-xs text-rose-500 sm:col-span-2">{inchError}</p> : null}
              </div>
            )}

            <Hint>
              分级采用中国成人标准（WS/T 428-2013）：偏瘦 &lt;18.5，正常 18.5–23.9，超重 24.0–27.9，肥胖 ≥28。
              健康体重范围按 BMI 18.5–23.9 反推。BMI 不区分肌肉与脂肪，运动员或孕期人群结果仅供参考。
            </Hint>
          </div>
        </Panel>

        <Panel title="计算结果" description="BMI、体型分级与健康体重区间。">
          {result ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs subtle">身体质量指数 BMI</p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight">{result.bmi.toFixed(1)}</p>
                </div>
                <Badge tone={result.level.tone} className="px-3 py-1 text-sm">
                  {result.level.label}
                </Badge>
              </div>

              <div>
                <div className="relative">
                  <div className="flex h-2.5 overflow-hidden rounded-full">
                    {SEGMENTS.map((segment) => (
                      <div
                        key={segment.label}
                        className={segment.color}
                        style={{ flexGrow: segment.to - segment.from }}
                      />
                    ))}
                  </div>
                  <span
                    className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-slate-900 shadow ring-1 ring-black/10 dark:border-slate-900 dark:bg-white"
                    style={{ left: `${marker}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs subtle">
                  {SEGMENTS.map((segment) => (
                    <span
                      key={segment.label}
                      className={cn(
                        'flex items-center gap-1.5',
                        result.level.label === segment.label && 'font-medium text-[var(--text-primary)]',
                      )}
                    >
                      <span
                        className={cn('inline-block size-2 shrink-0 rounded-full', segment.color)}
                        aria-hidden="true"
                      />
                      {segment.label}
                      <span className="subtle">{segment.range}</span>
                    </span>
                  ))}
                </div>
              </div>

              <Alert tone={result.level.tone === 'success' ? 'success' : result.level.tone === 'danger' ? 'error' : 'warning'}>
                {result.level.note}
                {result.advice ? ` ${result.advice}` : ''}
              </Alert>

              <div className="grid gap-3 sm:grid-cols-2">
                <Result label="健康体重范围" value={result.rangeText} />
                <Result label="当前体重" value={result.weightText} />
              </div>

              <Actions className="mt-0">
                <CopyButton text={result.summary} label="复制结果" />
                <Button variant="secondary" icon={RotateCcw} onClick={reset}>
                  重置
                </Button>
              </Actions>
            </div>
          ) : heightError || weightError || inchError ? (
            <Alert tone="warning" title="请检查输入">
              身高需在 100–250 cm（3 英尺 3 英寸–8 英尺 2 英寸）、体重需在 25–400 kg 之间，再试一次。
            </Alert>
          ) : isEmpty ? (
            <EmptyState
              icon={Gauge}
              title="还没有输入数据"
              description="填写身高与体重，即可实时得到 BMI、体型分级与健康体重范围。"
            />
          ) : (
            <EmptyState
              icon={Gauge}
              title="还差几项数据"
              description="请补全身高与体重，结果会自动更新。"
            />
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
