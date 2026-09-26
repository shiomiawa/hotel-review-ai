import Papa from "papaparse";

// 口コミ1件（CSVの1行）
export type Review = {
  id: string; // 読み込み順の番号（画面や分析結果の突き合わせに使う）
  date: string; // YYYY-MM-DD
  site: string;
  rating: number; // 1.0〜5.0（口コミコムの出力は「4.7」のような小数がある）
  text: string; // 分析に使う本文（外国語は日本語訳）。評価だけの投稿は空
  stayType: string; // 列がない形式では「不明」
  originalText?: string; // 外国語の口コミの原文（text が翻訳のとき）
  language?: string; // 「英語」など。日本語・不明のときは省略
  replied?: boolean; // 返信済みか（列がない形式では省略）
};

export type CsvFormat = "standard" | "kuchikomicom";

export const FORMAT_LABELS: Record<CsvFormat, string> = {
  standard: "標準形式",
  kuchikomicom: "口コミコムの出力形式",
};

export type ParseResult = {
  reviews: Review[];
  errors: string[]; // 読み込めなかった行の理由（日本語）
  format: CsvFormat | null; // 列名から判断した形式（判断できなければ null）
};

// 対応している形式と、それぞれの必須の列
const STANDARD_COLUMNS = ["date", "site", "rating", "text"] as const;
const KUCHIKOMICOM_COLUMNS = ["投稿日時", "口コミサイト", "★の数", "コメント"] as const;

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

// 「2026/9/5」「2026-09-26 08:53:10 +0900」なども YYYY-MM-DD にそろえる（時刻は使わない）
function normalizeDate(value: string): string {
  const m = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/);
  if (!m) return value.trim();
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function detectFormat(columns: string[]): CsvFormat | null {
  if (KUCHIKOMICOM_COLUMNS.every((c) => columns.includes(c))) return "kuchikomicom";
  if (STANDARD_COLUMNS.every((c) => columns.includes(c))) return "standard";
  return null;
}

type RawRow = Record<string, string>;
const get = (row: RawRow, key: string) => (row[key] ?? "").trim();

// 1行を、形式ごとの列名から共通の形に読み替える
function readRow(row: RawRow, format: CsvFormat) {
  if (format === "standard") {
    return {
      rawDate: get(row, "date"),
      site: get(row, "site"),
      ratingText: get(row, "rating"),
      text: get(row, "text"),
      stayType: get(row, "stay_type"),
    };
  }
  // 口コミコム：タイトルとコメントをつなげて本文にする。外国語は日本語訳（翻訳コメント）を使う
  const title = get(row, "タイトル");
  const comment = get(row, "コメント");
  const translated = get(row, "翻訳コメント");
  const language = get(row, "言語");
  const join = (a: string, b: string) => [a, b].filter(Boolean).join("\n");
  const isForeign = translated !== "" && language !== "日本語";
  return {
    rawDate: get(row, "投稿日時"),
    site: get(row, "口コミサイト"),
    ratingText: get(row, "★の数"),
    text: isForeign ? translated : join(title, comment),
    stayType: "",
    originalText: isForeign ? join(title, comment) : undefined,
    language: language && language !== "日本語" ? language : undefined,
    replied: get(row, "口コミ返信内容") !== "",
  };
}

export function parseReviewsCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<RawRow>(csvText.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const columns = parsed.meta.fields ?? [];
  const format = detectFormat(columns);
  if (!format) {
    return {
      reviews: [],
      format: null,
      errors: [
        "列名から形式を判断できませんでした。次のどちらかの列が1行目に必要です。",
        `・標準形式：${STANDARD_COLUMNS.join(", ")}（stay_type は任意）`,
        `・口コミコムの出力形式：${KUCHIKOMICOM_COLUMNS.join("、")}`,
      ],
    };
  }

  if (parsed.data.length > MAX_ROWS) {
    return {
      reviews: [],
      format,
      errors: [`行数が多すぎます（${parsed.data.length}行）。${MAX_ROWS}行以内のCSVにしてください。`],
    };
  }

  const reviews: Review[] = [];
  const errors: string[] = [];

  parsed.data.forEach((row, i) => {
    const line = i + 2; // 1行目は列名なので、データは2行目から
    const r = readRow(row, format);
    const date = normalizeDate(r.rawDate);
    const rating = Number(r.ratingText);

    const problems: string[] = [];
    if (!isValidDate(date)) problems.push(`日付「${r.rawDate}」を読み取れません`);
    if (!r.site) problems.push("サイト名が空です");
    if (r.ratingText === "" || !Number.isFinite(rating) || rating < 1 || rating > 5)
      problems.push(`評価「${r.ratingText}」が1〜5の数値ではありません`);

    if (problems.length > 0) {
      errors.push(`${line}行目：${problems.join("、")}`);
      return;
    }
    reviews.push({
      id: `R${reviews.length + 1}`,
      date,
      site: r.site,
      rating,
      text: r.text,
      stayType: r.stayType || "不明",
      ...(r.originalText !== undefined && { originalText: r.originalText }),
      ...(r.language !== undefined && { language: r.language }),
      ...(r.replied !== undefined && { replied: r.replied }),
    });
  });

  if (errors.length > MAX_ERRORS_SHOWN) {
    const rest = errors.length - MAX_ERRORS_SHOWN;
    errors.splice(MAX_ERRORS_SHOWN, rest, `ほか${rest}行も読み込めませんでした`);
  }

  return { reviews, errors, format };
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
    ratingOnlyCount: reviews.filter((r) => r.text === "").length,
  };
}
