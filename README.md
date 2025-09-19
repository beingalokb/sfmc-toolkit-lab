# SFMC Toolkit - Labs Edition

![SFMC Toolkit Labs](https://img.shields.io/badge/SFMC-Toolkit%20Labs-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

A lightweight, open-source toolkit for Salesforce Marketing Cloud, created for the Salesforce Labs community.

## ✨ Features

### 🔍 **Search Assets**
- Search across Data Extensions, Automations, Journeys, Queries, and more
- Advanced filtering and sorting capabilities
- Export search results to CSV
- Real-time search with intelligent categorization

### 📧 **Email Archiving**
- Archive and search sent emails
- Query email send events and subscriber interactions
- Track email performance metrics
- Export archival data for compliance

### 🚀 **Distributed Marketing (Basic)**
- Quick Send functionality for targeted campaigns
- Journey and Data Extension management
- Basic automation workflows
- Campaign status tracking

### ⚙️ **Settings & Configuration**
- Secure SFMC API authentication
- Environment configuration management
- User preference settings
- Integration management

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 8.0.0
- Salesforce Marketing Cloud account with API access
- SFMC Connected App credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/sfmc-toolkit-lab.git
   cd sfmc-toolkit-lab
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your SFMC credentials
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Build for production**
   ```bash
   npm run build
   ```

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
# SFMC API Configuration
SFMC_CLIENT_ID=your_client_id
SFMC_CLIENT_SECRET=your_client_secret
SFMC_SUBDOMAIN=your_subdomain
SFMC_AUTH_BASE_URI=https://your_subdomain.auth.marketingcloudapis.com/

# Application Configuration
REACT_APP_BASE_URL=http://localhost:3001
NODE_ENV=development
PORT=3001
```

### SFMC Connected App Setup
1. Create a Connected App in SFMC Setup
2. Enable the following scopes:
   - Email: Read, Write, Send
   - Data Extensions: Read, Write
   - Automations: Read, Write
   - Journeys: Read
   - List and Subscribers: Read

## 📚 Documentation

### API Endpoints
- `GET /api/search/assets` - Search SFMC assets
- `POST /api/email/archive` - Archive email data
- `GET /api/distributed-marketing/status` - Get campaign status
- `POST /api/settings/update` - Update configuration

### Key Components
- **Search Engine**: Fast, indexed search across all SFMC objects
- **Email Archiver**: Automated email data collection and storage
- **DM Wizard**: Simplified distributed marketing workflows
- **Settings Manager**: Secure credential and preference management

## 🤝 Contributing

We welcome contributions from the Salesforce community! This is an open-source project maintained by Salesforce Labs.

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Guidelines
- Follow ESLint configuration
- Write comprehensive tests
- Update documentation for new features
- Ensure cross-browser compatibility

## 🔒 Security

- All SFMC credentials are encrypted at rest
- API tokens are refreshed automatically
- No sensitive data is logged
- Secure session management

## 📊 Performance

- Optimized for large SFMC instances (1M+ records)
- Efficient pagination and lazy loading
- Minimal API calls through intelligent caching
- Sub-second search response times

## 🌟 What's Different from Full MC Explorer?

This Labs edition focuses on core functionality:

| Feature | Labs Edition | Full Version |
|---------|-------------|--------------|
| Search Assets | ✅ Full | ✅ Full |
| Email Archiving | ✅ Full | ✅ Full |
| Distributed Marketing | ✅ Basic | ✅ Advanced |
| Schema Builder/Object Explorer | ❌ | ✅ |
| Preference Center | ❌ | ✅ |
| Email Auditing | ❌ | ✅ |
| Advanced Analytics | ❌ | ✅ |

## 🆘 Support

- **Documentation**: [Wiki](https://github.com/yourusername/sfmc-toolkit-lab/wiki)
- **Issues**: [GitHub Issues](https://github.com/yourusername/sfmc-toolkit-lab/issues)
- **Community**: [Salesforce Trailblazer Community](https://trailhead.salesforce.com/trailblazer-community)
- **Contact**: [Salesforce Labs](mailto:labs@salesforce.com)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Roadmap

- [ ] Enhanced search filters
- [ ] Mobile-responsive design
- [ ] Additional export formats
- [ ] Integration with Salesforce CRM
- [ ] Advanced email analytics
- [ ] Community-requested features

## 🙏 Acknowledgments

- Salesforce Marketing Cloud team
- Open source contributors
- Salesforce Trailblazer Community
- Node.js and React communities

---

**Built with ❤️ by the Salesforce Labs team**

*This is an official Salesforce Labs project. For enterprise features and support, consider upgrading to the full MC Explorer platform.*
