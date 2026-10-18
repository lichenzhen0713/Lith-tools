import { useEffect, useRef, useState } from 'react';
import { Gauge, Play, RotateCcw, Timer, Trash2, Trophy, TriangleAlert, Zap } from 'lucide-react';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, Modal, StatCard } from '../components/ui';
import { useLocalStorage } from '../lib/hooks';
import { cn, formatNumber } from '../lib/utils';

type Phase = 'idle' | 'waiting' | 'ready' | 'result' | 'foul' | 'done';

interface BestRecord {
  /** 最佳单次反应时间（毫秒），0 表示暂无记录 */
  single: number;
  /** 最佳五轮平均（毫秒），0 表示暂无记录 */
  average: number;
}

const ROUNDS = 5;
const MIN_DELAY = 1500;
const MAX_DELAY = 4000;
const STORAGE_KEY = 'lith:reaction-best';
const EMPTY_BEST: BestRecord = { single: 0, average: 0 };

function randomDelay(): number {
  return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
}

function average(times: number[]): number {
  if (times.length === 0) return 0;
  return Math.round(times.reduce((sum, value) => sum + value, 0) / times.length);
}

function formatMs(value: number): string {
  return `${formatNumber(value)} ms`;
}

const SURFACE_CLASS: Record<Phase, string> = {
  idle: 'border-slate-300 bg-[var(--hover-bg)] text-[var(--text-primary)] hover:border-indigo-400 dark:border-slate-700',
  waiting:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-100',
  ready: 'border-emerald-400 bg-emerald-500 text-white shadow-xl shadow-emerald-500/30',
  result:
    'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-indigo-100',
  foul: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/50 dark:bg-rose-500/15 dark:text-rose-100',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-100',
};

