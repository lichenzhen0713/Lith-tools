import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Grid3x3, Handshake, RotateCcw, Trash2, Trophy, Users } from 'lucide-react';
import { Actions, Field, Hint, KeyValue, Panel, ToolSplit } from './kit';
import { Alert, Badge, Button, Modal, Select, StatCard, Tabs } from '../components/ui';
import { cn, formatNumber } from '../lib/utils';
import { useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

type Mark = 'X' | 'O';
type Cell = Mark | null;
type Mode = 'pvp' | 'ai';

interface Outcome {
  winner: Mark | null;
  line: number[];
}

interface PvpScore {
  x: number;
  o: number;
  draw: number;
}

interface AiScore {
  human: number;
  ai: number;
  draw: number;
}

const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const EMPTY_BOARD: Cell[] = Array<Cell>(9).fill(null);
const AI_DELAY = 420;
const AI_LEVEL_LABEL = 'Minimax · 不会输';

function otherMark(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X';
}

function evaluateBoard(board: Cell[]): Outcome | null {
  for (const line of LINES) {
    const first = board[line[0]];
    if (first !== null && first === board[line[1]] && first === board[line[2]]) {
      return { winner: first, line };
    }
  }
  return board.every((cell) => cell !== null) ? { winner: null, line: [] } : null;
}

function randomPick(size: number): number {
  if (size <= 1) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % size;
  }
  return Math.floor(Math.random() * size);
}

/** Perfect play via minimax with alpha-free memoisation: the AI never loses. */
function chooseAiMove(board: Cell[], me: Mark): number {
  const opponent = otherMark(me);
  const memo = new Map<string, number>();
  const encode = (state: Cell[], turn: Mark) => `${state.map((cell) => cell ?? '.').join('')}|${turn}`;

  const solve = (state: Cell[], turn: Mark, depth: number): number => {
    const outcome = evaluateBoard(state);
    if (outcome) {
      if (outcome.winner === me) return 10 - depth;
      if (outcome.winner === opponent) return depth - 10;
      return 0;
    }

    const key = encode(state, turn);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const maximizing = turn === me;
    let best = maximizing ? -Infinity : Infinity;
    for (let index = 0; index < 9; index += 1) {
      if (state[index] !== null) continue;
      const next = state.slice();
      next[index] = turn;
      const score = solve(next, otherMark(turn), depth + 1);
      best = maximizing ? Math.max(best, score) : Math.min(best, score);
    }
    memo.set(key, best);
    return best;
  };

  let bestScore = -Infinity;
  let candidates: number[] = [];
  for (let index = 0; index < 9; index += 1) {
    if (board[index] !== null) continue;
    const next = board.slice();
    next[index] = me;
    const score = solve(next, opponent, 1);
    if (score > bestScore) {
      bestScore = score;
      candidates = [index];
    } else if (score === bestScore) {
      candidates.push(index);
    }
  }
  if (candidates.length === 0) return -1;
  return candidates[randomPick(candidates.length)];
}

function cellLabel(index: number): string {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;
  return `第 ${row} 行第 ${column} 列`;
}

