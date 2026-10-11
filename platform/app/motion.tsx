/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { useMotionPreference } from "./use-motion-preference";
import { grades, roles, type Candidate, type Grade, type Role } from "@/lib/types";
import {
  Command as CommandIcon,
  Pause,
  Play,
  ArrowUpRight,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function BrandOrbit() {
  return (
    <div className="brand-orbit" aria-hidden="true">
      <Image
        src="/brand/trajectory.png"
        width={411}
        height={312}
        alt=""
        unoptimized
      />
      <span>PROOF → POTENTIAL</span>
    </div>
  );
}
export function MotionControls() {
  const [paused, setPaused] = useMotionPreference();
  return (
    <button
      className="motion-toggle"
      title={paused ? "Включить анимации" : "Отключить анимации"}
      aria-label={paused ? "Включить анимации" : "Отключить анимации"}
      aria-pressed={paused}
      onClick={() => setPaused(!paused)}
    >
      {paused ? <Play size={14} /> : <Pause size={14} />}
    </button>
  );
}
/** Content stays visible during SSR and if animation APIs are unavailable. */
export function MotionReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused] = useMotionPreference();
  useEffect(() => {
    const element = ref.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || paused || media.matches || !window.IntersectionObserver || !element.animate) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      animation = element.animate([{ transform: "translateY(12px)" }, { transform: "translateY(0)" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
    }, { threshold: 0.05 });
    observer.observe(element);
    const changed = () => { if (media.matches) { observer.disconnect(); animation?.cancel(); } };
    media.addEventListener("change", changed);
    return () => { observer.disconnect(); animation?.cancel(); media.removeEventListener("change", changed); };
  }, [paused]);
  return <div ref={ref} className={className}>{children}</div>;
}
export function CommandMenu({
  isEmployer,
  navigate,
  candidates = [],
  onProfile,
  onCategory,
}: {
  isEmployer: boolean;
  navigate: (view: string) => void;
  candidates?: Candidate[];
  onProfile?: (id: string) => void;
  onCategory?: (role: Role, grade: Grade) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["k", "л"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const availableCandidates = isEmployer ? candidates.filter((candidate) => candidate.available !== false && candidate.qualification) : [];
  const categoryItems = roles.flatMap((role) => grades.map((grade) => ({ role, grade, count: availableCandidates.filter((candidate) => candidate.qualification?.role === role && candidate.qualification.grade === grade).length })));
  const items = [
    ...(isEmployer
      ? [
          ["catalog", "Найти специалиста"],
          ["company", "Профиль компании"],
          ["board", "Рабочая подборка и заметки"],
          ["compare", "Сравнить специалистов"],
          ["insights", "Обзор подбора"],
          ["integrations", "API и интеграции"],
        ]
      : [
          ["assessment", "Пройти тест / моя категория"],
          ["profile", "Изменить профиль"],
          ["career", "План развития"],
        ]),
    ["jobs", "Вакансии"],
    ["offers", "Предложения"],
    ["tests", "Тесты работодателей: задания, приглашения и результаты"],
    ["signals", "Пульт: радары, источники и сроки"],
    ["studio", "Подбор и навыки: паспорт, практика, переговоры"],
    ["account", "Рабочий аккаунт"],
    ["about", "Как работает подбор"],
  ];
  return (
    <>
      <button
        className="command-trigger"
        onClick={() => setOpen(true)}
        aria-label="Быстрый переход (Ctrl K)"
      >
        <CommandIcon size={14} />
        <kbd>Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="command-dialog">
          <DialogHeader>
            <DialogTitle>Куда направимся?</DialogTitle>
            <DialogDescription>
              {isEmployer && onProfile ? "Найдите раздел, специалиста или категорию. " : "Найдите раздел по названию. "}Навигация стрелками, выбор — Enter. Ctrl+K или Ctrl+Л.
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder={isEmployer && onProfile ? "Раздел, имя, навык или категория…" : "Например, сравнение или профиль…"} />
            <CommandList>
              <CommandEmpty>Раздел не найден</CommandEmpty>
              <CommandGroup
                heading={isEmployer ? "Работодателю" : "Соискателю"}
              >
                {items.map(([view, title]) => (
                  <CommandItem
                    key={view}
                    value={title}
                    onSelect={() => {
                      navigate(view);
                      setOpen(false);
                    }}
                  >
                    <span>{title}</span>
                    <ArrowUpRight size={16} />
                  </CommandItem>
                ))}
              </CommandGroup>
              {isEmployer && onCategory && <CommandGroup heading="Категории по результатам теста">
                {categoryItems.map(({ role, grade, count }) => <CommandItem key={`${role}-${grade}`} value={`Категория ${role} ${grade}`} onSelect={() => { onCategory(role, grade); setOpen(false); }}>
                  <span>{role} · {grade}</span><span className="muted">{count} проф.</span>
                </CommandItem>)}
              </CommandGroup>}
              {isEmployer && onProfile && availableCandidates.length > 0 && <CommandGroup heading="Доступные специалисты">
                {availableCandidates.map((candidate) => {
                  const name = candidate.isAnonymous ? `Кандидат ${candidate.id.slice(-6).toUpperCase()}` : candidate.fullName;
                  return <CommandItem key={candidate.id} value={`${name} ${candidate.qualification?.role} ${candidate.qualification?.grade} ${candidate.skills.join(" ")}`} onSelect={() => { onProfile(candidate.id); setOpen(false); }}>
                    <span>{name}<small className="muted"> · {candidate.qualification?.role} · {candidate.qualification?.grade}</small></span><ArrowUpRight size={16} />
                  </CommandItem>;
                })}
              </CommandGroup>}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
