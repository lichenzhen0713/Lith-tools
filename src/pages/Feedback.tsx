import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageSquare, Star, ThumbsUp } from 'lucide-react';
import type { FeedbackDTO } from '@shared/types';
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
  PageHeader,
  PageLoader,
  Skeleton,
  Stars,
  Textarea,
} from '../components/ui';

type MyFeedback = Omit<FeedbackDTO, 'username'>;

const RATING_LABELS = ['很差', '一般', '还行', '满意', '非常满意'];

const STATUS_BADGES: Record<FeedbackDTO['status'], { label: string; tone: 'warning' | 'success' | 'default' }> = {
  open: { label: '待处理', tone: 'warning' },
  resolved: { label: '已解决', tone: 'success' },
  ignored: { label: '已忽略', tone: 'default' },
};

export default function Feedback() {
  useDocumentTitle('意见反馈');
  const { user, loading } = useAuth();
  const toast = useToast();

  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mine = useApi(() => http.get<{ items: MyFeedback[] }>('/api/feedback/mine'), [], {
    enabled: Boolean(user),
  });

  if (loading) return <PageLoader label="正在确认登录状态…" />;

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={MessageSquare}
          title="登录后即可提交反馈"
          description="反馈需要登录账号，这样我们才能把处理结果与回复关联到你的账户。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={`/login?next=${encodeURIComponent('/feedback')}`} className="btn-primary">
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
    if (rating < 1 || rating > 5) {
      setError('请选择 1-5 星评分');
      return;
    }
    if (!content.trim()) {
      setError('请输入反馈内容');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await http.post('/api/feedback', { rating, feedback: content.trim() });
      toast.success('反馈已提交，感谢你的意见！');
      setContent('');
      setRating(5);
      mine.reload();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const items = mine.data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="反馈"
        title="意见反馈"
        description="功能建议、问题反馈或任何想说的话都可以写在这里。每一条反馈都会被认真查看。"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="提交反馈" description="评分与文字都会帮助我们更快定位问题。" />
          <form
            className="space-y-5 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-2">
              <span className="label mb-0">整体评分</span>
              <div className="flex flex-wrap items-center gap-3">
                <Stars value={rating} onChange={setRating} size="lg" />
                <span className="text-sm muted">
                  {rating} 星 · {RATING_LABELS[rating - 1] ?? ''}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="feedback-content" className="label mb-0">
                反馈内容 <span className="text-rose-500">*</span>
              </label>
              <Textarea
                id="feedback-content"
                value={content}
                rows={7}
                maxLength={2000}
                placeholder="请描述你遇到的问题或建议，例如：在哪个工具、什么操作、期望的结果…"
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="flex items-center justify-between text-xs subtle">
                <span>请勿填写密码等敏感信息。</span>
                <span>{content.length} / 2000</span>
              </div>
            </div>

            {error ? <p className="text-sm text-rose-500">{error}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="text-xs subtle">提交后会通过邮件通知站点管理员。</p>
              <Button type="submit" icon={ThumbsUp} loading={submitting} disabled={!content.trim()}>
                提交反馈
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-4 text-indigo-600 dark:text-indigo-400" />
              提交之后
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed muted">
              <li>· 反馈会通过邮件通知站点管理员，一般在 1-2 个工作日内查看。</li>
              <li>· 处理进度会显示在下方「我的反馈」列表中，状态更新为「已解决」。</li>
              <li>· 每个账号每天最多提交 5 条反馈，请合并同类问题。</li>
            </ul>
          </Card>
          <Alert tone="info" title="想要更快的回复？">
            论坛里发帖往往能更快得到其他用户的帮助，也可以在管理后台查看公开的工具更新记录。
          </Alert>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Star className="size-4 text-amber-500" />
            我的反馈
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
              icon={Star}
              title="还没有反馈记录"
              description="提交第一条反馈后，可以在这里随时查看处理状态。"
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const badge = STATUS_BADGES[item.status] ?? STATUS_BADGES.open;
                return (
                  <Card key={item.id} className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={item.rating} size="sm" />
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <span className="ml-auto text-xs subtle">{formatDate(item.createdAt, 'datetime')}</span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{item.feedback}</p>
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
