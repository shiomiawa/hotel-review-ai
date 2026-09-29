import {
  AXIS_EN,
  CHANNEL_EN,
  CUSTOMER_EN,
  LANGUAGE_EN,
  STATUS_EN,
  dateEn,
  dotDate,
  en,
  monthEn,
  monthShortEn,
} from "@/lib/i18n";

// 日次メールの中身（件名・HTML・テキスト）を作る。外資系ホテル向けに、英語と日本語を併記する。
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
    aiSummary: { kind: "complaints" | "praises"; label: string; count: number; text: string; textEn: string }[]; // AIの要約（なければ空）
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

const MARK: Record<string, string> = { priority: "！", worse: "▲", better: "▼", good: "✓", voices: "□" };

export const emailSubject = (date: string) => `Review Daily Report (${dotDate(date)})`;

export function buildDailyEmail(d: DailyEmailData): { subject: string; html: string; text: string } {
  const subject = emailSubject(d.date);
  const openVoices = d.voices.filter((v) => v.status !== "完了").length;
  const reviewAvg = d.reviews.length ? d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length : null;
  const monthName = monthEn(d.month.key);

  // ---- HTML（メールソフトでも崩れにくいよう、装飾はインラインで最小限） ----
  const muted = "color:#666;font-size:12px";
  const jaStyle = "color:#555;font-size:13px";
  const h2 = (enText: string, ja: string) =>
    `<h2 style="font-size:16px;margin:24px 0 8px;padding-bottom:4px;border-bottom:2px solid #0f766e;color:#0f4f4a">${escapeHtml(enText)}<span style="font-size:12px;font-weight:normal;color:#5b7c79;margin-left:8px">${escapeHtml(ja)}</span></h2>`;
  const p = (t: string, style = "") => `<p style="margin:4px 0;${style}">${t}</p>`;
  const card = (inner: string) => `<div style="margin:8px 0;padding:8px 10px;border:1px solid #e3e3e0;border-radius:6px">${inner}</div>`;
  const parts: string[] = [];

  parts.push(`<h1 style="font-size:20px;margin:0">${escapeHtml(subject)}</h1>`);
  parts.push(p(`${escapeHtml(d.facilityName)}｜${escapeHtml(dateEn(d.date))}`, "color:#444"));
  parts.push(p("Daily summary of online reviews and on-site guest feedback. / ネットの口コミと現場のお客様の声をまとめた日次レポートです。", muted));

  // 1. 本日のまとめ
  parts.push(h2("1. Today at a Glance", "本日のまとめ"));
  parts.push(
    p(
      `Online reviews: <strong>${d.reviews.length}</strong>${reviewAvg !== null ? ` (avg. ${reviewAvg.toFixed(2)})` : ""}` +
        `　／　On-site feedback: <strong>${d.voices.length}</strong>${openVoices > 0 ? ` (${openVoices} open)` : ""}`,
    ) +
      p(
        `ネットの口コミ ${d.reviews.length}件${reviewAvg !== null ? `（平均 ${reviewAvg.toFixed(2)}）` : ""}／現場の声 ${d.voices.length}件${openVoices > 0 ? `（未完了 ${openVoices}件）` : ""}`,
        jaStyle,
      ),
  );

  // 2. 月の要約
  parts.push(h2(`2. Monthly Summary — ${monthName}`, "今月の要約（ネットの口コミ＋現場の声）"));
  if (d.month.summaryLines.length === 0) {
    parts.push(p("The 4-category analysis for this month has not been run yet.", muted));
    parts.push(p("この月の4軸分析はまだ行われていません。アプリの分析ダッシュボードで「月」を選び「分析する」を押すと、次回から要約が入ります。", muted));
  } else {
    parts.push(
      `<ul style="margin:4px 0;padding-left:0;list-style:none">${d.month.summaryLines
        .map(
          (l) =>
            `<li style="margin:6px 0">${escapeHtml(MARK[l.kind] ?? "・")} ${escapeHtml(l.textEn)}<br><span style="${jaStyle}">${escapeHtml(l.text)}</span></li>`,
        )
        .join("")}</ul>`,
    );
  }
  for (const kind of ["complaints", "praises"] as const) {
    const rows = d.month.aiSummary.filter((a) => a.kind === kind);
    if (rows.length === 0) continue;
    parts.push(
      p(
        `<strong>${kind === "complaints" ? "What guests complained about" : "What guests praised"}</strong>` +
          `<span style="${muted}">　${kind === "complaints" ? "不満の内容" : "好評の内容"}（AI summary of comments; counts by the app / AIがコメントを読んで作成。件数はアプリが集計）</span>`,
      ),
    );
    parts.push(
      `<ul style="margin:4px 0;padding-left:0;list-style:none">${rows
        .map((a) => {
          const labelEn = en(AXIS_EN, a.label);
          const mark = kind === "complaints" ? "▲" : "✓";
          const countEn = `${a.count} ${kind === "complaints" ? "complaint" : "positive comment"}${a.count === 1 ? "" : "s"}`;
          const countJa = `${kind === "complaints" ? "不満" : "好評"}${a.count}件`;
          return (
            `<li style="margin:6px 0">${mark} <strong>${escapeHtml(labelEn)} (${countEn})</strong>: ${escapeHtml(a.textEn)}` +
            `<br><span style="${jaStyle}">${escapeHtml(a.label)}（${countJa}）：${escapeHtml(a.text)}</span></li>`
          );
        })
        .join("")}</ul>`,
    );
  }

  // 3. 評価点の推移
  parts.push(h2("3. Rating Trend (Online Reviews)", "評価点の推移（ネットの口コミ）"));
  if (!d.rating) {
    parts.push(p("No review CSV has been loaded. / 口コミCSVが読み込まれていないため、評価点の推移はありません。", muted));
  } else {
    const r = d.rating;
    const rows: [string, string, string][] = [
      [`Average on ${dateEn(r.latestDate)}`, "最新日の平均", `${avgText(r.todayAvg)} (${r.todayCount})`],
      [`Average for ${monthEn(r.monthKey)}`, "今月の平均", `${avgText(r.monthAvg)} (${r.monthCount})`],
      ["Month-over-month", "前月比", diffText(r.momDiff)],
      ["Year-over-year", "前年比", diffText(r.yoyDiff)],
    ];
    parts.push(
      `<table style="border-collapse:collapse;font-size:14px;margin:4px 0">${rows
        .map(
          ([k, ja, v]) =>
            `<tr><td style="padding:3px 14px 3px 0;color:#333">${escapeHtml(k)}<br><span style="${muted}">${escapeHtml(ja)}</span></td><td style="padding:3px 0"><strong>${escapeHtml(v)}</strong></td></tr>`,
        )
        .join("")}</table>`,
    );
    if (r.months.length > 0) {
      parts.push(
        `<table style="border-collapse:collapse;font-size:13px;margin:8px 0"><tr>${r.months
          .map((m) => `<th style="padding:3px 8px;border-bottom:1px solid #ccc;font-weight:normal;color:#666">${escapeHtml(monthShortEn(m.month))}</th>`)
          .join("")}</tr><tr>${r.months
          .map((m) => `<td style="padding:3px 8px;text-align:center">${avgText(m.avg)}<br><span style="${muted}">${m.count}</span></td>`)
          .join("")}</tr></table>`,
      );
    }
  }

  // 4. 本日の口コミ（原文のまま。外国語は和訳を添える）
  parts.push(h2(`4. Today's Online Reviews (${d.reviews.length})`, "本日の口コミ（原文）"));
  if (d.reviews.length === 0) parts.push(p("No reviews today. / 本日の口コミはありません。", muted));
  for (const r of d.reviews) {
    const lang = r.language ? `　<span style="${muted}">${escapeHtml(en(LANGUAGE_EN, r.language))}</span>` : "";
    parts.push(
      card(
        p(`<span style="color:#b7791f">${stars(r.rating)}</span> ${ratingNum(r.rating)}　${escapeHtml(r.site)}${lang}`) +
          p(r.original ? nl2br(r.original) : `<span style="${muted}">(Rating only, no comment) / 本文なし・評価のみの投稿</span>`) +
          (r.translation
            ? `<div style="margin-top:6px;padding:6px 8px;background:#f5f7f7;border-radius:4px"><span style="${muted}">Japanese translation / 和訳</span><br><span style="${jaStyle}">${nl2br(r.translation)}</span></div>`
            : ""),
      ),
    );
  }

  // 5. 本日受けた現場の声（原文のまま）
  parts.push(h2(`5. Today's On-site Feedback (${d.voices.length})`, "本日受けた現場の声"));
  if (d.voices.length === 0) parts.push(p("No on-site feedback today. / 本日受けた現場の声はありません。", muted));
  for (const v of d.voices) {
    parts.push(
      card(
        p(
          `<strong>${escapeHtml(en(STATUS_EN, v.status))}</strong> <span style="${muted}">${escapeHtml(v.status)}</span>` +
            `　${escapeHtml(en(CHANNEL_EN, v.channel))} <span style="${muted}">${escapeHtml(v.channel)}</span>` +
            `　${escapeHtml(en(CUSTOMER_EN, v.customerType))} <span style="${muted}">${escapeHtml(v.customerType)}</span>`,
        ) +
          p(nl2br(v.content)) +
          (v.action ? p(`Action taken / 対応：${nl2br(v.action)}`, "color:#444") : ""),
      ),
    );
  }

  parts.push(
    `<p style="margin:24px 0 0;${muted}">This report was sent automatically by the Review Analysis app. / このメールは「口コミAI分析＆返信支援」アプリから送信しています。</p>`,
  );

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:16px;background:#ffffff;color:#1f1f1f;font-family:Arial,'Helvetica Neue','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;line-height:1.6"><div style="max-width:640px;margin:0 auto">${parts.join("")}</div></body></html>`;

  // ---- テキスト版（HTMLを表示できないメールソフト向け） ----
  const t: string[] = [subject, `${d.facilityName} | ${dateEn(d.date)}`, ""];
  t.push(
    "■ 1. Today at a Glance / 本日のまとめ",
    `Online reviews: ${d.reviews.length} / On-site feedback: ${d.voices.length} (${openVoices} open)`,
    `ネットの口コミ ${d.reviews.length}件／現場の声 ${d.voices.length}件（未完了 ${openVoices}件）`,
    "",
  );
  t.push(`■ 2. Monthly Summary — ${monthName} / 今月の要約`);
  if (d.month.summaryLines.length === 0) t.push("(Not analyzed yet / この月の4軸分析はまだ行われていません)");
  for (const l of d.month.summaryLines) t.push(`${MARK[l.kind] ?? "・"} ${l.textEn}`, `  ${l.text}`);
  for (const a of d.month.aiSummary)
    t.push(
      `${a.kind === "complaints" ? "▲" : "✓"} ${en(AXIS_EN, a.label)} (${a.count}): ${a.textEn}`,
      `  ${a.label}（${a.count}件）：${a.text}`,
    );
  t.push("");
  if (d.rating) {
    t.push(
      "■ 3. Rating Trend / 評価点の推移",
      `Average on ${dateEn(d.rating.latestDate)}: ${avgText(d.rating.todayAvg)} (${d.rating.todayCount})`,
      `Average for ${monthEn(d.rating.monthKey)}: ${avgText(d.rating.monthAvg)} (${d.rating.monthCount})`,
      `Month-over-month: ${diffText(d.rating.momDiff)} / Year-over-year: ${diffText(d.rating.yoyDiff)}`,
      "",
    );
  }
  t.push(`■ 4. Today's Online Reviews (${d.reviews.length}) / 本日の口コミ`);
  for (const r of d.reviews) {
    t.push(`・${stars(r.rating)} ${r.site}: ${r.original || "(rating only)"}`);
    if (r.translation) t.push(`  和訳：${r.translation}`);
  }
  t.push("", `■ 5. Today's On-site Feedback (${d.voices.length}) / 本日受けた現場の声`);
  for (const v of d.voices)
    t.push(
      `・[${en(STATUS_EN, v.status)}] ${en(CHANNEL_EN, v.channel)} (${en(CUSTOMER_EN, v.customerType)}): ${v.content}${v.action ? ` / Action: ${v.action}` : ""}`,
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
      (a) => (a.kind === "complaints" || a.kind === "praises") && isStr(a.label, 50) && isNum(a.count) && isStr(a.text) && isStr(a.textEn),
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
