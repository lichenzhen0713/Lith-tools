import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Crop,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  Maximize2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { Actions, Field, Hint, KeyValue, Panel, Select, ToolSplit } from './kit';
import { Alert, Button, EmptyState } from '../components/ui';
import { clamp, cn, download, formatBytes } from '../lib/utils';
import { useToast } from '../lib/toast';

type Mime = 'image/png' | 'image/jpeg';
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface Source {
  el: HTMLImageElement;
  width: number;
  height: number;
  name: string;
  size: number;
  type: string;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface StageMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  minW: number;
  minH: number;
}

type DragState =
  | { kind: 'move'; start: Point; from: Rect }
  | { kind: 'create'; start: Point; previous: Rect }
  | { kind: 'resize'; handle: Handle; from: Rect };

const MAX_FILE = 40 * 1024 * 1024;
const MAX_DIM = 8000;
const MAX_PIXELS = 40_000_000;
const PREVIEW_MAX = 1600;
const MIN_CROP_PX = 16;
const EXT: Record<Mime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

const HANDLES: { id: Handle; label: string; style: CSSProperties; cursor: string }[] = [
  { id: 'nw', label: '左上', style: { left: '0%', top: '0%' }, cursor: 'cursor-nwse-resize' },
  { id: 'n', label: '上边', style: { left: '50%', top: '0%' }, cursor: 'cursor-ns-resize' },
  { id: 'ne', label: '右上', style: { left: '100%', top: '0%' }, cursor: 'cursor-nesw-resize' },
  { id: 'e', label: '右边', style: { left: '100%', top: '50%' }, cursor: 'cursor-ew-resize' },
  { id: 'se', label: '右下', style: { left: '100%', top: '100%' }, cursor: 'cursor-nwse-resize' },
  { id: 's', label: '下边', style: { left: '50%', top: '100%' }, cursor: 'cursor-ns-resize' },
  { id: 'sw', label: '左下', style: { left: '0%', top: '100%' }, cursor: 'cursor-nesw-resize' },
  { id: 'w', label: '左边', style: { left: '0%', top: '50%' }, cursor: 'cursor-ew-resize' },
];

/** Clamp a normalised crop rectangle into the unit square while keeping a minimum size. */
function clampRect(rect: Rect, minW: number, minH: number): Rect {
  const w = clamp(rect.w, Math.min(minW, 1), 1);
  const h = clamp(rect.h, Math.min(minH, 1), 1);
  return { w, h, x: clamp(rect.x, 0, 1 - w), y: clamp(rect.y, 0, 1 - h) };
}

function rectFromPoints(a: Point, b: Point, minW: number, minH: number): Rect {
  return clampRect(
    { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) },
    minW,
    minH,
  );
}

function resizeRect(from: Rect, handle: Handle, point: Point, minW: number, minH: number): Rect {
  let left = from.x;
  let top = from.y;
  let right = from.x + from.w;
  let bottom = from.y + from.h;
  if (handle.includes('w')) left = clamp(Math.min(point.x, right - Math.min(minW, 1)), 0, 1);
  if (handle.includes('e')) right = clamp(Math.max(point.x, left + minW), 0, 1);
  if (handle.includes('n')) top = clamp(Math.min(point.y, bottom - Math.min(minH, 1)), 0, 1);
  if (handle.includes('s')) bottom = clamp(Math.max(point.y, top + minH), 0, 1);
  return clampRect({ x: left, y: top, w: right - left, h: bottom - top }, minW, minH);
}

let filterSupport: boolean | null = null;

/** Feature-detect `CanvasRenderingContext2D.filter` (older Safari ignores it silently). */
function supportsCanvasFilter(): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const context = probe.getContext('2d');
    if (!context) {
      filterSupport = false;
      return false;
    }
    context.filter = 'brightness(0%)';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    filterSupport = data[0] < 40 && data[1] < 40 && data[2] < 40;
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

/** Manual brightness / contrast / saturation fallback for browsers without canvas filters. */
function applyPixelFilters(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number,
  contrast: number,
  saturation: number,
): void {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const b = brightness / 100;
  const c = contrast / 100;
  const s = saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * b;
    let g = data[i + 1] * b;
    let bl = data[i + 2] * b;
    r = (r - 128) * c + 128;
    g = (g - 128) * c + 128;
    bl = (bl - 128) * c + 128;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    data[i] = clamp(l + (r - l) * s, 0, 255);
    data[i + 1] = clamp(l + (g - l) * s, 0, 255);
    data[i + 2] = clamp(l + (bl - l) * s, 0, 255);
  }
  context.putImageData(image, 0, 0);
}

