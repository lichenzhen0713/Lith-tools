import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send } from 'lucide-react';
import type { MessageResponse } from '@shared/types';
import { http, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Alert, Button, Field, Input } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function ForgotPassword() {
  useDocumentTitle('找回密码');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await http.post<MessageResponse>('/api/auth/forgot', { email: email.trim() });
      setMessage(data.message);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="找回密码"
      subtitle="输入注册邮箱，我们会发送一条重置链接。"
      footer={
        <>
          想起密码了？
          <Link to="/login" className="ml-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            返回登录
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="注册邮箱" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        {message ? (
          <Alert tone="success" title="请求已提交">
            {message}
          </Alert>
        ) : null}
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        <Button type="submit" loading={loading} icon={Send} className="w-full">
          发送重置链接
        </Button>
        {message ? (
          <p className="text-xs leading-relaxed subtle">
            没有收到邮件？请检查垃圾邮件目录，或{' '}
            <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setMessage(null)}>
              更换邮箱重试
            </button>
            。开发环境下，重置链接会打印在服务端日志中。
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
