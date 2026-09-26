"use client";

import { useMemo, useState } from "react";
import { CHANNELS, MAX_ACTION_LENGTH, STATUSES, type Status, type Voice } from "@/lib/voices";

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<Status, string> = {
  未対応: "border border-amber-500 text-amber-700 dark:text-amber-400",
  対応中: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  完了: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function VoiceItem({
  voice,
  onUpdate,
  onDelete,
}: {
  voice: Voice;
  onUpdate: (patch: Partial<Voice>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState(voice.action);

  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium tabular-nums">{voice.receivedDate}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[voice.status]}`}>{voice.status}</span>
        <span>{voice.channel}</span>
        <span className="text-zinc-500">{voice.customerType}</span>
        {voice.rating !== undefined && (
          <span className="text-amber-500" aria-label={`評価 ${voice.rating}`}>
            {"★".repeat(voice.rating)}
            <span className="text-zinc-300 dark:text-zinc-600">{"★".repeat(5 - voice.rating)}</span>
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{voice.content}</p>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={action}
            onChange={(e) => setAction(e.target.value)}
            rows={2}
            maxLength={MAX_ACTION_LENGTH}
            aria-label="対応内容"
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onUpdate({ action: action.trim() });
                setEditing(false);
              }}
              className="rounded-md bg-teal-700 px-3 py-1 text-sm text-white hover:bg-teal-800"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setAction(voice.action);
                setEditing(false);
              }}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        voice.action && <p className="text-sm text-zinc-600 dark:text-zinc-400">対応：{voice.action}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          対応状況
          <select
            value={voice.status}
            onChange={(e) => onUpdate({ status: e.target.value as Status })}
            className={selectClass}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-teal-700 underline dark:text-teal-400">
            対応内容を{voice.action ? "編集" : "記入"}
          </button>
        )}
        <button
          type="button"
          onClick={() => window.confirm("この声を削除しますか？") && onDelete()}
          className="text-zinc-500 underline"
        >
          削除
        </button>
      </div>
    </li>
  );
}

export function VoiceList({
  voices,
  onUpdate,
  onDelete,
}: {
  voices: Voice[];
  onUpdate: (id: string, patch: Partial<Voice>) => void;
  onDelete: (id: string) => void;
}) {
  const [channel, setChannel] = useState("すべて");
  const [status, setStatus] = useState("すべて");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () =>
      voices
        .filter((v) => channel === "すべて" || v.channel === channel)
        .filter((v) => status === "すべて" || v.status === status)
        .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)),
    [voices, channel, status],
  );
  const openCount = voices.filter((v) => v.status !== "完了").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          経路
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              setShown(PAGE_SIZE);
            }}
            className={selectClass}
          >
            {["すべて", ...CHANNELS].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          対応状況
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setShown(PAGE_SIZE);
            }}
            className={selectClass}
          >
            {["すべて", ...STATUSES].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="text-zinc-500">
          {filtered.length}件（未完了 {openCount}件）
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {filtered.slice(0, shown).map((v) => (
          <VoiceItem
            key={v.id}
            voice={v}
            onUpdate={(patch) => onUpdate(v.id, patch)}
            onDelete={() => onDelete(v.id)}
          />
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">
            {voices.length === 0 ? "まだ現場の声はありません" : "条件に合う声はありません"}
          </li>
        )}
      </ul>

      {shown < filtered.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
          className="self-center rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          もっと見る（残り{filtered.length - shown}件）
        </button>
      )}
    </div>
  );
}
