import { useMemo, useRef, useState } from 'react';
import { Code2, Copy, Download, Eraser, Sparkles } from 'lucide-react';
import { Panel, Field, Select, Textarea, Actions, CopyButton, Hint } from './kit';
import { Button, EmptyState, Tabs } from '../components/ui';
import { copyText, download, formatNumber } from '../lib/utils';
import { errorMessage } from '../lib/api';
import { useToast } from '../lib/toast';

/* ------------------------------------------------------------------ tokens */

type TokenType =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'builtin'
  | 'function'
  | 'tag'
  | 'attr'
  | 'punct';

interface Token {
  type: TokenType;
  text: string;
}

type RuleType = TokenType | 'ident';

interface Rule {
  type: RuleType;
  /** Sticky regex: matching always starts at the current scan offset. */
  re: RegExp;
}

interface Language {
  id: string;
  label: string;
  keywords: string[];
  builtins: string[];
  caseInsensitive: boolean;
  rules: Rule[];
}

const JS_KEYWORDS = [
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'finally', 'for',
  'from', 'function', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface',
  'keyof', 'let', 'namespace', 'never', 'new', 'of', 'private', 'protected', 'public', 'readonly',
  'return', 'satisfies', 'static', 'super', 'switch', 'this', 'throw', 'try', 'type', 'typeof',
  'undefined', 'unknown', 'var', 'void', 'while', 'with', 'yield', 'true', 'false', 'null', 'any',
  'string', 'number', 'boolean', 'object', 'symbol', 'bigint', 'abstract', 'asserts', 'is',
];

const JS_BUILTINS = [
  'Array', 'BigInt', 'Blob', 'Boolean', 'Date', 'Error', 'File', 'FormData', 'JSON', 'Map',
  'Math', 'Number', 'Object', 'Promise', 'Proxy', 'RegExp', 'Set', 'String', 'Symbol', 'URL',
  'WeakMap', 'WeakSet', 'clearInterval', 'clearTimeout', 'console', 'document', 'fetch',
  'globalThis', 'localStorage', 'module', 'parseFloat', 'parseInt', 'process', 'require',
  'sessionStorage', 'setInterval', 'setTimeout', 'structuredClone', 'window',
];

const PYTHON_KEYWORDS = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'True', 'False', 'None',
];

const PYTHON_BUILTINS = [
  'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter', 'float', 'format', 'frozenset',
  'getattr', 'hasattr', 'id', 'input', 'int', 'isinstance', 'len', 'list', 'map', 'max', 'min',
  'object', 'open', 'print', 'range', 'repr', 'reversed', 'round', 'set', 'sorted', 'str', 'sum',
  'super', 'tuple', 'type', 'zip',
];

const SQL_KEYWORDS = [
  'add', 'all', 'alter', 'and', 'any', 'as', 'asc', 'begin', 'between', 'by', 'case', 'check',
  'column', 'commit', 'constraint', 'create', 'cross', 'database', 'default', 'delete', 'desc',
  'distinct', 'drop', 'else', 'end', 'exists', 'foreign', 'from', 'full', 'group', 'having', 'if',
  'in', 'index', 'inner', 'insert', 'into', 'is', 'join', 'key', 'left', 'like', 'limit', 'not',
  'null', 'offset', 'on', 'or', 'order', 'outer', 'primary', 'references', 'right', 'rollback',
  'select', 'set', 'table', 'then', 'top', 'union', 'unique', 'update', 'values', 'view', 'when',
  'where', 'with',
];

const SQL_BUILTINS = [
  'avg', 'cast', 'coalesce', 'concat', 'count', 'current_date', 'current_timestamp', 'date',
  'ifnull', 'lower', 'max', 'min', 'now', 'nullif', 'round', 'sum', 'trim', 'upper',
];

const BASH_KEYWORDS = [
  'case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'function', 'if', 'in', 'select',
  'then', 'time', 'until', 'while', 'export', 'local', 'readonly', 'return', 'declare', 'unset',
];

const BASH_BUILTINS = [
  'alias', 'awk', 'cat', 'cd', 'curl', 'echo', 'exit', 'find', 'git', 'grep', 'kill', 'ls',
  'mkdir', 'node', 'npm', 'printf', 'pwd', 'rm', 'sed', 'set', 'shift', 'source', 'sudo',
  'touch', 'tr', 'true', 'false', 'xargs',
];

