import { timingSafeEqual } from "node:crypto";

// 公開URLからの使いすぎを防ぐ仕組み（サーバー側だけで使う）
// ① デモ用パスコード：環境変数 DEMO_PASSCODE を設定したときだけ、AI・メールのAPIでパスコードを求める
// ② 1日の上限：AIで分類する件数・AIの要約の回数・メールの送信回数を、1日ごとに数えて上限を超えたら断る
//
// データベースを使わないので、回数はサーバーのメモリで数える。
// Vercel ではサーバーが入れ替わると数え直しになるため、上限は「念のため」の守り。主な守りはパスコード。

export const PASSCODE_HEADER = "x-demo-passcode";

export type QuotaKind = "classifyItems" | "summaries" | "emails";

// 1日の上限の初期値（環境変数で変えられる）
const DEFAULT_LIMITS: Record<QuotaKind, number> = {
  classifyItems: 300, // AIで分類する件数（口コミ＋現場の声）
  summaries: 30, // AIの要約の回数
  emails: 10, // メールの送信回数
};
const LIMIT_ENV: Record<QuotaKind, string> = {
  classifyItems: "DAILY_LIMIT_CLASSIFY_ITEMS",
  summaries: "DAILY_LIMIT_SUMMARIES",
  emails: "DAILY_LIMIT_EMAILS",
};
const LABELS: Record<QuotaKind, string> = {
  classifyItems: "AIで分類できる件数",
  summaries: "AIの要約の回数",
  emails: "メールの送信回数",
};

export function dailyLimit(kind: QuotaKind): number {
  const v = Number(process.env[LIMIT_ENV[kind]]);
  return Number.isInteger(v) && v >= 0 ? v : DEFAULT_LIMITS[kind];
}

// 日付は日本時間で区切る
const todayJst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const usage = new Map<string, number>(); // "2026-09-30|emails" → 回数

export const passcodeRequired = () => Boolean(process.env.DEMO_PASSCODE);

// パスコードが必要な環境で、正しいパスコードが付いていなければ 401 を返す
export function checkPasscode(request: Request): Response | null {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return null;
  const given = request.headers.get(PASSCODE_HEADER) ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // 長さが違うときも同じように扱い、一致の判定は時間差で推測されない方法で行う
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) return null;
  return Response.json(
    { error: given ? "パスコードが違います。" : "この機能を使うには、デモ用パスコードの入力が必要です。", code: "PASSCODE_REQUIRED" },
    { status: 401 },
  );
}

// 1日の上限を超えないか確かめ、超えなければ amount だけ数える（超えるときは 429 を返し、数えない）
export function takeQuota(kind: QuotaKind, amount = 1): Response | null {
  const key = `${todayJst()}|${kind}`;
  // 前日までの記録は捨てる
  for (const k of usage.keys()) if (!k.startsWith(todayJst())) usage.delete(k);
  const used = usage.get(key) ?? 0;
  const limit = dailyLimit(kind);
  if (used + amount > limit) {
    const left = Math.max(0, limit - used);
    const unit = kind === "classifyItems" ? "件" : "回";
    // すでに上限に達しているのか、今回の依頼が残りを超えるだけなのかで、案内を分ける
    const error =
      left === 0
        ? `本日の${LABELS[kind]}の上限（${limit}${unit}）に達しました。明日（日本時間0時）以降にもう一度お試しください。`
        : `今回の依頼（${amount}${unit}）は、本日の${LABELS[kind]}の残り（${left}${unit}）を超えています。${kind === "classifyItems" ? "分析する期間を短くして（年→月、月→週）お試しください。" : ""}`;
    return Response.json({ error, code: "DAILY_LIMIT" }, { status: 429 });
  }
  usage.set(key, used + amount);
  return null;
}

// AIの呼び出しに失敗したときは、数えた分を戻す（使っていない分で上限を減らさないため）
export function refundQuota(kind: QuotaKind, amount = 1) {
  const key = `${todayJst()}|${kind}`;
  usage.set(key, Math.max(0, (usage.get(key) ?? 0) - amount));
}
