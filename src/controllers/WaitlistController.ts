import { Request, Response } from 'express';
import { WaitlistService } from '@/services/WaitlistService';
import logger from '@/utils/logger';

export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  subscribe = async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Valid email is required',
      });
      return;
    }

    try {
      const messageId = await this.waitlistService.sendWaitlistConfirmation(email.trim().toLowerCase());

      res.status(200).json({
        success: true,
        data: {
          messageId,
        },
        message: 'Waitlist confirmation email sent',
      });
    } catch (error: any) {
      logger.error('Error handling waitlist subscription', {
        error: error?.message ?? error,
      });
      const status = error?.response?.status || 500;
      const detailedError =
        error?.response?.body?.errors?.[0]?.message ||
        error?.response?.body?.message ||
        error?.message ||
        'Failed to send waitlist confirmation email';

      res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        error: detailedError,
      });
    }
  };
}
