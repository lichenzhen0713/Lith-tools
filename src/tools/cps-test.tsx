import { useCallback, useRef, useState } from 'react';
import { MousePointerClick, RotateCcw, Timer, Trophy, Zap } from 'lucide-react';
import { Actions, Hint, KeyValue, Panel, Result, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, StatCard, Tabs } from '../components/ui';
import { useInterval, useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';
import { cn, formatNumber } from '../lib/utils';

type Duration = 5 | 10;
type Status = 'idle' | 'running' | 'ended';

interface Attempt {
  clicks: number;
  seconds: number;
  cps: number;
}

const DURATION_ITEMS: { value: '5' | '10'; label: string }[] = [
  { value: '5', label: '5 秒' },
  { value: '10', label: '10 秒' },
];

const STORAGE_KEY = 'lith:cps-best';

function formatCps(value: number): string {
  return value.toFixed(2);
}

export default function CpsTestTool() {
  const toast = useToast();
  const [duration, setDuration] = useState<Duration>(5);
  const [status, setStatus] = useState<Status>('idle');
  const [clicks, setClicks] = useState(0);
  const [remaining, setRemaining] = useState(duration * 1000);
  const [result, setResult] = useState<Attempt | null>(null);
  const [isRecord, setIsRecord] = useState(false);
  const [best, setBest] = useLocalStorage<Record<string, number>>(STORAGE_KEY, {});

  const startAtRef = useRef<number | null>(null);
  const clicksRef = useRef(0);

  const totalMs = duration * 1000;
  const elapsedMs = status === 'running' ? Math.min(totalMs, Math.max(0, totalMs - remaining)) : 0;
  const progress = status === 'running' ? Math.min(1, elapsedMs / totalMs) : status === 'ended' ? 1 : 0;
  const liveCps = status === 'running' && elapsedMs >= 200 ? clicks / (elapsedMs / 1000) : 0;
  const bestCps = best[String(duration)] ?? 0;

  const start = useCallback(() => {
    startAtRef.current = performance.now();
    clicksRef.current = 0;
    setClicks(0);
    setResult(null);
    setIsRecord(false);
    setRemaining(duration * 1000);
    setStatus('running');
  }, [duration]);

  const finish = useCallback(() => {
    if (startAtRef.current === null) return;
    startAtRef.current = null;
    const totalClicks = clicksRef.current;
    const cps = totalClicks / duration;
    const previous = best[String(duration)] ?? 0;
    const record = cps > previous;
    setRemaining(0);
    setStatus('ended');
    setResult({ clicks: totalClicks, seconds: duration, cps });
    setIsRecord(record);
    if (record) setBest((current) => ({ ...current, [String(duration)]: cps }));
  }, [best, duration, setBest]);

  const reset = useCallback(() => {
    startAtRef.current = null;
    clicksRef.current = 0;
    setClicks(0);
    setResult(null);
    setIsRecord(false);
    setStatus('idle');
    setRemaining(duration * 1000);
  }, [duration]);

  /** 只统计单次 pointerdown，长按或浏览器自动重复都不会累加。 */
  const registerClick = useCallback(() => {
    if (status !== 'running') return;
    const startedAt = startAtRef.current;
    if (startedAt === null) return;
    if (performance.now() - startedAt >= duration * 1000) {
      finish();
      return;
    }
    clicksRef.current += 1;
    setClicks(clicksRef.current);
  }, [status, duration, finish]);

  useInterval(
    () => {
      const startedAt = startAtRef.current;
      if (startedAt === null) return;
      const elapsed = performance.now() - startedAt;
      if (elapsed >= duration * 1000) {
        finish();
        return;
      }
      setRemaining(duration * 1000 - elapsed);
    },
    status === 'running' ? 50 : null,
  );

  const changeDuration = (next: Duration) => {
    if (status === 'running') {
      toast.info('请先结束或重置当前测试');
      return;
    }
    setDuration(next);
    setStatus('idle');
    setResult(null);
    setIsRecord(false);
    setClicks(0);
    clicksRef.current = 0;
    startAtRef.current = null;
    setRemaining(next * 1000);
  };

  const surfaceClass =
    status === 'running'
      ? 'border-indigo-400 bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30 active:scale-[0.99]'
      : status === 'ended'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-100'
        : 'border-slate-300 bg-[var(--hover-bg)] text-[var(--text-primary)] dark:border-slate-700';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Zap}
          label="当前 CPS"
          value={status === 'running' ? formatCps(liveCps) : result ? formatCps(result.cps) : '—'}
          hint={status === 'running' ? '实时速度' : '点击/秒'}
        />
        <StatCard
          icon={MousePointerClick}
          label="点击次数"
          value={formatNumber(status === 'running' ? clicks : result ? result.clicks : 0)}
          hint={`测试时长 ${duration} 秒`}
        />
        <StatCard
          icon={Timer}
          label="剩余时间"
          value={`${(status === 'running' ? remaining / 1000 : status === 'ended' ? 0 : duration).toFixed(1)} s`}
          hint={status === 'running' ? '倒计时中' : status === 'ended' ? '测试已结束' : '设定的测试时长'}
        />
        <StatCard
          icon={Trophy}
          label={`${duration} 秒最佳`}
          value={bestCps > 0 ? `${formatCps(bestCps)} CPS` : '—'}
          hint={bestCps > 0 ? '保存在本机浏览器' : '完成后记录最佳成绩'}
        />
      </div>

      <ToolSplit>
        <Panel
          title="点击测试"
          description="开始后倒计时内尽可能快地点击，只统计每一次独立的按下。"
          footer={
            <Hint>
              鼠标按住不放不会连续计数；触屏与键盘（空格 / 回车）同样支持。成绩只保存在本机，不会上传。
            </Hint>
          }
        >
          <div className="space-y-4">
            <Tabs<'5' | '10'>
              items={DURATION_ITEMS}
              value={duration === 10 ? '10' : '5'}
              onChange={(next) => changeDuration(next === '10' ? 10 : 5)}
            />

            <button
              type="button"
              onPointerDown={(event) => {
                if (event.button !== 0 && event.pointerType === 'mouse') return;
                event.preventDefault();
                registerClick();
              }}
              onKeyDown={(event) => {
                if (event.key !== ' ' && event.key !== 'Enter') return;
                event.preventDefault();
                if (event.repeat) return;
                registerClick();
              }}
              onContextMenu={(event) => event.preventDefault()}
              aria-label={status === 'running' ? '点击计数' : '点击测试区域'}
              aria-disabled={status !== 'running'}
              className={cn(
                'flex min-h-56 w-full touch-none flex-col items-center justify-center gap-2 rounded-2xl border-2 px-6 py-10 text-center transition-all duration-150 select-none',
                surfaceClass,
              )}
            >
              <MousePointerClick className={cn('size-9', status === 'running' && 'animate-pulse')} aria-hidden="true" />
              <span className="font-mono text-5xl font-semibold tracking-tight tabular-nums">
                {formatNumber(status === 'running' ? clicks : result ? result.clicks : 0)}
              </span>
              <span className={cn('text-sm', status === 'running' ? 'text-white/85' : 'muted')}>
                {status === 'running'
                  ? '快点！每按下一次加 1'
                  : status === 'ended'
                    ? '测试结束，点击「再来一次」继续'
                    : '点击「开始测试」，然后在这里疯狂点击'}
              </span>
            </button>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs subtle">
                <span>进度</span>
                <span>
                  {status === 'ended' ? '已完成' : `${Math.round(progress * 100)}%`}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--hover-bg)]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label="测试进度"
              >
                <div
                  className={cn(
                    'h-full rounded-full bg-gradient-to-r transition-all duration-100 ease-linear',
                    status === 'running' ? 'from-indigo-500 to-violet-500' : 'from-emerald-500 to-teal-500',
                  )}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>

            <Actions className="mt-0">
              {status === 'running' ? (
                <Button type="button" variant="secondary" icon={Zap} onClick={start}>
                  重新开始
                </Button>
              ) : (
                <Button type="button" icon={Zap} onClick={start}>
                  {status === 'ended' ? '再来一次' : '开始测试'}
                </Button>
              )}
              <Button type="button" variant="ghost" icon={RotateCcw} onClick={reset} disabled={status === 'idle'}>
                重置
              </Button>
            </Actions>
          </div>
        </Panel>

        <Panel title="测试结果" description={`${duration} 秒内的点击速度统计`}>
          {status === 'running' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs subtle">实时 CPS</p>
                  <p className="mt-1 font-mono text-4xl font-semibold tracking-tight tabular-nums">
                    {formatCps(liveCps)}
                  </p>
                </div>
                <Badge tone="brand">计时中</Badge>
              </div>
              <KeyValue
                items={[
                  { label: '已点击', value: `${formatNumber(clicks)} 次` },
                  { label: '已用时', value: `${(elapsedMs / 1000).toFixed(1)} 秒` },
                  { label: '剩余', value: `${(remaining / 1000).toFixed(1)} 秒` },
                ]}
              />
              <Alert tone="info">保持节奏，长按不会连点，每次按下都需要抬起手指或鼠标。</Alert>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs subtle">最终成绩</p>
                  <p className="mt-1 font-mono text-4xl font-semibold tracking-tight tabular-nums">
                    {formatCps(result.cps)}
                    <span className="ml-2 text-base font-medium subtle">CPS</span>
                  </p>
                </div>
                <Badge tone={isRecord ? 'success' : 'default'}>{isRecord ? '新纪录' : '已完成'}</Badge>
              </div>

              <KeyValue
                items={[
                  { label: '点击次数', value: `${formatNumber(result.clicks)} 次` },
                  { label: '测试时长', value: `${result.seconds} 秒` },
                  { label: '平均 CPS', value: formatCps(result.cps) },
                  {
                    label: `历史最佳（${duration} 秒）`,
                    value: bestCps > 0 ? `${formatCps(bestCps)} CPS` : '—',
                  },
                ]}
              />

              {isRecord ? (
                <Alert tone="success" title="刷新了最佳记录">
                  {duration} 秒内 {formatNumber(result.clicks)} 次点击，平均每秒 {formatCps(result.cps)} 次。
                </Alert>
              ) : bestCps > 0 ? (
                <Alert tone="info" title="测试完成">
                  距离当前最佳还差{' '}
                  <strong>{formatCps(Math.max(0, bestCps - result.cps))} CPS</strong>，再试一次可能就破了。
                </Alert>
              ) : (
                <Alert tone="info" title="测试完成">
                  本次没有记录到点击。点击「再来一次」后开始点击，成绩才会被统计。
                </Alert>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Result label="最终 CPS" value={`${formatCps(result.cps)} 点击/秒`} />
                <Result
                  label="最快记录"
                  value={bestCps > 0 ? `${formatCps(bestCps)} CPS` : '—'}
                  hint={bestCps > 0 ? '仅统计当前时长的最佳' : '还没有记录'}
                />
              </div>
            </div>
          ) : (
            <EmptyState
              icon={MousePointerClick}
              title="还没有开始测试"
              description="选择 5 秒或 10 秒，点击「开始测试」，然后在左侧区域尽可能快地点击。"
            />
          )}
        </Panel>
      </ToolSplit>

      <Panel title="关于 CPS" description="CPS 是每秒点击次数（Clicks Per Second）的缩写。">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-medium">规则</p>
            <p className="muted">
              开始后倒计时 5 或 10 秒，统计期间每一次独立的按下。最终 CPS = 点击次数 ÷ 测试时长。
              鼠标按住不放、系统按键重复都不会被计入，因此不需要担心连点判定。
            </p>
          </div>
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-medium">参考区间</p>
            <p className="muted">
              普通用户约 5–8 CPS，熟练玩家 8–12 CPS，职业级玩家可以超过 15 CPS。
              不同设备与浏览器的事件延迟会造成差异，建议使用同一设备多次测试取平均。
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
