import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Eraser, QrCode, Sparkles } from 'lucide-react';
import { Actions, Field, Hint, Panel, Textarea, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Input, Select, Skeleton, Spinner } from '../components/ui';
import { clamp, formatNumber } from '../lib/utils';
import { useDebouncedValue } from '../lib/hooks';
import { useToast } from '../lib/toast';

type Level = 'L' | 'M' | 'Q' | 'H';

const LEVELS: { value: Level; label: string }[] = [
  { value: 'L', label: 'L — 低（约 7% 可恢复）' },
  { value: 'M', label: 'M — 中（约 15% 可恢复）' },
  { value: 'Q', label: 'Q — 较高（约 25% 可恢复）' },
  { value: 'H', label: 'H — 高（约 30% 可恢复）' },
];

/** Byte capacity of a version-40 QR code per error correction level. */
const CAPACITY: Record<Level, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

function normalizeHex(raw: string, fallback: string): string {
  const value = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const short = value.slice(1);
    return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`.toLowerCase();
  }
  return fallback;
}

function ColorField({
  id,
  label,
  value,
  fallback,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const valid = /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(value.trim());
  return (
    <Field label={label} htmlFor={id} error={valid ? null : '请输入 #RRGGBB 格式的颜色值'}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}取色器`}
          className="size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
          value={normalizeHex(value, fallback)}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          id={id}
          className="font-mono"
          value={value}
          error={!valid}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder={fallback}
        />
      </div>
    </Field>
  );
}

