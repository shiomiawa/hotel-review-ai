import { MAX_ITEMS, MAX_TEXT_LENGTH } from "@/lib/analysis";
import { classifyWithClaude, describeAIError, isMockAI } from "@/lib/claude";
import { mockClassify } from "@/lib/mockClassify";
import { checkPasscode, refundQuota, takeQuota } from "@/lib/usageGuard";

// 口コミと現場の声を4軸に分類するAPI。
// USE_MOCK_AI が "false" のときだけ Claude で分類し、それ以外はダミー分類を返す。

// 1年分をまとめて分類すると時間がかかるため、処理の上限時間を延ばす（秒）
export const maxDuration = 60;

type Item = { id: string; text: string };

function readItems(body: unknown): Item[] | string {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { items?: unknown }).items))
    return "items がありません";
  const items = (body as { items: unknown[] }).items;
  if (items.length === 0) return "分析する口コミ・現場の声がありません";
  if (items.length > MAX_ITEMS) return `一度に分析できるのは${MAX_ITEMS}件までです`;
  const valid = items.every(
    (i): i is Item =>
      typeof i === "object" &&
      i !== null &&
      typeof (i as Item).id === "string" &&
      typeof (i as Item).text === "string" &&
      (i as Item).text.length <= MAX_TEXT_LENGTH,
  );
  return valid ? (items as Item[]) : `データの形が正しくないか、${MAX_TEXT_LENGTH}文字を超える本文があります`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "送られたデータを読み取れませんでした" }, { status: 400 });
  }
  const items = readItems(body);
  if (typeof items === "string") return Response.json({ error: items }, { status: 400 });

  if (isMockAI()) {
    return Response.json({ mode: "mock", classifications: mockClassify(items) });
  }
  // 本物のAIは費用がかかるので、パスコードと1日の上限を確かめる
  const denied = checkPasscode(request) ?? takeQuota("classifyItems", items.length);
  if (denied) return denied;
  try {
    const { results, usage, model } = await classifyWithClaude(items);
    return Response.json({ mode: "ai", classifications: results, usage, model });
  } catch (error) {
    refundQuota("classifyItems", items.length);
    const { message, status } = describeAIError(error);
    console.error("分類に失敗:", message);
    return Response.json({ error: message }, { status });
  }
}
