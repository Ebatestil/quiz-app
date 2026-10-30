/* eslint-disable @typescript-eslint/no-require-imports -- Node harness for the real TypeScript modules. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function load(file, mockRequire = require) {
  const exported = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'exports', code)(mockRequire, exported);
  return exported;
}

test('demo routes never initialize Supabase and block real workspace APIs', async () => {
  const previous = process.env.DEMO_ONLY;
  process.env.DEMO_ONLY = 'true';
  try {
    const { updateSession } = load('lib/supabase/middleware.ts', name => name === '@supabase/ssr'
      ? { createServerClient: () => { throw new Error('Demo tried to connect to Supabase'); } } : require(name));
    const demo = await updateSession(new NextRequest('https://demo.example/demo'));
    assert.equal(demo.status, 200);
    assert.equal(demo.headers.get('cache-control'), 'no-store');
    assert.match(demo.headers.get('content-security-policy'), /connect-src 'self'/);
    for (const path of ['/', '/login', '/classes', '/admin/users', '/exam/real-token', '/quizzes/1/results']) {
      assert.equal((await updateSession(new NextRequest('https://demo.example'+path))).headers.get('location'), 'https://demo.example/demo');
    }
    for (const method of ['GET','POST','DELETE']) {
      assert.equal((await updateSession(new NextRequest('https://demo.example/api/admin/users', { method }))).status,404);
    }
    const server = load('lib/supabase/server.ts', name => {
      if (name === '@supabase/ssr') return { createServerClient: () => assert.fail('Backend client initialized') };
      if (name === '@supabase/supabase-js') return { createClient: () => assert.fail('Admin client initialized') };
      if (name === 'next/headers') return { cookies: () => assert.fail('Real auth cookies accessed') };
      return require(name);
    });
    await assert.rejects(server.createClient(), /Database access is disabled/);
    assert.throws(() => server.createAdminClient(), /Admin access is disabled/);
  } finally {
    if (previous === undefined) delete process.env.DEMO_ONLY; else process.env.DEMO_ONLY = previous;
  }
});

test('fresh demo workspaces do not share mutations and grading supports four types', () => {
  const { seedDemo, isCorrect, normalizeName } = load('lib/demo/model.ts');
  const first = seedDemo(); const second = seedDemo();
  first.classes[0].students[0].first = 'Changed';
  first.quizzes[0].questions[0].answer = 'Changed';
  assert.equal(second.classes[0].students[0].first, 'Alex');
  assert.equal(second.quizzes[0].questions[0].answer, 'Mars');
  assert.equal(normalizeName(' ALEX   REYES '), 'alex reyes');
  const questions = second.quizzes[0].questions;
  ['Mars', 'True', ' GRAVITY ', 'gas\n solid\nLiquid'].forEach((answer,i) => assert.equal(isCorrect(questions[i],answer),true));
  assert.equal(isCorrect(questions[3], 'Solid\nGas'),false);
  assert.equal(isCorrect(questions[3], 'Solid\nGas\nGas'),false);
  assert.equal(isCorrect(questions[2], ''),false);
});
