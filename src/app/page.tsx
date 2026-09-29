import { Dashboard } from "@/components/Dashboard";

// ヘッダーで伝えること（主役の分析を先に、返信の下書きは最後に控えめに）
const FEATURES = ["ネットの口コミ＋現場の声", "4つの視点で分析", "優先改善アラート", "日次メール", "返信の下書き（補助）"];

export default function Home() {
  return (
    <>
      <header className="bg-gradient-to-br from-teal-800 to-teal-950 text-white">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-8 sm:py-10">
          <div className="flex items-center gap-2.5">
            <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h16v11H9l-4 3.5V16H4z" className="fill-white/10" />
              <path d="M8 13v-2M12 13V8M16 13v-4" />
            </svg>
            <h1 className="text-lg font-bold tracking-wide sm:text-xl">口コミAI分析＆返信支援</h1>
          </div>
          <p className="text-2xl font-bold leading-snug sm:text-3xl">口コミを、現場の改善につなげる。</p>
          <p className="max-w-2xl text-sm leading-relaxed text-teal-50/90">
            ネットの口コミと、現場で受けたお客様の声をひとつにまとめ、4つの視点で分析して、優先して改善すべき点と強みを毎日お届けします。返信の下書きづくりもお手伝いします。
          </p>
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="主な機能">
            {FEATURES.map((f) => (
              <li key={f} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-teal-50 ring-1 ring-white/20">
                {f}
              </li>
            ))}
          </ul>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8">
        <Dashboard />
      </main>
    </>
  );
}
