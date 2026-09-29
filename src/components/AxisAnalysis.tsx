"use client";

import { useMemo, useState } from "react";
import {
  AXES,
  MAX_ITEMS,
  PERIOD_UNITS,
  baseDateOf,
  buildItems,
  classificationKey,
  itemsIn,
  listPeriods,
  periodKeyOf,
  periodLabel,
  periodOf,
  previousPeriod,
  summarizeAnalysis,
  type AnalysisItem,
  type Classification,
  type PeriodUnit,
} from "@/lib/analysis";
import type { Review } from "@/lib/reviews";
import type { Voice } from "@/lib/voices";

const pct = (n: number, d: number) => (d === 0 ? "―" : `${Math.round((n / d) * 100)}%`);
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const selectClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const smallButton =
  "rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

const FIRST_SHOWN = 5;

// コメントは全文を表示する。多いときは最初の5件のあと「残りを表示」
function Comments({ items }: { items: AnalysisItem[] }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, FIRST_SHOWN);
  return (
    <div className="mt-2 flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        {shown.map((i) => (
          <li key={i.id} className="flex flex-col gap-0.5 py-2">
            <span className="text-xs text-zinc-500 tabular-nums">
              {shortDate(i.date)}・{i.channel}
            </span>
            <p className="whitespace-pre-wrap leading-relaxed">{i.text}</p>
          </li>
        ))}
      </ul>
      {items.length > FIRST_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="self-start text-sm text-teal-700 underline dark:text-teal-400">
          {all ? "最初の5件だけ表示" : `残り${items.length - FIRST_SHOWN}件を表示`}
        </button>
      )}
    </div>
  );
}

// 不満の割合（100件あたり何件がその軸の不満か）
const rateText = (n: number, total: number) => (total === 0 ? "―" : `${Math.round((n / total) * 100)}%`);

