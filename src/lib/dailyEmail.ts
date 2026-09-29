import {
  AXIS_EN,
  CHANNEL_EN,
  CUSTOMER_EN,
  LANGUAGE_EN,
  SITE_EN,
  STATUS_EN,
  dateEn,
  dotDate,
  en,
  monthEn,
} from "@/lib/i18n";

// 日次メールの中身（件名・HTML・テキスト）を作る。外資系ホテル向けに、見出し・項目名・バッジは英語、文章は日本語にする。
// 色で状態がひと目で分かるようにする。
// 画面のプレビューとサーバーの送信の両方で同じ関数を使い、見た目をそろえる。
// 口コミ・現場の声は原文のまま載せ、外国語の口コミには和訳を添える。お客様の文章は必ずエスケープする。

export type DailyEmailData = {
  facilityName: string;
  date: string; // 当日（YYYY-MM-DD）
  // 当日の口コミ。original は原文、translation は外国語の口コミの和訳（あれば）
  reviews: { site: string; rating: number; original: string; translation?: string; language?: string }[];
  voices: { channel: string; customerType: string; content: string; status: string; action: string }[]; // 当日の現場の声
  month: {
    key: string; // 例：2026-09
    summaryLines: { kind: string; text: string; textEn: string }[]; // 数値から作った要約（分析していなければ空）
    aiSummary: { kind: "complaints" | "praises"; label: string; count: number; text: string }[]; // AIの要約（日本語。なければ空）
  };
  // 月の評価点（月の平均・前月比・前年比）
  rating: {
    monthKey: string;
    monthAvg: number | null;
    monthCount: number;
    momDiff: number | null;
    yoyDiff: number | null;
  } | null;
};

// 送れる量の上限（使いすぎ・いたずら対策）
export const EMAIL_LIMITS = { reviews: 200, voices: 200, textLength: 2000, lines: 30 };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const nl2br = (s: string) => escapeHtml(s).replace(/\r?\n/g, "<br>");
const avgText = (v: number | null) => (v === null ? "—" : v.toFixed(2));
const diffText = (v: number | null) =>
  v === null ? "N/A" : Math.abs(v) < 0.005 ? "±0.00" : v > 0 ? `▲ +${v.toFixed(2)}` : `▼ −${Math.abs(v).toFixed(2)}`;
const stars = (r: number) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));
const ratingNum = (r: number) => (r % 1 ? r.toFixed(1) : String(r));

// ---- 色（ひと目で分かるように。色だけに頼らず、記号や言葉も添える） ----
const COLOR = {
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  accent: "#0f766e",
  bad: "#b42318",
  badBg: "#fee4e2",
  good: "#15803d",
  goodBg: "#dcfce7",
  info: "#1d4ed8",
  infoBg: "#dbeafe",
  warn: "#b45309",
  warnBg: "#fef3c7",
  neutralBg: "#f3f4f6",
};

// 対応状況のバッジ（未対応＝赤、対応中＝青、完了＝緑）
const STATUS_STYLE: Record<string, { fg: string; bg: string }> = {
  未対応: { fg: COLOR.bad, bg: COLOR.badBg },
  対応中: { fg: COLOR.info, bg: COLOR.infoBg },
  完了: { fg: COLOR.good, bg: COLOR.goodBg },
};

// 要約の各行の印と色
const LINE_STYLE: Record<string, { mark: string; color: string }> = {
  priority: { mark: "●", color: COLOR.bad },
  worse: { mark: "▲", color: COLOR.bad },
  better: { mark: "▼", color: COLOR.good },
  good: { mark: "✓", color: COLOR.good },
  voices: { mark: "■", color: COLOR.warn },
  overview: { mark: "•", color: COLOR.muted },
  steady: { mark: "•", color: COLOR.muted },
};

const badge = (text: string, fg: string, bg: string) =>
  `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:bold;line-height:1.6">${escapeHtml(text)}</span>`;


