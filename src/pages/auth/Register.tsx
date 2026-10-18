import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, UserPlus } from 'lucide-react';
import type { AuthResponse, MessageResponse } from '@shared/types';
import { http, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { Alert, Button, Field, Input } from '../../components/ui';
import { AuthShell } from './AuthShell';

type Stage = 'email' | 'details';

export default function Register() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const toast = useToast();
  useDocumentTitle('注册');

  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await http.post<MessageResponse>('/api/auth/send-code', { email: email.trim() });
      setStage('details');
      if (data.devCode) {
        setDevCode(data.devCode);
        setCode(data.devCode);
        toast.info('开发模式：验证码已自动填入');
      } else if (data.delivered) {
        toast.success('验证码已发送，请检查邮箱');
      } else {
        toast.info(data.message);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const data = await http.post<AuthResponse>('/api/auth/register', {
        username: username.trim(),
        email: email.trim(),
        code: code.trim(),
        password,
      });
      setUser(data.user);
      toast.success('注册成功，欢迎加入 Lith Tools！');
      navigate('/dashboard', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="创建账号"
      subtitle="只需一个邮箱验证码，即可加入 Lith Tools。"
      footer={
        <>
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            直接登录
          </Link>
        </>
      }
    >
      {stage === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Field label="电子邮箱" htmlFor="email" hint="我们会发送一个 6 位验证码，15 分钟内有效。" required>
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
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <Button type="submit" loading={loading} icon={Mail} className="w-full">
            发送验证码
          </Button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Alert tone="info">
            验证码已发送至 <span className="font-medium">{email}</span>
            <button type="button" onClick={() => setStage('email')} className="ml-2 text-indigo-600 hover:underline dark:text-indigo-400">
              修改邮箱
            </button>
          </Alert>
          {devCode ? (
            <Alert tone="warning" title="开发模式">
              邮件服务未配置，验证码为 <span className="font-mono font-semibold">{devCode}</span>（已自动填入）。
            </Alert>
          ) : null}
          <Field label="用户名" htmlFor="username" hint="3–32 个字符，支持中文、字母、数字、下划线与点。" required>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="给自己起个名字"
              autoComplete="username"
              required
            />
          </Field>
          <Field label="验证码" htmlFor="code" required>
            <div className="flex gap-2">
              <Input
                id="code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="6 位数字"
                inputMode="numeric"
                maxLength={6}
                className="font-mono tracking-[0.3em]"
                required
              />
              <Button type="button" variant="secondary" onClick={() => void sendCode()} className="shrink-0" disabled={loading}>
                重新发送
              </Button>
            </div>
          </Field>
          <Field label="密码" htmlFor="password" hint="至少 8 位，需包含字母和数字。" required>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="设置登录密码"
              required
            />
          </Field>
          <Field label="确认密码" htmlFor="confirm" required>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              placeholder="再次输入密码"
              required
            />
          </Field>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <Button type="submit" loading={loading} icon={UserPlus} className="w-full">
            完成注册
          </Button>
          <button type="button" onClick={() => setStage('email')} className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="size-3" /> 返回上一步
          </button>
        </form>
      )}
    </AuthShell>
  );
}
