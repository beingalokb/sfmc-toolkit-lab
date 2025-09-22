# 🧪 SFMC Toolkit - Labs Edition

A secure, multi-tenant Salesforce Marketing Cloud toolkit with OAuth 2.0 authentication. Built for developers and marketers who need essential SFMC tools with enterprise-grade security.

## ⚡ Quick Start

> **🔐 NEW OAUTH SETUP:** This version uses secure OAuth 2.0 flow. No manual credential entry required!

```bash
# 1. Clone and setup
git clone https://github.com/beingalokb/sfmc-toolkit-lab.git
cd sfmc-toolkit-lab

# 2. Configure environment (REQUIRED)
cp server/.env.example server/.env
# Edit .env with your app secrets and database URL

# 3. Setup database
# PostgreSQL (recommended): Create database and run server/database/schema.sql
# SQLite (development): Will be created automatically

# 4. Install dependencies
npm install
cd server && npm install
cd ../sfmc-toolkit-client && npm install

# 5. Start the application
cd ../server && npm start
# In another terminal: cd sfmc-toolkit-client && npm start
```

## 🛠️ Features

### ✅ **Core Features:**
- **🔍 Search Assets** - Find emails, data extensions, journeys, and more
- **📧 Distributed Marketing** - Quick setup for journey-based campaigns  
- **🗃️ Email Archiving** - Archive and analyze email send data
- **⚙️ Settings** - Configure SFTP and other integrations

### 🔒 **Security Features:**
- **OAuth 2.0 Authentication** - Secure, industry-standard login flow
- **Multi-Tenant Architecture** - Isolated data per organization
- **Encrypted Credential Storage** - Client secrets encrypted at rest
- **Session-Based Security** - No tokens exposed to frontend
- **AppExchange Ready** - Meets Salesforce security requirements

## 🔐 Security & Compliance

**This project follows Salesforce security best practices:**
- ✅ OAuth 2.0 Authorization Code flow (Web App integration)
- ✅ No customer credentials in environment variables
- ✅ AES encryption for sensitive data
- ✅ Session-based authentication
- ✅ Multi-tenant data isolation
- ✅ Ready for Salesforce AppExchange security review

**📖 Read [OAUTH_IMPLEMENTATION_STATUS.md](./OAUTH_IMPLEMENTATION_STATUS.md) for architecture details.**

## 🚀 Deployment

### Production-Ready Platforms:
- **Render.com** (Recommended - free tier available)
- **Heroku** 
- **Vercel**
- **Any Node.js hosting platform**

See [SECURITY_SETUP.md](./SECURITY_SETUP.md) for deployment instructions.

## 🤝 Contributing

This is the open-source Labs edition. Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Follow security best practices (no credentials in commits!)
4. Submit a pull request

## 📄 License

Open source under MIT License.

## 🆘 Support

- **Security Setup**: [SECURITY_SETUP.md](./SECURITY_SETUP.md)
- **Issues**: [GitHub Issues](https://github.com/beingalokb/sfmc-toolkit-lab/issues)
- **Premium Version**: Contact for MC Explorer full version with additional features

---

**⚠️ Important**: Always follow [SECURITY_SETUP.md](./SECURITY_SETUP.md) for proper credential configuration. Never commit real credentials to version control!