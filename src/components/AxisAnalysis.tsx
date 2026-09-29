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
import { costYen, modelName, summaryKeyFor, type AiSummary, type AnalysisCache, type Usage } from "@/lib/analysisCache";
import { analysisCsvFileName, buildAnalysisCsv } from "@/lib/analysisCsv";
import { postJson } from "@/lib/apiClient";
import type { Review } from "@/lib/reviews";
import { buildSummary, type SummaryLine } from "@/lib/summary";

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

const KEY_CARD_TONE = {
  critical: { border: "border-t-[var(--status-critical)]!", text: "text-[var(--status-critical)]" },
  good: { border: "border-t-[var(--status-good)]!", text: "text-[var(--status-good)]" },
  attention: { border: "border-t-amber-500!", text: "text-amber-600 dark:text-amber-400" },
  neutral: { border: "border-t-teal-700! dark:border-t-teal-400!", text: "text-teal-800 dark:text-teal-300" },
};

// 分析結果の先頭に置く要点カード。状態の色には必ず記号と言葉を添える
function KeyCard({
  href,
  label,
  value,
  detail,
  mark,
  tone,
}: {
  href?: string;
  label: string;
  value: number;
  detail: string;
  mark: string;
  tone: keyof typeof KEY_CARD_TONE;
}) {
  const { border, text } = KEY_CARD_TONE[tone];
  const body = (
    <>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span aria-hidden className={`text-lg font-bold ${text}`}>
          {mark}
        </span>
        <span className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">件</span>
      </span>
      <span className="text-xs leading-snug text-zinc-600 dark:text-zinc-400">{detail}</span>
    </>
  );
  const className = `flex flex-col gap-0.5 rounded-lg border border-t-4 border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950 ${border}`;
  return href ? (
    <a href={href} className={`${className} transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900`}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

// 要約の各行の印（色だけに頼らず記号でも区別する）
const SUMMARY_MARK: Record<SummaryLine["kind"], { mark: string; className: string }> = {
  overview: { mark: "・", className: "text-zinc-500" },
  priority: { mark: "！", className: "text-[var(--status-critical)]" },
  worse: { mark: "▲", className: "text-[var(--status-critical)]" },
  better: { mark: "▼", className: "text-[var(--status-good)]" },
  good: { mark: "✓", className: "text-[var(--status-good)]" },
  steady: { mark: "・", className: "text-zinc-500" },
  voices: { mark: "□", className: "text-amber-600 dark:text-amber-400" },
};

export function AxisAnalysis({
  reviews,
  voices,
  cache,
}: {
  reviews: Review[];
  voices: Voice[];
  cache: AnalysisCache;
}) {
  const { classifications, setClassifications, mode, setMode, usage, addUsage, aiSummaries, setAiSummaries } = cache;
  const baseDate = useMemo(() => baseDateOf(reviews, voices), [reviews, voices]);
  const allItems = useMemo(() => buildItems(reviews, voices), [reviews, voices]);

  const [unit, setUnit] = useState<PeriodUnit>("month");
  const [key, setKey] = useState<string | null>(null); // null のときは基準日を含む期間
  const currentKey = key ?? (baseDate ? periodKeyOf(baseDate, unit) : null);

  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
      // 小分けに送り、1回分が終わるたびに保存する（途中で失敗しても、それまでの結果は残し、残りだけを送り直せるように）
      for (let i = 0; i < missing.length; i += MAX_ITEMS) {
        const chunk = missing.slice(i, i + MAX_ITEMS);
        const data = await postJson<{ mode: "mock" | "ai"; classifications: Classification[]; usage?: Usage; model?: string }>(
          "/api/analyze",
          { items: chunk.map(({ id, text }) => ({ id, text })) },
        );
        const byId = new Map(data.classifications.map((c) => [c.id, c]));
        setClassifications((prev) => {
          const next = new Map(prev);
          for (const item of chunk) {
            const c = byId.get(item.id);
            if (c) next.set(classificationKey(item), c);
          }
          return next;
        });
        setMode(data.mode);
        addUsage(data.usage, data.model);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  if (!current || !previous) return null;
  // AIの要約の保存場所の目印（期間と、その期間の分類済みの口コミ・現場の声がそろっているか）
  const summaryKey = summaryKeyFor(unit, currentKey!, targetItems);
  const aiSummary = aiSummaries.get(summaryKey);

  // 選んだ期間の分析結果をCSVで書き出す
  function downloadCsv() {
    if (!current) return;
    const { csv } = buildAnalysisCsv(targetItems, classifications, reviews, voices, current);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = analysisCsvFileName(current);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function summarizeWithAI() {
    if (!result || !current) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const data = await postJson<{ mode: AiSummary["mode"]; axes: AiSummary["axes"]; usage?: Usage; model?: string }>("/api/summarize", {
          periodLabel: periodLabel(current),
          axes: result.axes
            .filter((a) => a.negativeComments.length + a.positiveComments.length > 0)
            .map((a) => ({
              label: a.label,
              negative: a.negativeComments.slice(0, 30).map((i) => `[${i.channel}] ${i.text}`),
              positive: a.positiveComments.slice(0, 30).map((i) => `[${i.channel}] ${i.text}`),
            })),
      });
      setAiSummaries((prev) => new Map(prev).set(summaryKey, { mode: data.mode, axes: data.axes }));
      addUsage(data.usage, data.model);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "要約に失敗しました");
    } finally {
      setSummarizing(false);
    }
  }
  const previousLabel = PERIOD_UNITS.find((u) => u.id === unit)!.previous;
  const currentItems = targetItems.filter((i) => i.date >= current.start && i.date <= current.end);
  const reviewCount = currentItems.filter((i) => i.source === "review").length;
  const openVoices = voices.filter(
    (v) => v.receivedDate >= current.start && v.receivedDate <= current.end && v.status !== "完了",
  ).length;
  const summary = result
    ? buildSummary(result, current, previous, {
        reviews: reviewCount,
        voices: currentItems.length - reviewCount,
        openVoices,
      })
    : [];

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="この期間の要点">
            <KeyCard
              href="#axis-alerts"
              label="優先改善アラート"
              value={result.alerts.length}
              mark="▲"
              tone="critical"
              detail={result.alerts.length > 0 ? result.alerts.map((a) => a.label).join("・") : "目立った不満なし"}
            />
            <KeyCard
              href="#axis-good"
              label="よいコメントが多い項目"
              value={result.goodPoints.length}
              mark="✓"
              tone="good"
              detail={result.goodPoints.length > 0 ? result.goodPoints.map((g) => g.label).join("・") : "まだありません"}
            />
            <KeyCard
              label="分析した口コミ・声"
              value={result.currentTotal}
              mark="・"
              tone="neutral"
              detail={`口コミ ${reviewCount}件・現場の声 ${currentItems.length - reviewCount}件`}
            />
            <KeyCard
              label="未完了の現場の声"
              value={openVoices}
              mark="□"
              tone="attention"
              detail={openVoices > 0 ? "未対応・対応中（この期間）" : "すべて対応済み"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              分析結果をCSVで書き出す（{periodLabel(current)}・{result.currentTotal}件）
            </button>
            <span className="text-xs text-zinc-500">4軸の判定（好評／不満／中立）を付けて、1件1行で書き出します。</span>
          </div>
          {mode === "mock" && (
            <p className="text-xs text-zinc-500">
              ※ いまはAIにつなぐ前のダミーの分類（キーワードによる簡易判定）です。結果は画面の確認用です。
            </p>
          )}
          {mode === "ai" && (
            <p className="text-xs text-zinc-500">
              AI（{modelName(usage.model)}）で分類しました。AIの判定には誤りが含まれることがあります。
              {usage.model && (
                <>
                  この画面を開いてからのAIの利用：入力 {usage.total.inputTokens.toLocaleString()}トークン・出力{" "}
                  {usage.total.outputTokens.toLocaleString()}トークン
                  {costYen(usage.total, usage.model) !== null &&
                    `（約${costYen(usage.total, usage.model)!.toFixed(2)}円、1ドル=150円で換算）`}
                </>
              )}
            </p>
          )}

          <section
            aria-label="この期間の要約"
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h4 className="text-sm font-semibold">
              この期間の要約<span className="ml-2 text-xs font-normal text-zinc-500">（ネットの口コミ＋現場の声）</span>
            </h4>
            <ul className="flex flex-col gap-1 text-sm leading-relaxed">
              {summary.map((line) => (
                <li key={line.text} className="flex gap-2">
                  <span aria-hidden className={`w-4 shrink-0 text-center font-bold ${SUMMARY_MARK[line.kind].className}`}>
                    {SUMMARY_MARK[line.kind].mark}
                  </span>
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500">この要約は、下の分類結果の件数と割合から自動で作っています。</p>

            <div className="mt-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              {aiSummary ? (
                <div className="flex flex-col gap-1">
                  <h5 className="text-sm font-semibold">
                    コメントの内容の要約
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      {aiSummary.mode === "ai" ? `AI（${modelName(usage.model)}）が作成` : "ダミー"}
                    </span>
                  </h5>
                  {(["complaints", "praises"] as const).map((kind) => {
                    // 件数の多い軸から並べる。件数はアプリの計算値（AIには数字を書かせていない）
                    const rows = result!.axes
                      .map((a) => ({
                        axis: a,
                        text: aiSummary.axes.find((x) => x.label === a.label)?.[kind] ?? "",
                        count: kind === "complaints" ? a.current.negative : a.current.positive,
                      }))
                      .filter((r) => r.text && r.count > 0)
                      .sort((x, y) => y.count - x.count);
                    if (rows.length === 0) return null;
                    return (
                      <div key={kind}>
                        <p className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          {kind === "complaints" ? "不満の内容" : "好評の内容"}
                        </p>
                        <ul className="flex flex-col gap-1 text-sm leading-relaxed">
                          {rows.map((r) => (
                            <li key={r.axis.axis} className="flex gap-2">
                              <span
                                aria-hidden
                                className={`w-4 shrink-0 text-center font-bold ${kind === "complaints" ? "text-[var(--status-critical)]" : "text-[var(--status-good)]"}`}
                              >
                                {kind === "complaints" ? "▲" : "✓"}
                              </span>
                              <span>
                                <strong>
                                  {r.axis.label}（{kind === "complaints" ? "不満" : "好評"}
                                  {r.count}件）
                                </strong>
                                ：{r.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  <p className="text-xs text-zinc-500">
                    文章はAIがコメントを読んで作ったものです（件数はアプリが数えた値）。内容は元のコメントと合わせて確認してください。
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={summarizeWithAI}
                  disabled={summarizing}
                  className="rounded-md border border-teal-700 px-3 py-1.5 text-sm text-teal-800 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-400 dark:text-teal-300 dark:hover:bg-teal-950"
                >
                  {summarizing ? "要約しています…" : "AIでコメントの内容を要約する"}
                </button>
              )}
              {summaryError && (
                <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
                  {summaryError}
                </p>
              )}
            </div>
          </section>

          <section id="axis-alerts" className="flex scroll-mt-4 flex-col gap-2" aria-label="優先改善アラート">
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

          <section id="axis-good" className="flex scroll-mt-4 flex-col gap-2" aria-label="よいコメント">
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
