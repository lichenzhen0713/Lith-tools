import { useEffect, useRef, useState } from 'react';
import { Calculator, FileDown, RefreshCw } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel, ToolSplit } from './kit';
import { Alert, Button, EmptyState, Switch, Tabs } from '../components/ui';
import { cn } from '../lib/utils';
import { useToast } from '../lib/toast';

type OperationType = 'addsub' | 'muldiv' | 'mixed';
type Op = '+' | '-' | '*' | '/';

interface Config {
  type: OperationType;
  min: number;
  max: number;
  count: number;
  operands: 2 | 3;
  brackets: boolean;
  allowNegative: boolean;
  allowDecimal: boolean;
}

interface Problem {
  id: number;
  text: string;
  answer: number;
}

const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const PRECEDENCE: Record<Op, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
const TYPE_LABEL: Record<OperationType, string> = {
  addsub: '加减法',
  muldiv: '乘除法',
  mixed: '四则混合',
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function apply(a: number, op: Op, b: number): number {
  switch (op) {
    case '+':
      return round4(a + b);
    case '-':
      return round4(a - b);
    case '*':
      return round4(a * b);
    case '/':
      return b === 0 ? Number.NaN : round4(a / b);
  }
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function isValidValue(value: number, config: Config): boolean {
  if (!Number.isFinite(value)) return false;
  if (Math.abs(value) > 100000) return false;
  if (!config.allowNegative && value < 0) return false;
  if (config.allowDecimal) return Math.abs(value * 10 - Math.round(value * 10)) < 1e-6;
  return Number.isInteger(value);
}

function makeOperand(min: number, max: number, allowDecimal: boolean): number {
  if (!allowDecimal) return randomInt(min, max);
  if (Math.random() < 0.5) return randomInt(min, max);
  return round4(randomInt(Math.round(min * 10), Math.round(max * 10)) / 10);
}

function opsFor(type: OperationType): Op[] {
  if (type === 'addsub') return ['+', '-'];
  if (type === 'muldiv') return ['*', '/'];
  return ['+', '-', '*', '/'];
}

/** Whether wrapping the inner operation in parentheses actually changes the value. */
function parenMeaningful(outer: Op, inner: Op): boolean {
  if (outer === '-' || outer === '/') return true;
  if (outer === '*') return PRECEDENCE[inner] === 1;
  return false;
}

function integerDivisors(value: number, min: number, max: number): number[] {
  const result: number[] = [];
  const target = Math.abs(value);
  if (target === 0) return result;
  const upper = Math.min(max, target);
  for (let divisor = Math.max(1, min); divisor <= upper; divisor += 1) {
    if (target % divisor === 0) result.push(divisor);
  }
  return result;
}

function buildSequential(
  config: Config,
  ops: Op[],
): { numbers: number[]; answer: number } | null {
  const numbers: number[] = [makeOperand(config.min, config.max, config.allowDecimal)];
  let acc = numbers[0];

  for (const op of ops) {
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      let operand: number;
      if (op === '-' && !config.allowNegative) {
        const upper = Math.min(config.max, Math.floor(acc));
        if (upper < config.min) break;
        operand = makeOperand(config.min, upper, config.allowDecimal);
      } else if (op === '/' && !config.allowDecimal) {
        const divisors = integerDivisors(acc, config.min, config.max);
        if (!divisors.length) break;
        operand = pick(divisors);
      } else {
        operand = makeOperand(config.min, config.max, config.allowDecimal);
      }
      const next = apply(acc, op, operand);
      if (!isValidValue(next, config)) continue;
      numbers.push(operand);
      acc = next;
      placed = true;
      break;
    }
    if (!placed) return null;
  }

  return { numbers, answer: acc };
}

function buildRightGroup(
  config: Config,
  outerOp: Op,
  innerOp: Op,
): { numbers: [number, number, number]; answer: number } | null {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const b = makeOperand(config.min, config.max, config.allowDecimal);
    let c: number;
    if (innerOp === '-' && !config.allowNegative) {
      const upper = Math.min(config.max, Math.floor(b));
      if (upper < config.min) continue;
      c = makeOperand(config.min, upper, config.allowDecimal);
    } else if (innerOp === '/' && !config.allowDecimal) {
      const divisors = integerDivisors(b, config.min, config.max);
      if (!divisors.length) continue;
      c = pick(divisors);
    } else {
      c = makeOperand(config.min, config.max, config.allowDecimal);
    }
    const inner = apply(b, innerOp, c);
    if (!isValidValue(inner, config)) continue;

    let a: number;
    if (outerOp === '-' && !config.allowNegative) {
      const lower = Math.max(config.min, Math.ceil(inner));
      if (lower > config.max) continue;
      a = makeOperand(lower, config.max, config.allowDecimal);
    } else if (outerOp === '/' && !config.allowDecimal && inner !== 0) {
      const maxFactor = Math.floor(config.max / Math.abs(inner));
      if (maxFactor < 1) continue;
      a = round4(inner * randomInt(1, maxFactor));
      if (a < config.min || a > config.max) continue;
    } else {
      a = makeOperand(config.min, config.max, config.allowDecimal);
    }

    const answer = apply(a, outerOp, inner);
    if (!isValidValue(answer, config)) continue;
    return { numbers: [a, b, c], answer };
  }
  return null;
}

