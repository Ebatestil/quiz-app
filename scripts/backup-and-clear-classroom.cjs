/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit, manual maintenance only. Never invoked by builds or deployment.
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
loadEnvConfig(process.cwd());
const tables = ['profiles', 'quizzes', 'questions', 'attempts', 'attempt_questions', 'attempt_answers', 'attempt_violations', 'classes', 'class_students', 'quiz_classes'];
async function main() {
  const destination = process.argv[2];
  if (!destination || !path.isAbsolute(destination)) throw new Error('Supply an absolute backup file path.');
  if (fs.existsSync(destination)) throw new Error('Backup already exists; refusing to overwrite it.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Legacy Supabase environment variables are required.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const backup = { exportedAt: new Date().toISOString(), project: new URL(url).hostname, tables: {} };
  for (const table of tables) {
    const rows = [];
    for (let offset = 0;; offset += 500) {
      let query = db.from(table).select('*').order(table === 'quiz_classes' ? 'quiz_id' : 'id');
      if (table === 'quiz_classes') query = query.order('class_id');
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw new Error(`Export failed for ${table}: ${error.code}`);
      rows.push(...data);
      if (data.length < 500) break;
    }
    backup.tables[table] = rows;
  }
  const serialized = JSON.stringify(backup, null, 2);
  fs.writeFileSync(destination, serialized, { flag: 'wx', mode: 0o600 });
  const hash = data => crypto.createHash('sha256').update(data).digest('hex');
  if (hash(fs.readFileSync(destination)) !== hash(serialized)) throw new Error('Backup verification failed; no records deleted.');
  console.log('Verified database record backup:', destination);
  for (const table of tables) console.log(`${table}: ${backup.tables[table].length} records`);
  if (!process.argv.includes('--clear')) return;
  // Delete only the exact rows exported above. Accounts remain available for restoration.
  // Stop classroom writes while running; concurrent new records are never intentionally cleared.
  for (const table of ['attempt_violations', 'attempt_answers', 'attempt_questions', 'attempts', 'quiz_classes', 'questions', 'quizzes', 'class_students', 'classes']) {
    const column = table === 'quiz_classes' ? 'quiz_id' : 'id';
    const ids = [...new Set(backup.tables[table].map(row => row[column]))];
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await db.from(table).delete().in(column, ids.slice(i, i + 100));
      if (error) throw new Error(`Clear failed for ${table}: ${error.code}; restore from verified backup if needed.`);
    }
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    if (error || count !== 0) throw new Error(`Table ${table} is not empty; stop concurrent writes and inspect. Backup is preserved.`);
    console.log(`Cleared ${table}`);
  }
  console.log('Classroom data cleared. Teacher accounts and profiles preserved.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
