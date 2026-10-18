import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Eye,
  FileText,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import type { BlogSubmissionDTO, FeedbackDTO, Role, SubmissionDTO, UserDTO } from '@shared/types';
import { errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate, formatNumber } from '../lib/utils';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Skeleton,
  StatCard,
  Stars,
  Tabs,
} from '../components/ui';

/* ------------------------------------------------------------------- types */

type TabKey = 'overview' | 'blogs' | 'submissions' | 'feedback' | 'settings';
const TAB_KEYS: TabKey[] = ['overview', 'blogs', 'submissions', 'feedback', 'settings'];

interface OverviewUser {
  id: number;
  username: string;
  email?: string;
  role: Role;
  createdAt: string;
  emailVerified?: boolean;
  bannedUntil?: string | null;
  lastIp?: string | null;
}

interface OverviewCounts {
  blogs: number;
  threads: number;
  posts: number;
  comments: number;
  feedback: number;
  submissions: number;
}

interface OverviewBlog {
  id: number;
  title: string;
  isPublic: boolean;
  views: number;
  createdAt: string;
}

interface ProfileOverview {
  user: OverviewUser;
  counts: OverviewCounts;
  blogs: OverviewBlog[];
}

interface SessionItem {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}

type MyFeedback = Omit<FeedbackDTO, 'username'>;
type BlogSubmissionItem = Pick<BlogSubmissionDTO, 'id' | 'title' | 'status' | 'createdAt'>;

/* ---------------------------------------------------------------- helpers */

const SUBMISSION_STATUS: Record<SubmissionDTO['status'], { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: '待审核', tone: 'warning' },
  approved: { label: '已通过', tone: 'success' },
  rejected: { label: '未通过', tone: 'danger' },
};

const FEEDBACK_STATUS: Record<FeedbackDTO['status'], { label: string; tone: 'warning' | 'success' | 'default' }> = {
  open: { label: '待处理', tone: 'warning' },
  resolved: { label: '已解决', tone: 'success' },
  ignored: { label: '已忽略', tone: 'default' },
};

function roleMeta(role: Role): { label: string; tone: 'default' | 'brand' | 'danger' } {
  if (role === 2) return { label: '超级管理员', tone: 'danger' };
  if (role === 1) return { label: '管理员', tone: 'brand' };
  return { label: '普通用户', tone: 'default' };
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return '未知设备';
  const ua = userAgent.toLowerCase();
  const os = ua.includes('windows')
    ? 'Windows'
    : ua.includes('android')
      ? 'Android'
      : /iphone|ipad|ios/.test(ua)
        ? 'iOS'
        : ua.includes('mac os')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : '未知系统';
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome')
      ? 'Chrome'
      : ua.includes('firefox')
        ? 'Firefox'
        : ua.includes('safari')
          ? 'Safari'
          : '未知浏览器';
  return `${os} · ${browser}`;
}

/* ---------------------------------------------------------------- dashboard */

