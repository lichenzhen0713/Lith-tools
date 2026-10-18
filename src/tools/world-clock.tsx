import { useMemo, useState } from 'react';
import { Clock, Globe, Plus, RotateCcw, Search, X } from 'lucide-react';
import { CopyButton, Field, Hint, Input, Panel, ToolSplit } from './kit';
import { Badge, Button, EmptyState, Switch } from '../components/ui';
import { useInterval, useLocalStorage } from '../lib/hooks';
import { useToast } from '../lib/toast';

interface CityOption {
  timeZone: string;
  city: string;
  country: string;
}

const CITY_CATALOG: CityOption[] = [
  { timeZone: 'Asia/Shanghai', city: '北京', country: '中国' },
  { timeZone: 'Asia/Hong_Kong', city: '香港', country: '中国' },
  { timeZone: 'Asia/Taipei', city: '台北', country: '中国' },
  { timeZone: 'Asia/Tokyo', city: '东京', country: '日本' },
  { timeZone: 'Asia/Seoul', city: '首尔', country: '韩国' },
  { timeZone: 'Asia/Singapore', city: '新加坡', country: '新加坡' },
  { timeZone: 'Asia/Bangkok', city: '曼谷', country: '泰国' },
  { timeZone: 'Asia/Kuala_Lumpur', city: '吉隆坡', country: '马来西亚' },
  { timeZone: 'Asia/Jakarta', city: '雅加达', country: '印度尼西亚' },
  { timeZone: 'Asia/Manila', city: '马尼拉', country: '菲律宾' },
  { timeZone: 'Asia/Ho_Chi_Minh', city: '胡志明市', country: '越南' },
  { timeZone: 'Asia/Kolkata', city: '新德里', country: '印度' },
  { timeZone: 'Asia/Kathmandu', city: '加德满都', country: '尼泊尔' },
  { timeZone: 'Asia/Yangon', city: '仰光', country: '缅甸' },
  { timeZone: 'Asia/Dubai', city: '迪拜', country: '阿联酋' },
  { timeZone: 'Asia/Riyadh', city: '利雅得', country: '沙特阿拉伯' },
  { timeZone: 'Asia/Tehran', city: '德黑兰', country: '伊朗' },
  { timeZone: 'Asia/Jerusalem', city: '耶路撒冷', country: '以色列' },
  { timeZone: 'Europe/London', city: '伦敦', country: '英国' },
  { timeZone: 'Europe/Paris', city: '巴黎', country: '法国' },
  { timeZone: 'Europe/Berlin', city: '柏林', country: '德国' },
  { timeZone: 'Europe/Madrid', city: '马德里', country: '西班牙' },
  { timeZone: 'Europe/Rome', city: '罗马', country: '意大利' },
  { timeZone: 'Europe/Amsterdam', city: '阿姆斯特丹', country: '荷兰' },
  { timeZone: 'Europe/Zurich', city: '苏黎世', country: '瑞士' },
  { timeZone: 'Europe/Stockholm', city: '斯德哥尔摩', country: '瑞典' },
  { timeZone: 'Europe/Athens', city: '雅典', country: '希腊' },
  { timeZone: 'Europe/Moscow', city: '莫斯科', country: '俄罗斯' },
  { timeZone: 'Europe/Istanbul', city: '伊斯坦布尔', country: '土耳其' },
  { timeZone: 'Europe/Kiev', city: '基辅', country: '乌克兰' },
  { timeZone: 'America/New_York', city: '纽约', country: '美国' },
  { timeZone: 'America/Chicago', city: '芝加哥', country: '美国' },
  { timeZone: 'America/Denver', city: '丹佛', country: '美国' },
  { timeZone: 'America/Los_Angeles', city: '洛杉矶', country: '美国' },
  { timeZone: 'America/Toronto', city: '多伦多', country: '加拿大' },
  { timeZone: 'America/Vancouver', city: '温哥华', country: '加拿大' },
  { timeZone: 'America/Mexico_City', city: '墨西哥城', country: '墨西哥' },
  { timeZone: 'America/Sao_Paulo', city: '圣保罗', country: '巴西' },
  { timeZone: 'America/Argentina/Buenos_Aires', city: '布宜诺斯艾利斯', country: '阿根廷' },
  { timeZone: 'Pacific/Honolulu', city: '檀香山', country: '美国' },
  { timeZone: 'Australia/Sydney', city: '悉尼', country: '澳大利亚' },
  { timeZone: 'Australia/Melbourne', city: '墨尔本', country: '澳大利亚' },
  { timeZone: 'Australia/Brisbane', city: '布里斯班', country: '澳大利亚' },
  { timeZone: 'Australia/Perth', city: '珀斯', country: '澳大利亚' },
  { timeZone: 'Australia/Adelaide', city: '阿德莱德', country: '澳大利亚' },
  { timeZone: 'Pacific/Auckland', city: '奥克兰', country: '新西兰' },
  { timeZone: 'Pacific/Fiji', city: '苏瓦', country: '斐济' },
  { timeZone: 'Africa/Cairo', city: '开罗', country: '埃及' },
  { timeZone: 'Africa/Johannesburg', city: '约翰内斯堡', country: '南非' },
  { timeZone: 'Africa/Nairobi', city: '内罗毕', country: '肯尼亚' },
  { timeZone: 'Africa/Lagos', city: '拉各斯', country: '尼日利亚' },
  { timeZone: 'Africa/Casablanca', city: '卡萨布兰卡', country: '摩洛哥' },
];

