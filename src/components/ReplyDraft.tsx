"use client";

import { useState } from "react";
import { postJson } from "@/lib/apiClient";
import type { Review } from "@/lib/reviews";

// 口コミ1件への返信の下書き（補助機能・簡単な版：1案だけ出す）
// 出てきた下書きは画面で直せて、コピーして各サイトの管理画面に貼り付けて使う
export function ReplyDraft({ review }: { review: Review }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [mode, setMode] = useState<"mock" | "ai" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      // 外国語の口コミは原文を渡し、同じ言語で返信を作る
      const data = await postJson<{ mode: "mock" | "ai"; reply: string }>("/api/reply", {
        date: review.date,
        site: review.site,
        rating: review.rating,
        text: review.originalText ?? review.text,
      });
      setDraft(data.reply);
      setMode(data.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下書きを作れませんでした");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setError("コピーできませんでした。文章を選んでコピーしてください。");
    }
  }

  const smallButton =
    "rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

  if (draft === null) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" onClick={generate} disabled={loading} className={`${smallButton} self-start`}>
          {loading ? "下書きを作っています…" : "返信の下書きを作る"}
        </button>
        {error && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
      <span className="text-xs text-zinc-500">
        返信の下書き{mode === "mock" ? "（ダミー）" : "（AIが作成。内容を確かめてから使ってください）"}
      </span>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setCopied(false);
        }}
        rows={Math.min(10, Math.max(4, Math.ceil(draft.length / 40)))}
        aria-label="返信の下書き"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className={smallButton}>
          {copied ? "コピーしました" : "コピー"}
        </button>
        <button type="button" onClick={generate} disabled={loading} className={smallButton}>
          {loading ? "作り直しています…" : "作り直す"}
        </button>
        <button type="button" onClick={() => setDraft(null)} className="text-xs text-zinc-500 underline">
          閉じる
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
