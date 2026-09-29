import { buildDailyEmail, validateDailyEmailData } from "@/lib/dailyEmail";
import { checkPasscode, refundQuota, takeQuota } from "@/lib/usageGuard";

// 日次メールを Resend で送るAPI。
// 送り先は環境変数 MAIL_TO に固定し、画面から宛先を指定できないようにする（ほかの人へのいたずら送信を防ぐ）。
// 画面から受け取ったデータでメールを作り直し、画面のHTMLはそのまま使わない。

const MAX_BODY_BYTES = 500_000;

// 画面に返すときは宛先の一部を伏せる（例：s***@gmail.com）
const maskEmail = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1***$2");

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.MAIL_TO;
  const from = process.env.MAIL_FROM || "口コミAI分析 <onboarding@resend.dev>";
  if (!apiKey || !to) {
    return Response.json(
      { error: "メール送信の設定（RESEND_API_KEY・MAIL_TO）がありません。この環境ではメールを送れません。" },
      { status: 503 },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "送られたデータが大きすぎます" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "送られたデータを読み取れませんでした" }, { status: 400 });
  }
  const data = validateDailyEmailData(body);
  if (typeof data === "string") return Response.json({ error: data }, { status: 400 });

  // メール送信はパスコードと1日の上限を確かめる
  const denied = checkPasscode(request) ?? takeQuota("emails");
  if (denied) return denied;

  const { subject, html, text } = buildDailyEmail(data);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    const result = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      // よくある原因を日本語で伝える（キーの中身などは出さない）
      const reason =
        res.status === 401 || res.status === 403
          ? "Resend のAPIキーが正しくないか、送り先が Resend に登録したメールアドレスではありません（自分のドメインを設定していない間は、登録したアドレスにしか送れません）"
          : res.status === 422
            ? "送信元または送り先のメールアドレスの形が正しくありません"
            : res.status === 429
              ? "送信の回数が多すぎます。少し待ってからもう一度お試しください"
              : `メールを送れませんでした（${res.status}）`;
      console.error("メール送信に失敗:", res.status, result.message);
      refundQuota("emails");
      return Response.json({ error: reason }, { status: 502 });
    }
    return Response.json({ ok: true, id: result.id, to: maskEmail(to), subject });
  } catch {
    refundQuota("emails");
    return Response.json({ error: "メール送信サービスにつながりませんでした" }, { status: 502 });
  }
}
