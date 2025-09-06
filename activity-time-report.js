#!/usr/bin/env node

/**
 * ActivityWatch Time Report Generator with Integration
 * Combines Claude bot sessions with ActivityWatch category data
 * Usage: node activity-time-report.js [days] [category]
 */

const axios = require('axios');
const fs = require('fs');
const os = require('os');
const config = require('./config.json');

const ACTIVITY_WATCH_URL = 'http://localhost:5600/api/0';
const BOT_BUCKET_ID = 'claude-bot-sessions';
const hostname = os.hostname();
const WINDOW_BUCKET_ID = `aw-watcher-window_${hostname}`;

/**
 * Get bot sessions from ActivityWatch
 */
async function getBotSessions(days, project) {
    try {
        const response = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${BOT_BUCKET_ID}/events?limit=1000`);
        const events = response.data;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const filteredEvents = events.filter(event => {
            const eventDate = new Date(event.timestamp);
            const matchesProject = !project || event.data.project === project;
            return matchesProject && eventDate >= cutoffDate;
        });

        return filteredEvents.map(event => ({
            timestamp: event.timestamp,
            duration: event.duration,
            originalDuration: event.data.original_duration || event.duration,
            project: event.data.project,
            sessionId: event.data.session_id,
            type: 'bot_session',
            multiplier: event.data.time_multiplier || 1
        }));
    } catch (error) {
        console.warn(`Warning: Could not fetch bot sessions: ${error.message}`);
        return [];
    }
}

/**
 * Get work category events from ActivityWatch window watcher
 */
async function getWorkEvents(days, category) {
    try {
        const response = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${WINDOW_BUCKET_ID}/events?limit=10000`);
        const events = response.data;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const filteredEvents = events.filter(event => {
            const eventDate = new Date(event.timestamp);
            if (eventDate < cutoffDate) return false;

            const app = (event.data.app || '').toLowerCase();
            const title = (event.data.title || '').toLowerCase();

            // Match work based on configuration patterns
            const workIndicators = config.activityWatch.searchPatterns.workIndicators;
            const isWork = 
                // Direct category match
                app === category.toLowerCase() || title.includes(category.toLowerCase()) ||
                // Specific development apps
                app === 'jetbrains-phpstorm' ||
                app === 'cursor' ||
                // Browser work with configured indicators
                (app.includes('browser') && (
                    workIndicators.some(indicator => title.includes(indicator.toLowerCase())) ||
                    title.includes('claude') ||
                    title.includes('activitywatch')
                )) ||
                // Development-related patterns from config
                workIndicators.some(indicator => title.includes(indicator.toLowerCase())) ||
                app.includes('code') ||
                app.includes('terminal') ||
                app.includes('dev');
            
            return isWork;
        });

        return filteredEvents.map(event => ({
            timestamp: event.timestamp,
            duration: event.duration,
            originalDuration: event.duration,
            project: event.data.title || event.data.app,
            app: event.data.app,
            type: 'activity_watch',
            multiplier: 1
        }));
    } catch (error) {
        console.warn(`Warning: Could not fetch ActivityWatch events: ${error.message}`);
        return [];
    }
}

/**
 * Generate comprehensive time report
 */
