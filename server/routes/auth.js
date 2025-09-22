const express = require('express');
const router = express.Router();
const oauthService = require('../services/oauth');
const db = require('../services/database');

/**
 * Start OAuth flow for a specific MC subdomain
 * GET /auth/start/:subdomain
 */
router.get('/start/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    const sessionId = req.sessionID;

    if (!subdomain) {
      return res.status(400).json({ 
        error: 'Subdomain is required' 
      });
    }

    const { authUrl } = await oauthService.startOAuthFlow(subdomain, sessionId);

    res.json({ 
      authUrl,
      message: 'Redirect user to this URL to start OAuth flow'
    });

  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to start OAuth flow'
    });
  }
});

/**
 * Handle OAuth callback from Marketing Cloud
 * GET /auth/callback?code=xxx&state=xxx
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    const sessionId = req.sessionID;

    // Check for OAuth errors
    if (oauthError) {
      return res.redirect(`/setup?error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return res.redirect('/setup?error=Missing authorization code or state');
    }

    // Handle callback and get tokens
    const result = await oauthService.handleOAuthCallback(code, state, sessionId);

    // Store company info in session
    req.session.companyId = result.company.id;
    req.session.companyName = result.company.name;
    req.session.plan = result.company.plan;

    // Create user session record
    await db.createSession({
      companyId: result.company.id,
      sessionId: sessionId,
      userEmail: result.company.email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)) // 24 hours
    });

    // Redirect to dashboard
    res.redirect('/dashboard?auth=success');

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`/setup?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * Check authentication status
 * GET /auth/status
 */
router.get('/status', async (req, res) => {
  try {
    const companyId = req.session.companyId;

    if (!companyId) {
      return res.json({ authenticated: false });
    }

    // Check if tokens exist and are valid
    const tokens = await db.getTokens(companyId);
    
    if (!tokens) {
      return res.json({ authenticated: false, reason: 'No tokens found' });
    }

    const expiresAt = new Date(tokens.expires_at).getTime();
    const now = Date.now();

    if (now >= expiresAt) {
      return res.json({ authenticated: false, reason: 'Token expired' });
    }

    // Get company info
    const company = await db.getCompanyById(companyId);

    res.json({
      authenticated: true,
      company: {
        id: company.id,
        name: company.name,
        plan: company.plan,
        status: company.status
      },
      tokenExpiresAt: expiresAt,
      subdomain: tokens.subdomain
    });

  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ 
      authenticated: false, 
      error: 'Failed to check authentication status' 
    });
  }
});

/**
 * Refresh access token
 * POST /auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const companyId = req.session.companyId;

    if (!companyId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await oauthService.refreshTokens(companyId);

    res.json({
      success: true,
      expiresAt: result.expiresAt,
      scope: result.scope
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    
    // Clear session if refresh fails
    req.session.destroy();
    
    res.status(401).json({ 
      error: error.message || 'Token refresh failed',
      requiresReauth: true
    });
  }
});

/**
 * Logout user
 * POST /auth/logout
 */
router.post('/logout', async (req, res) => {
  try {
    const companyId = req.session.companyId;
    const sessionId = req.sessionID;

    if (companyId) {
      // Revoke tokens
      await oauthService.logout(companyId);
      
      // Delete session record
      await db.deleteSession(sessionId);
    }

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Logout error:', error);
    
    // Always destroy session even if logout fails
    req.session.destroy();
    
    res.json({ success: true }); // Don't expose internal errors
  }
});

/**
 * Admin endpoint to register new OAuth configuration
 * POST /auth/admin/register-config
 */
router.post('/admin/register-config', async (req, res) => {
  try {
    const { 
      companyName, 
      companyEmail, 
      subdomain, 
      clientId, 
      clientSecret, 
      plan = 'labs' 
    } = req.body;

    // Validate required fields
    if (!companyName || !companyEmail || !subdomain || !clientId || !clientSecret) {
      return res.status(400).json({ 
        error: 'Missing required fields: companyName, companyEmail, subdomain, clientId, clientSecret' 
      });
    }

    // Create or get company
    let company = await db.getCompanyByEmail(companyEmail);
    if (!company) {
      company = await db.createCompany({
        name: companyName,
        email: companyEmail,
        plan: plan
      });
    }

    // Create OAuth configuration
    const config = await db.createOAuthConfig({
      companyId: company.id,
      subdomain: subdomain,
      clientId: clientId,
      clientSecret: clientSecret,
      redirectUri: process.env.DEFAULT_REDIRECT_URI || `${process.env.BASE_URL}/auth/callback`,
      scope: process.env.DEFAULT_SCOPE
    });

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        plan: company.plan
      },
      config: {
        id: config.id,
        subdomain: config.subdomain,
        redirectUri: config.redirect_uri
      },
      oauthUrl: `/auth/start/${subdomain}`
    });

  } catch (error) {
    console.error('Register config error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to register OAuth configuration' 
    });
  }
});

module.exports = router;
