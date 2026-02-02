/**
 * spawnWithTimeout.js - Spawn wrapper with automatic timeout and registry tracking
 *
 * Wraps child_process.spawn with:
 * - Automatic registration with ProcessRegistry
 * - Timeout handling via registry events
 * - Promise-based completion
 * - Bounded output buffers
 */

const { spawn } = require('child_process');
const { globalRegistry } = require('../ProcessRegistry');

// Maximum output buffer size (10MB)
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

/**
 * Spawn a child process with automatic timeout and registry tracking
 *
 * @param {string} command - Command to run
 * @param {string[]} args - Command arguments
 * @param {Object} options - Spawn options (cwd, stdio, env, etc.)
 * @param {string} name - Descriptive name for logging
 * @param {number} timeoutMs - Timeout in milliseconds (default: 60000)
 * @returns {Object} - { process, processId, promise }
 */
function spawnWithTimeout(command, args, options, name, timeoutMs = 60000) {
  // Handle synchronous spawn errors
  let childProcess;
  try {
    childProcess = spawn(command, args, options);
  } catch (err) {
    return {
      process: null,
      processId: null,
      promise: Promise.reject(err)
    };
  }

  const processId = globalRegistry.register(childProcess, name, timeoutMs);

  // Create a promise that resolves on close/error
  const promise = new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;
    let timedOut = false;

    // Listen for timeout event from registry (fired before forceKill)
    const onTimeout = (id) => {
      if (id === processId) {
        timedOut = true;
      }
    };
    globalRegistry.on('timeout', onTimeout);

    // Capture stdout if available (with size limit)
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        if (stdout.length < MAX_OUTPUT_SIZE) {
          const chunk = data.toString();
          stdout += chunk.slice(0, MAX_OUTPUT_SIZE - stdout.length);
        }
      });
    }

    // Capture stderr if available (with size limit)
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        if (stderr.length < MAX_OUTPUT_SIZE) {
          const chunk = data.toString();
          stderr += chunk.slice(0, MAX_OUTPUT_SIZE - stderr.length);
        }
      });
    }

    // Handle process close
    childProcess.on('close', (code, signal) => {
      if (!resolved) {
        resolved = true;
        globalRegistry.removeListener('timeout', onTimeout);
        resolve({ code, signal, stdout, stderr, timedOut });
      }
    });

    // Handle spawn errors
    childProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        globalRegistry.removeListener('timeout', onTimeout);
        reject(error);
      }
    });
  });

  return {
    process: childProcess,
    processId,
    promise
  };
}

module.exports = { spawnWithTimeout };
