import { useState } from 'react';
import { CheckCircle2, MessageSquare, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import type { FeedbackDTO, Paginated } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { cn, formatDate, formatNumber, relativeTime, truncate } from '../../lib/utils';
import { Alert, Badge, Button, Modal, PageHeader, Stars } from '../../components/ui';
import { ADMIN_PAGE_SIZE, TableEmpty, TableError, TablePager, TableSkeleton, useAdminSearch } from './AdminLayout';

const STATUS_META: Record<FeedbackDTO['status'], { label: string; tone: 'warning' | 'success' | 'default' }> = {
  open: { label: '待处理', tone: 'warning' },
  resolved: { label: '已解决', tone: 'success' },
  ignored: { label: '已忽略', tone: 'default' },
};

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'ignored', label: '已忽略' },
];

export default function AdminFeedback() {
  const toast = useToast();
  const { page, get, update, setPage } = useAdminSearch();
  const status = get('status', 'all') || 'all';

  const feedback = useApi(
    () =>
      http.get<Paginated<FeedbackDTO>>(
        `/api/admin/feedback?status=${encodeURIComponent(status)}&page=${page}&pageSize=${ADMIN_PAGE_SIZE}`,
      ),
    [status, page],
  );

  const [selected, setSelected] = useState<FeedbackDTO | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const items = feedback.data?.items ?? [];
  const total = feedback.data?.total ?? 0;
  const totalPages = feedback.data?.totalPages ?? 1;

  const changeStatus = async (item: FeedbackDTO, next: FeedbackDTO['status']) => {
    setUpdatingId(item.id);
    try {
      const result = await http.patch<{ message: string }>(`/api/admin/feedback/${item.id}`, { status: next });
      toast.success(result.message || '反馈状态已更新');
      setSelected((current) => (current && current.id === item.id ? { ...current, status: next } : current));
      feedback.reload();
    } catch (reason) {
      toast.error(errorMessage(reason));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="社区管理"
        title="反馈"
        description="查看用户提交的评分与意见，标记已解决或忽略。标记后系统会向用户发送邮件通知。"
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={feedback.loading} onClick={feedback.reload}>
            刷新
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => update({ status: filter.value === 'all' ? null : filter.value })}
            className={cn('chip', status === filter.value && 'chip-active')}
          >
            {filter.label}
          </button>
        ))}
        <span className="ml-auto text-xs subtle">共 {formatNumber(total)} 条反馈</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[50rem]">
            <thead>
              <tr>
                <th className="w-14">ID</th>
                <th className="w-32">用户</th>
                <th className="w-32">评分</th>
                <th>反馈内容</th>
                <th className="w-36">提交时间</th>
                <th className="w-24">状态</th>
                <th className="w-32 text-right">操作</th>
              </tr>
            </thead>
            {feedback.loading && !feedback.data ? (
              <TableSkeleton rows={6} cols={7} />
            ) : feedback.error ? (
              <TableError error={feedback.error} colSpan={7} onRetry={feedback.reload} />
            ) : items.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={MessageSquare}
                title={status === 'all' ? '还没有用户反馈' : '该状态下没有反馈'}
                description={status === 'all' ? '用户提交的意见会显示在这里。' : '切换筛选条件查看其他反馈。'}
                action={
                  status !== 'all' ? (
                    <Button variant="secondary" size="sm" onClick={() => update({ status: null })}>
                      查看全部反馈
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="text-xs subtle">#{item.id}</td>
                    <td className="truncate text-sm">{item.username}</td>
                    <td>
                      <Stars value={item.rating} size="sm" />
                    </td>
                    <td className="max-w-[26rem]">
                      <button
                        type="button"
                        className="line-clamp-2 text-left text-sm transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                        onClick={() => setSelected(item)}
                        title="查看完整反馈"
                      >
                        {truncate(item.feedback, 80)}
                      </button>
                    </td>
                    <td className="whitespace-nowrap text-xs subtle" title={formatDate(item.createdAt, 'full')}>
                      {formatDate(item.createdAt, 'datetime')}
                    </td>
                    <td>
                      <Badge tone={STATUS_META[item.status].tone}>{STATUS_META[item.status].label}</Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {item.status !== 'resolved' ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={CheckCircle2}
                            title="标记为已解决"
                            aria-label={`将反馈 #${item.id} 标记为已解决`}
                            loading={updatingId === item.id}
                            className="text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                            onClick={() => void changeStatus(item, 'resolved')}
                          />
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={RotateCcw}
                            title="恢复为待处理"
                            aria-label={`将反馈 #${item.id} 恢复为待处理`}
                            loading={updatingId === item.id}
                            onClick={() => void changeStatus(item, 'open')}
                          />
                        )}
                        {item.status !== 'ignored' ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={XCircle}
                            title="标记为已忽略"
                            aria-label={`将反馈 #${item.id} 标记为已忽略`}
                            loading={updatingId === item.id}
                            onClick={() => void changeStatus(item, 'ignored')}
                          />
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          icon={MessageSquare}
                          title="查看详情"
                          aria-label={`查看反馈 #${item.id}`}
                          onClick={() => setSelected(item)}
                        />
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

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="md"
        title="反馈详情"
        description={selected ? `#${selected.id} · ${selected.username}` : undefined}
        footer={
          selected ? (
            <>
              <Button variant="secondary" onClick={() => setSelected(null)} disabled={updatingId !== null}>
                关闭
              </Button>
              {selected.status !== 'open' ? (
                <Button
                  variant="ghost"
                  icon={RotateCcw}
                  loading={updatingId === selected.id}
                  onClick={() => void changeStatus(selected, 'open')}
                >
                  恢复待处理
                </Button>
              ) : null}
              {selected.status !== 'resolved' ? (
                <Button
                  icon={CheckCircle2}
                  loading={updatingId === selected.id}
                  onClick={() => void changeStatus(selected, 'resolved')}
                >
                  标记已解决
                </Button>
              ) : null}
              {selected.status !== 'ignored' ? (
                <Button
                  variant="ghost"
                  icon={XCircle}
                  loading={updatingId === selected.id}
                  onClick={() => void changeStatus(selected, 'ignored')}
                >
                  标记忽略
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{selected.username}</span>
              <Stars value={selected.rating} />
              <Badge tone={STATUS_META[selected.status].tone}>{STATUS_META[selected.status].label}</Badge>
              <span className="ml-auto text-xs subtle" title={formatDate(selected.createdAt, 'full')}>
                {formatDate(selected.createdAt, 'datetime')} · {relativeTime(selected.createdAt)}
              </span>
            </div>
            <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.feedback}</p>
            </div>
            {selected.status !== 'open' ? (
              <Alert tone="info">该反馈已处理，用户已收到结果通知邮件。可恢复为「待处理」重新跟进。</Alert>
            ) : (
              <Alert tone="info">标记为已解决或已忽略后，系统会向用户发送结果通知邮件。</Alert>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
