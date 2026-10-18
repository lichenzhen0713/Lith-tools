import { useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, Binary, Eraser } from 'lucide-react';
import { Actions, CopyButton, Field, Hint, Input, Panel, Result, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState } from '../components/ui';

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_LENGTH = 4000;
const BASE_OPTIONS = Array.from({ length: 35 }, (_, index) => index + 2);

const BASE_NAMES: Record<number, string> = {
  2: '二进制',
  8: '八进制',
  10: '十进制',
  16: '十六进制',
  36: '三十六进制',
};

function baseLabel(base: number): string {
  const name = BASE_NAMES[base];
  return name ? `${base} 进制（${name}）` : `${base} 进制`;
}

type ParseOutcome = { ok: true; value: bigint } | { ok: false; error: string };

function parseInBase(raw: string, base: number): ParseOutcome {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: '' };
  if (trimmed.length > MAX_LENGTH) return { ok: false, error: `输入过长，最多支持 ${MAX_LENGTH} 个字符` };

  const compact = trimmed.replace(/[\s_]/g, '').toUpperCase();
  let text = compact;
  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  const prefixes: Record<number, string> = { 2: '0B', 8: '0O', 16: '0X' };
  const prefix = prefixes[base];
  if (prefix && text.startsWith(prefix)) text = text.slice(2);
  if (!text) return { ok: false, error: '请输入有效的数字' };

  const allowed = DIGITS.slice(0, base);
  let value = 0n;
  const bigBase = BigInt(base);
  for (let index = 0; index < text.length; index += 1) {
    const digit = DIGITS.indexOf(text[index]);
    if (digit < 0 || digit >= base) {
      return {
        ok: false,
        error: `第 ${index + 1} 位「${text[index]}」不是 ${base} 进制的合法字符（可用字符：${allowed}）`,
      };
    }
    value = value * bigBase + BigInt(digit);
  }
  return { ok: true, value: negative ? -value : value };
}

interface Conversion {
  output: string;
  decimal: string;
  value: bigint;
}

const EXAMPLES: { label: string; input: string; from: number; to: number }[] = [
  { label: '255 → 十六进制', input: '255', from: 10, to: 16 },
  { label: '二进制 → 十进制', input: '11111111', from: 2, to: 10 },
  { label: '0xDEADBEEF → 二进制', input: 'DEADBEEF', from: 16, to: 2 },
  { label: '2024 → 三十六进制', input: '2024', from: 10, to: 36 },
  { label: '大整数', input: '123456789012345678901234567890', from: 10, to: 16 },
];

