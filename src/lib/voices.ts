import Papa from "papaparse";

// 現場で受けたお客様の声（アンケート・フロント・電話/メール・旅行会社/団体）
// 個人を特定できる情報（氏名・電話番号・部屋番号）の欄は持たない

export const CHANNELS = ["アンケート", "フロント", "電話・メール", "旅行会社・団体"] as const;
export const CUSTOMER_TYPES = ["個人・カップル", "家族", "ビジネス", "団体", "訪日外国人", "その他"] as const;
export const STATUSES = ["未対応", "対応中", "完了"] as const;

export type Channel = (typeof CHANNELS)[number];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type Status = (typeof STATUSES)[number];

export type Voice = {
  id: string;
  receivedDate: string; // 受付日 YYYY-MM-DD
  channel: Channel; // 経路
  customerType: CustomerType; // お客様の区分
  content: string; // 内容
  rating?: number; // 評価 1〜5（任意）
  status: Status; // 対応状況
  action: string; // 対応内容（任意。空文字可）
};

export type VoiceInput = Omit<Voice, "id">;

export const MAX_CONTENT_LENGTH = 1000;
export const MAX_ACTION_LENGTH = 500;
export const MAX_VOICES = 5000;

const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// 入力のチェック。問題があれば日本語の理由を返す
export function validateVoice(v: {
  receivedDate: string;
  channel: string;
  customerType: string;
  content: string;
  rating?: number;
  status: string;
  action: string;
}): string[] {
  const errors: string[] = [];
  if (!isValidDate(v.receivedDate)) errors.push("受付日を正しく入力してください");
  if (!isOneOf(CHANNELS, v.channel)) errors.push("経路を選んでください");
  if (!isOneOf(CUSTOMER_TYPES, v.customerType)) errors.push("お客様の区分を選んでください");
  if (!v.content.trim()) errors.push("内容を入力してください");
  if (v.content.length > MAX_CONTENT_LENGTH) errors.push(`内容は${MAX_CONTENT_LENGTH}文字以内にしてください`);
  if (v.rating !== undefined && (!Number.isInteger(v.rating) || v.rating < 1 || v.rating > 5))
    errors.push("評価は1〜5の整数にしてください");
  if (!isOneOf(STATUSES, v.status)) errors.push("対応状況を選んでください");
  if (v.action.length > MAX_ACTION_LENGTH) errors.push(`対応内容は${MAX_ACTION_LENGTH}文字以内にしてください`);
  return errors;
}

// 個人を特定できそうな書き方を見つけて注意する（保存は止めず、確認をうながす）
export function findPersonalInfo(text: string): string[] {
  const found: string[] = [];
  const normalized = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/0\d{1,4}[-(（ ]?\d{1,4}[-)） ]?\d{3,4}/.test(normalized) || /\d{10,11}/.test(normalized))
    found.push("電話番号のような数字");
  if (/\d{2,4}\s*号室|部屋番号|ルーム\s*\d{2,4}|room\s*\d{2,4}/i.test(normalized)) found.push("部屋番号");
  // 「山田様」「タナカさん」のような書き方。直前の漢字・カタカナだけを見て、
  // 「お客様」「皆様」「スタッフさん」などの一般的な呼び方は除く
  const generic = /(客|皆|各|族|行|体|当|係|連|子|手|将|長|員|者|生|方|スタッフ|フロント|ドライバー|ガイド)$/;
  const names = [...normalized.matchAll(/([一-龥ァ-ヶー]{1,6})(様|さま|さん)/g)].map((m) => m[1]);
  if (names.some((n) => !generic.test(n))) found.push("お名前のような書き方");
  return found;
}

// ---- CSV（共有・バックアップ用） ----

export const VOICE_CSV_COLUMNS = [
  "received_date",
  "channel",
  "customer_type",
  "content",
  "rating",
  "status",
  "action",
] as const;

export function voicesToCsv(voices: Voice[]): string {
  const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [VOICE_CSV_COLUMNS.join(",")];
  for (const v of voices) {
    lines.push(
      [v.receivedDate, v.channel, v.customerType, v.content, v.rating?.toString() ?? "", v.status, v.action]
        .map(q)
        .join(","),
    );
  }
  // Excelで文字化けしないよう BOM を付ける
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export type VoiceParseResult = { voices: Voice[]; errors: string[] };

export function parseVoicesCsv(csvText: string, makeId: () => string): VoiceParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const columns = parsed.meta.fields ?? [];
  const missing = VOICE_CSV_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return { voices: [], errors: [`現場の声のCSVではありません（足りない列：${missing.join("、")}）`] };
  }
  if (parsed.data.length > MAX_VOICES) {
    return { voices: [], errors: [`行数が多すぎます（${parsed.data.length}行）。${MAX_VOICES}行以内にしてください。`] };
  }

  const voices: Voice[] = [];
  const errors: string[] = [];
  parsed.data.forEach((row, i) => {
    const ratingText = (row.rating ?? "").trim();
    const input = {
      receivedDate: (row.received_date ?? "").trim(),
      channel: (row.channel ?? "").trim(),
      customerType: (row.customer_type ?? "").trim(),
      content: (row.content ?? "").trim(),
      rating: ratingText === "" ? undefined : Number(ratingText),
      status: (row.status ?? "").trim(),
      action: (row.action ?? "").trim(),
    };
    const problems = validateVoice(input);
    if (problems.length > 0) {
      errors.push(`${i + 2}行目：${problems.join("、")}`);
      return;
    }
    voices.push({ id: makeId(), ...(input as VoiceInput) });
  });
  if (errors.length > 20) errors.splice(20, errors.length - 20, `ほか${errors.length - 20}行も読み込めませんでした`);
  return { voices, errors };
}

// 同じ声を二重に取り込まないための比較キー
export const voiceKey = (v: Pick<Voice, "receivedDate" | "channel" | "content">) =>
  `${v.receivedDate}|${v.channel}|${v.content.trim()}`;

// ---- ブラウザ内への保存 ----
// 閲覧環境によっては使えない（プライベートモードなど）ので、失敗しても画面は動くようにする

const STORAGE_KEY = "hotel-review-ai:voices:v1";

export function loadVoices(): Voice[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (v): v is Voice =>
        typeof v === "object" && v !== null && typeof v.id === "string" && validateVoice(v).length === 0,
    );
  } catch {
    return [];
  }
}

export function saveVoices(voices: Voice[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(voices));
    return true;
  } catch {
    return false;
  }
}
