// 日次メールの中身（件名・HTML・テキスト）を作る。
// 画面のプレビューとサーバーの送信の両方で同じ関数を使い、見た目をそろえる。
// お客様の文章はそのままHTMLにせず、必ずエスケープする。

export type DailyEmailData = {
  facilityName: string;
  date: string; // 当日（YYYY-MM-DD）
  reviews: { site: string; rating: number; text: string; language?: string }[]; // 当日の口コミ
  voices: { channel: string; customerType: string; content: string; status: string; action: string }[]; // 当日の現場の声
  month: {
    label: string; // 例：2026年9月
    summaryLines: { kind: string; text: string }[]; // 数値から作った要約（分析していなければ空）
    aiSummary: { kind: "complaints" | "praises"; label: string; count: number; text: string }[]; // AIの要約（なければ空）
  };
  rating: {
    latestDate: string; // 評価点の集計に使った口コミの最新日
    todayAvg: number | null;
    todayCount: number;
    monthLabel: string;
    monthAvg: number | null;
    monthCount: number;
    momDiff: number | null;
    yoyDiff: number | null;
    months: { label: string; avg: number | null; count: number }[]; // 直近の月別
  } | null;
};

// 送れる量の上限（使いすぎ・いたずら対策）
export const EMAIL_LIMITS = { reviews: 200, voices: 200, textLength: 2000, lines: 30, months: 13 };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const nl2br = (s: string) => escapeHtml(s).replace(/\r?\n/g, "<br>");
const jpDate = (d: string) => `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
const avgText = (v: number | null) => (v === null ? "―" : v.toFixed(2));
const diffText = (v: number | null) =>
  v === null ? "比較なし" : Math.abs(v) < 0.005 ? "±0.00" : v > 0 ? `▲ +${v.toFixed(2)}（上昇）` : `▼ −${Math.abs(v).toFixed(2)}（低下）`;
const stars = (r: number) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));

const MARK: Record<string, string> = { priority: "！", worse: "▲", better: "▼", good: "✓", voices: "□" };

export function buildDailyEmail(d: DailyEmailData): { subject: string; html: string; text: string } {
  const subject = `【日次レポート】${jpDate(d.date)}（${d.facilityName}）`;
  const openVoices = d.voices.filter((v) => v.status !== "完了").length;
  const reviewAvg = d.reviews.length ? d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length : null;

  // ---- HTML（メールソフトでも崩れにくいよう、装飾はインラインで最小限） ----
  const h2 = (t: string) =>
    `<h2 style="font-size:16px;margin:24px 0 8px;padding-bottom:4px;border-bottom:2px solid #0f766e;color:#0f4f4a">${escapeHtml(t)}</h2>`;
  const p = (t: string, style = "") => `<p style="margin:4px 0;${style}">${t}</p>`;
  const muted = "color:#666;font-size:12px";
  const parts: string[] = [];

  parts.push(`<h1 style="font-size:18px;margin:0 0 4px">${escapeHtml(subject)}</h1>`);
  parts.push(p("ネットの口コミと現場のお客様の声をまとめた、本日のレポートです。", muted));

  parts.push(h2("1. 本日のまとめ"));
  parts.push(
    p(
      `ネットの口コミ <strong>${d.reviews.length}件</strong>` +
        (reviewAvg !== null ? `（平均 ${reviewAvg.toFixed(2)}）` : "") +
        `／現場の声 <strong>${d.voices.length}件</strong>` +
        (openVoices > 0 ? `（対応が完了していないもの ${openVoices}件）` : ""),
    ),
  );

  parts.push(h2(`2. ${d.month.label}の要約（ネットの口コミ＋現場の声）`));
  if (d.month.summaryLines.length === 0) {
    parts.push(p("この月の4軸分析はまだ行われていません。アプリの分析ダッシュボードで「月」を選び「分析する」を押すと、次回から要約が入ります。", muted));
  } else {
    parts.push(
      `<ul style="margin:4px 0;padding-left:0;list-style:none">${d.month.summaryLines
        .map((l) => `<li style="margin:3px 0">${escapeHtml(MARK[l.kind] ?? "・")} ${escapeHtml(l.text)}</li>`)
        .join("")}</ul>`,
    );
  }
  for (const kind of ["complaints", "praises"] as const) {
    const rows = d.month.aiSummary.filter((a) => a.kind === kind);
    if (rows.length === 0) continue;
    parts.push(p(`<strong>${kind === "complaints" ? "不満の内容" : "好評の内容"}</strong>（AIがコメントを読んで作成。件数はアプリが数えた値）`));
    parts.push(
      `<ul style="margin:4px 0;padding-left:0;list-style:none">${rows
        .map(
          (a) =>
            `<li style="margin:3px 0">${kind === "complaints" ? "▲" : "✓"} <strong>${escapeHtml(a.label)}（${kind === "complaints" ? "不満" : "好評"}${a.count}件）</strong>：${escapeHtml(a.text)}</li>`,
        )
        .join("")}</ul>`,
    );
  }

  parts.push(h2("3. 評価点の推移（ネットの口コミ）"));
  if (!d.rating) {
    parts.push(p("口コミCSVが読み込まれていないため、評価点の推移はありません。", muted));
  } else {
    const r = d.rating;
    parts.push(
      `<table style="border-collapse:collapse;font-size:14px;margin:4px 0">` +
        [
          [`最新日（${jpDate(r.latestDate)}）の平均`, `${avgText(r.todayAvg)}（${r.todayCount}件）`],
          [`${r.monthLabel}の平均`, `${avgText(r.monthAvg)}（${r.monthCount}件）`],
          ["前月比（平均点の差）", diffText(r.momDiff)],
          ["前年比（平均点の差）", diffText(r.yoyDiff)],
        ]
          .map(
            ([k, v]) =>
              `<tr><td style="padding:3px 12px 3px 0;color:#444">${escapeHtml(k)}</td><td style="padding:3px 0"><strong>${escapeHtml(v)}</strong></td></tr>`,
          )
          .join("") +
        `</table>`,
    );
    if (r.months.length > 0) {
      parts.push(
        `<table style="border-collapse:collapse;font-size:13px;margin:8px 0"><tr>${r.months
          .map((m) => `<th style="padding:3px 8px;border-bottom:1px solid #ccc;font-weight:normal;color:#666">${escapeHtml(m.label)}</th>`)
          .join("")}</tr><tr>${r.months
          .map((m) => `<td style="padding:3px 8px;text-align:center">${avgText(m.avg)}<br><span style="${muted}">${m.count}件</span></td>`)
          .join("")}</tr></table>`,
      );
    }
  }

  parts.push(h2(`4. 本日の口コミ（${d.reviews.length}件）`));
  if (d.reviews.length === 0) parts.push(p("本日の口コミはありません。", muted));
  for (const r of d.reviews) {
    parts.push(
      `<div style="margin:8px 0;padding:8px 10px;border:1px solid #e3e3e0;border-radius:6px">` +
        p(`<span style="color:#b7791f">${stars(r.rating)}</span> ${r.rating % 1 ? r.rating.toFixed(1) : r.rating}　${escapeHtml(r.site)}${r.language ? `　<span style="${muted}">${escapeHtml(r.language)}・日本語訳</span>` : ""}`) +
        p(r.text ? nl2br(r.text) : `<span style="${muted}">（本文なし・評価のみの投稿）</span>`) +
        `</div>`,
    );
  }

  parts.push(h2(`5. 本日受けた現場の声（${d.voices.length}件）`));
  if (d.voices.length === 0) parts.push(p("本日受けた現場の声はありません。", muted));
  for (const v of d.voices) {
    parts.push(
      `<div style="margin:8px 0;padding:8px 10px;border:1px solid #e3e3e0;border-radius:6px">` +
        p(`<strong>${escapeHtml(v.status)}</strong>　${escapeHtml(v.channel)}　<span style="${muted}">${escapeHtml(v.customerType)}</span>`) +
        p(nl2br(v.content)) +
        (v.action ? p(`対応：${nl2br(v.action)}`, "color:#444") : "") +
        `</div>`,
    );
  }

  parts.push(`<p style="margin:24px 0 0;${muted}">このメールは「口コミAI分析＆返信支援」アプリから送信しています。</p>`);

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:16px;background:#ffffff;color:#1f1f1f;font-family:'Hiragino Sans','Yu Gothic','Meiryo',sans-serif;line-height:1.6"><div style="max-width:640px;margin:0 auto">${parts.join("")}</div></body></html>`;

  // ---- テキスト版（HTMLを表示できないメールソフト向け） ----
  const t: string[] = [subject, ""];
  t.push("■1. 本日のまとめ", `ネットの口コミ ${d.reviews.length}件／現場の声 ${d.voices.length}件（未完了 ${openVoices}件）`, "");
  t.push(`■2. ${d.month.label}の要約`);
  if (d.month.summaryLines.length === 0) t.push("（この月の4軸分析はまだ行われていません）");
  for (const l of d.month.summaryLines) t.push(`${MARK[l.kind] ?? "・"} ${l.text}`);
  for (const a of d.month.aiSummary)
    t.push(`${a.kind === "complaints" ? "▲" : "✓"} ${a.label}（${a.kind === "complaints" ? "不満" : "好評"}${a.count}件）：${a.text}`);
  t.push("");
  if (d.rating) {
    t.push(
      "■3. 評価点の推移",
      `最新日（${jpDate(d.rating.latestDate)}）の平均：${avgText(d.rating.todayAvg)}（${d.rating.todayCount}件）`,
      `${d.rating.monthLabel}の平均：${avgText(d.rating.monthAvg)}（${d.rating.monthCount}件）`,
      `前月比：${diffText(d.rating.momDiff)}／前年比：${diffText(d.rating.yoyDiff)}`,
      "",
    );
  }
  t.push(`■4. 本日の口コミ（${d.reviews.length}件）`);
  for (const r of d.reviews) t.push(`・${stars(r.rating)} ${r.site}：${r.text || "（評価のみ）"}`);
  t.push("", `■5. 本日受けた現場の声（${d.voices.length}件）`);
  for (const v of d.voices) t.push(`・[${v.status}] ${v.channel}（${v.customerType}）：${v.content}${v.action ? `／対応：${v.action}` : ""}`);

  return { subject, html, text: t.join("\n") };
}

