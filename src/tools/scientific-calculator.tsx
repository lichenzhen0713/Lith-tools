import { useEffect, useRef, useState } from 'react';
import { Calculator, Delete, RotateCcw, Sigma } from 'lucide-react';
import { Alert, Badge, Button, CopyButton, EmptyState, Kbd, Tabs } from '../components/ui';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';
import { cn } from '../lib/utils';

/* ---------------------------------------------------------------------------
 * 安全表达式求值：手写词法分析 + 递归下降（含函数调用、右结合乘方、后缀阶乘）。
 * 完全不使用 eval / new Function。
 * ------------------------------------------------------------------------- */

type AngleMode = 'deg' | 'rad';

type SciToken = { kind: 'number'; value: number } | { kind: 'name'; value: string } | { kind: 'op'; value: string };

interface EvalOptions {
  angle: AngleMode;
  ans: number | null;
}

const OPERATOR_CHARS = new Set(['+', '-', '*', '/', '^', '%', '!', '(', ')', ',']);

function tokenize(input: string): SciToken[] {
  const text = input
    .replace(/[×✕·]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/\*\*/g, '^')
    .replace(/\s+/g, ' ');

  const tokens: SciToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === ' ') {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let end = index;
      let dots = 0;
      while (end < text.length && /[0-9.]/.test(text[end])) {
        if (text[end] === '.') dots += 1;
        end += 1;
      }
      const raw = text.slice(index, end);
      if (dots > 1 || raw === '.') throw new Error(`数字格式有误：「${raw}」`);

      // 支持 1e-3 这类科学计数法
      if (text[end] === 'e' || text[end] === 'E') {
        let expEnd = end + 1;
        if (text[expEnd] === '+' || text[expEnd] === '-') expEnd += 1;
        if (/[0-9]/.test(text[expEnd] ?? '')) {
          while (expEnd < text.length && /[0-9]/.test(text[expEnd])) expEnd += 1;
          end = expEnd;
        }
      }

      const value = Number(text.slice(index, end));
      if (!Number.isFinite(value)) throw new Error(`数字无法解析：「${text.slice(index, end)}」`);
      tokens.push({ kind: 'number', value });
      index = end;
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      let end = index;
      while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end += 1;
      tokens.push({ kind: 'name', value: text.slice(index, end).toLowerCase() });
      index = end;
      continue;
    }

    if (OPERATOR_CHARS.has(char)) {
      tokens.push({ kind: 'op', value: char });
      index += 1;
      continue;
    }

    throw new Error(`无法识别的字符「${char}」`);
  }

  return tokens;
}

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error('阶乘只支持非负整数');
  if (value > 170) throw new Error('阶乘结果过大（最多支持 170!）');
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function evaluateSci(input: string, options: EvalOptions): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error('请输入表达式');

  const toRad = (value: number): number => (options.angle === 'deg' ? (value * Math.PI) / 180 : value);
  const fromRad = (value: number): number => (options.angle === 'deg' ? (value * 180) / Math.PI : value);

  const unaryFns: Record<string, (value: number) => number> = {
    sin: (value) => Math.sin(toRad(value)),
    cos: (value) => Math.cos(toRad(value)),
    tan: (value) => {
      const radians = toRad(value);
      if (Math.abs(Math.cos(radians)) < 1e-12) throw new Error('该角度的正切无定义');
      return Math.tan(radians);
    },
    asin: (value) => {
      if (value < -1 || value > 1) throw new Error('asin 的参数必须在 -1 到 1 之间');
      return fromRad(Math.asin(value));
    },
    acos: (value) => {
      if (value < -1 || value > 1) throw new Error('acos 的参数必须在 -1 到 1 之间');
      return fromRad(Math.acos(value));
    },
    atan: (value) => fromRad(Math.atan(value)),
    ln: (value) => {
      if (value <= 0) throw new Error('ln 的参数必须大于 0');
      return Math.log(value);
    },
    log: (value) => {
      if (value <= 0) throw new Error('log 的参数必须大于 0');
      return Math.log10(value);
    },
    log2: (value) => {
      if (value <= 0) throw new Error('log2 的参数必须大于 0');
      return Math.log2(value);
    },
    log10: (value) => {
      if (value <= 0) throw new Error('log10 的参数必须大于 0');
      return Math.log10(value);
    },
    sqrt: (value) => {
      if (value < 0) throw new Error('负数不能开平方');
      return Math.sqrt(value);
    },
    cbrt: (value) => Math.cbrt(value),
    abs: (value) => Math.abs(value),
    exp: (value) => Math.exp(value),
    floor: (value) => Math.floor(value),
    ceil: (value) => Math.ceil(value),
    round: (value) => Math.round(value),
    sign: (value) => Math.sign(value),
    fact: (value) => factorial(value),
  };

  const binaryFns: Record<string, (left: number, right: number) => number> = {
    pow: (left, right) => Math.pow(left, right),
    mod: (left, right) => {
      if (right === 0) throw new Error('取余的除数不能为 0');
      return left % right;
    },
    atan2: (left, right) => fromRad(Math.atan2(left, right)),
  };

  let position = 0;
  const peek = (): SciToken | undefined => tokens[position];

  function startsValue(token: SciToken | undefined): boolean {
    if (!token) return false;
    if (token.kind === 'number' || token.kind === 'name') return true;
    return token.kind === 'op' && (token.value === '(' || token.value === '-' || token.value === '+');
  }

  function applyFunction(name: string, args: number[]): number {
    if (name === 'min' || name === 'max') {
      if (args.length === 0) throw new Error(`函数「${name}」至少需要 1 个参数`);
      return name === 'min' ? Math.min(...args) : Math.max(...args);
    }
    if (Object.prototype.hasOwnProperty.call(unaryFns, name)) {
      if (args.length !== 1) throw new Error(`函数「${name}」需要 1 个参数`);
      return unaryFns[name](args[0]);
    }
    if (Object.prototype.hasOwnProperty.call(binaryFns, name)) {
      if (args.length !== 2) throw new Error(`函数「${name}」需要 2 个参数`);
      return binaryFns[name](args[0], args[1]);
    }
    throw new Error(`未知的函数「${name}」`);
  }

  function constantValue(name: string): number {
    switch (name) {
      case 'pi':
        return Math.PI;
      case 'e':
        return Math.E;
      case 'tau':
        return Math.PI * 2;
      case 'ans':
        if (options.ans === null) throw new Error('还没有可用的 Ans，请先计算一次');
        return options.ans;
      default:
        if (Object.prototype.hasOwnProperty.call(unaryFns, name) || Object.prototype.hasOwnProperty.call(binaryFns, name)) {
          throw new Error(`函数「${name}」需要括号，例如 ${name}(x)`);
        }
        throw new Error(`未知的名称「${name}」`);
    }
  }

  function expression(): number {
    let value = term();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'op' || (token.value !== '+' && token.value !== '-')) break;
      position += 1;
      const right = term();
      value = token.value === '+' ? value + right : value - right;
    }
    return value;
  }

  function term(): number {
    let value = unary();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'op') break;
      if (token.value !== '*' && token.value !== '/' && token.value !== '%') break;
      // % 在两个操作数之间是取余，出现在表达式末尾/括号前是百分比
      if (token.value === '%' && !startsValue(tokens[position + 1])) break;
      position += 1;
      const right = unary();
      if ((token.value === '/' || token.value === '%') && right === 0) {
        throw new Error(token.value === '/' ? '除数不能为 0' : '取余的除数不能为 0');
      }
      if (token.value === '*') value *= right;
      else if (token.value === '/') value /= right;
      else value %= right;
    }
    return value;
  }

  function unary(): number {
    const token = peek();
    if (token && token.kind === 'op' && (token.value === '+' || token.value === '-')) {
      position += 1;
      const value = unary();
      return token.value === '-' ? -value : value;
    }
    return power();
  }

  function power(): number {
    const base = postfix();
    const token = peek();
    if (token && token.kind === 'op' && token.value === '^') {
      position += 1;
      const exponent = unary();
      const result = Math.pow(base, exponent);
      if (Number.isNaN(result)) throw new Error('幂运算结果无定义（例如负数开偶次方）');
      if (!Number.isFinite(result)) throw new Error('幂运算结果超出可计算范围');
      return result;
    }
    return base;
  }

  function postfix(): number {
    let value = primary();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'op') break;
      if (token.value === '!') {
        position += 1;
        value = factorial(value);
        continue;
      }
      if (token.value === '%') {
        if (startsValue(tokens[position + 1])) break;
        position += 1;
        value /= 100;
        continue;
      }
      break;
    }
    return value;
  }

  function primary(): number {
    const token = peek();
    if (!token) throw new Error('表达式不完整，请补全数字或括号');

    if (token.kind === 'number') {
      position += 1;
      return token.value;
    }

    if (token.kind === 'name') {
      position += 1;
      const name = token.value;
      const following = peek();
      if (following && following.kind === 'op' && following.value === '(') {
        position += 1;
        const args: number[] = [];
        const emptyArgs = peek();
        if (!(emptyArgs && emptyArgs.kind === 'op' && emptyArgs.value === ')')) {
          for (;;) {
            args.push(expression());
            const separator = peek();
            if (separator && separator.kind === 'op' && separator.value === ',') {
              position += 1;
              continue;
            }
            break;
          }
        }
        const closing = peek();
        if (!closing || closing.kind !== 'op' || closing.value !== ')') throw new Error(`函数「${name}」的括号没有闭合`);
        position += 1;
        return applyFunction(name, args);
      }
      return constantValue(name);
    }

    if (token.value === '(') {
      position += 1;
      const value = expression();
      const closing = peek();
      if (!closing || closing.kind !== 'op' || closing.value !== ')') throw new Error('括号不匹配，缺少右括号');
      position += 1;
      return value;
    }

    throw new Error('表达式有误，请检查运算符位置');
  }

  const result = expression();
  if (position < tokens.length) throw new Error('表达式有误：请检查是否漏写运算符（例如 2π 需写作 2*π）');
  if (!Number.isFinite(result)) throw new Error('结果超出可计算范围');
  return result;
}

