import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Lightbulb, ShieldCheck, XCircle } from 'lucide-react';
import { Field, Hint, Input, KeyValue, Panel, ToolSplit } from './kit';
import { Alert, Badge, EmptyState } from '../components/ui';
import { cn } from '../lib/utils';

type BadgeTone = 'default' | 'brand' | 'success' | 'warning' | 'danger';

interface StrengthCheck {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
}

interface StrengthResult {
  score: number;
  length: number;
  charClasses: number;
  poolSize: number;
  bits: number;
  seconds: number;
  common: boolean;
  checks: StrengthCheck[];
  suggestions: string[];
}

const COMMON_PASSWORDS = new Set<string>([
  '123456', 'password', '123456789', '12345678', '12345', '1234567', '1234567890', 'qwerty', 'abc123', 'password1',
  '123123', 'admin', 'letmein', 'welcome', 'monkey', '1234', 'sunshine', 'qwertyuiop', 'iloveyou', '111111',
  '000000', '666666', '888888', 'dragon', 'master', 'football', 'baseball', 'princess', 'login', 'passw0rd',
  'p@ssw0rd', 'zxcvbnm', 'asdfgh', 'asdfghjkl', '1q2w3e4r', 'qazwsx', 'test', 'root', 'guest', 'admin123',
  'abcdef', 'abcd1234', 'a123456', 'woaini', '5201314', 'qwerty123', '1qaz2wsx', 'starwars', 'whatever',
  'freedom', 'superman', 'batman', 'trustno1', 'hello', 'charlie', 'donald', 'shadow', 'michael', 'jennifer',
  'jordan', 'hunter', 'ranger', 'buster', 'soccer', 'hockey', 'killer', 'george', 'andrew', 'chicken', 'dakota',
  'computer', 'amanda', 'summer', 'qwerty1', 'pass1234', 'test123', 'abc123456', 'password123', 'iloveyou1',
  'loveme', 'flower', 'banana', 'orange', 'pepper', 'cookie', 'cheese', 'internet', 'samsung', 'google',
  'facebook', 'instagram', 'wechat', 'alibaba', 'taobao', 'qq123456', 'a123456789', '123qwe', '!qaz2wsx',
]);

const KEYBOARD_SEQUENCES = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'qazwsxedc'];

