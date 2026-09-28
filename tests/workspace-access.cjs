// Run with node --test tests/workspace-access.cjs; no live Supabase calls.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads transpiled server code with a mocked Supabase module. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function loadSession(user, profile) {
  const compiled = ts.transpileModule(fs.readFileSync('lib/supabase/middleware.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exported = {};
  const mockRequire = name => name === '@supabase/ssr' ? {
    createServerClient: (_url, _key, options) => ({
      auth: {
        getUser: async () => ({ data: { user } }),
        signOut: async () => options.cookies.setAll([{ name: 'session', value: '', options: { maxAge: 0 } }]),
      },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
    }),
  } : require(name);
  new Function('require', 'exports', compiled)(mockRequire, exported);
  return path => exported.updateSession(new NextRequest(`https://quiz.test${path}`));
}

test('exam sessions cannot enter the workspace, but retain exam and login access', async () => {
  const request = loadSession({ id: 'student', is_anonymous: true }, { is_admin: true });
  for (const path of ['/', '/quizzes/1', '/admin/users']) {
    const response = await request(path);
    assert.equal(response.headers.get('location'), 'https://quiz.test/login?student=1');
  }
  assert.equal((await request('/api/admin/users')).status, 403);
  assert.equal((await request('/login')).status, 200);
  assert.equal((await request('/exam/example')).status, 200);
});

test('teacher routing and disabled-account sign-out still work', async () => {
  const teacher = { id: 'teacher', is_anonymous: false };
  const request = loadSession(teacher, { is_admin: false, is_anonymous: false });
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/login')).headers.get('location'), 'https://quiz.test/');
  assert.equal((await request('/admin/users')).headers.get('location'), 'https://quiz.test/');
  const disabled = await loadSession(teacher, { disabled_at: '2026-01-01' })('/');
  assert.equal(disabled.headers.get('location'), 'https://quiz.test/login?disabled=1');
  assert.match(disabled.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await loadSession(null, null)('/')).headers.get('location'), 'https://quiz.test/login');
  assert.equal((await loadSession(teacher, null)('/login')).status, 200);
});
