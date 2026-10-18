import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Eraser, Eye, Printer, RefreshCw, Wand2 } from 'lucide-react';
import { Actions, Hint, KeyValue, Panel, ToolSplit } from './kit';
import { Alert, Badge, Button, Switch, Tabs } from '../components/ui';
import { cn } from '../lib/utils';
import { useToast } from '../lib/toast';

type Grid = number[];
type Difficulty = 'easy' | 'medium' | 'hard';

const CELLS = 81;

const DIFFICULTIES: { value: Difficulty; label: string; target: number; note: string }[] = [
  { value: 'easy', label: '简单', target: 42, note: '保留约 42 个已知数' },
  { value: 'medium', label: '中等', target: 34, note: '保留约 34 个已知数' },
  { value: 'hard', label: '困难', target: 27, note: '保留约 27 个已知数' },
];

interface Game {
  puzzle: Grid;
  solution: Grid;
  clues: number;
  difficulty: Difficulty;
}

interface Status {
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

function difficultyInfo(value: Difficulty) {
  return DIFFICULTIES.find((item) => item.value === value) ?? DIFFICULTIES[0];
}

function rowOf(index: number): number {
  return Math.floor(index / 9);
}

function colOf(index: number): number {
  return index % 9;
}

function boxOf(index: number): number {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3);
}

function shuffle<T>(input: T[]): T[] {
  const list = input.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const temp = list[index];
    list[index] = list[swap];
    list[swap] = temp;
  }
  return list;
}

/** Bit mask (bits 1–9) of digits that may legally go into an empty cell. */
function candidates(grid: Grid, index: number): number {
  const row = rowOf(index);
  const col = colOf(index);
  let used = 0;
  for (let step = 0; step < 9; step += 1) {
    used |= 1 << grid[row * 9 + step];
    used |= 1 << grid[step * 9 + col];
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let dr = 0; dr < 3; dr += 1) {
    for (let dc = 0; dc < 3; dc += 1) {
      used |= 1 << grid[(boxRow + dr) * 9 + boxCol + dc];
    }
  }
  let mask = 0;
  for (let digit = 1; digit <= 9; digit += 1) {
    if ((used & (1 << digit)) === 0) mask |= 1 << digit;
  }
  return mask;
}

function popcount(mask: number): number {
  let count = 0;
  let value = mask;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

/** Fill an empty grid with a random complete solution (MRV backtracking). */
function fillSolution(grid: Grid): boolean {
  let target = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let index = 0; index < CELLS; index += 1) {
    if (grid[index] !== 0) continue;
    const mask = candidates(grid, index);
    const count = popcount(mask);
    if (count === 0) return false;
    if (count < bestCount) {
      bestCount = count;
      target = index;
      bestMask = mask;
      if (count === 1) break;
    }
  }
  if (target === -1) return true;

  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => (bestMask & (1 << digit)) !== 0));
  for (const digit of digits) {
    grid[target] = digit;
    if (fillSolution(grid)) return true;
  }
  grid[target] = 0;
  return false;
}

function solveGrid(grid: Grid): boolean {
  let target = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let index = 0; index < CELLS; index += 1) {
    if (grid[index] !== 0) continue;
    const mask = candidates(grid, index);
    const count = popcount(mask);
    if (count === 0) return false;
    if (count < bestCount) {
      bestCount = count;
      target = index;
      bestMask = mask;
      if (count === 1) break;
    }
  }
  if (target === -1) return true;

  for (let digit = 1; digit <= 9; digit += 1) {
    if ((bestMask & (1 << digit)) === 0) continue;
    grid[target] = digit;
    if (solveGrid(grid)) return true;
  }
  grid[target] = 0;
  return false;
}

/** Count solutions, stopping as soon as `limit` is reached (mutates the copy passed in). */
function countSolutions(grid: Grid, limit: number): number {
  let target = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let index = 0; index < CELLS; index += 1) {
    if (grid[index] !== 0) continue;
    const mask = candidates(grid, index);
    const count = popcount(mask);
    if (count === 0) return 0;
    if (count < bestCount) {
      bestCount = count;
      target = index;
      bestMask = mask;
      if (count === 1) break;
    }
  }
  if (target === -1) return 1;

  let total = 0;
  for (let digit = 1; digit <= 9; digit += 1) {
    if ((bestMask & (1 << digit)) === 0) continue;
    grid[target] = digit;
    total += countSolutions(grid, limit - total);
    grid[target] = 0;
    if (total >= limit) break;
  }
  return total;
}

