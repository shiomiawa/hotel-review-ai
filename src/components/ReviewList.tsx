"use client";

import { useMemo, useState } from "react";
import type { Review } from "@/lib/reviews";

const PAGE_SIZE = 30;

// 星は四捨五入して表示し、「4.7」のような小数は数値も添える
function Stars({ rating }: { rating: number }) {
  const stars = Math.round(rating);
  return (
    <span aria-label={`評価 ${rating}`} className="text-amber-500">
      {"★".repeat(stars)}
      <span className="text-zinc-300 dark:text-zinc-600">{"★".repeat(5 - stars)}</span>
      {!Number.isInteger(rating) && (
        <span className="ml-1 text-xs text-zinc-600 dark:text-zinc-400">{rating.toFixed(1)}</span>
      )}
    </span>
  );
}

const Badge = ({ children, className }: { children: React.ReactNode; className: string }) => (
  <span className={`rounded px-1.5 py-0.5 text-xs ${className}`}>{children}</span>
);

export function ReviewList({ reviews, today }: { reviews: Review[]; today: string }) {
  const [site, setSite] = useState("すべて");
  const [rating, setRating] = useState("すべて");
  const [shown, setShown] = useState(PAGE_SIZE);

  const sites = useMemo(() => ["すべて", ...new Set(reviews.map((r) => r.site))], [reviews]);

  const filtered = useMemo(
    () =>
      reviews
        .filter((r) => site === "すべて" || r.site === site)
        .filter((r) => rating === "すべて" || Math.round(r.rating) === Number(rating))
        // 新しい順（同じ日付なら読み込み順の後ろから）
        .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id.slice(1)) - Number(a.id.slice(1))),
    [reviews, site, rating],
  );

  const selectClass =
    "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          サイト
          <select
            value={site}
            onChange={(e) => {
              setSite(e.target.value);
              setShown(PAGE_SIZE);
            }}
            className={selectClass}
          >
            {sites.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          評価
          <select
            value={rating}
            onChange={(e) => {
              setRating(e.target.value);
              setShown(PAGE_SIZE);
            }}
            className={selectClass}
          >
            {["すべて", "5", "4", "3", "2", "1"].map((v) => (
              <option key={v} value={v}>
                {v === "すべて" ? v : `★${v}`}
              </option>
            ))}
          </select>
        </label>
        <span className="text-zinc-500">{filtered.length}件</span>
      </div>

      <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {filtered.slice(0, shown).map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium tabular-nums">{r.date}</span>
              {r.date === today && (
                <span className="rounded bg-teal-700 px-1.5 py-0.5 text-xs text-white">当日</span>
              )}
              <Stars rating={r.rating} />
              <span className="text-zinc-500">{r.site}</span>
              {r.stayType !== "不明" && <span className="text-zinc-500">{r.stayType}</span>}
              {r.language && (
                <Badge className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {r.language}{r.originalText ? "・日本語訳" : ""}
                </Badge>
              )}
              {r.replied === true && (
                <Badge className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">返信済み</Badge>
              )}
              {r.replied === false && (
                <Badge className="border border-amber-500 text-amber-700 dark:text-amber-400">未返信</Badge>
              )}
            </div>
            {r.text ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.text}</p>
            ) : (
              <p className="text-sm text-zinc-500">（本文なし・評価のみの投稿）</p>
            )}
            {r.originalText && (
              <details className="text-xs text-zinc-500">
                <summary className="cursor-pointer">原文を見る</summary>
                <p className="mt-1 whitespace-pre-wrap">{r.originalText}</p>
              </details>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">条件に合う口コミはありません</li>
        )}
      </ul>

      {shown < filtered.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
          className="self-center rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          もっと見る（残り{filtered.length - shown}件）
        </button>
      )}
    </div>
  );
}
