import { useMemo, useState } from 'react';
import { ArrowRight, Coins, Percent, TrendingDown, TrendingUp } from 'lucide-react';
import { Alert, Badge, Button, CopyButton, EmptyState, Field, Input } from '../components/ui';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';

const MONEY = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PLAIN = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

function yuan(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}¥${MONEY.format(Math.abs(value))}`;
}

function percent(value: number): string {
  return `${PLAIN.format(Number(value.toFixed(2)))}%`;
}

function multiple(value: number): string {
  return `${PLAIN.format(Number(value.toFixed(4)))} 倍`;
}

type FieldKey = 'cost' | 'finalValue' | 'years';

interface RoiInputs {
  cost: number;
  finalValue: number;
  years: number;
}

interface RoiMetrics {
  profit: number;
  roi: number;
  annualized: number;
  multiple: number;
}

type Analysis =
  | { status: 'empty' }
  | { status: 'invalid'; errors: Partial<Record<FieldKey, string>> }
  | { status: 'ok'; inputs: RoiInputs; metrics: RoiMetrics };

const MAX_AMOUNT = 1e15;

function analyze(costText: string, finalText: string, yearsText: string): Analysis {
  const cost = costText.trim();
  const final = finalText.trim();
  const years = yearsText.trim();

  if (!cost && !final && !years) return { status: 'empty' };

  const errors: Partial<Record<FieldKey, string>> = {};

  let costValue = Number.NaN;
  if (!cost) {
    errors.cost = '请输入投入成本';
  } else if (!Number.isFinite(Number(cost))) {
    errors.cost = '请输入有效的数字';
  } else {
    costValue = Number(cost);
    if (costValue <= 0) errors.cost = '投入成本必须大于 0';
    else if (costValue > MAX_AMOUNT) errors.cost = '金额过大，请缩小到合理范围';
  }

  let finalValue = Number.NaN;
  if (!final) {
    errors.finalValue = '请输入最终价值';
  } else if (!Number.isFinite(Number(final))) {
    errors.finalValue = '请输入有效的数字';
  } else {
    finalValue = Number(final);
    if (finalValue < 0) errors.finalValue = '最终价值不能为负数';
    else if (finalValue > MAX_AMOUNT) errors.finalValue = '金额过大，请缩小到合理范围';
  }

  let yearsValue = Number.NaN;
  if (!years) {
    errors.years = '请输入持有年数';
  } else if (!Number.isFinite(Number(years))) {
    errors.years = '请输入有效的数字';
  } else {
    yearsValue = Number(years);
    if (yearsValue <= 0) errors.years = '持有年数必须大于 0';
    else if (yearsValue > 200) errors.years = '持有年数过大（最多 200 年）';
  }

  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const ratio = finalValue / costValue;
  const profit = finalValue - costValue;
  const roi = (profit / costValue) * 100;
  const annualized = (Math.pow(ratio, 1 / yearsValue) - 1) * 100;

  if (![ratio, profit, roi, annualized].every((value) => Number.isFinite(value))) {
    return { status: 'invalid', errors: { years: '无法计算，请检查输入数值' } };
  }

  return {
    status: 'ok',
    inputs: { cost: costValue, finalValue, years: yearsValue },
    metrics: { profit, roi, annualized, multiple: ratio },
  };
}

export default function RoiCalculatorTool() {
  const [cost, setCost] = useState('');
  const [finalValue, setFinalValue] = useState('');
  const [years, setYears] = useState('');

  const analysis = useMemo(() => analyze(cost, finalValue, years), [cost, finalValue, years]);
  const errors: Partial<Record<FieldKey, string>> = analysis.status === 'invalid' ? analysis.errors : {};

  function loadExample() {
    setCost('10000');
    setFinalValue('15000');
    setYears('3');
  }

  function resetAll() {
    setCost('');
    setFinalValue('');
    setYears('');
  }

  const metrics = analysis.status === 'ok' ? analysis.metrics : null;
  const inputs = analysis.status === 'ok' ? analysis.inputs : null;
  const profitable = metrics ? metrics.profit > 0 : false;
  const losing = metrics ? metrics.profit < 0 : false;

  const summary =
    metrics && inputs
      ? [
          `投入成本：${yuan(inputs.cost)}`,
          `最终价值：${yuan(inputs.finalValue)}`,
          `持有年数：${inputs.years} 年`,
          `累计回报（ROI）：${percent(metrics.roi)}`,
          `年化收益率：${percent(metrics.annualized)}`,
          `净利润：${yuan(metrics.profit)}`,
          `回报倍数：${multiple(metrics.multiple)}`,
        ].join('\n')
      : '';

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="输入投资信息" description="金额单位：元；持有年数可填小数，例如 2.5 表示 2 年 6 个月">
          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
            className="space-y-4"
          >
            <Field label="投入成本" htmlFor="roi-cost" required error={errors.cost ?? null} hint="最初投入的本金总额">
              <Input
                id="roi-cost"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="例如 10000"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                error={Boolean(errors.cost)}
              />
            </Field>

            <Field
              label="最终价值"
              htmlFor="roi-final"
              required
              error={errors.finalValue ?? null}
              hint="卖出或当前持有的总价值（含已收回部分）"
            >
              <Input
                id="roi-final"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="例如 15000"
                value={finalValue}
                onChange={(event) => setFinalValue(event.target.value)}
                error={Boolean(errors.finalValue)}
              />
            </Field>

            <Field label="持有年数" htmlFor="roi-years" required error={errors.years ?? null} hint="不足 1 年可填小数，例如 0.5">
              <Input
                id="roi-years"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="例如 3"
                value={years}
                onChange={(event) => setYears(event.target.value)}
                error={Boolean(errors.years)}
              />
            </Field>

            <Actions className="mt-0">
              <Button variant="secondary" onClick={loadExample}>
                填入示例
              </Button>
              <Button variant="ghost" onClick={resetAll}>
                清空
              </Button>
            </Actions>
          </form>

          <Hint>
            计算只考虑本金与最终价值，不包含税费、手续费、通胀与期间分红；如需更精确的结果，请把这些成本计入投入成本。
          </Hint>
        </Panel>

        <Panel title="计算结果">
          {analysis.status === 'empty' ? (
            <EmptyState
              icon={TrendingUp}
              title="填写投资信息开始计算"
              description="输入投入成本、最终价值与持有年数，即可得到累计回报率与年化收益率。"
              className="py-10"
              action={
                <Button icon={Coins} onClick={loadExample}>
                  填入示例数据
                </Button>
              }
            />
          ) : analysis.status === 'invalid' ? (
            <Alert tone="error" title="请完善输入">
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {Object.entries(analysis.errors).map(([key, message]) => (
                  <li key={key}>{message}</li>
                ))}
              </ul>
            </Alert>
          ) : metrics && inputs ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Result label="累计回报率（ROI）" value={percent(metrics.roi)} hint="(最终价值 − 投入成本) ÷ 投入成本" />
                <Result
                  label="年化收益率"
                  value={percent(metrics.annualized)}
                  hint={`按 ${PLAIN.format(inputs.years)} 年复利折算的几何平均年增长率`}
                />
                <Result label="净利润" value={yuan(metrics.profit)} hint={profitable ? '盈利' : losing ? '亏损' : '持平'} />
                <Result label="回报倍数" value={multiple(metrics.multiple)} hint="最终价值 ÷ 投入成本" />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="default">{yuan(inputs.cost)}</Badge>
                <ArrowRight className="size-4 subtle" />
                <Badge tone={profitable ? 'success' : losing ? 'danger' : 'default'}>{yuan(inputs.finalValue)}</Badge>
                <span className="subtle">·</span>
                <span className="muted inline-flex items-center gap-1">
                  <Percent className="size-3.5" />
                  {PLAIN.format(inputs.years)} 年
                </span>
              </div>

              <KeyValue
                items={[
                  { label: '投入成本', value: yuan(inputs.cost) },
                  { label: '最终价值', value: yuan(inputs.finalValue) },
                  { label: '净利润', value: yuan(metrics.profit) },
                  { label: '持有年数', value: `${PLAIN.format(inputs.years)} 年` },
                  { label: '累计回报率', value: percent(metrics.roi) },
                  { label: '年化收益率', value: percent(metrics.annualized) },
                ]}
              />

              <Actions className="mt-0">
                <CopyButton text={summary} label="复制结果摘要" />
              </Actions>

              <Alert tone={profitable ? 'success' : losing ? 'warning' : 'info'} title="结果解读">
                {profitable ? (
                  <p>
                    投入 <strong>{yuan(inputs.cost)}</strong>，持有 <strong>{PLAIN.format(inputs.years)} 年</strong> 后价值{' '}
                    <strong>{yuan(inputs.finalValue)}</strong>：累计赚取 <strong>{yuan(metrics.profit)}</strong>，累计回报{' '}
                    <strong>{percent(metrics.roi)}</strong>，折算年化 <strong>{percent(metrics.annualized)}</strong>
                    。年化收益率通常低于累计回报，因为它把总收益按年复利摊平。
                  </p>
                ) : losing ? (
                  <p>
                    本次投资出现亏损：投入 <strong>{yuan(inputs.cost)}</strong>，最终价值 <strong>{yuan(inputs.finalValue)}</strong>，亏损{' '}
                    <strong>{yuan(Math.abs(metrics.profit))}</strong>（累计回报 {percent(metrics.roi)}）。年化收益率{' '}
                    {percent(metrics.annualized)} 表示按年复利折算后平均每年的变化幅度。
                  </p>
                ) : (
                  <p>最终价值与投入成本相同，累计回报为 0%，年化收益率为 0%：本金没有增值，也没有亏损。</p>
                )}
              </Alert>
            </div>
          ) : null}
        </Panel>
      </ToolSplit>

      <Panel title="指标说明">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">累计回报率（ROI）</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              衡量整段投资期的总收益比例，只与起点和终点有关，不考虑时间长短。公式：(最终价值 − 投入成本) ÷ 投入成本 × 100%。
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">年化收益率</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              把总收益按复利折算成平均每年的增长率，便于比较不同期限的投资。公式：(最终价值 ÷ 投入成本)<sup>1 ÷ 年数</sup> − 1。
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">示例</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              投入 10,000 元，3 年后价值 15,000 元：累计回报 50%，年化收益率约 14.47%（而不是 50% ÷ 3 ≈ 16.67%，因为收益会逐年复利）。
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">注意</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              持有不足 1 年时年化收益率会被放大，波动较大的短期投资不宜只看年化；本计算不含税费、手续费与通胀。
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs subtle">
          <TrendingUp className="size-3.5" /> 盈利显示为绿色
          <TrendingDown className="size-3.5" /> 亏损显示为警示色
          <span>·</span>
          <span>所有计算在浏览器本地完成。</span>
        </div>
      </Panel>
    </div>
  );
}
