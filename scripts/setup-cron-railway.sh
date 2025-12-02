#!/bin/bash

# Railway Cron Setup Script
# This script sets up the environment variables for the automated run creation cron job

echo "🚂 Railway Cron Job Setup Script"
echo "=================================="
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed"
    echo "Install it with: npm i -g @railway/cli"
    echo "Or: brew install railway"
    exit 1
fi

echo "✅ Railway CLI found"
echo ""

# Ask user for configuration
echo "📋 Configure Automated Run Creation"
echo ""

read -p "Enable automated run creation? (true/false) [true]: " enable_cron
enable_cron=${enable_cron:-true}

if [ "$enable_cron" = "true" ]; then
    echo ""
    echo "📅 Cron Schedule Examples:"
    echo "  1) Every 2 hours (0 */2 * * *)"
    echo "  2) Every 3 hours (0 */3 * * *)"
    echo "  3) Every 6 hours (0 */6 * * *)"
    echo "  4) Daily at 9 AM (0 9 * * *)"
    echo "  5) 9 AM and 5 PM on weekdays (0 9,17 * * 1-5)"
    echo "  6) Every 5 minutes - TESTING ONLY (*/5 * * * *)"
    echo "  7) Custom"
    echo ""
    read -p "Choose schedule (1-7) [1]: " schedule_choice
    schedule_choice=${schedule_choice:-1}

    case $schedule_choice in
        1) cron_schedule="0 */2 * * *";;
        2) cron_schedule="0 */3 * * *";;
        3) cron_schedule="0 */6 * * *";;
        4) cron_schedule="0 9 * * *";;
        5) cron_schedule="0 9,17 * * 1-5";;
        6) cron_schedule="*/5 * * * *";;
        7) read -p "Enter custom cron schedule: " cron_schedule;;
        *) cron_schedule="0 */2 * * *";;
    esac

    echo ""
    echo "💰 Run Configuration"
    read -p "Min deposit in dollars [5]: " min_deposit_dollars
    min_deposit_dollars=${min_deposit_dollars:-5}
    min_deposit_cents=$((min_deposit_dollars * 100))

    read -p "Max deposit in dollars [100]: " max_deposit_dollars
    max_deposit_dollars=${max_deposit_dollars:-100}
    max_deposit_cents=$((max_deposit_dollars * 100))

    read -p "Max participants [100]: " max_participants
    max_participants=${max_participants:-100}

    read -p "Lobby duration in minutes [10]: " lobby_duration
    lobby_duration=${lobby_duration:-10}

    read -p "Run duration in minutes [120]: " run_duration
    run_duration=${run_duration:-120}

    read -p "Voting interval in minutes [5]: " voting_interval
    voting_interval=${voting_interval:-5}

    # Calculate total rounds based on duration and interval
    total_rounds=$((run_duration / voting_interval))
    echo "Calculated total rounds: $total_rounds (${run_duration} min ÷ ${voting_interval} min)"

    echo ""
    echo "📝 Configuration Summary:"
    echo "========================"
    echo "Enable Cron: $enable_cron"
    echo "Schedule: $cron_schedule"
    echo "Min Deposit: \$$min_deposit_dollars ($min_deposit_cents cents)"
    echo "Max Deposit: \$$max_deposit_dollars ($max_deposit_cents cents)"
    echo "Max Participants: $max_participants"
    echo "Lobby Duration: $lobby_duration minutes"
    echo "Run Duration: $run_duration minutes ($(echo "scale=1; $run_duration/60" | bc) hours)"
    echo "Voting Interval: $voting_interval minutes"
    echo "Total Rounds: $total_rounds"
    echo ""
    echo "ℹ️  Single Run Policy: Only 1 run allowed at a time"
    echo "ℹ️  Admin tokens are auto-managed (no manual setup needed)"
    echo ""

    read -p "Apply these settings to Railway? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        echo "❌ Cancelled"
        exit 0
    fi

    echo ""
    echo "🚀 Applying settings to Railway..."
    echo ""

    railway variables set ENABLE_RUN_CREATION_CRON="$enable_cron"
    railway variables set RUN_CREATION_CRON_SCHEDULE="$cron_schedule"
    railway variables set AUTO_RUN_MIN_DEPOSIT="$min_deposit_cents"
    railway variables set AUTO_RUN_MAX_DEPOSIT="$max_deposit_cents"
    railway variables set AUTO_RUN_MAX_PARTICIPANTS="$max_participants"
    railway variables set AUTO_RUN_LOBBY_DURATION="$lobby_duration"
    railway variables set AUTO_RUN_DURATION_MINUTES="$run_duration"
    railway variables set AUTO_RUN_VOTING_INTERVAL="$voting_interval"
    railway variables set AUTO_RUN_TOTAL_ROUNDS="$total_rounds"

    echo ""
    echo "✅ Settings applied successfully!"
    echo ""
    echo "📌 Next steps:"
    echo "1. Verify the variables in Railway dashboard"
    echo "2. Deploy your backend (or wait for auto-deploy)"
    echo "3. Check logs to confirm cron is running:"
    echo "   railway logs"
    echo "4. Look for: '🔄 Starting run creation cron service'"
    echo ""
else
    echo ""
    echo "🚀 Disabling automated run creation..."
    railway variables set ENABLE_RUN_CREATION_CRON="false"
    echo ""
    echo "✅ Automated run creation disabled"
fi

echo ""
echo "🎉 Done!"