function buildSolution(): Grid {
  const grid: Grid = new Array<number>(CELLS).fill(0);
  fillSolution(grid);
  return grid;
}

function createGame(difficulty: Difficulty, requireUnique: boolean): Game {
  const target = difficultyInfo(difficulty).target;
  const firstSolution = buildSolution();
  let best: Game = {
    puzzle: firstSolution.slice(),
    solution: firstSolution,
    clues: CELLS,
    difficulty,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const solution = attempt === 0 ? firstSolution : buildSolution();
    const puzzle = solution.slice();
    let clues = CELLS;
    const order = shuffle(Array.from({ length: CELLS }, (_, index) => index));

    for (const index of order) {
      if (clues <= target) break;
      const value = puzzle[index];
      if (value === 0) continue;
      puzzle[index] = 0;
      const keepRemoved = requireUnique ? countSolutions(puzzle.slice(), 2) === 1 : true;
      if (keepRemoved) {
        clues -= 1;
      } else {
        puzzle[index] = value;
      }
    }

    if (clues < best.clues) best = { puzzle, solution, clues, difficulty };
    if (best.clues <= target) break;
  }

  return best;
}

/** Indices that break the row / column / box rule. */
function findConflicts(values: Grid): Set<number> {
  const conflicts = new Set<number>();
  const groups: number[][] = [];
  for (let row = 0; row < 9; row += 1) {
    groups.push(Array.from({ length: 9 }, (_, col) => row * 9 + col));
  }
  for (let col = 0; col < 9; col += 1) {
    groups.push(Array.from({ length: 9 }, (_, row) => row * 9 + col));
  }
  for (let box = 0; box < 9; box += 1) {
    const boxRow = Math.floor(box / 3) * 3;
    const boxCol = (box % 3) * 3;
    const cells: number[] = [];
    for (let dr = 0; dr < 3; dr += 1) {
      for (let dc = 0; dc < 3; dc += 1) cells.push((boxRow + dr) * 9 + boxCol + dc);
    }
    groups.push(cells);
  }

  for (const group of groups) {
    const seen = new Map<number, number[]>();
    for (const index of group) {
      const value = values[index];
      if (!value) continue;
      const list = seen.get(value);
      if (list) list.push(index);
      else seen.set(value, [index]);
    }
    for (const list of seen.values()) {
      if (list.length > 1) list.forEach((index) => conflicts.add(index));
    }
  }
  return conflicts;
}

function cellBorder(row: number, col: number): string {
  const parts: string[] = [];
  if (col === 8) parts.push('border-r-0');
  else if (col === 2 || col === 5) parts.push('border-r-2', 'border-r-slate-400', 'dark:border-r-slate-500');
  else parts.push('border-r', 'border-r-slate-200', 'dark:border-r-slate-700');

  if (row === 8) parts.push('border-b-0');
  else if (row === 2 || row === 5) parts.push('border-b-2', 'border-b-slate-400', 'dark:border-b-slate-500');
  else parts.push('border-b', 'border-b-slate-200', 'dark:border-b-slate-700');

  return parts.join(' ');
}

