/**
 * Email sender. Unlike WhatsApp/SMS, Gmail and Microsoft Graph require a
 * per-user OAuth grant (not a single shared credential), so real sending
 * needs an OAuth connect flow started from Settings → Integrations that
 * stores a refresh token on an IntegrationAccount row, then this function
 * exchanging it for an access token and calling
 * https://gmail.googleapis.com/gmail/v1/users/me/messages/send or
 * https://graph.microsoft.com/v1.0/me/sendMail.
 *
 * That OAuth flow isn't wired up yet, so every send here is simulated —
 * logged to the timeline like a real one, so the rest of the app (inbox,
 * reports, scoring) works unchanged once it is.
 */
export async function sendEmail(_to: string, _subject: string, _body: string) {
  return { simulated: true as const, externalId: `sim_email_${Date.now()}` };
}
