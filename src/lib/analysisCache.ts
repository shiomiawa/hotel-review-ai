"use client";

import { useCallback, useState } from "react";
import { classificationKey, type AnalysisItem, type Classification, type PeriodUnit } from "@/lib/analysis";

// 4軸分析の結果（分類・AIの要約・AIの利用量）の保存場所。
// 分析画面と日次メールの両方から使うため、ページ全体で1つだけ持つ。

// AIの利用量と料金の目安（100万トークンあたりの米ドル。1ドル=150円で換算）
export type Usage = { inputTokens: number; outputTokens: number };
const PRICES: Record<string, { input: number; output: number; name: string }> = {
  "claude-haiku-4-5": { input: 1, output: 5, name: "Claude Haiku 4.5" },
  "claude-sonnet-5": { input: 2, output: 10, name: "Claude Sonnet 5" },
};
export const YEN_PER_DOLLAR = 150;
export const costYen = (u: Usage, model: string) => {
  const p = PRICES[model];
  return p ? ((u.inputTokens * p.input + u.outputTokens * p.output) / 1_000_000) * YEN_PER_DOLLAR : null;
};
export const modelName = (model: string | null) => (model ? (PRICES[model]?.name ?? model) : "");

// AIの要約：軸ごとに「不満の内容」「好評の内容」の文だけ（数字は画面側でアプリの計算値を添える）
export type AiSummary = {
  mode: "mock" | "ai";
  axes: { label: string; complaints: string; praises: string }[];
};

// AIの要約の保存場所の目印。期間と、その期間の分類対象（件数・ID・本文）が同じなら同じ目印になる
export function summaryKeyFor(unit: PeriodUnit, periodKey: string, targetItems: AnalysisItem[]) {
  const itemsSignature = targetItems.map((i) => classificationKey(i)).join("|");
  return `${unit}|${periodKey}|${targetItems.length}|${itemsSignature.length}`;
}

export type AnalysisCache = ReturnType<typeof useAnalysisCache>;

export function useAnalysisCache() {
  // 分類結果は本文ごとに保存し、期間を切り替えても使い回す（まだ分類していない分だけ送る）
  const [classifications, setClassifications] = useState<Map<string, Classification>>(new Map());
  const [mode, setMode] = useState<"mock" | "ai" | null>(null);
  // この画面を開いてからのAIの利用量（効果測定のAPIコストの記録にも使う）
  const [usage, setUsage] = useState<{ total: Usage; model: string | null }>({
    total: { inputTokens: 0, outputTokens: 0 },
    model: null,
  });
  // AIの要約は、期間ごと・分類結果ごとに保存して使い回す
  const [aiSummaries, setAiSummaries] = useState<Map<string, AiSummary>>(new Map());

  const addUsage = useCallback((u: Usage | undefined, model: string | undefined) => {
    if (!u) return;
    setUsage((prev) => ({
      total: { inputTokens: prev.total.inputTokens + u.inputTokens, outputTokens: prev.total.outputTokens + u.outputTokens },
      model: model ?? prev.model,
    }));
  }, []);

  return { classifications, setClassifications, mode, setMode, usage, addUsage, aiSummaries, setAiSummaries };
}
