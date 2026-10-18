import { useMemo, useState } from 'react';
import { GraduationCap, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { CopyButton, Field, Input, Panel, Select, ToolSplit } from './kit';
import { Alert, Badge, Button, EmptyState, Modal, StatCard } from '../components/ui';
import { formatNumber, uid } from '../lib/utils';
import { useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

const SCALE_VALUES = ['4.0', '4.3', '100'] as const;
type Scale = (typeof SCALE_VALUES)[number];

const SCALE_META: Record<Scale, { label: string; max: number; unit: string; step: number }> = {
  '4.0': { label: '4.0 制绩点', max: 4, unit: '绩点', step: 0.01 },
  '4.3': { label: '4.3 制绩点', max: 4.3, unit: '绩点', step: 0.01 },
  '100': { label: '百分制成绩', max: 100, unit: '分', step: 0.1 },
};

interface GradeBand {
  min: number;
  point: number;
  letter: string;
}

const BANDS_40: GradeBand[] = [
  { min: 90, point: 4.0, letter: 'A' },
  { min: 85, point: 3.7, letter: 'A-' },
  { min: 82, point: 3.3, letter: 'B+' },
  { min: 78, point: 3.0, letter: 'B' },
  { min: 75, point: 2.7, letter: 'B-' },
  { min: 72, point: 2.3, letter: 'C+' },
  { min: 68, point: 2.0, letter: 'C' },
  { min: 64, point: 1.5, letter: 'C-' },
  { min: 60, point: 1.0, letter: 'D' },
  { min: 0, point: 0, letter: 'F' },
];

const BANDS_43: GradeBand[] = [
  { min: 95, point: 4.3, letter: 'A+' },
  { min: 90, point: 4.0, letter: 'A' },
  { min: 85, point: 3.7, letter: 'A-' },
  { min: 82, point: 3.3, letter: 'B+' },
  { min: 78, point: 3.0, letter: 'B' },
  { min: 75, point: 2.7, letter: 'B-' },
  { min: 72, point: 2.3, letter: 'C+' },
  { min: 68, point: 2.0, letter: 'C' },
  { min: 64, point: 1.5, letter: 'C-' },
  { min: 60, point: 1.0, letter: 'D' },
  { min: 0, point: 0, letter: 'F' },
];

function bandFor(score: number, scale: '4.0' | '4.3'): GradeBand {
  const bands = scale === '4.3' ? BANDS_43 : BANDS_40;
  return bands.find((band) => score >= band.min) ?? bands[bands.length - 1];
}

interface Course {
  id: string;
  name: string;
  credits: string;
  grade: string;
}

const MAX_COURSES = 60;
const STORAGE_ROWS = 'lith:gpa-courses';
const STORAGE_SCALE = 'lith:gpa-scale';

const DEFAULT_ROWS: Course[] = [
  { id: 'seed-1', name: '高等数学', credits: '4', grade: '' },
  { id: 'seed-2', name: '大学英语', credits: '2', grade: '' },
];

const EXAMPLE_COURSES: { name: string; credits: string }[] = [
  { name: '高等数学', credits: '4' },
  { name: '大学英语', credits: '2' },
  { name: '大学物理', credits: '3' },
  { name: '程序设计', credits: '3' },
];

const EXAMPLE_GRADES: Record<Scale, string[]> = {
  '4.0': ['4.0', '3.7', '3.0', '3.8'],
  '4.3': ['4.3', '3.7', '3.0', '3.8'],
  '100': ['92', '85', '78', '88'],
};

function normalizeRows(value: unknown): Course[] {
  if (!Array.isArray(value)) return DEFAULT_ROWS;
  const rows: Course[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    rows.push({
      id: typeof record.id === 'string' && record.id ? record.id : uid('course'),
      name: typeof record.name === 'string' ? record.name : '',
      credits: typeof record.credits === 'string' ? record.credits : String(record.credits ?? ''),
      grade: typeof record.grade === 'string' ? record.grade : String(record.grade ?? ''),
    });
    if (rows.length >= MAX_COURSES) break;
  }
  return rows;
}

interface ComputedRow {
  credits: number | null;
  grade: number | null;
  point: number | null;
  letter: string | null;
  complete: boolean;
  creditsError: string | null;
  gradeError: string | null;
  error: string | null;
}

function formatCredits(value: number): string {
  return formatNumber(Number(value.toFixed(2)));
}

export default function GpaCalculatorTool() {
  const toast = useToast();
  const [storedRows, setStoredRows] = useLocalStorage<Course[]>(STORAGE_ROWS, DEFAULT_ROWS);
  const [storedScale, setStoredScale] = useLocalStorage<Scale>(STORAGE_SCALE, '4.0');
  const [confirmClear, setConfirmClear] = useState(false);

  const rows = useMemo(() => normalizeRows(storedRows), [storedRows]);
  const scale: Scale = (SCALE_VALUES as readonly string[]).includes(storedScale) ? storedScale : '4.0';
  const meta = SCALE_META[scale];
  const gpaScale: '4.0' | '4.3' = scale === '4.3' ? '4.3' : '4.0';

  const computed = useMemo<ComputedRow[]>(
    () =>
      rows.map((row) => {
        const creditsText = row.credits.trim();
        const gradeText = row.grade.trim();
        const credits = creditsText === '' ? null : Number(creditsText);
        const grade = gradeText === '' ? null : Number(gradeText);

        const creditsValid = credits !== null && Number.isFinite(credits) && credits > 0 && credits <= 30;
        const gradeValid = grade !== null && Number.isFinite(grade) && grade >= 0 && grade <= meta.max;

        const creditsError = creditsText !== '' && !creditsValid ? '学分需为 0–30 之间的正数' : null;
        const gradeError = gradeText !== '' && !gradeValid ? `成绩需在 0–${meta.max} 之间` : null;

        const complete = creditsValid && gradeValid;
        const point = complete && grade !== null ? (scale === '100' ? bandFor(grade, gpaScale).point : grade) : null;
        const letter = complete && grade !== null && scale === '100' ? bandFor(grade, gpaScale).letter : null;

        return {
          credits: creditsValid ? credits : null,
          grade: gradeValid ? grade : null,
          point,
          letter,
          complete,
          creditsError,
          gradeError,
          error: creditsError ?? gradeError,
        };
      }),
    [rows, scale, meta.max, gpaScale],
  );

  const summary = useMemo(() => {
    let totalCredits = 0;
    let totalPoints = 0;
    let weightedScore = 0;
    let validCount = 0;
    let incomplete = 0;

    computed.forEach((row) => {
      if (row.complete && row.credits !== null && row.point !== null) {
        validCount += 1;
        totalCredits += row.credits;
        totalPoints += row.credits * row.point;
        if (row.grade !== null) weightedScore += row.credits * row.grade;
      } else if (row.credits !== null || row.grade !== null || row.error) {
        incomplete += 1;
      }
    });

    const gpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
    const averageScore = totalCredits > 0 ? weightedScore / totalCredits : 0;

    const best = computed.reduce<{ name: string; point: number } | null>((current, row, index) => {
      if (!row.complete || row.point === null) return current;
      const name = rows[index]?.name.trim() || `课程 ${index + 1}`;
      if (!current || row.point > current.point) return { name, point: row.point };
      return current;
    }, null);

    return { totalCredits, totalPoints, gpa, averageScore, validCount, incomplete, best };
  }, [computed, rows]);

  const hasRows = rows.length > 0;
  const gpaText = summary.gpa.toFixed(2);
  const headline = scale === '100' ? `${summary.averageScore.toFixed(2)}` : gpaText;
  const headlineLabel = scale === '100' ? '加权平均分（百分制）' : `加权 GPA（${scale} 制）`;

  function updateRow(id: string, patch: Partial<Course>): void {
    setStoredRows((previous) => normalizeRows(previous).map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow(): void {
    setStoredRows((previous) => {
      const list = normalizeRows(previous);
      if (list.length >= MAX_COURSES) return list;
      return [...list, { id: uid('course'), name: '', credits: '', grade: '' }];
    });
  }

  function removeRow(id: string): void {
    setStoredRows((previous) => normalizeRows(previous).filter((row) => row.id !== id));
  }

  function loadExample(): void {
    const grades = EXAMPLE_GRADES[scale];
    setStoredRows(
      EXAMPLE_COURSES.map((course, index) => ({
        id: uid('course'),
        name: course.name,
        credits: course.credits,
        grade: grades[index] ?? '',
      })),
    );
    toast.success(`已载入${meta.label}示例课程`);
  }

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel
          title="课程列表"
          description="填写每门课的学分与成绩，结果实时计算并自动保存到本机。"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={Plus} onClick={addRow} disabled={rows.length >= MAX_COURSES}>
                添加课程
              </Button>
              <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirmClear(true)} disabled={!hasRows}>
                清空全部
              </Button>
              <span className="ml-auto text-xs subtle">
                {rows.length} / {MAX_COURSES} 门
              </span>
            </div>
          }
        >
          <div className="mb-4">
            <Field label="成绩体系" hint="切换体系后请确认已有成绩没有超出新的范围。">
              <Select value={scale} onChange={(event) => setStoredScale(event.target.value as Scale)}>
                {SCALE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {SCALE_META[value].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {!hasRows ? (
            <EmptyState
              icon={GraduationCap}
              title="还没有课程"
              description="添加课程并填写学分与成绩，即可得到加权 GPA 与总学分。"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button icon={Plus} onClick={addRow}>
                    添加课程
                  </Button>
                  <Button variant="secondary" onClick={loadExample}>
                    载入示例
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => {
                const rowData = computed[index];
                return (
                  <div key={row.id} className="rounded-xl border p-3">
                    <div className="grid gap-3 sm:grid-cols-12">
                      <Field label={`课程 ${index + 1}`} className="sm:col-span-4">
                        <Input
                          value={row.name}
                          placeholder="课程名称（可选）"
                          onChange={(event) => updateRow(row.id, { name: event.target.value })}
                        />
                      </Field>
                      <Field
                        label="学分"
                        className="sm:col-span-2"
                        error={rowData?.creditsError ?? null}
                      >
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={30}
                          step={0.5}
                          value={row.credits}
                          placeholder="3"
                          onChange={(event) => updateRow(row.id, { credits: event.target.value })}
                        />
                      </Field>
                      <Field
                        label={`成绩（${meta.unit}）`}
                        className="sm:col-span-3"
                        error={rowData?.gradeError ?? null}
                      >
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={meta.max}
                          step={meta.step}
                          value={row.grade}
                          placeholder={scale === '100' ? '90' : '3.7'}
                          onChange={(event) => updateRow(row.id, { grade: event.target.value })}
                        />
                      </Field>
                      <div className="flex items-end justify-between gap-2 sm:col-span-3">
                        <div className="min-w-0">
                          <p className="text-xs subtle">折算绩点</p>
                          <p className="mt-1 flex items-center gap-1.5 font-mono text-sm font-medium">
                            {rowData?.point !== null && rowData?.point !== undefined ? rowData.point.toFixed(2) : '—'}
                            {rowData?.letter ? <Badge>{rowData.letter}</Badge> : null}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`删除课程 ${index + 1}`}
                          onClick={() => removeRow(row.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={loadExample}>
              载入示例
            </Button>
            <p className="text-xs subtle">数据只保存在当前浏览器，不会上传。</p>
          </div>
        </Panel>

        <Panel title="计算结果" description={scale === '100' ? '百分制成绩按常见标准折算为 4.0 制绩点。' : '按学分加权平均计算。'}>
          {!hasRows ? (
            <EmptyState icon={GraduationCap} title="等待课程数据" description="添加课程后这里会显示 GPA、总学分与统计信息。" />
          ) : summary.validCount === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="还没有有效成绩"
              description="请为至少一门课程填写大于 0 的学分和范围内的成绩。"
            />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard icon={GraduationCap} label={headlineLabel} value={headline} hint={summary.incomplete > 0 ? `有 ${summary.incomplete} 门课程未计入` : '全部课程已计入'} />
                <StatCard label="总学分" value={formatCredits(summary.totalCredits)} hint={`${summary.validCount} 门有效课程`} />
                <StatCard label="学分 × 绩点总和" value={summary.totalPoints.toFixed(2)} hint="用于计算加权平均" />
                <StatCard
                  label={scale === '100' ? '换算 GPA（4.0 制）' : '平均每门学分'}
                  value={
                    scale === '100'
                      ? gpaText
                      : (summary.totalCredits / Math.max(1, summary.validCount)).toFixed(2)
                  }
                  hint={scale === '100' ? '按标准分段换算' : '总学分 ÷ 有效课程数'}
                />
              </div>

              {summary.incomplete > 0 ? (
                <Alert tone="warning" title={`${summary.incomplete} 门课程未计入`}>
                  请检查这些课程的学分是否大于 0、成绩是否在 0–{meta.max} 之间。
                </Alert>
              ) : null}

              <Alert tone="info" title="计算方式">
                加权 GPA = Σ(学分 × 折算绩点) ÷ Σ学分。当前体系：{meta.label}
                {scale === '100' ? '，百分制成绩使用 90/85/82/78/75/72/68/64/60 分段折算为 4.0 制绩点。' : '，直接以输入绩点参与加权。'}
              </Alert>

              {summary.best ? (
                <p className="text-xs subtle">
                  最高单科绩点：{summary.best.point.toFixed(2)}（{summary.best.name}）
                </p>
              ) : null}

              <CopyButton
                text={`${headlineLabel}：${headline}\n总学分：${formatCredits(summary.totalCredits)}\n有效课程：${summary.validCount} 门\n成绩体系：${meta.label}\n学分×绩点之和：${summary.totalPoints.toFixed(2)}`}
                label="复制计算结果"
              />
            </div>
          )}
        </Panel>
      </ToolSplit>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清空全部课程？"
        description="所有课程与成绩会从本机存储中删除，此操作无法撤销。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                setStoredRows([]);
                setConfirmClear(false);
                toast.success('已清空课程列表');
              }}
            >
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm muted">共 {rows.length} 门课程将被删除，成绩体系设置会保留。</p>
      </Modal>
    </div>
  );
}
