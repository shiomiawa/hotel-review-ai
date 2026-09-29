import { PERIOD_UNITS, periodLabel, type AnalysisResult, type Period } from "@/lib/analysis";

// ネットの口コミと現場の声をまとめた、期間ごとの要約（数値から作る。AIは使わない）。
// アプリが計算した件数・割合だけを使うので、事実と違うことは書かない。
// コメントの中身まで踏み込んだ要約は、AIにつないだあと（ステップ6）で追加する。

// 割合の変化を「目立つ変化」とみなす差（ポイント）
const NOTABLE_CHANGE_PT = 5;
// これより件数が少ない期間どうしの割合の比較は、参考程度とする
const SMALL_SAMPLE = 10;

const pct = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

export type SummaryLine = { kind: "overview" | "priority" | "worse" | "better" | "good" | "voices" | "steady"; text: string };

export function buildSummary(
  result: AnalysisResult,
  current: Period,
  previous: Period,
  counts: { reviews: number; voices: number; openVoices: number },
): SummaryLine[] {
  const prevLabel = PERIOD_UNITS.find((u) => u.id === current.unit)!.previous;
  const lines: SummaryLine[] = [];

  lines.push({
    kind: "overview",
    text: `${periodLabel(current)}は、ネットの口コミ${counts.reviews}件と現場の声${counts.voices}件、あわせて${result.currentTotal}件を分析しました（${prevLabel}の${periodLabel(previous)}は${result.previousTotal}件）。`,
  });

  if (result.alerts.length > 0) {
    lines.push({
      kind: "priority",
      text: `最優先で改善したいのは「${result.alerts.map((a) => a.label).join("」「")}」です。`,
    });
  }

  // 不満がいちばん多く寄せられた経路（現場の声の経路も含む。同数なら並べる）
  const topChannels = (axis: (typeof result.axes)[number]["axis"]) => {
    const max = Math.max(0, ...result.channels.map((c) => c.negative[axis]));
    if (max === 0) return null;
    const names = result.channels.filter((c) => c.negative[axis] === max).map((c) => c.channel);
    return names.length === 1 ? `${names[0]}（${max}件）` : `${names.join("と")}（各${max}件）`;
  };

  const comparable = result.previousTotal > 0 && result.currentTotal > 0;
  const smallSample = comparable && (result.previousTotal < SMALL_SAMPLE || result.currentTotal < SMALL_SAMPLE);
  const worse: SummaryLine[] = [];
  const better: SummaryLine[] = [];
  if (comparable && !smallSample) {
    for (const a of result.axes) {
      const now = pct(a.current.negative, result.currentTotal);
      const before = pct(a.previous.negative, result.previousTotal);
      if (now - before >= NOTABLE_CHANGE_PT && a.current.negative >= 2) {
        const channel = topChannels(a.axis);
        worse.push({
          kind: "worse",
          text: `${a.label}の不満の割合が${prevLabel}の${before}%から${now}%に増えました（${a.current.negative}件）。${channel ? `いちばん多く寄せられたのは${channel}です。` : ""}`,
        });
      } else if (before - now >= NOTABLE_CHANGE_PT && a.previous.negative >= 2) {
        // 改善していても、まだ優先改善アラートに入っている軸は、その旨を添える
        const stillAlert = result.alerts.some((x) => x.axis === a.axis);
        better.push({
          kind: "better",
          text: stillAlert
            ? `${a.label}は不満の割合が${before}%から${now}%に減り改善傾向ですが、不満はまだ多く（${a.current.negative}件）、引き続き優先して取り組む必要があります。`
            : `${a.label}は不満の割合が${before}%から${now}%に減り、改善しています。`,
        });
      }
    }
  }
  // 悪化を先に、改善をあとに並べる
  lines.push(...worse, ...better);

  for (const g of result.goodPoints) {
    const a = result.axes.find((x) => x.axis === g.axis)!;
    lines.push({
      kind: "good",
      text: `${g.label}は好評が${a.current.positive}件（言及の${pct(a.current.positive, a.current.mentions)}%）で、よいコメントが多く寄せられています。`,
    });
  }

  if (!comparable) {
    lines.push({ kind: "steady", text: `${prevLabel}のデータがないため、変化は比べられません。` });
  } else if (smallSample) {
    // 件数が少ない側だけを挙げる
    const small = [
      result.previousTotal < SMALL_SAMPLE ? `${prevLabel}は${result.previousTotal}件` : null,
      result.currentTotal < SMALL_SAMPLE ? `この期間は${result.currentTotal}件` : null,
    ].filter(Boolean);
    lines.push({
      kind: "steady",
      text: `${small.join("、")}と件数が少ないため、不満の割合の変化は参考程度に見てください。`,
    });
  } else if (worse.length === 0 && better.length === 0) {
    lines.push({ kind: "steady", text: `${prevLabel}と比べて、不満の割合に大きな変化はありません。` });
  }

  if (counts.openVoices > 0) {
    lines.push({
      kind: "voices",
      text: `この期間の現場の声のうち、対応が完了していないものが${counts.openVoices}件あります。`,
    });
  }
  return lines;
}