export default function Dashboard() {
  useDocumentTitle('个人中心');
  const { user, loading, setUser } = useAuth();
  const [params, setParams] = useSearchParams();

  const overview = useApi(() => http.get<ProfileOverview>('/api/profile/overview'), [], {
    enabled: Boolean(user),
  });

  const tabParam = params.get('tab');
  const tab: TabKey = TAB_KEYS.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'overview';

  const changeTab = (next: TabKey) => {
    const merged = new URLSearchParams(params);
    if (next === 'overview') merged.delete('tab');
    else merged.set('tab', next);
    setParams(merged, { replace: true });
  };

  if (loading) return <PageLoader label="正在加载账户信息…" />;

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={UserIcon}
          title="请先登录"
          description="登录后可以查看个人资料、文章、投稿与反馈记录。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={`/login?next=${encodeURIComponent('/dashboard')}`} className="btn-primary">
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

  const counts = overview.data?.counts;

  const tabs: { value: TabKey; label: string; count?: number }[] = [
    { value: 'overview', label: '概览' },
    { value: 'blogs', label: '我的文章', count: counts?.blogs },
    { value: 'submissions', label: '投稿记录', count: counts?.submissions },
    { value: 'feedback', label: '反馈记录', count: counts?.feedback },
    { value: 'settings', label: '账户设置' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="账户"
        title="个人中心"
        description="查看你的内容与互动记录，管理账户信息与登录安全。"
        actions={
          <>
            <Link to="/blog/new" className="btn-secondary btn-sm">
              <Plus className="size-3.5" /> 写文章
            </Link>
            <Link to="/feedback" className="btn-primary btn-sm">
              <MessageSquare className="size-3.5" /> 意见反馈
            </Link>
          </>
        }
      />

      <Tabs className="mt-8" items={tabs} value={tab} onChange={changeTab} />

      <div className="mt-6">
        {tab === 'overview' ? (
          <OverviewTab user={user} overview={overview} />
        ) : tab === 'blogs' ? (
          <BlogsTab
            blogs={overview.data?.blogs ?? []}
            loading={overview.loading}
            error={overview.error}
            onChanged={() => overview.reload()}
          />
        ) : tab === 'submissions' ? (
          <SubmissionsTab />
        ) : tab === 'feedback' ? (
          <FeedbackTab />
        ) : (
          <SettingsTab
            user={user}
            onProfileUpdated={(next) => {
              setUser(next);
              overview.reload();
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- overview */

function OverviewTab({
  user,
  overview,
}: {
  user: UserDTO;
  overview: {
    data: ProfileOverview | null;
    error: string | null;
    loading: boolean;
    reload: () => void;
  };
}) {
  const role = roleMeta(user.role);
  const data = overview.data;

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={user.username} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{user.username}</h2>
              <Badge tone={role.tone}>{role.label}</Badge>
              {user.emailVerified ? (
                <Badge tone="success">
                  <ShieldCheck className="size-3.5" /> 邮箱已验证
                </Badge>
              ) : (
                <Badge tone="warning">邮箱未验证</Badge>
              )}
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
                <Mail className="size-3.5 shrink-0" />
                <dt className="sr-only">邮箱</dt>
                <dd className="truncate">{user.email || '未绑定邮箱'}</dd>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <CalendarDays className="size-3.5 shrink-0" />
                <dt className="sr-only">注册时间</dt>
                <dd>注册于 {formatDate(user.createdAt, 'date')}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {user.role >= 1 ? (
              <Link to="/admin" className="btn-secondary btn-sm">
                <LayoutDashboard className="size-3.5" /> 管理后台
              </Link>
            ) : null}
            <Link to="/dashboard?tab=settings" className="btn-ghost btn-sm">
              账户设置
            </Link>
          </div>
        </div>

        {overview.error ? (
          <Alert tone="error" className="mt-4" title="资料加载失败">
            <div className="flex flex-wrap items-center gap-3">
              <span>{overview.error}</span>
              <Button size="sm" variant="secondary" onClick={() => overview.reload()}>
                重试
              </Button>
            </div>
          </Alert>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!data && !overview.error
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28" />)
          : data
            ? [
                { label: '文章', value: data.counts.blogs, icon: BookOpen },
                { label: '主题', value: data.counts.threads, icon: MessageSquare },
                { label: '回复', value: data.counts.posts, icon: MessageCircle },
                { label: '评论', value: data.counts.comments, icon: FileText },
                { label: '反馈', value: data.counts.feedback, icon: Star },
                { label: '投稿', value: data.counts.submissions, icon: Send },
              ].map((item) => (
                <StatCard key={item.label} icon={item.icon} label={item.label} value={formatNumber(item.value)} />
              ))
            : null}
      </div>

      <Card>
        <CardHeader
          title="最近文章"
          description="最新发布的 5 篇文章，未公开的文章只有你自己可以看到。"
          action={
            <Link to="/dashboard?tab=blogs" className="btn-ghost btn-sm">
              全部文章
            </Link>
          }
        />
        <div className="divide-y">
          {!data && !overview.error ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : !data ? (
            <p className="p-5 text-sm subtle">文章列表暂时无法加载，请稍后重试。</p>
          ) : data.blogs.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="还没有发布文章"
              description="写下第一篇技术分享，让更多人看到你的经验。"
              className="border-0"
              action={
                <Link to="/blog/new" className="btn-primary btn-sm">
                  开始写作
                </Link>
              }
            />
          ) : (
            data.blogs.slice(0, 5).map((blog) => (
              <Link
                key={blog.id}
                to={`/blog/${blog.id}`}
                className="flex flex-wrap items-center gap-2 px-5 py-3 transition-colors hover:bg-[var(--hover-bg)]"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{blog.title}</span>
                <Badge tone={blog.isPublic ? 'success' : 'default'}>{blog.isPublic ? '已公开' : '仅自己可见'}</Badge>
                <span className="flex items-center gap-1 text-xs subtle">
                  <Eye className="size-3" /> {formatNumber(blog.views)}
                </span>
                <span className="text-xs subtle">{formatDate(blog.createdAt, 'date')}</span>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------- blogs */

function BlogsTab({
  blogs,
  loading,
  error,
  onChanged,
}: {
  blogs: OverviewBlog[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<OverviewBlog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await http.delete(`/api/blog/posts/${target.id}`);
      toast.success('文章已删除');
      setTarget(null);
      onChanged();
    } catch (deleteError) {
      toast.error(errorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="我的文章"
          description="管理你发布的所有文章，可编辑内容或删除。"
          action={
            <Link to="/blog/new" className="btn-primary btn-sm">
              <Plus className="size-3.5" /> 新建文章
            </Link>
          }
        />
        {loading && blogs.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : error ? (
          <div className="p-5">
            <Alert tone="error" title="文章加载失败">
              {error}
            </Alert>
          </div>
        ) : blogs.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="还没有文章"
            description="写下第一篇技术分享，或者先浏览社区里的公开文章。"
            className="border-0"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/blog/new" className="btn-primary">
                  写第一篇
                </Link>
                <Link to="/blog" className="btn-secondary">
                  浏览博客
                </Link>
              </div>
            }
          />
        ) : (
          <div className="divide-y">
            {blogs.map((blog) => (
              <div key={blog.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/blog/${blog.id}`}
                      className="truncate text-sm font-medium transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      {blog.title}
                    </Link>
                    <Badge tone={blog.isPublic ? 'success' : 'default'}>{blog.isPublic ? '已公开' : '仅自己可见'}</Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs subtle">
                    <span className="flex items-center gap-1">
                      <Eye className="size-3" /> {formatNumber(blog.views)} 阅读
                    </span>
                    <span>{formatDate(blog.createdAt, 'datetime')}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link to={`/blog/${blog.id}/edit`} className="btn-ghost btn-sm">
                    <Pencil className="size-3.5" /> 编辑
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    className="text-rose-600 dark:text-rose-400"
                    onClick={() => setTarget(blog)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(target)}
        onClose={() => {
          if (!deleting) setTarget(null);
        }}
        title="删除文章"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">
          确定要删除文章「{target?.title}」吗？文章下的评论也会一并删除，此操作不可撤销。
        </p>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------- submissions */

function SubmissionsTab() {
  const tools = useApi(() => http.get<{ items: SubmissionDTO[] }>('/api/submissions/tool/mine'), []);
  const blogs = useApi(() => http.get<{ items: BlogSubmissionItem[] }>('/api/blog/submissions/mine'), []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="工具投稿"
          description={`共 ${tools.data?.items.length ?? 0} 条`}
          action={
            <Link to="/submit/tool" className="btn-secondary btn-sm">
              <Plus className="size-3.5" /> 推荐工具
            </Link>
          }
        />
        <div>
          {tools.loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : tools.error ? (
            <div className="p-5">
              <Alert tone="error" title="加载失败">
                {tools.error}
              </Alert>
            </div>
          ) : (tools.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={Send}
              title="还没有工具投稿"
              description="推荐一个你觉得好用的工具吧。"
              className="border-0"
              action={
                <Link to="/submit/tool" className="btn-primary btn-sm">
                  去推荐
                </Link>
              }
            />
          ) : (
            <div className="divide-y">
              {tools.data?.items.map((item) => {
                const badge = SUBMISSION_STATUS[item.status] ?? SUBMISSION_STATUS.pending;
                return (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{item.toolName}</p>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <span className="ml-auto text-xs subtle">{formatDate(item.createdAt, 'date')}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed subtle">{item.description}</p>
                    <a
                      href={item.toolLink}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="link mt-1 inline-block truncate text-xs"
                    >
                      {item.toolLink}
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="文章投稿"
          description={`共 ${blogs.data?.items.length ?? 0} 条`}
          action={
            <Link to="/submit/blog" className="btn-secondary btn-sm">
              <Plus className="size-3.5" /> 投稿文章
            </Link>
          }
        />
        <div>
          {blogs.loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : blogs.error ? (
            <div className="p-5">
              <Alert tone="error" title="加载失败">
                {blogs.error}
              </Alert>
            </div>
          ) : (blogs.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={FileText}
              title="还没有文章投稿"
              description="投稿一篇教程或经验分享，审核通过后会发布在博客中。"
              className="border-0"
              action={
                <Link to="/submit/blog" className="btn-primary btn-sm">
                  去投稿
                </Link>
              }
            />
          ) : (
            <div className="divide-y">
              {blogs.data?.items.map((item) => {
                const badge = SUBMISSION_STATUS[item.status] ?? SUBMISSION_STATUS.pending;
                return (
                  <div key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</p>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <span className="text-xs subtle">{formatDate(item.createdAt, 'date')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- feedback */

function FeedbackTab() {
  const mine = useApi(() => http.get<{ items: MyFeedback[] }>('/api/feedback/mine'), []);

  return (
    <Card>
      <CardHeader
        title="反馈记录"
        description={`共 ${mine.data?.items.length ?? 0} 条反馈，状态会随处理进度更新。`}
        action={
          <Link to="/feedback" className="btn-secondary btn-sm">
            <Plus className="size-3.5" /> 提交反馈
          </Link>
        }
      />
      {mine.loading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : mine.error ? (
        <div className="p-5">
          <Alert tone="error" title="加载失败">
            {mine.error}
          </Alert>
        </div>
      ) : (mine.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={Star}
          title="还没有反馈记录"
          description="遇到问题或有功能建议，欢迎随时告诉我们。"
          className="border-0"
          action={
            <Link to="/feedback" className="btn-primary btn-sm">
              提交反馈
            </Link>
          }
        />
      ) : (
        <div className="divide-y">
          {mine.data?.items.map((item) => {
            const badge = FEEDBACK_STATUS[item.status] ?? FEEDBACK_STATUS.open;
            return (
              <div key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={item.rating} size="sm" />
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  <span className="ml-auto text-xs subtle">{formatDate(item.createdAt, 'datetime')}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">{item.feedback}</p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- settings */

function SettingsTab({
  user,
  onProfileUpdated,
}: {
  user: UserDTO;
  onProfileUpdated: (user: UserDTO) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email ?? '');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [pendingSession, setPendingSession] = useState<SessionItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const sessions = useApi(() => http.get<{ items: SessionItem[] }>('/api/auth/sessions'), []);

  const saveProfile = async () => {
    const nextUsername = username.trim();
    const nextEmail = email.trim();
    if (nextUsername.length < 3) {
      setProfileError('用户名至少 3 个字符');
      return;
    }
    if (!/^[\w\u4e00-\u9fa5.-]+$/u.test(nextUsername)) {
      setProfileError('用户名只能包含字母、数字、下划线、点、短横线或中文');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setProfileError('邮箱格式不正确');
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      const data = await http.patch<{ user: UserDTO }>('/api/auth/profile', {
        username: nextUsername,
        email: nextEmail,
      });
      onProfileUpdated(data.user);
      toast.success('个人信息已更新');
    } catch (error) {
      const message = errorMessage(error);
      setProfileError(message);
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword) {
      setPasswordError('请输入当前密码');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('新密码至少 8 位');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError('新密码需同时包含字母与数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await http.post('/api/auth/change-password', { currentPassword, newPassword });
      toast.success('密码已更新，其他设备已退出登录');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      sessions.reload();
    } catch (error) {
      const message = errorMessage(error);
      setPasswordError(message);
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const revokeSession = async () => {
    if (!pendingSession) return;
    setRevoking(true);
    try {
      await http.delete(`/api/auth/sessions/${pendingSession.id}`);
      toast.success('该会话已退出');
      setPendingSession(null);
      sessions.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRevoking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.info('已退出登录');
    navigate('/');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="基本信息" description="用户名会显示在文章、主题与评论中。" />
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="用户名" htmlFor="settings-username" required error={profileError}>
              <Input
                id="settings-username"
                value={username}
                maxLength={32}
                autoComplete="username"
                error={Boolean(profileError)}
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>
            <Field label="邮箱" htmlFor="settings-email" required hint="用于接收通知与找回密码。">
              <Input
                id="settings-email"
                type="email"
                value={email}
                maxLength={254}
                autoComplete="email"
                error={Boolean(profileError)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <p className="flex items-center gap-1.5 text-xs subtle">
              {user.emailVerified ? (
                <>
                  <ShieldCheck className="size-3.5 text-emerald-500" /> 邮箱已验证
                </>
              ) : (
                <>
                  <AlertTriangle className="size-3.5 text-amber-500" /> 邮箱尚未验证
                </>
              )}
            </p>
            <Button type="submit" loading={savingProfile}>
              保存修改
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="修改密码" description="修改后，除当前设备外的其他登录会话会被强制退出。" />
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void savePassword();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="当前密码" htmlFor="current-password" required>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="新密码" htmlFor="new-password" required hint="至少 8 位，包含字母与数字。">
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field label="确认新密码" htmlFor="confirm-password" required>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </Field>
          </div>
          {passwordError ? <p className="text-sm text-rose-500">{passwordError}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <p className="flex items-center gap-1.5 text-xs subtle">
              <KeyRound className="size-3.5" /> 密码使用 scrypt 哈希存储，我们无法查看你的明文密码。
            </p>
            <Button type="submit" icon={KeyRound} loading={savingPassword}>
              更新密码
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="登录会话"
          description="这些设备当前已登录你的账户，退出后需要重新输入密码。"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              loading={sessions.loading && !sessions.data}
              onClick={() => sessions.reload()}
            >
              刷新
            </Button>
          }
        />
        {sessions.loading && !sessions.data ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        ) : sessions.error ? (
          <div className="p-5">
            <Alert tone="error" title="会话加载失败">
              {sessions.error}
            </Alert>
          </div>
        ) : (sessions.data?.items.length ?? 0) === 0 ? (
          <p className="p-5 text-sm subtle">没有可显示的会话记录。</p>
        ) : (
          <ul className="divide-y">
            {sessions.data?.items.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--hover-bg)] text-[var(--text-secondary)]">
                  <Globe className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {deviceLabel(session.userAgent)}
                    {session.current ? <Badge tone="success">当前会话</Badge> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs subtle">
                    <span>IP {session.ip ?? '未知'}</span>
                    <span>登录于 {formatDate(session.createdAt, 'datetime')}</span>
                    <span>到期 {formatDate(session.expiresAt, 'date')}</span>
                  </p>
                </div>
                {!session.current ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={LogOut}
                    className="text-rose-600 dark:text-rose-400"
                    onClick={() => setPendingSession(session)}
                  >
                    退出
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">退出登录</h3>
            <p className="mt-1 text-xs subtle">退出当前设备上的登录状态，其他设备的会话不受影响。</p>
          </div>
          <Button variant="secondary" icon={LogOut} onClick={() => void handleSignOut()}>
            退出当前账号
          </Button>
        </div>
      </Card>

      <Modal
        open={Boolean(pendingSession)}
        onClose={() => {
          if (!revoking) setPendingSession(null);
        }}
        title="退出该会话"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingSession(null)} disabled={revoking}>
              取消
            </Button>
            <Button variant="danger" loading={revoking} onClick={() => void revokeSession()}>
              退出该设备
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">
          确定要退出「{deviceLabel(pendingSession?.userAgent ?? null)}」的登录状态吗？该设备之后需要重新输入密码才能访问。
        </p>
      </Modal>
    </div>
  );
}
