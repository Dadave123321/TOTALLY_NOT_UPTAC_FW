// SERVER ONLY. Talks to the Facebook Graph API using the Page access token.

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v25.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

export function facebookConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
}

// DRY_RUN=true pretends to post, so you can test everything without Facebook.
export function isDryRun(): boolean {
  return process.env.DRY_RUN === 'true';
}

export type FbResult = { ok: true; id: string } | { ok: false; error: string };

async function callGraph(
  url: string,
  method: 'POST' | 'DELETE',
  body?: URLSearchParams | FormData
): Promise<FbResult> {
  try {
    const res = await fetch(url, {
      method,
      body,
      // A plain form needs this header. For file uploads (FormData) we must
      // NOT set it: fetch adds the correct one, including the boundary.
      headers: body instanceof URLSearchParams ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      cache: 'no-store',
    });
    const json: Record<string, any> = await res.json().catch(() => ({}));

    if (!res.ok || json.error) {
      const e = json.error ?? {};
      // Error code 190 = the access token is expired or was invalidated.
      if (e.code === 190) {
        return {
          ok: false,
          error: `Facebook token expired or invalid. Renew the Page access token. (${e.message ?? 'no details'})`,
        };
      }
      return { ok: false, error: `Facebook error ${e.code ?? res.status}: ${e.message ?? 'unknown error'}` };
    }

    // Picture uploads may return both a photo id and the id of the Page post
    // that holds it. Prefer the post id, since that is what we delete later.
    const id =
      typeof json.post_id === 'string' ? json.post_id : typeof json.id === 'string' ? json.id : '';
    return { ok: true, id };
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach Facebook: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Publishes a text post on the Page. Returns the new post's ID.
export async function publishToPage(message: string): Promise<FbResult> {
  const body = new URLSearchParams({
    message,
    access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN!,
  });
  const result = await callGraph(`${BASE}/${process.env.FACEBOOK_PAGE_ID}/feed`, 'POST', body);
  if (result.ok && !result.id) {
    return { ok: false, error: 'Facebook did not return a post ID.' };
  }
  return result;
}

// Publishes a picture (with the text as its caption) on the Page.
// The picture is uploaded as a file; Facebook's docs call the field "source".
export async function publishPhotoToPage(caption: string, image: ArrayBuffer): Promise<FbResult> {
  const form = new FormData();
  form.append('source', new Blob([image], { type: 'image/jpeg' }), 'photo.jpg');
  form.append('message', caption);
  form.append('published', 'true');
  form.append('access_token', process.env.FACEBOOK_PAGE_ACCESS_TOKEN!);

  const result = await callGraph(`${BASE}/${process.env.FACEBOOK_PAGE_ID}/photos`, 'POST', form);
  if (result.ok && !result.id) {
    return { ok: false, error: 'Facebook did not return a post ID.' };
  }
  return result;
}

// Deletes a post from the Page.
export async function deleteFromPage(fbPostId: string): Promise<FbResult> {
  const token = encodeURIComponent(process.env.FACEBOOK_PAGE_ACCESS_TOKEN!);
  return callGraph(`${BASE}/${encodeURIComponent(fbPostId)}?access_token=${token}`, 'DELETE');
}
