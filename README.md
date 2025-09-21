# 🧪 SFMC Toolkit - Labs Edition

A streamlined, open-source version of the MC Explorer focused on essential Salesforce Marketing Cloud tools for developers and marketers.

## ⚡ Quick Start

> **🔐 SECURITY FIRST:** Before running, please read [SECURITY_SETUP.md](./SECURITY_SETUP.md) for proper credential configuration.

```bash
# 1. Clone and setup
git clone https://github.com/beingalokb/sfmc-toolkit-lab.git
cd sfmc-toolkit-lab

# 2. Configure credentials (REQUIRED)
cp server/.env.example server/.env.local
# Edit .env.local with your Marketing Cloud Connected App credentials

# 3. Install dependencies
npm install
cd server && npm install

# 4. Start the application
cd ../sfmc-toolkit-client && npm start
```

## 🛠️ Features

### ✅ **Core Features:**
- **🔍 Search Assets** - Find emails, data extensions, journeys, and more
- **📧 Distributed Marketing** - Quick setup for journey-based campaigns  
- **🗃️ Email Archiving** - Archive and analyze email send data
- **⚙️ Settings** - Configure SFTP and other integrations

## 🔐 Security & Compliance

**This project follows Salesforce security best practices:**
- ✅ No hardcoded credentials in source code
- ✅ Environment-based configuration
- ✅ Secure OAuth authentication flow
- ✅ Session-based credential storage
- ✅ Ready for Salesforce security review

**📖 Read [SECURITY_SETUP.md](./SECURITY_SETUP.md) for complete setup instructions.**

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