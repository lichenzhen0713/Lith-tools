import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import {
  Bold,
  Download,
  FileDown,
  FileText,
  Heading1,
  Heading2,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Sparkles,
  Strikethrough,
  Table,
  Terminal,
  Trash2,
  Code,
  type LucideIcon,
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Markdown } from '../components/Markdown';
import { Hint, Panel } from './kit';
import { Button, Modal } from '../components/ui';
import { useLocalStorage } from '../lib/hooks';
import { download } from '../lib/utils';
import { printHtmlDocument } from '../lib/print';
import { useToast } from '../lib/toast';

const STORAGE_KEY = 'lith:markdown-draft:v1';

const SAMPLE = `# Lith Tools Markdown 编辑器

在这里编写 **Markdown**，右侧会实时预览。

## 支持的语法

- **粗体**、*斜体*、~~删除线~~、\`行内代码\`
- [链接](https://example.com) 与图片
- 有序 / 无序列表、引用、表格、代码块
- 数学公式：$E = mc^2$、$$\\int_0^1 x^2 dx$$

> 内容会自动保存在本机浏览器中，刷新或重新打开都不会丢失。

### 代码块

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

### 表格

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 实时预览 | 已完成 | 分栏同步滚动 |
| 导出 | 已完成 | .md / .html / 打印 PDF |
| 本地保存 | 已完成 | localStorage |

---

快捷键：Ctrl/⌘ + B 粗体，Ctrl/⌘ + I 斜体，Tab 插入缩进。
`;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function renderSafeHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

function documentTitle(markdown: string): string {
  const match = /^\s*#\s+(.+)$/m.exec(markdown);
  const title = match ? match[1].trim() : 'Markdown 文档';
  return title.slice(0, 60) || 'Markdown 文档';
}

function safeFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return cleaned || 'markdown-document';
}

