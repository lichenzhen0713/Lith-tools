import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import type { MessageResponse } from '@shared/types';
import { http, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { Alert, Button, Field, Input } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function ResetPassword() {
  useDocumentTitle('重置密码');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await http.post<MessageResponse>('/api/auth/reset', { token, password });
      toast.success('密码已重置，请使用新密码登录');
      navigate('/login', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="重置密码" subtitle="该重置链接无效。">
        <Alert tone="error" title="链接无效">
          链接缺少必要参数，请重新发起找回密码请求。
        </Alert>
        <Link to="/forgot-password" className="btn-primary mt-4 w-full">
          重新获取链接
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="设置新密码"
      subtitle="设置一个至少 8 位、包含字母和数字的新密码。"
      footer={
        <>
          返回
          <Link to="/login" className="ml-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            登录页面
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="新密码" htmlFor="password" hint="至少 8 位，需包含字母和数字。" required>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="确认新密码" htmlFor="confirm" required>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        <Button type="submit" loading={loading} icon={KeyRound} className="w-full">
          重置密码
        </Button>
      </form>
    </AuthShell>
  );
}
