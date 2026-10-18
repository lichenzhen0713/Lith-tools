import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Eye, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { Paginated } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { formatDate, formatNumber } from '../../lib/utils';
import { Alert, Badge, Button, Modal, PageHeader } from '../../components/ui';
import { ADMIN_PAGE_SIZE, TableEmpty, TableError, TablePager, TableSkeleton, useAdminSearch } from './AdminLayout';

interface AdminBlogItem {
  id: number;
  title: string;
  isPublic: boolean;
  views: number;
  createdAt: string;
  updatedAt: string;
  author: { id: number; username: string };
}

export default function AdminBlogs() {
  const toast = useToast();
  const { user } = useAuth();
  const { page, setPage } = useAdminSearch();
  const blogs = useApi(
    () =>
      http.get<Paginated<AdminBlogItem>>(
        `/api/admin/blogs?page=${page}&pageSize=${ADMIN_PAGE_SIZE}`,
      ),
    [page],
  );

  const [pendingDelete, setPendingDelete] = useState<AdminBlogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const items = blogs.data?.items ?? [];
  const total = blogs.data?.total ?? 0;
  const totalPages = blogs.data?.totalPages ?? 1;

  // Deleting the only post of the last page would leave it empty.
  useEffect(() => {
    if (blogs.loading || !blogs.data) return;
    if (blogs.data.items.length === 0 && page > 1) {
      setPage(Math.max(1, Math.min(page - 1, blogs.data.totalPages)));
    }
  }, [blogs.loading, blogs.data, page, setPage]);

  const isSuper = user?.role === 2;

  const remove = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const result = await http.delete<{ message: string }>(`/api/blog/posts/${pendingDelete.id}`);
      toast.success(result.message || '博客文章已删除');
      setPendingDelete(null);
      blogs.reload();
    } catch (reason) {
      setDeleteError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="内容管理"
        title="博客"
        description="查看全部文章（含未公开），可跳转前台预览、进入编辑器修改，或删除文章。编辑器沿用前台写作体验。"
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={blogs.loading} onClick={blogs.reload}>
            刷新
          </Button>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[52rem]">
            <thead>
              <tr>
                <th className="w-14">ID</th>
                <th>标题</th>
                <th className="w-32">作者</th>
                <th className="w-24">公开状态</th>
                <th className="w-20 text-center">阅读</th>
                <th className="w-28">创建时间</th>
                <th className="w-28">更新时间</th>
                <th className="w-32 text-right">操作</th>
              </tr>
            </thead>
            {blogs.loading && !blogs.data ? (
              <TableSkeleton rows={8} cols={8} />
            ) : blogs.error ? (
              <TableError error={blogs.error} colSpan={8} onRetry={blogs.reload} />
            ) : items.length === 0 ? (
              <TableEmpty
                colSpan={8}
                icon={BookOpen}
                title="还没有博客文章"
                description="用户发布的文章与审核通过的投稿都会出现在这里。"
              />
            ) : (
              <tbody>
                {items.map((blog) => (
                  <tr key={blog.id}>
                    <td className="text-xs subtle">#{blog.id}</td>
                    <td className="max-w-[26rem]">
                      <a
                        href={`/blog/${blog.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-1 font-medium transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                        title={blog.title}
                      >
                        {blog.title}
                      </a>
                    </td>
                    <td className="truncate text-xs">{blog.author.username}</td>
                    <td>
                      <Badge tone={blog.isPublic ? 'success' : 'warning'}>{blog.isPublic ? '公开' : '未公开'}</Badge>
                    </td>
                    <td className="text-center text-xs">{formatNumber(blog.views)}</td>
                    <td className="whitespace-nowrap text-xs subtle">{formatDate(blog.createdAt, 'datetime')}</td>
                    <td className="whitespace-nowrap text-xs subtle">{formatDate(blog.updatedAt, 'datetime')}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/blog/${blog.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost size-9 rounded-xl p-0"
                          title="查看文章"
                          aria-label={`查看 ${blog.title}`}
                        >
                          <Eye className="size-4" />
                        </a>
                        <a
                          href={`/blog/${blog.id}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost size-9 rounded-xl p-0"
                          title="在编辑器中打开"
                          aria-label={`编辑 ${blog.title}`}
                        >
                          <Pencil className="size-4" />
                        </a>
                        {isSuper || blog.author.id === user?.id ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={Trash2}
                            title="删除文章"
                            aria-label={`删除 ${blog.title}`}
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            onClick={() => {
                              setDeleteError(null);
                              setPendingDelete(blog);
                            }}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <TablePager page={page} totalPages={totalPages} total={total} onChange={setPage} />
      </div>

      <p className="flex items-center gap-1.5 text-xs subtle">
        <ExternalLink className="size-3.5" />
        「查看」与「编辑」会在新标签页打开前台页面，编辑需要相应的作者或管理员权限。
      </p>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        size="sm"
        title="删除博客文章"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={busy}>
              取消
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              删除文章
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}
          <p className="text-sm leading-relaxed muted">
            确定要删除文章「{pendingDelete?.title}」吗？删除后文章及其评论都会消失，且无法恢复。
          </p>
          <Alert tone="warning">此操作不可撤销，请确认已备份重要内容。</Alert>
        </div>
      </Modal>
    </div>
  );
}
