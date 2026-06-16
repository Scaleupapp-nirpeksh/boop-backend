const express = require('express');

const router = express.Router();

// ============================================================
// Public legal pages for UnMutee (operated by ScaleUp Learning
// Technologies). Served as standalone HTML so they have stable,
// shareable HTTPS URLs for the App Store listing and in-app links.
//
// NOTE: These are production-ready drafts. Have Indian counsel review
// before relying on them for any dispute. Last updated 16 June 2026.
// ============================================================

const ENTITY = 'ScaleUp Learning Technologies';
const APP = 'UnMutee';
const GRIEVANCE_EMAIL = 'admin@scaleupapp.club';
const SUPPORT_EMAIL = 'admin@scaleupapp.club';
const UPDATED = '16 June 2026';

const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="all"/>
<title>${title} — ${APP}</title>
<style>
  :root{--ink:#1b1b18;--mut:#6b6358;--bg:#f7f3ec;--card:#ffffff;--accent:#ee3d62;--line:#e7e0d4}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:760px;margin:0 auto;padding:40px 22px 80px}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:28px}
  .dots{width:34px;height:22px;position:relative}
  .dots i{position:absolute;top:0;width:22px;height:22px;border-radius:50%}
  .dots i.a{left:0;background:radial-gradient(circle at 40% 38%,#ff8a6b,#c2185b)}
  .dots i.b{left:12px;background:radial-gradient(circle at 40% 38%,#7e96f0,#33409e);mix-blend-mode:multiply}
  .brand b{font-size:18px;letter-spacing:.5px}
  h1{font-size:30px;margin:0 0 6px}
  h2{font-size:19px;margin:34px 0 8px}
  .upd{color:var(--mut);font-size:14px;margin-bottom:8px}
  p,li{color:#2c2922}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:18px 0}
  hr{border:0;border-top:1px solid var(--line);margin:30px 0}
  footer{color:var(--mut);font-size:13px;margin-top:40px}
  nav a{margin-right:16px;font-size:14px}
  code{background:#efe9dd;padding:1px 6px;border-radius:6px;font-size:14px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><span class="dots"><i class="a"></i><i class="b"></i></span><b>${APP}</b></div>
    <nav><a href="/legal/privacy">Privacy</a><a href="/legal/terms">Terms</a><a href="/legal/support">Support</a></nav>
    <hr/>
    ${body}
    <footer>${APP} is operated by ${ENTITY}. © ${new Date().getFullYear()} ${ENTITY}. All rights reserved.<br/>
    Contact &amp; Grievance Officer: <a href="mailto:${GRIEVANCE_EMAIL}">${GRIEVANCE_EMAIL}</a></footer>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------- Privacy
const privacy = page('Privacy Policy', `
<h1>Privacy Policy</h1>
<div class="upd">Last updated: ${UPDATED}</div>
<p>${ENTITY} ("we", "us") operates the ${APP} mobile application (the "App"), a personality-first
dating service. This policy explains what personal data we collect, why, how we use and protect it, and
the rights you have. By using ${APP} you agree to this policy.</p>

<h2>1. Who we are</h2>
<p>Data Fiduciary: ${ENTITY}, India. For any privacy question or to exercise your rights, contact our
Grievance Officer at <a href="mailto:${GRIEVANCE_EMAIL}">${GRIEVANCE_EMAIL}</a>.</p>

<h2>2. Information we collect</h2>
<ul>
  <li><b>Account &amp; identity:</b> phone number (for OTP sign-in), first name, date of birth (to confirm you are 18+), gender and who you are interested in.</li>
  <li><b>Profile content:</b> photos, voice intro recordings, written and spoken answers to personality questions, bio and city/approximate location (if you grant permission).</li>
  <li><b>Activity:</b> matches, conversations, games played, reactions, and in-app preferences and settings.</li>
  <li><b>Device &amp; technical:</b> device push token, app version, and basic diagnostic/crash data.</li>
</ul>
<p>${APP} is strictly for adults. We do not knowingly collect data from anyone under 18, and the App is not directed at children.</p>

<h2>3. How we use your data</h2>
<ul>
  <li>To create your profile and compute personality and compatibility insights.</li>
  <li>To suggest compatible people, enable conversations, games and the earned photo-reveal experience.</li>
  <li>To keep the community safe (moderation, blocking, reporting) and to prevent fraud and abuse.</li>
  <li>To send service notifications you have enabled, and to operate, maintain and improve the App.</li>
</ul>

<h2>4. Sensitive data</h2>
<p>Some information you choose to share (for example, indications of sexual orientation or health) may be
sensitive. We process it only to provide the matching service you have asked for, based on your consent, and
treat it as our highest-risk data category.</p>

<h2>5. Service providers we share data with</h2>
<p>We do not sell your personal data. We share limited data with vendors strictly to run the service:</p>
<ul>
  <li><b>Amazon Web Services</b> — secure hosting and media storage (Mumbai region).</li>
  <li><b>MongoDB Atlas</b> — database.</li>
  <li><b>OpenAI</b> — generating personality insights and transcribing voice answers; content moderation.</li>
  <li><b>Twilio</b> — sending login OTP messages.</li>
  <li><b>Google Firebase</b> — push notifications.</li>
</ul>
<p>These providers process data under contractual confidentiality and security obligations.</p>

<h2>6. Retention</h2>
<p>We keep your data while your account is active. When you delete your account, we delete your profile,
photos, voice intro, answers, matches and conversations, except where we must retain limited records to meet
legal, safety or fraud-prevention obligations.</p>

<h2>7. Your rights</h2>
<p>Subject to applicable law (including India's Digital Personal Data Protection Act, 2023), you may request
access to, correction of, or erasure of your personal data, withdraw consent, or nominate another person to
exercise your rights. You can <b>delete your account at any time inside the App</b> (Profile → Delete Account),
or write to our Grievance Officer.</p>

<h2>8. Security</h2>
<p>We use encryption in transit, access controls, encrypted storage and other safeguards. No method of
transmission or storage is perfectly secure, but we work to protect your data and will notify you and the
authorities of a personal-data breach as required by law.</p>

<h2>9. Changes</h2>
<p>We may update this policy; material changes will be notified in-app or by other reasonable means. Continued
use after an update means you accept the revised policy.</p>

<h2>10. Grievance Officer</h2>
<p>In accordance with applicable Indian law, our Grievance Officer can be reached at
<a href="mailto:${GRIEVANCE_EMAIL}">${GRIEVANCE_EMAIL}</a>. We acknowledge complaints within 24 hours and aim to
resolve them within 15 days.</p>
`);

// ---------------------------------------------------------------- Terms
const terms = page('Terms of Service', `
<h1>Terms of Service</h1>
<div class="upd">Last updated: ${UPDATED}</div>
<p>These Terms govern your use of the ${APP} app, operated by ${ENTITY}. By creating an account or using ${APP},
you agree to these Terms. If you do not agree, do not use the App.</p>

<h2>1. Eligibility</h2>
<p>You must be at least <b>18 years old</b> and legally able to enter into a contract. ${APP} is for adults
seeking genuine connections. By using the App you confirm you meet these requirements.</p>

<h2>2. Your account</h2>
<p>You are responsible for the accuracy of your profile and for activity on your account. Provide truthful
information, do not impersonate anyone, and keep your sign-in secure.</p>

<h2>3. Acceptable use</h2>
<p>You agree not to:</p>
<ul>
  <li>harass, threaten, abuse, or harm other people;</li>
  <li>post unlawful, hateful, sexually exploitative, or infringing content;</li>
  <li>solicit money, advertise, spam, or run scams;</li>
  <li>upload content that is not yours or that you do not have the right to share;</li>
  <li>attempt to disrupt, reverse-engineer, or gain unauthorised access to the service.</li>
</ul>
<p>We may remove content, and suspend or terminate accounts, that violate these Terms or harm the community.</p>

<h2>4. Safety &amp; content</h2>
<p>${APP} provides blocking, reporting and moderation tools. You are responsible for your interactions with
other people. Always meet in safe, public places and use the in-app safety features. We are not responsible
for the conduct of any user.</p>

<h2>5. Content licence</h2>
<p>You retain ownership of the content you create. You grant ${ENTITY} a limited licence to host, store and
display your content solely to operate the App. This licence ends when you delete the content or your account,
subject to the retention noted in our Privacy Policy.</p>

<h2>6. Subscriptions</h2>
<p>${APP} is currently free to use. If paid features are introduced, they will be sold through the Apple App
Store, billed to your Apple ID, with terms, pricing, renewal and cancellation shown at purchase. Apple handles
billing and refunds for in-app purchases under Apple's policies.</p>

<h2>7. Disclaimers &amp; liability</h2>
<p>The App is provided "as is" without warranties of any kind. To the maximum extent permitted by law,
${ENTITY} is not liable for indirect or consequential losses, or for the actions of other users. Nothing in
these Terms limits rights you have under India's Consumer Protection Act, 2019.</p>

<h2>8. Termination</h2>
<p>You may stop using ${APP} and delete your account at any time (Profile → Delete Account). We may suspend or
terminate access for breach of these Terms or to protect users.</p>

<h2>9. Governing law &amp; grievances</h2>
<p>These Terms are governed by the laws of India, with courts in India having jurisdiction. For complaints,
contact our Grievance Officer at <a href="mailto:${GRIEVANCE_EMAIL}">${GRIEVANCE_EMAIL}</a> (acknowledged within
24 hours; resolved within 15 days).</p>

<h2>10. Changes</h2>
<p>We may update these Terms; material changes will be notified in-app. Continued use after an update means you
accept the revised Terms.</p>
`);

// ---------------------------------------------------------------- Support
const support = page('Support', `
<h1>Support</h1>
<div class="upd">We're here to help.</div>
<div class="card">
  <p><b>Email us:</b> <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
  <p>We typically respond within 1–2 business days, and acknowledge formal grievances within 24 hours.</p>
</div>

<h2>Common questions</h2>
<p><b>How do I sign in?</b> ${APP} uses your phone number with a one-time code (OTP). Enter your number, then the
code we send you.</p>
<p><b>How do I delete my account?</b> Open the App → Profile → Delete Account. This permanently deletes your
profile, photos, voice intro, answers, matches and conversations.</p>
<p><b>How do reveals work?</b> Photos start blurred and become clear as your connection deepens and both people
are comfortable — connection before appearance.</p>
<p><b>How do I report or block someone?</b> Open their profile or your conversation and use the Block / Report
option. Our team reviews reports and acts on violations.</p>
<p><b>Privacy &amp; data requests:</b> see our <a href="/legal/privacy">Privacy Policy</a>, or email our Grievance
Officer at <a href="mailto:${GRIEVANCE_EMAIL}">${GRIEVANCE_EMAIL}</a>.</p>
`);

router.get('/', (req, res) => res.redirect('/legal/support'));
router.get('/privacy', (req, res) => res.type('html').send(privacy));
router.get('/terms', (req, res) => res.type('html').send(terms));
router.get('/support', (req, res) => res.type('html').send(support));

module.exports = router;
