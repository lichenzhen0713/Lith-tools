import { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, RotateCcw, Upload, X } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Select, ToolSplit } from './kit';
import { Alert, Button, EmptyState, Switch } from '../components/ui';
import { clamp, cn, download, formatBytes } from '../lib/utils';
import { useToast } from '../lib/toast';

type Mime = 'image/png' | 'image/jpeg';
type Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface Source {
  el: HTMLImageElement;
  width: number;
  height: number;
  name: string;
  size: number;
  type: string;
}

const MAX_FILE = 40 * 1024 * 1024;
const MAX_DIM = 10000;
const EXT: Record<Mime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const FONT_STACK =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif';

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'top-left', label: '左上' },
  { value: 'top-center', label: '上中' },
  { value: 'top-right', label: '右上' },
  { value: 'middle-left', label: '左中' },
  { value: 'center', label: '正中' },
  { value: 'middle-right', label: '右中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-center', label: '下中' },
  { value: 'bottom-right', label: '右下' },
];

const SWATCHES = ['#ffffff', '#0f172a', '#ef4444', '#f97316', '#22c55e', '#3b82f6', '#a855f7'];

const DEFAULTS = {
  text: 'Lith Tools',
  fontSize: '48',
  color: '#ffffff',
  opacity: 65,
  rotation: -20,
  position: 'bottom-right' as Position,
  tile: false,
  gap: 40,
};