export default function ImageEditorTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const movedRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [mime, setMime] = useState<Mime>('image/png');
  const [quality, setQuality] = useState(0.92);
  const [oriented, setOriented] = useState<{ width: number; height: number } | null>(null);

  const filterCss = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

  /* ------------------------------------------------------------------ load file */
  useEffect(() => {
    if (!file) {
      setSource(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        setLoadError('无法识别图片尺寸，请换一张图片。');
        return;
      }
      if (image.naturalWidth > MAX_DIM || image.naturalHeight > MAX_DIM) {
        setLoadError(
          `图片边长 ${Math.max(image.naturalWidth, image.naturalHeight)} px 超过 ${MAX_DIM} px 上限，请先缩小图片。`,
        );
        return;
      }
      if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) {
        setLoadError('图片像素总量过大（超过 4000 万像素），请先缩小图片再编辑。');
        return;
      }
      setSource({
        el: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    };
    image.onerror = () => {
      if (cancelled) return;
      setSource(null);
      setLoadError('图片解码失败，请确认文件为有效的 PNG / JPEG / WebP 图片。');
    };
    image.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      setSourceUrl(null);
    };
  }, [file]);

  /* ------------------------------------------------------------ reset on new image */
  useEffect(() => {
    if (!source) return;
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    setMime(source.type === 'image/png' ? 'image/png' : 'image/jpeg');
    setExportError(null);
  }, [source]);

  /* ----------------------------------------------------- build the oriented bitmap */
  useEffect(() => {
    if (!source) {
      workRef.current = null;
      setOriented(null);
      return;
    }
    const rotated = rotation % 180 !== 0;
    const width = rotated ? source.height : source.width;
    const height = rotated ? source.width : source.height;

    const canvas = workRef.current ?? document.createElement('canvas');
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setRenderError('当前浏览器不支持 Canvas 2D，无法编辑图片。');
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    try {
      context.drawImage(source.el, -source.width / 2, -source.height / 2, source.width, source.height);
    } catch {
      context.restore();
      setRenderError('绘制图片失败，图片可能过大，请更换较小的图片。');
      return;
    }
    context.restore();
    workRef.current = canvas;
    setOriented({ width, height });
  }, [source, rotation, flipH, flipV]);

  /* -------------------------------------------------------------- draw the preview */
  useEffect(() => {
    const canvas = previewRef.current;
    const work = workRef.current;
    if (!canvas || !work || !oriented) return;
    const scale = Math.min(1, PREVIEW_MAX / Math.max(work.width, work.height));
    const width = Math.max(1, Math.round(work.width * scale));
    const height = Math.max(1, Math.round(work.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setRenderError('当前浏览器不支持 Canvas 2D，无法预览图片。');
      return;
    }
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    try {
      context.drawImage(work, 0, 0, width, height);
    } catch {
      setRenderError('预览绘制失败，请更换图片重试。');
      return;
    }
    setRenderError(null);
  }, [oriented]);

  /* ------------------------------------------------------------------ crop helpers */
  const readStage = (): StageMetrics | null => {
    const element = overlayRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      minW: MIN_CROP_PX / rect.width,
      minH: MIN_CROP_PX / rect.height,
    };
  };

  const readPoint = (event: ReactPointerEvent<HTMLElement>, stage: StageMetrics): Point => ({
    x: clamp((event.clientX - stage.left) / stage.width, 0, 1),
    y: clamp((event.clientY - stage.top) / stage.height, 0, 1),
  });

  const handleOverlayPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!source) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const stage = readStage();
    if (!stage) return;
    event.preventDefault();
    const point = readPoint(event, stage);
    const inside =
      point.x > crop.x && point.x < crop.x + crop.w && point.y > crop.y && point.y < crop.y + crop.h;
    dragRef.current = inside ? { kind: 'move', start: point, from: crop } : { kind: 'create', start: point, previous: crop };
    movedRef.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture may fail if the pointer was already released */
    }
  };

  const handleOverlayPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const stage = readStage();
    if (!stage) return;
    const point = readPoint(event, stage);
    movedRef.current = true;
    if (drag.kind === 'move') {
      setCrop(
        clampRect(
          {
            x: clamp(drag.from.x + point.x - drag.start.x, 0, 1 - drag.from.w),
            y: clamp(drag.from.y + point.y - drag.start.y, 0, 1 - drag.from.h),
            w: drag.from.w,
            h: drag.from.h,
          },
          stage.minW,
          stage.minH,
        ),
      );
    } else if (drag.kind === 'create') {
      setCrop(rectFromPoints(drag.start, point, stage.minW, stage.minH));
    } else {
      setCrop(resizeRect(drag.from, drag.handle, point, stage.minW, stage.minH));
    }
  };

  const handleOverlayPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'create' && !movedRef.current) setCrop(drag.previous);
    dragRef.current = null;
    movedRef.current = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>, handle: Handle) => {
    if (!source) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!readStage()) return;
    dragRef.current = { kind: 'resize', handle, from: crop };
    movedRef.current = false;
    try {
      overlayRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleRotate = () => {
    setCrop((previous) => ({ x: 1 - previous.y - previous.h, y: previous.x, w: previous.h, h: previous.w }));
    setRotation((previous) => (previous + 90) % 360);
  };

  const handleFlipHorizontal = () => {
    setCrop((previous) => ({ ...previous, x: 1 - previous.x - previous.w }));
    setFlipH((previous) => !previous);
  };

  const handleFlipVertical = () => {
    setCrop((previous) => ({ ...previous, y: 1 - previous.y - previous.h }));
    setFlipV((previous) => !previous);
  };

  /* --------------------------------------------------------------------- actions */
  const acceptFile = (next: File | null) => {
    setLoadError(null);
    setRenderError(null);
    setExportError(null);
    if (!next) return;
    if (!next.type.startsWith('image/')) {
      setLoadError('请选择图片文件（PNG、JPEG、WebP、GIF 等）。');
      return;
    }
    if (next.size > MAX_FILE) {
      setLoadError(`图片体积 ${formatBytes(next.size)} 超过 ${formatBytes(MAX_FILE)} 上限。`);
      return;
    }
    setFile(next);
  };

  const resetEdits = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    setExportError(null);
    toast.info('已重置旋转、翻转、滤镜与裁剪框');
  };

  const clearAll = () => {
    setFile(null);
    setSource(null);
    setLoadError(null);
    setRenderError(null);
    setExportError(null);
    setOriented(null);
    workRef.current = null;
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    if (inputRef.current) inputRef.current.value = '';
  };

  const baseName = source
    ? source.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-') || 'image'
    : 'image';
  const fileName = `${baseName}-edited.${EXT[mime]}`;

  const cropPixels =
    oriented === null
      ? null
      : {
          width: Math.max(1, Math.round(crop.w * oriented.width)),
          height: Math.max(1, Math.round(crop.h * oriented.height)),
        };

  const handleDownload = () => {
    const work = workRef.current;
    if (!work || !source || !oriented) return;
    const sx = clamp(Math.round(crop.x * work.width), 0, work.width - 1);
    const sy = clamp(Math.round(crop.y * work.height), 0, work.height - 1);
    const sw = Math.max(1, Math.min(Math.round(crop.w * work.width), work.width - sx));
    const sh = Math.max(1, Math.min(Math.round(crop.h * work.height), work.height - sy));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext('2d');
    if (!context) {
      setExportError('当前浏览器不支持 Canvas 2D，无法导出图片。');
      return;
    }
    if (mime === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, sw, sh);
    }

    const nativeFilter = supportsCanvasFilter();
    if (nativeFilter) context.filter = filterCss;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    try {
      context.drawImage(work, sx, sy, sw, sh, 0, 0, sw, sh);
      if (!nativeFilter) applyPixelFilters(context, sw, sh, brightness, contrast, saturation);
    } catch {
      setExportError('导出失败，图片可能过大，请缩小图片后重试。');
      return;
    }

    setExportError(null);
    const targetMime: Mime = mime;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setExportError('编码失败，请改用 PNG 格式后重试。');
          return;
        }
        download(blob, fileName);
        toast.success('已开始下载');
      },
      targetMime,
      targetMime === 'image/jpeg' ? quality : undefined,
    );
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="上传与调整" description="裁剪、旋转、翻转与滤镜全部在浏览器本地完成，图片不会上传。">
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />

            {source ? (
              <div className="flex items-center gap-3 rounded-xl border p-3">
                {sourceUrl ? (
                  <img src={sourceUrl} alt="原图缩略图" className="size-14 shrink-0 rounded-lg border object-cover" />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-[var(--hover-bg)]">
                    <ImageIcon className="size-5 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{source.name}</p>
                  <p className="text-xs subtle">
                    {source.width} × {source.height} px · {formatBytes(source.size)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" icon={Upload} onClick={() => inputRef.current?.click()}>
                    更换
                  </Button>
                  <Button variant="ghost" size="sm" icon={X} onClick={clearAll} aria-label="移除图片">
                    移除
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  'rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
                  draggingFile ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10' : 'bg-[var(--hover-bg)]',
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDraggingFile(true);
                }}
                onDragLeave={() => setDraggingFile(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDraggingFile(false);
                  acceptFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Upload className="size-5" />
                </div>
                <p className="text-sm muted">拖拽图片到此处，或</p>
                <Button className="mt-2" size="sm" icon={ImageIcon} onClick={() => inputRef.current?.click()}>
                  选择图片
                </Button>
                <p className="mt-3 text-xs subtle">支持 PNG / JPEG / WebP / GIF，最大 40 MB，边长不超过 8000 px</p>
              </div>
            )}

            {loadError ? <Alert tone="error">{loadError}</Alert> : null}

            <div>
              <p className="label">旋转与翻转</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="secondary" icon={RotateCw} disabled={!source} onClick={handleRotate}>
                  旋转 90°
                </Button>
                <Button
                  variant="secondary"
                  icon={FlipHorizontal2}
                  disabled={!source}
                  onClick={handleFlipHorizontal}
                  className={cn(flipH && 'border-indigo-400 text-indigo-600 dark:text-indigo-300')}
                >
                  水平翻转
                </Button>
                <Button
                  variant="secondary"
                  icon={FlipVertical2}
                  disabled={!source}
                  onClick={handleFlipVertical}
                  className={cn(flipV && 'border-indigo-400 text-indigo-600 dark:text-indigo-300')}
                >
                  垂直翻转
                </Button>
              </div>
              <p className="mt-1.5 text-xs subtle">旋转与翻转会同步变换裁剪框，可连续点击累积操作。</p>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
                <SlidersHorizontal className="size-4" /> 颜色调整
              </p>
              <div className="space-y-3">
                <Field label="亮度" htmlFor="editor-brightness" hint={`${brightness}%`}>
                  <input
                    id="editor-brightness"
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={brightness}
                    disabled={!source}
                    onChange={(event) => setBrightness(Number(event.target.value))}
                    className="w-full accent-indigo-600 disabled:opacity-50"
                  />
                </Field>
                <Field label="对比度" htmlFor="editor-contrast" hint={`${contrast}%`}>
                  <input
                    id="editor-contrast"
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={contrast}
                    disabled={!source}
                    onChange={(event) => setContrast(Number(event.target.value))}
                    className="w-full accent-indigo-600 disabled:opacity-50"
                  />
                </Field>
                <Field label="饱和度" htmlFor="editor-saturation" hint={`${saturation}%`}>
                  <input
                    id="editor-saturation"
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={saturation}
                    disabled={!source}
                    onChange={(event) => setSaturation(Number(event.target.value))}
                    className="w-full accent-indigo-600 disabled:opacity-50"
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="输出格式" htmlFor="editor-format">
                <Select id="editor-format" value={mime} onChange={(event) => setMime(event.target.value as Mime)}>
                  <option value="image/png">PNG（无损）</option>
                  <option value="image/jpeg">JPEG（体积更小）</option>
                </Select>
              </Field>
              {mime === 'image/jpeg' ? (
                <Field label="JPEG 质量" htmlFor="editor-quality" hint={`${Math.round(quality * 100)}%`}>
                  <input
                    id="editor-quality"
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.01}
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </Field>
              ) : (
                <div className="flex items-end pb-1">
                  <Hint>PNG 保留透明区域，不提供质量选项。</Hint>
                </div>
              )}
            </div>

            <Hint>
              预览使用 CSS 滤镜实时显示；导出时会用 Canvas 滤镜（不支持时自动逐像素处理）烘焙到结果图片，裁剪与滤镜可自由组合。
            </Hint>
          </div>
        </Panel>

        <Panel title="裁剪与导出" description="拖动裁剪框移动位置，拖动四角或四边手柄调整大小。">
          {!source ? (
            <EmptyState
              icon={Crop}
              title="还没有选择图片"
              description="上传图片后即可拖拽裁剪、旋转翻转、调整亮度对比度与饱和度，并下载 PNG / JPEG。"
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border bg-[var(--hover-bg)] p-3">
                <div className="relative w-full">
                  <canvas
                    ref={previewRef}
                    role="img"
                    aria-label="图片编辑预览与裁剪框"
                    className="block h-auto w-full rounded-lg"
                    style={{ filter: filterCss }}
                  />
                  <div
                    ref={overlayRef}
                    className="absolute inset-0 touch-none select-none"
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={handleOverlayPointerDown}
                    onPointerMove={handleOverlayPointerMove}
                    onPointerUp={handleOverlayPointerUp}
                    onPointerCancel={handleOverlayPointerUp}
                  >
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 bg-slate-950/45"
                      style={{ height: `${crop.y * 100}%` }}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-950/45"
                      style={{ height: `${Math.max(0, 1 - crop.y - crop.h) * 100}%` }}
                    />
                    <div
                      className="pointer-events-none absolute left-0 bg-slate-950/45"
                      style={{
                        top: `${crop.y * 100}%`,
                        height: `${crop.h * 100}%`,
                        width: `${crop.x * 100}%`,
                      }}
                    />
                    <div
                      className="pointer-events-none absolute right-0 bg-slate-950/45"
                      style={{
                        top: `${crop.y * 100}%`,
                        height: `${crop.h * 100}%`,
                        width: `${Math.max(0, 1 - crop.x - crop.w) * 100}%`,
                      }}
                    />

                    <div
                      className="absolute cursor-move border-2 border-white/90 ring-1 ring-slate-950/40"
                      style={{
                        left: `${crop.x * 100}%`,
                        top: `${crop.y * 100}%`,
                        width: `${crop.w * 100}%`,
                        height: `${crop.h * 100}%`,
                      }}
                    >
                      {HANDLES.map((handle) => (
                        <div
                          key={handle.id}
                          aria-label={`缩放手柄（${handle.label}）`}
                          onPointerDown={(event) => handleResizeStart(event, handle.id)}
                          className={cn(
                            'absolute size-4 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-indigo-500 bg-white shadow-md',
                            handle.cursor,
                          )}
                          style={handle.style}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" icon={Maximize2} onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}>
                  选择整张图片
                </Button>
                <span className="text-xs subtle">触摸屏可直接拖动裁剪框与手柄</span>
              </div>

              {renderError ? <Alert tone="error">{renderError}</Alert> : null}
              {exportError ? <Alert tone="error">{exportError}</Alert> : null}

              <KeyValue
                items={[
                  {
                    label: '方向',
                    value: `${rotation}°${flipH ? ' · 水平翻转' : ''}${flipV ? ' · 垂直翻转' : ''}`,
                  },
                  { label: '滤镜', value: `亮度 ${brightness}% · 对比度 ${contrast}% · 饱和度 ${saturation}%` },
                  {
                    label: '裁剪框',
                    value: `${Math.round(crop.x * 100)}% / ${Math.round(crop.y * 100)}% · ${Math.round(crop.w * 100)}% × ${Math.round(
                      crop.h * 100,
                    )}%`,
                  },
                  {
                    label: '导出尺寸',
                    value: cropPixels ? `${cropPixels.width} × ${cropPixels.height} px` : '—',
                  },
                  { label: '输出格式', value: mime === 'image/png' ? 'PNG' : `JPEG（质量 ${Math.round(quality * 100)}%）` },
                  { label: '文件名', value: fileName },
                ]}
              />

              <Actions className="mt-0">
                <Button icon={Download} onClick={handleDownload} disabled={Boolean(renderError)}>
                  下载 {mime === 'image/png' ? 'PNG' : 'JPEG'}
                </Button>
                <Button variant="secondary" icon={RotateCcw} onClick={resetEdits}>
                  重置编辑
                </Button>
                <Button variant="ghost" icon={X} onClick={clearAll}>
                  清空图片
                </Button>
              </Actions>
            </div>
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
