import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock,
  Eye,
  Heart,
  Lock,
  MessageSquare,
  Pencil,
  RotateCw,
  Send,
  Trash2,
} from 'lucide-react';
import type { BlogCommentDTO, BlogDetail as BlogPostDetail, Paginated } from '@shared/types';
import { ApiError, errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { cn, formatDate, formatNumber, relativeTime } from '../lib/utils';
import { Markdown } from '../components/Markdown';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Pagination,
  Skeleton,
  Textarea,
  useFieldId,
} from '../components/ui';

const COMMENT_PAGE_SIZE = 5;

function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

export default function BlogDetail() {
  const { id = '' } = useParams();
  const postId = Number.parseInt(id, 10);
  const validId = Number.isInteger(postId) && postId > 0;

  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const post = useApi<BlogPostDetail>(
    async () => {
      try {
        const data = await http.get<BlogPostDetail>(`/api/blog/posts/${postId}`);
        setErrorStatus(null);
        return data;
      } catch (error) {
        setErrorStatus(error instanceof ApiError ? error.status : null);
        throw error;
      }
    },
    [postId],
    { enabled: validId },
  );

  const [commentPage, setCommentPage] = useState(1);
  const comments = useApi<Paginated<BlogCommentDTO>>(
    () => http.get<Paginated<BlogCommentDTO>>(`/api/blog/posts/${postId}/comments?page=${commentPage}&pageSize=${COMMENT_PAGE_SIZE}`),
    [postId, commentPage],
    { enabled: validId },
  );

  /* ------------------------------------------------------------------ actions */
  const [likeLoading, setLikeLoading] = useState(false);
  const [postDeleteOpen, setPostDeleteOpen] = useState(false);
  const [postDeleting, setPostDeleting] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlogCommentDTO | null>(null);
  const [commentDeleting, setCommentDeleting] = useState(false);
  const commentFieldId = useFieldId('blog-comment');

  const detail = post.data;
  useDocumentTitle(detail?.title ?? '博客');

  // Deleting the last comment of the last page leaves an out-of-range page behind.
  useEffect(() => {
    const totalPages = comments.data?.totalPages;
    if (!totalPages || commentPage <= totalPages) return;
    setCommentPage(totalPages);
  }, [comments.data, commentPage]);

  const toggleLike = async () => {
    if (!user) {
      toast.info('登录后才能点赞');
      navigate(loginHref(`/blog/${postId}`));
      return;
    }
    setLikeLoading(true);
    try {
      const result = await http.post<{ liked: boolean; likes: number }>(`/api/blog/posts/${postId}/like`);
      if (detail) post.setData({ ...detail, likedByMe: result.liked, likes: result.likes });
      toast.success(result.liked ? '点赞成功' : '已取消点赞');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLikeLoading(false);
    }
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = commentText.trim();
    if (!value) {
      setCommentError('请输入评论内容');
      return;
    }
    if (value.length > 2000) {
      setCommentError('评论最多 2000 字');
      return;
    }
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      await http.post<{ comment: BlogCommentDTO }>(`/api/blog/posts/${postId}/comments`, { comment: value });
      setCommentText('');
      if (detail) post.setData({ ...detail, comments: detail.comments + 1 });
      setCommentPage(1);
      comments.reload();
      toast.success('评论已发表');
    } catch (error) {
      setCommentError(errorMessage(error));
    } finally {
      setCommentSubmitting(false);
    }
  };

  const confirmDeleteComment = async () => {
    if (!deleteTarget) return;
    setCommentDeleting(true);
    try {
      await http.delete<{ message: string }>(`/api/blog/comments/${deleteTarget.id}`);
      setDeleteTarget(null);
      if (detail) post.setData({ ...detail, comments: Math.max(0, detail.comments - 1) });
      comments.reload();
      toast.success('评论已删除');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCommentDeleting(false);
    }
  };

  const confirmDeletePost = async () => {
    setPostDeleting(true);
    try {
      await http.delete<{ message: string }>(`/api/blog/posts/${postId}`);
      setPostDeleteOpen(false);
      toast.success('文章已删除');
      navigate('/blog', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPostDeleting(false);
    }
  };

  /* ---------------------------------------------------------------- bad route */
  if (!validId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={AlertTriangle}
          title="文章地址无效"
          description="链接中的文章编号不正确，请从博客列表重新进入。"
          action={
            <Link to="/blog" className="btn-primary">
              <ArrowLeft className="size-4" /> 返回博客列表
            </Link>
          }
        />
      </div>
    );
  }

  /* -------------------------------------------------------------------- error */
  if (post.error) {
    const notFound = errorStatus === 404;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={notFound ? AlertTriangle : Lock}
          title={notFound ? '文章不存在或未公开' : errorStatus === 403 ? '没有访问权限' : '文章加载失败'}
          description={post.error}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/blog" className="btn-primary">
                <ArrowLeft className="size-4" /> 返回博客列表
              </Link>
              {!user && notFound ? (
                <Link to={loginHref(`/blog/${postId}`)} className="btn-secondary">
                  去登录
                </Link>
              ) : (
                <Button variant="secondary" icon={RotateCw} onClick={post.reload}>
                  重试
                </Button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  /* ------------------------------------------------------------------ loading */
  if (post.loading || !detail) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-9 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const commentItems = comments.data?.items ?? [];
  const commentTotal = comments.data?.total ?? detail.comments;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm muted transition-colors hover:text-[var(--text-primary)]">
        <ArrowLeft className="size-4" /> 返回博客列表
      </Link>

      {/* ------------------------------------------------------------- header */}
      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          {detail.category ? <Badge tone="brand">{detail.category.name}</Badge> : <Badge>未分类</Badge>}
          {!detail.isPublic ? (
            <Badge tone="warning">
              <Lock className="size-3" /> 私有文章
            </Badge>
          ) : null}
        </div>

        <h1 className="mt-3 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{detail.title}</h1>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={detail.author.username} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{detail.author.username}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs subtle">
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3.5" /> 创建于 {formatDate(detail.createdAt, 'datetime')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" /> 更新于 {formatDate(detail.updatedAt, 'datetime')}
                </span>
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {detail.canEdit ? (
              <Link to={`/blog/${detail.id}/edit`} className="btn-secondary btn-sm">
                <Pencil className="size-3.5" /> 编辑
              </Link>
            ) : null}
            {detail.canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                onClick={() => setPostDeleteOpen(true)}
              >
                删除
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-sm subtle">
        <span className="flex items-center gap-1.5">
          <Eye className="size-4" /> {formatNumber(detail.views)} 阅读
        </span>
        <span className="flex items-center gap-1.5">
          <MessageSquare className="size-4" /> {formatNumber(detail.comments)} 评论
        </span>
        <span className="flex items-center gap-1.5">
          <Heart className={cn('size-4', detail.likedByMe && 'fill-rose-500 text-rose-500')} /> {formatNumber(detail.likes)} 赞
        </span>
      </div>

      {/* --------------------------------------------------------------- body */}
      <article className="card mt-6 px-5 py-6 sm:px-8 sm:py-8">
        <Markdown content={detail.content} />
      </article>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          variant={detail.likedByMe ? 'soft' : 'secondary'}
          icon={Heart}
          loading={likeLoading}
          onClick={toggleLike}
          className={cn(detail.likedByMe && 'border-rose-200 text-rose-600 dark:border-rose-500/30 dark:text-rose-300')}
        >
          {detail.likedByMe ? '已点赞' : '点赞'} · {formatNumber(detail.likes)}
        </Button>
        <p className="text-xs subtle">{user ? '你的支持是作者继续分享的动力' : '登录后即可点赞与评论'}</p>
      </div>

      {/* ----------------------------------------------------------- comments */}
      <section className="mt-12" aria-label="评论区">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <MessageSquare className="size-4 text-indigo-500" /> 评论
            <span className="text-sm font-normal subtle">{formatNumber(commentTotal)}</span>
          </h2>
          {user ? null : (
            <Link to={loginHref(`/blog/${detail.id}`)} className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
              登录后参与讨论
            </Link>
          )}
        </div>

        {user ? (
          <form onSubmit={submitComment} className="card mt-4 p-4">
            <Field label="发表评论" htmlFor={commentFieldId} error={commentError} hint="支持 Markdown，最多 2000 字">
              <Textarea
                id={commentFieldId}
                value={commentText}
                onChange={(event) => {
                  setCommentText(event.target.value);
                  if (commentError) setCommentError(null);
                }}
                placeholder="说说你的看法…"
                maxLength={2000}
                rows={3}
                error={Boolean(commentError)}
              />
            </Field>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs subtle">{commentText.length} / 2000</span>
              <Button type="submit" size="sm" icon={Send} loading={commentSubmitting} disabled={!commentText.trim()}>
                发表评论
              </Button>
            </div>
          </form>
        ) : (
          <Alert tone="info" className="mt-4" title="登录后可以评论和点赞">
            <span>使用账号登录即可参与讨论，还没有账号？</span>
            <Link to="/register" className="ml-1 font-medium underline underline-offset-2">
              免费注册
            </Link>
          </Alert>
        )}

        {comments.error ? (
          <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="size-4" /> {comments.error}
            </span>
            <Button variant="secondary" size="sm" icon={RotateCw} onClick={comments.reload}>
              重试
            </Button>
          </div>
        ) : comments.loading && !comments.data ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="card flex gap-3 p-4">
                <Skeleton className="size-7 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : commentItems.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="还没有评论"
            description={user ? '成为第一个发表看法的人。' : '登录后即可发表第一条评论。'}
            className="mt-4 py-10"
          />
        ) : (
          <>
            <ul className="card mt-4 divide-y">
              {commentItems.map((comment) => (
                <li key={comment.id} className="flex gap-3 px-4 py-4">
                  <Avatar name={comment.author.username} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{comment.author.username}</span>
                      {(comment.author.role ?? 0) >= 1 ? <Badge tone="brand">管理员</Badge> : null}
                      <span className="text-xs subtle" title={formatDate(comment.createdAt, 'datetime')}>
                        {relativeTime(comment.createdAt)}
                      </span>
                      {comment.canDelete ? (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(comment)}
                          className="ml-auto rounded p-1 text-slate-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                          aria-label="删除评论"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <Markdown content={comment.content} className="mt-1.5 text-sm leading-relaxed" />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              className="mt-5"
              page={comments.data?.page ?? 1}
              totalPages={comments.data?.totalPages ?? 1}
              onChange={setCommentPage}
            />
          </>
        )}
      </section>

      <div className="mt-10 flex items-center justify-between border-t pt-5 text-sm">
        <Link to="/blog" className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <ArrowLeft className="size-4" /> 返回博客列表
        </Link>
        <Link
          to={user && user.role >= 1 ? '/blog/new' : user ? '/submit/blog' : loginHref('/submit/blog')}
          className="text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {user && user.role >= 1 ? '写一篇文章' : '投稿一篇文章'}
        </Link>
      </div>

      {/* --------------------------------------------------------------- modals */}
      <Modal
        open={postDeleteOpen}
        onClose={() => setPostDeleteOpen(false)}
        title="删除这篇文章？"
        description="删除后文章、点赞和评论都将无法恢复。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPostDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" icon={Trash2} loading={postDeleting} onClick={confirmDeletePost}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">
          即将删除《{detail.title}》，此操作不可撤销。
        </p>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="删除这条评论？"
        description="删除后无法恢复。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="danger" icon={Trash2} loading={commentDeleting} onClick={confirmDeleteComment}>
              确认删除
            </Button>
          </>
        }
      >
        <div className="rounded-xl border bg-[var(--hover-bg)] px-3 py-2 text-sm muted">
          {deleteTarget ? <span className="line-clamp-4">{deleteTarget.content}</span> : null}
        </div>
      </Modal>
    </div>
  );
}
