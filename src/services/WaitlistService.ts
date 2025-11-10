import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import logger from '@/utils/logger';

const WAITLIST_TEXT_CONTENT = `Congrats!

You've officially joined Instinctfi's waitlist!

Don't forget to follow our socials to keep up with our updates and announcements:

Twitter: https://x.com/instinctfi

Telegram: https://t.me/instinctfi

Discord: https://discord.gg/Ap4csvAE

Disclamer: this email was sent from https://instincfy.xyz, Verify that this email sender's domain name matches our site's in order to avoid scams.`;

const WAITLIST_HTML_CONTENT = `
  <p>Congrats!</p>
  <p>You've officially joined Instinctfi's waitlist!</p>
  <p>Don't forget to follow our socials to keep up with our updates and announcements:</p>
  <ul>
    <li>Twitter: <a href="https://x.com/instinctfi">https://x.com/instinctfi</a></li>
    <li>Telegram: <a href="https://t.me/instinctfi">https://t.me/instinctfi</a></li>
    <li>Discord: <a href="https://discord.gg/Ap4csvAE">https://discord.gg/Ap4csvAE</a></li>
  </ul>
  <p><strong>Disclamer:</strong> this email was sent from <a href="https://instincfy.xyz">https://instincfy.xyz</a>. Verify that this email sender's domain name matches our site's in order to avoid scams.</p>
`;

export class WaitlistService {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly subject: string;

  constructor() {
    this.apiKey = process.env.MAILERSEND_API_KEY || '';
    this.fromEmail = process.env.MAILERSEND_FROM_EMAIL || '';
    this.fromName = process.env.MAILERSEND_FROM_NAME || 'InstinctFi';
    this.subject = process.env.MAILERSEND_WAITLIST_SUBJECT || 'Thanks for joining the InstinctFi waitlist';

    if (!this.apiKey) {
      logger.warn('MAILERSEND_API_KEY is not set. Waitlist emails will fail.');
    }

    if (!this.fromEmail) {
      logger.warn('MAILERSEND_FROM_EMAIL is not set. Waitlist emails will fail.');
    }
  }

  private validateConfig(): void {
    if (!this.apiKey || !this.fromEmail) {
      throw new Error('MailerSend configuration is incomplete.');
    }
  }

  async sendWaitlistConfirmation(email: string): Promise<string> {
    this.validateConfig();

    const mailerSend = new MailerSend({ apiKey: this.apiKey });

    const sentFrom = new Sender(this.fromEmail, this.fromName);
    const recipients = [new Recipient(email, email)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setReplyTo(sentFrom)
      .setSubject(this.subject)
      .setText(WAITLIST_TEXT_CONTENT)
      .setHtml(WAITLIST_HTML_CONTENT);

    try {
      const response = await mailerSend.email.send(emailParams);
      const messageId = response?.body?.data?.id || response?.headers?.get?.('x-message-id') || 'unknown';
      logger.info(`Waitlist confirmation email sent to ${email} (message ID: ${messageId})`);
      return messageId;
    } catch (error: any) {
      logger.error('Failed to send waitlist confirmation email', {
        message: error?.message,
        status: error?.response?.status,
        body: error?.response?.body,
      });
      throw error;
    }
  }
}
