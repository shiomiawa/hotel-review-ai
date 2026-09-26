"use client";

import { useSyncExternalStore } from "react";
import { loadVoices, saveVoices, type Voice } from "@/lib/voices";

// 現場の声の保存場所（ブラウザ内）を React から読み書きするための小さな仕組み。
// サーバーでの描画中はブラウザの保存領域がないので、空のデータとして扱う。

const EMPTY: Voice[] = [];
let cache: Voice[] | null = null;
let saveFailed = false;
const listeners = new Set<() => void>();

function getSnapshot(): Voice[] {
  if (cache === null) cache = loadVoices();
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setVoices(update: (prev: Voice[]) => Voice[]) {
  cache = update(getSnapshot());
  saveFailed = !saveVoices(cache);
  listeners.forEach((l) => l());
}

export function useVoices(): Voice[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

// 保存に失敗しているか（プライベートモードなどで保存領域が使えないとき）
export function useVoiceSaveFailed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => saveFailed,
    () => false,
  );
}
