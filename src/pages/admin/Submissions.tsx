import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, ExternalLink, Eye, Inbox, RefreshCw, XCircle } from 'lucide-react';
import type { CategoryDTO, SubmissionDTO, ToolCategoryDTO } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { cn, formatDate, formatNumber, truncate } from '../../lib/utils';
import { Alert, Badge, Button, Field, Input, Modal, PageHeader, Select, Skeleton, Tabs, Textarea } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import { ADMIN_PAGE_SIZE, TableEmpty, TableError, TablePager, TableSkeleton, useAdminSearch } from './AdminLayout';

type SubmissionType = 'tool' | 'blog';
type ReviewStatus = 'pending' | 'approved' | 'rejected';

interface ToolSubmissionRow {
  id: number;
  tool_name: string;
  username: string;
  created_at: string;
  status: string;
  ip_address: string;
}

interface BlogSubmissionRow {
  id: number;
  title: string;
  username: string;
  created_at: string;
  status: string;
}

interface SubmissionsResponse {
  type: SubmissionType;
  items: Array<ToolSubmissionRow | BlogSubmissionRow>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface BlogSubmissionDetail {
  id: number;
  title: string;
  content: string;
  username: string;
  authorId: number;
  status: ReviewStatus;
  createdAt: string;
}

const STATUS_META: Record<ReviewStatus, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: '待审核', tone: 'warning' },
  approved: { label: '已通过', tone: 'success' },
  rejected: { label: '已驳回', tone: 'danger' },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'all', label: '全部' },
];

function isToolRow(row: ToolSubmissionRow | BlogSubmissionRow): row is ToolSubmissionRow {
  return 'tool_name' in row;
}

function statusMeta(value: string) {
  return STATUS_META[(value as ReviewStatus) in STATUS_META ? (value as ReviewStatus) : 'pending'];
}

