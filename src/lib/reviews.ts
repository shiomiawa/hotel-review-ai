import Papa from "papaparse";

// 口コミ1件（CSVの1行）
export type Review = {
  id: string; // 読み込み順の番号（画面や分析結果の突き合わせに使う）
  date: string; // YYYY-MM-DD
  site: string;
  rating: number; // 1〜5
  text: string;
  stayType: string;
};

export type ParseResult = {
  reviews: Review[];
  errors: string[]; // 読み込めなかった行の理由（日本語）
};

export const REQUIRED_COLUMNS = ["date", "site", "rating", "text", "stay_type"] as const;

// 公開URLからの過剰な利用を防ぐための上限
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
const MAX_ERRORS_SHOWN = 20;

// OTAから取り出したCSVは Shift_JIS のことが多いので、UTF-8 で読めなければ Shift_JIS で読む
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// 「2026/9/5」のような書き方も YYYY-MM-DD にそろえる
function normalizeDate(value: string): string {
  const m = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return value.trim();
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export function parseReviewsCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const columns = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return {
      reviews: [],
      errors: [
        `必要な列がありません：${missing.join("、")}（1行目に ${REQUIRED_COLUMNS.join(", ")} の列名が必要です）`,
      ],
    };
  }

  if (parsed.data.length > MAX_ROWS) {
    return {
      reviews: [],
      errors: [`行数が多すぎます（${parsed.data.length}行）。${MAX_ROWS}行以内のCSVにしてください。`],
    };
  }

  const reviews: Review[] = [];
  const errors: string[] = [];

  parsed.data.forEach((row, i) => {
    const line = i + 2; // 1行目は列名なので、データは2行目から
    const date = normalizeDate(row.date ?? "");
    const site = (row.site ?? "").trim();
    const ratingText = (row.rating ?? "").trim();
    const rating = Number(ratingText);
    const text = (row.text ?? "").trim();
    const stayType = (row.stay_type ?? "").trim();

    const problems: string[] = [];
    if (!isValidDate(date)) problems.push(`date「${row.date ?? ""}」が日付（YYYY-MM-DD）ではありません`);
    if (!site) problems.push("site が空です");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      problems.push(`rating「${ratingText}」が1〜5の整数ではありません`);
    if (!text) problems.push("text（口コミ本文）が空です");

    if (problems.length > 0) {
      errors.push(`${line}行目：${problems.join("、")}`);
      return;
    }
    reviews.push({ id: `R${reviews.length + 1}`, date, site, rating, text, stayType: stayType || "不明" });
  });

  if (errors.length > MAX_ERRORS_SHOWN) {
    const rest = errors.length - MAX_ERRORS_SHOWN;
    errors.splice(MAX_ERRORS_SHOWN, rest, `ほか${rest}行も読み込めませんでした`);
  }

  return { reviews, errors };
}

// 読み込んだ口コミの期間と「当日」（CSVの最新日）
export function summarize(reviews: Review[]) {
  if (reviews.length === 0) return null;
  const dates = reviews.map((r) => r.date).sort();
  const latest = dates[dates.length - 1];
  return {
    count: reviews.length,
    from: dates[0],
    to: latest,
    todayCount: reviews.filter((r) => r.date === latest).length,
  };
}
