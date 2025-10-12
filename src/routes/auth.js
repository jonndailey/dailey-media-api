import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import authService from '../services/authService.js';
import {
  validateEmail,
  validatePassword,
  handleValidationErrors,
  authRateLimit
} from '../middleware/security.js';
import { body } from 'express-validator';

const router = express.Router();

/**
 * @swagger
 * /api/auth/mfa/setup:
 *   post:
 *     tags: [Authentication]
 *     summary: Setup Multi-Factor Authentication
 *     description: Generate QR code and secret for MFA setup
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA setup initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: MFA setup initiated
 *                 qrCode:
 *                   type: string
 *                   description: Base64 QR code image
 *                 secret:
 *                   type: string
 *                   description: MFA secret key
 *                 manualEntryKey:
 *                   type: string
 *                   description: Manual entry key for authenticator apps
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
// MFA Setup - Generate QR Code
router.post('/mfa/setup', 
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.userId;
      const userEmail = req.user.email;

      const mfaData = await authService.generateMFAQRCode(userId, userEmail);
      
      res.json({
        success: true,
        message: 'MFA setup initiated',
        qrCode: mfaData.qrCodeDataUrl,
        secret: mfaData.secret,
        manualEntryKey: mfaData.manualEntryKey,
        instructions: 'Scan the QR code with your authenticator app and verify with a token to enable MFA'
      });
    } catch (error) {
      console.error('MFA setup error:', error);
      res.status(500).json({
        success: false,
        error: 'MFA setup failed',
        message: error.message
      });
    }
  }
);

// MFA Enable - Verify and activate
router.post('/mfa/enable',
  authenticateToken,
  [
    body('token')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('MFA token must be 6 digits'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { token } = req.body;
      const userId = req.userId;

      const result = authService.enableMFA(userId, token);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'MFA enable failed',
          message: result.error
        });
      }

      res.json({
        success: true,
        message: 'MFA enabled successfully',
        warning: 'Please save your backup codes in a secure location'
      });
    } catch (error) {
      console.error('MFA enable error:', error);
      res.status(500).json({
        success: false,
        error: 'MFA enable failed',
        message: error.message
      });
    }
  }
);

// MFA Disable
router.post('/mfa/disable',
  authenticateToken,
  [
    body('token')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('MFA token must be 6 digits'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { token } = req.body;
      const userId = req.userId;

      const result = authService.disableMFA(userId, token);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'MFA disable failed',
          message: result.error
        });
      }

      res.json({
        success: true,
        message: 'MFA disabled successfully'
      });
    } catch (error) {
      console.error('MFA disable error:', error);
      res.status(500).json({
        success: false,
        error: 'MFA disable failed',
        message: error.message
      });
    }
  }
);

// MFA Verify - Check TOTP token
router.post('/mfa/verify',
  authenticateToken,
  [
    body('token')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('MFA token must be 6 digits'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { token } = req.body;
      const userId = req.userId;

      const verification = authService.verifyMFAToken(userId, token);
      
      res.json({
        success: true,
        valid: verification.valid,
        message: verification.valid ? 'Token verified' : 'Invalid token'
      });
    } catch (error) {
      console.error('MFA verify error:', error);
      res.status(500).json({
        success: false,
        error: 'MFA verification failed',
        message: error.message
      });
    }
  }
);

// Password strength check
router.post('/password/check-strength',
  [
    body('password')
      .isLength({ min: 1 })
      .withMessage('Password is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { password } = req.body;
      const strengthResult = authService.validatePasswordStrength(password);
      
      res.json({
        success: true,
        ...strengthResult
      });
    } catch (error) {
      console.error('Password strength check error:', error);
      res.status(500).json({
        success: false,
        error: 'Password strength check failed',
        message: error.message
      });
    }
  }
);

// Token refresh
router.post('/refresh',
  authRateLimit,
  [
    body('refresh_token')
      .notEmpty()
      .withMessage('Refresh token is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { refresh_token } = req.body;
      
      const result = await authService.refreshAccessToken(refresh_token);
      
      if (!result.success) {
        return res.status(401).json({
          success: false,
          error: 'Token refresh failed',
          message: result.error
        });
      }

      res.json({
        success: true,
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        expires_in: result.expiresIn,
        token_type: result.tokenType
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        error: 'Token refresh failed',
        message: error.message
      });
    }
  }
);

// Logout - Invalidate tokens
router.post('/logout',
  authenticateToken,
  [
    body('refresh_token')
      .optional()
      .notEmpty()
      .withMessage('Invalid refresh token'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const token = req.headers.authorization?.substring(7);
      const { refresh_token } = req.body;
      
      await authService.invalidateToken(token, refresh_token);
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed',
        message: error.message
      });
    }
  }
);

// Get user security status
router.get('/security-status',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.userId;
      
      // Check if MFA is enabled (this would be from database in production)
      const mfaEnabled = authService.mfaSecrets.has(userId) && 
                        !authService.mfaSecrets.get(userId)?.tempSecret;
      
      res.json({
        success: true,
        security: {
          mfa_enabled: mfaEnabled,
          account_locked: false, // Check from database
          last_login: new Date().toISOString(), // From database
          session_count: 1, // Active sessions count
          security_events: [] // Recent security events
        }
      });
    } catch (error) {
      console.error('Security status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get security status',
        message: error.message
      });
    }
  }
);

// Generate new API key
router.post('/api-key/generate',
  authenticateToken,
  requireScope('admin'),
  [
    body('name')
      .isLength({ min: 1, max: 100 })
      .trim()
      .escape()
      .withMessage('API key name must be between 1 and 100 characters'),
    body('scopes')
      .optional()
      .isArray()
      .withMessage('Scopes must be an array'),
    body('expires_in')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Expiry must be a positive integer (hours)'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { name, scopes = ['read'], expires_in } = req.body;
      
      const apiKey = authService.generateApiKey();
      
      // In production, store this in database with user association
      res.json({
        success: true,
        api_key: apiKey,
        name,
        scopes,
        expires_in: expires_in ? `${expires_in} hours` : 'never',
        created_at: new Date().toISOString(),
        warning: 'Store this API key securely. It will not be shown again.'
      });
    } catch (error) {
      console.error('API key generation error:', error);
      res.status(500).json({
        success: false,
        error: 'API key generation failed',
        message: error.message
      });
    }
  }
);

// Validate token endpoint
router.post('/validate',
  authRateLimit,
  [
    body('token')
      .notEmpty()
      .withMessage('Token is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { token } = req.body;
      
      const result = await authService.verifyToken(token);
      
      res.json({
        success: true,
        valid: result.valid,
        user: result.valid ? result.user : null,
        roles: result.valid ? result.roles : null,
        error: result.valid ? null : result.error
      });
    } catch (error) {
      console.error('Token validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Token validation failed',
        message: error.message
      });
    }
  }
);

export default router;