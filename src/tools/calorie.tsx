import { useMemo, useState, type FormEvent } from 'react';
import { Flame, RotateCcw, Utensils } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, StatCard, Tabs } from '../components/ui';
import { useToast } from '../lib/toast';

type Gender = 'male' | 'female';

const ACTIVITIES = [
  { value: 'sedentary', label: '久坐（几乎不运动）', factor: 1.2, hint: '办公室工作，日常步数很少' },
  { value: 'light', label: '轻度活动（每周 1–3 次）', factor: 1.375, hint: '轻度运动或经常散步' },
  { value: 'moderate', label: '中度活动（每周 3–5 次）', factor: 1.55, hint: '规律健身或中等强度训练' },
  { value: 'active', label: '高度活动（每周 6–7 次）', factor: 1.725, hint: '高强度训练为主' },
  { value: 'veryActive', label: '极高活动（体力劳动 / 每天两练）', factor: 1.9, hint: '运动员或重体力工作' },
] as const;

const KCAL_PER_KG_FAT = 7700;

export default function CalorieTool() {
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState('moderate');

  const ageValue = age.trim() === '' ? null : Number(age);
  const heightValue = height.trim() === '' ? null : Number(height);
  const weightValue = weight.trim() === '' ? null : Number(weight);

  const ageError =
    ageValue !== null && (!Number.isFinite(ageValue) || ageValue < 10 || ageValue > 100)
      ? '年龄请输入 10–100 岁'
      : null;
  const heightError =
    heightValue !== null && (!Number.isFinite(heightValue) || heightValue < 100 || heightValue > 250)
      ? '身高请输入 100–250 cm'
      : null;
  const weightError =
    weightValue !== null && (!Number.isFinite(weightValue) || weightValue < 25 || weightValue > 300)
      ? '体重请输入 25–300 kg'
      : null;

  const isEmpty = age.trim() === '' && height.trim() === '' && weight.trim() === '';
  const activityInfo = ACTIVITIES.find((item) => item.value === activity) ?? ACTIVITIES[2];

  const result = useMemo(() => {
    if (
      ageValue === null ||
      heightValue === null ||
      weightValue === null ||
      ageError !== null ||
      heightError !== null ||
      weightError !== null
    ) {
      return null;
    }
    const bmr = 10 * weightValue + 6.25 * heightValue - 5 * ageValue + (gender === 'male' ? 5 : -161);
    if (!Number.isFinite(bmr) || bmr <= 0) return null;
    const tdee = bmr * activityInfo.factor;

    const goals = [
      { key: 'cut', label: '减脂', ratio: 0.8, hint: '约 20% 热量缺口' },
      { key: 'keep', label: '维持', ratio: 1, hint: '保持当前体重' },
      { key: 'bulk', label: '增肌', ratio: 1.1, hint: '约 10% 热量盈余' },
    ].map((goal) => {
      const kcal = Math.round(tdee * goal.ratio);
      const weekly = ((kcal - tdee) * 7) / KCAL_PER_KG_FAT;
      return { ...goal, kcal, weekly };
    });

    const summary = [
      `BMR ${Math.round(bmr)} kcal/天`,
      `TDEE ${Math.round(tdee)} kcal/天`,
      ...goals.map((goal) => `${goal.label} ${goal.kcal} kcal/天`),
    ].join('｜');

    return { bmr, tdee, goals, summary };
  }, [ageValue, heightValue, weightValue, ageError, heightError, weightError, gender, activityInfo.factor]);

  const reset = () => {
    setAge('');
    setHeight('');
    setWeight('');
  };

  const cutTarget = result?.goals[0];
  const toast = useToast();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (result) toast.success('已根据当前数据计算热量需求');
    else toast.error('请先填写完整的年龄、身高与体重');
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="身体信息" description="使用 Mifflin-St Jeor 公式估算基础代谢与每日总消耗。">
          <form className="space-y-4" noValidate onSubmit={handleSubmit}>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="年龄" htmlFor="cal-age" hint="10–100 岁" error={ageError} required>
                <Input
                  id="cal-age"
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
              <Field label="身高 (cm)" htmlFor="cal-height" error={heightError} required>
                <Input
                  id="cal-height"
                  type="number"
                  inputMode="decimal"
                  min={100}
                  max={250}
                  step={0.1}
                  placeholder="例如 175"
                  value={height}
                  error={Boolean(heightError)}
                  onChange={(event) => setHeight(event.target.value)}
                />
              </Field>
              <Field label="体重 (kg)" htmlFor="cal-weight" error={weightError} required>
                <Input
                  id="cal-weight"
                  type="number"
                  inputMode="decimal"
                  min={25}
                  max={300}
                  step={0.1}
                  placeholder="例如 70"
                  value={weight}
                  error={Boolean(weightError)}
                  onChange={(event) => setWeight(event.target.value)}
                />
              </Field>
              <Field
                label="活动水平"
                htmlFor="cal-activity"
                hint={`活动系数 ×${activityInfo.factor}`}
                required
              >
                <Select
                  id="cal-activity"
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

            <Hint>
              BMR 公式：男性 10×体重 + 6.25×身高 − 5×年龄 + 5；女性 10×体重 + 6.25×身高 − 5×年龄 − 161。
              结果基于统计公式估算，个体差异可达 ±10%。
            </Hint>

            <Actions>
              <Button type="submit" icon={Utensils}>
                查看目标热量
              </Button>
              <Button type="button" variant="secondary" icon={RotateCcw} onClick={reset}>
                清空
              </Button>
            </Actions>
          </form>
        </Panel>

        <Panel title="每日热量需求" description={activityInfo.hint}>
          {result ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  icon={Flame}
                  label="基础代谢 BMR"
                  value={`${Math.round(result.bmr)} kcal`}
                  hint="静息状态下维持生命所需热量"
                />
                <StatCard
                  icon={Utensils}
                  label="每日总消耗 TDEE"
                  value={`${Math.round(result.tdee)} kcal`}
                  hint={`BMR × ${activityInfo.factor}`}
                />
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <table className="table">
                  <thead>
                    <tr>
                      <th>目标</th>
                      <th className="text-right">每日热量</th>
                      <th className="text-right">相对维持</th>
                      <th className="text-right">体重变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.goals.map((goal) => {
                      const delta = goal.kcal - Math.round(result.tdee);
                      return (
                        <tr key={goal.key}>
                          <td>
                            <div className="flex flex-col">
                              <span className="font-medium">{goal.label}</span>
                              <span className="text-xs subtle">{goal.hint}</span>
                            </div>
                          </td>
                          <td className="text-right font-semibold whitespace-nowrap">{goal.kcal} kcal</td>
                          <td className="text-right whitespace-nowrap">
                            {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta} kcal`}
                          </td>
                          <td className="text-right whitespace-nowrap">
                            {Math.abs(goal.weekly) < 0.01
                              ? '0 kg/周'
                              : `${goal.weekly > 0 ? '+' : ''}${goal.weekly.toFixed(2)} kg/周`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {cutTarget && cutTarget.kcal < Math.round(result.bmr) ? (
                <Alert tone="warning" title="减脂目标低于基础代谢">
                  长期低于 BMR（{Math.round(result.bmr)} kcal）进食可能影响代谢与健康，建议缩小热量缺口并结合力量训练。
                </Alert>
              ) : (
                <Alert tone="info">
                  每周体重变化按 1 kg 脂肪 ≈ {KCAL_PER_KG_FAT} kcal 估算；实际进度受水分、肌肉量与活动量影响。
                </Alert>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{gender === 'male' ? '男性' : '女性'}</Badge>
                  <Badge>{Number(ageValue)} 岁</Badge>
                  <Badge>活动系数 ×{activityInfo.factor}</Badge>
                </div>
                <CopyButton text={result.summary} label="复制结果" />
              </div>
            </div>
          ) : ageError || heightError || weightError ? (
            <Alert tone="warning" title="请检查输入">
              年龄需为 10–100 岁，身高 100–250 cm，体重 25–300 kg。
            </Alert>
          ) : isEmpty ? (
            <EmptyState
              icon={Flame}
              title="填写身体信息以开始"
              description="输入年龄、身高、体重并选择活动水平，即可获得 BMR、TDEE 与减脂 / 维持 / 增肌三档目标热量。"
            />
          ) : (
            <EmptyState
              icon={Utensils}
              title="还差几项数据"
              description="请补全年龄、身高与体重，结果会自动更新。"
            />
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
