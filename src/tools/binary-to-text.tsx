import { useMemo, useState } from 'react';
import { Binary, Download, Eraser, FileDigit, Wand2 } from 'lucide-react';
import { Panel, Field, Textarea, Actions, CopyButton, Hint, KeyValue } from './kit';
import { Alert, Badge, Button, EmptyState, Switch } from '../components/ui';
import { download, formatNumber } from '../lib/utils';
import { useToast } from '../lib/toast';
import { useDebouncedValue } from '../lib/hooks';

const MAX_DUMP_BYTES = 1024;

const SAMPLE = '01001000 01100101 01101100 01101100 01101111 00101100 00100000 01001100 01101001 01110100 01101000';

interface InvalidGroup {
  position: number;
  token: string;
  reason: string;
}

interface ParsedBinary {
  bytes: number[];
  invalid: InvalidGroup[];
  groups: number;
  ignoredChars: number;
}

function parseBinary(input: string): ParsedBinary {
  const tokens = input.trim().length > 0 ? input.trim().split(/\s+/) : [];
  const bytes: number[] = [];
  const invalid: InvalidGroup[] = [];
  let ignoredChars = 0;

  tokens.forEach((raw, index) => {
    const token = raw.trim();
    if (!token) return;

    if (/^[01]+$/.test(token)) {
      if (token.length % 8 !== 0) {
        invalid.push({ position: index + 1, token, reason: `长度为 ${token.length} 位，不是 8 的倍数` });
        return;
      }
      for (let offset = 0; offset < token.length; offset += 8) {
        bytes.push(Number.parseInt(token.slice(offset, offset + 8), 2));
      }
      return;
    }

    // 容错：允许 "0b" 前缀、逗号、下划线等分隔符，剥离后仍按 8 位切分。
    const cleaned = token.replace(/0[bB]/g, '').replace(/[^01]/g, '');
    ignoredChars += token.length - cleaned.length;
    if (!cleaned) {
      invalid.push({ position: index + 1, token, reason: '不包含任何 0/1 字符' });
      return;
    }
    if (cleaned.length % 8 !== 0) {
      invalid.push({ position: index + 1, token, reason: `有效的二进制位为 ${cleaned.length} 位，不是 8 的倍数` });
      return;
    }
    for (let offset = 0; offset < cleaned.length; offset += 8) {
      bytes.push(Number.parseInt(cleaned.slice(offset, offset + 8), 2));
    }
  });

  return { bytes, invalid, groups: tokens.length, ignoredChars };
}