const CATALOG_MAP = new Map(CITY_CATALOG.map((city) => [city.timeZone, city]));
const DEFAULT_ZONES = ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York'];
const POPULAR = ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'Europe/Paris', 'Australia/Sydney'];
const MAX_ZONES = 24;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

interface TimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(date: Date, timeZone: string): TimeParts | null {
  const formatter = zoneFormatter(timeZone);
  if (!formatter) return null;
  try {
    const map: Record<string, string> = {};
    for (const part of formatter.formatToParts(date)) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    const parts: TimeParts = {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
    };
    return Object.values(parts).every((value) => Number.isFinite(value)) ? parts : null;
  } catch {
    return null;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dayIndex(parts: TimeParts): number {
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function offsetMinutesOf(parts: TimeParts): number {
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) / 60_000);
}

function formatClock(parts: TimeParts, hour12: boolean): { value: string; suffix: string } {
  if (!hour12) return { value: `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`, suffix: '' };
  const hour = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return { value: `${hour}:${pad(parts.minute)}:${pad(parts.second)}`, suffix: parts.hour < 12 ? '上午' : '下午' };
}

function formatOffset(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes === 0) return '与本地时间相同';
  const direction = minutes > 0 ? '快' : '慢';
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const pieces: string[] = [];
  if (hours > 0) pieces.push(`${hours} 小时`);
  if (mins > 0) pieces.push(`${mins} 分钟`);
  return `比本地${direction} ${pieces.join(' ')}`;
}

function formatUtcOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const total = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function sanitizeZones(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_ZONES;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && CATALOG_MAP.has(item) && !seen.has(item)) seen.add(item);
    if (seen.size >= MAX_ZONES) break;
  }
  return Array.from(seen);
}

