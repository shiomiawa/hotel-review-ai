import { AXES } from "@/lib/analysis";
import { describeAIError, isMockAI, summarizeWithClaude, type SummaryInput } from "@/lib/claude";

// ネットの口コミと現場の声をまとめ、軸ごとに「どんな不満・好評か」をAIで要約するAPI。
// AIには数字を書かせない（件数は画面側でアプリの計算値を添える）。
// USE_MOCK_AI が "false" でない間は、AIを呼ばずにダミーの要約を返す。

export const maxDuration = 60;

const MAX_BODY_TEXT = 60_000; // 送られてくる文字数の上限（使いすぎ対策）
const AXIS_LABELS: string[] = AXES.map((a) => a.label);

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function readInput(body: unknown): SummaryInput | string {
  if (typeof body !== "object" || body === null) return "データがありません";
  const b = body as Record<string, unknown>;
  if (typeof b.periodLabel !== "string") return "期間がありません";
  if (
    !Array.isArray(b.axes) ||
    b.axes.length === 0 ||
    b.axes.length > AXIS_LABELS.length ||
    !b.axes.every((a) => {
      const x = a as Record<string, unknown>;
      return (
        typeof a === "object" &&
        a !== null &&
        typeof x.label === "string" &&
        AXIS_LABELS.includes(x.label) &&
        isStringArray(x.negative) &&
        isStringArray(x.positive)
      );
    })
  )
    return "axes の形が正しくありません";
  const input = { periodLabel: b.periodLabel, axes: b.axes } as SummaryInput;
  if (JSON.stringify(input).length > MAX_BODY_TEXT) return "送られた文章が長すぎます";
  return input;
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
      axes: input.axes.map((a) => ({
        label: a.label,
        complaints: a.negative.length > 0 ? "（ダミー）AIにつなぐと、ここに不満の内容の要約が入ります。" : "",
        praises: a.positive.length > 0 ? "（ダミー）AIにつなぐと、ここに好評の内容の要約が入ります。" : "",
      })),
    });
  }
  try {
    const { axes, usage, model } = await summarizeWithClaude(input);
    return Response.json({ mode: "ai", axes, usage, model });
  } catch (error) {
    const { message, status } = describeAIError(error);
    console.error("要約に失敗:", message);
    return Response.json({ error: message }, { status });
  }
}
