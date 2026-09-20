import Link from 'next/link';
import '../wall.css';
import { CONTACT_EMAIL, ORG_NAME, POLICY_UPDATED, SITE_NAME } from '../../lib/config';
import { formatPostNumber } from '../../lib/format';

export const metadata = { title: `Privacy Policy - ${SITE_NAME}` };

// A plain-language privacy policy for this site. It describes what the app
// actually does. If you change how the app works, change this page too.
// Edit ORG_NAME, CONTACT_EMAIL and POLICY_UPDATED in lib/config.ts.

export default function PrivacyPage() {
  return (
    <main className="wall-page">
      <div className="wall-col prose">
        <p>
          <Link href="/">&larr; Back to the wall</Link>
        </p>
        <h1 className="wall-title">Privacy Policy</h1>
        <p className="wall-sub">
          {SITE_NAME}. Last updated {POLICY_UPDATED}.
        </p>

        <h2>The short version</h2>
        <p>
          {SITE_NAME} lets people send anonymous messages that are posted on our Facebook Page. We collect only what
          is needed to do that. We do not save your name, email address, or IP address with your message. Anything
          posted on Facebook is public. This page is unofficial and is not run or endorsed by {ORG_NAME}.
        </p>

        <h2>What we save when you send a message</h2>
        <ul>
          <li>The text of your message.</li>
          <li>The category you picked.</li>
          <li>A name, only if you type one into the optional name box.</li>
          <li>The post number you are replying to, only if you enter one.</li>
          <li>A picture, only if you attach one.</li>
          <li>
            The date and time it was sent, and automatic labels that help admins, such as whether the message
            contains a link or repeats an earlier one.
          </li>
        </ul>

        <h2>What we do not save</h2>
        <ul>
          <li>Your name (unless you type it), email address, or phone number. There are no accounts for visitors.</li>
          <li>Your IP address or device and browser details, in our database.</li>
          <li>
            Hidden information inside pictures, such as location and camera details. Pictures are re-saved in a way
            that removes it.
          </li>
        </ul>
        <p>
          Anything you write yourself is saved as written. If you put your name or someone else&apos;s personal
          details in a message or picture, it will be public.
        </p>

        <h2>Services that handle data for us</h2>
        <ul>
          <li>
            <strong>Cloudflare Turnstile</strong> checks that you are a real person before a message is sent.
            Cloudflare receives information from your browser for this check, under its own privacy policy.
          </li>
          <li>
            <strong>Vercel</strong> hosts this website. Like most hosts, it may keep standard server logs, which can
            include IP addresses. We do not use them to find out who sent a message.
          </li>
          <li>
            <strong>Supabase</strong> stores the messages in a database and keeps pictures in private storage.
          </li>
          <li>
            <strong>Facebook (Meta)</strong> shows the posts on our Page. Once a message is posted there, Facebook&apos;s
            own terms and data policy apply to it.
          </li>
        </ul>

        <h2>How your message is used</h2>
        <ul>
          <li>
            Text-only messages are queued and posted to our Facebook Page automatically, one at a time, in the order
            they arrive. Nobody reviews them first.
          </li>
          <li>
            Messages with a picture wait for an admin to look at the picture. Approved ones join the queue. Rejected
            ones are not posted, and their picture is deleted.
          </li>
          <li>
            Once posted, a message is public. Anyone can see, share, or screenshot it, and we cannot control copies
            made by other people.
          </li>
        </ul>

        <h2>Who can see what</h2>
        <p>
          A small group of admins can see submitted messages, pictures, optional names, and labels in a private
          dashboard. Because we do not collect your identity, they cannot see who sent a message. Admins sign in with
          Google, and we keep their email addresses to check that they are allowed in.
        </p>

        <h2>Facebook data</h2>
        <p>
          This website does not use Facebook Login, does not ask you to connect a Facebook account, and does not
          collect data about Facebook users. Its only connection to Facebook is publishing posts to our Page.
        </p>

        <h2>Cookies and tracking</h2>
        <p>
          We do not use advertising or analytics trackers. Cloudflare&apos;s check may store small pieces of data in your
          browser to do its job. Admins&apos; sign-in also stores a login session in their browser.
        </p>

        <h2>How long we keep things, and how to ask for removal</h2>
        <p>
          Messages stay in our database until we delete them, and posts stay on the Page until they are removed. To
          ask us to remove a post, or to delete our copy of your data, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the post number (for example{' '}
          {formatPostNumber(42)}). If it has not been posted yet, describe the message and roughly when it was sent.
          We will remove it from the Page and delete our copy where we can find it.
        </p>
        <p>
          Because messages are anonymous, we cannot check who is asking, so we may ask for details that only the
          sender, or the person the post is about, would know. If a post shows your personal information or is about
          you, contact us the same way. Removing a post from Facebook does not remove screenshots or shares made by
          others.
        </p>

        <h2>Who this is for</h2>
        <p>
          This site is meant for people who are old enough to use Facebook, which requires being at least 13. Please do
          not use it if you are younger.
        </p>

        <h2>Changes to this policy</h2>
        <p>If we change how the site works, we will update this page and the date at the top.</p>

        <h2>Contact</h2>
        <p>
          Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </main>
  );
}
