import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Hash, RotateCcw, Target, Trash2, Trophy } from 'lucide-react';
import { Actions, Field, Hint, Panel, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, Input, Modal, Select, StatCard } from '../components/ui';
import { formatNumber } from '../lib/utils';
import { useLocalStorage } from '../lib/hooks';

type Difficulty = 'easy' | 'normal' | 'hard';
type GuessResult = 'low' | 'high' | 'win';

interface Guess {
  value: number;
  result: GuessResult;
}

const RANGES: Record<Difficulty, number> = { easy: 50, normal: 100, hard: 500 };
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '简单 — 1 到 50',
  normal: '普通 — 1 到 100',
  hard: '困难 — 1 到 500',
};

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

function randomIntInclusive(min: number, max: number): number {
  const range = max - min + 1;
  if (range <= 0) return min;
  const limit = Math.floor(4294967296 / range) * range;
  let value = randomUint32();
  let guard = 0;
  while (value >= limit && guard < 128) {
    value = randomUint32();
    guard += 1;
  }
  return min + (value % range);
}

const RESULT_META: Record<GuessResult, { label: string; icon: typeof ArrowUp; className: string }> = {
  low: {
    label: '太小了',
    icon: ArrowUp,
    className: 'border-sky-200 text-sky-700 dark:border-sky-500/30 dark:text-sky-300',
  },
  high: {
    label: '太大了',
    icon: ArrowDown,
    className: 'border-amber-200 text-amber-700 dark:border-amber-500/30 dark:text-amber-300',
  },
  win: {
    label: '猜中',
    icon: Check,
    className: 'border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300',
  },
};

