import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileArchive, Image as ImageIcon, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { Actions, Field, Hint, KeyValue, Panel, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, Spinner } from '../components/ui';
import { cn, download, formatBytes } from '../lib/utils';
import { useToast } from '../lib/toast';

type TargetMime = 'image/png' | 'image/jpeg' | 'image/webp';

const EXT: Record<TargetMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_FILES = 20;
const MAX_FILE = 30 * 1024 * 1024;

interface Converted {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  mime: TargetMime;
  key: string;
}

interface Item {
  id: string;
  name: string;
  size: number;
  width: number;
  height: number;
  el: HTMLImageElement;
  previewUrl: string;
  converted: Converted | null;
  error: string | null;
}

function loadImageFile(
  file: File,
): Promise<{ el: HTMLImageElement; url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new Error('图片尺寸为 0'));
        return;
      }
      resolve({ el: image, url, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片解码失败'));
    };
    image.src = url;
  });
}

function convertImage(image: HTMLImageElement, mime: TargetMime, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  if (!canvas.width || !canvas.height) return Promise.reject(new Error('图片尺寸无效。'));
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('当前浏览器不支持 Canvas 2D。'));
  if (mime === 'image/jpeg') {
    // JPEG has no alpha channel: paint white so transparency does not turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片编码失败，请尝试其他格式。'));
      },
      mime,
      mime === 'image/png' ? undefined : quality,
    );
  });
}

