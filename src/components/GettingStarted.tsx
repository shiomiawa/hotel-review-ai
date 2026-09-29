import { AXES } from "@/lib/analysis";

// まだ何も読み込んでいないときに出す、アプリの使い方（毎日の流れ）
const STEPS = [
  {
    title: "集める",
    text: "OTA管理画面などから口コミCSVを取り出して読み込みます。現場で受けたお客様の声は「現場の声の記録」に、その日のうちに入力します。",
  },
  {
    title: "分析する",
    text: "ネットの口コミと現場の声を、同じ4つの視点でAIが分類。前の期間と比べて、優先して改善すべき点とよいコメントを示します。",
  },
  {
    title: "共有する",
    text: "ボタン1つで、当日の口コミと現場の声、月の要約を現場スタッフへメールで送ります。返信が必要な口コミは、下書きを作れます。",
  },
];

export function GettingStarted() {
  return (
    <section aria-labelledby="getting-started" className="flex flex-col gap-4 rounded-xl border border-teal-200 bg-teal-50/60 p-4 sm:p-5 dark:border-teal-900 dark:bg-teal-950/40">
      <div className="flex flex-col gap-1">
        <h2 id="getting-started" className="text-lg font-bold">
          毎日の使い方
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          まずは下の<strong>「サンプルを試す」</strong>で、架空のホテルの口コミ13か月分を読み込んでみてください。
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-1.5 rounded-lg bg-white p-3 shadow-sm dark:bg-zinc-900">
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-xs text-white">{i + 1}</span>
              {s.title}
            </span>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <span>分析する4つの視点：</span>
        {AXES.map((a) => (
          <span key={a.id} className="rounded-full border border-teal-300 bg-white px-2 py-0.5 text-teal-900 dark:border-teal-800 dark:bg-zinc-900 dark:text-teal-200">
            {a.label}
          </span>
        ))}
      </div>
    </section>
  );
}
