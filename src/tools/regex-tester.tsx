import { useMemo, useState } from 'react';
import { Regex, SearchX, Trash2 } from 'lucide-react';
import { Field, Hint, Panel, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Input, Textarea } from '../components/ui';
import { cn } from '../lib/utils';

type FlagKey = 'g' | 'i' | 'm' | 's' | 'u' | 'y';
type Flags = Record<FlagKey, boolean>;

interface MatchRecord {
  index: number;
  text: string;
  groups: (string | undefined)[];
  named: Record<string, string> | undefined;
}

interface Analysis {
  matches: MatchRecord[];
  truncated: boolean;
  slow: boolean;
  zeroWidth: boolean;
}

interface Segment {
  text: string;
  match: boolean;
  order: number;
}

interface Example {
  name: string;
  pattern: string;
  flags: string;
  sample: string;
}

const FLAG_META: { key: FlagKey; label: string; short: string; description: string }[] = [
  { key: 'g', label: 'g', short: '全局', description: '全局匹配：查找所有结果' },
  { key: 'i', label: 'i', short: '忽略大小写', description: '忽略大小写' },
  { key: 'm', label: 'm', short: '多行', description: '多行模式：^ 与 $ 匹配每行起止' },
  { key: 's', label: 's', short: '点号跨行', description: '点号 . 也匹配换行' },
  { key: 'u', label: 'u', short: 'Unicode', description: 'Unicode 模式' },
  { key: 'y', label: 'y', short: '粘性', description: '粘性匹配：只从 lastIndex 处匹配' },
];

const FLAG_KEYS: FlagKey[] = ['g', 'i', 'm', 's', 'u', 'y'];
const DEFAULT_FLAGS: Flags = { g: true, i: false, m: false, s: false, u: false, y: false };

const MAX_PATTERN = 500;
const MAX_TEXT = 10_000;
const MAX_MATCHES = 200;
const MAX_RENDERED_MATCHES = 100;
const TIME_BUDGET = 80;

const HIGHLIGHT_CLASSES = [
  'rounded bg-indigo-100 text-indigo-900 dark:bg-indigo-500/30 dark:text-indigo-50',
  'rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-500/30 dark:text-emerald-50',
];

const EXAMPLES: Example[] = [
  {
    name: '邮箱地址',
    pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
    flags: 'gi',
    sample: '联系 alice@example.com 或 bob.smith@mail.co.uk 获取更多信息。',
  },
  {
    name: 'URL',
    pattern: 'https?://[^\\s"\'<>]+',
    flags: 'gi',
    sample: '访问 https://example.com/path?a=1 或 http://lith.tools 查看文档。',
  },
  {
    name: '手机号',
    pattern: '1[3-9]\\d{9}',
    flags: 'g',
    sample: '客服电话 13800138000，备用号码 15912345678。',
  },
  {
    name: '日期（命名分组）',
    pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})',
    flags: 'g',
    sample: '发布于 2024-05-18，最后更新于 2025-01-02。',
  },
  {
    name: 'IPv4',
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    flags: 'g',
    sample: '服务器 192.168.1.10 与 10.0.0.1，错误地址 999.1.1.1。',
  },
  {
    name: '中文字符',
    pattern: '[\\u4e00-\\u9fa5]+',
    flags: 'g',
    sample: 'Lith Tools 提供浏览器本地处理的在线工具，支持中文匹配。',
  },
  {
    name: 'HTML 标签',
    pattern: '<([a-z][a-z0-9]*)\\b[^>]*>(.*?)</\\1>',
    flags: 'gis',
    sample: '<div class="card">内容</div>\n<span>行内文本</span>',
  },
  {
    name: '十六进制颜色',
    pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b',
    flags: 'g',
    sample: '主色 #6366F1，辅助色 #a855f7，旧值 #fff。',
  },
];

function toRecord(match: RegExpExecArray): MatchRecord {
  return {
    index: match.index,
    text: match[0],
    groups: match.slice(1),
    named: match.groups,
  };
}

