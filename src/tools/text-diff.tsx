import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  FileDiff,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Field, Hint, Panel, Textarea } from './kit';
import { Alert, Badge, Button, Checkbox, CopyButton, EmptyState, Spinner } from '../components/ui';
import { useDebouncedValue } from '../lib/hooks';
import { cn } from '../lib/utils';

/* ------------------------------------------------------------------ 类型 */

type OpType = 'same' | 'del' | 'ins';

interface Op {
  type: OpType;
  left?: string;
  right?: string;
}

interface DiffOptions {
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
}

interface DiffOutcome {
  ops: Op[];
  mode: 'lcs' | 'fast';
  added: number;
  removed: number;
  same: number;
  hunks: number;
  tooLarge: boolean;
  reason?: string;
}

type CellKind = 'same' | 'del' | 'ins';

interface DiffCell {
  num: number;
  text: string;
  kind: CellKind;
}

interface DiffRow {
  kind: 'same' | 'change';
  left: DiffCell | null;
  right: DiffCell | null;
}

interface GapRow {
  kind: 'gap';
  count: number;
}

type DisplayRow = DiffRow | GapRow;

const MAX_LINES = 20_000;
const MAX_CHARS = 2_000_000;
const MAX_RENDER_ROWS = 1200;
const MAX_DP_CELLS = 2_000_000;
const FAST_MODE_LINES = 4000;
const COLLAPSE_AFTER = 6;
const COLLAPSE_CONTEXT = 3;

const SAMPLE_LEFT = `Lith Tools 是一个在线工具箱。
它包含转换、文本、图片等工具。
所有处理都在浏览器本地完成。
这一行只在原始文本中出现。
`;

const SAMPLE_RIGHT = `Lith Tools 是一个在线工具箱。
它包含转换、文本、图片等工具。
所有处理都在浏览器本地完成，不上传服务器。
这一行只在对比文本中出现。
`;

/* ---------------------------------------------------------------- 基础逻辑 */

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n?/g, '\n').split('\n');
}

function normalizeLine(line: string, options: DiffOptions): string {
  let value = line;
  if (options.ignoreWhitespace) value = value.replace(/\s+/g, ' ').trim();
  if (options.ignoreCase) value = value.toLowerCase();
  return value;
}

function fastOps(leftRaw: string[], rightRaw: string[], leftNorm: string[], rightNorm: string[]): Op[] {
  const ops: Op[] = [];
  const max = Math.max(leftRaw.length, rightRaw.length);
  for (let index = 0; index < max; index += 1) {
    const hasLeft = index < leftRaw.length;
    const hasRight = index < rightRaw.length;
    if (hasLeft && hasRight && leftNorm[index] === rightNorm[index]) {
      ops.push({ type: 'same', left: leftRaw[index], right: rightRaw[index] });
    } else {
      if (hasLeft) ops.push({ type: 'del', left: leftRaw[index] });
      if (hasRight) ops.push({ type: 'ins', right: rightRaw[index] });
    }
  }
  return ops;
}

/** Classic LCS dynamic programming over lines, with a hard cell budget. */
function lcsOps(
  leftRaw: string[],
  rightRaw: string[],
  leftNorm: string[],
  rightNorm: string[],
): { ops: Op[]; exact: boolean } {
  const rows = leftRaw.length;
  const cols = rightRaw.length;
  if ((rows + 1) * (cols + 1) > MAX_DP_CELLS) {
    return { ops: fastOps(leftRaw, rightRaw, leftNorm, rightNorm), exact: false };
  }
  const width = cols + 1;
  const dp = new Int32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i -= 1) {
    const row = i * width;
    const nextRow = row + width;
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[row + j] =
        leftNorm[i] === rightNorm[j]
          ? dp[nextRow + j + 1] + 1
          : Math.max(dp[nextRow + j], dp[row + j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (leftNorm[i] === rightNorm[j]) {
      ops.push({ type: 'same', left: leftRaw[i], right: rightRaw[j] });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ type: 'del', left: leftRaw[i] });
      i += 1;
    } else {
      ops.push({ type: 'ins', right: rightRaw[j] });
      j += 1;
    }
  }
  while (i < rows) {
    ops.push({ type: 'del', left: leftRaw[i] });
    i += 1;
  }
  while (j < cols) {
    ops.push({ type: 'ins', right: rightRaw[j] });
    j += 1;
  }
  return { ops, exact: true };
}

