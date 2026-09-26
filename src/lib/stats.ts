import type { Review } from "@/lib/reviews";

// 評価点の集計（AIは使わず、計算で出す）

export type PeriodStat = {
  count: number;
  avg: number | null; // 口コミが0件なら null
};

export type MonthStat = PeriodStat & { month: string }; // month: "2026-09"
export type DayStat = PeriodStat & { date: string }; // date: "2026-09-05"
export type SiteStat = PeriodStat & { site: string };

export type RatingStats = {
  today: string; // CSVの最新日を「当日」とする
  todayStat: PeriodStat;
  thisMonth: MonthStat;
  prevMonth: MonthStat;
  lastYearMonth: MonthStat; // 前年同月
  momDiff: number | null; // 前月比（平均点の差）
  yoyDiff: number | null; // 前年比（平均点の差）
  months: MonthStat[]; // 最も古い月〜今月（口コミがない月も含めて連続で並べる）
  days: DayStat[]; // 今月1日〜当日
  sites: SiteStat[]; // 今月のサイト別
};

function stat(reviews: Review[]): PeriodStat {
  if (reviews.length === 0) return { count: 0, avg: null };
  const sum = reviews.reduce((s, r) => s + r.rating, 0);
  return { count: reviews.length, avg: sum / reviews.length };
}

// "2026-09" の n か月前／後
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function diff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

export function computeRatingStats(reviews: Review[]): RatingStats | null {
  if (reviews.length === 0) return null;

  const byMonth = new Map<string, Review[]>();
  const byDate = new Map<string, Review[]>();
  for (const r of reviews) {
    const month = r.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), r]);
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  }

  const dates = reviews.map((r) => r.date).sort();
  const today = dates[dates.length - 1];
  const currentMonth = today.slice(0, 7);
  const monthStat = (month: string): MonthStat => ({ month, ...stat(byMonth.get(month) ?? []) });

  const months: MonthStat[] = [];
  for (let m = dates[0].slice(0, 7); m <= currentMonth; m = shiftMonth(m, 1)) months.push(monthStat(m));

  const days: DayStat[] = [];
  const lastDay = Number(today.slice(8, 10));
  for (let d = 1; d <= lastDay; d++) {
    const date = `${currentMonth}-${String(d).padStart(2, "0")}`;
    days.push({ date, ...stat(byDate.get(date) ?? []) });
  }

  const thisMonthReviews = byMonth.get(currentMonth) ?? [];
  const siteNames = [...new Set(thisMonthReviews.map((r) => r.site))].sort();
  const sites = siteNames.map((site) => ({ site, ...stat(thisMonthReviews.filter((r) => r.site === site)) }));

  const thisMonth = monthStat(currentMonth);
  const prevMonth = monthStat(shiftMonth(currentMonth, -1));
  const lastYearMonth = monthStat(shiftMonth(currentMonth, -12));

  return {
    today,
    todayStat: stat(byDate.get(today) ?? []),
    thisMonth,
    prevMonth,
    lastYearMonth,
    momDiff: diff(thisMonth.avg, prevMonth.avg),
    yoyDiff: diff(thisMonth.avg, lastYearMonth.avg),
    months,
    days,
    sites,
  };
}

// 表示用："2026-09" → "2026年9月"、"2026-09-05" → "9/5"
export const monthLabel = (month: string) => `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
// グラフの横軸用："2025-09" → "25/9"
export const shortMonthLabel = (month: string) => `${month.slice(2, 4)}/${Number(month.slice(5, 7))}`;
export const dayLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
export const formatAvg = (avg: number | null) => (avg === null ? "―" : avg.toFixed(2));
