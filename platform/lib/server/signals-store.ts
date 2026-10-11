/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { allState } from "./store";
import { type AccessContext } from "./access";
import { records, decode, careerState } from "./career-store";
import { hash } from "./security";
import { radarCandidates, publicSignature } from "../signals-domain";
import type {
  Radar,
  RadarView,
  FeedSource,
  Listing,
  ImportRun,
  ActionTask,
  SignalsState,
} from "../signals-types";
export async function radarSnapshot(
  ctx: AccessContext,
  radar: Pick<Radar, "filters">,
  base?: Awaited<ReturnType<typeof allState>>,
) {
  const b = base ?? (await allState(ctx));
  if (
    radar.filters.jobId &&
    radar.filters.jobId !== "all" &&
    !b.jobs.some((j) => j.id === radar.filters.jobId && j.status === "active")
  )
    return {};
  const matches = radarCandidates(b.candidates, radar.filters, b.jobs);
  return Object.fromEntries(
    await Promise.all(
      matches.map(async (c) => [c.id, await hash(publicSignature(c))]),
    ),
  );
}
export const actorTag = (ctx: AccessContext) =>
  ctx.account.role + ":" + ctx.account.candidate_id;
export async function signalsState(ctx: AccessContext): Promise<SignalsState> {
  const b = await allState(ctx),
    career = await careerState(ctx),
    employer = ctx.account.role === "employer";
  const completed = new Set(
    (await records(ctx, "done"))
      .map((r) => JSON.parse(r.data))
      .filter((d) => d.actor === actorTag(ctx) && d.done)
      .map((d) => d.taskId),
  );
  const tasks: ActionTask[] = [];
  for (const r of career.requests) {
    if (
      (employer && r.state === "submitted") ||
      (!employer && r.state === "requested")
    )
      tasks.push({
        id: "request:" + r.id,
        kind: "request",
        title: employer
          ? "Дать обратную связь: " + r.title
          : "Проверка: " + r.title,
        detail: r.skill,
        dueAt: r.dueAt,
        targetId: r.id,
        done: false,
      });
  }
  for (const d of career.dialogues) {
    if (!b.offers.some((o) => o.id === d.offerId && o.status === "pending"))
      continue;
    const last = [...d.events]
      .reverse()
      .find((e) => e.kind === "step" && e.dueAt);
    if (last)
      tasks.push({
        id: "dialogue:" + d.id + ":" + last.id,
        kind: "dialogue",
        title:
          "Следующий шаг: " +
          (b.offers.find((o) => o.id === d.id)?.jobTitle ?? "Предложение"),
        detail: last.text,
        dueAt: last.dueAt!,
        targetId: d.id,
        done: false,
      });
  }
  tasks.forEach((t) => (t.done = completed.has(t.id)));
  tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const radars: RadarView[] = [];
  if (employer)
    for (const r of await records(ctx, "radar")) {
      const x = decode<Radar>(r),
        current = await radarSnapshot(ctx, x, b);
      const { seen, ...visible } = x;
      radars.push({
        ...visible,
        total: Object.keys(current).length,
        ids: Object.keys(current),
        added: Object.keys(current).filter((id) => !(id in seen)),
        changed: Object.keys(current).filter(
          (id) => id in seen && seen[id] !== current[id],
        ),
        removed: Object.keys(seen).filter((id) => !(id in current)).length,
      });
    }
  return {
    radars,
    sources: employer
      ? (await records(ctx, "source")).map((r) => decode<FeedSource>(r))
      : [],
    listings: employer
      ? (await records(ctx, "listing")).map((r) => decode<Listing>(r))
      : [],
    imports: employer
      ? (await records(ctx, "import"))
          .slice(0, 10)
          .map((r) => decode<ImportRun>(r))
      : [],
    // Preserve the response shape without exposing retired feature data.
    plans: [],
    tasks,
    generatedAt: new Date().toISOString(),
  };
}
