import { useMemo, useState } from 'react';
import { Dices, Download } from 'lucide-react';
import { Actions, Field, Hint, Panel, ToolSplit } from './kit';
import { Alert, Button, CopyButton, EmptyState, Input, Select, Switch } from '../components/ui';
import { download, formatNumber } from '../lib/utils';
import { useToast } from '../lib/toast';

type SortMode = 'none' | 'asc' | 'desc';

interface Config {
  count: number;
  decimals: number;
  scale: number;
  lowTick: number;
  range: number;
}

interface Errors {
  min?: string;
  max?: string;
  count?: string;
  decimals?: string;
}

const MAX_COUNT = 1000;
const MAX_ABS = 1_000_000_000;
const MAX_DECIMALS = 6;

function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
}

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

/** Uniform float in [0, 1) with 53 bits of entropy from the Web Crypto RNG. */
function randomFloat53(): number {
  const buffer = new Uint32Array(2);
  crypto.getRandomValues(buffer);
  const high = buffer[0] >>> 21;
  const low = buffer[1];
  return (high * 4294967296 + low) / 9007199254740992;
}

/** Cryptographically strong integer in [min, max] (inclusive), rejection sampled. */
function randomIntInclusive(min: number, max: number): number {
  const range = max - min + 1;
  if (!Number.isFinite(range) || range <= 0) return min;
  if (range <= 4294967296) {
    const limit = Math.floor(4294967296 / range) * range;
    let value = randomUint32();
    let guard = 0;
    while (value >= limit && guard < 128) {
      value = randomUint32();
      guard += 1;
    }
    return min + (value % range);
  }
  return min + Math.floor(randomFloat53() * range);
}

/** Floyd's sampling: `count` distinct integers in [0, range) without biasing. */
function sampleDistinct(count: number, range: number): number[] {
  const chosen = new Set<number>();
  const picked: number[] = [];
  for (let cursor = range - count; cursor < range; cursor += 1) {
    const candidate = randomIntInclusive(0, cursor);
    if (chosen.has(candidate)) {
      chosen.add(cursor);
      picked.push(cursor);
    } else {
      chosen.add(candidate);
      picked.push(candidate);
    }
  }
  return picked;
}