function generateProblem(config: Config): { text: string; answer: number } | null {
  const pool = opsFor(config.type);

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const ops: Op[] = [];
    for (let index = 0; index < config.operands - 1; index += 1) ops.push(pick(pool));

    if (config.operands === 3 && config.brackets && Math.random() < 0.55) {
      const [outerOp, innerOp] = ops;
      if (!parenMeaningful(outerOp, innerOp)) continue;
      const grouped = buildRightGroup(config, outerOp, innerOp);
      if (!grouped) continue;
      const [a, b, c] = grouped.numbers;
      return {
        text: `${formatValue(a)} ${OP_SYMBOL[outerOp]} (${formatValue(b)} ${OP_SYMBOL[innerOp]} ${formatValue(c)})`,
        answer: grouped.answer,
      };
    }

    const built = buildSequential(config, ops);
    if (!built) continue;
    const numbers = built.numbers;

    if (config.operands === 3 && config.brackets) {
      if (!parenMeaningful(ops[1], ops[0])) continue;
      return {
        text: `(${formatValue(numbers[0])} ${OP_SYMBOL[ops[0]]} ${formatValue(numbers[1])}) ${OP_SYMBOL[ops[1]]} ${formatValue(numbers[2])}`,
        answer: built.answer,
      };
    }

    const text = numbers
      .map((number, index) => (index === 0 ? formatValue(number) : `${OP_SYMBOL[ops[index - 1]]} ${formatValue(number)}`))
      .join(' ');
    return { text, answer: built.answer };
  }

  return null;
}

function generateProblems(config: Config): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  let nextId = 0;

  const fill = (unique: boolean, budget: number) => {
    for (let attempt = 0; attempt < budget && problems.length < config.count; attempt += 1) {
      const generated = generateProblem(config);
      if (!generated) continue;
      const key = `${generated.text} = ${formatValue(generated.answer)}`;
      if (unique && seen.has(key)) continue;
      seen.add(key);
      nextId += 1;
      problems.push({ id: nextId, text: generated.text, answer: generated.answer });
    }
  };

  fill(true, Math.min(2500, Math.max(400, config.count * 25)));
  fill(false, config.count * 10);
  return problems;
}

/* ------------------------------------------------------------------ PDF sheet */

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 90;
const ROW_HEIGHT = 76;
const BODY_TOP = 320;
const BODY_BOTTOM = 90;
const ROWS_PER_PAGE = Math.floor((PAGE_HEIGHT - BODY_TOP - BODY_BOTTOM) / ROW_HEIGHT);
const COLUMNS = 2;
const PER_PAGE = ROWS_PER_PAGE * COLUMNS;