function toHexPairs(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function buildDump(bytes: number[]): string[] {
  const lines: string[] = [];
  const visible = bytes.slice(0, MAX_DUMP_BYTES);
  for (let offset = 0; offset < visible.length; offset += 16) {
    const chunk = visible.slice(offset, offset + 16);
    const hexLeft = chunk
      .slice(0, 8)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ');
    const hexRight = chunk
      .slice(8)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(23, ' ');
    const ascii = chunk.map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hexLeft.padEnd(23, ' ')}  ${hexRight}  |${ascii}|`);
  }
  return lines;
}

function fileSafeText(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export default function BinaryToTextTool() {
  const [input, setInput] = useState(SAMPLE);
  const [strict, setStrict] = useState(false);
  const toast = useToast();
  const debounced = useDebouncedValue(input, 180);

  const parsed = useMemo(() => parseBinary(debounced), [debounced]);

  const decoded = useMemo(() => {
    if (parsed.bytes.length === 0) {
      return { text: '', replacements: 0, decodeError: null as string | null };
    }
    const view = new Uint8Array(parsed.bytes);
    try {
      const decoder = new TextDecoder('utf-8', { fatal: strict });
      const text = decoder.decode(view);
      const replacements = (text.match(/\uFFFD/g) ?? []).length;
      return { text, replacements, decodeError: null };
    } catch {
      return { text: '', replacements: 0, decodeError: '数据中存在不合法的 UTF-8 字节序列，关闭「严格模式」可用 \ufffd 替换后再查看。' };
    }
  }, [parsed.bytes, strict]);

  const hex = useMemo(() => toHexPairs(parsed.bytes), [parsed.bytes]);
  const dump = useMemo(() => buildDump(parsed.bytes), [parsed.bytes]);
  const hasInput = input.trim().length > 0;
  const hasBytes = parsed.bytes.length > 0;
  const textOutput = fileSafeText(decoded.text);

  return (
    <div className="space-y-4">
      <Panel
        title="二进制输入"
        description="粘贴由 0 和 1 组成的二进制数据，每 8 位为一个字节，按 UTF-8 解码为文本。"
      >
        <Field
          label="二进制数据"
          htmlFor="b2t-input"
          hint="可用空格、换行、逗号分组；也支持连续位串（长度需为 8 的倍数）。"
        >
          <Textarea
            id="b2t-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            placeholder="例如：01001000 01100101 01101100 01101100 01101111"
            className="min-h-40 font-mono text-[13px] leading-6"
          />
        </Field>

        <Actions>
          <Button variant="secondary" size="sm" icon={Wand2} onClick={() => setInput(SAMPLE)}>
            填入示例
          </Button>
          <Button variant="ghost" size="sm" icon={Eraser} onClick={() => setInput('')} disabled={!input}>
            清空
          </Button>
          <Switch checked={strict} onChange={setStrict} label="严格模式（遇到非法 UTF-8 字节时报错）" />
        </Actions>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge>分组 {formatNumber(parsed.groups)}</Badge>
          <Badge tone={hasBytes ? 'brand' : 'default'}>字节 {formatNumber(parsed.bytes.length)}</Badge>
          {parsed.invalid.length > 0 ? <Badge tone="warning">异常分组 {parsed.invalid.length}</Badge> : null}
          {parsed.ignoredChars > 0 ? <Badge tone="warning">忽略字符 {formatNumber(parsed.ignoredChars)}</Badge> : null}
        </div>
      </Panel>

      {parsed.invalid.length > 0 ? (
        <Alert tone="warning" title={`有 ${parsed.invalid.length} 个分组无法转换为字节`}>
          <ul className="mt-1 space-y-1 text-xs">
            {parsed.invalid.slice(0, 8).map((item) => (
              <li key={`${item.position}-${item.token}`} className="font-mono break-all">
                第 {item.position} 组「{item.token.length > 40 ? `${item.token.slice(0, 40)}…` : item.token}」：{item.reason}
              </li>
            ))}
            {parsed.invalid.length > 8 ? <li>… 另有 {parsed.invalid.length - 8} 组异常数据</li> : null}
          </ul>
        </Alert>
      ) : null}

      <Panel
        title="解码文本"
        description={hasBytes ? `UTF-8 解码 · ${formatNumber(decoded.text.length)} 个字符` : '输入二进制数据后显示解码结果'}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={textOutput} label="复制文本" />
            <CopyButton text={hex} label="复制十六进制" />
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              disabled={!hasBytes}
              onClick={() => {
                download(textOutput, 'decoded.txt');
                toast.success('已下载 decoded.txt');
              }}
            >
              下载文本
            </Button>
          </div>
        }
      >
        {!hasInput ? (
          <EmptyState icon={Binary} title="还没有输入" description="粘贴二进制数据，例如 01001000 01100101 01101100 01101100 01101111（对应 Hello）。" />
        ) : !hasBytes ? (
          <EmptyState icon={FileDigit} title="没有可解码的字节" description="请检查每个分组是否为 8 位二进制数，且只包含 0 和 1。" />
        ) : decoded.decodeError ? (
          <Alert tone="error" title="解码失败">
            {decoded.decodeError}
          </Alert>
        ) : (
          <div className="space-y-3">
            <pre className="max-h-64 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-sm leading-6 break-words whitespace-pre-wrap">
              {textOutput || '（空字符串）'}
            </pre>
            {decoded.replacements > 0 ? (
              <Alert tone="warning" title={`检测到 ${decoded.replacements} 处非法 UTF-8 字节`}>
                这些字节无法组成合法字符，已用替换符 <code className="font-mono">\uFFFD</code>（�）代替。可开启「严格模式」定位问题，或核对源数据是否为 UTF-8 编码。
              </Alert>
            ) : (
              <Hint>全部字节均为合法的 UTF-8 序列。</Hint>
            )}
            <KeyValue
              items={[
                { label: '字节数', value: formatNumber(parsed.bytes.length) },
                { label: '字符数', value: formatNumber(decoded.text.length) },
                { label: '替换符', value: decoded.replacements },
              ]}
            />
          </div>
        )}
      </Panel>

      <Panel title="十六进制对照" description={`每行 16 字节，左侧为偏移地址${parsed.bytes.length > MAX_DUMP_BYTES ? `（仅显示前 ${MAX_DUMP_BYTES} 字节）` : ''}`}>
        {hasBytes ? (
          <>
            <pre className="overflow-x-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6">
              {dump.join('\n')}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={hex} label="复制十六进制串" />
            </div>
          </>
        ) : (
          <p className="text-sm muted">暂无数据。</p>
        )}
      </Panel>
    </div>
  );
}