function countWords(text: string): { chars: number; hanzi: number; words: number; lines: number } {
  return {
    chars: Array.from(text).length,
    hanzi: (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length,
    words: (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length,
    lines: text === '' ? 0 : text.split('\n').length,
  };
}

function readingLabel(seconds: number): string {
  if (seconds <= 0) return '0 秒';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} 分钟`;
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
    >
      <Icon className="size-4" />
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-[var(--card-border)] sm:inline-block" />;
}

export default function MarkdownEditorTool() {
  const [content, setContent] = useLocalStorage<string>(STORAGE_KEY, SAMPLE);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<'clear' | 'sample' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const toast = useToast();

  const stats = useMemo(() => countWords(content), [content]);
  const readingSeconds = Math.round((stats.hanzi / 300 + stats.words / 200) * 60);

  const focusSelection = useCallback((start: number, end: number) => {
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(start, end);
    });
  }, []);

  const wrapSelection = useCallback(
    (before: string, after: string, placeholder: string) => {
      const element = textareaRef.current;
      if (!element) return;
      const start = element.selectionStart ?? content.length;
      const end = element.selectionEnd ?? content.length;
      const selected = content.slice(start, end) || placeholder;
      const next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
      setContent(next);
      focusSelection(start + before.length, start + before.length + selected.length);
    },
    [content, focusSelection, setContent],
  );

  const prefixLines = useCallback(
    (prefix: string | ((index: number) => string)) => {
      const element = textareaRef.current;
      if (!element) return;
      const selectionStart = element.selectionStart ?? content.length;
      const selectionEnd = element.selectionEnd ?? content.length;
      const start = content.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
      let end = content.indexOf('\n', selectionEnd);
      if (end === -1) end = content.length;
      const block = content.slice(start, end);
      const nextBlock = block
        .split('\n')
        .map((line, index) => `${typeof prefix === 'function' ? prefix(index) : prefix}${line}`)
        .join('\n');
      const next = content.slice(0, start) + nextBlock + content.slice(end);
      const firstPrefix = typeof prefix === 'function' ? prefix(0) : prefix;
      setContent(next);
      focusSelection(start + firstPrefix.length, start + nextBlock.length);
    },
    [content, focusSelection, setContent],
  );

  const insertSnippet = useCallback(
    (snippet: string) => {
      const element = textareaRef.current;
      if (!element) return;
      const start = element.selectionStart ?? content.length;
      const end = element.selectionEnd ?? content.length;
      const before = content.slice(0, start);
      const after = content.slice(end);
      const leading = before !== '' && !before.endsWith('\n') ? '\n' : '';
      const trailing = after !== '' && !after.startsWith('\n') ? '\n' : '';
      const insertion = `${leading}${snippet}${trailing}`;
      setContent(before + insertion + after);
      focusSelection(start + insertion.length, start + insertion.length);
    },
    [content, focusSelection, setContent],
  );

  const insertLink = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    const start = element.selectionStart ?? content.length;
    const end = element.selectionEnd ?? content.length;
    const label = content.slice(start, end) || '链接文字';
    const url = 'https://';
    const next = `${content.slice(0, start)}[${label}](${url})${content.slice(end)}`;
    setContent(next);
    focusSelection(start + label.length + 3, start + label.length + 3 + url.length);
  }, [content, focusSelection, setContent]);

  const insertImage = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    const start = element.selectionStart ?? content.length;
    const end = element.selectionEnd ?? content.length;
    const alt = content.slice(start, end) || '图片描述';
    const url = 'https://example.com/image.png';
    const next = `${content.slice(0, start)}![${alt}](${url})${content.slice(end)}`;
    setContent(next);
    focusSelection(start + alt.length + 4, start + alt.length + 4 + url.length);
  }, [content, focusSelection, setContent]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        wrapSelection('**', '**', '粗体');
        return;
      }
      if (key === 'i') {
        event.preventDefault();
        wrapSelection('*', '*', '斜体');
        return;
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const element = event.currentTarget;
      const start = element.selectionStart;
      const end = element.selectionEnd;
      setContent(content.slice(0, start) + '  ' + content.slice(end));
      focusSelection(start + 2, start + 2);
    }
  }

  function syncScroll(source: HTMLElement, target: HTMLElement | null) {
    if (!target || syncingRef.current) return;
    syncingRef.current = true;
    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;
    const ratio = sourceMax > 0 ? source.scrollTop / sourceMax : 0;
    target.scrollTop = ratio * targetMax;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  function exportMarkdown() {
    if (!content.trim()) {
      toast.error('没有可导出的内容');
      return;
    }
    download(content, `${safeFileName(documentTitle(content))}.md`, 'text/markdown;charset=utf-8');
    toast.success('Markdown 文件已导出');
  }

  function exportHtml() {
    if (!content.trim()) {
      toast.error('没有可导出的内容');
      return;
    }
    const title = documentTitle(content);
    const body = renderSafeHtml(content);
    const documentHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 40px 20px; background: #fff; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.75; }
  article { max-width: 820px; margin: 0 auto; word-break: break-word; }
  h1, h2, h3, h4 { line-height: 1.3; margin: 1.6em 0 0.6em; }
  h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #e5e7eb; }
  h2 { font-size: 1.5em; padding-bottom: 0.25em; border-bottom: 1px solid #f3f4f6; }
  h3 { font-size: 1.25em; }
  p { margin: 0.8em 0; }
  a { color: #4f46e5; }
  ul, ol { padding-left: 1.6em; margin: 0.8em 0; }
  li + li { margin-top: 0.25em; }
  blockquote { margin: 1em 0; padding: 0.2em 1em; border-left: 4px solid #d1d5db; color: #4b5563; }
  code { background: #f3f4f6; padding: 0.15em 0.35em; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
  pre { background: #f6f8fa; padding: 14px; border-radius: 8px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
  th { background: #f3f4f6; }
  img { max-width: 100%; height: auto; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 2em 0; }
</style>
</head>
<body>
<article>${body}</article>
</body>
</html>`;
    download(documentHtml, `${safeFileName(title)}.html`, 'text/html;charset=utf-8');
    toast.success('HTML 文件已导出');
  }

  function exportPdf() {
    if (!content.trim()) {
      toast.error('没有可导出的内容');
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      const title = documentTitle(content);
      printHtmlDocument(
        title,
        `<div class="print-doc">${renderSafeHtml(content)}</div>`,
        `
          .print-doc h1 { font-size: 22px; margin: 0 0 12px; }
          .print-doc h2 { font-size: 18px; margin: 20px 0 8px; }
          .print-doc h3 { font-size: 15px; margin: 16px 0 6px; }
          .print-doc p { margin: 8px 0; }
          .print-doc ul, .print-doc ol { padding-left: 20px; }
          .print-doc pre code { background: transparent; padding: 0; }
          .print-doc code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
        `,
      );
      toast.success('已打开打印窗口，可在对话框中选择「另存为 PDF」');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '打开打印窗口失败，请重试');
    } finally {
      setExporting(false);
    }
  }

  function confirmPending() {
    if (pending === 'clear') {
      setContent('');
      toast.success('已清空内容');
    } else if (pending === 'sample') {
      setContent(SAMPLE);
      toast.success('已载入示例');
    }
    setPending(null);
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Markdown 编辑器"
        description="左侧编写，右侧实时预览；内容自动保存在本机浏览器。"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs subtle">
              <span>{stats.chars.toLocaleString('zh-CN')} 字符</span>
              <span>{stats.hanzi.toLocaleString('zh-CN')} 汉字</span>
              <span>{stats.words.toLocaleString('zh-CN')} 英文单词</span>
              <span>{stats.lines.toLocaleString('zh-CN')} 行</span>
              <span>约 {readingLabel(readingSeconds)} 阅读</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                自动保存
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={Sparkles}
                onClick={() => {
                  if (content.trim() === '') setContent(SAMPLE);
                  else setPending('sample');
                }}
              >
                示例
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setPending('clear')}
                disabled={!content}
              >
                清空
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={exportMarkdown}>
                导出 .md
              </Button>
              <Button variant="secondary" size="sm" icon={FileDown} onClick={exportHtml}>
                导出 HTML
              </Button>
              <Button variant="primary" size="sm" icon={FileText} loading={exporting} onClick={exportPdf}>
                打印 / PDF
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-[var(--hover-bg)]/60 px-2 py-1.5">
          <ToolbarButton label="一级标题" icon={Heading1} onClick={() => prefixLines('# ')} />
          <ToolbarButton label="二级标题" icon={Heading2} onClick={() => prefixLines('## ')} />
          <ToolbarDivider />
          <ToolbarButton label="粗体（Ctrl/⌘ + B）" icon={Bold} onClick={() => wrapSelection('**', '**', '粗体')} />
          <ToolbarButton label="斜体（Ctrl/⌘ + I）" icon={Italic} onClick={() => wrapSelection('*', '*', '斜体')} />
          <ToolbarButton label="删除线" icon={Strikethrough} onClick={() => wrapSelection('~~', '~~', '删除线')} />
          <ToolbarDivider />
          <ToolbarButton label="引用" icon={Quote} onClick={() => prefixLines('> ')} />
          <ToolbarButton label="无序列表" icon={List} onClick={() => prefixLines('- ')} />
          <ToolbarButton label="有序列表" icon={ListOrdered} onClick={() => prefixLines((index) => `${index + 1}. `)} />
          <ToolbarDivider />
          <ToolbarButton label="行内代码" icon={Code} onClick={() => wrapSelection('`', '`', '代码')} />
          <ToolbarButton
            label="代码块"
            icon={Terminal}
            onClick={() => insertSnippet('```ts\n// 代码\n```')}
          />
          <ToolbarButton label="链接" icon={Link2} onClick={insertLink} />
          <ToolbarButton label="图片" icon={Image} onClick={insertImage} />
          <ToolbarDivider />
          <ToolbarButton
            label="表格"
            icon={Table}
            onClick={() => insertSnippet('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |')}
          />
          <ToolbarButton
            label="分割线"
            icon={Minus}
            onClick={() => insertSnippet('---')}
          />
          <span className="ml-auto hidden text-[11px] subtle sm:inline">
            Markdown · {stats.lines.toLocaleString('zh-CN')} 行
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col overflow-hidden rounded-xl border bg-[var(--input-bg)]">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs subtle">
              <span>编辑</span>
              <span>Markdown</span>
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={handleKeyDown}
              onScroll={(event: UIEvent<HTMLTextAreaElement>) => syncScroll(event.currentTarget, previewRef.current)}
              placeholder="在此输入 Markdown 文本…"
              spellCheck={false}
              className="h-[420px] w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed outline-none sm:h-[520px]"
            />
          </div>
          <div className="flex flex-col overflow-hidden rounded-xl border bg-[var(--card-bg)]">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs subtle">
              <span>预览</span>
              <span>{stats.chars.toLocaleString('zh-CN')} 字符</span>
            </div>
            <div
              ref={previewRef}
              onScroll={(event: UIEvent<HTMLDivElement>) => syncScroll(event.currentTarget, textareaRef.current)}
              className="h-[420px] overflow-auto p-4 sm:h-[520px]"
            >
              <Markdown content={content} empty="在左侧输入 Markdown，右侧会实时预览。" />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Hint>
            导出 PDF 使用浏览器原生打印（A4 自动分页），在打印对话框中选择「另存为 PDF」即可；跨域图片可能无法打印。所有内容只保存在浏览器中。
          </Hint>
        </div>
      </Panel>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending === 'clear' ? '清空编辑器内容？' : '载入示例并替换当前内容？'}
        description={
          pending === 'clear'
            ? '当前草稿也会从浏览器本地存储中删除，此操作无法撤销。'
            : '示例会覆盖当前草稿，覆盖后本地保存的内容也会被替换。'
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPending(null)}>
              取消
            </Button>
            <Button variant={pending === 'clear' ? 'danger' : 'primary'} size="sm" onClick={confirmPending}>
              {pending === 'clear' ? '清空' : '载入示例'}
            </Button>
          </>
        }
      >
        <p className="text-sm muted">
          {pending === 'clear'
            ? '建议先导出 .md 备份，再清空当前内容。'
            : '载入示例会覆盖当前编辑的内容，如需保留请先导出备份。'}
        </p>
      </Modal>
    </div>
  );
}
