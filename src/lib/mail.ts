import nodemailer from "nodemailer";

export type MailResult = {
  sent: boolean;
  /** When SMTP is not configured in development, the code is logged server-side. */
  devHint?: string;
};

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function mailFrom(): string {
  return process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || "gateway@localhost";
}

export async function sendAuthorizationEmail(
  to: string,
  subject: string,
  text: string
): Promise<MailResult> {
  if (!smtpConfigured()) {
    const devHint =
      process.env.NODE_ENV !== "production"
        ? "SMTP not configured — check server logs for the authorization code."
        : undefined;
    console.log(`[mail] (SMTP not configured) To: ${to}\nSubject: ${subject}\n\n${text}`);
    return { sent: false, devHint };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject,
    text,
    html: `<pre style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${text.replace(/</g, "&lt;")}</pre>`,
  });

  return { sent: true };
}
