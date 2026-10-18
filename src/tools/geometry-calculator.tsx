import { useMemo, useState } from 'react';
import { Box, Circle, Ruler, Shapes } from 'lucide-react';
import { Alert, Badge, Button, CopyButton, EmptyState, Field, Input, Select } from '../components/ui';
import { Actions, Hint, Panel, ToolSplit } from './kit';

type UnitKind = 'length' | 'area' | 'volume';

interface ShapeField {
  key: string;
  label: string;
  placeholder?: string;
  optional?: boolean;
}

interface ShapeOutput {
  label: string;
  formula: string;
  value: number;
  kind: UnitKind;
}

interface ShapeDefinition {
  id: string;
  name: string;
  group: '平面图形' | '立体图形';
  fields: ShapeField[];
  formulas: string[];
  compute: (values: Record<string, number | undefined>) => ShapeOutput[];
}

function req(values: Record<string, number | undefined>, key: string): number {
  const value = values[key];
  if (value === undefined) throw new Error('缺少必要的尺寸参数');
  return value;
}

const SHAPES: ShapeDefinition[] = [
  {
    id: 'circle',
    name: '圆',
    group: '平面图形',
    fields: [{ key: 'r', label: '半径 r', placeholder: '例如 5' }],
    formulas: ['d = 2r', 'C = 2πr', 'S = πr²'],
    compute: (values) => {
      const r = req(values, 'r');
      return [
        { label: '直径', formula: 'd = 2r', value: 2 * r, kind: 'length' },
        { label: '周长', formula: 'C = 2πr', value: 2 * Math.PI * r, kind: 'length' },
        { label: '面积', formula: 'S = πr²', value: Math.PI * r * r, kind: 'area' },
      ];
    },
  },
  {
    id: 'rectangle',
    name: '矩形',
    group: '平面图形',
    fields: [
      { key: 'a', label: '长 a', placeholder: '例如 6' },
      { key: 'b', label: '宽 b', placeholder: '例如 4' },
    ],
    formulas: ['C = 2(a + b)', 'S = a × b', 'd = √(a² + b²)'],
    compute: (values) => {
      const a = req(values, 'a');
      const b = req(values, 'b');
      return [
        { label: '周长', formula: 'C = 2(a + b)', value: 2 * (a + b), kind: 'length' },
        { label: '面积', formula: 'S = a × b', value: a * b, kind: 'area' },
        { label: '对角线', formula: 'd = √(a² + b²)', value: Math.hypot(a, b), kind: 'length' },
      ];
    },
  },
  {
    id: 'triangle-sss',
    name: '三角形（三边）',
    group: '平面图形',
    fields: [
      { key: 'a', label: '边 a', placeholder: '例如 3' },
      { key: 'b', label: '边 b', placeholder: '例如 4' },
      { key: 'c', label: '边 c', placeholder: '例如 5' },
    ],
    formulas: ['p = (a + b + c) ÷ 2', 'C = a + b + c', 'S = √(p(p−a)(p−b)(p−c))（海伦公式）'],
    compute: (values) => {
      const a = req(values, 'a');
      const b = req(values, 'b');
      const c = req(values, 'c');
      if (a + b <= c || a + c <= b || b + c <= a) {
        throw new Error('这三条边无法构成三角形：任意两边之和必须大于第三边');
      }
      const perimeter = a + b + c;
      const p = perimeter / 2;
      return [
        { label: '周长', formula: 'C = a + b + c', value: perimeter, kind: 'length' },
        { label: '面积', formula: 'S = √(p(p−a)(p−b)(p−c))', value: Math.sqrt(p * (p - a) * (p - b) * (p - c)), kind: 'area' },
        { label: '半周长', formula: 'p = (a + b + c) ÷ 2', value: p, kind: 'length' },
      ];
    },
  },
  {
    id: 'triangle-bh',
    name: '三角形（底 × 高）',
    group: '平面图形',
    fields: [
      { key: 'b', label: '底边 b', placeholder: '例如 8' },
      { key: 'h', label: '高 h', placeholder: '例如 5' },
    ],
    formulas: ['S = b × h ÷ 2', '周长需已知三边，请改用「三角形（三边）」'],
    compute: (values) => {
      const b = req(values, 'b');
      const h = req(values, 'h');
      return [{ label: '面积', formula: 'S = b × h ÷ 2', value: (b * h) / 2, kind: 'area' }];
    },
  },
  {
    id: 'trapezoid',
    name: '梯形',
    group: '平面图形',
    fields: [
      { key: 'a', label: '上底 a', placeholder: '例如 4' },
      { key: 'b', label: '下底 b', placeholder: '例如 8' },
      { key: 'h', label: '高 h', placeholder: '例如 3' },
      { key: 'c', label: '左腰 c', placeholder: '可选', optional: true },
      { key: 'd', label: '右腰 d', placeholder: '可选', optional: true },
    ],
    formulas: ['m = (a + b) ÷ 2（中位线）', 'S = (a + b) × h ÷ 2', 'C = a + b + c + d（已知两腰时）'],
    compute: (values) => {
      const a = req(values, 'a');
      const b = req(values, 'b');
      const h = req(values, 'h');
      const c = values.c;
      const d = values.d;
      const outputs: ShapeOutput[] = [
        { label: '面积', formula: 'S = (a + b) × h ÷ 2', value: ((a + b) * h) / 2, kind: 'area' },
        { label: '中位线', formula: 'm = (a + b) ÷ 2', value: (a + b) / 2, kind: 'length' },
      ];
      if (c !== undefined && d !== undefined) {
        outputs.push({ label: '周长', formula: 'C = a + b + c + d', value: a + b + c + d, kind: 'length' });
      }
      return outputs;
    },
  },
  {
    id: 'parallelogram',
    name: '平行四边形',
    group: '平面图形',
    fields: [
      { key: 'a', label: '底边 a', placeholder: '例如 6' },
      { key: 'h', label: '高 h', placeholder: '例如 4' },
      { key: 'b', label: '邻边 b', placeholder: '可选', optional: true },
    ],
    formulas: ['S = a × h', 'C = 2(a + b)（已知邻边时）'],
    compute: (values) => {
      const a = req(values, 'a');
      const h = req(values, 'h');
      const b = values.b;
      const outputs: ShapeOutput[] = [{ label: '面积', formula: 'S = a × h', value: a * h, kind: 'area' }];
      if (b !== undefined) {
        outputs.push({ label: '周长', formula: 'C = 2(a + b)', value: 2 * (a + b), kind: 'length' });
      }
      return outputs;
    },
  },
  {
    id: 'cube',
    name: '立方体',
    group: '立体图形',
    fields: [{ key: 'a', label: '棱长 a', placeholder: '例如 3' }],
    formulas: ['L = 12a（棱长总和）', 'S = 6a²（表面积）', 'V = a³（体积）'],
    compute: (values) => {
      const a = req(values, 'a');
      return [
        { label: '表面积', formula: 'S = 6a²', value: 6 * a * a, kind: 'area' },
        { label: '体积', formula: 'V = a³', value: a * a * a, kind: 'volume' },
        { label: '棱长总和', formula: 'L = 12a', value: 12 * a, kind: 'length' },
      ];
    },
  },
  {
    id: 'cuboid',
    name: '长方体',
    group: '立体图形',
    fields: [
      { key: 'a', label: '长 a', placeholder: '例如 5' },
      { key: 'b', label: '宽 b', placeholder: '例如 4' },
      { key: 'c', label: '高 c', placeholder: '例如 3' },
    ],
    formulas: ['L = 4(a + b + c)', 'S = 2(ab + bc + ca)', 'V = a × b × c', 'd = √(a² + b² + c²)'],
    compute: (values) => {
      const a = req(values, 'a');
      const b = req(values, 'b');
      const c = req(values, 'c');
      return [
        { label: '表面积', formula: 'S = 2(ab + bc + ca)', value: 2 * (a * b + b * c + c * a), kind: 'area' },
        { label: '体积', formula: 'V = a × b × c', value: a * b * c, kind: 'volume' },
        { label: '棱长总和', formula: 'L = 4(a + b + c)', value: 4 * (a + b + c), kind: 'length' },
        { label: '体对角线', formula: 'd = √(a² + b² + c²)', value: Math.sqrt(a * a + b * b + c * c), kind: 'length' },
      ];
    },
  },
  {
    id: 'cylinder',
    name: '圆柱',
    group: '立体图形',
    fields: [
      { key: 'r', label: '底面半径 r', placeholder: '例如 3' },
      { key: 'h', label: '高 h', placeholder: '例如 10' },
    ],
    formulas: ['S底 = πr²', 'S侧 = 2πrh', 'S = 2πr² + 2πrh', 'V = πr²h'],
    compute: (values) => {
      const r = req(values, 'r');
      const h = req(values, 'h');
      const base = Math.PI * r * r;
      return [
        { label: '底面积', formula: 'S底 = πr²', value: base, kind: 'area' },
        { label: '侧面积', formula: 'S侧 = 2πrh', value: 2 * Math.PI * r * h, kind: 'area' },
        { label: '表面积', formula: 'S = 2πr² + 2πrh', value: 2 * base + 2 * Math.PI * r * h, kind: 'area' },
        { label: '体积', formula: 'V = πr²h', value: base * h, kind: 'volume' },
      ];
    },
  },
  {
    id: 'cone',
    name: '圆锥',
    group: '立体图形',
    fields: [
      { key: 'r', label: '底面半径 r', placeholder: '例如 3' },
      { key: 'h', label: '高 h', placeholder: '例如 4' },
    ],
    formulas: ['l = √(r² + h²)（母线）', 'S侧 = πrl', 'S = πr² + πrl', 'V = πr²h ÷ 3'],
    compute: (values) => {
      const r = req(values, 'r');
      const h = req(values, 'h');
      const slant = Math.hypot(r, h);
      const base = Math.PI * r * r;
      return [
        { label: '母线', formula: 'l = √(r² + h²)', value: slant, kind: 'length' },
        { label: '侧面积', formula: 'S侧 = πrl', value: Math.PI * r * slant, kind: 'area' },
        { label: '表面积', formula: 'S = πr² + πrl', value: base + Math.PI * r * slant, kind: 'area' },
        { label: '体积', formula: 'V = πr²h ÷ 3', value: (base * h) / 3, kind: 'volume' },
      ];
    },
  },
  {
    id: 'sphere',
    name: '球',
    group: '立体图形',
    fields: [{ key: 'r', label: '半径 r', placeholder: '例如 3' }],
    formulas: ['d = 2r', 'S = 4πr²（表面积）', 'V = 4πr³ ÷ 3（体积）'],
    compute: (values) => {
      const r = req(values, 'r');
      return [
        { label: '直径', formula: 'd = 2r', value: 2 * r, kind: 'length' },
        { label: '表面积', formula: 'S = 4πr²', value: 4 * Math.PI * r * r, kind: 'area' },
        { label: '体积', formula: 'V = 4πr³ ÷ 3', value: (4 / 3) * Math.PI * r * r * r, kind: 'volume' },
      ];
    },
  },
];

