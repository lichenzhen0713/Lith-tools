import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FilePlus2, FileText, Search, StickyNote, Trash2 } from 'lucide-react';
import { Hint, Input, Panel, Textarea } from './kit';
import { Alert, Badge, Button, EmptyState, Modal } from '../components/ui';
import { cn, download, formatDate, formatNumber, truncate, uid } from '../lib/utils';
import { useDebouncedValue, useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

const STORAGE_KEY = 'lith-notepad-notes';
const MAX_NOTES = 200;
const MAX_TITLE = 60;
const MAX_CONTENT = 20_000;
const SAVE_DELAY = 600;

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

interface Draft {
  id: string;
  title: string;
  content: string;
}

function displayTitle(note: Note): string {
  return note.title.trim() || '未命名笔记';
}

export default function NotepadTool() {
  const toast = useToast();
  const [notes, setNotes] = useLocalStorage<Note[]>(STORAGE_KEY, []);
  const [selectedId, setSelectedId] = useState<string | null>(() => notes[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(() => {
    const first = notes[0];
    return first ? { id: first.id, title: first.title, content: first.content } : null;
  });
  const [query, setQuery] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selected = useMemo(() => notes.find((note) => note.id === selectedId) ?? null, [notes, selectedId]);

  /** Persist a draft into the notes array (pure updater, safe to call repeatedly). */
  const commitDraft = useCallback(
    (value: Draft | null) => {
      if (!value) return;
      setNotes((previous) => {
        const target = previous.find((note) => note.id === value.id);
        if (!target) return previous;
        if (target.title === value.title && target.content === value.content) return previous;
        return previous.map((note) =>
          note.id === value.id ? { ...note, title: value.title, content: value.content, updatedAt: Date.now() } : note,
        );
      });
    },
    [setNotes],
  );

  const debouncedDraft = useDebouncedValue(draft, SAVE_DELAY);

  useEffect(() => {
    commitDraft(debouncedDraft);
  }, [commitDraft, debouncedDraft]);

  const dirty = draft !== null && selected !== null && (draft.title !== selected.title || draft.content !== selected.content);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return notes;
    return notes.filter(
      (note) => note.title.toLowerCase().includes(keyword) || note.content.toLowerCase().includes(keyword),
    );
  }, [notes, query]);

  const stats = useMemo(() => {
    const content = draft?.content ?? '';
    const chars = Array.from(content).length;
    const charsNoSpace = Array.from(content.replace(/\s+/g, '')).length;
    const words = content.trim() ? (content.match(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g)?.length ?? 0) : 0;
    const lines = content === '' ? 0 : content.split('\n').length;
    return { chars, charsNoSpace, words, lines };
  }, [draft?.content]);

  const openNote = (note: Note) => {
    if (draft && draft.id === note.id) return;
    commitDraft(draft);
    setSelectedId(note.id);
    setDraft({ id: note.id, title: note.title, content: note.content });
  };

  const createNote = () => {
    if (notes.length >= MAX_NOTES) {
      toast.error(`最多保存 ${MAX_NOTES} 则便签，请先删除不需要的内容`);
      return;
    }
    commitDraft(draft);
    const note: Note = { id: uid('note'), title: '', content: '', updatedAt: Date.now() };
    setNotes((previous) => [note, ...previous]);
    setSelectedId(note.id);
    setDraft({ id: note.id, title: '', content: '' });
    setQuery('');
  };

  const deleteNote = () => {
    if (!selectedId) return;
    const remaining = notes.filter((note) => note.id !== selectedId);
    setNotes(remaining);
    const next = remaining[0] ?? null;
    setSelectedId(next?.id ?? null);
    setDraft(next ? { id: next.id, title: next.title, content: next.content } : null);
    setDeleteOpen(false);
    toast.success('便签已删除');
  };

  const exportNote = () => {
    if (!draft) return;
    const title = draft.title.trim() || '未命名笔记';
    if (draft.content.trim() === '' && draft.title.trim() === '') {
      toast.error('便签内容为空，没有可导出的内容');
      return;
    }
    const safeName = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, MAX_TITLE) || 'note';
    download(`${title}\n\n${draft.content}\n`, `${safeName}.txt`);
    toast.success('已导出 TXT 文件');
  };

  const editorFooter = draft ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs subtle">
        {formatNumber(stats.words)} 字 · {formatNumber(stats.chars)} 字符 · {formatNumber(stats.charsNoSpace)} 非空白字符 ·{' '}
        {formatNumber(stats.lines)} 行
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {dirty ? <Badge tone="warning">保存中…</Badge> : <Badge tone="success">已自动保存</Badge>}
        <Button variant="secondary" size="sm" type="button" icon={Download} onClick={exportNote}>
          导出 .txt
        </Button>
        <Button variant="ghost" size="sm" type="button" icon={Trash2} onClick={() => setDeleteOpen(true)}>
          删除
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <StickyNote className="size-4" /> 便签列表
              {notes.length > 0 ? <Badge>{formatNumber(notes.length)}</Badge> : null}
            </span>
          }
          description={`全部内容仅保存在本机浏览器（最多 ${MAX_NOTES} 则）`}
          footer={
            <Button
              variant="secondary"
              size="sm"
              type="button"
              icon={FilePlus2}
              onClick={createNote}
              disabled={notes.length >= MAX_NOTES}
            >
              新建便签
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={query}
                className="pl-9"
                placeholder="搜索标题或内容"
                aria-label="搜索便签"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {notes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="还没有便签"
                description="点击下方「新建便签」，记录的内容会自动保存在本机。"
                className="py-10"
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title="没有匹配的便签"
                description={`未找到包含「${truncate(query.trim(), 20)}」的便签。`}
                className="py-10"
                action={
                  <Button variant="secondary" size="sm" type="button" onClick={() => setQuery('')}>
                    清除搜索
                  </Button>
                }
              />
            ) : (
              <ul className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                {filtered.map((note) => {
                  const active = note.id === selectedId;
                  const snippet = note.content.replace(/\s+/g, ' ').trim();
                  return (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => openNote(note)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
                          active
                            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                            : 'bg-[var(--hover-bg)] hover:border-indigo-200 dark:hover:border-indigo-500/30',
                        )}
                      >
                        <p className={cn('truncate text-sm font-medium', active && 'text-indigo-700 dark:text-indigo-300')}>
                          {displayTitle(note)}
                        </p>
                        <p className="mt-1 text-xs break-words subtle">{snippet ? truncate(snippet, 48) : '（空便签）'}</p>
                        <p className="mt-1 text-[11px] subtle">
                          {formatDate(new Date(note.updatedAt).toISOString(), 'datetime')}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {query.trim() ? <Hint>搜索同时匹配标题与内容，共命中 {formatNumber(filtered.length)} 则便签。</Hint> : null}
          </div>
        </Panel>

        <Panel
          title="编辑便签"
          description={
            selected
              ? `最后更新：${formatDate(new Date(selected.updatedAt).toISOString(), 'datetime')}`
              : '从左侧选择一则便签开始编辑'
          }
          footer={editorFooter ?? undefined}
        >
          {draft ? (
            <div className="space-y-3">
              <Input
                value={draft.title}
                maxLength={MAX_TITLE}
                className="text-base font-medium"
                placeholder="便签标题（可留空）"
                aria-label="便签标题"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
              <Textarea
                value={draft.content}
                maxLength={MAX_CONTENT}
                className="min-h-[340px] leading-relaxed"
                placeholder="在此输入内容，停止输入 0.6 秒后会自动保存…"
                aria-label="便签内容"
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              />
              {draft.content.length >= MAX_CONTENT ? (
                <Alert tone="warning">内容已达到 {formatNumber(MAX_CONTENT)} 字符上限，超出部分无法输入。</Alert>
              ) : null}
              <Hint>内容自动保存在浏览器 localStorage 中，不会上传服务器；清除浏览器数据会一并删除。</Hint>
            </div>
          ) : (
            <EmptyState
              icon={StickyNote}
              title={notes.length > 0 ? '选择一则便签' : '还没有便签'}
              description={
                notes.length > 0
                  ? '从左侧列表中点击一则便签，即可在这里编辑标题与内容。'
                  : '点击「新建便签」开始记录，内容会自动保存在本机浏览器。'
              }
              action={
                <Button icon={FilePlus2} type="button" onClick={createNote} disabled={notes.length >= MAX_NOTES}>
                  新建便签
                </Button>
              }
            />
          )}
        </Panel>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除便签"
        description={`将删除「${draft?.title.trim() || '未命名笔记'}」，此操作无法撤销。`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={deleteNote}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm muted">删除后内容无法恢复，建议先使用「导出 .txt」备份。</p>
      </Modal>
    </div>
  );
}