// サーバーで受け取ったデータの形と量を確かめる（問題があれば日本語の理由を返す）
export function validateDailyEmailData(x: unknown): DailyEmailData | string {
  const isStr = (v: unknown, max = EMAIL_LIMITS.textLength) => typeof v === "string" && v.length <= max;
  const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const isNumOrNull = (v: unknown) => v === null || isNum(v);
  if (typeof x !== "object" || x === null) return "データがありません";
  const d = x as DailyEmailData;
  if (!isStr(d.facilityName, 100) || !isStr(d.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return "日付か施設名が正しくありません";
  if (!Array.isArray(d.reviews) || d.reviews.length > EMAIL_LIMITS.reviews) return "口コミのデータが正しくないか、多すぎます";
  if (!d.reviews.every((r) => isStr(r.site, 100) && isNum(r.rating) && isStr(r.text) && (r.language === undefined || isStr(r.language, 50))))
    return "口コミのデータの形が正しくありません";
  if (!Array.isArray(d.voices) || d.voices.length > EMAIL_LIMITS.voices) return "現場の声のデータが正しくないか、多すぎます";
  if (!d.voices.every((v) => isStr(v.channel, 50) && isStr(v.customerType, 50) && isStr(v.content) && isStr(v.status, 20) && isStr(v.action)))
    return "現場の声のデータの形が正しくありません";
  const m = d.month;
  if (!m || !isStr(m.label, 50) || !Array.isArray(m.summaryLines) || !Array.isArray(m.aiSummary)) return "要約のデータが正しくありません";
  if (m.summaryLines.length > EMAIL_LIMITS.lines || !m.summaryLines.every((l) => isStr(l.kind, 20) && isStr(l.text)))
    return "要約のデータの形が正しくありません";
  if (
    m.aiSummary.length > EMAIL_LIMITS.lines ||
    !m.aiSummary.every((a) => (a.kind === "complaints" || a.kind === "praises") && isStr(a.label, 50) && isNum(a.count) && isStr(a.text))
  )
    return "AIの要約のデータの形が正しくありません";
  const r = d.rating;
  if (r !== null) {
    if (
      typeof r !== "object" ||
      !isStr(r.latestDate, 10) ||
      !isNumOrNull(r.todayAvg) ||
      !isNum(r.todayCount) ||
      !isStr(r.monthLabel, 50) ||
      !isNumOrNull(r.monthAvg) ||
      !isNum(r.monthCount) ||
      !isNumOrNull(r.momDiff) ||
      !isNumOrNull(r.yoyDiff) ||
      !Array.isArray(r.months) ||
      r.months.length > EMAIL_LIMITS.months ||
      !r.months.every((mm) => isStr(mm.label, 20) && isNumOrNull(mm.avg) && isNum(mm.count))
    )
      return "評価点のデータの形が正しくありません";
  }
  return d;
}
