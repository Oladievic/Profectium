/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { SearchX } from "lucide-react";
export function Picker({
  label,
  value,
  onChange,
  options,
  id,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className="picker">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          return (
            <SelectItem key={v} value={v}>
              {typeof o === "string" ? o : o.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Empty className="empty-state">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  );
}
