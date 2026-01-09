#!/bin/bash
# Telegram Bot Handoff Script
# Use this to transfer bot control between MacBooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"

show_help() {
    echo "Telegram Bot Handoff Script"
    echo ""
    echo "Usage: ./scripts/handoff.sh [command]"
    echo ""
    echo "Commands:"
    echo "  stop      Stop all bots on THIS machine (before transferring away)"
    echo "  start     Start all bots on THIS machine (after receiving transfer)"
    echo "  status    Show current bot status"
    echo "  help      Show this help message"
    echo ""
    echo "Workflow:"
    echo "  1. On OLD machine: ./scripts/handoff.sh stop"
    echo "  2. On NEW machine: ./scripts/handoff.sh start"
    echo ""
}

stop_bots() {
    echo "🛑 Stopping Telegram bots on this machine..."
    cd "$BOT_DIR"

    if pm2 list 2>/dev/null | grep -q "gwen\|matt"; then
        pm2 stop all
        pm2 save
        echo "✅ Bots stopped and state saved"
        echo ""
        echo "📋 Next steps:"
        echo "   1. Go to the OTHER MacBook"
        echo "   2. Run: cd ~/Developer/claude-code-telegram-bot"
        echo "   3. Run: ./scripts/handoff.sh start"
    else
        echo "⚠️  No bots currently running"
    fi
}

start_bots() {
    echo "🚀 Starting Telegram bots on this machine..."
    cd "$BOT_DIR"

    # Check if configs exist
    if [[ ! -f "configs/gwen.json" ]] || [[ ! -f "configs/matt.json" ]]; then
        echo "❌ Config files not found!"
        echo "   Expected: configs/gwen.json and configs/matt.json"
        echo ""
        echo "   Copy configs from the other MacBook or create them."
        exit 1
    fi

    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo "❌ PM2 not installed. Run: npm install -g pm2"
        exit 1
    fi

    # Start the bots
    pm2 start ecosystem.config.js
    pm2 save

    echo ""
    echo "✅ Bots started!"
    pm2 status

    echo ""
    echo "📋 To enable auto-start on reboot:"
    echo "   pm2 startup"
    echo "   pm2 save"
}

show_status() {
    echo "📊 Telegram Bot Status"
    echo ""

    if command -v pm2 &> /dev/null; then
        pm2 status
    else
        echo "PM2 not installed"
    fi

    echo ""
    echo "Config files:"
    ls -la "$BOT_DIR/configs/"*.json 2>/dev/null || echo "  No config files found"
}

case "${1:-help}" in
    stop)
        stop_bots
        ;;
    start)
        start_bots
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
