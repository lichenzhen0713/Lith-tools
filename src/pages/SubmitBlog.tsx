import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  RotateCw,
  Send,
  XCircle,
} from 'lucide-react';
import { errorMessage, http } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useToast } from '../lib/toast';
import { cn, formatDate } from '../lib/utils';
import { Markdown } from '../components/Markdown';
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
  Skeleton,
  Tabs,
  Textarea,
  useFieldId,
} from '../components/ui';

interface MySubmission {
  id: number;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

type SubmitTab = 'write' | 'preview';

const TITLE_MAX = 200;

const steps = [
  { title: '填写投稿', description: '写下标题与 Markdown 正文，右侧实时预览最终效果。' },
  { title: '人工审核', description: '编辑通常会在 1–2 个工作日内处理，进度可在「我的投稿」查看。' },
  { title: '发布上线', description: '审核通过后由编辑发布到博客频道；未通过会保留记录但不会公开。' },
];

function statusMeta(status: MySubmission['status'] | string) {
  if (status === 'approved') return { label: '已通过', tone: 'success' as const, Icon: CheckCircle2 };
  if (status === 'rejected') return { label: '未通过', tone: 'danger' as const, Icon: XCircle };
  return { label: '审核中', tone: 'warning' as const, Icon: Clock };
}

export default function SubmitBlog() {
  useDocumentTitle('投稿文章');
  const toast = useToast();
  const { user } = useAuth();
  const canPublish = Boolean(user && user.role >= 1);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tab, setTab] = useState<SubmitTab>('write');
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const titleFieldId = useFieldId('submit-blog-title');
  const contentFieldId = useFieldId('submit-blog-content');

  const mine = useApi(() => http.get<{ items: MySubmission[] }>('/api/blog/submissions/mine'), []);
  const submissions = mine.data?.items ?? [];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextContent = content.trim();

    if (!nextTitle) {
      setTitleError('请填写文章标题');
      setFormError('请填写文章标题');
      return;
    }
    if (!nextContent) {
      setFormError('请填写投稿正文');
      return;
    }
    setTitleError(null);
    setFormError(null);
    setSubmitting(true);

