import { useMemo, useState } from 'react';
import { Calculator, RotateCcw } from 'lucide-react';
import { Actions, CopyButton, Field, Hint, Panel, Result, Textarea, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, Switch } from '../components/ui';

const MAX_COUNT = 200;
const MAX_DIGITS = 120;
const FACTOR_LIMIT = 1_000_000_000_000n; // 1 万亿以上跳过质因数分解
const FACTOR_BUDGET = 400_000;
const FACTOR_LOCAL_LIMIT = 40_000;

const EXAMPLES = ['12, 18, 24', '48 60 72', '1071 462', '7 0 21', '12345678901234567890, 98765432109876543210'];

interface ParseResult {
  values: bigint[];
  invalid: string[];
  overlong: string[];
  truncated: boolean;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcdPair(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

function lcmPair(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return (abs(a) / gcdPair(a, b)) * abs(b);
}

interface DivisionStep {
  dividend: bigint;
  divisor: bigint;
  quotient: bigint;
  remainder: bigint;
}

function euclidSteps(a: bigint, b: bigint): { steps: DivisionStep[]; result: bigint } {
  let x = abs(a);
  let y = abs(b);
  if (x < y) [x, y] = [y, x];
  const steps: DivisionStep[] = [];
  while (y !== 0n) {
    const quotient = x / y;
    const remainder = x % y;
    steps.push({ dividend: x, divisor: y, quotient, remainder });
    x = y;
    y = remainder;
  }
  return { steps, result: x };
}

function parseInput(text: string): ParseResult {
  const tokens = text.split(/[\s,，、;；]+/).filter(Boolean);
  const values: bigint[] = [];
  const invalid: string[] = [];
  const overlong: string[] = [];
  let truncated = false;

  tokens.forEach((token, index) => {
    if (index >= MAX_COUNT) {
      truncated = true;
      return;
    }
    const cleaned = token.replace(/[_\u200b]/g, '');
    if (!/^[+-]?\d+$/.test(cleaned)) {
      invalid.push(token.length > 24 ? `${token.slice(0, 24)}…` : token);
      return;
    }
    const digits = cleaned.replace(/^[+-]/, '').replace(/^0+/, '');
    if (digits.length > MAX_DIGITS) {
      overlong.push(`${token.slice(0, 12)}…（${digits.length} 位）`);
      return;
    }
    values.push(BigInt(cleaned));
  });

  return { values, invalid, overlong, truncated };
}

interface Factorization {
  value: bigint;
  factors: { prime: bigint; power: number }[];
  complete: boolean;
  skipped: boolean;
}

function factorize(value: bigint, budget: { left: number }): Factorization {
  const target = abs(value);
  if (target <= 1n) return { value, factors: [], complete: true, skipped: false };
  if (target > FACTOR_LIMIT) return { value, factors: [], complete: false, skipped: true };

  const factors: { prime: bigint; power: number }[] = [];
  let remaining = target;
  let divisor = 2n;
  let complete = true;
  const limit = Math.min(budget.left, FACTOR_LOCAL_LIMIT);
  let used = 0;

  while (divisor * divisor <= remaining) {
    if (used >= limit) {
      complete = false;
      break;
    }
    used += 1;
    if (remaining % divisor === 0n) {
      let power = 0;
      while (remaining % divisor === 0n) {
        remaining /= divisor;
        power += 1;
      }
      factors.push({ prime: divisor, power });
    }
    divisor += divisor === 2n ? 1n : 2n;
  }
  budget.left -= used;
  if (remaining > 1n && complete) factors.push({ prime: remaining, power: 1 });
  return { value, factors, complete, skipped: false };
}

function formatBig(value: bigint): string {
  return value.toString();
}

function factorText(factor: { prime: bigint; power: number }): string {
  return factor.power > 1 ? `${factor.prime}^${factor.power}` : factor.prime.toString();
}

export default function GcdLcmTool() {
  const [text, setText] = useState('12, 18, 24');
  const [showFactors, setShowFactors] = useState(false);

  const parsed = useMemo(() => parseInput(text), [text]);
  const hasError = parsed.invalid.length > 0 || parsed.overlong.length > 0 || parsed.truncated;
  const ready = parsed.values.length > 0 && !hasError;

  const result = useMemo(() => {
    if (!ready) return null;
    const values = parsed.values;
    const allGcd = values.reduce((accumulator, value) => gcdPair(accumulator, value), 0n);
    const allLcm = values.reduce((accumulator, value) => lcmPair(accumulator, value), 1n);
    const chain: { gcdFrom: bigint; gcdTo: bigint; gcd: bigint; lcmFrom: bigint; lcmTo: bigint; lcm: bigint }[] = [];
    if (values.length > 1) {
      let runningGcd = abs(values[0]);
      let runningLcm = abs(values[0]);
      for (let index = 1; index < values.length; index += 1) {
        const value = values[index];
        const nextGcd = gcdPair(runningGcd, value);
        const nextLcm = lcmPair(runningLcm, value);
        chain.push({
          gcdFrom: runningGcd,
          gcdTo: value,
          gcd: nextGcd,
          lcmFrom: runningLcm,
          lcmTo: value,
          lcm: nextLcm,
        });
        runningGcd = nextGcd;
        runningLcm = nextLcm;
      }
    }
    const first = euclidSteps(values[0], values[1] ?? values[0]);
    return { allGcd, allLcm, chain, firstTrace: first };
  }, [parsed.values, ready]);

  const factorizations = useMemo(() => {
    if (!showFactors || !ready) return [];
    const budget = { left: FACTOR_BUDGET };
    return parsed.values.slice(0, 20).map((value) => factorize(value, budget));
  }, [showFactors, ready, parsed.values]);

  const hasZero = parsed.values.some((value) => value === 0n);
  const combinedText = result ? `GCD = ${formatBig(result.allGcd)}\nLCM = ${formatBig(result.allLcm)}` : '';

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="输入整数" description="用空格、换行、逗号或分号分隔，支持任意长度的整数（BigInt）。">
          <Field
            htmlFor="gcd-input"
            label="整数列表"
            hint={`最多 ${MAX_COUNT} 个，每个最多 ${MAX_DIGITS} 位；负号会被忽略（按绝对值计算）。`}
          >
            <Textarea
              id="gcd-input"
              value={text}
              rows={6}
              spellCheck={false}
              className="font-mono text-sm"
              placeholder={'例如：12, 18, 24\n或每行一个整数'}
              error={hasError}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs subtle">示例：</span>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip font-mono" onClick={() => setText(example)}>
                {example}
              </button>
            ))}
          </div>

          <Actions>
            <Button variant="secondary" icon={RotateCcw} onClick={() => setText('')}>
              清空
            </Button>
            <span className="ml-auto text-xs subtle">
              {parsed.values.length > 0 ? `已识别 ${parsed.values.length} 个整数` : '等待输入'}
            </span>
          </Actions>

          {hasError ? (
            <Alert tone="error" title="输入存在问题" className="mt-4">
              <ul className="space-y-1">
                {parsed.invalid.length > 0 ? (
                  <li>以下内容不是合法的十进制整数：{parsed.invalid.slice(0, 8).join('、')}{parsed.invalid.length > 8 ? ` 等 ${parsed.invalid.length} 项` : ''}</li>
                ) : null}
                {parsed.overlong.length > 0 ? (
                  <li>数值超过 {MAX_DIGITS} 位：{parsed.overlong.slice(0, 4).join('、')}</li>
                ) : null}
                {parsed.truncated ? <li>数量超过 {MAX_COUNT} 个，超出部分已被忽略。</li> : null}
              </ul>
            </Alert>
          ) : null}
        </Panel>

        <Panel title="计算结果" description="基于任意精度整数运算，不会因超出 Number 范围而失真。">
          {!ready ? (
            hasError ? (
              <EmptyState
                icon={Calculator}
                title="请先修正输入"
                description="修正左侧标红的内容后会自动重新计算。"
              />
            ) : (
              <EmptyState
                icon={Calculator}
                title="还没有输入整数"
                description="在左侧输入至少一个整数，即可得到最大公约数与最小公倍数。"
                action={
                  <Button variant="secondary" onClick={() => setText(EXAMPLES[0])}>
                    使用示例
                  </Button>
                }
              />
            )
          ) : result ? (
            <div className="space-y-3">
              <Result label="最大公约数 GCD" value={formatBig(result.allGcd)} mono hint={`共 ${formatBig(result.allGcd).length} 位`} />
              <Result
                label="最小公倍数 LCM"
                value={formatBig(result.allLcm)}
                mono
                hint={hasZero ? '输入中包含 0，因此 LCM 为 0' : `共 ${formatBig(result.allLcm).length} 位`}
              />

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border px-3 py-2">
                  <p className="text-xs subtle">整数个数</p>
                  <p className="mt-0.5 font-semibold">{parsed.values.length}</p>
                </div>
                <div className="rounded-xl border px-3 py-2">
                  <p className="text-xs subtle">最大公约数位数</p>
                  <p className="mt-0.5 font-semibold">{formatBig(result.allGcd).length}</p>
                </div>
                <div className="rounded-xl border px-3 py-2">
                  <p className="text-xs subtle">最小公倍数位数</p>
                  <p className="mt-0.5 font-semibold">{formatBig(result.allLcm).length}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={combinedText} label="复制 GCD 与 LCM" />
                <Badge tone="success">BigInt 精度</Badge>
                {hasZero ? <Badge tone="warning">包含 0</Badge> : null}
              </div>

              {parsed.values.length === 1 ? (
                <Hint>只输入一个整数时，GCD 与 LCM 都等于它的绝对值。</Hint>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </ToolSplit>

      <Panel
        title="计算过程"
        description="辗转相除法逐层求 GCD，再用 GCD 推导 LCM。"
        footer={<Switch checked={showFactors} onChange={setShowFactors} label="同时显示质因数分解" />}
      >
        {!ready || !result ? (
          <p className="text-sm subtle">输入有效整数后，这里会显示每一步的计算过程。</p>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-medium">1. 辗转相除法</h3>
              <div className="mt-2 overflow-x-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6">
                {parsed.values.length < 2 ? (
                  <p className="text-[var(--text-secondary)]">
                    只有一个整数，GCD 与 LCM 均为其绝对值 {formatBig(abs(parsed.values[0]))}。
                  </p>
                ) : result.firstTrace.steps.length === 0 ? (
                  <p className="text-[var(--text-secondary)]">无需除法：其中一个数为 0，GCD 直接为 {formatBig(result.firstTrace.result)}。</p>
                ) : (
                  result.firstTrace.steps.map((step, index) => (
                    <p key={index} className="whitespace-nowrap">
                      {formatBig(step.dividend)} = {formatBig(step.divisor)} × {formatBig(step.quotient)} + {formatBig(step.remainder)}
                    </p>
                  ))
                )}
                {parsed.values.length > 1 ? (
                  <p className="mt-2 text-indigo-600 dark:text-indigo-400">
                    → gcd({formatBig(parsed.values[0])}, {formatBig(parsed.values[1])}) = {formatBig(result.firstTrace.result)}
                  </p>
                ) : null}
              </div>
            </section>

            {result.chain.length > 0 ? (
              <section>
                <h3 className="text-sm font-medium">2. 逐个合并</h3>
                <p className="mt-1 text-xs subtle">
                  gcd 取累积值与下一个数的公约数；lcm 用公式 lcm(a, b) = |a × b| ÷ gcd(a, b) 累积计算。
                </p>
                <div className="mt-2 overflow-x-auto rounded-xl border">
                  <table className="table min-w-[560px]">
                    <thead>
                      <tr>
                        <th>步骤</th>
                        <th>GCD 合并</th>
                        <th>LCM 合并</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.chain.slice(0, 40).map((row, index) => (
                        <tr key={index}>
                          <td className="text-xs subtle">{index + 1}</td>
                          <td className="font-mono text-xs break-all">
                            gcd({formatBig(row.gcdFrom)}, {formatBig(row.gcdTo)}) = {formatBig(row.gcd)}
                          </td>
                          <td className="font-mono text-xs break-all">
                            lcm({formatBig(row.lcmFrom)}, {formatBig(row.lcmTo)}) = {formatBig(row.lcm)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.chain.length > 40 ? (
                  <p className="mt-2 text-xs subtle">仅显示前 40 步，其余 {result.chain.length - 40} 步已省略。</p>
                ) : null}
              </section>
            ) : null}

            {showFactors ? (
              <section>
                <h3 className="text-sm font-medium">3. 质因数分解</h3>
                <p className="mt-1 text-xs subtle">
                  GCD 取每个质因数的最小幂次，LCM 取最大幂次。超过 1 万亿的数会跳过分解。
                </p>
                <div className="mt-2 space-y-2">
                  {factorizations.map((item, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
                      <span className="font-mono text-xs break-all">{formatBig(item.value)}</span>
                      <span className="text-xs subtle">=</span>
                      {item.skipped ? (
                        <Badge tone="warning">数字过大，已跳过</Badge>
                      ) : (
                        <>
                          {item.factors.length > 0 ? (
                            <span className="flex flex-wrap items-center gap-1">
                              {item.factors.map((factor, factorIndex) => (
                                <span key={factorIndex} className="flex items-center gap-1">
                                  {factorIndex > 0 ? <span className="text-xs subtle">×</span> : null}
                                  <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-xs text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                                    {factorText(factor)}
                                  </span>
                                </span>
                              ))}
                            </span>
                          ) : item.complete ? (
                            <Badge>无质因数（0 或 1）</Badge>
                          ) : (
                            <span className="text-xs subtle">超出分解步数上限，未找到质因数</span>
                          )}
                          {!item.complete ? <Badge tone="warning">未完全分解</Badge> : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {parsed.values.length > 20 ? (
                  <p className="mt-2 text-xs subtle">数字较多，仅展示前 20 个的分解结果。</p>
                ) : null}
              </section>
            ) : null}

            <section>
              <h3 className="text-sm font-medium">校验</h3>
              <p className="mt-1 text-xs subtle">
                gcd × lcm 与「各数乘积」的关系仅对两个数成立；多个数时用上面的累积过程更可靠。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge>已检查 {parsed.values.length} 个整数</Badge>
                <Badge>结果均为精确整数</Badge>
              </div>
            </section>
          </div>
        )}
      </Panel>
    </div>
  );
}
