import { AXES, NET_CHANNEL, classificationKey, type AnalysisItem, type Classification, type Period, type Sentiment } from "@/lib/analysis";
import type { Review } from "@/lib/reviews";
import type { Voice } from "@/lib/voices";

// 4軸分析の結果をCSVで書き出す（社内共有・会議資料・ほかのツールへの移行用）。
// 選んだ期間の口コミと現場の声を1行ずつ、4軸の判定を付けて出す。

const SENTIMENT_JA: Record<Sentiment, string> = {
  positive: "好評",
  negative: "不満",
  neutral: "中立",
  none: "",
};

const COLUMNS = [
  "種類",
  "日付",
  "経路",
  "サイト",
  "評価",
  "宿泊タイプ・お客様の区分",
  "本文",
  "日本語訳",
  ...AXES.map((a) => a.label),
  "対応状況",
  "対応内容",
];

// Excel で開いたときに、= + - @ で始まる文字が数式として動かないようにする（CSVインジェクション対策）
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const cell = (v: string | number) => `"${safe(String(v)).replaceAll('"', '""')}"`;

export function buildAnalysisCsv(
  items: AnalysisItem[],
  classifications: Map<string, Classification>,
  reviews: Review[],
  voices: Voice[],
  period: Period,
): { csv: string; rows: number } {
  const reviewById = new Map(reviews.map((r) => [`review:${r.id}`, r]));
  const voiceById = new Map(voices.map((v) => [`voice:${v.id}`, v]));
  const lines = [COLUMNS.map(cell).join(",")];
  let rows = 0;

  const inPeriod = items
    .filter((i) => i.date >= period.start && i.date <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const item of inPeriod) {
    const c = classifications.get(classificationKey(item));
    if (!c) continue;
    const judge = AXES.map((a) => SENTIMENT_JA[c[a.id]]);
    if (item.source === "review") {
      const r = reviewById.get(item.id);
      lines.push(
        [
          "口コミ",
          item.date,
          NET_CHANNEL,
          r?.site ?? "",
          r?.rating ?? "",
          r && r.stayType !== "不明" ? r.stayType : "",
          r?.originalText ?? item.text,
          r?.originalText ? item.text : "",
          ...judge,
          "",
          "",
        ]
          .map(cell)
          .join(","),
      );
    } else {
      const v = voiceById.get(item.id);
      lines.push(
        ["現場の声", item.date, item.channel, "", v?.rating ?? "", v?.customerType ?? "", item.text, "", ...judge, v?.status ?? "", v?.action ?? ""]
          .map(cell)
          .join(","),
      );
    }
    rows++;
  }
  // Excel で文字化けしないよう BOM を付ける
  return { csv: "\uFEFF" + lines.join("\r\n") + "\r\n", rows };
}

// 書き出すファイル名（例：analysis_2026-09.csv、analysis_week_2026-09-21.csv、analysis_2026.csv）
export const analysisCsvFileName = (period: Period) =>
  period.unit === "week" ? `analysis_week_${period.key}.csv` : `analysis_${period.key}.csv`;
