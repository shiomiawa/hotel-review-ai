import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">口コミAI分析＆返信支援</h1>
        <p className="text-lg text-zinc-700 dark:text-zinc-300">口コミを、現場の改善につなげる。</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          口コミを4つの視点で分析し、優先して改善すべき点と強みを毎日お届けします。返信の下書きづくりもお手伝いします。
        </p>
      </header>
      <Dashboard />
    </main>
  );
}
