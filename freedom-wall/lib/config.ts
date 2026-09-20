// Settings you might want to change. Everything else in the app reads from here.

export const SITE_NAME = 'Freedom Wall';

// Longest message we accept. (The database has a hard ceiling of 2000.)
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_SIGN_AS_LENGTH = 50;

export const CATEGORIES = ['Confession', 'Rant', 'Shoutout', 'Question', 'Other'] as const;

// Posts show up on Facebook as "#FW0042 [Confession]". Change "FW" to rename it.
export const POST_PREFIX = 'FW';

// Pictures. The browser shrinks pictures before upload, so they fit under
// Vercel's ~4.5 MB request limit. The server shrinks them again to be safe.
export const IMAGE_BUCKET = 'wall-images';
export const IMAGE_MAX_SIDE = 1600; // longest side in pixels
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;

// Text shown under the form. Keep it true: this is exactly how the app behaves.
export const FORM_NOTICE = [
  'Text messages are posted to our Facebook page automatically, about one every 5 minutes, in the order they arrive. Nothing is reviewed first.',
  'Messages with a picture wait for an admin to look at the picture before they join the line, so they can take longer and may not go up.',
  'We do not save your name, email, or IP address with your message. Location and camera details are removed from pictures. Add a name below only if you want it shown.',
];
