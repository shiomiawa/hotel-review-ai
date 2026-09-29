import { MAX_ITEMS, MAX_TEXT_LENGTH } from "@/lib/analysis";
import { mockClassify } from "@/lib/mockClassify";

// 口コミと現場の声を4軸に分類するAPI。
// いまは USE_MOCK_AI が "false" でない限りダミー分類を返す（AIへの接続はステップ6）。

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

  if (process.env.USE_MOCK_AI !== "false") {
    return Response.json({ mode: "mock", classifications: mockClassify(items) });
  }
  return Response.json({ error: "AIによる分類はまだ接続していません（ステップ6で追加）" }, { status: 501 });
}
