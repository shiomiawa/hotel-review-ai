"use client";

import { useMemo, useState } from "react";
import { ReplyDraft } from "@/components/ReplyDraft";
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

type PeriodMode = "all" | "year" | "month" | "day";
const PERIOD_MODES: { id: PeriodMode; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "year", label: "年" },
  { id: "month", label: "月" },
  { id: "day", label: "日" },
];
// 期間の値："2026"／"2026-09"／"2026-09-26" → 口コミの日付の先頭と比べる
const keyLength: Record<Exclude<PeriodMode, "all">, number> = { year: 4, month: 7, day: 10 };
const periodLabel = (mode: PeriodMode, value: string) =>
  mode === "year"
    ? `${value}年`
    : mode === "month"
      ? `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月`
      : `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;

export function ReviewList({ reviews, today }: { reviews: Review[]; today: string }) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [periodValue, setPeriodValue] = useState("");
  const [site, setSite] = useState("すべて");
  const [rating, setRating] = useState("すべて");
  const [reply, setReply] = useState("すべて");
  const [order, setOrder] = useState<"new" | "old">("new");
  const [shown, setShown] = useState(PAGE_SIZE);

  const sites = useMemo(() => ["すべて", ...new Set(reviews.map((r) => r.site))], [reviews]);
  // 返信状況が分かる形式（口コミコムの出力）のときだけ、返信状況で絞り込めるようにする
  const hasReplyInfo = reviews.some((r) => r.replied !== undefined);

  // 年・月・日の選択肢（口コミがある期間だけ。古い順）と件数
  const periodOptions = useMemo(() => {
    if (periodMode === "all") return [];
    const counts = new Map<string, number>();
    for (const r of reviews) {
      const key = r.date.slice(0, keyLength[periodMode]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({ value, count }));
  }, [reviews, periodMode]);
  const periodIndex = periodOptions.findIndex((o) => o.value === periodValue);

  // 「日」のときは、年月を選んでから日を選ぶ（1つのプルダウンに全日付を並べると長くなるため）
  const monthOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reviews) counts.set(r.date.slice(0, 7), (counts.get(r.date.slice(0, 7)) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({ value, count }));
  }, [reviews]);
  const selectedMonth = periodValue.slice(0, 7);
  const dayOptions = periodMode === "day" ? periodOptions.filter((o) => o.value.startsWith(selectedMonth)) : [];

  function changePeriod(mode: PeriodMode, value?: string) {
    setPeriodMode(mode);
    // 値を指定しなければ、当日（CSVの最新日）を含む期間にする
    setPeriodValue(mode === "all" ? "" : (value ?? today.slice(0, keyLength[mode])));
    setShown(PAGE_SIZE);
  }

  const filtered = useMemo(
    () =>
      reviews
        .filter((r) => periodMode === "all" || r.date.startsWith(periodValue))
        .filter((r) => site === "すべて" || r.site === site)
        .filter((r) => rating === "すべて" || Math.round(r.rating) === Number(rating))
        .filter((r) => reply === "すべて" || (reply === "未返信" ? r.replied === false : r.replied === true))
        // 日付順（同じ日付なら読み込み順）
        .sort((a, b) => {
          const d = a.date.localeCompare(b.date) || Number(a.id.slice(1)) - Number(b.id.slice(1));
          return order === "new" ? -d : d;
        }),
    [reviews, periodMode, periodValue, site, rating, reply, order],
  );

  const selectClass =
    "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  const smallButton =
    "rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";
  const resetShown = () => setShown(PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      {/* 期間：日ごとに口コミを確認・返信していく使い方のため、年・月・日で絞り込み、前後に送れるようにする */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>期間</span>
        <div
          role="group"
          aria-label="期間の単位"
          className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700"
        >
          {PERIOD_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={periodMode === m.id}
              onClick={() => changePeriod(m.id)}
              className={`px-3 py-1 ${
                periodMode === m.id ? "bg-teal-700 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {periodMode !== "all" && (
          // 「前へ・期間・次へ」はほかの部品と混ざらないよう、ひとまとまりにする（狭い画面では中で折り返す）
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => changePeriod(periodMode, periodOptions[periodIndex - 1].value)}
              disabled={periodIndex <= 0}
              className={smallButton}
            >
              ‹ 前へ
            </button>
            {periodMode === "day" ? (
              <>
                <select
                  aria-label="対象の年月"
                  value={selectedMonth}
                  // 年月を選び直したら、その月の最初の日を表示する
                  onChange={(e) => changePeriod("day", periodOptions.find((o) => o.value.startsWith(e.target.value))?.value)}
                  className={selectClass}
                >
                  {monthOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {periodLabel("month", o.value)}（{o.count}件）
                    </option>
                  ))}
                </select>
                <select
                  aria-label="対象の日"
                  value={periodValue}
                  onChange={(e) => changePeriod("day", e.target.value)}
                  className={selectClass}
                >
                  {periodIndex === -1 && <option value={periodValue}>{Number(periodValue.slice(8, 10))}日（0件）</option>}
                  {dayOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {Number(o.value.slice(8, 10))}日（{o.count}件）
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <select
                aria-label="対象の期間"
                value={periodValue}
                onChange={(e) => changePeriod(periodMode, e.target.value)}
                className={selectClass}
              >
                {periodIndex === -1 && (
                  <option value={periodValue}>{periodLabel(periodMode, periodValue)}（0件）</option>
                )}
                {periodOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {periodLabel(periodMode, o.value)}（{o.count}件）
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => changePeriod(periodMode, periodOptions[periodIndex + 1].value)}
              disabled={periodIndex === -1 || periodIndex >= periodOptions.length - 1}
              className={smallButton}
            >
              次へ ›
            </button>
          </span>
        )}
        <button type="button" onClick={() => changePeriod("day", today)} className={smallButton}>
          当日を表示
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          サイト
          <select
            value={site}
            onChange={(e) => {
              setSite(e.target.value);
              resetShown();
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
              resetShown();
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
        {hasReplyInfo && (
          <label className="flex items-center gap-1">
            返信
            <select
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                resetShown();
              }}
              className={selectClass}
            >
              {["すべて", "未返信", "返信済み"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1">
          並び順
          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value as "new" | "old");
              resetShown();
            }}
            className={selectClass}
          >
            <option value="new">新しい順</option>
            <option value="old">古い順</option>
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
            {/* 返信下書き（補助機能）。本文のない「評価のみ」の投稿には出さない */}
            {r.text && <ReplyDraft review={r} />}
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
