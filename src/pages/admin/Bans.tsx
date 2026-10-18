import { useState } from 'react';
import { Ban, Clock, RefreshCw, RotateCcw } from 'lucide-react';
import type { BanHistoryDTO, BanRecordDTO, Paginated } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { formatDate, formatNumber } from '../../lib/utils';
import { Alert, Badge, Button, Field, Input, Modal, PageHeader, Textarea } from '../../components/ui';
import { ADMIN_PAGE_SIZE, AdminGuard, TableEmpty, TableError, TablePager, TableSkeleton, useAdminSearch } from './AdminLayout';

export default function AdminBans() {
  return (
    <AdminGuard>
      <BansPage />
    </AdminGuard>
  );
}

function BansPage() {
  const toast = useToast();
  const { page, setPage } = useAdminSearch();
  const bans = useApi(() => http.get<{ items: BanRecordDTO[] }>('/api/admin/bans'), []);
  const history = useApi(
    () =>
      http.get<Paginated<BanHistoryDTO>>(
        `/api/admin/ban-history?page=${page}&pageSize=${ADMIN_PAGE_SIZE}`,
      ),
    [page],
  );

  const [ip, setIp] = useState('');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingUnban, setPendingUnban] = useState<BanRecordDTO | null>(null);

  const items = bans.data?.items ?? [];
  const historyItems = history.data?.items ?? [];

  const submitBan = async () => {
    const cleanIp = ip.trim();
    const value = Number(days);
    if (cleanIp.length < 3) {
      setFormError('请输入有效的 IP 地址');
      return;
    }
    if (!Number.isInteger(value) || value <= 0 || value > 3650) {
      setFormError('封禁天数需为 1–3650 的整数');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const result = await http.post<{ message: string; bannedUntil: string }>('/api/admin/bans', {
        ip: cleanIp,
        days: value,
        reason: reason.trim(),
      });
      toast.success(result.message || 'IP 地址已封禁');
      setIp('');
      setReason('');
      bans.reload();
      history.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="安全与风控"
        title="封禁 IP"
        description="封禁指定 IP 地址以阻断其所有请求。封禁立即生效，解封会写入历史记录，便于追溯。"
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={bans.loading || history.loading}
            onClick={() => {
              bans.reload();
              history.reload();
            }}
          >
            刷新
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ------------------------------------------------------- 当前封禁 */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">当前封禁</h2>
              <p className="mt-0.5 text-xs subtle">共 {formatNumber(items.length)} 个生效中的封禁</p>
            </div>
            <Badge tone={items.length > 0 ? 'danger' : 'success'}>{items.length > 0 ? '限制中' : '无封禁'}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="table min-w-[42rem]">
              <thead>
                <tr>
                  <th className="w-36">IP 地址</th>
                  <th>原因</th>
                  <th className="w-36">封禁至</th>
                  <th className="w-36">创建时间</th>
                  <th className="w-24 text-right">操作</th>
                </tr>
              </thead>
              {bans.loading && !bans.data ? (
                <TableSkeleton rows={4} cols={5} />
              ) : bans.error ? (
                <TableError error={bans.error} colSpan={5} onRetry={bans.reload} />
              ) : items.length === 0 ? (
                <TableEmpty
                  colSpan={5}
                  icon={Ban}
                  title="当前没有封禁的 IP"
                  description="通过右侧表单封禁可疑来源地址，或在访问记录页直接封禁。"
                />
              ) : (
                <tbody>
                  {items.map((ban) => (
                    <tr key={ban.ipAddress}>
                      <td>
                        <span className="font-mono text-xs">{ban.ipAddress}</span>
                      </td>
                      <td className="max-w-[18rem]">
                        <span className="line-clamp-2 text-sm">{ban.reason || '未填写原因'}</span>
                      </td>
                      <td className="whitespace-nowrap text-xs">{formatDate(ban.bannedUntil, 'datetime')}</td>
                      <td className="whitespace-nowrap text-xs subtle">{formatDate(ban.createdAt, 'datetime')}</td>
                      <td>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={RotateCcw}
                            onClick={() => setPendingUnban(ban)}
                          >
                            解封
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </section>

        {/* ---------------------------------------------------------- 封禁表单 */}
        <section className="card h-fit p-4">
          <h2 className="text-sm font-semibold">封禁新 IP</h2>
          <p className="mt-1 text-xs leading-relaxed subtle">请输入完整 IP 地址。支持 IPv4 与 IPv6，重复封禁会覆盖原有记录。</p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitBan();
            }}
          >
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <Field label="IP 地址" htmlFor="ban-ip" required>
              <Input
                id="ban-ip"
                value={ip}
                onChange={(event) => setIp(event.target.value)}
                placeholder="例如：203.0.113.42"
                className="font-mono text-xs"
                autoComplete="off"
              />
            </Field>
            <Field label="封禁天数" htmlFor="ban-ip-days" required hint="1–3650 天">
              <Input
                id="ban-ip-days"
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </Field>
            <Field label="封禁原因" htmlFor="ban-ip-reason" hint="会记录在封禁历史中">
              <Textarea
                id="ban-ip-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="例如：恶意爬取、暴力破解"
                rows={3}
              />
            </Field>
            <Button type="submit" className="w-full" icon={Ban} loading={busy}>
              封禁该 IP
            </Button>
          </form>
          <p className="mt-3 text-[11px] leading-relaxed subtle">
            封禁后该 IP 访问任何页面都会被拦截（包括 API 请求），封禁期间的管理操作请使用其他网络。
          </p>
        </section>
      </div>

      {/* ------------------------------------------------------------ 封禁历史 */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="size-4 text-slate-400" /> 封禁历史
            </h2>
            <p className="mt-0.5 text-xs subtle">包含手动解封与到期自动解封的记录</p>
          </div>
          <span className="text-xs subtle">共 {formatNumber(history.data?.total ?? 0)} 条</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[48rem]">
            <thead>
              <tr>
                <th className="w-16">ID</th>
                <th className="w-40">IP 地址</th>
                <th>原因</th>
                <th className="w-36">封禁至</th>
                <th className="w-36">封禁时间</th>
                <th className="w-36">解封时间</th>
              </tr>
            </thead>
            {history.loading && !history.data ? (
              <TableSkeleton rows={6} cols={6} />
            ) : history.error ? (
              <TableError error={history.error} colSpan={6} onRetry={history.reload} />
            ) : historyItems.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={Clock}
                title="还没有封禁历史"
                description="解封或封禁到期后，记录会出现在这里。"
              />
            ) : (
              <tbody>
                {historyItems.map((record) => (
                  <tr key={record.id}>
                    <td className="text-xs subtle">#{record.id}</td>
                    <td>
                      <span className="font-mono text-xs">{record.ipAddress}</span>
                    </td>
                    <td className="max-w-[20rem]">
                      <span className="line-clamp-2 text-sm">{record.reason || '未填写原因'}</span>
                    </td>
                    <td className="whitespace-nowrap text-xs">{formatDate(record.bannedUntil, 'datetime')}</td>
                    <td className="whitespace-nowrap text-xs subtle">{formatDate(record.bannedAt, 'datetime')}</td>
                    <td className="whitespace-nowrap text-xs subtle">
                      {record.unbanTime ? formatDate(record.unbanTime, 'datetime') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <TablePager
          page={page}
          totalPages={history.data?.totalPages ?? 1}
          total={history.data?.total ?? 0}
          onChange={setPage}
        />
      </section>

      <UnbanModal
        ban={pendingUnban}
        onClose={() => setPendingUnban(null)}
        onUnbanned={() => {
          setPendingUnban(null);
          bans.reload();
          history.reload();
        }}
      />
    </div>
  );
}

function UnbanModal({
  ban,
  onClose,
  onUnbanned,
}: {
  ban: BanRecordDTO | null;
  onClose: () => void;
  onUnbanned: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!ban) return;
    setBusy(true);
    setError(null);
    try {
      const result = await http.delete<{ message: string }>(`/api/admin/bans/${encodeURIComponent(ban.ipAddress)}`);
      toast.success(result.message || 'IP 地址已解封');
      onUnbanned();
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(ban)}
      onClose={onClose}
      size="sm"
      title="解封 IP"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy}>
            确认解封
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <p className="text-sm leading-relaxed muted">
          确定要解封 <span className="font-mono">{ban?.ipAddress}</span> 吗？解封后该地址可以立即访问站点，操作会写入封禁历史。
        </p>
        {ban?.reason ? <Alert tone="info">封禁原因：{ban.reason}</Alert> : null}
      </div>
    </Modal>
  );
}
