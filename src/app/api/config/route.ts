import { isMockAI } from "@/lib/claude";
import { dailyLimit, passcodeRequired } from "@/lib/usageGuard";

// 画面に「いま使える機能」を伝えるAPI（キーなどの中身は返さない）
export function GET() {
  return Response.json({
    aiMode: isMockAI() ? "mock" : "ai",
    emailEnabled: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_TO),
    passcodeRequired: passcodeRequired(),
    limits: {
      classifyItems: dailyLimit("classifyItems"),
      summaries: dailyLimit("summaries"),
      emails: dailyLimit("emails"),
      replies: dailyLimit("replies"),
    },
  });
}
