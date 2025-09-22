const request = require('supertest');
const crypto = require('crypto');

// Mock the actual server for testing
const createTestApp = () => {
  const express = require('express');
  const session = require('express-session');
  const app = express();
  
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // false for testing
  }));
  
  // Mock OAuth routes for testing
  app.post('/api/auth/start', (req, res) => {
    const { subdomain } = req.body;
    if (!subdomain) {
      return res.status(400).json({ error: 'Subdomain required' });
    }
    
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;
    
    const authUrl = `https://${subdomain}.auth.marketingcloudapis.com/v2/authorize?state=${state}`;
    res.json({ authUrl });
  });
  
  app.post('/api/auth/callback', (req, res) => {
    const { code, state } = req.body;
    
    if (!state || state !== req.session.oauthState) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }
    
    // Mock successful token exchange
    req.session.authenticated = true;
    req.session.oauthState = null; // Clear state after use
    
    res.json({ success: true });
  });
  
  app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
  });
  
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
  });
  
  return app;
};

describe('OAuth Security Tests', () => {
  let app;
  let agent;
  
  beforeEach(() => {
    app = createTestApp();
    agent = request.agent(app); // Maintains session across requests
  });
  
  describe('OAuth Flow Security', () => {
    test('should require subdomain for auth start', async () => {
      const response = await agent
        .post('/api/auth/start')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Subdomain required');
    });
    
    test('should generate secure state parameter', async () => {
      const response = await agent
        .post('/api/auth/start')
        .send({ subdomain: 'test123' });
      
      expect(response.status).toBe(200);
      expect(response.body.authUrl).toContain('state=');
      
      // Extract state from URL
      const stateMatch = response.body.authUrl.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      
      const state = stateMatch[1];
      expect(state).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(/^[a-f0-9]+$/i.test(state)).toBe(true); // Valid hex
    });
    
    test('should reject callback without state parameter', async () => {
      const response = await agent
        .post('/api/auth/callback')
        .send({ code: 'test-code' });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid state parameter');
    });
    
    test('should reject callback with invalid state parameter', async () => {
      // Start auth to set valid state
      await agent
        .post('/api/auth/start')
        .send({ subdomain: 'test123' });
      
      // Try callback with different state
      const response = await agent
        .post('/api/auth/callback')
        .send({ 
          code: 'test-code',
          state: 'invalid-state-parameter'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid state parameter');
    });
    
    test('should accept callback with valid state parameter', async () => {
      // Start auth to get valid state
      const startResponse = await agent
        .post('/api/auth/start')
        .send({ subdomain: 'test123' });
      
      const stateMatch = startResponse.body.authUrl.match(/state=([^&]+)/);
      const state = stateMatch[1];
      
      // Complete callback with valid state
      const response = await agent
        .post('/api/auth/callback')
        .send({ 
          code: 'test-code',
          state: state
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    test('should prevent state reuse (replay attack)', async () => {
      // Start auth to get valid state
      const startResponse = await agent
        .post('/api/auth/start')
        .send({ subdomain: 'test123' });
      
      const stateMatch = startResponse.body.authUrl.match(/state=([^&]+)/);
      const state = stateMatch[1];
      
      // Complete callback with valid state
      await agent
        .post('/api/auth/callback')
        .send({ 
          code: 'test-code',
          state: state
        });
      
      // Try to reuse the same state
      const replayResponse = await agent
        .post('/api/auth/callback')
        .send({ 
          code: 'test-code-2',
          state: state
        });
      
      expect(replayResponse.status).toBe(400);
      expect(replayResponse.body.error).toBe('Invalid state parameter');
    });
  });
  
  describe('Session Security', () => {
    test('should start with unauthenticated status', async () => {
      const response = await agent.get('/api/auth/status');
      
      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(false);
    });
    
    test('should maintain authentication across requests', async () => {
      // Complete OAuth flow
      await agent.post('/api/auth/start').send({ subdomain: 'test123' });
      const startResponse = await agent.post('/api/auth/start').send({ subdomain: 'test123' });
      const stateMatch = startResponse.body.authUrl.match(/state=([^&]+)/);
      const state = stateMatch[1];
      
      await agent
        .post('/api/auth/callback')
        .send({ code: 'test-code', state: state });
      
      // Check status in separate request
      const statusResponse = await agent.get('/api/auth/status');
      expect(statusResponse.body.authenticated).toBe(true);
    });
    
    test('should clear authentication on logout', async () => {
      // Complete OAuth flow
      await agent.post('/api/auth/start').send({ subdomain: 'test123' });
      const startResponse = await agent.post('/api/auth/start').send({ subdomain: 'test123' });
      const stateMatch = startResponse.body.authUrl.match(/state=([^&]+)/);
      const state = stateMatch[1];
      
      await agent
        .post('/api/auth/callback')
        .send({ code: 'test-code', state: state });
      
      // Logout
      const logoutResponse = await agent.post('/api/auth/logout');
      expect(logoutResponse.body.success).toBe(true);
      
      // Check status after logout
      const statusResponse = await agent.get('/api/auth/status');
      expect(statusResponse.body.authenticated).toBe(false);
    });
  });
  
  describe('Input Validation', () => {
    test('should validate subdomain format', async () => {
      const invalidSubdomains = [
        '', // empty
        '   ', // whitespace
        'invalid-chars!@#', // special chars
        'a'.repeat(100), // too long
        'test..double.dot', // invalid format
      ];
      
      for (const subdomain of invalidSubdomains) {
        const response = await agent
          .post('/api/auth/start')
          .send({ subdomain });
        
        expect(response.status).toBe(400);
      }
    });
    
    test('should sanitize subdomain input', async () => {
      const response = await agent
        .post('/api/auth/start')
        .send({ subdomain: '  test123  ' }); // with whitespace
      
      expect(response.status).toBe(200);
      expect(response.body.authUrl).toContain('test123.auth.marketingcloudapis.com');
    });
  });
});

describe('Encryption Security Tests', () => {
  const crypto = require('crypto');
  
  // Mock encryption functions
  const ENCRYPTION_KEY = crypto.randomBytes(32);
  
  const encrypt = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', ENCRYPTION_KEY);
    cipher.setAAD(Buffer.from('sfmc-toolkit-lab', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  };
  
  const decrypt = (encryptedData) => {
    const decipher = crypto.createDecipher('aes-256-gcm', ENCRYPTION_KEY);
    decipher.setAAD(Buffer.from('sfmc-toolkit-lab', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  };
  
  test('should encrypt and decrypt data correctly', () => {
    const originalText = 'test-client-secret-12345';
    const encrypted = encrypt(originalText);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(originalText);
    expect(encrypted.encrypted).not.toBe(originalText);
  });
  
  test('should generate unique IV for each encryption', () => {
    const text = 'same-text';
    const encrypted1 = encrypt(text);
    const encrypted2 = encrypt(text);
    
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
  });
  
  test('should fail decryption with tampered data', () => {
    const originalText = 'test-secret';
    const encrypted = encrypt(originalText);
    
    // Tamper with encrypted data
    encrypted.encrypted = encrypted.encrypted.slice(0, -2) + '00';
    
    expect(() => decrypt(encrypted)).toThrow();
  });
  
  test('should fail decryption with wrong auth tag', () => {
    const originalText = 'test-secret';
    const encrypted = encrypt(originalText);
    
    // Tamper with auth tag
    encrypted.authTag = '0'.repeat(32);
    
    expect(() => decrypt(encrypted)).toThrow();
  });
});

describe('Rate Limiting Tests', () => {
  // Mock rate limiter for testing
  const createRateLimitedApp = () => {
    const express = require('express');
    const app = express();
    
    // Simple in-memory rate limiter for testing
    const requests = new Map();
    
    const rateLimiter = (req, res, next) => {
      const key = req.ip || 'test-ip';
      const now = Date.now();
      const windowMs = 60000; // 1 minute
      const maxRequests = 5;
      
      if (!requests.has(key)) {
        requests.set(key, []);
      }
      
      const userRequests = requests.get(key);
      const recentRequests = userRequests.filter(time => now - time < windowMs);
      
      if (recentRequests.length >= maxRequests) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      
      recentRequests.push(now);
      requests.set(key, recentRequests);
      next();
    };
    
    app.use(express.json());
    app.use('/api/auth', rateLimiter);
    
    app.post('/api/auth/start', (req, res) => {
      res.json({ success: true });
    });
    
    return app;
  };
  
  test('should allow requests under rate limit', async () => {
    const app = createRateLimitedApp();
    
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/api/auth/start')
        .send({ subdomain: 'test' });
      
      expect(response.status).toBe(200);
    }
  });
  
  test('should block requests over rate limit', async () => {
    const app = createRateLimitedApp();
    
    // Make 5 requests (should succeed)
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/start')
        .send({ subdomain: 'test' });
    }
    
    // 6th request should be blocked
    const response = await request(app)
      .post('/api/auth/start')
      .send({ subdomain: 'test' });
    
    expect(response.status).toBe(429);
    expect(response.body.error).toBe('Too many requests');
  });
});
