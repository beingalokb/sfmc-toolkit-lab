const oauthService = require('../services/oauth');
const db = require('../services/database');

/**
 * Middleware to ensure user is authenticated with valid tokens
 */
async function requireAuth(req, res, next) {
  try {
    const companyId = req.session.companyId;

    if (!companyId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        redirect: '/setup'
      });
    }

    // Get valid access token (refresh if needed)
    const tokenInfo = await oauthService.getValidAccessToken(companyId);
    
    // Add token info to request for API calls
    req.auth = {
      companyId: companyId,
      accessToken: tokenInfo.accessToken,
      subdomain: tokenInfo.subdomain,
      expiresAt: tokenInfo.expiresAt
    };

    // Update session last accessed
    await db.updateSessionLastAccessed(req.sessionID);

    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    
    // Clear invalid session
    req.session.destroy();
    
    res.status(401).json({ 
      error: error.message || 'Authentication failed',
      redirect: '/setup',
      requiresReauth: true
    });
  }
}

/**
 * Middleware to check if user has specific plan access
 */
function requirePlan(allowedPlans) {
  return async (req, res, next) => {
    try {
      const companyId = req.session.companyId;

      if (!companyId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const company = await db.getCompanyById(companyId);
      
      if (!company || !allowedPlans.includes(company.plan)) {
        return res.status(403).json({ 
          error: 'Plan upgrade required',
          currentPlan: company?.plan,
          requiredPlans: allowedPlans,
          upgradeUrl: '/upgrade'
        });
      }

      req.company = company;
      next();

    } catch (error) {
      console.error('Plan check error:', error);
      res.status(500).json({ error: 'Failed to verify plan access' });
    }
  };
}

/**
 * Middleware to log API usage for billing/analytics
 */
function logApiUsage(req, res, next) {
  const startTime = Date.now();
  
  // Override res.end to capture response
  const originalEnd = res.end;
  res.end = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Log usage asynchronously
    if (req.auth?.companyId) {
      setImmediate(async () => {
        try {
          await db.logApiUsage({
            companyId: req.auth.companyId,
            endpoint: req.route?.path || req.path,
            method: req.method,
            responseStatus: res.statusCode,
            responseTimeMs: responseTime
          });
        } catch (error) {
          console.error('API usage logging error:', error);
        }
      });
    }
    
    originalEnd.call(this, data);
  };
  
  next();
}

/**
 * Middleware to rate limit based on plan
 */
function rateLimitByPlan(req, res, next) {
  // Rate limiting logic based on company plan
  // Implementation depends on your rate limiting strategy
  // This is a placeholder for the concept
  
  const plan = req.company?.plan || 'labs';
  const limits = {
    labs: { requests: 100, window: 60 * 60 * 1000 }, // 100/hour
    pro: { requests: 1000, window: 60 * 60 * 1000 }, // 1000/hour
    enterprise: { requests: 10000, window: 60 * 60 * 1000 } // 10000/hour
  };
  
  // Rate limiting implementation would go here
  // For now, just pass through
  next();
}

/**
 * Optional middleware to ensure HTTPS in production
 */
function requireHTTPS(req, res, next) {
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }
  next();
}

/**
 * Middleware to add security headers
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
}

module.exports = {
  requireAuth,
  requirePlan,
  logApiUsage,
  rateLimitByPlan,
  requireHTTPS,
  securityHeaders
};
