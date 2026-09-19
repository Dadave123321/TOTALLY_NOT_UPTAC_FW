// Settings you might want to change. Everything else in the app reads from here.

export const SITE_NAME = 'Freedom Wall';

// Longest message we accept. (The database has a hard ceiling of 2000.)
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_SIGN_AS_LENGTH = 50;

export const CATEGORIES = ['Confession', 'Rant', 'Shoutout', 'Question', 'Other'] as const;

// Posts show up on Facebook as "#FW0042 [Confession]". Change "FW" to rename it.
export const POST_PREFIX = 'FW';

// Text shown under the form. Keep it true: this is exactly how the app behaves.
export const FORM_NOTICE = [
  'Messages are posted to our Facebook page automatically, about one every 5 minutes, in the order they arrive. Nothing is reviewed first.',
  'We do not save your name, email, or IP address with your message. Add a name below only if you want it shown.',
];
