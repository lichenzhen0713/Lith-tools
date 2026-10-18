import { useEffect, useRef, useState } from 'react';
import { Calculator, Delete, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, CopyButton, EmptyState, Kbd } from '../components/ui';
import { Actions, Panel, ToolSplit } from './kit';
import { cn } from '../lib/utils';

/* ---------------------------------------------------------------------------
 * 安全表达式求值：手写词法分析 + 递归下降解析，完全不使用 eval / new Function。
 * 支持：+ - * /、括号、一元正负号、百分号（后缀，50% = 0.5）。
 * ------------------------------------------------------------------------- */

type CalcOperator = '+' | '-' | '*' | '/' | '%' | '(' | ')';
type CalcToken = { kind: 'number'; value: number } | { kind: 'operator'; value: CalcOperator };

const OPERATOR_CHARS = '+-*/%()';

function tokenize(expression: string): CalcToken[] {
  const text = expression
    .replace(/[×✕]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[\s,]/g, '');

  const tokens: CalcToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (/[0-9.]/.test(char)) {
      let end = index;
      let dots = 0;
      while (end < text.length && /[0-9.]/.test(text[end])) {
        if (text[end] === '.') dots += 1;
        end += 1;
      }
      const raw = text.slice(index, end);
      if (dots > 1 || raw === '.') throw new Error(`数字格式有误：「${raw}」`);
      tokens.push({ kind: 'number', value: Number(raw) });
      index = end;
      continue;
    }

    if (OPERATOR_CHARS.includes(char)) {
      tokens.push({ kind: 'operator', value: char as CalcOperator });
      index += 1;
      continue;
    }

    throw new Error(`无法识别的字符「${char}」，仅支持数字、+ - * / % 和括号`);
  }

  return tokens;
}

function parseTokens(tokens: CalcToken[]): number {
  let position = 0;

  const peek = (): CalcToken | undefined => tokens[position];

  function expression(): number {
    let value = term();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'operator' || (token.value !== '+' && token.value !== '-')) break;
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
      if (!token || token.kind !== 'operator' || (token.value !== '*' && token.value !== '/')) break;
      position += 1;
      const right = unary();
      if (token.value === '/' && right === 0) throw new Error('除数不能为 0');
      value = token.value === '*' ? value * right : value / right;
    }
    return value;
  }

  function unary(): number {
    const token = peek();
    if (token && token.kind === 'operator' && (token.value === '+' || token.value === '-')) {
      position += 1;
      const value = unary();
      return token.value === '-' ? -value : value;
    }
    return postfix();
  }

  /** 后缀百分号：50% -> 0.5，可连续（(1+2)%% -> 0.0003） */
  function postfix(): number {
    let value = primary();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'operator' || token.value !== '%') break;
      position += 1;
      value /= 100;
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
    if (token.value === '(') {
      position += 1;
      const value = expression();
      const closing = peek();
      if (!closing || closing.kind !== 'operator' || closing.value !== ')') throw new Error('括号不匹配，缺少右括号');
      position += 1;
      return value;
    }
    throw new Error('表达式有误，请检查运算符位置');
  }

  if (tokens.length === 0) throw new Error('请输入表达式');

  const result = expression();
  if (position < tokens.length) throw new Error('表达式有误，请检查是否缺少运算符');
  if (!Number.isFinite(result)) throw new Error('结果超出可表示范围');
  return result;
}

function evaluate(expression: string): number {
  return parseTokens(tokenize(expression.trim()));
}

/** 规范化输入：统一符号、去掉结尾多余的运算符、自动补全右括号。 */
function normalizeExpression(raw: string): string {
  let text = raw
    .replace(/[×✕]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[\s,]/g, '');

  text = text.replace(/[+\-*/]+$/, '');

  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
  }
  return text + ')'.repeat(depth);
}

/** 结果展示：最多 12 位有效数字，极端数值使用科学计数法。 */
function formatResult(value: number): string {
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || magnitude < 1e-6) {
    return value.toExponential(8).replace(/\.?0+e/, 'e');
  }
  return String(Number(value.toPrecision(12)));
}

function isPlainNumber(text: string): boolean {
  return /^-?(\d+\.?\d*|\.\d+)$/.test(text);
}

interface HistoryItem {
  id: number;
  expression: string;
  value: string;
}

const KEYPAD: string[][] = [
  ['C', '⌫', '(', ')'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '%', '+'],
];

const SYMBOLS: Partial<Record<string, string>> = { '/': '÷', '*': '×', '-': '−' };

