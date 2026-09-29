import type { Review } from "@/lib/reviews";
import { shiftMonth } from "@/lib/stats";
import { CHANNELS, type Voice } from "@/lib/voices";

// ネットの口コミと現場の声を、同じ4軸で分類してまとめて分析する

export const AXES = [
  { id: "room", label: "客室設備" },
  { id: "net", label: "通信環境" },
  { id: "service", label: "接客・ホスピタリティ" },
  { id: "food", label: "朝食・ラウンジ" },
] as const;
export type AxisId = (typeof AXES)[number]["id"];

// positive：ほめている／negative：不満がある／neutral：触れているが良くも悪くもない／none：触れていない
export const SENTIMENTS = ["positive", "negative", "neutral", "none"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export type Classification = { id: string } & Record<AxisId, Sentiment>;

// 分類に送る1件（口コミと現場の声を同じ形にそろえたもの）
export const NET_CHANNEL = "ネットの口コミ";
export type ChannelName = typeof NET_CHANNEL | (typeof CHANNELS)[number];
export const ALL_CHANNELS: ChannelName[] = [NET_CHANNEL, ...CHANNELS];

export type AnalysisItem = {
  id: string; // 口コミは "review:R1"、現場の声は "voice:<id>"
  source: "review" | "voice";
  channel: ChannelName;
  date: string;
  text: string;
};

// サーバーに送る上限（公開URLでの使いすぎ対策）。これより多いときは分けて送る
export const MAX_ITEMS = 500;
export const MAX_TEXT_LENGTH = 2000;

// 同じ本文の分類結果を使い回すための目印（本文が変われば分類し直す）
export const classificationKey = (item: Pick<AnalysisItem, "id" | "text">) => `${item.id}\n${item.text}`;

// ---- 分析の期間（年・月・週） ----
// 期間ごとに要約し、1つ前の期間と比べて改善しているかを見る

export type PeriodUnit = "year" | "month" | "week";
export const PERIOD_UNITS: { id: PeriodUnit; label: string; previous: string }[] = [
  { id: "year", label: "年", previous: "前年" },
  { id: "month", label: "月", previous: "前月" },
  { id: "week", label: "週", previous: "前週" },
];

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(date: string, n: number) {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
// 週は月曜日始まり。週の目印はその週の月曜日の日付
function mondayOf(date: string) {
  const d = toDate(date);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

// その日付が入る期間の目印："2026"／"2026-09"／"2026-09-21"（週の月曜日）
export function periodKeyOf(date: string, unit: PeriodUnit): string {
  if (unit === "year") return date.slice(0, 4);
  if (unit === "month") return date.slice(0, 7);
  return mondayOf(date);
}

export type Period = { unit: PeriodUnit; key: string; start: string; end: string };

export function periodOf(unit: PeriodUnit, key: string): Period {
  if (unit === "year") return { unit, key, start: `${key}-01-01`, end: `${key}-12-31` };
  if (unit === "month") {
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { unit, key, start: `${key}-01`, end: `${key}-${String(last).padStart(2, "0")}` };
  }
  return { unit, key, start: key, end: addDays(key, 6) };
}

export function previousPeriod(p: Period): Period {
  if (p.unit === "year") return periodOf("year", String(Number(p.key) - 1));
  if (p.unit === "month") return periodOf("month", shiftMonth(p.key, -1));
  return periodOf("week", addDays(p.key, -7));
}

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
export function periodLabel(p: Period): string {
  if (p.unit === "year") return `${p.key}年`;
  if (p.unit === "month") return `${p.key.slice(0, 4)}年${Number(p.key.slice(5, 7))}月`;
  const sameMonth = p.start.slice(0, 7) === p.end.slice(0, 7);
  return `${p.start.slice(0, 4)}年${md(p.start)}〜${sameMonth ? `${Number(p.end.slice(8, 10))}日` : md(p.end)}`;
}

const inPeriod = (date: string, p: Pick<Period, "start" | "end">) => date >= p.start && date <= p.end;

// 分析の基準日：口コミCSVの最新日（なければ現場の声の最新日）
export function baseDateOf(reviews: Review[], voices: Voice[]): string | null {
  const dates = reviews.length > 0 ? reviews.map((r) => r.date) : voices.map((v) => v.receivedDate);
  return dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b));
}

// 口コミと現場の声を、分類に送る形にそろえる。本文のない「評価のみ」の投稿は除く
export function buildItems(reviews: Review[], voices: Voice[]): AnalysisItem[] {
  return [
    ...reviews
      .filter((r) => r.text !== "")
      .map((r): AnalysisItem => ({ id: `review:${r.id}`, source: "review", channel: NET_CHANNEL, date: r.date, text: r.text })),
    ...voices.map(
      (v): AnalysisItem => ({ id: `voice:${v.id}`, source: "voice", channel: v.channel, date: v.receivedDate, text: v.content }),
    ),
  ];
}

export const itemsIn = (items: AnalysisItem[], ...periods: Period[]) =>
  items.filter((i) => periods.some((p) => inPeriod(i.date, p)));

// データがある期間の一覧（古い順）と件数
export function listPeriods(items: AnalysisItem[], unit: PeriodUnit): { period: Period; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const key = periodKeyOf(i.date, unit);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ period: periodOf(unit, key), count }));
}

// ---- 集計 ----

export type AxisCount = { mentions: number; positive: number; negative: number };
const emptyCount = (): AxisCount => ({ mentions: 0, positive: 0, negative: 0 });

