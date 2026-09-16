/* Sending mail through Resend — the same provider already proven in
 * slipstream-pitlane, this account's sibling app, so this ports the pattern
 * rather than guessing at a new one.
 *
 * Nothing here queues or retries: a call either goes or throws, and every
 * caller treats a failure to send as a failure to complete the request it
 * was part of, the same way a Stripe call already does in checkout.js.
 */
const RESEND_URL = "https://api.resend.com/emails";

const apiKey = () => (process.env.RESEND_API_KEY || "").trim();
/* A verified sender, "Name <address@domain>" — Resend refuses anything
   sent from a domain it hasn't verified, so this has no fallback of its
   own to guess at. */
const fromAddress = () => (process.env.EMAIL_FROM || "").trim();

const configured = () => !!(apiKey() && fromAddress());
if (!configured()) console.log("RESEND_API_KEY/EMAIL_FROM not set: no email can be sent yet");

/* A plain-text alternative, cheaply — stripped tags rather than a second
   template, which is enough to keep a spam filter from marking an
   HTML-only email down. */
function textPart(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function sendEmail(to, subject, html) {
  if (!configured()) throw new Error("email is not configured");
  let res;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, text: textPart(html) }),
    });
  } catch (e) {
    throw new Error("resend unreachable: " + (e && e.message));
  }
  if (!res.ok) {
    let msg = "resend returned " + res.status;
    try { const body = await res.json(); if (body && body.message) msg = body.message; } catch (e) {}
    throw new Error(msg);
  }
}

/* A sign-in link stands in for "your password" — clicking it signs the
   account in directly rather than asking for a new password to be chosen,
   which is one fewer thing to get wrong (and one fewer password-strength
   rule to enforce) for the same actual need: getting back in. */
function loginLinkHtml(name, link) {
  return "<p>Hi " + name + ",</p>" +
    "<p>Here's your sign-in link for Apex Drawn:</p>" +
    "<p><a href=\"" + link + "\">" + link + "</a></p>" +
    "<p>It works once, and only for the next 30 minutes. If you didn't ask for this, nothing has changed — just ignore it.</p>";
}

module.exports = { sendEmail, configured, loginLinkHtml };
