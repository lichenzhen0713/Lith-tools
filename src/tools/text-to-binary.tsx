import { useMemo, useState } from 'react';
import { Binary, Download, Eraser, Type } from 'lucide-react';
import { Panel, Field, Select, Textarea, Actions, CopyButton, Hint, KeyValue } from './kit';
import { Alert, Badge, Button, EmptyState, Switch } from '../components/ui';
import { download, formatNumber } from '../lib/utils';
import { useToast } from '../lib/toast';

type Base = 2 | 8 | 16;
type SeparatorId = 'space' | 'comma' | 'newline';

const BASE_OPTIONS: { value: Base; label: string; short: string; width: number; name: string }[] = [
  { value: 2, label: '二进制（每字节 8 位）', short: '二进制', width: 8, name: 'binary' },
  { value: 16, label: '十六进制（每字节 2 位）', short: '十六进制', width: 2, name: 'hex' },
  { value: 8, label: '八进制（每字节 3 位）', short: '八进制', width: 3, name: 'octal' },
];

const SEPARATORS: { value: SeparatorId; label: string; char: string }[] = [
  { value: 'space', label: '空格', char: ' ' },
  { value: 'comma', label: '逗号', char: ',' },
  { value: 'newline', label: '换行（每字节一行）', char: '\n' },
];

const MAX_PREVIEW = 200_000;
const MAX_TABLE_ROWS = 120;

const CONTROL_NAMES: Record<number, string> = {
  0: '\\0',
  8: '\\b',
  9: '\\t',
  10: '\\n',
  12: '\\f',
  13: '\\r',
  27: '\\e',
  32: '␠',
  127: '\\x7f',
};

function describeChar(codePoint: number): string {
  const control = CONTROL_NAMES[codePoint];
  if (control) return control;
  if (codePoint < 32) return `\\x${codePoint.toString(16).padStart(2, '0')}`;
  return String.fromCodePoint(codePoint);
}

