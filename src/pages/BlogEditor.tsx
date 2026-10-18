import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Lock, RotateCw, Save, Trash2 } from 'lucide-react';
import type { BlogDetail as BlogPostDetail, CategoryDTO } from '@shared/types';
import { ApiError, errorMessage, http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useToast } from '../lib/toast';
import { cn, formatDate } from '../lib/utils';
import { Markdown } from '../components/Markdown';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FormRow,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  useFieldId,
} from '../components/ui';

type EditorTab = 'write' | 'preview';

interface Draft {
  title: string;
  content: string;
  categoryId: string;
  isPublic: boolean;
}

const EMPTY_DRAFT: Draft = { title: '', content: '', categoryId: '', isPublic: true };
const TITLE_MAX = 200;
const CONTENT_MAX = 200_000;

export default function BlogEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const isEdit = Boolean(id);
  const postId = Number.parseInt(id ?? '', 10);
  const validId = !isEdit || (Number.isInteger(postId) && postId > 0);

  useDocumentTitle(isEdit ? '编辑文章' : '写文章');

  const categories = useApi(() => http.get<{ items: CategoryDTO[] }>('/api/blog/categories'), []);

  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const existing = useApi<BlogPostDetail>(
    async () => {
      try {
        const data = await http.get<BlogPostDetail>(`/api/blog/posts/${postId}`);
        setErrorStatus(null);
        return data;
      } catch (error) {
        setErrorStatus(error instanceof ApiError ? error.status : null);
        throw error;
      }
    },
    [postId],
    { enabled: isEdit && validId },
  );

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [tab, setTab] = useState<EditorTab>('write');
  const [ready, setReady] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const initialRef = useRef<Draft>(EMPTY_DRAFT);
  const titleFieldId = useFieldId('blog-title');
  const categoryFieldId = useFieldId('blog-category');
  const contentFieldId = useFieldId('blog-content');

  const initial = initialRef.current;
  const dirty =
    title !== initial.title ||
    content !== initial.content ||
    categoryId !== initial.categoryId ||
    isPublic !== initial.isPublic;

  const cancelTo = isEdit && validId ? `/blog/${postId}` : '/blog';

  /* ------------------------------------------------------- load into the form */
  useEffect(() => {
    if (!isEdit || ready) return;
    const data = existing.data;
    if (!data) return;
    if (!data.canEdit) {
      toast.error('您没有权限编辑这篇文章');
      navigate(`/blog/${data.id}`, { replace: true });
      return;
    }
    const nextCategory = data.category ? String(data.category.id) : '';
    setTitle(data.title);
    setContent(data.content);
    setCategoryId(nextCategory);
    setIsPublic(data.isPublic);
    initialRef.current = {
      title: data.title,
      content: data.content,
      categoryId: nextCategory,
      isPublic: data.isPublic,
    };
    setReady(true);
  }, [isEdit, ready, existing.data, navigate, toast]);

  /* ------------------------------------------------- leave-guard (unsaved) */
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* --------------------------------------------------------------- actions */
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextContent = content.trim();

    if (!nextTitle) {
      setTitleError('请填写文章标题');
      setFormError('请填写文章标题');
      return;
    }
    if (nextTitle.length > TITLE_MAX) {
      setTitleError(`标题最多 ${TITLE_MAX} 字`);
      setFormError(`标题最多 ${TITLE_MAX} 字`);
      return;
    }
    if (!nextContent) {
      setFormError('请填写文章正文');
      return;
    }
    setTitleError(null);
    setFormError(null);
    setSaving(true);

    const payload = {
      title: nextTitle,
      content: nextContent,
      categoryId: categoryId ? Number(categoryId) : null,
      isPublic,
    };

    try {
      if (isEdit) {
        await http.patch<{ post: { id: number } }>(`/api/blog/posts/${postId}`, payload);
        // Avoid the "unsaved changes" prompt while navigating away.
        initialRef.current = { title, content, categoryId, isPublic };
        toast.success('文章已更新');
        navigate(`/blog/${postId}`, { replace: true });
      } else {
        const result = await http.post<{ post: { id: number } }>('/api/blog/posts', payload);
        initialRef.current = { title, content, categoryId, isPublic };
        toast.success(isPublic ? '文章已发布' : '私有文章已保存');
        navigate(`/blog/${result.post.id}`);
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await http.delete<{ message: string }>(`/api/blog/posts/${postId}`);
      initialRef.current = { title, content, categoryId, isPublic };
      setDeleteOpen(false);
      toast.success('文章已删除');
      navigate('/blog', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setCancelOpen(true);
    else navigate(cancelTo);
  };

  /* ----------------------------------------------------------------- guards */
  if (!validId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={AlertTriangle}
          title="文章地址无效"
          description="链接中的文章编号不正确，请从博客列表重新进入。"
          action={
            <Link to="/blog" className="btn-primary">
              <ArrowLeft className="size-4" /> 返回博客列表
            </Link>
          }
        />
      </div>
    );
  }

  if (isEdit && existing.error) {
    const notFound = errorStatus === 404;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={notFound ? AlertTriangle : Lock}
          title={notFound ? '文章不存在或未公开' : errorStatus === 403 ? '没有编辑权限' : '文章加载失败'}
          description={existing.error}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/blog" className="btn-primary">
                <ArrowLeft className="size-4" /> 返回博客列表
              </Link>
              <Button variant="secondary" icon={RotateCw} onClick={existing.reload}>
                重试
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (isEdit && !ready) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const charCount = content.length;
  const lineCount = content ? content.split('\n').length : 0;
  const canDelete = Boolean(existing.data?.canDelete);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={cancelTo} className="inline-flex items-center gap-1.5 text-sm muted transition-colors hover:text-[var(--text-primary)]">
          <ArrowLeft className="size-4" /> {isEdit ? '返回文章' : '返回博客列表'}
        </Link>
        {isEdit ? (
          <span className={cn('text-xs', dirty ? 'font-medium text-amber-600 dark:text-amber-400' : 'subtle')}>
            {dirty ? '有未保存的修改' : existing.data ? `上次更新：${formatDate(existing.data.updatedAt, 'datetime')}` : '已保存'}
          </span>
        ) : null}
      </div>

      <PageHeader
        className="mt-4"
        eyebrow={isEdit ? '编辑' : '写作'}
        title={isEdit ? '编辑文章' : '写一篇新文章'}
        description={
          isEdit
            ? '修改标题、分类或正文，保存后立即生效。'
            : '支持 Markdown、公式（$…$）与代码块。设为私有时只有你和管理员可见。'
        }
      />

      <form onSubmit={save} className="mt-6 space-y-4">
        <Card className="space-y-4 p-5">
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
              }}
              placeholder="给文章起一个清晰的标题"
              maxLength={TITLE_MAX}
              error={Boolean(titleError)}
              autoFocus={!isEdit}
            />
          </Field>

          <FormRow>
            <Field
              label="分类"
              htmlFor={categoryFieldId}
              hint={categories.error ? '分类加载失败，可稍后重试' : '可不选择分类'}
            >
              <Select
                id={categoryFieldId}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">未分类</option>
                {(categories.data?.items ?? []).map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="可见性" hint={isPublic ? '所有访客都可以阅读' : '仅自己与管理员可见'}>
              <div className="flex h-[42px] items-center">
                <Switch
                  checked={isPublic}
                  onChange={setIsPublic}
                  label={
                    <span className="flex items-center gap-1.5">
                      {isPublic ? '公开' : <><Lock className="size-3.5" /> 私有</>}
                    </span>
                  }
                />
              </div>
            </Field>
          </FormRow>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <label htmlFor={contentFieldId} className="text-sm font-medium">
              正文 <span className="ml-1 text-xs font-normal subtle">Markdown</span>
            </label>
            <span className="text-xs subtle">
              {charCount} 字符 · {lineCount} 行
            </span>
          </div>

          <Tabs
            className="px-2 lg:hidden"
            items={[
              { value: 'write', label: '编辑' },
              { value: 'preview', label: '预览' },
            ]}
            value={tab}
            onChange={setTab}
          />

          <div className="grid lg:grid-cols-2 lg:divide-x">
            <div className={cn('p-3', tab === 'preview' && 'hidden lg:block')}>
              <Textarea
                id={contentFieldId}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder={'# 标题\n\n正文支持 **Markdown**、`代码`、列表与 $E=mc^2$ 公式…'}
                maxLength={CONTENT_MAX}
                className="min-h-[26rem] resize-y font-mono text-[13px] leading-6"
                aria-label="文章正文"
              />
            </div>
            <div className={cn('min-h-[26rem] overflow-x-auto p-5', tab === 'write' && 'hidden lg:block')}>
              <Markdown content={content} empty="在左侧输入 Markdown，这里会实时预览。" />
            </div>
          </div>
        </Card>

        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" icon={Save} loading={saving}>
            {isEdit ? '保存修改' : isPublic ? '发布文章' : '保存私有文章'}
          </Button>
          <Button type="button" variant="secondary" onClick={requestCancel}>
            取消
          </Button>
          {isEdit && canDelete ? (
            <Button
              type="button"
              variant="ghost"
              icon={Trash2}
              className="ml-auto text-rose-600 hover:text-rose-700 dark:text-rose-400"
              onClick={() => setDeleteOpen(true)}
            >
              删除文章
            </Button>
          ) : null}
        </div>
      </form>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="放弃未保存的修改？"
        description="离开后本次修改将不会保留。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              继续编辑
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setCancelOpen(false);
                initialRef.current = { title, content, categoryId, isPublic };
                navigate(cancelTo);
              }}
            >
              放弃修改
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">当前草稿还有未保存的内容，确定要离开吗？</p>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除这篇文章？"
        description="删除后文章、点赞与评论都无法恢复。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" icon={Trash2} loading={deleting} onClick={confirmDelete}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed muted">即将删除《{title.trim() || existing.data?.title || ''}》。</p>
      </Modal>
    </div>
  );
}
