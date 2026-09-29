"use client";

import { useState } from "react";
import { setPasscode, usePasscode, usePasscodeNeeded, useServerConfig } from "@/lib/apiClient";

// 画面上部に「いま使える機能」と、必要なときはデモ用パスコードの入力欄を出す
export function ServerStatus() {
  const config = useServerConfig();
  const saved = usePasscode();
  const needed = usePasscodeNeeded();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  if (!config) return null;
  const showInput = config.passcodeRequired && (!saved || needed || editing);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          AI：
          {config.aiMode === "ai" ? (
            <strong className="text-teal-700 dark:text-teal-400">Claude で分析</strong>
          ) : (
            <strong>ダミー（AIにつながず、キーワードで簡易判定）</strong>
          )}
        </span>
        <span>
          日次メール：<strong>{config.emailEnabled ? "送信できます" : "この環境では送信できません"}</strong>
        </span>
        {config.passcodeRequired && (
          <span>
            デモ用パスコード：
            <strong>{saved && !needed ? "入力済み" : "未入力"}</strong>
            {saved && !needed && !editing && (
              <button type="button" onClick={() => setEditing(true)} className="ml-2 underline">
                変更
              </button>
            )}
          </span>
        )}
      </div>

      {showInput && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPasscode(draft);
            setDraft("");
            setEditing(false);
          }}
        >
          <label className="flex items-center gap-2">
            {needed ? (
              <span className="text-red-700 dark:text-red-400">パスコードが違うか、未入力です。</span>
            ) : (
              <span>AIの分析とメール送信には、デモ用パスコードが必要です。</span>
            )}
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              aria-label="デモ用パスコード"
              className="w-40 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button type="submit" disabled={!draft.trim()} className="rounded-md bg-teal-700 px-3 py-1 text-sm text-white disabled:opacity-50">
            保存
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(false)} className="text-sm underline">
              やめる
            </button>
          )}
        </form>
      )}
    </div>
  );
}