/** 输入预处理：统一符号、去掉结尾多余运算符、自动补全右括号。 */
function prepareExpression(raw: string): string {
  let text = raw
    .replace(/[×✕·]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/\*\*/g, '^')
    .replace(/\s+/g, ' ')
    .trim();

  text = text.replace(/[+\-*/^,\s]+$/, '');

  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
  }
  return text + ')'.repeat(depth);
}

function formatSci(value: number): string {
  if (!Number.isFinite(value)) return '未定义';
  if (value === 0) return '0';
  const rounded = Number(value.toPrecision(12));
  const magnitude = Math.abs(rounded);
  if (magnitude >= 1e15 || magnitude < 1e-9) return rounded.toExponential(8);
  return String(rounded);
}

interface SciKey {
  label: string;
  insert?: string;
  action?: 'clear' | 'backspace';
}

const FUNCTION_KEYS: SciKey[] = [
  { label: 'sin', insert: 'sin(' },
  { label: 'cos', insert: 'cos(' },
  { label: 'tan', insert: 'tan(' },
  { label: 'asin', insert: 'asin(' },
  { label: 'acos', insert: 'acos(' },
  { label: 'atan', insert: 'atan(' },
  { label: 'ln', insert: 'ln(' },
  { label: 'log', insert: 'log(' },
  { label: '√', insert: 'sqrt(' },
  { label: 'x²', insert: '^2' },
  { label: 'x^y', insert: '^' },
  { label: 'n!', insert: '!' },
  { label: 'mod', insert: ' % ' },
  { label: 'π', insert: 'pi' },
  { label: 'e', insert: 'e' },
];

