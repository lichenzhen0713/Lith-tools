import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coffee, Moon, Pause, Play, RotateCcw, SkipForward, Timer, Trash2 } from 'lucide-react';
import { Field, Hint, Input, Panel, ToolSplit } from './kit';
import { Alert, Badge, Button, Kbd, Modal, Switch, Tabs } from '../components/ui';
import { useInterval, useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';
import { clamp, cn, uid } from '../lib/utils';

type Phase = 'focus' | 'short' | 'long';
type Status = 'idle' | 'running' | 'paused';

interface PomodoroConfig {
  focus: number;
  short: number;
  long: number;
  rounds: number;
  autoStart: boolean;
}

interface PomodoroRecord {
  id: string;
  phase: Phase;
  minutes: number;
  at: number;
}

const DEFAULT_CONFIG: PomodoroConfig = { focus: 25, short: 5, long: 15, rounds: 4, autoStart: false };
const CONFIG_KEY = 'lith:pomodoro-config';
const RECORD_KEY = 'lith:pomodoro-records';
const RING_RADIUS = 88;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const PHASE_META: Record<Phase, { label: string; description: string; ring: string; icon: typeof Timer }> = {
  focus: { label: '专注', description: '保持专注，不要切换任务', ring: 'stroke-indigo-600 dark:stroke-indigo-400', icon: Timer },
  short: { label: '短休息', description: '起身活动、喝水、放松眼睛', ring: 'stroke-emerald-500 dark:stroke-emerald-400', icon: Coffee },
  long: { label: '长休息', description: '完成一轮，充分休息一下', ring: 'stroke-sky-500 dark:stroke-sky-400', icon: Moon },
};

function sanitizeConfig(value: unknown): PomodoroConfig {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const pick = (key: 'focus' | 'short' | 'long' | 'rounds', fallback: number, min: number, max: number): number => {
    const raw = record[key];
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? clamp(Math.round(num), min, max) : fallback;
  };
  return {
    focus: pick('focus', DEFAULT_CONFIG.focus, 1, 180),
    short: pick('short', DEFAULT_CONFIG.short, 1, 60),
    long: pick('long', DEFAULT_CONFIG.long, 1, 120),
    rounds: pick('rounds', DEFAULT_CONFIG.rounds, 1, 12),
    autoStart: record.autoStart === true,
  };
}

function sanitizeRecords(value: unknown): PomodoroRecord[] {
  if (!Array.isArray(value)) return [];
  const records: PomodoroRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.minutes !== 'number' || typeof record.at !== 'number') continue;
    const phase: Phase = record.phase === 'short' || record.phase === 'long' ? record.phase : 'focus';
    records.push({ id: record.id, phase, minutes: record.minutes, at: record.at });
    if (records.length >= 30) break;
  }
  return records;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