export default function RandomNumberTool() {
  const toast = useToast();
  const [kind, setKind] = useState<'integer' | 'decimal'>('integer');
  const [minRaw, setMinRaw] = useState('0');
  const [maxRaw, setMaxRaw] = useState('100');
  const [countRaw, setCountRaw] = useState('5');
  const [decimalsRaw, setDecimalsRaw] = useState('2');
  const [unique, setUnique] = useState(true);
  const [sort, setSort] = useState<SortMode>('none');
  const [results, setResults] = useState<string[] | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  const decimal = kind === 'decimal';

  const analysis = useMemo(() => {
    const errors: Errors = {};
    const min = Number(minRaw);
    const max = Number(maxRaw);
    const count = Number(countRaw);
    const decimals = decimal ? Number(decimalsRaw) : 0;

    if (minRaw.trim() === '' || !Number.isFinite(min)) {
      errors.min = '请输入有效的最小值';
    } else if (Math.abs(min) > MAX_ABS) {
      errors.min = `绝对值不能超过 ${formatNumber(MAX_ABS)}`;
    }

    if (maxRaw.trim() === '' || !Number.isFinite(max)) {
      errors.max = '请输入有效的最大值';
    } else if (Math.abs(max) > MAX_ABS) {
      errors.max = `绝对值不能超过 ${formatNumber(MAX_ABS)}`;
    } else if (!errors.min && min > max) {
      errors.max = '最大值必须大于或等于最小值';
    }

    if (
      countRaw.trim() === '' ||
      !Number.isFinite(count) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_COUNT
    ) {
      errors.count = `数量必须是 1 到 ${MAX_COUNT} 之间的整数`;
    }

    if (decimal && (!Number.isInteger(decimals) || decimals < 1 || decimals > MAX_DECIMALS)) {
      errors.decimals = `小数位数需为 1 到 ${MAX_DECIMALS} 之间的整数`;
    }

    let scale = 1;
    let lowTick = 0;
    let range = 0;
    if (!errors.min && !errors.max) {
      scale = decimal && Number.isInteger(decimals) && decimals > 0 ? 10 ** decimals : 1;
      lowTick = Math.ceil(min * scale - 1e-9);
      const highTick = Math.floor(max * scale + 1e-9);
      range = highTick - lowTick + 1;
      if (range < 1) {
        errors.max = decimal ? '当前范围没有可用的小数取值，请放宽范围或减少小数位数' : '当前范围没有可用的整数取值';
      }
    }

    if (
      !errors.count &&
      unique &&
      range > 0 &&
      Number.isInteger(count) &&
      count > range
    ) {
      errors.count = `不重复模式下最多只能生成 ${formatNumber(range)} 个不同的值`;
    }

    const critical = errors.min ?? errors.max ?? errors.count ?? errors.decimals ?? null;
    const config: Config | null =
      critical === null
        ? { count, decimals: decimal ? decimals : 0, scale, lowTick, range }
        : null;
    return { errors, critical, config };
  }, [minRaw, maxRaw, countRaw, decimalsRaw, decimal, unique]);

  const resultText = results ? results.join('\n') : '';

  const generate = () => {
    const config = analysis.config;
    if (!config) {
      setAlert(analysis.critical ?? '请先修正参数');
      return;
    }
    if (!cryptoAvailable()) {
      setAlert('当前浏览器不支持 Web Crypto，无法生成安全随机数');
      return;
    }
    const indices = unique
      ? sampleDistinct(config.count, config.range)
      : Array.from({ length: config.count }, () => randomIntInclusive(0, config.range - 1));
    const numbers = indices.map((offset) => config.lowTick + offset);
    if (sort !== 'none') {
      numbers.sort((a, b) => (sort === 'asc' ? a - b : b - a));
    }
    const formatted = numbers.map((value) =>
      config.decimals > 0 ? (value / config.scale).toFixed(config.decimals) : String(value),
    );
    setResults(formatted);
    setAlert(null);
    toast.success(`已生成 ${formatted.length} 个随机数`);
  };

  const handleDownload = () => {
    if (!resultText) return;
    download(resultText, 'random-numbers.txt');
    toast.success('已下载 random-numbers.txt');
  };

  const reset = () => {
    setMinRaw('0');
    setMaxRaw('100');
    setCountRaw('5');
    setDecimalsRaw('2');
    setUnique(true);
    setSort('none');
    setResults(null);
    setAlert(null);
  };

  const summary =
    results && results.length > 0
      ? `共 ${formatNumber(results.length)} 个 · 类型 ${decimal ? `小数（${analysis.config?.decimals ?? 0} 位）` : '整数'} · ${
          unique ? '已去重' : '允许重复'
        }`
      : '';

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="参数设置" description="使用浏览器内置的 Web Crypto 生成密码学安全的随机数">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              generate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="数值类型" htmlFor="rn-kind">
                <Select
                  id="rn-kind"
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value === 'decimal' ? 'decimal' : 'integer');
                    setResults(null);
                  }}
                >
                  <option value="integer">整数</option>
                  <option value="decimal">小数</option>
                </Select>
              </Field>

              <Field
                label="生成数量"
                htmlFor="rn-count"
                error={analysis.errors.count}
                hint={`1 到 ${MAX_COUNT}`}
              >
                <Input
                  id="rn-count"
                  inputMode="numeric"
                  value={countRaw}
                  error={Boolean(analysis.errors.count)}
                  onChange={(event) => setCountRaw(event.target.value)}
                />
              </Field>

              <Field label="最小值" htmlFor="rn-min" error={analysis.errors.min}>
                <Input
                  id="rn-min"
                  inputMode="decimal"
                  value={minRaw}
                  error={Boolean(analysis.errors.min)}
                  onChange={(event) => setMinRaw(event.target.value)}
                />
              </Field>

              <Field label="最大值" htmlFor="rn-max" error={analysis.errors.max}>
                <Input
                  id="rn-max"
                  inputMode="decimal"
                  value={maxRaw}
                  error={Boolean(analysis.errors.max)}
                  onChange={(event) => setMaxRaw(event.target.value)}
                />
              </Field>

              {decimal ? (
                <Field
                  label="小数位数"
                  htmlFor="rn-decimals"
                  error={analysis.errors.decimals}
                  hint={`1 到 ${MAX_DECIMALS} 位，按四舍五入输出`}
                >
                  <Select
                    id="rn-decimals"
                    value={decimalsRaw}
                    onChange={(event) => setDecimalsRaw(event.target.value)}
                  >
                    {Array.from({ length: MAX_DECIMALS }, (_, index) => String(index + 1)).map((value) => (
                      <option key={value} value={value}>
                        {value} 位
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <Field label="排序方式" htmlFor="rn-sort">
                <Select
                  id="rn-sort"
                  value={sort}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSort(value === 'asc' || value === 'desc' ? value : 'none');
                  }}
                >
                  <option value="none">保持随机顺序</option>
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
              <div>
                <p className="text-sm font-medium">结果不重复</p>
                <p className="text-xs subtle">
                  {decimal ? '按小数位数精确去重' : '同一批结果中不会出现相同数字'}
                </p>
              </div>
              <Switch checked={unique} onChange={setUnique} label={unique ? '已开启' : '已关闭'} />
            </div>

            {analysis.critical ? <Alert tone="error">{analysis.critical}</Alert> : null}
            {alert && alert !== analysis.critical ? <Alert tone="error">{alert}</Alert> : null}

            <Actions className="mt-1">
              <Button type="submit" icon={Dices}>
                生成随机数
              </Button>
              <Button variant="secondary" type="button" onClick={reset}>
                重置参数
              </Button>
            </Actions>

            <Hint>
              随机源为 <span className="font-mono">crypto.getRandomValues</span>
              ，未使用可预测的伪随机数，适合抽奖、验证码、抽样等场景。
            </Hint>
          </form>
        </Panel>

        <Panel
          title="生成结果"
          description={summary || '结果会显示在这里，可一键复制或下载为 .txt'}
          footer={
            results ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs subtle">随机顺序 {sort === 'none' ? '未排序' : sort === 'asc' ? '升序' : '降序'}</span>
                <Button icon={Download} size="sm" variant="secondary" type="button" onClick={handleDownload}>
                  下载 .txt
                </Button>
              </div>
            ) : null
          }
        >
          {results ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={resultText} label="复制全部" />
                <span className="text-xs subtle">共 {formatNumber(results.length)} 个结果</span>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-xl border p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {results.map((value, index) => (
                    <span
                      key={`${value}-${index}`}
                      title={value}
                      className="truncate rounded-lg bg-[var(--hover-bg)] px-2.5 py-1.5 text-center font-mono text-sm"
                    >
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Dices}
              title="还没有生成随机数"
              description="设置范围、数量与去重方式后点击「生成随机数」，支持整数与小数。"
            />
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