// 前の期間からの不満の割合の増減（ポイント）。減れば改善、増えれば悪化（色だけでなく記号と言葉でも示す）
function Change({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return <span className="text-zinc-500">―</span>;
  const d = Math.round(now * 100) - Math.round(before * 100);
  if (d === 0) return <span className="text-zinc-500">±0</span>;
  return d < 0 ? (
    <span className="text-[var(--delta-up)]">▼{-d}pt 改善</span>
  ) : (
    <span className="text-[var(--delta-down)]">▲{d}pt 悪化</span>
  );
}

export function AxisAnalysis({ reviews, voices }: { reviews: Review[]; voices: Voice[] }) {
  const baseDate = useMemo(() => baseDateOf(reviews, voices), [reviews, voices]);
  const allItems = useMemo(() => buildItems(reviews, voices), [reviews, voices]);

  const [unit, setUnit] = useState<PeriodUnit>("month");
  const [key, setKey] = useState<string | null>(null); // null のときは基準日を含む期間
  const currentKey = key ?? (baseDate ? periodKeyOf(baseDate, unit) : null);

  // 分類結果は本文ごとに保存し、期間を切り替えても使い回す（まだ分類していない分だけ送る）
  const [classifications, setClassifications] = useState<Map<string, Classification>>(new Map());
  const [mode, setMode] = useState<"mock" | "ai" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periods = useMemo(() => listPeriods(allItems, unit), [allItems, unit]);
  const current = useMemo(() => (currentKey ? periodOf(unit, currentKey) : null), [unit, currentKey]);
  const previous = useMemo(() => (current ? previousPeriod(current) : null), [current]);
  const periodIndex = periods.findIndex((p) => p.period.key === currentKey);

  const targetItems = useMemo(
    () => (current && previous ? itemsIn(allItems, current, previous) : []),
    [allItems, current, previous],
  );
  const missing = targetItems.filter((i) => !classifications.has(classificationKey(i)));
  const missingCount = missing.length;
  const result = useMemo(
    () =>
      current && previous && missingCount === 0 && targetItems.length > 0
        ? summarizeAnalysis(targetItems, classifications, current, previous)
        : null,
    [targetItems, classifications, missingCount, current, previous],
  );

  function changeUnit(u: PeriodUnit) {
    setUnit(u);
    setKey(null);
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const next = new Map(classifications);
      for (let i = 0; i < missing.length; i += MAX_ITEMS) {
        const chunk = missing.slice(i, i + MAX_ITEMS);
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: chunk.map(({ id, text }) => ({ id, text })) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "分析に失敗しました");
        const byId = new Map((data.classifications as Classification[]).map((c) => [c.id, c]));
        for (const item of chunk) {
          const c = byId.get(item.id);
          if (c) next.set(classificationKey(item), c);
        }
        setMode(data.mode);
      }
      setClassifications(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  if (!current || !previous) return null;
  const previousLabel = PERIOD_UNITS.find((u) => u.id === unit)!.previous;
  const currentItems = targetItems.filter((i) => i.date >= current.start && i.date <= current.end);
  const reviewCount = currentItems.filter((i) => i.source === "review").length;

  // 週は「年月 → 週」の2段で選ぶ（1つのプルダウンに全部の週を並べると長くなるため）
  const weekMonths = [...new Set(periods.map((p) => p.period.key.slice(0, 7)))];
  const weeksInMonth = periods.filter((p) => p.period.key.startsWith(currentKey!.slice(0, 7)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">4軸分析（ネットの口コミ＋現場の声）</h3>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>期間</span>
          <div role="group" aria-label="分析期間の単位" className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
            {PERIOD_UNITS.map((u) => (
              <button
                key={u.id}
                type="button"
                aria-pressed={unit === u.id}
                onClick={() => changeUnit(u.id)}
                className={`px-3 py-1 ${unit === u.id ? "bg-teal-700 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                {u.id === "week" ? "週（月曜始まり）" : u.label}
              </button>
            ))}
          </div>
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setKey(periods[periodIndex - 1].period.key)} disabled={periodIndex <= 0} className={smallButton}>
              ‹ 前へ
            </button>
            {unit === "week" ? (
              <>
                <select
                  aria-label="分析する週の年月"
                  value={currentKey!.slice(0, 7)}
                  onChange={(e) => setKey(periods.find((p) => p.period.key.startsWith(e.target.value))!.period.key)}
                  className={selectClass}
                >
                  {!weekMonths.includes(currentKey!.slice(0, 7)) && (
                    <option value={currentKey!.slice(0, 7)}>
                      {currentKey!.slice(0, 4)}年{Number(currentKey!.slice(5, 7))}月
                    </option>
                  )}
                  {weekMonths.map((m) => (
                    <option key={m} value={m}>
                      {m.slice(0, 4)}年{Number(m.slice(5, 7))}月
                    </option>
                  ))}
                </select>
                <select aria-label="分析する週" value={currentKey!} onChange={(e) => setKey(e.target.value)} className={selectClass}>
                  {periodIndex === -1 && <option value={currentKey!}>{periodLabel(current)}（0件）</option>}
                  {weeksInMonth.map((p) => (
                    <option key={p.period.key} value={p.period.key}>
                      {periodLabel(p.period).slice(5)}（{p.count}件）
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <select aria-label="分析する期間" value={currentKey!} onChange={(e) => setKey(e.target.value)} className={selectClass}>
                {periodIndex === -1 && <option value={currentKey!}>{periodLabel(current)}（0件）</option>}
                {periods.map((p) => (
                  <option key={p.period.key} value={p.period.key}>
                    {periodLabel(p.period)}（{p.count}件）
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setKey(periods[periodIndex + 1].period.key)}
              disabled={periodIndex === -1 || periodIndex >= periods.length - 1}
              className={smallButton}
            >
              次へ ›
            </button>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            対象：{periodLabel(current)} の{currentItems.length}件（口コミ {reviewCount}件・現場の声 {currentItems.length - reviewCount}件）
            ／比較：{previousLabel}（{periodLabel(previous)}・{targetItems.length - currentItems.length}件）
          </p>
          <button
            type="button"
            onClick={analyze}
            disabled={loading || missing.length === 0}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? "分析中…" : missing.length > 0 ? `分析する（${missing.length}件）` : "分析済み"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {targetItems.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
          この期間と{previousLabel}には、分析できる口コミ・現場の声がありません。
        </p>
      )}
      {!result && missing.length > 0 && !loading && (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
          この期間と{previousLabel}のうち、まだ分析していない口コミ・現場の声が{missing.length}件あります。
          「分析する」を押すと、4つの視点で分類し、優先して改善すべき点とよいコメントを表示します。
        </p>
      )}

      {result && (
        <div className={`flex flex-col gap-5 ${loading ? "opacity-50" : ""}`}>
          {mode === "mock" && (
            <p className="text-xs text-zinc-500">
              ※ いまはAIにつなぐ前のダミーの分類（キーワードによる簡易判定）です。結果は画面の確認用です。
            </p>
          )}

          <section className="flex flex-col gap-2" aria-label="優先改善アラート">
            <h4 className="text-sm font-semibold">優先改善アラート</h4>
            {result.alerts.length === 0 && <p className="text-sm text-zinc-500">この期間は目立った不満はありません。</p>}
            {result.alerts.map((a) => (
              <div
                key={a.axis}
                className="rounded-lg border border-l-4 border-zinc-200 border-l-[var(--status-critical)] px-4 py-3 dark:border-zinc-800 dark:border-l-[var(--status-critical)]"
              >
                <p className="font-semibold">
                  <span aria-hidden className="mr-1 text-[var(--status-critical)]">▲</span>
                  {a.label}
                  <span className="ml-2 text-xs font-normal text-zinc-500">優先して改善</span>
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{a.reason}</p>
                <Comments key={currentKey} items={result.axes.find((x) => x.axis === a.axis)!.negativeComments} />
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2" aria-label="よいコメント">
            <h4 className="text-sm font-semibold">よいコメント</h4>
            {result.goodPoints.length === 0 && (
              <p className="text-sm text-zinc-500">この期間は、好評が目立つ項目はまだありません。</p>
            )}
            {result.goodPoints.map((g) => (
              <div
                key={g.axis}
                className="rounded-lg border border-l-4 border-zinc-200 border-l-[var(--status-good)] px-4 py-3 dark:border-zinc-800 dark:border-l-[var(--status-good)]"
              >
                <p className="font-semibold">
                  <span aria-hidden className="mr-1 text-[var(--status-good)]">✓</span>
                  {g.label}
                  <span className="ml-2 text-xs font-normal text-zinc-500">好評が多い</span>
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{g.reason}</p>
                <Comments key={currentKey} items={result.axes.find((x) => x.axis === g.axis)!.positiveComments} />
              </div>
            ))}
          </section>

          <div className="overflow-x-auto">
            <h4 className="text-sm font-semibold">軸ごとの件数と{previousLabel}からの変化</h4>
            <p className="mb-1 text-xs text-zinc-500">
              不満の割合＝その軸の不満の件数÷期間内の件数（{periodLabel(current)} {result.currentTotal}件／{previousLabel}{" "}
              {result.previousTotal}件）。件数が違う期間どうしでも比べられるよう、割合で比べます。
            </p>
            <table className="w-full min-w-[620px] text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">軸</th>
                  <th className="py-1 text-right font-normal">言及</th>
                  <th className="py-1 text-right font-normal">不満</th>
                  <th className="py-1 text-right font-normal">好評</th>
                  <th className="py-1 text-right font-normal">不満の割合</th>
                  <th className="py-1 text-right font-normal">{previousLabel}の不満の割合</th>
                  <th className="py-1 text-right font-normal">変化</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {result.axes.map((a) => (
                  <tr key={a.axis}>
                    <td className="py-1.5">{a.label}</td>
                    <td className="py-1.5 text-right">{a.current.mentions}</td>
                    <td className="py-1.5 text-right font-semibold">{a.current.negative}</td>
                    <td className="py-1.5 text-right">{a.current.positive}</td>
                    <td className="py-1.5 text-right">{rateText(a.current.negative, result.currentTotal)}</td>
                    <td className="py-1.5 text-right">
                      {rateText(a.previous.negative, result.previousTotal)}
                      <span className="ml-1 text-xs text-zinc-500">（{a.previous.negative}件）</span>
                    </td>
                    <td className="py-1.5 text-right">
                      <Change
                        now={result.currentTotal ? a.current.negative / result.currentTotal : null}
                        before={result.previousTotal ? a.previous.negative / result.previousTotal : null}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <h4 className="text-sm font-semibold">経路別の不満の傾向</h4>
            <p className="mb-1 text-xs text-zinc-500">
              {periodLabel(current)}。数字は不満の件数、バーはその経路の件数に対する割合。
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
                              <span className="block h-2 rounded-sm bg-[var(--chart-series)]" style={{ width: `${Math.round(share * 100)}%` }} />
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
