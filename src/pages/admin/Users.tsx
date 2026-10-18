import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Pencil, RotateCcw, Search, Trash2, UserPlus, Users } from 'lucide-react';
import type { AdminUserDTO, Paginated, Role } from '@shared/types';
import { errorMessage, http } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi, useDebouncedValue } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { formatDate, formatNumber } from '../../lib/utils';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Field,
  FormRow,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../../components/ui';
import { ADMIN_PAGE_SIZE, AdminGuard, TableEmpty, TableError, TablePager, TableSkeleton, useAdminSearch } from './AdminLayout';

type UsersModal =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUserDTO }
  | { kind: 'ban'; user: AdminUserDTO }
  | { kind: 'unban'; user: AdminUserDTO }
  | { kind: 'delete'; user: AdminUserDTO }
  | null;

const ROLE_LABELS: Record<Role, string> = { 0: '普通用户', 1: '管理员', 2: '超级管理员' };

function roleTone(role: Role): 'default' | 'brand' | 'danger' {
  if (role === 2) return 'danger';
  if (role === 1) return 'brand';
  return 'default';
}

function isBanned(user: AdminUserDTO): boolean {
  return Boolean(user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now());
}

export default function AdminUsers() {
  return (
    <AdminGuard>
      <UsersPage />
    </AdminGuard>
  );
}

