import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Circle,
  Download,
  Image as ImageIcon,
  Minus,
  Pencil,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel } from './kit';
import { Alert, Badge, Button, EmptyState, Modal, Tabs } from '../components/ui';
import { clamp, cn, download, formatBytes } from '../lib/utils';
import { useToast } from '../lib/toast';

type Tool = 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';

interface Point {
  x: number;
  y: number;
}

interface Source {
  el: HTMLImageElement;
  width: number;
  height: number;
  name: string;
  size: number;
  type: string;
}

type Shape =
  | { kind: 'pen'; color: string; width: number; points: Point[] }
  | { kind: 'line' | 'arrow' | 'rect' | 'ellipse'; color: string; width: number; from: Point; to: Point }
  | { kind: 'text'; color: string; size: number; text: string; at: Point };

const MAX_FILE = 40 * 1024 * 1024;
const MAX_DIM = 8000;
const MAX_PIXELS = 40_000_000;
/** Annotation coordinates live on a canvas capped to this longest edge; export re-renders at full size. */
const BASE_MAX = 1800;
const FONT_STACK =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif';

const SWATCHES = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#0f172a'];

const TOOL_ITEMS: { value: Tool; label: ReactNode }[] = [
  {
    value: 'pen',
    label: (
      <span className="flex items-center gap-1.5">
        <Pencil className="size-3.5" /> 画笔
      </span>
    ),
  },
  {
    value: 'line',
    label: (
      <span className="flex items-center gap-1.5">
        <Minus className="size-3.5" /> 直线
      </span>
    ),
  },
  {
    value: 'arrow',
    label: (
      <span className="flex items-center gap-1.5">
        <ArrowUpRight className="size-3.5" /> 箭头
      </span>
    ),
  },
  {
    value: 'rect',
    label: (
      <span className="flex items-center gap-1.5">
        <Square className="size-3.5" /> 矩形
      </span>
    ),
  },
  {
    value: 'ellipse',
    label: (
      <span className="flex items-center gap-1.5">
        <Circle className="size-3.5" /> 椭圆
      </span>
    ),
  },
  {
    value: 'text',
    label: (
      <span className="flex items-center gap-1.5">
        <Type className="size-3.5" /> 文字
      </span>
    ),
  },
];

function drawShape(context: CanvasRenderingContext2D, shape: Shape): void {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = shape.color;
  context.fillStyle = shape.color;

  switch (shape.kind) {
    case 'pen': {
      const points = shape.points;
      if (points.length === 0) break;
      context.lineWidth = shape.width;
      if (points.length === 1) {
        context.beginPath();
        context.arc(points[0].x, points[0].y, Math.max(shape.width / 2, 0.5), 0, Math.PI * 2);
        context.fill();
        break;
      }
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        context.lineTo(points[index].x, points[index].y);
      }
      context.stroke();
      break;
    }
    case 'line': {
      context.lineWidth = shape.width;
      context.beginPath();
      context.moveTo(shape.from.x, shape.from.y);
      context.lineTo(shape.to.x, shape.to.y);
      context.stroke();
      break;
    }
    case 'arrow': {
      context.lineWidth = shape.width;
      const angle = Math.atan2(shape.to.y - shape.from.y, shape.to.x - shape.from.x);
      const head = Math.max(10, shape.width * 4);
      context.beginPath();
      context.moveTo(shape.from.x, shape.from.y);
      context.lineTo(
        shape.to.x - Math.cos(angle) * head * 0.9,
        shape.to.y - Math.sin(angle) * head * 0.9,
      );
      context.stroke();
      context.beginPath();
      context.moveTo(shape.to.x, shape.to.y);
      context.lineTo(
        shape.to.x - Math.cos(angle - Math.PI / 7) * head,
        shape.to.y - Math.sin(angle - Math.PI / 7) * head,
      );
      context.lineTo(
        shape.to.x - Math.cos(angle + Math.PI / 7) * head,
        shape.to.y - Math.sin(angle + Math.PI / 7) * head,
      );
      context.closePath();
      context.fill();
      break;
    }
    case 'rect': {
      context.lineWidth = shape.width;
      context.strokeRect(
        Math.min(shape.from.x, shape.to.x),
        Math.min(shape.from.y, shape.to.y),
        Math.abs(shape.to.x - shape.from.x),
        Math.abs(shape.to.y - shape.from.y),
      );
      break;
    }
    case 'ellipse': {
      context.lineWidth = shape.width;
      const radiusX = Math.abs(shape.to.x - shape.from.x) / 2;
      const radiusY = Math.abs(shape.to.y - shape.from.y) / 2;
      context.beginPath();
      context.ellipse(
        (shape.from.x + shape.to.x) / 2,
        (shape.from.y + shape.to.y) / 2,
        Math.max(radiusX, 0.5),
        Math.max(radiusY, 0.5),
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
      break;
    }
    case 'text': {
      context.font = `600 ${shape.size}px ${FONT_STACK}`;
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.shadowColor = 'rgba(15, 23, 42, 0.45)';
      context.shadowBlur = Math.max(2, shape.size * 0.12);
      context.fillText(shape.text, shape.at.x, shape.at.y);
      break;
    }
  }

  context.restore();
}

