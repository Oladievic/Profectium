/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { getCurrentUser } from "@/app/session-auth";
import { resolveAccess, type AccessContext } from "@/lib/server/access";
import { database, allState } from "@/lib/server/store";
import {
  response,
  readJson,
  ServiceError,
  hash,
  limit,
} from "@/lib/server/security";
import {
  record,
  records,
  decode,
  insertStatement,
  updateStatement,
  changed,
  role,
  type Kind,
} from "@/lib/server/career-store";
import {
  signalsState,
  radarSnapshot,
  actorTag,
} from "@/lib/server/signals-store";
import {
  radarSchema,
  sourceSchema,
  feedSchema,
  filterSchema,
  revision,
} from "@/lib/server/signals-validation";
import { text } from "@/lib/server/career-validation";
import {
  canonicalUrl,
  itemFingerprint,
  changedFields,
  listingQuality,
  sameListing,
  radarCandidates,
  candidateCsv,
  calendar,
} from "@/lib/signals-domain";
import type {
  Radar,
  FeedSource,
  Listing,
  ImportRun,
  ImportLine,
  FeedItem,
} from "@/lib/signals-types";
import { defaultFilters } from "@/lib/types";
import { z, ZodError } from "zod";
export const dynamic = "force-dynamic";
const stamp = () => new Date().toISOString();
const idSchema = z.string().uuid();
async function privateRow(ctx: AccessContext, kind: Kind, id: string) {
  role(ctx, "employer");
  const r = await record(ctx, kind, id);
  if (!r || r.employer_id !== ctx.account.owner)
    throw new ServiceError(404, "Запись недоступна");
  return r;
}
const file = (content: string, type: string, name: string) =>
  new Response(content, {
    headers: {
      "Content-Type": type + "; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError(401, "Войдите в Profectium");
    const u = new URL(req.url),
      ctx = await resolveAccess(
        user.userId,
        u.pathname.startsWith("/api/live/"),
      ),
      p = (await context.params).path,
      route = p.join("/"),
      method = req.method,
      db = database();
    if (p.length > 3 || p[0] === "plans")
      throw new ServiceError(404, "Раздел не найден");
    if (method === "GET") {
      if (route === "state") return response(await signalsState(ctx));
      if (route === "calendar")
        return file(
          calendar((await signalsState(ctx)).tasks, stamp()),
          "text/calendar",
          "profectium-actions.ics",
        );
      if (route === "export") {
        role(ctx, "employer");
        let raw = defaultFilters;
        try {
          if (u.searchParams.has("filters"))
            raw = JSON.parse(u.searchParams.get("filters")!);
        } catch {
          throw new ServiceError(422, "Некорректные фильтры");
        }
        const f = filterSchema.parse(raw),
          b = await allState(ctx);
        if (
          f.jobId &&
          f.jobId !== "all" &&
          !b.jobs.some((j) => j.id === f.jobId && j.status === "active")
        )
          throw new ServiceError(409, "Потребность больше не активна");
        return file(
          candidateCsv(radarCandidates(b.candidates, f, b.jobs), f, stamp()),
          "text/csv",
          "profectium-candidates.csv",
        );
      }
      throw new ServiceError(404, "Раздел не найден");
    }
    if (!["POST", "PUT", "PATCH"].includes(method))
      throw new ServiceError(405, "Метод не поддерживается");
    if (req.headers.get("origin") !== u.origin)
      throw new ServiceError(403, "Запрос должен поступить с этой страницы");
    if (req.headers.get("x-session-revision") !== String(ctx.account.revision))
      throw new ServiceError(409, "Роль изменилась. Обновите страницу");
    const input = await readJson(req);
    await limit("signals:" + ctx.account.owner, 100, 60000);
    if (route === "radars" && method === "POST") {
      role(ctx, "employer");
      const v = z
        .object({ id: idSchema, data: radarSchema })
        .strict()
        .parse(input);
      if ((await records(ctx, "radar")).length >= 20)
        throw new ServiceError(422, "Можно сохранить до 20 радаров");
      const seen = await radarSnapshot(ctx, v.data);
      changed(
        (
          await insertStatement(
            ctx,
            "radar",
            v.id,
            { ...v.data, seen, checkedAt: stamp(), paused: false },
            "",
            ctx.account.owner,
          ).run()
        ).meta.changes,
      );
      return response(await signalsState(ctx), 201);
    }
    if (p[0] === "radars" && p.length === 2 && method === "PATCH") {
      const r = await privateRow(ctx, "radar", p[1]),
        old = decode<Radar>(r),
        v = z
          .object({
            revision,
            action: z.enum(["acknowledge", "pause", "resume", "edit"]),
            data: radarSchema.optional(),
          })
          .strict()
          .parse(input);
      if (v.action === "edit" && !v.data)
        throw new ServiceError(422, "Нужны условия поиска");
      const data = {
        ...old,
        ...(v.action === "edit" ? v.data : {}),
        paused:
          v.action === "pause"
            ? true
            : v.action === "resume"
              ? false
              : old.paused,
      };
      if (v.action === "acknowledge" || v.action === "edit") {
        data.seen = await radarSnapshot(ctx, data);
        data.checkedAt = stamp();
      }
      changed(
        (await updateStatement(ctx, r, v.revision, data).run()).meta.changes,
      );
      return response(await signalsState(ctx));
    }
    if (route === "sources" && method === "POST") {
      role(ctx, "employer");
      const v = z
        .object({ id: idSchema, data: sourceSchema })
        .strict()
        .parse(input);
      if ((await records(ctx, "source")).length >= 20)
        throw new ServiceError(422, "Можно добавить до 20 источников");
      changed(
        (
          await insertStatement(
            ctx,
            "source",
            v.id,
            { ...v.data, active: true },
            "",
            ctx.account.owner,
          ).run()
        ).meta.changes,
      );
      return response(await signalsState(ctx), 201);
    }
    if (p[0] === "sources" && p.length === 2 && method === "PATCH") {
      const r = await privateRow(ctx, "source", p[1]),
        v = z.object({ revision, active: z.boolean() }).strict().parse(input);
      changed(
        (
          await updateStatement(ctx, r, v.revision, {
            ...decode(r),
            active: v.active,
          }).run()
        ).meta.changes,
      );
      return response(await signalsState(ctx));
    }
    if (route === "imports/preview" && method === "POST") {
      role(ctx, "employer");
      const v = z
          .object({
            sourceId: idSchema,
            sourceRevision: revision,
            items: z.array(z.unknown()).min(1).max(20),
          })
          .strict()
          .parse(input),
        sr = await privateRow(ctx, "source", v.sourceId),
        source = decode<FeedSource>(sr);
      if (!source.active || sr.revision !== v.sourceRevision)
        throw new ServiceError(409, "Источник изменился или приостановлен");
      const existing = (await records(ctx, "listing")).map((r) =>
          decode<Listing>(r),
        ),
        rows: ImportLine[] = [],
        keys = new Set<string>(),
        urls = new Set<string>();
      for (const [index, raw] of v.items.entries()) {
        const parsed = feedSchema.safeParse(raw);
        if (!parsed.success) {
          rows.push({
            index,
            status: "invalid",
            errors: parsed.error.issues.map(
              (e) => e.path.join(".") + ": " + e.message,
            ),
            warnings: [],
          });
          continue;
        }
        const item = parsed.data as FeedItem;
        item.url = canonicalUrl(item.url);
        if (new URL(item.url).hostname !== new URL(source.website).hostname) {
          rows.push({
            index,
            status: "invalid",
            errors: ["Домен ссылки отличается от домена источника"],
            warnings: [],
          });
          continue;
        }
        const id = await hash(source.id + ":" + item.externalId),
          fp = await hash(itemFingerprint(item)),
          old = existing.find((x) => x.id === id),
          collision = existing.find(
            (x) => x.id !== id && canonicalUrl(x.url) === item.url,
          );
        if (keys.has(id) || urls.has(item.url) || collision) {
          rows.push({
            index,
            status: "duplicate",
            errors: [
              "Повтор ID или канонической ссылки. Автоматическое объединение отключено.",
            ],
            warnings: [],
            item,
          });
          continue;
        }
        keys.add(id);
        urls.add(item.url);
        rows.push({
          index,
          id,
          item,
          fingerprint: fp,
          expectedRevision: old?.revision ?? -1,
          status: old
            ? old.fingerprint === fp
              ? "unchanged"
              : "changed"
            : "new",
          changedFields: old ? changedFields(old, item) : [],
          errors: [],
          warnings: [
            ...listingQuality(item).notes,
            ...(existing.some((x) => x.id !== id && sameListing(x, item))
              ? [
                  "Похожая компания и название: проверьте возможный дубль вручную",
                ]
              : []),
          ],
        });
      }
      if (existing.length + rows.filter((r) => r.status === "new").length > 500)
        throw new ServiceError(422, "Лимит рабочего каталога — 500 записей");
      const id = crypto.randomUUID(),
        data = {
          sourceId: source.id,
          sourceRevision: source.revision,
          phase: "preview",
          expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
          rows,
        };
      changed(
        (
          await insertStatement(
            ctx,
            "import",
            id,
            data,
            "",
            ctx.account.owner,
            "AND EXISTS(SELECT 1 FROM career_records WHERE owner=? AND kind='source' AND id=? AND revision=? AND json_extract(data,'$.active')=1)",
            [ctx.account.owner, source.id, source.revision],
          ).run()
        ).meta.changes,
      );
      return response(
        { preview: decode<ImportRun>((await record(ctx, "import", id))!) },
        201,
      );
    }
    if (
      p[0] === "imports" &&
      p.length === 3 &&
      p[2] === "commit" &&
      method === "POST"
    ) {
      const r = await privateRow(ctx, "import", p[1]),
        run = decode<ImportRun>(r),
        v = z.object({ revision }).strict().parse(input);
      if (run.phase === "committed") return response(await signalsState(ctx));
      if (Date.parse(run.expiresAt) < Date.now())
        throw new ServiceError(409, "Предпросмотр устарел. Создайте новый");
      const valid = run.rows.filter(
        (x) =>
          x.item && x.id && ["new", "changed", "unchanged"].includes(x.status),
      );
      if (!valid.length) throw new ServiceError(422, "Нет строк для импорта");
      let guard =
        "AND EXISTS(SELECT 1 FROM career_records WHERE owner=? AND kind='source' AND id=? AND revision=? AND json_extract(data,'$.active')=1)";
      const args: (string | number)[] = [
        ctx.account.owner,
        run.sourceId,
        run.sourceRevision,
      ];
      guard +=
        " AND NOT EXISTS(SELECT 1 FROM json_each(?) incoming LEFT JOIN career_records current ON current.owner=? AND current.kind='listing' AND current.id=json_extract(incoming.value,'$.id') WHERE COALESCE(current.revision,-1)<>json_extract(incoming.value,'$.revision') OR EXISTS(SELECT 1 FROM career_records collision WHERE collision.owner=? AND collision.kind='listing' AND collision.id<>json_extract(incoming.value,'$.id') AND json_extract(collision.data,'$.url')=json_extract(incoming.value,'$.url'))) AND (SELECT COUNT(*) FROM career_records WHERE owner=? AND kind='listing')+?<=500";
      args.push(
        JSON.stringify(
          valid.map((line) => ({
            id: line.id,
            revision: line.expectedRevision,
            url: line.item!.url,
          })),
        ),
        ctx.account.owner,
        ctx.account.owner,
        ctx.account.owner,
        valid.filter((line) => line.status === "new").length,
      );
      const nonce = crypto.randomUUID(),
        at = stamp(),
        statements = [
          updateStatement(
            ctx,
            r,
            v.revision,
            {
              ...run,
              phase: "committed",
              committedAt: at,
              mutationNonce: nonce,
            },
            guard,
            args,
          ),
        ];
      for (const line of valid) {
        const old = await record(ctx, "listing", line.id!),
          data = old ? decode<Listing>(old) : null;
        const material =
          line.status === "unchanged" && data
            ? Object.fromEntries(
                Object.keys(line.item!).map((key) => [
                  key,
                  data[key as keyof Listing],
                ]),
              )
            : line.item;
        const next = {
          ...material,
          sourceId: run.sourceId,
          fingerprint: line.fingerprint,
          review:
            line.status === "unchanged"
              ? (data?.review ?? "pending")
              : "pending",
          firstSeenAt: data?.firstSeenAt ?? at,
          lastSeenAt: at,
          history: [
            ...(data?.history ?? []),
            ...(line.status === "changed"
              ? [{ at, fields: line.changedFields ?? [] }]
              : []),
          ].slice(-10),
        };
        statements.push(
          db
            .prepare(
              "INSERT INTO career_records(owner,kind,id,candidate_id,employer_id,data,revision,created_at) SELECT ?,'listing',?,'',?,?,0,? WHERE EXISTS(SELECT 1 FROM career_records WHERE owner=? AND kind='import' AND id=? AND json_extract(data,'$.mutationNonce')=?) ON CONFLICT(owner,kind,id) DO UPDATE SET data=excluded.data,revision=career_records.revision+1",
            )
            .bind(
              ctx.account.owner,
              line.id!,
              ctx.account.owner,
              JSON.stringify(next),
              data?.createdAt ?? at,
              ctx.account.owner,
              r.id,
              nonce,
            ),
        );
      }
      const result = await db.batch(statements);
      changed(result[0].meta.changes);
      return response(await signalsState(ctx));
    }
    if (p[0] === "listings" && p.length === 2 && method === "PATCH") {
      const r = await privateRow(ctx, "listing", p[1]),
        v = z
          .object({
            revision,
            review: z.enum(["pending", "accepted", "rejected"]),
          })
          .strict()
          .parse(input);
      changed(
        (
          await updateStatement(ctx, r, v.revision, {
            ...decode(r),
            review: v.review,
          }).run()
        ).meta.changes,
      );
      return response(await signalsState(ctx));
    }
    if (route === "tasks" && method === "POST") {
      const v = z
        .object({ taskId: text(250, 3), done: z.boolean() })
        .strict()
        .parse(input);
      if (!(await signalsState(ctx)).tasks.some((t) => t.id === v.taskId))
        throw new ServiceError(404, "Действие недоступно");
      const id = await hash(actorTag(ctx) + ":" + v.taskId),
        r = await record(ctx, "done", id),
        data = { actor: actorTag(ctx), taskId: v.taskId, done: v.done };
      if (r)
        changed(
          (await updateStatement(ctx, r, r.revision, data).run()).meta.changes,
        );
      else
        changed(
          (
            await insertStatement(
              ctx,
              "done",
              id,
              data,
              ctx.account.candidate_id,
              ctx.account.role === "employer" ? ctx.account.owner : "",
            ).run()
          ).meta.changes,
        );
      return response(await signalsState(ctx));
    }
    throw new ServiceError(404, "Раздел не найден");
  } catch (e) {
    if (e instanceof ServiceError)
      return response({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return response(
        {
          error: e.issues
            .map((x) => x.path.join(".") + ": " + x.message)
            .join("; "),
        },
        422,
      );
    console.error(
      "Signals request failed",
      e instanceof Error ? e.message : "unknown",
    );
    return response({ error: "Не удалось выполнить действие" }, 500);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH };
