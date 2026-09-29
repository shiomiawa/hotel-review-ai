"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// 画面からAPIを呼ぶときの共通の処理。
// ・デモ用パスコードを付けて送る
// ・通信エラーやサーバーのエラーを、日本語の分かりやすい文にして返す

const PASSCODE_HEADER = "x-demo-passcode";
const STORAGE_KEY = "hotel-review-ai:demo-passcode";

// ---- パスコード（このブラウザに保存。保存できない環境でも画面が動くようにする） ----
let passcode: string | null = null;
let passcodeNeeded = false; // サーバーからパスコードを求められたか
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readPasscode(): string {
  if (passcode === null) {
    try {
      passcode = window.localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      passcode = "";
    }
  }
  return passcode;
}

export function setPasscode(value: string) {
  passcode = value.trim();
  try {
    if (passcode) window.localStorage.setItem(STORAGE_KEY, passcode);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存できなくても、画面を開いている間は使える
  }
  passcodeNeeded = false;
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const usePasscode = () => useSyncExternalStore(subscribe, readPasscode, () => "");
export const usePasscodeNeeded = () => useSyncExternalStore(subscribe, () => passcodeNeeded, () => false);

// ---- API呼び出し ----

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [PASSCODE_HEADER]: readPasscode() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("サーバーと通信できませんでした。インターネットの接続を確かめて、もう一度お試しください。", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === "PASSCODE_REQUIRED") {
      passcodeNeeded = true;
      notify();
    }
    const fallback =
      res.status >= 500 ? "サーバーでエラーが起きました。少し時間をおいてもう一度お試しください。" : "処理できませんでした。";
    throw new ApiError(data.error ?? fallback, res.status, data.code);
  }
  return data as T;
}

// ---- サーバーの設定（いま使える機能） ----

export type ServerConfig = {
  aiMode: "mock" | "ai";
  emailEnabled: boolean;
  passcodeRequired: boolean;
  limits: { classifyItems: number; summaries: number; emails: number; replies: number };
};

export function useServerConfig(): ServerConfig | null {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}
