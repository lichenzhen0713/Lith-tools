import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, Hash, RotateCcw, Sparkles } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Result, ToolSplit } from './kit';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CopyButton,
  EmptyState,
  Switch,
} from '../components/ui';
import { download, formatNumber, truncate } from '../lib/utils';
import { useToast } from '../lib/toast';

const UPPER = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const LOWER = Array.from('abcdefghijklmnopqrstuvwxyz');
const DIGITS = Array.from('0123456789');
const AMBIGUOUS = new Set(['0', 'O', 'o', '1', 'l', 'I', '|', '`']);

const MIN_LENGTH = 1;
const MAX_LENGTH = 128;
const MIN_COUNT = 1;
const MAX_COUNT = 1000;
const MAX_GROUP = 32;
const MAX_AFFIX = 16;
const MAX_CUSTOM = 200;
const PREVIEW_LIMIT = 200;

interface Generated {
  codes: string[];
  signature: string;
  createdAt: number;
}

function groupChars(chars: string[], group: number, separator: string): string {
  if (group <= 0 || chars.length <= group) return chars.join('');
  const parts: string[] = [];
  for (let index = 0; index < chars.length; index += group) {
    parts.push(chars.slice(index, index + group).join(''));
  }
  return parts.join(separator);
}

function formatCombinations(value: number): string {
  if (!Number.isFinite(value)) return '极大（超出计算范围）';
  if (value >= 1e12) {
    const exponent = Math.floor(Math.log10(value));
    const mantissa = value / Math.pow(10, exponent);
    return `${mantissa.toFixed(2)} × 10^${exponent}`;
  }
  return formatNumber(value);
}

interface GenerateOptions {
  length: number;
  count: number;
  group: number;
  separator: string;
  prefix: string;
  suffix: string;
  dedupe: boolean;
}

function generateCodes(alphabet: string[], options: GenerateOptions): { codes: string[]; error: string | null } {
  const { length, count, group, separator, prefix, suffix, dedupe } = options;
  const size = alphabet.length;
  const limit = Math.floor(4294967296 / size) * size;
  const buffer = new Uint32Array(1);

  const pick = (): string => {
    let value = 0;
    let guard = 0;
    do {
      crypto.getRandomValues(buffer);
      value = buffer[0];
      guard += 1;
    } while (value >= limit && guard < 64);
    return alphabet[value % size] ?? alphabet[0];
  };

  const codes: string[] = [];
  const seen = new Set<string>();
  const maxAttempts = dedupe ? count * 80 : count;
  let attempts = 0;

  while (codes.length < count && attempts < maxAttempts) {
    attempts += 1;
    const chars: string[] = [];
    for (let index = 0; index < length; index += 1) chars.push(pick());
    const body = chars.join('');
    if (dedupe) {
      if (seen.has(body)) continue;
      seen.add(body);
    }
    codes.push(`${prefix}${groupChars(chars, group, separator)}${suffix}`);
  }

  if (codes.length < count) {
    return {
      codes,
      error: `去重模式下尝试了 ${formatNumber(maxAttempts)} 次仍只能生成 ${formatNumber(codes.length)} 个不重复序列号，请缩短长度或减少数量。`,
    };
  }
  return { codes, error: null };
}