export default function ImageWatermarkTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  const [text, setText] = useState(DEFAULTS.text);
  const [fontSize, setFontSize] = useState(DEFAULTS.fontSize);
  const [color, setColor] = useState(DEFAULTS.color);
  const [opacity, setOpacity] = useState(DEFAULTS.opacity);
  const [rotation, setRotation] = useState(DEFAULTS.rotation);
  const [position, setPosition] = useState<Position>(DEFAULTS.position);
  const [tile, setTile] = useState(DEFAULTS.tile);
  const [gap, setGap] = useState(DEFAULTS.gap);

  const [mime, setMime] = useState<Mime>('image/png');
  const [quality, setQuality] = useState(0.92);

  /* ---------------------------------------------------------------- validation */
  const trimmedText = text.trim();
  const fontSizeValue = Number(fontSize);
  const opacityValue = opacity;
  const rotationValue = rotation;
  const gapValue = gap;

  const textError = trimmedText === '' ? '请输入水印文字，留空无法生成水印' : null;
  const fontSizeError =
    fontSize.trim() === ''
      ? '请输入字号'
      : !Number.isFinite(fontSizeValue) || fontSizeValue < 8 || fontSizeValue > 400
        ? '字号请输入 8–400 之间的数字'
        : null;

  const canRenderWatermark =
    Boolean(source) && textError === null && fontSizeError === null && canvasError === null;

  const positionLabel = POSITIONS.find((item) => item.value === position)?.label ?? '右下';

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
          `图片尺寸 ${image.naturalWidth}×${image.naturalHeight} 超过 ${MAX_DIM} px 上限，请先缩小图片再添加水印。`,
        );
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

  /* --------------------------------------------------------------- draw preview */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    if (canvas.width !== source.width) canvas.width = source.width;
    if (canvas.height !== source.height) canvas.height = source.height;

    const context = canvas.getContext('2d');
    if (!context) {
      setCanvasError('当前浏览器不支持 Canvas 2D，无法生成水印预览。');
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (mime === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    try {
      context.drawImage(source.el, 0, 0, canvas.width, canvas.height);
    } catch {
      setCanvasError('绘制图片失败，请尝试更小的图片。');
      return;
    }
    setCanvasError(null);

    if (textError !== null || fontSizeError !== null) return;

    const width = canvas.width;
    const height = canvas.height;
    const angle = (rotationValue * Math.PI) / 180;

    context.save();
    context.globalAlpha = clamp(opacityValue / 100, 0.01, 1);
    context.fillStyle = color;
    context.font = `600 ${fontSizeValue}px ${FONT_STACK}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const metrics = context.measureText(trimmedText);
    const textWidth = Math.max(metrics.width, 1);
    const ascent = metrics.actualBoundingBoxAscent || fontSizeValue * 0.8;
    const descent = metrics.actualBoundingBoxDescent || fontSizeValue * 0.25;
    const textHeight = Math.max(ascent + descent, 1);

    if (tile) {
      /* Tile across the whole image: loop in a rotated frame centred on the image. */
      const baseStepX = Math.max(textWidth + Math.max(gapValue, 8), 12);
      const baseStepY = Math.max(textHeight + Math.max(gapValue * 0.8, 8), 12);
      const radius = Math.hypot(width, height) / 2 + Math.max(baseStepX, baseStepY);
      let stepX = baseStepX;
      let stepY = baseStepY;
      const estimate = ((radius * 2) / stepX) * ((radius * 2) / stepY);
      if (estimate > 4000) {
        const factor = Math.sqrt(estimate / 4000);
        stepX *= factor;
        stepY *= factor;
      }

      context.translate(width / 2, height / 2);
      context.rotate(angle);
      let row = 0;
      for (let y = -radius; y <= radius; y += stepY) {
        const offset = row % 2 === 0 ? 0 : stepX / 2;
        for (let x = -radius; x <= radius; x += stepX) {
          context.fillText(trimmedText, x + offset, y);
        }
        row += 1;
      }
    } else {
      const padding = clamp(Math.round(Math.min(width, height) * 0.03), 8, 160);
      /* Place the rotated bounding box so the text stays inside the image margins. */
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      const boxWidth = textWidth * cos + textHeight * sin;
      const boxHeight = textWidth * sin + textHeight * cos;
      const left = position.endsWith('left')
        ? padding
        : position.endsWith('right')
          ? width - padding - boxWidth
          : (width - boxWidth) / 2;
      const top = position.startsWith('top')
        ? padding
        : position.startsWith('bottom')
          ? height - padding - boxHeight
          : (height - boxHeight) / 2;

      context.translate(left + boxWidth / 2, top + boxHeight / 2);
      context.rotate(angle);
      context.fillText(trimmedText, 0, 0);
    }
    context.restore();
  }, [
    source,
    mime,
    trimmedText,
    fontSizeValue,
    color,
    opacityValue,
    rotationValue,
    position,
    tile,
    gapValue,
    textError,
    fontSizeError,
  ]);

  /* ------------------------------------------------------------------- actions */
  const acceptFile = (next: File | null) => {
    setLoadError(null);
    setCanvasError(null);
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

  const resetSettings = () => {
    setText(DEFAULTS.text);
    setFontSize(DEFAULTS.fontSize);
    setColor(DEFAULTS.color);
    setOpacity(DEFAULTS.opacity);
    setRotation(DEFAULTS.rotation);
    setPosition(DEFAULTS.position);
    setTile(DEFAULTS.tile);
    setGap(DEFAULTS.gap);
    setMime('image/png');
    setQuality(0.92);
    toast.info('已恢复默认水印设置');
  };

  const clearAll = () => {
    setFile(null);
    setSource(null);
    setLoadError(null);
    setCanvasError(null);
    resetSettings();
    if (inputRef.current) inputRef.current.value = '';
  };

  const baseName = source
    ? source.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-') || 'image'
    : 'image';
  const fileName = `${baseName}-watermark.${EXT[mime]}`;

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    if (!canRenderWatermark) {
      toast.error('请先填写有效的水印文字与字号');
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('导出失败，请重试或改用 PNG 格式');
          return;
        }
        download(blob, fileName);
        toast.success(`已开始下载 ${fileName}`);
      },
      mime,
      mime === 'image/jpeg' ? quality : undefined,
    );
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="上传与水印设置" description="图片只在浏览器本地处理，不会上传到服务器。">
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
                  dragging ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10' : 'bg-[var(--hover-bg)]',
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
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
                <p className="mt-3 text-xs subtle">支持 PNG / JPEG / WebP / GIF，最大 40 MB，边长不超过 10000 px</p>
              </div>
            )}

            {loadError ? <Alert tone="error">{loadError}</Alert> : null}

            <Field
              label="水印文字"
              htmlFor="watermark-text"
              error={textError}
              hint="支持中文、英文与常见符号，最长 80 个字符"
              required
            >
              <Input
                id="watermark-text"
                value={text}
                maxLength={80}
                placeholder="例如：Lith Tools / 仅供内部使用"
                onChange={(event) => setText(event.target.value)}
                error={Boolean(textError)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="字号 (px)"
                htmlFor="watermark-font-size"
                error={fontSizeError}
                hint="按原图像素计算，大图请相应调大"
              >
                <Input
                  id="watermark-font-size"
                  type="number"
                  inputMode="numeric"
                  min={8}
                  max={400}
                  step={1}
                  value={fontSize}
                  onChange={(event) => setFontSize(event.target.value)}
                  error={Boolean(fontSizeError)}
                />
              </Field>

              <Field label="不透明度" htmlFor="watermark-opacity" hint={`${opacityValue}%`}>
                <input
                  id="watermark-opacity"
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                  className="w-full accent-indigo-600"
                />
              </Field>

              <Field label="旋转角度" htmlFor="watermark-rotation" hint={`${rotationValue}°`}>
                <input
                  id="watermark-rotation"
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(event) => setRotation(Number(event.target.value))}
                  className="w-full accent-indigo-600"
                />
              </Field>

              <Field label="文字颜色" htmlFor="watermark-color" hint={color.toUpperCase()} className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="watermark-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
                    aria-label="选择水印颜色"
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
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="label mb-0">水印位置</p>
                <Switch checked={tile} onChange={setTile} label="平铺整张图片" />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className={cn('grid grid-cols-3 gap-1.5', tile && 'pointer-events-none opacity-40')}>
                  {POSITIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      disabled={tile}
                      aria-pressed={position === item.value}
                      aria-label={`水印放在${item.label}`}
                      title={item.label}
                      onClick={() => setPosition(item.value)}
                      className={cn(
                        'flex size-9 items-center justify-center rounded-lg border transition-colors',
                        position === item.value
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15'
                          : 'bg-[var(--card-bg)] hover:bg-[var(--hover-bg)]',
                      )}
                    >
                      <span
                        className={cn(
                          'rounded-full',
                          position === item.value
                            ? 'size-2 bg-indigo-600 dark:bg-indigo-400'
                            : 'size-1.5 bg-slate-400 dark:bg-slate-600',
                        )}
                      />
                    </button>
                  ))}
                </div>
                <p className="max-w-40 text-xs muted">
                  {tile ? '已开启平铺，水印会覆盖整张图片' : `当前：${positionLabel}`}
                </p>
              </div>
            </div>

            {tile ? (
              <Field label="平铺间距" htmlFor="watermark-gap" hint={`${gapValue}px（水印之间的空隙）`}>
                <input
                  id="watermark-gap"
                  type="range"
                  min={0}
                  max={200}
                  step={2}
                  value={gap}
                  onChange={(event) => setGap(Number(event.target.value))}
                  className="w-full accent-indigo-600"
                />
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="输出格式" htmlFor="watermark-format">
                <Select id="watermark-format" value={mime} onChange={(event) => setMime(event.target.value as Mime)}>
                  <option value="image/png">PNG（无损）</option>
                  <option value="image/jpeg">JPEG（体积更小）</option>
                </Select>
              </Field>
              {mime === 'image/jpeg' ? (
                <Field label="JPEG 质量" htmlFor="watermark-quality" hint={`${Math.round(quality * 100)}%`}>
                  <input
                    id="watermark-quality"
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
                  <Hint>PNG 为无损格式，保留透明区域，不提供质量选项。</Hint>
                </div>
              )}
            </div>

            <Hint>
              JPEG 不支持透明背景，导出时会自动填充白色。水印始终按原图分辨率绘制，导出尺寸与上传图片一致。
            </Hint>
          </div>
        </Panel>

        <Panel
          title="实时预览"
          description="调整参数后预览会立即更新，下载时按原图分辨率导出。"
          className="lg:sticky lg:top-4 lg:self-start"
        >
          {!source ? (
            <EmptyState
              icon={ImageIcon}
              title="还没有选择图片"
              description="上传 PNG / JPEG / WebP / GIF 图片后，即可实时预览并下载带水印的图片。"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex min-h-40 items-center justify-center rounded-xl border bg-[var(--hover-bg)] p-3">
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label="带水印的图片预览"
                  className="mx-auto block max-h-[52vh] w-auto max-w-full rounded-lg"
                />
              </div>

              {canvasError ? <Alert tone="error">{canvasError}</Alert> : null}
              {!canvasError && textError ? (
                <Alert tone="warning" title="水印文字为空">
                  预览只显示原图，请输入文字后再下载。
                </Alert>
              ) : null}
              {!canvasError && !textError && fontSizeError ? (
                <Alert tone="warning" title="字号无效">
                  请把字号调整到 8–400 px 之间。
                </Alert>
              ) : null}

              <KeyValue
                items={[
                  { label: '图片尺寸', value: `${source.width} × ${source.height} px` },
                  { label: '水印文字', value: trimmedText || '—' },
                  { label: '样式', value: `${fontSizeValue || 0}px · ${opacityValue}% · ${rotationValue}°` },
                  { label: '位置', value: tile ? `平铺（间距 ${gapValue}px）` : positionLabel },
                  { label: '输出格式', value: mime === 'image/png' ? 'PNG' : 'JPEG' },
                  { label: '文件名', value: fileName },
                ]}
              />

              <Actions className="mt-0">
                <Button icon={Download} onClick={handleDownload} disabled={!canRenderWatermark}>
                  下载 {extLabel(mime)}
                </Button>
                <Button variant="secondary" icon={RotateCcw} onClick={resetSettings}>
                  重置设置
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

function extLabel(mime: Mime): string {
  return EXT[mime].toUpperCase();
}
