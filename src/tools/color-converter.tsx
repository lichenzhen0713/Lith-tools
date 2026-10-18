import { useMemo, useState } from 'react';
import { RotateCcw, Shuffle } from 'lucide-react';
import { Field, Hint, KeyValue, Panel } from './kit';
import { Alert, Button, CopyButton, Input } from '../components/ui';
import { clamp } from '../lib/utils';

type Format = 'hex' | 'rgb' | 'hsl' | 'cmyk';
type Values = Record<Format, string>;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

type ParseResult = { ok: true; rgb: Rgb } | { ok: false; message: string };

const DEFAULT_RGB: Rgb = { r: 79, g: 70, b: 229 };

const FORMAT_META: { key: Format; label: string; placeholder: string; example: string }[] = [
  { key: 'hex', label: 'HEX', placeholder: '#4F46E5', example: '#4F46E5，也接受 #4F4' },
  { key: 'rgb', label: 'RGB', placeholder: 'rgb(79, 70, 229)', example: 'rgb(79, 70, 229)' },
  { key: 'hsl', label: 'HSL', placeholder: 'hsl(243, 76%, 59%)', example: 'hsl(243, 76%, 59%)' },
  { key: 'cmyk', label: 'CMYK', placeholder: 'cmyk(66, 69, 0, 10)', example: 'cmyk(66, 69, 0, 10)' },
];

function toByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function rgbToHex({ r, g, b }: Rgb): string {
  const hex = ((1 << 24) | (toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).slice(1).toUpperCase();
  return `#${hex}`;
}

function rgbText({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function hslText({ h, s, l }: Hsl): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function cmykText({ c, m, y, k }: Cmyk): string {
  return `cmyk(${Math.round(c)}%, ${Math.round(m)}%, ${Math.round(y)}%, ${Math.round(k)}%)`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
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

function hslToRgb({ h, s, l }: Hsl): Rgb {
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

function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const black = 1 - Math.max(red, green, blue);
  if (black >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - red - black) / (1 - black)) * 100,
    m: ((1 - green - black) / (1 - black)) * 100,
    y: ((1 - blue - black) / (1 - black)) * 100,
    k: black * 100,
  };
}

function cmykToRgb({ c, m, y, k }: Cmyk): Rgb {
  const cyan = clamp(c, 0, 100) / 100;
  const magenta = clamp(m, 0, 100) / 100;
  const yellow = clamp(y, 0, 100) / 100;
  const black = clamp(k, 0, 100) / 100;
  return {
    r: Math.round(255 * (1 - cyan) * (1 - black)),
    g: Math.round(255 * (1 - magenta) * (1 - black)),
    b: Math.round(255 * (1 - yellow) * (1 - black)),
  };
}

function formatValues(rgb: Rgb): Values {
  return {
    hex: rgbToHex(rgb),
    rgb: rgbText(rgb),
    hsl: hslText(rgbToHsl(rgb)),
    cmyk: cmykText(rgbToCmyk(rgb)),
  };
}

function splitParts(input: string): string[] {
  const body = input
    .trim()
    .replace(/^(?:rgba?|hsla?|cmyk)\s*\(/i, '')
    .replace(/\)\s*$/, '');
  return body
    .split(/[\s,/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseHex(input: string): ParseResult {
  const value = input.trim().replace(/^#/, '');
  if (!value) return { ok: false, message: '请输入 3 位或 6 位十六进制色值，例如 #4F46E5' };
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    return { ok: false, message: 'HEX 格式应为 #RGB 或 #RRGGBB（仅含 0-9 与 A-F）' };
  }
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
  return {
    ok: true,
    rgb: {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    },
  };
}

function parseRgb(input: string): ParseResult {
  if (!input.trim()) return { ok: false, message: '请输入 RGB 数值，例如 rgb(79, 70, 229)' };
  const parts = splitParts(input);
  if (parts.length < 3) return { ok: false, message: 'RGB 需要 3 个数值：红 / 绿 / 蓝' };
  if (parts.length > 3) return { ok: false, message: '暂不支持透明度，请只输入 R、G、B 三个数值' };
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((value) => !Number.isFinite(value))) {
    return { ok: false, message: 'RGB 数值必须是数字' };
  }
  if (numbers.some((value) => value < 0 || value > 255)) {
    return { ok: false, message: 'RGB 每个分量的取值范围是 0-255' };
  }
  return { ok: true, rgb: { r: numbers[0], g: numbers[1], b: numbers[2] } };
}

function parseHsl(input: string): ParseResult {
  if (!input.trim()) return { ok: false, message: '请输入 HSL 数值，例如 hsl(243, 76%, 59%)' };
  const parts = splitParts(input);
  if (parts.length !== 3) return { ok: false, message: 'HSL 需要 3 个数值：色相 / 饱和度 / 亮度' };
  const hue = Number(parts[0]);
  const saturation = Number(parts[1].replace('%', ''));
  const lightness = Number(parts[2].replace('%', ''));
  if (![hue, saturation, lightness].every((value) => Number.isFinite(value))) {
    return { ok: false, message: 'HSL 数值必须是数字，饱和度与亮度可以带 %' };
  }
  if (hue < 0 || hue > 360) return { ok: false, message: '色相 H 的取值范围是 0-360' };
  if (saturation < 0 || saturation > 100) return { ok: false, message: '饱和度 S 的取值范围是 0-100%' };
  if (lightness < 0 || lightness > 100) return { ok: false, message: '亮度 L 的取值范围是 0-100%' };
  return { ok: true, rgb: hslToRgb({ h: hue, s: saturation, l: lightness }) };
}

function parseCmyk(input: string): ParseResult {
  if (!input.trim()) return { ok: false, message: '请输入 CMYK 数值，例如 cmyk(66, 69, 0, 10)' };
  const parts = splitParts(input);
  if (parts.length !== 4) return { ok: false, message: 'CMYK 需要 4 个数值：青 / 品红 / 黄 / 黑' };
  const numbers = parts.map((part) => Number(part.replace('%', '')));
  if (numbers.some((value) => !Number.isFinite(value))) {
    return { ok: false, message: 'CMYK 数值必须是数字，可以带 %' };
  }
  if (numbers.some((value) => value < 0 || value > 100)) {
    return { ok: false, message: 'CMYK 每个分量的取值范围是 0-100%' };
  }
  return { ok: true, rgb: cmykToRgb({ c: numbers[0], m: numbers[1], y: numbers[2], k: numbers[3] }) };
}

function readableInk(hex: string): string {
  const parsed = parseHex(hex);
  if (!parsed.ok) return '#101828';
  const { r, g, b } = parsed.rgb;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? '#101828' : '#ffffff';
}

/** HEX / RGB / HSL / CMYK real-time converter with picker, preview and copy. */
export default function ColorConverterTool() {
  const [rgb, setRgb] = useState<Rgb>(DEFAULT_RGB);
  const [values, setValues] = useState<Values>(() => formatValues(DEFAULT_RGB));
  const [error, setError] = useState<{ format: Format; message: string } | null>(null);

  const canonical = useMemo(() => formatValues(rgb), [rgb]);
  const ink = useMemo(() => readableInk(canonical.hex), [canonical.hex]);

  const update = (format: Format, text: string) => {
    setValues((previous) => ({ ...previous, [format]: text }));
    const parsers: Record<Format, (input: string) => ParseResult> = {
      hex: parseHex,
      rgb: parseRgb,
      hsl: parseHsl,
      cmyk: parseCmyk,
    };
    const parsed = parsers[format](text);
    if (!parsed.ok) {
      setError({ format, message: parsed.message });
      return;
    }
    setError(null);
    setRgb(parsed.rgb);
    setValues({ ...formatValues(parsed.rgb), [format]: text });
  };

  const applyColor = (next: Rgb) => {
    setRgb(next);
    setValues(formatValues(next));
    setError(null);
  };

  const randomize = () => {
    applyColor({
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
    });
  };

  return (
    <div className="space-y-4">
      <Panel title="颜色预览" description="选择颜色或在下方任意格式中输入，其余格式会实时换算。">
        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 sm:p-5"
          style={{ backgroundColor: canonical.hex }}
        >
          <div className="min-w-0">
            <p className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: ink }}>
              {canonical.hex}
            </p>
            <p className="mt-1 font-mono text-xs sm:text-sm" style={{ color: ink, opacity: 0.82 }}>
              {canonical.rgb} · {canonical.hsl}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={canonical.hex.toLowerCase()}
              onChange={(event) => update('hex', event.target.value.toUpperCase())}
              className="h-10 w-14 cursor-pointer rounded-lg border border-white/40 bg-transparent p-1"
              aria-label="使用颜色选择器取色"
            />
            <Button variant="secondary" size="sm" icon={Shuffle} onClick={randomize}>
              随机颜色
            </Button>
            <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => applyColor(DEFAULT_RGB)}>
              重置
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="格式互转" description="任意一栏输入后即时同步其余格式，非法输入会保留上一次有效颜色。">
        {error ? (
          <Alert tone="error" className="mb-4">
            {FORMAT_META.find((item) => item.key === error.format)?.label} 输入无效：{error.message}。预览仍显示上一次有效颜色。
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {FORMAT_META.map((meta) => (
            <Field
              key={meta.key}
              label={meta.label}
              htmlFor={`color-converter-${meta.key}`}
              hint={`示例：${meta.example}`}
              error={error?.format === meta.key ? error.message : null}
            >
              <div className="flex gap-2">
                <Input
                  id={`color-converter-${meta.key}`}
                  value={values[meta.key]}
                  onChange={(event) => update(meta.key, event.target.value)}
                  placeholder={meta.placeholder}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={error?.format === meta.key}
                  error={error?.format === meta.key}
                  className="min-w-0 font-mono"
                />
                <div className="shrink-0">
                  <CopyButton text={canonical[meta.key]} label="复制" />
                </div>
              </div>
            </Field>
          ))}
        </div>
        <div className="mt-4">
          <Hint>
            换算使用标准 sRGB 公式，CMYK 为屏幕近似值（无 ICC 色彩配置文件），用于印刷前请以实际色卡为准。
          </Hint>
        </div>
      </Panel>

      <Panel title="格式说明">
        <KeyValue
          items={[
            { label: 'HEX', value: <span className="font-mono">#4F46E5 / #4F4（3 位缩写）</span> },
            { label: 'RGB', value: <span className="font-mono">rgb(79, 70, 229)，分量 0-255</span> },
            { label: 'HSL', value: <span className="font-mono">hsl(243, 76%, 59%)，色相 0-360</span> },
            { label: 'CMYK', value: <span className="font-mono">cmyk(66%, 69%, 0%, 10%)，分量 0-100%</span> },
          ]}
        />
        <div className="mt-4">
          <Hint>
            支持的写法：#RGB / #RRGGBB、rgb(79,70,229)、79, 70, 229（省略函数名）、hsl(243 76% 59%)、
            cmyk(66%, 69%, 0%, 10%)。透明度暂不支持。
          </Hint>
        </div>
      </Panel>
    </div>
  );
}
