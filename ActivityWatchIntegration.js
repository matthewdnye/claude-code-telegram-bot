const axios = require('axios');
const config = require('./config.json');

/**
 * ActivityWatch Integration
 * Tracks Claude bot sessions in ActivityWatch time tracker
 * API Documentation: https://github.com/ActivityWatch/activitywatch
 */
class ActivityWatchIntegration {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:5600/api/0';
        this.bucketId = options.bucketId || 'claude-bot-sessions';
        this.hostname = require('os').hostname();
        this.enabled = options.enabled !== false; // Enabled by default
        this.timeMultiplier = options.timeMultiplier || 1.0; // Default 1.0 (no change)
        
        console.log(`[ActivityWatch] Integration ${this.enabled ? 'enabled' : 'disabled'}`);
        if (this.enabled) {
            console.log(`[ActivityWatch] URL: ${this.baseUrl}, Bucket: ${this.bucketId}, Time Multiplier: ${this.timeMultiplier}x`);
        }
    }

    /**
     * Initialize ActivityWatch bucket for Claude sessions
     */
    async initialize() {
        if (!this.enabled) return;

        try {
            // Try to create bucket (will fail silently if already exists)
            await axios.post(`${this.baseUrl}/buckets/${this.bucketId}`, {
                type: 'claude.session',
                client: 'claude-telegram-bot',
                hostname: this.hostname
            });
            console.log(`[ActivityWatch] Bucket '${this.bucketId}' initialized`);
        } catch (error) {
            if (error.response?.status === 409) {
                // Bucket already exists - that's fine
                console.log(`[ActivityWatch] Bucket '${this.bucketId}' already exists`);
            } else if (error.response?.status === 304) {
                // Not modified (bucket exists and unchanged) - that's fine too
                console.log(`[ActivityWatch] Bucket '${this.bucketId}' already exists (304)`);
            } else {
                console.error('[ActivityWatch] Error initializing bucket:', error.message);
                this.enabled = false; // Disable on error
            }
        }
    }

    /**
     * Record a Claude session in ActivityWatch with smart time scheduling
     */
    async recordSession(sessionData) {
        if (!this.enabled) return;

        try {
            const {
                sessionId,
                userId,
                duration, // in milliseconds
                message,
                projectName = 'Unknown Project',
                tokens = null,
                cost = null,
                model = null,
                botInstance = 'unknown'
            } = sessionData;

            // Apply time multiplier and convert to seconds
            const originalDurationSeconds = duration / 1000;
            const adjustedDurationSeconds = originalDurationSeconds * this.timeMultiplier;

            // Find optimal time window to avoid overlaps
            const timeWindow = await this.findOptimalTimeWindow(adjustedDurationSeconds, {
                botInstance: botInstance,
                projectName: projectName
            });

            const event = {
                timestamp: timeWindow.startTime,
                duration: adjustedDurationSeconds,
                data: {
                    session_id: sessionId ? sessionId.slice(-8) : 'unknown',
                    user_id: userId ? `user_${userId}` : 'unknown',
                    project: projectName,
                    message_preview: message ? message.substring(0, 100) + '...' : 'No message',
                    tokens: tokens,
                    cost: cost,
                    model: model,
                    app: 'claude-telegram-bot',
                    category: 'AI Assistant',
                    original_duration: originalDurationSeconds,
                    time_multiplier: this.timeMultiplier,
                    time_shift: timeWindow.timeShift,
                    bot_instance: botInstance
                }
            };

            // Enhanced retry mechanism for network issues
            let response;
            const maxRetries = 5;
            let lastError;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    response = await axios.post(
                        `${this.baseUrl}/buckets/${this.bucketId}/events`,
                        [event],
                        {
                            headers: { 'Content-Type': 'application/json' },
                            timeout: 10000, // Increased timeout
                            // Add connection keep-alive
                            httpAgent: new (require('http').Agent)({ keepAlive: true }),
                        }
                    );
                    break; // Success, exit retry loop
                } catch (attemptError) {
                    lastError = attemptError;
                    
                    // Check if it's a retryable error
                    const isRetryable = (
                        attemptError.code === 'ECONNRESET' ||
                        attemptError.code === 'ENOTFOUND' ||
                        attemptError.code === 'ETIMEDOUT' ||
                        attemptError.code === 'ECONNREFUSED' ||
                        attemptError.message.includes('socket hang up') ||
                        attemptError.message.includes('timeout') ||
                        attemptError.message.includes('ECONNRESET')
                    );
                    
                    if (isRetryable && attempt < maxRetries) {
                        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                        console.warn(`[ActivityWatch] Main recording attempt ${attempt} failed (${attemptError.message}), retrying in ${backoffDelay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, backoffDelay));
                        continue;
                    } else {
                        // Not retryable or max retries exceeded
                        throw attemptError;
                    }
                }
            }

            const eventId = response.data[0]?.id;
            const actualStart = new Date(timeWindow.startTime).toLocaleTimeString();
            const actualEnd = new Date(Date.parse(timeWindow.startTime) + adjustedDurationSeconds * 1000).toLocaleTimeString();
            
            // ALSO record as fake window event for standard ActivityWatch interface
            await this.recordAsWindowEvent(timeWindow.startTime, adjustedDurationSeconds, projectName, sessionId);
            
            console.log(`[ActivityWatch] Session recorded: ${botInstance} | ${projectName} | ${sessionId?.slice(-8)} | ${originalDurationSeconds.toFixed(1)}s → ${adjustedDurationSeconds.toFixed(1)}s (${this.timeMultiplier}x) | ${actualStart}-${actualEnd} | Event ID: ${eventId}`);
            
            return eventId;
        } catch (error) {
            console.error('[ActivityWatch] Error recording session:', error.message);
            
            if (error.code === 'ECONNREFUSED') {
                console.warn('[ActivityWatch] Service appears to be down, disabling temporarily');
                this.enabled = false;
            }
            
            return null;
        }
    }

    /**
     * Record session as fake window event for standard ActivityWatch interface
     */
    async recordAsWindowEvent(timestamp, durationSeconds, projectName, sessionId) {
        if (!this.enabled) return;
        
        try {
            const windowBucket = `aw-watcher-window_${this.hostname}`;
            
            // Create fake window event with configured app name for work categorization
            // Using more generic IT/development-related app names
            const windowEvent = {
                timestamp: timestamp,
                duration: durationSeconds,
                data: {
                    app: config.activityWatch.integration.fakeAppName,
                    title: `${config.activityWatch.integration.sessionTitleTemplate} - ${projectName} AI Assistant Session ${sessionId?.slice(-8) || 'work'}`
                }
            };

            // Enhanced retry mechanism for socket issues
            const maxRetries = 5;
            let lastError;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await axios.post(
                        `${this.baseUrl}/buckets/${windowBucket}/events`,
                        [windowEvent],
                        {
                            headers: { 'Content-Type': 'application/json' },
                            timeout: 10000, // Increased timeout
                            // Add connection keep-alive
                            httpAgent: new (require('http').Agent)({ keepAlive: true }),
                        }
                    );
                    console.log(`[ActivityWatch] Window event recorded: ${windowEvent.data.app} | ${durationSeconds.toFixed(1)}s | attempt ${attempt}`);
                    return; // Success, exit function
                } catch (error) {
                    lastError = error;
                    
                    // Handle bucket creation first
                    if (error.response?.status === 404 && attempt === 1) {
                        console.log(`[ActivityWatch] Creating window bucket: ${windowBucket}`);
                        try {
                            await axios.post(`${this.baseUrl}/buckets/${windowBucket}`, {
                                type: 'currentwindow',
                                client: 'aw-watcher-window',
                                hostname: this.hostname
                            }, { timeout: 10000 });
                            continue; // Retry recording after creating bucket
                        } catch (bucketError) {
                            console.warn(`[ActivityWatch] Could not create window bucket: ${bucketError.message}`);
                        }
                    }
                    
                    // Handle retryable errors
                    const isRetryable = (
                        error.code === 'ECONNRESET' ||
                        error.code === 'ENOTFOUND' ||
                        error.code === 'ETIMEDOUT' ||
                        error.code === 'ECONNREFUSED' ||
                        error.message.includes('socket hang up') ||
                        error.message.includes('timeout') ||
                        error.message.includes('ECONNRESET')
                    );
                    
                    if (isRetryable && attempt < maxRetries) {
                        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                        console.warn(`[ActivityWatch] Window event attempt ${attempt} failed (${error.message}), retrying in ${backoffDelay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, backoffDelay));
                        continue;
                    } else {
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.warn(`[ActivityWatch] Could not record window event after ${maxRetries} attempts: ${error.message}`);
        }
    }

    /**
     * Find optimal time window to avoid overlaps with existing Claude bot sessions
     * Enhanced with cross-bot conflict resolution for same project
     */
    async findOptimalTimeWindow(durationSeconds, context = {}) {
        const now = new Date();
        const currentEndTime = now.getTime();
        const currentStartTime = currentEndTime - (durationSeconds * 1000);

        try {
            // Get recent events from our bucket to check for overlaps
            const recentEvents = await this.getRecentEvents(24); // Last 24 hours
            
            // Filter only our app events
            const ourEvents = recentEvents.filter(event => 
                event.data.app === 'claude-telegram-bot'
            );

            if (ourEvents.length === 0) {
                // No existing events, use current time
                return {
                    startTime: new Date(currentStartTime).toISOString(),
                    timeShift: 0
                };
            }

            // Try to place the session starting at the original time
            let proposedStart = currentStartTime;
            let proposedEnd = currentEndTime;
            let timeShift = 0;
            
            // Check for overlaps and adjust if needed
            const maxAttempts = 10;
            let attempts = 0;
            
            while (attempts < maxAttempts) {
                // Enhanced overlap detection with project and bot instance awareness
                const conflictingEvent = ourEvents.find(event => {
                    const eventStart = Date.parse(event.timestamp);
                    const eventEnd = eventStart + (event.duration * 1000);
                    
                    // Check if times overlap
                    const timeOverlap = !(proposedEnd <= eventStart || proposedStart >= eventEnd);
                    
                    if (!timeOverlap) return false; // No time overlap, no conflict
                    
                    // If times overlap, check if it's the same project
                    const sameProject = event.data.project === context.projectName;
                    
                    if (sameProject) {
                        // Same project - always resolve conflicts by shifting time
                        return true;
                    } else {
                        // Different projects - allow overlap (parallel work on different projects)
                        return false;
                    }
                });

                if (!conflictingEvent) {
                    // Found a good window
                    break;
                }

                // Smart time shifting strategy for same project conflicts
                if (conflictingEvent.data.project === context.projectName) {
                    // For same project, try to place session right after the conflicting event
                    const conflictingEventEnd = Date.parse(conflictingEvent.timestamp) + (conflictingEvent.duration * 1000);
                    
                    // Add small buffer (30 seconds) between sessions
                    const bufferMs = 30 * 1000;
                    proposedStart = conflictingEventEnd + bufferMs;
                    proposedEnd = proposedStart + (durationSeconds * 1000);
                    
                    timeShift = Math.round((proposedStart - currentStartTime) / (60 * 1000)); // in minutes
                } else {
                    // For different projects (shouldn't happen with new logic, but fallback)
                    // Try shifting backward first (earlier start time)
                    if (attempts < 5) {
                        const shiftMinutes = (attempts + 1) * 15; // 15, 30, 45, 60, 75 minutes
                        const shiftMs = shiftMinutes * 60 * 1000;
                        proposedStart = currentStartTime - shiftMs;
                        proposedEnd = proposedStart + (durationSeconds * 1000);
                        timeShift = -shiftMinutes;
                    } else {
                        // Try shifting forward (later start time)
                        const shiftMinutes = (attempts - 4) * 15; // 15, 30, 45, 60, 75 minutes
                        const shiftMs = shiftMinutes * 60 * 1000;
                        proposedStart = currentEndTime + shiftMs;
                        proposedEnd = proposedStart + (durationSeconds * 1000);
                        timeShift = shiftMinutes;
                    }
                }
                
                attempts++;
            }

            if (timeShift !== 0) {
                const direction = timeShift > 0 ? 'forward' : 'backward';
                console.log(`[ActivityWatch] Time adjusted ${Math.abs(timeShift)} minutes ${direction} for ${context.botInstance || 'unknown'} (${context.projectName}) to avoid same-project overlap`);
            }

            return {
                startTime: new Date(proposedStart).toISOString(),
                timeShift: timeShift
            };

        } catch (error) {
            console.warn('[ActivityWatch] Could not check for overlaps, using current time:', error.message);
            return {
                startTime: new Date(currentStartTime).toISOString(),
                timeShift: 0
            };
        }
    }

    /**
     * Get recent events from our bucket
     */
    async getRecentEvents(hours = 24) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/buckets/${this.bucketId}/events?limit=100`,
                { timeout: 5000 }
            );
            
            const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
            
            return response.data.filter(event => 
                Date.parse(event.timestamp) > cutoffTime
            );
        } catch (error) {
            console.warn('[ActivityWatch] Error fetching recent events:', error.message);
            return [];
        }
    }

    /**
     * Test connection to ActivityWatch
     */
    async testConnection() {
        try {
            const response = await axios.get(`${this.baseUrl}/info`, { timeout: 3000 });
            console.log(`[ActivityWatch] Connected successfully to v${response.data.version} on ${response.data.hostname}`);
            return true;
        } catch (error) {
            console.error('[ActivityWatch] Connection test failed:', error.message);
            return false;
        }
    }

    /**
     * Get recent Claude sessions from ActivityWatch
     */
    async getRecentSessions(limit = 10) {
        if (!this.enabled) return [];

        try {
            const response = await axios.get(
                `${this.baseUrl}/buckets/${this.bucketId}/events?limit=${limit}`,
                { timeout: 5000 }
            );
            
            return response.data.map(event => ({
                id: event.id,
                timestamp: event.timestamp,
                duration: event.duration,
                sessionId: event.data.session_id,
                userId: event.data.user_id,
                status: event.data.status,
                tokens: event.data.tokens,
                cost: event.data.cost,
                model: event.data.model
            }));
        } catch (error) {
            console.error('[ActivityWatch] Error fetching recent sessions:', error.message);
            return [];
        }
    }

    /**
     * Get stats about recorded sessions
     */
    async getSessionStats() {
        if (!this.enabled) return null;

        try {
            const sessions = await this.getRecentSessions(100);
            
            const stats = {
                totalSessions: sessions.length,
                totalTime: sessions.reduce((sum, s) => sum + s.duration, 0),
                completedSessions: sessions.filter(s => s.status === 'completed').length,
                failedSessions: sessions.filter(s => s.status === 'failed').length,
                totalTokens: sessions.reduce((sum, s) => sum + (s.tokens || 0), 0),
                totalCost: sessions.reduce((sum, s) => sum + (s.cost || 0), 0),
                averageSessionTime: 0
            };
            
            if (stats.totalSessions > 0) {
                stats.averageSessionTime = stats.totalTime / stats.totalSessions;
            }
            
            return stats;
        } catch (error) {
            console.error('[ActivityWatch] Error fetching session stats:', error.message);
            return null;
        }
    }

    /**
     * Enable/disable integration
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`[ActivityWatch] Integration ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set time multiplier for session duration
     */
    setTimeMultiplier(multiplier) {
        if (multiplier <= 0) {
            console.warn('[ActivityWatch] Time multiplier must be positive, using 1.0');
            this.timeMultiplier = 1.0;
        } else {
            this.timeMultiplier = multiplier;
            console.log(`[ActivityWatch] Time multiplier set to ${multiplier}x`);
        }
    }

    /**
     * Get current settings
     */
    getSettings() {
        return {
            enabled: this.enabled,
            timeMultiplier: this.timeMultiplier,
            bucketId: this.bucketId,
            baseUrl: this.baseUrl
        };
    }

    /**
     * Update multiple settings at once
     */
    updateSettings(settings) {
        if (settings.enabled !== undefined) {
            this.setEnabled(settings.enabled);
        }
        if (settings.timeMultiplier !== undefined) {
            this.setTimeMultiplier(settings.timeMultiplier);
        }
        
        console.log('[ActivityWatch] Settings updated:', this.getSettings());
    }
}

module.exports = ActivityWatchIntegration;