import { useMemo, useState } from 'react';
import { FolderTree, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { CategoryDTO } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { formatNumber } from '../../lib/utils';
import { Alert, Badge, Button, Field, Input, Modal, PageHeader } from '../../components/ui';
import { ADMIN_PAGE_SIZE, AdminGuard, TableEmpty, TableError, TablePager, TableSkeleton } from './AdminLayout';

type CategoriesModal =
  | { kind: 'create' }
  | { kind: 'rename'; category: CategoryDTO }
  | { kind: 'delete'; category: CategoryDTO }
  | null;

export default function AdminCategories() {
  return (
    <AdminGuard>
      <CategoriesPage />
    </AdminGuard>
  );
}

function CategoriesPage() {
  const categories = useApi(() => http.get<{ items: CategoryDTO[] }>('/api/admin/categories'), []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<CategoriesModal>(null);

  const all = categories.data?.items ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((category) => category.name.toLowerCase().includes(term));
  }, [all, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * ADMIN_PAGE_SIZE, currentPage * ADMIN_PAGE_SIZE);
  const totalBlogs = all.reduce((sum, category) => sum + (category.blogCount ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="内容管理"
        title="博客分类"
        description="维护博客文章的分类。删除分类不会删除文章，相关文章会变为未分类。"
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={categories.loading} onClick={categories.reload}>
              刷新
            </Button>
            <Button icon={Plus} onClick={() => setModal({ kind: 'create' })}>
              新增分类
            </Button>
          </>
        }
      />

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="搜索分类名称"
            className="pl-9"
            aria-label="搜索分类"
          />
        </div>
        <p className="ml-auto text-xs subtle">
          共 {formatNumber(all.length)} 个分类 · 已归类文章 {formatNumber(totalBlogs)} 篇
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[32rem]">
            <thead>
              <tr>
                <th className="w-16">ID</th>
                <th>分类名称</th>
                <th className="w-28 text-center">文章数</th>
                <th className="w-28 text-right">操作</th>
              </tr>
            </thead>
            {categories.loading && !categories.data ? (
              <TableSkeleton rows={6} cols={4} />
            ) : categories.error ? (
              <TableError error={categories.error} colSpan={4} onRetry={categories.reload} />
            ) : rows.length === 0 ? (
              <TableEmpty
                colSpan={4}
                icon={FolderTree}
                title={search.trim() ? '没有匹配的分类' : '还没有分类'}
                description={search.trim() ? '试试其他关键词。' : '创建分类后，作者投稿时即可选择归类。'}
                action={
                  search.trim() ? (
                    <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                      清除搜索
                    </Button>
                  ) : (
                    <Button size="sm" icon={Plus} onClick={() => setModal({ kind: 'create' })}>
                      新增分类
                    </Button>
                  )
                }
              />
            ) : (
              <tbody>
                {rows.map((category) => (
                  <tr key={category.id}>
                    <td className="text-xs subtle">#{category.id}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                          <FolderTree className="size-4" />
                        </span>
                        <span className="text-sm font-medium">{category.name}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      {category.blogCount ? (
                        <Badge tone="brand">{formatNumber(category.blogCount)}</Badge>
                      ) : (
                        <span className="text-xs subtle">0</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          icon={Pencil}
                          title="重命名分类"
                          aria-label={`重命名 ${category.name}`}
                          onClick={() => setModal({ kind: 'rename', category })}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          icon={Trash2}
                          title="删除分类"
                          aria-label={`删除 ${category.name}`}
                          className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          onClick={() => setModal({ kind: 'delete', category })}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <TablePager page={currentPage} totalPages={totalPages} total={filtered.length} onChange={setPage} />
      </div>

      <Alert tone="info" title="分类说明">
        分类同时用于博客文章与投稿审核。删除分类后，原来的文章不会消失，只会变成「未分类」，可随时重新归类。
      </Alert>

      {modal?.kind === 'create' || modal?.kind === 'rename' ? (
        <CategoryFormModal
          key={modal.kind === 'rename' ? `rename-${modal.category.id}` : 'create'}
          mode={modal.kind}
          category={modal.kind === 'rename' ? modal.category : undefined}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            categories.reload();
          }}
        />
      ) : null}

      {modal?.kind === 'delete' ? (
        <DeleteCategoryModal
          category={modal.category}
          onClose={() => setModal(null)}
          onDeleted={() => {
            setModal(null);
            categories.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryFormModal({
  mode,
  category,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'rename';
  category?: CategoryDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('请输入分类名称');
      return;
    }
    if (cleanName.length > 50) {
      setError('分类名称最多 50 个字符');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        const result = await http.post<{ message: string }>('/api/admin/categories', { name: cleanName });
        toast.success(result.message || '分类已添加');
      } else if (category) {
        const result = await http.patch<{ message: string }>(`/api/admin/categories/${category.id}`, { name: cleanName });
        toast.success(result.message || '分类已更新');
      }
      onSaved();
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={mode === 'create' ? '新增分类' : '重命名分类'}
      description={mode === 'create' ? '分类名称会显示在博客列表与筛选器中。' : `修改「${category?.name ?? ''}」的名称，已归类文章会自动跟随。`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy}>
            {mode === 'create' ? '创建分类' : '保存修改'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="分类名称" htmlFor="admin-category-name" required hint="最多 50 个字符，名称不可重复">
          <Input
            id="admin-category-name"
            value={name}
            maxLength={50}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：前端开发"
          />
        </Field>
      </div>
    </Modal>
  );
}

function DeleteCategoryModal({
  category,
  onClose,
  onDeleted,
}: {
  category: CategoryDTO;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await http.delete<{ message: string }>(`/api/admin/categories/${category.id}`);
      toast.success(result.message || '分类已删除');
      onDeleted();
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="删除分类"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="danger" onClick={submit} loading={busy}>
            删除分类
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <p className="text-sm leading-relaxed muted">
          确定要删除分类「{category.name}」吗？该分类下有 {formatNumber(category.blogCount ?? 0)} 篇文章。
        </p>
        <Alert tone="warning">
          文章不会被删除，但会变为「未分类」，需要重新编辑文章才能归类到其他分类。
        </Alert>
      </div>
    </Modal>
  );
}
