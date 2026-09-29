"use client"; // エラー表示の境界は Client Component にする必要がある

import { useEffect } from "react";

// 画面の表示中に予期しないエラーが起きたときに出すページ（真っ白にならないように）
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-bold">画面の表示中にエラーが起きました</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        もう一度表示し直してください。直らない場合は、ページを再読み込みしてください。
        読み込んだ口コミCSVは読み込み直しが必要ですが、記録した現場の声はこのブラウザに保存されています。
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => retry()} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
          もう一度表示する
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          ページを再読み込みする
        </button>
      </div>
    </main>
  );
}