export default function BasicCalculatorTool() {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const historyId = useRef(0);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);

  function clearAll() {
    setExpression('');
    setResult(null);
    setError(null);
    setJustEvaluated(false);
  }

  function appendText(text: string) {
    setError(null);
    setResult(null);
    const continues = /^[+\-*/%]/.test(text);
    const base = justEvaluated ? (continues && result && isPlainNumber(result) ? result : '') : expression;
    setExpression((base + text).slice(0, 120));
    setJustEvaluated(false);
  }

  function backspace() {
    setError(null);
    setResult(null);
    setJustEvaluated(false);
    setExpression((previous) => previous.slice(0, -1));
  }

  function evaluateExpression() {
    const prepared = normalizeExpression(expression);
    if (!prepared) {
      setError('请先输入表达式');
      return;
    }
    try {
      const value = evaluate(prepared);
      const text = formatResult(value);
      setExpression(prepared);
      setResult(text);
      setError(null);
      setJustEvaluated(true);
      historyId.current += 1;
      const id = historyId.current;
      setHistory((items) => [{ id, expression: prepared, value: text }, ...items.filter((item) => item.expression !== prepared)].slice(0, 8));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '表达式有误');
      setResult(null);
      setJustEvaluated(false);
    }
  }

  function press(label: string) {
    if (label === 'C') {
      clearAll();
      return;
    }
    if (label === '⌫') {
      backspace();
      return;
    }
    appendText(label);
  }

  keyHandler.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    const key = event.key;
    if (/^[0-9]$/.test(key) || key === '.' || key === '(' || key === ')' || key === '%') {
      event.preventDefault();
      appendText(key);
      return;
    }
    if (key === '+' || key === '-' || key === '*' || key === '/' || key === 'x' || key === 'X') {
      event.preventDefault();
      appendText(key === 'x' || key === 'X' ? '*' : key);
      return;
    }
    if (key === 'Enter' || key === '=') {
      event.preventDefault();
      evaluateExpression();
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

  const expressionLabel = expression.length > 0 ? expression : '';

  return (
    <div className="space-y-4">
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            evaluateExpression();
          }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs subtle">表达式</p>
            <Badge>{expression.length}/120</Badge>
          </div>
          <label htmlFor="basic-calculator-expression" className="sr-only">
            计算表达式
          </label>
          <input
            id="basic-calculator-expression"
            value={expression}
            onChange={(event) => {
              setExpression(event.target.value.replace(/[^0-9+\-*/%.()×÷−（）,\s]/g, '').slice(0, 120));
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
            placeholder="0"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            className="w-full rounded-xl bg-[var(--hover-bg)] px-4 py-3 text-right font-mono text-2xl font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <div className="flex min-h-14 items-center justify-end gap-2 rounded-xl border px-4 py-2">
            {error ? (
              <p className="flex-1 text-right text-sm text-rose-600 dark:text-rose-400" role="alert">
                {error}
              </p>
            ) : result !== null ? (
              <>
                <p className="min-w-0 flex-1 truncate text-right font-mono text-xl font-semibold text-indigo-600 dark:text-indigo-400" aria-live="polite">
                  = {result}
                </p>
                <CopyButton text={result} label="复制" />
              </>
            ) : (
              <p className="flex-1 text-right text-sm subtle">
                {expressionLabel ? '按 Enter 或点击等号计算结果' : '输入数字与运算符，或点击下方按键'}
              </p>
            )}
          </div>
        </form>
      </Panel>

      <ToolSplit>
        <Panel title="按键" description="支持键盘：数字、+ - * /、Enter 计算、Backspace 退格、Esc 清空">
          <div className="grid grid-cols-4 gap-2">
            {KEYPAD.flatMap((row) =>
              row.map((key) => {
                const isOperator = '+-*/()%'.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => press(key)}
                    aria-label={key === '⌫' ? '退格' : key === 'C' ? '清除' : undefined}
                    className={cn(
                      'flex h-12 items-center justify-center rounded-xl border text-lg font-medium transition-colors select-none active:scale-[0.98]',
                      'hover:bg-[var(--hover-bg)]',
                      key === 'C' && 'text-rose-600 dark:text-rose-400',
                      key === '⌫' && 'text-[var(--text-secondary)]',
                      isOperator && 'text-indigo-600 dark:text-indigo-400',
                    )}
                  >
                    {key === '⌫' ? <Delete className="size-4" /> : (SYMBOLS[key] ?? key)}
                  </button>
                );
              }),
            )}
          </div>
          <Actions>
            <Button className="w-full" onClick={evaluateExpression}>
              = 计算
            </Button>
          </Actions>
          <p className="mt-3 text-xs leading-relaxed subtle">
            百分号表示除以 100：50% = 0.5；点击 C 或按 Esc 清除全部内容。
          </p>
        </Panel>

        <Panel
          title="历史记录"
          description="最近 8 次计算，点击可重新载入"
          footer={
            history.length > 0 ? (
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setHistory([])}>
                清空记录
              </Button>
            ) : undefined
          }
        >
          {history.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title="还没有计算记录"
              description="计算成功后会自动记录在这里，方便对比和复用。"
              className="py-8"
            />
          ) : (
            <ul className="space-y-1.5">
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpression(item.expression);
                      setResult(item.value);
                      setError(null);
                      setJustEvaluated(true);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--hover-bg)]"
                  >
                    <span className="min-w-0 truncate font-mono muted">{item.expression}</span>
                    <span className="shrink-0 font-mono font-semibold text-indigo-600 dark:text-indigo-400">{item.value}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </ToolSplit>

      <Panel title="使用说明">
        <ul className="space-y-2 text-sm muted">
          <li className="flex flex-wrap items-center gap-2">
            <Kbd>0-9</Kbd>
            <Kbd>+</Kbd>
            <Kbd>-</Kbd>
            <Kbd>*</Kbd>
            <Kbd>/</Kbd>
            输入数字与运算符
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <Kbd>Enter</Kbd> 计算结果 · <Kbd>Backspace</Kbd> 退格 · <Kbd>Esc</Kbd> 清空
          </li>
          <li>括号会自动补全，结尾多余的运算符会被忽略；结果保留最多 12 位有效数字。</li>
          <li>所有计算均在浏览器本地完成，不发送任何数据。</li>
        </ul>
        <Alert tone="info" className="mt-4">
          本工具使用自写的表达式解析器（词法分析 + 递归下降），不使用 eval / new Function，因此不会执行任意代码。
        </Alert>
      </Panel>
    </div>
  );
}
