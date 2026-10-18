import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import type { ForumThreadPostDTO, ThreadDetail } from '@shared/types';
import { errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate } from '../lib/utils';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  Pagination,
  Skeleton,
  Textarea,
} from '../components/ui';

const PAGE_SIZE = 20;

export default function ThreadView() {
  const { id } = useParams<{ id: string }>();
  const threadId = Number(id);
  const validId = Number.isInteger(threadId) && threadId > 0;

  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const detail = useApi(
    () => http.get<ThreadDetail>(`/api/forum/threads/${threadId}?page=${page}&pageSize=${PAGE_SIZE}`),
    [threadId, page],
    { enabled: validId },
  );

  const data = detail.data;
  const thread = data?.thread;
  const posts = data?.posts;
  useDocumentTitle(thread?.title ?? '主题');

  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);

  const [editTarget, setEditTarget] = useState<ForumThreadPostDTO | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletePost, setDeletePost] = useState<ForumThreadPostDTO | null>(null);
  const [deletingPost, setDeletingPost] = useState(false);
  const [deleteThreadOpen, setDeleteThreadOpen] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);

  const setPage = (next: number) => {
    const merged = new URLSearchParams(params);
    if (next <= 1) merged.delete('page');
    else merged.set('page', String(next));
    setParams(merged, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loginHref = `/login?next=${encodeURIComponent(`/forum/thread/${validId ? threadId : ''}`)}`;

  const submitReply = async () => {
    const content = reply.trim();
    if (!content) {
      setReplyError('请输入回复内容');
      return;
    }
    setReplying(true);
    setReplyError(null);
    try {
      await http.post<{ postId: number }>(`/api/forum/threads/${threadId}/posts`, { content });
      toast.success('回复已发布');
      setReply('');
      const total = (posts?.total ?? 0) + 1;
      const lastPage = Math.max(1, Math.ceil(total / (posts?.pageSize ?? PAGE_SIZE)));
      if (lastPage === page) detail.reload();
      else setPage(lastPage);
    } catch (error) {
      const message = errorMessage(error);
      setReplyError(message);
      toast.error(message);
    } finally {
      setReplying(false);
    }
  };

  const openEdit = (post: ForumThreadPostDTO) => {
    setEditTarget(post);
    setEditContent(post.content);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const content = editContent.trim();
    if (!content) {
      setEditError('回复内容不能为空');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await http.patch(`/api/forum/posts/${editTarget.id}`, { content });
      toast.success('回复已更新');
      setEditTarget(null);
      detail.reload();
    } catch (error) {
      setEditError(errorMessage(error));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDeletePost = async () => {
    if (!deletePost) return;
    setDeletingPost(true);
    try {
      await http.delete(`/api/forum/posts/${deletePost.id}`);
      toast.success('回复已删除');
      setDeletePost(null);
      if ((posts?.items.length ?? 0) <= 1 && page > 1) setPage(page - 1);
      else detail.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingPost(false);
    }
  };

  const confirmDeleteThread = async () => {
    if (!thread) return;
    setDeletingThread(true);
    try {
      await http.delete(`/api/forum/threads/${thread.id}`);
      toast.success('主题已删除');
      setDeleteThreadOpen(false);
      navigate(`/forum/${thread.forumId}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingThread(false);
    }
  };

  if (!validId || (detail.error && !detail.loading)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={AlertTriangle}
          title="主题不存在"
          description={validId ? detail.error ?? '该主题可能已被删除。' : '主题地址不正确。'}
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

  if (detail.loading && !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-10 sm:px-6 sm:py-14">
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-28" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const canDeleteThread = Boolean(user && (user.id === data.thread.author.id || user.role === 2));
  const startIndex = (data.posts.page - 1) * data.posts.pageSize;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs subtle" aria-label="面包屑">
        <Link to="/" className="transition-colors hover:text-[var(--text-primary)]">
          首页
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/forum" className="transition-colors hover:text-[var(--text-primary)]">
          论坛
        </Link>
        <ChevronRight className="size-3" />
        <Link
          to={`/forum/${data.forum.id}`}
          className="max-w-40 truncate transition-colors hover:text-[var(--text-primary)]"
        >
          {data.forum.name}
        </Link>
        <ChevronRight className="size-3" />
        <span className="max-w-52 truncate text-[var(--text-primary)]">{data.thread.title}</span>
      </nav>

      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl leading-snug font-semibold tracking-tight sm:text-2xl">{data.thread.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs subtle">
              <span className="flex items-center gap-1.5">
                <Avatar name={data.thread.author.username} size="sm" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{data.thread.author.username}</span>
              </span>
              <span>发表于 {formatDate(data.thread.createdAt, 'datetime')}</span>
              <Link to={`/forum/${data.forum.id}`}>
                <Badge tone="brand">{data.forum.name}</Badge>
              </Link>
              <Badge>{data.posts.total} 条回复</Badge>
            </div>
          </div>
          {canDeleteThread ? (
            <Button variant="ghost" size="sm" icon={Trash2} className="text-rose-600 dark:text-rose-400" onClick={() => setDeleteThreadOpen(true)}>
              删除主题
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="mt-5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">全部回复</h2>
        <p className="text-xs subtle">
          第 {data.posts.page} / {data.posts.totalPages} 页
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {(data.posts.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="还没有回复"
            description="抢占第一条回复，说说你的想法。"
          />
        ) : (
          data.posts.items.map((post, index) => {
            const floor = startIndex + index + 1;
            const isOwn = user?.id === post.author.id;
            return (
              <article key={post.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                  <Avatar name={post.author.username} size="sm" />
                  <span className="text-sm font-medium">{post.author.username}</span>
                  {post.author.role === 2 ? (
                    <Badge tone="danger">超级管理员</Badge>
                  ) : post.author.role === 1 ? (
                    <Badge tone="brand">管理员</Badge>
                  ) : null}
                  {isOwn ? <Badge>你</Badge> : null}
                  <span className="text-xs subtle">{formatDate(post.createdAt, 'datetime')}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {isOwn ? (
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(post)}>
                        编辑
                      </Button>
                    ) : null}
                    {post.canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        className="text-rose-600 dark:text-rose-400"
                        onClick={() => setDeletePost(post)}
                      >
                        删除
                      </Button>
                    ) : null}
                    <span className="rounded-md bg-[var(--hover-bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      #{floor}
                    </span>
                  </span>
                </div>
                <div className="px-4 py-4 text-sm leading-7 break-words whitespace-pre-wrap">{post.content}</div>
              </article>
            );
          })
        )}
      </div>

      <Pagination className="mt-6" page={data.posts.page} totalPages={data.posts.totalPages} onChange={setPage} />

      <Card className="mt-8">
        <CardHeader
          title="回复主题"
          description={user ? '内容为纯文本，换行会被保留，请保持友善与专注。' : '登录后即可回复本主题。'}
        />
        <div className="p-5">
          {user ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submitReply();
              }}
            >
              <Textarea
                value={reply}
                rows={5}
                maxLength={20000}
                placeholder="写下你的回复…"
                onChange={(event) => setReply(event.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs subtle">{reply.length} / 20000</p>
                <Button type="submit" icon={Send} loading={replying} disabled={!reply.trim()}>
                  发布回复
                </Button>
              </div>
              {replyError ? <p className="text-xs text-rose-500">{replyError}</p> : null}
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm muted">加入讨论，与其他用户交流使用心得。</p>
              <Link to={loginHref} className="btn-primary btn-sm">
                登录后回复
              </Link>
            </div>
          )}
          {!user ? (
            <Alert tone="info" className="mt-4">
              回复需要登录账号，登录后返回本页即可继续。
            </Alert>
          ) : null}
        </div>
      </Card>

      <Modal
        open={Boolean(editTarget)}
        onClose={() => {
          if (!savingEdit) setEditTarget(null);
        }}
        title="编辑回复"
        description="修改后会立即显示在主题中。"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={savingEdit}>
              取消
            </Button>
            <Button loading={savingEdit} onClick={() => void saveEdit()}>
              保存修改
            </Button>
          </>
        }
      >
        <Textarea
          value={editContent}
          rows={10}
          maxLength={20000}
          onChange={(event) => setEditContent(event.target.value)}
        />
        <p className="mt-2 text-xs subtle">{editContent.length} / 20000</p>
        {editError ? <p className="mt-1 text-xs text-rose-500">{editError}</p> : null}
      </Modal>

      <Modal
        open={Boolean(deletePost)}
        onClose={() => {
          if (!deletingPost) setDeletePost(null);
        }}
        title="删除回复"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletePost(null)} disabled={deletingPost}>
              取消
            </Button>
            <Button variant="danger" loading={deletingPost} onClick={() => void confirmDeletePost()}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">
          确定要删除 {deletePost?.author.username} 的这条回复吗？删除后无法恢复。
        </p>
      </Modal>

      <Modal
        open={deleteThreadOpen}
        onClose={() => {
          if (!deletingThread) setDeleteThreadOpen(false);
        }}
        title="删除主题"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteThreadOpen(false)} disabled={deletingThread}>
              取消
            </Button>
            <Button variant="danger" loading={deletingThread} onClick={() => void confirmDeleteThread()}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">
          确定要删除主题「{data.thread.title}」吗？主题下的 {data.posts.total} 条回复也会一并删除，此操作不可撤销。
        </p>
      </Modal>
    </div>
  );
}