export default function GuessNumberTool() {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [target, setTarget] = useState(() => randomIntInclusive(1, RANGES.normal));
  const [attempts, setAttempts] = useState(0);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [status, setStatus] = useState<'playing' | 'won'>('playing');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [best, setBest] = useLocalStorage<Record<string, number>>('lith-guess-best', {});
  const [confirmReset, setConfirmReset] = useState(false);

  const range = RANGES[difficulty];
  const bestScore: number | undefined = best[difficulty];

  const focusInput = () => {
    const element = document.getElementById('guess-input');
    if (element instanceof HTMLInputElement) element.focus();
  };

  const { lowBound, highBound } = useMemo(() => {
    let low = 1;
    let high = range;
    for (const guess of guesses) {
      if (guess.result === 'low') low = Math.max(low, guess.value + 1);
      else if (guess.result === 'high') high = Math.min(high, guess.value - 1);
    }
    return { lowBound: low, highBound: high };
  }, [guesses, range]);

  const restart = (next: Difficulty = difficulty) => {
    setTarget(randomIntInclusive(1, RANGES[next]));
    setAttempts(0);
    setGuesses([]);
    setStatus('playing');
    setDraft('');
    setError(null);
  };

  const changeDifficulty = (next: Difficulty) => {
    setDifficulty(next);
    restart(next);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'won') return;
    const value = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(value) || !Number.isInteger(value)) {
      setError('请输入一个整数');
      focusInput();
      return;
    }
    if (value < 1 || value > range) {
      setError(`请输入 1 到 ${range} 之间的整数`);
      focusInput();
      return;
    }

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setDraft('');
    setError(null);

    if (value === target) {
      setGuesses((previous) => [{ value, result: 'win' }, ...previous]);
      setStatus('won');
      if (bestScore === undefined || nextAttempts < bestScore) {
        setBest((previous) => ({ ...previous, [difficulty]: nextAttempts }));
      }
      return;
    }

    setGuesses((previous) => [{ value, result: value < target ? 'low' : 'high' }, ...previous]);
    focusInput();
  };

  const isRecord = status === 'won' && bestScore !== undefined && attempts <= bestScore;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Hash} label="已猜次数" value={formatNumber(attempts)} hint={`当前难度：${DIFFICULTY_LABELS[difficulty].split(' — ')[0]}`} />
        <StatCard
          icon={Trophy}
          label="最佳成绩"
          value={bestScore === undefined ? '—' : `${formatNumber(bestScore)} 次`}
          hint="记录保存在本机浏览器"
        />
        <StatCard
          icon={Target}
          label="剩余可能范围"
          value={`${formatNumber(Math.max(lowBound, 1))} - ${formatNumber(Math.max(highBound, lowBound))}`}
          hint={status === 'won' ? '本局已揭晓答案' : '根据提示逐步缩小'}
        />
      </div>

      <ToolSplit>
        <Panel
          title="开始猜数字"
          description={status === 'won' ? '本局结束，可以再来一局' : `我已经想好了一个 1 到 ${range} 之间的整数`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Hint>提示会自动记录在右侧，猜过的数字不会重复提示。</Hint>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                icon={Trash2}
                onClick={() => setConfirmReset(true)}
                disabled={bestScore === undefined}
              >
                清除最佳成绩
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Field label="难度" htmlFor="guess-difficulty" hint="切换难度会立即开始新的一局">
              <Select
                id="guess-difficulty"
                value={difficulty}
                onChange={(event) => {
                  const value = event.target.value;
                  changeDifficulty(value === 'easy' || value === 'hard' ? value : 'normal');
                }}
              >
                <option value="easy">{DIFFICULTY_LABELS.easy}</option>
                <option value="normal">{DIFFICULTY_LABELS.normal}</option>
                <option value="hard">{DIFFICULTY_LABELS.hard}</option>
              </Select>
            </Field>

            {status === 'won' ? (
              <div className="space-y-4">
                <Alert tone="success" title="恭喜，猜对了！">
                  答案就是 <span className="font-semibold">{formatNumber(target)}</span>，你一共猜了{' '}
                  <span className="font-semibold">{formatNumber(attempts)}</span> 次。
                  {isRecord ? ' 这也是当前难度的最佳成绩。' : ''}
                </Alert>
                <Actions className="mt-0">
                  <Button icon={RotateCcw} type="button" onClick={() => restart()}>
                    再玩一次
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => changeDifficulty(difficulty)}
                  >
                    换个数字
                  </Button>
                </Actions>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <Field
                  label={`输入你的猜测（1 - ${range}）`}
                  htmlFor="guess-input"
                  error={error}
                  hint="按 Enter 快速提交"
                >
                  <div className="flex gap-2">
                    <Input
                      id="guess-input"
                      autoFocus
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={`1 - ${range}`}
                      value={draft}
                      error={Boolean(error)}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        setError(null);
                      }}
                    />
                    <Button type="submit" className="shrink-0">
                      提交
                    </Button>
                  </div>
                </Field>

                <div className="space-y-2">
                  <div className="relative h-2 overflow-hidden rounded-full bg-[var(--hover-bg)]">
                    <div
                      className="absolute inset-y-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                      style={{
                        left: `${((Math.max(lowBound, 1) - 1) / range) * 100}%`,
                        right: `${((range - Math.max(highBound, lowBound)) / range) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs subtle">
                    <span>1</span>
                    <span>
                      当前可能在 {formatNumber(Math.max(lowBound, 1))} - {formatNumber(Math.max(highBound, lowBound))} 之间
                    </span>
                    <span>{formatNumber(range)}</span>
                  </div>
                </div>

                {attempts === 0 ? (
                  <EmptyState
                    icon={Target}
                    title="还没有开始猜"
                    description={`随便输入一个 1 到 ${range} 之间的整数，我会告诉你偏大还是偏小。`}
                    className="py-10"
                  />
                ) : null}
              </form>
            )}
          </div>
        </Panel>

        <Panel title="猜测记录" description={guesses.length > 0 ? `共 ${guesses.length} 次猜测` : '每次猜测的提示会显示在这里'}>
          {guesses.length === 0 ? (
            <EmptyState icon={Hash} title="暂无记录" description="提交第一次猜测后，这里会显示偏大 / 偏小的提示。" />
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {guesses.map((guess, index) => {
                const meta = RESULT_META[guess.result];
                const Icon = meta.icon;
                return (
                  <li
                    key={`${guess.value}-${guesses.length - index}`}
                    className={`flex items-center justify-between gap-3 rounded-xl border bg-[var(--hover-bg)] px-4 py-2.5 ${meta.className}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-xs subtle">#{guesses.length - index}</span>
                      <span className="font-mono text-base font-semibold">{formatNumber(guess.value)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="size-4" />
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {status === 'won' ? (
            <div className="mt-4">
              <Badge tone="success">
                <Trophy className="size-3.5" /> 答案：{formatNumber(target)}
              </Badge>
            </div>
          ) : null}
        </Panel>
      </ToolSplit>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="清除最佳成绩"
        description="将清空所有难度下的最佳成绩记录。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setBest({});
                setConfirmReset(false);
              }}
            >
              确认清除
            </Button>
          </>
        }
      >
        <p className="text-sm muted">此操作只影响保存在本机的成绩，不会影响正在进行的游戏。</p>
      </Modal>
    </div>
  );
}
