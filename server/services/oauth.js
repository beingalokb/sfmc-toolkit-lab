const axios = require('axios');
const crypto = require('crypto');
const db = require('./database');
const encryption = require('../utils/encryption');

class OAuthService {
  constructor() {
    this.defaultScope = process.env.DEFAULT_SCOPE || 
      'email_read email_write email_send web_read web_write data_extensions_read data_extensions_write journeys_read automations_read';
    this.defaultRedirectUri = process.env.DEFAULT_REDIRECT_URI || 
      `${process.env.BASE_URL}/auth/callback`;
  }

  /**
   * Start OAuth flow for a specific tenant
   * @param {string} subdomain - MC subdomain
   * @param {string} sessionId - User session ID
   * @returns {object} - {authUrl, state}
   */
  async startOAuthFlow(subdomain, sessionId) {
    try {
      // Get OAuth config for this subdomain
      const config = await db.getOAuthConfigBySubdomain(subdomain);
      
      if (!config) {
        throw new Error(`No OAuth configuration found for subdomain: ${subdomain}`);
      }

      if (config.company_status !== 'active') {
        throw new Error('Company account is not active');
      }

      // Generate state parameter for CSRF protection
      const state = encryption.generateSecureRandom(32);
      
      // Store state in session/cache (you might want to use Redis for this)
      await this.storeOAuthState(sessionId, state, config.company_id, subdomain);

      // Build authorization URL
      const authUrl = `https://${subdomain}.auth.marketingcloudapis.com/v2/authorize?` +
        `client_id=${encodeURIComponent(config.client_id)}&` +
        `redirect_uri=${encodeURIComponent(config.redirect_uri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(config.scope || this.defaultScope)}&` +
        `state=${state}`;

      return { authUrl, state };

    } catch (error) {
      console.error('OAuth start flow error:', error);
      throw error;
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   * @param {string} code - Authorization code from MC
   * @param {string} state - State parameter for CSRF protection
   * @param {string} sessionId - User session ID
   * @returns {object} - Company and token info
   */
  async handleOAuthCallback(code, state, sessionId) {
    try {
      // Verify state parameter
      const storedState = await this.getOAuthState(sessionId, state);
      if (!storedState) {
        throw new Error('Invalid or expired state parameter');
      }

      const { companyId, subdomain } = storedState;

      // Get OAuth config
      const config = await db.getOAuthConfig(companyId);
      if (!config) {
        throw new Error('OAuth configuration not found');
      }

      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens({
        code,
        subdomain,
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri: config.redirect_uri
      });

      // Store tokens in database
      await db.storeTokens({
        companyId,
        mcConfigId: config.id,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in,
        scope: tokenResponse.scope
      });

      // Clean up OAuth state
      await this.clearOAuthState(sessionId, state);

      // Get company info
      const company = await db.getCompanyById(companyId);

      return {
        company,
        tokens: {
          expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
          scope: tokenResponse.scope
        }
      };

    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for access/refresh tokens
   */
  async exchangeCodeForTokens({ code, subdomain, clientId, clientSecret, redirectUri }) {
    try {
      const tokenEndpoint = `https://${subdomain}.auth.marketingcloudapis.com/v2/token`;
      
      const response = await axios.post(tokenEndpoint, {
        grant_type: 'authorization_code',
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data;

    } catch (error) {
      console.error('Token exchange error:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} companyId - Company ID
   * @returns {object} - New token info
   */
  async refreshTokens(companyId) {
    try {
      const tokens = await db.getTokens(companyId);
      
      if (!tokens || !tokens.refresh_token) {
        throw new Error('No refresh token available');
      }

      const tokenEndpoint = `https://${tokens.subdomain}.auth.marketingcloudapis.com/v2/token`;
      
      const response = await axios.post(tokenEndpoint, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: tokens.client_id,
        client_secret: tokens.client_secret
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const newTokens = response.data;

      // Update tokens in database
      await db.storeTokens({
        companyId,
        mcConfigId: tokens.mc_config_id,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || tokens.refresh_token, // Some providers don't return new refresh token
        expiresIn: newTokens.expires_in,
        scope: newTokens.scope
      });

      return {
        accessToken: newTokens.access_token,
        expiresAt: Date.now() + (newTokens.expires_in * 1000),
        scope: newTokens.scope
      };

    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      
      // If refresh fails, the user needs to re-authenticate
      await db.deleteTokens(companyId);
      throw new Error('Token refresh failed - re-authentication required');
    }
  }

  /**
   * Get valid access token (refresh if needed)
   * @param {string} companyId - Company ID
   * @returns {object} - {accessToken, subdomain, expiresAt}
   */
  async getValidAccessToken(companyId) {
    try {
      const tokens = await db.getTokens(companyId);
      
      if (!tokens) {
        throw new Error('No tokens found - authentication required');
      }

      // Check if token is expired or expires soon (5 minutes buffer)
      const expiresAt = new Date(tokens.expires_at).getTime();
      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes

      if (now >= (expiresAt - bufferTime)) {
        // Token is expired or expires soon, refresh it
        const refreshResult = await this.refreshTokens(companyId);
        return {
          accessToken: refreshResult.accessToken,
          subdomain: tokens.subdomain,
          expiresAt: refreshResult.expiresAt
        };
      }

      return {
        accessToken: tokens.access_token,
        subdomain: tokens.subdomain,
        expiresAt: expiresAt
      };

    } catch (error) {
      console.error('Get valid access token error:', error);
      throw error;
    }
  }

  /**
   * Revoke tokens and logout user
   * @param {string} companyId - Company ID
   */
  async logout(companyId) {
    try {
      const tokens = await db.getTokens(companyId);
      
      if (tokens && tokens.access_token) {
        // Attempt to revoke token with MC (optional - MC doesn't always support this)
        try {
          await axios.post(`https://${tokens.subdomain}.auth.marketingcloudapis.com/v2/token/revoke`, {
            token: tokens.access_token,
            client_id: tokens.client_id,
            client_secret: tokens.client_secret
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          });
        } catch (revokeError) {
          // Ignore revoke errors - just log them
          console.warn('Token revocation failed (continuing with logout):', revokeError.message);
        }
      }

      // Delete tokens from database
      await db.deleteTokens(companyId);

    } catch (error) {
      console.error('Logout error:', error);
      // Always delete local tokens even if remote revocation fails
      await db.deleteTokens(companyId);
    }
  }

  /**
   * Store OAuth state temporarily (you might want to use Redis for this)
   */
  async storeOAuthState(sessionId, state, companyId, subdomain) {
    // For now, store in memory or session
    // In production, use Redis with TTL
    const stateData = {
      sessionId,
      companyId,
      subdomain,
      createdAt: Date.now()
    };
    
    // Store with 10 minute expiration
    // Implementation depends on your session/cache strategy
    global.oauthStates = global.oauthStates || new Map();
    global.oauthStates.set(state, stateData);
    
    // Cleanup old states
    setTimeout(() => {
      global.oauthStates.delete(state);
    }, 10 * 60 * 1000); // 10 minutes
  }

  async getOAuthState(sessionId, state) {
    const stateData = global.oauthStates?.get(state);
    
    if (!stateData || stateData.sessionId !== sessionId) {
      return null;
    }
    
    // Check if state is expired (10 minutes)
    if (Date.now() - stateData.createdAt > 10 * 60 * 1000) {
      global.oauthStates.delete(state);
      return null;
    }
    
    return stateData;
  }

  async clearOAuthState(sessionId, state) {
    global.oauthStates?.delete(state);
  }
}

module.exports = new OAuthService();
