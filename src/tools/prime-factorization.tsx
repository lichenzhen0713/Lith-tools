import { useMemo, useState, type FormEvent } from 'react';
import { Divide, Download, Hash } from 'lucide-react';
import { Alert, Badge, Button, CopyButton, EmptyState, Field, Input } from '../components/ui';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';
import { download } from '../lib/utils';
import { useToast } from '../lib/toast';

const LIMIT = 10n ** 12n;
const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const EXAMPLES = ['360', '1024', '999983', '123456789'];

function groupBigInt(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function superscript(value: number): string {
  return String(value)
    .split('')
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit)
    .join('');
}

interface FactorGroup {
  base: bigint;
  exponent: number;
}

interface FactorStep {
  before: bigint;
  divisor: bigint;
  after: bigint;
}

interface FactorResult {
  value: bigint;
  factors: bigint[];
  groups: FactorGroup[];
  steps: FactorStep[];
  divisorCount: bigint;
  factorSum: bigint;
  isPrime: boolean;
  exponentForm: string;
  expandedForm: string;
}

/** 试除法分解质因数（BigInt，避免大整数精度问题）。 */
function factorize(value: bigint): FactorResult {
  const factors: bigint[] = [];
  const steps: FactorStep[] = [];
  let remaining = value;
  let divisor = 2n;

  while (divisor * divisor <= remaining) {
    if (remaining % divisor === 0n) {
      const before = remaining;
      remaining /= divisor;
      factors.push(divisor);
      steps.push({ before, divisor, after: remaining });
    } else {
      divisor += divisor === 2n ? 1n : 2n;
    }
  }
  if (remaining > 1n) {
    factors.push(remaining);
    steps.push({ before: remaining, divisor: remaining, after: 1n });
  }

  const groups: FactorGroup[] = [];
  for (const factor of factors) {
    const last = groups[groups.length - 1];
    if (last && last.base === factor) last.exponent += 1;
    else groups.push({ base: factor, exponent: 1 });
  }

  const divisorCount = groups.reduce((product, group) => product * BigInt(group.exponent + 1), 1n);
  const factorSum = factors.reduce((sum, factor) => sum + factor, 0n);

  return {
    value,
    factors,
    groups,
    steps,
    divisorCount,
    factorSum,
    isPrime: factors.length === 1,
    exponentForm: groups
      .map((group) => (group.exponent === 1 ? group.base.toString() : `${group.base.toString()}${superscript(group.exponent)}`))
      .join(' × '),
    expandedForm: factors.map((factor) => factor.toString()).join(' × '),
  };
}

function parseInput(text: string): { value: bigint | null; message: string | null } {
  const normalized = text.trim().replace(/[,\s_]/g, '');
  if (!normalized) return { value: null, message: null };
  if (normalized.startsWith('-')) return { value: null, message: '质因数分解只支持正整数，请输入大于 1 的整数' };
  if (!/^\d+$/.test(normalized)) return { value: null, message: '请输入十进制整数（不支持小数或其它字符）' };

  let value: bigint;
  try {
    value = BigInt(normalized);
  } catch {
    return { value: null, message: '数字无法解析，请检查输入' };
  }

  if (value === 0n) return { value: null, message: '0 没有质因数分解，请输入大于 1 的整数' };
  if (value === 1n) return { value: null, message: '1 既不是质数也不是合数，没有质因数分解' };
  if (value > LIMIT) {
    return { value: null, message: `数字过大，目前最多支持 ${groupBigInt(LIMIT)}（10¹²）` };
  }
  return { value, message: null };
}

