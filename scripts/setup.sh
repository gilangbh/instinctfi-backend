#!/bin/bash

# Instinct.fi API Setup Script
# This script sets up the development environment for the Instinct.fi API

set -e

echo "🚀 Setting up Instinct.fi API..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL 14+ first."
    exit 1
fi

echo "✅ PostgreSQL is installed"

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "❌ Redis is not installed. Please install Redis 6+ first."
    exit 1
fi

echo "✅ Redis is installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp env.example .env
    echo "⚠️  Please edit .env file with your configuration"
else
    echo "✅ .env file already exists"
fi

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

# Check if database exists
echo "🗄️  Setting up database..."
DB_NAME="instinct_fi"
DB_EXISTS=$(psql -lqt | cut -d \| -f 1 | grep -w $DB_NAME | wc -l)

if [ $DB_EXISTS -eq 0 ]; then
    echo "📊 Creating database..."
    createdb $DB_NAME
    echo "✅ Database created: $DB_NAME"
else
    echo "✅ Database already exists: $DB_NAME"
fi

# Run database migrations
echo "🔄 Running database migrations..."
npm run db:migrate

# Seed database (optional)
read -p "🌱 Do you want to seed the database with sample data? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    npm run db:seed
    echo "✅ Database seeded"
fi

# Create systemd service file (optional)
read -p "🔧 Do you want to create a systemd service file? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔧 Creating systemd service file..."
    sudo tee /etc/systemd/system/instinct-fi-api.service > /dev/null <<EOF
[Unit]
Description=Instinct.fi API Server
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    echo "✅ Systemd service file created"
    echo "💡 To enable the service: sudo systemctl enable instinct-fi-api"
    echo "💡 To start the service: sudo systemctl start instinct-fi-api"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Start Redis: redis-server"
echo "3. Start the API: npm run dev"
echo "4. Visit: http://localhost:3001/api/v1/health"
echo ""
echo "📚 Documentation:"
echo "- API Docs: http://localhost:3001/api/v1"
echo "- Database: npm run db:studio"
echo "- Logs: tail -f logs/combined.log"
echo ""
echo "🆘 Need help? Check the README.md file"

