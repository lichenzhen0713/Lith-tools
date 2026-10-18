import { useMemo, useState } from 'react';
import { RotateCcw, Ruler } from 'lucide-react';
import { Actions, Field, Hint, KeyValue, Panel, Result, Select, ToolSplit, Input } from './kit';
import { Alert, Badge, Button, EmptyState, Tabs } from '../components/ui';
import { cn } from '../lib/utils';

type Unit = 'metric' | 'imperial';
type Gender = 'male' | 'female';
type FormulaId = 'tanner' | 'ratio' | 'simple';

interface FormulaDef {
  id: FormulaId;
  label: string;
  boyText: string;
  girlText: string;
  range: number;
  /** Sex adjustment in cm when the formula is written as (father + mother ± n) / 2. */
  adjustment: number | null;
  boy: (father: number, mother: number) => number;
  girl: (father: number, mother: number) => number;
  detail: string;
}

const CM_PER_INCH = 2.54;
const MIN_CM = 120;
const MAX_CM = 230;
const BAR_MIN = 140;
const BAR_MAX = 210;

const FORMULAS: FormulaDef[] = [
  {
    id: 'tanner',
    label: 'Tanner 遗传靶身高（±13 cm 性别调整）',
    boyText: '（父亲 + 母亲 + 13）÷ 2',
    girlText: '（父亲 + 母亲 − 13）÷ 2',
    range: 8.5,
    adjustment: 13,
    boy: (father, mother) => (father + mother + 13) / 2,
    girl: (father, mother) => (father + mother - 13) / 2,
    detail:
      '国际常用的遗传靶身高（mid-parental height）算法：父母身高之和加 13 cm（男孩）或减 13 cm（女孩）后除以 2，再给出约 ±8.5 cm 的范围（约 ±2 个标准差）。',
  },
  {
    id: 'ratio',
    label: '父母平均 × 1.08（旧版公式 1）',
    boyText: '（父亲 + 母亲）× 1.08 ÷ 2',
    girlText: '（父亲 × 0.923 + 母亲）÷ 2',
    range: 8.5,
    adjustment: null,
    boy: (father, mother) => ((father + mother) * 1.08) / 2,
    girl: (father, mother) => (father * 0.923 + mother) / 2,
    detail:
      '旧站使用的估算方式：男孩取父母身高之和的 1.08 倍再除以 2；女孩取父亲身高 × 0.923 加母亲身高后除以 2。该写法缺少公认的统计学出处，仅作参考。',
  },
  {
    id: 'simple',
    label: '简化 ±10 cm（旧版公式 3）',
    boyText: '（父亲 + 母亲 + 10）÷ 2',
    girlText: '（父亲 + 母亲 − 10）÷ 2',
    range: 5,
    adjustment: 10,
    boy: (father, mother) => (father + mother + 10) / 2,
    girl: (father, mother) => (father + mother - 10) / 2,
    detail:
      '常见的简化估算：男孩加 10 cm、女孩减 10 cm 后取平均。该公式给出的范围通常写作 ±5 cm，但实际个体差异往往更大。',
  },
];

function toCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

function toFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round((totalInches - feet * 12) * 10) / 10;
  if (inches >= 12) return { feet: feet + 1, inches: 0 };
  return { feet, inches };
}

function formatHeight(cm: number, unit: Unit): string {
  if (unit === 'metric') return `${cm.toFixed(1)} cm`;
  const { feet, inches } = toFeetInches(cm);
  return `${feet} 英尺 ${inches.toFixed(1)} 英寸`;
}

function parseNumber(raw: string): number {
  const value = Number(raw);
  return raw.trim() !== '' && Number.isFinite(value) ? value : Number.NaN;
}

