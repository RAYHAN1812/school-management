// Placeholder mail transport. No email provider is wired up yet (it arrives
// with the notifications feature), so messages are written to the server log.
export async function sendMail({ to, subject, text }) {
  console.info(`[mail] to=${to} subject="${subject}"\n${text}`);
}
