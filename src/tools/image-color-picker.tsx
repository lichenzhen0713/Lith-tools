import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ImagePlus, MousePointerClick, Trash2, Upload, ZoomIn } from 'lucide-react';
import { Hint, Panel, Result } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState } from '../components/ui';
import { cn, copyText, formatBytes, readFileAsDataUrl } from '../lib/utils';
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

interface ColorValue {
  hex: string;
  rgb: RGB;
  hsl: HSL;
}

interface ImageInfo {
  name: string;
  bytes: number;
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_CANVAS_DIM = 1600;
const ZOOM_SIZE = 130;
const ZOOM_CELLS = 13;

function toByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function rgbToHex({ r, g, b }: RGB): string {
  const hex = ((1 << 24) | (toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).slice(1).toUpperCase();
  return `#${hex}`;
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) };
  }
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return {
    h: Math.round((hue / 6) * 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hslText({ h, s, l }: HSL): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function fromRgb(rgb: RGB): ColorValue {
  return { hex: rgbToHex(rgb), rgb, hsl: rgbToHsl(rgb) };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = src;
  });
}

/** Image pixel picker: upload / drop a picture, hover for a magnifier, click to lock a color. */
export default function ImageColorPickerTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  const [image, setImage] = useState<ImageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<(ColorValue & { x: number; y: number }) | null>(null);
  const [picked, setPicked] = useState<ColorValue | null>(null);
  const [history, setHistory] = useState<ColorValue[]>([]);
  const [magnifierVisible, setMagnifierVisible] = useState(false);

  const reset = useCallback(() => {
    imageElementRef.current = null;
    setImage(null);
    setPicked(null);
    setHover(null);
    setHistory([]);
    setError(null);
    setMagnifierVisible(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('请选择图片文件（PNG / JPEG / GIF / WebP / SVG 等）。');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`图片体积 ${formatBytes(file.size)} 超出限制，请选择小于 ${formatBytes(MAX_FILE_SIZE)} 的图片。`);
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const src = await readFileAsDataUrl(file);
        const element = await loadImageElement(src);
        const naturalWidth = element.naturalWidth || element.width;
        const naturalHeight = element.naturalHeight || element.height;
        if (!naturalWidth || !naturalHeight) throw new Error('图片尺寸无效');
        const scale = Math.min(1, MAX_CANVAS_DIM / Math.max(naturalWidth, naturalHeight));
        imageElementRef.current = element;
        setImage({
          name: file.name || '未命名图片',
          bytes: file.size,
          naturalWidth,
          naturalHeight,
          width: Math.max(1, Math.round(naturalWidth * scale)),
          height: Math.max(1, Math.round(naturalHeight * scale)),
        });
        setPicked(null);
        setHover(null);
        setHistory([]);
        setMagnifierVisible(false);
      } catch {
        setError('图片读取失败，请换一张图片重试（部分损坏或不受支持的文件可能无法解码）。');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /* Paint the loaded image onto the working canvas (scaled down for very large photos). */
  useEffect(() => {
    if (!image) return;
    const canvas = canvasRef.current;
    const element = imageElementRef.current;
    if (!canvas || !element) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.clearRect(0, 0, image.width, image.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(element, 0, 0, image.width, image.height);
  }, [image]);

  const sampleAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    try {
      const data = context.getImageData(x, y, 1, 1).data;
      return { x, y, rgb: { r: data[0], g: data[1], b: data[2] } };
    } catch {
      setError('无法读取该图片的像素数据，请换一张图片（跨域引用的 SVG 可能被浏览器拦截）。');
      return null;
    }
  }, []);

  const updateMagnifier = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>, sample: { x: number; y: number } | null) => {
      const canvas = canvasRef.current;
      const container = magnifierRef.current;
      const zoomCanvas = zoomRef.current;
      if (!canvas || !container || !zoomCanvas || !sample) return;
      const rect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const labelHeight = 26;
      const width = container.offsetWidth || ZOOM_SIZE;
      const height = container.offsetHeight || ZOOM_SIZE + labelHeight;
      let left = offsetX + 18;
      let top = offsetY + 18;
      if (left + width > rect.width) left = Math.max(0, offsetX - width - 18);
      if (top + height > rect.height) top = Math.max(0, offsetY - height - 18);
      container.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;

      const span = Math.max(1, Math.min(ZOOM_CELLS, canvas.width, canvas.height));
      const half = Math.floor(span / 2);
      const sourceX = Math.min(Math.max(0, sample.x - half), canvas.width - span);
      const sourceY = Math.min(Math.max(0, sample.y - half), canvas.height - span);
      const context = zoomCanvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
      context.drawImage(canvas, sourceX, sourceY, span, span, 0, 0, zoomCanvas.width, zoomCanvas.height);

      const cell = zoomCanvas.width / span;
      context.strokeStyle = 'rgba(15, 23, 42, 0.16)';
      context.lineWidth = 1;
      for (let index = 1; index < span; index += 1) {
        context.beginPath();
        context.moveTo(index * cell, 0);
        context.lineTo(index * cell, zoomCanvas.height);
        context.stroke();
        context.beginPath();
        context.moveTo(0, index * cell);
        context.lineTo(zoomCanvas.width, index * cell);
        context.stroke();
      }
      const centerX = (sample.x - sourceX) * cell;
      const centerY = (sample.y - sourceY) * cell;
      const paint = (width2: number, color: string) => {
        context.strokeStyle = color;
        context.lineWidth = width2;
        context.strokeRect(centerX + width2 / 2, centerY + width2 / 2, cell - width2, cell - width2);
      };
      paint(3, '#ffffff');
      paint(1, 'rgba(15, 23, 42, 0.9)');
      context.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      context.lineWidth = 2;
      context.strokeRect(1, 1, zoomCanvas.width - 2, zoomCanvas.height - 2);
    },
    [],
  );

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const sample = sampleAt(event.clientX, event.clientY);
    if (!sample) {
      setHover(null);
      setMagnifierVisible(false);
      return;
    }
    const color = fromRgb(sample.rgb);
    setMagnifierVisible(true);
    setHover({ ...color, x: sample.x, y: sample.y });
    updateMagnifier(event, sample);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const sample = sampleAt(event.clientX, event.clientY);
    if (!sample) return;
    const color = fromRgb(sample.rgb);
    setHover({ ...color, x: sample.x, y: sample.y });
    setPicked(color);
    setHistory((previous) => [color, ...previous.filter((item) => item.hex !== color.hex)].slice(0, 12));
    toast.success(`已锁定 ${color.hex}`);
  };

  const handlePointerLeave = () => {
    setHover(null);
    setMagnifierVisible(false);
  };

  const copyColor = async (value: ColorValue) => {
    const ok = await copyText(`${value.hex}\n${`rgb(${value.rgb.r}, ${value.rgb.g}, ${value.rgb.b})`}\n${hslText(value.hsl)}`);
    if (ok) toast.success(`已复制 ${value.hex}`);
    else toast.error('复制失败，请手动选择文本');
  };

  return (
    <div className="space-y-4">
      <Panel title="选择图片" description="图片仅在浏览器内读取和取色，不会上传到服务器。">
        <div
          className={cn(
            'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragging
              ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10'
              : 'border-[var(--card-border)] bg-[var(--hover-bg)]',
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <ImagePlus className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">{image ? '更换图片' : '拖拽图片到这里，或点击下方按钮'}</p>
            <p className="mt-1 text-xs subtle">
              PNG / JPEG / GIF / WebP / SVG，单张不超过 {formatBytes(MAX_FILE_SIZE)}
            </p>
          </div>
          <label
            htmlFor="image-color-picker-input"
            className={cn('btn-secondary btn-sm cursor-pointer', loading && 'pointer-events-none opacity-50')}
          >
            <Upload className="size-4" />
            {loading ? '读取中…' : '选择图片'}
          </label>
          <input
            id="image-color-picker-input"
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = '';
            }}
          />
        </div>

        {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}

        {image ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="brand" className="max-w-64 truncate">
              {image.name}
            </Badge>
            <Badge>
              {image.naturalWidth} × {image.naturalHeight}
            </Badge>
            <Badge>{formatBytes(image.bytes)}</Badge>
            <Button variant="ghost" size="sm" icon={Trash2} className="ml-auto" onClick={reset}>
              清除图片
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="取色画布" description="移动鼠标（或按住拖动）查看像素颜色，点击即可锁定。">
        {image ? (
          <>
            <div className="relative select-none overflow-hidden rounded-xl border bg-[var(--hover-bg)] p-2">
              <canvas
                ref={canvasRef}
                className="mx-auto block max-h-[58vh] w-auto max-w-full cursor-crosshair touch-none rounded-lg"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
                onPointerCancel={handlePointerLeave}
                role="img"
                aria-label="取色画布，移动指针查看颜色，点击锁定颜色"
              />
              <div
                ref={magnifierRef}
                aria-hidden={!magnifierVisible}
                className={cn(
                  'pointer-events-none absolute top-0 left-0 z-10 w-[130px] overflow-hidden rounded-xl border border-white/50 bg-[var(--card-bg)] shadow-xl transition-opacity',
                  magnifierVisible ? 'opacity-100' : 'opacity-0',
                )}
              >
                <canvas ref={zoomRef} width={ZOOM_SIZE} height={ZOOM_SIZE} className="block" />
                <div className="flex items-center justify-between gap-2 px-2 py-1 font-mono text-[11px]">
                  <span className="font-semibold">{hover?.hex ?? ''}</span>
                  <span className="subtle">{hover ? `${hover.x},${hover.y}` : ''}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                <ZoomIn className="size-3.5" /> 放大镜 10×
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                <MousePointerClick className="size-3.5" /> 点击锁定颜色
              </span>
              {hover ? (
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <span className="size-4 rounded border" style={{ backgroundColor: hover.hex }} />
                  <span className="font-mono font-medium">{hover.hex}</span>
                  <span className="subtle">
                    rgb({hover.rgb.r}, {hover.rgb.g}, {hover.rgb.b})
                  </span>
                </span>
              ) : (
                <span className="ml-auto subtle">移动指针以取色</span>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            icon={ImagePlus}
            title="还没有图片"
            description="先在上方选择或拖入一张图片，画布加载后即可悬停取色。"
          />
        )}
      </Panel>

      {picked ? (
        <Panel title="取色结果" description="点击色块复制全部三种格式。">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border p-4 sm:w-40">
              <button
                type="button"
                className="size-24 rounded-2xl border shadow-inner"
                style={{ backgroundColor: picked.hex }}
                onClick={() => void copyColor(picked)}
                aria-label={`复制颜色 ${picked.hex}`}
              />
              <span className="font-mono text-sm font-semibold">{picked.hex}</span>
              <span className="text-[11px] subtle">点击色块复制</span>
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <Result label="HEX" value={picked.hex} mono />
              <Result label="RGB" value={`rgb(${picked.rgb.r}, ${picked.rgb.g}, ${picked.rgb.b})`} mono />
              <Result label="HSL" value={hslText(picked.hsl)} mono />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton
              text={`${picked.hex}\nrgb(${picked.rgb.r}, ${picked.rgb.g}, ${picked.rgb.b})\n${hslText(picked.hsl)}`}
              label="复制全部格式"
            />
          </div>
        </Panel>
      ) : null}

      {history.length > 0 ? (
        <Panel
          title="最近取色"
          description="最多保留 12 个不同的颜色，点击色块复制。"
          footer={
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setHistory([])}>
              清空历史
            </Button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {history.map((item) => (
              <button
                key={item.hex}
                type="button"
                onClick={() => void copyColor(item)}
                className="group flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors hover:bg-[var(--hover-bg)]"
                title={`复制 ${item.hex}`}
              >
                <span className="size-6 rounded-lg border" style={{ backgroundColor: item.hex }} />
                <span className="font-mono text-xs">{item.hex}</span>
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="使用说明">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm muted">
          <li>点击「选择图片」或直接把图片拖到上方虚线区域（支持触摸设备，从相册选择即可）。</li>
          <li>在画布上移动鼠标或按住拖动，放大镜会显示指针附近的像素与颜色值。</li>
          <li>点击画布锁定当前颜色，下方会给出 HEX、RGB、HSL 三种格式，可一键复制。</li>
          <li>「最近取色」保留最近的色值，点击可再次复制。</li>
          <li>所有处理都在本地完成，关闭页面后图片不会留在任何地方。</li>
        </ol>
        <div className="mt-4">
          <Hint>
            提示：超大图片会自动缩放到最长边 {MAX_CANVAS_DIM}px 后取色，颜色值仍然取自原图缩放后的像素；如需精确到原图，请使用原始尺寸图片。
          </Hint>
        </div>
      </Panel>
    </div>
  );
}
