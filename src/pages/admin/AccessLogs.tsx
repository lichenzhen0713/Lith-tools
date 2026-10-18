import { useState } from 'react';
import { Activity, Ban, RotateCcw } from 'lucide-react';
import type { AccessLogDTO, Paginated } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { formatDate, formatNumber, relativeTime } from '../../lib/utils';
import { Alert, Badge, Button, Field, Input, Modal, PageHeader, Textarea } from '../../components/ui';
import { useIsSuperAdmin, ADMIN_PAGE_SIZE, TableEmpty, TableError, TablePager, TableSkeleton, useAdminSearch } from './AdminLayout';

export default function AdminAccessLogs() {
  const toast = useToast();
  const isSuper = useIsSuperAdmin();
  const { page, setPage } = useAdminSearch();
  const logs = useApi(
    () =>
      http.get<Paginated<AccessLogDTO>>(
        `/api/admin/access-logs?page=${page}&pageSize=${ADMIN_PAGE_SIZE}`,
      ),
    [page],
  );

  const [banTarget, setBanTarget] = useState<string | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<string | null>(null);
  const [busyIp, setBusyIp] = useState<string | null>(null);

  const items = logs.data?.items ?? [];
  const total = logs.data?.total ?? 0;
  const totalPages = logs.data?.totalPages ?? 1;

  const refresh = () => {
    logs.reload();
  };

  const unban = async (ip: string) => {
    setBusyIp(ip);
    try {
      const result = await http.delete<{ message: string }>(`/api/admin/bans/${encodeURIComponent(ip)}`);
      toast.success(result.message || 'IP 地址已解封');
      setUnbanTarget(null);
      refresh();
    } catch (reason) {
      toast.error(errorMessage(reason));
    } finally {
      setBusyIp(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="安全与风控"
        title="访问记录"
        description="按 IP 汇总的访问统计，用于识别异常来源。超级管理员可以直接在此封禁或解封 IP。"
        actions={
          <Button variant="secondary" icon={Activity} loading={logs.loading} onClick={refresh}>
            刷新
          </Button>
        }
      />

      {!isSuper ? (
        <Alert tone="info">访问记录对所有管理员可见，但封禁与解封操作仅限超级管理员。</Alert>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[44rem]">
            <thead>
              <tr>
                <th className="w-48">IP 地址</th>
                <th className="w-44">最近访问</th>
                <th className="w-28 text-center">访问次数</th>
                <th className="w-24">封禁状态</th>
                {isSuper ? <th className="w-32 text-right">操作</th> : null}
              </tr>
            </thead>
            {logs.loading && !logs.data ? (
              <TableSkeleton rows={8} cols={isSuper ? 5 : 4} />
            ) : logs.error ? (
              <TableError error={logs.error} colSpan={isSuper ? 5 : 4} onRetry={refresh} />
            ) : items.length === 0 ? (
              <TableEmpty
                colSpan={isSuper ? 5 : 4}
                icon={Activity}
                title="暂无访问记录"
                description="页面访问会被自动记录，稍后再回来查看。"
              />
            ) : (
              <tbody>
                {items.map((log) => (
                  <tr key={log.ipAddress}>
                    <td>
                      <span className="font-mono text-xs">{log.ipAddress}</span>
                    </td>
                    <td>
                      <p className="text-xs">{formatDate(log.accessTime, 'datetime')}</p>
                      <p className="text-[11px] subtle">{relativeTime(log.accessTime)}</p>
                    </td>
                    <td className="text-center text-sm font-medium">{formatNumber(log.accessCount)}</td>
                    <td>
                      <Badge tone={log.banned ? 'danger' : 'success'}>{log.banned ? '已封禁' : '正常'}</Badge>
                    </td>
                    {isSuper ? (
                      <td>
                        <div className="flex items-center justify-end">
                          {log.banned ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={RotateCcw}
                              loading={busyIp === log.ipAddress}
                              onClick={() => setUnbanTarget(log.ipAddress)}
                            >
                              解封
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" icon={Ban} onClick={() => setBanTarget(log.ipAddress)}>
                              封禁
                            </Button>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <TablePager page={page} totalPages={totalPages} total={total} onChange={setPage} />
      </div>

      <p className="text-xs subtle">
        访问次数为累计值，仅统计文档页面访问（不含 API 请求与静态资源）。同一 IP 短时间内多次访问会被合并计数。
      </p>

      <BanIpModal
        ip={banTarget}
        onClose={() => setBanTarget(null)}
        onBanned={() => {
          setBanTarget(null);
          refresh();
        }}
      />

      <Modal
        open={Boolean(unbanTarget)}
        onClose={() => setUnbanTarget(null)}
        size="sm"
        title="解封 IP"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnbanTarget(null)} disabled={busyIp !== null}>
              取消
            </Button>
            <Button
              onClick={() => unbanTarget && void unban(unbanTarget)}
              loading={busyIp !== null}
            >
              确认解封
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">
          确定要解封 <span className="font-mono">{unbanTarget}</span> 吗？解封后该地址可以立即访问站点，操作会记录到封禁历史。
        </p>
      </Modal>
    </div>
  );
}

function BanIpModal({ ip, onClose, onBanned }: { ip: string | null; onClose: () => void; onBanned: () => void }) {
  const toast = useToast();
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!ip) return;
    const value = Number(days);
    if (!Number.isInteger(value) || value <= 0 || value > 3650) {
      setError('封禁天数需为 1–3650 的整数');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await http.post<{ message: string; bannedUntil: string }>('/api/admin/bans', {
        ip,
        days: value,
        reason: reason.trim(),
      });
      toast.success(result.message || 'IP 地址已封禁');
      setReason('');
      onBanned();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(ip)}
      onClose={onClose}
      size="sm"
      title="封禁 IP"
      description={ip ? `目标地址：${ip}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="danger" onClick={submit} loading={busy}>
            确认封禁
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="封禁天数" htmlFor="access-ban-days" required hint="1–3650 天，到期后自动解封">
          <Input
            id="access-ban-days"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </Field>
        <Field label="封禁原因" htmlFor="access-ban-reason" hint="会记录在封禁历史中">
          <Textarea
            id="access-ban-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：异常高频访问"
            rows={3}
          />
        </Field>
        <Alert tone="warning">封禁会立即阻断该 IP 的所有请求，包括 API 与管理后台访问。</Alert>
      </div>
    </Modal>
  );
}
