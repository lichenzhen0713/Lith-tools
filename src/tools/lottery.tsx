import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, RotateCcw, Sparkles, Trash2, Trophy } from 'lucide-react';
import { Actions, Field, Hint, Panel, Textarea, ToolSplit } from './kit';
import { Alert, Button, CopyButton, EmptyState, Input, Modal, Spinner, Switch } from '../components/ui';
import { formatDate, formatNumber, uid } from '../lib/utils';
import { useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

interface HistoryEntry {
  id: string;
  winners: string[];
  candidateCount: number;
  at: number;
}

const MAX_CANDIDATES = 300;
const MAX_WINNERS = 20;
const MAX_HISTORY = 30;
const ROLL_INTERVAL = 70;
const ROLL_DURATION = 1500;

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

function randomIntInclusive(min: number, max: number): number {
  const range = max - min + 1;
  if (range <= 0) return min;
  const limit = Math.floor(4294967296 / range) * range;
  let value = randomUint32();
  let guard = 0;
  while (value >= limit && guard < 128) {
    value = randomUint32();
    guard += 1;
  }
  return min + (value % range);
}

/** Draw `count` entries, either without replacement (distinct) or with replacement. */
function pickWinners(pool: string[], count: number, distinct: boolean): string[] {
  if (distinct) {
    const indices = pool.map((_, index) => index);
    const limit = Math.min(count, indices.length);
    for (let index = 0; index < limit; index += 1) {
      const target = index + randomIntInclusive(0, indices.length - 1 - index);
      const swap = indices[index];
      indices[index] = indices[target];
      indices[target] = swap;
    }
    return indices.slice(0, limit).map((index) => pool[index]);
  }
  return Array.from({ length: count }, () => pool[randomIntInclusive(0, pool.length - 1)]);
}

function parseCandidates(raw: string): { items: string[]; duplicates: number } {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const chunks = normalized.includes('\n') ? normalized.split('\n') : normalized.split(/[,，、;；]/);
  const items: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const chunk of chunks) {
    const value = chunk.trim();
    if (!value) continue;
    if (seen.has(value)) {
      duplicates += 1;
      continue;
    }
    seen.add(value);
    items.push(value);
  }
  return { items, duplicates };
}

