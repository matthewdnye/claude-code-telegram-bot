const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

/**
 * Multi-Tunnel Adapter - Free alternatives to ngrok with multiple simultaneous tunnels
 * Supports LocalTunnel, Serveo, Cloudflare Tunnel, and more
 */
class MultiTunnelAdapter {
    constructor(options = {}) {
        this.provider = options.provider || 'localtunnel'; // Default to LocalTunnel
        this.tunnels = new Map(); // Track active tunnels
        this.botInstance = options.botInstance || 'bot1';
        
        console.log(`[MultiTunnelAdapter] Initialized with provider: ${this.provider}`);
    }

    /**
     * Create a tunnel for the specified port
     */
    async createTunnel(port, serviceName = 'service') {
        const tunnelId = `${serviceName}-${this.botInstance}`;
        
        try {
            console.log(`[MultiTunnelAdapter] Creating ${this.provider} tunnel for ${serviceName} on port ${port}`);
            
            let tunnelInfo;
            
            switch (this.provider) {
                case 'localtunnel':
                    tunnelInfo = await this.createLocalTunnel(port, tunnelId);
                    break;
                case 'serveo':
                    tunnelInfo = await this.createServeoTunnel(port, tunnelId);
                    break;
                case 'cloudflare':
                    tunnelInfo = await this.createCloudflareRTunnel(port, tunnelId);
                    break;
                case 'bore':
                    tunnelInfo = await this.createBoreTunnel(port, tunnelId);
                    break;
                default:
                    throw new Error(`Unsupported tunnel provider: ${this.provider}`);
            }
            
            // Store tunnel info for cleanup
            this.tunnels.set(tunnelId, tunnelInfo);
            
            console.log(`[MultiTunnelAdapter] ✅ ${serviceName} tunnel created: ${tunnelInfo.url}`);
            return tunnelInfo.url;
            
        } catch (error) {
            console.error(`[MultiTunnelAdapter] ❌ Failed to create ${serviceName} tunnel:`, error.message);
            throw error;
        }
    }

