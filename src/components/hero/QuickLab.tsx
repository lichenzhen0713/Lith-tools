import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  Check,
  Copy,
  KeyRound,
  Palette,
  RefreshCw,
  Ruler,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { copyText, cn } from '../../lib/utils';
import { useToast } from '../../lib/toast';

type TabId = 'calc' | 'color' | 'unit' | 'password';

const TABS: { id: TabId; label: string; icon: LucideIcon; href: string }[] = [
  { id: 'calc', label: '计算', icon: Calculator, href: '/tools/basic-calculator' },
  { id: 'color', label: '取色', icon: Palette, href: '/tools/color-converter' },
  { id: 'unit', label: '换算', icon: Ruler, href: '/tools/length-converter' },
  { id: 'password', label: '密码', icon: KeyRound, href: '/tools/password-generator' },
];

const PRESET_COLORS = ['#4f46e5', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];

function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return '—';
  const number = Number.parseInt(value, 16);
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function CalcWidget() {
  const [left, setLeft] = useState('128');
  const [right, setRight] = useState('8');
  const [op, setOp] = useState('+');
  const result = useMemo(() => {
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '—';
    switch (op) {
      case '-':
        return formatNumber(a - b);
      case '×':
        return formatNumber(a * b);
      case '÷':
        return b === 0 ? '不能除以 0' : formatNumber(a / b);
      default:
        return formatNumber(a + b);
    }
  }, [left, right, op]);

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input
          value={left}
          onChange={(event) => setLeft(event.target.value)}
          inputMode="decimal"
          aria-label="第一个数字"
          className="input h-12 text-center text-lg font-semibold"
        />
        <select
          value={op}
          onChange={(event) => setOp(event.target.value)}
          aria-label="运算符"
          className="input h-12 w-16 cursor-pointer px-0 text-center text-lg font-semibold"
        >
          <option value="+">+</option>
          <option value="-">−</option>
          <option value="×">×</option>
          <option value="÷">÷</option>
        </select>
        <input
          value={right}
          onChange={(event) => setRight(event.target.value)}
          inputMode="decimal"
          aria-label="第二个数字"
          className="input h-12 text-center text-lg font-semibold"
        />
      </div>
      <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-4 py-3 text-center">
        <p className="text-[11px] text-[var(--text-muted)]">结果</p>
        <p className="mt-1 truncate text-3xl font-extrabold tracking-tight text-[var(--brand)]">{result}</p>
      </div>
    </div>
  );
}

function ColorWidget() {
  const [color, setColor] = useState('#4f46e5');
  const rgb = hexToRgb(color);
  const toast = useToast();

  return (
    <div>
      <div className="flex items-center gap-4">
        <label className="relative block">
          <span className="sr-only">选择颜色</span>
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-20 w-20 cursor-pointer rounded-2xl border border-[var(--card-border)] bg-transparent p-1"
          />
        </label>
        <div className="min-w-0">
          <p className="font-mono text-lg font-semibold tracking-tight">{color.toUpperCase()}</p>
          <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">rgb({rgb})</p>
          <button
            type="button"
            className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
            onClick={async () => {
              if (await copyText(color.toUpperCase())) toast.success('色值已复制');
            }}
          >
            <Copy className="size-3" /> 复制色值
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setColor(preset)}
            className={cn(
              'size-8 rounded-lg border-2 transition-transform hover:scale-110',
              color.toLowerCase() === preset ? 'border-[var(--brand)]' : 'border-transparent',
            )}
            style={{ backgroundColor: preset }}
            aria-label={`使用颜色 ${preset}`}
          />
        ))}
      </div>
    </div>
  );
}

const UNIT_FACTORS: Record<string, number> = { cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

function UnitWidget() {
  const [value, setValue] = useState('100');
  const [unit, setUnit] = useState('cm');
  const meters = Number(value) * (UNIT_FACTORS[unit] ?? 1);
  const valid = Number.isFinite(meters) && meters >= 0;
  const rows = [
    ['厘米', valid ? (meters * 100).toFixed(2) : '—', 'cm'],
    ['米', valid ? meters.toFixed(3) : '—', 'm'],
    ['英寸', valid ? (meters / 0.0254).toFixed(2) : '—', 'in'],
    ['英尺', valid ? (meters / 0.3048).toFixed(3) : '—', 'ft'],
  ] as const;

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          aria-label="长度数值"
          className="input h-11 flex-1 text-center font-semibold"
        />
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          aria-label="长度单位"
          className="input h-11 w-24 cursor-pointer"
        >
          <option value="cm">厘米</option>
          <option value="m">米</option>
          <option value="in">英寸</option>
          <option value="ft">英尺</option>
        </select>
      </div>
      <dl className="mt-4 divide-y rounded-xl border border-[var(--card-border)]">
        {rows.map(([label, amount, code]) => (
          <div key={code} className="flex items-center justify-between px-3 py-2 text-sm">
            <dt className="text-[var(--text-muted)]">
              {label} <span className="font-mono text-[10px] opacity-70">{code}</span>
            </dt>
            <dd className="font-mono font-semibold">{amount}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_';

function generatePassword(length: number): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join('');
}

function PasswordWidget() {
  const [length, setLength] = useState(16);
  const [password, setPassword] = useState(() => generatePassword(16));
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setPassword(generatePassword(length));
    setCopied(false);
  }, [length]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-base font-semibold break-all">{password}</p>
        <button
          type="button"
          className="btn-secondary btn-sm shrink-0"
          onClick={async () => {
            if (await copyText(password)) {
              setCopied(true);
              toast.success('密码已复制');
              window.setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <label className="mt-4 flex items-center gap-3 text-xs text-[var(--text-muted)]">
        长度
        <input
          type="range"
          min={8}
          max={32}
          value={length}
          onChange={(event) => setLength(Number(event.target.value))}
          className="flex-1 accent-indigo-600"
        />
        <span className="w-6 text-right font-mono text-[var(--text-secondary)]">{length}</span>
      </label>
      <button
        type="button"
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--brand)] hover:underline"
        onClick={() => setPassword(generatePassword(length))}
      >
        <RefreshCw className="size-3" /> 换一个
      </button>
      <p className="mt-3 text-[11px] text-[var(--text-muted)]">由 crypto.getRandomValues 本地生成，不会上传或保存。</p>
    </div>
  );
}

export function QuickLab() {
  const [tab, setTab] = useState<TabId>('calc');
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div className="hero-lab">
      <div className="hero-lab-bar">
        <span className="dot-row" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="font-semibold text-[var(--text-secondary)]">Quick Lab</span>
        <span className="ml-auto text-[11px]">本地运行 · 0 上传</span>
      </div>

      <div className="hero-lab-tabs" role="tablist" aria-label="快速工具">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === tab}
              onClick={() => setTab(item.id)}
              className={cn('hero-lab-tab', item.id === tab && 'is-active')}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="hero-lab-body">
        {tab === 'calc' ? <CalcWidget /> : null}
        {tab === 'color' ? <ColorWidget /> : null}
        {tab === 'unit' ? <UnitWidget /> : null}
        {tab === 'password' ? <PasswordWidget /> : null}
      </div>

      <div className="hero-lab-foot">
        <ShieldCheck className="size-3.5 text-emerald-500" />
        <span>输入不会离开浏览器</span>
        <Link to={active.href} className="ml-auto flex items-center gap-1 font-semibold text-[var(--brand)] hover:underline">
          打开完整工具 <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