function UsersPage() {
  const { page, get, update, setPage } = useAdminSearch();
  const role = get('role', 'all');
  const banned = get('banned', 'all');
  const urlQuery = get('q');

  const [search, setSearch] = useState(urlQuery);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [modal, setModal] = useState<UsersModal>(null);
  const { user: me } = useAuth();

  useEffect(() => {
    const next = debouncedSearch.trim();
    if (next !== urlQuery) update({ q: next || null });
  }, [debouncedSearch, urlQuery, update]);

  const users = useApi(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(ADMIN_PAGE_SIZE) });
    if (urlQuery) params.set('q', urlQuery);
    if (role !== 'all') params.set('role', role);
    if (banned !== 'all') params.set('banned', banned);
    return http.get<Paginated<AdminUserDTO>>(`/api/admin/users?${params.toString()}`);
  }, [page, urlQuery, role, banned]);

  const items = users.data?.items ?? [];
  const total = users.data?.total ?? 0;
  const totalPages = users.data?.totalPages ?? 1;
  const filtering = Boolean(urlQuery) || role !== 'all' || banned !== 'all';

  // Deleting the last row of the last page leaves the page empty — step back one page.
  useEffect(() => {
    if (users.loading || !users.data) return;
    if (users.data.items.length === 0 && page > 1) {
      setPage(Math.max(1, Math.min(page - 1, users.data.totalPages)));
    }
  }, [users.loading, users.data, page, setPage]);

  const resetFilters = () => {
    setSearch('');
    update({ q: null, role: null, banned: null });
  };

  const closeModal = () => setModal(null);

  const refreshList = () => {
    setModal(null);
    users.reload();
  };

  const handleCreated = () => {
    setModal(null);
    if (page === 1) users.reload();
    else setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="用户管理"
        title="用户"
        description="管理站点账户：搜索、编辑资料、调整角色、封禁或删除。封禁与删除会同步通知用户。"
        actions={
          <Button icon={UserPlus} onClick={() => setModal({ kind: 'create' })}>
            新建用户
          </Button>
        }
      />

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索用户名、邮箱或用户 ID"
            className="pl-9"
            aria-label="搜索用户"
          />
        </div>
        <div className="w-36">
          <Select
            value={role}
            onChange={(event) => update({ role: event.target.value === 'all' ? null : event.target.value })}
            aria-label="按角色筛选"
          >
            <option value="all">全部角色</option>
            <option value="0">普通用户</option>
            <option value="1">管理员</option>
            <option value="2">超级管理员</option>
          </Select>
        </div>
        <div className="w-36">
          <Select
            value={banned}
            onChange={(event) => update({ banned: event.target.value === 'all' ? null : event.target.value })}
            aria-label="按封禁状态筛选"
          >
            <option value="all">全部状态</option>
            <option value="1">已封禁</option>
            <option value="0">正常</option>
          </Select>
        </div>
        {filtering ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            清除筛选
          </Button>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[62rem]">
            <thead>
              <tr>
                <th className="w-14">ID</th>
                <th>用户名</th>
                <th>邮箱</th>
                <th className="w-24">角色</th>
                <th className="w-28">注册时间</th>
                <th className="w-36">最后 IP</th>
                <th className="w-16 text-center">会话</th>
                <th className="w-16 text-center">文章</th>
                <th className="w-32">封禁状态</th>
                <th className="w-28 text-right">操作</th>
              </tr>
            </thead>
            {users.loading && !users.data ? (
              <TableSkeleton rows={8} cols={10} />
            ) : users.error ? (
              <TableError error={users.error} colSpan={10} onRetry={users.reload} />
            ) : items.length === 0 ? (
              <TableEmpty
                colSpan={10}
                icon={Users}
                title={filtering ? '没有找到匹配的用户' : '还没有用户'}
                description={filtering ? '试试其他关键词，或清除筛选条件。' : '创建第一个账户，或等待用户注册。'}
                action={
                  filtering ? (
                    <Button variant="secondary" size="sm" onClick={resetFilters}>
                      清除筛选
                    </Button>
                  ) : (
                    <Button size="sm" icon={UserPlus} onClick={() => setModal({ kind: 'create' })}>
                      新建用户
                    </Button>
                  )
                }
              />
            ) : (
              <tbody>
                {items.map((user) => {
                  const bannedNow = isBanned(user);
                  const isSelf = user.id === me?.id;
                  return (
                    <tr key={user.id}>
                      <td className="text-xs subtle">#{user.id}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar name={user.username} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{user.username}</p>
                            {user.emailVerified ? (
                              <span className="flex items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="size-3" /> 已验证
                              </span>
                            ) : (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400">邮箱未验证</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[14rem]">
                        <span className="block truncate text-xs" title={user.email ?? ''}>
                          {user.email ?? '—'}
                        </span>
                      </td>
                      <td>
                        <Badge tone={roleTone(user.role)}>{ROLE_LABELS[user.role]}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-xs subtle">{formatDate(user.createdAt)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs">{user.lastIp ?? '—'}</span>
                      </td>
                      <td className="text-center text-xs">{formatNumber(user.sessions)}</td>
                      <td className="text-center text-xs">{formatNumber(user.blogCount)}</td>
                      <td>
                        {bannedNow ? (
                          <div>
                            <Badge tone="danger">封禁中</Badge>
                            <p className="mt-1 text-[11px] subtle">至 {formatDate(user.bannedUntil, 'datetime')}</p>
                          </div>
                        ) : (
                          <Badge tone="success">正常</Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={Pencil}
                            title="编辑用户"
                            aria-label={`编辑 ${user.username}`}
                            onClick={() => setModal({ kind: 'edit', user })}
                          />
                          {bannedNow ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              icon={RotateCcw}
                              title="解除封禁"
                              aria-label={`解封 ${user.username}`}
                              onClick={() => setModal({ kind: 'unban', user })}
                            />
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              icon={Ban}
                              title={user.role === 2 ? '超级管理员不可封禁' : '封禁用户'}
                              aria-label={`封禁 ${user.username}`}
                              disabled={user.role === 2}
                              onClick={() => setModal({ kind: 'ban', user })}
                            />
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            icon={Trash2}
                            title={
                              user.role === 2 ? '超级管理员不可删除' : isSelf ? '不能删除自己的账户' : '删除用户'
                            }
                            aria-label={`删除 ${user.username}`}
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            disabled={user.role === 2 || isSelf}
                            onClick={() => setModal({ kind: 'delete', user })}
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
        <TablePager page={page} totalPages={totalPages} total={total} onChange={setPage} />
      </div>

      {modal?.kind === 'create' || modal?.kind === 'edit' ? (
        <UserEditorModal
          key={modal.kind === 'edit' ? `edit-${modal.user.id}` : 'create'}
          mode={modal.kind}
          user={modal.kind === 'edit' ? modal.user : undefined}
          onClose={closeModal}
          onSaved={modal.kind === 'create' ? handleCreated : refreshList}
        />
      ) : null}

      {modal?.kind === 'ban' ? <BanUserModal user={modal.user} onClose={closeModal} onSaved={refreshList} /> : null}

      {modal?.kind === 'unban' ? (
        <ConfirmUserModal
          title="解除封禁"
          description={`确定要解除用户「${modal.user.username}」的封禁吗？用户会立即恢复登录权限。`}
          confirmLabel="解除封禁"
          run={async () => (await http.post<{ message: string }>(`/api/admin/users/${modal.user.id}/unban`, {})).message}
          onClose={closeModal}
          onDone={refreshList}
        />
      ) : null}

      {modal?.kind === 'delete' ? (
        <ConfirmUserModal
          title="删除用户"
          description={`确定要删除用户「${modal.user.username}」吗？该操作不可撤销，用户发布的内容将保留但不再关联作者。`}
          confirmLabel="删除用户"
          danger
          run={async () => (await http.delete<{ message: string }>(`/api/admin/users/${modal.user.id}`)).message}
          onClose={closeModal}
          onDone={refreshList}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- modals */

function UserEditorModal({
  mode,
  user,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  user?: AdminUserDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { user: me } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 0);
  const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSelf = Boolean(user && me && user.id === me.id);

  const submit = async () => {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      setError('用户名需为 3–32 个字符');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (mode === 'create' && !password) {
      setError('请为新用户设置初始密码');
      return;
    }
    if (password && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setError('密码至少 8 位，且需同时包含字母与数字');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        const result = await http.post<{ message: string; id: number }>('/api/admin/users', {
          username: cleanUsername,
          email: cleanEmail,
          password,
          role,
        });
        toast.success(result.message || '新用户已创建');
      } else if (user) {
        const payload: Record<string, unknown> = { username: cleanUsername, email: cleanEmail, emailVerified };
        if (!isSelf) payload.role = role;
        if (password) payload.password = password;
        const result = await http.patch<{ message: string }>(`/api/admin/users/${user.id}`, payload);
        toast.success(result.message || '用户信息已更新');
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
      title={mode === 'create' ? '新建用户' : `编辑用户 #${user?.id ?? ''}`}
      description={mode === 'create' ? '创建后的账户可直接登录，请妥善传递初始密码。' : '修改邮箱或密码会立即生效，重置密码会清除该用户的登录会话。'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} loading={busy}>
            {mode === 'create' ? '创建用户' : '保存修改'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <FormRow>
          <Field label="用户名" htmlFor="admin-user-username" required>
            <Input
              id="admin-user-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3–32 个字符"
              autoComplete="off"
            />
          </Field>
          <Field label="邮箱" htmlFor="admin-user-email" required>
            <Input
              id="admin-user-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="off"
            />
          </Field>
        </FormRow>

        <FormRow>
          <Field
            label={mode === 'create' ? '初始密码' : '新密码'}
            htmlFor="admin-user-password"
            required={mode === 'create'}
            hint={mode === 'create' ? '至少 8 位，包含字母与数字' : '留空表示不修改密码'}
          >
            <Input
              id="admin-user-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'create' ? '至少 8 位' : '留空则不修改'}
              autoComplete="new-password"
            />
          </Field>
          <Field label="角色" htmlFor="admin-user-role" hint={isSelf ? '不能修改自己的角色' : undefined}>
            <Select
              id="admin-user-role"
              value={String(role)}
              disabled={isSelf}
              onChange={(event) => setRole(Number(event.target.value) as Role)}
            >
              <option value="0">普通用户</option>
              <option value="1">管理员</option>
              <option value="2">超级管理员</option>
            </Select>
          </Field>
        </FormRow>

        {mode === 'edit' ? (
          <Checkbox
            label="邮箱已验证"
            checked={emailVerified}
            onChange={(event) => setEmailVerified(event.target.checked)}
          />
        ) : null}
      </div>
    </Modal>
  );
}

function BanUserModal({ user, onClose, onSaved }: { user: AdminUserDTO; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = Number(days);
    if (!Number.isInteger(value) || value <= 0 || value > 3650) {
      setError('封禁天数需为 1–3650 的整数');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await http.post<{ message: string }>(`/api/admin/users/${user.id}/ban`, {
        days: value,
        reason: reason.trim(),
      });
      toast.success(result.message || '用户已封禁，并通知了用户');
      onSaved();
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
      title={`封禁用户「${user.username}」`}
      description="封禁会立即清除该用户的全部登录会话，并通过邮件告知原因与期限。"
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
        <Field label="封禁天数" htmlFor="ban-days" required hint="1–3650 天，到期后自动解封">
          <Input
            id="ban-days"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </Field>
        <Field label="封禁原因" htmlFor="ban-reason" hint="会显示在通知邮件中，建议填写具体原因">
          <Textarea
            id="ban-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：发布垃圾广告、恶意刷屏"
            rows={3}
          />
        </Field>
        <Alert tone="warning">封禁期间该用户无法登录，但其已发布的公开内容不会被删除。</Alert>
      </div>
    </Modal>
  );
}

function ConfirmUserModal({
  title,
  description,
  confirmLabel,
  danger = false,
  run,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = await run();
      toast.success(message || '操作成功');
      onDone();
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
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <p className="text-sm leading-relaxed muted">{description}</p>
        {danger ? <Alert tone="warning">此操作不可撤销，请再次确认。</Alert> : null}
      </div>
    </Modal>
  );
}
