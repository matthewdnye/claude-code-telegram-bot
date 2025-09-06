#!/usr/bin/env node

/**
 * ActivityWatch Data Explorer
 * Helps understand how to categorize work activities in ActivityWatch
 * Usage: node activity-watch-explorer.js [hours]
 */

const axios = require('axios');
const os = require('os');
const config = require('./config.json');

const ACTIVITY_WATCH_URL = 'http://localhost:5600/api/0';
const hostname = os.hostname();
const WINDOW_BUCKET_ID = `aw-watcher-window_${hostname}`;

async function exploreActivityWatch(hours = 24) {
    try {
        console.log(`\n🔍 Exploring ActivityWatch data from last ${hours} hours\n`);

        const response = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${WINDOW_BUCKET_ID}/events?limit=1000`);
        const events = response.data;

        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - hours);

        const recentEvents = events.filter(event => {
            const eventDate = new Date(event.timestamp);
            return eventDate >= cutoffDate;
        });

        if (recentEvents.length === 0) {
            console.log('No events found in the specified time range');
            return;
        }

        // Group by app
        const appStats = {};
        let totalTime = 0;

        recentEvents.forEach(event => {
            const app = event.data.app || 'unknown';
            const duration = event.duration;
            
            if (!appStats[app]) {
                appStats[app] = {
                    count: 0,
                    totalTime: 0,
                    sampleTitles: new Set()
                };
            }
            
            appStats[app].count++;
            appStats[app].totalTime += duration;
            totalTime += duration;
            
            // Keep sample titles (max 3)
            if (appStats[app].sampleTitles.size < 3) {
                appStats[app].sampleTitles.add(event.data.title || 'No title');
            }
        });

        // Sort by time spent
        const sortedApps = Object.entries(appStats).sort((a, b) => b[1].totalTime - a[1].totalTime);

        console.log('📱 Applications by time spent:');
        console.log('=' .repeat(100));

        sortedApps.forEach(([app, stats]) => {
            const hours = (stats.totalTime / 3600).toFixed(2);
            const percentage = ((stats.totalTime / totalTime) * 100).toFixed(1);
            
            console.log(`${app.padEnd(40)} | ${hours.padStart(8)}h (${percentage.padStart(5)}%) | ${stats.count} events`);
            
            // Show sample titles
            const titles = Array.from(stats.sampleTitles).slice(0, 2);
            titles.forEach(title => {
                console.log(`    📝 ${title.substring(0, 80)}${title.length > 80 ? '...' : ''}`);
            });
            console.log('');
        });

        console.log(`\n📊 Total time tracked: ${(totalTime / 3600).toFixed(2)} hours`);
        console.log(`Events analyzed: ${recentEvents.length}`);

        console.log('1. Look for specific app names above');
        console.log('2. Create ActivityWatch rules/categories');
        console.log('3. Use title patterns to identify work');

        // Search for potential work patterns
        console.log('\n🔍 Searching for potential work patterns...');
        const potentialWork = recentEvents.filter(event => {
            const app = (event.data.app || '').toLowerCase();
            const title = (event.data.title || '').toLowerCase();
            
            return app.includes('dev') || 
                   app.includes('code') || 
                   app.includes('terminal') || 
                   app.includes('browser') ||
                   config.activityWatch.searchPatterns.workIndicators.some(indicator => title.includes(indicator.toLowerCase())) ||
                   title.includes('development') ||
                   title.includes('programming') ||
                   title.includes('code') ||
                   title.includes('github') ||
                   title.includes('claude');
        });

        if (potentialWork.length > 0) {
            const workTime = potentialWork.reduce((sum, event) => sum + event.duration, 0);
            console.log(`Found ${potentialWork.length} potential work events (${(workTime / 3600).toFixed(2)} hours)`);
            
            console.log('\n📋 Sample potential work events:');
            potentialWork.slice(0, 5).forEach(event => {
                const time = new Date(event.timestamp).toLocaleString();
                const duration = (event.duration / 60).toFixed(1);
                console.log(`  ${time} | ${duration}min | ${event.data.app} | ${event.data.title?.substring(0, 50)}...`);
            });
        }

    } catch (error) {
        console.error('❌ Error exploring ActivityWatch:', error.message);
        console.log('\n🔧 Make sure ActivityWatch is running: http://localhost:5600');
    }
}

// Parse command line arguments
const hours = parseInt(process.argv[2]) || 24;

console.log('🚀 Starting ActivityWatch Explorer...');
exploreActivityWatch(hours);