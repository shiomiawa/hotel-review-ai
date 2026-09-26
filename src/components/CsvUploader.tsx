"use client";

import { useRef, useState } from "react";
import { decodeCsv, MAX_FILE_BYTES, parseReviewsCsv, type ParseResult } from "@/lib/reviews";

const SAMPLE_URL = "/sample/reviews_sample.csv";

type Props = {
  onLoaded: (result: ParseResult, sourceName: string) => void;
};

export function CsvUploader({ onLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(getBuffer: () => Promise<ArrayBuffer>, sourceName: string) {
    setError(null);
    setLoading(true);
    try {
      const buffer = await getBuffer();
      onLoaded(parseReviewsCsv(decodeCsv(buffer)), sourceName);
    } catch {
      setError("ファイルを読み込めませんでした。CSVファイルか確認してください。");
    } finally {
      setLoading(false);
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("CSVファイル（.csv）を選んでください。");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`ファイルが大きすぎます。${MAX_FILE_BYTES / 1024 / 1024}MB以内にしてください。`);
      return;
    }
    load(() => file.arrayBuffer(), file.name);
  }

  function loadSample() {
    load(async () => {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error("sample not found");
      return res.arrayBuffer();
    }, "サンプルデータ（架空の口コミ）");
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging
            ? "border-teal-500 bg-teal-50 dark:bg-teal-950"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          OTA管理画面から取り出した口コミCSVを、ここにドラッグ＆ドロップ
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            CSVファイルを選ぶ
          </button>
          <button
            type="button"
            onClick={loadSample}
            disabled={loading}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            サンプルを試す
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = ""; // 同じファイルをもう一度選べるようにする
          }}
        />
        <p className="text-xs text-zinc-500">
          必要な列：date, site, rating, text, stay_type（UTF-8・Shift_JIS どちらも可）
        </p>
        {loading && <p className="text-sm text-zinc-500">読み込み中…</p>}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