function computeDiff(leftText: string, rightText: string, options: DiffOptions): DiffOutcome {
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const totalLines = left.length + right.length;
  const totalChars = leftText.length + rightText.length;

  if (totalLines > MAX_LINES || totalChars > MAX_CHARS) {
    return {
      ops: [],
      mode: 'fast',
      added: 0,
      removed: 0,
      same: 0,
      hunks: 0,
      tooLarge: true,
      reason: `文本过大（${totalLines.toLocaleString('zh-CN')} 行 / ${Math.round(totalChars / 1000).toLocaleString('zh-CN')} 千字符），已停止计算。请分段对比，单次建议不超过 ${MAX_LINES.toLocaleString('zh-CN')} 行、${MAX_CHARS / 1_000_000} M 字符。`,
    };
  }

  const leftNorm = left.map((line) => normalizeLine(line, options));
  const rightNorm = right.map((line) => normalizeLine(line, options));

  let prefix = 0;
  while (prefix < left.length && prefix < right.length && leftNorm[prefix] === rightNorm[prefix]) prefix += 1;
  let leftEnd = left.length - 1;
  let rightEnd = right.length - 1;
  let suffix = 0;
  while (leftEnd >= prefix && rightEnd >= prefix && leftNorm[leftEnd] === rightNorm[rightEnd]) {
    leftEnd -= 1;
    rightEnd -= 1;
    suffix += 1;
  }

  const leftMidRaw = left.slice(prefix, leftEnd + 1);
  const rightMidRaw = right.slice(prefix, rightEnd + 1);
  const leftMidNorm = leftNorm.slice(prefix, leftEnd + 1);
  const rightMidNorm = rightNorm.slice(prefix, rightEnd + 1);

  const middle =
    totalLines > FAST_MODE_LINES
      ? { ops: fastOps(leftMidRaw, rightMidRaw, leftMidNorm, rightMidNorm), exact: false }
      : lcsOps(leftMidRaw, rightMidRaw, leftMidNorm, rightMidNorm);

  const ops: Op[] = [];
  for (let index = 0; index < prefix; index += 1) {
    ops.push({ type: 'same', left: left[index], right: right[index] });
  }
  ops.push(...middle.ops);
  for (let index = 0; index < suffix; index += 1) {
    ops.push({ type: 'same', left: left[leftEnd + 1 + index], right: right[rightEnd + 1 + index] });
  }

  let added = 0;
  let removed = 0;
  let same = 0;
  let hunks = 0;
  let inHunk = false;
  for (const op of ops) {
    if (op.type === 'same') {
      same += 1;
      inHunk = false;
    } else {
      if (op.type === 'ins') added += 1;
      else removed += 1;
      if (!inHunk) {
        hunks += 1;
        inHunk = true;
      }
    }
  }

  return {
    ops,
    mode: middle.exact ? 'lcs' : 'fast',
    added,
    removed,
    same,
    hunks,
    tooLarge: false,
  };
}

/* ------------------------------------------------------------------ 行构建 */

