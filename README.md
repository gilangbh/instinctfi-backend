# Instinct.fi API

Backend API for Instinct.fi - A gamified consumer trading app built on Solana that transforms market speculation into a social, collaborative experience.

## 🚀 Features

### Phase 1 (MVP) - 2-3 months
- ✅ Community trading runs with real USDC
- ✅ Simple Buy/Sell/Skip voting system
- ✅ XP and basic badges system
- ✅ DEX integration (Drift Protocol)
- ✅ Real-time WebSocket updates
- ✅ Chat with automated moderation
- ✅ Anti-cheating mechanisms
- ✅ Rate limiting and security

### Core Features
- **Community Trading Cycles**: Users vote on trade directions every 10 minutes
- **Chaos-as-a-Feature**: Randomized leverage (1x-20x) and position sizes (10%-100%)
- **Gamified Progression**: XP system with badges and leaderboards
- **Real-time Updates**: WebSocket for live voting, chat, and price feeds
- **Social Features**: Chat, moderation, and community interaction
- **Security**: Anti-cheating, rate limiting, and user verification

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │    │   API Server    │    │   Database      │
│   (Frontend)    │◄──►│   (Node.js)     │◄──►│   (PostgreSQL)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   WebSocket     │
                       │   (Real-time)   │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  Drift Protocol │
                       │   (Trading)     │
                       └─────────────────┘
```

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: WebSocket (ws)
- **Trading**: Drift Protocol integration
- **Security**: JWT, bcrypt, rate limiting
- **Caching**: Redis
- **Logging**: Winston
- **Validation**: Joi
- **Testing**: Jest

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- npm or yarn

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd instinct-fi-api
npm install
```

### 2. Environment Setup

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/instinct_fi"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"

# Solana
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
SOLANA_PRIVATE_KEY="your-solana-private-key"

# Drift Protocol
DRIFT_RPC_URL="https://drift-api.example.com"
DRIFT_API_KEY="your-drift-api-key"

# App Configuration
NODE_ENV="development"
PORT=3001
CORS_ORIGIN="http://localhost:3000"
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## 📚 API Documentation

### Base URL
```
http://localhost:3001/api/v1
```

### Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Core Endpoints

#### Users
- `POST /users` - Create user
- `GET /users/:id` - Get user by ID
- `GET /users/wallet/:walletAddress` - Get user by wallet
- `PUT /users/:id` - Update user
- `GET /users/:id/stats` - Get user statistics
- `GET /users/leaderboard` - Get leaderboard

#### Runs
- `GET /runs/active` - Get active runs
- `GET /runs/history` - Get run history
- `POST /runs` - Create run
- `GET /runs/:id` - Get run details
- `POST /runs/:id/join` - Join run
- `DELETE /runs/:id/leave` - Leave run
- `POST /runs/:id/vote` - Cast vote

#### WebSocket
- `ws://localhost:3001/ws` - WebSocket connection

### Example API Calls

#### Create User
```bash
curl -X POST http://localhost:3001/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "7xKz...9kL2",
    "username": "CryptoNinja",
    "email": "user@example.com"
  }'
```

#### Join Run
```bash
curl -X POST http://localhost:3001/api/v1/runs/run-id/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "depositAmount": 50
  }'
```

#### Cast Vote
```bash
curl -X POST http://localhost:3001/api/v1/runs/run-id/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "round": 1,
    "choice": "LONG"
  }'
```

## 🔌 WebSocket Events

### Client to Server
```javascript
// Authenticate
{
  "type": "AUTHENTICATE",
  "data": { "userId": "user-id" }
}

// Subscribe to run updates
{
  "type": "SUBSCRIBE_RUN",
  "data": { "runId": "run-id" }
}

// Ping
{
  "type": "PING",
  "data": {}
}
```

### Server to Client
```javascript
// Run update
{
  "type": "RUN_UPDATE",
  "data": {
    "runId": "run-id",
    "status": "ACTIVE",
    "currentRound": 3,
    "countdown": 300
  }
}

// Vote update
{
  "type": "VOTE_UPDATE",
  "data": {
    "runId": "run-id",
    "round": 3,
    "voteDistribution": { "long": 5, "short": 3, "skip": 2 },
    "timeRemaining": 300
  }
}

// Price update
{
  "type": "PRICE_UPDATE",
  "data": {
    "symbol": "SOL",
    "price": 150.25,
    "change24h": 2.5
  }
}
```

## 🗄️ Database Schema

### Core Tables
- `users` - User accounts and profiles
- `runs` - Trading runs and sessions
- `run_participants` - Users participating in runs
- `votes` - User votes for each round
- `trades` - Executed trades
- `voting_rounds` - Voting round details
- `chat_messages` - Chat messages
- `badges` - Available badges
- `user_badges` - User badge awards
- `xp_history` - XP transaction history

## 🔒 Security Features

- **JWT Authentication**: Secure user sessions
- **Rate Limiting**: Prevent abuse and spam
- **Input Validation**: Joi schema validation
- **Anti-cheating**: Behavioral analysis and pattern detection
- **CORS Protection**: Configured origins
- **Helmet Security**: Security headers
- **SQL Injection Protection**: Prisma ORM

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3001/api/v1/health
```

### Logs
Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- Console output in development

### Metrics
- WebSocket connections
- API request rates
- Database query performance
- Trading execution success rates

## 🚀 Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Variables
Set production environment variables:
- `NODE_ENV=production`
- `DATABASE_URL` - Production database
- `JWT_SECRET` - Strong secret key
- `CORS_ORIGIN` - Production frontend URL

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- Documentation: [API Docs](./docs/)
- Issues: [GitHub Issues](./issues)
- Discord: [Instinct.fi Community](./discord)

## 🗺️ Roadmap

### Phase 2: Enhanced Engagement (3-4 months)
- [ ] Behavioral insights and analytics
- [ ] Advanced badge system
- [ ] User reputation system
- [ ] Improved anti-cheating measures

### Phase 3: Platform Scaling (6+ months)
- [ ] User-hosted runs
- [ ] Platform native token
- [ ] Governance experiments
- [ ] Premium subscription tier
- [ ] Multi-token trading

---

Built with ❤️ by the Instinct.fi team

