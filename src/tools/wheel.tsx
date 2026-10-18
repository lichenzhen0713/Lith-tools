import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, History, Play, Plus, RotateCcw, Trash2, Trophy } from 'lucide-react';
import { Actions, Hint, Input, Panel, Result, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, Modal } from '../components/ui';
import { formatDate, formatNumber, uid } from '../lib/utils';
import { useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 12;
const MAX_OPTION_LENGTH = 16;
const MAX_HISTORY = 20;
const SPIN_TURNS = 5;
const SPIN_DURATION = 4200;
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

const DEFAULT_OPTIONS = ['一等奖', '二等奖', '三等奖', '谢谢参与'];

/** Twelve high-contrast sector colours, ordered so neighbours always differ. */
const SECTOR_COLORS = [
  '#4338ca',
  '#c2410c',
  '#0369a1',
  '#15803d',
  '#be185d',
  '#a16207',
  '#6d28d9',
  '#0f766e',
  '#b91c1c',
  '#1d4ed8',
  '#a21caf',
  '#4d7c0f',
];

interface SpinRecord {
  id: string;
  label: string;
  at: number;
}

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

/** Uniform integer in `[0, size)` using rejection sampling (no modulo bias). */
function randomIndex(size: number): number {
  if (size <= 1) return 0;
  const limit = Math.floor(4294967296 / size) * size;
  let value = randomUint32();
  let guard = 0;
  while (value >= limit && guard < 64) {
    value = randomUint32();
    guard += 1;
  }
  return value % size;
}

function randomUnit(): number {
  return randomUint32() / 4294967296;
}

/** Shorten a label until it fits the available radius width. */
function fitLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/** Draw the whole wheel at the given rotation (radians, clockwise). */
function drawWheel(canvas: HTMLCanvasElement, labels: string[], angle: number, size: number, dpr: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const center = size / 2;
  const radius = center - Math.max(4, size * 0.02);
  const count = labels.length;

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#e0e7ff';
  ctx.fill();

  if (count === 0) return;

  const arc = (Math.PI * 2) / count;
  for (let index = 0; index < count; index += 1) {
    const start = angle + index * arc;
    const end = start + arc;

    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = SECTOR_COLORS[index % SECTOR_COLORS.length];
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.005);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();

    const label = labels[index] ?? '';
    if (!label) continue;

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(start + arc / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const fontSize = Math.max(9, Math.min(20, size * (count > 9 ? 0.034 : 0.045)));
    ctx.font = `600 ${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
    ctx.fillText(fitLabel(ctx, label, radius * 0.66), radius - size * 0.055, 0);
    ctx.restore();
  }

  // Outer rim.
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, size * 0.016);
  ctx.strokeStyle = '#c7d2fe';
  ctx.stroke();

  // Hub.
  ctx.beginPath();
  ctx.arc(center, center, size * 0.075, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.01);
  ctx.strokeStyle = '#4338ca';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center, center, size * 0.022, 0, Math.PI * 2);
  ctx.fillStyle = '#4338ca';
  ctx.fill();

  // Pointer at the top, apex pointing down into the wheel.
  ctx.beginPath();
  ctx.moveTo(center - size * 0.042, size * 0.012);
  ctx.lineTo(center + size * 0.042, size * 0.012);
  ctx.lineTo(center, size * 0.105);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.008);
  ctx.strokeStyle = '#4338ca';
  ctx.stroke();
}

export default function WheelTool() {
  const toast = useToast();
  const [options, setOptions] = useState<string[]>(DEFAULT_OPTIONS);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; at: number } | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [history, setHistory] = useLocalStorage<SpinRecord[]>('lith-wheel-history', []);
  const [confirmClear, setConfirmClear] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const angleRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const geometryRef = useRef({ size: 0, dpr: 1 });

  const analysis = useMemo(() => {
    const labels = options.map((option) => option.trim());
    const emptyIndex = labels.findIndex((label) => label === '');
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const label of labels) {
      if (!label) continue;
      if (seen.has(label)) {
        if (!duplicates.includes(label)) duplicates.push(label);
      } else {
        seen.add(label);
      }
    }

    let error: string | null = null;
    if (options.length < MIN_OPTIONS) {
      error = `至少需要 ${MIN_OPTIONS} 个选项`;
    } else if (options.length > MAX_OPTIONS) {
      error = `最多支持 ${MAX_OPTIONS} 个选项`;
    } else if (emptyIndex >= 0) {
      error = `第 ${emptyIndex + 1} 个选项的内容不能为空`;
    }

    return { labels, duplicates, error };
  }, [options]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const { size, dpr } = geometryRef.current;
    if (!canvas || size <= 0) return;
    drawWheel(canvas, analysis.labels, angleRef.current, size, dpr);
  }, [analysis.labels]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const measure = () => {
      const width = Math.round(wrap.getBoundingClientRect().width);
      if (width <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      geometryRef.current = { size: width, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(width * dpr);
      draw();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [draw]);

  const cancelAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  // Stop any in-flight animation when the component unmounts.
  useEffect(() => cancelAnimation, [cancelAnimation]);

  const spin = useCallback(() => {
    if (spinning) return;
    if (analysis.error) {
      toast.error(analysis.error);
      return;
    }
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      toast.error('当前浏览器不支持 Web Crypto，无法进行随机抽取');
      return;
    }

    const labels = analysis.labels;
    const count = labels.length;
    const index = randomIndex(count);
    const arc = (Math.PI * 2) / count;
    const jitter = (randomUnit() - 0.5) * arc * 0.66;
    const targetBase = -Math.PI / 2 - (index + 0.5) * arc + jitter;

    const twoPi = Math.PI * 2;
    const from = angleRef.current;
    const offset = (((targetBase - from) % twoPi) + twoPi) % twoPi;
    const delta = offset + twoPi * SPIN_TURNS;
    const startedAt = performance.now();

    setResult(null);
    setResultOpen(false);
    setSpinning(true);

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / SPIN_DURATION);
      const eased = 1 - Math.pow(1 - progress, 4);
      angleRef.current = from + delta * eased;
      draw();

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step);
        return;
      }

      frameRef.current = null;
      angleRef.current = from + delta;
      draw();
      setSpinning(false);

      const label = labels[index] ?? '';
      const at = Date.now();
      setResult({ label, at });
      setResultOpen(true);
      setHistory((previous) => [{ id: uid('spin'), label, at }, ...previous].slice(0, MAX_HISTORY));
      toast.success(`抽奖结果：${label}`);
    };

    frameRef.current = window.requestAnimationFrame(step);
  }, [spinning, analysis, draw, setHistory, toast]);

  const resetOptions = () => {
    if (spinning) return;
    setOptions([...DEFAULT_OPTIONS]);
    setResult(null);
  };

  const updateOption = (index: number, value: string) => {
    if (spinning) return;
    setOptions((previous) => previous.map((option, position) => (position === index ? value : option)));
    setResult(null);
  };

  const addOption = () => {
    if (spinning || options.length >= MAX_OPTIONS) return;
    setOptions((previous) => [...previous, `选项 ${previous.length + 1}`]);
    setResult(null);
  };

  const removeOption = (index: number) => {
    if (spinning || options.length <= MIN_OPTIONS) return;
    setOptions((previous) => previous.filter((_, position) => position !== index));
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel
          title="转盘选项"
          description={`支持 ${MIN_OPTIONS} - ${MAX_OPTIONS} 个选项，编辑后转盘会立即重绘`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                icon={Plus}
                onClick={addOption}
                disabled={spinning || options.length >= MAX_OPTIONS}
              >
                添加选项
              </Button>
              <Button variant="ghost" size="sm" type="button" icon={RotateCcw} onClick={resetOptions} disabled={spinning}>
                恢复默认
              </Button>
            </div>
          }
        >
          <div className="space-y-2.5">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length] }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <Input
                  value={option}
                  maxLength={MAX_OPTION_LENGTH}
                  disabled={spinning}
                  aria-label={`第 ${index + 1} 个选项`}
                  placeholder={`选项 ${index + 1}`}
                  onChange={(event) => updateOption(index, event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  icon={Trash2}
                  aria-label={`删除第 ${index + 1} 个选项`}
                  disabled={spinning || options.length <= MIN_OPTIONS}
                  onClick={() => removeOption(index)}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {analysis.error ? <Alert tone="warning">{analysis.error}</Alert> : null}
            {analysis.duplicates.length > 0 ? (
              <Alert tone="info">存在重复选项：{analysis.duplicates.join('、')}。重复内容会各自占用一个扇区。</Alert>
            ) : null}
            <Hint>修改选项会清除上一次的结果；转动过程中会锁定所有编辑操作。</Hint>
          </div>
        </Panel>

        <Panel
          title="抽奖转盘"
          description={spinning ? '转动中，请稍候…' : '点击「开始转动」，指针指向的扇区即为结果'}
        >
          <div ref={wrapRef} className="mx-auto w-full max-w-[420px]">
            <canvas ref={canvasRef} className="block h-auto w-full" role="img" aria-label="抽奖转盘" />
          </div>

          <Actions className="justify-center">
            <Button
              type="button"
              icon={Play}
              loading={spinning}
              disabled={spinning || Boolean(analysis.error)}
              onClick={spin}
            >
              {spinning ? '转动中…' : '开始转动'}
            </Button>
            <Button
              variant="secondary"
              type="button"
              icon={RotateCcw}
              disabled={spinning || result === null}
              onClick={() => {
                setResult(null);
                setResultOpen(false);
              }}
            >
              清除结果
            </Button>
          </Actions>

          <div className="mt-4">
            <Hint>
              结果在动画开始前已由 Web Crypto（crypto.getRandomValues）确定，动画只负责把指针停在对应扇区。
              转动期间按钮与选项编辑会被禁用，避免结果错乱。
            </Hint>
          </div>
        </Panel>
      </ToolSplit>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Trophy className="size-4" /> 最近结果
            {history.length > 0 ? <Badge tone="brand">{formatNumber(history.length)}</Badge> : null}
          </span>
        }
        description="最近 20 次抽奖记录保存在本机浏览器"
        footer={
          history.length > 0 ? (
            <Button variant="ghost" size="sm" type="button" icon={Trash2} onClick={() => setConfirmClear(true)}>
              清空记录
            </Button>
          ) : null
        }
      >
        {result ? (
          <Result
            label="本次结果"
            value={result.label}
            hint={`抽奖时间：${formatDate(new Date(result.at).toISOString(), 'datetime')}`}
          />
        ) : (
          <EmptyState
            icon={CircleDot}
            title="还没有抽奖结果"
            description="在左侧设置好选项后点击「开始转动」，结果会显示在这里。"
            className="py-10"
          />
        )}

        {history.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium subtle">
              <History className="size-3.5" /> 历史记录
            </p>
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {history.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-[var(--hover-bg)] px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={record.label}>
                    {record.label}
                  </span>
                  <span className="shrink-0 text-xs subtle">
                    {formatDate(new Date(record.at).toISOString(), 'datetime')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      <Modal
        open={resultOpen}
        onClose={() => setResultOpen(false)}
        title="抽奖结果"
        description="指针指向的扇区"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResultOpen(false)}>
              关闭
            </Button>
            <Button
              icon={Play}
              onClick={() => {
                setResultOpen(false);
                spin();
              }}
            >
              再转一次
            </Button>
          </>
        }
      >
        <div className="py-2 text-center">
          <p className="text-3xl font-semibold break-words">{result?.label ?? '—'}</p>
          <p className="mt-2 text-xs subtle">
            {result ? formatDate(new Date(result.at).toISOString(), 'datetime') : ''}
          </p>
        </div>
      </Modal>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空抽奖记录"
        description={`将删除全部 ${formatNumber(history.length)} 条历史记录，此操作无法撤销。`}
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
                toast.success('抽奖记录已清空');
              }}
            >
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm muted">转盘选项与当前结果不会被删除，只清除历史记录。</p>
      </Modal>
    </div>
  );
}
