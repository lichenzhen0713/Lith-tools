import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, SearchX } from 'lucide-react';
import { useDocumentTitle } from '../lib/hooks';

export default function NotFound() {
  useDocumentTitle('页面不存在');
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <div className="grid size-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300">
        <SearchX className="size-7" />
      </div>
      <p className="mt-6 text-sm font-semibold tracking-[0.2em] text-indigo-600 uppercase dark:text-indigo-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">这个页面走丢了</h1>
      <p className="mt-3 text-sm leading-relaxed muted">
        你访问的链接可能已经失效，或者地址输入有误。回到首页或者去工具库逛逛吧。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/" className="btn-primary">
          <ArrowLeft className="size-4" /> 返回首页
        </Link>
        <Link to="/tools" className="btn-secondary">
          <Compass className="size-4" /> 浏览工具库
        </Link>
      </div>
    </div>
  );
}
