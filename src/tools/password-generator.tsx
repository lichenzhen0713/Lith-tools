import { useMemo, useState } from 'react';
import { Copy, Download, History, KeyRound, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Actions, Field, Hint, Input, Panel } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Modal, Switch } from '../components/ui';
import { cn, copyText, download, formatDate, uid } from '../lib/utils';
import { useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
} as const;

type SetKey = keyof typeof SETS;

const CHARSET_LABEL: Record<SetKey, string> = {
  lower: '小写字母',
  upper: '大写字母',
  digits: '数字',
  symbols: '符号',
};

const CHARSET_HINT: Record<SetKey, string> = {
  lower: 'a–z（26 个）',
  upper: 'A–Z（26 个）',
  digits: '0–9（10 个）',
  symbols: '!@#$%^&*()…（23 个）',
};

const AMBIGUOUS = 'il1IoO0';
const MIN_LENGTH = 4;
const MAX_LENGTH = 64;
const MIN_COUNT = 1;
const MAX_COUNT = 20;
const HISTORY_LIMIT = 20;
const HISTORY_KEY = 'lith:password-generator-history';

interface HistoryEntry {
  id: string;
  at: number;
  length: number;
  options: string;
  passwords: string[];
}

function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
}

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

/** Uniform, unbiased index in [0, maxExclusive) from the Web Crypto RNG. */
function randomIndex(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(4294967296 / maxExclusive) * maxExclusive;
  let value = randomUint32();
  let guard = 0;
  while (value >= limit && guard < 64) {
    value = randomUint32();
    guard += 1;
  }
  return value % maxExclusive;
}

function pickChar(pool: string): string {
  return pool.charAt(randomIndex(pool.length));
}

function shuffle(items: string[]): string[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    const swap = items[index];
    items[index] = items[target];
    items[target] = swap;
  }
  return items;
}

function removeAmbiguous(pool: string): string {
  return Array.from(pool)
    .filter((char) => !AMBIGUOUS.includes(char))
    .join('');
}

function buildPools(keys: SetKey[], excludeAmbiguous: boolean): string[] {
  return keys
    .map((key) => (excludeAmbiguous ? removeAmbiguous(SETS[key]) : SETS[key]))
    .filter((pool) => pool.length > 0);
}

/** Every enabled character set is represented at least once, then the rest is filled and shuffled. */
function generatePassword(length: number, pools: string[]): string {
  if (pools.length === 0 || length <= 0) return '';
  const combined = pools.join('');
  const chars: string[] = [];
  for (const pool of pools) {
    if (chars.length >= length) break;
    chars.push(pickChar(pool));
  }
  while (chars.length < length) {
    chars.push(pickChar(combined));
  }
  return shuffle(chars).slice(0, length).join('');
}