function heightErrorOf(cm: number, touched: boolean, unit: Unit): string | null {
  if (!touched) return null;
  if (!Number.isFinite(cm)) {
    return unit === 'metric' ? '请输入有效的数字' : '请填写完整的身高（英尺 + 英寸）';
  }
  if (cm < MIN_CM || cm > MAX_CM) {
    return unit === 'metric'
      ? `请输入 ${MIN_CM}–${MAX_CM} cm 之间的身高`
      : '请输入约 120–230 cm（3 英尺 11 英寸 – 7 英尺 7 英寸）之间的身高';
  }
  return null;
}

export default function HeightPredictTool() {
  const [unit, setUnit] = useState<Unit>('metric');
  const [gender, setGender] = useState<Gender>('male');
  const [formulaId, setFormulaId] = useState<FormulaId>('tanner');

  const [fatherCm, setFatherCm] = useState('');
  const [motherCm, setMotherCm] = useState('');
  const [fatherFeet, setFatherFeet] = useState('');
  const [fatherInches, setFatherInches] = useState('');
  const [motherFeet, setMotherFeet] = useState('');
  const [motherInches, setMotherInches] = useState('');

  const fatherMetric = parseNumber(fatherCm);
  const motherMetric = parseNumber(motherCm);
  const fatherImperial = toCm(parseNumber(fatherFeet), fatherInches.trim() === '' ? 0 : parseNumber(fatherInches));
  const motherImperial = toCm(parseNumber(motherFeet), motherInches.trim() === '' ? 0 : parseNumber(motherInches));

  const fatherValue = unit === 'metric' ? fatherMetric : fatherImperial;
  const motherValue = unit === 'metric' ? motherMetric : motherImperial;

  const fatherTouched =
    unit === 'metric' ? fatherCm.trim() !== '' : fatherFeet.trim() !== '' || fatherInches.trim() !== '';
  const motherTouched =
    unit === 'metric' ? motherCm.trim() !== '' : motherFeet.trim() !== '' || motherInches.trim() !== '';

  const fatherError = heightErrorOf(fatherValue, fatherTouched, unit);
  const motherError = heightErrorOf(motherValue, motherTouched, unit);

  const formula = FORMULAS.find((item) => item.id === formulaId) ?? FORMULAS[0];

  const result = useMemo(() => {
    if (fatherError || motherError) return null;
    if (!Number.isFinite(fatherValue) || !Number.isFinite(motherValue)) return null;
    if (fatherValue < MIN_CM || fatherValue > MAX_CM || motherValue < MIN_CM || motherValue > MAX_CM) {
      return null;
    }
    const target = gender === 'male' ? formula.boy(fatherValue, motherValue) : formula.girl(fatherValue, motherValue);
    return {
      target,
      low: target - formula.range,
      high: target + formula.range,
      midParental: (fatherValue + motherValue) / 2,
      child: gender === 'male' ? '男孩' : '女孩',
    };
  }, [fatherError, motherError, fatherValue, motherValue, gender, formula]);

  const clampPercent = (cm: number) =>
    Math.min(100, Math.max(0, ((cm - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));

  const switchUnit = (next: Unit) => {
    if (next === unit) return;
    if (next === 'imperial') {
      if (Number.isFinite(fatherValue)) {
        const converted = toFeetInches(fatherValue);
        setFatherFeet(String(converted.feet));
        setFatherInches(String(converted.inches));
      }
      if (Number.isFinite(motherValue)) {
        const converted = toFeetInches(motherValue);
        setMotherFeet(String(converted.feet));
        setMotherInches(String(converted.inches));
      }
    } else {
      if (Number.isFinite(fatherValue)) setFatherCm(fatherValue.toFixed(1));
      if (Number.isFinite(motherValue)) setMotherCm(motherValue.toFixed(1));
    }
    setUnit(next);
  };

  const reset = () => {
    setFatherCm('');
    setMotherCm('');
    setFatherFeet('');
    setFatherInches('');
    setMotherFeet('');
    setMotherInches('');
  };

  const heightFields =
    unit === 'metric' ? (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="父亲身高" htmlFor="father-cm" error={fatherError} hint="单位：厘米">
          <Input
            id="father-cm"
            type="number"
            inputMode="decimal"
            min={MIN_CM}
            max={MAX_CM}
            step="0.1"
            placeholder="例如 175"
            value={fatherCm}
            error={Boolean(fatherError)}
            onChange={(event) => setFatherCm(event.target.value)}
          />
        </Field>
        <Field label="母亲身高" htmlFor="mother-cm" error={motherError} hint="单位：厘米">
          <Input
            id="mother-cm"
            type="number"
            inputMode="decimal"
            min={MIN_CM}
            max={MAX_CM}
            step="0.1"
            placeholder="例如 162"
            value={motherCm}
            error={Boolean(motherError)}
            onChange={(event) => setMotherCm(event.target.value)}
          />
        </Field>
      </div>
    ) : (
      <div className="space-y-4">
        <Field label="父亲身高" htmlFor="father-ft" error={fatherError} hint="英尺 3–7，英寸 0–11">
          <div className="flex items-center gap-2">
            <Input
              id="father-ft"
              type="number"
              inputMode="decimal"
              min={3}
              max={7}
              step="1"
              placeholder="英尺"
              value={fatherFeet}
              error={Boolean(fatherError)}
              onChange={(event) => setFatherFeet(event.target.value)}
            />
            <span className="shrink-0 text-sm subtle">ft</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={11}
              step="0.1"
              placeholder="英寸"
              aria-label="父亲身高（英寸）"
              value={fatherInches}
              error={Boolean(fatherError)}
              onChange={(event) => setFatherInches(event.target.value)}
            />
            <span className="shrink-0 text-sm subtle">in</span>
          </div>
        </Field>
        <Field label="母亲身高" htmlFor="mother-ft" error={motherError} hint="英尺 3–7，英寸 0–11">
          <div className="flex items-center gap-2">
            <Input
              id="mother-ft"
              type="number"
              inputMode="decimal"
              min={3}
              max={7}
              step="1"
              placeholder="英尺"
              value={motherFeet}
              error={Boolean(motherError)}
              onChange={(event) => setMotherFeet(event.target.value)}
            />
            <span className="shrink-0 text-sm subtle">ft</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={11}
              step="0.1"
              placeholder="英寸"
              aria-label="母亲身高（英寸）"
              value={motherInches}
              error={Boolean(motherError)}
              onChange={(event) => setMotherInches(event.target.value)}
            />
            <span className="shrink-0 text-sm subtle">in</span>
          </div>
        </Field>
      </div>
    );

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="父母身高与性别" description="填写父母身高后自动计算，无需上传任何数据。">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <div>
              <p className="label">单位</p>
              <Tabs<Unit>
                items={[
                  { value: 'metric', label: '公制（cm）' },
                  { value: 'imperial', label: '英制（ft / in）' },
                ]}
                value={unit}
                onChange={switchUnit}
              />
            </div>

            {heightFields}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="label">子女性别</p>
                <Tabs<Gender>
                  items={[
                    { value: 'male', label: '男孩' },
                    { value: 'female', label: '女孩' },
                  ]}
                  value={gender}
                  onChange={setGender}
                />
              </div>
              <Field label="估算公式" htmlFor="height-formula">
                <Select
                  id="height-formula"
                  value={formulaId}
                  onChange={(event) => setFormulaId(event.target.value as FormulaId)}
                >
                  {FORMULAS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Actions className="mt-0">
              <Button variant="secondary" icon={RotateCcw} onClick={reset}>
                清除重填
              </Button>
            </Actions>

            <Hint>
              遗传靶身高只使用父母身高做线性估算，未考虑孩子自身的骨龄、青春期发育节奏与疾病因素，个体差异可能远超给出的范围。
            </Hint>
          </form>
        </Panel>

        <Panel title="预测结果" description={`当前公式：${formula.label}`}>
          {!result ? (
            <EmptyState
              icon={Ruler}
              title="填写父母身高后显示结果"
              description={
                fatherTouched || motherTouched
                  ? '请补全两项身高，并确保数值在合理范围内（120–230 cm）。'
                  : '依次输入父亲与母亲的身高，即可得到遗传靶身高与预测范围。'
              }
            />
          ) : (
            <div className="space-y-3">
              <Result
                label={`遗传靶身高（${result.child}）`}
                value={formatHeight(result.target, unit)}
                hint={
                  formula.adjustment === null
                    ? '按父母平均身高估算'
                    : `父母平均 ${
                        unit === 'metric' ? `${result.midParental.toFixed(1)} cm` : formatHeight(result.midParental, unit)
                      }，性别调整 ${gender === 'male' ? '+' : '−'}${formula.adjustment} cm`
                }
              />
              <Result
                label="预测范围"
                value={`${formatHeight(result.low, unit)} – ${formatHeight(result.high, unit)}`}
                hint={`以靶身高为中心 ±${formula.range} cm（约 ±2 个标准差）`}
              />

              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between text-xs subtle">
                  <span>身高区间示意</span>
                  <span>{BAR_MIN}–{BAR_MAX} cm</span>
                </div>
                <div className="relative mt-3 h-2.5 rounded-full bg-[var(--hover-bg)]">
                  <div
                    className="absolute inset-y-0 rounded-full bg-indigo-200 dark:bg-indigo-500/30"
                    style={{
                      left: `${clampPercent(result.low)}%`,
                      width: `${Math.max(2, clampPercent(result.high) - clampPercent(result.low))}%`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-600 shadow dark:border-slate-900"
                    style={{ left: `${clampPercent(result.target)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] subtle">
                  <span>{BAR_MIN} cm</span>
                  <span>175 cm</span>
                  <span>{BAR_MAX} cm</span>
                </div>
              </div>

              <KeyValue
                items={[
                  {
                    label: '父亲身高',
                    value:
                      unit === 'metric'
                        ? `${fatherValue.toFixed(1)} cm`
                        : `${formatHeight(fatherValue, 'imperial')}（${fatherValue.toFixed(1)} cm）`,
                  },
                  {
                    label: '母亲身高',
                    value:
                      unit === 'metric'
                        ? `${motherValue.toFixed(1)} cm`
                        : `${formatHeight(motherValue, 'imperial')}（${motherValue.toFixed(1)} cm）`,
                  },
                  { label: '父母平均（mid-parental）', value: `${result.midParental.toFixed(1)} cm` },
                  { label: '子女性别', value: result.child },
                  { label: '使用公式', value: formula.label },
                  {
                    label: '范围（cm）',
                    value: `${result.low.toFixed(1)} – ${result.high.toFixed(1)} cm`,
                  },
                ]}
              />

              <Alert tone="info" title="公式说明">
                {formula.detail}
              </Alert>

              <Alert tone="warning" title="仅供参考">
                身高的最终结果由遗传、营养、睡眠、运动、内分泌与青春期发育共同决定。本结果仅为统计学估算，不能替代儿科或内分泌科医生的评估。
              </Alert>
            </div>
          )}
        </Panel>
      </ToolSplit>

      <Panel title="公式说明" description="三种常用估算方式；切换上方公式即可对比结果。">
        <div className="grid gap-3 lg:grid-cols-3">
          {FORMULAS.map((item) => (
            <div
              key={item.id}
              className={cn(
                'rounded-xl border p-4',
                item.id === formulaId && 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.label}</p>
                {item.id === formulaId ? <Badge tone="brand">当前</Badge> : null}
                <Badge>± {item.range} cm</Badge>
              </div>
              <p className="mt-2 font-mono text-xs muted">男孩：{item.boyText}</p>
              <p className="mt-1 font-mono text-xs muted">女孩：{item.girlText}</p>
              <p className="mt-2 text-xs leading-relaxed subtle">{item.detail}</p>
            </div>
          ))}
        </div>
        <Hint>
          英制换算：1 英尺 = 12 英寸 = 30.48 cm，1 英寸 = 2.54 cm。切换单位时会自动换算已填写的身高。
        </Hint>
      </Panel>
    </div>
  );
}
