/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { publicAuthEnabled, publicUser } from "@/lib/server/public-auth";

export type SessionUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "x-profectium-user-id";
const USER_EMAIL_HEADER = "x-profectium-user-email";
const USER_FULL_NAME_HEADER = "x-profectium-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "x-profectium-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-local";
const SIGN_OUT_PATH = "/signout-local";
const CALLBACK_PATH = "/callback";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers();
  // Public hosting must authenticate the session cookie, never client supplied identity headers.
  if (publicAuthEnabled()) return publicUser(requestHeaders);
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireCurrentUser(
  returnTo: string,
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;

  redirect(sessionSignInPath(returnTo));
}

export function sessionSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  if (publicAuthEnabled()) return `/signin?return_to=${encodeURIComponent(safeReturnTo)}`;
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function sessionSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  if (publicAuthEnabled()) return `/signout?return_to=${encodeURIComponent(safeReturnTo)}`;
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
