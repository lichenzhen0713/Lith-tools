import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import html2canvas from 'html2canvas';
import { Download, Eraser, ImageDown } from 'lucide-react';
import { Actions, CopyButton, Field, Input, Panel, Textarea, ToolSplit } from './kit';
import { Alert, Button, Switch } from '../components/ui';
import { cn, download } from '../lib/utils';
import { useToast } from '../lib/toast';

const EXAMPLES: { label: string; tex: string }[] = [
  { label: '二次公式', tex: String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}` },
  { label: '积分', tex: String.raw`\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}` },
  { label: '矩阵', tex: String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}` },
  { label: '求和', tex: String.raw`\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}` },
  { label: '极限', tex: String.raw`\lim_{x \to 0} \frac{\sin x}{x} = 1` },
  { label: '麦克斯韦', tex: String.raw`\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}` },
];

const TEXT_COLORS = ['#111827', '#4f46e5', '#dc2626', '#059669', '#ffffff'];
const BACKGROUNDS = ['#ffffff', '#f8fafc', '#0f172a', '#111827', '#fef3c7'];

const DEFAULT_TEX = String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;

export default function LatexImageTool() {
  const toast = useToast();
  const [tex, setTex] = useState(DEFAULT_TEX);
  const [displayMode, setDisplayMode] = useState(true);
  const [fontSize, setFontSize] = useState(28);
  const [color, setColor] = useState('#111827');
  const [background, setBackground] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);
  const [padding, setPadding] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const formulaRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const empty = tex.trim().length === 0;
  const safeColor = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : '#111827';
  const safeBackground = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(background)
    ? background
    : '#ffffff';
  const colorPickerValue = /^#[0-9a-f]{6}$/i.test(safeColor) ? safeColor : '#111827';
  const backgroundPickerValue = /^#[0-9a-f]{6}$/i.test(safeBackground) ? safeBackground : '#ffffff';

  useEffect(() => {
    const container = formulaRef.current;
    if (!container) return;
    const source = tex.trim();
    if (!source) {
      container.replaceChildren();
      setError(null);
      return;
    }
    try {
      katex.render(source, container, {
        displayMode,
        throwOnError: true,
        strict: false,
        output: 'htmlAndMathml',
      });
      setError(null);
    } catch (reason) {
      container.replaceChildren();
      setError(reason instanceof Error ? reason.message : '公式解析失败，请检查语法');
    }
  }, [tex, displayMode]);

  async function exportPng(): Promise<void> {
    const node = exportRef.current;
    if (!node || empty) {
      toast.error('请先输入公式');
      return;
    }
    if (error) {
      toast.error('公式存在语法错误，无法导出');
      return;
    }
    setBusy(true);
    try {
      if (typeof document.fonts?.ready?.then === 'function') await document.fonts.ready;
      const canvas = await html2canvas(node, {
        scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1)),
        backgroundColor: transparent ? null : safeBackground,
        logging: false,
        useCORS: false,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('浏览器无法生成图片数据');
      download(blob, `latex-formula-${Date.now()}.png`, 'image/png');
      toast.success('PNG 已开始下载');
    } catch (reason) {
      toast.error(reason instanceof Error ? `导出失败：${reason.message}` : '导出失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolSplit>
      <div className="space-y-4">
        <Panel title="输入公式" description="使用 KaTeX 语法，无需再用 $ 符号包裹。">
          <Field
            htmlFor="latex-source"
            label="LaTeX 源码"
            hint="支持分数、根号、矩阵、多行公式等常用命令，实时渲染。"
          >
            <Textarea
              id="latex-source"
              value={tex}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              rows={5}
              placeholder={String.raw`例如：\frac{a}{b}`}
              className="font-mono text-sm"
              onChange={(event) => setTex(event.target.value)}
            />
          </Field>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs subtle">示例：</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="chip"
                onClick={() => setTex(example.tex)}
              >
                {example.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Switch checked={displayMode} onChange={setDisplayMode} label="独立公式（display 模式）" />
            {empty ? null : <CopyButton text={tex} label="复制 LaTeX" />}
          </div>
        </Panel>

        <Panel title="样式" description="导出的 PNG 与下方预览保持一致。">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`字号：${fontSize}px`} hint="12–96 px，实际导出会放大 2 倍以保证清晰。">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={12}
                  max={96}
                  step={1}
                  value={fontSize}
                  className="w-full accent-indigo-600"
                  aria-label="字号"
                  onChange={(event) => setFontSize(Number(event.target.value))}
                />
                <Input
                  type="number"
                  min={12}
                  max={96}
                  value={fontSize}
                  className="w-20"
                  onChange={(event) => {
                    if (event.target.value === '') return;
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) setFontSize(Math.min(96, Math.max(12, Math.round(next))));
                  }}
                />
              </div>
            </Field>

            <Field label="内边距" hint="公式四周留白（px）。">
              <Input
                type="number"
                min={8}
                max={64}
                value={padding}
                onChange={(event) => {
                  if (event.target.value === '') return;
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) setPadding(Math.min(64, Math.max(8, Math.round(next))));
                }}
              />
            </Field>

            <Field label="文字颜色">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorPickerValue}
                  aria-label="文字颜色"
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
                  onChange={(event) => setColor(event.target.value)}
                />
                <Input value={color} className="font-mono" onChange={(event) => setColor(event.target.value)} />
              </div>
              <div className="mt-2 flex gap-1.5">
                {TEXT_COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    title={value}
                    aria-label={`文字颜色 ${value}`}
                    onClick={() => setColor(value)}
                    className={cn(
                      'size-6 rounded-full border transition-transform hover:scale-110',
                      color.toLowerCase() === value && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900',
                    )}
                    style={{ backgroundColor: value }}
                  />
                ))}
              </div>
            </Field>

            <Field label="背景颜色">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={backgroundPickerValue}
                  aria-label="背景颜色"
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
                  onChange={(event) => {
                    setBackground(event.target.value);
                    setTransparent(false);
                  }}
                />
                <Input
                  value={background}
                  className="font-mono"
                  onChange={(event) => {
                    setBackground(event.target.value);
                    setTransparent(false);
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {BACKGROUNDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    title={value}
                    aria-label={`背景颜色 ${value}`}
                    onClick={() => {
                      setBackground(value);
                      setTransparent(false);
                    }}
                    className={cn(
                      'size-6 rounded-full border transition-transform hover:scale-110',
                      !transparent && background.toLowerCase() === value && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900',
                    )}
                    style={{ backgroundColor: value }}
                  />
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-4 border-t pt-4">
            <Switch checked={transparent} onChange={setTransparent} label="透明背景（导出 PNG 自带透明通道）" />
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel
          title="实时预览"
          description={empty ? '在左侧输入公式即可看到效果' : '预览区域的颜色与导出一致'}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={Download} loading={busy} disabled={empty || Boolean(error)} onClick={() => void exportPng()}>
                下载 PNG
              </Button>
              <Button variant="secondary" icon={Eraser} onClick={() => setTex('')}>
                清空
              </Button>
              <span className="ml-auto text-xs subtle">{empty ? '等待输入' : `${tex.trim().length} 字符`}</span>
            </div>
          }
        >
          <div className="rounded-2xl border bg-[var(--hover-bg)] p-3">
            <div
              ref={exportRef}
              style={{
                backgroundColor: transparent ? 'transparent' : safeBackground,
                color: safeColor,
                fontSize: `${fontSize}px`,
                padding: `${padding}px`,
                borderRadius: 12,
                lineHeight: 1.4,
              }}
              className="flex min-h-[200px] w-full items-center justify-center overflow-x-auto"
            >
              {empty ? (
                <p className="py-10 text-sm" style={{ color: safeColor, opacity: 0.55 }}>
                  在左侧输入 LaTeX 公式，这里会实时预览
                </p>
              ) : (
                <div ref={formulaRef} className="max-w-full" />
              )}
            </div>
          </div>

          {error ? (
            <Alert tone="error" title="公式语法错误" className="mt-4">
              <p className="font-mono text-xs break-words">{error}</p>
              <p className="mt-2 text-xs opacity-90">
                常见原因：命令拼写错误、缺少反斜杠、括号 <code>{'{}'}</code> 未配对，或使用了 KaTeX 不支持的命令。
              </p>
            </Alert>
          ) : empty ? null : (
            <p className="mt-3 flex items-center gap-1.5 text-xs subtle">
              <ImageDown className="size-3.5" /> 导出的 PNG 为
              {transparent ? '透明背景' : '自定义背景'}，按 2 倍像素密度渲染。
            </p>
          )}

          <Actions className="mt-3">
            {empty ? (
              <p className="text-xs subtle">输入公式后可通过下方按钮复制为 Markdown 行间公式。</p>
            ) : (
              <CopyButton text={`$$${tex.trim()}$$`} label="复制为 $$ 包裹的公式" />
            )}
          </Actions>
        </Panel>

        <Panel title="使用提示">
          <ul className="space-y-2 text-sm muted">
            <li>· 公式在浏览器本地渲染，不会上传到服务器。</li>
            <li>· 超长公式可能超出画布宽度，可减小字号或开启多行写法。</li>
            <li>· 导出前请确保公式没有报错，报错公式不会被截图。</li>
          </ul>
        </Panel>
      </div>
    </ToolSplit>
  );
}
