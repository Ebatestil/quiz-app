/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { NextRequest } = require("next/server");
function load(file, overrides = {}) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", code)(
    (name) => overrides[name] ?? require(name),
    result,
  );
  return result;
}
const shared = load("lib/demo/shared.ts");
const model = load("lib/demo/model.ts");
const question = {
  id: 1,
  type: "identification",
  prompt: "Name our planet",
  answer: "Earth",
  options: [],
};
test("quiz validation and public serialization protect the answer key", () => {
  const quiz = shared.validateQuiz({
    title: "  Geography  ",
    questions: [question],
  });
  assert.equal(quiz.title, "Geography");
  const publicData = shared.publicQuiz({ ...quiz, id: "id" });
  assert.equal("answer" in publicData.questions[0], false);
  assert.throws(() =>
    shared.validateQuiz({ title: " ", questions: [question] }),
  );
  assert.throws(() => shared.validateQuiz({ title: "a", questions: [] }));
  assert.throws(() =>
    shared.validateQuiz({ title: "a", questions: Array(31).fill(question) }),
  );
  assert.throws(() =>
    shared.validateQuiz({
      title: "a",
      questions: [
        {
          ...question,
          type: "multiple_choice",
          options: ["A", "A"],
          answer: "A",
        },
      ],
    }),
  );
  assert.throws(() =>
    shared.validateQuiz({
      title: "a",
      questions: [{ ...question, type: "__proto__" }],
    }),
  );
  assert.equal(model.isCorrect(question, " EARTH "), true);
  assert.equal(
    model.isCorrect(
      { ...question, type: "enumeration", answer: "Red\nBlue" },
      "blue\nRED",
    ),
    true,
  );
  assert.equal(
    model.isCorrect(
      { ...question, type: "enumeration", answer: "Red\nBlue" },
      "red\nred",
    ),
    false,
  );
});
test("demo routing is the default; old APIs and workspace are unavailable", async () => {
  const { proxy } = load("proxy.ts");
  for (const path of [
    "/demo",
    "/q/123",
    "/api/demo/workspace",
    "/api/demo/cleanup",
  ])
    assert.equal(
      (await proxy(new NextRequest("https://demo.test" + path))).status,
      200,
    );
  for (const path of ["/", "/login", "/classes", "/admin/users", "/exam/old"])
    assert.equal(
      (await proxy(new NextRequest("https://demo.test" + path))).headers.get(
        "location",
      ),
      "https://demo.test/demo",
    );
  assert.equal(
    (await proxy(new NextRequest("https://demo.test/api/admin/users"))).status,
    404,
  );
});
test("public submissions are server graded, reject invalid origin, and cannot read owner workspace", async () => {
  const quiz = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Geography",
    questions: [question],
  };
  let inserted;
  let owner = null;
  const db = {
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        gt() {
          return query;
        },
        maybeSingle: async () => ({ data: quiz, error: null }),
        insert(value) {
          inserted = value;
          return query;
        },
        single: async () => ({
          data:
            table === "demo_results"
              ? { score: inserted.score, total: inserted.total }
              : null,
          error: null,
        }),
      };
      return query;
    },
  };
  const api = load("app/api/demo/[...path]/route.ts", {
    "@/lib/demo/backend": {
      demoDb: () => db,
      guest: async () => owner,
      purgeExpired: async () => {},
      sameOrigin: (r) => r.headers.get("origin") === "https://demo.test",
      readBody: (r) => r.json(),
      failure: () => Response.json({}, { status: 500 }),
    },
    "@/lib/demo/shared": shared,
    "@/lib/demo/model": model,
  });
  const ctx = (path) => ({
    params: Promise.resolve({ path: path.split("/") }),
  });
  const publicResponse = await api.GET(
    new Request("https://demo.test"),
    ctx(`quiz/${quiz.id}`),
  );
  assert.equal("answer" in (await publicResponse.json()).questions[0], false);
  assert.equal(
    (await api.GET(new Request("https://demo.test"), ctx("workspace"))).status,
    401,
  );
  const submit = (origin, answers) =>
    api.POST(
      new Request("https://demo.test", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          name: "Tester",
          answers,
          score: 999,
          submissionId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      ctx(`quiz/${quiz.id}/submit`),
    );
  assert.equal((await submit("https://evil.test", ["Earth"])).status, 403);
  assert.equal((await submit("https://demo.test", [])).status, 422);
  assert.deepEqual(
    await (await submit("https://demo.test", ["Earth"])).json(),
    { score: 1, total: 1 },
  );
  assert.equal(inserted.score, 1);
  assert.deepEqual(await (await submit("https://demo.test", ["Mars"])).json(), {
    score: 0,
    total: 1,
  });
  assert.equal(
    (
      await api.POST(
        new Request("https://demo.test", {
          method: "POST",
          headers: { origin: "https://demo.test" },
          body: "{}",
        }),
        ctx("quizzes"),
      )
    ).status,
    401,
  );
});
