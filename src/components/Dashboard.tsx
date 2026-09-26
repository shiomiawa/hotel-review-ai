"use client";

import { useState } from "react";
import { CsvUploader } from "@/components/CsvUploader";
import { ReviewList } from "@/components/ReviewList";
import { summarize, type ParseResult } from "@/lib/reviews";

// loadId：読み込むたびに増やし、一覧の絞り込みをリセットするために使う
type Loaded = ParseResult & { sourceName: string; loadId: number };

export function Dashboard() {
  const [data, setData] = useState<Loaded | null>(null);
  const summary = data ? summarize(data.reviews) : null;

  return (
    <div className="flex flex-col gap-8">
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
                {data.sourceName}：<strong>{summary.count}件</strong>を読み込みました（{summary.from}〜
                {summary.to}）。当日（{summary.to}）の口コミは{summary.todayCount}件です。
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

      {summary && data && (
        <>
          {/* 主役の分析はここに入る（ステップ4〜5で追加） */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">2. 分析結果</h2>
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
              評価点の集計と4軸分析は、次のステップで追加します。
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">3. 口コミ一覧</h2>
            <ReviewList key={data.loadId} reviews={data.reviews} today={summary.to} />
          </section>
        </>
      )}
    </div>
  );
}
