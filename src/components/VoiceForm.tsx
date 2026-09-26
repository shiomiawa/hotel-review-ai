"use client";

import { useState } from "react";
import {
  CHANNELS,
  CUSTOMER_TYPES,
  findPersonalInfo,
  MAX_ACTION_LENGTH,
  MAX_CONTENT_LENGTH,
  STATUSES,
  validateVoice,
  type VoiceInput,
} from "@/lib/voices";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const field = "flex flex-col gap-1 text-sm";
const control =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function VoiceForm({ onAdd }: { onAdd: (v: VoiceInput) => void }) {
  const [receivedDate, setReceivedDate] = useState(todayLocal);
  const [channel, setChannel] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState("");
  const [status, setStatus] = useState<string>("未対応");
  const [action, setAction] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  // 氏名・電話番号・部屋番号のような書き方があれば、保存前に気づけるよう注意を出す
  const personalInfo = findPersonalInfo(`${content}\n${action}`);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      receivedDate,
      channel,
      customerType,
      content: content.trim(),
      rating: rating === "" ? undefined : Number(rating),
      status,
      action: action.trim(),
    };
    const problems = validateVoice(input);
    setErrors(problems);
    setSaved(false);
    if (problems.length > 0) return;
    if (
      personalInfo.length > 0 &&
      !window.confirm(`${personalInfo.join("・")}が含まれているようです。個人を特定できる情報を消してから保存してください。\nこのまま保存しますか？`)
    )
      return;
    onAdd(input as VoiceInput);
    // 続けて入力しやすいよう、受付日と経路は残す
    setCustomerType("");
    setContent("");
    setRating("");
    setStatus("未対応");
    setAction("");
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={field}>
          受付日
          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className={control} />
        </label>
        <label className={field}>
          経路
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={control}>
            <option value="">選んでください</option>
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          お客様の区分
          <select value={customerType} onChange={(e) => setCustomerType(e.target.value)} className={control}>
            <option value="">選んでください</option>
            {CUSTOMER_TYPES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <label className={field}>
        内容
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={MAX_CONTENT_LENGTH}
          placeholder="例：部屋の奥ではWi-Fiが弱いとのお申し出。"
          className={control}
        />
        <span className="text-xs text-zinc-500">
          お客様の氏名・電話番号・部屋番号は書かないでください。
        </span>
      </label>
      {personalInfo.length > 0 && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {personalInfo.join("・")}が含まれているようです。個人を特定できる情報は消してください。
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={field}>
          評価（任意）
          <select value={rating} onChange={(e) => setRating(e.target.value)} className={control}>
            <option value="">なし</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                ★{n}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          対応状況
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={control}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <label className={field}>
        対応内容（任意）
        <textarea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          rows={2}
          maxLength={MAX_ACTION_LENGTH}
          placeholder="例：ルーターの設定を見直した。"
          className={control}
        />
      </label>

      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-red-600 dark:text-red-400">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
          保存する
        </button>
        {saved && <span className="text-sm text-teal-700 dark:text-teal-400">保存しました</span>}
      </div>
    </form>
  );
}
