-- SFMC Toolkit Multi-Tenant Database Schema
-- Supports both Labs (free) and Pro (paid) versions

-- Companies/Organizations Table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'labs', -- 'labs', 'pro', 'enterprise'
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Marketing Cloud OAuth Configurations (per company)
CREATE TABLE mc_oauth_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subdomain VARCHAR(100) NOT NULL, -- MC subdomain (e.g., 'mc123456789')
    client_id VARCHAR(255) NOT NULL, -- From MC Installed Package
    client_secret_encrypted TEXT NOT NULL, -- AES encrypted client secret
    redirect_uri VARCHAR(500) NOT NULL DEFAULT 'https://yourapp.com/auth/callback',
    scope TEXT, -- OAuth scopes granted
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one active config per company
    UNIQUE(company_id, is_active) WHERE is_active = true
);

-- OAuth Tokens (per company session)
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    mc_config_id UUID NOT NULL REFERENCES mc_oauth_configs(id) ON DELETE CASCADE,
    access_token_encrypted TEXT NOT NULL, -- AES encrypted access token
    refresh_token_encrypted TEXT, -- AES encrypted refresh token
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP NOT NULL,
    scope TEXT,
    last_refreshed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Only one active token set per company
    UNIQUE(company_id)
);

-- User Sessions (for web app)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Usage Tracking (for rate limiting and billing)
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    response_status INTEGER,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_companies_email ON companies(email);
CREATE INDEX idx_companies_plan ON companies(plan);
CREATE INDEX idx_mc_oauth_configs_company_id ON mc_oauth_configs(company_id);
CREATE INDEX idx_mc_oauth_configs_subdomain ON mc_oauth_configs(subdomain);
CREATE INDEX idx_oauth_tokens_company_id ON oauth_tokens(company_id);
CREATE INDEX idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);
CREATE INDEX idx_user_sessions_company_id ON user_sessions(company_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_api_usage_company_id_created_at ON api_usage(company_id, created_at);

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mc_oauth_configs_updated_at BEFORE UPDATE ON mc_oauth_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
