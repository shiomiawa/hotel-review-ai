"use client";

import { useMemo, useState } from "react";
import { CsvUploader } from "@/components/CsvUploader";
import { RatingCharts } from "@/components/RatingCharts";
import { ReviewList } from "@/components/ReviewList";
import { StatTiles } from "@/components/StatTiles";
import { VoicesPanel } from "@/components/VoicesPanel";
import { FORMAT_LABELS, summarize, type ParseResult } from "@/lib/reviews";
import { computeRatingStats } from "@/lib/stats";
import { useVoices } from "@/lib/voiceStore";

// loadId：読み込むたびに増やし、一覧の絞り込みをリセットするために使う
type Loaded = ParseResult & { sourceName: string; loadId: number };

const TABS = [
  { id: "analysis", label: "分析ダッシュボード" },
  { id: "voices", label: "現場の声の記録" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Dashboard() {
  const [data, setData] = useState<Loaded | null>(null);
  const summary = data ? summarize(data.reviews) : null;
  const stats = useMemo(() => (data ? computeRatingStats(data.reviews) : null), [data]);
  const voices = useVoices();
  const openVoices = voices.filter((v) => v.status !== "完了").length;
  const [tab, setTab] = useState<TabId>("analysis");

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="画面の切り替え" className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium sm:px-4 ${
              tab === t.id
                ? "border-teal-700 text-teal-800 dark:border-teal-400 dark:text-teal-300"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t.label}
            {t.id === "voices" && openVoices > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">未完了 {openVoices}</span>
            )}
          </button>
        ))}
      </div>

      {/* タブを切り替えても入力中の内容や絞り込みが消えないよう、両方とも表示したまま隠す */}
      <div role="tabpanel" id="panel-voices" aria-labelledby="tab-voices" hidden={tab !== "voices"}>
        <VoicesPanel />
      </div>

      <div
        role="tabpanel"
        id="panel-analysis"
        aria-labelledby="tab-analysis"
        hidden={tab !== "analysis"}
        className="flex flex-col gap-8"
      >
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">1. 口コミCSVを読み込む</h2>
          <CsvUploader
            onLoaded={(result, sourceName) =>
              setData((prev) => ({ ...result, sourceName, loadId: (prev?.loadId ?? 0) + 1 }))
            }
          />

          {data && (
            <div className="flex flex-col gap-2 text-sm">
              {summary ? (
                <p className="rounded-md bg-teal-50 px-3 py-2 text-teal-900 dark:bg-teal-950 dark:text-teal-100">
                  {data.sourceName}（{data.format && FORMAT_LABELS[data.format]}）：
                  <strong>{summary.count}件</strong>を読み込みました（{summary.from}〜{summary.to}）。当日（
                  {summary.to}）の口コミは{summary.todayCount}件です。
                  {summary.ratingOnlyCount > 0 &&
                    `うち${summary.ratingOnlyCount}件は本文のない評価のみの投稿で、評価点の集計にだけ使います。`}
                </p>
              ) : (
                <p className="rounded-md bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950 dark:text-red-200">
                  {data.sourceName}：読み込める口コミがありませんでした。
                </p>
              )}
              {data.errors.length > 0 && (
                <details className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  <summary className="cursor-pointer">
                    読み込めなかった行があります（内容を見る）
                  </summary>
                  <ul className="mt-2 list-disc pl-5">
                    {data.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>

        {summary && stats && data && (
          <>
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-bold">2. 分析結果</h2>
              {/* 4軸分類・優先改善アラート・強み・経路別の比較はステップ5で、評価点の推移より上に追加する */}
              <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
                4軸分類・優先改善アラート・強み・経路別の比較は、次のステップで追加します（記録済みの現場の声 {voices.length}件も合わせて分析します）。
              </p>
              <div className="flex flex-col gap-3">
                <h3 className="font-bold">評価点の推移</h3>
                <StatTiles stats={stats} />
                <RatingCharts stats={stats} />
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">3. 口コミ一覧</h2>
              <ReviewList key={data.loadId} reviews={data.reviews} today={summary.to} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
