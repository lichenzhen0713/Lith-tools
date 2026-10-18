import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './ui';

interface Props {
  children: ReactNode;
  /** Shown above the actions; useful for tool-specific failures. */
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] rendering error:', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card mx-auto max-w-2xl p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{this.props.label ?? '页面渲染出错'}</h2>
        <p className="mt-2 text-sm leading-relaxed muted">
          抱歉，这里出现了一个意外错误。你可以尝试重新加载；如果问题持续存在，请把下面的信息反馈给我们。
        </p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-[var(--hover-bg)] p-3 text-left text-xs break-all subtle">
          {error.message}
        </pre>
        <div className="mt-5 flex justify-center gap-2">
          <Button icon={RotateCcw} onClick={this.reset}>
            重试
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            重新加载页面
          </Button>
        </div>
      </div>
    );
  }
}
