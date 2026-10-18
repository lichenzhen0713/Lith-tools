import { useMemo, useState, type FormEvent } from 'react';
import { Download, ListOrdered } from 'lucide-react';
import { Button, CopyButton, EmptyState, Field, Input, Select } from '../components/ui';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';
import { download } from '../lib/utils';
import { useToast } from '../lib/toast';

const MAX_TERMS = 1000;
const INT = new Intl.NumberFormat('zh-CN');

/** 使用 BigInt 生成斐波那契数列，避免第 79 项之后 Number 精度丢失。 */
function buildSequence(count: number, fromZero: boolean): bigint[] {
  const terms: bigint[] = [];
  let current = fromZero ? 0n : 1n;
  let next = 1n;
  for (let index = 0; index < count; index += 1) {
    terms.push(current);
    const following = current + next;
    current = next;
    next = following;
  }
  return terms;
}

function groupBigInt(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface Params {
  count: number;
  fromZero: boolean;
}

export default function FibonacciTool() {
  const [countInput, setCountInput] = useState('');
  const [fromZero, setFromZero] = useState(false);
  const [params, setParams] = useState<Params | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const sequence = useMemo(() => (params ? buildSequence(params.count, params.fromZero) : null), [params]);
  const total = useMemo(() => (sequence ? sequence.reduce((sum, term) => sum + term, 0n) : null), [sequence]);
  const sequenceText = useMemo(() => (sequence ? sequence.map((term) => term.toString()).join(', ') : ''), [sequence]);

  const summary = useMemo(() => {
    if (!params || !sequence || sequence.length === 0 || total === null) return null;
    const last = sequence[sequence.length - 1];
    const previous = sequence.length > 1 ? sequence[sequence.length - 2] : null;
    const ratio = previous && previous > 0n ? Number((last * 10n ** 10n) / previous) / 1e10 : null;
    return {
      count: params.count,
      fromZero: params.fromZero,
      first: sequence[0],
      last,
      digits: last.toString().length,
      total,
      ratio,
    };
  }, [params, sequence, total]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = countInput.trim();
    if (!text) {
      setError('请输入要生成的项数');
      return;
    }
    const count = Number(text);
    if (!Number.isFinite(count) || !Number.isInteger(count)) {
      setError('项数必须是整数');
      return;
    }
    if (count < 1 || count > MAX_TERMS) {
      setError(`项数范围是 1 - ${INT.format(MAX_TERMS)}`);
      return;
    }
    setError(null);
    setParams({ count, fromZero });
  }

  function changeStart(nextFromZero: boolean) {
    setFromZero(nextFromZero);
    setParams((previous) => (previous ? { ...previous, fromZero: nextFromZero } : previous));
  }

  function loadExample() {
    setCountInput('20');
    setFromZero(false);
    setParams({ count: 20, fromZero: false });
    setError(null);
  }

  function downloadTxt() {
    if (!sequence || !params || total === null) return;
    const lines = sequence.map((term, index) => `${index + 1}: ${term.toString()}`);
    const content = [
      `斐波那契数列（前 ${params.count} 项，起始 ${params.fromZero ? '0, 1' : '1, 1'}）`,
      '',
      ...lines,
      '',
      `总和: ${total.toString()}`,
    ].join('\r\n');
    download(content, `fibonacci-${params.count}.txt`);
    toast.success('数列已下载');
  }

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="生成设置" description="使用 BigInt 计算，即使生成 1000 项也不会溢出">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label="项数 N"
              htmlFor="fib-count"
              required
              error={error}
              hint={`范围 1 - ${INT.format(MAX_TERMS)}；项数越多，数值位数越多`}
            >
              <Input
                id="fib-count"
                type="number"
                inputMode="numeric"
                min="1"
                max={MAX_TERMS}
                step="1"
                placeholder="例如 20"
                value={countInput}
                onChange={(event) => {
                  setCountInput(event.target.value);
                  setError(null);
                }}
                error={Boolean(error)}
              />
            </Field>

            <Field label="起始方式" htmlFor="fib-start" hint="两种写法只是起点不同，递推规则一致">
              <Select id="fib-start" value={fromZero ? '0' : '1'} onChange={(event) => changeStart(event.target.value === '0')}>
                <option value="1">1, 1, 2, 3, 5, 8 …（传统写法）</option>
                <option value="0">0, 1, 1, 2, 3, 5 …（从 F₀ 开始）</option>
              </Select>
            </Field>

            <Actions className="mt-0">
              <Button type="submit" icon={ListOrdered}>
                生成数列
              </Button>
              <Button variant="secondary" onClick={loadExample}>
                示例（前 20 项）
              </Button>
            </Actions>
          </form>

          <Hint>递推公式：F(n) = F(n−1) + F(n−2)。第 79 项起超出 JavaScript Number 的安全整数范围，因此这里全程使用 BigInt。</Hint>
        </Panel>

        <Panel title="统计">
          {summary ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Result label="项数" value={`${INT.format(summary.count)} 项`} hint={summary.fromZero ? '起始 0, 1' : '起始 1, 1'} />
                <Result label="末项位数" value={`${INT.format(summary.digits)} 位`} hint="末项十进制位数" />
                <Result label="数列总和" value={groupBigInt(summary.total)} mono hint="全部项的累加和" />
                <Result
                  label="相邻项比值"
                  value={summary.ratio === null ? '—' : summary.ratio.toFixed(10)}
                  mono
                  hint="末项 ÷ 倒数第二项，逐渐趋近黄金比例 1.6180339887"
                />
              </div>

              <KeyValue
                items={[
                  { label: '第 1 项', value: <span className="font-mono">{groupBigInt(summary.first)}</span> },
                  { label: `第 ${INT.format(summary.count)} 项`, value: <span className="font-mono break-all">{groupBigInt(summary.last)}</span> },
                  { label: '总和', value: <span className="font-mono break-all">{groupBigInt(summary.total)}</span> },
                ]}
              />
            </div>
          ) : (
            <EmptyState
              icon={ListOrdered}
              title="还没有生成数列"
              description="输入项数后点击「生成数列」，即可查看数列、总和与相邻项比值。"
              className="py-10"
              action={
                <Button icon={ListOrdered} onClick={loadExample}>
                  生成前 20 项
                </Button>
              }
            />
          )}
        </Panel>
      </ToolSplit>

      {sequence && summary ? (
        <Panel
          title="数列"
          description={`共 ${INT.format(summary.count)} 项，可滚动查看`}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={sequenceText} label="复制数列" />
              <Button variant="secondary" size="sm" icon={Download} onClick={downloadTxt}>
                下载 TXT
              </Button>
            </div>
          }
        >
          <div className="max-h-96 overflow-auto rounded-xl border p-2">
            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {sequence.map((term, index) => (
                <div key={index} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--hover-bg)]">
                  <span className="w-12 shrink-0 text-right font-mono subtle">{index + 1}</span>
                  <span className="min-w-0 break-all font-mono">{groupBigInt(term)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs subtle">复制得到以英文逗号分隔的原始数字；下载的 TXT 每行带有序号。</p>
        </Panel>
      ) : null}

      <Panel title="关于斐波那契数列">
        <ul className="space-y-1.5 text-sm muted">
          <li>数列从 0 或 1 开始，每一项等于前两项之和：1, 1, 2, 3, 5, 8, 13 …</li>
          <li>相邻两项的比值会趋近黄金比例 φ ≈ 1.6180339887，在自然界与设计中经常出现。</li>
          <li>前 N 项之和等于第 N+2 项减 1（按本工具起始方式计算）。</li>
          <li>全部计算在浏览器本地完成，不发送任何数据。</li>
        </ul>
      </Panel>
    </div>
  );
}
