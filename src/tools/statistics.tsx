import { useMemo, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Alert, Badge, Button, CopyButton, EmptyState, Textarea } from '../components/ui';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';
import { download } from '../lib/utils';
import { useToast } from '../lib/toast';

const SAMPLE = '12, 15, 11, 14, 15, 18, 22, 15, 9, 17';

const NUMBER_FORMAT = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 });

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e15 || magnitude < 1e-6)) return value.toExponential(6);
  return NUMBER_FORMAT.format(Number(value.toFixed(10)));
}

interface Series {
  values: number[];
  invalid: string[];
}

function parseSeries(text: string): Series {
  const tokens = text.split(/[\s,;，；、]+/).filter(Boolean);
  const values: number[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const value = Number(trimmed);
    if (Number.isFinite(value)) values.push(value);
    else invalid.push(trimmed);
  }
  return { values, invalid };
}

interface Stats {
  count: number;
  sum: number;
  mean: number;
  median: number;
  modes: number[];
  modeFrequency: number;
  min: number;
  max: number;
  range: number;
  variancePopulation: number;
  varianceSample: number | null;
  sdPopulation: number;
  sdSample: number | null;
  sorted: number[];
  distinct: number;
  cv: number | null;
}

function computeStats(values: number[]): Stats {
  const sorted = [...values].sort((left, right) => left - right);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / count;

  const middle = Math.floor(count / 2);
  const median = count % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  const frequencies = new Map<number, number>();
  for (const value of sorted) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  let modeFrequency = 0;
  for (const frequency of frequencies.values()) modeFrequency = Math.max(modeFrequency, frequency);

  const modes =
    modeFrequency > 1
      ? [...frequencies.entries()]
          .filter(([, frequency]) => frequency === modeFrequency)
          .map(([value]) => value)
          .sort((left, right) => left - right)
      : [];

  const squaredDeviations = sorted.reduce((total, value) => total + (value - mean) ** 2, 0);
  const variancePopulation = squaredDeviations / count;
  const varianceSample = count > 1 ? squaredDeviations / (count - 1) : null;
  const sdPopulation = Math.sqrt(variancePopulation);
  const sdSample = varianceSample === null ? null : Math.sqrt(varianceSample);
  const min = sorted[0];
  const max = sorted[count - 1];

  return {
    count,
    sum,
    mean,
    median,
    modes,
    modeFrequency,
    min,
    max,
    range: max - min,
    variancePopulation,
    varianceSample,
    sdPopulation,
    sdSample,
    sorted,
    distinct: frequencies.size,
    cv: mean === 0 ? null : (sdPopulation / Math.abs(mean)) * 100,
  };
}

