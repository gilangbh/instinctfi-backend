import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { UserService } from '@/services/UserService';
import logger from '@/utils/logger';

export class AuthController {
  constructor(private userService: UserService) {}

  /**
   * Verify wallet signature and authenticate user
   */
  verifyWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { walletAddress, username, message, signature } = req.body;

      // Validate inputs
      if (!walletAddress || !username || !message || !signature) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: walletAddress, username, message, signature',
        });
        return;
      }

      // Validate wallet address format
      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(walletAddress);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Invalid Solana wallet address',
        });
        return;
      }

      // Verify signature
      try {
        const messageBytes = new TextEncoder().encode(message);
        // Support both base64 and bs58 signatures
        let signatureBytes;
        try {
          signatureBytes = bs58.decode(signature);
        } catch (e) {
          signatureBytes = Buffer.from(signature, 'base64');
        }
        const publicKeyBytes = publicKey.toBytes();

        const isValid = nacl.sign.detached.verify(
          messageBytes,
          signatureBytes,
          publicKeyBytes
        );

        if (!isValid) {
          res.status(401).json({
            success: false,
            error: 'Invalid signature',
          });
          return;
        }

        logger.info(`✅ Wallet signature verified for ${walletAddress}`);
      } catch (error) {
        logger.error('Error verifying signature:', error);
        res.status(401).json({
          success: false,
          error: 'Signature verification failed',
        });
        return;
      }

      // Check if user exists
      let user = await this.userService.getUserByWalletAddress(walletAddress);

      if (!user) {
        // Create new user
        logger.info(`Creating new user for wallet ${walletAddress}`);
        user = await this.userService.createUser({
          walletAddress,
          username,
        });
      } else {
        // User exists - just authenticate (don't update username)
        logger.info(`Authenticating existing user ${user.username} (${walletAddress})`);
        
        // Optional: Log a warning if username doesn't match (for debugging)
        if (user.username !== username) {
          logger.warn(
            `Username mismatch for ${walletAddress}: ` +
            `stored="${user.username}", provided="${username}". Using stored username.`
          );
        }
      }

      // Generate JWT token for the user
      const token = await this.userService.generateAuthToken(user.id);

      res.status(200).json({
        success: true,
        data: {
          user,
          token,
        },
        message: 'Wallet verified successfully',
      });
    } catch (error) {
      logger.error('Error in verifyWallet:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };

  /**
   * Get nonce/challenge for wallet to sign
   */
  getNonce = async (req: Request, res: Response): Promise<void> => {
    try {
      const { walletAddress } = req.query;

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'walletAddress is required',
        });
        return;
      }

      // Generate a unique nonce message for the wallet to sign
      const timestamp = Date.now();
      const message = `Sign this message to authenticate with Instinct.fi\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\n\nThis signature will not trigger any blockchain transaction or cost any gas fees.`;

      res.status(200).json({
        success: true,
        data: {
          message,
          timestamp,
        },
      });
    } catch (error) {
      logger.error('Error in getNonce:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

