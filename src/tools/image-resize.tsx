import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, RotateCcw, Upload, X } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Select, ToolSplit } from './kit';
import { Alert, Button, EmptyState, Spinner, Switch, Tabs } from '../components/ui';
import { cn, download, formatBytes } from '../lib/utils';
import { useToast } from '../lib/toast';

type Mode = 'percent' | 'fixed';
type Mime = 'image/png' | 'image/jpeg' | 'image/webp';

interface Source {
  el: HTMLImageElement;
  width: number;
  height: number;
  name: string;
  size: number;
  type: string;
}

interface Output {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  mime: Mime;
}

const MAX_DIM = 16384;
const MAX_FILE = 40 * 1024 * 1024;
const EXT: Record<Mime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MIME_LABEL: Record<Mime, string> = {
  'image/png': 'PNG（无损，支持透明）',
  'image/jpeg': 'JPEG（照片，可调质量）',
  'image/webp': 'WebP（体积更小）',
};

export default function ImageResizeTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<Output | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [mode, setMode] = useState<Mode>('percent');
  const [percent, setPercent] = useState('100');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [lock, setLock] = useState(true);
  const [mime, setMime] = useState<Mime>('image/png');
  const [quality, setQuality] = useState(0.92);

  const [result, setResult] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [encodeError, setEncodeError] = useState<string | null>(null);

  const setOutput = useCallback((next: Output | null) => {
    if (resultRef.current && resultRef.current.url !== next?.url) {
      URL.revokeObjectURL(resultRef.current.url);
    }
    resultRef.current = next;
    setResult(next);
  }, []);

  useEffect(() => {
    return () => {
      if (resultRef.current) {
        URL.revokeObjectURL(resultRef.current.url);
        resultRef.current = null;
      }
    };
  }, []);

  /* ---------------------------------------------------------------- load file */
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

  /* ------------------------------------------------------- reset size controls */
  useEffect(() => {
    if (!source) return;
    setMode('percent');
    setPercent('100');
    setWidth(String(source.width));
    setHeight(String(source.height));
    setMime(source.type === 'image/png' ? 'image/png' : source.type === 'image/webp' ? 'image/webp' : 'image/jpeg');
  }, [source]);

  const aspect = source ? source.width / source.height : 1;

  /* ------------------------------------------------------------- target sizes */
  const percentValue = Number(percent);
  const widthValue = Number(width);
  const heightValue = Number(height);

  const percentError =
    mode === 'percent' && percent.trim() !== '' && (!Number.isFinite(percentValue) || percentValue < 1 || percentValue > 400)
      ? '缩放比例请输入 1–400'
      : null;
  const widthError =
    mode === 'fixed' && width.trim() !== '' && (!Number.isFinite(widthValue) || widthValue < 1 || widthValue > MAX_DIM)
      ? `宽度请输入 1–${MAX_DIM}`
      : null;
  const heightError =
    mode === 'fixed' && height.trim() !== '' && (!Number.isFinite(heightValue) || heightValue < 1 || heightValue > MAX_DIM)
      ? `高度请输入 1–${MAX_DIM}`
      : null;

  const target = useMemo(() => {
    if (!source) return null;
    let nextWidth: number;
    let nextHeight: number;
    if (mode === 'percent') {
      if (!Number.isFinite(percentValue) || percentValue < 1 || percentValue > 400) return null;
      nextWidth = Math.round((source.width * percentValue) / 100);
      nextHeight = Math.round((source.height * percentValue) / 100);
    } else {
      if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue)) return null;
      if (widthValue < 1 || heightValue < 1 || widthValue > MAX_DIM || heightValue > MAX_DIM) return null;
      nextWidth = Math.round(widthValue);
      nextHeight = Math.round(heightValue);
    }
    if (nextWidth < 1 || nextHeight < 1 || nextWidth > MAX_DIM || nextHeight > MAX_DIM) return null;
    return { width: nextWidth, height: nextHeight };
  }, [source, mode, percentValue, widthValue, heightValue]);

  /* ------------------------------------------------------------------ render */
  useEffect(() => {
    if (!source || !target) {
      setBusy(false);
      setEncodeError(null);
      setOutput(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setEncodeError(null);

    const timer = window.setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext('2d');
      if (!context) {
        setBusy(false);
        setEncodeError('当前浏览器不支持 Canvas 2D，无法处理图片。');
        return;
      }
      if (mime === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      try {
        context.drawImage(source.el, 0, 0, canvas.width, canvas.height);
      } catch {
        setBusy(false);
        setEncodeError('绘制图片失败，输出尺寸可能过大，请缩小后重试。');
        return;
      }
      canvas.toBlob(
        (blob) => {
          if (cancelled) return;
          setBusy(false);
          if (!blob) {
            setEncodeError('编码失败，请尝试更小的尺寸或其他输出格式。');
            return;
          }
          const next: Output = {
            url: URL.createObjectURL(blob),
            blob,
            width: canvas.width,
            height: canvas.height,
            mime,
          };
          setOutput(next);
        },
        mime,
        mime === 'image/png' ? undefined : quality,
      );
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, target, mime, quality, setOutput]);

  /* ------------------------------------------------------------------ actions */
  const acceptFile = (next: File | null) => {
    setLoadError(null);
    setEncodeError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!next.type.startsWith('image/')) {
      setLoadError('请选择图片文件（PNG、JPEG、WebP、GIF 等）。');
      return;
    }
    if (next.size > MAX_FILE) {
      setLoadError(`图片体积 ${formatBytes(next.size)} 超过 40 MB 上限。`);
      return;
    }
    setFile(next);
  };

  const clearAll = () => {
    setFile(null);
    setLoadError(null);
    setEncodeError(null);
    setOutput(null);
    setPercent('100');
    setWidth('');
    setHeight('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const applyPercent = (value: number) => {
    setMode('percent');
    setPercent(String(value));
  };

  const onWidthChange = (value: string) => {
    setWidth(value);
    const next = Number(value);
    if (lock && Number.isFinite(next) && next > 0 && aspect > 0) {
      setHeight(String(Math.max(1, Math.round(next / aspect))));
    }
  };

  const onHeightChange = (value: string) => {
    setHeight(value);
    const next = Number(value);
    if (lock && Number.isFinite(next) && next > 0 && aspect > 0) {
      setWidth(String(Math.max(1, Math.round(next * aspect))));
    }
  };

  const ext = result ? EXT[result.mime] : EXT[mime];
  const baseName = source
    ? source.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-') || 'image'
    : 'image';
  const fileName = result ? `${baseName}-${result.width}x${result.height}.${ext}` : `resized.${ext}`;
  const scalePercent = source && result ? (result.width / source.width) * 100 : null;

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="上传与设置" description="所有处理都在浏览器本地完成，图片不会上传。">
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
                  <img
                    src={sourceUrl}
                    alt="原图缩略图"
                    className="size-14 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-[var(--hover-bg)]">
                    <ImageIcon className="size-5 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{source.name}</p>
                  <p className="text-xs subtle">
                    {source.width}×{source.height} px · {formatBytes(source.size)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" icon={X} onClick={clearAll} aria-label="移除图片">
                  移除
                </Button>
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
                <Button className="mt-2" size="sm" onClick={() => inputRef.current?.click()} icon={ImageIcon}>
                  选择图片
                </Button>
                <p className="mt-3 text-xs subtle">支持 PNG / JPEG / WebP / GIF，最大 40 MB</p>
              </div>
            )}

            {loadError ? <Alert tone="error">{loadError}</Alert> : null}

            <div>
              <p className="label">缩放方式</p>
              <Tabs<Mode>
                items={[
                  { value: 'percent', label: '按比例' },
                  { value: 'fixed', label: '固定宽高' },
                ]}
                value={mode}
                onChange={setMode}
              />
            </div>

            {mode === 'percent' ? (
              <div className="space-y-3">
                <Field label="缩放比例" htmlFor="resize-percent" error={percentError} hint="100% 表示保持原始尺寸">
                  <div className="flex items-center gap-2">
                    <Input
                      id="resize-percent"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={400}
                      step={1}
                      placeholder="100"
                      value={percent}
                      error={Boolean(percentError)}
                      onChange={(event) => setPercent(event.target.value)}
                      disabled={!source}
                      className="disabled:opacity-60"
                    />
                    <span className="shrink-0 text-sm subtle">%</span>
                  </div>
                </Field>
                <div className="flex flex-wrap gap-2">
                  {[25, 50, 75, 100, 200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!source}
                      className={cn('chip', percent === String(preset) && 'chip-active')}
                      onClick={() => applyPercent(preset)}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="宽度 (px)" htmlFor="resize-width" error={widthError}>
                    <Input
                      id="resize-width"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_DIM}
                      step={1}
                      placeholder="宽度"
                      value={width}
                      error={Boolean(widthError)}
                      disabled={!source}
                      className="disabled:opacity-60"
                      onChange={(event) => onWidthChange(event.target.value)}
                    />
                  </Field>
                  <Field label="高度 (px)" htmlFor="resize-height" error={heightError}>
                    <Input
                      id="resize-height"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_DIM}
                      step={1}
                      placeholder="高度"
                      value={height}
                      error={Boolean(heightError)}
                      disabled={!source}
                      className="disabled:opacity-60"
                      onChange={(event) => onHeightChange(event.target.value)}
                    />
                  </Field>
                </div>
                <Switch
                  checked={lock}
                  onChange={(next) => {
                    setLock(next);
                    if (next && aspect > 0) {
                      const current = Number(width);
                      if (Number.isFinite(current) && current > 0) {
                        setHeight(String(Math.max(1, Math.round(current / aspect))));
                      }
                    }
                  }}
                  label="锁定宽高比"
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="输出格式" htmlFor="resize-format">
                <Select
                  id="resize-format"
                  value={mime}
                  onChange={(event) => setMime(event.target.value as Mime)}
                >
                  {(Object.keys(MIME_LABEL) as Mime[]).map((item) => (
                    <option key={item} value={item}>
                      {MIME_LABEL[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              {mime !== 'image/png' ? (
                <Field label="输出质量" htmlFor="resize-quality" hint={`${Math.round(quality * 100)}%`}>
                  <input
                    id="resize-quality"
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.01}
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </Field>
              ) : (
                <div className="flex items-end pb-1">
                  <Hint>PNG 为无损格式，不提供质量选项。</Hint>
                </div>
              )}
            </div>

            <Hint>
              JPEG 不支持透明背景，透明区域会填充为白色。放大图片不会增加细节，建议用于缩小或按比例调整尺寸。
            </Hint>
          </div>
        </Panel>

        <Panel title="预览与下载" description="对比原始尺寸与输出结果。">
          {!source ? (
            <EmptyState
              icon={ImageIcon}
              title="先选择一张图片"
              description="上传图片后可实时预览缩放效果，并按 PNG / JPEG / WebP 下载。"
            />
          ) : !target ? (
            <Alert tone="warning" title="输出尺寸无效">
              请检查缩放比例（1–400%）与宽高（1–{MAX_DIM} px）。若原图尺寸较大，请适当降低比例后再试。
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="relative flex min-h-40 items-center justify-center rounded-xl border bg-[var(--hover-bg)] p-3">
                {result ? (
                  <img
                    src={result.url}
                    alt="缩放结果预览"
                    className="max-h-[420px] w-auto max-w-full rounded-lg"
                  />
                ) : (
                  <div className="flex items-center gap-2 py-10 text-sm subtle">
                    <Spinner /> 正在生成预览…
                  </div>
                )}
                {busy && result ? (
                  <span className="absolute top-3 right-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs text-white">
                    更新中…
                  </span>
                ) : null}
              </div>

              {encodeError ? <Alert tone="error">{encodeError}</Alert> : null}

              <KeyValue
                items={[
                  { label: '原始尺寸', value: `${source.width} × ${source.height} px` },
                  { label: '输出尺寸', value: `${target.width} × ${target.height} px` },
                  { label: '原始体积', value: formatBytes(source.size) },
                  {
                    label: '输出体积',
                    value: result ? formatBytes(result.blob.size) : <span className="subtle">计算中…</span>,
                  },
                  {
                    label: '尺寸比例',
                    value: scalePercent !== null ? `${scalePercent.toFixed(1)}%（原图宽度基准）` : '—',
                  },
                ]}
              />

              <Actions className="mt-0">
                <Button
                  icon={Download}
                  disabled={!result || busy}
                  onClick={() => {
                    if (!result) return;
                    download(result.blob, fileName);
                    toast.success('已开始下载');
                  }}
                >
                  下载 {ext.toUpperCase()}
                </Button>
                <Button variant="secondary" icon={RotateCcw} onClick={clearAll}>
                  重新开始
                </Button>
              </Actions>
              <p className="text-xs subtle">文件名：{fileName}</p>
            </div>
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
