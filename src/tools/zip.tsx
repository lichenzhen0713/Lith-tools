import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Archive, Download, FileArchive, FolderOpen, Trash2, UploadCloud, X } from 'lucide-react';
import { Panel, Field, Input, Select, Actions, Hint, KeyValue } from './kit';
import { Alert, Badge, Button, EmptyState } from '../components/ui';
import { cn, download, formatBytes, formatNumber } from '../lib/utils';
import { errorMessage } from '../lib/api';
import { useToast } from '../lib/toast';

interface Entry {
  id: number;
  file: File;
  entryName: string;
}

interface ZipResult {
  name: string;
  size: number;
  blob: Blob;
  sourceSize: number;
}

const LEVEL_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '0 · 仅打包，不压缩（最快）' },
  { value: 1, label: '1 · 体积最大，速度最快' },
  { value: 3, label: '3 · 偏向速度' },
  { value: 6, label: '6 · 默认平衡' },
  { value: 9, label: '9 · 体积最小，速度最慢' },
];

function normalizeArchiveName(input: string): string {
  const cleaned = input
    .trim()
    .replace(/\.zip$/i, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/^\.+/, '');
  return `${cleaned || 'archive'}.zip`;
}

function uniqueEntryName(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  const dot = candidate.lastIndexOf('.');
  const base = dot > 0 ? candidate.slice(0, dot) : candidate;
  const ext = dot > 0 ? candidate.slice(dot) : '';
  let counter = 2;
  while (used.has(`${base} (${counter})${ext}`)) counter += 1;
  const name = `${base} (${counter})${ext}`;
  used.add(name);
  return name;
}

export default function ZipTool() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [archiveName, setArchiveName] = useState('archive');
  const [level, setLevel] = useState(6);
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ZipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(1);
  const toast = useToast();

  const sourceSize = useMemo(() => entries.reduce((sum, entry) => sum + entry.file.size, 0), [entries]);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const files = Array.from(incoming);
    setEntries((previous) => {
      const used = new Set(previous.map((entry) => entry.entryName));
      const next = [...previous];
      for (const file of files) {
        const entryName = uniqueEntryName(file.name || `file-${idRef.current}`, used);
        next.push({ id: idRef.current++, file, entryName });
      }
      return next;
    });
    setResult(null);
    setError(null);
  };

  const removeEntry = (id: number) => {
    setEntries((previous) => previous.filter((entry) => entry.id !== id));
    setResult(null);
  };

  const handleGenerate = async () => {
    if (generating) return;
    if (entries.length === 0) {
      setError('请先选择要压缩的文件');
      return;
    }
    setError(null);
    setGenerating(true);
    setProgress(0);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const entry of entries) {
        zip.file(uniqueEntryName(entry.entryName, used), entry.file);
      }
      const blob = await zip.generateAsync(
        {
          type: 'blob',
          compression: level === 0 ? 'STORE' : 'DEFLATE',
          compressionOptions: level === 0 ? undefined : { level },
          mimeType: 'application/zip',
        },
        (metadata) => setProgress(Math.min(100, Math.round(metadata.percent))),
      );
      const name = normalizeArchiveName(archiveName);
      setResult({ name, size: blob.size, blob, sourceSize });
      download(blob, name);
      toast.success('压缩包已生成，正在下载');
    } catch (generateError) {
      setError(`打包失败：${errorMessage(generateError)}`);
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  };

  const ratio = result && result.sourceSize > 0 ? Math.max(0, 1 - result.size / result.sourceSize) : 0;

  return (
    <div className="space-y-4">
      <Panel
        title="选择文件"
        description="文件只在浏览器内打包，不会上传到服务器；可一次选择多个文件。"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{formatNumber(entries.length)} 个文件</Badge>
              <Badge tone="brand">共 {formatBytes(sourceSize)}</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              disabled={entries.length === 0}
              onClick={() => {
                setEntries([]);
                setResult(null);
                setError(null);
              }}
            >
              清空列表
            </Button>
          </div>
        }
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10' : 'border-[var(--card-border)] bg-[var(--hover-bg)]',
          )}
        >
          <span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <UploadCloud className="size-6" />
          </span>
          <p className="text-sm font-medium">拖拽文件到这里，或点击下方按钮选择</p>
          <p className="text-xs subtle">支持任意类型文件，多个文件可一次选中；同名文件会自动加上序号。</p>
          <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => inputRef.current?.click()}>
            选择文件
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>

        <div className="mt-4">
          {entries.length === 0 ? (
            <EmptyState icon={FileArchive} title="还没有选择文件" description="选择或拖入文件后，这里会显示文件名与体积。" />
          ) : (
            <ul className="max-h-72 divide-y overflow-auto rounded-xl border">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <FileArchive className="size-4 shrink-0 text-indigo-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.entryName}>
                    {entry.entryName}
                  </span>
                  <span className="shrink-0 text-xs subtle">{formatBytes(entry.file.size)}</span>
                  <Button variant="ghost" size="icon" aria-label={`移除 ${entry.entryName}`} onClick={() => removeEntry(entry.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="压缩设置" description="选择压缩级别：级别越高体积越小，但耗时更长。">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="压缩包文件名" htmlFor="zip-name" hint="会自动补全 .zip 后缀，路径与特殊字符会被去除。">
            <Input id="zip-name" value={archiveName} onChange={(event) => setArchiveName(event.target.value)} placeholder="archive" />
          </Field>
          <Field label="压缩级别" htmlFor="zip-level">
            <Select id="zip-level" value={String(level)} onChange={(event) => setLevel(Number(event.target.value))}>
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {progress !== null ? (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs subtle">正在压缩… {progress}%</p>
          </div>
        ) : null}

        {error ? (
          <Alert tone="error" title="打包失败" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <Actions>
          <Button icon={Archive} loading={generating} onClick={handleGenerate} disabled={entries.length === 0}>
            开始压缩并下载
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            disabled={!result}
            onClick={() => {
              if (!result) return;
              download(result.blob, result.name);
              toast.success('已重新下载压缩包');
            }}
          >
            再次下载
          </Button>
          <Hint>浏览器端使用 JSZip 压缩，单个文件特别大时可能较慢，请留意内存占用。</Hint>
        </Actions>
      </Panel>

      <Panel title="压缩结果">
        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">
                <Archive className="size-3" /> {result.name}
              </Badge>
              <Badge>{formatBytes(result.size)}</Badge>
              <Badge>原始 {formatBytes(result.sourceSize)}</Badge>
              <Badge tone={ratio > 0 ? 'success' : 'default'}>节省 {(ratio * 100).toFixed(1)}%</Badge>
            </div>
            <KeyValue
              items={[
                { label: '文件数量', value: `${formatNumber(entries.length)} 个` },
                { label: '压缩后大小', value: formatBytes(result.size) },
                { label: '压缩前大小', value: formatBytes(result.sourceSize) },
                { label: '压缩级别', value: String(level) },
              ]}
            />
            <Hint>下载已自动开始。若浏览器拦截了自动下载，可点击上方「再次下载」。</Hint>
          </div>
        ) : (
          <p className="text-sm muted">完成压缩后，这里会显示压缩包大小与压缩率。</p>
        )}
      </Panel>
    </div>
  );
}
