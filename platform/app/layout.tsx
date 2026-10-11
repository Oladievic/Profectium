/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import type { Metadata } from "next";
import "./globals.css";
import "./profectium.css";
import "./studio.css";
import "./signals.css";
import "./employer-tests.css";
import "./upgrade-theme.css";
export const metadata: Metadata = {
  title: "Profectium — талант, подтверждённый делом",
  description:
    "ИТ-специалисты, достижения и прямые предложения от работодателей. Отраслевой сервис обратного подбора по кейсу ФСП.",
  icons: { icon: "/brand/profectium.svg", shortcut: "/brand/profectium.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