function buildPrintHtml(values: Grid, puzzle: Grid, difficulty: Difficulty): string {
  const rows: string[] = [];
  for (let row = 0; row < 9; row += 1) {
    const cells: string[] = [];
    for (let col = 0; col < 9; col += 1) {
      const index = row * 9 + col;
      const value = values[index] || puzzle[index] || 0;
      const given = puzzle[index] !== 0;
      const styles = [
        'border:1px solid #9ca3af',
        row % 3 === 0 ? 'border-top:2px solid #111827' : '',
        col % 3 === 0 ? 'border-left:2px solid #111827' : '',
        row === 8 ? 'border-bottom:2px solid #111827' : '',
        col === 8 ? 'border-right:2px solid #111827' : '',
        `color:${given ? '#111827' : '#4f46e5'}`,
      ]
        .filter(Boolean)
        .join(';');
      cells.push(`<td style="${styles}">${value || ''}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  const clues = puzzle.filter((value) => value !== 0).length;

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>数独练习</title><style>
    @page { size: A4; margin: 16mm; }
    body { margin: 0; font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #111827; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #4b5563; margin: 0 0 14px; }
    table { border-collapse: collapse; table-layout: fixed; width: 468px; height: 468px; }
    td { width: 52px; height: 52px; text-align: center; vertical-align: middle; font-size: 22px; }
  </style></head><body>
    <h1>数独练习 · ${difficultyInfo(difficulty).label}</h1>
    <p class="meta">日期：${new Date().toLocaleDateString('zh-CN')} · 已知数 ${clues} 个 · 蓝色为你的填写</p>
    <table>${rows.join('')}</table>
  </body></html>`;
}

export default function SudokuTool() {
  const toast = useToast();
  const cellRefs = useRef<Array<HTMLInputElement | null>>([]);
  const timerRef = useRef<number | null>(null);

  const [game, setGame] = useState<Game>(() => createGame('easy', true));
  const [values, setValues] = useState<Grid>(() => game.puzzle.slice());
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [requireUnique, setRequireUnique] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const conflicts = useMemo(() => findConflicts(values), [values]);

  const counts = useMemo(() => {
    const result = new Array<number>(10).fill(0);
    for (const value of values) {
      if (value) result[value] += 1;
    }
    return result;
  }, [values]);

  const filled = useMemo(() => values.filter((value) => value !== 0).length, [values]);

  const generate = useCallback((nextDifficulty: Difficulty, unique: boolean) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setBusy(true);
    setStatus(null);
    const info = difficultyInfo(nextDifficulty);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const next = createGame(nextDifficulty, unique);
      setGame(next);
      setValues(next.puzzle.slice());
      setSelected(null);
      setRevealed(false);
      setStatus({
        tone: 'info',
        title: `已生成「${info.label}」题目`,
        detail: `已知数 ${next.clues} 个${unique ? '，已验算唯一解' : '，未校验唯一解'}`,
      });
      setBusy(false);
    }, 40);
  }, []);

  const setCell = (index: number, value: number) => {
    if (game.puzzle[index] !== 0) return;
    setValues((prev) => {
      if (prev[index] === value) return prev;
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  };

  const focusCell = (index: number) => {
    const target = Math.min(CELLS - 1, Math.max(0, index));
    cellRefs.current[target]?.focus();
    setSelected(target);
  };

  const placeDigit = (digit: number) => {
    if (selected === null) return;
    if (game.puzzle[selected] !== 0) return;
    setCell(selected, digit);
  };

  const check = () => {
    if (conflicts.size > 0) {
      setStatus({
        tone: 'warning',
        title: '存在冲突',
        detail: `有 ${conflicts.size} 个格子违反数独规则（红色高亮），请修改后再检查。`,
      });
      return;
    }
    if (filled < CELLS) {
      setStatus({
        tone: 'info',
        title: '还没有填完',
        detail: `已完成 ${filled} / ${CELLS} 格，还剩 ${CELLS - filled} 个空格。`,
      });
      return;
    }
    setStatus({ tone: 'success', title: '全部正确', detail: '每一行、每一列和每个 3×3 宫都恰好包含 1–9。' });
  };

  const solve = () => {
    if (conflicts.size > 0) {
      setStatus({
        tone: 'error',
        title: '无法求解',
        detail: '当前盘面存在冲突（红色高亮），请先修正后再求解。',
      });
      return;
    }
    const draft = values.slice();
    if (!solveGrid(draft)) {
      setStatus({
        tone: 'error',
        title: '当前盘面无解',
        detail: '按已填写的数字无法完成，请修改或清除部分填写后重试。',
      });
      return;
    }
    setValues(draft);
    setRevealed(true);
    setStatus({ tone: 'success', title: '已解出', detail: '绿色为自动填入的数字，仍可手动修改。' });
  };

  const reveal = () => {
    const next = values.slice();
    for (let index = 0; index < CELLS; index += 1) {
      if (next[index] === 0) next[index] = game.solution[index];
    }
    setValues(next);
    setRevealed(true);
    setStatus({ tone: 'info', title: '已显示答案', detail: '空格已填入参考答案，点击「清除填写」可重做。' });
  };

  const clearEntries = () => {
    setValues(game.puzzle.slice());
    setRevealed(false);
    setSelected(null);
    setStatus(null);
  };

  const printPuzzle = () => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.remove();
      toast.error('无法创建打印页面，请检查浏览器设置');
      return;
    }
    doc.open();
    doc.write(buildPrintHtml(values, game.puzzle, game.difficulty));
    doc.close();

    window.setTimeout(() => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        iframe.remove();
        return;
      }
      frameWindow.onafterprint = () => iframe.remove();
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        toast.error('打印失败，请检查浏览器设置');
      }
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.remove();
      }, 60_000);
    }, 300);
  };

  const exportPng = () => {
    const size = 900;
    const cell = size / 9;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      toast.error('当前浏览器不支持 Canvas 2D');
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);

    for (let line = 0; line <= 9; line += 1) {
      const thick = line % 3 === 0;
      context.strokeStyle = thick ? '#111827' : '#cbd5e1';
      context.lineWidth = thick ? 6 : 2;
      context.beginPath();
      context.moveTo(line * cell, 0);
      context.lineTo(line * cell, size);
      context.stroke();
      context.beginPath();
      context.moveTo(0, line * cell);
      context.lineTo(size, line * cell);
      context.stroke();
    }

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '600 44px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    values.forEach((value, index) => {
      if (!value) return;
      const given = game.puzzle[index] !== 0;
      context.fillStyle = given ? '#111827' : '#4f46e5';
      context.fillText(String(value), colOf(index) * cell + cell / 2, rowOf(index) * cell + cell / 2 + 2);
    });

    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('导出 PNG 失败');
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sudoku-${game.difficulty}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('已导出 PNG');
    }, 'image/png');
  };

  const selectedRow = selected === null ? -1 : rowOf(selected);
  const selectedCol = selected === null ? -1 : colOf(selected);
  const selectedBox = selected === null ? -1 : boxOf(selected);
  const selectedValue = selected === null ? 0 : values[selected];
  const info = difficultyInfo(game.difficulty);

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="出题设置" description="随机生成可解数独，题目与答案都在本地计算。">
          <div className="space-y-4">
            <div>
              <p className="label">难度</p>
              <Tabs<Difficulty>
                items={DIFFICULTIES.map((item) => ({ value: item.value, label: item.label }))}
                value={difficulty}
                onChange={(next) => {
                  setDifficulty(next);
                  generate(next, requireUnique);
                }}
              />
            </div>

            <Switch
              checked={requireUnique}
              onChange={setRequireUnique}
              label="挖空时验证唯一解（更慢，但答案唯一）"
            />
            <Hint>
              {requireUnique
                ? '每挖掉一个数字都会用回溯计数确认解仍然唯一，因此困难级别耗时略长。'
                : '关闭校验后挖空更快，但同一题目可能存在多个解，「显示答案」只会给出其中一个。'}
            </Hint>

            <Actions className="mt-0">
              <Button icon={RefreshCw} loading={busy} disabled={busy} onClick={() => generate(difficulty, requireUnique)}>
                生成新题目
              </Button>
              <Button variant="secondary" icon={CheckCircle2} onClick={check}>
                校验
              </Button>
              <Button variant="secondary" icon={Wand2} onClick={solve}>
                求解
              </Button>
              <Button variant="secondary" icon={Eye} onClick={reveal}>
                显示答案
              </Button>
              <Button variant="ghost" icon={Eraser} onClick={clearEntries}>
                清除填写
              </Button>
            </Actions>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={Printer} onClick={printPuzzle}>
                打印
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={exportPng}>
                导出 PNG
              </Button>
            </div>

            <KeyValue
              items={[
                { label: '当前难度', value: `${info.label}（${info.note}）` },
                { label: '已知数', value: `${game.clues} 个` },
                { label: '空格', value: `${CELLS - game.clues} 个` },
                { label: '已填写', value: `${filled} / ${CELLS}` },
                { label: '唯一解', value: requireUnique ? '已校验' : '未校验' },
              ]}
            />

            <Hint>
              键盘操作：方向键移动焦点，1–9 填数，Backspace / Delete 清除；也可以先用鼠标选中格子，再点下方数字面板。
            </Hint>
          </div>
        </Panel>

        <Panel title="填写盘面" description="灰色数字为题目，蓝色为你填写的数字。">
          <div className="space-y-4">
            <div className="mx-auto w-full max-w-[520px]">
              <div className="grid grid-cols-9 overflow-hidden rounded-xl border-2 border-slate-400 dark:border-slate-500">
                {values.map((value, index) => {
                  const row = rowOf(index);
                  const col = colOf(index);
                  const given = game.puzzle[index] !== 0;
                  const conflict = conflicts.has(index);
                  const isSelected = selected === index;
                  const isPeer =
                    selected !== null &&
                    !isSelected &&
                    (row === selectedRow || col === selectedCol || boxOf(index) === selectedBox);
                  const sameValue = selectedValue !== 0 && value === selectedValue && !isSelected;
                  const cellBackground = conflict
                    ? 'bg-rose-50 dark:bg-rose-500/20'
                    : isSelected
                      ? 'bg-indigo-100 dark:bg-indigo-500/25'
                      : sameValue
                        ? 'bg-indigo-50 dark:bg-indigo-500/15'
                        : isPeer
                          ? 'bg-[var(--hover-bg)]'
                          : 'bg-transparent';
                  const valueColor = conflict
                    ? 'text-rose-600 dark:text-rose-300'
                    : given
                      ? 'text-[var(--text-primary)]'
                      : revealed
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-indigo-600 dark:text-indigo-400';

                  return (
                    <div
                      key={index}
                      className={cn('relative aspect-square', cellBorder(row, col), cellBackground)}
                    >
                      <input
                        ref={(node) => {
                          cellRefs.current[index] = node;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`第 ${row + 1} 行第 ${col + 1} 列`}
                        value={value === 0 ? '' : String(value)}
                        readOnly={given}
                        onFocus={() => setSelected(index)}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/[^1-9]/g, '');
                          const digit = digits ? Number(digits[digits.length - 1]) : 0;
                          if (!given) setCell(index, digit);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Backspace' || event.key === 'Delete') {
                            event.preventDefault();
                            if (!given) setCell(index, 0);
                            return;
                          }
                          let step = 0;
                          if (event.key === 'ArrowLeft') step = -1;
                          else if (event.key === 'ArrowRight') step = 1;
                          else if (event.key === 'ArrowUp') step = -9;
                          else if (event.key === 'ArrowDown') step = 9;
                          if (step !== 0) {
                            event.preventDefault();
                            if (event.key === 'ArrowLeft' && col === 0) return;
                            if (event.key === 'ArrowRight' && col === 8) return;
                            const next = index + step;
                            if (next >= 0 && next < CELLS) focusCell(next);
                            return;
                          }
                          if (/^[1-9]$/.test(event.key)) {
                            event.preventDefault();
                            if (!given) setCell(index, Number(event.key));
                          }
                        }}
                        className={cn(
                          'size-full bg-transparent text-center text-lg font-semibold tabular-nums outline-none sm:text-2xl',
                          valueColor,
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mx-auto w-full max-w-[520px] space-y-2">
              <div className="flex items-center justify-between text-xs subtle">
                <span>
                  {selected === null
                    ? '点击格子开始填写'
                    : `第 ${selectedRow + 1} 行 · 第 ${selectedCol + 1} 列${values[selected] ? ` · 当前 ${values[selected]}` : ' · 空格'}`}
                </span>
                {revealed ? <Badge tone="brand">已显示答案</Badge> : null}
              </div>
              <div className="grid grid-cols-9 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
                  const left = 9 - counts[digit];
                  const disabled = selected === null || left <= 0;
                  return (
                    <button
                      key={digit}
                      type="button"
                      disabled={disabled}
                      onClick={() => placeDigit(digit)}
                      className={cn(
                        'relative rounded-lg border py-2.5 text-base font-semibold transition-colors',
                        'hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40',
                        'dark:hover:border-indigo-500 dark:hover:text-indigo-400',
                      )}
                      aria-label={`填入 ${digit}`}
                    >
                      {digit}
                      <span className="absolute inset-x-0 -bottom-0.5 text-[10px] font-normal subtle">{left}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {status ? (
              <Alert tone={status.tone} title={status.title}>
                {status.detail}
              </Alert>
            ) : null}

            {conflicts.size > 0 ? (
              <p className="text-xs text-rose-500">
                当前有 {conflicts.size} 个格子存在重复数字（红色标记），不会阻止继续填写。
              </p>
            ) : null}
          </div>
        </Panel>
      </ToolSplit>
    </div>
  );
}
