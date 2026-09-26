"use client";

import { useRef, useState } from "react";
import { VoiceForm } from "@/components/VoiceForm";
import { VoiceList } from "@/components/VoiceList";
import { decodeCsv, MAX_FILE_BYTES } from "@/lib/reviews";
import { setVoices, useVoiceSaveFailed, useVoices } from "@/lib/voiceStore";
import { parseVoicesCsv, voiceKey, voicesToCsv, type Voice } from "@/lib/voices";

const SAMPLE_URL = "/sample/voices_sample.csv";
const newId = () => crypto.randomUUID();

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function VoicesPanel() {
  const voices = useVoices();
  const saveFailed = useVoiceSaveFailed();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; errors: string[] } | null>(null);

  // CSVの声を今のデータに追加する（同じ受付日・経路・内容の声は二重に入れない）
  function importCsv(csvText: string, sourceName: string) {
    const { voices: incoming, errors } = parseVoicesCsv(csvText, newId);
    const existing = new Set(voices.map(voiceKey));
    const fresh = incoming.filter((v) => !existing.has(voiceKey(v)));
    if (fresh.length > 0) setVoices((prev) => [...prev, ...fresh]);
    const skipped = incoming.length - fresh.length;
    setMessage({
      text: `${sourceName}：${fresh.length}件を追加しました${skipped > 0 ? `（すでにある${skipped}件は追加していません）` : ""}。`,
      errors,
    });
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setMessage({ text: "CSVファイル（.csv）を選んでください。", errors: [] });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage({ text: "ファイルが大きすぎます。5MB以内にしてください。", errors: [] });
      return;
    }
    importCsv(decodeCsv(await file.arrayBuffer()), file.name);
  }

  async function loadSample() {
    const res = await fetch(SAMPLE_URL);
    if (!res.ok) {
      setMessage({ text: "サンプルを読み込めませんでした。", errors: [] });
      return;
    }
    importCsv(decodeCsv(await res.arrayBuffer()), "サンプル（架空の現場の声）");
  }

  function exportCsv() {
    const blob = new Blob([voicesToCsv(voices)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    a.href = url;
    a.download = `voices_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (!window.confirm(`現場の声 ${voices.length}件をすべて削除します。先にCSVで書き出しておくことをおすすめします。削除しますか？`))
      return;
    setVoices(() => []);
    setMessage({ text: "すべて削除しました。", errors: [] });
  }

  const update = (id: string, patch: Partial<Voice>) =>
    setVoices((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">現場の声を記録する</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          アンケート・フロント・電話やメール・旅行会社や団体から受けたお客様の声を記録します。ネットの口コミと同じ4つの視点で分析します。
        </p>
        <VoiceForm onAdd={(input) => setVoices((prev) => [...prev, { id: newId(), ...input }])} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">記録した声と対応状況</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className={buttonClass}>
            CSVから追加
          </button>
          <button type="button" onClick={exportCsv} disabled={voices.length === 0} className={buttonClass}>
            CSVで書き出す
          </button>
          <button type="button" onClick={loadSample} className={buttonClass}>
            サンプルを追加
          </button>
          <button type="button" onClick={clearAll} disabled={voices.length === 0} className={buttonClass}>
            すべて削除
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              loadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-xs text-zinc-500">
          記録はこのパソコンのブラウザ内に保存されます。ほかの端末やスタッフと共有するとき、バックアップを取るときはCSVで書き出してください。
        </p>
        {saveFailed && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            このブラウザでは保存できませんでした（プライベートモードなど）。画面を閉じると消えるので、CSVで書き出してください。
          </p>
        )}
        {message && (
          <div className="text-sm">
            <p className="rounded-md bg-teal-50 px-3 py-2 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message.text}</p>
            {message.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-amber-800 dark:text-amber-300">
                {message.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <VoiceList
          voices={voices}
          onUpdate={update}
          onDelete={(id) => setVoices((prev) => prev.filter((v) => v.id !== id))}
        />
      </section>
    </div>
  );
}
