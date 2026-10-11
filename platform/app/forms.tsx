/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Field, Picker } from "./ui";
import {
  roles,
  type Candidate,
  type Job,
  type Role,
  type Company,
} from "@/lib/types";
import { salary } from "@/lib/domain";
type Mutation = (
  path: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
) => Promise<boolean>;
const grades = ["Junior", "Middle", "Senior"];
const formats = ["Удалённо", "Гибрид", "Офис"];
const skillsFrom = (v: string) =>
  Array.from(
    new Set(
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
export function JobForm({
  open,
  onClose,
  mutate,
  busy,
}: {
  company: string;
  open: boolean;
  onClose: () => void;
  mutate: Mutation;
  busy: boolean;
}) {
  const [role, setRole] = useState<Role>("Frontend"),
    [grade, setGrade] = useState("Middle"),
    [format, setFormat] = useState("Удалённо");
  const [key, setKey] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await mutate(
      "jobs",
      "POST",
      {
        title: f.get("title"),
        company: f.get("company"),
        role,
        grade,
        city: f.get("city"),
        workFormat: format,
        salaryMin: Number(f.get("salaryMin")),
        salaryMax: Number(f.get("salaryMax")),
        skills: skillsFrom(String(f.get("skills"))),
        description: f.get("description"),
      },
      { "Idempotency-Key": key },
    );
    if (ok) {
      setKey(crypto.randomUUID());
      onClose();
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="form-dialog">
        <DialogHeader>
          <DialogTitle>Новая вакансия</DialogTitle>
          <DialogDescription>
            Расскажите о задачах и условиях. Суммы — в рублях за месяц до вычета
            налогов.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="form-grid">
          <Field label="Название вакансии">
            <input
              name="title"
              required
              minLength={3}
              maxLength={100}
              placeholder="Frontend-разработчик в продуктовую команду"
            />
          </Field>
          <div className="form-row">
            <Field label="Компания">
              <input
                name="company"
                required
                minLength={2}
                maxLength={80}
                defaultValue="Орбита · демокомпания"
              />
            </Field>
            <Field label="Город">
              <input
                name="city"
                required
                minLength={2}
                maxLength={60}
                defaultValue="Москва"
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Специализация">
              <Picker
                label="Специализация вакансии"
                value={role}
                onChange={(v) => setRole(v as Role)}
                options={[...roles]}
              />
            </Field>
            <Field label="Уровень">
              <Picker
                label="Грейд вакансии"
                value={grade}
                onChange={setGrade}
                options={grades}
              />
            </Field>
          </div>
          <Field label="Формат работы">
            <Picker
              label="Формат вакансии"
              value={format}
              onChange={setFormat}
              options={formats}
            />
          </Field>
          <div className="form-row">
            <Field label="Зарплата от, ₽">
              <input
                name="salaryMin"
                type="number"
                required
                min={10000}
                max={2000000}
                step={1000}
                defaultValue={180000}
              />
            </Field>
            <Field label="Зарплата до, ₽">
              <input
                name="salaryMax"
                type="number"
                required
                min={10000}
                max={2000000}
                step={1000}
                defaultValue={250000}
              />
            </Field>
          </div>
          <Field label="Навыки" hint="Перечислите через запятую">
            <input
              name="skills"
              required
              maxLength={500}
              placeholder="React, TypeScript, PostgreSQL"
            />
          </Field>
          <Field label="Задачи и условия">
            <textarea
              name="description"
              required
              minLength={30}
              maxLength={5000}
              rows={4}
              placeholder="Над чем предстоит работать, кто в команде и что вы предлагаете"
            />
          </Field>
          <div className="form-actions">
            <button type="button" className="button plain" onClick={onClose}>
              Отмена
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Опубликовать вакансию"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function OfferForm({
  candidate,
  jobs,
  initialJobId,
  company,
  onClose,
  mutate,
  busy,
}: {
  candidate: Candidate | null;
  jobs: Job[];
  initialJobId?: string;
  company: Company;
  onClose: () => void;
  mutate: Mutation;
  busy: boolean;
}) {
  const active = jobs.filter((j) => j.status === "active");
  const [jobId, setJobId] = useState(initialJobId ?? "none");
  const key = useState(() => crypto.randomUUID())[0];
  const current = active.find((j) => j.id === jobId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!candidate) return;
    const f = new FormData(e.currentTarget);
    if (
      await mutate(
        "offers",
        "POST",
        {
          candidateId: candidate.id,
          jobId: jobId === "none" ? "" : jobId,
          jobTitle: current?.title ?? String(f.get("jobTitle")),
          employerContact: f.get("employerContact"),
          workFormat: f.get('workFormat'),
          coreHours: f.get('coreHours'),
          onCall: f.get('onCall'),
          salaryMin: Number(f.get("salaryMin")),
          salaryMax: Number(f.get("salaryMax")),
          message: f.get("message"),
        },
        { "Idempotency-Key": key },
      )
    )
      onClose();
  }
  return (
    <Dialog open={!!candidate} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="form-dialog">
        <DialogHeader>
          <DialogTitle>Предложение · {candidate?.fullName}</DialogTitle>
          <DialogDescription>
            Кандидат увидит условия, компанию и ваш способ связи. Все суммы — до
            вычета налогов.
          </DialogDescription>
        </DialogHeader>
        {
          <form onSubmit={submit} className="form-grid">
            <Field label="Вакансия">
              <Picker
                label="Вакансия для предложения"
                value={jobId}
                onChange={setJobId}
                options={[
                  { value: "none", label: "Прямое приглашение без вакансии" },
                  ...active.map((j) => ({ value: j.id, label: j.title })),
                ]}
              />
            </Field>
            {jobId === "none" && (
              <Field label="Название предложения">
                <input
                  name="jobTitle"
                  required
                  minLength={3}
                  maxLength={100}
                  placeholder="Frontend-разработчик в нашу команду"
                />
              </Field>
            )}
            <Field label="Связаться с компанией">
              <input
                name="employerContact"
                required
                minLength={5}
                maxLength={150}
                defaultValue={company.contact}
              />
            </Field>
            <p className="small-note">
              Компания: {company.name}. Контакты кандидата откроются после
              принятия приглашения.
            </p>
            <div className="info-box">
              Ожидания кандидата:{" "}
              {candidate && salary(candidate.salaryMin, candidate.salaryMax)} /
              мес.
            </div>
            <div className="form-row" key={jobId}>
              <Field label="Предлагаем от, ₽">
                <input
                  name="salaryMin"
                  required
                  type="number"
                  min={10000}
                  max={2000000}
                  step={1000}
                  defaultValue={current?.salaryMin ?? candidate?.salaryMin}
                />
              </Field>
              <Field label="Предлагаем до, ₽">
                <input
                  name="salaryMax"
                  required
                  type="number"
                  min={10000}
                  max={2000000}
                  step={1000}
                  defaultValue={current?.salaryMax ?? candidate?.salaryMax}
                />
              </Field>
            </div>
            <Field label="Сообщение кандидату">
              <textarea
                name="message"
                required
                minLength={20}
                maxLength={2000}
                rows={5}
                defaultValue={`${candidate?.fullName.split(" ")[0]}, здравствуйте! Нам интересен ваш опыт. Предлагаем познакомиться с командой и обсудить задачи нашей вакансии.`}
              />
            </Field>
            <div className="form-row">
              <Field label="Формат"><select name="workFormat" defaultValue={candidate?.workFormat??'Удалённо'}>{['Удалённо','Гибрид','Офис'].map(x=><option key={x}>{x}</option>)}</select></Field>
              <Field label="Дежурства"><select name="onCall"><option value="discuss">Обсудим</option><option value="no">Нет</option><option value="yes">Есть</option></select></Field>
            </div>
            <Field label="Общие рабочие часы и часовой пояс"><input name="coreHours" maxLength={100} placeholder="Например, 11:00–16:00 МСК" defaultValue={candidate?.incomingRules?.coreHours??''}/></Field>
            {candidate?.incomingRules?.strict&&<p className="info-box">Включены строгие условия кандидата: от {candidate.incomingRules.minimumSalary.toLocaleString('ru-RU')} ₽, {candidate.incomingRules.formats.join(', ')||'любой формат'}. Несоответствующее приглашение сервер не отправит.</p>}
            <button className="button primary" disabled={busy}>
              {busy ? "Отправляем…" : "Отправить предложение"}
            </button>
          </form>
        }
      </DialogContent>
    </Dialog>
  );
}
export function ProfileForm({
  mode="demo",
  candidate,
  mutate,
  busy,
}: {
  candidate: Candidate;
  mode?:"demo"|"live";
  mutate: Mutation;
  busy: boolean;
}) {
  const [baseRevision, setBaseRevision] = useState(candidate.revision ?? 0);
  const [role, setRole] = useState(candidate.role),
    [grade, setGrade] = useState(candidate.grade),
    [format, setFormat] = useState(candidate.workFormat),
    [available, setAvailable] = useState(candidate.available !== false),
    [processing, setProcessing] = useState(
      candidate.privacy?.processing ?? false,
    ),
    [publication, setPublication] = useState(
      candidate.privacy?.publication ?? false,
    ),
    [showAchievements, setShowAchievements] = useState(
      candidate.privacy?.showAchievements ?? true,
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const saved = await mutate(
      "profile",
      "PATCH",
      {
        fullName: f.get("fullName"),
        city: f.get("city"),
        role,
        grade,
        workFormat: format,
        salaryMin: Number(f.get("salaryMin")),
        salaryMax: Number(f.get("salaryMax")),
        yearsExperience: Number(f.get("yearsExperience")),
        skills: skillsFrom(String(f.get("skills"))),
        bio: f.get("bio"),
        available,
        contact: f.get("contact"),
        softSkills: skillsFrom(String(f.get("softSkills"))),
        fspId: f.get("fspId"),
        privacy: { processing, publication, showAchievements },
      },
      { "If-Match": String(baseRevision) },
    );
    if (saved) setBaseRevision(baseRevision + 1);
  }
  return (
    <form className="profile-form form-grid" onSubmit={submit}>
      {candidate.revision !== baseRevision && (
        <p className="info-box">
          Сохранённый профиль обновился. Несохранённые поля сохранены в форме;
          перед новой записью обновите страницу и проверьте изменения. Это
          предотвращает перезапись согласий из другой вкладки.
        </p>
      )}
      <div className="section-heading">
        <h2>Профессиональный профиль</h2>
        <span className="source-tag">Указываете вы</span>
      </div>
      <div className="form-row">
        <Field label="Имя и фамилия">
          <input
            name="fullName"
            defaultValue={candidate.fullName}
            required
            minLength={3}
            maxLength={80}
          />
        </Field>
        <Field label="Город">
          <input
            name="city"
            defaultValue={candidate.city}
            required
            minLength={2}
            maxLength={60}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Специализация">
          <Picker
            label="Моя специализация"
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={[...roles]}
          />
        </Field>
        <Field
          label="Заявленный уровень"
          hint="Категория работодателю назначается только после теста."
        >
          <Picker
            label="Мой грейд"
            value={grade}
            onChange={setGrade}
            options={grades}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Формат работы">
          <Picker
            label="Мой формат работы"
            value={format}
            onChange={setFormat}
            options={formats}
          />
        </Field>
        <Field label="Опыт, лет">
          <input
            name="yearsExperience"
            type="number"
            required
            min={0}
            max={50}
            step={0.5}
            defaultValue={candidate.yearsExperience}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Ожидания от, ₽ / мес.">
          <input
            name="salaryMin"
            type="number"
            required
            min={10000}
            max={2000000}
            step={1000}
            defaultValue={candidate.salaryMin}
          />
        </Field>
        <Field label="Ожидания до, ₽ / мес.">
          <input
            name="salaryMax"
            type="number"
            required
            min={10000}
            max={2000000}
            step={1000}
            defaultValue={candidate.salaryMax}
          />
        </Field>
      </div>
      <Field label="Навыки через запятую">
        <input
          name="skills"
          defaultValue={candidate.skills.join(", ")}
          required
          maxLength={1000}
        />
      </Field>
      <Field label="О себе и своём опыте">
        <textarea
          name="bio"
          defaultValue={candidate.bio}
          rows={5}
          required
          minLength={20}
          maxLength={3000}
        />
      </Field>
      <Field
        label="Контакт для приглашений"
        hint="Будет раскрыт только после вашего принятия приглашения. Не указывайте контакты в открытом описании."
      >
        <input
          name="contact"
          required
          minLength={5}
          maxLength={150}
          defaultValue={candidate.contact ?? ""}
        />
      </Field>
      <Field label="Софт-скиллы через запятую">
        <input
          name="softSkills"
          maxLength={500}
          defaultValue={candidate.softSkills?.join(", ") ?? ""}
        />
      </Field>
      <Field
        label="ID участника ФСП"
        hint={mode==="demo"?"Демосвязь, без проверки владения. Для исходных профилей используйте DEMO-demo-candidate-001 и аналогичные ID.":"ID хранится как заявление. Импорт недоступен до проверки принадлежности через провайдера ФСП."}
      >
        <input
          name="fspId"
          maxLength={80}
          defaultValue={candidate.fspId ?? ""}
        />
      </Field>
      <div className="privacy-block">
        <h3>Видимость и согласия</h3>
        <label className="check-row">
          <Checkbox
            checked={processing}
            onCheckedChange={(v) => setProcessing(v === true)}
          />
          <span>Разрешаю обработку данных профиля</span>
        </label>
        <label className="check-row">
          <Checkbox
            checked={publication}
            onCheckedChange={(v) => setPublication(v === true)}
          />
          <span>Разрешаю публикацию профиля в каталоге после теста</span>
        </label>
        <label className="check-row">
          <Checkbox
            checked={showAchievements}
            onCheckedChange={(v) => setShowAchievements(v === true)}
          />
          <span>Показывать работодателю достижения ФСП</span>
        </label>
        <small>
          При отзыве согласия профиль исчезает из каталога. Данные в
          демопространстве сохраняются для повторного включения; это не запрос
          на удаление.
        </small>
      </div>
      <div className="availability">
        <div>
          <strong>Открыт к предложениям</strong>
          <p>Показывать профиль в поиске работодателей</p>
        </div>
        <Switch
          aria-label="Открыт к предложениям"
          checked={available}
          onCheckedChange={setAvailable}
        />
      </div>
      <button
        className="button primary"
        disabled={busy || candidate.revision !== baseRevision}
      >
        {busy ? "Сохраняем…" : "Сохранить профиль"}
      </button>
    </form>
  );
}