const PAD_ROWS: SciKey[][] = [
  [{ label: '(', insert: '(' }, { label: ')', insert: ')' }, { label: 'C', action: 'clear' }, { label: '⌫', action: 'backspace' }],
  [{ label: '7', insert: '7' }, { label: '8', insert: '8' }, { label: '9', insert: '9' }, { label: '/', insert: '/' }],
  [{ label: '4', insert: '4' }, { label: '5', insert: '5' }, { label: '6', insert: '6' }, { label: '*', insert: '*' }],
  [{ label: '1', insert: '1' }, { label: '2', insert: '2' }, { label: '3', insert: '3' }, { label: '-', insert: '-' }],
  [{ label: '0', insert: '0' }, { label: '.', insert: '.' }, { label: 'Ans', insert: 'ans' }, { label: '+', insert: '+' }],
];

const PAD_SYMBOLS: Partial<Record<string, string>> = { '/': '÷', '*': '×', '-': '−' };

const EXAMPLES = ['sin(30)+cos(60)', 'sqrt(2)*10', '2^10', 'ln(e^2)', '100*15%', 'fact(6)+1', 'log(1000)'];

export default function ScientificCalculatorTool() {
  const [expression, setExpression] = useState('');
  const [angle, setAngle] = useState<AngleMode>('deg');
  const [result, setResult] = useState<{ value: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ans, setAns] = useState<number | null>(null);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);

  function clearAll() {
    setExpression('');
    setResult(null);
    setError(null);
    setJustEvaluated(false);
  }

  function insert(text: string) {
    setError(null);
    const continues = /^[+\-*/^%!)]/.test(text);
    const base = justEvaluated ? (continues && result ? String(result.value) : '') : expression;
    setExpression((base + text).slice(0, 160));
    setJustEvaluated(false);
    setResult(null);
  }

  function backspace() {
    setError(null);
    setResult(null);
    setJustEvaluated(false);
    setExpression((previous) => previous.slice(0, -1));
  }

  function run(raw: string, mode: AngleMode = angle) {
    const prepared = prepareExpression(raw);
    if (!prepared) {
      setExpression('');
      setResult(null);
      setError('请输入表达式');
      return;
    }
    try {
      const value = evaluateSci(prepared, { angle: mode, ans });
      setExpression(prepared);
      setResult({ value, text: formatSci(value) });
      setAns(value);
      setError(null);
      setJustEvaluated(true);
    } catch (caught) {
      setExpression(raw);
      setResult(null);
      setError(caught instanceof Error ? caught.message : '表达式有误');
      setJustEvaluated(false);
    }
  }

  function changeAngle(next: AngleMode) {
    if (next === angle) return;
    setAngle(next);
    const current = expression.trim();
    if (current) run(current, next);
  }

  function pressKey(key: SciKey) {
    if (key.action === 'clear') {
      clearAll();
      return;
    }
    if (key.action === 'backspace') {
      backspace();
      return;
    }
    insert(key.insert ?? '');
  }

  keyHandler.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    const key = event.key;
    if (/^[0-9]$/.test(key) || key === '.' || key === '(' || key === ')' || key === '^' || key === '!' || key === '%' || key === ',') {
      event.preventDefault();
      insert(key);
      return;
    }
    if (key === '+' || key === '-' || key === '*' || key === '/' || key === 'x' || key === 'X') {
      event.preventDefault();
      insert(key === 'x' || key === 'X' ? '*' : key);
      return;
    }
    if (key === 'Enter' || key === '=') {
      event.preventDefault();
      run(expression);
      return;
    }
    if (key === 'Backspace') {
      event.preventDefault();
      backspace();
      return;
    }
    if (key === 'Escape' || key === 'Delete') {
      event.preventDefault();
      clearAll();
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const keypadClass =
    'flex h-11 items-center justify-center rounded-xl border text-sm font-medium transition-colors select-none hover:bg-[var(--hover-bg)] active:scale-[0.98]';

  return (
    <div className="space-y-4">
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(expression);
          }}
          className="space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs subtle">表达式</p>
            <div className="flex items-center gap-2">
              <Badge tone="brand">{angle === 'deg' ? '角度 DEG' : '弧度 RAD'}</Badge>
              {ans !== null ? <Badge>Ans = {formatSci(ans)}</Badge> : null}
            </div>
          </div>
          <label htmlFor="scientific-calculator-expression" className="sr-only">
            科学计算表达式
          </label>
          <input
            id="scientific-calculator-expression"
            value={expression}
            onChange={(event) => {
              setExpression(event.target.value.replace(/[^0-9a-zA-Z+\-*/^%!.,()×÷−π√（）,\s]/g, '').slice(0, 160));
              setResult(null);
              setError(null);
              setJustEvaluated(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                clearAll();
              }
            }}
            placeholder="例如 sin(30)+sqrt(2)^2"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            className="w-full rounded-xl bg-[var(--hover-bg)] px-4 py-3 text-right font-mono text-xl font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <div className="flex min-h-12 items-center justify-end gap-2 rounded-xl border px-4 py-2">
            {error ? (
              <p className="flex-1 text-right text-sm text-rose-600 dark:text-rose-400" role="alert">
                {error}
              </p>
            ) : result ? (
              <>
                <p className="min-w-0 flex-1 truncate text-right font-mono text-xl font-semibold text-indigo-600 dark:text-indigo-400" aria-live="polite">
                  = {result.text}
                </p>
                <CopyButton text={result.text} label="复制" />
              </>
            ) : (
              <p className="flex-1 text-right text-sm subtle">
                {expression.trim() ? '按 Enter 或点击「计算」' : '输入表达式，或点击下方按键'}
              </p>
            )}
          </div>
        </form>
      </Panel>

      <ToolSplit>
        <Panel title="按键" description="三角函数跟随上方角度模式；% 在末尾表示百分比，在两个数之间表示取余">
          <Tabs
            items={[
              { value: 'deg', label: '角度 DEG' },
              { value: 'rad', label: '弧度 RAD' },
            ]}
            value={angle}
            onChange={(value) => changeAngle(value === 'rad' ? 'rad' : 'deg')}
            className="mb-4"
          />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {FUNCTION_KEYS.map((key) => (
              <button key={key.label} type="button" onClick={() => pressKey(key)} className={cn(keypadClass, 'text-indigo-600 dark:text-indigo-400')}>
                {key.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PAD_ROWS.flatMap((row) =>
              row.map((key) => (
                <button
                  key={key.label}
                  type="button"
                  onClick={() => pressKey(key)}
                  aria-label={key.label === '⌫' ? '退格' : key.label === 'C' ? '清除' : undefined}
                  className={cn(
                    keypadClass,
                    'h-12 text-base',
                    key.label === 'C' && 'text-rose-600 dark:text-rose-400',
                    key.label === '⌫' && 'text-[var(--text-secondary)]',
                    '+-*/'.includes(key.label) && 'text-indigo-600 dark:text-indigo-400',
                  )}
                >
                  {key.label === '⌫' ? <Delete className="size-4" /> : (PAD_SYMBOLS[key.label] ?? key.label)}
                </button>
              )),
            )}
          </div>
          <Actions>
            <Button className="flex-1" onClick={() => run(expression)}>
              计算
            </Button>
            <Button variant="secondary" icon={RotateCcw} onClick={clearAll}>
              清空
            </Button>
          </Actions>
          <p className="mt-3 text-xs leading-relaxed subtle">
            支持键盘输入：数字、+ - * / ^ ! % 与括号；Enter 计算、Backspace 退格、Esc 清空。结果保留 12 位有效数字。
          </p>
        </Panel>

        <div className="space-y-4">
          <Panel title="结果">
            {error ? (
              <Alert tone="error" title="无法计算">
                {error}
              </Alert>
            ) : result ? (
              <div className="space-y-3">
                <Result label="计算结果" value={result.text} mono hint={`表达式：${expression}`} />
                <KeyValue
                  items={[
                    { label: '角度模式', value: angle === 'deg' ? '角度（DEG）' : '弧度（RAD）' },
                    { label: '科学计数法', value: result.value.toExponential(6) },
                    { label: '绝对值', value: formatSci(Math.abs(result.value)) },
                    { label: '类型', value: Number.isInteger(result.value) ? '整数' : '小数' },
                  ]}
                />
              </div>
            ) : (
              <EmptyState
                icon={Calculator}
                title="还没有计算结果"
                description="输入表达式后按 Enter，或使用下方按键与示例。"
                className="py-10"
              />
            )}
          </Panel>

          <Panel title="常用示例" description="点击即可直接计算">
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip font-mono" onClick={() => run(example)}>
                  {example}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </ToolSplit>

      <Panel title="支持的函数与常量">
        <div className="grid gap-4 sm:grid-cols-2">
          <ul className="space-y-1.5 text-xs muted">
            <li>
              <span className="font-mono">sin cos tan</span> — 三角函数（跟随角度/弧度模式）
            </li>
            <li>
              <span className="font-mono">asin acos atan</span> — 反三角函数，结果跟随角度模式
            </li>
            <li>
              <span className="font-mono">ln log log2</span> — 自然对数 / 常用对数（以 10 为底）/ 以 2 为底
            </li>
            <li>
              <span className="font-mono">sqrt cbrt abs exp</span> — 平方根 / 立方根 / 绝对值 / e 的幂
            </li>
            <li>
              <span className="font-mono">floor ceil round sign</span> — 取整与符号函数
            </li>
            <li>
              <span className="font-mono">fact(n) 或 n!</span> — 阶乘（最多 170!）
            </li>
          </ul>
          <ul className="space-y-1.5 text-xs muted">
            <li>
              <span className="font-mono">mod(a,b) 或 a % b</span> — 取余
            </li>
            <li>
              <span className="font-mono">pow(a,b) 或 a^b</span> — 乘方（右结合，2^3^2 = 512）
            </li>
            <li>
              <span className="font-mono">min max atan2</span> — 最小值 / 最大值 / 双参数反正切
            </li>
            <li>
              <span className="font-mono">pi π e tau</span> — 圆周率 / 自然常数 / 2π
            </li>
            <li>
              <span className="font-mono">ans</span> — 上一次的计算结果
            </li>
            <li>
              <span className="font-mono">%</span> — 末尾表示百分比（50% = 0.5），中间表示取余（10 % 3 = 1）
            </li>
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs subtle">
          <Kbd>Enter</Kbd> 计算
          <Kbd>Esc</Kbd> 清空
          <Kbd>Backspace</Kbd> 退格
          <span>·</span>
          <span>所有计算在浏览器本地完成，不使用 eval。</span>
        </div>
        <Hint>
          <span className="inline-flex items-center gap-1">
            <Sigma className="size-3.5" /> 解析器为词法分析 + 递归下降，支持优先级、右结合乘方与隐式补全右括号。
          </span>
        </Hint>
      </Panel>
    </div>
  );
}
