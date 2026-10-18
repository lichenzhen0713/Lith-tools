import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Calculator, Percent, RotateCcw, Scale, Swords } from 'lucide-react';
import { Actions, Field, Hint, Input, KeyValue, Panel, Result, Select, ToolSplit } from './kit';
import { Alert, Button, CopyButton, EmptyState, StatCard } from '../components/ui';
import { cn, formatNumber } from '../lib/utils';

type Outcome = 'a' | 'draw' | 'b';

const DEFAULT_K = '32';
const MAX_RATING = 10000;
const MAX_K = 1000;

const OUTCOME_ITEMS: { value: Outcome; label: string }[] = [
  { value: 'a', label: '玩家 A 获胜' },
  { value: 'draw', label: '平局' },
  { value: 'b', label: '玩家 B 获胜' },
];

const OUTCOME_LABEL: Record<Outcome, string> = {
  a: '玩家 A 获胜',
  draw: '平局',
  b: '玩家 B 获胜',
};

const K_PRESETS = [10, 20, 32, 40];

function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function formatRating(value: number): string {
  return value.toFixed(2);
}

function formatDelta(value: number): string {
  if (Math.abs(value) < 0.005) return '0.00';
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function EloCalculatorTool() {
  const [ratingAInput, setRatingAInput] = useState('');
  const [ratingBInput, setRatingBInput] = useState('');
  const [kInput, setKInput] = useState(DEFAULT_K);
  const [outcome, setOutcome] = useState<Outcome>('a');

  const ratingA = parseNumber(ratingAInput);
  const ratingB = parseNumber(ratingBInput);
  const kValue = parseNumber(kInput);

  const ratingAError =
    ratingA === null
      ? ratingAInput.trim() === ''
        ? null
        : '请输入有效数字'
      : ratingA < 0
        ? '等级分不能为负数'
        : ratingA > MAX_RATING
          ? `请输入 0–${MAX_RATING} 之间的等级分`
          : null;

  const ratingBError =
    ratingB === null
      ? ratingBInput.trim() === ''
        ? null
        : '请输入有效数字'
      : ratingB < 0
        ? '等级分不能为负数'
        : ratingB > MAX_RATING
          ? `请输入 0–${MAX_RATING} 之间的等级分`
          : null;

  const kError =
    kValue === null
      ? kInput.trim() === ''
        ? null
        : '请输入有效数字'
      : kValue <= 0
        ? 'K 值必须大于 0'
        : kValue > MAX_K
          ? `K 值请填写 1–${MAX_K} 之间的数值`
          : null;

  const isEmpty = ratingAInput.trim() === '' && ratingBInput.trim() === '';

  const result = useMemo(() => {
    if (ratingA === null || ratingB === null || kValue === null) return null;
    if (ratingAError || ratingBError || kError) return null;

    const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
    const expectedB = 1 - expectedA;
    const scoreA = outcome === 'a' ? 1 : outcome === 'draw' ? 0.5 : 0;
    const scoreB = 1 - scoreA;
    const deltaA = kValue * (scoreA - expectedA);
    const deltaB = kValue * (scoreB - expectedB);
    const newA = ratingA + deltaA;
    const newB = ratingB + deltaB;
    const gapBefore = ratingA - ratingB;
    const gapAfter = newA - newB;

    const summary = [
      'Elo 等级分计算',
      `玩家 A：${formatRating(ratingA)} → ${formatRating(newA)}（${formatDelta(deltaA)}）｜预期胜率 ${formatPercent(expectedA)}`,
      `玩家 B：${formatRating(ratingB)} → ${formatRating(newB)}（${formatDelta(deltaB)}）｜预期胜率 ${formatPercent(expectedB)}`,
      `K 值：${formatNumber(kValue)}｜比赛结果：${OUTCOME_LABEL[outcome]}`,
      `赛前分差：${formatDelta(gapBefore)}｜赛后分差：${formatDelta(gapAfter)}`,
    ].join('\n');

    return {
      expectedA,
      expectedB,
      scoreA,
      scoreB,
      deltaA,
      deltaB,
      newA,
      newB,
      gapBefore,
      gapAfter,
      summary,
    };
  }, [ratingA, ratingB, kValue, outcome, ratingAError, ratingBError, kError]);

  const reset = () => {
    setRatingAInput('');
    setRatingBInput('');
    setKInput(DEFAULT_K);
    setOutcome('a');
  };

  const deltaClass = (value: number) =>
    value > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : value < 0
        ? 'text-rose-600 dark:text-rose-400'
        : 'muted';

  const players = result
    ? [
        {
          key: 'A',
          name: '玩家 A',
          before: ratingA ?? 0,
          expected: result.expectedA,
          score: result.scoreA,
          delta: result.deltaA,
          after: result.newA,
        },
        {
          key: 'B',
          name: '玩家 B',
          before: ratingB ?? 0,
          expected: result.expectedB,
          score: result.scoreB,
          delta: result.deltaB,
          after: result.newB,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Percent}
          label="A 预期胜率"
          value={result ? formatPercent(result.expectedA) : '—'}
          hint="按双方分差计算"
        />
        <StatCard
          icon={Percent}
          label="B 预期胜率"
          value={result ? formatPercent(result.expectedB) : '—'}
          hint="与 A 之和为 100%"
        />
        <StatCard
          icon={Swords}
          label="A 分数变化"
          value={
            result ? (
              <span className={deltaClass(result.deltaA)}>{formatDelta(result.deltaA)}</span>
            ) : (
              '—'
            )
          }
          hint={result ? `K 值 ${formatNumber(kValue ?? 0)}` : '填写等级分后显示'}
        />
        <StatCard
          icon={Scale}
          label="赛后分差"
          value={result ? formatDelta(result.gapAfter) : '—'}
          hint={result ? `赛前 ${formatDelta(result.gapBefore)}` : 'A 分数 - B 分数'}
        />
      </div>

      <ToolSplit>
        <Panel title="对局信息" description="填写双方赛前等级分、K 值与比赛结果，结果会实时计算。">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="玩家 A 等级分"
                htmlFor="elo-rating-a"
                error={ratingAError}
                hint={ratingAError ? undefined : '非负数值，例如 1500'}
                required
              >
                <Input
                  id="elo-rating-a"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_RATING}
                  step={1}
                  placeholder="例如 1500"
                  value={ratingAInput}
                  error={Boolean(ratingAError)}
                  onChange={(event) => setRatingAInput(event.target.value)}
                />
              </Field>
              <Field
                label="玩家 B 等级分"
                htmlFor="elo-rating-b"
                error={ratingBError}
                hint={ratingBError ? undefined : '非负数值，例如 1400'}
                required
              >
                <Input
                  id="elo-rating-b"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_RATING}
                  step={1}
                  placeholder="例如 1400"
                  value={ratingBInput}
                  error={Boolean(ratingBError)}
                  onChange={(event) => setRatingBInput(event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="K 值"
              htmlFor="elo-k"
              error={kError}
              hint={kError ? undefined : '必须大于 0：K 越大，单局分数波动越剧烈'}
              required
            >
              <Input
                id="elo-k"
                type="number"
                inputMode="decimal"
                min={0}
                max={MAX_K}
                step={1}
                placeholder="例如 32"
                value={kInput}
                error={Boolean(kError)}
                onChange={(event) => setKInput(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs subtle">常用 K 值：</span>
              {K_PRESETS.map((preset) => {
                const active = kValue === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={cn('chip', active && 'chip-active')}
                    onClick={() => setKInput(String(preset))}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            <Field label="比赛结果" htmlFor="elo-outcome" hint="以玩家 A 的视角选择结果">
              <Select
                id="elo-outcome"
                value={outcome}
                onChange={(event) => {
                  const next = event.target.value;
                  setOutcome(next === 'draw' ? 'draw' : next === 'b' ? 'b' : 'a');
                }}
              >
                {OUTCOME_ITEMS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>

            {ratingAError || ratingBError || kError ? (
              <Alert tone="error" title="请检查输入">
                等级分需为 0–{MAX_RATING} 之间的非负数值，K 值需为大于 0 且不超过 {MAX_K} 的数值。
              </Alert>
            ) : null}

            <Actions className="mt-0">
              {result ? <CopyButton text={result.summary} label="复制结果" /> : null}
              <Button type="button" variant="secondary" icon={RotateCcw} onClick={reset}>
                重置
              </Button>
            </Actions>
          </div>
        </Panel>

        <Panel title="计算结果" description="预期胜率、双方新等级分与分数变化。">
          {result ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border">
                <table className="table min-w-[520px]">
                  <thead>
                    <tr>
                      <th>玩家</th>
                      <th className="text-right">赛前</th>
                      <th className="text-right">预期胜率</th>
                      <th className="text-right">实得</th>
                      <th className="text-right">变化</th>
                      <th className="text-right">赛后</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player) => (
                      <tr key={player.key}>
                        <td className="whitespace-nowrap font-medium">{player.name}</td>
                        <td className="text-right font-mono whitespace-nowrap">{formatRating(player.before)}</td>
                        <td className="text-right whitespace-nowrap">{formatPercent(player.expected)}</td>
                        <td className="text-right whitespace-nowrap">{player.score.toFixed(1)}</td>
                        <td
                          className={cn(
                            'text-right font-mono whitespace-nowrap',
                            deltaClass(player.delta),
                          )}
                        >
                          <span className="inline-flex items-center justify-end gap-1">
                            {player.delta > 0 ? (
                              <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            ) : player.delta < 0 ? (
                              <ArrowDownRight className="size-3.5" aria-hidden="true" />
                            ) : null}
                            {formatDelta(player.delta)}
                          </span>
                        </td>
                        <td className="text-right font-mono font-semibold whitespace-nowrap">
                          {formatRating(player.after)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Result
                  label="玩家 A 新等级分"
                  value={formatRating(result.newA)}
                  hint={`${formatRating(ratingA ?? 0)} → ${formatRating(result.newA)}`}
                />
                <Result
                  label="玩家 B 新等级分"
                  value={formatRating(result.newB)}
                  hint={`${formatRating(ratingB ?? 0)} → ${formatRating(result.newB)}`}
                />
              </div>

              <KeyValue
                items={[
                  { label: '比赛结果', value: OUTCOME_LABEL[outcome] },
                  { label: 'K 值', value: formatNumber(kValue ?? 0) },
                  {
                    label: '分数变化合计',
                    value: (
                      <span className={cn('font-mono', deltaClass(result.deltaA + result.deltaB))}>
                        {formatDelta(result.deltaA + result.deltaB)}
                      </span>
                    ),
                  },
                  {
                    label: '分差（A − B）',
                    value: `${formatDelta(result.gapBefore)} → ${formatDelta(result.gapAfter)}`,
                  },
                ]}
              />

              <Alert tone="info">
                若按整数等级分记录，双方新分四舍五入后分别为{' '}
                <strong>{Math.round(result.newA)}</strong> 与 <strong>{Math.round(result.newB)}</strong>
                （{formatDelta(Math.round(result.newA) - (ratingA ?? 0))} /{' '}
                {formatDelta(Math.round(result.newB) - (ratingB ?? 0))}）。
              </Alert>
            </div>
          ) : ratingAError || ratingBError || kError ? (
            <EmptyState
              icon={Calculator}
              title="输入有误"
              description="等级分需为非负数，K 值需大于 0，修正后结果会自动更新。"
            />
          ) : isEmpty ? (
            <EmptyState
              icon={Calculator}
              title="还没有输入等级分"
              description="填写双方赛前等级分（例如 1500 与 1400），选择 K 值和比赛结果，即可得到预期胜率与新分数。"
            />
          ) : (
            <EmptyState
              icon={Calculator}
              title="还差几项数据"
              description="请补全双方等级分与 K 值，结果会自动更新。"
            />
          )}
        </Panel>
      </ToolSplit>

      <Panel title="计算公式" description="Elo 等级分系统的核心公式，适用于国际象棋、围棋、电竞等对局。">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-xl border bg-[var(--hover-bg)] p-4 font-mono text-sm leading-relaxed">
              <p>E_A = 1 / (1 + 10^((R_B − R_A) / 400))</p>
              <p className="mt-2">E_B = 1 − E_A</p>
              <p className="mt-2">R&apos;_A = R_A + K × (S_A − E_A)</p>
              <p className="mt-2">R&apos;_B = R_B + K × (S_B − E_B)</p>
            </div>
            <Hint>
              R 为赛前等级分，E 为预期得分（即胜率，0–1），S 为实际得分：胜 1、平 0.5、负 0，K 为每局最大波动系数。
              因为 S_A + S_B = 1 且 E_A + E_B = 1，双方分数变化之和恒为 0，总分保持不变。
            </Hint>
          </div>
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-medium">怎么理解 K 值</p>
            <p className="muted">
              K 值决定单局最多能变动多少分。国际棋联（FIDE）常用 10 / 20 / 40：顶级棋手用 10，普通棋手用 20，
              新入级或青少年棋手用 40 以便快速收敛到真实水平。K 值越大，分数对单局结果越敏感。
            </p>
            <p className="mt-3 font-medium">分差与胜率</p>
            <p className="muted">
              分差 400 分时，高分方预期胜率约 91%；分差 200 分时约 76%；分差 0 分时双方各 50%。
              因此爆冷赢下高分对手会获得更多分数，输给低分对手则损失更多。
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