export default function AdminSubmissions() {
  const toast = useToast();
  const { page, get, update, setPage } = useAdminSearch();
  const type: SubmissionType = get('type', 'tool') === 'blog' ? 'blog' : 'tool';
  const status = get('status', 'pending') || 'pending';

  const submissions = useApi(
    () =>
      http.get<SubmissionsResponse>(
        `/api/admin/submissions?type=${type}&status=${encodeURIComponent(status)}&page=${page}&pageSize=${ADMIN_PAGE_SIZE}`,
      ),
    [type, status, page],
  );

  // Public category endpoints keep the review flow usable for regular admins too.
  const toolCategories = useApi(() => http.get<{ categories: ToolCategoryDTO[] }>('/api/tools'), []);
  const blogCategories = useApi(() => http.get<{ items: CategoryDTO[] }>('/api/blog/categories'), []);

  const [detail, setDetail] = useState<{ type: SubmissionType; id: number } | null>(null);

  const rows = useMemo(
    () =>
      (submissions.data?.items ?? []).map((row) =>
        isToolRow(row)
          ? {
              id: row.id,
              title: row.tool_name,
              username: row.username,
              createdAt: row.created_at,
              status: row.status,
              ip: row.ip_address,
            }
          : {
              id: row.id,
              title: row.title,
              username: row.username,
              createdAt: row.created_at,
              status: row.status,
              ip: '',
            },
      ),
    [submissions.data],
  );

  const total = submissions.data?.total ?? 0;
  const totalPages = submissions.data?.totalPages ?? 1;

  const handleReviewed = () => {
    setDetail(null);
    submissions.reload();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="审核中心"
        title="投稿"
        description="审核用户提交的工具与文章。通过工具投稿会直接上架工具库，通过博客投稿会立即发布文章，并通过邮件通知投稿人。"
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={submissions.loading} onClick={submissions.reload}>
            刷新
          </Button>
        }
      />

      <div className="card overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs
            items={[
              { value: 'tool', label: '工具投稿' },
              { value: 'blog', label: '博客投稿' },
            ]}
            value={type}
            onChange={(value) => update({ type: value === 'blog' ? 'blog' : 'tool' })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => update({ status: filter.value === 'pending' ? null : filter.value })}
              className={cn('chip', status === filter.value && 'chip-active')}
            >
              {filter.label}
            </button>
          ))}
          <span className="ml-auto text-xs subtle">共 {formatNumber(total)} 条</span>
        </div>

        <div className="overflow-x-auto">
          <table className="table min-w-[46rem]">
            <thead>
              <tr>
                <th className="w-14">ID</th>
                <th>{type === 'tool' ? '工具名称' : '文章标题'}</th>
                <th className="w-32">投稿人</th>
                <th className="w-40">IP 地址</th>
                <th className="w-36">提交时间</th>
                <th className="w-24">状态</th>
                <th className="w-24 text-right">操作</th>
              </tr>
            </thead>
            {submissions.loading && !submissions.data ? (
              <TableSkeleton rows={6} cols={7} />
            ) : submissions.error ? (
              <TableError error={submissions.error} colSpan={7} onRetry={submissions.reload} />
            ) : rows.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={Inbox}
                title={status === 'pending' ? '没有待审核的投稿' : '该状态下没有投稿'}
                description={
                  status === 'pending'
                    ? '新的工具与博客投稿会出现在这里，切换筛选可查看历史记录。'
                    : '切换筛选条件查看其他投稿。'
                }
                action={
                  status !== 'all' ? (
                    <Button variant="secondary" size="sm" onClick={() => update({ status: null })}>
                      查看全部投稿
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <tbody>
                {rows.map((row) => {
                  const meta = statusMeta(row.status);
                  return (
                    <tr key={`${type}-${row.id}`}>
                      <td className="text-xs subtle">#{row.id}</td>
                      <td className="max-w-[26rem]">
                        <button
                          type="button"
                          className="line-clamp-1 text-left text-sm font-medium transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                          title="查看投稿详情"
                          onClick={() => setDetail({ type, id: row.id })}
                        >
                          {row.title || '（无标题）'}
                        </button>
                      </td>
                      <td className="truncate text-xs">{row.username}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs subtle">{row.ip || '—'}</span>
                      </td>
                      <td className="whitespace-nowrap text-xs subtle">{formatDate(row.createdAt, 'datetime')}</td>
                      <td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-end">
                          <Button
                            size="sm"
                            variant={row.status === 'pending' ? 'primary' : 'secondary'}
                            icon={row.status === 'pending' ? CheckCircle2 : Eye}
                            onClick={() => setDetail({ type, id: row.id })}
                          >
                            {row.status === 'pending' ? '审核' : '查看'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        <TablePager page={page} totalPages={totalPages} total={total} onChange={setPage} />
      </div>

      <p className="flex items-center gap-1.5 text-xs subtle">
        <XCircle className="size-3.5" />
        审核结果会通过邮件通知投稿人；已处理的投稿不可重复审核。
      </p>

      {detail?.type === 'tool' ? (
        <ToolSubmissionModal
          key={`tool-${detail.id}`}
          id={detail.id}
          categories={toolCategories.data?.categories ?? []}
          onClose={() => setDetail(null)}
          onReviewed={handleReviewed}
        />
      ) : null}

      {detail?.type === 'blog' ? (
        <BlogSubmissionModal
          key={`blog-${detail.id}`}
          id={detail.id}
          categories={blogCategories.data?.items ?? []}
          onClose={() => setDetail(null)}
          onReviewed={handleReviewed}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- shared */

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

function LoadingDetail() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-10" />
    </div>
  );
}

/* -------------------------------------------------------------- tool review */

function ToolSubmissionModal({
  id,
  categories,
  onClose,
  onReviewed,
}: {
  id: number;
  categories: ToolCategoryDTO[];
  onClose: () => void;
  onReviewed: () => void;
}) {
  const toast = useToast();
  const detail = useApi(() => http.get<{ submission: SubmissionDTO }>(`/api/admin/submissions/tool/${id}`), [id]);
  const submission = detail.data?.submission;
  const pending = submission?.status === 'pending';

  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [categoryId, setCategoryId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pending) return;
    if (action === 'reject' && !reason.trim()) {
      setError('请填写驳回原因，方便投稿人了解未通过的原因');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await http.post<{ message: string }>(`/api/admin/submissions/tool/${id}/review`, {
        action,
        categoryId: action === 'approve' && categoryId ? Number(categoryId) : null,
        reason: reason.trim(),
      });
      toast.success(result.message || '投稿已处理');
      onReviewed();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="审核工具投稿"
      description={submission ? `#${submission.id} · 由 ${submission.username} 提交` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            关闭
          </Button>
          {pending ? (
            <Button variant={action === 'approve' ? 'primary' : 'danger'} onClick={submit} loading={busy}>
              {action === 'approve' ? '通过并上架' : '驳回投稿'}
            </Button>
          ) : null}
        </>
      }
    >
      {detail.loading && !detail.data ? (
        <LoadingDetail />
      ) : detail.error ? (
        <Alert tone="error" title="加载投稿失败">
          {detail.error}
        </Alert>
      ) : submission ? (
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <dl className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="工具名称">{submission.toolName}</InfoRow>
            <InfoRow label="当前状态">
              <Badge tone={statusMeta(submission.status).tone}>{statusMeta(submission.status).label}</Badge>
            </InfoRow>
            <InfoRow label="投稿用户">{submission.username}</InfoRow>
            <InfoRow label="提交时间">{formatDate(submission.createdAt, 'datetime')}</InfoRow>
            <InfoRow label="来源 IP">
              <span className="font-mono text-xs">{submission.ipAddress || '—'}</span>
            </InfoRow>
            <InfoRow label="工具链接">
              <a
                href={submission.toolLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate">{submission.toolLink}</span>
              </a>
            </InfoRow>
          </dl>

          <div>
            <p className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase">工具描述</p>
            <p className="mt-1.5 rounded-xl border bg-[var(--hover-bg)] p-3 text-sm leading-relaxed whitespace-pre-wrap">
              {submission.description || '投稿人未填写描述'}
            </p>
          </div>

          {pending ? (
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">审核操作</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn('chip', action === 'approve' && 'chip-active')}
                  onClick={() => setAction('approve')}
                >
                  通过并上架
                </button>
                <button
                  type="button"
                  className={cn('chip', action === 'reject' && 'chip-active')}
                  onClick={() => setAction('reject')}
                >
                  驳回投稿
                </button>
              </div>

              {action === 'approve' ? (
                <Field label="收录分类" htmlFor="tool-submission-category" hint="通过后工具会立即加入所选分类">
                  <Select
                    id="tool-submission-category"
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">未分类</option>
                    {categories.map((category) => (
                      <option key={category.id} value={String(category.id)}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <Field
                label={action === 'approve' ? '给投稿人的备注（可选）' : '驳回原因'}
                htmlFor="tool-submission-reason"
                required={action === 'reject'}
                hint="会通过邮件发送给投稿人"
              >
                <Textarea
                  id="tool-submission-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={action === 'approve' ? '例如：感谢推荐，已收录到工具库。' : '例如：该工具与现有工具重复。'}
                  rows={3}
                />
              </Field>
            </div>
          ) : (
            <Alert tone="info">该投稿已处理，无需重复审核。</Alert>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

/* -------------------------------------------------------------- blog review */

function BlogSubmissionModal({
  id,
  categories,
  onClose,
  onReviewed,
}: {
  id: number;
  categories: CategoryDTO[];
  onClose: () => void;
  onReviewed: () => void;
}) {
  const toast = useToast();
  const detail = useApi(() => http.get<{ submission: BlogSubmissionDetail }>(`/api/admin/submissions/blog/${id}`), [id]);
  const submission = detail.data?.submission;
  const pending = submission?.status === 'pending';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [categoryId, setCategoryId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (submission) {
      setTitle(submission.title);
      setContent(submission.content);
    }
  }, [submission]);

  const submit = async () => {
    if (!pending) return;
    if (action === 'approve') {
      if (!title.trim()) {
        setError('标题不能为空');
        return;
      }
      if (!content.trim()) {
        setError('正文不能为空');
        return;
      }
    } else if (!reason.trim()) {
      setError('请填写驳回原因，方便作者了解未通过的原因');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        action,
        reason: reason.trim(),
        categoryId: action === 'approve' && categoryId ? Number(categoryId) : null,
      };
      if (action === 'approve') {
        payload.title = title.trim();
        payload.content = content;
      }
      const result = await http.post<{ message: string }>(`/api/admin/submissions/blog/${id}/review`, payload);
      toast.success(result.message || '投稿已处理');
      onReviewed();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="审核博客投稿"
      description={submission ? `#${submission.id} · 由 ${submission.username} 投稿` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            关闭
          </Button>
          {pending ? (
            <Button variant={action === 'approve' ? 'primary' : 'danger'} onClick={submit} loading={busy}>
              {action === 'approve' ? '批准并发布' : '驳回投稿'}
            </Button>
          ) : null}
        </>
      }
    >
      {detail.loading && !detail.data ? (
        <LoadingDetail />
      ) : detail.error ? (
        <Alert tone="error" title="加载投稿失败">
          {detail.error}
        </Alert>
      ) : submission ? (
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <dl className="grid gap-3 sm:grid-cols-3">
            <InfoRow label="投稿人">{submission.username}</InfoRow>
            <InfoRow label="提交时间">{formatDate(submission.createdAt, 'datetime')}</InfoRow>
            <InfoRow label="当前状态">
              <Badge tone={statusMeta(submission.status).tone}>{statusMeta(submission.status).label}</Badge>
            </InfoRow>
          </dl>

          {pending ? (
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">审核操作</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn('chip', action === 'approve' && 'chip-active')}
                  onClick={() => setAction('approve')}
                >
                  通过并发布
                </button>
                <button
                  type="button"
                  className={cn('chip', action === 'reject' && 'chip-active')}
                  onClick={() => setAction('reject')}
                >
                  驳回投稿
                </button>
              </div>

              {action === 'approve' ? (
                <>
                  <Field label="标题" htmlFor="blog-submission-title" required>
                    <Input
                      id="blog-submission-title"
                      value={title}
                      maxLength={200}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="文章标题"
                    />
                  </Field>

                  <div className="flex items-end justify-between gap-3">
                    <p className="label mb-0">正文（Markdown）</p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={mode === 'edit' ? 'secondary' : 'ghost'}
                        onClick={() => setMode('edit')}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant={mode === 'preview' ? 'secondary' : 'ghost'}
                        onClick={() => setMode('preview')}
                      >
                        预览
                      </Button>
                    </div>
                  </div>

                  {mode === 'edit' ? (
                    <Textarea
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      className="min-h-[18rem] font-mono text-xs leading-relaxed"
                      placeholder="支持 Markdown 语法"
                      aria-label="正文内容"
                    />
                  ) : (
                    <div className="max-h-80 overflow-y-auto rounded-xl border bg-[var(--card-bg)] p-4">
                      <Markdown content={content} empty="正文为空" />
                    </div>
                  )}

                  <Field label="发布分类" htmlFor="blog-submission-category" hint="通过后文章会立即发布到该分类">
                    <Select
                      id="blog-submission-category"
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                    >
                      <option value="">未分类</option>
                      {categories.map((category) => (
                        <option key={category.id} value={String(category.id)}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : (
                <div className="rounded-xl border bg-[var(--hover-bg)] p-3">
                  <p className="line-clamp-2 text-sm font-medium">{submission.title}</p>
                  <p className="mt-1 text-xs leading-relaxed subtle">{truncate(submission.content, 160)}</p>
                </div>
              )}

              <Field
                label={action === 'approve' ? '给作者的备注（可选）' : '驳回原因'}
                htmlFor="blog-submission-reason"
                required={action === 'reject'}
                hint="会通过邮件发送给作者"
              >
                <Textarea
                  id="blog-submission-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={action === 'approve' ? '例如：内容质量不错，已发布。' : '例如：内容与站点主题不符。'}
                  rows={3}
                />
              </Field>
            </div>
          ) : (
            <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
              <p className="text-sm font-medium">{submission.title}</p>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <Markdown content={submission.content} />
              </div>
              <Alert tone="info" className="mt-3">
                该投稿已处理，无需重复审核。
              </Alert>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
