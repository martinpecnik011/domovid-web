// RLS test on pglite. Usage: PGLITE_DIR=<dir containing node_modules/@electric-sql/pglite> node supabase/tests/rls.test.mjs
// Not part of the app build; pglite is installed outside the repo.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(process.env.PGLITE_DIR || process.cwd(), 'x.js'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const STAFF = '00000000-0000-0000-0000-0000000000a0';

// Gate 1: stubs + migrations + seed
await db.exec(readFileSync(join(root, 'tests/_stubs.sql'), 'utf8'));
for (const f of readdirSync(join(root, 'migrations')).sort()) {
  await db.exec(readFileSync(join(root, 'migrations', f), 'utf8'));
  console.log('applied', f);
}
await db.exec(readFileSync(join(root, 'seed.sql'), 'utf8'));
console.log('applied seed.sql');

const q1 = async (sql) => (await db.query(sql)).rows[0];
const total = {
  messages: +(await q1('select count(*) c from public.messages')).c,
  conversations: +(await q1('select count(*) c from public.conversations')).c,
  profiles: +(await q1('select count(*) c from public.profiles')).c,
};
console.log('superuser totals', total);

// run SQL as an authenticated user; returns {rows} or {error}
async function as(uid, sql, aal = 'aal2') {
  const claims = JSON.stringify({ sub: uid, aal });
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false); select set_config('request.jwt.claims','${claims}',false);`);
  try { return { rows: (await db.query(sql)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); }
}

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} -> ${detail}`); };
const bConv = (await q1(`select id from public.conversations where customer_id='${B}'`)).id;
const aConv = (await q1(`select id from public.conversations where customer_id='${A}'`)).id;

// (1) signup trigger
const before = await q1('select (select count(*) from public.profiles) p, (select count(*) from public.conversations) c');
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1','c@domovid.test','{"name":"Customer C"}')`);
const after = await q1('select (select count(*) from public.profiles) p, (select count(*) from public.conversations) c');
const prof = await q1(`select role, full_name from public.profiles where id='00000000-0000-0000-0000-0000000000c1'`);
check('1 signup trigger', +after.p === +before.p + 1 && +after.c === +before.c + 1 && prof.role === 'customer' && prof.full_name === 'Customer C',
  `profiles ${before.p}->${after.p}, conversations ${before.c}->${after.c}, new profile ${JSON.stringify(prof)}`);
total.profiles++; total.conversations++;

// (2) A cannot read B
let r = await as(A, `select count(*) c from public.messages where conversation_id='${bConv}'`);
let r2 = await as(A, `select count(*) c from public.conversations where id='${bConv}'`);
check('2 A selects B messages/conversations', +r.rows[0].c === 0 && +r2.rows[0].c === 0, `messages=${r.rows[0].c} conversations=${r2.rows[0].c}`);
r = await as(A, `select count(*) c from public.messages`);
check('2b A sees own messages only', +r.rows[0].c === 2, `messages=${r.rows[0].c}`);

// (3) A inserts into B conversation
r = await as(A, `insert into public.messages (conversation_id, sender_id, body) values ('${bConv}','${A}','hack')`);
check('3 A inserts into B conversation', !!r.error, r.error || 'NO ERROR');
r = await as(A, `insert into public.messages (conversation_id, sender_id, body) values ('${aConv}','${A}','ok') returning id`);
check('3b A inserts into own conversation', !r.error && r.rows.length === 1, r.error || 'inserted');
const lm = await q1(`select last_message_at is not null ok from public.conversations where id='${aConv}'`);
check('3c last_message_at trigger', lm.ok, `last_message_at set=${lm.ok}`);

// (4) role escalation
r = await as(A, `update public.profiles set role='staff' where id='${A}'`);
check('4 A sets own role=staff', !!r.error, r.error || 'NO ERROR');
r = await as(A, `update public.profiles set full_name='A2' where id='${A}' returning id`);
check('4b A updates own full_name', !r.error && r.rows.length === 1, r.error || 'ok');

// (5) staff sees all
const s = {};
for (const t of ['messages', 'conversations', 'profiles']) {
  s[t] = +(await as(STAFF, `select count(*) c from public.${t}`)).rows[0].c;
}
const expMsgs = +(await q1('select count(*) c from public.messages')).c;
check('5 staff sees all', s.messages === expMsgs && s.conversations === total.conversations && s.profiles === total.profiles,
  `messages=${s.messages}/${expMsgs} conversations=${s.conversations}/${total.conversations} profiles=${s.profiles}/${total.profiles}`);

// (6) export view
r = await as(A, 'select count(*) c from public.export_messages');
r2 = await as(STAFF, 'select count(*) c from public.export_messages');
check('6 export_messages', +r.rows[0].c === 0 && +r2.rows[0].c === expMsgs, `customer=${r.rows[0].c} staff=${r2.rows[0].c}/${expMsgs}`);

