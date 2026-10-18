import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, ListChecks, Send, Wrench } from 'lucide-react';
import type { SubmissionDTO } from '@shared/types';
import { errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate } from '../lib/utils';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  Skeleton,
  Textarea,
} from '../components/ui';

const STATUS_BADGES: Record<SubmissionDTO['status'], { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: '待审核', tone: 'warning' },
  approved: { label: '已通过', tone: 'success' },
  rejected: { label: '未通过', tone: 'danger' },
};

const REVIEW_STEPS = [
  '提交推荐：填写工具名称、描述与官方链接。',
  '管理员审核：确认工具可用、无恶意行为，并归类到合适的分类。',
  '上线或反馈：通过后会出现在工具库中；若不通过，会在「我的投稿」中标注。',
];

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface FormErrors {
  toolName?: string;
  description?: string;
  toolLink?: string;
}

export default function SubmitTool() {
  useDocumentTitle('推荐工具');
  const { user, loading } = useAuth();
  const toast = useToast();

  const [toolName, setToolName] = useState('');
  const [description, setDescription] = useState('');
  const [toolLink, setToolLink] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const mine = useApi(() => http.get<{ items: SubmissionDTO[] }>('/api/submissions/tool/mine'), [], {
    enabled: Boolean(user),
  });

  if (loading) return <PageLoader label="正在确认登录状态…" />;

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={Wrench}
          title="登录后即可推荐工具"
          description="工具推荐需要登录账号，这样管理员才能在审核后联系到你。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={`/login?next=${encodeURIComponent('/submit/tool')}`} className="btn-primary">
                登录
              </Link>
              <Link to="/register" className="btn-secondary">
                注册账号
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const submit = async () => {
    const next: FormErrors = {};
    if (!toolName.trim()) next.toolName = '请输入工具名称';
    if (!description.trim()) next.description = '请输入工具描述';
    if (!toolLink.trim()) next.toolLink = '请输入工具链接';
    else if (!isHttpUrl(toolLink)) next.toolLink = '请输入 http(s) 开头的有效链接';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await http.post('/api/submissions/tool', {
        toolName: toolName.trim(),
        description: description.trim(),
        toolLink: toolLink.trim(),
      });
      toast.success('投稿成功，等待管理员审核');
      setToolName('');
      setDescription('');
      setToolLink('');
      setErrors({});
      mine.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const items = mine.data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="投稿"
        title="推荐一个好用的工具"
        description="发现了好用的在线工具？推荐给 Lith Tools，让更多人受益。提交后需要管理员审核。"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="工具信息" description="带 * 的字段为必填项。" />
          <form
            className="space-y-5 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field label="工具名称" htmlFor="tool-name" required error={errors.toolName ?? null}>
              <Input
                id="tool-name"
                value={toolName}
                maxLength={120}
                placeholder="例如：JSON 格式化工具"
                error={Boolean(errors.toolName)}
                onChange={(event) => setToolName(event.target.value)}
              />
            </Field>

            <Field
              label="工具描述"
              htmlFor="tool-description"
              required
              error={errors.description ?? null}
              hint="最多 2000 字，说明工具能做什么、适合谁使用。"
            >
              <Textarea
                id="tool-description"
                value={description}
                rows={5}
                maxLength={2000}
                placeholder="简要介绍工具的核心功能、亮点与使用场景…"
                error={Boolean(errors.description)}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Field
              label="工具链接"
              htmlFor="tool-link"
              required
              error={errors.toolLink ?? null}
              hint="必须是以 http:// 或 https:// 开头的有效地址。"
            >
              <Input
                id="tool-link"
                value={toolLink}
                maxLength={500}
                inputMode="url"
                placeholder="https://example.com"
                error={Boolean(errors.toolLink)}
                onChange={(event) => setToolLink(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="text-xs subtle">提交后可在下方「我的投稿」查看审核状态。</p>
              <Button type="submit" icon={Send} loading={submitting}>
                提交推荐
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="size-4 text-indigo-600 dark:text-indigo-400" />
              审核流程
            </h3>
            <ol className="mt-3 space-y-3">
              {REVIEW_STEPS.map((step, index) => (
                <li key={step} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {index + 1}
                  </span>
                  <span className="muted">{step}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Alert tone="success" title="小提示">
            同一工具请勿重复提交；若工具需要登录或付费，请在描述中注明。
          </Alert>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Wrench className="size-4 text-indigo-500" />
            我的投稿
          </h2>
          <p className="text-xs subtle">共 {items.length} 条</p>
        </div>

        <div className="mt-3">
          {mine.loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
          ) : mine.error ? (
            <Card className="p-5">
              <p className="text-sm text-rose-500">{mine.error}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => mine.reload()}>
                重新加载
              </Button>
            </Card>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="还没有投稿记录"
              description="推荐第一个工具后，可以在这里跟踪审核进度。"
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const badge = STATUS_BADGES[item.status] ?? STATUS_BADGES.pending;
                return (
                  <Card key={item.id} className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{item.toolName}</h3>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <span className="ml-auto text-xs subtle">{formatDate(item.createdAt, 'datetime')}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed muted">{item.description}</p>
                    <a
                      href={item.toolLink}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="link mt-2 inline-flex items-center gap-1 text-xs"
                    >
                      {item.toolLink}
                      <ExternalLink className="size-3" />
                    </a>
                    {item.status === 'approved' ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> 已收录，感谢你的推荐！
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
