import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import logger from '@/utils/logger';

export class WaitlistService {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly templateId: string;
  private readonly subject: string;

  constructor() {
    this.apiKey = process.env.MAILERSEND_API_KEY || '';
    this.fromEmail = process.env.MAILERSEND_FROM_EMAIL || '';
    this.fromName = process.env.MAILERSEND_FROM_NAME || 'InstinctFi';
    this.templateId = process.env.MAILERSEND_WAITLIST_TEMPLATE_ID || '';
    this.subject = process.env.MAILERSEND_WAITLIST_SUBJECT || 'Thanks for joining the InstinctFi waitlist';

    if (!this.apiKey) {
      logger.warn('MAILERSEND_API_KEY is not set. Waitlist emails will fail.');
    }

    if (!this.fromEmail) {
      logger.warn('MAILERSEND_FROM_EMAIL is not set. Waitlist emails will fail.');
    }

    if (!this.templateId) {
      logger.warn('MAILERSEND_WAITLIST_TEMPLATE_ID is not set. Waitlist emails will fail.');
    }
  }

  private validateConfig(): void {
    if (!this.apiKey || !this.fromEmail || !this.templateId) {
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
      .setTemplateId(this.templateId);

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
