import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, MessageSquare, Plus, Send } from 'lucide-react';
import type { ForumDTO, Paginated, ThreadListItem } from '@shared/types';
import { errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate, relativeTime } from '../lib/utils';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  Skeleton,
  Textarea,
} from '../components/ui';

interface ForumDetail {
  forum: ForumDTO;
  threads: Paginated<ThreadListItem>;
}

const PAGE_SIZE = 15;

export default function ForumView() {
  const { id } = useParams<{ id: string }>();
  const forumId = Number(id);
  const validId = Number.isInteger(forumId) && forumId > 0;

  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const detail = useApi(
    () => http.get<ForumDetail>(`/api/forum/forums/${forumId}?page=${page}&pageSize=${PAGE_SIZE}`),
    [forumId, page],
    { enabled: validId },
  );

  const forum = detail.data?.forum;
  const threads = detail.data?.threads;
  useDocumentTitle(forum?.name ?? '论坛');

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const setPage = (next: number) => {
    const merged = new URLSearchParams(params);
    if (next <= 1) merged.delete('page');
    else merged.set('page', String(next));
    setParams(merged, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openComposer = () => {
    setTitle('');
    setContent('');
    setFormError(null);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    if (submitting) return;
    setComposerOpen(false);
  };

  const createThread = async () => {
    if (!forum) return;
    if (!title.trim()) {
      setFormError('请输入主题标题');
      return;
    }
    if (!content.trim()) {
      setFormError('请输入主题内容');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await http.post<{ threadId: number }>(`/api/forum/forums/${forum.id}/threads`, {
        title: title.trim(),
        content: content.trim(),
      });
      toast.success('主题已发布');
      setComposerOpen(false);
      setTitle('');
      setContent('');
      navigate(`/forum/thread/${created.threadId}`);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const loginHref = `/login?next=${encodeURIComponent(`/forum/${validId ? forumId : ''}`)}`;

  if (!validId || (detail.error && !detail.loading)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={AlertTriangle}
          title="板块不存在"
          description={validId ? detail.error ?? '该板块可能已被删除。' : '板块地址不正确。'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/forum" className="btn-primary">
                返回论坛首页
              </Link>
              {validId ? (
                <Button variant="secondary" onClick={() => detail.reload()}>
                  重新加载
                </Button>
              ) : null}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs subtle" aria-label="面包屑">
        <Link to="/" className="transition-colors hover:text-[var(--text-primary)]">
          首页
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/forum" className="transition-colors hover:text-[var(--text-primary)]">
          论坛
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-[var(--text-primary)]">{forum?.name ?? '…'}</span>
      </nav>

      {detail.loading && !forum ? (
        <div className="mt-4 space-y-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-14" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : forum ? (
        <>
          <Card className="mt-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{forum.name}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed muted">
                  {forum.description || '这个板块还没有描述。'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{forum.threadCount} 主题</Badge>
                  <Badge>{forum.postCount} 回复</Badge>
                  <span className="text-xs subtle">最近活动：{relativeTime(forum.lastActivityAt)}</span>
                </div>
              </div>
              {user ? (
                <Button icon={Plus} onClick={openComposer}>
                  新建主题
                </Button>
              ) : (
                <Link to={loginHref} className="btn-secondary">
                  登录后发帖
                </Link>
              )}
            </div>
          </Card>

          {!user ? (
            <Alert tone="info" className="mt-4" title="登录后可发起主题与回复">
              <p>
                <Link to={loginHref} className="link">
                  登录
                </Link>
                <span className="mx-1">或</span>
                <Link to="/register" className="link">
                  注册
                </Link>
                后即可参与讨论。
              </p>
            </Alert>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">主题列表</h2>
            <p className="text-xs subtle">共 {threads?.total ?? 0} 个主题</p>
          </div>

          <Card className="mt-3 overflow-hidden">
            {detail.loading ? (
              <div className="divide-y">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="px-4 py-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                  </div>
                ))}
              </div>
            ) : (threads?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="这个板块还没有主题"
                description="成为第一个发起讨论的人吧。"
                className="border-0"
                action={
                  user ? (
                    <Button icon={Plus} onClick={openComposer}>
                      新建主题
                    </Button>
                  ) : (
                    <Link to={loginHref} className="btn-primary">
                      登录后发帖
                    </Link>
                  )
                }
              />
            ) : (
              <div className="divide-y">
                {threads?.items.map((thread) => (
                  <Link
                    key={thread.id}
                    to={`/forum/thread/${thread.id}`}
                    className="block px-4 py-3.5 transition-colors hover:bg-[var(--hover-bg)]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--hover-bg)] text-slate-400">
                        <MessageSquare className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{thread.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs subtle">
                          <span>{thread.author.username}</span>
                          <span>· 发表于 {formatDate(thread.createdAt, 'datetime')}</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <p className="font-medium text-[var(--text-secondary)]">{thread.replyCount} 回复</p>
                        <p className="mt-1 subtle">{relativeTime(thread.lastReplyAt ?? thread.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {threads ? (
            <Pagination className="mt-6" page={threads.page} totalPages={threads.totalPages} onChange={setPage} />
          ) : null}
        </>
      ) : null}

      <Modal
        open={composerOpen}
        onClose={closeComposer}
        title="新建主题"
        description={`发布到「${forum?.name ?? '当前板块'}」，内容为纯文本，支持换行。`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeComposer} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" form="new-thread-form" icon={Send} loading={submitting}>
              发布主题
            </Button>
          </>
        }
      >
        <form
          id="new-thread-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createThread();
          }}
        >
          <Field label="标题" htmlFor="thread-title" required hint="最多 200 字，请概括主题内容。">
            <Input
              id="thread-title"
              value={title}
              maxLength={200}
              placeholder="用一句话描述你的问题或话题"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="内容" htmlFor="thread-content" required hint="最多 20000 字，换行会被保留。">
            <Textarea
              id="thread-content"
              value={content}
              maxLength={20000}
              rows={8}
              placeholder="详细描述你的问题、已尝试的方法或想讨论的内容…"
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
          <p className="text-xs subtle">{content.length} / 20000</p>
          {formError ? <p className="text-xs text-rose-500">{formError}</p> : null}
        </form>
      </Modal>
    </div>
  );
}
