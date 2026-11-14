import type { Adapter, Addon, Attachment, ContentItem, Conversation, Message, Plan, PlanCategory, Profile, Role, Session, Subscription } from './types';

// In-memory + localStorage backend so /app is testable without a Supabase project (?mock=1).
// Customer and staff share one store, so a staff "switch" sees what the customer wrote.
const KEY = 'domovid-app-mock';
const STAFF_ID = 'mock-staff';
const INLINE_LIMIT = 2 * 1024 * 1024; // larger files are kept as object URLs (not persisted)

interface DB { aal2: boolean; mfaEnrolled: boolean; subscriptions: Subscription[]; content: ContentItem[]; session: string | null; lastCustomer: string | null; profiles: Profile[]; conversations: Omit<Conversation, 'unread'>[]; messages: Omit<Message, 'attachments'>[]; attachments: Attachment[] }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const OTP = '123456';
const TOTP = '654321';
const MOCK_KEY = ['JBSWY3DP', 'EHPK3PXP'].join(''); // fake display value for the mock enrolment screen
const P = (code: Plan['code'], category: PlanCategory, unit: Plan['unit'], videos: number, price_net: number, per_video: number, label: string, popular = false, commitment_months = 0, note: string | null = null): Plan => ({ code, category, unit, videos, price_net, per_video, label, popular, commitment_months, note });
const PLANS: Plan[] = [
  P('10', 'social', 'month', 10, 290, 29, '10 videí / mesiac – Štart', false, 0),
  P('15', 'social', 'month', 15, 390, 26, '15 videí / mesiac – Rast', true, 0),
  P('30', 'social', 'month', 30, 690, 23, '30 videí / mesiac – Pro', false, 0, 'voiceover v cene, bez AI portrétu'),
  P('video_1', 'video', 'once', 1, 50, 50, 'Jedno video – jednorazovo'),
  P('video_4', 'video', 'month', 4, 140, 35, '4 nehnuteľnosti / mesiac – 35 € za video', true),
  P('viz_1', 'video_viz', 'once', 1, 62, 62, 'Jedna vizualizácia – jednorazovo', false, 0, 'max. 5 vizualizácií na nehnuteľnosť'),
  P('viz_4', 'video_viz', 'month', 4, 200, 50, '4 nehnuteľnosti / mesiac – 50 € za video', true, 0, 'max. 5 vizualizácií na nehnuteľnosť'),
];
const ADDONS: Addon[] = [
  { code: 'voice_clone', label: 'Klon hlasu', price_net: 40, unit: 'month', applies_to: 'social', note: null, sort: 1 },
  { code: 'digital_twin', label: 'Digitálne dvojča', price_net: 110, unit: 'month', applies_to: 'social', note: 'obsahuje klon hlasu', sort: 2 },
  { code: 'both_formats', label: 'Obidva formáty videa', price_net: 10, unit: 'video', applies_to: 'video', note: '9:16 aj 16:9', sort: 3 },
  { code: 'express', label: 'Expresné doručenie', price_net: 15, unit: 'video', applies_to: 'video', note: null, sort: 4 },
];
const emptySub = (customer_id: string, category: PlanCategory = 'social'): Subscription => ({ customer_id, category, plan: 'none', addons: [], videos_included: 0, videos_used: 0, period_start: null, period_end: null, commitment_until: null, payment_status: 'unpaid', price_net: null, note: null });
// Deterministic QR-looking placeholder (mock only): finder squares + pseudo-random modules.
function mockQr(): string {
  let r = '', seed = 7;
  const n = 25;
  const finder = (x: number, y: number) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#14232f"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#14232f"/>`;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    if (!inFinder && seed % 3 === 0) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="#14232f"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/>${r}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
  return 'data:image/svg+xml;utf-8,' + encodeURIComponent(svg);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMock(): Adapter {
  const objectUrls = new Map<string, string>();
  const authCbs = new Set<(s: Session | null) => void>();
  const msgCbs = new Set<{ id: string | null; cb: () => void }>();
  const planCbs = new Set<{ id: string | null; cb: () => void }>();
  let pendingEmail: string | null = null;

  const load = (): DB => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw) as DB; d.subscriptions ??= []; d.subscriptions.forEach((x) => { x.category ??= 'social'; x.addons ??= []; }); d.content ??= []; d.aal2 ??= false; d.mfaEnrolled ??= false; return d; }
    } catch { /* fall through */ }
    return { aal2: false, mfaEnrolled: false, subscriptions: [], content: [], session: null, lastCustomer: null, profiles: [{ id: STAFF_ID, email: 'staff@domovid.sk', full_name: 'Domovid tím', phone: null, company: null, role: 'staff' }], conversations: [], messages: [], attachments: [] };
  };
  const save = (db: DB) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota: keep going in memory next load */ } };
  const me = (db: DB) => db.profiles.find((p) => p.id === db.session) ?? null;
  const requireMe = (db: DB) => { const p = me(db); if (!p) throw new Error('not signed in'); return p; };
  const sessionOf = (db: DB): Session | null => { const p = me(db); return p ? { userId: p.id, email: p.email } : null; };
  const emitAuth = (db: DB) => authCbs.forEach((cb) => cb(sessionOf(db)));
  const emitMsgs = (conversationId: string | null) => msgCbs.forEach((l) => (l.id === null || conversationId === null || l.id === conversationId) && l.cb());
  const emitPlan = (customerId: string | null) => planCbs.forEach((l) => (l.id === null || customerId === null || l.id === customerId) && l.cb());
  window.addEventListener('storage', (e) => { if (e.key === KEY) { emitMsgs(null); emitPlan(null); } });

  function signInCustomer(db: DB, email: string) {
    const id = 'mock-' + email.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!db.profiles.some((p) => p.id === id)) {
      db.profiles.push({ id, email, full_name: null, phone: null, company: null, role: 'customer' });
      const convId = 'conv-' + id;
      const now = new Date().toISOString();
      db.subscriptions.push(emptySub(id)); // signup creates a social row with plan 'none'
      db.conversations.push({ id: convId, customer_id: id, title: email, status: 'open', last_message_at: now });
      db.messages.push({ id: uuid(), conversation_id: convId, sender_id: STAFF_ID, kind: 'text', body: 'Dobrý deň, tu Domovid. Napíšte nám, s čím vám môžeme pomôcť.', link_url: null, video_ref: null, timecode: null, created_at: now, read_by_staff_at: now, read_by_customer_at: null });
    }
    db.session = id;
    db.lastCustomer = email;
  }

  return {
    mock: {
      otpCode: OTP,
      totpCode: TOTP,
      switchTo(role: Role) {
        const db = load();
        if (role === 'staff') { db.session = STAFF_ID; db.aal2 = false; }
        else signInCustomer(db, db.lastCustomer ?? 'zakaznik@example.com');
        save(db);
        emitAuth(db);
      },
    },
    auth: {
      async signInWithOtp(email) { pendingEmail = email; }, // mock: no mail, the code is OTP
      async verifyOtp(email, token) {
        if (token !== OTP || (pendingEmail && pendingEmail !== email)) throw new Error('invalid code');
        const db = load(); signInCustomer(db, email); save(db); emitAuth(db);
      },
      async mfaState() {
        const db = load(); const p = me(db);
        if (!p || p.role !== 'staff' || db.aal2) return { kind: 'none' };
        return db.mfaEnrolled ? { kind: 'verify', factorId: 'mock-factor' } : { kind: 'enroll' };
      },
      async mfaEnroll() { return { factorId: 'mock-factor', qr: mockQr(), manualKey: MOCK_KEY }; },
      async mfaVerify(_factorId, code) {
        if (code !== TOTP) throw new Error('invalid totp');
        const db = load(); db.aal2 = true; db.mfaEnrolled = true; save(db);
      },
      async signInWithOAuth() { const db = load(); signInCustomer(db, 'google.zakaznik@example.com'); save(db); emitAuth(db); },
      async getSession() { return sessionOf(load()); },
      async signOut() { const db = load(); db.session = null; save(db); emitAuth(db); },
      onAuthStateChange(cb) { authCbs.add(cb); return () => { authCbs.delete(cb); }; },
    },
    data: {
      async getProfile() { return me(load()); },
      async updateProfile(patch) {
        const db = load(); Object.assign(requireMe(db), patch); save(db);
      },
      async listConversations() {
        const db = load(); const p = requireMe(db);
        const mine = p.role === 'staff' ? db.conversations : db.conversations.filter((c) => c.customer_id === p.id);
        return mine.map((c) => {
          const cust = db.profiles.find((x) => x.id === c.customer_id);
          return {
            ...c,
            customer: cust && { full_name: cust.full_name, email: cust.email },
            unread: p.role === 'staff' ? db.messages.filter((m) => m.conversation_id === c.id && m.sender_id === c.customer_id && !m.read_by_staff_at).length : 0,
          };
        }).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
      },
      async getMessages(conversationId) {
        const db = load(); requireMe(db);
        return db.messages.filter((m) => m.conversation_id === conversationId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((m) => ({ ...m, attachments: db.attachments.filter((a) => a.message_id === m.id).map((a) => ({ ...a, url: objectUrls.get(a.id) ?? a.url })) }));
      },
      async sendMessage(m) {
        const db = load(); const p = requireMe(db);
        const now = new Date().toISOString();
        db.messages.push({ id: m.id, conversation_id: m.conversationId, sender_id: p.id, kind: m.kind, body: m.body ?? null, link_url: m.link_url ?? null, video_ref: m.video_ref ?? null, timecode: m.timecode ?? null, created_at: now, read_by_staff_at: p.role === 'staff' ? now : null, read_by_customer_at: p.role === 'customer' ? now : null });
        const c = db.conversations.find((x) => x.id === m.conversationId); if (c) c.last_message_at = now;
        save(db); emitMsgs(m.conversationId);
      },
      async markRead(conversationId, role) {
        const db = load(); const p = requireMe(db); const now = new Date().toISOString();
        const col = role === 'staff' ? 'read_by_staff_at' : 'read_by_customer_at';
        db.messages.forEach((m) => { if (m.conversation_id === conversationId && m.sender_id !== p.id && !m[col]) m[col] = now; });
        save(db);
      },
      async listPlans() { return PLANS; },
      async listAddons() { return ADDONS; },
      async getSubscriptions(customerId) { return load().subscriptions.filter((s) => s.customer_id === customerId); },
      async saveSubscription(sub) {
        const db = load(); requireMe(db);
        db.subscriptions = [...db.subscriptions.filter((s) => !(s.customer_id === sub.customer_id && s.category === sub.category)), sub];
        save(db); emitPlan(sub.customer_id);
      },
      async listContent(customerId) {
        return load().content.filter((c) => c.customer_id === customerId).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
      },
      async saveContent(item) {
        const db = load(); requireMe(db);
        db.content = [...db.content.filter((c) => c.id !== item.id), item];
        save(db); emitPlan(item.customer_id);
      },
      async deleteContent(id) {
        const db = load(); const it = db.content.find((c) => c.id === id);
        db.content = db.content.filter((c) => c.id !== id); save(db); emitPlan(it?.customer_id ?? null);
      },
      subscribePlan(customerId, cb) { const l = { id: customerId, cb }; planCbs.add(l); return () => { planCbs.delete(l); }; },
      async getStaffTool(name) {
        const db = load(); const p = requireMe(db);
        if (p.role !== 'staff' || !db.aal2) throw new Error('forbidden');
        return `<!doctype html><html lang="sk"><body style="margin:0;padding:32px;font-family:system-ui;background:#0e1922;color:#f5f0e8"><h1 style="color:#e0ad55">Mock: ${name}</h1><p>V ostrom režime sa tu načíta kalkulačka zo súkromného úložiska.</p></body></html>`;
      },
      async uploadAttachment(conversationId, messageId, file, onProgress) {
        for (const r of [0.2, 0.6, 1]) { onProgress(r); await sleep(40); }
        const id = uuid();
        const att: Attachment = { id, message_id: messageId, conversation_id: conversationId, storage_path: `${conversationId}/${messageId}/${file.name}`, mime_type: file.type || 'application/octet-stream', size_bytes: file.size, original_name: file.name };
        if (file.size < INLINE_LIMIT) att.url = await readAsDataUrl(file);
        else objectUrls.set(id, URL.createObjectURL(file));
        const db = load(); db.attachments.push(att); save(db); emitMsgs(conversationId);
      },
      subscribe(conversationId, cb) {
        const l = { id: conversationId, cb };
        msgCbs.add(l);
        return () => { msgCbs.delete(l); };
      },
    },
  };
}
