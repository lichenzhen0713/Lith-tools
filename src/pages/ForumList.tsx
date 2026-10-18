import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, MessageSquare, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import type { ForumDTO } from '@shared/types';
import { errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatNumber, relativeTime } from '../lib/utils';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  Textarea,
} from '../components/ui';

interface ForumForm {
  id: number | null;
  name: string;
  description: string;
}

const EMPTY_FORM: ForumForm = { id: null, name: '', description: '' };

export default function ForumList() {
  useDocumentTitle('论坛');
  const { user } = useAuth();
  const toast = useToast();
  const forums = useApi(() => http.get<{ items: ForumDTO[] }>('/api/forum/forums'), []);

  const [managerOpen, setManagerOpen] = useState(false);
  const [form, setForm] = useState<ForumForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ForumDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = user?.role === 2;
  const items = forums.data?.items ?? [];

  const openManager = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setManagerOpen(true);
  };

  const closeManager = () => {
    if (saving) return;
    setManagerOpen(false);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const saveForum = async () => {
    const name = form.name.trim();
    const description = form.description.trim();
    if (!name) {
      setFormError('请输入板块名称');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (form.id === null) {
        await http.post('/api/forum/forums', { name, description });
        toast.success('板块已创建');
      } else {
        await http.patch(`/api/forum/forums/${form.id}`, { name, description });
        toast.success('板块已更新');
      }
      setForm(EMPTY_FORM);
      forums.reload();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteForum = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await http.delete(`/api/forum/forums/${pendingDelete.id}`);
      toast.success('板块已删除');
      if (form.id === pendingDelete.id) setForm(EMPTY_FORM);
      setPendingDelete(null);
      forums.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="社区"
        title="论坛"
        description="提问、分享经验、讨论工具用法。发帖前请先浏览已有主题，内容为纯文本，支持换行。"
        actions={
          <>
            <Link to="/feedback" className="btn-secondary btn-sm">
              意见反馈
            </Link>
            {canManage ? (
              <Button size="sm" variant="secondary" icon={Settings} onClick={openManager}>
                管理板块
              </Button>
            ) : null}
          </>
        }
      />

      {!user ? (
        <Alert tone="info" className="mt-6" title="登录后即可参与讨论">
          <p>
            已有账号？请先
            <Link to="/login?next=%2Fforum" className="link mx-1">
              登录
            </Link>
            ，或
            <Link to="/register" className="link mx-1">
              注册新账号
            </Link>
            ，之后即可发起主题与回复。
          </p>
        </Alert>
      ) : null}

      <div className="mt-6">
        {forums.loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-44" />
            ))}
          </div>
        ) : forums.error ? (
          <EmptyState
            icon={AlertTriangle}
            title="板块加载失败"
            description={forums.error}
            action={
              <Button variant="secondary" icon={AlertTriangle} onClick={() => forums.reload()}>
                重新加载
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="还没有任何板块"
            description="论坛板块尚未创建，稍后再来看看，或者联系管理员开设新的板块。"
            action={
              canManage ? (
                <Button icon={Plus} onClick={openManager}>
                  创建第一个板块
                </Button>
              ) : (
                <Link to="/feedback" className="btn-secondary">
                  提出板块建议
                </Link>
              )
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((forum) => (
              <Link
                key={forum.id}
                to={`/forum/${forum.id}`}
                className="card group flex flex-col gap-4 p-5 transition-colors hover:border-indigo-200 dark:hover:border-indigo-500/30"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    <MessageSquare className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium tracking-tight transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {forum.name}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed subtle">
                      {forum.description || '这个板块还没有描述。'}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </div>

                <dl className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-center">
                  <div>
                    <dt className="text-[11px] subtle">主题</dt>
                    <dd className="mt-0.5 text-sm font-medium">{formatNumber(forum.threadCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] subtle">回复</dt>
                    <dd className="mt-0.5 text-sm font-medium">{formatNumber(forum.postCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] subtle">最近活动</dt>
                    <dd className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                      {forum.lastActivityAt ? relativeTime(forum.lastActivityAt) : '暂无'}
                    </dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={managerOpen}
        onClose={closeManager}
        title="管理板块"
        description="创建、重命名或删除论坛板块。删除板块会一并移除其下的主题与回复。"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeManager}>
              关闭
            </Button>
            <Button type="submit" form="forum-manage-form" loading={saving} icon={form.id === null ? Plus : Pencil}>
              {form.id === null ? '创建板块' : '保存修改'}
            </Button>
          </>
        }
      >
        <form
          id="forum-manage-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveForum();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{form.id === null ? '新建板块' : '编辑板块'}</h3>
            {form.id !== null ? (
              <button
                type="button"
                className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setFormError(null);
                }}
              >
                取消编辑
              </button>
            ) : null}
          </div>
          <Field label="板块名称" htmlFor="forum-name" required>
            <Input
              id="forum-name"
              value={form.name}
              maxLength={80}
              placeholder="例如：使用技巧"
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            />
          </Field>
          <Field label="板块描述" htmlFor="forum-description" hint="最多 500 字，用于在论坛列表中说明板块用途。">
            <Textarea
              id="forum-description"
              value={form.description}
              maxLength={500}
              rows={3}
              placeholder="这个板块用于讨论什么？"
              onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
            />
          </Field>
          {formError ? <p className="text-xs text-rose-500">{formError}</p> : null}
        </form>

        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-semibold">现有板块（{items.length}）</h3>
          {items.length === 0 ? (
            <p className="mt-3 text-sm subtle">还没有板块，先在上方创建一个吧。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((forum) => (
                <li key={forum.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{forum.name}</p>
                    <p className="truncate text-xs subtle">
                      {formatNumber(forum.threadCount)} 主题 · {formatNumber(forum.postCount)} 回复
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Pencil}
                      onClick={() => {
                        setForm({ id: forum.id, name: forum.name, description: forum.description });
                        setFormError(null);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      className="text-rose-600 dark:text-rose-400"
                      onClick={() => setPendingDelete(forum)}
                    >
                      删除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title="删除板块"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void deleteForum()}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">
          确定要删除板块「{pendingDelete?.name}」吗？该板块下的 {pendingDelete?.threadCount ?? 0} 个主题及相关回复也会被移除，此操作不可撤销。
        </p>
      </Modal>
    </div>
  );
}