export default function WorldClockTool() {
  const toast = useToast();
  const [storedZones, setStoredZones] = useLocalStorage<string[]>('lith:world-clock-zones', DEFAULT_ZONES);
  const [storedHour12, setStoredHour12] = useLocalStorage<boolean>('lith:world-clock-hour12', false);
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState('');

  const zones = useMemo(() => sanitizeZones(storedZones), [storedZones]);
  const hour12 = storedHour12 === true;
  const localZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  useInterval(() => setNow(new Date()), 1000);

  const localParts = useMemo(() => partsInZone(now, localZone), [now, localZone]);
  const localOffset = -now.getTimezoneOffset();

  const cards = useMemo(
    () =>
      zones.map((timeZone) => {
        const city = CATALOG_MAP.get(timeZone);
        const parts = partsInZone(now, timeZone);
        const diffMinutes = parts && localParts ? offsetMinutesOf(parts) - offsetMinutesOf(localParts) : 0;
        const dayDelta = parts && localParts ? dayIndex(parts) - dayIndex(localParts) : 0;
        return {
          timeZone,
          city: city ?? { timeZone, city: timeZone, country: '未知地区' },
          parts,
          diffMinutes,
          dayDelta,
        };
      }),
    [zones, now, localParts],
  );

  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return POPULAR.filter((timeZone) => !zones.includes(timeZone)).map((timeZone) => CATALOG_MAP.get(timeZone)).filter((city): city is CityOption => Boolean(city));
    }
    return CITY_CATALOG.filter((city) => {
      return (
        city.city.toLowerCase().includes(keyword) ||
        city.country.toLowerCase().includes(keyword) ||
        city.timeZone.toLowerCase().includes(keyword)
      );
    }).slice(0, 8);
  }, [query, zones]);

  function addZone(timeZone: string): void {
    if (zones.includes(timeZone)) return;
    if (zones.length >= MAX_ZONES) {
      toast.error(`最多同时显示 ${MAX_ZONES} 个城市`);
      return;
    }
    setStoredZones((previous) => {
      const list = sanitizeZones(previous);
      if (list.includes(timeZone)) return list;
      return [...list, timeZone];
    });
    setQuery('');
  }

  function removeZone(timeZone: string): void {
    setStoredZones((previous) => sanitizeZones(previous).filter((item) => item !== timeZone));
  }

  const localClock = localParts ? formatClock(localParts, hour12) : { value: '--:--:--', suffix: '' };
  const localDate = localParts
    ? `${localParts.year} 年 ${localParts.month} 月 ${localParts.day} 日 ${WEEKDAYS[new Date(Date.UTC(localParts.year, localParts.month - 1, localParts.day)).getUTCDay()]}`
    : '时间信息不可用';

  const allTimesText = cards
    .map((card) => {
      if (!card.parts) return `${card.city.city}（${card.timeZone}）：时区不可用`;
      const clock = formatClock(card.parts, hour12);
      return `${card.city.city}（${card.timeZone}）：${card.parts.year}-${pad(card.parts.month)}-${pad(card.parts.day)} ${clock.value}${clock.suffix} · ${formatUtcOffset(localOffset + card.diffMinutes)}`;
    })
    .join('\n');

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="本地时间" description="以当前设备的系统时区为准，每秒刷新。">
          <div className="rounded-2xl border bg-[var(--hover-bg)] px-5 py-6 text-center">
            <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {localClock.value}
              {localClock.suffix ? <span className="ml-1.5 text-base font-normal subtle">{localClock.suffix}</span> : null}
            </p>
            <p className="mt-2 text-sm muted">{localDate}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Badge tone="brand">
                <Globe className="size-3" /> {localZone}
              </Badge>
              <Badge>{formatUtcOffset(localOffset)}</Badge>
              <Badge>{hour12 ? '12 小时制' : '24 小时制'}</Badge>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">12 / 24 小时制</p>
              <p className="text-xs subtle">所有城市卡片同步切换</p>
            </div>
            <Switch checked={hour12} onChange={setStoredHour12} label={hour12 ? '12 小时' : '24 小时'} />
          </div>
        </Panel>

        <Panel title="添加城市" description={`支持 ${CITY_CATALOG.length} 个常用时区，最多同时显示 ${MAX_ZONES} 个。`}>
          <Field label="搜索城市 / 时区" hint="可输入中文城市名、国家或 IANA 时区，例如「东京」「London」。">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                className="pl-9"
                placeholder="搜索城市，例如 伦敦 / London / Europe"
                aria-label="搜索城市"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </Field>

          <div className="mt-4 space-y-2">
            <p className="text-xs subtle">{query.trim() ? `搜索结果（${suggestions.length}）` : '热门城市'}</p>
            {suggestions.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs subtle">
                {query.trim() ? '没有匹配的城市，试试其他关键词。' : '热门城市都已添加，可在上方搜索更多。'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((city) => {
                  const added = zones.includes(city.timeZone);
                  return (
                    <button
                      key={city.timeZone}
                      type="button"
                      className="chip disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={added}
                      onClick={() => addZone(city.timeZone)}
                    >
                      {added ? null : <Plus className="size-3" />}
                      {city.city}
                      <span className="text-[10px] opacity-70">{city.country}</span>
                      {added ? <span className="text-[10px]">已添加</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 border-t pt-4">
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                setStoredZones(DEFAULT_ZONES);
                toast.success('已恢复默认城市');
              }}
            >
              恢复默认城市
            </Button>
          </div>
        </Panel>
      </ToolSplit>

      <Panel
        title="世界时钟"
        description="时间、日期与时差均按各地时区实时计算"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs subtle">
            <span>{zones.length} 个城市 · 每秒自动刷新</span>
            <span>时差以本地时区为基准</span>
          </div>
        }
      >
        {zones.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="还没有添加城市"
            description="在上方搜索并添加城市，即可同时查看各地的当前时间。"
            action={
              <Button variant="secondary" onClick={() => setStoredZones(DEFAULT_ZONES)}>
                添加默认城市
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-3 flex justify-end">
              <CopyButton text={allTimesText} label="复制全部时间" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              if (!card.parts) {
                return (
                  <article key={card.timeZone} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">{card.city.city}</h3>
                        <p className="mt-0.5 text-xs subtle">{card.timeZone}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost size-8 rounded-lg p-0"
                        aria-label={`移除 ${card.city.city}`}
                        onClick={() => removeZone(card.timeZone)}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <p className="mt-4 text-sm text-rose-500">该时区在当前浏览器不可用</p>
                  </article>
                );
              }

              const clock = formatClock(card.parts, hour12);
              const weekday = WEEKDAYS[new Date(Date.UTC(card.parts.year, card.parts.month - 1, card.parts.day)).getUTCDay()];
              const dayLabel =
                card.dayDelta === 0 ? '今天' : card.dayDelta === 1 ? '明天' : card.dayDelta === -1 ? '昨天' : `${card.dayDelta > 0 ? '早' : '晚'} ${Math.abs(card.dayDelta)} 天`;
              const zoneOffset = localOffset + card.diffMinutes;

              return (
                <article key={card.timeZone} className="rounded-2xl border bg-[var(--hover-bg)] p-4">
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{card.city.city}</h3>
                      <p className="mt-0.5 truncate text-xs subtle">
                        {card.city.country} · {card.timeZone}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost size-8 shrink-0 rounded-lg p-0"
                      aria-label={`移除 ${card.city.city}`}
                      onClick={() => removeZone(card.timeZone)}
                    >
                      <X className="size-4" />
                    </button>
                  </header>

                  <p className="mt-3 font-mono text-3xl font-semibold tracking-tight tabular-nums">
                    {clock.value}
                    {clock.suffix ? <span className="ml-1 text-sm font-normal subtle">{clock.suffix}</span> : null}
                  </p>
                  <p className="mt-1 text-xs muted">
                    {card.parts.year}-{pad(card.parts.month)}-{pad(card.parts.day)} {weekday} · {dayLabel}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="brand">{formatUtcOffset(zoneOffset)}</Badge>
                    <span className="subtle">{formatOffset(card.diffMinutes)}</span>
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </Panel>

      <Hint>
        时差按当前时刻的夏令时状态计算，与各地实际时区规则一致；跨日会显示“昨天 / 明天”。数据仅保存在本地浏览器。
      </Hint>
    </div>
  );
}
