import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { nanoid } from 'nanoid';

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secure-secret-change-this';
    this.jwtExpiry = process.env.JWT_EXPIRY || '1h';
    this.refreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.appName = 'Dailey Media API';
    
    // In-memory stores (replace with Redis in production)
    this.refreshTokens = new Map();
    this.invalidatedTokens = new Set();
    this.loginAttempts = new Map();
    this.mfaSecrets = new Map();
  }

  // Generate secure JWT tokens
  generateTokens(user, sessionId = null) {
    const payload = {
      userId: user.id,
      email: user.email,
      roles: user.roles || [],
      sessionId: sessionId || nanoid(),
      iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiry,
      issuer: this.appName,
      audience: 'dailey-media-api'
    });

    const refreshPayload = {
      userId: user.id,
      sessionId: payload.sessionId,
      type: 'refresh'
    };

    const refreshToken = jwt.sign(refreshPayload, this.jwtSecret, {
      expiresIn: this.refreshExpiry,
      issuer: this.appName,
      audience: 'dailey-media-api'
    });

    // Store refresh token
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      sessionId: payload.sessionId,
      createdAt: new Date(),
      lastUsed: new Date()
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.jwtExpiry,
      tokenType: 'Bearer'
    };
  }

  // Verify JWT token
  async verifyToken(token) {
    try {
      // Check if token is invalidated
      if (this.invalidatedTokens.has(token)) {
        throw new Error('Token has been invalidated');
      }

      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.appName,
        audience: 'dailey-media-api'
      });

      return {
        valid: true,
        user: {
          id: decoded.userId,
          email: decoded.email
        },
        roles: decoded.roles,
        sessionId: decoded.sessionId
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      const tokenData = this.refreshTokens.get(refreshToken);
      if (!tokenData || tokenData.userId !== decoded.userId) {
        throw new Error('Refresh token not found or invalid');
      }

      // Update last used time
      tokenData.lastUsed = new Date();

      // Generate new access token
      const user = { id: decoded.userId, roles: [] }; // Get from database in real implementation
      const tokens = this.generateTokens(user, decoded.sessionId);

      return {
        success: true,
        ...tokens
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Invalidate token (logout)
  async invalidateToken(token, refreshToken = null) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      // Add to invalidated tokens
      this.invalidatedTokens.add(token);
      
      // Remove refresh token if provided
      if (refreshToken) {
        this.refreshTokens.delete(refreshToken);
      }

      // Clean up old invalidated tokens periodically
      this.cleanupInvalidatedTokens();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Password hashing
  async hashPassword(password) {
    return bcrypt.hash(password, this.bcryptRounds);
  }

  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  // MFA (TOTP) Setup
  generateMFASecret(userId, userEmail) {
    const secret = speakeasy.generateSecret({
      name: `${this.appName} (${userEmail})`,
      issuer: this.appName,
      length: 32
    });

    // Store temporarily (move to database in production)
    this.mfaSecrets.set(userId, {
      secret: secret.base32,
      tempSecret: true,
      qrCode: secret.otpauth_url
    });

    return {
      secret: secret.base32,
      qrCodeUrl: secret.otpauth_url,
      manualEntryKey: secret.base32
    };
  }

  // Generate QR Code for MFA setup
  async generateMFAQRCode(userId, userEmail) {
    const mfaData = this.generateMFASecret(userId, userEmail);
    
    try {
      const qrCodeDataUrl = await qrcode.toDataURL(mfaData.qrCodeUrl);
      return {
        qrCodeDataUrl,
        secret: mfaData.secret,
        manualEntryKey: mfaData.manualEntryKey
      };
    } catch (error) {
      throw new Error('Failed to generate QR code');
    }
  }

  // Verify MFA TOTP token
  verifyMFAToken(userId, token) {
    const userData = this.mfaSecrets.get(userId);
    if (!userData) {
      return { valid: false, error: 'MFA not set up for user' };
    }

    const verified = speakeasy.totp.verify({
      secret: userData.secret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps for clock skew
    });

    return { valid: verified };
  }

  // Enable MFA for user
  enableMFA(userId, verificationToken) {
    const verification = this.verifyMFAToken(userId, verificationToken);
    if (!verification.valid) {
      return { success: false, error: 'Invalid verification token' };
    }

    const userData = this.mfaSecrets.get(userId);
    if (userData) {
      userData.tempSecret = false;
      userData.enabled = true;
      this.mfaSecrets.set(userId, userData);
    }

    return { success: true, message: 'MFA enabled successfully' };
  }

  // Disable MFA for user
  disableMFA(userId, verificationToken) {
    const verification = this.verifyMFAToken(userId, verificationToken);
    if (!verification.valid) {
      return { success: false, error: 'Invalid verification token' };
    }

    this.mfaSecrets.delete(userId);
    return { success: true, message: 'MFA disabled successfully' };
  }

  // Account lockout management
  recordLoginAttempt(identifier, success = false) {
    const now = Date.now();
    const maxAttempts = 5;
    const lockoutDuration = 15 * 60 * 1000; // 15 minutes

    let attempts = this.loginAttempts.get(identifier) || {
      count: 0,
      lastAttempt: now,
      lockedUntil: null
    };

    if (success) {
      // Reset on successful login
      this.loginAttempts.delete(identifier);
      return { locked: false };
    }

    // Check if currently locked
    if (attempts.lockedUntil && now < attempts.lockedUntil) {
      return { 
        locked: true, 
        lockedUntil: attempts.lockedUntil,
        remainingTime: attempts.lockedUntil - now
      };
    }

    // Reset if lockout period has passed
    if (attempts.lockedUntil && now >= attempts.lockedUntil) {
      attempts = { count: 0, lastAttempt: now, lockedUntil: null };
    }

    // Increment failed attempts
    attempts.count++;
    attempts.lastAttempt = now;

    // Lock account if max attempts reached
    if (attempts.count >= maxAttempts) {
      attempts.lockedUntil = now + lockoutDuration;
      attempts.count = 0; // Reset count for next lockout period
    }

    this.loginAttempts.set(identifier, attempts);

    return {
      locked: attempts.lockedUntil ? now < attempts.lockedUntil : false,
      lockedUntil: attempts.lockedUntil,
      attemptsRemaining: Math.max(0, maxAttempts - attempts.count)
    };
  }

  // Check if account is locked
  isAccountLocked(identifier) {
    const attempts = this.loginAttempts.get(identifier);
    if (!attempts || !attempts.lockedUntil) {
      return { locked: false };
    }

    const now = Date.now();
    if (now >= attempts.lockedUntil) {
      // Lockout expired
      this.loginAttempts.delete(identifier);
      return { locked: false };
    }

    return {
      locked: true,
      lockedUntil: attempts.lockedUntil,
      remainingTime: attempts.lockedUntil - now
    };
  }

  // Generate secure API key
  generateApiKey() {
    return `dmapi_${nanoid(32)}`;
  }

  // Validate password strength
  validatePasswordStrength(password) {
    const minLength = 8;
    const maxLength = 128;
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[@$!%*?&]/.test(password);

    const issues = [];
    
    if (password.length < minLength) {
      issues.push(`Password must be at least ${minLength} characters long`);
    }
    
    if (password.length > maxLength) {
      issues.push(`Password must be no more than ${maxLength} characters long`);
    }
    
    if (!hasLowercase) {
      issues.push('Password must contain at least one lowercase letter');
    }
    
    if (!hasUppercase) {
      issues.push('Password must contain at least one uppercase letter');
    }
    
    if (!hasNumbers) {
      issues.push('Password must contain at least one number');
    }
    
    if (!hasSpecialChar) {
      issues.push('Password must contain at least one special character (@$!%*?&)');
    }

    return {
      valid: issues.length === 0,
      issues,
      strength: this.calculatePasswordStrength(password)
    };
  }

  calculatePasswordStrength(password) {
    let score = 0;
    
    // Length bonus
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    
    // Character variety bonus
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[@$!%*?&]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9@$!%*?&]/.test(password)) score += 1;
    
    // Deductions for common patterns
    if (/(.)\1{2,}/.test(password)) score -= 1; // Repeated characters
    if (/123|abc|qwe/i.test(password)) score -= 1; // Sequential patterns
    
    if (score <= 2) return 'weak';
    if (score <= 4) return 'medium';
    if (score <= 6) return 'strong';
    return 'very-strong';
  }

  // Cleanup expired tokens and attempts
  cleanupInvalidatedTokens() {
    // Clean up invalidated tokens older than their expiry
    // This is a simplified version - in production, use proper cleanup based on token expiry
    if (this.invalidatedTokens.size > 1000) {
      this.invalidatedTokens.clear();
    }
  }

  // Security headers for JWT cookies (if using cookies)
  getSecureCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/'
    };
  }
}

export default new AuthService();