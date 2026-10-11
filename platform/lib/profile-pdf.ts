/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Candidate } from "./types";
import { salary, categories } from "./domain";
export async function createProfilePdf(c: Candidate, fontBytes: Uint8Array) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  doc.setTitle(`ФСП · Профиль — ${c.fullName}`);
  doc.setAuthor("Profectium / демонстрационный прототип");
  let page = doc.addPage([595, 842]),
    y = 790;
  const write = (text: string, size = 10, color = rgb(0.13, 0.14, 0.18)) => {
    const words = text.replace(/[\u0000-\u001f]/g, " ").split(/\s+/);
    let line = "";
    const flush = () => {
      if (y < 55) {
        page = doc.addPage([595, 842]);
        y = 790;
      }
      page.drawText(line, { x: 44, y, size, font, color });
      y -= size * 1.55;
      line = "";
    };
    for (const word of words) {
      if (
        font.widthOfTextAtSize((line ? line + " " : "") + word, size) > 505 &&
        line
      )
        flush();
      if (font.widthOfTextAtSize(word, size) > 505) {
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > 505) flush();
          line += char;
        }
      } else line += (line ? " " : "") + word;
    }
    if (line) flush();
  };
  const heading = (text: string) => {
    y -= 14;
    write(text, 13, rgb(0.25, 0.18, 1));
    y -= 5;
  };
  write("PROFECTIUM", 13, rgb(0.25, 0.18, 1));
  y -= 20;
  write(c.fullName, 22);
  write("Демонстрационный профиль. Не является сертификатом квалификации.", 9);
  heading("Категория и условия");
  for (const q of categories(c).slice(0, 1)) {
    write(q.label, 14);
    write(q.basis);
  }
  write(
    `${c.city} · ${c.workFormat} · опыт со слов кандидата: ${c.yearsExperience} лет`,
  );
  write(`Ожидания: ${salary(c.salaryMin, c.salaryMax)} / месяц до налогов`);
  heading("О себе");
  write(c.bio);
  heading("Навыки");
  write(c.skills.join(" · "));
  if (c.softSkills?.length) {
    heading("Работа в команде");
    write(c.softSkills.join(" · "));
  }
  heading("Достижения ФСП");
  if (c.achievements.length)
    for (const a of c.achievements) {
      write(`${a.year} · ${a.competition}`);
      write(
        `${a.discipline} · место ${a.place} из ${a.participants} · ${a.teamRole}. Источник: синтетический мок ФСП.`,
        9,
      );
      y -= 8;
    }
  else
    write(
      "Истории ФСП нет. Это не препятствует прохождению теста и присвоению категории.",
    );
  heading("Приватность");
  write(
    "Контактные данные не включены в PDF. Работодатель получает их в сервисе после принятия его приглашения.",
  );
  for (const [i, p] of doc.getPages().entries())
    p.drawText(
      `Profectium / ${i + 1} / ${new Date().toLocaleDateString("ru-RU")}`,
      { x: 44, y: 28, size: 8, font, color: rgb(0.45, 0.45, 0.5) },
    );
  return await doc.save();
}
export async function downloadProfile(c: Candidate) {
  const response = await fetch("/fonts/JetBrainsMono-Regular.ttf");
  if (!response.ok) throw new Error("Font unavailable");
  const bytes = await createProfilePdf(
    c,
    new Uint8Array(await response.arrayBuffer()),
  );
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "fsp-profile.pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
