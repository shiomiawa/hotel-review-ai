import { PERIOD_UNITS, periodLabel, type AnalysisResult, type Period } from "@/lib/analysis";
import { AXIS_EN, CHANNEL_EN, PREVIOUS_EN, en, periodEn } from "@/lib/i18n";

// ネットの口コミと現場の声をまとめた、期間ごとの要約（数値から作る。AIは使わない）。
// アプリが計算した件数・割合だけを使うので、事実と違うことは書かない。
// 日次メール（外資系ホテル向け）用に、同じ数字から英語の文（textEn）も作る。

// 割合の変化を「目立つ変化」とみなす差（ポイント）
const NOTABLE_CHANGE_PT = 5;
// これより件数が少ない期間どうしの割合の比較は、参考程度とする
const SMALL_SAMPLE = 10;

const pct = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export type SummaryLine = {
  kind: "overview" | "priority" | "worse" | "better" | "good" | "voices" | "steady";
  text: string;
  textEn: string;
};

export function buildSummary(
  result: AnalysisResult,
  current: Period,
  previous: Period,
  counts: { reviews: number; voices: number; openVoices: number },
): SummaryLine[] {
  const prevLabel = PERIOD_UNITS.find((u) => u.id === current.unit)!.previous;
  const prevEn = PREVIOUS_EN[current.unit];
  const curEn = periodEn(current.unit, current.key, current.start, current.end);
  const prevPeriodEn = periodEn(previous.unit, previous.key, previous.start, previous.end);
  const axisEn = (label: string) => en(AXIS_EN, label);
  const lines: SummaryLine[] = [];

  lines.push({
    kind: "overview",
    text: `${periodLabel(current)}は、ネットの口コミ${counts.reviews}件と現場の声${counts.voices}件、あわせて${result.currentTotal}件を分析しました（${prevLabel}の${periodLabel(previous)}は${result.previousTotal}件）。`,
    textEn: `${curEn}: analyzed ${result.currentTotal} items — ${plural(counts.reviews, "online review")} and ${plural(counts.voices, "on-site comment")} (${prevPeriodEn}: ${result.previousTotal}).`,
  });

  if (result.alerts.length > 0) {
    lines.push({
      kind: "priority",
      text: `最優先で改善したいのは「${result.alerts.map((a) => a.label).join("」「")}」です。`,
      textEn: `Top priority for improvement: ${result.alerts.map((a) => axisEn(a.label)).join(", ")}.`,
    });
  }

  // 不満がいちばん多く寄せられた経路（現場の声の経路も含む。同数なら並べる）
  const topChannels = (axis: (typeof result.axes)[number]["axis"]) => {
    const max = Math.max(0, ...result.channels.map((c) => c.negative[axis]));
    if (max === 0) return null;
    const names = result.channels.filter((c) => c.negative[axis] === max).map((c) => c.channel);
    return {
      ja: names.length === 1 ? `${names[0]}（${max}件）` : `${names.join("と")}（各${max}件）`,
      en: `${names.map((n) => en(CHANNEL_EN, n)).join(" and ")} (${max}${names.length > 1 ? " each" : ""})`,
    };
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
          text: `${a.label}の不満の割合が${prevLabel}の${before}%から${now}%に増えました（${a.current.negative}件）。${channel ? `いちばん多く寄せられたのは${channel.ja}です。` : ""}`,
          textEn: `${axisEn(a.label)}: complaint rate rose from ${before}% to ${now}% vs. ${prevEn} (${plural(a.current.negative, "complaint")}).${channel ? ` Most came via ${channel.en}.` : ""}`,
        });
      } else if (before - now >= NOTABLE_CHANGE_PT && a.previous.negative >= 2) {
        // 改善していても、まだ優先改善アラートに入っている軸は、その旨を添える
        const stillAlert = result.alerts.some((x) => x.axis === a.axis);
        better.push({
          kind: "better",
          text: stillAlert
            ? `${a.label}は不満の割合が${before}%から${now}%に減り改善傾向ですが、不満はまだ多く（${a.current.negative}件）、引き続き優先して取り組む必要があります。`
            : `${a.label}は不満の割合が${before}%から${now}%に減り、改善しています。`,
          textEn: stillAlert
            ? `${axisEn(a.label)}: complaint rate fell from ${before}% to ${now}%, but complaints remain high (${a.current.negative}); keep it a priority.`
            : `${axisEn(a.label)}: improving — complaint rate fell from ${before}% to ${now}%.`,
        });
      }
    }
  }
  // 悪化を先に、改善をあとに並べる
  lines.push(...worse, ...better);

  for (const g of result.goodPoints) {
    const a = result.axes.find((x) => x.axis === g.axis)!;
    const share = pct(a.current.positive, a.current.mentions);
    lines.push({
      kind: "good",
      text: `${g.label}は好評が${a.current.positive}件（言及の${share}%）で、よいコメントが多く寄せられています。`,
      textEn: `${axisEn(g.label)}: a strength — ${plural(a.current.positive, "positive comment")} (${share}% of mentions).`,
    });
  }

  if (!comparable) {
    lines.push({
      kind: "steady",
      text: `${prevLabel}のデータがないため、変化は比べられません。`,
      textEn: `No data for ${prevEn}, so changes cannot be compared.`,
    });
  } else if (smallSample) {
    // 件数が少ない側だけを挙げる
    const small = [
      result.previousTotal < SMALL_SAMPLE ? `${prevLabel}は${result.previousTotal}件` : null,
      result.currentTotal < SMALL_SAMPLE ? `この期間は${result.currentTotal}件` : null,
    ].filter(Boolean);
    const smallEn = [
      result.previousTotal < SMALL_SAMPLE ? `${prevEn} has only ${result.previousTotal}` : null,
      result.currentTotal < SMALL_SAMPLE ? `this period has only ${result.currentTotal}` : null,
    ].filter(Boolean);
    lines.push({
      kind: "steady",
      text: `${small.join("、")}と件数が少ないため、不満の割合の変化は参考程度に見てください。`,
      textEn: `Small sample (${smallEn.join(", ")}); treat changes in complaint rates as indicative only.`,
    });
  } else if (worse.length === 0 && better.length === 0) {
    lines.push({
      kind: "steady",
      text: `${prevLabel}と比べて、不満の割合に大きな変化はありません。`,
      textEn: `No significant change in complaint rates vs. ${prevEn}.`,
    });
  }

  if (counts.openVoices > 0) {
    lines.push({
      kind: "voices",
      text: `この期間の現場の声のうち、対応が完了していないものが${counts.openVoices}件あります。`,
      textEn: `${plural(counts.openVoices, "on-site comment")} from this period ${counts.openVoices === 1 ? "is" : "are"} not yet resolved.`,
    });
  }
  return lines;
}
