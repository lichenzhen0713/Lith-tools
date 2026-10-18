import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, FileArchive, FileIcon, Folder, FolderOpen, PackageOpen, ShieldAlert, UploadCloud, X } from 'lucide-react';
import { Panel, Hint, KeyValue } from './kit';
import { Alert, Badge, Button, Checkbox, EmptyState } from '../components/ui';
import { cn, download, formatBytes, formatNumber, readFileAsArrayBuffer } from '../lib/utils';
import { errorMessage } from '../lib/api';
import { useToast } from '../lib/toast';

const MAX_ZIP_SIZE = 200 * 1024 * 1024;
const SIZE_READ_LIMIT = 40 * 1024 * 1024;
const SIZE_READ_BUDGET = 64 * 1024 * 1024;

interface FileNode {
  type: 'file';
  path: string;
  name: string;
  size: number | null;
}

interface FolderNode {
  type: 'folder';
  path: string;
  name: string;
  children: TreeNode[];
}

type TreeNode = FileNode | FolderNode;

interface ArchiveInfo {
  name: string;
  size: number;
}

function describeZipError(error: unknown): string {
  const message = errorMessage(error);
  if (/encrypt/i.test(message)) {
    return '该压缩包（或其中的文件）使用了密码加密，JSZip 无法在浏览器端解密。请先用本地工具解密后再上传。';
  }
  if (/corrupt|invalid|unexpected|signature|end of data|central directory/i.test(message)) {
    return '压缩包可能已损坏，或不是标准 ZIP 格式。RAR / 7z / tar.gz 需要先转换为 ZIP。';
  }
  return `读取失败：${message}`;
}

function buildTree(items: { path: string; size: number | null }[]): TreeNode[] {
  const root: FolderNode = { type: 'folder', path: '', name: '', children: [] };
  for (const item of items) {
    const parts = item.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let current = root;
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const path = parts.slice(0, index + 1).join('/');
      if (index === parts.length - 1) {
        current.children.push({ type: 'file', path, name, size: item.size });
        break;
      }
      let folder = current.children.find((child): child is FolderNode => child.type === 'folder' && child.path === path);
      if (!folder) {
        folder = { type: 'folder', path, name, children: [] };
        current.children.push(folder);
      }
      current = folder;
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
    for (const node of nodes) {
      if (node.type === 'folder') sortNodes(node.children);
    }
  };
  sortNodes(root.children);
  return root.children;
}

function flattenTree(nodes: TreeNode[], depth = 0): { node: TreeNode; depth: number }[] {
  const rows: { node: TreeNode; depth: number }[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.type === 'folder') rows.push(...flattenTree(node.children, depth + 1));
  }
  return rows;
}

function collectFilePaths(node: TreeNode): string[] {
  if (node.type === 'file') return [node.path];
  return node.children.flatMap((child) => collectFilePaths(child));
}

function sumSizes(node: TreeNode): number | null {
  if (node.type === 'file') return node.size;
  let total = 0;
  for (const child of node.children) {
    const size = sumSizes(child);
    if (size === null) return null;
    total += size;
  }
  return total;
}