// (7) storage
r = await as(A, `insert into storage.objects (bucket_id,name) values ('chat','${bConv}/x/y.jpg')`);
check('7 A uploads to B folder', !!r.error, r.error || 'NO ERROR');
r = await as(A, `insert into storage.objects (bucket_id,name) values ('chat','${aConv}/x/y.jpg') returning id`);
check('7b A uploads to own folder', !r.error && r.rows.length === 1, r.error || 'ok');
r = await as(B, `select count(*) c from storage.objects`);
check('7c B cannot see A object', +r.rows[0].c === 0, `objects=${r.rows[0].c}`);

// (8) customer delete
const msgBefore = +(await q1('select count(*) c from public.messages')).c;
r = await as(A, `delete from public.messages where conversation_id='${aConv}' returning id`);
const msgAfter = +(await q1('select count(*) c from public.messages')).c;
check('8 A deletes own message', (r.error || r.rows.length === 0) && msgBefore === msgAfter, `${r.error || 'deleted rows=' + r.rows.length}; total ${msgBefore}->${msgAfter}`);

// extra: customer may only update read_by_customer_at
r = await as(A, `update public.messages set body='x' where conversation_id='${aConv}'`);
check('9 A edits message body', !!r.error, r.error || 'NO ERROR');
r = await as(A, `update public.messages set read_by_customer_at=now() where conversation_id='${aConv}' returning id`);
check('9b A marks read', !r.error && r.rows.length > 0, r.error || `rows=${r.rows.length}`);

// (10) attachments
const msgOf = async (c, who) => (await q1(`select id from public.messages where conversation_id='${c}' and sender_id='${who}' limit 1`)).id;
const aMsg = await msgOf(aConv, A), bMsg = await msgOf(bConv, B);
const ins = (m, c) => `insert into public.attachments (message_id, conversation_id, storage_path) values ('${m}','${c}','p') returning id`;
r = await as(A, ins(bMsg, aConv));
check('10 A attaches to B message (A conv)', !!r.error, r.error || 'NO ERROR');
r = await as(A, ins(bMsg, bConv));
check('10b A attaches to B message (B conv)', !!r.error, r.error || 'NO ERROR');
r = await as(A, ins(aMsg, aConv));
check('10c A attaches to own message', !r.error && r.rows.length === 1, r.error || 'ok');
r = await as(STAFF, ins(bMsg, bConv));
check('10d staff attaches to B message', !r.error && r.rows.length === 1, r.error || 'ok');
r = await as(STAFF, ins(bMsg, aConv));
check('10e staff attach with mismatched conversation', !!r.error, r.error || 'NO ERROR');

// (11) profile email
r = await as(A, `update public.profiles set email='x@evil.test' where id='${A}'`);
check('11 A changes own email', !!r.error, r.error || 'NO ERROR');
r = await as(A, `update public.profiles set phone='1', company='Co' where id='${A}' returning id`);
check('11b A updates phone/company', !r.error && r.rows.length === 1, r.error || 'ok');

// (12) subscriptions / content_items / plans
const cA = await q1(`select count(*) c from public.content_items where customer_id='${A}'`);
const sc = await q1(`select count(*) c from public.subscriptions where customer_id='00000000-0000-0000-0000-0000000000c1' and plan='none'`);
check('12 signup creates subscription', +sc.c === 1, `subscriptions for new user (plan none)=${sc.c}`);
r = await as(A, 'select count(*) c from public.subscriptions');
r2 = await as(A, `select count(*) c from public.content_items`);
check('12b A reads own subscription/content', +r.rows[0].c === 1 && +r2.rows[0].c === +cA.c && +cA.c > 0, `subscriptions=${r.rows[0].c} content_items=${r2.rows[0].c}/${cA.c}`);
r = await as(B, `select (select count(*) from public.subscriptions where customer_id='${A}') s, (select count(*) from public.content_items where customer_id='${A}') c`);
check('12c B sees none of A', +r.rows[0].s === 0 && +r.rows[0].c === 0, `subscriptions=${r.rows[0].s} content_items=${r.rows[0].c}`);
r = await as(A, `insert into public.subscriptions (customer_id) values ('${A}')`);
check('12d A inserts subscription', !!r.error, r.error || 'NO ERROR');
r = await as(A, `insert into public.content_items (customer_id, title) values ('${A}','x')`);
check('12e A inserts content_item', !!r.error, r.error || 'NO ERROR');
r = await as(A, `update public.subscriptions set videos_used = 99 where customer_id='${A}' returning id`);
const vu = (await q1(`select videos_used v from public.subscriptions where customer_id='${A}'`)).v;
check('12f A updates own subscription (0 rows, unchanged)', (r.error || r.rows.length === 0) && vu === 0, `${r.error || 'updated rows=' + r.rows.length}; videos_used=${vu}`);
r = await as(STAFF, `insert into public.content_items (customer_id, title) values ('${A}','staff item') returning id`);
check('12g staff aal2 inserts content_item', !r.error && r.rows.length === 1, r.error || 'ok');
r = await as(STAFF, `update public.subscriptions set videos_used = 2 where customer_id='${A}' returning updated_by`);
check('12h staff aal2 updates subscription, updated_by=staff', !r.error && r.rows.length === 1 && r.rows[0].updated_by === STAFF, r.error || JSON.stringify(r.rows));

