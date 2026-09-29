"use client";

import { useMemo, useState } from "react";
import {
  AXES,
  analysisPeriod,
  buildItems,
  summarizeAnalysis,
  type AnalysisItem,
  type Classification,
} from "@/lib/analysis";
import type { Review } from "@/lib/reviews";
import { dayLabel, monthLabel } from "@/lib/stats";
import type { Voice } from "@/lib/voices";

type Fetched = { mode: "mock" | "ai"; classifications: Classification[]; signature: string };

// 分析の対象が変わったかを見分けるための目印（件数・ID・本文の長さから作る）
const signatureOf = (items: AnalysisItem[]) =>
  items.map((i) => `${i.id}:${i.date}:${i.channel}:${i.text.length}`).join("|");

const pct = (n: number, d: number) => (d === 0 ? "―" : `${Math.round((n / d) * 100)}%`);

function Examples({ items }: { items: AnalysisItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1 text-sm">
      {items.slice(0, 3).map((i) => (
        <li key={i.id} className="flex gap-2">
          <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
            {dayLabel(i.date)}・{i.channel}
          </span>
          <span className="line-clamp-2">{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function AxisAnalysis({ reviews, voices }: { reviews: Review[]; voices: Voice[] }) {
  const period = useMemo(() => analysisPeriod(reviews, voices), [reviews, voices]);
  const items = useMemo(
    () => (period ? buildItems(reviews, voices, [period.thisMonth, period.prevMonth]) : []),
    [reviews, voices, period],
  );
  const signature = signatureOf(items);

  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(
    () => (fetched && period ? summarizeAnalysis(items, fetched.classifications, period) : null),
    [fetched, items, period],
  );
  const stale = fetched !== null && fetched.signature !== signature;

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(({ id, text }) => ({ id, text })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "分析に失敗しました");
      setFetched({ mode: data.mode, classifications: data.classifications, signature });
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  if (!period) return null;
  const reviewCount = items.filter((i) => i.source === "review").length;
  const voiceCount = items.length - reviewCount;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">4軸分析（ネットの口コミ＋現場の声）</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            対象：{monthLabel(period.thisMonth)}（{dayLabel(period.baseDate)}まで）と{monthLabel(period.prevMonth)}の
            {items.length}件（口コミ {reviewCount}件・現場の声 {voiceCount}件）
          </p>
        </div>
        <button
          type="button"
          onClick={analyze}
          disabled={loading || items.length === 0}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? "分析中…" : fetched ? "もう一度分析する" : "分析する"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {stale && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          口コミや現場の声が変わりました。「もう一度分析する」を押すと、最新のデータで分析し直します。
        </p>
      )}
      {!fetched && !loading && (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
          「分析する」を押すと、口コミと現場の声を4つの視点で分類し、優先して改善すべき点と強みを表示します。
        </p>
      )}

      {result && fetched && (
        <div className={`flex flex-col gap-5 ${loading ? "opacity-50" : ""}`}>
          {fetched.mode === "mock" && (
            <p className="text-xs text-zinc-500">
              ※ いまはAIにつなぐ前のダミーの分類（キーワードによる簡易判定）です。結果は画面の確認用です。
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">優先改善アラート</h4>
              {result.alerts.length === 0 && <p className="text-sm text-zinc-500">今月は目立った不満はありません。</p>}
              {result.alerts.map((a) => (
                <div key={a.axis} className="rounded-lg border border-zinc-200 border-l-4 border-l-[var(--status-critical)] px-3 py-2 dark:border-zinc-800 dark:border-l-[var(--status-critical)]">
                  <p className="font-semibold">
                    <span aria-hidden className="mr-1 text-[var(--status-critical)]">▲</span>
                    {a.label}
                    <span className="ml-2 text-xs font-normal text-zinc-500">優先して改善</span>
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{a.reason}</p>
                  <Examples items={result.axes.find((x) => x.axis === a.axis)!.negativeExamples} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">強み</h4>
              {result.strengths.length === 0 && <p className="text-sm text-zinc-500">今月、目立った強みはまだ見つかっていません。</p>}
              {result.strengths.map((s) => (
                <div key={s.axis} className="rounded-lg border border-zinc-200 border-l-4 border-l-[var(--status-good)] px-3 py-2 dark:border-zinc-800 dark:border-l-[var(--status-good)]">
                  <p className="font-semibold">
                    <span aria-hidden className="mr-1 text-[var(--status-good)]">✓</span>
                    {s.label}
                    <span className="ml-2 text-xs font-normal text-zinc-500">強み</span>
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{s.reason}</p>
                  <Examples items={result.axes.find((x) => x.axis === s.axis)!.positiveExamples} />
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <h4 className="mb-1 text-sm font-semibold">軸ごとの件数</h4>
            <table className="w-full min-w-[520px] text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">軸</th>
                  <th className="py-1 text-right font-normal">今月の言及</th>
                  <th className="py-1 text-right font-normal">うち不満</th>
                  <th className="py-1 text-right font-normal">うち好評</th>
                  <th className="py-1 text-right font-normal">前月の不満</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {result.axes.map((a) => (
                  <tr key={a.axis}>
                    <td className="py-1.5">{a.label}</td>
                    <td className="py-1.5 text-right">{a.thisMonth.mentions}</td>
                    <td className="py-1.5 text-right font-semibold">{a.thisMonth.negative}</td>
                    <td className="py-1.5 text-right">{a.thisMonth.positive}</td>
                    <td className="py-1.5 text-right">{a.prevMonth.negative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <h4 className="text-sm font-semibold">経路別の不満の傾向</h4>
            <p className="mb-1 text-xs text-zinc-500">
              {monthLabel(period.prevMonth)}〜{monthLabel(period.thisMonth)}。数字は不満の件数、バーはその経路の件数に対する割合。
            </p>
            <table className="w-full min-w-[640px] text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">経路（件数）</th>
                  {AXES.map((a) => (
                    <th key={a.id} className="py-1 font-normal">
                      {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {result.channels.map((c) => (
                  <tr key={c.channel}>
                    <td className="py-1.5 pr-2">
                      {c.channel}
                      <span className="ml-1 text-xs text-zinc-500">（{c.items}）</span>
                    </td>
                    {AXES.map((a) => {
                      const n = c.negative[a.id];
                      const share = c.items === 0 ? 0 : n / c.items;
                      return (
                        <td key={a.id} className="py-1.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="w-20 shrink-0 whitespace-nowrap">
                              {n}件<span className="ml-0.5 text-xs text-zinc-500">{c.items > 0 && `・${pct(n, c.items)}`}</span>
                            </span>
                            <span className="h-2 w-full max-w-24 rounded-sm bg-[var(--chart-grid)]" aria-hidden>
                              <span
                                className="block h-2 rounded-sm bg-[var(--chart-series)]"
                                style={{ width: `${Math.round(share * 100)}%` }}
                              />
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
