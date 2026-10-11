/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Все права сохранены. */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { publicAuthEnabled, publicUser, safeAuthReturn } from "@/lib/server/public-auth";
import { SignInForm } from "./signin-form";
export const dynamic = "force-dynamic";
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const returnTo = safeAuthReturn(typeof query.return_to === "string" ? query.return_to : null);
  if (!publicAuthEnabled()) redirect(`/signin-local?return_to=${encodeURIComponent(returnTo)}`);
  if (publicAuthEnabled()) redirect("/" + encodeURIComponent("Лендинг") + ".dc.html?auth=" + (query.mode === "register" ? "register" : "login"));
  const user = await publicUser(await headers());
  if (user && !user.guest) redirect(returnTo);
  return <SignInForm returnTo={returnTo} initialRegister={query.mode === "register"} />;
}
