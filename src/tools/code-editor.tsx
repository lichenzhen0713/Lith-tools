import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, FileText, FolderOpen, Save, Sparkles, WrapText } from 'lucide-react';
import { Panel, Field, Select, Hint, KeyValue } from './kit';
import { Alert, Button, EmptyState, Modal, Switch } from '../components/ui';
import { cn, download, formatBytes, formatNumber, readFileAsText } from '../lib/utils';
import { errorMessage } from '../lib/api';
import { useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

const DRAFT_KEY = 'lith:code-editor:draft';
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface EditorSettings {
  indent: '2' | '4' | 'tab';
  highlight: boolean;
  wrap: boolean;
  language: string;
}

const DEFAULT_SETTINGS: EditorSettings = {
  indent: '2',
  highlight: false,
  wrap: false,
  language: 'plaintext',
};

const LANGUAGES: { id: string; label: string }[] = [
  { id: 'plaintext', label: '纯文本' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Shell' },
  { id: 'markdown', label: 'Markdown' },
];

const EXT_LANGUAGE: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  html: 'html',
  htm: 'html',
  xml: 'html',
  svg: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  py: 'python',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  md: 'markdown',
  markdown: 'markdown',
};

const EXT_MIME: Record<string, string> = {
  js: 'text/javascript;charset=utf-8',
  ts: 'text/typescript;charset=utf-8',
  json: 'application/json;charset=utf-8',
  html: 'text/html;charset=utf-8',
  htm: 'text/html;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  svg: 'image/svg+xml;charset=utf-8',
  css: 'text/css;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  py: 'text/x-python;charset=utf-8',
  sql: 'application/sql;charset=utf-8',
  sh: 'application/x-sh;charset=utf-8',
};

const KEYWORDS: Record<string, string[]> = {
  javascript: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'class', 'extends', 'super', 'this',
    'async', 'await', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'default', 'from', 'of',
    'in', 'true', 'false', 'null', 'undefined',
  ],
  typescript: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break',
    'continue', 'new', 'typeof', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace',
    'public', 'private', 'protected', 'readonly', 'static', 'async', 'await', 'try', 'catch', 'finally',
    'throw', 'import', 'export', 'default', 'from', 'as', 'of', 'in', 'true', 'false', 'null', 'undefined',
  ],
  json: ['true', 'false', 'null'],
  css: ['important', 'media', 'supports', 'keyframes', 'import', 'font-face'],
  sql: [
    'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table',
    'alter', 'drop', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'having',
    'limit', 'offset', 'and', 'or', 'not', 'null', 'as', 'distinct', 'union', 'primary', 'key', 'foreign',
    'references', 'index', 'begin', 'commit', 'rollback',
  ],
  python: [
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'import',
    'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'pass', 'break',
    'continue', 'global', 'nonlocal', 'assert', 'del', 'True', 'False', 'None', 'async', 'await',
  ],
  bash: [
    'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'in',
    'return', 'export', 'local', 'echo', 'exit',
  ],
  html: [],
  markdown: [],
};

type SegmentType = 'plain' | 'comment' | 'string' | 'number' | 'keyword';

interface Segment {
  text: string;
  type: SegmentType;
}

const SEGMENT_CLASS: Record<SegmentType, string> = {
  plain: '',
  comment: 'text-slate-400 italic dark:text-slate-500',
  string: 'text-emerald-600 dark:text-emerald-400',
  number: 'text-amber-600 dark:text-amber-400',
  keyword: 'text-violet-600 dark:text-violet-400',
};

