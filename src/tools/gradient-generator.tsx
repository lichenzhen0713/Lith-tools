import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Download, Plus, Shuffle, Trash2 } from 'lucide-react';
import { Field, Hint, Panel, ToolSplit } from './kit';
import { Button, CopyButton, Input, Select, Tabs } from '../components/ui';
import { clamp, cn, download, uid } from '../lib/utils';
import { useToast } from '../lib/toast';

type GradientType = 'linear' | 'radial';
type RadialShape = 'circle' | 'ellipse';
type RadialPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top left'
  | 'top right'
  | 'bottom left'
  | 'bottom right';

interface Stop {
  id: string;
  color: string;
  position: number;
}

interface Preset {
  name: string;
  type: GradientType;
  angle: number;
  colors: string[];
}

const MAX_STOPS = 10;
const MIN_STOPS = 2;

const PRESETS: Preset[] = [
  { name: '日出', type: 'linear', angle: 120, colors: ['#FF9A9E', '#FAD0C4', '#FBC2EB'] },
  { name: '海洋', type: 'linear', angle: 135, colors: ['#2E3192', '#1BFFFF'] },
  { name: '极光', type: 'linear', angle: 90, colors: ['#00C6FF', '#0072FF', '#7F00FF'] },
  { name: '紫罗兰', type: 'linear', angle: 45, colors: ['#A18CD1', '#FBC2EB'] },
  { name: '日落', type: 'linear', angle: 160, colors: ['#FF512F', '#DD2476'] },
  { name: '森林', type: 'linear', angle: 100, colors: ['#134E5E', '#71B280'] },
  { name: '霓虹', type: 'linear', angle: 135, colors: ['#F857A6', '#FF5858'] },
  { name: '灰阶', type: 'linear', angle: 180, colors: ['#F8FAFC', '#94A3B8', '#0F172A'] },
  { name: '星空', type: 'radial', angle: 0, colors: ['#0F172A', '#1E3A8A', '#7C3AED'] },
];

const RADIAL_POSITIONS: { value: RadialPosition; label: string }[] = [
  { value: 'center', label: '中心' },
  { value: 'top', label: '顶部' },
  { value: 'bottom', label: '底部' },
  { value: 'left', label: '左侧' },
  { value: 'right', label: '右侧' },
  { value: 'top left', label: '左上' },
  { value: 'top right', label: '右上' },
  { value: 'bottom left', label: '左下' },
  { value: 'bottom right', label: '右下' },
];

function toByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const hex = ((1 << 24) | (toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).slice(1).toUpperCase();
  return `#${hex}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
  return {
    r: Number.parseInt(full.slice(0, 2), 16) || 0,
    g: Number.parseInt(full.slice(2, 4), 16) || 0,
    b: Number.parseInt(full.slice(4, 6), 16) || 0,
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return rgbToHex({ r: value, g: value, b: value });
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (input: number) => {
    let t = input;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex({
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  });
}

function blendHex(from: string, to: string, ratio: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return rgbToHex({
    r: start.r + (end.r - start.r) * ratio,
    g: start.g + (end.g - start.g) * ratio,
    b: start.b + (end.b - start.b) * ratio,
  });
}

function stopsFromColors(colors: string[]): Stop[] {
  return colors.map((color, index) => ({
    id: uid('stop'),
    color: color.toUpperCase(),
    position: colors.length <= 1 ? 50 : Math.round((index / (colors.length - 1)) * 100),
  }));
}

function presetPreview(preset: Preset): string {
  const colors = preset.colors.join(', ');
  return preset.type === 'linear'
    ? `linear-gradient(${preset.angle}deg, ${colors})`
    : `radial-gradient(circle at center, ${colors})`;
}

/** One color stop row: color picker + hex input + position slider + position number. */
function StopEditor({
  stop,
  canRemove,
  onChange,
  onRemove,
}: {
  stop: Stop;
  canRemove: boolean;
  onChange: (patch: Partial<Pick<Stop, 'color' | 'position'>>) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(stop.color);
  const valid = /^#[0-9A-F]{6}$/.test(text);

  useEffect(() => {
    setText(stop.color);
  }, [stop.color]);

  return (
    <div className="rounded-xl border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={stop.color.toLowerCase()}
          onChange={(event) => onChange({ color: event.target.value.toUpperCase() })}
          className="size-9 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
          aria-label="色标颜色"
        />
        <Input
          value={text}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
            const next = `#${digits.toUpperCase()}`;
            setText(next);
            if (/^#[0-9A-F]{6}$/.test(next)) onChange({ color: next });
          }}
          onBlur={() => {
            if (!valid) setText(stop.color);
          }}
          error={!valid}
          spellCheck={false}
          autoComplete="off"
          aria-label="色标 HEX 色值"
          className="w-28 shrink-0 font-mono"
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={stop.position}
          onChange={(event) => onChange({ position: Number(event.target.value) })}
          className="h-2 min-w-24 flex-1 cursor-pointer accent-indigo-600"
          aria-label="色标位置"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={stop.position}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) onChange({ position: clamp(Math.round(value), 0, 100) });
            }}
            aria-label="色标位置百分比"
            className="w-20 text-center"
          />
          <span className="text-xs subtle">%</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          icon={Trash2}
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="删除该色标"
          title={canRemove ? '删除该色标' : '至少需要保留 2 个色标'}
        />
      </div>
    </div>
  );
}