function collectMatches(regex: RegExp, text: string): Analysis {
  const matches: MatchRecord[] = [];
  const started = performance.now();
  let truncated = false;
  let slow = false;

  if (!regex.global && !regex.sticky) {
    const first = regex.exec(text);
    if (first) matches.push(toRecord(first));
    return { matches, truncated, slow, zeroWidth: first ? first[0] === '' : false };
  }

  regex.lastIndex = 0;
  let guard = 0;
  while (guard < MAX_MATCHES * 2) {
    guard += 1;
    if (performance.now() - started > TIME_BUDGET) {
      slow = true;
      break;
    }
    const match = regex.exec(text);
    if (!match) break;
    matches.push(toRecord(match));
    if (match[0] === '') {
      regex.lastIndex += 1;
      if (regex.lastIndex > text.length) break;
    }
    if (matches.length >= MAX_MATCHES) {
      const hasMore = regex.exec(text) !== null;
      truncated = hasMore;
      break;
    }
  }

  return { matches, truncated, slow, zeroWidth: matches.some((match) => match.text === '') };
}

function buildSegments(text: string, matches: MatchRecord[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  matches.forEach((match, order) => {
    if (match.text === '' || match.index < cursor) return;
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), match: false, order: 0 });
    segments.push({ text: match.text, match: true, order });
    cursor = match.index + match.text.length;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false, order: 0 });
  return segments;
}