function describeConfig(config: Config): string {
  const parts = [
    TYPE_LABEL[config.type],
    `数字 ${config.min}–${config.max}`,
    config.operands === 3 ? '三项运算' : '两项运算',
  ];
  if (config.brackets) parts.push('含括号');
  parts.push(config.allowDecimal ? '含小数' : '整数');
  if (config.allowNegative) parts.push('含负数');
  return parts.join(' · ');
}

function preparePage(
  title: string,
  subtitle: string,
  page: number,
  pageCount: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';

  context.fillStyle = '#111827';
  context.font = 'bold 46px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  context.fillText(title, PAGE_MARGIN, 118);

  context.fillStyle = '#4b5563';
  context.font = '22px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  context.fillText(subtitle, PAGE_MARGIN, 160);

  context.textAlign = 'right';
  context.fillText(`第 ${page + 1} / ${pageCount} 页`, PAGE_WIDTH - PAGE_MARGIN, 118);

  context.strokeStyle = '#111827';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PAGE_MARGIN, 190);
  context.lineTo(PAGE_WIDTH - PAGE_MARGIN, 190);
  context.stroke();

  context.textAlign = 'left';
  context.fillStyle = '#111827';
  context.font = '24px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  context.fillText('姓名：________________', PAGE_MARGIN, 248);
  context.fillText('日期：________________', PAGE_MARGIN + 460, 248);
  context.textAlign = 'right';
  context.fillText('得分：________', PAGE_WIDTH - PAGE_MARGIN, 248);

  return { canvas, context };
}

function drawProblems(
  problems: Problem[],
  config: Config,
): HTMLCanvasElement[] {
  const pages: HTMLCanvasElement[] = [];
  const subtitle = describeConfig(config);
  const pageCount = Math.max(1, Math.ceil(problems.length / PER_PAGE));
  const columnWidth = (PAGE_WIDTH - PAGE_MARGIN * 2) / COLUMNS;

  for (let page = 0; page < pageCount; page += 1) {
    const prepared = preparePage('四则运算练习卷', subtitle, page, pageCount);
    if (!prepared) return pages;
    const { canvas, context } = prepared;
    const slice = problems.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    context.fillStyle = '#111827';
    context.textAlign = 'left';
    context.font = '600 30px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    for (let index = 0; index < slice.length; index += 1) {
      const problem = slice[index];
      const column = Math.floor(index / ROWS_PER_PAGE);
      const row = index % ROWS_PER_PAGE;
      const x = PAGE_MARGIN + column * columnWidth;
      const y = BODY_TOP + row * ROW_HEIGHT;
      context.fillText(`${problem.id}. ${problem.text} =`, x, y);
    }
    pages.push(canvas);
  }
  return pages;
}

function drawAnswers(problems: Problem[], config: Config): HTMLCanvasElement[] {
  const pages: HTMLCanvasElement[] = [];
  const subtitle = describeConfig(config);
  const pageCount = Math.max(1, Math.ceil(problems.length / PER_PAGE));
  const columnWidth = (PAGE_WIDTH - PAGE_MARGIN * 2) / COLUMNS;

  for (let page = 0; page < pageCount; page += 1) {
    const prepared = preparePage('参考答案', subtitle, page, pageCount);
    if (!prepared) return pages;
    const { canvas, context } = prepared;
    const slice = problems.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    context.fillStyle = '#111827';
    context.textAlign = 'left';
    context.font = '500 26px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    for (let index = 0; index < slice.length; index += 1) {
      const problem = slice[index];
      const column = Math.floor(index / ROWS_PER_PAGE);
      const row = index % ROWS_PER_PAGE;
      const x = PAGE_MARGIN + column * columnWidth;
      const y = BODY_TOP + row * ROW_HEIGHT;
      context.fillText(`${problem.id}. ${problem.text} = ${formatValue(problem.answer)}`, x, y);
    }
    pages.push(canvas);
  }
  return pages;
}

