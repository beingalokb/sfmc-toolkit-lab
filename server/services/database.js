const { Pool } = require('pg');
const encryption = require('../utils/encryption');

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  // Company Management
  async createCompany({ name, email, plan = 'labs' }) {
    const query = `
      INSERT INTO companies (name, email, plan)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await this.pool.query(query, [name, email, plan]);
    return result.rows[0];
  }

  async getCompanyByEmail(email) {
    const query = 'SELECT * FROM companies WHERE email = $1 AND status = $2';
    const result = await this.pool.query(query, [email, 'active']);
    return result.rows[0];
  }

  async getCompanyById(companyId) {
    const query = 'SELECT * FROM companies WHERE id = $1 AND status = $2';
    const result = await this.pool.query(query, [companyId, 'active']);
    return result.rows[0];
  }

  // OAuth Configuration Management
  async createOAuthConfig({ companyId, subdomain, clientId, clientSecret, redirectUri, scope }) {
    // Encrypt the client secret
    const encryptedSecret = encryption.encrypt(clientSecret);
    
    const query = `
      INSERT INTO mc_oauth_configs (company_id, subdomain, client_id, client_secret_encrypted, redirect_uri, scope)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, company_id, subdomain, client_id, redirect_uri, scope, is_active, created_at
    `;
    
    const result = await this.pool.query(query, [
      companyId, subdomain, clientId, encryptedSecret, redirectUri, scope
    ]);
    
    return result.rows[0];
  }

  async getOAuthConfig(companyId) {
    const query = `
      SELECT id, company_id, subdomain, client_id, client_secret_encrypted, redirect_uri, scope, is_active
      FROM mc_oauth_configs 
      WHERE company_id = $1 AND is_active = true
    `;
    
    const result = await this.pool.query(query, [companyId]);
    
    if (result.rows[0]) {
      const config = result.rows[0];
      // Decrypt client secret when needed
      config.client_secret = encryption.decrypt(config.client_secret_encrypted);
      delete config.client_secret_encrypted;
      return config;
    }
    
    return null;
  }

  async getOAuthConfigBySubdomain(subdomain) {
    const query = `
      SELECT oc.*, c.plan, c.status as company_status
      FROM mc_oauth_configs oc
      JOIN companies c ON oc.company_id = c.id
      WHERE oc.subdomain = $1 AND oc.is_active = true AND c.status = 'active'
    `;
    
    const result = await this.pool.query(query, [subdomain]);
    
    if (result.rows[0]) {
      const config = result.rows[0];
      config.client_secret = encryption.decrypt(config.client_secret_encrypted);
      delete config.client_secret_encrypted;
      return config;
    }
    
    return null;
  }

  // Token Management
  async storeTokens({ companyId, mcConfigId, accessToken, refreshToken, expiresIn, scope }) {
    const encryptedAccessToken = encryption.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? encryption.encrypt(refreshToken) : null;
    const expiresAt = new Date(Date.now() + (expiresIn * 1000));

    // Upsert (insert or update) tokens
    const query = `
      INSERT INTO oauth_tokens (company_id, mc_config_id, access_token_encrypted, refresh_token_encrypted, expires_at, scope)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (company_id) DO UPDATE SET
        mc_config_id = EXCLUDED.mc_config_id,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        expires_at = EXCLUDED.expires_at,
        scope = EXCLUDED.scope,
        last_refreshed_at = CURRENT_TIMESTAMP
      RETURNING id, company_id, expires_at, scope
    `;

    const result = await this.pool.query(query, [
      companyId, mcConfigId, encryptedAccessToken, encryptedRefreshToken, expiresAt, scope
    ]);

    return result.rows[0];
  }

  async getTokens(companyId) {
    const query = `
      SELECT ot.*, oc.subdomain, oc.client_id, oc.client_secret_encrypted, oc.redirect_uri
      FROM oauth_tokens ot
      JOIN mc_oauth_configs oc ON ot.mc_config_id = oc.id
      WHERE ot.company_id = $1 AND oc.is_active = true
    `;

    const result = await this.pool.query(query, [companyId]);

    if (result.rows[0]) {
      const tokens = result.rows[0];
      
      // Decrypt tokens
      tokens.access_token = encryption.decrypt(tokens.access_token_encrypted);
      tokens.refresh_token = tokens.refresh_token_encrypted ? 
        encryption.decrypt(tokens.refresh_token_encrypted) : null;
      tokens.client_secret = encryption.decrypt(tokens.client_secret_encrypted);
      
      // Clean up encrypted fields
      delete tokens.access_token_encrypted;
      delete tokens.refresh_token_encrypted;
      delete tokens.client_secret_encrypted;
      
      return tokens;
    }

    return null;
  }

  async deleteTokens(companyId) {
    const query = 'DELETE FROM oauth_tokens WHERE company_id = $1';
    await this.pool.query(query, [companyId]);
  }

  // Session Management
  async createSession({ companyId, sessionId, userEmail, ipAddress, userAgent, expiresAt }) {
    const query = `
      INSERT INTO user_sessions (company_id, session_id, user_email, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      companyId, sessionId, userEmail, ipAddress, userAgent, expiresAt
    ]);

    return result.rows[0];
  }

  async getSessionBySessionId(sessionId) {
    const query = `
      SELECT us.*, c.name as company_name, c.plan, c.status as company_status
      FROM user_sessions us
      JOIN companies c ON us.company_id = c.id
      WHERE us.session_id = $1 AND us.expires_at > CURRENT_TIMESTAMP AND c.status = 'active'
    `;

    const result = await this.pool.query(query, [sessionId]);
    return result.rows[0];
  }

  async updateSessionLastAccessed(sessionId) {
    const query = `
      UPDATE user_sessions 
      SET last_accessed_at = CURRENT_TIMESTAMP 
      WHERE session_id = $1
    `;
    
    await this.pool.query(query, [sessionId]);
  }

  async deleteSession(sessionId) {
    const query = 'DELETE FROM user_sessions WHERE session_id = $1';
    await this.pool.query(query, [sessionId]);
  }

  async cleanupExpiredSessions() {
    const query = 'DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP';
    await this.pool.query(query);
  }

  // API Usage Tracking
  async logApiUsage({ companyId, endpoint, method, responseStatus, responseTimeMs }) {
    const query = `
      INSERT INTO api_usage (company_id, endpoint, method, response_status, response_time_ms)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await this.pool.query(query, [companyId, endpoint, method, responseStatus, responseTimeMs]);
  }

  async getApiUsageStats(companyId, fromDate, toDate) {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        AVG(response_time_ms) as avg_response_time,
        COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count
      FROM api_usage
      WHERE company_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const result = await this.pool.query(query, [companyId, fromDate, toDate]);
    return result.rows;
  }

  // Health check
  async healthCheck() {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  // Cleanup method
  async close() {
    await this.pool.end();
  }
}

module.exports = new DatabaseService();