export const emailSubject = (date: string) => `Review Daily Report (${dotDate(date)})`;

// 見出し・項目名・バッジは英語、要約などの文章は日本語。口コミ・現場の声は原文のまま載せ、外国語の口コミには和訳を添える。
// いちばん大事なのは「その日」の口コミと現場の声なので先に置き、月間の要約は最後に短く置く。
export function buildDailyEmail(d: DailyEmailData): { subject: string; html: string; text: string } {
  const subject = emailSubject(d.date);
  const openVoices = d.voices.filter((v) => v.status !== "完了").length;
  const reviewAvg = d.reviews.length ? d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length : null;
  const monthName = monthEn(d.month.key);

  // ---- HTML（メールソフトでも崩れにくいよう、装飾はインラインで最小限） ----
  const small = `color:${COLOR.muted};font-size:12px`;
  const h2 = (t: string) =>
    `<h2 style="font-size:14px;margin:22px 0 6px;padding-bottom:4px;border-bottom:1px solid ${COLOR.border};color:${COLOR.accent}">${escapeHtml(t)}</h2>`;
  const p = (t: string, style = "") => `<p style="margin:2px 0;${style}">${t}</p>`;
  // 1件分の囲み。左の色の線で良し悪しや対応状況が分かるようにする
  const item = (inner: string, color: string) =>
    `<div style="margin:8px 0;padding:2px 0 2px 10px;border-left:3px solid ${color}">${inner}</div>`;
  const diff = (v: number | null) =>
    v === null
      ? "N/A"
      : Math.abs(v) < 0.005
        ? "±0.00"
        : v > 0
          ? `<span style="color:${COLOR.good}">▲+${v.toFixed(2)}</span>`
          : `<span style="color:${COLOR.bad}">▼−${Math.abs(v).toFixed(2)}</span>`;
  const parts: string[] = [];

  parts.push(`<h1 style="font-size:20px;margin:0;color:${COLOR.text}">Review Daily Report</h1>`);
  parts.push(p(`${escapeHtml(d.facilityName)} · ${escapeHtml(dateEn(d.date))}`, small));

  // 1. 本日のまとめ（1行）
  parts.push(h2("Today at a Glance"));
  parts.push(
    p(
      `Reviews <strong>${d.reviews.length}</strong>${reviewAvg !== null ? ` · avg ${reviewAvg.toFixed(2)}` : ""}` +
        `<span style="color:${COLOR.border}">　|　</span>` +
        `On-site <strong>${d.voices.length}</strong> ` +
        (openVoices > 0 ? badge(`${openVoices} Open`, COLOR.bad, COLOR.badBg) : d.voices.length > 0 ? badge("All resolved", COLOR.good, COLOR.goodBg) : ""),
      "font-size:14px",
    ),
  );

  // 2. 本日の口コミ（原文のまま。外国語は和訳を添える）
  parts.push(h2(`Today's Reviews (${d.reviews.length})`));
  if (d.reviews.length === 0) parts.push(p("本日の口コミはありません。", small));
  for (const r of d.reviews) {
    const color = r.rating >= 4 ? COLOR.good : r.rating >= 3 ? COLOR.warn : COLOR.bad;
    parts.push(
      item(
        p(
          `<span style="color:#d97706">${stars(r.rating)}</span> <strong>${ratingNum(r.rating)}</strong>　<span style="${small}">${escapeHtml(en(SITE_EN, r.site))}${r.language ? ` · ${escapeHtml(en(LANGUAGE_EN, r.language))}` : ""}</span>`,
          "font-size:13px",
        ) +
          p(r.original ? nl2br(r.original) : `<span style="${small}">（本文なし・評価のみの投稿）</span>`) +
          (r.translation ? p(`<span style="${small}">Japanese translation:</span> ${nl2br(r.translation)}`, "color:#4b5563") : ""),
        color,
      ),
    );
  }

  // 3. 本日受けた現場の声（原文のまま）
  parts.push(h2(`Today's On-site Feedback (${d.voices.length})`));
  if (d.voices.length === 0) parts.push(p("本日受けた現場の声はありません。", small));
  for (const v of d.voices) {
    const s = STATUS_STYLE[v.status] ?? { fg: COLOR.muted, bg: COLOR.neutralBg };
    parts.push(
      item(
        p(`${badge(en(STATUS_EN, v.status), s.fg, s.bg)} <span style="${small}">${escapeHtml(en(CHANNEL_EN, v.channel))} · ${escapeHtml(en(CUSTOMER_EN, v.customerType))}</span>`) +
          p(nl2br(v.content)) +
          (v.action ? p(`<span style="${small}">Action:</span> ${nl2br(v.action)}`, "color:#4b5563") : ""),
        s.fg,
      ),
    );
  }

  // 4. 月間の要約（最後に短く）
  parts.push(h2(`Monthly Summary — ${monthName}`));
  if (d.rating) {
    parts.push(
      p(
        `Rating <strong>${avgText(d.rating.monthAvg)}</strong> <span style="${small}">(${d.rating.monthCount} reviews)</span>　MoM ${diff(d.rating.momDiff)}　YoY ${diff(d.rating.yoyDiff)}`,
        "font-size:13px",
      ),
    );
  }
  // 要点だけ（件数の説明の行は省く）
  const keyLines = d.month.summaryLines.filter((l) => l.kind !== "overview");
  if (d.month.summaryLines.length === 0) {
    parts.push(p("この月の4軸分析はまだ行われていません。アプリで分析すると、次回から要約が入ります。", small));
  } else {
    parts.push(
      `<table style="border-collapse:collapse;margin:4px 0">${keyLines
        .map((l) => {
          const s = LINE_STYLE[l.kind] ?? LINE_STYLE.overview;
          return `<tr><td style="padding:2px 8px 2px 0;vertical-align:top;color:${s.color}">${s.mark}</td><td style="padding:2px 0">${escapeHtml(l.text)}</td></tr>`;
        })
        .join("")}</table>`,
    );
  }
  // AIの要約は1軸1行（不満 → 好評の順）
  const aiRows = d.month.aiSummary.filter((a) => a.text);
  if (aiRows.length > 0) {
    parts.push(p(`<span style="${small}">コメントの内容（AIが要約）</span>`, "margin-top:8px"));
    parts.push(
      `<table style="border-collapse:collapse;margin:2px 0">${aiRows
        .map((a) => {
          const bad = a.kind === "complaints";
          return (
            `<tr><td style="padding:3px 8px 3px 0;vertical-align:top;white-space:nowrap">${badge(en(AXIS_EN, a.label), bad ? COLOR.bad : COLOR.good, bad ? COLOR.badBg : COLOR.goodBg)}</td>` +
            `<td style="padding:3px 0">${escapeHtml(a.text)}</td></tr>`
          );
        })
        .join("")}</table>`,
    );
  }

  parts.push(`<p style="margin:22px 0 0;${small}">このメールは「口コミAI分析＆返信支援」アプリから自動で送信しています。</p>`);

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:16px;background:#ffffff;color:${COLOR.text};font-family:Arial,'Helvetica Neue','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;font-size:14px;line-height:1.6"><div style="max-width:600px;margin:0 auto">${parts.join("")}</div></body></html>`;

  // ---- テキスト版（HTMLを表示できないメールソフト向け） ----
  const t: string[] = [subject, `${d.facilityName} · ${dateEn(d.date)}`, ""];
  t.push(`Reviews ${d.reviews.length}${reviewAvg !== null ? ` (avg ${reviewAvg.toFixed(2)})` : ""} | On-site ${d.voices.length} (${openVoices} Open)`, "");
  t.push(`TODAY'S REVIEWS (${d.reviews.length})`);
  for (const r of d.reviews) {
    t.push(`- ${stars(r.rating)} ${ratingNum(r.rating)} ${en(SITE_EN, r.site)}: ${r.original || "（評価のみ）"}`);
    if (r.translation) t.push(`  Japanese translation: ${r.translation}`);
  }
  t.push("", `TODAY'S ON-SITE FEEDBACK (${d.voices.length})`);
  for (const v of d.voices)
    t.push(`- [${en(STATUS_EN, v.status)}] ${en(CHANNEL_EN, v.channel)}: ${v.content}${v.action ? ` / Action: ${v.action}` : ""}`);
  t.push("", `MONTHLY SUMMARY — ${monthName}`);
  if (d.rating)
    t.push(`Rating ${avgText(d.rating.monthAvg)} (${d.rating.monthCount} reviews) MoM ${diffText(d.rating.momDiff)} YoY ${diffText(d.rating.yoyDiff)}`);
  if (d.month.summaryLines.length === 0) t.push("（この月の4軸分析はまだ行われていません）");
  for (const l of keyLines) t.push(`${(LINE_STYLE[l.kind] ?? LINE_STYLE.overview).mark} ${l.text}`);
  for (const a of aiRows) t.push(`[${en(AXIS_EN, a.label)}] ${a.text}`);

  return { subject, html, text: t.join("\n") };
}

