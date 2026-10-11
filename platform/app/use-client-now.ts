/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { useSyncExternalStore } from "react";
let snapshot: number | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();
const getSnapshot = () => snapshot;
const getServerSnapshot = () => null;
function tick() {
  snapshot = Date.now();
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick();
    timer = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = undefined;
      snapshot = null;
      window.removeEventListener("focus", tick);
    }
  };
}
export function useClientNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
