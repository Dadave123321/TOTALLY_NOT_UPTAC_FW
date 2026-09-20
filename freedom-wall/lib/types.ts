export type Status =
  | 'review'
  | 'queued'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'removed'
  | 'rejected';

// One row of the "submissions" table (only the columns the app uses).
export type Submission = {
  id: string;
  created_at: string;
  message: string;
  category: string;
  sign_as: string | null;
  flags: string[];
  status: Status;
  post_number: number | null;
  reply_to: number | null;
  image_path: string | null;
  fb_post_id: string | null;
  post_error: string | null;
  posted_at: string | null;
};
