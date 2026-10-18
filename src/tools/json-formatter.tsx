import { useMemo, useState } from 'react';
import { AlignLeft, Braces, Download, Minimize2, Trash2 } from 'lucide-react';
import { Hint, Panel, ToolSplit } from './kit';
import { Alert, Badge, Button, Checkbox, CopyButton, EmptyState, Select, Textarea } from '../components/ui';
import { download, formatBytes } from '../lib/utils';
import { useDebouncedValue } from '../lib/hooks';
import { useToast } from '../lib/toast';

type Indent = '2' | '4' | 'tab';
type Mode = 'format' | 'minify';

interface ParseSuccess {
  ok: true;
  value: unknown;
}

interface ParseFailure {
  ok: false;
  message: string;
  line: number | null;
  column: number | null;
}

type ParseResult = ParseSuccess | ParseFailure;

type TokenKind = 'key' | 'string' | 'number' | 'literal' | 'punct';

interface Token {
  value: string;
  kind: TokenKind;
}

const TOKEN_LIMIT = 50_000;

const TOKEN_CLASS: Record<TokenKind, string> = {
  key: 'text-sky-600 dark:text-sky-300',
  string: 'text-emerald-600 dark:text-emerald-300',
  number: 'text-amber-600 dark:text-amber-300',
  literal: 'text-violet-600 dark:text-violet-300',
  punct: 'text-slate-400 dark:text-slate-500',
};

const SAMPLES: { name: string; value: string }[] = [
  {
    name: '基础对象',
    value: `{
  "name": "Lith Tools",
  "version": "1.0.0",
  "private": true,
  "keywords": ["json", "formatter", "校验"],
  "repository": {
    "type": "git",
    "url": "https://example.com/lith-tools.git"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}`,
  },
  {
    name: '嵌套数组',
    value: `[
  {
    "id": 1,
    "title": "第一项",
    "tags": ["alpha", "beta"],
    "meta": { "score": 92.5, "active": true }
  },
  {
    "id": 2,
    "title": "第二项",
    "tags": [],
    "meta": { "score": 0, "active": false, "remark": null }
  }
]`,
  },
  {
    name: '含转义字符',
    value: `{
  "quote": "他说：\\"你好\\"",
  "path": "C:\\\\Users\\\\lith\\\\tools",
  "unicode": "中文与 emoji 🎨",
  "newline": "第一行\\n第二行",
  "empty": ""
}`,
  },
  {
    name: '错误示例',
    value: `{
  "name": "Lith Tools",
  "tags": ["json", "formatter",],
  "version": '1.0.0'
}`,
  },
];

function locateError(input: string, message: string): { line: number | null; column: number | null } {
  const lineColumn = /line (\d+) column (\d+)/i.exec(message);
  if (lineColumn) return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  const position = /position (\d+)/i.exec(message);
  if (!position) return { line: null, column: null };
  const offset = Math.min(Math.max(0, Number(position[1])), input.length);
  const before = input.slice(0, offset).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

function parseJson(input: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON 解析失败';
    return { ok: false, message, ...locateError(input, message) };
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeysDeep(item));
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) result[key] = sortKeysDeep(source[key]);
    return result;
  }
  return value;
}

function tokenizeJson(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const push = (value: string, kind: TokenKind) => {
    if (value) tokens.push({ value, kind });
  };

  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      let cursor = index + 1;
      while (cursor < source.length) {
        const current = source[cursor];
        if (current === '\\') {
          cursor += 2;
          continue;
        }
        if (current === '"') {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      const raw = source.slice(index, cursor);
      let lookahead = cursor;
      while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;
      push(raw, source[lookahead] === ':' ? 'key' : 'string');
      index = cursor;
      continue;
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      let cursor = index + 1;
      while (cursor < source.length && /[0-9eE+\-.]/.test(source[cursor])) cursor += 1;
      push(source.slice(index, cursor), 'number');
      index = cursor;
      continue;
    }
    if (char === 't' || char === 'f' || char === 'n') {
      const match = /^(?:true|false|null)/.exec(source.slice(index, index + 5));
      if (match) {
        push(match[0], 'literal');
        index += match[0].length;
        continue;
      }
    }
    if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
      let cursor = index + 1;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      push(source.slice(index, cursor), 'punct');
      index = cursor;
      continue;
    }
    push(char, 'punct');
    index += 1;
  }

  return tokens;
}

