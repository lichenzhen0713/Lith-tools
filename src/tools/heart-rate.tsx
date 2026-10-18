import { useMemo, useState, type FormEvent } from 'react';
import { HeartPulse, RotateCcw } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, StatCard } from '../components/ui';
import { useToast } from '../lib/toast';
import { cn } from '../lib/utils';

type Zone = {
  id: string;
  name: string;
  low: number;
  high: number;
  effect: string;
  feeling: string;
};

const MAX_HR_FORMULAS = [
  { value: 'fox', label: '220 − 年龄（Fox，最常用）', calc: (age: number) => 220 - age },
  { value: 'tanaka', label: '208 − 0.7 × 年龄（Tanaka）', calc: (age: number) => 208 - 0.7 * age },
  { value: 'nes', label: '211 − 0.64 × 年龄（Nes）', calc: (age: number) => 211 - 0.64 * age },
];

const ZONES: Zone[] = [
  {
    id: 'Z1',
    name: '恢复区',
    low: 0.5,
    high: 0.6,
    effect: '热身、放松与促进恢复',
    feeling: '非常轻松，可正常交谈',
  },
  {
    id: 'Z2',
    name: '有氧耐力',
    low: 0.6,
    high: 0.7,
    effect: '燃脂效率高，建立有氧基础',
    feeling: '轻松，能说完整句子',
  },
  {
    id: 'Z3',
    name: '节奏区',
    low: 0.7,
    high: 0.8,
    effect: '提升乳酸阈值与持续耐力',
    feeling: '略有压力，只能说短句',
  },
  {
    id: 'Z4',
    name: '无氧耐力',
    low: 0.8,
    high: 0.9,
    effect: '提高速度与最大摄氧量',
    feeling: '吃力，呼吸急促',
  },
  {
    id: 'Z5',
    name: '最大强度',
    low: 0.9,
    high: 1,
    effect: '冲刺与爆发力训练',
    feeling: '极度吃力，无法交谈',
  },
];

const ACTIVITIES = [
  { value: 'sedentary', label: '久坐（几乎不运动）', zoneId: 'Z1' },
  { value: 'light', label: '轻度活动（每周 1–3 次）', zoneId: 'Z2' },
  { value: 'moderate', label: '中度活动（每周 3–5 次）', zoneId: 'Z3' },
  { value: 'active', label: '高度活动（每周 6–7 次）', zoneId: 'Z4' },
] as const;