export default function PomodoroTool() {
  const toast = useToast();
  const [storedConfig, setStoredConfig] = useLocalStorage<PomodoroConfig>(CONFIG_KEY, DEFAULT_CONFIG);
  const [storedRecords, setStoredRecords] = useLocalStorage<PomodoroRecord[]>(RECORD_KEY, []);
  const config = useMemo(() => sanitizeConfig(storedConfig), [storedConfig]);
  const records = useMemo(() => sanitizeRecords(storedRecords), [storedRecords]);

  const [phase, setPhase] = useState<Phase>('focus');
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(config.focus * 60_000);
  const [total, setTotal] = useState(config.focus * 60_000);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  const endAtRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const ensureAudio = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioRef.current) {
      try {
        audioRef.current = new Ctor();
      } catch {
        return null;
      }
    }
    if (audioRef.current.state === 'suspended') void audioRef.current.resume();
    return audioRef.current;
  }, []);

  const playAlarm = useCallback((): void => {
    const context = ensureAudio();
    if (!context) return;
    const start = context.currentTime + 0.02;
    const notes = [
      { at: 0, frequency: 784, duration: 0.2 },
      { at: 0.3, frequency: 988, duration: 0.2 },
      { at: 0.6, frequency: 1318.5, duration: 0.36 },
    ];
    notes.forEach((note) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(note.frequency, start + note.at);
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(0.28, start + note.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + note.at);
      oscillator.stop(start + note.at + note.duration + 0.02);
    });
  }, [ensureAudio]);

  useEffect(
    () => () => {
      const context = audioRef.current;
      audioRef.current = null;
      if (context && context.state !== 'closed') void context.close();
    },
    [],
  );

  useEffect(() => {
    if (status !== 'idle') return;
    const ms = config[phase] * 60_000;
    setTotal(ms);
    setRemaining(ms);
  }, [status, phase, config]);

  const appendRecord = useCallback(
    (recordPhase: Phase, minutes: number) => {
      setStoredRecords((previous) => {
        const list = sanitizeRecords(previous);
        return [{ id: uid('pomo'), phase: recordPhase, minutes, at: Date.now() }, ...list].slice(0, 30);
      });
    },
    [setStoredRecords],
  );

  const startPhase = useCallback(
    (target: Phase) => {
      const ms = config[target] * 60_000;
      endAtRef.current = Date.now() + ms;
      setPhase(target);
      setTotal(ms);
      setRemaining(ms);
      setStatus('running');
      ensureAudio();
    },
    [config, ensureAudio],
  );

  const start = useCallback(() => startPhase(phase), [startPhase, phase]);

  const pause = useCallback(() => {
    if (status !== 'running' || endAtRef.current === null) return;
    const left = Math.max(0, endAtRef.current - Date.now());
    endAtRef.current = null;
    setRemaining(left);
    setStatus(left > 0 ? 'paused' : 'idle');
  }, [status]);

  const resume = useCallback(() => {
    if (remaining <= 0) return;
    endAtRef.current = Date.now() + remaining;
    setStatus('running');
    ensureAudio();
  }, [remaining, ensureAudio]);

  const skip = useCallback(() => {
    endAtRef.current = null;
    const next: Phase = phase === 'focus' ? 'short' : 'focus';
    setPhase(next);
    setStatus('idle');
    setTotal(config[next] * 60_000);
    setRemaining(config[next] * 60_000);
    toast.info('已跳过当前阶段（跳过不计入完成轮次）');
  }, [phase, config, toast]);

  const reset = useCallback(() => {
    endAtRef.current = null;
    setStatus('idle');
    setPhase('focus');
    setTotal(config.focus * 60_000);
    setRemaining(config.focus * 60_000);
  }, [config]);

  useInterval(
    () => {
      if (status !== 'running' || endAtRef.current === null) return;
      const left = endAtRef.current - Date.now();
      if (left > 0) {
        setRemaining(left);
        return;
      }

      endAtRef.current = null;
      setRemaining(0);
      playAlarm();

      if (phase === 'focus') {
        const nextCompleted = completedFocus + 1;
        setCompletedFocus(nextCompleted);
        appendRecord('focus', config.focus);
        const next: Phase = nextCompleted % config.rounds === 0 ? 'long' : 'short';
        toast.success(next === 'long' ? '完成一轮专注，开始长休息' : '专注结束，休息一下');
        if (config.autoStart) {
          startPhase(next);
        } else {
          setPhase(next);
          setStatus('idle');
          setTotal(config[next] * 60_000);
          setRemaining(config[next] * 60_000);
        }
      } else {
        toast.success('休息结束，继续专注吧');
        if (config.autoStart) {
          startPhase('focus');
        } else {
          setPhase('focus');
          setStatus('idle');
          setTotal(config.focus * 60_000);
          setRemaining(config.focus * 60_000);
        }
      }
    },
    status === 'running' ? 200 : null,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (status === 'running') pause();
        else if (status === 'paused') resume();
        else start();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        skip();
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [status, start, pause, resume, skip, reset]);

  const cycleDone =
    phase === 'long' && completedFocus > 0 && completedFocus % config.rounds === 0
      ? config.rounds
      : completedFocus % config.rounds;
  const nextPhase: Phase = phase === 'focus' ? ((completedFocus + 1) % config.rounds === 0 ? 'long' : 'short') : 'focus';
  const progress = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const ringOffset = RING_CIRCUMFERENCE * (1 - progress);
  const meta = PHASE_META[phase];
  const PhaseIcon = meta.icon;

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return records.filter((record) => record.phase === 'focus' && new Date(record.at).toDateString() === today).length;
  }, [records]);

  function updateConfig(patch: Partial<PomodoroConfig>): void {
    setStoredConfig({ ...config, ...patch });
  }

  return (
    <ToolSplit>
      <Panel
        title="番茄钟"
        description={`专注 ${config.focus} 分钟，短休息 ${config.short} 分钟，每 ${config.rounds} 轮进入一次长休息。`}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs subtle">
            <span>下一阶段：{PHASE_META[nextPhase].label}</span>
            <span>本次会话已完成 {completedFocus} 次专注</span>
          </div>
        }
      >
        <Tabs
          items={[
            { value: 'focus', label: '专注' },
            { value: 'short', label: '短休息' },
            { value: 'long', label: '长休息' },
          ]}
          value={phase}
          onChange={(next) => {
            if (status === 'running') {
              toast.info('请先暂停或重置当前计时');
              return;
            }
            setPhase(next);
            setStatus('idle');
            setTotal(config[next] * 60_000);
            setRemaining(config[next] * 60_000);
          }}
        />

        <div className="mt-5 flex flex-col items-center">
          <div className="relative flex size-64 items-center justify-center sm:size-72">
            <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              <circle cx={100} cy={100} r={RING_RADIUS} fill="none" strokeWidth={12} className="stroke-slate-200 dark:stroke-slate-800" />
              <circle
                cx={100}
                cy={100}
                r={RING_RADIUS}
                fill="none"
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                className={cn(meta.ring, 'transition-[stroke-dashoffset] duration-200 ease-linear')}
              />
            </svg>
            <div className="relative text-center">
              <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{formatClock(remaining)}</p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-xs muted">
                <PhaseIcon className="size-3.5" /> {meta.label}
              </p>
              <p className="mt-1 text-xs subtle">剩余 {Math.round(progress * 100)}%</p>
            </div>
          </div>

          <p className="mt-4 text-center text-sm muted">{meta.description}</p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {status === 'running' ? (
              <Button icon={Pause} onClick={pause}>
                暂停
              </Button>
            ) : (
              <Button icon={Play} onClick={status === 'paused' ? resume : start}>
                {status === 'paused' ? '继续' : '开始'}
              </Button>
            )}
            <Button variant="secondary" icon={SkipForward} onClick={skip}>
              跳过
            </Button>
            <Button variant="secondary" icon={RotateCcw} onClick={reset}>
              重置
            </Button>
          </div>

          <div className="mt-4 w-full rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs subtle">本轮进度</p>
              <Badge tone={phase === 'focus' ? 'brand' : phase === 'short' ? 'success' : 'default'}>
                {cycleDone} / {config.rounds}
              </Badge>
            </div>
            <div className="mt-2 flex gap-1.5">
              {Array.from({ length: config.rounds }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1.5 flex-1 rounded-full',
                    index < cycleDone ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-200 dark:bg-slate-700',
                  )}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 border-t pt-3">
            <Hint>
              键盘：<Kbd>空格</Kbd> 开始 / 暂停，<Kbd>S</Kbd> 跳过，<Kbd>R</Kbd> 重置。计时结束会用 Web Audio 生成提示音。
            </Hint>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel
          title="计时设置"
          description="修改后会立即保存到本机；计时进行中不可修改。"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                disabled={status !== 'idle'}
                onClick={() => {
                  setStoredConfig(DEFAULT_CONFIG);
                  setTotal(DEFAULT_CONFIG.focus * 60_000);
                  setRemaining(DEFAULT_CONFIG.focus * 60_000);
                  setPhase('focus');
                  toast.success('已恢复默认设置');
                }}
              >
                恢复默认
              </Button>
              <span className="ml-auto text-xs subtle">{config.autoStart ? '自动开始下一阶段' : '手动开始下一阶段'}</span>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="专注时长（分钟）" htmlFor="pomodoro-focus">
              <Input
                id="pomodoro-focus"
                type="number"
                min={1}
                max={180}
                value={config.focus}
                disabled={status !== 'idle'}
                onChange={(event) => {
                  if (event.target.value === '') return;
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) updateConfig({ focus: clamp(Math.round(next), 1, 180) });
                }}
              />
            </Field>
            <Field label="短休息（分钟）" htmlFor="pomodoro-short">
              <Input
                id="pomodoro-short"
                type="number"
                min={1}
                max={60}
                value={config.short}
                disabled={status !== 'idle'}
                onChange={(event) => {
                  if (event.target.value === '') return;
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) updateConfig({ short: clamp(Math.round(next), 1, 60) });
                }}
              />
            </Field>
            <Field label="长休息（分钟）" htmlFor="pomodoro-long">
              <Input
                id="pomodoro-long"
                type="number"
                min={1}
                max={120}
                value={config.long}
                disabled={status !== 'idle'}
                onChange={(event) => {
                  if (event.target.value === '') return;
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) updateConfig({ long: clamp(Math.round(next), 1, 120) });
                }}
              />
            </Field>
            <Field label="每几轮长休息" htmlFor="pomodoro-rounds" hint="完成这么多轮专注后进入长休息。">
              <Input
                id="pomodoro-rounds"
                type="number"
                min={1}
                max={12}
                value={config.rounds}
                disabled={status !== 'idle'}
                onChange={(event) => {
                  if (event.target.value === '') return;
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) updateConfig({ rounds: clamp(Math.round(next), 1, 12) });
                }}
              />
            </Field>
          </div>

          <div className="mt-4 border-t pt-4">
            <Switch
              checked={config.autoStart}
              onChange={(value) => updateConfig({ autoStart: value })}
              label="阶段结束后自动开始下一阶段"
              disabled={status !== 'idle'}
            />
          </div>

          <Alert tone="info" className="mt-4">
            当前节奏：专注 {config.focus} 分钟 → 短休息 {config.short} 分钟，每 {config.rounds} 轮一次长休息 {config.long} 分钟。
          </Alert>
        </Panel>

        <Panel
          title="轮次记录"
          description="只统计完整结束的专注，跳过的不计入。"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs subtle">今日完成 {todayCount} 次专注 · 共 {records.length} 条记录</span>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                disabled={records.length === 0}
                onClick={() => setConfirmClear(true)}
              >
                清空记录
              </Button>
            </div>
          }
        >
          {records.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center">
              <p className="text-sm muted">还没有完成记录</p>
              <p className="mt-1 text-xs subtle">完成一次专注后，这里会显示时间与时长。</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {records.slice(0, 8).map((record) => {
                const recordMeta = PHASE_META[record.phase];
                const RecordIcon = recordMeta.icon;
                return (
                  <li key={record.id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        record.phase === 'focus'
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                          : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
                      )}
                    >
                      <RecordIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{recordMeta.label} {record.minutes} 分钟</p>
                      <p className="text-xs subtle">{new Date(record.at).toLocaleDateString('zh-CN')}</p>
                    </div>
                    <span className="font-mono text-xs subtle">{formatTime(record.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {records.length > 8 ? <p className="mt-2 text-xs subtle">仅显示最近 8 条，最多保存 30 条。</p> : null}
        </Panel>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空轮次记录？"
        description="所有已完成的专注记录会被删除，此操作无法撤销。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                setStoredRecords([]);
                setConfirmClear(false);
                toast.success('已清空轮次记录');
              }}
            >
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm muted">共 {records.length} 条记录，计时设置不会受影响。</p>
      </Modal>
    </ToolSplit>
  );
}
