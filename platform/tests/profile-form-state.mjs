/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

// Executes the real ProfileForm and its real submit closure. This is a hook unit
// test, not a browser/DOM test: it does not model DOM input retention, native form
// validation, React scheduling/StrictMode, Radix behavior, or HTTP authorization.
// FormData and React/JSX stubs live in a private VM; the importing harness's
// globals are never modified. esbuild uses the project's installed dependency
// and write:false, so importing/running this module writes no project files.
const LIMITATION = "Hook unit only; no browser DOM, React scheduler, native validation, or network.";

function createHookRuntime() {
  let rendering = null;
  return {
    useState(initial) {
      assert.ok(rendering, "useState must be called during render");
      const frame = rendering;
      const index = frame.cursor++;
      if (!(index in frame.slots)) {
        frame.slots[index] = typeof initial === "function" ? initial() : initial;
      }
      const set = (value) => {
        frame.slots[index] = typeof value === "function"
          ? value(frame.slots[index])
          : value;
      };
      return [frame.slots[index], set];
    },
    mount(component) {
      const frame = { slots: [], cursor: 0, hookCount: undefined };
      return (props) => {
        assert.equal(rendering, null, "Nested renders are outside this harness");
        frame.cursor = 0;
        rendering = frame;
        try {
          const tree = component(props);
          if (frame.hookCount !== undefined) {
            assert.equal(frame.cursor, frame.hookCount, "Hook order changed");
          }
          frame.hookCount = frame.cursor;
          return tree;
        } finally {
          rendering = null;
        }
      };
    },
  };
}

class FakeFormData {
  constructor(form) {
    assert.ok(form?.fields instanceof Map, "Submit requires a synthetic form fixture");
    this.fields = form.fields;
  }
  get(name) {
    return this.fields.has(name) ? this.fields.get(name) : null;
  }
}

function tagModule(names) {
  return names.map((name) => `export const ${name} = ${JSON.stringify("stub:" + name)};`).join("\n");
}

async function loadProfileForm(project, hooks) {
  const root = path.resolve(project);
  const requireFromProject = createRequire(path.join(root, "package.json"));
  const { build } = requireFromProject("esbuild");
  const stubs = new Map([
    ["react", "export const useState = (...args) => globalThis.__profileHooks.useState(...args);"],
    ["react/jsx-runtime", "export const Fragment='stub:Fragment'; export function jsx(type,props,key){return {type,props:props??{},key};} export const jsxs=jsx;"],
    ["react/jsx-dev-runtime", "export const Fragment='stub:Fragment'; export function jsxDEV(type,props,key){return {type,props:props??{},key};}"],
    ["@/components/ui/dialog", tagModule(["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"])],
    ["@/components/ui/checkbox", tagModule(["Checkbox"])],
    ["@/components/ui/switch", tagModule(["Switch"])],
    ["./ui", tagModule(["Field", "Picker"])],
  ]);
  const bundled = await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { ProfileForm } from "./app/forms.tsx";',
      resolveDir: root,
      sourcefile: "profile-form-test-entry.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    target: "node22",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [{
      name: "profile-form-hook-stubs",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^(react(?:\/.*)?|@\/components\/ui\/.*|\.\/ui)$/ }, (args) => {
          if (!stubs.has(args.path)) {
            throw new Error(`Unsupported UI/hook dependency: ${args.path}`);
          }
          return { path: args.path, namespace: "profile-test-stub" };
        });
        buildApi.onLoad({ filter: /.*/, namespace: "profile-test-stub" }, (args) => ({
          contents: stubs.get(args.path),
          loader: "js",
        }));
      },
    }],
  });
  assert.equal(bundled.outputFiles.length, 1, "Expected one in-memory bundle");
  const cjsModule = { exports: {} };
  const context = vm.createContext({
    module: cjsModule,
    exports: cjsModule.exports,
    __profileHooks: hooks,
    FormData: FakeFormData,
    fetch() { throw new Error("Network is forbidden in this unit test"); },
  });
  new vm.Script(bundled.outputFiles[0].text, {
    filename: "profile-form.in-memory.cjs",
  }).runInContext(context, { timeout: 5000 });
  assert.equal(typeof cjsModule.exports.ProfileForm, "function");
  return cjsModule.exports.ProfileForm;
}

