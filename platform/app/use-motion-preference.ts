/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { useEffect, useSyncExternalStore } from "react";
const storageKey = "profectium-motion";
const localEvent = "profectium-motion-change";
let localFallback: boolean | undefined;
function getMotionSnapshot() {
  if (localFallback !== undefined) return localFallback;
  try {
    return localStorage.getItem(storageKey) === "off";
  } catch {
    return false;
  }
}
const getServerMotion = () => false;
function subscribeMotion(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      localFallback = undefined;
      listener();
    }
  };
  window.addEventListener("storage", storage);
  window.addEventListener(localEvent, listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(localEvent, listener);
  };
}
function writeMotion(paused: boolean) {
  localFallback = paused;
  try {
    localStorage.setItem(storageKey, paused ? "off" : "auto");
  } catch {
    /* the in-memory preference still works when storage is blocked */
  }
  document.documentElement.dataset.motion = paused ? "off" : "auto";
  window.dispatchEvent(new Event(localEvent));
}
export function useMotionPreference() {
  const paused = useSyncExternalStore(
    subscribeMotion,
    getMotionSnapshot,
    getServerMotion,
  );
  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "off" : "auto";
  }, [paused]);
  return [paused, writeMotion] as const;
}
