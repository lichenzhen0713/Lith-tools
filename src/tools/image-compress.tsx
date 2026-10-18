import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, RotateCcw, Upload, X } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, Spinner } from '../components/ui';
import { cn, download, formatBytes } from '../lib/utils';
import { useDebouncedValue } from '../lib/hooks';
import { useToast } from '../lib/toast';

type Mime = 'image/jpeg' | 'image/webp' | 'image/png';

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
  'image/jpeg': 'JPEG（兼容性最好）',
  'image/webp': 'WebP（同质量体积更小）',
  'image/png': 'PNG（无损，无法压缩）',
};
const PRESETS = [
  { quality: 0.9, label: '高质量' },
  { quality: 0.75, label: '均衡' },
  { quality: 0.6, label: '小体积' },
  { quality: 0.4, label: '极小' },
];

export default function ImageCompressTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<Output | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [quality, setQuality] = useState(0.8);
  const [maxWidth, setMaxWidth] = useState('1920');
  const [mime, setMime] = useState<Mime>('image/jpeg');

  const [result, setResult] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [encodeError, setEncodeError] = useState<string | null>(null);

  const debouncedQuality = useDebouncedValue(quality, 250);
  const debouncedMaxWidth = useDebouncedValue(maxWidth, 250);

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

  /* --------------------------------------------------------- default settings */
  useEffect(() => {
    if (!source) return;
    setMaxWidth(String(Math.min(source.width, 1920)));
    setMime(source.type === 'image/webp' ? 'image/webp' : 'image/jpeg');
  }, [source]);

  const maxWidthValue = Number(maxWidth);
  const maxWidthError =
    debouncedMaxWidth.trim() !== '' &&
    (!Number.isFinite(maxWidthValue) || maxWidthValue < 16 || maxWidthValue > MAX_DIM)
      ? `最大宽度请输入 16–${MAX_DIM}`
      : null;

  const target = useMemo(() => {
    if (!source) return null;
    const limit = Number(debouncedMaxWidth);
    const validLimit =
      debouncedMaxWidth.trim() !== '' && Number.isFinite(limit) && limit >= 16 && limit <= MAX_DIM
        ? limit
        : source.width;
    const scale = Math.min(1, validLimit / source.width);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    return { width, height };
  }, [source, debouncedMaxWidth]);

  /* ------------------------------------------------------------------ encode */
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
        setEncodeError('当前浏览器不支持 Canvas 2D，无法压缩图片。');
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
        setEncodeError('绘制图片失败，请尝试更小的输出宽度。');
        return;
      }
      canvas.toBlob(
        (blob) => {
          if (cancelled) return;
          setBusy(false);
          if (!blob) {
            setEncodeError('压缩失败，请更换输出格式或调整参数后重试。');
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
        mime === 'image/png' ? undefined : debouncedQuality,
      );
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, target, mime, debouncedQuality, setOutput]);

  /* ----------------------------------------------------------------- actions */
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
    setQuality(0.8);
    setMaxWidth('1920');
    if (inputRef.current) inputRef.current.value = '';
  };

  const pending = quality !== debouncedQuality || maxWidth !== debouncedMaxWidth;
  const ext = result ? EXT[result.mime] : EXT[mime];
  const baseName = source
    ? source.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-') || 'image'
    : 'image';
  const fileName = result ? `${baseName}-compressed-${result.width}x${result.height}.${ext}` : `compressed.${ext}`;
  const saving = source && result ? (1 - result.blob.size / source.size) * 100 : null;

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="上传与压缩参数" description="图片只在本地处理，不会上传到服务器。">
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="label mb-0">压缩质量</p>
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {quality.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={quality}
                aria-label="压缩质量"
                disabled={!source || mime === 'image/png'}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="w-full accent-indigo-600 disabled:opacity-50"
              />
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.quality}
                    type="button"
                    disabled={!source || mime === 'image/png'}
                    className={cn('chip', Math.abs(quality - preset.quality) < 0.005 && 'chip-active')}
                    onClick={() => setQuality(preset.quality)}
                  >
                    {preset.label} {preset.quality}
                  </button>
                ))}
              </div>
              {mime === 'image/png' ? <Hint>PNG 为无损格式，质量参数不生效。</Hint> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="最大宽度 (px)" htmlFor="compress-max-width" error={maxWidthError} hint={`16–${MAX_DIM}，仅缩小不放大`}>
                <Input
                  id="compress-max-width"
                  type="number"
                  inputMode="numeric"
                  min={16}
                  max={MAX_DIM}
                  step={1}
                  placeholder="1920"
                  value={maxWidth}
                  error={Boolean(maxWidthError)}
                  disabled={!source}
                  className="disabled:opacity-60"
                  onChange={(event) => setMaxWidth(event.target.value)}
                />
              </Field>
              <Field label="输出格式" htmlFor="compress-format">
                <Select id="compress-format" value={mime} onChange={(event) => setMime(event.target.value as Mime)}>
                  {(Object.keys(MIME_LABEL) as Mime[]).map((item) => (
                    <option key={item} value={item}>
                      {MIME_LABEL[item]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              {[640, 1280, 1920, 2560].map((width) => (
                <button
                  key={width}
                  type="button"
                  disabled={!source}
                  className={cn('chip', maxWidth === String(width) && 'chip-active')}
                  onClick={() => setMaxWidth(String(width))}
                >
                  {width}px
                </button>
              ))}
              {source ? (
                <button
                  type="button"
                  className={cn('chip', maxWidth === String(source.width) && 'chip-active')}
                  onClick={() => setMaxWidth(String(source.width))}
                >
                  原图宽 {source.width}px
                </button>
              ) : null}
            </div>

            <Hint>
              质量越低、宽度越小，文件越小但细节损失越多。照片建议 0.7–0.85 + JPEG/WebP；含文字的截图建议 PNG 或质量 0.9 以上。
            </Hint>
          </div>
        </Panel>

        <Panel title="压缩结果" description="实时对比压缩前后的体积与尺寸。">
          {!source ? (
            <EmptyState
              icon={ImageIcon}
              title="先选择一张图片"
              description="上传图片后调整质量、宽度与格式，即可看到压缩前后体积对比并下载。"
            />
          ) : maxWidthError ? (
            <Alert tone="warning" title="最大宽度无效">
              最大宽度需为 16–{MAX_DIM} px，请修正后查看压缩结果。
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium muted">压缩前</p>
                    <Badge>{formatBytes(source.size)}</Badge>
                  </div>
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg bg-[var(--hover-bg)]">
                    {sourceUrl ? (
                      <img src={sourceUrl} alt="原图" className="max-h-full max-w-full object-contain" />
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs subtle">
                    {source.width}×{source.height} px · {source.type.replace('image/', '').toUpperCase()}
                  </p>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium muted">压缩后</p>
                    <Badge
                      tone={result ? (result.blob.size < source.size ? 'success' : 'warning') : 'default'}
                    >
                      {result ? formatBytes(result.blob.size) : '计算中…'}
                    </Badge>
                  </div>
                  <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg bg-[var(--hover-bg)]">
                    {result ? (
                      <img src={result.url} alt="压缩后" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <Spinner />
                    )}
                    {busy && result ? (
                      <span className="absolute top-2 right-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[11px] text-white">
                        更新中…
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs subtle">
                    {target ? `${target.width}×${target.height} px` : '—'} ·{' '}
                    {(result?.mime ?? mime).replace('image/', '').toUpperCase()}
                    {pending ? ' · 等待输入…' : ''}
                  </p>
                </div>
              </div>

              {encodeError ? <Alert tone="error">{encodeError}</Alert> : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                  <p className="text-xs subtle">压缩率</p>
                  <p className="mt-1 text-lg font-semibold">
                    {saving === null ? '—' : `${saving >= 0 ? '↓' : '↑'} ${Math.abs(saving).toFixed(1)}%`}
                  </p>
                </div>
                <div className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                  <p className="text-xs subtle">节省空间</p>
                  <p className="mt-1 text-lg font-semibold">
                    {saving === null || !result ? '—' : `${saving >= 0 ? '↓' : '↑'} ${formatBytes(Math.abs(source.size - result.blob.size))}`}
                  </p>
                </div>
                <div className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                  <p className="text-xs subtle">输出尺寸</p>
                  <p className="mt-1 text-lg font-semibold">
                    {result ? `${result.width}×${result.height}` : '—'}
                  </p>
                </div>
              </div>

              {saving !== null && saving < 0 ? (
                <Alert tone="warning" title="压缩后反而更大">
                  当前参数下体积增加了 {Math.abs(saving).toFixed(1)}%。请降低质量、缩小宽度，或改用 WebP 格式。
                </Alert>
              ) : null}

              <KeyValue
                items={[
                  { label: '原始体积', value: formatBytes(source.size) },
                  { label: '压缩后体积', value: result ? formatBytes(result.blob.size) : <span className="subtle">计算中…</span> },
                  { label: '输出格式', value: MIME_LABEL[mime].split('（')[0] },
                  { label: '质量参数', value: mime === 'image/png' ? '不适用（无损）' : quality.toFixed(2) },
                  { label: '文件名', value: fileName },
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
            </div>
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