const LANGUAGES: Language[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    keywords: JS_KEYWORDS,
    builtins: JS_BUILTINS,
    caseInsensitive: false,
    rules: [
      { type: 'comment', re: /\/\/[^\n]*/y },
      { type: 'comment', re: /\/\*[\s\S]*?(?:\*\/|$)/y },
      { type: 'string', re: /`(?:\\[\s\S]|[^\\`])*`?/y },
      { type: 'string', re: /"(?:\\[\s\S]|[^\\"\n])*"?/y },
      { type: 'string', re: /'(?:\\[\s\S]|[^\\'\n])*'?/y },
      { type: 'plain', re: /\s+/y },
      { type: 'number', re: /\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/y },
      { type: 'ident', re: /[A-Za-z_$][\w$]*/y },
      { type: 'punct', re: /[{}()[\];,.:?+\-*/%=<>!&|^~@#]+/y },
    ],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    keywords: [...JS_KEYWORDS, 'namespace', 'override', 'readonly', 'satisfies', 'unknown'],
    builtins: [...JS_BUILTINS, 'Partial', 'Record', 'Pick', 'Omit', 'Readonly', 'Required'],
    caseInsensitive: false,
    rules: [
      { type: 'comment', re: /\/\/[^\n]*/y },
      { type: 'comment', re: /\/\*[\s\S]*?(?:\*\/|$)/y },
      { type: 'string', re: /`(?:\\[\s\S]|[^\\`])*`?/y },
      { type: 'string', re: /"(?:\\[\s\S]|[^\\"\n])*"?/y },
      { type: 'string', re: /'(?:\\[\s\S]|[^\\'\n])*'?/y },
      { type: 'plain', re: /\s+/y },
      { type: 'number', re: /\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/y },
      { type: 'ident', re: /[A-Za-z_$][\w$]*/y },
      { type: 'punct', re: /[{}()[\];,.:?+\-*/%=<>!&|^~@#]+/y },
    ],
  },
  {
    id: 'html',
    label: 'HTML / XML',
    keywords: [],
    builtins: [],
    caseInsensitive: false,
    rules: [
      { type: 'comment', re: /<!--[\s\S]*?(?:-->|$)/y },
      { type: 'keyword', re: /<!(?:doctype|DOCTYPE)[^>]*>/y },
      { type: 'tag', re: /<\/?[A-Za-z][\w:.-]*/y },
      { type: 'attr', re: /\s+[A-Za-z_:@][\w:.-]*(?=\s*=)/y },
      { type: 'string', re: /"[^"]*"?|'[^']*'?/y },
      { type: 'number', re: /&[#\w]+;/y },
      { type: 'punct', re: /\/?>/y },
      { type: 'plain', re: /\s+/y },
      { type: 'plain', re: /[^<>&"'/\s]+/y },
    ],
  },
  {
    id: 'css',
    label: 'CSS',
    keywords: ['important', 'media', 'supports', 'keyframes', 'font-face', 'import', 'charset'],
    builtins: [],
    caseInsensitive: true,
    rules: [
      { type: 'comment', re: /\/\*[\s\S]*?(?:\*\/|$)/y },
      { type: 'string', re: /"[^"\n]*"?|'[^'\n]*'?/y },
      { type: 'keyword', re: /@[\w-]+/y },
      { type: 'attr', re: /[A-Za-z-]+(?=\s*:)/y },
      { type: 'number', re: /#[0-9a-fA-F]{3,8}\b/y },
      { type: 'number', re: /-?\d*\.?\d+(?:%|[a-zA-Z]+)?/y },
      { type: 'ident', re: /[A-Za-z_-][\w-]*/y },
      { type: 'plain', re: /\s+/y },
      { type: 'punct', re: /[{}();:,>+~*[\]="']/y },
    ],
  },
  {
    id: 'json',
    label: 'JSON',
    keywords: ['true', 'false', 'null'],
    builtins: [],
    caseInsensitive: false,
    rules: [],
  },
  {
    id: 'python',
    label: 'Python',
    keywords: PYTHON_KEYWORDS,
    builtins: PYTHON_BUILTINS,
    caseInsensitive: false,
    rules: [
      { type: 'comment', re: /#[^\n]*/y },
      { type: 'string', re: /[rRbBuUfF]{0,2}"""[\s\S]*?(?:"""|$)/y },
      { type: 'string', re: /[rRbBuUfF]{0,2}'''[\s\S]*?(?:'''|$)/y },
      { type: 'string', re: /[rRbBuUfF]{0,2}"(?:\\[\s\S]|[^\\"\n])*"?/y },
      { type: 'string', re: /[rRbBuUfF]{0,2}'(?:\\[\s\S]|[^\\'\n])*'?/y },
      { type: 'plain', re: /\s+/y },
      { type: 'number', re: /\b(?:0[xXoObB][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?j?)\b/y },
      { type: 'builtin', re: /@[\w.]+/y },
      { type: 'ident', re: /[A-Za-z_]\w*/y },
      { type: 'punct', re: /[{}()[\];,.:?+\-*/%=<>!&|^~]+/y },
    ],
  },
  {
    id: 'sql',
    label: 'SQL',
    keywords: SQL_KEYWORDS,
    builtins: SQL_BUILTINS,
    caseInsensitive: true,
    rules: [
      { type: 'comment', re: /--[^\n]*/y },
      { type: 'comment', re: /\/\*[\s\S]*?(?:\*\/|$)/y },
      { type: 'string', re: /'(?:''|[^'])*(?:'|$)/y },
      { type: 'attr', re: /"[^"]*"|`[^`]*`|\[[^\]]*\]/y },
      { type: 'plain', re: /\s+/y },
      { type: 'number', re: /\b\d+(?:\.\d+)?\b/y },
      { type: 'ident', re: /[A-Za-z_][\w$]*/y },
      { type: 'punct', re: /[{}()[\];,.:?+\-*/%=<>!&|^~]+/y },
    ],
  },
  {
    id: 'bash',
    label: 'Bash / Shell',
    keywords: BASH_KEYWORDS,
    builtins: BASH_BUILTINS,
    caseInsensitive: false,
    rules: [
      { type: 'comment', re: /#[^\n]*/y },
      { type: 'string', re: /"(?:\\[\s\S]|[^\\"])*"?/y },
      { type: 'string', re: /'[^']*'?/y },
      { type: 'builtin', re: /\$\{[^}]*\}|\$[\w@#?*!$-]+/y },
      { type: 'plain', re: /\s+/y },
      { type: 'number', re: /\b\d+(?:\.\d+)?\b/y },
      { type: 'ident', re: /[A-Za-z_][\w-]*/y },
      { type: 'punct', re: /[{}()[\];,.:?+\-*/%=<>!&|^~]+/y },
    ],
  },
  {
    id: 'plaintext',
    label: '纯文本',
    keywords: [],
    builtins: [],
    caseInsensitive: false,
    rules: [{ type: 'plain', re: /[\s\S]+/y }],
  },
];

function tokenizeJson(code: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < code.length) {
    const whitespace = /\s+/y;
    whitespace.lastIndex = index;
    const space = whitespace.exec(code);
    if (space) {
      tokens.push({ type: 'plain', text: space[0] });
      index += space[0].length;
      continue;
    }

    const stringRule = /"(?:\\.|[^"\\])*"/y;
    stringRule.lastIndex = index;
    const stringMatch = stringRule.exec(code);
    if (stringMatch) {
      let next = index + stringMatch[0].length;
      while (next < code.length && /\s/.test(code[next])) next += 1;
      tokens.push({ type: code[next] === ':' ? 'attr' : 'string', text: stringMatch[0] });
      index += stringMatch[0].length;
      continue;
    }

    const numberRule = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    numberRule.lastIndex = index;
    const numberMatch = numberRule.exec(code);
    if (numberMatch) {
      tokens.push({ type: 'number', text: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    const keywordRule = /\b(?:true|false|null)\b/y;
    keywordRule.lastIndex = index;
    const keywordMatch = keywordRule.exec(code);
    if (keywordMatch) {
      tokens.push({ type: 'keyword', text: keywordMatch[0] });
      index += keywordMatch[0].length;
      continue;
    }

    tokens.push({ type: 'punct', text: code[index] });
    index += 1;
  }
  return tokens;
}

function tokenize(code: string, language: Language): Token[] {
  if (language.id === 'json') return tokenizeJson(code);
  const tokens: Token[] = [];
  const keywords = new Set(language.keywords);
  const builtins = new Set(language.builtins);
  let index = 0;

  while (index < code.length) {
    let matched = false;
    for (const rule of language.rules) {
      rule.re.lastIndex = index;
      const match = rule.re.exec(code);
      if (!match || match[0].length === 0) continue;
      const text = match[0];
      let type: TokenType;
      if (rule.type === 'ident') {
        const normalized = language.caseInsensitive ? text.toLowerCase() : text;
        if (keywords.has(normalized)) type = 'keyword';
        else if (builtins.has(normalized)) type = 'builtin';
        else if (/^\s*\(/.test(code.slice(index + text.length, index + text.length + 6))) type = 'function';
        else type = 'plain';
      } else {
        type = rule.type;
      }
      tokens.push({ type, text });
      index += text.length;
      matched = true;
      break;
    }
    if (!matched) {
      tokens.push({ type: 'plain', text: code[index] });
      index += 1;
    }
  }
  return tokens;
}

/** Split the token stream into display lines without losing token colouring. */
function toLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    for (let part = 0; part < parts.length; part += 1) {
      if (part > 0) lines.push([]);
      if (parts[part]) lines[lines.length - 1].push({ type: token.type, text: parts[part] });
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ themes */

interface Palette {
  bg: string;
  gutter: string;
  border: string;
  lineNumber: string;
  text: string;
  colors: Record<TokenType, string>;
}

const PALETTES: Record<'dark' | 'light', Palette> = {
  dark: {
    bg: '#0b1220',
    gutter: '#0f1a2c',
    border: '#1e293b',
    lineNumber: '#475569',
    text: '#dbe4f0',
    colors: {
      plain: '#dbe4f0',
      comment: '#64748b',
      string: '#a5e8b8',
      number: '#fbbf24',
      keyword: '#c4b5fd',
      builtin: '#7dd3fc',
      function: '#93c5fd',
      tag: '#f472b6',
      attr: '#fcd34d',
      punct: '#94a3b8',
    },
  },
  light: {
    bg: '#ffffff',
    gutter: '#f8fafc',
    border: '#e2e8f0',
    lineNumber: '#94a3b8',
    text: '#1e293b',
    colors: {
      plain: '#1e293b',
      comment: '#94a3b8',
      string: '#047857',
      number: '#b45309',
      keyword: '#7c3aed',
      builtin: '#0369a1',
      function: '#1d4ed8',
      tag: '#be123c',
      attr: '#a16207',
      punct: '#64748b',
    },
  },
};

const SAMPLE = `// 计算斐波那契数列并过滤偶数
const memo = new Map<number, number>([[0, 0], [1, 1]]);

function fib(n: number): number {
  if (memo.has(n)) return memo.get(n)!;
  const value = fib(n - 1) + fib(n - 2);
  memo.set(n, value);
  return value;
}

const numbers = Array.from({ length: 10 }, (_, index) => fib(index));
console.log("前 10 项:", numbers.join(", "));
`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function CodeHighlightTool() {
  const [languageId, setLanguageId] = useState('javascript');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [code, setCode] = useState(SAMPLE);
  const [exporting, setExporting] = useState(false);
  const blockRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  const language = LANGUAGES.find((item) => item.id === languageId) ?? LANGUAGES[0];
  const palette = PALETTES[theme];

  const normalized = useMemo(() => code.replace(/\r\n?/g, '\n'), [code]);
  const lines = useMemo(() => toLines(tokenize(normalized, language)), [normalized, language]);

  const htmlSnippet = useMemo(() => {
    const body = lines
      .map((line) => line.map((token) => `<span style="color:${palette.colors[token.type]}">${escapeHtml(token.text)}</span>`).join(''))
      .join('\n');
    return `<pre style="margin:0;padding:16px;border-radius:12px;background:${palette.bg};color:${palette.text};font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;line-height:1.6;overflow:auto;tab-size:2"><code>${body}</code></pre>`;
  }, [lines, palette]);

  const hasCode = code.trim().length > 0;

  const handleCopyHtml = async () => {
    if (!hasCode) return;
    const ok = await copyText(htmlSnippet);
    if (ok) toast.success('HTML 已复制，可直接粘贴到网页或邮件中');
    else toast.error('复制失败，请检查剪贴板权限');
  };

  const handleExportPng = async () => {
    const node = blockRef.current;
    if (!node || !hasCode || exporting) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const width = Math.max(node.scrollWidth, node.clientWidth);
      const height = Math.max(node.scrollHeight, node.clientHeight);
      const canvas = await html2canvas(node, {
        backgroundColor: palette.bg,
        scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
        width,
        height,
        windowWidth: Math.max(width + 32, 480),
        windowHeight: Math.max(height + 32, 320),
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('画布导出失败');
      download(blob, `code-${language.id}.png`);
      toast.success('PNG 已导出');
    } catch (error) {
      toast.error(`导出失败：${errorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="代码输入" description="支持 JavaScript / TypeScript / HTML / CSS / JSON / Python / SQL / Shell，高亮在浏览器本地实时生成。">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="语言" htmlFor="ch-language">
            <Select id="ch-language" value={languageId} onChange={(event) => setLanguageId(event.target.value)}>
              {LANGUAGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="高亮主题">
            <Tabs
              items={[
                { value: 'dark' as const, label: '深色' },
                { value: 'light' as const, label: '浅色' },
              ]}
              value={theme}
              onChange={(value) => setTheme(value)}
            />
          </Field>
        </div>

        <Field label="代码" htmlFor="ch-code" className="mt-4" hint="支持 Tab 缩进；粘贴大量代码时渲染可能略有延迟。">
          <Textarea
            id="ch-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="min-h-56 resize-y font-mono text-[13px] leading-6"
            placeholder="在此粘贴或输入代码…"
          />
        </Field>

        <Actions>
          <Button variant="secondary" size="sm" icon={Sparkles} onClick={() => setCode(SAMPLE)}>
            载入示例
          </Button>
          <Button variant="ghost" size="sm" icon={Eraser} onClick={() => setCode('')} disabled={!code}>
            清空
          </Button>
          <CopyButton text={code} label="复制纯文本" />
        </Actions>
      </Panel>

      <Panel
        title="高亮结果"
        description={
          hasCode ? `共 ${formatNumber(lines.length)} 行 · ${formatNumber(code.length)} 字符 · ${language.label}` : '输入代码后即可预览高亮效果'
        }
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={Copy} onClick={handleCopyHtml} disabled={!hasCode}>
              复制 HTML
            </Button>
            <Button variant="primary" size="sm" icon={Download} loading={exporting} onClick={handleExportPng} disabled={!hasCode}>
              导出 PNG
            </Button>
            <Hint>PNG 由 html2canvas 在本地渲染，超长代码可能超出画布宽度。</Hint>
          </div>
        }
      >
        {hasCode ? (
          <div className="overflow-x-auto">
            <div
              ref={blockRef}
              className="w-max min-w-full overflow-hidden rounded-xl font-mono text-[13px] leading-6"
              style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.border}` }}
            >
              <div className="flex">
                <div
                  aria-hidden="true"
                  className="shrink-0 border-r px-3 py-4 text-right select-none"
                  style={{ background: palette.gutter, borderColor: palette.border, color: palette.lineNumber }}
                >
                  {lines.map((_, index) => (
                    <div key={index}>{index + 1}</div>
                  ))}
                </div>
                <div className="min-w-0 flex-1 px-4 py-4">
                  {lines.map((line, index) => (
                    <div key={index} className="whitespace-pre">
                      {line.length === 0
                        ? '\u00a0'
                        : line.map((token, tokenIndex) => (
                            <span key={tokenIndex} style={{ color: palette.colors[token.type] }}>
                              {token.text}
                            </span>
                          ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={Code2} title="还没有代码" description="在上方输入或粘贴代码，即可实时查看带行号的语法高亮效果。" />
        )}
      </Panel>
    </div>
  );
}
