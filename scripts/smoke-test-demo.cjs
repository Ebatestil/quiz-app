/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit integration test. Creates two temporary guests and deletes them afterward.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const origin = process.argv[2];
if (!origin) throw new Error('Supply the local demo origin.');
const sessions = [];
async function request(path, method = 'GET', body, cookie = '') {
  const response = await fetch(`${origin}/api/demo/${path}`, {
    method, headers: { origin, 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function main() {
  let quizId;
  try {
    for (let i = 0; i < 2; i++) {
      const registered = await request('register', 'POST', { name: `Demo verification ${randomUUID().slice(0, 8)}` });
      assert.equal(registered.status, 201, JSON.stringify(registered.data));
      assert.ok(registered.cookie);
      sessions.push(registered.cookie);
    }
    const initial = await request('workspace', 'GET', undefined, sessions[0]);
    assert.equal(initial.status, 200);
    assert.equal(initial.data.quizzes.length, 0);
    assert.equal(initial.data.results.length, 0);
    const questions = [
      { id: 1, type: 'multiple_choice', prompt: 'Red planet?', options: ['Mars', 'Venus'], answer: 'Mars' },
      { id: 2, type: 'true_false', prompt: 'Earth is a planet.', options: ['True', 'False'], answer: 'True' },
      { id: 3, type: 'identification', prompt: 'Our planet?', options: [], answer: 'Earth' },
      { id: 4, type: 'enumeration', prompt: 'List red and blue.', options: [], answer: 'Red\nBlue' },
    ];
    const created = await request('quizzes', 'POST', { title: 'Temporary integration check', questions }, sessions[0]);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    quizId = created.data.id;
    const publicQuiz = await request(`quiz/${quizId}`);
    assert.equal(publicQuiz.status, 200);
    assert.equal(publicQuiz.data.questions.length, 4);
    assert.ok(publicQuiz.data.questions.every(q => !('answer' in q)));
    const submission = { name: 'Test participant', answers: ['Mars', 'False', ' EARTH ', 'blue\nRED'], submissionId: randomUUID(), score: 999 };
    const submitted = await request(`quiz/${quizId}/submit`, 'POST', submission);
    assert.equal(submitted.status, 201, JSON.stringify(submitted.data));
    assert.deepEqual(submitted.data, { score: 3, total: 4 });
    const retry = await request(`quiz/${quizId}/submit`, 'POST', submission);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.data, submitted.data);
    const owner = await request('workspace', 'GET', undefined, sessions[0]);
    assert.equal(owner.data.results.length, 1);
    assert.equal(owner.data.results[0].score, 3);
    const other = await request('workspace', 'GET', undefined, sessions[1]);
    assert.equal(other.data.results.length, 0);
    assert.equal(other.data.quizzes.length, 0);
    assert.equal((await request('workspace')).status, 401);
    console.log('PASS: registration, empty workspace, four question types, public link without creator cookie, hidden answer key, server grading, retry deduplication, owner results, and guest isolation.');
  } finally {
    for (const cookie of sessions) {
      const deleted = await request('workspace', 'DELETE', undefined, cookie);
      assert.equal(deleted.status, 200, 'Test guest cleanup failed.');
    }
    if (quizId) assert.equal((await request(`quiz/${quizId}`)).status, 404);
    console.log('PASS: test guests removed and generated link invalidated.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