export default function TicTacToeTool() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('pvp');
  const [humanMark, setHumanMark] = useState<Mark>('X');
  const [board, setBoard] = useState<Cell[]>(EMPTY_BOARD);
  const [pvpScore, setPvpScore] = useLocalStorage<PvpScore>('lith-tic-tac-toe-pvp', { x: 0, o: 0, draw: 0 });
  const [aiScore, setAiScore] = useLocalStorage<AiScore>('lith-tic-tac-toe-ai', { human: 0, ai: 0, draw: 0 });
  const [confirmReset, setConfirmReset] = useState(false);

  const aiMark = otherMark(humanMark);
  const outcome = useMemo(() => evaluateBoard(board), [board]);
  const finished = outcome !== null;

  const currentPlayer: Mark = useMemo(() => {
    let x = 0;
    let o = 0;
    for (const cell of board) {
      if (cell === 'X') x += 1;
      else if (cell === 'O') o += 1;
    }
    return x > o ? 'O' : 'X';
  }, [board]);

  const applyMove = useCallback(
    (index: number, mark: Mark, snapshot: Cell[]) => {
      if (snapshot[index] !== null) return;
      const next = snapshot.slice();
      next[index] = mark;
      setBoard(next);

      const result = evaluateBoard(next);
      if (!result) return;

      if (mode === 'pvp') {
        setPvpScore((previous) => {
          if (result.winner === 'X') return { ...previous, x: previous.x + 1 };
          if (result.winner === 'O') return { ...previous, o: previous.o + 1 };
          return { ...previous, draw: previous.draw + 1 };
        });
      } else {
        setAiScore((previous) => {
          if (result.winner === null) return { ...previous, draw: previous.draw + 1 };
          return result.winner === humanMark
            ? { ...previous, human: previous.human + 1 }
            : { ...previous, ai: previous.ai + 1 };
        });
      }
    },
    [mode, humanMark, setAiScore, setPvpScore],
  );

  // Let the computer answer after a short pause; the timer is cancelled whenever
  // the board changes (including unmount), so a stale move can never land.
  useEffect(() => {
    if (mode !== 'ai' || finished || currentPlayer === humanMark) return;
    const timer = window.setTimeout(() => {
      const move = chooseAiMove(board, aiMark);
      if (move >= 0) applyMove(move, aiMark, board);
    }, AI_DELAY);
    return () => window.clearTimeout(timer);
  }, [mode, finished, currentPlayer, humanMark, board, aiMark, applyMove]);

  const handleCellClick = (index: number) => {
    if (finished || board[index] !== null) return;
    if (mode === 'ai' && currentPlayer !== humanMark) return;
    applyMove(index, currentPlayer, board);
  };

  const restart = () => {
    setBoard(EMPTY_BOARD);
  };

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setBoard(EMPTY_BOARD);
  };

  const changeHumanMark = (next: Mark) => {
    if (next === humanMark) return;
    setHumanMark(next);
    setBoard(EMPTY_BOARD);
  };

  const status = useMemo((): { tone: 'info' | 'success' | 'warning'; text: string } => {
    if (outcome?.winner) {
      if (mode === 'pvp') return { tone: 'success', text: `玩家 ${outcome.winner} 获胜！` };
      return outcome.winner === humanMark
        ? { tone: 'success', text: '你战胜了电脑，太厉害了！' }
        : { tone: 'warning', text: '电脑获胜，再来一局试试？' };
    }
    if (finished) return { tone: 'info', text: '平局！双方都没能连成三子。' };
    if (mode === 'ai' && currentPlayer === aiMark) return { tone: 'info', text: '电脑正在思考…' };
    if (mode === 'ai') return { tone: 'info', text: `轮到你落子（${humanMark}）` };
    return { tone: 'info', text: `轮到玩家 ${currentPlayer} 落子` };
  }, [outcome, finished, mode, currentPlayer, humanMark, aiMark]);

  const pvpTotal = pvpScore.x + pvpScore.o + pvpScore.draw;
  const aiTotal = aiScore.human + aiScore.ai + aiScore.draw;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Trophy}
          label={mode === 'pvp' ? '玩家 X 胜' : '你的胜利'}
          value={formatNumber(mode === 'pvp' ? pvpScore.x : aiScore.human)}
          hint={mode === 'pvp' ? 'X 永远先手' : `你执 ${humanMark}`}
        />
        <StatCard
          icon={mode === 'pvp' ? Users : Bot}
          label={mode === 'pvp' ? '玩家 O 胜' : '电脑胜利'}
          value={formatNumber(mode === 'pvp' ? pvpScore.o : aiScore.ai)}
          hint={mode === 'pvp' ? '同一设备轮流落子' : AI_LEVEL_LABEL}
        />
        <StatCard
          icon={Handshake}
          label="平局"
          value={formatNumber(mode === 'pvp' ? pvpScore.draw : aiScore.draw)}
          hint={`共 ${formatNumber(mode === 'pvp' ? pvpTotal : aiTotal)} 局`}
        />
      </div>

      <ToolSplit>
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Grid3x3 className="size-4" /> 棋盘
            </span>
          }
          description={mode === 'pvp' ? '双人对战 · 轮流落子' : `人机对战 · 你执 ${humanMark}`}
        >
          <Alert tone={status.tone}>{status.text}</Alert>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {board.map((cell, index) => {
              const winning = outcome?.line.includes(index) ?? false;
              const playable = !finished && cell === null && (mode === 'pvp' || currentPlayer === humanMark);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleCellClick(index)}
                  disabled={!playable}
                  aria-label={`${cellLabel(index)}，${cell ?? '空'}`}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-2xl border-2 text-4xl font-bold transition-colors select-none sm:text-5xl',
                    winning
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-600 dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : cell === 'X'
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300'
                        : cell === 'O'
                          ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300'
                          : 'border-[var(--card-border)] bg-[var(--hover-bg)]',
                    playable &&
                      'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/70 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10',
                  )}
                >
                  {cell ?? ''}
                </button>
              );
            })}
          </div>

          <Actions className="justify-center">
            <Button type="button" icon={RotateCcw} onClick={restart}>
              {finished ? '再来一局' : '重新开始'}
            </Button>
            <Button variant="secondary" type="button" icon={Trash2} onClick={() => setConfirmReset(true)}>
              清除比分
            </Button>
          </Actions>

          <div className="mt-4">
            <Hint>
              双人模式双方在同一设备上轮流点击棋盘；人机模式由 Minimax 算法计算最优落子，理论上无法被击败，最佳结果是平局。
            </Hint>
          </div>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Bot className="size-4" /> 对局设置
            </span>
          }
          description="切换模式或先手会立即开始新的一局"
        >
          <div className="space-y-4">
            <Tabs<Mode>
              items={[
                { value: 'pvp', label: '双人对战' },
                { value: 'ai', label: '人机对战' },
              ]}
              value={mode}
              onChange={changeMode}
            />

            {mode === 'ai' ? (
              <Field label="你的棋子" htmlFor="tic-mark" hint="X 永远先手；选择 O 时由电脑先落子">
                <Select
                  id="tic-mark"
                  value={humanMark}
                  onChange={(event) => changeHumanMark(event.target.value === 'O' ? 'O' : 'X')}
                >
                  <option value="X">X（先手）</option>
                  <option value="O">O（后手）</option>
                </Select>
              </Field>
            ) : (
              <div className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3 text-sm muted">
                双人模式下 X 永远先手，双方轮流在同一棋盘上落子。
              </div>
            )}

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                {mode === 'pvp' ? '双人战绩' : '人机战绩'}
                {mode === 'ai' ? <Badge tone="brand">{AI_LEVEL_LABEL}</Badge> : null}
              </p>
              <KeyValue
                items={
                  mode === 'pvp'
                    ? [
                        { label: 'X 胜', value: formatNumber(pvpScore.x) },
                        { label: 'O 胜', value: formatNumber(pvpScore.o) },
                        { label: '平局', value: formatNumber(pvpScore.draw) },
                        { label: '总对局', value: formatNumber(pvpTotal) },
                      ]
                    : [
                        { label: '你的胜利', value: formatNumber(aiScore.human) },
                        { label: '电脑胜利', value: formatNumber(aiScore.ai) },
                        { label: '平局', value: formatNumber(aiScore.draw) },
                        { label: '总对局', value: formatNumber(aiTotal) },
                      ]
                }
              />
            </div>

            <Hint>胜负与平局会在棋盘结束后自动计入统计，比分保存在本机浏览器中。</Hint>
          </div>
        </Panel>
      </ToolSplit>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="清除比分"
        description="将把双人与人机模式的胜负统计全部清零。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setPvpScore({ x: 0, o: 0, draw: 0 });
                setAiScore({ human: 0, ai: 0, draw: 0 });
                setConfirmReset(false);
                toast.success('比分已清零');
              }}
            >
              确认清除
            </Button>
          </>
        }
      >
        <p className="text-sm muted">棋盘上的对局不受影响，但清除后无法恢复历史战绩。</p>
      </Modal>
    </div>
  );
}