const SCORE_META: Record<number, { label: string; tone: BadgeTone; bar: string; text: string }> = {
  0: { label: '很弱', tone: 'danger', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  1: { label: '弱', tone: 'danger', bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  2: { label: '一般', tone: 'warning', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  3: { label: '强', tone: 'success', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  4: { label: '很强', tone: 'success', bar: 'bg-emerald-600', text: 'text-emerald-600 dark:text-emerald-400' },
};

function normalizeLeet(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/8/g, 'b')
    .replace(/3/g, 'e')
    .replace(/6/g, 'g')
    .replace(/[1!|]/g, 'l')
    .replace(/0/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/2/g, 'z');
}

/** Exact, leetspeak and "base word + digits" matches against the built-in weak list. */
function isCommonPassword(value: string): boolean {
  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(normalizeLeet(value))) return true;
  const withoutSuffix = lower.replace(/[0-9!@#$%^&*._+-]+$/, '');
  return withoutSuffix.length >= 4 && withoutSuffix !== lower && COMMON_PASSWORDS.has(withoutSuffix);
}

function hasRepeatedPattern(value: string): boolean {
  const sample = value.slice(0, 128);
  if (/(.)\1\1/.test(sample)) return true;
  return /(.{2,})\1/.test(sample);
}

function hasAscendingRun(value: string, minRun: number): boolean {
  const codes = Array.from(value, (char) => char.charCodeAt(0));
  let run = 1;
  for (let index = 1; index < codes.length; index += 1) {
    const delta = codes[index] - codes[index - 1];
    run = delta === 1 || delta === -1 ? run + 1 : 1;
    if (run >= minRun) return true;
  }
  return false;
}

function hasSequentialPattern(value: string): boolean {
  const lower = value.toLowerCase().slice(0, 128);
  if (hasAscendingRun(lower, 3)) return true;
  for (const sequence of KEYBOARD_SEQUENCES) {
    const reversed = [...sequence].reverse().join('');
    for (let index = 0; index + 3 <= lower.length; index += 1) {
      const chunk = lower.slice(index, index + 3);
      if (sequence.includes(chunk) || reversed.includes(chunk)) return true;
    }
  }
  return false;
}

/** Seconds until an average offline attack (1e10 guesses/s) exhausts a keyspace of `bits`. */
function crackSeconds(bits: number): number {
  if (bits <= 0) return 0;
  return 2 ** (bits - 1) / 1e10;
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

function analyzePassword(password: string): StrengthResult | null {
  if (!password) return null;

  const length = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const hasNonAscii = /[^\x20-\x7E]/.test(password);
  const charClasses = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  let poolSize = 0;
  if (hasLower) poolSize += 26;
  if (hasUpper) poolSize += 26;
  if (hasDigit) poolSize += 10;
  if (hasSymbol) poolSize += 33;
  if (hasNonAscii) poolSize += 100;
  poolSize = Math.max(poolSize, 1);

  const common = isCommonPassword(password);
  const repeated = hasRepeatedPattern(password);
  const sequential = hasSequentialPattern(password);

  const rawBits = length * Math.log2(poolSize);
  let bits = rawBits;
  if (common) {
    bits = Math.min(bits, 10);
  } else {
    if (repeated) bits *= 0.7;
    if (sequential) bits *= 0.75;
    if (charClasses === 1) bits *= 0.85;
  }
  bits = Math.max(0, Math.round(bits));

  let score: number;
  if (common || length < 4) score = 0;
  else if (bits < 28) score = 0;
  else if (bits < 40) score = 1;
  else if (bits < 60) score = 2;
  else if (bits < 80) score = 3;
  else score = 4;

  if (length < 8) score = Math.min(score, 1);
  else if (length < 12) score = Math.min(score, 3);
  if (charClasses === 1 && length < 16) score = Math.min(score, 2);
  if ((repeated || sequential) && score > 2) score = Math.min(score, 2);

  const checks: StrengthCheck[] = [
    { id: 'length', label: '长度至少 12 位', detail: `当前 ${length} 位`, ok: length >= 12 },
    {
      id: 'classes',
      label: '至少包含 3 类字符',
      detail: `当前 ${charClasses} / 4 类（小写、大写、数字、符号）`,
      ok: charClasses >= 3,
    },
    {
      id: 'common',
      label: '不在常见弱密码列表中',
      detail: common ? '已命中常见弱密码或「单词 + 数字」变体' : '未命中内置弱密码列表',
      ok: !common,
    },
    {
      id: 'pattern',
      label: '没有重复或连续模式',
      detail: repeated ? '检测到重复字符 / 重复片段' : sequential ? '检测到连续序列（如 abc、123、qwerty）' : '未检测到明显规律',
      ok: !repeated && !sequential,
    },
  ];

  const suggestions: string[] = [];
  if (common) suggestions.push('该密码出现在常见弱密码 / 泄露密码列表中，请立即更换为独一无二的密码。');
  if (length < 8) suggestions.push('密码太短：建议至少 12 位，长度对强度的贡献最大。');
  else if (length < 12) suggestions.push('把长度提升到 12 位以上；继续加长比替换符号更有效。');
  if (charClasses < 3) suggestions.push('混合使用小写字母、大写字母、数字和符号，至少覆盖 3 类。');
  if (!hasUpper) suggestions.push('加入大写字母（A–Z）。');
  if (!hasLower) suggestions.push('加入小写字母（a–z）。');
  if (!hasDigit) suggestions.push('加入数字（0–9）。');
  if (!hasSymbol) suggestions.push('加入符号（如 ! @ # $ % ^ & *）。');
  if (repeated) suggestions.push('避免重复字符或重复片段，例如 aaa、abcabc、1111。');
  if (sequential) suggestions.push('避免连续序列，例如 abc、123、qwerty。');
  if (suggestions.length === 0) suggestions.push('强度良好：请为每个账户使用不同密码，并开启两步验证（2FA）。');

  return {
    score,
    length,
    charClasses,
    poolSize,
    bits,
    seconds: crackSeconds(bits),
    common,
    checks,
    suggestions,
  };
}

/** Local-only password strength scoring, crack-time estimate and actionable advice. */
export default function PasswordStrengthTool() {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const analysis = useMemo(() => analyzePassword(password), [password]);
  const meta = analysis ? SCORE_META[analysis.score] ?? SCORE_META[0] : null;

  return (
    <div className="space-y-4">
      <Panel title="密码强度检测" description="输入密码后实时评估长度、字符集、弱密码、重复与序列特征。">
        <Field
          label="要检测的密码"
          htmlFor="password-strength-input"
          hint="密码只在浏览器本地分析，不会发送到服务器，也不会被记录。"
        >
          <div className="relative">
            <Input
              id="password-strength-input"
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入要检测的密码"
              autoComplete="new-password"
              spellCheck={false}
              aria-label="要检测的密码"
              className="pr-12 font-mono"
            />
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-[var(--hover-bg)] hover:text-indigo-600 dark:hover:text-indigo-400"
              aria-label={visible ? '隐藏密码' : '显示密码'}
              title={visible ? '隐藏密码' : '显示密码'}
            >
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {analysis && meta ? (
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <span className="text-sm muted">密码强度</span>
                <span className={cn('text-sm font-semibold', meta.text)}>
                  {meta.label}（{analysis.score} / 4 分）
                </span>
              </div>
              <div
                className="mt-2 flex gap-1.5"
                role="progressbar"
                aria-label="密码强度评分"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={analysis.score}
              >
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className={cn(
                      'h-2 flex-1 rounded-full transition-colors',
                      index <= analysis.score ? meta.bar : 'bg-slate-200 dark:bg-slate-800',
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                <p className="text-xs subtle">估算离线破解时间</p>
                <p className={cn('mt-1 text-xl font-semibold break-words', meta.text)}>{formatCrackTime(analysis.seconds)}</p>
                <p className="mt-1 text-xs subtle">按每秒 100 亿次尝试估算，未考虑字典与撞库攻击</p>
              </div>
              <KeyValue
                items={[
                  { label: '字符长度', value: `${analysis.length} 位` },
                  { label: '字符类型', value: `${analysis.charClasses} / 4 类` },
                  { label: '字符池大小', value: `${analysis.poolSize} 个字符` },
                  { label: '估算熵值', value: `${analysis.bits} bit` },
                ]}
              />
            </div>

            {analysis.common ? (
              <Alert tone="error" title="高风险：这是常见弱密码">
                该类密码广泛出现在泄露库与字典中，即使长度足够也会被瞬间猜中，请立刻更换。
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              icon={ShieldCheck}
              title="输入密码开始评估"
              description="评估完全在本地进行，输入内容不会被上传；可以点击右侧眼睛图标切换显示。"
            />
          </div>
        )}
      </Panel>

      <ToolSplit>
        <Panel title="检测明细" description="逐项检查影响密码强度的关键因素">
          {analysis ? (
            <ul className="space-y-2">
              {analysis.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2.5 rounded-xl border px-4 py-2.5">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{check.label}</p>
                    <p className="mt-0.5 text-xs subtle">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="暂无检测结果"
              description="在上方输入密码后，这里会列出长度、字符类型、弱密码与规律性检测结果。"
            />
          )}
        </Panel>

        <Panel title="改进建议" description="按优先级排序的加固建议">
          {analysis ? (
            <>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Lightbulb className="size-4 text-amber-500" /> 建议
              </div>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm muted">
                {analysis.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
              <div className="mt-4">
                <Hint>
                  建议使用密码管理器生成并保存 16 位以上的随机密码；同一个密码不要在多个网站重复使用。
                </Hint>
              </div>
            </>
          ) : (
            <EmptyState icon={Lightbulb} title="暂无建议" description="输入密码后，这里会根据检测结果给出具体改进方向。" />
          )}
        </Panel>
      </ToolSplit>

      <Panel title="评分与估算说明">
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((score) => (
            <Badge key={score} tone={SCORE_META[score].tone}>
              {score} 分 · {SCORE_META[score].label}
            </Badge>
          ))}
        </div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm muted">
          <li>评分 0–4：综合长度、字符池大小、常见弱密码、重复与连续序列等特征。</li>
          <li>破解时间按「每秒 100 亿次离线尝试」估算，未考虑显卡集群、字典、撞库与泄露密码库。</li>
          <li>熵值使用「长度 × log2(字符池)」估算，命中弱密码或规律时会大幅下调。</li>
          <li>本工具只做启发式评估，不能保证密码绝对安全；真正的安全依赖唯一性与长度。</li>
        </ul>
      </Panel>
    </div>
  );
}
