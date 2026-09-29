// 日次メールの英語表記（外資系ホテル向け）。日本語の名前 → 英語の名前。
// 言い回しを変えたいときは、ここだけを直せばメール全体に反映される。

export const AXIS_EN: Record<string, string> = {
  客室設備: "Guest Rooms",
  通信環境: "Wi-Fi & Connectivity",
  "接客・ホスピタリティ": "Service & Hospitality",
  "朝食・ラウンジ": "Breakfast & Lounge",
};

export const CHANNEL_EN: Record<string, string> = {
  ネットの口コミ: "Online Reviews",
  アンケート: "Guest Survey",
  フロント: "Front Desk",
  "電話・メール": "Phone & Email",
  "旅行会社・団体": "Travel Agents & Groups",
};

// 口コミサイト名（英語のサイト名はそのまま）
export const SITE_EN: Record<string, string> = {
  楽天トラベル: "Rakuten Travel",
  じゃらん: "Jalan",
  "Google マップ": "Google Maps",
  Googleマップ: "Google Maps",
  "一休.com": "Ikyu.com",
  るるぶトラベル: "Rurubu Travel",
  "Yahoo!トラベル": "Yahoo! Travel",
};

export const CUSTOMER_EN: Record<string, string> = {
  "個人・カップル": "Individual / Couple",
  家族: "Family",
  ビジネス: "Business",
  団体: "Group",
  訪日外国人: "International Guest",
  その他: "Other",
};

export const STATUS_EN: Record<string, string> = {
  未対応: "Open",
  対応中: "In Progress",
  完了: "Resolved",
};

export const LANGUAGE_EN: Record<string, string> = {
  英語: "English",
  "中国語（繁体）": "Chinese (Traditional)",
  "中国語（簡体）": "Chinese (Simplified)",
  韓国語: "Korean",
  タイ語: "Thai",
  ドイツ語: "German",
  フランス語: "French",
  ロシア語: "Russian",
  トルコ語: "Turkish",
  ベトナム語: "Vietnamese",
  スペイン語: "Spanish",
};

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const en = (map: Record<string, string>, ja: string) => map[ja] ?? ja;

// "2026-09" → "September 2026"
export const monthEn = (month: string) => `${MONTHS_EN[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
// "2026-09" → "Sep 2026"（表の見出し用）
export const monthShortEn = (month: string) => `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;
// "2026-09-26" → "Sep 26, 2026"
export const dateEn = (date: string) => `${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
// "2026-09-26" → "2026.09.26"（件名用）
export const dotDate = (date: string) => date.replaceAll("-", ".");

// 期間の英語表記（year：2026／month：September 2026／week：Sep 21 – Sep 27, 2026）
export function periodEn(unit: "year" | "month" | "week", key: string, start: string, end: string) {
  if (unit === "year") return key;
  if (unit === "month") return monthEn(key);
  const s = `${MONTHS_SHORT[Number(start.slice(5, 7)) - 1]} ${Number(start.slice(8, 10))}`;
  const e = `${MONTHS_SHORT[Number(end.slice(5, 7)) - 1]} ${Number(end.slice(8, 10))}`;
  return `${s} – ${e}, ${end.slice(0, 4)}`;
}

export const PREVIOUS_EN: Record<"year" | "month" | "week", string> = {
  year: "the previous year",
  month: "the previous month",
  week: "the previous week",
};
