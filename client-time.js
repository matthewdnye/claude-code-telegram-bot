#!/usr/bin/env node

/**
 * Full time report for client: regular time + bot time
 * Usage: node client-time.js [days] [project]
 */

const axios = require('axios');
const config = require('./config.json');

const ACTIVITY_WATCH_URL = 'http://localhost:5600/api/0';
const BOT_BUCKET = 'claude-bot-sessions';
const WINDOW_BUCKET = 'aw-watcher-window_errogaht-G1619-04';

async function getClientTime(days = 1, project = config.activityWatch.defaultProject) {
    try {
        console.log(`\n💰 CLIENT TIME: project "${project}" (${days} days)\n`);

        // 1. GET BOT TIME (with multiplier)
        let botTime = 0, botOriginalTime = 0, multiplier = 1, botEvents = [];
        
        try {
            const botResponse = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${BOT_BUCKET}/events?limit=100`, {timeout: 5000});
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            botEvents = botResponse.data.filter(event => {
                const eventDate = new Date(event.timestamp);
                return event.data.project === project && eventDate >= cutoffDate;
            });

            botTime = botEvents.reduce((sum, event) => sum + event.duration, 0) / 3600; // in hours
            botOriginalTime = botEvents.reduce((sum, event) => sum + (event.data.original_duration || event.duration), 0) / 3600;
            multiplier = botEvents[0]?.data?.time_multiplier || 1;
        } catch (error) {
            console.log('⚠️ Could not get bot time:', error.message);
        }

        // 2. GET REGULAR TIME (windows/applications)  
        let windowTime = 0, windowEvents = [];
        
        try {
            const windowResponse = await axios.get(`${ACTIVITY_WATCH_URL}/buckets/${WINDOW_BUCKET}/events?limit=100`, {timeout: 5000});
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
        
            const todayStr = new Date().toISOString().split('T')[0];
            if (days === 1) {
                // For today - exact date
                windowEvents = windowResponse.data.filter(event => 
                    event.timestamp.startsWith(todayStr) && 
                    (event.data.title || '').toLowerCase().includes(project.toLowerCase())
                );
            } else {
                // For multiple days - date range
                windowEvents = windowResponse.data.filter(event => {
                    const eventDate = new Date(event.timestamp);
                    return eventDate >= cutoffDate && 
                           (event.data.title || '').toLowerCase().includes(project.toLowerCase());
                });
            }

            windowTime = windowEvents.reduce((sum, event) => sum + event.duration, 0) / 3600; // in hours
        } catch (error) {
            console.log('⚠️ Could not get regular time:', error.message);
        }

        // 3. TOTALS
        const totalTime = windowTime + botTime;
        
        console.log('📊 BREAKDOWN:');
        console.log('=' .repeat(50));
        console.log(`🖥️  Regular work (windows):   ${windowTime.toFixed(2)} h`);
        console.log(`🤖 Bot work:                  ${botOriginalTime.toFixed(2)} h → ${botTime.toFixed(2)} h (${multiplier}x)`);
        console.log('=' .repeat(50));
        console.log(`💰 TOTAL FOR CLIENT:          ${totalTime.toFixed(2)} h`);
        
        // 4. DETAILS
        console.log(`\n📈 DETAILS:`);
        console.log(`- Regular time: ${windowEvents.length} events, ${windowTime.toFixed(2)} hours`);
        console.log(`- Bot time: ${botEvents.length} sessions, ${botTime.toFixed(2)} hours (multiplier ${multiplier}x)`);
        console.log(`- Date: ${days === 1 ? 'today' : `last ${days} days`}`);

        // 5. FOR CLIENT COPY
        console.log(`\n📝 FOR CLIENT:`);
        console.log(`Project: ${project}`);
        console.log(`Date: ${new Date().toLocaleDateString('en-US')}`);
        console.log(`Work time: ${totalTime.toFixed(2)} hours`);

        return {
            windowTime: windowTime,
            botTime: botTime,
            totalTime: totalTime,
            botSessions: botEvents.length,
            windowEvents: windowEvents.length
        };

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n🔧 Check:');
        console.log('• ActivityWatch is running: curl http://localhost:5600/api/0/info');
        console.log('• Bot is recording time');
    }
}

// Launch
const days = parseInt(process.argv[2]) || 1;
const project = process.argv[3] || config.activityWatch.defaultProject;

getClientTime(days, project);