export default function BaseConverterTool() {
  const [input, setInput] = useState('255');
  const [fromBase, setFromBase] = useState(10);
  const [toBase, setToBase] = useState(16);

  const parsed = useMemo(() => {
    if (!input.trim()) return null;
    return parseInBase(input, fromBase);
  }, [input, fromBase]);

  const conversion = useMemo<Conversion | null>(() => {
    if (!parsed || !parsed.ok) return null;
    return {
      output: parsed.value.toString(toBase).toUpperCase(),
      decimal: parsed.value.toString(10),
      value: parsed.value,
    };
  }, [parsed, toBase]);

  const error = parsed && !parsed.ok ? parsed.error : null;

  function swapBases(): void {
    const nextInput = conversion ? conversion.output : input;
    setFromBase(toBase);
    setToBase(fromBase);
    if (conversion) setInput(nextInput);
  }

  const commonBases = useMemo(() => {
    const bases = [2, 8, 10, 16, 36];
    if (!bases.includes(toBase)) bases.push(toBase);
    return Array.from(new Set(bases)).sort((a, b) => a - b);
  }, [toBase]);

  return (
    <ToolSplit>
      <div className="space-y-4">
        <Panel
          title="输入与进制"
          description="支持 2–36 进制互转，使用 BigInt 处理任意长度的整数。"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" icon={ArrowLeftRight} onClick={swapBases}>
                交换进制
              </Button>
              <Button variant="secondary" icon={Eraser} onClick={() => setInput('')}>
                清空
              </Button>
              <span className="ml-auto text-xs subtle">{input.trim() ? `${input.replace(/[\s_]/g, '').length} 个字符` : '等待输入'}</span>
            </div>
          }
        >
          <div className="space-y-4">
            <Field
              htmlFor="base-input"
              label="要转换的数字"
              hint="支持正负号、下划线分隔；十六/二/八进制可带 0x / 0b / 0o 前缀。"
              error={error}
            >
              <Input
                id="base-input"
                value={input}
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-wide"
                placeholder={`输入 ${fromBase} 进制数字`}
                error={Boolean(error)}
                onChange={(event) => setInput(event.target.value)}
              />
            </Field>

            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <Field label="从进制">
                <Select value={String(fromBase)} onChange={(event) => setFromBase(Number(event.target.value))}>
                  {BASE_OPTIONS.map((base) => (
                    <option key={base} value={base}>
                      {baseLabel(base)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="hidden pb-2 text-slate-400 sm:block">
                <ArrowRight className="size-4" />
              </div>
              <Field label="到进制">
                <Select value={String(toBase)} onChange={(event) => setToBase(Number(event.target.value))}>
                  {BASE_OPTIONS.map((base) => (
                    <option key={base} value={base}>
                      {baseLabel(base)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-xs subtle">示例：</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="chip"
                onClick={() => {
                  setInput(example.input);
                  setFromBase(example.from);
                  setToBase(example.to);
                }}
              >
                {example.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <Hint>
              进制 2–36：0-9 表示 0–9，A-Z 表示 10–35，输入不区分大小写。非法字符会实时提示，不会进行错误换算。
            </Hint>
          </div>
        </Panel>

        <Panel title="常见进制对照" description="同一数值在不同进制下的写法。">
          {!conversion ? (
            <p className="text-sm subtle">输入合法数字后显示各进制结果。</p>
          ) : (
            <div className="space-y-2">
              {commonBases.map((base) => {
                const value = conversion.value.toString(base).toUpperCase();
                return (
                  <div key={base} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                    <span className="w-16 shrink-0 text-xs subtle">{base} 进制</span>
                    <span className="min-w-0 flex-1 font-mono text-sm break-all">{value}</span>
                    <CopyButton text={value} label="复制" />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="转换结果" description={`从 ${baseLabel(fromBase)} 转换到 ${baseLabel(toBase)}`}>
          {!input.trim() ? (
            <EmptyState
              icon={Binary}
              title="还没有输入数字"
              description="输入一个数字即可实时得到目标进制的结果，例如十进制 255 转十六进制。"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setInput('255');
                    setFromBase(10);
                    setToBase(16);
                  }}
                >
                  试用示例
                </Button>
              }
            />
          ) : error ? (
            <Alert tone="error" title="输入不合法">
              <p className="break-words">{error}</p>
              <p className="mt-2 text-xs opacity-90">请检查是否包含了当前进制不允许的字符，或切换上方的「从进制」。</p>
            </Alert>
          ) : conversion ? (
            <div className="space-y-3">
              <Result
                label={`${toBase} 进制结果`}
                value={conversion.output}
                mono
                hint={`共 ${conversion.output.replace('-', '').length} 位${conversion.value < 0n ? '，包含负号' : ''}`}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border px-3 py-2">
                  <p className="text-xs subtle">十进制值</p>
                  <p className="mt-0.5 font-mono text-sm break-all">{conversion.decimal}</p>
                </div>
                <div className="rounded-xl border px-3 py-2">
                  <p className="text-xs subtle">输入校验</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm">
                    <Badge tone="success">合法</Badge>
                    <span className="text-xs subtle">{fromBase} 进制</span>
                  </p>
                </div>
              </div>

              <Actions className="mt-1">
                <CopyButton text={conversion.output} label="复制结果" />
                <CopyButton
                  text={`${input.trim()}（${fromBase} 进制） = ${conversion.output}（${toBase} 进制）`}
                  label="复制完整等式"
                />
              </Actions>

              <Hint>
                结果由 BigInt 精确计算，超过 JavaScript Number 安全范围的大整数也不会丢精度。
              </Hint>
            </div>
          ) : null}
        </Panel>

        <Panel title="使用提示">
          <ul className="space-y-2 text-sm muted">
            <li>· 所有换算均在浏览器本地完成，不会发送任何数据。</li>
            <li>· 本工具仅处理整数，小数部分请分别转换。</li>
            <li>· 交换进制时会把当前结果作为新的输入，方便连续换算。</li>
          </ul>
        </Panel>
      </div>
    </ToolSplit>
  );
}
