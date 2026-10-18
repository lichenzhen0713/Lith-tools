import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Ban,
  BookOpen,
  Clock,
  FileText,
  Inbox,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  PowerOff,
  RefreshCw,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AdminStats } from '@shared/types';
import { http } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { formatNumber } from '../../lib/utils';
import { Alert, Button, Card, PageHeader, Skeleton, StatCard } from '../../components/ui';
import { useIsSuperAdmin } from './AdminLayout';

interface StatItem {
  key: keyof AdminStats;
  label: string;
  icon: LucideIcon;
  hint?: string;
  /** Optional quick link for actionable counters. */
  to?: string;
}

const STAT_GROUPS: { title: string; items: StatItem[] }[] = [
  {
    title: '用户与权限',
    items: [
      { key: 'users', label: '注册用户', icon: Users, hint: '包含管理员账户' },
      { key: 'admins', label: '管理员', icon: ShieldCheck, hint: '角色 ≥ 管理员' },
    ],
  },
  {
    title: '内容数据',
    items: [
      { key: 'tools', label: '工具总数', icon: Wrench, hint: '内置 + 外链' },
      { key: 'disabledTools', label: '已禁用工具', icon: PowerOff, hint: '前台不可见' },
      { key: 'blogs', label: '博客文章', icon: BookOpen, hint: '含未公开文章' },
      { key: 'comments', label: '博客评论', icon: MessageSquare },
      { key: 'threads', label: '论坛主题', icon: MessagesSquare },
      { key: 'posts', label: '论坛回复', icon: MessageCircle },
    ],
  },
  {
    title: '待处理',
    items: [
      { key: 'feedbackOpen', label: '待处理反馈', icon: MessageSquare, to: '/admin/feedback' },
      {
        key: 'toolSubmissionsPending',
        label: '待审工具投稿',
        icon: Inbox,
        to: '/admin/submissions?type=tool&status=pending',
      },
      {
        key: 'blogSubmissionsPending',
        label: '待审博客投稿',
        icon: FileText,
        to: '/admin/submissions?type=blog&status=pending',
      },
    ],
  },
  {
    title: '访问与安全',
    items: [
      { key: 'visits', label: '累计访问', icon: Activity, hint: '页面访问次数总和' },
      { key: 'todayVisits', label: '今日访问', icon: Clock, hint: '今日记录的访问次数' },
      { key: 'bannedIps', label: '封禁 IP', icon: Ban, hint: '当前生效中的封禁' },
    ],
  },
];

export default function AdminOverview() {
  const stats = useApi(() => http.get<AdminStats>('/api/admin/stats'), []);
  const isSuper = useIsSuperAdmin();

  const quickLinks = [
    {
      to: '/admin/submissions',
      title: '待审投稿',
      description: '审核用户提交的工具与文章',
      icon: Inbox,
    },
    {
      to: '/admin/feedback',
      title: '用户反馈',
      description: '查看评分与意见，标记处理结果',
      icon: MessageSquare,
    },
    ...(isSuper
      ? [
          {
            to: '/admin/bans',
            title: '封禁 IP',
            description: '管理当前封禁与历史记录',
            icon: Ban,
          },
        ]
      : []),
  ];

  const pendingTotal =
    (stats.data?.feedbackOpen ?? 0) +
    (stats.data?.toolSubmissionsPending ?? 0) +
    (stats.data?.blogSubmissionsPending ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="管理后台"
        title="概览"
        description="站点关键数据与待处理事项一览。数据来自实时统计，刷新即可获取最新状态。"
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={stats.loading} onClick={stats.reload}>
            刷新数据
          </Button>
        }
      />

      {stats.error ? (
        <Alert tone="error" title="统计数据加载失败">
          {stats.error}
        </Alert>
      ) : null}

      {/* ---------------------------------------------------------- 快捷入口 */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              className="card group flex items-center gap-3 p-4 transition-colors hover:border-indigo-200 dark:hover:border-indigo-500/30"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{link.title}</p>
                <p className="mt-0.5 truncate text-xs subtle">{link.description}</p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </section>

      {pendingTotal > 0 ? (
        <Alert tone="warning" title={`有 ${formatNumber(pendingTotal)} 项待处理事项`}>
          待审投稿与未处理的用户反馈会一直显示在下方统计中，处理完成后数字会自动更新。
        </Alert>
      ) : null}

      {/* -------------------------------------------------------------- 统计卡 */}
      {stats.loading && !stats.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : stats.data ? (
        <div className="space-y-6">
          {STAT_GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="mb-3 text-sm font-semibold tracking-tight text-[var(--text-secondary)]">{group.title}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {group.items.map((item) => {
                  const card = (
                    <StatCard
                      icon={item.icon}
                      label={item.label}
                      value={formatNumber(stats.data?.[item.key] ?? 0)}
                      hint={item.hint}
                      className={item.to ? 'transition-colors hover:border-indigo-200 dark:hover:border-indigo-500/30' : undefined}
                    />
                  );
                  return item.to ? (
                    <Link key={item.key} to={item.to} className="block">
                      {card}
                    </Link>
                  ) : (
                    <div key={item.key}>{card}</div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- 说明 */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">使用说明</h2>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed muted">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" />
            普通管理员可以管理博客、反馈、投稿与访问记录；用户、工具、分类与封禁功能仅超级管理员可见。
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" />
            封禁用户会立即清除其登录会话并发送邮件通知；封禁 IP 会阻断该地址的所有请求。
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" />
            删除用户、工具、文章与分类不可恢复，操作前请确认数据已备份。
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/admin/submissions" className="btn-secondary btn-sm">
            <FileText className="size-3.5" /> 审核投稿
          </Link>
          <Link to="/admin/feedback" className="btn-secondary btn-sm">
            <MessageSquare className="size-3.5" /> 查看反馈
          </Link>
          {isSuper ? (
            <Link to="/admin/access-logs" className="btn-secondary btn-sm">
              <Activity className="size-3.5" /> 访问记录
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
