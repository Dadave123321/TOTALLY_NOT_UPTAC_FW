import { POST_PREFIX } from './config';
import type { Submission } from './types';

// 42 -> "#FW0042"
export function formatPostNumber(n: number): string {
  return `#${POST_PREFIX}${String(n).padStart(4, '0')}`;
}

// Understands "42", "fw42", "#FW0042", "FW 42" and returns 42. Anything else: null.
export function parsePostNumber(input: string): number | null {
  const re = new RegExp(`^\\s*#?\\s*(?:${POST_PREFIX})?\\s*0*(\\d{1,7})\\s*$`, 'i');
  const match = re.exec(input);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

// The exact text that gets posted to Facebook.
export function buildPostText(
  s: Pick<Submission, 'post_number' | 'category' | 'message' | 'sign_as' | 'reply_to'>
): string {
  const tag = s.post_number != null ? formatPostNumber(s.post_number) : `#${POST_PREFIX}`;
  const reply = s.reply_to != null ? `\nReplying to ${formatPostNumber(s.reply_to)}` : '';
  const body = s.message ? `\n\n${s.message}` : '';
  const signature = s.sign_as ? `\n\n- ${s.sign_as}` : '';
  return `${tag} [${s.category}]${reply}${body}${signature}`;
}