/** Linear / radial gradient builder with multi-stop editing and CSS export. */
export default function GradientGeneratorTool() {
  const toast = useToast();
  const [type, setType] = useState<GradientType>('linear');
  const [angle, setAngle] = useState(135);
  const [shape, setShape] = useState<RadialShape>('circle');
  const [position, setPosition] = useState<RadialPosition>('center');
  const [selector, setSelector] = useState('.gradient');
  const [stops, setStops] = useState<Stop[]>(() => stopsFromColors(['#6366F1', '#A855F7', '#EC4899']));

  const safeSelector = useMemo(() => {
    const cleaned = selector.replace(/[^a-zA-Z0-9_.#>:\s-]/g, '').trim();
    return cleaned || '.gradient';
  }, [selector]);

  const sortedStops = useMemo(() => [...stops].sort((a, b) => a.position - b.position), [stops]);

  const gradientValue = useMemo(() => {
    const list = sortedStops.map((stop) => `${stop.color.toLowerCase()} ${Math.round(stop.position)}%`).join(', ');
    return type === 'linear'
      ? `linear-gradient(${Math.round(angle)}deg, ${list})`
      : `radial-gradient(${shape} at ${position}, ${list})`;
  }, [angle, position, shape, sortedStops, type]);

  const cssCode = useMemo(
    () =>
      `${safeSelector} {\n  background-color: ${sortedStops[0].color};\n  background-image: ${gradientValue};\n}`,
    [gradientValue, safeSelector, sortedStops],
  );

  const updateStop = (id: string, patch: Partial<Pick<Stop, 'color' | 'position'>>) => {
    setStops((previous) => previous.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)));
  };

  const removeStop = (id: string) => {
    setStops((previous) => (previous.length <= MIN_STOPS ? previous : previous.filter((stop) => stop.id !== id)));
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) return;
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    let positionValue = 50;
    let color = '#6366F1';
    if (sorted.length >= 2) {
      let bestIndex = 0;
      let bestGap = -1;
      for (let index = 0; index < sorted.length - 1; index += 1) {
        const gap = sorted[index + 1].position - sorted[index].position;
        if (gap > bestGap) {
          bestGap = gap;
          bestIndex = index;
        }
      }
      const left = sorted[bestIndex];
      const right = sorted[bestIndex + 1];
      positionValue = Math.round((left.position + right.position) / 2);
      color = blendHex(left.color, right.color, 0.5);
    }
    setStops((previous) => [...previous, { id: uid('stop'), color, position: positionValue }]);
  };

  const reverseStops = () => {
    setStops((previous) => previous.map((stop) => ({ ...stop, position: 100 - stop.position })).reverse());
  };

  const randomize = () => {
    const count = 2 + Math.floor(Math.random() * 2);
    const colors = Array.from({ length: count }, (_, index) =>
      hslToHex(Math.random() * 360, 62 + Math.random() * 26, 42 + Math.random() * 24 + index * 2),
    );
    setStops(stopsFromColors(colors));
    setAngle(Math.floor(Math.random() * 360));
  };

  const applyPreset = (preset: Preset) => {
    setType(preset.type);
    setAngle(preset.angle);
    setStops(stopsFromColors(preset.colors));
  };

  const downloadCss = () => {
    download(cssCode, 'gradient.css', 'text/css;charset=utf-8');
    toast.success('已下载 gradient.css');
  };

  return (
    <div className="space-y-4">
      <Panel title="渐变设置" description="选择线性或径向渐变，并设置方向、形状与中心位置。">
        <Tabs
          items={[
            { value: 'linear', label: '线性渐变' },
            { value: 'radial', label: '径向渐变' },
          ]}
          value={type}
          onChange={setType}
          className="mb-4"
        />

        {type === 'linear' ? (
          <Field label="角度" hint="0° 由左向右，90° 由下向上，数值越大顺时针旋转。">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={angle}
                onChange={(event) => setAngle(Number(event.target.value))}
                className="h-2 min-w-40 flex-1 cursor-pointer accent-indigo-600"
                aria-label="渐变角度"
              />
              <Input
                type="number"
                min={0}
                max={360}
                value={angle}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setAngle(clamp(Math.round(value), 0, 360));
                }}
                className="w-24 text-center"
                aria-label="渐变角度数值"
              />
              <span className="text-sm subtle">deg</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAngle(value)}
                  className={cn('chip px-2.5 py-1 text-[11px]', angle === value && 'chip-active')}
                >
                  {value}°
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="形状" htmlFor="gradient-shape">
              <Select
                id="gradient-shape"
                value={shape}
                onChange={(event) => setShape(event.target.value as RadialShape)}
              >
                <option value="circle">圆形（circle）</option>
                <option value="ellipse">椭圆（ellipse）</option>
              </Select>
            </Field>
            <Field label="中心位置" htmlFor="gradient-position">
              <Select
                id="gradient-position"
                value={position}
                onChange={(event) => setPosition(event.target.value as RadialPosition)}
              >
                {RADIAL_POSITIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <div className="mt-4">
          <Field label="CSS 选择器" htmlFor="gradient-selector" hint="用于代码中的类名或 ID，例如 .gradient 或 #hero">
            <Input
              id="gradient-selector"
              value={selector}
              onChange={(event) => setSelector(event.target.value)}
              placeholder=".gradient"
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="色标"
        description={`共 ${stops.length} 个色标（最少 ${MIN_STOPS} 个、最多 ${MAX_STOPS} 个），可调整颜色与位置。`}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={addStop}
              disabled={stops.length >= MAX_STOPS}
            >
              添加色标
            </Button>
            <Button variant="secondary" size="sm" icon={ArrowLeftRight} onClick={reverseStops}>
              反转顺序
            </Button>
            <Button variant="secondary" size="sm" icon={Shuffle} onClick={randomize}>
              随机渐变
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {stops.map((stop) => (
            <StopEditor
              key={stop.id}
              stop={stop}
              canRemove={stops.length > MIN_STOPS}
              onChange={(patch) => updateStop(stop.id, patch)}
              onRemove={() => removeStop(stop.id)}
            />
          ))}
        </div>
        <div className="mt-3">
          <Hint>位置为百分比：0% 是渐变起点，100% 是终点；多个色标可以重合以形成硬边。</Hint>
        </div>
      </Panel>

      <ToolSplit>
        <Panel title="实时预览" description="随设置即时更新">
          <div className="h-52 w-full rounded-xl border sm:h-64" style={{ backgroundImage: gradientValue }} />
          <div className="mt-3 rounded-xl border bg-[var(--hover-bg)] px-3 py-2">
            <p className="text-[11px] subtle">background-image</p>
            <p className="mt-1 font-mono text-xs break-all">{gradientValue}</p>
          </div>
        </Panel>

        <Panel
          title="CSS 代码"
          description="直接复制到样式表中使用"
          footer={
            <div className="flex flex-wrap gap-2">
              <CopyButton text={cssCode} label="复制 CSS" />
              <Button variant="secondary" icon={Download} onClick={downloadCss}>
                下载 .css
              </Button>
            </div>
          }
        >
          <pre className="max-h-64 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6 whitespace-pre-wrap break-all">
            {cssCode}
          </pre>
        </Panel>
      </ToolSplit>

      <Panel title="渐变预设" description="点击任意预设快速套用，可在此基础上继续调整。">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="group overflow-hidden rounded-xl border text-left transition-transform hover:-translate-y-0.5"
            >
              <span
                className="block h-12 w-full"
                style={{ backgroundImage: presetPreview(preset) }}
                aria-hidden="true"
              />
              <span className="flex items-center justify-between px-2 py-1.5 text-xs">
                {preset.name}
                <span className="subtle opacity-0 transition-opacity group-hover:opacity-100">套用</span>
              </span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