/** Regex tester with flags, live highlighting, capture groups and replacement preview. */
export default function RegexTesterTool() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [testText, setTestText] = useState('');
  const [replacement, setReplacement] = useState('');

  const flagString = useMemo(() => FLAG_KEYS.filter((key) => flags[key]).join(''), [flags]);
  const safeText = useMemo(() => testText.slice(0, MAX_TEXT), [testText]);
  const truncatedInput = testText.length > MAX_TEXT;

  const compiled = useMemo<{ regex: RegExp | null; error: string | null }>(() => {
    if (!pattern) return { regex: null, error: null };
    if (pattern.length > MAX_PATTERN) {
      return { regex: null, error: `模式过长（${pattern.length} 字符），请控制在 ${MAX_PATTERN} 字符以内。` };
    }
    try {
      return { regex: new RegExp(pattern, flagString), error: null };
    } catch (error) {
      return { regex: null, error: error instanceof Error ? error.message : '正则表达式无效' };
    }
  }, [flagString, pattern]);

  const analysis = useMemo<Analysis | null>(() => {
    if (!compiled.regex) return null;
    const regex = new RegExp(compiled.regex.source, compiled.regex.flags);
    return collectMatches(regex, safeText);
  }, [compiled, safeText]);

  const segments = useMemo(() => {
    if (!analysis) return [];
    return buildSegments(safeText, analysis.matches);
  }, [analysis, safeText]);

  const replaced = useMemo(() => {
    if (!compiled.regex || !safeText) return null;
    try {
      const regex = new RegExp(compiled.regex.source, compiled.regex.flags);
      return safeText.replace(regex, replacement);
    } catch {
      return null;
    }
  }, [compiled, replacement, safeText]);

  const riskyPattern = useMemo(() => /\((?:[^()]|\\.)*[+*]\)[+*{]/.test(pattern), [pattern]);

  const matchesText = useMemo(() => {
    if (!analysis || analysis.matches.length === 0) return '';
    return analysis.matches
      .map((match, index) => `${index + 1}. [${match.index}] ${match.text || '（零宽匹配）'}`)
      .join('\n');
  }, [analysis]);

  const status: 'empty' | 'error' | 'ready' = !pattern.trim()
    ? 'empty'
    : compiled.error
      ? 'error'
      : 'ready';

  const applyExample = (example: Example) => {
    const next: Flags = { g: false, i: false, m: false, s: false, u: false, y: false };
    for (const char of example.flags) {
      if ((FLAG_KEYS as string[]).includes(char)) next[char as FlagKey] = true;
    }
    setPattern(example.pattern);
    setFlags(next);
    setTestText(example.sample);
    setReplacement('');
  };

  const clearAll = () => {
    setPattern('');
    setTestText('');
    setReplacement('');
    setFlags(DEFAULT_FLAGS);
  };

  return (
    <div className="space-y-4">
      <Panel title="正则表达式" description="输入模式并勾选标志位，结果会实时更新。">
        <Field
          label="模式"
          htmlFor="regex-pattern"
          error={compiled.error}
          hint="不需要输入两侧的斜杠，直接写模式本身即可。"
        >
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm subtle">
              /
            </span>
            <Input
              id="regex-pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder={String.raw`\b\w+@\w+\.\w+\b`}
              spellCheck={false}
              autoComplete="off"
              error={Boolean(compiled.error)}
              className="pr-20 pl-7 font-mono"
              aria-invalid={Boolean(compiled.error)}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs subtle">
              /{flagString}
            </span>
          </div>
        </Field>

        <div className="mt-4">
          <p className="label">标志位（flags）</p>
          <div className="flex flex-wrap gap-2">
            {FLAG_META.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.description}
                aria-pressed={flags[item.key]}
                onClick={() => setFlags((previous) => ({ ...previous, [item.key]: !previous[item.key] }))}
                className={cn('chip font-mono', flags[item.key] && 'chip-active')}
              >
                <span className="font-semibold">{item.label}</span>
                <span className="text-[11px] font-normal opacity-80">{item.short}</span>
              </button>
            ))}
          </div>
        </div>

        {compiled.error ? (
          <Alert tone="error" title="正则表达式错误" className="mt-4">
            <p className="break-words font-mono text-xs">{compiled.error}</p>
          </Alert>
        ) : null}

        {riskyPattern && !compiled.error ? (
          <Alert tone="warning" title="可能触发灾难性回溯" className="mt-4">
            模式中包含嵌套量词（例如 (a+)+），这类写法在长文本上可能非常慢。测试文本已被限制为 {MAX_TEXT.toLocaleString('zh-CN')}{' '}
            字符，并设置了匹配时间上限。
          </Alert>
        ) : null}

        <div className="mt-4">
          <Button variant="ghost" size="sm" icon={Trash2} onClick={clearAll} disabled={!pattern && !testText}>
            清空全部
          </Button>
        </div>
        <div className="mt-2">
          <Hint>提示：可用 (?&lt;name&gt;...) 命名分组，替换时用 $&lt;name&gt; 引用。</Hint>
        </div>
      </Panel>

      <ToolSplit>
        <Panel
          title="测试文本"
          description={`最多对前 ${MAX_TEXT.toLocaleString('zh-CN')} 个字符做匹配`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs subtle">
              <span>
                {testText.length.toLocaleString('zh-CN')} 字符
                {truncatedInput ? `（仅测试前 ${MAX_TEXT.toLocaleString('zh-CN')} 个）` : ''}
              </span>
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setTestText('')} disabled={!testText}>
                清空
              </Button>
            </div>
          }
        >
          <Textarea
            value={testText}
            onChange={(event) => setTestText(event.target.value)}
            placeholder="在此粘贴需要测试的文本…"
            spellCheck={false}
            className="min-h-48 resize-y font-mono text-xs leading-6"
            aria-label="测试文本"
          />
          {truncatedInput ? (
            <Alert tone="warning" className="mt-3">
              测试文本超过 {MAX_TEXT.toLocaleString('zh-CN')} 字符，仅对前 {MAX_TEXT.toLocaleString('zh-CN')}{' '}
              个字符进行匹配，以避免灾难性回溯导致页面卡死。
            </Alert>
          ) : null}
        </Panel>

        <Panel title="匹配高亮" description="匹配到的片段会按颜色交替标出">
          {status === 'empty' ? (
            <EmptyState
              icon={Regex}
              title="还没有正则表达式"
              description="在上方输入模式，或从下方常用示例中选择一个。"
            />
          ) : status === 'error' ? (
            <p className="text-sm muted">修正正则表达式错误后即可查看匹配结果。</p>
          ) : !safeText ? (
            <EmptyState
              icon={Regex}
              title="测试文本为空"
              description="在左侧输入一些文本，匹配结果会立即显示。"
            />
          ) : analysis && analysis.matches.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="没有匹配项"
              description="检查模式是否正确，或尝试勾选 i（忽略大小写）、m（多行）等标志位。"
            />
          ) : (
            <pre className="max-h-[28rem] min-h-32 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6 break-words whitespace-pre-wrap">
              {segments.map((segment, index) =>
                segment.match ? (
                  <span
                    key={index}
                    className={cn('px-0.5', HIGHLIGHT_CLASSES[segment.order % HIGHLIGHT_CLASSES.length])}
                  >
                    {segment.text}
                  </span>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </pre>
          )}
        </Panel>
      </ToolSplit>

      <ToolSplit>
        <Panel
          title="匹配结果"
          description="包含每处匹配的位置、文本与捕获组"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {matchesText ? <CopyButton text={matchesText} label="复制匹配列表" /> : null}
              <span className="text-xs subtle">
                {analysis ? `共 ${analysis.matches.length.toLocaleString('zh-CN')} 处匹配` : '—'}
              </span>
            </div>
          }
        >
          {status !== 'ready' || !analysis ? (
            <p className="text-sm muted">{status === 'error' ? '请先修正正则表达式。' : '输入模式与文本后显示匹配详情。'}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={analysis.matches.length > 0 ? 'success' : 'default'}>
                  共 {analysis.matches.length} 处匹配
                </Badge>
                {analysis.truncated ? <Badge tone="warning">仅显示前 {MAX_MATCHES} 条</Badge> : null}
                {analysis.slow ? <Badge tone="warning">耗时过长已中止</Badge> : null}
                {analysis.zeroWidth ? <Badge>含零宽匹配</Badge> : null}
              </div>
              {analysis.matches.length === 0 ? (
                <p className="text-sm muted">没有匹配项。</p>
              ) : (
                <div className="max-h-[28rem] space-y-2 overflow-auto pr-1">
                  {analysis.matches.slice(0, MAX_RENDERED_MATCHES).map((match, index) => (
                    <div key={`${match.index}-${index}`} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="brand">#{index + 1}</Badge>
                        <span className="text-[11px] subtle">
                          位置 {match.index} · 长度 {match.text.length}
                        </span>
                      </div>
                      <p className="mt-1.5 font-mono text-xs break-all">
                        {match.text || '（零宽匹配，不占用字符）'}
                      </p>
                      {match.groups.length > 0 ? (
                        <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                          {match.groups.map((group, groupIndex) => (
                            <li key={groupIndex} className="flex gap-2">
                              <span className="shrink-0 subtle">组 {groupIndex + 1}</span>
                              <span className="font-mono break-all">
                                {group === undefined ? '未参与匹配' : group === '' ? '（空字符串）' : group}
                              </span>
                            </li>
                          ))}
                          {match.named
                            ? Object.entries(match.named).map(([name, value]) => (
                                <li key={`named-${name}`} className="flex gap-2">
                                  <span className="shrink-0 text-indigo-600 dark:text-indigo-400">{name}</span>
                                  <span className="font-mono break-all">{value === '' ? '（空字符串）' : value}</span>
                                </li>
                              ))
                            : null}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                  {analysis.matches.length > MAX_RENDERED_MATCHES ? (
                    <p className="text-xs subtle">
                      仅展示前 {MAX_RENDERED_MATCHES} 条匹配，可使用「复制匹配列表」获取全部文本。
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel
          title="替换预览"
          description="使用 $1、$2、$&、$<name> 等引用匹配内容"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {typeof replaced === 'string' ? <CopyButton text={replaced} label="复制替换结果" /> : null}
            </div>
          }
        >
          <Field
            label="替换为"
            htmlFor="regex-replacement"
            hint="留空表示删除所有匹配内容；$& 表示整个匹配。"
          >
            <Input
              id="regex-replacement"
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder="$1"
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
          </Field>

          {status !== 'ready' ? (
            <p className="mt-4 text-sm muted">输入有效的正则表达式后显示替换结果。</p>
          ) : !safeText ? (
            <p className="mt-4 text-sm muted">测试文本为空，暂无替换结果。</p>
          ) : typeof replaced === 'string' ? (
            <pre className="mt-4 max-h-64 min-h-24 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6 break-words whitespace-pre-wrap">
              {replaced}
            </pre>
          ) : (
            <p className="mt-4 text-sm muted">替换文本有误，无法生成预览。</p>
          )}

          {truncatedInput && status === 'ready' ? (
            <div className="mt-3">
              <Hint>替换预览同样只基于前 {MAX_TEXT.toLocaleString('zh-CN')} 个字符。</Hint>
            </div>
          ) : null}
        </Panel>
      </ToolSplit>

      <Panel title="常用示例" description="点击即可载入模式、标志位与示例文本">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.name}
              type="button"
              onClick={() => applyExample(example)}
              className="chip"
              title={example.pattern}
            >
              {example.name}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
