export type Role = 'customer' | 'staff';
export type Kind = 'text' | 'edit_request' | 'link' | 'file' | 'system';

export interface Session { userId: string; email: string }
export interface Profile { id: string; email: string; full_name: string | null; phone: string | null; company: string | null; role: Role }
export interface Attachment {
  id: string; message_id: string; conversation_id: string; storage_path: string;
  mime_type: string; size_bytes: number; original_name: string;
  /** Display URL (signed URL / data URL); filled by the adapter. */
  url?: string;
  /** Same file, served as a download of the original bytes (full quality). */
  download_url?: string;
}
export interface Message {
  id: string; conversation_id: string; sender_id: string; kind: Kind; body: string | null;
  link_url: string | null; video_ref: string | null; timecode: string | null; created_at: string;
  read_by_staff_at: string | null; read_by_customer_at: string | null;
  attachments: Attachment[];
}
export interface Conversation {
  id: string; customer_id: string; title: string | null; status: string | null; last_message_at: string | null;
  /** Staff only: customer label and number of customer messages not yet read by staff. */
  customer?: { full_name: string | null; email: string | null };
  unread: number;
}
export interface NewMessage {
  id: string; conversationId: string; kind: Kind; body?: string | null;
  link_url?: string | null; video_ref?: string | null; timecode?: string | null;
}

export type PlanCategory = 'social' | 'video' | 'video_viz';
export type PlanCode = '10' | '15' | '30' | 'video_1' | 'video_4' | 'viz_1' | 'viz_4';
export type PlanId = 'none' | PlanCode | 'custom';
export type PaymentStatus = 'unpaid' | 'paid' | 'overdue';
export interface Plan { code: PlanCode; category: PlanCategory; unit: 'month' | 'once'; videos: number; price_net: number; per_video: number; label: string; popular: boolean; commitment_months: number; note: string | null }
export interface Addon { code: string; label: string; price_net: number; unit: 'month' | 'video'; applies_to: 'social' | 'video'; note: string | null; sort: number }
export interface Subscription {
  customer_id: string; category: PlanCategory; plan: PlanId; addons: string[]; videos_included: number; videos_used: number;
  period_start: string | null; period_end: string | null; commitment_until: string | null;
  payment_status: PaymentStatus; price_net: number | null; note: string | null;
}
export type ContentKind = 'ponuka' | 'osobna_znacka' | 'tip' | 'nabor' | 'ine';
export type ContentStatus = 'planned' | 'in_production' | 'for_approval' | 'approved' | 'published';
export interface ContentItem { id: string; customer_id: string; title: string; kind: ContentKind; due_date: string | null; status: ContentStatus; video_ref: string | null; note: string | null }
/** What a signed-in user still has to do before the app opens (staff: TOTP, Supabase aal2). */
export type MfaNeed = { kind: 'none' } | { kind: 'enroll' } | { kind: 'verify'; factorId: string };
/** TOTP enrolment data: QR image (data URI) and the key for manual entry. */
export interface MfaEnrolment { factorId: string; qr: string; manualKey: string }

export interface Adapter {
  mock: null | { switchTo(role: Role): void; otpCode: string; totpCode: string };
  auth: {
    /** Sends a 6-digit code by e-mail (creates the user when new). */
    signInWithOtp(email: string): Promise<void>;
    verifyOtp(email: string, token: string): Promise<void>;
    mfaState(): Promise<MfaNeed>;
    mfaEnroll(): Promise<MfaEnrolment>;
    mfaVerify(factorId: string, code: string): Promise<void>;
    signInWithOAuth(provider: 'google'): Promise<void>;
    getSession(): Promise<Session | null>;
    signOut(): Promise<void>;
    onAuthStateChange(cb: (s: Session | null) => void): () => void;
  };
  data: {
    getProfile(): Promise<Profile | null>;
    updateProfile(patch: Pick<Profile, 'full_name' | 'phone' | 'company'>): Promise<void>;
    listConversations(): Promise<Conversation[]>;
    getMessages(conversationId: string): Promise<Message[]>;
    sendMessage(m: NewMessage): Promise<void>;
    markRead(conversationId: string, role: Role): Promise<void>;
    listPlans(): Promise<Plan[]>;
    listAddons(): Promise<Addon[]>;
    /** One row per category the customer has (signup creates a social row). */
    getSubscriptions(customerId: string): Promise<Subscription[]>;
    saveSubscription(sub: Subscription): Promise<void>;
    listContent(customerId: string): Promise<ContentItem[]>;
    saveContent(item: ContentItem): Promise<void>;
    deleteContent(id: string): Promise<void>;
    /** Subscription + content changes of one customer (null = all, staff). */
    subscribePlan(customerId: string | null, cb: () => void): () => void;
    uploadAttachment(conversationId: string, messageId: string, file: File, onProgress: (ratio: number) => void): Promise<void>;
    /** Staff-only HTML tool from the private `staff` bucket (e.g. the calculator). */
    getStaffTool(name: string): Promise<string>;
    /** conversationId null = every conversation visible to the user (staff inbox). */
    subscribe(conversationId: string | null, cb: () => void): () => void;
  };
}