export default function ReactionTestTool() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [times, setTimes] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const [fouls, setFouls] = useState(0);
  const [newRecord, setNewRecord] = useState<{ single: boolean; average: boolean } | null>(null);
  const [best, setBest] = useLocalStorage<BestRecord>(STORAGE_KEY, EMPTY_BEST);
  const [confirmClear, setConfirmClear] = useState(false);

  const timeoutRef = useRef<number | null>(null);
  const delayRef = useRef(0);
  const readyAtRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  /** 卸载时兜底清理，避免离开页面后仍触发 setState。 */
  useEffect(() => clearTimer, []);

  /** 等待阶段：延迟到点后进入 ready（变绿），StrictMode 下重复挂载由 cleanup 兜底。 */
  useEffect(() => {
    if (phase !== 'waiting') return;
    const id = window.setTimeout(() => {
      timeoutRef.current = null;
      readyAtRef.current = performance.now();
      setPhase('ready');
    }, delayRef.current);
    timeoutRef.current = id;
    return () => {
      window.clearTimeout(id);
      if (timeoutRef.current === id) timeoutRef.current = null;
    };
  }, [phase]);

  const startRound = () => {
    setNewRecord(null);
    delayRef.current = randomDelay();
    readyAtRef.current = null;
    setPhase('waiting');
  };

  const startSession = () => {
    clearTimer();
    setTimes([]);
    setLast(null);
    setFouls(0);
    startRound();
  };

  const reset = () => {
    clearTimer();
    delayRef.current = 0;
    readyAtRef.current = null;
    setPhase('idle');
    setTimes([]);
    setLast(null);
    setFouls(0);
    setNewRecord(null);
  };

  const finishRound = (value: number) => {
    const next = [...times, value];
    setTimes(next);
    setLast(value);
    if (next.length < ROUNDS) {
      setPhase('result');
      return;
    }

    const single = Math.min(...next);
    const avg = average(next);
    const betterSingle = best.single === 0 || single < best.single;
    const betterAverage = best.average === 0 || avg < best.average;
    setNewRecord({ single: betterSingle, average: betterAverage });
    setBest((record) => ({
      single: record.single === 0 ? single : Math.min(record.single, single),
      average: record.average === 0 ? avg : Math.min(record.average, avg),
    }));
    setPhase('done');
  };

  const handlePress = () => {
    if (phase === 'idle' || phase === 'done') {
      startSession();
      return;
    }
    if (phase === 'waiting') {
      clearTimer();
      readyAtRef.current = null;
      setFouls((count) => count + 1);
      setPhase('foul');
      return;
    }
    if (phase === 'ready') {
      const startedAt = readyAtRef.current;
      readyAtRef.current = null;
      if (startedAt === null) {
        startRound();
        return;
      }
      finishRound(Math.max(1, Math.round(performance.now() - startedAt)));
      return;
    }
    startRound();
  };

  const averageTime = average(times);
  const bestTime = times.length > 0 ? Math.min(...times) : null;
  const worstTime = times.length > 0 ? Math.max(...times) : null;
  const hasBest = best.single > 0 || best.average > 0;

  const headline: Record<Phase, { title: string; detail: string }> = {
    idle: { title: '点击开始测反应速度', detail: '共 5 轮 · 背景变绿后立刻点击' },
    waiting: { title: '等待变绿…', detail: '现在还不要点，等背景变绿' },
    ready: { title: '点！', detail: '就是现在' },
    result: { title: last === null ? '本轮完成' : `${formatNumber(last)} ms`, detail: '点击进入下一轮' },
    foul: { title: '太早了！', detail: '背景还没变绿 · 点击重新开始本轮' },    done: {
      title: '5 轮完成',
      detail: `平均 ${formatNumber(averageTime)} ms · 点击再来一轮`,
    },
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Timer}
          label="本轮平均"
          value={times.length === 0 ? '—' : `${formatNumber(averageTime)} ms`}
          hint={`已完成 ${times.length} / ${ROUNDS} 轮`}
        />
        <StatCard
          icon={Zap}
          label="本轮最快"
          value={bestTime === null ? '—' : `${formatNumber(bestTime)} ms`}
          hint={worstTime === null ? '本轮还没有成绩' : `最慢 ${formatNumber(worstTime)} ms`}
        />
        <StatCard
          icon={Trophy}
          label="最佳单次"
          value={best.single === 0 ? '—' : `${formatNumber(best.single)} ms`}
          hint={best.average === 0 ? '完成 5 轮后记录最佳平均' : `最佳平均 ${formatNumber(best.average)} ms`}
        />
        <StatCard
          icon={TriangleAlert}
          label="犯规次数"
          value={formatNumber(fouls)}
          hint="过早点击不会计入成绩"
        />
      </div>

      <ToolSplit>
        <Panel
          title="测试区域"
          description="随机等待 1.5–4 秒后背景变绿，变绿瞬间点击即为本轮成绩。"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Hint>成绩与最佳记录只保存在本机浏览器，不会上传。</Hint>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                icon={Trash2}
                onClick={() => setConfirmClear(true)}
                disabled={!hasBest}
              >
                清空最佳成绩
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <button
              type="button"
              onPointerDown={(event) => {
                if (event.button !== 0 && event.pointerType === 'mouse') return;
                handlePress();
              }}
              onKeyDown={(event) => {
                if (event.key !== ' ' && event.key !== 'Enter') return;
                event.preventDefault();
                if (event.repeat) return;
                handlePress();
              }}
              aria-label={headline[phase].title}
              className={cn(
                'flex min-h-56 w-full touch-none flex-col items-center justify-center gap-3 rounded-2xl border-2 px-6 py-10 text-center transition-all duration-150 select-none',
                SURFACE_CLASS[phase],
              )}
            >
              {phase === 'ready' ? (
                <Zap className="size-9" aria-hidden="true" />
              ) : phase === 'waiting' ? (
                <Timer className="size-9 animate-pulse" aria-hidden="true" />
              ) : phase === 'foul' ? (
                <TriangleAlert className="size-9" aria-hidden="true" />
              ) : phase === 'done' ? (
                <Trophy className="size-9" aria-hidden="true" />
              ) : phase === 'result' ? (
                <Gauge className="size-9" aria-hidden="true" />
              ) : (
                <Play className="size-9" aria-hidden="true" />
              )}
              <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline[phase].title}</span>
              <span
                aria-live="polite"
                className={cn(
                  'text-sm',
                  phase === 'ready' ? 'text-white/85' : phase === 'waiting' || phase === 'foul' ? 'opacity-80' : 'muted',
                )}
              >
                {headline[phase].detail}
              </span>
            </button>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs subtle">
                <span>进度</span>
                <span>
                  {Math.min(times.length, ROUNDS)} / {ROUNDS} 轮
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--hover-bg)]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={ROUNDS}
                aria-valuenow={Math.min(times.length, ROUNDS)}
                aria-label="测试进度"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${(Math.min(times.length, ROUNDS) / ROUNDS) * 100}%` }}
                />
              </div>
            </div>

            <Actions className="mt-0">
              <Button
                type="button"
                icon={Play}
                onClick={startSession}
                disabled={phase === 'waiting' || phase === 'ready'}
              >
                {phase === 'done' ? '再来一轮' : times.length > 0 ? '重新开始' : '开始测试'}
              </Button>
              <Button type="button" variant="secondary" icon={RotateCcw} onClick={reset}>
                重置
              </Button>
            </Actions>

            {phase === 'foul' ? (
              <Alert tone="error" title="犯规：点击太早">
                由于背景还没有变绿，这一次不计入成绩。直接点击上方区域即可重新开始本轮。
              </Alert>
            ) : null}

            {phase === 'waiting' ? (
              <Alert tone="info">保持专注，背景变绿后立刻点击，不要在等待阶段抢跑。</Alert>
            ) : null}

            {phase === 'done' ? (
              <Alert tone={newRecord?.average || newRecord?.single ? 'success' : 'info'} title="测试完成">
                5 轮平均 <strong>{formatNumber(averageTime)} ms</strong>，最快 {formatNumber(bestTime ?? 0)} ms。
                {newRecord?.average ? ' 刷新了最佳平均记录。' : ''}
                {newRecord?.single ? ' 同时也刷新了最佳单次记录。' : ''}
              </Alert>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="本轮成绩"
          description={`每轮成绩会依次记录，共 ${ROUNDS} 轮，全部完成后取平均。`}
        >
          {times.length === 0 ? (
            <EmptyState
              icon={Gauge}
              title="还没有成绩"
              description="点击左侧「开始测试」，等背景变绿后立刻点击，即可记录第一轮反应时间。"
            />
          ) : (
            <div className="space-y-4">
              <ul className="space-y-2">
                {times.map((value, index) => {
                  const isFastest = bestTime !== null && value === bestTime;
                  return (
                    <li
                      key={`${index}-${value}`}
                      className="flex items-center justify-between gap-3 rounded-xl border bg-[var(--hover-bg)] px-4 py-2.5"
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-xs subtle">第 {index + 1} 轮</span>
                        <span className="font-mono text-base font-semibold">{formatNumber(value)} ms</span>
                      </span>
                      {isFastest ? <Badge tone="success">本轮最快</Badge> : null}
                    </li>
                  );
                })}
              </ul>

              <KeyValue
                items={[
                  { label: '已完成轮次', value: `${times.length} / ${ROUNDS}` },
                  { label: '已完成平均', value: `${formatNumber(averageTime)} ms` },
                  { label: '最快 / 最慢', value: `${formatNumber(bestTime ?? 0)} / ${formatNumber(worstTime ?? 0)} ms` },
                  { label: '犯规次数', value: `${formatNumber(fouls)} 次` },
                ]}
              />

              {phase === 'done' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Result label="本局平均" value={formatMs(averageTime)} hint={`共 ${ROUNDS} 轮`} />
                  <Result
                    label="历史最佳平均"
                    value={best.average === 0 ? '—' : formatMs(best.average)}
                    hint={best.single === 0 ? '暂无单次记录' : `最佳单次 ${formatMs(best.single)}`}
                  />
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </ToolSplit>

      <Panel title="测试说明" description="怎样得到更准确的反应时间。">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-medium">规则</p>
            <p className="muted">
              点击「开始测试」后，背景会在 1.5–4 秒之间的随机时刻变绿。变绿之前点击会判定犯规，该次不计入成绩；变绿后点击记录反应时间。
              连续完成 5 轮后计算平均成绩，并把最佳单次与最佳平均保存在本机浏览器。
            </p>
          </div>
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-medium">提高准确度</p>
            <p className="muted">
              使用鼠标或直接触摸屏幕，保持同一设备与姿势；测试期间关闭通知。首次测试通常偏慢，建议连续测 2–3 组取平均值。
              普通成年人视觉反应时间约 200–300 ms，低于 150 ms 可能意味着提前预判。
            </p>
          </div>
        </div>
        <div className="mt-4 border-t pt-3">
          <Hint>
            计时使用 <span className="font-mono">performance.now()</span>，精确到毫秒；切换页面或标签会失去焦点，建议在单独页面完成测试。
          </Hint>
        </div>
      </Panel>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空最佳成绩"
        description="将删除保存在本机的反应速度最佳记录。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                setBest(EMPTY_BEST);
                setNewRecord(null);
                setConfirmClear(false);
              }}
            >
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm muted">此操作只影响最佳成绩记录，不会影响正在进行或已完成的测试。</p>
      </Modal>
    </div>
  );
}