function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '远超宇宙年龄';
  if (seconds < 1) return '不到 1 秒';
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} 小时`;
  if (seconds < 31_557_600) return `${Math.round(seconds / 86_400)} 天`;
  const years = seconds / 31_557_600;
  if (years < 1) return '约 1 年';
  if (years < 10_000) return `${Math.round(years).toLocaleString('zh-CN')} 年`;
  if (years < 1e8) return `${(years / 1e4).toFixed(1)} 万年`;
  if (years < 1e12) return `${(years / 1e8).toFixed(1)} 亿年`;
  return '远超宇宙年龄';
}

const STRENGTH_LEVELS = [
  { label: '偏弱', tone: 'danger' as const, bar: 'bg-rose-500' },
  { label: '较弱', tone: 'danger' as const, bar: 'bg-orange-500' },
  { label: '一般', tone: 'warning' as const, bar: 'bg-amber-500' },
  { label: '强', tone: 'success' as const, bar: 'bg-emerald-500' },
  { label: '很强', tone: 'success' as const, bar: 'bg-emerald-600' },
];

/** Cryptographically secure password generator with bulk copy/download and local history. */
export default function PasswordGeneratorTool() {
  const toast = useToast();
  const [lengthRaw, setLengthRaw] = useState('16');
  const [countRaw, setCountRaw] = useState('5');
  const [selected, setSelected] = useState<Record<SetKey, boolean>>({
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
  });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [saveHistory, setSaveHistory] = useState(true);
  const [passwords, setPasswords] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ length: number; poolSize: number } | null>(null);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>(HISTORY_KEY, []);
  const [touched, setTouched] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const selectedKeys = useMemo(() => (Object.keys(SETS) as SetKey[]).filter((key) => selected[key]), [selected]);

  const length = Number(lengthRaw);
  const count = Number(countRaw);

  const lengthError =
    lengthRaw.trim() === '' || !Number.isInteger(length)
      ? `请输入 ${MIN_LENGTH}–${MAX_LENGTH} 之间的整数`
      : length < MIN_LENGTH || length > MAX_LENGTH
        ? `长度需在 ${MIN_LENGTH}–${MAX_LENGTH} 之间`
        : null;

  const countError =
    countRaw.trim() === '' || !Number.isInteger(count)
      ? `请输入 ${MIN_COUNT}–${MAX_COUNT} 之间的整数`
      : count < MIN_COUNT || count > MAX_COUNT
        ? `数量需在 ${MIN_COUNT}–${MAX_COUNT} 之间`
        : null;

  const charsetError = selectedKeys.length === 0 ? '请至少选择一种字符类型' : null;
  const canGenerate = !lengthError && !countError && !charsetError;

  const strength = useMemo(() => {
    if (!meta || meta.poolSize <= 0) return null;
    const bits = Math.round(meta.length * Math.log2(meta.poolSize));
    const level = bits >= 100 ? 4 : bits >= 80 ? 3 : bits >= 60 ? 2 : bits >= 40 ? 1 : 0;
    return {
      bits,
      level,
      meta: STRENGTH_LEVELS[level],
      crack: formatCrackTime(2 ** Math.max(0, bits - 1) / 1e10),
    };
  }, [meta]);

  const handleGenerate = () => {
    setTouched(true);
    if (!canGenerate) return;
    if (!cryptoAvailable()) {
      toast.error('当前浏览器不支持 Web Crypto，无法安全地生成密码');
      return;
    }

    const pools = buildPools(selectedKeys, excludeAmbiguous);
    if (pools.length === 0) {
      toast.error('字符集为空，请调整选项后重试');
      return;
    }

    const generated = Array.from({ length: count }, () => generatePassword(length, pools));
    const poolSize = pools.reduce((sum, pool) => sum + new Set(pool).size, 0);

    setPasswords(generated);
    setMeta({ length, poolSize });

    if (saveHistory) {
      const optionsLabel = `${selectedKeys.map((key) => CHARSET_LABEL[key]).join(' + ')}${excludeAmbiguous ? ' · 排除易混淆' : ''}`;
      const entry: HistoryEntry = {
        id: uid('password'),
        at: Date.now(),
        length,
        options: optionsLabel,
        passwords: generated,
      };
      setHistory((previous) => [entry, ...previous].slice(0, HISTORY_LIMIT));
    }

    toast.success(`已生成 ${count} 个 ${length} 位密码`);
  };

  const copyAll = async () => {
    const ok = await copyText(passwords.join('\n'));
    if (ok) toast.success('已复制全部密码');
    else toast.error('复制失败，请手动选择文本');
  };

  const downloadAll = () => {
    download(passwords.join('\n'), 'passwords.txt');
    toast.success('已下载 passwords.txt');
  };

  return (
    <div className="space-y-4">
      <Panel
        title="生成选项"
        description="使用浏览器的加密级随机源（crypto.getRandomValues）生成密码，不经过服务器。"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="密码长度"
            htmlFor="password-generator-length"
            error={touched ? lengthError : null}
            hint={`${MIN_LENGTH}–${MAX_LENGTH} 位，推荐 16 位以上`}
          >
            <Input
              id="password-generator-length"
              type="number"
              min={MIN_LENGTH}
              max={MAX_LENGTH}
              step={1}
              value={lengthRaw}
              onChange={(event) => setLengthRaw(event.target.value)}
              onBlur={() => setTouched(true)}
              inputMode="numeric"
              className="tabular-nums"
            />
          </Field>

          <Field
            label="生成数量"
            htmlFor="password-generator-count"
            error={touched ? countError : null}
            hint={`${MIN_COUNT}–${MAX_COUNT} 个`}
          >
            <Input
              id="password-generator-count"
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              step={1}
              value={countRaw}
              onChange={(event) => setCountRaw(event.target.value)}
              onBlur={() => setTouched(true)}
              inputMode="numeric"
              className="tabular-nums"
            />
          </Field>
        </div>

        <div className="mt-4">
          <span className="label">字符类型</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(SETS) as SetKey[]).map((key) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{CHARSET_LABEL[key]}</p>
                  <p className="mt-0.5 font-mono text-xs subtle">{CHARSET_HINT[key]}</p>
                </div>
                <Switch
                  checked={selected[key]}
                  onChange={(value) => setSelected((previous) => ({ ...previous, [key]: value }))}
                  label={<span className="sr-only">{CHARSET_LABEL[key]}</span>}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border px-4 py-3">
            <Switch
              checked={excludeAmbiguous}
              onChange={setExcludeAmbiguous}
              label={<span className="font-medium">排除易混淆字符</span>}
            />
            <p className="mt-1.5 text-xs leading-relaxed subtle">去掉 l / 1 / I、O / 0 等肉眼难以区分的字符。</p>
          </div>
          <div className="rounded-xl border px-4 py-3">
            <Switch
              checked={saveHistory}
              onChange={setSaveHistory}
              label={<span className="font-medium">保存生成历史</span>}
            />
            <p className="mt-1.5 text-xs leading-relaxed subtle">
              仅保存在本机 localStorage，最多 {HISTORY_LIMIT} 条，可随时清空。
            </p>
          </div>
        </div>

        {charsetError ? (
          <div className="mt-4">
            <Alert tone="warning">{charsetError}</Alert>
          </div>
        ) : null}

        <Actions>
          <Button icon={Sparkles} onClick={handleGenerate} disabled={!canGenerate}>
            生成密码
          </Button>
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={handleGenerate}
            disabled={!canGenerate || passwords.length === 0}
          >
            重新生成
          </Button>
        </Actions>

        <div className="mt-3">
          <Hint>
            每种选中的字符类型都会至少出现一次，然后从合并字符池中补足并打乱顺序；所有随机选择均经过拒绝采样以避免取模偏差。
          </Hint>
        </div>
      </Panel>

      <Panel
        title="生成结果"
        description={
          passwords.length > 0 && meta
            ? `${passwords.length} 个密码 · 每个 ${meta.length} 位`
            : '生成后在这里查看、复制或下载密码'
        }
        footer={
          passwords.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={passwords.join('\n')} label="复制全部" />
              <Button variant="secondary" size="sm" icon={Download} onClick={downloadAll}>
                下载 .txt
              </Button>
              <Button variant="ghost" size="sm" icon={RefreshCw} onClick={handleGenerate}>
                再生成一组
              </Button>
              <span className="ml-auto text-xs subtle">下载内容为每行一个密码</span>
            </div>
          ) : null
        }
      >
        {passwords.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="还没有生成密码"
            description="设置长度、字符类型与数量后点击「生成密码」，或先试试默认配置。"
            action={
              <Button variant="secondary" size="sm" icon={Sparkles} onClick={handleGenerate} disabled={!canGenerate}>
                使用当前配置生成
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {strength ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={strength.meta.tone}>{strength.meta.label}</Badge>
                  <Badge>{meta?.length} 位</Badge>
                  <Badge>{meta?.poolSize} 种候选字符</Badge>
                  <Badge>约 {strength.bits} bit 熵</Badge>
                  <span className="text-xs subtle">估算离线破解时间：{strength.crack}</span>
                </div>
                <div
                  className="mt-2 flex gap-1.5"
                  role="progressbar"
                  aria-label="生成密码的强度"
                  aria-valuemin={0}
                  aria-valuemax={4}
                  aria-valuenow={strength.level}
                >
                  {[0, 1, 2, 3, 4].map((index) => (
                    <div
                      key={index}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors',
                        index <= strength.level ? strength.meta.bar : 'bg-slate-200 dark:bg-slate-800',
                      )}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <ul className="space-y-2">
              {passwords.map((password, index) => (
                <li
                  key={`${index}-${password}`}
                  className="flex items-center gap-2 rounded-xl border bg-[var(--hover-bg)] px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums subtle">{index + 1}</span>
                  <code className="min-w-0 flex-1 font-mono text-sm break-all select-all">{password}</code>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                    title="复制该密码"
                    aria-label={`复制第 ${index + 1} 个密码`}
                    onClick={async () => {
                      const ok = await copyText(password);
                      if (ok) toast.success(`已复制第 ${index + 1} 个密码`);
                      else toast.error('复制失败，请手动选择文本');
                    }}
                  >
                    <Copy className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>

            <Hint>生成结果只存在于当前页面与（可选的）本机历史中；关闭页面后未保存的密码无法找回。</Hint>
          </div>
        )}
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <History className="size-4" /> 生成历史
            {history.length > 0 ? <span className="badge">{history.length}</span> : null}
          </span>
        }
        description={
          saveHistory
            ? `最近 ${HISTORY_LIMIT} 组密码保存在本机浏览器中`
            : '历史保存已关闭，新生成的密码不会写入本机记录'
        }
        footer={
          history.length > 0 ? (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmClear(true)}>
              清空历史记录
            </Button>
          ) : null
        }
      >
        {history.length === 0 ? (
          <EmptyState
            icon={History}
            title="暂无生成历史"
            description="开启「保存生成历史」后，每次生成的密码会记录在这里，方便稍后复制。"
          />
        ) : (
          <>
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-[var(--hover-bg)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{entry.passwords.length} 个密码</span>
                      <Badge>{entry.length} 位</Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-[var(--text-secondary)]" title={entry.passwords[0]}>
                      {entry.passwords[0]}
                      {entry.passwords.length > 1 ? ' …' : ''}
                    </p>
                    <p className="mt-1 text-xs subtle">
                      {entry.options} · {formatDate(new Date(entry.at).toISOString(), 'datetime')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Copy}
                      onClick={async () => {
                        const ok = await copyText(entry.passwords.join('\n'));
                        if (ok) toast.success(`已复制该组 ${entry.passwords.length} 个密码`);
                        else toast.error('复制失败，请手动选择文本');
                      }}
                    >
                      复制
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除该条历史记录"
                      title="删除该条历史记录"
                      onClick={() => {
                        setHistory((previous) => previous.filter((item) => item.id !== entry.id));
                        toast.success('已删除该条历史记录');
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Hint>
                历史记录以明文保存在本机 localStorage，任何能访问此浏览器的人都可以查看；在公用电脑上请关闭历史保存或及时清空。
              </Hint>
            </div>
          </>
        )}
      </Panel>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空生成历史"
        description={`将删除全部 ${history.length} 条历史记录，此操作无法撤销。`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setHistory([]);
                setConfirmClear(false);
                toast.success('生成历史已清空');
              }}
            >
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm muted">页面中当前显示的密码不会被删除，只清除本机保存的历史记录。</p>
      </Modal>
    </div>
  );
}
