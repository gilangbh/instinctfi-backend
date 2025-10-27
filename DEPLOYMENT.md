# Instinct.fi API Deployment Guide

This guide covers deploying the Instinct.fi API to production environments.

## 🚀 Quick Deployment Options

### 1. Railway (Recommended)
Railway provides easy deployment with automatic scaling and database management.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template-id)

### 2. Heroku
Deploy to Heroku with one-click setup.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/your-repo/instinct-fi-api)

### 3. DigitalOcean App Platform
Deploy to DigitalOcean with managed infrastructure.

### 4. AWS/GCP/Azure
Deploy to cloud providers with container orchestration.

## 📋 Pre-deployment Checklist

### Environment Setup
- [ ] PostgreSQL database configured
- [ ] Redis instance running
- [ ] Environment variables set
- [ ] SSL certificate configured
- [ ] Domain name configured
- [ ] Monitoring setup

### Security
- [ ] JWT secret is strong and unique
- [ ] CORS origins configured
- [ ] Rate limiting enabled
- [ ] Input validation enabled
- [ ] SQL injection protection
- [ ] XSS protection

### Performance
- [ ] Database indexes optimized
- [ ] Redis caching configured
- [ ] CDN setup (if needed)
- [ ] Load balancing configured
- [ ] Auto-scaling enabled

## 🔧 Environment Variables

### Required Variables
```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/instinct_fi"

# Redis
REDIS_URL="redis://host:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"

# Solana
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
SOLANA_PRIVATE_KEY="your-solana-private-key"

# Drift Protocol
DRIFT_RPC_URL="https://drift-api.example.com"
DRIFT_API_KEY="your-drift-api-key"

# App Configuration
NODE_ENV="production"
PORT=3001
CORS_ORIGIN="https://your-frontend-domain.com"
```

### Optional Variables
```env
# Logging
LOG_LEVEL="info"
LOG_FILE="logs/app.log"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Trading Configuration
MIN_DEPOSIT_USDC=10
MAX_DEPOSIT_USDC=100
MAX_PARTICIPANTS_PER_RUN=100
PLATFORM_FEE_PERCENTAGE=15
```

## 🐳 Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY dist ./dist
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1

# Start application
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/instinct_fi
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-jwt-secret
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=instinct_fi
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Build and Deploy
```bash
# Build image
docker build -t instinct-fi-api .

# Run with docker-compose
docker-compose up -d

# Run migrations
docker-compose exec api npm run db:migrate
```

## ☁️ Cloud Deployment

### Railway
1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically

### Heroku
```bash
# Install Heroku CLI
npm install -g heroku

# Login to Heroku
heroku login

# Create app
heroku create instinct-fi-api

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:hobby-dev

# Add Redis addon
heroku addons:create heroku-redis:hobby-dev

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-jwt-secret

# Deploy
git push heroku main

# Run migrations
heroku run npm run db:migrate
```

### DigitalOcean App Platform
1. Create new app from GitHub
2. Configure build settings
3. Set environment variables
4. Deploy

### AWS ECS
1. Create ECS cluster
2. Create task definition
3. Create service
4. Configure load balancer

## 🔍 Monitoring and Logging

### Health Checks
```bash
# Basic health check
curl https://your-api-domain.com/api/v1/health

# Detailed health check
curl https://your-api-domain.com/api/v1/health/detailed
```

### Logging
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Access logs: Available via platform

### Metrics
- Response times
- Error rates
- Database performance
- WebSocket connections
- Trading execution rates

### Alerts
Set up alerts for:
- High error rates
- Slow response times
- Database connection issues
- Memory/CPU usage
- Disk space

## 🔒 Security Considerations

### SSL/TLS
- Use HTTPS in production
- Configure proper SSL certificates
- Enable HSTS headers

### Database Security
- Use connection pooling
- Enable SSL connections
- Regular backups
- Access control

### API Security
- Rate limiting
- Input validation
- CORS configuration
- JWT token expiration
- Secure headers

### Infrastructure Security
- Firewall configuration
- VPC setup
- Security groups
- Regular updates

## 📊 Performance Optimization

### Database
- Index optimization
- Query optimization
- Connection pooling
- Read replicas

### Caching
- Redis for session storage
- API response caching
- Database query caching

### CDN
- Static asset delivery
- API response caching
- Global distribution

### Load Balancing
- Multiple instances
- Health checks
- Session affinity
- Auto-scaling

## 🚨 Troubleshooting

### Common Issues

#### Database Connection
```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool
npm run db:studio
```

#### Redis Connection
```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping
```

#### WebSocket Issues
- Check firewall settings
- Verify WebSocket support
- Check connection limits

#### Performance Issues
- Monitor database queries
- Check memory usage
- Analyze response times
- Review error logs

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm start
```

### Log Analysis
```bash
# View recent errors
tail -f logs/error.log

# Search for specific errors
grep "ERROR" logs/combined.log

# Monitor real-time logs
tail -f logs/combined.log | grep "WARN\|ERROR"
```

## 🔄 Updates and Maintenance

### Rolling Updates
1. Deploy new version
2. Run database migrations
3. Update environment variables
4. Restart services
5. Verify health checks

### Database Migrations
```bash
# Run migrations
npm run db:migrate

# Rollback if needed
npm run db:migrate:rollback
```

### Backup Strategy
- Daily database backups
- Configuration backups
- Log rotation
- Disaster recovery plan

## 📞 Support

### Monitoring Tools
- Application Performance Monitoring (APM)
- Log aggregation
- Error tracking
- Uptime monitoring

### Emergency Procedures
1. Check health endpoints
2. Review error logs
3. Restart services if needed
4. Contact support team
5. Document incident

---

For additional support, check the main README.md or contact the development team.