export default function LotteryTool() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [countRaw, setCountRaw] = useState('1');
  const [distinctWinners, setDistinctWinners] = useState(true);
  const [touched, setTouched] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('lith-lottery-history', []);
  const [confirmClear, setConfirmClear] = useState(false);

  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const analysis = useMemo(() => {
    const { items, duplicates } = parseCandidates(text);
    const count = Number(countRaw);
    const maxWinners = distinctWinners ? Math.min(items.length, MAX_WINNERS) : MAX_WINNERS;
    let error: string | null = null;

    if (items.length === 0) {
      error = '请至少输入一个候选项：每行一个，或单行使用逗号分隔';
    } else if (items.length > MAX_CANDIDATES) {
      error = `候选项最多支持 ${MAX_CANDIDATES} 个，当前为 ${items.length} 个`;
    } else if (countRaw.trim() === '' || !Number.isInteger(count) || count < 1) {
      error = '抽取人数必须是大于 0 的整数';
    } else if (count > maxWinners) {
      error = distinctWinners
        ? `去重模式下抽取人数不能超过候选项数量（最多 ${maxWinners} 人）`
        : `一次最多抽取 ${MAX_WINNERS} 人`;
    }

    return { items, duplicates, count, maxWinners, error, ok: error === null };
  }, [text, countRaw, distinctWinners]);

  const winnersText = results ? results.join('\n') : '';

  const draw = () => {
    setTouched(true);
    if (rolling) return;
    if (!analysis.ok) return;
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      toast.error('当前浏览器不支持 Web Crypto，无法抽签');
      return;
    }

    clearTimers();
    const pool = analysis.items;
    const count = analysis.count;
    const distinct = distinctWinners;
    const winners = pickWinners(pool, count, distinct);

    setResults(null);
    setRolling(true);
    setPreview(pickWinners(pool, count, distinct));
    intervalRef.current = window.setInterval(() => {
      setPreview(pickWinners(pool, count, distinct));
    }, ROLL_INTERVAL);
    timeoutRef.current = window.setTimeout(() => {
      clearTimers();
      setPreview(null);
      setResults(winners);
      setRolling(false);
      setHistory((previous) =>
        [{ id: uid('draw'), winners, candidateCount: pool.length, at: Date.now() }, ...previous].slice(0, MAX_HISTORY),
      );
      const brief = winners.length > 3 ? `${winners.slice(0, 3).join('、')} 等 ${winners.length} 项` : winners.join('、');
      toast.success(`抽签完成：${brief}`);
    }, ROLL_DURATION);
  };

  const handleReset = () => {
    clearTimers();
    setRolling(false);
    setPreview(null);
    setResults(null);
  };

  const candidatesSummary = analysis.items.length
    ? `已识别 ${formatNumber(analysis.items.length)} 个候选项${analysis.duplicates > 0 ? `，自动去重 ${analysis.duplicates} 个` : ''}`
    : '等待输入候选项';

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="候选项" description="每行一个候选项，也支持单行用逗号分隔（重复项会自动去重）">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              draw();
            }}
          >
            <Field
              label="选项列表"
              htmlFor="lottery-options"
              hint={candidatesSummary}
              error={touched && analysis.error ? analysis.error : null}
            >
              <Textarea
                id="lottery-options"
                className="min-h-40 font-mono"
                placeholder={'奖项 A\n奖项 B\n奖项 C'}
                value={text}
                error={touched && Boolean(analysis.error)}
                onChange={(event) => {
                  setText(event.target.value);
                  setTouched(true);
                  setResults(null);
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="抽取人数"
                htmlFor="lottery-count"
                hint={analysis.items.length > 0 ? `最多 ${analysis.maxWinners} 人` : '先输入候选项'}
              >
                <Input
                  id="lottery-count"
                  inputMode="numeric"
                  value={countRaw}
                  onChange={(event) => {
                    setCountRaw(event.target.value);
                    setTouched(true);
                  }}
                  error={touched && Boolean(analysis.error) && analysis.items.length > 0}
                />
              </Field>

              <div className="flex items-end pb-1">
                <div className="w-full rounded-xl border bg-[var(--hover-bg)] px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">结果去重</span>
                    <Switch checked={distinctWinners} onChange={setDistinctWinners} />
                  </div>
                  <p className="mt-1 text-xs subtle">{distinctWinners ? '同一批不会抽到重复选项' : '允许一次抽中相同选项'}</p>
                </div>
              </div>
            </div>

            {touched && analysis.error ? <Alert tone="warning">{analysis.error}</Alert> : null}

            <Actions className="mt-1">
              <Button type="submit" icon={Sparkles} disabled={rolling}>
                {rolling ? '抽取中…' : '开始抽签'}
              </Button>
              <Button variant="secondary" type="button" icon={RotateCcw} onClick={handleReset} disabled={rolling}>
                重置结果
              </Button>
            </Actions>

            <Hint>随机源为 Web Crypto（crypto.getRandomValues），滚动动画仅用于展示，结果在动画开始前已确定。</Hint>
          </form>
        </Panel>

        <Panel
          title="抽签结果"
          description={rolling ? '正在随机滚动…' : results ? `共 ${results.length} 个结果` : '结果会在滚动动画结束后揭晓'}
          footer={
            results ? (
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={winnersText} label="复制结果" />
                <Button variant="secondary" size="sm" type="button" icon={RotateCcw} onClick={draw}>
                  再抽一次
                </Button>
              </div>
            ) : null
          }
        >
          {rolling ? (
            <div className="space-y-4 py-6">
              <div className="flex items-center justify-center gap-2 text-sm muted">
                <Spinner className="size-4" />
                正在抽取 {analysis.count} 个结果…
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(preview ?? []).map((label, index) => (
                  <div
                    key={`preview-${index}`}
                    className="truncate rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-5 text-center text-lg font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          ) : results ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {results.map((label, index) => (
                  <div
                    key={`winner-${index}`}
                    className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base font-semibold text-emerald-800 dark:text-emerald-200" title={label}>
                      {label}
                    </span>
                    <Trophy className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  </div>
                ))}
              </div>
              <p className="text-xs subtle">共 {formatNumber(analysis.items.length)} 个候选项参与本次抽签。</p>
            </div>
          ) : (
            <EmptyState
              icon={Trophy}
              title="还没有抽签结果"
              description="在左侧填入候选项并设置抽取人数，点击「开始抽签」即可。"
            />
          )}
        </Panel>
      </ToolSplit>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <History className="size-4" /> 历史记录
            {history.length > 0 ? <span className="badge">{history.length}</span> : null}
          </span>
        }
        description="最近 30 次抽签记录保存在本机浏览器中"
        footer={
          history.length > 0 ? (
            <Button variant="ghost" size="sm" type="button" icon={Trash2} onClick={() => setConfirmClear(true)}>
              清空历史记录
            </Button>
          ) : null
        }
      >
        {history.length === 0 ? (
          <EmptyState icon={History} title="暂无抽签记录" description="完成一次抽签后，结果会自动记录在这里。" />
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-[var(--hover-bg)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{entry.winners.join('、')}</p>
                  <p className="mt-1 text-xs subtle">
                    {entry.candidateCount} 个候选项 · 抽取 {entry.winners.length} 个
                  </p>
                </div>
                <span className="shrink-0 text-xs subtle">{formatDate(new Date(entry.at).toISOString(), 'datetime')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空历史记录"
        description={`将删除全部 ${history.length} 条抽签记录，此操作无法撤销。`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setHistory([]);
                setConfirmClear(false);
                toast.success('历史记录已清空');
              }}
            >
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm muted">候选选项不会被删除，只清除抽签历史。</p>
      </Modal>
    </div>
  );
}
