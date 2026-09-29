import { describeAIError, generateReply, isMockAI } from "@/lib/claude";
import { checkPasscode, refundQuota, takeQuota } from "@/lib/usageGuard";

// 口コミへの返信の下書きを1案作るAPI（補助機能・簡単な版）。
// USE_MOCK_AI が "false" でない間は、AIを呼ばずにダミーの下書きを返す。

export const maxDuration = 60;

const MAX_TEXT_LENGTH = 2000;

function readInput(body: unknown) {
  if (typeof body !== "object" || body === null) return "データがありません";
  const b = body as Record<string, unknown>;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return "日付が正しくありません";
  if (typeof b.site !== "string" || b.site.length > 100) return "サイト名が正しくありません";
  if (typeof b.rating !== "number" || !Number.isFinite(b.rating) || b.rating < 1 || b.rating > 5) return "評価が正しくありません";
  if (typeof b.text !== "string" || !b.text.trim()) return "本文のない口コミには返信の下書きを作れません";
  if (b.text.length > MAX_TEXT_LENGTH) return `本文が長すぎます（${MAX_TEXT_LENGTH}文字まで）`;
  return { date: b.date, site: b.site, rating: b.rating, text: b.text };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "送られたデータを読み取れませんでした" }, { status: 400 });
  }
  const input = readInput(body);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  if (isMockAI()) {
    return Response.json({
      mode: "mock",
      reply:
        "（ダミーの下書き）このたびはご宿泊いただき、また口コミをお寄せいただき、ありがとうございます。いただいたお言葉はスタッフ一同で共有いたします。またのお越しを心よりお待ちしております。\n（AIにつなぐと、口コミの内容に合わせた下書きになります）",
    });
  }
  // 本物のAIは費用がかかるので、パスコードと1日の上限を確かめる
  const denied = checkPasscode(request) ?? takeQuota("replies");
  if (denied) return denied;
  try {
    const { reply, usage, model } = await generateReply(input);
    return Response.json({ mode: "ai", reply, usage, model });
  } catch (error) {
    refundQuota("replies");
    const { message, status } = describeAIError(error);
    console.error("返信下書きに失敗:", message);
    return Response.json({ error: message }, { status });
  }
}
