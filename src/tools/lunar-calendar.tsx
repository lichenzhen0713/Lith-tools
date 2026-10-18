import { useMemo, useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { Field, Hint, Input, KeyValue, Panel, Result, Select, ToolSplit } from './kit';
import { Alert, Button, EmptyState, Tabs } from '../components/ui';

/* ------------------------------------------------------------------ 数据表 */

/**
 * 1900–2100 年农历数据。每年用 17 位二进制表示：
 * 低 4 位为闰月月份（0 表示无闰月），0x10000 位表示闰月为大月（30 天），
 * 其余 12 位从高到低依次表示 1–12 月的月大小（1 = 30 天，0 = 29 天）。
 * 数据不依赖任何 CDN 或第三方库。
 */
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
];

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const LUNAR_YEAR_MIN = 1900;
const LUNAR_YEAR_MAX = 2100;
const DAY_MS = 86_400_000;
/** 1900-01-31 是农历 1900 年正月初一。 */
const BASE_DAY = Math.floor(Date.UTC(1900, 0, 31) / DAY_MS);
const MIN_SOLAR_DAY = BASE_DAY;
const MAX_SOLAR_DAY = Math.floor(Date.UTC(2100, 11, 31) / DAY_MS);

/* ---------------------------------------------------------------- 工具函数 */

interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
}

function lunarInfo(year: number): number {
  return LUNAR_INFO[year - LUNAR_YEAR_MIN] ?? 0;
}

function leapMonth(year: number): number {
  return lunarInfo(year) & 0xf;
}

function leapDays(year: number): number {
  if (!leapMonth(year)) return 0;
  return lunarInfo(year) & 0x10000 ? 30 : 29;
}

function monthDays(year: number, month: number): number {
  return lunarInfo(year) & (0x10000 >> month) ? 30 : 29;
}

function lunarYearDays(year: number): number {
  let sum = 348;
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    if (lunarInfo(year) & bit) sum += 1;
  }
  return sum + leapDays(year);
}

function solarToLunar(day: number): LunarDate | null {
  if (day < MIN_SOLAR_DAY) return null;
  let offset = day - MIN_SOLAR_DAY;
  let year = LUNAR_YEAR_MIN;
  let yearLength = lunarYearDays(year);
  while (offset >= yearLength) {
    offset -= yearLength;
    year += 1;
    if (year > LUNAR_YEAR_MAX) return null;
    yearLength = lunarYearDays(year);
  }
  const leap = leapMonth(year);
  let month = 1;
  let isLeap = false;
  for (let guard = 0; guard < 24; guard += 1) {
    const length = isLeap ? leapDays(year) : monthDays(year, month);
    if (offset < length) {
      return { year, month, day: offset + 1, isLeap };
    }
    offset -= length;
    if (isLeap) {
      isLeap = false;
      month += 1;
    } else if (leap === month) {
      isLeap = true;
    } else {
      month += 1;
    }
    if (month > 12) return null;
  }
  return null;
}

function lunarToSolar(year: number, month: number, day: number, isLeap: boolean): number | null {
  if (year < LUNAR_YEAR_MIN || year > LUNAR_YEAR_MAX) return null;
  if (month < 1 || month > 12) return null;
  const leap = leapMonth(year);
  if (isLeap && leap !== month) return null;
  let offset = 0;
  for (let y = LUNAR_YEAR_MIN; y < year; y += 1) offset += lunarYearDays(y);
  for (let m = 1; m < month; m += 1) {
    offset += monthDays(year, m);
    if (leap === m) offset += leapDays(year);
  }
  if (isLeap) offset += monthDays(year, month);
  const length = isLeap ? leapDays(year) : monthDays(year, month);
  if (day < 1 || day > length) return null;
  return MIN_SOLAR_DAY + offset + day - 1;
}

function dayToUtcDate(day: number): Date {
  return new Date(day * DAY_MS);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatSolar(day: number): string {
  const date = dayToUtcDate(day);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function weekdayOf(day: number): string {
  return WEEKDAYS[(((day % 7) + 7 + 4) % 7)];
}

function todayDayNumber(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
}

function isoToDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return Math.floor(utc / DAY_MS);
}

function formatLunar(lunar: LunarDate): string {
  return `${lunar.year}年${lunar.isLeap ? '闰' : ''}${MONTH_NAMES[lunar.month - 1]}月${DAY_NAMES[lunar.day - 1]}`;
}

function ganzhiYear(year: number): string {
  const index = (((year - 4) % 60) + 60) % 60;
  return `${STEMS[index % 10]}${BRANCHES[index % 12]}`;
}

function zodiacOf(year: number): string {
  return ZODIAC[(((year - 4) % 12) + 12) % 12];
}

/* ------------------------------------------------------ 节气（近似计算） */

const SOLAR_TERMS = [
  '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露',
  '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰',
];

interface SolarTerm {
  name: string;
  day: number;
  ms: number;
}

/** 太阳视黄经近似值（度），误差约 0.01°，足以满足「节气近似」的需求。 */
function sunLongitude(ms: number): number {
  const jd = ms / DAY_MS + 2440587.5;
  const n = jd - 2451545.0;
  const meanLongitude = 280.46 + 0.9856474 * n;
  const meanAnomaly = ((357.528 + 0.9856003 * n) * Math.PI) / 180;
  const longitude = meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly);
  return ((longitude % 360) + 360) % 360;
}

