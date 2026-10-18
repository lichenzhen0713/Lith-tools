import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Mail, RefreshCw, Save, Send } from 'lucide-react';
import { errorMessage, http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from '../../components/ui';
import { AdminGuard } from './AdminLayout';
import { cn } from '../../lib/utils';

interface SettingsView {
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    configured: boolean;
    hasPassword: boolean;
    source: 'db' | 'env' | 'none';
    updatedAt: string | null;
  };
  ai: {
    baseUrl: string;
    chatModel: string;
    reasoningModel: string;
    configured: boolean;
    hasApiKey: boolean;
    apiKeyHint: string;
    source: 'db' | 'env' | 'none';
    updatedAt: string | null;
  };
  env: { mailConfigured: boolean; aiConfigured: boolean };
}

interface MailForm {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  from: string;
  pass: string;
  clearPassword: boolean;
}

interface AiForm {
  baseUrl: string;
  chatModel: string;
  reasoningModel: string;
  apiKey: string;
  clearApiKey: boolean;
}

const EMPTY_MAIL: MailForm = { host: '', port: '465', secure: true, user: '', from: '', pass: '', clearPassword: false };
const EMPTY_AI: AiForm = {
  baseUrl: 'https://api.deepseek.com/v1',
  chatModel: 'deepseek-chat',
  reasoningModel: 'deepseek-reasoner',
  apiKey: '',
  clearApiKey: false,
};

function sourceLabel(source: SettingsView['mail']['source']): string {
  if (source === 'db') return '后台设置';
  if (source === 'env') return '环境变量';
  return '未配置';
}

export default function AdminSettings() {
  return (
    <AdminGuard>
      <SettingsPage />
    </AdminGuard>
  );
}