export default function HeartRateTool() {
  const [age, setAge] = useState('');
  const [resting, setResting] = useState('');
  const [formula, setFormula] = useState('fox');
  const [activity, setActivity] = useState('moderate');

  const ageValue = age.trim() === '' ? null : Number(age);
  const restingValue = resting.trim() === '' ? null : Number(resting);

  const ageError =
    ageValue !== null && (!Number.isFinite(ageValue) || ageValue < 10 || ageValue > 100)
      ? '年龄请输入 10–100 岁'
      : null;
  const restingError =
    restingValue !== null && (!Number.isFinite(restingValue) || restingValue < 30 || restingValue > 120)
      ? '静息心率请输入 30–120 bpm'
      : null;

  const isEmpty = age.trim() === '' && resting.trim() === '';

  const result = useMemo(() => {
    if (ageValue === null || restingValue === null || ageError !== null || restingError !== null) {
      return null;
    }
    const chosen = MAX_HR_FORMULAS.find((item) => item.value === formula) ?? MAX_HR_FORMULAS[0];
    const maxHr = chosen.calc(ageValue);
    if (!Number.isFinite(maxHr) || maxHr <= 0) return null;
    const hrr = maxHr - restingValue;
    if (hrr <= 5) {
      return { invalidResting: true as const, maxHr, hrr, chosen };
    }

    const zones = ZONES.map((zone) => ({
      ...zone,
      from: Math.round(restingValue + zone.low * hrr),
      to: Math.round(restingValue + zone.high * hrr),
      lowPercent: Math.round(zone.low * 100),
      highPercent: Math.round(zone.high * 100),
    }));

    const activityInfo = ACTIVITIES.find((item) => item.value === activity) ?? ACTIVITIES[2];
    const recommended = zones.find((zone) => zone.id === activityInfo.zoneId) ?? zones[2];
    const allMax = MAX_HR_FORMULAS.map((item) => ({ ...item, maxHr: Math.round(item.calc(ageValue)) }));

    const summary = [
      `最大心率 ${Math.round(maxHr)} bpm（${chosen.label}）`,
      `静息心率 ${Math.round(restingValue)} bpm`,
      `储备心率 ${Math.round(hrr)} bpm`,
      ...zones.map((zone) => `${zone.id} ${zone.name} ${zone.from}–${zone.to} bpm`),
    ].join('｜');

    return {
      invalidResting: false as const,
      maxHr,
      hrr,
      chosen,
      zones,
      recommended,
      activityInfo,
      allMax,
      summary,
    };
  }, [ageValue, restingValue, ageError, restingError, formula, activity]);

  const reset = () => {
    setAge('');
    setResting('');
  };

  const toast = useToast();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (result) toast.success('已根据当前数据计算心率区间');
    else toast.error('请先填写有效的年龄与静息心率');
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="输入信息" description="基于年龄与静息心率，用 Karvonen 储备心率法划分训练区间。">
          <form className="space-y-4" noValidate onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="年龄" htmlFor="hr-age" hint="10–100 岁" error={ageError} required>
                <Input
                  id="hr-age"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={100}
                  step={1}
                  placeholder="例如 30"
                  value={age}
                  error={Boolean(ageError)}
                  onChange={(event) => setAge(event.target.value)}
                />
              </Field>
              <Field
                label="静息心率 (bpm)"
                htmlFor="hr-resting"
                hint="晨起静坐 5 分钟后测量"
                error={restingError}
                required
              >
                <Input
                  id="hr-resting"
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={120}
                  step={1}
                  placeholder="例如 60"
                  value={resting}
                  error={Boolean(restingError)}
                  onChange={(event) => setResting(event.target.value)}
                />
              </Field>
            </div>

            <Field label="最大心率公式" htmlFor="hr-formula" hint="不同公式结果相差 3–5 bpm，可对比选择。">
              <Select id="hr-formula" value={formula} onChange={(event) => setFormula(event.target.value)}>
                {MAX_HR_FORMULAS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="训练目标" htmlFor="hr-activity" hint="用于高亮推荐区间">
              <Select id="hr-activity" value={activity} onChange={(event) => setActivity(event.target.value)}>
                {ACTIVITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Hint>
              区间心率 = 静息心率 + 强度百分比 × 储备心率（储备心率 = 最大心率 − 静息心率）。若正在服药或患有心血管疾病，请以医生建议为准。
            </Hint>

            <Actions>
              <Button type="submit" icon={HeartPulse}>
                计算心率区间
              </Button>
              <Button type="button" variant="secondary" icon={RotateCcw} onClick={reset}>
                清空
              </Button>
            </Actions>
          </form>
        </Panel>

        <Panel title="心率区间" description="Z1–Z5 训练强度对应心率范围。">
          {result ? (
            result.invalidResting ? (
              <Alert tone="error" title="静息心率过高">
                静息心率 {Math.round(restingValue ?? 0)} bpm 已接近或超过最大心率{' '}
                {Math.round(result.maxHr)} bpm，请重新测量后输入。
              </Alert>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    icon={HeartPulse}
                    label="最大心率"
                    value={`${Math.round(result.maxHr)} bpm`}
                    hint={result.chosen.label.split('（')[0]}
                  />
                  <StatCard label="储备心率" value={`${Math.round(result.hrr)} bpm`} hint="最大心率 − 静息心率" />
                  <StatCard label="静息心率" value={`${Math.round(restingValue ?? 0)} bpm`} hint="测量基准" />
                </div>

                <div className="overflow-x-auto rounded-xl border">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>区间</th>
                        <th>强度 (%HRR)</th>
                        <th>心率范围</th>
                        <th className="hidden sm:table-cell">训练效果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.zones.map((zone) => {
                        const active = zone.id === result.recommended.id;
                        return (
                          <tr key={zone.id} className={cn(active && 'bg-indigo-50/70 dark:bg-indigo-500/10')}>
                            <td className="whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{zone.id}</span>
                                <span className="text-xs subtle">{zone.name}</span>
                                {active ? <Badge tone="brand">推荐</Badge> : null}
                              </div>
                            </td>
                            <td className="whitespace-nowrap">
                              {zone.lowPercent}–{zone.highPercent}%
                            </td>
                            <td className="font-semibold whitespace-nowrap">
                              {zone.from}–{zone.to} bpm
                            </td>
                            <td className="hidden text-xs sm:table-cell">
                              <p>{zone.effect}</p>
                              <p className="mt-0.5 subtle">{zone.feeling}</p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Alert tone="info">
                  你的训练目标推荐 <strong>{result.recommended.id} {result.recommended.name}</strong>
                  （{result.recommended.from}–{result.recommended.to} bpm），建议每次保持 20–40 分钟。
                  Z5 仅适合短时冲刺，每周不超过 1–2 次。
                </Alert>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium muted">三种最大心率公式对比</p>
                  <div className="flex flex-wrap gap-2">
                    {result.allMax.map((item) => (
                      <Badge key={item.value} tone={item.value === formula ? 'brand' : 'default'}>
                        {item.label.split('（')[1]?.replace('）', '') ?? item.label}：{item.maxHr} bpm
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <CopyButton text={result.summary} label="复制区间" />
                </div>
              </div>
            )
          ) : ageError || restingError ? (
            <Alert tone="warning" title="请检查输入">
              年龄需为 10–100 岁，静息心率需为 30–120 bpm。
            </Alert>
          ) : isEmpty ? (
            <EmptyState
              icon={HeartPulse}
              title="填写年龄与静息心率"
              description="输入年龄和晨起静息心率，即可得到最大心率、储备心率与 Z1–Z5 五个训练区间。"
            />
          ) : (
            <EmptyState
              icon={HeartPulse}
              title="还差一项数据"
              description="请同时填写年龄与静息心率，结果会自动更新。"
            />
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