function renderWorksheet(problems: Problem[], config: Config, withAnswers: boolean): HTMLCanvasElement[] {
  const pages = drawProblems(problems, config);
  if (withAnswers && pages.length) pages.push(...drawAnswers(problems, config));
  return pages;
}

export default function ExpressionGeneratorTool() {
  const toast = useToast();
  const timerRef = useRef<number | null>(null);

  const [type, setType] = useState<OperationType>('addsub');
  const [minRaw, setMinRaw] = useState('1');
  const [maxRaw, setMaxRaw] = useState('10');
  const [countRaw, setCountRaw] = useState('20');
  const [operands, setOperands] = useState<2 | 3>(2);
  const [brackets, setBrackets] = useState(false);
  const [allowNegative, setAllowNegative] = useState(false);
  const [allowDecimal, setAllowDecimal] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [withAnswerPage, setWithAnswerPage] = useState(true);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [snapshot, setSnapshot] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const minValue = Number(minRaw);
  const maxValue = Number(maxRaw);
  const countValue = Number(countRaw);

  const minError =
    minRaw.trim() !== '' && (!Number.isInteger(minValue) || minValue < 0 || minValue > 999)
      ? '请输入 0–999 的整数'
      : null;
  const maxError =
    maxRaw.trim() !== '' && (!Number.isInteger(maxValue) || maxValue < 1 || maxValue > 999)
      ? '请输入 1–999 的整数'
      : maxRaw.trim() !== '' && minRaw.trim() !== '' && maxValue < minValue
        ? '最大值不能小于最小值'
        : null;
  const countError =
    countRaw.trim() !== '' && (!Number.isInteger(countValue) || countValue < 1 || countValue > 100)
      ? '请输入 1–100 的整数'
      : null;

  const generate = () => {
    if (minRaw.trim() === '' || maxRaw.trim() === '' || countRaw.trim() === '') {
      setError('请先填写数字范围与题目数量。');
      return;
    }
    if (minError || maxError || countError) {
      setError('请修正标红的输入项后再生成。');
      return;
    }
    if (maxValue < minValue) {
      setError('最大值不能小于最小值。');
      return;
    }

    const config: Config = {
      type,
      min: minValue,
      max: maxValue,
      count: countValue,
      operands,
      brackets: operands === 3 && brackets,
      allowNegative,
      allowDecimal,
    };

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setError(null);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const next = generateProblems(config);
      setProblems(next);
      setSnapshot(config);
      if (!next.length) {
        setError('当前设置下无法生成算式，请扩大数字范围或更换运算类型。');
      } else if (next.length < config.count) {
        toast.info(`只生成了 ${next.length} 道不重复的题目，可扩大范围后重试`);
      }
    }, 30);
  };

  const exportPdf = async () => {
    if (!problems.length || !snapshot) return;
    setExporting(true);
    setError(null);
    try {
      const { jsPDF } = await import('jspdf');
      const pages = renderWorksheet(problems, snapshot, withAnswerPage);
      if (!pages.length) throw new Error('无法创建导出画布，请更换浏览器后重试。');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pages.forEach((page, index) => {
        if (index > 0) pdf.addPage();
        pdf.addImage(page.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      });
      pdf.save('math-worksheet.pdf');
      toast.success('练习卷 PDF 已生成');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出 PDF 失败，请重试。');
    } finally {
      setExporting(false);
    }
  };

  const resetOptions = () => {
    setType('addsub');
    setMinRaw('1');
    setMaxRaw('10');
    setCountRaw('20');
    setOperands(2);
    setBrackets(false);
    setAllowNegative(false);
    setAllowDecimal(false);
    setError(null);
  };

  const answeredCount = problems.length;

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="出题设置" description="算式在浏览器内生成，不依赖任何在线服务。">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              generate();
            }}
          >
            <div>
              <p className="label">运算类型</p>
              <Tabs<OperationType>
                items={[
                  { value: 'addsub', label: '加减' },
                  { value: 'muldiv', label: '乘除' },
                  { value: 'mixed', label: '混合' },
                ]}
                value={type}
                onChange={setType}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="最小值" htmlFor="expr-min" error={minError}>
                <Input
                  id="expr-min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  step={1}
                  value={minRaw}
                  error={Boolean(minError)}
                  onChange={(event) => setMinRaw(event.target.value)}
                />
              </Field>
              <Field label="最大值" htmlFor="expr-max" error={maxError}>
                <Input
                  id="expr-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  step={1}
                  value={maxRaw}
                  error={Boolean(maxError)}
                  onChange={(event) => setMaxRaw(event.target.value)}
                />
              </Field>
              <Field label="题目数量" htmlFor="expr-count" error={countError}>
                <Input
                  id="expr-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step={1}
                  value={countRaw}
                  error={Boolean(countError)}
                  onChange={(event) => setCountRaw(event.target.value)}
                />
              </Field>
            </div>

            <div>
              <p className="label">运算项数</p>
              <div className="flex flex-wrap gap-2">
                {([2, 3] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn('chip', operands === value && 'chip-active')}
                    onClick={() => setOperands(value)}
                  >
                    {value} 项
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Switch
                  checked={operands === 3 && brackets}
                  disabled={operands === 2}
                  onChange={setBrackets}
                  label="包含括号"
                />
                <Switch checked={allowNegative} onChange={setAllowNegative} label="允许负数结果" />
              </div>
              <div className="space-y-3">
                <Switch checked={allowDecimal} onChange={setAllowDecimal} label="允许小数" />
                <Switch checked={showAnswers} onChange={setShowAnswers} label="显示答案" />
              </div>
            </div>

            <Hint>
              {operands === 2
                ? '只有两项运算时括号没有意义，选择 3 项后才能启用括号。'
                : '括号会以「a × (b + c)」或「(a + b) × c」的形式出现，并保证不改变运算结果。'}
            </Hint>

            <Actions className="mt-0">
              <Button type="submit" icon={Calculator}>
                生成题目
              </Button>
              <Button variant="secondary" icon={RefreshCw} onClick={resetOptions}>
                恢复默认
              </Button>
            </Actions>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <Hint>
              除法只生成能整除（或小数点后不超过一位）的算式；提示「无解」时请扩大数字范围。
            </Hint>
          </form>
        </Panel>

        <Panel
          title="题目与答案"
          description={snapshot ? describeConfig(snapshot) : '生成后在这里查看题目。'}
          footer={
            <div className="flex flex-wrap items-center gap-3">
              <Switch checked={withAnswerPage} onChange={setWithAnswerPage} label="PDF 附答案页" />
              <Button
                icon={FileDown}
                loading={exporting}
                disabled={!answeredCount || exporting}
                onClick={() => void exportPdf()}
              >
                导出 PDF 练习卷
              </Button>
            </div>
          }
        >
          {!problems.length ? (
            <EmptyState
              icon={Calculator}
              title="还没有生成题目"
              description="设置运算类型、数字范围与题目数量，然后点击「生成题目」。"
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs subtle">
                <span>共 {problems.length} 道题</span>
                <span>{showAnswers ? '答案已显示' : '答案已隐藏'}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {problems.map((problem) => (
                  <div
                    key={problem.id}
                    className="flex items-baseline justify-between gap-2 rounded-xl border px-3 py-2.5 font-mono text-sm"
                  >
                    <span className="truncate">
                      <span className="mr-1.5 text-xs subtle">{problem.id}.</span>
                      {problem.text} =
                    </span>
                    {showAnswers ? (
                      <span className="shrink-0 font-semibold text-indigo-600 dark:text-indigo-400">
                        {formatValue(problem.answer)}
                      </span>
                    ) : (
                      <span className="mt-1 h-3.5 w-10 shrink-0 rounded-sm border-b border-dashed border-slate-400 dark:border-slate-500" />
                    )}
                  </div>
                ))}
              </div>
              <Hint>
                导出的 PDF 使用浏览器本地绘制后写入 jsPDF：A4 纵向、每页 {PER_PAGE} 道题，可选是否附加答案页。
              </Hint>
            </div>
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
