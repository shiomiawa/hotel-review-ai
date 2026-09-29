// 分類の精度を測るスクリプト（効果測定）
// 人が手作業で付けた正解ラベルと、AIの4軸分類を比べて一致率を出す。
//
// 実行：npx tsx --env-file=.env.local scripts/eval-classification.ts
//   --file <CSV>   正解ラベル付きのCSV（初期値：data/eval/reviews_eval50.csv）
//   --mock         AIを呼ばずにダミー分類で試す（スクリプトの動作確認用・費用0）
// 結果は data/eval/results/ に Markdown と JSON で保存する。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Papa from "papaparse";
import { AXES, SENTIMENTS, type AxisId, type Classification, type Sentiment } from "@/lib/analysis";
import { classifyModel, classifyWithClaude } from "@/lib/claude";
import { mockClassify } from "@/lib/mockClassify";

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = argValue("--file") ?? "data/eval/reviews_eval50.csv";
const useMock = args.includes("--mock");

const LABEL_COLUMN: Record<AxisId, string> = { room: "label_room", net: "label_net", service: "label_service", food: "label_food" };
const SENTIMENT_JA: Record<Sentiment, string> = { positive: "好評", negative: "不満", neutral: "中立", none: "言及なし" };

type Row = { id: string; text: string; labels: Record<AxisId, Sentiment> };

// ---- 正解ラベルの読み込みと確認 ----
const csv = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy" });
const rows: Row[] = [];
const problems: string[] = [];
parsed.data.forEach((r, i) => {
  const labels = {} as Record<AxisId, Sentiment>;
  for (const { id } of AXES) {
    const v = (r[LABEL_COLUMN[id]] ?? "").trim().toLowerCase();
    if (!(SENTIMENTS as readonly string[]).includes(v)) {
      problems.push(`${i + 2}行目（${r.id}）：${LABEL_COLUMN[id]} が「${v || "空欄"}」です`);
      continue;
    }
    labels[id] = v as Sentiment;
  }
  rows.push({ id: r.id, text: r.text, labels });
});
if (problems.length > 0) {
  console.error(`正解ラベルが記入されていない、または値が正しくない欄が${problems.length}か所あります。`);
  console.error("値は positive／negative／neutral／none のどれかにしてください（data/eval/README.md を参照）。");
  for (const p of problems.slice(0, 10)) console.error("  - " + p);
  if (problems.length > 10) console.error(`  …ほか${problems.length - 10}か所`);
  process.exit(1);
}