// サーバーで受け取ったデータの形と量を確かめる（問題があれば日本語の理由を返す）
export function validateDailyEmailData(x: unknown): DailyEmailData | string {
  const isStr = (v: unknown, max = EMAIL_LIMITS.textLength) => typeof v === "string" && v.length <= max;
  const isOptStr = (v: unknown, max?: number) => v === undefined || isStr(v, max);
  const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const isNumOrNull = (v: unknown) => v === null || isNum(v);
  const isMonth = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
  const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (typeof x !== "object" || x === null) return "データがありません";
  const d = x as DailyEmailData;
  if (!isStr(d.facilityName, 100) || !isDate(d.date)) return "日付か施設名が正しくありません";
  if (!Array.isArray(d.reviews) || d.reviews.length > EMAIL_LIMITS.reviews) return "口コミのデータが正しくないか、多すぎます";
  if (
    !d.reviews.every(
      (r) => isStr(r.site, 100) && isNum(r.rating) && isStr(r.original) && isOptStr(r.translation) && isOptStr(r.language, 50),
    )
  )
    return "口コミのデータの形が正しくありません";
  if (!Array.isArray(d.voices) || d.voices.length > EMAIL_LIMITS.voices) return "現場の声のデータが正しくないか、多すぎます";
  if (!d.voices.every((v) => isStr(v.channel, 50) && isStr(v.customerType, 50) && isStr(v.content) && isStr(v.status, 20) && isStr(v.action)))
    return "現場の声のデータの形が正しくありません";
  const m = d.month;
  if (!m || !isMonth(m.key) || !Array.isArray(m.summaryLines) || !Array.isArray(m.aiSummary)) return "要約のデータが正しくありません";
  if (m.summaryLines.length > EMAIL_LIMITS.lines || !m.summaryLines.every((l) => isStr(l.kind, 20) && isStr(l.text) && isStr(l.textEn)))
    return "要約のデータの形が正しくありません";
  if (
    m.aiSummary.length > EMAIL_LIMITS.lines ||
    !m.aiSummary.every(
      (a) => (a.kind === "complaints" || a.kind === "praises") && isStr(a.label, 50) && isNum(a.count) && isStr(a.text),
    )
  )
    return "AIの要約のデータの形が正しくありません";
  const r = d.rating;
  if (r !== null) {
    if (
      typeof r !== "object" ||
      !isMonth(r.monthKey) ||
      !isNumOrNull(r.monthAvg) ||
      !isNum(r.monthCount) ||
      !isNumOrNull(r.momDiff) ||
      !isNumOrNull(r.yoyDiff)
    )
      return "評価点のデータの形が正しくありません";
  }
  return d;
}