    /**
     * Create LocalTunnel (most reliable free option)
     */
    async createLocalTunnel(port, tunnelId) {
        // Check if localtunnel is installed
        try {
            await execAsync('which lt');
        } catch (e) {
            console.log('[MultiTunnelAdapter] Installing localtunnel...');
            await execAsync('npm install -g localtunnel');
        }

        // Use random domain by not specifying subdomain
        return new Promise((resolve, reject) => {
            const process = spawn('lt', ['--port', port.toString()], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let urlFound = false;
            const timeout = setTimeout(() => {
                if (!urlFound) {
                    process.kill();
                    reject(new Error('LocalTunnel timeout - no URL received'));
                }
            }, 15000);

            process.stdout.on('data', (data) => {
                const output = data.toString();
                const urlMatch = output.match(/https?:\/\/[^\s]+/);
                
                if (urlMatch && !urlFound) {
                    urlFound = true;
                    clearTimeout(timeout);
                    resolve({
                        url: urlMatch[0],
                        process: process,
                        type: 'localtunnel'
                    });
                }
            });

            process.stderr.on('data', (data) => {
                console.log(`[MultiTunnelAdapter] LocalTunnel stderr: ${data}`);
            });

            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Create Serveo tunnel (SSH-based)
     */
    async createServeoTunnel(port, tunnelId) {
        const subdomain = tunnelId.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cmd = ['ssh', '-o', 'StrictHostKeyChecking=no', '-R', `${subdomain}:80:localhost:${port}`, 'serveo.net'];
        
        return new Promise((resolve, reject) => {
            const process = spawn(cmd[0], cmd.slice(1), {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let urlFound = false;
            const timeout = setTimeout(() => {
                if (!urlFound) {
                    process.kill();
                    reject(new Error('Serveo timeout - no URL received'));
                }
            }, 15000);

            process.stdout.on('data', (data) => {
                const output = data.toString();
                // Look for Serveo URL pattern
                if (output.includes('Forwarding HTTP traffic from')) {
                    const url = `https://${subdomain}.serveo.net`;
                    urlFound = true;
                    clearTimeout(timeout);
                    resolve({
                        url: url,
                        process: process,
                        type: 'serveo'
                    });
                }
            });

            process.stderr.on('data', (data) => {
                const output = data.toString();
                console.log(`[MultiTunnelAdapter] Serveo: ${output}`);
                
                // Serveo sometimes outputs URL to stderr
                if (output.includes('.serveo.net') && !urlFound) {
                    const url = `https://${subdomain}.serveo.net`;
                    urlFound = true;
                    clearTimeout(timeout);
                    resolve({
                        url: url,
                        process: process,
                        type: 'serveo'
                    });
                }
            });

            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Create Cloudflare Tunnel
     */
    async createCloudflareRTunnel(port, tunnelId) {
        // Check if cloudflared is available
        try {
            await execAsync('which cloudflared');
        } catch (e) {
            throw new Error('cloudflared not installed. Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation');
        }

        const cmd = ['cloudflared', 'tunnel', '--url', `localhost:${port}`];
        
        return new Promise((resolve, reject) => {
            const process = spawn(cmd[0], cmd.slice(1), {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let urlFound = false;
            const timeout = setTimeout(() => {
                if (!urlFound) {
                    process.kill();
                    reject(new Error('Cloudflare Tunnel timeout - no URL received'));
                }
            }, 20000);

            const handleOutput = (data) => {
                const output = data.toString();
                const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                
                if (urlMatch && !urlFound) {
                    urlFound = true;
                    clearTimeout(timeout);
                    resolve({
                        url: urlMatch[0],
                        process: process,
                        type: 'cloudflare'
                    });
                }
            };

            process.stdout.on('data', handleOutput);
            process.stderr.on('data', handleOutput);

            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Create Bore tunnel
     */
    async createBoreTunnel(port, tunnelId) {
        // Check if bore is available
        try {
            await execAsync('which bore');
        } catch (e) {
            throw new Error('bore not installed. Install with: cargo install bore-cli');
        }

        const cmd = ['bore', 'local', port.toString(), '--to', 'bore.pub'];
        
        return new Promise((resolve, reject) => {
            const process = spawn(cmd[0], cmd.slice(1), {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let urlFound = false;
            const timeout = setTimeout(() => {
                if (!urlFound) {
                    process.kill();
                    reject(new Error('Bore tunnel timeout - no URL received'));
                }
            }, 15000);

            process.stdout.on('data', (data) => {
                const output = data.toString();
                const urlMatch = output.match(/https?:\/\/[^\s]+bore\.pub[^\s]*/);
                
                if (urlMatch && !urlFound) {
                    urlFound = true;
                    clearTimeout(timeout);
                    resolve({
                        url: urlMatch[0],
                        process: process,
                        type: 'bore'
                    });
                }
            });

            process.stderr.on('data', (data) => {
                console.log(`[MultiTunnelAdapter] Bore stderr: ${data}`);
            });

            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Close a specific tunnel
     */
    async closeTunnel(serviceName) {
        const tunnelId = `${serviceName}-${this.botInstance}`;
        const tunnelInfo = this.tunnels.get(tunnelId);
        
        if (!tunnelInfo) {
            console.log(`[MultiTunnelAdapter] No tunnel found for ${serviceName}`);
            return;
        }

        try {
            if (tunnelInfo.process && !tunnelInfo.process.killed) {
                tunnelInfo.process.kill('SIGTERM');
                console.log(`[MultiTunnelAdapter] Closed ${serviceName} tunnel`);
            }
            this.tunnels.delete(tunnelId);
        } catch (error) {
            console.error(`[MultiTunnelAdapter] Error closing ${serviceName} tunnel:`, error.message);
        }
    }

    /**
     * Close all tunnels with SIGKILL escalation
     */
    async closeAllTunnels() {
        console.log(`[MultiTunnelAdapter] Closing all tunnels...`);

        const killPromises = [];

        for (const [tunnelId, tunnelInfo] of this.tunnels) {
            killPromises.push(new Promise((resolve) => {
                try {
                    if (tunnelInfo.process && !tunnelInfo.process.killed) {
                        tunnelInfo.process.kill('SIGTERM');

                        // Force kill after 2 seconds if still alive
                        const forceKillTimer = setTimeout(() => {
                            if (!tunnelInfo.process.killed) {
                                console.log(`[MultiTunnelAdapter] Force killing tunnel ${tunnelId}`);
                                try {
                                    tunnelInfo.process.kill('SIGKILL');
                                } catch (e) {
                                    // Already dead
                                }
                            }
                            resolve();
                        }, 2000);

                        tunnelInfo.process.once('exit', () => {
                            clearTimeout(forceKillTimer);
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                } catch (error) {
                    console.error(`[MultiTunnelAdapter] Error closing tunnel ${tunnelId}:`, error.message);
                    resolve();
                }
            }));
        }

        await Promise.all(killPromises);
        this.tunnels.clear();
        console.log(`[MultiTunnelAdapter] All tunnels closed`);
    }

    /**
     * Get tunnel statistics
     */
    getTunnelStats() {
        const stats = {
            provider: this.provider,
            activeTunnels: this.tunnels.size,
            tunnels: []
        };

        for (const [tunnelId, tunnelInfo] of this.tunnels) {
            stats.tunnels.push({
                id: tunnelId,
                url: tunnelInfo.url,
                type: tunnelInfo.type,
                status: tunnelInfo.process && !tunnelInfo.process.killed ? 'active' : 'inactive'
            });
        }

        return stats;
    }
}

module.exports = MultiTunnelAdapter;