function errorSnippet(input: string, line: number | null, column: number | null): string | null {
  if (!line || line < 1) return null;
  const lines = input.split('\n');
  const target = lines[line - 1];
  if (target === undefined) return null;
  const columnIndex = Math.max(0, (column ?? 1) - 1);
  const start = Math.max(0, columnIndex - 30);
  const text = target.slice(start, start + 80);
  const caret = `${' '.repeat(Math.max(0, columnIndex - start))}^`;
  return `${text}\n${caret}`;
}

/** JSON formatter / minifier with validation, error location, safe token highlighting and export. */
export default function JsonFormatterTool() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [indent, setIndent] = useState<Indent>('2');
  const [sortKeys, setSortKeys] = useState(false);
  const [mode, setMode] = useState<Mode>('format');

  const debounced = useDebouncedValue(text, 250);
  const pending = text !== debounced;

  const parsed = useMemo<ParseResult | null>(() => {
    if (!debounced.trim()) return null;
    return parseJson(debounced);
  }, [debounced]);

  const output = useMemo(() => {
    if (!parsed || !parsed.ok) return null;
    const target = sortKeys ? sortKeysDeep(parsed.value) : parsed.value;
    const space = indent === 'tab' ? '\t' : Number(indent);
    return (mode === 'minify' ? JSON.stringify(target) : JSON.stringify(target, null, space)) ?? '';
  }, [indent, mode, parsed, sortKeys]);

  const tokens = useMemo(() => {
    if (!output || output.length > TOKEN_LIMIT) return null;
    return tokenizeJson(output);
  }, [output]);

  const stats = useMemo(() => {
    if (!output) return null;
    const bytes = new TextEncoder().encode(output).length;
    const lines = output.split('\n').length;
    return { bytes, lines };
  }, [output]);

  const snippet = useMemo(() => {
    if (!parsed || parsed.ok) return null;
    return errorSnippet(debounced, parsed.line, parsed.column);
  }, [debounced, parsed]);

  const loadSample = (value: string) => {
    setText(value);
    setMode('format');
  };

  const downloadJson = () => {
    if (!output) return;
    download(output, mode === 'minify' ? 'minified.json' : 'formatted.json', 'application/json;charset=utf-8');
    toast.success('已下载 JSON 文件');
  };

  return (
    <div className="space-y-4">
      <Panel
        title="输入 JSON"
        description="粘贴或输入 JSON，校验、格式化和高亮会实时更新。"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs subtle">示例：</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample.name}
                type="button"
                className="chip"
                onClick={() => loadSample(sample.value)}
              >
                {sample.name}
              </button>
            ))}
          </div>
        }
      >
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'在此粘贴 JSON，例如：\n{\n  "name": "Lith Tools"\n}'}
          spellCheck={false}
          autoComplete="off"
          aria-label="JSON 输入"
          error={parsed !== null && !parsed.ok}
          className="min-h-72 resize-y font-mono text-xs leading-6"
        />

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-28">
            <label htmlFor="json-indent" className="label mb-1.5">
              缩进
            </label>
            <Select
              id="json-indent"
              value={indent}
              onChange={(event) => setIndent(event.target.value as Indent)}
              className="input-sm"
            >
              <option value="2">2 空格</option>
              <option value="4">4 空格</option>
              <option value="tab">Tab</option>
            </Select>
          </div>
          <div className="pb-2">
            <Checkbox
              label="排序键"
              checked={sortKeys}
              onChange={(event) => setSortKeys(event.target.checked)}
            />
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant={mode === 'format' ? 'primary' : 'secondary'}
              size="sm"
              icon={AlignLeft}
              onClick={() => setMode('format')}
            >
              格式化
            </Button>
            <Button
              variant={mode === 'minify' ? 'primary' : 'secondary'}
              size="sm"
              icon={Minimize2}
              onClick={() => setMode('minify')}
            >
              压缩
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => setText('')}
              disabled={!text}
            >
              清空
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs subtle">
          <span>{text.length.toLocaleString('zh-CN')} 字符</span>
          <span>·</span>
          <span>标准 JSON（不支持注释、单引号与尾随逗号）</span>
          {parsed ? (
            parsed.ok ? (
              <Badge tone="success">校验通过</Badge>
            ) : (
              <Badge tone="danger">校验未通过</Badge>
            )
          ) : null}
        </div>
        <div className="mt-2">
          <Hint>结果超过 5 万字符时会自动关闭语法高亮，避免大文件卡顿；校验与格式化不受影响。</Hint>
        </div>
      </Panel>

      <ToolSplit>
        <Panel
          title="结果"
          description="格式化后的 JSON 可直接复制或下载"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {output ? <CopyButton text={output} label="复制结果" /> : null}
              <Button variant="secondary" icon={Download} onClick={downloadJson} disabled={!output}>
                下载 .json
              </Button>
              {stats ? (
                <span className="ml-auto text-xs subtle">
                  {formatBytes(stats.bytes)} · {stats.lines.toLocaleString('zh-CN')} 行
                </span>
              ) : null}
            </div>
          }
        >
          {!text.trim() ? (
            <EmptyState
              icon={Braces}
              title="等待输入 JSON"
              description="在左侧输入或粘贴 JSON，或载入一个示例快速体验。"
              action={
                <Button variant="secondary" size="sm" onClick={() => loadSample(SAMPLES[0].value)}>
                  载入示例 JSON
                </Button>
              }
            />
          ) : pending && !output ? (
            <div className="flex items-center gap-2 text-sm muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
              正在校验…
            </div>
          ) : parsed && !parsed.ok ? (
            <Alert tone="error" title="JSON 语法错误">
              <p className="break-words">{parsed.message}</p>
              {parsed.line ? (
                <p className="mt-1 text-xs opacity-90">
                  位置：第 {parsed.line} 行，第 {parsed.column ?? 1} 列
                </p>
              ) : (
                <p className="mt-1 text-xs opacity-90">浏览器未提供具体位置，请检查括号、逗号与引号是否配对。</p>
              )}
              {snippet ? (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-white/60 p-2 font-mono text-[11px] leading-5 dark:bg-black/30">
                  {snippet}
                </pre>
              ) : null}
            </Alert>
          ) : output ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="success">{mode === 'minify' ? '压缩完成' : '格式有效'}</Badge>
                <Badge>{indent === 'tab' ? '缩进：Tab' : `缩进：${indent} 空格`}</Badge>
                {sortKeys ? <Badge tone="brand">键已排序</Badge> : null}
                {pending ? <Badge tone="warning">校验中…</Badge> : null}
                {tokens ? null : <Badge tone="warning">已关闭高亮</Badge>}
              </div>
              <pre className="max-h-[32rem] overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6">
                {tokens
                  ? tokens.map((token, index) => (
                      <span key={index} className={TOKEN_CLASS[token.kind]}>
                        {token.value}
                      </span>
                    ))
                  : output}
              </pre>
            </>
          ) : null}
        </Panel>

        <Panel title="使用提示">
          <ul className="list-disc space-y-2 pl-5 text-sm muted">
            <li>缩进可选 2 空格、4 空格或 Tab，切换后立即重新排版。</li>
            <li>「排序键」会递归按字母顺序排列所有对象的键，便于对比两份配置。</li>
            <li>校验失败时会显示错误所在的行号与列号，并给出上下文片段。</li>
            <li>支持复制结果、下载 .json 文件，全程在浏览器本地完成，数据不会上传。</li>
            <li>大文件（如超过 1 MB）解析可能需要一点时间，请耐心等待。</li>
          </ul>
          <div className="mt-4">
            <Hint>本工具只接受标准 JSON：字符串必须使用双引号，且不允许注释和对象/数组末尾多余的逗号。</Hint>
          </div>
        </Panel>
      </ToolSplit>
    </div>
  );
}
