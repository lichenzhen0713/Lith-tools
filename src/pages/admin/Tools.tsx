import { useMemo, useState } from 'react';
import { ExternalLink, Pencil, Plus, Power, PowerOff, RefreshCw, Search, Trash2, Wrench } from 'lucide-react';
import type { ToolCategoryDTO, ToolDTO } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { cn, formatNumber } from '../../lib/utils';
import {
  Alert,
  Badge,
  Button,
  Field,
  FormRow,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../../components/ui';
import { toolIcon } from '../../icons';
import { ADMIN_PAGE_SIZE, AdminGuard, TableEmpty, TableError, TablePager, TableSkeleton } from './AdminLayout';

type ToolsModal = { kind: 'create' } | { kind: 'edit'; tool: ToolDTO } | { kind: 'delete'; tool: ToolDTO } | null;

export default function AdminTools() {
  return (
    <AdminGuard>
      <ToolsPage />
    </AdminGuard>
  );
}

function ToolsPage() {
  const toast = useToast();
  const tools = useApi(() => http.get<{ items: ToolDTO[] }>('/api/admin/tools'), []);
  const categories = useApi(() => http.get<{ items: ToolCategoryDTO[] }>('/api/admin/tool-categories'), []);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [modal, setModal] = useState<ToolsModal>(null);

  const categoryList = categories.data?.items ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (tools.data?.items ?? []).filter((tool) => {
      const toolCategory = tool.category ? String(tool.category.id) : 'none';
      if (categoryId !== 'all' && toolCategory !== categoryId) return false;
      if (type === 'builtin' && tool.isExternal) return false;
      if (type === 'external' && !tool.isExternal) return false;
      if (status === 'enabled' && tool.disabled) return false;
      if (status === 'disabled' && !tool.disabled) return false;
      if (!term) return true;
      return `${tool.name} ${tool.description} ${tool.slug ?? ''} ${tool.href} ${tool.category?.name ?? ''}`
        .toLowerCase()
        .includes(term);
    });
  }, [tools.data, search, categoryId, type, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * ADMIN_PAGE_SIZE, currentPage * ADMIN_PAGE_SIZE);
  const filtering = Boolean(search.trim()) || categoryId !== 'all' || type !== 'all' || status !== 'all';
  const error = tools.error ?? categories.error;

  const resetFilters = () => {
    setSearch('');
    setCategoryId('all');
    setType('all');
    setStatus('all');
    setPage(1);
  };

  const toggleDisabled = async (tool: ToolDTO) => {
    setBusyId(tool.id);
    try {
      const result = await http.patch<{ message: string }>(`/api/admin/tools/${tool.id}`, { disabled: !tool.disabled });
      toast.success(result.message || (tool.disabled ? '工具已启用' : '工具已禁用'));
      tools.reload();
    } catch (reason) {
      toast.error(errorMessage(reason));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="工具管理"
        title="工具"
        description="管理工具库的分类、外链与启用状态。内置工具由代码注册，只能修改展示信息，无法新增或修改链接。"
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={tools.loading} onClick={tools.reload}>
              刷新
            </Button>
            <Button icon={Plus} onClick={() => setModal({ kind: 'create' })}>
              新增外链工具
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
            placeholder="搜索工具名称、描述或链接"
            className="pl-9"
            aria-label="搜索工具"
          />
        </div>
        <div className="w-40">
          <Select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            aria-label="按分类筛选"
          >
            <option value="all">全部分类</option>
            {categoryList.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
            <option value="none">未分类</option>
          </Select>
        </div>
        <div className="w-32">
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            aria-label="按类型筛选"
          >
            <option value="all">全部类型</option>
            <option value="builtin">内置工具</option>
            <option value="external">外链工具</option>
          </Select>
        </div>
        <div className="w-32">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="按状态筛选"
          >
            <option value="all">全部状态</option>
            <option value="enabled">启用中</option>
            <option value="disabled">已禁用</option>
          </Select>
        </div>
        {filtering ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            清除筛选
          </Button>
        ) : null}
      </div>

      <p className="text-xs subtle">
        共 {formatNumber(tools.data?.items.length ?? 0)} 个工具
        {filtering ? ` · 当前筛选出 ${formatNumber(filtered.length)} 个` : ''}
      </p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[46rem]">
            <thead>
              <tr>
                <th>名称</th>
                <th className="w-32">分类</th>
                <th className="w-24">类型</th>
                <th className="w-24">状态</th>
                <th className="w-28 text-right">操作</th>
              </tr>
            </thead>
            {tools.loading && !tools.data ? (
              <TableSkeleton rows={8} cols={5} />
            ) : error ? (
              <TableError
                error={error}
                colSpan={5}
                onRetry={() => {
                  tools.reload();
                  categories.reload();
                }}
              />
            ) : rows.length === 0 ? (
              <TableEmpty
                colSpan={5}
                icon={Wrench}
                title={filtering ? '没有匹配的工具' : '还没有工具'}
                description={filtering ? '试试其他关键词，或清除筛选条件。' : '新增一个外链工具，或等待投稿审核通过后自动上架。'}
                action={
                  filtering ? (
                    <Button variant="secondary" size="sm" onClick={resetFilters}>
                      清除筛选
                    </Button>
                  ) : (
                    <Button size="sm" icon={Plus} onClick={() => setModal({ kind: 'create' })}>
                      新增外链工具
                    </Button>
                  )
                }
              />
            ) : (
              <tbody>
                {rows.map((tool) => {
                  const Icon = toolIcon(tool.icon);
                  return (
                    <tr key={tool.id}>
                      <td>
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{tool.name}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs subtle">{tool.description || '暂无描述'}</p>
                            {tool.isExternal ? (
                              <a
                                href={tool.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-0.5 inline-flex max-w-[22rem] items-center gap-1 truncate text-[11px] text-indigo-600 hover:underline dark:text-indigo-400"
                              >
                                <ExternalLink className="size-3 shrink-0" />
                                <span className="truncate">{tool.href}</span>
                              </a>
                            ) : (
                              <p className="mt-0.5 font-mono text-[11px] subtle">/tools/{tool.slug}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {tool.category ? (
                          <Badge tone="brand">{tool.category.name}</Badge>
                        ) : (
                          <span className="text-xs subtle">未分类</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={tool.isExternal ? 'warning' : 'default'}>{tool.isExternal ? '外链' : '内置'}</Badge>
                      </td>
                      <td>
                        <Badge tone={tool.disabled ? 'danger' : 'success'}>{tool.disabled ? '已禁用' : '启用中'}</Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={Pencil}
                            title="编辑工具"
                            aria-label={`编辑 ${tool.name}`}
                            onClick={() => setModal({ kind: 'edit', tool })}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={tool.disabled ? Power : PowerOff}
                            title={tool.disabled ? '启用工具' : '禁用工具'}
                            aria-label={tool.disabled ? `启用 ${tool.name}` : `禁用 ${tool.name}`}
                            loading={busyId === tool.id}
                            onClick={() => void toggleDisabled(tool)}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={Trash2}
                            title="删除工具"
                            aria-label={`删除 ${tool.name}`}
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            onClick={() => setModal({ kind: 'delete', tool })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        <TablePager page={currentPage} totalPages={totalPages} total={filtered.length} onChange={setPage} />
      </div>

      {modal?.kind === 'create' || modal?.kind === 'edit' ? (
        <ToolEditorModal
          key={modal.kind === 'edit' ? `edit-${modal.tool.id}` : 'create'}
          mode={modal.kind}
          tool={modal.kind === 'edit' ? modal.tool : undefined}
          categories={categoryList}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            tools.reload();
          }}
        />
      ) : null}

      {modal?.kind === 'delete' ? (
        <DeleteToolModal
          tool={modal.tool}
          onClose={() => setModal(null)}
          onDeleted={() => {
            setModal(null);
            tools.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- modals */

function ToolEditorModal({
  mode,
  tool,
  categories,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  tool?: ToolDTO;
  categories: ToolCategoryDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isExternal = mode === 'create' || Boolean(tool?.isExternal);
  const [name, setName] = useState(tool?.name ?? '');
  const [description, setDescription] = useState(tool?.description ?? '');
  const [link, setLink] = useState(tool?.isExternal ? tool.href : '');
  const [icon, setIcon] = useState(tool?.icon ?? 'ExternalLink');
  const [categoryId, setCategoryId] = useState(tool?.category ? String(tool.category.id) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Icon = toolIcon(icon);

  const submit = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('请输入工具名称');
      return;
    }
    if (isExternal) {
      const cleanLink = link.trim();
      if (!/^https?:\/\/\S+$/i.test(cleanLink)) {
        setError('请输入以 http(s):// 开头的有效链接');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: cleanName,
        description: description.trim(),
        icon: icon.trim() || 'ExternalLink',
        categoryId: categoryId ? Number(categoryId) : null,
      };
      if (isExternal) payload.link = link.trim();

      if (mode === 'create') {
        const result = await http.post<{ message: string; id: number }>('/api/admin/tools', payload);
        toast.success(result.message || '工具已添加');
      } else if (tool) {
        const result = await http.patch<{ message: string }>(`/api/admin/tools/${tool.id}`, payload);
        toast.success(result.message || '工具已更新');
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
      title={mode === 'create' ? '新增外链工具' : `编辑工具 #${tool?.id ?? ''}`}
      description={
        mode === 'create'
          ? '外链工具会出现在工具库中，点击后跳转到目标地址。'
          : isExternal
            ? '可修改名称、描述、分类与链接，修改会立即生效。'
            : '内置工具由代码注册，只能修改名称、描述、分类与图标。'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy}>
            {mode === 'create' ? '添加工具' : '保存修改'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Field label="工具名称" htmlFor="admin-tool-name" required>
          <Input id="admin-tool-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：JSON 格式化" />
        </Field>

        <Field label="描述" htmlFor="admin-tool-description" hint="一句简短说明，会显示在工具卡片上">
          <Textarea
            id="admin-tool-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="这个工具能做什么？"
            rows={3}
          />
        </Field>

        <Field
          label="链接"
          htmlFor="admin-tool-link"
          required={mode === 'create'}
          hint={isExternal ? '必须是 http(s):// 开头的完整地址' : '内置工具的链接由代码决定，不可修改'}
        >
          <Input
            id="admin-tool-link"
            value={isExternal ? link : (tool?.href ?? '')}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://example.com/tool"
            disabled={!isExternal}
          />
        </Field>

        <FormRow>
          <Field label="分类" htmlFor="admin-tool-category" hint="留空表示未分类">
            <Select id="admin-tool-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">未分类</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="图标名" htmlFor="admin-tool-icon" hint="Lucide 图标名，例如 ExternalLink、Sparkles">
            <div className="flex items-center gap-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Icon className="size-4" />
              </span>
              <Input
                id="admin-tool-icon"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder="ExternalLink"
                className={cn('font-mono text-xs')}
              />
            </div>
          </Field>
        </FormRow>
      </div>
    </Modal>
  );
}

function DeleteToolModal({ tool, onClose, onDeleted }: { tool: ToolDTO; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await http.delete<{ message: string }>(`/api/admin/tools/${tool.id}`);
      toast.success(result.message || '工具已删除');
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
      title="删除工具"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="danger" onClick={submit} loading={busy}>
            删除工具
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <p className="text-sm leading-relaxed muted">
          确定要删除工具「{tool.name}」吗？删除后该工具会立即从工具库中消失，且无法恢复。
        </p>
        <p className="text-xs subtle">若只是想暂时隐藏，建议使用「禁用」而不是删除。</p>
      </div>
    </Modal>
  );
}