function detectWebp(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function outputName(item: Item, fallback: TargetMime): string {
  const base = item.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'image';
  return `${base}.${EXT[item.converted?.mime ?? fallback]}`;
}

export default function ImageConvertTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  const outUrls = useRef(new Map<string, string>());
  const idRef = useRef(0);
  const runRef = useRef(0);

  const [items, setItems] = useState<Item[]>([]);
  const [format, setFormat] = useState<TargetMime>('image/png');
  const [quality, setQuality] = useState(0.9);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [webpSupport] = useState(detectWebp);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const convertAll = useCallback(async (mime: TargetMime, qualityValue: number, force: boolean) => {
    const key = `${mime}@${qualityValue.toFixed(2)}`;
    const pending = itemsRef.current.filter((item) => force || item.converted?.key !== key);
    if (!pending.length) return;

    const runId = runRef.current + 1;
    runRef.current = runId;
    setBusy(true);

    for (const item of pending) {
      if (runRef.current !== runId) return;
      try {
        const blob = await convertImage(item.el, mime, qualityValue);
        if (runRef.current !== runId) return;
        if (!itemsRef.current.some((entry) => entry.id === item.id)) continue;
        const previous = outUrls.current.get(item.id);
        if (previous) URL.revokeObjectURL(previous);
        const url = URL.createObjectURL(blob);
        outUrls.current.set(item.id, url);
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  converted: {
                    blob,
                    url,
                    width: entry.width,
                    height: entry.height,
                    mime,
                    key,
                  },
                  error: null,
                }
              : entry,
          ),
        );
      } catch (cause) {
        if (runRef.current !== runId) return;
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  converted: null,
                  error: cause instanceof Error ? cause.message : '转换失败，请重试。',
                }
              : entry,
          ),
        );
      }
    }

    if (runRef.current === runId) setBusy(false);
  }, []);

  useEffect(() => {
    if (!items.length) return;
    void convertAll(format, quality, false);
  }, [format, quality, items.length, convertAll]);

  useEffect(() => {
    return () => {
      runRef.current += 1;
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
      for (const url of outUrls.current.values()) URL.revokeObjectURL(url);
      outUrls.current.clear();
    };
  }, []);

  const addFiles = async (incoming: FileList | File[] | null) => {
    const list = Array.from(incoming ?? []);
    if (!list.length) return;
    setLoadError(null);

    const room = MAX_FILES - itemsRef.current.length;
    if (room <= 0) {
      setLoadError(`最多同时处理 ${MAX_FILES} 张图片，请先移除部分图片。`);
      return;
    }

    const accepted: Item[] = [];
    const rejected: string[] = [];
    for (const file of list) {
      if (accepted.length >= room) {
        rejected.push(`${file.name}：超过 ${MAX_FILES} 张上限`);
        continue;
      }
      if (!file.type.startsWith('image/')) {
        rejected.push(`${file.name}：不是图片文件`);
        continue;
      }
      if (file.size === 0) {
        rejected.push(`${file.name}：文件为空`);
        continue;
      }
      if (file.size > MAX_FILE) {
        rejected.push(`${file.name}：超过 30 MB`);
        continue;
      }
      try {
        const loaded = await loadImageFile(file);
        idRef.current += 1;
        accepted.push({
          id: `img-${idRef.current}`,
          name: file.name,
          size: file.size,
          width: loaded.width,
          height: loaded.height,
          el: loaded.el,
          previewUrl: loaded.url,
          converted: null,
          error: null,
        });
      } catch {
        rejected.push(`${file.name}：无法解码该图片`);
      }
    }

    if (accepted.length) setItems((prev) => [...prev, ...accepted]);
    if (rejected.length) {
      setLoadError(
        `${rejected.length} 个文件被跳过：${rejected.slice(0, 3).join('；')}${rejected.length > 3 ? ' 等' : ''}`,
      );
    }
  };

  const removeItem = (id: string) => {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    const url = outUrls.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      outUrls.current.delete(id);
    }
    setItems((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearAll = () => {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    for (const url of outUrls.current.values()) URL.revokeObjectURL(url);
    outUrls.current.clear();
    runRef.current += 1;
    setItems([]);
    setLoadError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const totals = useMemo(() => {
    const source = items.reduce((sum, item) => sum + item.size, 0);
    const output = items.reduce((sum, item) => sum + (item.converted?.blob.size ?? 0), 0);
    const converted = items.filter((item) => item.converted).length;
    return {
      source,
      output,
      converted,
      delta: source > 0 ? ((output - source) / source) * 100 : 0,
    };
  }, [items]);

  const exportZip = async () => {
    const ready = items.filter((item) => item.converted !== null);
    if (!ready.length) return;
    setExporting(true);
    try {
      const module = await import('jszip');
      const JSZip = module.default;
      const zip = new JSZip();
      const used = new Set<string>();
      for (const item of ready) {
        const converted = item.converted;
        if (!converted) continue;
        let name = outputName(item, format);
        if (used.has(name)) {
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : '';
          let counter = 2;
          while (used.has(`${base}-${counter}${ext}`)) counter += 1;
          name = `${base}-${counter}${ext}`;
        }
        used.add(name);
        zip.file(name, converted.blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      download(blob, `converted-${ready.length}-images.zip`);
      toast.success('已生成 ZIP 压缩包');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '打包失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const formatLabel = format === 'image/png' ? 'PNG' : format === 'image/jpeg' ? 'JPEG' : 'WebP';

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="图片与格式" description="图片在浏览器内转换，不会上传到服务器。">
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.currentTarget.value = '';
              }}
            />

            <div
              className={cn(
                'rounded-xl border border-dashed px-4 py-6 text-center transition-colors',
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
                void addFiles(event.dataTransfer.files);
              }}
            >
              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Upload className="size-5" />
              </div>
              <p className="text-sm muted">拖拽一张或多张图片到此处，或</p>
              <Button className="mt-2" size="sm" icon={ImageIcon} onClick={() => inputRef.current?.click()}>
                选择图片
              </Button>
              <p className="mt-2 text-xs subtle">
                支持 PNG / JPEG / WebP / GIF，单张最大 30 MB，最多 {MAX_FILES} 张
              </p>
            </div>

            {loadError ? <Alert tone="error">{loadError}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="输出格式" htmlFor="convert-format">
                <Select
                  id="convert-format"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as TargetMime)}
                >
                  <option value="image/png">PNG（无损，支持透明）</option>
                  <option value="image/jpeg">JPEG（体积小，无透明）</option>
                  <option value="image/webp" disabled={!webpSupport}>
                    {webpSupport ? 'WebP（体积更小）' : 'WebP（当前浏览器不支持）'}
                  </option>
                </Select>
              </Field>
              {format === 'image/png' ? (
                <div className="flex items-end pb-1">
                  <Hint>PNG 为无损格式，不提供质量选项，文件通常更大。</Hint>
                </div>
              ) : (
                <Field label="输出质量" htmlFor="convert-quality" hint={`${Math.round(quality * 100)}%`}>
                  <input
                    id="convert-quality"
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.01}
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </Field>
              )}
            </div>

            <Hint>
              转为 JPEG 时，透明区域会填充为白色（JPEG 不支持 Alpha 通道）。修改格式或质量后会自动重新转换所有图片。
            </Hint>

            {items.length ? (
              <KeyValue
                items={[
                  { label: '图片数量', value: `${items.length} 张（已转换 ${totals.converted} 张）` },
                  { label: '原始总体积', value: formatBytes(totals.source) },
                  { label: '输出总体积', value: totals.converted ? formatBytes(totals.output) : '—' },
                  {
                    label: '体积变化',
                    value: totals.converted
                      ? `${totals.delta >= 0 ? '+' : ''}${totals.delta.toFixed(1)}%`
                      : '—',
                  },
                ]}
              />
            ) : null}
          </div>
        </Panel>

        <Panel title="转换结果" description="逐张对比体积，单张下载或用 ZIP 打包。">
          {!items.length ? (
            <EmptyState
              icon={ImageIcon}
              title="还没有图片"
              description="上传图片后会自动转换为所选格式，并显示转换前后的体积。"
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const converted = item.converted;
                const delta = converted ? ((converted.blob.size - item.size) / item.size) * 100 : 0;
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border p-3 sm:flex-nowrap"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="size-12 shrink-0 rounded-lg border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs subtle">
                        {item.width} × {item.height} px · {formatBytes(item.size)}
                        {converted ? (
                          <>
                            {' → '}
                            <span className="font-medium text-[var(--text-primary)]">
                              {formatBytes(converted.blob.size)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      {item.error ? <p className="mt-1 text-xs text-rose-500">{item.error}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {converted ? (
                        <Badge tone={delta <= 0 ? 'success' : 'warning'}>
                          {delta >= 0 ? '+' : ''}
                          {delta.toFixed(1)}%
                        </Badge>
                      ) : item.error ? null : (
                        <Spinner className="size-4" />
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        disabled={!converted}
                        onClick={() => {
                          if (!converted) return;
                          download(converted.blob, outputName(item, format));
                          toast.success('已开始下载');
                        }}
                      >
                        下载
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={X}
                        aria-label={`移除 ${item.name}`}
                        onClick={() => removeItem(item.id)}
                      />
                    </div>
                  </div>
                );
              })}

              <Actions className="mt-0">
                <Button
                  icon={FileArchive}
                  loading={exporting}
                  disabled={totals.converted === 0 || exporting}
                  onClick={() => void exportZip()}
                >
                  打包下载 ZIP
                </Button>
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  disabled={!items.length || busy}
                  onClick={() => void convertAll(format, quality, true)}
                >
                  重新转换
                </Button>
                <Button variant="ghost" icon={Trash2} disabled={!items.length} onClick={clearAll}>
                  清空
                </Button>
              </Actions>

              <p className="text-xs subtle">
                当前格式：{formatLabel}
                {busy ? ' · 正在转换…' : ''}
              </p>
            </div>
          )}
        </Panel>
      </ToolSplit>
    </div>
  );
}
