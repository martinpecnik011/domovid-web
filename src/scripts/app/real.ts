import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/supabase';
import type { Adapter, Addon, Attachment, ContentItem, Conversation, MfaNeed, Message, Plan, Profile, Session, Subscription } from './types';

const BUCKET = 'chat';

export function createReal(base: string): Adapter {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const redirectTo = location.origin + base + 'app/';
  const toSession = (s: { user: { id: string; email?: string } } | null): Session | null =>
    s ? { userId: s.user.id, email: s.user.email ?? '' } : null;
  const ok = <T>(r: { data: T; error: { message: string } | null }): NonNullable<T> => {
    if (r.error) throw new Error(r.error.message);
    return r.data as NonNullable<T>;
  };
  const uid = async () => {
    const s = (await sb.auth.getSession()).data.session;
    if (!s) throw new Error('not signed in');
    return s.user.id;
  };

  return {
    mock: null,
    auth: {
      async signInWithOtp(email) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw new Error(error.message);
      },
      async verifyOtp(email, token) {
        const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
        if (error) throw new Error(error.message);
      },
      async mfaState(): Promise<MfaNeed> {
        // Staff RLS needs aal2. is_staff_role() tells whether this user must pass TOTP.
        const { data: isStaff } = await sb.rpc('is_staff_role');
        if (!isStaff) return { kind: 'none' };
        const aal = ok(await sb.auth.mfa.getAuthenticatorAssuranceLevel());
        if (aal.currentLevel === 'aal2') return { kind: 'none' };
        const factors = ok(await sb.auth.mfa.listFactors());
        const verified = factors.totp[0]; // listFactors().totp holds verified factors only
        if (verified) return { kind: 'verify', factorId: verified.id };
        // A half-finished enrolment would block a new one with the same name: drop it.
        for (const f of factors.all.filter((x) => x.factor_type === 'totp' && x.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: f.id });
        return { kind: 'enroll' };
      },
      async mfaEnroll() {
        const d = ok(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Domovid ' + new Date().toISOString().slice(0, 10) }));
        return { factorId: d.id, qr: d.totp.qr_code, manualKey: d.totp.secret };
      },
      async mfaVerify(factorId, code) {
        const ch = ok(await sb.auth.mfa.challenge({ factorId }));
        ok(await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code }));
      },
      async signInWithOAuth(provider) {
        const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) } });
        if (error) throw new Error(error.message);
      },
      async getSession() { return toSession((await sb.auth.getSession()).data.session); },
      async signOut() { await sb.auth.signOut(); },
      onAuthStateChange(cb) {
        // supabase-js must not be called from inside its own callback: defer.
        const { data } = sb.auth.onAuthStateChange((_e, s) => { setTimeout(() => cb(toSession(s)), 0); });
        return () => data.subscription.unsubscribe();
      },
    },
    data: {
      async getProfile() {
        const id = await uid();
        return ok(await sb.from('profiles').select('id,email,full_name,phone,company,role').eq('id', id).maybeSingle()) as Profile | null;
      },
      async updateProfile(patch) {
        ok(await sb.from('profiles').update(patch).eq('id', await uid()));
      },
      async listConversations() {
        const convs = ok(await sb.from('conversations').select('id,customer_id,title,status,last_message_at').order('last_message_at', { ascending: false, nullsFirst: false })) as Omit<Conversation, 'unread'>[];
        if (!convs.length) return [];
        const me = await uid();
        const customers = ok(await sb.from('profiles').select('id,full_name,email').in('id', convs.map((c) => c.customer_id))) as { id: string; full_name: string | null; email: string | null }[];
        const unread = ok(await sb.from('messages').select('conversation_id,sender_id').is('read_by_staff_at', null)) as { conversation_id: string; sender_id: string }[];
        return convs.map((c) => ({
          ...c,
          customer: customers.find((p) => p.id === c.customer_id),
          // For a customer (RLS: own conversation only) the badge is irrelevant.
          unread: c.customer_id === me ? 0 : unread.filter((m) => m.conversation_id === c.id && m.sender_id === c.customer_id).length,
        }));
      },
      async getMessages(conversationId) {
        const rows = ok(await sb.from('messages').select('*, attachments(*)').eq('conversation_id', conversationId).order('created_at', { ascending: true })) as Message[];
        const atts = rows.flatMap((m) => m.attachments ?? []);
        if (atts.length) {
          const signed = ok(await sb.storage.from(BUCKET).createSignedUrls(atts.map((a) => a.storage_path), 3600));
          const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
          // Videos also get a download link: Content-Disposition attachment, original file untouched.
          const videos = atts.filter((a) => a.mime_type.startsWith('video/'));
          const dl = videos.length ? ok(await sb.storage.from(BUCKET).createSignedUrls(videos.map((a) => a.storage_path), 3600, { download: true })) : [];
          const dlByPath = new Map(dl.map((s) => [s.path, s.signedUrl]));
          atts.forEach((a: Attachment) => { a.url = byPath.get(a.storage_path) ?? undefined; a.download_url = dlByPath.get(a.storage_path) ?? undefined; });
        }
        return rows.map((m) => ({ ...m, attachments: m.attachments ?? [] }));
      },
      async sendMessage(m) {
        ok(await sb.from('messages').insert({
          id: m.id, conversation_id: m.conversationId, sender_id: await uid(), kind: m.kind,
          body: m.body ?? null, link_url: m.link_url ?? null, video_ref: m.video_ref ?? null, timecode: m.timecode ?? null,
        }));
      },
      async markRead(conversationId, role) {
        const col = role === 'staff' ? 'read_by_staff_at' : 'read_by_customer_at';
        ok(await sb.from('messages').update({ [col]: new Date().toISOString() }).eq('conversation_id', conversationId).is(col, null).neq('sender_id', await uid()));
      },
      async listPlans() { return ok(await sb.from('plans').select('*').order('price_net')) as Plan[]; },
      async listAddons() { return ok(await sb.from('addons').select('*').order('sort')) as Addon[]; },
      async getSubscriptions(customerId) {
        return ok(await sb.from('subscriptions').select('*').eq('customer_id', customerId)) as Subscription[];
      },
      async saveSubscription(sub) {
        ok(await sb.from('subscriptions').upsert({ ...sub, updated_at: new Date().toISOString(), updated_by: await uid() }, { onConflict: 'customer_id,category' }));
      },
      async listContent(customerId) {
        return ok(await sb.from('content_items').select('*').eq('customer_id', customerId).order('due_date', { ascending: true, nullsFirst: false })) as ContentItem[];
      },
      async saveContent(item) { ok(await sb.from('content_items').upsert(item)); },
      async deleteContent(id) { ok(await sb.from('content_items').delete().eq('id', id)); },
      subscribePlan(customerId, cb) {
        const filter = customerId ? { filter: `customer_id=eq.${customerId}` } : {};
        const ch = sb.channel(`plan-${customerId ?? 'all'}-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', ...filter }, () => cb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items', ...filter }, () => cb())
          .subscribe();
        return () => { void sb.removeChannel(ch); };
      },
      async getStaffTool(name) {
        const { data, error } = await sb.storage.from('staff').download(name);
        if (error || !data) throw new Error(error?.message || 'not found');
        return await data.text();
      },
      async uploadAttachment(conversationId, messageId, file, onProgress) {
        const safe = file.name.replace(/[^\w.\-]+/g, '_') || 'file';
        const path = `${conversationId}/${messageId}/${safe}`;
        const token = (await sb.auth.getSession()).data.session?.access_token;
        if (!token) throw new Error('not signed in');
        // XHR instead of storage.upload(): it is the only way to get upload progress.
        await new Promise<void>((resolve, reject) => {
          const x = new XMLHttpRequest();
          x.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
          x.setRequestHeader('Authorization', `Bearer ${token}`);
          x.setRequestHeader('apikey', SUPABASE_ANON_KEY);
          x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
          x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`upload ${x.status}`)));
          x.onerror = () => reject(new Error('upload failed'));
          x.send(file);
        });
        ok(await sb.from('attachments').insert({
          message_id: messageId, conversation_id: conversationId, storage_path: path,
          mime_type: file.type || 'application/octet-stream', size_bytes: file.size, original_name: file.name,
        }));
        onProgress(1);
      },
      subscribe(conversationId, cb) {
        const filter = conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {};
        const ch = sb.channel(`chat-${conversationId ?? 'all'}-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', ...filter }, () => cb())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attachments', ...filter }, () => cb())
          .subscribe();
        return () => { void sb.removeChannel(ch); };
      },
    },
  };
}
