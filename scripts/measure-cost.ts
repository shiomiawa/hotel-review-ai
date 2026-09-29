// APIコストを測るスクリプト（効果測定）
// サンプルデータの1か月分（今月＋前月）を実際にAIで分類し、要約も1回作って、
// 使ったトークン数から「口コミ・現場の声1件あたり」「1施設・1か月あたり」の費用を出す。
//
// 実行：npx tsx --env-file=.env.local scripts/measure-cost.ts
// 結果は data/eval/results/ に Markdown で保存する。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  baseDateOf,
  buildItems,
  itemsIn,
  periodLabel,
  periodOf,
  previousPeriod,
  summarizeAnalysis,
  type Classification,
} from "@/lib/analysis";
import { classificationKey } from "@/lib/analysis";
import { classifyModel, classifyWithClaude, summarizeWithClaude } from "@/lib/claude";
import { decodeCsv, parseReviewsCsv } from "@/lib/reviews";
import { parseVoicesCsv } from "@/lib/voices";

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
};
const YEN_PER_DOLLAR = 150;

async function main() {
  const model = classifyModel();
  const price = PRICES[model];
  if (!price) throw new Error(`料金表にないモデルです：${model}`);
  const yen = (u: { inputTokens: number; outputTokens: number }) =>
    ((u.inputTokens * price.input + u.outputTokens * price.output) / 1_000_000) * YEN_PER_DOLLAR;

  // サンプルデータを読み込む
  const buf = readFileSync("public/sample/reviews_sample.csv");
  const { reviews } = parseReviewsCsv(decodeCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  let n = 0;
  const { voices } = parseVoicesCsv(readFileSync("public/sample/voices_sample.csv", "utf8"), () => `v${++n}`);
  const base = baseDateOf(reviews, voices)!;
  const current = periodOf("month", base.slice(0, 7));
  const previous = previousPeriod(current);
  const all = buildItems(reviews, voices);
  const target = itemsIn(all, current, previous);
  const monthly = itemsIn(all, current).length;

  // ① 分類
  const t1 = Date.now();
  const classified = await classifyWithClaude(target.map(({ id, text }) => ({ id, text })));
  const classifySeconds = (Date.now() - t1) / 1000;
  const byId = new Map(classified.results.map((c) => [c.id, c]));
  const map = new Map<string, Classification>();
  for (const item of target) {
    const c = byId.get(item.id);
    if (c) map.set(classificationKey(item), c);
  }

  // ② 要約（画面の「AIでコメントの内容を要約する」と同じ内容を送る）
  const result = summarizeAnalysis(target, map, current, previous);
  const t2 = Date.now();
  const summary = await summarizeWithClaude({
    periodLabel: periodLabel(current),
    axes: result.axes
      .filter((a) => a.negativeComments.length + a.positiveComments.length > 0)
      .map((a) => ({
        label: a.label,
        negative: a.negativeComments.slice(0, 30).map((i) => `[${i.channel}] ${i.text}`),
        positive: a.positiveComments.slice(0, 30).map((i) => `[${i.channel}] ${i.text}`),
      })),
  });
  const summarySeconds = (Date.now() - t2) / 1000;

  // ③ 計算
  const perItem = yen(classified.usage) / target.length;
  const perSummary = yen(summary.usage);
  const days = 30;
  // 今の作り：分類結果はブラウザを閉じると消えるので、毎日「今月＋前月」を分類し直す
  const dailyNow = perItem * target.length + perSummary;
  // 改善した場合：分類結果を保存し、新しく増えた口コミ・現場の声だけを分類する
  const monthlyIfCached = perItem * monthly + perSummary * days;

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const r = (v: number) => v.toFixed(2);
  const md = [
    `# APIコストの測定（${today}・${model}）`,
    "",
    `- 対象：サンプルデータの${periodLabel(current)}と${periodLabel(previous)}（口コミ＋現場の声 ${target.length}件。${periodLabel(current)}だけでは${monthly}件）`,
    `- 料金：入力 $${price.input}／出力 $${price.output}（100万トークンあたり）、1ドル=${YEN_PER_DOLLAR}円で換算`,
    "",
    "## 実測",
    "",
    "| 処理 | 件数 | 入力トークン | 出力トークン | 時間 | 費用 |",
    "|---|---|---|---|---|---|",
    `| 4軸分類 | ${target.length}件（分類できた ${classified.results.length}件） | ${classified.usage.inputTokens} | ${classified.usage.outputTokens} | ${classifySeconds.toFixed(1)}秒 | 約${r(yen(classified.usage))}円 |`,
    `| AIの要約 | 1回 | ${summary.usage.inputTokens} | ${summary.usage.outputTokens} | ${summarySeconds.toFixed(1)}秒 | 約${r(perSummary)}円 |`,
    "",
    `- **口コミ・現場の声1件あたりの分類の費用：約${perItem.toFixed(3)}円**`,
    `- AIの要約1回あたりの費用：約${r(perSummary)}円`,
    "",
    "## 1施設・1か月あたりの費用（試算）",
    "",
    `前提：1か月の口コミ＋現場の声がサンプルと同じ${monthly}件、毎日1回（${days}日）アプリで月の分析とAIの要約を行う。`,
    "",
    "| 使い方 | 1日 | 1か月 |",
    "|---|---|---|",
    `| 今の作り（毎日「今月＋前月」を分類し直す） | 約${r(dailyNow)}円 | **約${Math.round(dailyNow * days)}円** |`,
    `| 分類結果を保存して、新しい分だけ分類する場合（今後の改善案） | ― | 約${Math.round(monthlyIfCached)}円 |`,
    "",
    "- 評価点の集計・グラフはAIを使わないので費用はかからない",
    "- 日次メールの送信（Resend）は無料枠（月3,000通）の範囲",
  ];

  mkdirSync("data/eval/results", { recursive: true });
  const out = `data/eval/results/cost-${model}-${today}.md`;
  writeFileSync(out, md.join("\n") + "\n");
  console.log(md.join("\n"));
  console.log(`\n結果を保存しました：${out}`);
}

main().catch((e) => {
  console.error("費用の測定に失敗しました：", e instanceof Error ? e.message : e);
  process.exit(1);
});
