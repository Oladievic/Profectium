/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import Platform from "./platform";
import { publicAuthEnabled } from "@/lib/server/public-auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const publicAuth = publicAuthEnabled();
  if (publicAuth) {
    const query = await searchParams;
    const pages: Record<string, string> = { catalog: "Каталог", company: "Пульт", jobs: "Пульт", offers: "Приглашения", assessments: "Тестирование", profile: "Кабинет-кандидата", workbench: "Интеграции" };
    const page = typeof query.view === "string" ? pages[query.view] || "Лендинг" : "Лендинг";
    const suffix = query.mode === "demo" || query.mode === "live" ? "?mode=" + query.mode : "";
    redirect("/" + encodeURIComponent(page) + ".dc.html" + suffix);
  }
  return <Platform publicAuth={publicAuth} />;
}
