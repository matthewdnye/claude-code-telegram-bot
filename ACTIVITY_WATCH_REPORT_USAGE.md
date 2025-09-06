# ActivityWatch Time Report Utilities

## Quick Start

**For weekly reports (most common):**
```bash
node activity-time-report.js 7
```

**For custom period:**
```bash
node activity-time-report.js [days] [category] [project]
```

## Available Utilities

### 1. `activity-time-report.js` - Main Report Generator

**Purpose:** Generate comprehensive time reports combining:
- Claude AI bot sessions
- ActivityWatch WORK work events (PhpStorm, Cursor, browser with WORK indicators)

**Examples:**
```bash
# Last 7 days (default)
node activity-time-report.js

# Last 14 days
node activity-time-report.js 14

# Last 30 days with specific category
node activity-time-report.js 30 WORK

# Specific project only
node activity-time-report.js 7 WORK client-project
```

**Output:** 
- Console report with daily breakdown
- CSV file: `activity-time-report-YYYY-MM-DD.csv`

### 2. `activity-watch-explorer.js` - Data Explorer

**Purpose:** Understand what applications and activities ActivityWatch is tracking

**Example:**
```bash
# Explore last 24 hours
node activity-watch-explorer.js 24
```

**Use when:** You need to understand how your work is being categorized

### 3. `time-report.js` - Bot Sessions Only

**Purpose:** Report only Claude bot sessions (original utility)

**Example:**
```bash
node time-report.js 7 client-project
```

## What Gets Tracked as WORK

The report automatically includes:

**Development Apps:**
- jetbrains-phpstorm (PhpStorm)
- cursor (Cursor editor)
- Code editors and terminals

**Browser Activities:**
- Pages with "group client-project" in title
- Pages with "client-project" in title
- Claude AI sessions
- ActivityWatch interface

**Bot Sessions:**
- All Claude AI assistant interactions through Telegram bot

## Report Output

**Console format:**
```
📊 WORK Time Report (last 7 days)
📅 Daily Breakdown:
Date       | Bot Sessions | Bot Time | AW Events | AW Time  | Total Time
2025-08-27 |           13 |     0.76h |       261 |    1.21h |      1.97h

📈 SUMMARY:
Total Time: 24.84 hours
Average per day: 3.55 hours/day
```

**CSV format:** Ready for client billing with detailed breakdown

## Troubleshooting

**No data found:**
- Check ActivityWatch is running: `curl http://localhost:5600/api/0/info`
- Verify time range (try shorter period)
- Use explorer to see what's being tracked

**Missing activities:**
- Use `activity-watch-explorer.js` to see all tracked apps
- Update filtering patterns in `activity-time-report.js` if needed

## Quick Commands

```bash
# Most common: weekly report
node activity-time-report.js 7

# Monthly report for client billing  
node activity-time-report.js 30

# Understand current tracking
node activity-watch-explorer.js 48
```