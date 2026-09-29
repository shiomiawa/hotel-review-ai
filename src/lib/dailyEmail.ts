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
  monthShortEn,
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
  rating: {
    latestDate: string; // 評価点の集計に使った口コミの最新日
    todayAvg: number | null;
    todayCount: number;
    monthKey: string;
    monthAvg: number | null;
    monthCount: number;
    momDiff: number | null;
    yoyDiff: number | null;
    months: { month: string; avg: number | null; count: number }[]; // 直近の月別
  } | null;
};

// 送れる量の上限（使いすぎ・いたずら対策）
export const EMAIL_LIMITS = { reviews: 200, voices: 200, textLength: 2000, lines: 30, months: 13 };

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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const emailSubject = (date: string) => `Review Daily Report (${dotDate(date)})`;

// 見出し・項目名・バッジは英語、要約などの文章は日本語。口コミ・現場の声は原文のまま載せ、外国語の口コミには和訳を添える
export function buildDailyEmail(d: DailyEmailData): { subject: string; html: string; text: string } {
  const subject = emailSubject(d.date);
  const openVoices = d.voices.filter((v) => v.status !== "完了").length;
  const reviewAvg = d.reviews.length ? d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length : null;
  const monthName = monthEn(d.month.key);

  // ---- HTML（メールソフトでも崩れにくいよう、装飾はインラインで最小限） ----
  const small = `color:${COLOR.muted};font-size:12px`;
  const h2 = (t: string) =>
    `<h2 style="font-size:15px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid ${COLOR.accent};color:${COLOR.accent};text-transform:none">${escapeHtml(t)}</h2>`;
  const p = (t: string, style = "") => `<p style="margin:4px 0;${style}">${t}</p>`;
  const card = (inner: string, borderColor = COLOR.border) =>
    `<div style="margin:10px 0;padding:10px 12px;border:1px solid ${COLOR.border};border-left:4px solid ${borderColor};border-radius:6px">${inner}</div>`;
  const parts: string[] = [];

  parts.push(`<h1 style="font-size:22px;margin:0;color:${COLOR.text}">Review Daily Report</h1>`);
  parts.push(p(`${escapeHtml(d.facilityName)} · ${escapeHtml(dateEn(d.date))}`, `color:${COLOR.muted}`));

  // 1. 本日のまとめ（数字を大きく）
  parts.push(h2("Today at a Glance"));
  const stat = (label: string, value: string, note: string) =>
    `<td style="width:50%;padding:12px 14px;background:${COLOR.neutralBg};border-radius:8px;vertical-align:top">` +
    `<div style="${small}">${escapeHtml(label)}</div>` +
    `<div style="font-size:26px;font-weight:bold;color:${COLOR.text};line-height:1.3">${escapeHtml(value)}</div>` +
    `<div style="margin-top:2px">${note}</div></td>`;
  parts.push(
    `<table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 -8px"><tr>` +
      stat("Online reviews", String(d.reviews.length), reviewAvg !== null ? `<span style="${small}">avg. ${reviewAvg.toFixed(2)} / 5</span>` : `<span style="${small}">—</span>`) +
      stat(
        "On-site feedback",
        String(d.voices.length),
        openVoices > 0 ? badge(`${openVoices} Open`, COLOR.bad, COLOR.badBg) : badge("All resolved", COLOR.good, COLOR.goodBg),
      ) +
      `</tr></table>`,
  );

  // 2. 月の要約
  parts.push(h2(`Monthly Summary — ${monthName}`));
  if (d.month.summaryLines.length === 0) {
    parts.push(p("この月の4軸分析はまだ行われていません。アプリの分析ダッシュボードで「月」を選び「分析する」を押すと、次回から要約が入ります。", small));
  } else {
    parts.push(
      `<table style="border-collapse:collapse;margin:2px 0">${d.month.summaryLines
        .map((l) => {
          const s = LINE_STYLE[l.kind] ?? LINE_STYLE.overview;
          return `<tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:${s.color};font-weight:bold">${s.mark}</td><td style="padding:4px 0;color:${COLOR.text}">${escapeHtml(l.text)}</td></tr>`;
        })
        .join("")}</table>`,
    );
  }
  for (const kind of ["complaints", "praises"] as const) {
    const rows = d.month.aiSummary.filter((a) => a.kind === kind && a.text);
    if (rows.length === 0) continue;
    const isBad = kind === "complaints";
    parts.push(
      p(
        `<strong style="color:${isBad ? COLOR.bad : COLOR.good}">${isBad ? "What guests complained about" : "What guests praised"}</strong>` +
          ` <span style="${small}">（AIがコメントを読んで作成・件数はアプリが集計）</span>`,
        "margin-top:14px",
      ),
    );
    for (const a of rows) {
      parts.push(
        card(
          p(
            `${badge(en(AXIS_EN, a.label), isBad ? COLOR.bad : COLOR.good, isBad ? COLOR.badBg : COLOR.goodBg)}` +
              ` <span style="${small}">${plural(a.count, isBad ? "complaint" : "positive comment")}</span>`,
          ) + p(escapeHtml(a.text), `color:${COLOR.text}`),
          isBad ? COLOR.bad : COLOR.good,
        ),
      );
    }
  }

  // 3. 評価点の推移
  parts.push(h2("Rating Trend (Online Reviews)"));
  if (!d.rating) {
    parts.push(p("口コミCSVが読み込まれていないため、評価点の推移はありません。", small));
  } else {
    const r = d.rating;
    const diff = (v: number | null) =>
      v === null
        ? `<span style="${small}">N/A</span>`
        : Math.abs(v) < 0.005
          ? `<span style="color:${COLOR.muted}">±0.00</span>`
          : v > 0
            ? `<span style="color:${COLOR.good};font-weight:bold">▲ +${v.toFixed(2)}</span>`
            : `<span style="color:${COLOR.bad};font-weight:bold">▼ −${Math.abs(v).toFixed(2)}</span>`;
    const rows: [string, string][] = [
      [`Average on ${dateEn(r.latestDate)}`, `<strong>${avgText(r.todayAvg)}</strong> <span style="${small}">(${plural(r.todayCount, "review")})</span>`],
      [`Average for ${monthEn(r.monthKey)}`, `<strong>${avgText(r.monthAvg)}</strong> <span style="${small}">(${plural(r.monthCount, "review")})</span>`],
      ["Month-over-month", diff(r.momDiff)],
      ["Year-over-year", diff(r.yoyDiff)],
    ];
    parts.push(
      `<table style="border-collapse:collapse;font-size:14px;margin:2px 0">${rows
        .map(([k, v]) => `<tr><td style="padding:4px 18px 4px 0;color:${COLOR.muted}">${escapeHtml(k)}</td><td style="padding:4px 0">${v}</td></tr>`)
        .join("")}</table>`,
    );
    if (r.months.length > 0) {
      parts.push(
        `<table style="border-collapse:collapse;font-size:13px;margin:10px 0"><tr>${r.months
          .map((m) => `<th style="padding:4px 9px;border-bottom:1px solid ${COLOR.border};font-weight:normal;color:${COLOR.muted}">${escapeHtml(monthShortEn(m.month))}</th>`)
          .join("")}</tr><tr>${r.months
          .map((m) => `<td style="padding:4px 9px;text-align:center;color:${COLOR.text}">${avgText(m.avg)}</td>`)
          .join("")}</tr></table>`,
      );
    }
  }

  // 4. 本日の口コミ（原文のまま。外国語は和訳を添える）
  parts.push(h2(`Today's Online Reviews (${d.reviews.length})`));
  if (d.reviews.length === 0) parts.push(p("本日の口コミはありません。", small));
  for (const r of d.reviews) {
    const color = r.rating >= 4 ? COLOR.good : r.rating >= 3 ? COLOR.warn : COLOR.bad;
    parts.push(
      card(
        p(
          `<span style="color:#d97706;letter-spacing:1px">${stars(r.rating)}</span> <strong>${ratingNum(r.rating)}</strong>` +
            `　<span style="${small}">${escapeHtml(en(SITE_EN, r.site))}</span>` +
            (r.language ? ` ${badge(en(LANGUAGE_EN, r.language), COLOR.info, COLOR.infoBg)}` : ""),
        ) +
          p(r.original ? nl2br(r.original) : `<span style="${small}">（本文なし・評価のみの投稿）</span>`, `color:${COLOR.text}`) +
          (r.translation
            ? `<div style="margin-top:8px;padding:8px 10px;background:${COLOR.neutralBg};border-radius:4px"><div style="${small}">Japanese translation</div><div style="color:${COLOR.text}">${nl2br(r.translation)}</div></div>`
            : ""),
        color,
      ),
    );
  }

  // 5. 本日受けた現場の声（原文のまま）
  parts.push(h2(`Today's On-site Feedback (${d.voices.length})`));
  if (d.voices.length === 0) parts.push(p("本日受けた現場の声はありません。", small));
  for (const v of d.voices) {
    const s = STATUS_STYLE[v.status] ?? { fg: COLOR.muted, bg: COLOR.neutralBg };
    parts.push(
      card(
        p(
          `${badge(en(STATUS_EN, v.status), s.fg, s.bg)}　<strong>${escapeHtml(en(CHANNEL_EN, v.channel))}</strong>` +
            `　<span style="${small}">${escapeHtml(en(CUSTOMER_EN, v.customerType))}</span>`,
        ) +
          p(nl2br(v.content), `color:${COLOR.text}`) +
          (v.action ? p(`<span style="${small}">Action taken:</span> ${nl2br(v.action)}`, `color:${COLOR.text}`) : ""),
        s.fg,
      ),
    );
  }

  parts.push(`<p style="margin:28px 0 0;${small}">このメールは「口コミAI分析＆返信支援」アプリから自動で送信しています。</p>`);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:16px;background:#ffffff;color:${COLOR.text};font-family:Arial,'Helvetica Neue','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;line-height:1.6"><div style="max-width:640px;margin:0 auto">${parts.join("")}</div></body></html>`;

  // ---- テキスト版（HTMLを表示できないメールソフト向け） ----
  const t: string[] = [subject, `${d.facilityName} · ${dateEn(d.date)}`, ""];
  t.push("TODAY AT A GLANCE", `Online reviews: ${d.reviews.length}${reviewAvg !== null ? ` (avg. ${reviewAvg.toFixed(2)})` : ""}`, `On-site feedback: ${d.voices.length} (${openVoices} open)`, "");
  t.push(`MONTHLY SUMMARY — ${monthName}`);
  if (d.month.summaryLines.length === 0) t.push("（この月の4軸分析はまだ行われていません）");
  for (const l of d.month.summaryLines) t.push(`${(LINE_STYLE[l.kind] ?? LINE_STYLE.overview).mark} ${l.text}`);
  for (const a of d.month.aiSummary.filter((x) => x.text))
    t.push(`${a.kind === "complaints" ? "▲" : "✓"} ${en(AXIS_EN, a.label)} (${a.count}): ${a.text}`);
  t.push("");
  if (d.rating) {
    t.push(
      "RATING TREND",
      `Average on ${dateEn(d.rating.latestDate)}: ${avgText(d.rating.todayAvg)} (${d.rating.todayCount})`,
      `Average for ${monthEn(d.rating.monthKey)}: ${avgText(d.rating.monthAvg)} (${d.rating.monthCount})`,
      `Month-over-month: ${diffText(d.rating.momDiff)} / Year-over-year: ${diffText(d.rating.yoyDiff)}`,
      "",
    );
  }
  t.push(`TODAY'S ONLINE REVIEWS (${d.reviews.length})`);
  for (const r of d.reviews) {
    t.push(`- ${stars(r.rating)} ${ratingNum(r.rating)} ${en(SITE_EN, r.site)}: ${r.original || "（評価のみ）"}`);
    if (r.translation) t.push(`  Japanese translation: ${r.translation}`);
  }
  t.push("", `TODAY'S ON-SITE FEEDBACK (${d.voices.length})`);
  for (const v of d.voices)
    t.push(
      `- [${en(STATUS_EN, v.status)}] ${en(CHANNEL_EN, v.channel)} (${en(CUSTOMER_EN, v.customerType)}): ${v.content}${v.action ? ` / Action taken: ${v.action}` : ""}`,
    );

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
      !isDate(r.latestDate) ||
      !isNumOrNull(r.todayAvg) ||
      !isNum(r.todayCount) ||
      !isMonth(r.monthKey) ||
      !isNumOrNull(r.monthAvg) ||
      !isNum(r.monthCount) ||
      !isNumOrNull(r.momDiff) ||
      !isNumOrNull(r.yoyDiff) ||
      !Array.isArray(r.months) ||
      r.months.length > EMAIL_LIMITS.months ||
      !r.months.every((mm) => isMonth(mm.month) && isNumOrNull(mm.avg) && isNum(mm.count))
    )
      return "評価点のデータの形が正しくありません";
  }
  return d;
}
