// 返信下書きを Haiku 4.5 と Sonnet 5 で比べるスクリプト（効果測定）
// 同じ口コミ10件に、それぞれのモデルで下書きを作り、並べて保存する。
// どちらが自然か・施設の事実と合っているかは、人が読んで判断する。
//
// 実行：npx tsx --env-file=.env.local scripts/compare-replies.ts
// 結果は data/eval/results/ に Markdown で保存する（Haiku 約2円＋Sonnet 約8円）。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateReply } from "@/lib/claude";
import { decodeCsv, parseReviewsCsv, type Review } from "@/lib/reviews";

const MODELS = [
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", input: 1, output: 5 },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", input: 2, output: 10 },
];
const YEN_PER_DOLLAR = 150;

// 比べる10件：判断が分かれやすい種類をまんべんなく選ぶ
function pickReviews(reviews: Review[]): Review[] {
  const withText = reviews.filter((r) => r.text);
  const picked: Review[] = [];
  const add = (r: Review | undefined) => {
    if (r && !picked.includes(r)) picked.push(r);
  };
  const oneLiners = withText.filter((r) => r.text.length <= 20 && r.rating >= 4);
  const complaints = withText.filter((r) => r.rating <= 2).sort((a, b) => b.text.length - a.text.length);
  const mixed = withText.filter((r) => r.rating === 3 || r.text.includes("でも") || r.text.includes("が、"));
  [oneLiners[0], oneLiners[1], oneLiners[2], complaints[0], complaints[1], complaints[2], mixed[0], mixed[1]].forEach(add);
  for (const r of withText.filter((r) => r.rating >= 4 && r.text.length > 40)) {
    if (picked.length >= 10) break;
    add(r);
  }
  return picked.slice(0, 10);
}

async function main() {
  const buf = readFileSync("public/sample/reviews_sample.csv");
  const { reviews } = parseReviewsCsv(decodeCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  const targets = pickReviews(reviews);

  const results: Record<string, { reply: string; seconds: number; yen: number }[]> = {};
  for (const m of MODELS) {
    process.env.CLAUDE_MODEL_REPLY = m.id; // generateReply は環境変数のモデルを使う
    results[m.id] = [];
    for (const r of targets) {
      const t0 = Date.now();
      const out = await generateReply({ date: r.date, site: r.site, rating: r.rating, text: r.originalText ?? r.text });
      const yen = ((out.usage.inputTokens * m.input + out.usage.outputTokens * m.output) / 1_000_000) * YEN_PER_DOLLAR;
      results[m.id].push({ reply: out.reply, seconds: (Date.now() - t0) / 1000, yen });
      console.log(`${m.name}：${results[m.id].length}/${targets.length}件`);
    }
  }

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const md: string[] = [`# 返信下書きの比較（${today}）`, "", "| モデル | 1件あたりの時間（平均） | 1件あたりの費用（平均） | 10件の費用 |", "|---|---|---|---|"];
  for (const m of MODELS) {
    const rs = results[m.id];
    md.push(`| ${m.name} | ${avg(rs.map((x) => x.seconds)).toFixed(1)}秒 | 約${avg(rs.map((x) => x.yen)).toFixed(2)}円 | 約${rs.reduce((a, x) => a + x.yen, 0).toFixed(1)}円 |`);
  }
  md.push("", "どちらが自然か、施設の事実と合っているかは、下の下書きを読んで判断する（評価欄は人が記入する）。", "");
  targets.forEach((r, i) => {
    md.push(`## ${i + 1}. ★${r.rating}　${r.site}　${r.date}`, "", `> ${r.text.replace(/\r?\n/g, "\n> ")}`, "");
    for (const m of MODELS) {
      md.push(`### ${m.name}`, "", results[m.id][i].reply, "");
    }
    md.push("評価（どちらがよいか・理由）：", "", "---", "");
  });

  mkdirSync("data/eval/results", { recursive: true });
  const out = `data/eval/results/replies-compare-${today}.md`;
  writeFileSync(out, md.join("\n"));
  console.log(md.slice(0, 6).join("\n"));
  console.log(`\n結果を保存しました：${out}`);
}

main().catch((e) => {
  console.error("比較に失敗しました：", e instanceof Error ? e.message : e);
  process.exit(1);
});