export default function TextToBinaryTool() {
  const [text, setText] = useState('Hello, 世界 👋');
  const [base, setBase] = useState<Base>(2);
  const [useSeparator, setUseSeparator] = useState(true);
  const [separatorId, setSeparatorId] = useState<SeparatorId>('space');
  const toast = useToast();

  const baseOption = BASE_OPTIONS.find((item) => item.value === base) ?? BASE_OPTIONS[0];
  const separator = useSeparator ? (SEPARATORS.find((item) => item.value === separatorId)?.char ?? ' ') : '';

  const bytes = useMemo(() => Array.from(new TextEncoder().encode(text)), [text]);
  const output = useMemo(
    () => bytes.map((byte) => byte.toString(base).padStart(baseOption.width, '0')).join(separator),
    [bytes, base, baseOption.width, separator],
  );

  const preview = output.length > MAX_PREVIEW ? `${output.slice(0, MAX_PREVIEW)}\n…（仅预览前 ${formatNumber(MAX_PREVIEW)} 个字符）` : output;
  const charRows = useMemo(() => {
    const rows: { char: string; codePoint: string; bytes: string; binary: string }[] = [];
    for (const char of Array.from(text)) {
      if (rows.length >= MAX_TABLE_ROWS) break;
      const codePoint = char.codePointAt(0) ?? 0;
      const encoded = Array.from(new TextEncoder().encode(char));
      rows.push({
        char: describeChar(codePoint),
        codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
        bytes: encoded.map((byte) => byte.toString(16).padStart(2, '0')).join(' '),
        binary: encoded.map((byte) => byte.toString(2).padStart(8, '0')).join(' '),
      });
    }
    return rows;
  }, [text]);

  const hasText = text.length > 0;

  return (
    <div className="space-y-4">
      <Panel title="文本输入" description="文本按 UTF-8 编码为字节，再转换为二进制 / 十六进制 / 八进制。中文、Emoji 等多字节字符会自动展开为多个字节。">
        <Field label="原始文本" htmlFor="t2b-input" hint="支持任意 Unicode 字符与换行，全部在本地转换。">
          <Textarea
            id="t2b-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            placeholder="在此输入或粘贴文本…"
            className="min-h-40 text-sm leading-6"
          />
        </Field>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="输出进制" htmlFor="t2b-base">
            <Select id="t2b-base" value={String(base)} onChange={(event) => setBase(Number(event.target.value) as Base)}>
              {BASE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="字节之间插入分隔符" htmlFor="t2b-separator">
            <div className="flex items-center gap-3">
              <Switch checked={useSeparator} onChange={setUseSeparator} label={useSeparator ? '已开启' : '已关闭'} />
              <Select
                id="t2b-separator"
                value={separatorId}
                disabled={!useSeparator}
                onChange={(event) => setSeparatorId(event.target.value as SeparatorId)}
                className="flex-1"
              >
                {SEPARATORS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </div>

        <Actions>
          <Button variant="secondary" size="sm" icon={Type} onClick={() => setText('Hello, 世界 👋')}>
            填入示例
          </Button>
          <Button variant="ghost" size="sm" icon={Eraser} onClick={() => setText('')} disabled={!text}>
            清空
          </Button>
        </Actions>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge>字符 {formatNumber(Array.from(text).length)}</Badge>
          <Badge tone={bytes.length > 0 ? 'brand' : 'default'}>UTF-8 字节 {formatNumber(bytes.length)}</Badge>
          <Badge>输出长度 {formatNumber(output.length)}</Badge>
        </div>
      </Panel>

      <Panel
        title="转换结果"
        description={hasText ? `${baseOption.short} · ${formatNumber(bytes.length)} 个字节` : '输入文本后显示转换结果'}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={output} label="复制结果" />
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              disabled={!hasText}
              onClick={() => {
                download(output, `text-${baseOption.name}.txt`);
                toast.success(`已下载 text-${baseOption.name}.txt`);
              }}
            >
              下载 TXT
            </Button>
          </div>
        }
      >
        {!hasText ? (
          <EmptyState icon={Binary} title="还没有输入文本" description="输入任意文字，即可得到对应的二进制、十六进制或八进制表示。" />
        ) : (
          <div className="space-y-3">
            <pre className="max-h-72 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-[13px] leading-6 break-all whitespace-pre-wrap">
              {preview}
            </pre>
            {output.length > MAX_PREVIEW ? <Hint>结果过长，预览已截断；复制与下载仍为完整内容。</Hint> : null}
            <KeyValue
              items={[
                { label: '编码方式', value: 'UTF-8' },
                { label: '字节数', value: formatNumber(bytes.length) },
                { label: '分隔符', value: useSeparator ? (SEPARATORS.find((item) => item.value === separatorId)?.label ?? '空格') : '无' },
              ]}
            />
          </div>
        )}
      </Panel>

      <Panel title="逐字符对照" description={`最多显示前 ${MAX_TABLE_ROWS} 个字符的 UTF-8 字节构成`}>
        {charRows.length === 0 ? (
          <Alert tone="info" title="暂无数据">
            输入文本后，这里会列出每个字符的 Unicode 码点及其 UTF-8 字节。
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>字符</th>
                  <th>码点</th>
                  <th>UTF-8（十六进制）</th>
                  <th>UTF-8（二进制）</th>
                </tr>
              </thead>
              <tbody>
                {charRows.map((row, index) => (
                  <tr key={`${row.codePoint}-${index}`}>
                    <td className="font-mono">{row.char}</td>
                    <td className="font-mono text-xs">{row.codePoint}</td>
                    <td className="font-mono text-xs">{row.bytes}</td>
                    <td className="font-mono text-xs">{row.binary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Array.from(text).length > MAX_TABLE_ROWS ? (
              <p className="mt-3 text-xs subtle">还有 {formatNumber(Array.from(text).length - MAX_TABLE_ROWS)} 个字符未列出。</p>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