export default function QrCodeTool() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [sizeRaw, setSizeRaw] = useState('320');
  const [marginRaw, setMarginRaw] = useState('2');
  const [level, setLevel] = useState<Level>('M');
  const [fgRaw, setFgRaw] = useState('#000000');
  const [bgRaw, setBgRaw] = useState('#ffffff');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const debouncedText = useDebouncedValue(text, 200);
  const trimmed = debouncedText.trim();

  const sizeNumber = Number(sizeRaw);
  const sizeValid = sizeRaw.trim() !== '' && Number.isFinite(sizeNumber) && sizeNumber >= 128 && sizeNumber <= 1024;
  const size = sizeValid ? clamp(Math.round(sizeNumber), 128, 1024) : 320;

  const marginNumber = Number(marginRaw);
  const marginValid =
    marginRaw.trim() !== '' && Number.isFinite(marginNumber) && marginNumber >= 0 && marginNumber <= 8;
  const margin = marginValid ? clamp(Math.round(marginNumber), 0, 8) : 2;

  const fg = normalizeHex(fgRaw, '#000000');
  const bg = normalizeHex(bgRaw, '#ffffff');
  const sameColor = fg === bg;

  const bytes = useMemo(() => (trimmed ? new TextEncoder().encode(trimmed).length : 0), [trimmed]);
  const capacity = CAPACITY[level];
  const tooLong = bytes > capacity;

  useEffect(() => {
    let active = true;
    if (!trimmed) {
      setDataUrl(null);
      setError(null);
      setGenerating(false);
      return () => {
        active = false;
      };
    }
    if (tooLong) {
      setDataUrl(null);
      setError(`内容约 ${formatNumber(bytes)} 字节，超过纠错级别 ${level} 的最大容量（${formatNumber(capacity)} 字节）。请缩短内容或降低纠错级别。`);
      setGenerating(false);
      return () => {
        active = false;
      };
    }

    setGenerating(true);
    QRCode.toDataURL(trimmed, {
      errorCorrectionLevel: level,
      margin,
      width: size,
      color: { dark: fg, light: bg },
    })
      .then((url) => {
        if (!active) return;
        setDataUrl(url);
        setError(null);
        setGenerating(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDataUrl(null);
        setError(reason instanceof Error ? reason.message : '二维码生成失败，请检查输入内容');
        setGenerating(false);
      });

    return () => {
      active = false;
    };
  }, [trimmed, bytes, capacity, tooLong, level, margin, size, fg, bg]);

  const handleDownload = () => {
    if (!dataUrl) {
      toast.error('二维码尚未生成');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `qrcode-${size}px.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast.success('已下载 PNG 图片');
  };

  const example = () => {
    setText('https://example.com');
  };

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="内容与样式" description="输入文本或网址，实时生成二维码，全部在本地完成">
          <div className="space-y-4">
            <Field
              label="文本 / 网址"
              htmlFor="qr-text"
              hint={
                trimmed
                  ? `当前 ${formatNumber(trimmed.length)} 个字符 · ${formatNumber(bytes)} 字节 · 纠错 ${level} 级上限 ${formatNumber(capacity)} 字节`
                  : '支持多行文本、中文与网址，内容不会上传到服务器'
              }
            >
              <Textarea
                id="qr-text"
                className="min-h-32"
                placeholder="例如：https://example.com 或一段文本"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" type="button" icon={Sparkles} onClick={example}>
                填入示例网址
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                icon={Eraser}
                onClick={() => {
                  setText('');
                  setDataUrl(null);
                  setError(null);
                }}
                disabled={text === ''}
              >
                清空内容
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="尺寸（像素）"
                htmlFor="qr-size"
                error={sizeValid ? null : '尺寸需在 128 - 1024 之间'}
                hint={sizeValid ? `实际输出 ${size} × ${size} 像素` : undefined}
              >
                <Input
                  id="qr-size"
                  inputMode="numeric"
                  value={sizeRaw}
                  error={!sizeValid}
                  onChange={(event) => setSizeRaw(event.target.value)}
                />
              </Field>

              <Field
                label="边距（模块数）"
                htmlFor="qr-margin"
                error={marginValid ? null : '边距需在 0 - 8 之间'}
                hint="0 为无白边，推荐 2 - 4"
              >
                <Input
                  id="qr-margin"
                  inputMode="numeric"
                  value={marginRaw}
                  error={!marginValid}
                  onChange={(event) => setMarginRaw(event.target.value)}
                />
              </Field>

              <Field label="纠错级别" htmlFor="qr-level" hint="级别越高越抗污损，但可容纳的内容更少">
                <Select id="qr-level" value={level} onChange={(event) => setLevel(event.target.value as Level)}>
                  {LEVELS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="hidden sm:block" />

              <ColorField
                id="qr-fg"
                label="前景色（码点）"
                value={fgRaw}
                fallback="#000000"
                onChange={setFgRaw}
                onBlur={() => setFgRaw((current) => normalizeHex(current, '#000000'))}
              />
              <ColorField
                id="qr-bg"
                label="背景色"
                value={bgRaw}
                fallback="#ffffff"
                onChange={setBgRaw}
                onBlur={() => setBgRaw((current) => normalizeHex(current, '#ffffff'))}
              />
            </div>

            {sameColor ? <Alert tone="warning">前景色与背景色相同，生成的二维码将无法被扫描识别。</Alert> : null}
            {error ? <Alert tone="error">{error}</Alert> : null}
          </div>
        </Panel>

        <Panel
          title="二维码预览"
          description={tooLong ? '内容超出容量，暂无法生成' : '修改任意参数都会自动更新预览'}
          footer={
            <Actions className="mt-0">
              <Button icon={Download} type="button" onClick={handleDownload} disabled={!dataUrl}>
                下载 PNG
              </Button>
              {text ? <CopyButton text={text} label="复制内容" /> : null}
              {dataUrl ? <Badge tone="brand">{size} × {size}</Badge> : null}
            </Actions>
          }
        >
          {trimmed === '' ? (
            <EmptyState
              icon={QrCode}
              title="等待输入内容"
              description="输入文本或网址后，这里会实时显示二维码预览。"
            />
          ) : generating && !dataUrl ? (
            <div className="flex justify-center">
              <Skeleton className="aspect-square w-full max-w-[320px]" />
            </div>
          ) : dataUrl ? (
            <div className="space-y-3">
              <div className="flex justify-center rounded-xl border bg-[var(--hover-bg)] p-4">
                <img
                  src={dataUrl}
                  alt="二维码预览"
                  width={size}
                  height={size}
                  className="block h-auto w-full rounded-lg"
                  style={{ maxWidth: size }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs subtle">
                {generating ? (
                  <span className="inline-flex items-center gap-1">
                    <Spinner className="size-3.5" /> 正在更新…
                  </span>
                ) : (
                  <span>已按 {LEVELS.find((item) => item.value === level)?.label ?? level} 生成</span>
                )}
                <span>·</span>
                <span>边距 {margin} 模块</span>
                <span>·</span>
                <span>前景 {fg} / 背景 {bg}</span>
              </div>
            </div>
          ) : (
            <Alert tone="error">{error ?? '生成失败，请调整内容或参数后重试。'}</Alert>
          )}

          <Hint>
            二维码由本地 <span className="font-mono">qrcode</span> 库生成，可直接保存为 PNG；如需印刷使用，建议尺寸不小于 512 像素并保留 4 个模块的边距。
          </Hint>
        </Panel>
      </ToolSplit>
    </div>
  );
}