function nodes(tree, predicate, result = []) {
  if (Array.isArray(tree)) {
    for (const child of tree) nodes(child, predicate, result);
  } else if (tree && typeof tree === "object" && "type" in tree) {
    if (predicate(tree)) result.push(tree);
    nodes(tree.props?.children, predicate, result);
  }
  return result;
}

function oneNode(tree, predicate) {
  const found = nodes(tree, predicate);
  assert.equal(found.length, 1, "Expected exactly one matching rendered node");
  return found[0];
}

function fixture(revision) {
  return {
    id: "fixture-candidate",
    fullName: "Тестовый профиль",
    initials: "ТП",
    role: "Frontend",
    grade: "Junior",
    city: "Тестовый город",
    workFormat: "Удалённо",
    salaryMin: 80000,
    salaryMax: 120000,
    yearsExperience: 1,
    skills: ["JavaScript"],
    bio: "Описание исходного синтетического профиля.",
    achievements: [],
    available: true,
    contact: "example@example.test",
    softSkills: [],
    fspId: "",
    privacy: { processing: true, publication: true, showAchievements: true },
    ...(revision === undefined ? {} : { revision }),
  };
}

function draftForm() {
  return { fields: new Map(Object.entries({
    fullName: "Несохранённый черновик",
    city: "Тестовый город",
    salaryMin: "90000",
    salaryMax: "130000",
    yearsExperience: "2",
    skills: "JavaScript, TypeScript, JavaScript",
    bio: "Изменённое описание синтетического профиля.",
    contact: "draft@example.test",
    softSkills: "Командная работа",
    fspId: "DEMO-fixture",
  })) };
}

