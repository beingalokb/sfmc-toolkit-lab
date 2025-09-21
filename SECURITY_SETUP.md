# 🔐 Security Setup Guide for SFMC Toolkit Labs

## ⚠️ IMPORTANT: Credential Security

**NEVER commit real credentials to version control!** This repository is designed for open-source distribution and follows Salesforce security best practices.

## 🛠️ Local Development Setup

### Step 1: Environment Configuration

1. **Copy the environment template:**
   ```bash
   cp server/.env.example server/.env.local
   ```

2. **Create a Connected App in Marketing Cloud:**
   - Go to Marketing Cloud Setup → Apps → Installed Packages
   - Create New Package → Add Component → API Integration
   - Integration Type: Web App
   - Required Permissions:
     - Email: Read, Write, Send
     - Web: Read, Write  
     - Data Extensions: Read, Write
     - Tracking: Read
     - Journeys: Read, Write
     - List And Subscribers: Read, Write
     - File Locations: Read, Write
     - Saved Content: Read, Write

3. **Update `.env.local` with your credentials:**
   ```bash
   CLIENT_ID=your_actual_client_id
   CLIENT_SECRET=your_actual_client_secret
   AUTH_DOMAIN=your_mc_subdomain.auth.marketingcloudapis.com
   REDIRECT_URI=http://localhost:3001/auth/callback
   BASE_URL=http://localhost:3001
   PORT=3001
   ```

### Step 2: Start the Application

```bash
# Install dependencies
npm install
cd server && npm install

# Start the application
cd sfmc-toolkit-client && npm start
```

## 🚀 Production Deployment

### 🏢 **Architecture: Single-Tenant Per Deployment**

**Important**: This application is designed for **single-tenant deployment** - each company/organization should deploy their own instance with their own Marketing Cloud credentials.

**Why Single-Tenant?**
- Each company has different Marketing Cloud credentials
- Security isolation between organizations  
- Custom configurations per organization
- Compliance with data privacy requirements

### **Deployment Options:**

#### **Option 1: Company Self-Deployment (Recommended)**
Each company deploys their own instance:

### Render.com (Recommended)
1. Connect your GitHub repository
2. Set environment variables in Render dashboard:
   - `CLIENT_ID` → Your Connected App Client ID
   - `CLIENT_SECRET` → Your Connected App Client Secret  
   - `AUTH_DOMAIN` → Your MC subdomain auth domain
   - `REDIRECT_URI` → Your production callback URL (e.g., `https://company-app.onrender.com/auth/callback`)
   - `BASE_URL` → Your production domain (e.g., `https://company-app.onrender.com`)

### Heroku
```bash
# Each company sets their own credentials:
heroku config:set CLIENT_ID=your_company_client_id
heroku config:set CLIENT_SECRET=your_company_client_secret
heroku config:set AUTH_DOMAIN=your_company_auth_domain
heroku config:set REDIRECT_URI=https://your-company-app.herokuapp.com/auth/callback
heroku config:set BASE_URL=https://your-company-app.herokuapp.com
```

#### **Option 2: Service Provider Model**
If you're providing this as a service to multiple companies:
- Deploy separate instances for each client company
- Use infrastructure-as-code (Terraform, etc.) to automate deployments
- Each deployment gets its own domain and environment variables

### Other Platforms
Use your platform's environment variable injection system. **Never hardcode credentials in source code.**

## 🔒 Security Best Practices

✅ **DO:**
- Use environment variables for all credentials
- Use `.env.local` for local development (never committed)
- Use secure credential injection for production
- Regularly rotate Connected App credentials
- Monitor Connected App usage in Marketing Cloud

❌ **DON'T:**
- Commit `.env` files with real credentials
- Hardcode credentials in source code
- Share credentials in chat/email
- Use production credentials for development
- Leave default/placeholder credentials in production

## 🛡️ Salesforce Security Review Requirements

This setup follows Salesforce security review requirements:
- No hardcoded credentials in source code ✅
- Environment-based configuration ✅
- Secure authentication flow ✅
- Minimal required permissions ✅
- Session-based credential storage ✅

## 🔧 Troubleshooting

### "Missing environment variables" error:
1. Ensure `.env.local` exists and has real values
2. Restart the server after updating environment variables
3. Check that AUTH_DOMAIN matches your MC subdomain

### Authentication fails:
1. Verify Connected App permissions
2. Check REDIRECT_URI matches exactly in Connected App and environment
3. Ensure Marketing Cloud user has proper permissions

### Need help?
- Check Marketing Cloud Setup → Apps → Installed Packages
- Verify your subdomain in the AUTH_DOMAIN
- Ensure all required permissions are granted to the Connected App