export type AxisSummary = {
  axis: AxisId;
  label: string;
  current: AxisCount;
  previous: AxisCount;
  negativeComments: AnalysisItem[]; // 選んだ期間の不満（新しい順）
  positiveComments: AnalysisItem[]; // 選んだ期間の好評（新しい順）
};

export type Highlight = { axis: AxisId; label: string; reason: string };

export type ChannelRow = {
  channel: ChannelName;
  items: number; // 選んだ期間の件数
  negative: Record<AxisId, number>; // 軸ごとの不満の件数
};

export type AnalysisResult = {
  // 期間内の件数（分類済み）。不満の割合＝不満の件数÷この件数（件数が違う期間どうしでも比べられるように）
  currentTotal: number;
  previousTotal: number;
  axes: AxisSummary[];
  alerts: Highlight[]; // 優先改善アラート
  goodPoints: Highlight[]; // よいコメントが多い軸
  channels: ChannelRow[];
};

// アラート・よいコメントの判断基準。期間が短いほど件数が少ないので、最低件数を期間に合わせる
const THRESHOLDS: Record<PeriodUnit, { minNegative: number; minPositive: number }> = {
  week: { minNegative: 2, minPositive: 3 },
  month: { minNegative: 3, minPositive: 5 },
  year: { minNegative: 6, minPositive: 10 },
};
const ALERT_NEGATIVE_SHARE = 0.4; // 言及のうち不満が4割以上
const ALERT_INCREASE = 1.5; // 不満の割合が、1つ前の期間の1.5倍以上に増えた
const GOOD_POSITIVE_SHARE = 0.75; // 言及のうち好評が75%以上

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function summarizeAnalysis(
  items: AnalysisItem[],
  classifications: Map<string, Classification>,
  current: Period,
  previous: Period,
): AnalysisResult {
  const classified = items.flatMap((item) => {
    const c = classifications.get(classificationKey(item));
    return c ? [{ item, c }] : [];
  });
  const previousLabel = PERIOD_UNITS.find((u) => u.id === current.unit)!.previous;
  const newest = (a: AnalysisItem, b: AnalysisItem) => b.date.localeCompare(a.date);

  const axes: AxisSummary[] = AXES.map(({ id, label }) => {
    const summary: AxisSummary = {
      axis: id,
      label,
      current: emptyCount(),
      previous: emptyCount(),
      negativeComments: [],
      positiveComments: [],
    };
    for (const { item, c } of classified) {
      const isCurrent = inPeriod(item.date, current);
      const target = isCurrent ? summary.current : inPeriod(item.date, previous) ? summary.previous : null;
      if (!target || c[id] === "none") continue;
      target.mentions++;
      if (c[id] === "positive") target.positive++;
      if (c[id] === "negative") target.negative++;
      if (isCurrent && c[id] === "negative") summary.negativeComments.push(item);
      if (isCurrent && c[id] === "positive") summary.positiveComments.push(item);
    }
    summary.negativeComments.sort(newest);
    summary.positiveComments.sort(newest);
    return summary;
  });

  const currentTotal = classified.filter(({ item }) => inPeriod(item.date, current)).length;
  const previousTotal = classified.filter(({ item }) => inPeriod(item.date, previous)).length;
  const rate = (n: number, total: number) => (total === 0 ? 0 : n / total);

  const { minNegative, minPositive } = THRESHOLDS[current.unit];
  const alerts: Highlight[] = [];
  const goodPoints: Highlight[] = [];
  for (const a of axes) {
    const { negative, positive, mentions } = a.current;
    const share = mentions > 0 ? negative / mentions : 0;
    // 件数ではなく「不満の割合」で比べる（期間によって口コミの件数が違うため）
    const nowRate = rate(negative, currentTotal);
    const prevRate = rate(a.previous.negative, previousTotal);
    const increased = previousTotal > 0 && nowRate > prevRate && nowRate >= prevRate * ALERT_INCREASE;
    if (negative >= minNegative && (share >= ALERT_NEGATIVE_SHARE || increased)) {
      const reasons = [`不満 ${negative}件（言及の${pct(share)}）`];
      if (increased) reasons.push(`不満の割合が${previousLabel}の${pct(prevRate)}から${pct(nowRate)}に増加`);
      alerts.push({ axis: a.axis, label: a.label, reason: reasons.join("、") });
    } else if (positive >= minPositive && mentions > 0 && positive / mentions >= GOOD_POSITIVE_SHARE) {
      goodPoints.push({ axis: a.axis, label: a.label, reason: `好評 ${positive}件（言及の${pct(positive / mentions)}）` });
    }
  }
  const negativeOf = (axis: AxisId) => axes.find((a) => a.axis === axis)!.current.negative;
  const positiveOf = (axis: AxisId) => axes.find((a) => a.axis === axis)!.current.positive;
  alerts.sort((x, y) => negativeOf(y.axis) - negativeOf(x.axis));
  goodPoints.sort((x, y) => positiveOf(y.axis) - positiveOf(x.axis));

  const channels: ChannelRow[] = ALL_CHANNELS.map((channel) => {
    const rows = classified.filter(({ item }) => item.channel === channel && inPeriod(item.date, current));
    const negative = Object.fromEntries(
      AXES.map(({ id }) => [id, rows.filter(({ c }) => c[id] === "negative").length]),
    ) as Record<AxisId, number>;
    return { channel, items: rows.length, negative };
  });

  return { currentTotal, previousTotal, axes, alerts, goodPoints, channels };
}
