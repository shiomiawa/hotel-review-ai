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

// サーバーに送る上限（公開URLでの使いすぎ対策）
export const MAX_ITEMS = 500;
export const MAX_TEXT_LENGTH = 2000;

// 分析の基準日と対象期間。基準日は口コミCSVの最新日（なければ現場の声の最新日）
export function analysisPeriod(reviews: Review[], voices: Voice[]) {
  const dates = reviews.length > 0 ? reviews.map((r) => r.date) : voices.map((v) => v.receivedDate);
  if (dates.length === 0) return null;
  const baseDate = dates.reduce((a, b) => (a > b ? a : b));
  const thisMonth = baseDate.slice(0, 7);
  return { baseDate, thisMonth, prevMonth: shiftMonth(thisMonth, -1) };
}

// 今月と前月の口コミ・現場の声を、分類に送る形にそろえる。本文のない「評価のみ」の投稿は除く
export function buildItems(reviews: Review[], voices: Voice[], months: string[]): AnalysisItem[] {
  const inPeriod = (date: string) => months.includes(date.slice(0, 7));
  return [
    ...reviews
      .filter((r) => r.text !== "" && inPeriod(r.date))
      .map((r): AnalysisItem => ({ id: `review:${r.id}`, source: "review", channel: NET_CHANNEL, date: r.date, text: r.text })),
    ...voices
      .filter((v) => inPeriod(v.receivedDate))
      .map((v): AnalysisItem => ({ id: `voice:${v.id}`, source: "voice", channel: v.channel, date: v.receivedDate, text: v.content })),
  ];
}

// ---- 集計 ----

export type AxisCount = { mentions: number; positive: number; negative: number };
const emptyCount = (): AxisCount => ({ mentions: 0, positive: 0, negative: 0 });

export type AxisSummary = {
  axis: AxisId;
  label: string;
  thisMonth: AxisCount;
  prevMonth: AxisCount;
  negativeExamples: AnalysisItem[]; // 今月の不満の例（新しい順）
  positiveExamples: AnalysisItem[];
};

export type Alert = { axis: AxisId; label: string; reason: string };
export type Strength = { axis: AxisId; label: string; reason: string };

export type ChannelRow = {
  channel: ChannelName;
  items: number; // 期間内の件数
  negative: Record<AxisId, number>; // 軸ごとの不満の件数
};

export type AnalysisResult = {
  axes: AxisSummary[];
  alerts: Alert[];
  strengths: Strength[];
  channels: ChannelRow[];
};

// アラート・強みの判断基準（件数が少ないうちは出さない）
const ALERT_MIN_NEGATIVE = 3;
const ALERT_NEGATIVE_SHARE = 0.4; // 言及のうち不満が4割以上
const ALERT_INCREASE = 1.5; // 前月の1.5倍以上に増えた
const STRENGTH_MIN_POSITIVE = 5;
const STRENGTH_POSITIVE_SHARE = 0.75;

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function summarizeAnalysis(
  items: AnalysisItem[],
  classifications: Classification[],
  period: { thisMonth: string; prevMonth: string },
): AnalysisResult {
  const byId = new Map(classifications.map((c) => [c.id, c]));
  const classified = items.flatMap((item) => {
    const c = byId.get(item.id);
    return c ? [{ item, c }] : [];
  });

  const axes: AxisSummary[] = AXES.map(({ id, label }) => {
    const summary: AxisSummary = {
      axis: id,
      label,
      thisMonth: emptyCount(),
      prevMonth: emptyCount(),
      negativeExamples: [],
      positiveExamples: [],
    };
    for (const { item, c } of classified) {
      const month = item.date.slice(0, 7);
      const target = month === period.thisMonth ? summary.thisMonth : month === period.prevMonth ? summary.prevMonth : null;
      if (!target || c[id] === "none") continue;
      target.mentions++;
      if (c[id] === "positive") target.positive++;
      if (c[id] === "negative") target.negative++;
      if (month === period.thisMonth && c[id] === "negative") summary.negativeExamples.push(item);
      if (month === period.thisMonth && c[id] === "positive") summary.positiveExamples.push(item);
    }
    const newest = (a: AnalysisItem, b: AnalysisItem) => b.date.localeCompare(a.date);
    summary.negativeExamples.sort(newest);
    summary.positiveExamples.sort(newest);
    return summary;
  });

  const alerts: Alert[] = [];
  const strengths: Strength[] = [];
  for (const a of axes) {
    const { negative, positive, mentions } = a.thisMonth;
    const share = mentions > 0 ? negative / mentions : 0;
    const prev = a.prevMonth.negative;
    const increased = negative >= ALERT_MIN_NEGATIVE && negative >= prev * ALERT_INCREASE && negative > prev;
    if (negative >= ALERT_MIN_NEGATIVE && (share >= ALERT_NEGATIVE_SHARE || increased)) {
      const reasons = [`今月の不満 ${negative}件（言及の${pct(share)}）`];
      if (increased) reasons.push(`前月 ${prev}件から増加`);
      alerts.push({ axis: a.axis, label: a.label, reason: reasons.join("、") });
    } else if (positive >= STRENGTH_MIN_POSITIVE && mentions > 0 && positive / mentions >= STRENGTH_POSITIVE_SHARE) {
      strengths.push({ axis: a.axis, label: a.label, reason: `今月の好評 ${positive}件（言及の${pct(positive / mentions)}）` });
    }
  }
  // 不満の多い順に並べる
  alerts.sort((x, y) => axes.find((a) => a.axis === y.axis)!.thisMonth.negative - axes.find((a) => a.axis === x.axis)!.thisMonth.negative);

  const channels: ChannelRow[] = ALL_CHANNELS.map((channel) => {
    const rows = classified.filter(({ item }) => item.channel === channel);
    const negative = Object.fromEntries(
      AXES.map(({ id }) => [id, rows.filter(({ c }) => c[id] === "negative").length]),
    ) as Record<AxisId, number>;
    return { channel, items: rows.length, negative };
  });

  return { axes, alerts, strengths, channels };
}