function buildRows(ops: Op[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let leftNum = 1;
  let rightNum = 1;
  let deletions: { num: number; text: string }[] = [];
  let insertions: { num: number; text: string }[] = [];

  const flush = () => {
    const count = Math.max(deletions.length, insertions.length);
    for (let index = 0; index < count; index += 1) {
      const left = deletions[index];
      const right = insertions[index];
      rows.push({
        kind: 'change',
        left: left ? { ...left, kind: 'del' } : null,
        right: right ? { ...right, kind: 'ins' } : null,
      });
    }
    deletions = [];
    insertions = [];
  };

  for (const op of ops) {
    if (op.type === 'same') {
      flush();
      rows.push({
        kind: 'same',
        left: { num: leftNum, text: op.left ?? '', kind: 'same' },
        right: { num: rightNum, text: op.right ?? '', kind: 'same' },
      });
      leftNum += 1;
      rightNum += 1;
    } else if (op.type === 'del') {
      deletions.push({ num: leftNum, text: op.left ?? '' });
      leftNum += 1;
    } else {
      insertions.push({ num: rightNum, text: op.right ?? '' });
      rightNum += 1;
    }
  }
  flush();
  return rows;
}

function collapseRows(rows: DiffRow[], expanded: boolean): DisplayRow[] {
  if (expanded) return rows;
  const result: DisplayRow[] = [];
  let index = 0;
  while (index < rows.length) {
    if (rows[index].kind !== 'same') {
      result.push(rows[index]);
      index += 1;
      continue;
    }
    let end = index;
    while (end < rows.length && rows[end].kind === 'same') end += 1;
    const run = end - index;
    if (run <= COLLAPSE_AFTER) {
      for (let cursor = index; cursor < end; cursor += 1) result.push(rows[cursor]);
    } else {
      for (let cursor = 0; cursor < COLLAPSE_CONTEXT; cursor += 1) result.push(rows[index + cursor]);
      result.push({ kind: 'gap', count: run - COLLAPSE_CONTEXT * 2 });
      for (let cursor = end - COLLAPSE_CONTEXT; cursor < end; cursor += 1) result.push(rows[cursor]);
    }
    index = end;
  }
  return result;
}

function buildReport(outcome: DiffOutcome): string {
  const header = [
    '文本对比报告',
    `新增 ${outcome.added} 行 · 删除 ${outcome.removed} 行 · 相同 ${outcome.same} 行 · 变更块 ${outcome.hunks}`,
    '',
  ];
  const lines = outcome.ops.slice(0, 2000).map((op) => {
    if (op.type === 'same') return `  ${op.left ?? ''}`;
    if (op.type === 'del') return `- ${op.left ?? ''}`;
    return `+ ${op.right ?? ''}`;
  });
  if (outcome.ops.length > 2000) lines.push('…（报告已截断，仅包含前 2000 行）');
  return [...header, ...lines].join('\n');
}

function lineCount(text: string): number {
  return splitLines(text).length;
}

/* ------------------------------------------------------------------ 渲染 */

function CellView({ cell }: { cell: DiffCell | null }) {
  if (!cell) {
    return <div className="min-h-6 bg-[var(--hover-bg)]/50 px-2 py-1" />;
  }
  return (
    <div
      className={cn(
        'flex min-w-0 gap-2 border-l-2 px-2 py-1 leading-5',
        cell.kind === 'del'
          ? 'border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200'
          : cell.kind === 'ins'
            ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
            : 'border-transparent',
      )}
    >
      <span className={cn('w-9 shrink-0 text-right text-[11px] select-none', cell.kind === 'same' ? 'subtle' : 'opacity-70')}>
        {cell.num}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-all">{cell.text === '' ? '\u00a0' : cell.text}</span>
    </div>
  );
}

export default function TextDiffTool() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const debouncedLeft = useDebouncedValue(left, 350);
  const debouncedRight = useDebouncedValue(right, 350);
  const pending = left !== debouncedLeft || right !== debouncedRight;

  const outcome = useMemo(
    () => computeDiff(debouncedLeft, debouncedRight, { ignoreWhitespace, ignoreCase }),
    [debouncedLeft, debouncedRight, ignoreWhitespace, ignoreCase],
  );

  const rows = useMemo(() => buildRows(outcome.ops), [outcome.ops]);
  const displayRows = useMemo(() => collapseRows(rows, expanded), [rows, expanded]);
  const visibleRows = displayRows.slice(0, MAX_RENDER_ROWS);
  const hiddenRows = displayRows.length - visibleRows.length;

  const hasInput = left.trim() !== '' || right.trim() !== '';
  const identical = !outcome.tooLarge && outcome.ops.length > 0 && outcome.added === 0 && outcome.removed === 0;
  const leftLines = lineCount(left);
  const rightLines = lineCount(right);
  const totalLineCount = leftLines + rightLines;
  const similarity = totalLineCount > 0 ? Math.round((outcome.same * 2 * 100) / totalLineCount) : 0;

  return (
    <div className="space-y-4">
      <Panel title="文本对比" description="逐行 LCS 对比，左右并排高亮新增、删除与相同行。">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="原始文本" htmlFor="diff-left" hint={`${lineCount(left).toLocaleString('zh-CN')} 行`}>
            <Textarea
              id="diff-left"
              rows={10}
              value={left}
              onChange={(event) => setLeft(event.target.value)}
              placeholder="粘贴或输入原始文本…"
              className="min-h-[220px] font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
          </Field>
          <Field label="对比文本" htmlFor="diff-right" hint={`${lineCount(right).toLocaleString('zh-CN')} 行`}>
            <Textarea
              id="diff-right"
              rows={10}
              value={right}
              onChange={(event) => setRight(event.target.value)}
              placeholder="粘贴或输入要对比的文本…"
              className="min-h-[220px] font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox
              label="忽略空白差异"
              checked={ignoreWhitespace}
              onChange={(event) => setIgnoreWhitespace(event.target.checked)}
            />
            <Checkbox
              label="忽略大小写"
              checked={ignoreCase}
              onChange={(event) => setIgnoreCase(event.target.checked)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={ArrowLeftRight}
              onClick={() => {
                setLeft(right);
                setRight(left);
              }}
            >
              交换
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Sparkles}
              onClick={() => {
                setLeft(SAMPLE_LEFT);
                setRight(SAMPLE_RIGHT);
                setExpanded(false);
              }}
            >
              示例
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => {
                setLeft('');
                setRight('');
                setExpanded(false);
              }}
              disabled={!hasInput}
            >
              清空
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="对比结果"
        description="左侧为原始文本，右侧为对比文本；被折叠的相同行可展开查看。"
        footer={
          hasInput && !outcome.tooLarge ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs subtle">
                原始 {leftLines.toLocaleString('zh-CN')} 行 · 对比 {rightLines.toLocaleString('zh-CN')} 行 · 相似度{' '}
                {similarity}% · 模式：{outcome.mode === 'lcs' ? '逐行 LCS' : '快速行对齐'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={expanded ? ChevronUp : ChevronDown}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? '折叠相同行' : '展开相同行'}
                </Button>
                <CopyButton text={buildReport(outcome)} label="复制差异报告" />
              </div>
            </div>
          ) : undefined
        }
      >
        {outcome.tooLarge ? (
          <Alert tone="error" title="文本过大">
            {outcome.reason}
          </Alert>
        ) : !hasInput ? (
          <EmptyState
            icon={FileDiff}
            title="还没有可对比的文本"
            description="在上方两个输入框中粘贴文本，差异会自动计算并以并排方式高亮显示。"
          />
        ) : identical ? (
          <div className="space-y-3">
            <Alert tone="success" title="两段文本没有差异">
              {ignoreWhitespace || ignoreCase
                ? '按当前忽略选项比较，两段文本内容一致。'
                : '两段文本逐行完全一致。'}
            </Alert>
            <Hint>如需查看逐行内容，可关闭忽略选项或检查是否粘贴了相同文本。</Hint>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {pending ? (
                <span className="inline-flex items-center gap-1.5 text-xs subtle">
                  <Spinner className="size-3.5" /> 正在对比…
                </span>
              ) : null}
              <Badge tone="success">新增 {outcome.added} 行</Badge>
              <Badge tone="danger">删除 {outcome.removed} 行</Badge>
              <Badge>相同 {outcome.same} 行</Badge>
              <Badge tone="brand">变更块 {outcome.hunks}</Badge>
              {outcome.mode === 'fast' ? <Badge tone="warning">快速模式（文本较大）</Badge> : null}
            </div>

            <div className="overflow-hidden rounded-xl border font-mono text-xs">
              <div className="grid grid-cols-2 divide-x border-b bg-[var(--hover-bg)]">
                <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                  <span className="font-medium">原始文本</span>
                  <span className="subtle">{lineCount(left).toLocaleString('zh-CN')} 行</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                  <span className="font-medium">对比文本</span>
                  <span className="subtle">{lineCount(right).toLocaleString('zh-CN')} 行</span>
                </div>
              </div>
              <div className="max-h-[600px] overflow-auto">
                {visibleRows.map((row, index) =>
                  row.kind === 'gap' ? (
                    <div
                      key={`gap-${index}`}
                      className="border-b bg-[var(--hover-bg)]/60 px-3 py-1.5 text-center text-[11px] subtle"
                    >
                      … {row.count.toLocaleString('zh-CN')} 行相同内容 …
                    </div>
                  ) : (
                    <div key={`row-${index}`} className="grid grid-cols-2 divide-x border-b last:border-b-0">
                      <CellView cell={row.left} />
                      <CellView cell={row.right} />
                    </div>
                  ),
                )}
              </div>
            </div>

            {hiddenRows > 0 ? (
              <Alert tone="info" title="仅显示部分差异">
                还有 {hiddenRows.toLocaleString('zh-CN')} 行未渲染，已省略以保证页面流畅。请缩小对比范围后重试。
              </Alert>
            ) : null}

            <Hint>
              采用逐行最长公共子序列（LCS）算法；行内空白或大小写差异可通过上方选项忽略。大文本会自动切换为快速行对齐模式。
            </Hint>
          </div>
        )}
      </Panel>
    </div>
  );
}
