import { POST_PREFIX } from './config';
import type { Submission } from './types';

// 42 -> "#FW0042"
export function formatPostNumber(n: number): string {
  return `#${POST_PREFIX}${String(n).padStart(4, '0')}`;
}

// The exact text that gets posted to Facebook.
export function buildPostText(
  s: Pick<Submission, 'post_number' | 'category' | 'message' | 'sign_as'>
): string {
  const tag = s.post_number != null ? formatPostNumber(s.post_number) : `#${POST_PREFIX}`;
  const signature = s.sign_as ? `\n\n- ${s.sign_as}` : '';
  return `${tag} [${s.category}]\n\n${s.message}${signature}`;
}
