import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, LogIn } from 'lucide-react';
import type { AuthResponse } from '@shared/types';
import { http, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { Button, Field, Input } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  useDocumentTitle('登录');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lczoj, setLczoj] = useState({ enabled: false, name: 'LCZOJ' });

  const next = params.get('next') ?? '/dashboard';
  const oauthError = params.get('error');

  useEffect(() => {
    if (user) navigate(next.startsWith('/') ? next : '/dashboard', { replace: true });
  }, [user, navigate, next]);

  useEffect(() => {
    let active = true;
    http
      .get<{ enabled: boolean; name: string }>('/api/auth/lczoj/status')
      .then((data) => {
        if (active) setLczoj({ enabled: Boolean(data.enabled), name: data.name || 'LCZOJ' });
      })
      .catch(() => {
        /* LCZOJ 未配置 / 接口不可用时不显示入口 */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!oauthError) return;
    const messages: Record<string, string> = {
      lczoj_unconfigured: 'LCZOJ 授权登录尚未配置，请使用用户名密码登录。',
      lczoj_denied: '你已取消 LCZOJ 授权。',
      lczoj_state: '授权会话已过期或校验失败，请重新点击「使用 LCZOJ 账号登录」。',
      lczoj_banned: '该账号已被封禁，无法登录。',
      lczoj_failed: 'LCZOJ 授权失败，请稍后重试。',
    };
    setError(messages[oauthError] ?? 'LCZOJ 授权登录失败，请重试。');
  }, [oauthError]);

  if (user && !loading) return <Navigate to={next.startsWith('/') ? next : '/dashboard'} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await http.post<AuthResponse>('/api/auth/login', { username: username.trim(), password });
      setUser(data.user);
      toast.success(`欢迎回来，${data.user.username}`);
      navigate(next.startsWith('/') ? next : '/dashboard', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="登录"
      subtitle="使用你的 Lith Tools 账号继续。"
      footer={
        <>
          还没有账号？
          <Link to="/register" className="ml-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            免费注册
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="用户名" htmlFor="username" required>
          <Input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="请输入用户名"
            required
          />
        </Field>
        <Field label="密码" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="请输入密码"
            required
          />
        </Field>
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        <Button type="submit" loading={loading} icon={LogIn} className="w-full">
          登录
        </Button>
        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="text-indigo-600 hover:underline dark:text-indigo-400">
            忘记密码？
          </Link>
          <span className="subtle">登录即表示同意本站的使用条款</span>
        </div>
      </form>

      {lczoj.enabled ? (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 text-xs subtle">
            <span className="h-px flex-1 bg-[var(--card-border)]" />
            或
            <span className="h-px flex-1 bg-[var(--card-border)]" />
          </div>
          <a
            href={`/api/auth/lczoj?next=${encodeURIComponent(next)}`}
            className="btn btn-secondary w-full justify-center"
          >
            <ExternalLink className="size-4" />
            使用 {lczoj.name} 账号登录
          </a>
          <p className="text-center text-xs subtle">
            将跳转到 {lczoj.name} 完成授权，密码不会经过本站
          </p>
        </div>
      ) : null}
    </AuthShell>
  );
}