export default function UnzipTool() {
  const [archive, setArchive] = useState<ArchiveInfo | null>(null);
  const [entries, setEntries] = useState<{ path: string; size: number | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<JSZip | null>(null);
  const toast = useToast();

  const tree = useMemo(() => buildTree(entries), [entries]);
  const rows = useMemo(() => flattenTree(tree), [tree]);
  const filePaths = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const knownTotal = useMemo(() => entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0), [entries]);
  const selectedSize = useMemo(
    () => entries.filter((entry) => selected.has(entry.path)).reduce((sum, entry) => sum + (entry.size ?? 0), 0),
    [entries, selected],
  );
  const baseName = archive ? archive.name.replace(/\.zip$/i, '') : 'archive';

  const reset = () => {
    zipRef.current = null;
    setArchive(null);
    setEntries([]);
    setSelected(new Set());
    setError(null);
    setProgress(null);
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file || loading) return;
    if (!/\.zip$/i.test(file.name)) {
      setError('仅支持 .zip 格式。RAR / 7z / tar.gz 请先转换为 ZIP 后再解压。');
      return;
    }
    if (file.size > MAX_ZIP_SIZE) {
      setError(`压缩包为 ${formatBytes(file.size)}，超过 ${formatBytes(MAX_ZIP_SIZE)} 上限，浏览器内存可能不足。`);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(null);
    setEntries([]);
    setSelected(new Set());
    zipRef.current = null;

    try {
      const buffer = await readFileAsArrayBuffer(file);
      const zip = await JSZip.loadAsync(buffer);
      const objects = Object.values(zip.files).filter((object) => !object.dir);
      if (objects.length === 0) {
        setArchive({ name: file.name, size: file.size });
        setError('这个压缩包中没有文件（可能只包含空文件夹）。');
        return;
      }

      const sizes = new Map<string, number>();
      if (file.size <= SIZE_READ_LIMIT) {
        let budget = SIZE_READ_BUDGET;
        for (const object of objects) {
          if (budget <= 0) break;
          try {
            const data = await object.async('uint8array');
            sizes.set(object.name, data.length);
            budget -= data.length;
          } catch (sizeError) {
            // 加密条目会在解压阶段抛错，直接上抛以给出明确提示
            if (/encrypt/i.test(errorMessage(sizeError))) throw sizeError;
            break;
          }
        }
      }

      const list = objects
        .map((object) => ({ path: object.name, size: sizes.get(object.name) ?? null }))
        .sort((a, b) => a.path.localeCompare(b.path));

      zipRef.current = zip;
      setArchive({ name: file.name, size: file.size });
      setEntries(list);
      setSelected(new Set(list.map((entry) => entry.path)));
      toast.success(`已读取 ${list.length} 个文件`);
    } catch (loadError) {
      setError(describeZipError(loadError));
      setArchive(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleFiles = (paths: string[], value: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const path of paths) {
        if (value) next.add(path);
        else next.delete(path);
      }
      return next;
    });
  };

  const downloadOne = async (node: FileNode) => {
    const zip = zipRef.current;
    if (!zip) return;
    setBusyPath(node.path);
    try {
      const object = zip.file(node.path);
      if (!object) throw new Error('压缩包中找不到该文件');
      const blob = await object.async('blob');
      download(blob, node.name);
    } catch (downloadError) {
      setError(describeZipError(downloadError));
    } finally {
      setBusyPath(null);
    }
  };

  const exportEntries = async (paths: string[]) => {
    const zip = zipRef.current;
    if (!zip || paths.length === 0 || exporting) return;
    setExporting(true);
    setError(null);
    setProgress(0);
    try {
      const output = new JSZip();
      let index = 0;
      for (const path of paths) {
        const object = zip.file(path);
        if (!object) continue;
        const data = await object.async('uint8array');
        output.file(path, data);
        index += 1;
        setProgress(Math.round((index / paths.length) * 55));
      }
      const blob = await output.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/zip' },
        (metadata) => setProgress(55 + Math.round(metadata.percent * 0.45)),
      );
      download(blob, `${baseName}-extracted.zip`);
      toast.success(`已导出 ${paths.length} 个文件`);
    } catch (exportError) {
      setError(describeZipError(exportError));
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="选择压缩包" description="ZIP 在本地解析，文件不会上传；支持查看目录结构、单个下载与批量导出。">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFile(event.dataTransfer.files[0]);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging
              ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10'
              : 'border-[var(--card-border)] bg-[var(--hover-bg)]',
          )}
        >
          <span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <UploadCloud className="size-6" />
          </span>
          <p className="text-sm font-medium">拖拽 .zip 文件到这里，或点击选择</p>
          <p className="text-xs subtle">单个文件最大 {formatBytes(MAX_ZIP_SIZE)}；加密压缩包无法在浏览器端解密。</p>
          <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => inputRef.current?.click()} loading={loading}>
            选择 ZIP 文件
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>

        {archive ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="brand">
              <FileArchive className="size-3" /> {archive.name}
            </Badge>
            <Badge>{formatBytes(archive.size)}</Badge>
            <Badge>{formatNumber(entries.length)} 个文件</Badge>
            {knownTotal > 0 ? <Badge>解压后 {formatBytes(knownTotal)}</Badge> : null}
            <Button variant="ghost" size="sm" icon={X} onClick={reset}>
              移除
            </Button>
          </div>
        ) : null}

        {error ? (
          <Alert tone="error" title="无法解压" className="mt-4">
            <span className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </span>
          </Alert>
        ) : null}
      </Panel>

      <Panel
        title="压缩包内容"
        description={archive ? `共 ${formatNumber(entries.length)} 个文件，已选择 ${formatNumber(selected.size)} 个` : '读取压缩包后显示目录结构与文件大小'}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => toggleFiles(filePaths, true)} disabled={filePaths.length === 0}>
              全选
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggleFiles(filePaths, false)} disabled={selected.size === 0}>
              全不选
            </Button>
            <Button
              icon={Download}
              size="sm"
              loading={exporting}
              disabled={selected.size === 0 || exporting}
              onClick={() => void exportEntries(Array.from(selected))}
            >
              导出选中（{formatNumber(selected.size)}）
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={PackageOpen}
              disabled={filePaths.length === 0 || exporting}
              onClick={() => void exportEntries(filePaths)}
            >
              导出全部
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="space-y-3 py-8 text-center">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-400" />
            <p className="text-sm muted">正在解析压缩包并统计文件大小…</p>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="还没有加载压缩包"
            description="选择一个 .zip 文件后，这里会显示完整目录树，可勾选并导出需要的文件。"
          />
        ) : (
          <div className="space-y-3">
            {progress !== null ? (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs subtle">正在导出… {progress}%</p>
              </div>
            ) : null}

            <ul className="max-h-[28rem] divide-y overflow-auto rounded-xl border">
              {rows.map(({ node, depth }) => {
                const isFolder = node.type === 'folder';
                const paths = isFolder ? collectFilePaths(node) : [node.path];
                const allSelected = paths.length > 0 && paths.every((path) => selected.has(path));
                const size = isFolder ? sumSizes(node) : node.size;
                return (
                  <li
                    key={`${node.type}-${node.path}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm',
                      !isFolder && selected.has(node.path) && 'bg-indigo-50/50 dark:bg-indigo-500/5',
                    )}
                    style={{ paddingLeft: `${12 + depth * 16}px` }}
                  >
                    <Checkbox
                      checked={allSelected}
                      onChange={(event) => toggleFiles(paths, event.target.checked)}
                      aria-label={`选择 ${node.path}`}
                    />
                    {isFolder ? (
                      <Folder className="size-4 shrink-0 text-amber-500" />
                    ) : (
                      <FileIcon className="size-4 shrink-0 text-indigo-500" />
                    )}
                    <span className={cn('min-w-0 flex-1 truncate', isFolder && 'font-medium')} title={node.path}>
                      {node.name}
                    </span>
                    <span className="shrink-0 text-xs subtle">{size === null ? '大小未知' : formatBytes(size)}</span>
                    {isFolder ? (
                      <span className="w-16 shrink-0 text-right text-xs subtle">{paths.length} 个</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`下载 ${node.name}`}
                        loading={busyPath === node.path}
                        onClick={() => void downloadOne(node)}
                      >
                        <Download className="size-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>

            {entries.some((entry) => entry.size === null) ? (
              <Hint>部分文件未统计到解压后大小（压缩包较大或跳过预读），不影响下载与导出。</Hint>
            ) : null}
            {selected.size > 0 ? (
              <KeyValue
                items={[
                  { label: '已选文件', value: `${formatNumber(selected.size)} 个` },
                  { label: '已选解压后大小', value: formatBytes(selectedSize) },
                  { label: '压缩包大小', value: archive ? formatBytes(archive.size) : '—' },
                ]}
              />
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
