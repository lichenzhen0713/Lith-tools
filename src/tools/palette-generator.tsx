import { useMemo, useState } from 'react';
import { Copy, Download, Shuffle } from 'lucide-react';
import { Field, Hint, Panel, ToolSplit } from './kit';
import { Alert, Button, CopyButton, Input } from '../components/ui';
import { clamp, cn, copyText, download } from '../lib/utils';
import { useToast } from '../lib/toast';

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

type SchemeKey = 'complementary' | 'analogous' | 'triadic' | 'split' | 'monochrome';

interface SchemeStop {
  dh: number;
  ds?: number;
  dl?: number;
  lightness?: number;
}

interface Scheme {
  key: SchemeKey;
  name: string;
  description: string;
  stops: SchemeStop[];
}

interface PaletteColor {
  hex: string;
  rgb: string;
  hsl: string;
  value: HSL;
}

const SCHEMES: Scheme[] = [
  {
    key: 'complementary',
    name: '互补色',
    description: '基础色与色轮正对面（+180°）的颜色，对比强烈，适合强调与点缀。',
    stops: [{ dh: 0 }, { dh: 180 }, { dh: 0, ds: 6, dl: -18 }, { dh: 180, ds: -10, dl: 16 }, { dh: 180, dl: -18 }],
  },
  {
    key: 'analogous',
    name: '类似色',
    description: '色轮上相邻 ±30° / ±60° 的颜色，过渡自然柔和，适合大面积背景。',
    stops: [{ dh: -60 }, { dh: -30 }, { dh: 0 }, { dh: 30 }, { dh: 60 }],
  },
  {
    key: 'triadic',
    name: '三角配色',
    description: '色轮上间隔 120° 的三色，视觉平衡又鲜明，适合活泼的界面。',
    stops: [
      { dh: 0 },
      { dh: 120 },
      { dh: 240 },
      { dh: 0, dl: 16 },
      { dh: 120, dl: 16 },
      { dh: 240, dl: 16 },
    ],
  },
  {
    key: 'split',
    name: '分裂互补',
    description: '取互补色两侧 ±30° 的颜色，比互补色更柔和，同时保持对比。',
    stops: [
      { dh: 0 },
      { dh: 150 },
      { dh: 210 },
      { dh: 0, dl: 16 },
      { dh: 150, dl: -14 },
      { dh: 210, ds: -8, dl: 14 },
    ],
  },
  {
    key: 'monochrome',
    name: '单色',
    description: '同一色相下的明度层次，便于建立背景、卡片、文字的视觉层级。',
    stops: [
      { dh: 0, lightness: 94 },
      { dh: 0, lightness: 80 },
      { dh: 0, lightness: 66 },
      { dh: 0, lightness: 52 },
      { dh: 0, lightness: 38 },
      { dh: 0, lightness: 24 },
    ],
  },
];

function toByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function rgbToHex({ r, g, b }: RGB): string {
  const hex = ((1 << 24) | (toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).slice(1).toUpperCase();
  return `#${hex}`;
}

function hexToRgb(input: string): RGB | null {
  const value = input.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return null;
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness * 100 };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: (hue / 6) * 360, s: saturation * 100, l: lightness * 100 };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = (((h % 360) + 360) % 360) / 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return { r: value, g: value, b: value };
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
  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  };
}

function hslText({ h, s, l }: HSL): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function buildPalette(base: HSL, scheme: Scheme): PaletteColor[] {
  return scheme.stops.map((stop) => {
    const value: HSL = {
      h: Math.round(((base.h + stop.dh) % 360 + 360) % 360),
      s: Math.round(clamp(base.s + (stop.ds ?? 0), 0, 100)),
      l: Math.round(clamp(stop.lightness ?? base.l + (stop.dl ?? 0), 5, 96)),
    };
    const rgb = hslToRgb(value);
    return {
      hex: rgbToHex(rgb),
      rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      hsl: hslText(value),
      value,
    };
  });
}

function randomHex(): string {
  return rgbToHex({
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  });
}

