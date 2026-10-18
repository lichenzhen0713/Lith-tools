import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel, ToolSplit } from './kit';
import { Alert, Badge, Button, Kbd, Tabs } from '../components/ui';
import { useInterval } from '../lib/hooks';
import { useToast } from '../lib/toast';

type Mode = 'duration' | 'target';
type Status = 'idle' | 'running' | 'paused' | 'done';

const PRESETS = [1, 3, 5, 10, 25, 60];
const RING_RADIUS = 88;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function parseAmount(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const STATUS_LABEL: Record<Status, string> = {
  idle: '未开始',
  running: '进行中',
  paused: '已暂停',
  done: '已结束',
};

export default function CountdownTool() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('duration');
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('5');
  const [seconds, setSeconds] = useState('0');
  const [targetInput, setTargetInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const endAtRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const parts = [hours, minutes, seconds].map(parseAmount);
  const durationInvalid = [hours, minutes, seconds].some((raw, index) => {
    if (raw.trim() === '') return false;
    const value = parts[index];
    const max = index === 0 ? 99 : 59;
    return value === null || value < 0 || value > max;
  });
  const configuredMs = durationInvalid
    ? null
    : ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;

  const targetTime = targetInput ? new Date(targetInput).getTime() : Number.NaN;
  const targetValid = Number.isFinite(targetTime);
  const targetPassed = targetValid && targetTime - Date.now() <= 0;

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
    const pattern = [
      { at: 0, frequency: 880, duration: 0.22 },
      { at: 0.32, frequency: 880, duration: 0.22 },
      { at: 0.64, frequency: 1174.66, duration: 0.32 },
    ];
    pattern.forEach((note) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, start + note.at);
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(0.3, start + note.at + 0.02);
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
    if (mode === 'duration') {
      const ms = configuredMs ?? 0;
      setRemaining(ms);
      setTotal(ms);
      return;
    }
    const ms = targetValid ? Math.max(0, targetTime - Date.now()) : 0;
    setRemaining(ms);
    setTotal(ms);
  }, [status, mode, configuredMs, targetTime, targetValid]);

  const start = useCallback(() => {
    let ms = 0;
    if (mode === 'duration') {
      if (durationInvalid) {
        setError('小时需为 0–99，分钟和秒需为 0–59');
        return;
      }
      if (!configuredMs || configuredMs <= 0) {
        setError('请设置大于 0 的倒计时时长');
        return;
      }
      ms = configuredMs;
    } else {
      if (!targetValid) {
        setError('请选择目标日期时间');
        return;
      }
      ms = targetTime - Date.now();
      if (ms <= 0) {
        setError('目标时间已经过去，请重新选择');
        return;
      }
    }
    setError(null);
    setTotal(ms);
    setRemaining(ms);
    endAtRef.current = Date.now() + ms;
    setStatus('running');
    ensureAudio();
  }, [mode, durationInvalid, configuredMs, targetValid, targetTime, ensureAudio]);

  const pause = useCallback(() => {
    if (status !== 'running' || endAtRef.current === null) return;
    const left = Math.max(0, endAtRef.current - Date.now());
    endAtRef.current = null;
    setRemaining(left);
    setStatus(left > 0 ? 'paused' : 'done');
  }, [status]);

  const resume = useCallback(() => {
    if (remaining <= 0) return;
    endAtRef.current = Date.now() + remaining;
    setStatus('running');
    ensureAudio();
  }, [remaining, ensureAudio]);

  const reset = useCallback(() => {
    endAtRef.current = null;
    setStatus('idle');
    setError(null);
    if (mode === 'duration') {
      const ms = configuredMs ?? 0;
      setRemaining(ms);
      setTotal(ms);
    } else {
      const ms = targetValid ? Math.max(0, targetTime - Date.now()) : 0;
      setRemaining(ms);
      setTotal(ms);
    }
  }, [mode, configuredMs, targetValid, targetTime]);

  useInterval(
    () => {
      if (status !== 'running' || endAtRef.current === null) return;
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        endAtRef.current = null;
        setRemaining(0);
        setStatus('done');
        playAlarm();
        toast.success('倒计时结束，时间到！');
        return;
      }
      setRemaining(left);
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
        else if (status === 'idle') start();
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [status, start, pause, resume, reset]);

  const progress = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const ringOffset = RING_CIRCUMFERENCE * (1 - progress);
  const modeDescription =
    mode === 'duration' ? '设置小时、分钟与秒，开始后按真实时间倒计时。' : '选择一个未来的日期时间作为终点。';

  return (
    <ToolSplit>
      <Panel title="设置倒计时" description={modeDescription}>
        <Tabs
          items={[
            { value: 'duration', label: '按时长' },
            { value: 'target', label: '按目标时间' },
          ]}
          value={mode}
          onChange={(next) => {
            if (status === 'running') {
              toast.info('请先暂停或重置当前倒计时');
              return;
            }
            setMode(next);
            setStatus('idle');
            setError(null);
          }}
        />

        <div className="mt-4">
          {mode === 'duration' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Field label="小时" htmlFor="countdown-hours">
                  <Input
                    id="countdown-hours"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    step={1}
                    value={hours}
                    disabled={status === 'running' || status === 'paused'}
                    error={durationInvalid}
                    onChange={(event) => setHours(event.target.value)}
                  />
                </Field>
                <Field label="分钟" htmlFor="countdown-minutes">
                  <Input
                    id="countdown-minutes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    step={1}
                    value={minutes}
                    disabled={status === 'running' || status === 'paused'}
                    error={durationInvalid}
                    onChange={(event) => setMinutes(event.target.value)}
                  />
                </Field>
                <Field label="秒" htmlFor="countdown-seconds">
                  <Input
                    id="countdown-seconds"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    step={1}
                    value={seconds}
                    disabled={status === 'running' || status === 'paused'}
                    error={durationInvalid}
                    onChange={(event) => setSeconds(event.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs subtle">快捷设置：</span>
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chip"
                    disabled={status === 'running' || status === 'paused'}
                    onClick={() => {
                      setHours('0');
                      setMinutes(String(preset));
                      setSeconds('0');
                    }}
                  >
                    {preset} 分钟
                  </button>
                ))}
              </div>

              {durationInvalid ? <Alert tone="error">小时需为 0–99，分钟和秒需为 0–59。</Alert> : null}
            </div>
          ) : (
            <div className="space-y-4">
              <Field
                label="目标日期时间（本地时区）"
                hint="浏览器会按当前设备时区解析这个时间。"
                error={targetPassed ? '这个时间已经过去，请重新选择。' : null}
              >
                <Input
                  type="datetime-local"
                  value={targetInput}
                  min={toLocalInputValue(new Date())}
                  disabled={status === 'running' || status === 'paused'}
                  onChange={(event) => setTargetInput(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs subtle">快捷设置：</span>
                {[5, 15, 30, 60].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chip"
                    disabled={status === 'running' || status === 'paused'}
                    onClick={() => setTargetInput(toLocalInputValue(new Date(Date.now() + preset * 60_000)))}
                  >
                    {preset} 分钟后
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error ? (
          <Alert tone="error" title="无法开始" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <Actions className="mt-4">
          {status === 'running' ? (
            <Button icon={Pause} onClick={pause}>
              暂停
            </Button>
          ) : (
            <Button icon={Play} onClick={status === 'paused' ? resume : start}>
              {status === 'paused' ? '继续' : '开始'}
            </Button>
          )}
          <Button variant="secondary" icon={RotateCcw} onClick={reset}>
            重置
          </Button>
          <Button variant="ghost" icon={Bell} onClick={playAlarm}>
            试听提示音
          </Button>
        </Actions>

        <div className="mt-4 border-t pt-3">
          <Hint>
            键盘：<Kbd>空格</Kbd> 开始 / 暂停，<Kbd>R</Kbd> 重置。结束时会用 Web Audio 生成提示音，不会加载外部音频文件。
          </Hint>
        </div>
      </Panel>

      <Panel
        title="剩余时间"
        description="进度环随倒计时收缩"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs subtle">
            <span>{mode === 'target' && targetValid ? `目标：${new Date(targetTime).toLocaleString('zh-CN', { hour12: false })}` : '以本地时区计时'}</span>
            <Badge tone={status === 'done' ? 'success' : status === 'running' ? 'brand' : 'default'}>{STATUS_LABEL[status]}</Badge>
          </div>
        }
      >
        <div className="flex flex-col items-center">
          <div className="relative flex size-64 items-center justify-center sm:size-72">
            <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              <circle
                cx={100}
                cy={100}
                r={RING_RADIUS}
                fill="none"
                strokeWidth={12}
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <circle
                cx={100}
                cy={100}
                r={RING_RADIUS}
                fill="none"
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                className="stroke-indigo-600 transition-[stroke-dashoffset] duration-200 ease-linear dark:stroke-indigo-400"
              />
            </svg>
            <div className="relative text-center">
              <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                {formatDuration(remaining)}
              </p>
              <p className="mt-2 text-xs subtle">剩余 {Math.round(progress * 100)}%</p>
            </div>
          </div>

          {status === 'done' ? (
            <Alert tone="success" title="时间到！" className="mt-4 w-full">
              倒计时已结束，提示音已播放。
              <div className="mt-3 flex flex-wrap gap-2">
                {mode === 'duration' ? (
                  <Button
                    size="sm"
                    icon={RotateCcw}
                    onClick={() => {
                      reset();
                      start();
                    }}
                  >
                    再来一次
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={reset}>
                  重置
                </Button>
              </div>
            </Alert>
          ) : status === 'idle' ? (
            <div className="mt-4 flex flex-col items-center gap-1 text-center">
              <Timer className="size-4 text-slate-400" />
              <p className="text-sm muted">
                {mode === 'duration'
                  ? configuredMs && configuredMs > 0
                    ? `已就绪：${formatDuration(configuredMs)}，点击「开始」`
                    : '请先设置一个大于 0 的时长'
                  : targetValid
                    ? targetPassed
                      ? '所选目标时间已过去'
                      : '已就绪，点击「开始」开始倒计时'
                    : '请选择一个未来的目标时间'}
              </p>
            </div>
          ) : null}
        </div>
      </Panel>
    </ToolSplit>
  );
}