const UNIT_OPTIONS = [
  { value: 'mm', label: '毫米（mm）' },
  { value: 'cm', label: '厘米（cm）' },
  { value: 'm', label: '米（m）' },
  { value: 'km', label: '千米（km）' },
  { value: 'in', label: '英寸（in）' },
  { value: 'ft', label: '英尺（ft）' },
];

const MEASURE = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

function measure(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return MEASURE.format(Number(value.toFixed(4)));
}

function unitSuffix(unit: string, kind: UnitKind): string {
  if (kind === 'area') return `${unit}²`;
  if (kind === 'volume') return `${unit}³`;
  return unit;
}

type Analysis =
  | { status: 'empty' }
  | { status: 'incomplete'; missing: string[] }
  | { status: 'invalid'; fieldErrors: Record<string, string>; message?: string }
  | { status: 'ok'; outputs: ShapeOutput[] };

export default function GeometryCalculatorTool() {
  const [shapeId, setShapeId] = useState('circle');
  const [unit, setUnit] = useState('cm');
  const [values, setValues] = useState<Record<string, string | undefined>>({});

  const shape = useMemo(() => SHAPES.find((item) => item.id === shapeId) ?? SHAPES[0], [shapeId]);

  const analysis = useMemo<Analysis>(() => {
    const filled = shape.fields.filter((field) => (values[field.key] ?? '').trim() !== '');
    if (filled.length === 0) return { status: 'empty' };

    const missing = shape.fields
      .filter((field) => !field.optional && (values[field.key] ?? '').trim() === '')
      .map((field) => field.label);
    if (missing.length > 0) return { status: 'incomplete', missing };

    const fieldErrors: Record<string, string> = {};
    const parsed: Record<string, number | undefined> = {};

    for (const field of shape.fields) {
      const raw = (values[field.key] ?? '').trim();
      if (!raw) continue;
      const number = Number(raw);
      if (!Number.isFinite(number)) fieldErrors[field.key] = '请输入有效数字';
      else if (number <= 0) fieldErrors[field.key] = '必须大于 0';
      else parsed[field.key] = number;
    }

    if (Object.keys(fieldErrors).length > 0) return { status: 'invalid', fieldErrors };

    try {
      return { status: 'ok', outputs: shape.compute(parsed) };
    } catch (caught) {
      return { status: 'invalid', fieldErrors: {}, message: caught instanceof Error ? caught.message : '无法计算' };
    }
  }, [shape, values]);

  function changeShape(nextId: string) {
    setShapeId(nextId);
    setValues({});
  }

  function updateValue(key: string, value: string) {
    setValues((previous) => {
      const next: Record<string, string | undefined> = { ...previous };
      next[key] = value;
      return next;
    });
  }

  const unitLabel = UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? unit;

  const report =
    analysis.status === 'ok'
      ? [
          `${shape.name}（${shape.group}）`,
          ...shape.fields.map((field) => `${field.label}：${values[field.key] ?? ''}`),
          ...analysis.outputs.map((output) => `${output.label}：${measure(output.value)} ${unitSuffix(unit, output.kind)}`),
        ].join('\n')
      : '';

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="选择图形与尺寸" description="填写尺寸后立即计算，无需点击按钮">
          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="图形" htmlFor="geo-shape">
                <Select id="geo-shape" value={shapeId} onChange={(event) => changeShape(event.target.value)}>
                  <optgroup label="平面图形">
                    {SHAPES.filter((item) => item.group === '平面图形').map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="立体图形">
                    {SHAPES.filter((item) => item.group === '立体图形').map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>

              <Field label="长度单位" htmlFor="geo-unit" hint="面积与体积会自动换算为单位²、单位³">
                <Select id="geo-unit" value={unit} onChange={(event) => setUnit(event.target.value)}>
                  {UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {shape.fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  htmlFor={`geo-${shape.id}-${field.key}`}
                  required={!field.optional}
                  hint={field.optional ? '选填，填写后可计算周长' : undefined}
                  error={analysis.status === 'invalid' ? (analysis.fieldErrors[field.key] ?? null) : null}
                >
                  <Input
                    id={`geo-${shape.id}-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    error={analysis.status === 'invalid' && Boolean(analysis.fieldErrors[field.key])}
                  />
                </Field>
              ))}
            </div>

            <Actions className="mt-0">
              <Button variant="secondary" onClick={() => setValues({})}>
                清空尺寸
              </Button>
            </Actions>
          </form>

          <Hint>
            所有尺寸都使用同一单位（示例：单位选「厘米」时，半径 5 表示 5 厘米）。π 取 3.141592653589793，结果保留 4 位小数。
          </Hint>
        </Panel>

        <div className="space-y-4">
          <Panel title="计算结果">
            {analysis.status === 'empty' ? (
              <EmptyState
                icon={Shapes}
                title="选择图形并填写尺寸"
                description="支持圆、矩形、三角形、梯形、平行四边形，以及立方体、长方体、圆柱、圆锥、球。"
                className="py-10"
              />
            ) : analysis.status === 'incomplete' ? (
              <Alert tone="info" title="还有尺寸没有填写">
                请补充：{analysis.missing.join('、')}
              </Alert>
            ) : analysis.status === 'invalid' ? (
              <Alert tone="error" title="无法计算">
                {analysis.message ?? '请检查填写的尺寸，必须为大于 0 的数字。'}
              </Alert>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">
                    {shape.group === '平面图形' ? <Circle className="size-3" /> : <Box className="size-3" />}
                    {shape.name}
                  </Badge>
                  <Badge>{shape.group}</Badge>
                  <span className="text-xs subtle">单位：{unitLabel}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {analysis.outputs.map((output) => (
                    <div key={output.label} className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                      <p className="text-xs subtle">{output.label}</p>
                      <p className="mt-1 text-xl font-semibold">
                        {measure(output.value)} <span className="text-xs font-normal muted">{unitSuffix(unit, output.kind)}</span>
                      </p>
                      <p className="mt-1 font-mono text-[11px] subtle">{output.formula}</p>
                    </div>
                  ))}
                </div>

                <Actions className="mt-0">
                  <CopyButton text={report} label="复制结果" />
                </Actions>
              </div>
            )}
          </Panel>

          <Panel title="公式提示" description={shape.name}>
            <ul className="space-y-1.5 font-mono text-xs muted">
              {shape.formulas.map((formula) => (
                <li key={formula} className="flex items-start gap-2">
                  <Ruler className="mt-0.5 size-3.5 shrink-0" />
                  <span>{formula}</span>
                </li>
              ))}
            </ul>
            {shape.fields.some((field) => field.optional) ? (
              <Hint>带「可选」的尺寸留空时，只计算能确定的结果（例如梯形缺少两腰时无法计算周长）。</Hint>
            ) : null}
          </Panel>
        </div>
      </ToolSplit>

      <Panel title="常见图形公式速查" description="所有支持计算的图形与对应公式">
        <div className="overflow-x-auto">
          <table className="table min-w-[520px]">
            <thead>
              <tr>
                <th>图形</th>
                <th>类型</th>
                <th>公式</th>
              </tr>
            </thead>
            <tbody>
              {SHAPES.map((item) => (
                <tr key={item.id} className={item.id === shape.id ? 'bg-[var(--hover-bg)]' : undefined}>
                  <td className="whitespace-nowrap font-medium">{item.name}</td>
                  <td className="whitespace-nowrap">
                    <Badge>{item.group}</Badge>
                  </td>
                  <td className="font-mono text-xs">{item.formulas.join('；')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint>选择图形后填写尺寸即可实时看到结果；切换长度单位只改变结果的单位标注，不影响数值计算。</Hint>
      </Panel>
    </div>
  );
}