export default function PrimeFactorizationTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<FactorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(true);
  const toast = useToast();

  const parsed = useMemo(() => parseInput(input), [input]);
  const dirty = result !== null && parsed.value !== null && parsed.value !== result.value;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) {
      setError('请输入一个大于 1 的整数');
      setResult(null);
      return;
    }
    if (!parsed.value) {
      setError(parsed.message ?? '请输入一个大于 1 的整数');
      setResult(null);
      return;
    }
    setError(null);
    setResult(factorize(parsed.value));
    setStepsOpen(true);
  }

  function loadExample(example: string) {
    setInput(example);
    setError(null);
    const value = BigInt(example);
    setResult(factorize(value));
    setStepsOpen(true);
  }

  function resetAll() {
    setInput('');
    setResult(null);
    setError(null);
  }

  const report = result
    ? [
        `数字：${result.value.toString()}`,
        `指数形式：${result.exponentForm}`,
        `展开形式：${result.expandedForm}`,
        `约数个数：${result.divisorCount.toString()}`,
        `质因数和：${result.factorSum.toString()}`,
        `是否质数：${result.isPrime ? '是' : '否'}`,
      ].join('\n')
    : '';

  function downloadSteps() {
    if (!result) return;
    const content = [
      `质因数分解：${result.value.toString()}`,
      `指数形式：${result.exponentForm}`,
      `展开形式：${result.expandedForm}`,
      '',
      '计算过程：',
      ...result.steps.map((step, index) => `${index + 1}. ${step.before.toString()} ÷ ${step.divisor.toString()} = ${step.after.toString()}`),
    ].join('\r\n');
    download(content, `prime-factors-${result.value.toString()}.txt`);
    toast.success('分解过程已下载');
  }

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="输入整数" description={`穷举试除分解，支持最大 ${groupBigInt(LIMIT)}`}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label="要分解的整数"
              htmlFor="prime-number"
              required
              error={error}
              hint="可输入千分位逗号，例如 1,234,567；仅支持大于 1 的整数"
            >
              <Input
                id="prime-number"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="例如 360"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError(null);
                }}
                error={Boolean(error)}
              />
            </Field>

            <Actions className="mt-0">
              <Button type="submit" icon={Divide}>
                分解质因数
              </Button>
              <Button variant="ghost" onClick={resetAll}>
                清空
              </Button>
            </Actions>
          </form>

          <div className="mt-4">
            <p className="mb-2 text-xs subtle">试试这些示例：</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip font-mono" onClick={() => loadExample(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>

          <Hint>
            分解方式：从最小的质数 2 开始逐个试除，直到除数的平方大于剩余数字。任何大于 1 的整数都有唯一的质因数分解。
          </Hint>
        </Panel>

        <Panel title="分解结果">
          {error ? (
            <Alert tone="error" title="无法分解">
              {error}
            </Alert>
          ) : result ? (
            <div className="space-y-3">
              {dirty ? <Alert tone="warning">输入已修改，点击「分解质因数」更新结果。</Alert> : null}

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{groupBigInt(result.value)}</Badge>
                <Badge tone={result.isPrime ? 'success' : 'default'}>{result.isPrime ? '质数' : '合数'}</Badge>
                <span className="text-xs subtle">{result.factors.length} 个质因数（含重复）</span>
              </div>

              <Result label="指数形式" value={result.exponentForm} mono />
              <Result label="展开形式" value={result.expandedForm} mono />

              <div className="flex flex-wrap gap-1.5">
                {result.groups.map((group) => (
                  <span key={group.base.toString()} className="rounded-lg border px-2 py-1 font-mono text-xs">
                    {group.base.toString()}
                    {group.exponent > 1 ? superscript(group.exponent) : null}
                    <span className="ml-1 subtle">×{group.exponent}</span>
                  </span>
                ))}
              </div>

              <KeyValue
                items={[
                  { label: '约数个数', value: groupBigInt(result.divisorCount) },
                  { label: '质因数个数（含重复）', value: String(result.factors.length) },
                  { label: '不同质因数', value: String(result.groups.length) },
                  { label: '质因数之和', value: groupBigInt(result.factorSum) },
                  { label: '是否为质数', value: result.isPrime ? '是（只有 1 和自身两个约数）' : '否' },
                ]}
              />

              <Actions className="mt-0">
                <CopyButton text={report} label="复制结果" />
                <Button variant="secondary" size="sm" icon={Download} onClick={downloadSteps}>
                  下载过程
                </Button>
              </Actions>
            </div>
          ) : (
            <EmptyState
              icon={Hash}
              title="还没有分解结果"
              description="输入一个大于 1 的整数，点击「分解质因数」查看指数形式与计算过程。"
              className="py-10"
            />
          )}
        </Panel>
      </ToolSplit>

      {result ? (
        <Panel
          title="分解过程"
          description={`共 ${result.steps.length} 步，每一步都除以当前最小的质因数`}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Divide}
                onClick={() => setStepsOpen((previous) => !previous)}
              >
                {stepsOpen ? '收起过程' : '展开过程'}
              </Button>
            </div>
          }
        >
          {stepsOpen ? (
            <div className="max-h-80 overflow-auto rounded-xl border p-3">
              <ol className="space-y-1.5">
                <li className="font-mono text-xs subtle">
                  从 {groupBigInt(result.value)} 开始，用 2、3、5、7 … 依次试除
                </li>
                {result.steps.map((step, index) => (
                  <li key={index} className="flex items-baseline gap-2">
                    <span className="w-6 shrink-0 text-right font-mono text-xs subtle">{index + 1}.</span>
                    <span className="min-w-0 break-all font-mono text-xs">
                      {groupBigInt(step.before)} ÷ {groupBigInt(step.divisor)} = {groupBigInt(step.after)}
                    </span>
                  </li>
                ))}
                <li className="pt-1 font-mono text-xs">
                  结果：{result.value.toString()} = {result.exponentForm}
                </li>
              </ol>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm muted">
              <Divide className="size-4" /> 过程已收起，展开后可查看每一步的除法记录。
            </div>
          )}
        </Panel>
      ) : null}

      <Panel title="小知识">
        <ul className="space-y-1.5 text-sm muted">
          <li>质数是指在大于 1 的自然数中，除了 1 和它本身之外没有其它因数的数。</li>
          <li>算术基本定理：任何大于 1 的整数都能唯一地分解为质数的乘积（不计顺序）。</li>
          <li>约数个数可由各质因数指数加 1 后相乘得到，例如 360 = 2³ × 3² × 5，约数个数为 4 × 3 × 2 = 24。</li>
          <li>大于 10¹² 的数字试除会明显变慢，因此本工具限制在该范围内；全部计算在浏览器本地完成。</li>
        </ul>
      </Panel>
    </div>
  );
}
