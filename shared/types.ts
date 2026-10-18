/** Shared API contract types (used by both the server and the web client). */

export type Role = 0 | 1 | 2;

export interface UserDTO {
  id: number;
  username: string;
  email?: string;
  role: Role;
  createdAt: string;
  emailVerified?: boolean;
  bannedUntil?: string | null;
  banReason?: string | null;
}

export interface ToolCategoryDTO {
  id: number;
  slug: string;
  name: string;
  icon: string;
  description: string;
  toolCount?: number;
}

export interface ToolDTO {
  id: number;
  slug: string | null;
  name: string;
  description: string;
  href: string;
  icon: string;
  isExternal: boolean;
  disabled: boolean;
  category: ToolCategoryDTO | null;
}

export interface PublicStats {
  tools: number;
  categories: number;
  blogs: number;
  threads: number;
  posts: number;
  users: number;
}

export interface AuthorDTO {
  id: number;
  username: string;
  role?: Role;
}

export interface CategoryDTO {
  id: number;
  name: string;
  blogCount?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BlogListItem {
  id: number;
  title: string;
  summary: string;
  author: AuthorDTO;
  category: CategoryDTO | null;
  isPublic: boolean;
  views: number;
  likes: number;
  comments: number;
  createdAt: string;
  updatedAt: string;
  canEdit?: boolean;
}

export interface BlogCommentDTO {
  id: number;
  content: string;
  author: AuthorDTO;
  createdAt: string;
  canDelete: boolean;
}

export interface BlogDetail extends BlogListItem {
  content: string;
  likedByMe: boolean;
  commentsList: Paginated<BlogCommentDTO>;
  canDelete: boolean;
}

export interface ForumDTO {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  threadCount: number;
  postCount: number;
  lastActivityAt: string | null;
}

export interface ThreadListItem {
  id: number;
  forumId: number;
  forumName?: string;
  title: string;
  author: AuthorDTO;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  lastReplyAt: string | null;
}

export interface ForumThreadPostDTO {
  id: number;
  content: string;
  author: AuthorDTO;
  createdAt: string;
  canDelete: boolean;
}

export interface ThreadDetail {
  thread: ThreadListItem;
  forum: ForumDTO;
  posts: Paginated<ForumThreadPostDTO>;
}

export interface FeedbackDTO {
  id: number;
  username: string;
  rating: number;
  feedback: string;
  status: 'open' | 'resolved' | 'ignored';
  createdAt: string;
}

export interface SubmissionDTO {
  id: number;
  username: string;
  toolName: string;
  description: string;
  toolLink: string;
  status: 'pending' | 'approved' | 'rejected';
  ipAddress?: string;
  createdAt: string;
}

export interface BlogSubmissionDTO {
  id: number;
  username: string;
  title: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface AdminUserDTO extends UserDTO {
  lastIp: string | null;
  sessions: number;
  blogCount: number;
  bannedUntil: string | null;
  banReason: string | null;
}

export interface AdminStats {
  users: number;
  admins: number;
  tools: number;
  disabledTools: number;
  blogs: number;
  comments: number;
  threads: number;
  posts: number;
  feedbackOpen: number;
  toolSubmissionsPending: number;
  blogSubmissionsPending: number;
  bannedIps: number;
  visits: number;
  todayVisits: number;
}

export interface BanRecordDTO {
  ipAddress: string;
  reason: string;
  bannedUntil: string;
  createdAt: string;
}

export interface BanHistoryDTO {
  id: number;
  ipAddress: string;
  reason: string;
  bannedUntil: string;
  bannedAt: string;
  unbanTime: string | null;
}

export interface AccessLogDTO {
  ipAddress: string;
  accessTime: string;
  accessCount: number;
  banned: boolean;
}

export interface AuthResponse {
  user: UserDTO;
}

export interface MessageResponse {
  message: string;
  devCode?: string;
  delivered?: boolean;
}

export interface SiteConfigDTO {
  name: string;
  version: string;
  smtpConfigured: boolean;
  assistantConfigured: boolean;
  registrationOpen: boolean;
}