function mutationQueue(outcomes) {
  const calls = [];
  const pending = [...outcomes];
  return {
    calls,
    async mutate(...args) {
      assert.ok(pending.length, "Unexpected extra submit");
      // Normalize VM-realm objects before strict assertions in this realm.
      calls.push(JSON.parse(JSON.stringify(args)));
      const outcome = pending.shift();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    assertConsumed() {
      assert.equal(pending.length, 0, "Expected submits were not executed");
    },
  };
}

async function submit(tree, form) {
  const renderedForm = oneNode(tree, (node) => node.type === "form");
  assert.equal(typeof renderedForm.props.onSubmit, "function");
  let prevented = false;
  try {
    await renderedForm.props.onSubmit({
      currentTarget: form,
      preventDefault() { prevented = true; },
    });
  } finally {
    assert.equal(prevented, true, "ProfileForm must prevent native form submission");
  }
}

/**
 * @param {string} project Absolute or relative path to the platform checkout.
 * @returns {Promise<{passed:number,checks:string[]}>}
 * Throws AssertionError on regression; never starts a site or calls the API.
 */
export async function runProfileFormChecks(project) {
  assert.equal(typeof project, "string", "A project directory is required");
  const hooks = createHookRuntime();
  const ProfileForm = await loadProfileForm(project, hooks);
  const checks = [];
  const check = (name, assertion) => { assertion(); checks.push(name); };

  // Same component instance: a sync response must not rebase its local draft.
  {
    const render = hooks.mount(ProfileForm);
    const queue = mutationQueue([false, false]);
    const initial = fixture(12);
    const props = (candidate) => ({ candidate, mutate: queue.mutate, busy: false });
    const first = render(props(initial));
    oneNode(first, (node) => node.type === "stub:Picker" && node.props.label === "Моя специализация")
      .props.onChange("Backend");
    const checkboxes = nodes(first, (node) => node.type === "stub:Checkbox");
    assert.equal(checkboxes.length, 3, "Expected three privacy controls");
    checkboxes[1].props.onCheckedChange(false);
    const external = {
      ...initial,
      revision: 13,
      fullName: "Внешнее изменение",
      role: "QA",
      privacy: { processing: false, publication: true, showAchievements: false },
    };
    await submit(render(props(external)), draftForm());
    check("stale submit uses profile PATCH", () => assert.deepEqual(queue.calls[0].slice(0, 2), ["profile", "PATCH"]));
    check("sync rerender retains draft base revision 12 instead of adopting 13", () => assert.equal(queue.calls[0][3]["If-Match"], "12"));
    check("local role edit survives external candidate rerender", () => assert.equal(queue.calls[0][2].role, "Backend"));
    check("local consent draft is not silently replaced by external props", () => assert.deepEqual(queue.calls[0][2].privacy, {
      processing: true, publication: false, showAchievements: true,
    }));
    check("real submit handler serializes the supplied draft fields", () => {
      assert.equal(queue.calls[0][2].fullName, "Несохранённый черновик");
      assert.equal(queue.calls[0][2].salaryMin, 90000);
      assert.deepEqual(queue.calls[0][2].skills, ["JavaScript", "TypeScript"]);
    });
    await submit(render(props({ ...external, revision: 14 })), draftForm());
    check("failed save and another external rerender leave If-Match at 12", () => assert.equal(queue.calls[1][3]["If-Match"], "12"));
    queue.assertConsumed();
  }

  // Successful local saves advance the baseline exactly once; failed saves do not.
  {
    const render = hooks.mount(ProfileForm);
    const queue = mutationQueue([true, true, false, false]);
    const initial = fixture(20);
    const props = (candidate) => ({ candidate, mutate: queue.mutate, busy: false });
    await submit(render(props(initial)), draftForm());
    check("first local save uses the mounted revision", () => assert.equal(queue.calls[0][3]["If-Match"], "20"));
    // Intentionally retain old props: successful mutation itself advances the base.
    await submit(render(props(initial)), draftForm());
    check("successful local save advances base to 21 even before props refresh", () => assert.equal(queue.calls[1][3]["If-Match"], "21"));
    await submit(render(props({ ...initial, revision: 22 })), draftForm());
    check("two successful local saves advance the baseline to 22", () => assert.equal(queue.calls[2][3]["If-Match"], "22"));
    await submit(render(props({ ...initial, revision: 25 })), draftForm());
    check("failed local save does not increment or adopt external revision 25", () => assert.equal(queue.calls[3][3]["If-Match"], "22"));
    queue.assertConsumed();
  }

  // Optional legacy revision is initialized to zero, not serialized as undefined.
  {
    const render = hooks.mount(ProfileForm);
    const queue = mutationQueue([true, false]);
    const initial = fixture(undefined);
    const props = { candidate: initial, mutate: queue.mutate, busy: false };
    await submit(render(props), draftForm());
    check("missing candidate revision initializes If-Match to zero", () => assert.equal(queue.calls[0][3]["If-Match"], "0"));
    await submit(render(props), draftForm());
    check("successful save from legacy revision zero advances base to one", () => assert.equal(queue.calls[1][3]["If-Match"], "1"));
    queue.assertConsumed();
  }

  // A rejected mutation must not advance state either (the app normally returns false).
  {
    const render = hooks.mount(ProfileForm);
    const queue = mutationQueue([new Error("synthetic failure"), false]);
    const initial = fixture(30);
    const props = (candidate) => ({ candidate, mutate: queue.mutate, busy: false });
    await assert.rejects(submit(render(props(initial)), draftForm()), /synthetic failure/);
    await submit(render(props({ ...initial, revision: 31 })), draftForm());
    check("rejected mutation leaves the original baseline unchanged", () => assert.equal(queue.calls[1][3]["If-Match"], "30"));
    queue.assertConsumed();
  }

  return { passed: checks.length, checks };
}

const invokedAsCli = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsCli) {
  const defaultProject = fileURLToPath(new URL("../../platform/", import.meta.url));
  try {
    const result = await runProfileFormChecks(process.argv[2] ?? defaultProject);
    console.log(JSON.stringify({ ...result, limitation: LIMITATION }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