async function generateActivityReport(days = 7, category = config.activityWatch.workCategories[0], project = null) {
    try {
        console.log(`\n📊 Activity Time Report (last ${days} days)`);
        console.log(`Category: ${category}${project ? `, Project: ${project}` : ''}\n`);

        // Fetch data from both sources
        const [botSessions, activityWatchEvents] = await Promise.all([
            getBotSessions(days, project),
            getWorkEvents(days, category)
        ]);

        if (botSessions.length === 0 && activityWatchEvents.length === 0) {
            console.log(`❌ No data found for the last ${days} days`);
            console.log('\n🔧 Troubleshooting:');
            console.log('• Check if ActivityWatch is running: curl http://localhost:5600/api/0/info');
            console.log(`• Check category name: ${category}`);
            console.log(`• Check if window watcher bucket exists: ${WINDOW_BUCKET_ID}`);
            return;
        }

        // Combine and sort all events
        const allEvents = [...botSessions, ...activityWatchEvents].sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        // Group by date and type
        const dailyStats = {};
        let totalBotTime = 0;
        let totalActivityTime = 0;
        let totalBotSessions = 0;
        let totalActivitySessions = 0;

        allEvents.forEach(event => {
            const date = event.timestamp.split('T')[0];
            
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    botSessions: 0,
                    botTime: 0,
                    activitySessions: 0,
                    activityTime: 0,
                    totalTime: 0
                };
            }

            if (event.type === 'bot_session') {
                dailyStats[date].botSessions++;
                dailyStats[date].botTime += event.originalDuration;
                totalBotTime += event.originalDuration;
                totalBotSessions++;
            } else {
                dailyStats[date].activitySessions++;
                dailyStats[date].activityTime += event.duration;
                totalActivityTime += event.duration;
                totalActivitySessions++;
            }
            
            dailyStats[date].totalTime = dailyStats[date].botTime + dailyStats[date].activityTime;
        });

        // Display daily breakdown
        console.log('📅 Daily Breakdown:');
        console.log('=' .repeat(80));
        console.log('Date       | Bot Sessions | Bot Time | AW Events | AW Time  | Total Time');
        console.log('-' .repeat(80));

        Object.keys(dailyStats).sort().forEach(date => {
            const stats = dailyStats[date];
            const botHours = (stats.botTime / 3600).toFixed(2);
            const awHours = (stats.activityTime / 3600).toFixed(2);
            const totalHours = (stats.totalTime / 3600).toFixed(2);
            
            console.log(`${date} | ${stats.botSessions.toString().padStart(12)} | ${botHours.padStart(8)}h | ${stats.activitySessions.toString().padStart(9)} | ${awHours.padStart(7)}h | ${totalHours.padStart(9)}h`);
        });

        // Display summary
        const totalTime = totalBotTime + totalActivityTime;
        console.log('\n' + '=' .repeat(80));
        console.log('📈 SUMMARY:');
        console.log(`Bot Sessions: ${totalBotSessions} (${(totalBotTime / 3600).toFixed(2)} hours)`);
        console.log(`ActivityWatch Events: ${totalActivitySessions} (${(totalActivityTime / 3600).toFixed(2)} hours)`);
        console.log(`Total Time: ${(totalTime / 3600).toFixed(2)} hours`);
        console.log(`Average per day: ${(totalTime / 3600 / days).toFixed(2)} hours/day`);

        // Create detailed CSV export
        const csvData = [
            'Date,Type,Sessions/Events,Hours,Details'
        ];

        Object.keys(dailyStats).sort().forEach(date => {
            const stats = dailyStats[date];
            if (stats.botSessions > 0) {
                csvData.push(`${date},Bot Sessions,${stats.botSessions},${(stats.botTime / 3600).toFixed(2)},Claude AI Assistant`);
            }
            if (stats.activitySessions > 0) {
                csvData.push(`${date},ActivityWatch,${stats.activitySessions},${(stats.activityTime / 3600).toFixed(2)},${category} Category`);
            }
            csvData.push(`${date},Daily Total,${stats.botSessions + stats.activitySessions},${(stats.totalTime / 3600).toFixed(2)},Combined Time`);
        });

        // Add summary rows
        csvData.push('');
        csvData.push('SUMMARY,,,');
        csvData.push(`Total Bot Time,,${totalBotSessions},${(totalBotTime / 3600).toFixed(2)}`);
        csvData.push(`Total AW Time,,${totalActivitySessions},${(totalActivityTime / 3600).toFixed(2)}`);
        csvData.push(`GRAND TOTAL,,${totalBotSessions + totalActivitySessions},${(totalTime / 3600).toFixed(2)}`);

        const csvFilename = `${config.activityWatch.reportSettings.csvFilename}-${new Date().toISOString().split('T')[0]}.csv`;
        fs.writeFileSync(csvFilename, csvData.join('\n'));
        
        console.log(`\n💾 Detailed CSV report saved as: ${csvFilename}`);
        console.log('\n💡 Report includes:');
        console.log('• Claude bot AI assistant sessions');
        console.log(`• ActivityWatch ${category} category events`);
        console.log('• Daily breakdown and totals');
        console.log('• Export ready for client billing');

        // Show recent activity sample
        if (allEvents.length > 0) {
            console.log('\n📋 Recent Activity Sample:');
            const recentEvents = allEvents.slice(-5);
            recentEvents.forEach(event => {
                const time = new Date(event.timestamp).toLocaleString();
                const duration = (event.duration / 60).toFixed(1);
                const type = event.type === 'bot_session' ? '🤖 Bot' : '💻 AW';
                console.log(`${type} ${time} | ${duration}min | ${event.project || event.app}`);
            });
        }

    } catch (error) {
        console.error('❌ Error generating activity report:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('• Check ActivityWatch service: pm2 logs | systemctl status activitywatch');
        console.log(`• Verify buckets exist: curl ${ACTIVITY_WATCH_URL}/buckets`);
        console.log('• Check network connectivity to ActivityWatch API');
    }
}

// Parse command line arguments
const days = parseInt(process.argv[2]) || 7;
const category = process.argv[3] || config.activityWatch.workCategories[0];
const project = process.argv[4] || null;

console.log('🚀 Starting Activity Time Report Generator...');
generateActivityReport(days, category, project);