/** Harmony palette generator with HEX copy and JSON / CSS variable export. */
export default function PaletteGeneratorTool() {
  const toast = useToast();
  const [hexInput, setHexInput] = useState('#6366F1');
  const [baseHex, setBaseHex] = useState('#6366F1');
  const [schemeKey, setSchemeKey] = useState<SchemeKey>('complementary');
  const [error, setError] = useState<string | null>(null);

  const scheme = SCHEMES.find((item) => item.key === schemeKey) ?? SCHEMES[0];
  const baseRgb = useMemo(() => hexToRgb(baseHex) ?? { r: 99, g: 102, b: 241 }, [baseHex]);
  const palette = useMemo(() => buildPalette(rgbToHsl(baseRgb), scheme), [baseRgb, scheme]);

  const cssCode = useMemo(
    () => `:root {\n${palette.map((color, index) => `  --palette-${index + 1}: ${color.hex};`).join('\n')}\n}`,
    [palette],
  );

  const jsonCode = useMemo(
    () =>
      JSON.stringify(
        {
          base: baseHex,
          scheme: scheme.key,
          schemeName: scheme.name,
          colors: palette.map((color) => ({ hex: color.hex, rgb: color.rgb, hsl: color.hsl })),
        },
        null,
        2,
      ),
    [baseHex, palette, scheme],
  );

  const hues = useMemo(() => Array.from(new Set(palette.map((color) => color.value.h))), [palette]);

  const commitHex = (value: string) => {
    const parsed = hexToRgb(value);
    if (!parsed) {
      setError('请输入合法的 HEX 色值，例如 #6366F1 或 #63F。');
      return;
    }
    setError(null);
    setBaseHex(rgbToHex(parsed));
  };

  const handleChange = (value: string) => {
    setHexInput(value);
    commitHex(value);
  };

  const applyRandom = () => {
    const next = randomHex();
    setHexInput(next);
    setError(null);
    setBaseHex(next);
  };

  const copyHex = async (hex: string) => {
    const ok = await copyText(hex);
    if (ok) toast.success(`已复制 ${hex}`);
    else toast.error('复制失败，请手动选择文本');
  };

  const exportJson = () => {
    download(jsonCode, `palette-${scheme.key}-${baseHex.slice(1)}.json`, 'application/json;charset=utf-8');
    toast.success('已导出 JSON');
  };

  const exportCss = () => {
    download(cssCode, `palette-${scheme.key}-${baseHex.slice(1)}.css`, 'text/css;charset=utf-8');
    toast.success('已导出 CSS 变量');
  };

  return (
    <div className="space-y-4">
      <Panel title="基础色" description="选择一个基础颜色，配色方案会立即重新计算。">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-4">
            <Field
              label="基础色 HEX"
              htmlFor="palette-base-hex"
              hint="支持 #RRGGBB 与 3 位缩写 #RGB"
              error={error}
            >
              <div className="flex flex-wrap gap-2">
                <Input
                  id="palette-base-hex"
                  value={hexInput}
                  onChange={(event) => handleChange(event.target.value)}
                  placeholder="#6366F1"
                  spellCheck={false}
                  autoComplete="off"
                  error={Boolean(error)}
                  className="min-w-0 flex-1 font-mono uppercase"
                />
                <input
                  type="color"
                  value={baseHex.toLowerCase()}
                  onChange={(event) => {
                    const next = event.target.value.toUpperCase();
                    setHexInput(next);
                    setError(null);
                    setBaseHex(next);
                  }}
                  className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border bg-transparent p-1"
                  aria-label="使用颜色选择器选择基础色"
                />
                <Button variant="secondary" icon={Shuffle} onClick={applyRandom}>
                  随机
                </Button>
              </div>
            </Field>

            <div>
              <p className="label">配色方案</p>
              <div className="flex flex-wrap gap-2">
                {SCHEMES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSchemeKey(item.key)}
                    className={cn('chip', item.key === schemeKey && 'chip-active')}
                    aria-pressed={item.key === schemeKey}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm muted">{scheme.description}</p>
            </div>
          </div>

          <div className="shrink-0 self-center" aria-hidden="true">
            <div
              className="relative size-32 rounded-full shadow-inner"
              style={{
                background:
                  'conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
              }}
            >
              <div className="absolute inset-3 rounded-full bg-[var(--card-bg)]" />
              {hues.map((hue) => {
                const radians = (hue * Math.PI) / 180;
                const left = 50 + 45 * Math.sin(radians);
                const top = 50 - 45 * Math.cos(radians);
                const target = palette.find((color) => color.value.h === hue);
                return (
                  <span
                    key={hue}
                    className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                    style={{ left: `${left}%`, top: `${top}%`, backgroundColor: target?.hex ?? baseHex }}
                    title={target ? `${target.hex} · ${target.hsl}` : undefined}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-center text-[11px] subtle">色相环位置</p>
          </div>
        </div>
      </Panel>

      {error ? <Alert tone="warning">基础色暂时无效，下方仍显示上一次有效颜色的配色。</Alert> : null}

      <Panel title={`${scheme.name}色板`} description={`共 ${palette.length} 个颜色，点击任意色块复制 HEX。`}>
        <div
          className="h-10 w-full rounded-full border"
          style={{ backgroundImage: `linear-gradient(90deg, ${palette.map((color) => color.hex).join(', ')})` }}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {palette.map((color, index) => (
            <button
              key={`${color.hex}-${index}`}
              type="button"
              onClick={() => void copyHex(color.hex)}
              title={`${color.rgb} · ${color.hsl}（点击复制）`}
              className="group relative h-28 overflow-hidden rounded-xl border text-left transition-transform hover:-translate-y-0.5"
            >
              <span className="absolute inset-0" style={{ backgroundColor: color.hex }} />
              <span className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 rounded-lg bg-black/45 px-2 py-1 font-mono text-[11px] text-white backdrop-blur-sm">
                {color.hex}
                <Copy className="size-3 opacity-70 transition-opacity group-hover:opacity-100" />
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton text={palette.map((color) => color.hex).join('\n')} label="复制全部 HEX" />
          <CopyButton text={cssCode} label="复制 CSS 变量" />
          <CopyButton text={jsonCode} label="复制 JSON" />
        </div>
        <div className="mt-3">
          <Hint>色板基于 HSL 色相旋转与明度调整生成，与基础色保持一致的饱和度倾向。</Hint>
        </div>
      </Panel>

      <ToolSplit>
        <Panel
          title="CSS 变量"
          description="可直接粘贴到全局样式表"
          footer={
            <div className="flex flex-wrap gap-2">
              <CopyButton text={cssCode} label="复制 CSS" />
              <Button variant="secondary" icon={Download} onClick={exportCss}>
                下载 .css
              </Button>
            </div>
          }
        >
          <pre className="max-h-64 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6">
            {cssCode}
          </pre>
        </Panel>

        <Panel
          title="JSON"
          description="包含 HEX / RGB / HSL 三种格式"
          footer={
            <div className="flex flex-wrap gap-2">
              <CopyButton text={jsonCode} label="复制 JSON" />
              <Button variant="secondary" icon={Download} onClick={exportJson}>
                下载 .json
              </Button>
            </div>
          }
        >
          <pre className="max-h-64 overflow-auto rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-xs leading-6">
            {jsonCode}
          </pre>
        </Panel>
      </ToolSplit>
    </div>
  );
}