export default function SerialGeneratorTool() {
  const toast = useToast();
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [custom, setCustom] = useState(false);
  const [customChars, setCustomChars] = useState('');
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [lengthRaw, setLengthRaw] = useState('16');
  const [countRaw, setCountRaw] = useState('10');
  const [groupRaw, setGroupRaw] = useState('4');
  const [separator, setSeparator] = useState('-');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [dedupe, setDedupe] = useState(true);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analysis = useMemo(() => {
    const pool: string[] = [];
    if (upper) pool.push(...UPPER);
    if (lower) pool.push(...LOWER);
    if (digits) pool.push(...DIGITS);
    if (custom) pool.push(...Array.from(customChars));

    const unique = Array.from(new Set(pool));
    const alphabet = excludeAmbiguous ? unique.filter((char) => !AMBIGUOUS.has(char)) : unique;

    const lengthNumber = Number(lengthRaw);
    const countNumber = Number(countRaw);
    const groupNumber = Number(groupRaw);

    const lengthValid =
      lengthRaw.trim() !== '' &&
      Number.isInteger(lengthNumber) &&
      lengthNumber >= MIN_LENGTH &&
      lengthNumber <= MAX_LENGTH;
    const countValid =
      countRaw.trim() !== '' && Number.isInteger(countNumber) && countNumber >= MIN_COUNT && countNumber <= MAX_COUNT;
    const groupValid =
      groupRaw.trim() !== '' &&
      Number.isInteger(groupNumber) &&
      groupNumber >= 0 &&
      groupNumber <= MAX_GROUP;

    const space = lengthValid && alphabet.length > 0 ? Math.pow(alphabet.length, lengthNumber) : 0;

    let validationError: string | null = null;
    if (alphabet.length === 0) {
      validationError = custom && Array.from(customChars).length === 0
        ? '已勾选自定义字符但内容为空，请填写自定义字符或改用内置字符集'
        : '请至少选择一种字符集，并确保排除易混淆字符后仍有可用字符';
    } else if (!lengthValid) {
      validationError = `长度需为 ${MIN_LENGTH} - ${MAX_LENGTH} 之间的整数`;
    } else if (!countValid) {
      validationError = `数量需为 ${MIN_COUNT} - ${MAX_COUNT} 之间的整数`;
    } else if (!groupValid) {
      validationError = `分组长度需为 0 - ${MAX_GROUP} 之间的整数（0 表示不分组）`;
    } else if (dedupe && space < countNumber) {
      validationError = `当前字符集与长度最多只能生成 ${formatCombinations(space)} 个不同序列号，少于所需的 ${formatNumber(countNumber)} 个`;
    }

    return {
      alphabet,
      lengthNumber,
      countNumber,
      groupNumber,
      lengthValid,
      countValid,
      groupValid,
      space,
      error: validationError,
    };
  }, [upper, lower, digits, custom, customChars, excludeAmbiguous, lengthRaw, countRaw, groupRaw, dedupe]);

  const signature = useMemo(
    () =>
      [
        analysis.alphabet.join(''),
        analysis.lengthNumber,
        analysis.countNumber,
        analysis.groupNumber,
        separator,
        prefix,
        suffix,
        dedupe ? 'unique' : 'repeat',
      ].join('|'),
    [analysis, separator, prefix, suffix, dedupe],
  );

  const stale = generated !== null && generated.signature !== signature;

  // Any parameter change invalidates a previous generation error message.
  useEffect(() => {
    setError(null);
  }, [signature]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (analysis.error) {
      toast.error(analysis.error);
      return;
    }
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      setError('当前浏览器不支持 Web Crypto（crypto.getRandomValues），无法生成随机序列号');
      return;
    }

    const result = generateCodes(analysis.alphabet, {
      length: analysis.lengthNumber,
      count: analysis.countNumber,
      group: analysis.groupNumber,
      separator,
      prefix,
      suffix,
      dedupe,
    });

    if (result.error !== null) {
      setError(result.error);
      setGenerated(null);
      return;
    }

    setError(null);
    setGenerated({ codes: result.codes, signature, createdAt: Date.now() });
    toast.success(`已生成 ${formatNumber(result.codes.length)} 个序列号`);
  };

  const handleReset = () => {
    setUpper(true);
    setLower(true);
    setDigits(true);
    setCustom(false);
    setCustomChars('');
    setExcludeAmbiguous(false);
    setLengthRaw('16');
    setCountRaw('10');
    setGroupRaw('4');
    setSeparator('-');
    setPrefix('');
    setSuffix('');
    setDedupe(true);
    setGenerated(null);
    setError(null);
  };

  const output = generated ? generated.codes.join('\n') : '';
  const preview = generated ? generated.codes.slice(0, PREVIEW_LIMIT).join('\n') : '';
  const alphabetPreview = analysis.alphabet.join('');

  const handleDownload = () => {
    if (!generated) {
      toast.error('还没有可下载的序列号');
      return;
    }
    download(output, `serial-numbers-${generated.codes.length}.txt`, 'text/plain;charset=utf-8');
    toast.success('已下载 TXT 文件');
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="生成参数" description="序列号在浏览器本地用 Web Crypto 生成，不会上传服务器">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="label mb-0">字符集</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Checkbox label="大写字母 A-Z" checked={upper} onChange={(event) => setUpper(event.target.checked)} />
                <Checkbox label="小写字母 a-z" checked={lower} onChange={(event) => setLower(event.target.checked)} />
                <Checkbox label="数字 0-9" checked={digits} onChange={(event) => setDigits(event.target.checked)} />
                <Checkbox label="自定义字符" checked={custom} onChange={(event) => setCustom(event.target.checked)} />
              </div>
              {custom ? (
                <Field label="自定义字符内容" htmlFor="serial-custom" hint="任意字符均可，重复字符会自动去重">
                  <Input
                    id="serial-custom"
                    value={customChars}
                    maxLength={MAX_CUSTOM}
                    placeholder="例如：ABXYZ!@#"
                    onChange={(event) => setCustomChars(event.target.value)}
                  />
                </Field>
              ) : null}
              <p className="text-xs subtle">
                当前可用字符 {formatNumber(analysis.alphabet.length)} 个
                {alphabetPreview ? (
                  <>
                    ：
                    <span className="font-mono break-all">{truncate(alphabetPreview, 48)}</span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="长度"
                htmlFor="serial-length"
                error={analysis.lengthValid ? null : `需为 ${MIN_LENGTH} - ${MAX_LENGTH} 之间的整数`}
                hint="每个序列号的随机字符个数"
              >
                <Input
                  id="serial-length"
                  inputMode="numeric"
                  value={lengthRaw}
                  error={!analysis.lengthValid}
                  onChange={(event) => setLengthRaw(event.target.value)}
                />
              </Field>

              <Field
                label="数量"
                htmlFor="serial-count"
                error={analysis.countValid ? null : `需为 ${MIN_COUNT} - ${MAX_COUNT} 之间的整数`}
                hint={`一次最多生成 ${formatNumber(MAX_COUNT)} 个`}
              >
                <Input
                  id="serial-count"
                  inputMode="numeric"
                  value={countRaw}
                  error={!analysis.countValid}
                  onChange={(event) => setCountRaw(event.target.value)}
                />
              </Field>

              <Field
                label="分组长度"
                htmlFor="serial-group"
                error={analysis.groupValid ? null : `需为 0 - ${MAX_GROUP} 之间的整数`}
                hint="每隔多少个字符插入一次分隔符，0 表示不分组"
              >
                <Input
                  id="serial-group"
                  inputMode="numeric"
                  value={groupRaw}
                  error={!analysis.groupValid}
                  onChange={(event) => setGroupRaw(event.target.value)}
                />
              </Field>

              <Field label="分隔符" htmlFor="serial-separator" hint="分组时插入，例如 - 或空格">
                <Input
                  id="serial-separator"
                  value={separator}
                  maxLength={4}
                  placeholder="-"
                  onChange={(event) => setSeparator(event.target.value)}
                />
              </Field>

              <Field label="前缀" htmlFor="serial-prefix" hint={`最多 ${MAX_AFFIX} 个字符，可为空`}>
                <Input
                  id="serial-prefix"
                  value={prefix}
                  maxLength={MAX_AFFIX}
                  placeholder="例如：LT-"
                  className="font-mono"
                  onChange={(event) => setPrefix(event.target.value)}
                />
              </Field>

              <Field label="后缀" htmlFor="serial-suffix" hint={`最多 ${MAX_AFFIX} 个字符，可为空`}>
                <Input
                  id="serial-suffix"
                  value={suffix}
                  maxLength={MAX_AFFIX}
                  placeholder="例如：-END"
                  className="font-mono"
                  onChange={(event) => setSuffix(event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-[var(--hover-bg)] px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">结果去重</span>
                  <Switch checked={dedupe} onChange={setDedupe} />
                </div>
                <p className="mt-1 text-xs subtle">
                  {dedupe ? '保证本次生成的序列号互不相同（组合不足时会报错）' : '允许出现相同的序列号'}
                </p>
              </div>
              <div className="rounded-xl border bg-[var(--hover-bg)] px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">排除易混淆字符</span>
                  <Switch checked={excludeAmbiguous} onChange={setExcludeAmbiguous} />
                </div>
                <p className="mt-1 text-xs subtle">移除 0 O o 1 l I 等难以分辨的字符</p>
              </div>
            </div>

            {analysis.error ? <Alert tone="warning">{analysis.error}</Alert> : null}
            {error ? <Alert tone="error">{error}</Alert> : null}

            <Actions>
              <Button type="submit" icon={Sparkles}>
                生成序列号
              </Button>
              <Button variant="secondary" type="button" icon={RotateCcw} onClick={handleReset}>
                重置参数
              </Button>
            </Actions>

            <Hint>
              随机源为 crypto.getRandomValues，并使用拒绝采样避免取模偏差；相同参数重复生成会得到不同的序列号。
            </Hint>
          </form>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Hash className="size-4" /> 生成结果
              {generated ? <Badge tone="brand">{formatNumber(generated.codes.length)} 个</Badge> : null}
            </span>
          }
          description={
            generated
              ? `组合空间 ${formatCombinations(analysis.space)} · 长度 ${analysis.lengthNumber} · 字符集 ${formatNumber(analysis.alphabet.length)} 个字符`
              : '设置参数后点击「生成序列号」'
          }
        >
          {!generated ? (
            <EmptyState
              icon={Hash}
              title="还没有生成序列号"
              description="在左侧选择字符集、长度与数量，点击「生成序列号」即可获得可复制、可下载的序列号列表。"
            />
          ) : (
            <div className="space-y-4">
              {stale ? <Alert tone="warning">参数已修改，下方仍是上一次生成的结果，请重新生成。</Alert> : null}

              <Result label="第一条序列号" value={generated.codes[0] ?? '—'} mono />

              <KeyValue
                items={[
                  { label: '生成数量', value: `${formatNumber(generated.codes.length)} 个` },
                  { label: '随机长度', value: `${formatNumber(analysis.lengthNumber)} 位` },
                  { label: '字符集大小', value: `${formatNumber(analysis.alphabet.length)} 个字符` },
                  { label: '理论组合数', value: formatCombinations(analysis.space) },
                  { label: '结果去重', value: dedupe ? '已开启' : '未开启' },
                ]}
              />

              <Actions className="mt-0">
                <CopyButton text={output} label="复制全部" />
                <Button variant="secondary" type="button" icon={Download} onClick={handleDownload}>
                  下载 .txt
                </Button>
              </Actions>

              <div className="space-y-2">
                <p className="text-xs font-medium subtle">
                  序列号列表
                  {generated.codes.length > PREVIEW_LIMIT
                    ? `（仅显示前 ${formatNumber(PREVIEW_LIMIT)} 条，复制与下载包含全部 ${formatNumber(generated.codes.length)} 条）`
                    : ''}
                </p>
                <pre className="max-h-80 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-3 font-mono text-xs leading-6 whitespace-pre-wrap break-all">
                  {preview}
                </pre>
              </div>

              <Hint>序列号包含前缀与后缀；分组分隔符只插入到随机主体之间，不会出现在前缀或后缀里。</Hint>
            </div>
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