function buildSegments(code: string, language: string): Segment[] {
  if (language === 'plaintext' || code.length === 0) return [{ text: code, type: 'plain' }];
  const keywords = new Set(KEYWORDS[language] ?? []);
  const commentPart =
    language === 'python' || language === 'bash' || language === 'markdown'
      ? '#[^\\n]*'
      : language === 'sql'
        ? '--[^\\n]*'
        : '//[^\\n]*|/\\*[\\s\\S]*?\\*/';
  const pattern = new RegExp(
    `(${commentPart})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)`,
    'g',
  );

  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: code.slice(cursor, index), type: 'plain' });
    const text = match[0];
    let type: SegmentType = 'plain';
    if (match[1]) type = 'comment';
    else if (match[2]) type = 'string';
    else if (match[3]) type = 'number';
    else if (match[4]) {
      type = keywords.has(match[4]) || keywords.has(match[4].toLowerCase()) ? 'keyword' : 'plain';
    }
    segments.push({ text, type });
    cursor = index + text.length;
  }
  if (cursor < code.length) segments.push({ text: code.slice(cursor), type: 'plain' });
  return segments;
}

function indentText(mode: EditorSettings['indent']): string {
  if (mode === 'tab') return '\t';
  return ' '.repeat(mode === '4' ? 4 : 2);
}

function mimeForName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'text/plain;charset=utf-8';
}

function languageForName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANGUAGE[ext] ?? 'plaintext';
}