function SettingsPage() {
  const toast = useToast();
  const settings = useApi(() => http.get<SettingsView>('/api/admin/settings'), []);
  const [mail, setMail] = useState<MailForm>(EMPTY_MAIL);
  const [ai, setAi] = useState<AiForm>(EMPTY_AI);
  const [savingMail, setSavingMail] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testReply, setTestReply] = useState<string | null>(null);

  useEffect(() => {
    const data = settings.data;
    if (!data) return;
    setMail({
      host: data.mail.host,
      port: String(data.mail.port),
      secure: data.mail.secure,
      user: data.mail.user,
      from: data.mail.from,
      pass: '',
      clearPassword: false,
    });
    setAi({
      baseUrl: data.ai.baseUrl,
      chatModel: data.ai.chatModel,
      reasoningModel: data.ai.reasoningModel,
      apiKey: '',
      clearApiKey: false,
    });
  }, [settings.data]);

  const saveMail = async () => {
    setSavingMail(true);
    try {
      await http.put('/api/admin/settings/mail', {
        host: mail.host,
        port: Number(mail.port) || 465,
        secure: mail.secure,
        user: mail.user,
        from: mail.from,
        pass: mail.pass || undefined,
        clearPassword: mail.clearPassword,
      });
      setMail((current) => ({ ...current, pass: '', clearPassword: false }));
      toast.success('邮件设置已保存，立即生效');
      settings.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingMail(false);
    }
  };

  const saveAi = async () => {
    setSavingAi(true);
    try {
      await http.put('/api/admin/settings/ai', {
        baseUrl: ai.baseUrl,
        chatModel: ai.chatModel,
        reasoningModel: ai.reasoningModel,
        apiKey: ai.apiKey || undefined,
        clearApiKey: ai.clearApiKey,
      });
      setAi((current) => ({ ...current, apiKey: '', clearApiKey: false }));
      setTestReply(null);
      toast.success('AI 设置已保存，立即生效');
      settings.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingAi(false);
    }
  };

  const testMail = async () => {
    setTestingMail(true);
    try {
      const result = await http.post<{ message: string }>('/api/admin/settings/test-mail', {});
      toast.success(result.message);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTestingMail(false);
    }
  };

  const testAi = async () => {
    setTestingAi(true);
    setTestReply(null);
    try {
      const result = await http.post<{ reply: string; model: string }>('/api/admin/settings/test-ai', {});
      setTestReply(`连接成功 · ${result.model}\n${result.reply}`);
      toast.success('DeepSeek 连接正常');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="系统设置"
        title="邮件与 AI"
        description="保存后立即生效；密钥只保存在服务端，页面不会回显。环境变量作为默认值，后台保存的值优先。"
        actions={
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={settings.reload} loading={settings.loading}>
            刷新
          </Button>
        }
      />

      {settings.error ? <Alert tone="error" title="读取设置失败">{settings.error}</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ------------------------------------------------------------- mail */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="icon-tile tint-internet">
                <Mail className="size-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">邮件服务（SMTP）</h2>
                <p className="text-[11px] subtle">注册验证码、找回密码、审核通知</p>
              </div>
            </div>
            <Badge tone={settings.data?.mail.configured ? 'success' : 'default'}>
              {settings.data?.mail.configured ? '已配置' : '未配置'}
            </Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] subtle">
            <span>来源：{sourceLabel(settings.data?.mail.source ?? 'none')}</span>
            {settings.data?.mail.updatedAt ? <span>更新于 {new Date(settings.data.mail.updatedAt).toLocaleString()}</span> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="SMTP 服务器" className="sm:col-span-2">
              <Input
                value={mail.host}
                onChange={(event) => setMail({ ...mail, host: event.target.value })}
                placeholder="smtp.example.com"
                autoComplete="off"
              />
            </Field>
            <Field label="端口">
              <Input
                value={mail.port}
                onChange={(event) => setMail({ ...mail, port: event.target.value })}
                inputMode="numeric"
                placeholder="465"
              />
            </Field>
            <Field label="加密方式">
              <select
                value={mail.secure ? 'ssl' : 'starttls'}
                onChange={(event) => setMail({ ...mail, secure: event.target.value === 'ssl' })}
                className="input"
              >
                <option value="ssl">SSL / TLS（465）</option>
                <option value="starttls">STARTTLS（587）</option>
              </select>
            </Field>
            <Field label="用户名">
              <Input
                value={mail.user}
                onChange={(event) => setMail({ ...mail, user: event.target.value })}
                placeholder="no-reply@example.com"
                autoComplete="off"
              />
            </Field>
            <Field label="密码 / 授权码">
              <Input
                type="password"
                value={mail.pass}
                onChange={(event) => setMail({ ...mail, pass: event.target.value })}
                placeholder={settings.data?.mail.hasPassword ? '已配置，留空保持不变' : 'SMTP 密码或授权码'}
                autoComplete="new-password"
              />
            </Field>
            <Field label="发件人" className="sm:col-span-2">
              <Input
                value={mail.from}
                onChange={(event) => setMail({ ...mail, from: event.target.value })}
                placeholder="Lith Tools <no-reply@example.com>"
                autoComplete="off"
              />
            </Field>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={mail.clearPassword}
              onChange={(event) => setMail({ ...mail, clearPassword: event.target.checked })}
              className="size-4 accent-indigo-600"
            />
            清除已保存的密码（回退到环境变量）
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={Save} loading={savingMail} onClick={() => void saveMail()}>
              保存邮件设置
            </Button>
            <Button variant="secondary" icon={Send} loading={testingMail} onClick={() => void testMail()}>
              发送测试邮件
            </Button>
          </div>
          <p className="mt-2 text-[11px] subtle">测试邮件发送到当前登录管理员的邮箱。</p>
        </Card>

        {/* --------------------------------------------------------------- ai */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="icon-tile tint-development">
                <Bot className="size-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">AI 助手（DeepSeek）</h2>
                <p className="text-[11px] subtle">5 种模式共用同一服务端 Key</p>
              </div>
            </div>
            <Badge tone={settings.data?.ai.configured ? 'success' : 'default'}>
              {settings.data?.ai.configured ? '已连接' : '未配置'}
            </Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] subtle">
            <span>来源：{sourceLabel(settings.data?.ai.source ?? 'none')}</span>
            {settings.data?.ai.hasApiKey ? <span className="font-mono">{settings.data.ai.apiKeyHint}</span> : null}
            {settings.data?.ai.updatedAt ? <span>更新于 {new Date(settings.data.ai.updatedAt).toLocaleString()}</span> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="API Key" className="sm:col-span-2">
              <Input
                type="password"
                value={ai.apiKey}
                onChange={(event) => setAi({ ...ai, apiKey: event.target.value })}
                placeholder={settings.data?.ai.hasApiKey ? '已配置，留空保持不变' : 'sk-…'}
                autoComplete="new-password"
              />
            </Field>
            <Field label="接口地址" className="sm:col-span-2">
              <Input
                value={ai.baseUrl}
                onChange={(event) => setAi({ ...ai, baseUrl: event.target.value })}
                placeholder="https://api.deepseek.com/v1"
                autoComplete="off"
              />
            </Field>
            <Field label="对话模型">
              <Input value={ai.chatModel} onChange={(event) => setAi({ ...ai, chatModel: event.target.value })} />
            </Field>
            <Field label="推理模型">
              <Input
                value={ai.reasoningModel}
                onChange={(event) => setAi({ ...ai, reasoningModel: event.target.value })}
              />
            </Field>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={ai.clearApiKey}
              onChange={(event) => setAi({ ...ai, clearApiKey: event.target.checked })}
              className="size-4 accent-indigo-600"
            />
            清除已保存的 Key（回退到环境变量）
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={Save} loading={savingAi} onClick={() => void saveAi()}>
              保存 AI 设置
            </Button>
            <Button
              variant="secondary"
              icon={CheckCircle2}
              loading={testingAi}
              disabled={!settings.data?.ai.configured}
              onClick={() => void testAi()}
            >
              测试连接
            </Button>
          </div>
          {testReply ? (
            <pre className={cn('mt-3 rounded-xl border bg-[var(--hover-bg)] p-3 text-xs whitespace-pre-wrap text-[var(--text-secondary)]')}>
              {testReply}
            </pre>
          ) : null}
          <p className="mt-2 text-[11px] subtle">
            修改后立即生效，无需重启。密钥不会返回前端，也不会写入日志。
          </p>
        </Card>
      </div>

      {settings.data ? (
        <Alert tone="info" title="配置提示">
          环境变量 {settings.data.env.mailConfigured ? '已提供邮件默认值' : '未提供邮件默认值'}，
          {settings.data.env.aiConfigured ? '已提供 DeepSeek 默认 Key' : '未提供 DeepSeek 默认 Key'}。
          后台保存的值优先；清除密钥后会回退到环境变量。
        </Alert>
      ) : null}
    </div>
  );
}