    try {
      const result = await http.post<{ message: string; id: number }>('/api/blog/submissions', {
        title: nextTitle,
        content: nextContent,
      });
      setTitle('');
      setContent('');
      setTab('write');
      setSubmitted(true);
      mine.reload();
      toast.success(result.message || '投稿已提交，等待审核');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="投稿"
        title="投稿一篇文章"
        description="你的经验可能会帮助到别人。投稿会先进入人工审核队列，通过后由编辑发布到博客频道。"
        actions={
          <>
            <Link to="/blog" className="btn-secondary btn-sm">
              <ArrowLeft className="size-3.5" /> 返回博客
            </Link>
            {canPublish ? (
              <Link to="/blog/new" className="btn-ghost btn-sm">
                直接写文章
              </Link>
            ) : null}
          </>
        }
      />

      {/* --------------------------------------------------------- review flow */}
      <Card className="mt-6 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            <ListChecks className="size-4" />
          </span>
          审核流程
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border bg-[var(--hover-bg)]/60 p-4">
              <span className="flex size-6 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <p className="mt-2.5 text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed subtle">{step.description}</p>
            </li>
          ))}
        </ol>
        <Alert tone="info" className="mt-4">
          请勿提交广告、侵权或与工具使用无关的内容；同一篇文章请勿重复投稿。投稿前请确认正文中的链接可以正常访问。
        </Alert>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------- form */}
        <Card className="overflow-hidden self-start">
          <CardHeader title="投稿内容" description="支持 Markdown、公式与代码块" />
          <form onSubmit={submit} className="space-y-4 p-5">
            <Field
              label="标题"
              htmlFor={titleFieldId}
              required
              error={titleError}
              hint={`${title.length} / ${TITLE_MAX} 字`}
            >
              <Input
                id={titleFieldId}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (titleError) setTitleError(null);
                  if (formError) setFormError(null);
                  if (submitted) setSubmitted(false);
                }}
                placeholder="例如：用 JSON 格式化工具排查接口问题"
                maxLength={TITLE_MAX}
                error={Boolean(titleError)}
              />
            </Field>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor={contentFieldId} className="label mb-0">
                  正文<span className="ml-0.5 text-rose-500">*</span>
                </label>
                <span className="text-xs subtle">{content.length} 字符</span>
              </div>
              <Tabs
                items={[
                  { value: 'write', label: '编辑' },
                  { value: 'preview', label: '预览' },
                ]}
                value={tab}
                onChange={setTab}
                className="lg:hidden"
              />
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <div className={cn(tab === 'preview' && 'hidden lg:block')}>
                  <Textarea
                    id={contentFieldId}
                    value={content}
                    onChange={(event) => {
                      setContent(event.target.value);
                      if (formError) setFormError(null);
                      if (submitted) setSubmitted(false);
                    }}
                    placeholder={'## 使用场景\n\n介绍一下你的思路…'}
                    maxLength={200_000}
                    className="min-h-[22rem] resize-y font-mono text-[13px] leading-6"
                    aria-label="投稿正文"
                  />
                </div>
                <div
                  className={cn(
                    'min-h-[22rem] overflow-x-auto rounded-xl border bg-[var(--card-bg)] p-4',
                    tab === 'write' && 'hidden lg:block',
                  )}
                >
                  <Markdown content={content} empty="在这里实时预览 Markdown 效果。" />
                </div>
              </div>
            </div>

            {formError ? <Alert tone="error">{formError}</Alert> : null}

            {submitted ? (
              <Alert tone="success" title="投稿已提交">
                我们会在审核后处理你的投稿，可以在右侧「我的投稿」中查看进度。
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" icon={Send} loading={submitting}>
                提交审核
              </Button>
              <span className="text-xs subtle">提交后不可自行修改，请确认内容无误</span>
            </div>
          </form>
        </Card>

        {/* ---------------------------------------------------------- sidebar */}
        <aside className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader
              title="我的投稿"
              description={submissions.length > 0 ? `共 ${submissions.length} 条投稿记录` : '还没有投稿记录'}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  icon={RotateCw}
                  onClick={mine.reload}
                  loading={mine.loading && submissions.length > 0}
                  aria-label="刷新投稿列表"
                />
              }
            />

            {mine.error ? (
              <div className="space-y-3 p-4 text-sm">
                <p className="text-rose-600 dark:text-rose-400">{mine.error}</p>
                <Button variant="secondary" size="sm" icon={RotateCw} onClick={mine.reload}>
                  重新加载
                </Button>
              </div>
            ) : mine.loading && !mine.data ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : submissions.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="还没有投稿"
                description="提交上面的表单，即可在这里跟进审核进度。"
                className="py-10"
              />
            ) : (
              <ul className="divide-y">
                {submissions.map((item) => {
                  const meta = statusMeta(item.status);
                  return (
                    <li key={item.id} className="px-4 py-3">
                      <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs subtle">
                        <Badge tone={meta.tone}>
                          <meta.Icon className="size-3" />
                          {meta.label}
                        </Badge>
                        <time dateTime={item.createdAt}>{formatDate(item.createdAt, 'datetime')}</time>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold tracking-tight">投稿进度说明</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Badge tone="warning">审核中</Badge>
                <span className="flex-1 text-xs leading-relaxed muted">已提交并进入队列，等待管理员处理。</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge tone="success">已通过</Badge>
                <span className="flex-1 text-xs leading-relaxed muted">内容已通过审核，将（或已经）发布到博客频道。</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge tone="danger">未通过</Badge>
                <span className="flex-1 text-xs leading-relaxed muted">
                  未达到发布要求，记录会保留但不会公开；可修改后重新投稿。
                </span>
              </li>
            </ul>
            <p className="mt-4 border-t pt-3 text-xs leading-relaxed subtle">
              {canPublish ? (
                <>
                  想立即发布文章？拥有发文权限的账号可以直接
                  <Link to="/blog/new" className="mx-1 text-indigo-600 hover:underline dark:text-indigo-400">
                    写文章
                  </Link>
                  ，无需审核。
                </>
              ) : (
                '普通用户提交的文章会进入审核队列，审核通过后由管理员发布到博客频道。'
              )}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