async function main() {
  // ---- AIで分類 ----
  const items = rows.map((r) => ({ id: r.id, text: r.text }));
  const started = Date.now();
  let predictions: Classification[];
  let usage = { inputTokens: 0, outputTokens: 0 };
  let model = "mock";
  if (useMock) {
    predictions = mockClassify(items);
  } else {
    const out = await classifyWithClaude(items);
    predictions = out.results;
    usage = out.usage;
    model = out.model;
  }
  const seconds = (Date.now() - started) / 1000;
  const byId = new Map(predictions.map((p) => [p.id, p]));

  // ---- 比べる ----
  type AxisScore = { correct: number; total: number; tp: number; fp: number; fn: number; confusion: Record<string, number> };
  const scores = Object.fromEntries(
    AXES.map(({ id }) => [id, { correct: 0, total: 0, tp: 0, fp: 0, fn: 0, confusion: {} } as AxisScore]),
  ) as Record<AxisId, AxisScore>;
  let allMatch = 0;
  const mismatches: { id: string; text: string; axis: string; human: string; ai: string }[] = [];

  for (const row of rows) {
    const p = byId.get(row.id);
    if (!p) continue;
    let every = true;
    for (const { id, label } of AXES) {
      const s = scores[id];
      const human = row.labels[id];
      const ai = p[id];
      s.total++;
      if (human === ai) s.correct++;
      else {
        every = false;
        mismatches.push({ id: row.id, text: row.text, axis: label, human: SENTIMENT_JA[human], ai: SENTIMENT_JA[ai] });
      }
      // 「不満」を見つけられるか（優先改善アラートに直結するため、別に数える）
      if (ai === "negative" && human === "negative") s.tp++;
      if (ai === "negative" && human !== "negative") s.fp++;
      if (ai !== "negative" && human === "negative") s.fn++;
      const key = `${SENTIMENT_JA[human]}→${SENTIMENT_JA[ai]}`;
      s.confusion[key] = (s.confusion[key] ?? 0) + 1;
    }
    if (every) allMatch++;
  }
  const classified = rows.filter((r) => byId.has(r.id)).length;
  const pct = (n: number, d: number) => (d === 0 ? "―" : `${Math.round((n / d) * 1000) / 10}%`);
  const totalCorrect = AXES.reduce((s, { id }) => s + scores[id].correct, 0);
  const totalJudged = AXES.reduce((s, { id }) => s + scores[id].total, 0);

  // ---- 結果をまとめる ----
  const PRICES: Record<string, { input: number; output: number }> = {
    "claude-haiku-4-5": { input: 1, output: 5 },
    "claude-sonnet-5": { input: 2, output: 10 },
  };
  const price = PRICES[model];
  const costUsd = price ? (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000 : 0;
  // 日付は日本時間
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const md: string[] = [];
  md.push(`# 分類の精度（${today}・${useMock ? "ダミー分類" : model}）`, "");
  md.push(`- 対象：${file} の ${rows.length}件（分類できた件数：${classified}件）`);
  md.push(`- 判定の一致率（4軸×件数のうち、人の正解と同じだった割合）：**${pct(totalCorrect, totalJudged)}**（${totalCorrect}/${totalJudged}）`);
  md.push(`- 4軸すべてが一致した件数：${allMatch}/${classified}件（${pct(allMatch, classified)}）`);
  if (!useMock) md.push(`- 時間：${seconds.toFixed(1)}秒／費用：約${(costUsd * 150).toFixed(2)}円（入力${usage.inputTokens}・出力${usage.outputTokens}トークン、1ドル=150円）`);
  md.push("", "## 軸ごとの結果", "", "| 軸 | 一致率 | 不満の見つけやすさ（再現率） | 不満の判定の正しさ（適合率） |", "|---|---|---|---|");
  for (const { id, label } of AXES) {
    const s = scores[id];
    md.push(`| ${label} | ${pct(s.correct, s.total)} | ${pct(s.tp, s.tp + s.fn)}（${s.tp}/${s.tp + s.fn}） | ${pct(s.tp, s.tp + s.fp)}（${s.tp}/${s.tp + s.fp}） |`);
  }
  md.push("", "- 再現率：人が「不満」とした口コミのうち、AIも「不満」と判定できた割合（見落としの少なさ）");
  md.push("- 適合率：AIが「不満」と判定した口コミのうち、人も「不満」とした割合（誤検知の少なさ）");
  md.push("", "## 人とAIの判定が分かれた例", "", "| ID | 軸 | 人 | AI | 本文 |", "|---|---|---|---|---|");
  for (const m of mismatches) md.push(`| ${m.id} | ${m.axis} | ${m.human} | ${m.ai} | ${m.text.replace(/\|/g, "／").replace(/\r?\n/g, " ").slice(0, 80)} |`);

  mkdirSync("data/eval/results", { recursive: true });
  const base = `data/eval/results/eval-${useMock ? "mock" : model}-${today}`;
  writeFileSync(`${base}.md`, md.join("\n") + "\n");
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ date: today, model, file, rows: rows.length, classified, totalCorrect, totalJudged, allMatch, scores, usage, costUsd, seconds, mismatches }, null, 2),
  );

  // 画面には、判定が分かれた例の一覧の手前までを出す
  console.log(md.slice(0, md.indexOf("## 人とAIの判定が分かれた例")).join("\n"));
  console.log(`\n結果を保存しました：${base}.md`);
  if (!useMock) console.log(`（使ったモデル：${classifyModel()}）`);
}

main().catch((e) => {
  console.error("精度の測定に失敗しました：", e instanceof Error ? e.message : e);
  process.exit(1);
});