export default function StatisticsTool() {
  const [input, setInput] = useState('');
  const toast = useToast();

  const parsed = useMemo(() => parseSeries(input), [input]);
  const stats = useMemo(() => (parsed.values.length > 0 ? computeStats(parsed.values) : null), [parsed]);

  const report = useMemo(() => {
    if (!stats) return '';
    return [
      `数据个数 n：${fmt(stats.count)}`,
      `总和：${fmt(stats.sum)}`,
      `平均数：${fmt(stats.mean)}`,
      `中位数：${fmt(stats.median)}`,
      `众数：${stats.modes.length > 0 ? stats.modes.map((mode) => fmt(mode)).join(', ') : '无众数'}`,
      `总体方差：${fmt(stats.variancePopulation)}`,
      `样本方差：${stats.varianceSample === null ? '—' : fmt(stats.varianceSample)}`,
      `总体标准差：${fmt(stats.sdPopulation)}`,
      `样本标准差：${stats.sdSample === null ? '—' : fmt(stats.sdSample)}`,
      `最小值：${fmt(stats.min)}`,
      `最大值：${fmt(stats.max)}`,
      `极差：${fmt(stats.range)}`,
      `不同数值个数：${fmt(stats.distinct)}`,
      '',
      `排序后的数据：${stats.sorted.map((value) => String(value)).join(', ')}`,
    ].join('\n');
  }, [stats]);

  function loadSample() {
    setInput(SAMPLE);
  }

  function downloadReport() {
    if (!stats) return;
    download(`${report}\r\n`, 'statistics.txt');
    toast.success('统计结果已下载');
  }

  const invalidPreview = parsed.invalid.slice(0, 6).join('、');

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="输入数据" description="支持逗号、空格、换行、分号分隔，可包含小数与负数">
          <label htmlFor="stats-data" className="sr-only">
            数据列表
          </label>
          <Textarea
            id="stats-data"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'例如：\n12, 15, 11, 14, 15\n18 22 15 9 17'}
            spellCheck={false}
            className="min-h-36 font-mono text-sm"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs subtle">
            <span>已识别 {fmt(parsed.values.length)} 个数字</span>
            {parsed.invalid.length > 0 ? (
              <span className="text-rose-600 dark:text-rose-400">{parsed.invalid.length} 个内容无法识别</span>
            ) : (
              <span>空行与多余分隔符会被忽略</span>
            )}
          </div>

          <Actions>
            <Button variant="secondary" onClick={loadSample}>
              填入示例数据
            </Button>
            <Button variant="ghost" onClick={() => setInput('')}>
              清空
            </Button>
            {stats ? (
              <Button variant="ghost" icon={Download} onClick={downloadReport}>
                下载报告
              </Button>
            ) : null}
          </Actions>

          <Hint>
            示例：<span className="font-mono">{SAMPLE}</span>
            <br />
            所有数据只在浏览器内计算，不会上传到服务器。
          </Hint>
        </Panel>

        <Panel title="统计结果">
          {!stats ? (
            input.trim() === '' ? (
              <EmptyState
                icon={BarChart3}
                title="还没有数据"
                description="粘贴或输入一组数字，即可得到平均数、中位数、众数、方差与标准差。"
                className="py-10"
                action={
                  <Button icon={BarChart3} onClick={loadSample}>
                    填入示例数据
                  </Button>
                }
              />
            ) : (
              <Alert tone="error" title="没有可用的数字">
                以下内容无法识别为数字：<span className="font-mono">{invalidPreview}</span>
                {parsed.invalid.length > 6 ? ' 等' : ''}
                <br />
                请检查是否混入了字母、货币符号或空值。
              </Alert>
            )
          ) : (
            <div className="space-y-3">
              {parsed.invalid.length > 0 ? (
                <Alert tone="warning" title="部分内容已忽略">
                  已跳过 {fmt(parsed.invalid.length)} 个无法识别的内容：
                  <span className="font-mono"> {invalidPreview}</span>
                  {parsed.invalid.length > 6 ? ' 等' : ''}
                </Alert>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Result label="数据个数 n" value={fmt(stats.count)} hint={`不同数值 ${fmt(stats.distinct)} 个`} />
                <Result label="平均数" value={fmt(stats.mean)} hint="总和 ÷ 个数" />
                <Result label="中位数" value={fmt(stats.median)} hint="排序后位于中间的数" />
                <Result
                  label="样本标准差"
                  value={stats.sdSample === null ? '—' : fmt(stats.sdSample)}
                  hint={stats.sdSample === null ? '至少需要 2 个数据' : '分母为 n − 1'}
                />
              </div>

              <KeyValue
                items={[
                  { label: '总和', value: fmt(stats.sum) },
                  { label: '众数', value: stats.modes.length > 0 ? `${stats.modes.map((mode) => fmt(mode)).join(', ')}（各 ${fmt(stats.modeFrequency)} 次）` : '无众数（每个数只出现 1 次）' },
                  { label: '总体方差', value: fmt(stats.variancePopulation) },
                  { label: '样本方差', value: stats.varianceSample === null ? '—（至少需要 2 个数据）' : fmt(stats.varianceSample) },
                  { label: '总体标准差', value: fmt(stats.sdPopulation) },
                  { label: '样本标准差', value: stats.sdSample === null ? '—' : fmt(stats.sdSample) },
                  { label: '最小值', value: fmt(stats.min) },
                  { label: '最大值', value: fmt(stats.max) },
                  { label: '极差', value: fmt(stats.range) },
                  { label: '变异系数', value: stats.cv === null ? '—（平均数为 0）' : `${fmt(stats.cv)}%` },
                ]}
              />

              <Actions className="mt-0">
                <CopyButton text={report} label="复制完整报告" />
              </Actions>
            </div>
          )}
        </Panel>
      </ToolSplit>

      {stats ? (
        <Panel
          title="排序后的数据"
          description={`共 ${fmt(stats.count)} 个数字，从小到大排列`}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={stats.sorted.map((value) => String(value)).join(', ')} label="复制数据" />
              <Button variant="secondary" size="sm" icon={Download} onClick={downloadReport}>
                下载报告
              </Button>
            </div>
          }
        >
          <div className="max-h-72 overflow-auto rounded-xl border p-2">
            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {stats.sorted.map((value, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--hover-bg)]">
                  <span className="w-10 shrink-0 text-right font-mono subtle">{index + 1}</span>
                  <span className="min-w-0 font-mono break-all">{fmt(value)}</span>
                  {stats.modes.includes(value) ? <Badge tone="brand">众数</Badge> : null}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs subtle">
            众数标记表示该数值出现了 {fmt(stats.modeFrequency)} 次；若所有数值都只出现一次，则没有众数。
          </p>
        </Panel>
      ) : null}

      <Panel title="指标说明">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">平均数与中位数</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              平均数受极端值影响较大；中位数是排序后位于中间位置的数（偶数个数据时取中间两个的平均），对极端值更稳健。
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">众数</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              出现次数最多的数值。一组数据可能有多个众数，也可能没有众数（每个数只出现一次）。
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">方差与标准差</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              总体方差 = Σ(x − μ)² ÷ n；样本方差 = Σ(x − x̄)² ÷ (n − 1)。标准差是方差的平方根，与被测数据同单位，更直观。
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">极差与变异系数</p>
            <p className="mt-1 text-xs leading-relaxed muted">
              极差 = 最大值 − 最小值；变异系数 = 总体标准差 ÷ |平均数| × 100%，用于比较不同量纲数据的离散程度。
            </p>
          </div>
        </div>
        <Hint>“平均数方差”这一旧版叫法在新版中拆分为总体方差与样本方差，两者区别只在分母。</Hint>
      </Panel>
    </div>
  );
}
