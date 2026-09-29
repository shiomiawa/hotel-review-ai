"use client";

import { useMemo, useState } from "react";
import { facility } from "@/config/facility";
import {
  baseDateOf,
  buildItems,
  classificationKey,
  itemsIn,
  periodOf,
  previousPeriod,
  summarizeAnalysis,
} from "@/lib/analysis";
import { summaryKeyFor, type AnalysisCache } from "@/lib/analysisCache";
import { postJson } from "@/lib/apiClient";
import type { DailyEmailData } from "@/lib/dailyEmail";
import type { Review } from "@/lib/reviews";
import { computeRatingStats, monthLabel } from "@/lib/stats";
import { buildSummary } from "@/lib/summary";
import type { Voice } from "@/lib/voices";

const jpDate = (d: string) => `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
// 今日の日付（このパソコンの時計の日付。YYYY-MM-DD）
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function DailyEmail({ reviews, voices, cache }: { reviews: Review[]; voices: Voice[]; cache: AnalysisCache }) {
  // CSVの最新日（その日に口コミがないときの案内に使う）
  const baseDate = useMemo(() => baseDateOf(reviews, voices), [reviews, voices]);
  // 対象の日はカレンダーで選ぶ。最初は今日
  const [date, setDate] = useState(todayLocal);
  const allItems = useMemo(() => buildItems(reviews, voices), [reviews, voices]);

  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const data = useMemo((): DailyEmailData | null => {
    if (!date) return null;
    const todayReviews = reviews.filter((r) => r.date === date);
    const todayVoices = voices.filter((v) => v.receivedDate === date);

    // その日を含む月の4軸分析（分析ダッシュボードで分類済みのときだけ）
    const current = periodOf("month", date.slice(0, 7));
    const previous = previousPeriod(current);
    const target = itemsIn(allItems, current, previous);
    const analyzed = target.length > 0 && target.every((i) => cache.classifications.has(classificationKey(i)));
    let summaryLines: DailyEmailData["month"]["summaryLines"] = [];
    const aiSummary: DailyEmailData["month"]["aiSummary"] = [];
    if (analyzed) {
      const result = summarizeAnalysis(target, cache.classifications, current, previous);
      const inMonth = target.filter((i) => i.date >= current.start && i.date <= current.end);
      const reviewCount = inMonth.filter((i) => i.source === "review").length;
      const openVoices = voices.filter(
        (v) => v.receivedDate >= current.start && v.receivedDate <= current.end && v.status !== "完了",
      ).length;
      summaryLines = buildSummary(result, current, previous, {
        reviews: reviewCount,
        voices: inMonth.length - reviewCount,
        openVoices,
      }).map((l) => ({ kind: l.kind, text: l.text, textEn: l.textEn }));
      const ai = cache.aiSummaries.get(summaryKeyFor("month", current.key, target));
      if (ai?.mode === "ai") {
        for (const kind of ["complaints", "praises"] as const) {
          aiSummary.push(
            ...result.axes
              .map((a) => ({
                kind,
                label: a.label,
                count: kind === "complaints" ? a.current.negative : a.current.positive,
                text: ai.axes.find((x) => x.label === a.label)?.[kind] ?? "",
              }))
              .filter((r) => r.text && r.count > 0)
              .sort((x, y) => y.count - x.count),
          );
        }
      }
    }

    // 評価点の推移（その日までの口コミで集計）
    const stats = computeRatingStats(reviews.filter((r) => r.date <= date));
    const rating: DailyEmailData["rating"] = stats && {
      monthKey: stats.thisMonth.month,
      monthAvg: stats.thisMonth.avg,
      monthCount: stats.thisMonth.count,
      momDiff: stats.momDiff,
      yoyDiff: stats.yoyDiff,
    };

    return {
      facilityName: facility.nameEn,
      date,
      // 口コミは原文のまま。外国語の口コミは、日本語訳（口コミコムの翻訳コメント）を添える
      reviews: todayReviews.map((r) => ({
        site: r.site,
        rating: r.rating,
        original: r.originalText ?? r.text,
        ...(r.originalText && { translation: r.text }),
        ...(r.language && { language: r.language }),
      })),
      voices: todayVoices.map((v) => ({
        channel: v.channel,
        customerType: v.customerType,
        content: v.content,
        status: v.status,
        action: v.action,
      })),
      month: { key: current.key, summaryLines, aiSummary },
      rating,
    };
  }, [date, reviews, voices, allItems, cache.classifications, cache.aiSummaries]);

  if (!data) return null;

  async function send() {
    setSending(true);
    setMessage(null);
    try {
      const result = await postJson<{ to: string }>("/api/email", data);
      setMessage({ ok: true, text: `送信しました（宛先：${result.to}）。届くまで少しかかることがあります。` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "送信に失敗しました" });
    } finally {
      setSending(false);
    }
  }

  const monthAnalyzed = data.month.summaryLines.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          対象の日
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return; // 空にされたときは前の日付のまま
              setDate(e.target.value);
              setMessage(null);
            }}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {date !== todayLocal() && (
          <button type="button" onClick={() => setDate(todayLocal())} className="text-sm text-teal-700 underline dark:text-teal-400">
            今日にする
          </button>
        )}
        <span className="text-zinc-600 dark:text-zinc-400">
          口コミ {data.reviews.length}件・現場の声 {data.voices.length}件
        </span>
      </div>
      {data.reviews.length === 0 && data.voices.length === 0 && (
        <p className="text-sm text-zinc-500">
          {jpDate(date)}の口コミ・現場の声はありません。
          {baseDate && baseDate !== date && (
            <button type="button" onClick={() => setDate(baseDate)} className="ml-1 text-teal-700 underline dark:text-teal-400">
              口コミの最新日（{jpDate(baseDate)}）にする
            </button>
          )}
        </p>
      )}

      <ul className="flex flex-col gap-1 text-sm">
        <li>
          {monthAnalyzed ? "✓" : "・"} {monthLabel(data.month.key)}の4軸分析：
          {monthAnalyzed
            ? "分析済み（要約をメールに入れます）"
            : "まだ分析していません。上の4軸分析で「月」を選び「分析する」を押すと、要約がメールに入ります"}
        </li>
        <li>
          {data.month.aiSummary.length > 0 ? "✓" : "・"} AIによるコメントの内容の要約：
          {data.month.aiSummary.length > 0
            ? "あり（メールに入れます）"
            : "なし（上の4軸分析で「AIでコメントの内容を要約する」を押すと入ります。任意）"}
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {sending ? "送信しています…" : "メール送信"}
        </button>
        <span className="text-xs text-zinc-500">送り先は、サーバーに設定したメールアドレス（MAIL_TO）に固定されています。</span>
      </div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-md px-3 py-2 text-sm ${
            message.ok
              ? "bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
