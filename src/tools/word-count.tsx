import { useDeferredValue, useMemo, useState } from 'react';
import { Clock, Download, FileText, Hash, Languages, List, Quote, Sparkles, Trash2, Type, type LucideIcon } from 'lucide-react';
import { Hint, Panel, Textarea } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Spinner } from '../components/ui';
import { download } from '../lib/utils';
import { useToast } from '../lib/toast';

interface TextStats {
  chars: number;
  charsNoSpace: number;
  hanzi: number;
  latin: number;
  digits: number;
  spaces: number;
  other: number;
  words: number;
  numbers: number;
  lines: number;
  nonEmptyLines: number;
  paragraphs: number;
  sentences: number;
  bytes: number;
  readingSeconds: number;
}

const SAMPLE = `秋风起，落叶黄。Lith Tools 让每一次换算都简单可靠。
The quick brown fox jumps over the lazy dog.

2024 年 10 月 1 日，我们读了 3 本书，写下 1200 字，也整理了一份 15 页的笔记。
数字 42 是科幻小说里的经典答案。`;

function analyze(text: string): TextStats {
  const chars = Array.from(text).length;
  const charsNoSpace = Array.from(text.replace(/\s/g, '')).length;
  const hanzi = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const digits = (text.match(/[0-9]/g) ?? []).length;
  const spaces = (text.match(/\s/g) ?? []).length;
  const other = Math.max(0, chars - hanzi - latin - digits - spaces);
  const words = (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
  const numbers = (text.match(/\d+(?:[.,]\d+)*/g) ?? []).length;
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized === '' ? 0 : normalized.split('\n').length;
  const nonEmptyLines = normalized === '' ? 0 : normalized.split('\n').filter((line) => line.trim() !== '').length;
  const paragraphs = normalized.trim() === '' ? 0 : normalized.split(/\n\s*\n+/).filter((block) => block.trim() !== '').length;
  const sentences = text.split(/[.!?。！？…]+/).filter((part) => part.trim() !== '').length;
  const bytes = new TextEncoder().encode(text).length;
  const readingSeconds = Math.round((hanzi / 300 + words / 200) * 60);

  return {
    chars,
    charsNoSpace,
    hanzi,
    latin,
    digits,
    spaces,
    other,
    words,
    numbers,
    lines,
    nonEmptyLines,
    paragraphs,
    sentences,
    bytes,
    readingSeconds,
  };
}

function formatReadingTime(seconds: number): string {
  if (seconds <= 0) return '0 秒';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} 秒`;
  return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
      <div className="flex items-center gap-2 text-xs subtle">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs subtle">{hint}</p> : null}
    </div>
  );
}

export default function WordCountTool() {
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text);
  const stats = useMemo(() => analyze(deferred), [deferred]);
  const pending = deferred !== text;
  const toast = useToast();
  const large = deferred.length > 200_000;
  const hasText = text.trim() !== '';

  const summary = useMemo(
    () =>
      [
        '字数统计结果',
        `字符数（含空格）：${stats.chars}`,
        `字符数（不含空格）：${stats.charsNoSpace}`,
        `汉字数：${stats.hanzi}`,
        `英文单词数：${stats.words}`,
        `数字数量：${stats.numbers}`,
        `行数：${stats.lines}（非空 ${stats.nonEmptyLines}）`,
        `段落数：${stats.paragraphs}`,
        `句子数：${stats.sentences}`,
        `字节数（UTF-8）：${stats.bytes}`,
        `阅读时长：约 ${formatReadingTime(stats.readingSeconds)}`,
      ].join('\n'),
    [stats],
  );

  const distribution = [
    { label: '汉字', count: stats.hanzi, color: 'bg-indigo-500' },
    { label: '字母', count: stats.latin, color: 'bg-sky-500' },
    { label: '数字', count: stats.digits, color: 'bg-emerald-500' },
    { label: '空白', count: stats.spaces, color: 'bg-slate-400' },
    { label: '其他', count: stats.other, color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-4">
      <Panel title="文本输入" description="粘贴或输入文本，统计结果实时更新，所有处理均在本地完成。">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="在此输入或粘贴文本…支持长文本、中文与英文混排。"
          rows={12}
          className="min-h-[240px] text-sm leading-relaxed"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs subtle">
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner className="size-3.5" /> 正在统计…
              </span>
            ) : (
              <span>已统计 {stats.chars.toLocaleString('zh-CN')} 个字符</span>
            )}
            {large ? <Badge tone="warning">文本较大，统计可能稍有延迟</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={Sparkles}
              onClick={() => {
                setText(SAMPLE);
                toast.info('已载入示例文本');
              }}
            >
              示例
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => {
                setText('');
                toast.success('已清空文本');
              }}
              disabled={!text}
            >
              清空
            </Button>
            <CopyButton text={summary} label="复制统计" />
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              disabled={!hasText}
              onClick={() => {
                download(summary, 'word-count-stats.txt', 'text/plain;charset=utf-8');
                toast.success('统计结果已下载');
              }}
            >
              下载统计
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="统计结果" description="阅读时长按中文 300 字/分钟、英文 200 词/分钟估算。">
        {!hasText ? (
          <EmptyState
            icon={Type}
            title="还没有内容"
            description="粘贴或输入文本后，这里会显示字符数、汉字数、英文单词数、行数、段落数与阅读时长。"
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile icon={Type} label="字符（含空格）" value={stats.chars.toLocaleString('zh-CN')} />
              <StatTile icon={Languages} label="汉字" value={stats.hanzi.toLocaleString('zh-CN')} />
              <StatTile icon={Languages} label="英文单词" value={stats.words.toLocaleString('zh-CN')} />
              <StatTile
                icon={Clock}
                label="阅读时长"
                value={formatReadingTime(stats.readingSeconds)}
                hint="中文 300 字/分钟"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
                <p className="text-xs subtle">字符（不含空格）</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{stats.charsNoSpace.toLocaleString('zh-CN')}</p>
              </div>
              <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
                <p className="text-xs subtle">数字数量</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{stats.numbers.toLocaleString('zh-CN')}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { icon: List, label: '行数', value: `${stats.lines} 行`, hint: `非空 ${stats.nonEmptyLines} 行` },
                { icon: FileText, label: '段落数', value: `${stats.paragraphs} 段`, hint: '以空行分隔' },
                { icon: Quote, label: '句子数', value: `${stats.sentences} 句`, hint: '按中英文标点切分' },
                { icon: Hash, label: '字节数', value: `${stats.bytes.toLocaleString('zh-CN')} B`, hint: 'UTF-8 编码' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
                >
                  <span className="flex items-center gap-2 muted">
                    <item.icon className="size-4" />
                    {item.label}
                  </span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums">{item.value}</span>
                    <span className="ml-2 text-xs subtle">{item.hint}</span>
                  </span>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between text-xs subtle">
                <span>字符构成</span>
                <span>{stats.chars.toLocaleString('zh-CN')} 字符</span>
              </div>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[var(--hover-bg)]">
                {distribution.map((item) =>
                  item.count > 0 && stats.chars > 0 ? (
                    <div
                      key={item.label}
                      className={item.color}
                      style={{ width: `${(item.count / stats.chars) * 100}%` }}
                      title={`${item.label}：${item.count}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs subtle">
                {distribution.map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${item.color}`} />
                    {item.label} {item.count.toLocaleString('zh-CN')}
                  </span>
                ))}
              </div>
            </div>

            {large ? (
              <Alert tone="info" title="大文本模式">
                当前文本约 {Math.round(deferred.length / 1000).toLocaleString('zh-CN')} 千字符，统计使用延迟渲染以避免输入卡顿。
              </Alert>
            ) : null}
            <Hint>段落按空行分隔统计；行数包含空行，句子按「。！？.!?…」切分。</Hint>
          </div>
        )}
      </Panel>
    </div>
  );
}