// (13) staff at aal1 has no staff powers
r = await as(STAFF, `select (select count(*) from public.messages) m, (select count(*) from public.subscriptions where customer_id <> '${STAFF}') s, (select count(*) from public.content_items) c, (select count(*) from public.conversations where customer_id <> '${STAFF}') cv, (select count(*) from public.export_messages) e`, 'aal1');
const x = r.rows[0];
check('13 staff aal1 sees nothing of customers', +x.m === 0 && +x.s === 0 && +x.c === 0 && +x.cv === 0 && +x.e === 0, JSON.stringify(x));
r = await as(STAFF, `insert into public.content_items (customer_id, title) values ('${A}','nope')`, 'aal1');
check('13b staff aal1 inserts content_item', !!r.error, r.error || 'NO ERROR');
r = await as(STAFF, `select public.is_staff_role() r, public.is_staff() s`, 'aal1');
check('13c is_staff_role true, is_staff false at aal1', r.rows[0].r === true && r.rows[0].s === false, JSON.stringify(r.rows[0]));

// (14) plans
r = await as(A, 'select count(*) c from public.plans');
check('14 A reads plans', +r.rows[0].c === 7, `plans=${r.rows[0].c}`);
r = await as(A, `insert into public.plans (code) values ('99')`);
check('14b A inserts plan', !!r.error, r.error || 'NO ERROR');

// (15) catalogue
r = await as(A, `select (select count(*) from public.plans) p, (select count(*) from public.addons) a`);
check('15 A reads 7 plans and 4 addons', +r.rows[0].p === 7 && +r.rows[0].a === 4, JSON.stringify(r.rows[0]));
r = await as(STAFF, `insert into public.subscriptions (customer_id, category, plan) values ('${A}','video_viz','viz_4') returning id`);
check('15b staff inserts video_viz sub', !r.error && r.rows.length === 1, r.error || 'ok');
r = await as(STAFF, `insert into public.subscriptions (customer_id) values ('${A}')`);
check('15c second social row', !!r.error, r.error || 'NO ERROR');
r = await as(STAFF, `update public.subscriptions set plan='15' where customer_id='${A}' and category='video_viz'`);
check('15d plan 15 on video category', !!r.error && /invalid plan for category/.test(r.error), r.error || 'NO ERROR');
const soc = `update public.subscriptions set addons=`;
r = await as(STAFF, `${soc}'{digital_twin}' where customer_id='${A}' and category='social' returning id`);
check('15e addons digital_twin', !r.error && r.rows.length === 1, r.error || 'ok');
r = await as(STAFF, `${soc}'{express}' where customer_id='${A}' and category='social'`);
check('15f addons express', !!r.error && /invalid addon/.test(r.error), r.error || 'NO ERROR');
r = await as(STAFF, `${soc}'{foo}' where customer_id='${A}' and category='social'`);
check('15g addons foo', !!r.error && /invalid addon/.test(r.error), r.error || 'NO ERROR');
r = await as(STAFF, `${soc}'{voice_clone}' where customer_id='${A}' and category='video_viz'`);
check('15h addons on video_viz', !!r.error && /invalid addon/.test(r.error), r.error || 'NO ERROR');
r = await as(A, `${soc}'{}' where customer_id='${A}' and category='social' returning id`);
const ad = (await q1(`select addons::text a from public.subscriptions where customer_id='${A}' and category='social'`)).a;
check('15i A updates own addons (0 rows, unchanged)', (r.error || r.rows.length === 0) && ad === '{digital_twin}', `${r.error || 'rows=' + r.rows.length}; addons=${ad}`);
r = await as(A, `insert into public.addons (code) values ('x')`);
check('15j A inserts addon', !!r.error && /permission denied/.test(r.error), r.error || 'NO ERROR');

if (process.env.FORCE_FAIL) check('FORCE_FAIL deliberate failure', false, 'FORCE_FAIL=1');

console.log(failed ? `\n${failed} assertion(s) FAILED` : '\nALL ASSERTIONS PASSED');
process.exit(failed ? 1 : 0);