function localNoonMs(day: number): number {
  const date = dayToUtcDate(day);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0).getTime();
}

function localDayNumberOf(ms: number): number {
  const date = new Date(ms);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function solarTermsNear(day: number): { prev: SolarTerm | null; next: SolarTerm | null } {
  const windowStart = day - 20;
  const endOfDay = localNoonMs(day) + 12 * 3_600_000;
  let previousAngle = sunLongitude(localNoonMs(windowStart));
  let prev: SolarTerm | null = null;
  let next: SolarTerm | null = null;

  for (let current = windowStart + 1; current <= day + 20; current += 1) {
    const currentMs = localNoonMs(current);
    const currentAngle = sunLongitude(currentMs);
    let delta = currentAngle - previousAngle;
    if (delta < 0) delta += 360;
    if (delta > 0) {
      const previousMs = localNoonMs(current - 1);
      const firstBoundary = Math.floor(previousAngle / 15) + 1;
      const lastBoundary = Math.floor((previousAngle + delta) / 15);
      for (let boundary = firstBoundary; boundary <= lastBoundary; boundary += 1) {
        const angle = boundary * 15;
        const fraction = clamp01((angle - previousAngle) / delta);
        const crossMs = previousMs + fraction * (currentMs - previousMs);
        const termIndex = Math.round((((angle % 360) + 360) % 360) / 15) % 24;
        const term: SolarTerm = {
          name: SOLAR_TERMS[termIndex],
          day: localDayNumberOf(crossMs),
          ms: crossMs,
        };
        if (crossMs <= endOfDay) {
          if (!prev || crossMs > prev.ms) prev = term;
        } else if (!next || crossMs < next.ms) {
          next = term;
        }
      }
    }
    previousAngle = currentAngle;
  }
  return { prev, next };
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function describeTerm(term: SolarTerm | null, referenceDay: number): string {
  if (!term) return '—';
  const diff = term.day - referenceDay;
  const relative = diff === 0 ? '今天' : diff > 0 ? `${diff} 天后` : `${Math.abs(diff)} 天前`;
  return `${term.name} ${formatSolar(term.day)}（${relative}）`;
}

/* -------------------------------------------------------------------- 组件 */

type Mode = 'solar' | 'lunar';

interface MonthOption {
  key: string;
  label: string;
  month: number;
  isLeap: boolean;
}

export default function LunarCalendarTool() {
  const todayDay = useMemo(() => todayDayNumber(), []);
  const todayIso = useMemo(() => formatSolar(todayDay), [todayDay]);
  const todayLunar = useMemo(() => solarToLunar(todayDay), [todayDay]);

  const [mode, setMode] = useState<Mode>('solar');
  const [solarInput, setSolarInput] = useState(todayIso);
  const [lunarYear, setLunarYear] = useState(todayLunar?.year ?? 2024);
  const [lunarMonthKey, setLunarMonthKey] = useState(
    `${todayLunar?.month ?? 1}-${todayLunar?.isLeap ? 1 : 0}`,
  );
  const [lunarDay, setLunarDay] = useState(todayLunar?.day ?? 1);

  const monthOptions = useMemo<MonthOption[]>(() => {
    const options: MonthOption[] = [];
    const leap = leapMonth(lunarYear);
    for (let month = 1; month <= 12; month += 1) {
      options.push({ key: `${month}-0`, label: `${MONTH_NAMES[month - 1]}月`, month, isLeap: false });
      if (leap === month) {
        options.push({ key: `${month}-1`, label: `闰${MONTH_NAMES[month - 1]}月`, month, isLeap: true });
      }
    }
    return options;
  }, [lunarYear]);

  const selectedMonth = monthOptions.find((option) => option.key === lunarMonthKey) ?? monthOptions[0];
  const monthLength = selectedMonth.isLeap
    ? leapDays(lunarYear)
    : monthDays(lunarYear, selectedMonth.month);
  const safeDay = Math.min(Math.max(lunarDay, 1), monthLength);

  const solarDayFromInput = isoToDay(solarInput);
  const solarOutOfRange =
    solarDayFromInput !== null && (solarDayFromInput < MIN_SOLAR_DAY || solarDayFromInput > MAX_SOLAR_DAY);
  const solarDay =
    mode === 'solar'
      ? solarDayFromInput !== null && !solarOutOfRange
        ? solarDayFromInput
        : null
      : lunarToSolar(lunarYear, selectedMonth.month, safeDay, selectedMonth.isLeap);

  const lunarResult = solarDay !== null ? solarToLunar(solarDay) : null;
  const terms = useMemo(() => (solarDay !== null ? solarTermsNear(solarDay) : null), [solarDay]);

  const lunarYearDaysValue = lunarResult ? lunarYearDays(lunarResult.year) : null;
  const springFestivalDay = lunarResult ? lunarToSolar(lunarResult.year, 1, 1, false) : null;
  const leapMonthValue = lunarResult ? leapMonth(lunarResult.year) : 0;

  const inputError =
    mode === 'solar'
      ? solarInput.trim() === ''
        ? null
        : solarDayFromInput === null
          ? '日期格式无效，请使用 YYYY-MM-DD 格式'
          : solarOutOfRange
            ? '仅支持 1900-01-31 至 2100-12-31 之间的公历日期'
            : null
      : solarDay === null
        ? '该农历日期不存在，或超出 1900–2100 年数据范围'
        : null;

  function changeYear(nextYear: number) {
    setLunarYear(nextYear);
    const leap = leapMonth(nextYear);
    const [monthPart] = lunarMonthKey.split('-');
    const month = Number(monthPart) || 1;
    const keepLeap = lunarMonthKey.endsWith('-1') && leap === month;
    setLunarMonthKey(`${month}-${keepLeap ? 1 : 0}`);
    const length = keepLeap ? leapDays(nextYear) : monthDays(nextYear, month);
    setLunarDay(Math.min(lunarDay, length));
  }

  function goToday() {
    setMode('solar');
    setSolarInput(todayIso);
    if (todayLunar) {
      setLunarYear(todayLunar.year);
      setLunarMonthKey(`${todayLunar.month}-${todayLunar.isLeap ? 1 : 0}`);
      setLunarDay(todayLunar.day);
    }
  }

  function goSpringFestival() {
    const baseLunar = solarToLunar(solarDay ?? todayDay) ?? todayLunar;
    if (!baseLunar) return;
    const festival = lunarToSolar(baseLunar.year, 1, 1, false);
    if (festival === null) return;
    setMode('solar');
    setSolarInput(formatSolar(festival));
    setLunarYear(baseLunar.year);
    setLunarMonthKey('1-0');
    setLunarDay(1);
  }

  return (
    <div className="space-y-4">
      <Panel title="公历 / 农历互查" description="内置 1900–2100 年农历数据，可双向转换并查看干支、生肖与节气。">
        <Tabs<Mode>
          items={[
            { value: 'solar', label: '公历 → 农历' },
            { value: 'lunar', label: '农历 → 公历' },
          ]}
          value={mode}
          onChange={setMode}
          className="mb-4"
        />

        {mode === 'solar' ? (
          <Field label="公历日期" htmlFor="lunar-solar-date" error={inputError ?? undefined} hint="可选范围：1900-01-31 至 2100-12-31。">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="lunar-solar-date"
                type="date"
                className="max-w-56"
                min="1900-01-31"
                max="2100-12-31"
                value={solarInput}
                onChange={(event) => setSolarInput(event.target.value)}
              />
              <Button variant="secondary" size="sm" onClick={goToday}>
                今天
              </Button>
              <Button variant="secondary" size="sm" onClick={goSpringFestival}>
                该年春节
              </Button>
            </div>
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="农历年" htmlFor="lunar-year">
              <Select
                id="lunar-year"
                value={String(lunarYear)}
                onChange={(event) => changeYear(Number(event.target.value))}
              >
                {Array.from({ length: LUNAR_YEAR_MAX - LUNAR_YEAR_MIN + 1 }, (_, index) => LUNAR_YEAR_MIN + index).map(
                  (year) => (
                    <option key={year} value={year}>
                      {year} 年
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field label="农历月" htmlFor="lunar-month">
              <Select
                id="lunar-month"
                value={selectedMonth.key}
                onChange={(event) => {
                  setLunarMonthKey(event.target.value);
                  setLunarDay(1);
                }}
              >
                {monthOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="农历日"
              htmlFor="lunar-day"
              error={inputError ?? undefined}
              hint={lunarYear === 2100 ? '2100 年末的农历日期可能对应 2101 年的公历。' : undefined}
            >
              <Select
                id="lunar-day"
                value={String(safeDay)}
                onChange={(event) => setLunarDay(Number(event.target.value))}
              >
                {Array.from({ length: monthLength }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {DAY_NAMES[day - 1]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
              <Button variant="secondary" size="sm" onClick={goToday}>
                今天
              </Button>
              <Button variant="secondary" size="sm" onClick={goSpringFestival}>
                正月初一
              </Button>
              <span className="text-xs subtle">
                已选：{lunarYear} 年{selectedMonth.label}
                {DAY_NAMES[safeDay - 1]}
              </span>
            </div>
          </div>
        )}
      </Panel>

      <ToolSplit>
        <Panel title="转换结果" description={solarDay !== null && lunarResult ? `${formatSolar(solarDay)} · ${formatLunar(lunarResult)}` : '选择日期后显示双方结果。'}>
          {inputError ? (
            <Alert tone="error" title="无法转换">
              {inputError}
            </Alert>
          ) : solarDay === null || lunarResult === null ? (
            <EmptyState
              icon={CalendarDays}
              title={mode === 'solar' ? '公历日期为空' : '尚未选择农历日期'}
              description="请在上方选择要转换的日期，结果会即时更新。"
            />
          ) : (
            <div className="space-y-3">
              <Result
                label="公历"
                value={`${formatSolar(solarDay)} ${weekdayOf(solarDay)}`}
                mono
                hint={
                  solarDay === todayDay
                    ? '今天'
                    : solarDay > todayDay
                      ? `${solarDay - todayDay} 天后`
                      : `${todayDay - solarDay} 天前`
                }
              />
              <Result
                label="农历"
                value={formatLunar(lunarResult)}
                hint={`${ganzhiYear(lunarResult.year)}年 · 属${zodiacOf(lunarResult.year)}${lunarResult.isLeap ? ' · 闰月' : ''}`}
              />
              <KeyValue
                items={[
                  { label: '干支 / 生肖', value: `${ganzhiYear(lunarResult.year)}年 · ${zodiacOf(lunarResult.year)}` },
                  {
                    label: '上一个节气',
                    value: describeTerm(terms?.prev ?? null, solarDay),
                  },
                  {
                    label: '下一个节气',
                    value: describeTerm(terms?.next ?? null, solarDay),
                  },
                  {
                    label: '本农历年天数',
                    value: lunarYearDaysValue !== null ? `${lunarYearDaysValue} 天${leapMonthValue ? `（闰 ${MONTH_NAMES[leapMonthValue - 1]}月）` : '（无闰月）'}` : '—',
                  },
                  {
                    label: '春节（正月初一）',
                    value: springFestivalDay !== null ? formatSolar(springFestivalDay) : '—',
                  },
                  {
                    label: '农历年份说明',
                    value: '干支与生肖以农历正月初一为界',
                  },
                ]}
              />
              <Hint>节气由太阳黄经近似计算，日期可能存在 ±1 天误差，仅作参考。</Hint>
            </div>
          )}
        </Panel>

        <Panel title="日期信息" description="农历数据完全内置，不依赖 CDN 或第三方接口。">
          <div className="space-y-3">
            <KeyValue
              items={[
                { label: '公历日期', value: solarDay !== null ? `${formatSolar(solarDay)} ${weekdayOf(solarDay)}` : '—' },
                { label: '农历日期', value: lunarResult ? formatLunar(lunarResult) : '—' },
                { label: '干支纪年', value: lunarResult ? `${ganzhiYear(lunarResult.year)}年` : '—' },
                { label: '生肖', value: lunarResult ? zodiacOf(lunarResult.year) : '—' },
                { label: '数据范围', value: '1900-01-31 至 2100-12-31' },
                { label: '闰月规则', value: '19 年 7 闰，闰月随年份变化' },
              ]}
            />
            {lunarResult ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                  <p className="text-xs subtle">生肖</p>
                  <p className="mt-1 text-2xl">{zodiacOf(lunarResult.year)}</p>
                </div>
                <div className="rounded-xl border bg-[var(--hover-bg)] px-4 py-3">
                  <p className="text-xs subtle">干支</p>
                  <p className="mt-1 text-2xl">{ganzhiYear(lunarResult.year)}年</p>
                </div>
              </div>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                setMode('solar');
                setSolarInput(todayIso);
                goToday();
              }}
            >
              回到今天
            </Button>
            <Hint>
              数据覆盖 1900–2100 年，超出范围的日期无法换算。农历日期以北京时间对应的农历为准，用于日常查询足够，但不建议用于严格的天文历算。
            </Hint>
          </div>
        </Panel>
      </ToolSplit>
    </div>
  );
}
