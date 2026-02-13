/**
 * ProcessRegistry.js - Central process tracking for cleanup
 *
 * Tracks all spawned child processes and provides:
 * - Automatic timeout handling
 * - Graceful shutdown (SIGTERM → SIGKILL escalation)
 * - Global cleanup on bot shutdown
 * - Event emission for timeout detection
 */

const EventEmitter = require('events');

class ProcessRegistry extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map(); // processId -> { process, name, spawnTime, timeoutTimer, killed, onExit, onError }
    this.processCounter = 0;
  }

  /**
   * Register a spawned process for tracking
   * @param {ChildProcess} process - The spawned process
   * @param {string} name - Descriptive name for logging
   * @param {number} timeoutMs - Auto-kill timeout in ms (0 = no timeout)
   * @returns {string} - Process ID for later reference
   */
  register(process, name, timeoutMs = 0) {
    // Validate process parameter
    if (!process || typeof process.kill !== 'function') {
      throw new Error('ProcessRegistry.register requires a valid ChildProcess object');
    }

    const processId = `proc-${++this.processCounter}-${Date.now()}`;

    // Create named event handlers for proper cleanup
    const onExit = (code, signal) => {
      console.log(`[ProcessRegistry] Process ${name} (${processId}) exited: code=${code}, signal=${signal}`);
      this._cleanup(processId);
    };

    const onError = (error) => {
      console.error(`[ProcessRegistry] Process ${name} (${processId}) error:`, error.message);
      this._cleanup(processId);
    };

    const entry = {
      process,
      name,
      spawnTime: Date.now(),
      timeoutTimer: null,
      killed: false,
      onExit,
      onError
    };

    // Setup timeout if specified
    if (timeoutMs > 0) {
      entry.timeoutTimer = setTimeout(() => {
        console.log(`[ProcessRegistry] Timeout reached for ${name} (${processId}), killing...`);
        this.emit('timeout', processId); // Emit event before killing
        this.forceKill(processId);
      }, timeoutMs);
    }

    // Track process exit to auto-cleanup
    process.on('exit', onExit);
    process.on('error', onError);

    this.processes.set(processId, entry);
    console.log(`[ProcessRegistry] Registered ${name} (${processId}), timeout=${timeoutMs}ms, active=${this.processes.size}`);

    return processId;
  }

  /**
   * Gracefully kill a process (SIGTERM, then SIGKILL after 5s)
   * @param {string} processId - The process ID to kill
   * @returns {Promise<void>}
   */
  async gracefulKill(processId) {
    const entry = this.processes.get(processId);
    if (!entry || entry.killed) return;

    entry.killed = true;
    const { process, name } = entry;

    // Clear any pending timeout
    if (entry.timeoutTimer) {
      clearTimeout(entry.timeoutTimer);
      entry.timeoutTimer = null;
    }

    console.log(`[ProcessRegistry] Graceful kill initiated for ${name} (${processId})`);

    // Send SIGTERM
    try {
      process.kill('SIGTERM');
    } catch {
      // Process may already be dead
      this._cleanup(processId);
      return;
    }

    // Wait for exit or force kill after 5 seconds
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const forceKillTimer = setTimeout(() => {
        if (this.processes.has(processId)) {
          console.log(`[ProcessRegistry] Force killing ${name} (${processId}) after SIGTERM timeout`);
          try {
            process.kill('SIGKILL');
          } catch {
            // Already dead
          }
        }
        done();
      }, 5000);

      process.once('exit', () => {
        clearTimeout(forceKillTimer);
        done();
      });
    });
  }

  /**
   * Force kill a process immediately (SIGKILL)
   * @param {string} processId - The process ID to kill
   */
  forceKill(processId) {
    const entry = this.processes.get(processId);
    if (!entry || entry.killed) return;

    entry.killed = true;
    const { process, name } = entry;

    if (entry.timeoutTimer) {
      clearTimeout(entry.timeoutTimer);
      entry.timeoutTimer = null;
    }

    console.log(`[ProcessRegistry] Force killing ${name} (${processId})`);

    try {
      process.kill('SIGKILL');
    } catch {
      // Already dead
    }

    this._cleanup(processId);
  }

  /**
   * Kill all registered processes gracefully
   * @returns {Promise<void>}
   */
  async killAll() {
    const count = this.processes.size;
    if (count === 0) {
      console.log('[ProcessRegistry] No processes to kill');
      return;
    }

    console.log(`[ProcessRegistry] Killing all ${count} registered processes...`);

    const killPromises = [];
    for (const processId of this.processes.keys()) {
      killPromises.push(this.gracefulKill(processId));
    }

    await Promise.all(killPromises);
    console.log('[ProcessRegistry] All processes terminated');
  }

  /**
   * Internal cleanup after process exit
   * Removes event listeners to prevent memory leaks
   * @param {string} processId - The process ID to clean up
   */
  _cleanup(processId) {
    const entry = this.processes.get(processId);
    if (entry) {
      // Clear timeout if pending
      if (entry.timeoutTimer) {
        clearTimeout(entry.timeoutTimer);
      }

      // Remove event listeners to prevent memory leaks
      try {
        entry.process.removeListener('exit', entry.onExit);
        entry.process.removeListener('error', entry.onError);
      } catch {
        // Process may be in an invalid state
      }

      this.processes.delete(processId);
    }
  }

  /**
   * Get count of active processes
   * @returns {number}
   */
  getActiveCount() {
    return this.processes.size;
  }

  /**
   * Get status of all processes
   * @returns {Array<Object>}
   */
  getStatus() {
    const status = [];
    for (const [id, entry] of this.processes) {
      status.push({
        id,
        name: entry.name,
        spawnTime: entry.spawnTime,
        age: Date.now() - entry.spawnTime,
        killed: entry.killed
      });
    }
    return status;
  }
}

// Singleton instance for global access
const globalRegistry = new ProcessRegistry();

module.exports = { ProcessRegistry, globalRegistry };