export default function ImageAnnotateTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [textSize, setTextSize] = useState(36);
  const [textValue, setTextValue] = useState('');
  const [textError, setTextError] = useState<string | null>(null);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

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
        setLoadError('图片像素总量过大（超过 4000 万像素），请先缩小图片再标注。');
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

  /* ------------------------------------------------------- reset when image changes */
  useEffect(() => {
    setShapes([]);
    setDraft(null);
    setTextError(null);
    setExportError(null);
    setRenderError(null);
  }, [source]);

  /* -------------------------------------------------- draw image + committed shapes */
  useEffect(() => {
    if (!source) {
      workRef.current = null;
      return;
    }
    const scale = Math.min(1, BASE_MAX / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = workRef.current ?? document.createElement('canvas');
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setRenderError('当前浏览器不支持 Canvas 2D，无法绘制标注。');
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    try {
      context.drawImage(source.el, 0, 0, width, height);
    } catch {
      setRenderError('绘制图片失败，图片可能过大，请更换较小的图片。');
      return;
    }
    for (const shape of shapes) drawShape(context, shape);
    workRef.current = canvas;
  }, [source, shapes]);

  /* ------------------------------------------------- copy to the visible canvas */
  useEffect(() => {
    const canvas = displayRef.current;
    const work = workRef.current;
    if (!canvas || !work) return;
    if (canvas.width !== work.width) canvas.width = work.width;
    if (canvas.height !== work.height) canvas.height = work.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(work, 0, 0);
    if (draft) drawShape(context, draft);
    setRenderError(null);
  }, [source, shapes, draft]);

  /* ------------------------------------------------------------------- pointer IO */
  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = displayRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!source) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = canvasPoint(event);
    if (!point) return;

    if (tool === 'text') {
      const value = textValue.trim();
      if (value === '') {
        setTextError('请先在下方输入文字内容，再点击图片放置');
        return;
      }
      setTextError(null);
      setExportError(null);
      setShapes((previous) => [...previous, { kind: 'text', color, size: textSize, text: value, at: point }]);
      return;
    }

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    setExportError(null);
    if (tool === 'pen') {
      setDraft({ kind: 'pen', color, width: strokeWidth, points: [point] });
    } else {
      setDraft({ kind: tool, color, width: strokeWidth, from: point, to: point });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = draft;
    if (!current) return;
    const point = canvasPoint(event);
    if (!point) return;
    if (current.kind === 'pen') {
      const last = current.points[current.points.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < Math.max(1.5, strokeWidth * 0.1)) return;
      setDraft({ ...current, points: [...current.points, point] });
    } else if (current.kind !== 'text') {
      setDraft({ ...current, to: point });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = draft;
    setDraft(null);
    if (current) {
      if (current.kind === 'pen') {
        if (current.points.length >= 2) setShapes((previous) => [...previous, current]);
      } else if (
        current.kind !== 'text' &&
        Math.hypot(current.to.x - current.from.x, current.to.y - current.from.y) >= 3
      ) {
        setShapes((previous) => [...previous, current]);
      }
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    setDraft(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
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

  const undo = () => {
    setShapes((previous) => previous.slice(0, -1));
    setDraft(null);
    setExportError(null);
  };

  const clearShapes = () => {
    setShapes([]);
    setDraft(null);
    setExportError(null);
    setClearOpen(false);
  };

  const clearAll = () => {
    setFile(null);
    setSource(null);
    setLoadError(null);
    setRenderError(null);
    setExportError(null);
    setShapes([]);
    setDraft(null);
    setTextValue('');
    setTextError(null);
    workRef.current = null;
    if (inputRef.current) inputRef.current.value = '';
  };

  const baseName = source
    ? source.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-') || 'image'
    : 'image';
  const fileName = `${baseName}-annotated.png`;

  const handleDownload = () => {
    if (!source) return;
    const work = workRef.current;
    if (!work) {
      setExportError('标注画布尚未准备好，请稍后重试。');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d');
    if (!context) {
      setExportError('当前浏览器不支持 Canvas 2D，无法导出图片。');
      return;
    }
    try {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source.el, 0, 0, source.width, source.height);
      context.scale(source.width / work.width, source.height / work.height);
      for (const shape of shapes) drawShape(context, shape);
    } catch {
      setExportError('导出失败，图片可能过大，请缩小后重试。');
      return;
    }
    setExportError(null);
    canvas.toBlob((blob) => {
      if (!blob) {
        setExportError('编码失败，请重试。');
        return;
      }
      download(blob, fileName);
      toast.success('已开始下载');
    }, 'image/png');
  };

  return (
    <div className="space-y-4">
      <Panel title="上传图片" description="图片只在浏览器本地读取与绘制，不会上传到服务器。">
        <div className="space-y-3">
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
        </div>
      </Panel>

      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            标注画布
            {shapes.length > 0 ? <Badge tone="brand">{shapes.length} 个标注</Badge> : null}
          </span>
        }
        description="选择工具后在图片上拖动绘制，支持鼠标与触摸。"
      >
        {!source ? (
          <EmptyState
            icon={Pencil}
            title="还没有选择图片"
            description="上传图片后即可用画笔、直线、箭头、矩形、椭圆与文字进行标注，并导出 PNG。"
          />
        ) : (
          <div className="space-y-4">
            <div>
              <p className="label">标注工具</p>
              <Tabs<Tool>
                items={TOOL_ITEMS}
                value={tool}
                onChange={(next) => {
                  setTool(next);
                  setTextError(null);
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="颜色" htmlFor="annotate-color" hint={color.toUpperCase()} className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="annotate-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
                    aria-label="选择标注颜色"
                  />
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`使用颜色 ${swatch}`}
                      aria-pressed={color.toLowerCase() === swatch}
                      onClick={() => setColor(swatch)}
                      className={cn(
                        'size-6 rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/20',
                        color.toLowerCase() === swatch && 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[var(--card-bg)]',
                      )}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </Field>

              {tool === 'text' ? (
                <Field label="文字大小" htmlFor="annotate-text-size" hint={`${textSize}px`}>
                  <input
                    id="annotate-text-size"
                    type="range"
                    min={12}
                    max={160}
                    step={1}
                    value={textSize}
                    onChange={(event) => setTextSize(Number(event.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </Field>
              ) : (
                <Field label="线条粗细" htmlFor="annotate-stroke" hint={`${strokeWidth}px`}>
                  <input
                    id="annotate-stroke"
                    type="range"
                    min={1}
                    max={32}
                    step={1}
                    value={strokeWidth}
                    onChange={(event) => setStrokeWidth(Number(event.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </Field>
              )}
            </div>

            {tool === 'text' ? (
              <Field
                label="文字内容"
                htmlFor="annotate-text"
                error={textError}
                hint="输入后点击图片上的位置即可放置，可重复添加多段文字"
                required
              >
                <Input
                  id="annotate-text"
                  value={textValue}
                  maxLength={80}
                  placeholder="例如：这里需要调整 / 重要"
                  onChange={(event) => {
                    setTextValue(event.target.value);
                    if (event.target.value.trim() !== '') setTextError(null);
                  }}
                  error={Boolean(textError)}
                />
              </Field>
            ) : null}

            <div className="flex min-h-40 items-center justify-center rounded-xl border bg-[var(--hover-bg)] p-3">
              <canvas
                ref={displayRef}
                role="img"
                aria-label="标注画布，使用所选工具在图片上绘制"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                className={cn(
                  'mx-auto block max-h-[70vh] w-auto max-w-full touch-none select-none rounded-lg',
                  tool === 'text' ? 'cursor-text' : 'cursor-crosshair',
                )}
              />
            </div>

            {renderError ? <Alert tone="error">{renderError}</Alert> : null}
            {exportError ? <Alert tone="error">{exportError}</Alert> : null}
            {tool === 'text' ? (
              <Alert tone="info">文字工具：先在「文字内容」里输入文字，再点击图片位置放置。</Alert>
            ) : null}

            <Actions className="mt-0">
              <Button variant="secondary" icon={Undo2} disabled={shapes.length === 0} onClick={undo}>
                撤销
              </Button>
              <Button
                variant="secondary"
                icon={Trash2}
                disabled={shapes.length === 0}
                onClick={() => setClearOpen(true)}
              >
                清空标注
              </Button>
              <Button icon={Download} onClick={handleDownload} disabled={Boolean(renderError)}>
                下载 PNG
              </Button>
            </Actions>

            <KeyValue
              items={[
                { label: '原图尺寸', value: `${source.width} × ${source.height} px` },
                { label: '标注数量', value: `${shapes.length} 个` },
                { label: '导出分辨率', value: `${source.width} × ${source.height} px（PNG）` },
                { label: '文件名', value: fileName },
              ]}
            />

            <Hint>
              标注以矢量数据实时重绘：撤销会逐步回退最近一次笔画，清空后可继续重新标注。导出按原图分辨率渲染，线条与文字不会被放大模糊。所有处理都在浏览器本地完成。
            </Hint>
          </div>
        )}
      </Panel>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="清空全部标注？"
        description="此操作会删除当前图片上的所有画笔、图形与文字标注，且无法撤销。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearOpen(false)}>
              取消
            </Button>
            <Button variant="danger" icon={Trash2} onClick={clearShapes}>
              清空标注
            </Button>
          </>
        }
      >
        <p className="text-sm muted">图片本身不会被删除，清空后可以在同一张图片上重新标注，或更换图片。</p>
      </Modal>
    </div>
  );
}
