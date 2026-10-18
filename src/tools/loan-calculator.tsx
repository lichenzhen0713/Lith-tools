import { useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Download, Landmark, Percent } from 'lucide-react';
import { Alert, Badge, Button, EmptyState, Field, Input, Tabs } from '../components/ui';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';
import { download } from '../lib/utils';
import { useToast } from '../lib/toast';

const MONEY = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

function money(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}¥${MONEY.format(Math.abs(value))}`;
}

function percent(value: number): string {
  return `${MONEY.format(value)}%`;
}

type PlanType = 'equal-payment' | 'equal-principal';

interface LoanInput {
  principal: number;
  annualRate: number;
  months: number;
}

interface ScheduleRow {
  index: number;
  payment: number;
  principalPart: number;
  interest: number;
  balance: number;
}

interface LoanPlan {
  type: PlanType;
  rows: ScheduleRow[];
  /** 等额本息为固定月供；等额本金没有固定月供（为 null）。 */
  monthlyPayment: number | null;
  firstPayment: number;
  lastPayment: number;
  totalPayment: number;
  totalInterest: number;
}

/**
 * 生成还款计划：
 * - 等额本息（equal-payment）：每月还款额固定，前期利息占比高。
 * - 等额本金（equal-principal）：每月本金固定，月供逐月递减。
 */
function buildPlan(input: LoanInput, type: PlanType): LoanPlan {
  const { principal, annualRate, months } = input;
  const monthlyRate = annualRate / 100 / 12;
  const rows: ScheduleRow[] = [];

  if (type === 'equal-payment') {
    const factor = Math.pow(1 + monthlyRate, months);
    const payment = monthlyRate === 0 ? principal / months : (principal * monthlyRate * factor) / (factor - 1);
    let balance = principal;
    for (let index = 1; index <= months; index += 1) {
      const interest = balance * monthlyRate;
      let principalPart = payment - interest;
      if (index === months) principalPart = balance;
      balance = Math.max(0, balance - principalPart);
      rows.push({ index, payment: principalPart + interest, principalPart, interest, balance });
    }
    const totalPayment = rows.reduce((sum, row) => sum + row.payment, 0);
    const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);
    return {
      type,
      rows,
      monthlyPayment: payment,
      firstPayment: rows[0]?.payment ?? 0,
      lastPayment: rows[rows.length - 1]?.payment ?? 0,
      totalPayment,
      totalInterest,
    };
  }

  const principalPart = principal / months;
  let balance = principal;
  for (let index = 1; index <= months; index += 1) {
    const interest = balance * monthlyRate;
    const actualPrincipal = index === months ? balance : principalPart;
    balance = Math.max(0, balance - actualPrincipal);
    rows.push({ index, payment: actualPrincipal + interest, principalPart: actualPrincipal, interest, balance });
  }
  const totalPayment = rows.reduce((sum, row) => sum + row.payment, 0);
  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);
  return {
    type,
    rows,
    monthlyPayment: null,
    firstPayment: rows[0]?.payment ?? 0,
    lastPayment: rows[rows.length - 1]?.payment ?? 0,
    totalPayment,
    totalInterest,
  };
}

interface LoanDraft {
  principal: string;
  annualRate: string;
  months: string;
}

type LoanErrors = Partial<Record<keyof LoanDraft, string>>;

function parseDraft(draft: LoanDraft): { errors: LoanErrors; input: LoanInput | null } {
  const errors: LoanErrors = {};

  const principalText = draft.principal.trim();
  let principal = Number.NaN;
  if (!principalText) {
    errors.principal = '请输入贷款金额';
  } else if (!Number.isFinite(Number(principalText))) {
    errors.principal = '请输入有效的数字';
  } else {
    principal = Number(principalText);
    if (principal <= 0) errors.principal = '贷款金额必须大于 0';
    else if (principal > 1e12) errors.principal = '金额过大（最多 1 万亿元）';
  }

  const rateText = draft.annualRate.trim();
  let annualRate = Number.NaN;
  if (!rateText) {
    errors.annualRate = '请输入年利率';
  } else if (!Number.isFinite(Number(rateText))) {
    errors.annualRate = '请输入有效的数字';
  } else {
    annualRate = Number(rateText);
    if (annualRate < 0) errors.annualRate = '年利率不能为负数';
    else if (annualRate > 100) errors.annualRate = '年利率过高（最多 100%）';
  }

  const monthsText = draft.months.trim();
  let months = Number.NaN;
  if (!monthsText) {
    errors.months = '请输入贷款期限';
  } else if (!Number.isFinite(Number(monthsText))) {
    errors.months = '请输入有效的数字';
  } else {
    months = Number(monthsText);
    if (!Number.isInteger(months)) errors.months = '期限必须是整数个月';
    else if (months < 1) errors.months = '期限至少 1 个月';
    else if (months > 600) errors.months = '期限最长 600 个月（50 年）';
  }

  if (Object.keys(errors).length > 0) return { errors, input: null };
  return { errors: {}, input: { principal, annualRate, months } };
}

interface LoanComputation {
  input: LoanInput;
  plans: Record<PlanType, LoanPlan>;
}

const PLAN_LABEL: Record<PlanType, string> = {
  'equal-payment': '等额本息',
  'equal-principal': '等额本金',
};

export default function LoanCalculatorTool() {
  const [draft, setDraft] = useState<LoanDraft>({ principal: '', annualRate: '', months: '' });
  const [errors, setErrors] = useState<LoanErrors>({});
  const [computed, setComputed] = useState<LoanComputation | null>(null);
  const [planType, setPlanType] = useState<PlanType>('equal-payment');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const toast = useToast();

  const plan = computed ? computed.plans[planType] : null;
  const otherType: PlanType = planType === 'equal-payment' ? 'equal-principal' : 'equal-payment';
  const otherPlan = computed ? computed.plans[otherType] : null;

  const monthsPreview = Number(draft.months);
  const monthsHint =
    Number.isInteger(monthsPreview) && monthsPreview > 0
      ? `${Math.floor(monthsPreview / 12)} 年 ${monthsPreview % 12} 个月，共 ${INT.format(monthsPreview)} 期`
      : '按月输入，例如 360 = 30 年';

  const dirty =
    computed !== null &&
    (Number(draft.principal) !== computed.input.principal ||
      Number(draft.annualRate) !== computed.input.annualRate ||
      Number(draft.months) !== computed.input.months);

  function updateDraft(key: keyof LoanDraft, value: string) {
    setDraft((previous) => {
      const next: LoanDraft = { ...previous };
      next[key] = value;
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseDraft(draft);
    setErrors(parsed.errors);
    if (!parsed.input) return;
    const input = parsed.input;
    setComputed({
      input,
      plans: {
        'equal-payment': buildPlan(input, 'equal-payment'),
        'equal-principal': buildPlan(input, 'equal-principal'),
      },
    });
    setScheduleOpen(false);
  }

  function loadExample() {
    setDraft({ principal: '1000000', annualRate: '4.2', months: '360' });
    setErrors({});
  }

  function resetAll() {
    setDraft({ principal: '', annualRate: '', months: '' });
    setErrors({});
    setComputed(null);
    setScheduleOpen(false);
  }

  function downloadCsv() {
    if (!computed || !plan) return;
    const header = '期数,月供,本金,利息,剩余本金';
    const lines = plan.rows.map((row) =>
      [String(row.index), row.payment.toFixed(2), row.principalPart.toFixed(2), row.interest.toFixed(2), row.balance.toFixed(2)].join(','),
    );
    const label = PLAN_LABEL[planType];
    download(`\ufeff${[header, ...lines].join('\r\n')}`, `还款计划-${label}.csv`, 'text/csv;charset=utf-8');
    toast.success('还款计划已导出为 CSV');
  }

  const interestRatio = computed && plan ? (plan.totalInterest / computed.input.principal) * 100 : 0;
  const interestDiff = computed ? computed.plans['equal-payment'].totalInterest - computed.plans['equal-principal'].totalInterest : 0;

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="贷款信息" description="按月还款；年利率填百分数，例如 4.2 表示 4.2%">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="贷款本金" htmlFor="loan-principal" required error={errors.principal ?? null} hint="金额单位：元">
              <Input
                id="loan-principal"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="例如 1000000"
                value={draft.principal}
                onChange={(event) => updateDraft('principal', event.target.value)}
                error={Boolean(errors.principal)}
              />
            </Field>

            <Field label="年利率（%）" htmlFor="loan-rate" required error={errors.annualRate ?? null} hint="支持小数，例如 4.2 或 3.85">
              <Input
                id="loan-rate"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="any"
                placeholder="例如 4.2"
                value={draft.annualRate}
                onChange={(event) => updateDraft('annualRate', event.target.value)}
                error={Boolean(errors.annualRate)}
              />
            </Field>

            <Field label="贷款期限（月）" htmlFor="loan-months" required error={errors.months ?? null} hint={monthsHint}>
              <Input
                id="loan-months"
                type="number"
                inputMode="numeric"
                min="1"
                max="600"
                step="1"
                placeholder="例如 360"
                value={draft.months}
                onChange={(event) => updateDraft('months', event.target.value)}
                error={Boolean(errors.months)}
              />
            </Field>

            <Actions className="mt-0">
              <Button type="submit">计算</Button>
              <Button variant="secondary" onClick={loadExample}>
                填入示例
              </Button>
              <Button variant="ghost" onClick={resetAll}>
                清空
              </Button>
            </Actions>
          </form>

          <Hint>
            等额本息每月还款额固定；等额本金每月归还相同本金，月供逐月递减。计算未考虑提前还款、罚息与保险等费用。
          </Hint>
        </Panel>

        <Panel title="计算结果">
          {!computed || !plan ? (
            <EmptyState
              icon={Landmark}
              title="填写贷款信息开始计算"
              description="输入本金、年利率与期限（月），即可得到月供、总利息与还款计划表。"
              className="py-10"
              action={
                <Button icon={Landmark} onClick={loadExample}>
                  填入示例数据
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {dirty ? <Alert tone="warning">输入已修改，点击「计算」更新结果。</Alert> : null}

              <Tabs
                items={[
                  { value: 'equal-payment', label: '等额本息' },
                  { value: 'equal-principal', label: '等额本金' },
                ]}
                value={planType}
                onChange={(value) => setPlanType(value === 'equal-principal' ? 'equal-principal' : 'equal-payment')}
              />

              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <Result
                  label={planType === 'equal-payment' ? '每月月供（固定）' : '首月月供'}
                  value={money(planType === 'equal-payment' ? (plan.monthlyPayment ?? plan.firstPayment) : plan.firstPayment)}
                  hint={planType === 'equal-payment' ? '整个还款期保持不变' : `末月 ${money(plan.lastPayment)}，逐月递减`}
                />
                <Result label="总利息" value={money(plan.totalInterest)} hint={`占本金的 ${percent(interestRatio)}`} />
                <Result label="总还款" value={money(plan.totalPayment)} hint={`本金 ${money(computed.input.principal)} + 利息`} />
                <Result
                  label="还款期数"
                  value={`${INT.format(plan.rows.length)} 期`}
                  hint={PLAN_LABEL[planType]}
                />
              </div>

              <KeyValue
                items={[
                  { label: '贷款本金', value: money(computed.input.principal) },
                  { label: '年利率', value: percent(computed.input.annualRate) },
                  { label: '月利率', value: `${(computed.input.annualRate / 12).toFixed(4)}%` },
                  { label: '期限', value: `${INT.format(computed.input.months)} 个月（${(computed.input.months / 12).toFixed(1)} 年）` },
                  { label: '还款方式', value: PLAN_LABEL[planType] },
                  { label: '首月月供', value: money(plan.firstPayment) },
                  { label: '末月月供', value: money(plan.lastPayment) },
                ]}
              />

              <Hint>月供由本金、利率与期限推算，实际金额以银行合同为准（可能存在四舍五入差异）。</Hint>
            </div>
          )}
        </Panel>
      </ToolSplit>

      {computed && otherPlan && plan ? (
        <Panel title="还款方式对比" description="同样的本金、利率与期限，两种还款方式的差异">
          <div className="overflow-x-auto">
            <table className="table min-w-[560px]">
              <thead>
                <tr>
                  <th>还款方式</th>
                  <th className="text-right">月供</th>
                  <th className="text-right">总利息</th>
                  <th className="text-right">总还款</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <Badge tone={planType === 'equal-payment' ? 'brand' : 'default'}>等额本息</Badge>
                  </td>
                  <td className="text-right font-mono">{money(computed.plans['equal-payment'].monthlyPayment ?? 0)}</td>
                  <td className="text-right font-mono">{money(computed.plans['equal-payment'].totalInterest)}</td>
                  <td className="text-right font-mono">{money(computed.plans['equal-payment'].totalPayment)}</td>
                </tr>
                <tr>
                  <td>
                    <Badge tone={planType === 'equal-principal' ? 'brand' : 'default'}>等额本金</Badge>
                  </td>
                  <td className="text-right font-mono">
                    {money(computed.plans['equal-principal'].firstPayment)} 起
                    <span className="ml-1 text-xs subtle">→ {money(computed.plans['equal-principal'].lastPayment)}</span>
                  </td>
                  <td className="text-right font-mono">{money(computed.plans['equal-principal'].totalInterest)}</td>
                  <td className="text-right font-mono">{money(computed.plans['equal-principal'].totalPayment)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Alert tone="info" className="mt-3">
            {Math.abs(interestDiff) < 0.01 ? (
              '两种还款方式的总利息相同（利率为 0 时没有利息）。'
            ) : interestDiff > 0 ? (
              <>
                等额本金比等额本息少付利息 <strong>{money(interestDiff)}</strong>，但前期月供更高（首月多{' '}
                <strong>{money(computed.plans['equal-principal'].firstPayment - computed.plans['equal-payment'].firstPayment)}</strong>
                ）。等额本息每月压力更均衡，等额本金总成本更低。
              </>
            ) : (
              <>当前参数下等额本息的利息更低，请检查利率与期限是否合理。</>
            )}
          </Alert>
        </Panel>
      ) : null}

      {computed && plan ? (
        <Panel
          title="还款计划表"
          description={`${PLAN_LABEL[planType]} · 共 ${INT.format(plan.rows.length)} 期`}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={scheduleOpen ? ChevronUp : ChevronDown}
                onClick={() => setScheduleOpen((previous) => !previous)}
              >
                {scheduleOpen ? '收起还款计划' : '展开还款计划'}
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={downloadCsv}>
                下载 CSV
              </Button>
            </div>
          }
        >
          {scheduleOpen ? (
            <>
              <div className="max-h-[26rem] overflow-auto rounded-xl border">
                <table className="table min-w-[520px]">
                  <thead className="sticky top-0 z-10 bg-[var(--card-bg)]">
                    <tr>
                      <th>期数</th>
                      <th className="text-right">月供</th>
                      <th className="text-right">本金</th>
                      <th className="text-right">利息</th>
                      <th className="text-right">剩余本金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((row) => (
                      <tr key={row.index}>
                        <td className="font-mono">{row.index}</td>
                        <td className="text-right font-mono">{money(row.payment)}</td>
                        <td className="text-right font-mono">{money(row.principalPart)}</td>
                        <td className="text-right font-mono">{money(row.interest)}</td>
                        <td className="text-right font-mono">{money(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs subtle">
                表格可上下滚动，首行为固定表头。合计：本金 {money(computed.input.principal)} · 利息 {money(plan.totalInterest)} · 总还款{' '}
                {money(plan.totalPayment)}。
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-sm muted">
              <Percent className="size-4" />
              还款计划表默认收起，展开后可查看每期月供、本金、利息与剩余本金，并支持下载 CSV。
            </div>
          )}
        </Panel>
      ) : null}

      <Panel title="还款方式说明">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">等额本息</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              每月还款额相同，前期利息占比高、本金归还慢。月供 = 本金 × 月利率 × (1 + 月利率)<sup>期数</sup> ÷ ((1 + 月利率)
              <sup>期数</sup> − 1)。适合收入稳定、希望月供固定的人。
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">等额本金</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              每月归还相同本金，利息按剩余本金计算，因此月供逐月递减。总利息通常低于等额本息，但前期还款压力较大。
            </p>
          </div>
        </div>
        <Hint>年利率为 0 时，两种方式都只归还本金，总利息为 0。</Hint>
      </Panel>
    </div>
  );
}