interface Draft {
  content: string;
  filename: string;
  savedAt: number;
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.content !== 'string' || parsed.content.length === 0) return null;
    return {
      content: parsed.content,
      filename: typeof parsed.filename === 'string' && parsed.filename ? parsed.filename : 'untitled.txt',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function applyIndent(
  value: string,
  start: number,
  end: number,
  indent: string,
  dedent: boolean,
): { value: string; start: number; end: number } {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndRaw = value.indexOf('\n', end);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');

  let removedBeforeCaret = 0;
  let removedTotal = 0;
  const nextLines = lines.map((line, index) => {
    if (!dedent) return indent + line;
    const match = /^ +/.exec(line);
    const removeCount = match ? Math.min(match[0].length, indent.length) : 0;
    if (index === 0) removedBeforeCaret = Math.min(removeCount, Math.max(0, start - lineStart));
    removedTotal += removeCount;
    return line.slice(removeCount);
  });

  const nextValue = value.slice(0, lineStart) + nextLines.join('\n') + value.slice(lineEnd);
  if (dedent) {
    const nextStart = Math.max(lineStart, start - removedBeforeCaret);
    return { value: nextValue, start: nextStart, end: Math.max(nextStart, end - removedTotal) };
  }
  return { value: nextValue, start: start + indent.length, end: end + indent.length * lines.length };
}

export default function CodeEditorTool() {
  const [storedSettings, setStoredSettings] = useLocalStorage<Partial<EditorSettings>>('lith:code-editor:settings', {});
  const settings: EditorSettings = { ...DEFAULT_SETTINGS, ...storedSettings };
  const updateSettings = useCallback(
    (patch: Partial<EditorSettings>) => setStoredSettings((previous) => ({ ...previous, ...patch })),
    [setStoredSettings],
  );

  const [restored] = useState<Draft | null>(() => readDraft());
  const [content, setContent] = useState<string>(restored?.content ?? '');
  const [filename, setFilename] = useState<string>(restored?.filename ?? 'untitled.txt');
  const [savedAt, setSavedAt] = useState<number | null>(restored?.savedAt ?? null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLPreElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  const language = settings.language;
  const indent = indentText(settings.indent);
  const bytes = useMemo(() => new TextEncoder().encode(content).length, [content]);
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  /** Avoid rendering tens of thousands of gutter nodes for huge drafts. */
  const showGutter = lineCount <= 5000;

  const segments = useMemo(
    () => (settings.highlight ? buildSegments(content, language) : []),
    [content, language, settings.highlight],
  );

  /* ------------------------------------------------------------- drafts */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (content.trim().length === 0) {
          localStorage.removeItem(DRAFT_KEY);
          setSavedAt(null);
          return;
        }
        const draft: Draft = { content, filename, savedAt: Date.now() };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setSavedAt(draft.savedAt);
      } catch {
        /* 存储空间不足或禁用了 localStorage，忽略即可 */
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [content, filename]);

  /* ------------------------------------------------------------- scroll */
  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop;
    if (overlayRef.current) {
      overlayRef.current.scrollTop = textarea.scrollTop;
      overlayRef.current.scrollLeft = textarea.scrollLeft;
    }
  }, []);

  /* --------------------------------------------------------------- save */
  const handleSave = useCallback(() => {
    if (content.length === 0) {
      toast.error('内容为空，无法保存');
      return;
    }
    const name = filename.trim() || 'untitled.txt';
    download(content, name, mimeForName(name));
    toast.success(`已下载 ${name}`);
  }, [content, filename, toast]);

  /* --------------------------------------------------------------- open */
  const openFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`文件为 ${formatBytes(file.size)}，超过 ${formatBytes(MAX_FILE_SIZE)} 上限，请改用其他方式编辑。`);
        return;
      }
      try {
        const text = await readFileAsText(file);
        setContent(text);
        setFilename(file.name);
        updateSettings({ language: languageForName(file.name) });
        setFileError(null);
        toast.success(`已打开 ${file.name}`);
      } catch (error) {
        setFileError(`打开文件失败：${errorMessage(error)}`);
      }
    },
    [toast, updateSettings],
  );

  const clearAll = () => {
    setContent('');
    setFilename('untitled.txt');
    setSavedAt(null);
    setConfirmClear(false);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    toast.success('已清空编辑器与本地草稿');
  };

  /* ------------------------------------------------------------ keyboard */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      handleSave();
      return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const { value, start: nextStart, end: nextEnd } = applyIndent(content, start, end, indent, event.shiftKey);
    setContent(value);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.selectionStart = nextStart;
      node.selectionEnd = nextEnd;
    });
  };

  const insertSample = () => {
    setContent('// 在这里开始写代码\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("Lith"));\n');
    setFilename('sample.js');
    updateSettings({ language: 'javascript' });
  };

  return (
    <div className="space-y-4">
      <Panel
        title="编辑器"
        description="带行号的等宽文本编辑器，支持 Tab 缩进、文件打开/下载与本地草稿自动保存。"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                void openFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => fileInputRef.current?.click()}>
              打开文件
            </Button>
            <Button size="sm" icon={Save} onClick={handleSave}>
              下载文件
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Sparkles}
              onClick={() => {
                insertSample();
                toast.success('已插入示例代码');
              }}
            >
              插入示例
            </Button>
            <Button variant="ghost" size="sm" icon={Eraser} onClick={() => setConfirmClear(true)} disabled={content.length === 0}>
              清空
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="文件名" htmlFor="ce-filename" hint="下载时使用">
            <input
              id="ce-filename"
              className="input font-mono text-xs"
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
              placeholder="untitled.txt"
              spellCheck={false}
            />
          </Field>
          <Field label="语言（高亮预览）" htmlFor="ce-language">
            <Select id="ce-language" value={language} onChange={(event) => updateSettings({ language: event.target.value })}>
              {LANGUAGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tab 缩进" htmlFor="ce-indent">
            <Select
              id="ce-indent"
              value={settings.indent}
              onChange={(event) => updateSettings({ indent: event.target.value as EditorSettings['indent'] })}
            >
              <option value="2">2 个空格</option>
              <option value="4">4 个空格</option>
              <option value="tab">制表符（Tab）</option>
            </Select>
          </Field>
          <Field label="显示选项">
            <div className="flex flex-col gap-2 py-1">
              <Switch checked={settings.highlight} onChange={(value) => updateSettings({ highlight: value })} label="语法高亮" />
              <Switch checked={settings.wrap} onChange={(value) => updateSettings({ wrap: value })} label="自动换行" />
            </div>
          </Field>
        </div>

        {fileError ? (
          <Alert tone="error" title="文件操作失败" className="mt-4">
            {fileError}
          </Alert>
        ) : null}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void openFile(event.dataTransfer.files?.[0]);
          }}
          className={cn('mt-4 overflow-hidden rounded-xl border bg-[var(--input-bg)] transition-colors', dragging && 'border-indigo-500 ring-2 ring-indigo-500/20')}
        >
          <div className="flex h-[24rem] sm:h-[30rem]">
            {showGutter ? (
              <div
                ref={gutterRef}
                aria-hidden="true"
                className="w-12 shrink-0 overflow-hidden border-r bg-[var(--hover-bg)] py-4 text-right font-mono text-[13px] leading-[22px] select-none"
              >
                {Array.from({ length: lineCount }, (_, index) => (
                  <div key={index} className="pr-2 text-slate-400 dark:text-slate-500">
                    {index + 1}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="relative min-w-0 flex-1">
              {settings.highlight ? (
                <pre
                  ref={overlayRef}
                  aria-hidden="true"
                  tabIndex={-1}
                  className={cn(
                    'pointer-events-none absolute inset-0 m-0 overflow-hidden p-4 font-mono text-[13px] leading-[22px] text-[var(--text-primary)]',
                    settings.wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                  )}
                >
                  {segments.map((segment, index) => (
                    <span key={index} className={SEGMENT_CLASS[segment.type]}>
                      {segment.text}
                    </span>
                  ))}
                  {content.endsWith('\n') ? ' ' : null}
                </pre>
              ) : null}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={syncScroll}
                onSelect={(event) => setSelectedCount(event.currentTarget.selectionEnd - event.currentTarget.selectionStart)}
                wrap={settings.wrap ? 'soft' : 'off'}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="在此输入或粘贴文本…&#10;支持 Tab 缩进，Ctrl/⌘ + S 下载"
                className={cn(
                  'scrollbar-none h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-[13px] leading-[22px] outline-none',
                  settings.highlight && content.length > 0
                    ? 'caret-indigo-500 text-transparent'
                    : 'text-[var(--text-primary)]',
                  settings.wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto whitespace-pre',
                )}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs subtle">
          <FileText className="size-3.5" />
          <span>{settings.highlight ? '高亮预览已开启，文字层为透明覆盖层，光标与选区仍可正常使用。' : '纯文本编辑模式。'}</span>
          {savedAt ? <span>· 草稿已自动保存于 {new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span> : null}
          {settings.wrap ? (
            <span className="flex items-center gap-1">
              · <WrapText className="size-3.5" /> 自动换行时行号按逻辑行显示
            </span>
          ) : null}
          {!showGutter ? <span>· 行数超过 5000，已隐藏行号以保证输入流畅</span> : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue items={[{ label: '行数', value: formatNumber(lineCount) }]} />
          <KeyValue items={[{ label: '字符数', value: formatNumber(content.length) }]} />
          <KeyValue items={[{ label: 'UTF-8 字节', value: formatBytes(bytes) }]} />
          <KeyValue items={[{ label: '已选中', value: formatNumber(selectedCount) }]} />
        </div>
      </Panel>

      <Panel title="使用说明">
        <div className="space-y-3 text-sm muted">
          <p>
            <strong className="text-[var(--text-primary)]">Tab</strong> 在选区跨行时为每行增加缩进，
            <strong className="text-[var(--text-primary)]">Shift + Tab</strong> 减少缩进；
            <strong className="text-[var(--text-primary)]">Ctrl / ⌘ + S</strong> 下载当前文件。
          </p>
          <p>
            内容会自动保存到浏览器的 localStorage（防抖 0.7 秒），刷新页面后自动恢复；替换为其他文件或点击「清空」会清除草稿。
          </p>
          {content.length === 0 && !restored ? (
            <EmptyState
              icon={FileText}
              title="空白编辑器"
              description="可以直接输入文字，或点击「打开文件」载入本地文本文件（不超过 5 MB）。所有内容都留在本机。"
              action={
                <Button variant="secondary" size="sm" icon={Sparkles} onClick={insertSample}>
                  插入示例代码
                </Button>
              }
            />
          ) : (
            <Hint>文件不会上传到服务器；下载使用浏览器本地生成，编码固定为 UTF-8。</Hint>
          )}
        </div>
      </Panel>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空编辑器？"
        description="当前内容与本地草稿都会被删除，此操作无法撤销。"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={clearAll}>
              确认清空
            </Button>
          </div>
        }
      >
        <p className="text-sm muted">
          将删除 {formatNumber(content.length)} 个字符、{formatNumber(lineCount)} 行内容。
        </p>
      </Modal>
    </div>
  );
}
