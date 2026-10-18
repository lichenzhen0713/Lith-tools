import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { ArrowRight, Download, Eraser, Files, FolderOpen, Trash2, UploadCloud, X } from 'lucide-react';
import { Panel, Field, Input, Select, Hint } from './kit';
import { Alert, Badge, Button, EmptyState, Switch } from '../components/ui';
import { cn, download, formatBytes, formatNumber } from '../lib/utils';
import { errorMessage } from '../lib/api';
import { useToast } from '../lib/toast';

interface Entry {
  id: number;
  file: File;
}

type IndexPosition = 'none' | 'prefix' | 'suffix' | 'replace';
type CaseMode = 'none' | 'upper' | 'lower';

interface PreviewRow {
  id: number;
  original: string;
  next: string;
  problems: string[];
}

const INVALID_CHARS = /[\\/:*?"<>|]/;

function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

function normalizeZipName(input: string): string {
  const cleaned = input
    .trim()
    .replace(/\.zip$/i, '')
    .replace(/[\\/:*?"<>|]/g, '');
  return `${cleaned || 'renamed-files'}.zip`;
}

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export default function BatchRenameTool() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [indexPosition, setIndexPosition] = useState<IndexPosition>('suffix');
  const [start, setStart] = useState('1');
  const [pad, setPad] = useState('3');
  const [step, setStep] = useState('1');
  const [indexSeparator, setIndexSeparator] = useState('-');
  const [caseMode, setCaseMode] = useState<CaseMode>('none');
  const [zipName, setZipName] = useState('renamed-files');
  const [dragging, setDragging] = useState(false);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(1);
  const toast = useToast();

  const useIndex = indexPosition !== 'none';
  const startNumber = clampNumber(start, 1, 0, 999_999);
  const padNumber = clampNumber(pad, 3, 1, 12);
  const stepNumber = clampNumber(step, 1, 1, 9999);
  const separator = indexSeparator;

  const sourceSize = useMemo(() => entries.reduce((sum, entry) => sum + entry.file.size, 0), [entries]);

  const rows = useMemo<PreviewRow[]>(() => {
    const draft = entries.map((entry, index) => {
      const { base, ext } = splitName(entry.file.name);
      let core = find.length > 0 ? base.split(find).join(replace) : base;
      if (caseMode === 'upper') core = core.toUpperCase();
      else if (caseMode === 'lower') core = core.toLowerCase();

      const indexText = String(startNumber + index * stepNumber).padStart(padNumber, '0');
      const body = indexPosition === 'replace' ? indexText : core;
      let name = `${prefix}${body}${suffix}`;
      if (indexPosition === 'prefix') name = `${indexText}${separator}${name}`;
      else if (indexPosition === 'suffix') name = `${name}${separator}${indexText}`;
      name = `${name}${ext}`;

      const problems: string[] = [];
      if (name.trim().length === 0 || name === ext) problems.push('结果文件名为空');
      if (INVALID_CHARS.test(name)) problems.push('包含非法字符 \\ / : * ? " < > |');
      if (name === '.' || name === '..') problems.push('文件名不合法');
      if (name.length > 255) problems.push('文件名过长（超过 255 字符）');
      return { id: entry.id, original: entry.file.name, next: name, problems };
    });

    const counts = new Map<string, number>();
    for (const row of draft) {
      const key = row.next.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return draft.map((row) => ({
      ...row,
      problems: (counts.get(row.next.toLowerCase()) ?? 0) > 1 ? [...row.problems, '与其它文件重名'] : row.problems,
    }));
  }, [entries, prefix, suffix, find, replace, caseMode, startNumber, stepNumber, padNumber, indexPosition, separator]);

  const changedCount = useMemo(() => rows.filter((row) => row.original !== row.next).length, [rows]);
  const hasIssues = rows.some((row) => row.problems.length > 0);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const list = Array.from(incoming);
    setEntries((previous) => [
      ...previous,
      ...list.map((file) => ({ id: idRef.current++, file })),
    ]);
    setError(null);
  };

  const resetRules = () => {
    setPrefix('');
    setSuffix('');
    setFind('');
    setReplace('');
    setIndexPosition('suffix');
    setStart('1');
    setPad('3');
    setStep('1');
    setIndexSeparator('-');
    setCaseMode('none');
    setZipName('renamed-files');
    setError(null);
  };

  const handleDownload = async () => {
    if (building) return;
    if (entries.length === 0) {
      setError('请先选择需要重命名的文件');
      return;
    }
    if (hasIssues) {
      setError('预览中存在不合法的文件名，请调整规则后重试');
      return;
    }
    setError(null);
    setBuilding(true);
    setProgress(0);
    try {
      const zip = new JSZip();
      for (const row of rows) {
        const entry = entries.find((item) => item.id === row.id);
        if (entry) zip.file(row.next, entry.file);
      }
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/zip' },
        (metadata) => setProgress(Math.min(100, Math.round(metadata.percent))),
      );
      const name = normalizeZipName(zipName);
      download(blob, name);
      toast.success(`已生成 ${name}，包含 ${rows.length} 个文件`);
    } catch (buildError) {
      setError(`打包失败：${errorMessage(buildError)}`);
    } finally {
      setBuilding(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <Alert tone="info" title="浏览器无法直接修改本地文件名">
        出于安全限制，网页不能重命名你磁盘上的文件。本工具会按规则生成新的文件名，并把重命名后的副本打包成 ZIP 下载；解压后即可得到新名称的文件。
      </Alert>

      <Panel
        title="选择文件"
        description="可一次选择多个文件，所有处理都在本机完成。"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{formatNumber(entries.length)} 个文件</Badge>
              <Badge tone="brand">共 {formatBytes(sourceSize)}</Badge>
            </div>
            <Button variant="ghost" size="sm" icon={X} disabled={entries.length === 0} onClick={() => setEntries([])}>
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
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            dragging ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10' : 'border-[var(--card-border)] bg-[var(--hover-bg)]',
          )}
        >
          <span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <UploadCloud className="size-6" />
          </span>
          <p className="text-sm font-medium">拖拽文件到这里，或点击选择</p>
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

        {entries.length === 0 ? (
          <EmptyState className="mt-4" icon={Files} title="还没有选择文件" description="选择文件后，下方会实时显示重命名前后的对照。" />
        ) : (
          <ul className="mt-4 max-h-56 divide-y overflow-auto rounded-xl border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Files className="size-4 shrink-0 text-indigo-500" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.file.name}>
                  {entry.file.name}
                </span>
                <span className="shrink-0 text-xs subtle">{formatBytes(entry.file.size)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`移除 ${entry.file.name}`}
                  onClick={() => setEntries((previous) => previous.filter((item) => item.id !== entry.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="重命名规则"
        description="规则按顺序生效：查找替换 → 大小写 → 序号 → 前缀/后缀 → 保留原扩展名。"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={Download} loading={building} disabled={entries.length === 0 || hasIssues} onClick={() => void handleDownload()}>
              下载重命名 ZIP
            </Button>
            <Button variant="ghost" size="sm" icon={Eraser} onClick={resetRules}>
              重置规则
            </Button>
            <Hint>文件名冲突或含非法字符时无法下载，请先根据预览修正规则。</Hint>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="前缀" htmlFor="br-prefix">
            <Input id="br-prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="例如 2025_" />
          </Field>
          <Field label="后缀" htmlFor="br-suffix">
            <Input id="br-suffix" value={suffix} onChange={(event) => setSuffix(event.target.value)} placeholder="例如 _final" />
          </Field>
          <Field label="大小写" htmlFor="br-case">
            <Select id="br-case" value={caseMode} onChange={(event) => setCaseMode(event.target.value as CaseMode)}>
              <option value="none">保持原样</option>
              <option value="lower">转为小写</option>
              <option value="upper">转为大写</option>
            </Select>
          </Field>
          <Field label="查找（不含扩展名）" htmlFor="br-find">
            <Input id="br-find" value={find} onChange={(event) => setFind(event.target.value)} placeholder="留空则不替换" />
          </Field>
          <Field label="替换为" htmlFor="br-replace">
            <Input id="br-replace" value={replace} onChange={(event) => setReplace(event.target.value)} placeholder="留空则删除匹配内容" />
          </Field>
          <Field label="序号位置" htmlFor="br-position">
            <Select id="br-position" value={indexPosition} onChange={(event) => setIndexPosition(event.target.value as IndexPosition)}>
              <option value="none">不使用序号</option>
              <option value="prefix">序号在前</option>
              <option value="suffix">序号在后</option>
              <option value="replace">序号替代原名</option>
            </Select>
          </Field>
          <Field label="起始序号" htmlFor="br-start">
            <Input id="br-start" type="number" min={0} value={start} onChange={(event) => setStart(event.target.value)} disabled={!useIndex} />
          </Field>
          <Field label="序号位数（补零）" htmlFor="br-pad">
            <Input id="br-pad" type="number" min={1} max={12} value={pad} onChange={(event) => setPad(event.target.value)} disabled={!useIndex} />
          </Field>
          <Field label="序号步长" htmlFor="br-step">
            <Input id="br-step" type="number" min={1} value={step} onChange={(event) => setStep(event.target.value)} disabled={!useIndex} />
          </Field>
          <Field label="序号分隔符" htmlFor="br-sep" hint="仅在序号前置/后置时使用">
            <Input id="br-sep" value={indexSeparator} onChange={(event) => setIndexSeparator(event.target.value)} disabled={!useIndex || indexPosition === 'replace'} />
          </Field>
          <Field label="ZIP 文件名" htmlFor="br-zip">
            <Input id="br-zip" value={zipName} onChange={(event) => setZipName(event.target.value)} placeholder="renamed-files" />
          </Field>
          <Field label="预览示例">
            <div className="rounded-xl border bg-[var(--hover-bg)] px-3.5 py-2.5 font-mono text-xs break-all">
              {rows[0] ? rows[0].next : '例如：photo-001.jpg'}
            </div>
          </Field>
        </div>

        {progress !== null ? (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs subtle">正在打包… {progress}%</p>
          </div>
        ) : null}

        {error ? (
          <Alert tone="error" title="无法生成压缩包" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Switch checked={useIndex} onChange={(value) => setIndexPosition(value ? 'suffix' : 'none')} label="启用序号" />
          <Badge tone={changedCount > 0 ? 'success' : 'default'}>{formatNumber(changedCount)} 个将被重命名</Badge>
          {hasIssues ? <Badge tone="danger">存在命名问题</Badge> : null}
        </div>
      </Panel>

      <Panel title="实时预览" description={entries.length > 0 ? `共 ${formatNumber(rows.length)} 个文件，按当前规则生成的文件名如下` : '选择文件后显示预览'}>
        {entries.length === 0 ? (
          <p className="text-sm muted">还没有文件，请先在上方选择。</p>
        ) : (
          <ul className="max-h-[26rem] divide-y overflow-auto rounded-xl border">
            {rows.map((row) => {
              const changed = row.original !== row.next;
              return (
                <li key={row.id} className={cn('px-4 py-2.5', row.problems.length > 0 && 'bg-rose-50/60 dark:bg-rose-500/5')}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono muted" title={row.original}>
                      {row.original}
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-slate-400" />
                    <span className={cn('min-w-0 flex-1 truncate font-mono font-medium', changed ? 'text-indigo-600 dark:text-indigo-400' : 'muted')} title={row.next}>
                      {row.next || '（空）'}
                    </span>
                  </div>
                  {row.problems.length > 0 ? <p className="mt-1 text-[11px] text-rose-500">{row.problems.join('；')}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
