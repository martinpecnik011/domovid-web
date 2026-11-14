import type { Message } from './types';

const HEAD = ['created_at', 'sender', 'kind', 'body', 'link_url', 'video_ref', 'timecode', 'attachments'];
// Leading = + - @ would run as a formula in Excel: neutralise with an apostrophe.
const cell = (v: string | null | undefined) => {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function messagesToCsv(messages: Message[], senderName: (m: Message) => string): string {
  const rows = messages.map((m) => [m.created_at, senderName(m), m.kind, m.body, m.link_url, m.video_ref, m.timecode, m.attachments.map((a) => a.original_name).join('; ')]);
  return '﻿' + [HEAD, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
