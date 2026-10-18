import { useMemo, useState, type FormEvent } from 'react';
import { Flame, RotateCcw } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, StatCard, Tabs } from '../components/ui';
import { useToast } from '../lib/toast';
import { cn } from '../lib/utils';

type Unit = 'metric' | 'imperial';
type Gender = 'male' | 'female';

const ACTIVITIES = [
  { value: 'sedentary', label: '久坐（几乎不运动）', factor: 1.2 },
  { value: 'light', label: '轻度活动（每周 1–3 次）', factor: 1.375 },
  { value: 'moderate', label: '中度活动（每周 3–5 次）', factor: 1.55 },
  { value: 'active', label: '高度活动（每周 6–7 次）', factor: 1.725 },
  { value: 'veryActive', label: '极高活动（体力劳动 / 每天两练）', factor: 1.9 },
] as const;

const LB_PER_KG = 2.20462262;

function mifflinStJeor(weightKg: number, heightCm: number, age: number, gender: Gender): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161);
}

function harrisBenedict(weightKg: number, heightCm: number, age: number, gender: Gender): number {
  return gender === 'male'
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
}

export default function BmrTool() {
  const [unit, setUnit] = useState<Unit>('metric');
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('');
  const [cm, setCm] = useState('');
  const [kg, setKg] = useState('');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [lb, setLb] = useState('');
  const [activity, setActivity] = useState('moderate');

  const ageValue = age.trim() === '' ? null : Number(age);

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

  const ageError =
    ageValue !== null && (!Number.isFinite(ageValue) || ageValue < 10 || ageValue > 100)
      ? '年龄请输入 10–100 岁'
      : null;
  const inchError =
    unit === 'imperial' && inch.trim() !== '' && (Number(inch) < 0 || Number(inch) >= 12)
      ? '英寸请填 0–11.9'
      : null;
  const heightError =
    heightCm === null ? null : heightCm < 100 || heightCm > 250 ? '请输入 100–250 cm 之间的身高' : null;
  const weightError =
    weightKg === null ? null : weightKg < 25 || weightKg > 300 ? '请输入 25–300 kg 之间的体重' : null;

  const isEmpty =
    age.trim() === '' &&
    (unit === 'metric' ? cm.trim() === '' && kg.trim() === '' : ft.trim() === '' && lb.trim() === '');

  const activityInfo = ACTIVITIES.find((item) => item.value === activity) ?? ACTIVITIES[2];

  const result = useMemo(() => {
    if (
      ageValue === null ||
      heightCm === null ||
      weightKg === null ||
      ageError !== null ||
      heightError !== null ||
      weightError !== null ||
      inchError !== null
    ) {
      return null;
    }
    const mifflin = mifflinStJeor(weightKg, heightCm, ageValue, gender);
    const harris = harrisBenedict(weightKg, heightCm, ageValue, gender);
    if (!Number.isFinite(mifflin) || !Number.isFinite(harris) || mifflin <= 0 || harris <= 0) return null;

    const rows = ACTIVITIES.map((item) => ({
      ...item,
      mifflinTdee: mifflin * item.factor,
      harrisTdee: harris * item.factor,
    }));
    const current = rows.find((item) => item.value === activity) ?? rows[2];
    const diff = harris - mifflin;
    const diffPercent = (Math.abs(diff) / mifflin) * 100;

    const summary = [
      `Mifflin-St Jeor BMR ${Math.round(mifflin)} kcal/天`,
      `Harris-Benedict BMR ${Math.round(harris)} kcal/天`,
      `${current.label} TDEE：Mifflin ${Math.round(current.mifflinTdee)} / Harris ${Math.round(current.harrisTdee)} kcal/天`,
    ].join('｜');

    return { mifflin, harris, rows, current, diff, diffPercent, summary };
  }, [ageValue, heightCm, weightKg, ageError, heightError, weightError, inchError, gender, activity]);

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
    setAge('');
    setCm('');
    setKg('');
    setFt('');
    setInch('');
    setLb('');
  };

  const toast = useToast();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (result) toast.success('已根据当前数据计算 BMR 与每日消耗');
    else toast.error('请先填写完整的身体信息');
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="身体信息" description="同时用两套经典公式估算基础代谢率。">
          <form className="space-y-4" noValidate onSubmit={handleSubmit}>
            <div>
              <Tabs<Unit>
                items={[
                  { value: 'metric', label: '公制 (cm / kg)' },
                  { value: 'imperial', label: '英制 (ft / lb)' },
                ]}
                value={unit}
                onChange={switchUnit}
              />
            </div>

            <div>
              <p className="label">性别</p>
              <Tabs<Gender>
                items={[
                  { value: 'male', label: '男性' },
                  { value: 'female', label: '女性' },
                ]}
                value={gender}
                onChange={setGender}
              />
            </div>

            {unit === 'metric' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="年龄" htmlFor="bmr-age" hint="10–100 岁" error={ageError} required>
                  <Input
                    id="bmr-age"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={100}
                    step={1}
                    placeholder="例如 28"
                    value={age}
                    error={Boolean(ageError)}
                    onChange={(event) => setAge(event.target.value)}
                  />
                </Field>
                <Field label="身高 (cm)" htmlFor="bmr-height" error={heightError} required>
                  <Input
                    id="bmr-height"
                    type="number"
                    inputMode="decimal"
                    min={100}
                    max={250}
                    step={0.1}
                    placeholder="例如 175"
                    value={cm}
                    error={Boolean(heightError)}
                    onChange={(event) => setCm(event.target.value)}
                  />
                </Field>
                <Field label="体重 (kg)" htmlFor="bmr-weight" error={weightError} required>
                  <Input
                    id="bmr-weight"
                    type="number"
                    inputMode="decimal"
                    min={25}
                    max={300}
                    step={0.1}
                    placeholder="例如 70"
                    value={kg}
                    error={Boolean(weightError)}
                    onChange={(event) => setKg(event.target.value)}
                  />
                </Field>
                <Field
                  label="活动水平"
                  htmlFor="bmr-activity"
                  hint={`活动系数 ×${activityInfo.factor}`}
                  required
                >
                  <Select
                    id="bmr-activity"
                    value={activity}
                    onChange={(event) => setActivity(event.target.value)}
                  >
                    {ACTIVITIES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="年龄" htmlFor="bmr-age-i" hint="10–100 岁" error={ageError} required>
                  <Input
                    id="bmr-age-i"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={100}
                    step={1}
                    placeholder="例如 28"
                    value={age}
                    error={Boolean(ageError)}
                    onChange={(event) => setAge(event.target.value)}
                  />
                </Field>
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
                    max={660}
                    step={0.1}
                    placeholder="例如 154"
                    value={lb}
                    error={Boolean(weightError)}
                    onChange={(event) => setLb(event.target.value)}
                  />
                </Field>
                <Field
                  label="活动水平"
                  htmlFor="bmr-activity-i"
                  hint={`活动系数 ×${activityInfo.factor}`}
                  required
                >
                  <Select
                    id="bmr-activity-i"
                    value={activity}
                    onChange={(event) => setActivity(event.target.value)}
                  >
                    {ACTIVITIES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {inchError ? <p className="text-xs text-rose-500 sm:col-span-2">{inchError}</p> : null}
              </div>
            )}

            <Hint>
              公制与英制切换时会自动换算已填写的数据。Harris-Benedict 使用 Roza &amp; Shizgal（1984）修订版系数。
            </Hint>

            <Actions>
              <Button type="submit" icon={Flame}>
                计算 BMR 与消耗
              </Button>
              <Button type="button" variant="secondary" icon={RotateCcw} onClick={reset}>
                清空
              </Button>
            </Actions>
          </form>
        </Panel>

        <Panel title="计算结果" description="两套公式的 BMR 与不同活动水平下的每日消耗。">
          {result ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  icon={Flame}
                  label="Mifflin-St Jeor BMR"
                  value={`${Math.round(result.mifflin)} kcal`}
                  hint="推荐优先参考"
                />
                <StatCard
                  label="Harris-Benedict BMR"
                  value={`${Math.round(result.harris)} kcal`}
                  hint="经典公式，通常偏高"
                />
              </div>

              <Alert tone="info">
                两套公式相差 <strong>{Math.abs(Math.round(result.diff))} kcal</strong>（约{' '}
                {result.diffPercent.toFixed(1)}%），{result.diff >= 0 ? 'Harris-Benedict 略高' : 'Mifflin-St Jeor 略高'}。
                现代营养学更常用 Mifflin-St Jeor。
              </Alert>

              <div>
                <p className="mb-2 text-xs font-medium muted">每日总消耗估算（TDEE）</p>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>活动水平</th>
                        <th className="text-right">系数</th>
                        <th className="text-right">Mifflin</th>
                        <th className="text-right">Harris</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row) => {
                        const active = row.value === activity;
                        return (
                          <tr key={row.value} className={cn(active && 'bg-indigo-50/70 dark:bg-indigo-500/10')}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className={cn(active && 'font-medium')}>
                                  {row.label.split('（')[0]}
                                </span>
                                {active ? <Badge tone="brand">当前</Badge> : null}
                              </div>
                            </td>
                            <td className="text-right whitespace-nowrap">×{row.factor}</td>
                            <td className="text-right font-semibold whitespace-nowrap">
                              {Math.round(row.mifflinTdee)} kcal
                            </td>
                            <td className="text-right whitespace-nowrap">{Math.round(row.harrisTdee)} kcal</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs subtle">
                  当前选择：{activityInfo.label}，Mifflin 口径约{' '}
                  {Math.round(result.current.mifflinTdee)} kcal/天。
                </p>
                <CopyButton text={result.summary} label="复制结果" />
              </div>
            </div>
          ) : ageError || heightError || weightError || inchError ? (
            <Alert tone="warning" title="请检查输入">
              年龄需为 10–100 岁，身高 100–250 cm（3 英尺 3 英寸–8 英尺 2 英寸），体重 25–300 kg。
            </Alert>
          ) : isEmpty ? (
            <EmptyState
              icon={Flame}
              title="填写身体信息以开始"
              description="输入性别、年龄、身高、体重与活动水平，对比 Mifflin-St Jeor 与 Harris-Benedict 两套公式的估算结果。"
            />
          ) : (
            <EmptyState
              icon={Flame}
              title="还差几项数据"
              description="请补全年龄、身高与体重，结果会自动更新。"
            />
          )}
        </Panel>
      </ToolSplit>

      <Panel title="公式与说明" description="了解 BMR、TDEE 与活动系数的含义。">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
            <p className="text-sm font-medium">Mifflin-St Jeor（1990）</p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs leading-6 whitespace-pre-wrap text-[var(--text-secondary)]">{`男性：10×体重 + 6.25×身高 − 5×年龄 + 5
女性：10×体重 + 6.25×身高 − 5×年龄 − 161`}</pre>
            <p className="mt-2 text-xs subtle">
              目前临床上最推荐的估算式，对超重与正常体重人群误差最小（多在 ±10% 以内）。
            </p>
          </div>
          <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
            <p className="text-sm font-medium">Harris-Benedict（Roza 修订版，1984）</p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs leading-6 whitespace-pre-wrap text-[var(--text-secondary)]">{`男性：88.362 + 13.397×体重 + 4.799×身高 − 5.677×年龄
女性：447.593 + 9.247×体重 + 3.098×身高 − 4.330×年龄`}</pre>
            <p className="mt-2 text-xs subtle">
              历史最悠久的公式，结果通常比实测偏高约 5%，适合作为参考上限。
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm leading-relaxed muted">
          <p>
            <strong className="text-[var(--text-primary)]">BMR（基础代谢率）</strong>
            ：清醒、静卧、空腹状态下维持呼吸、心跳、体温等基本生命活动所需的能量，约占总消耗的 60–70%。
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">TDEE（每日总能量消耗）</strong>
            ：BMR × 活动系数，包含日常活动与运动消耗。活动系数 1.2（久坐）到 1.9（极高活动）。
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">使用建议</strong>
            ：减脂时每日摄入不宜低于 BMR；增肌时在 TDEE 基础上增加 10% 左右并保证蛋白质 1.6–2.2 g/kg 体重。
            所有结果均为估算，请结合 2–4 周体重变化动态调整。
          </p>
        </div>
      </Panel>
    </div>
  );
}
