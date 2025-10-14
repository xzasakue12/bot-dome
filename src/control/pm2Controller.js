const { spawn } = require('child_process');
const path = require('path');

const APP_NAME = process.env.PM2_APP_NAME || 'my-discord-music-bot';
const START_TARGET = process.env.PM2_START_TARGET || 'src/bot.js';
const WORKING_DIR = process.env.BOT_WORKING_DIR || path.resolve(__dirname, '..', '..');

const START_CMD = process.env.CONTROL_PM2_START_CMD;
const STOP_CMD = process.env.CONTROL_PM2_STOP_CMD;
const RESTART_CMD = process.env.CONTROL_PM2_RESTART_CMD;
const STATUS_CMD = process.env.CONTROL_PM2_STATUS_CMD;
const LOGS_CMD = process.env.CONTROL_PM2_LOGS_CMD;

function parseCommand(cmd, fallback) {
    if (!cmd || typeof cmd !== 'string') return fallback;
    const tokens = cmd.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (!tokens) return fallback;
    return tokens.map(token => token.replace(/^"|"$/g, ''));
}

const commands = {
    start: parseCommand(START_CMD, ['start', START_TARGET, '--name', APP_NAME]),
    stop: parseCommand(STOP_CMD, ['stop', APP_NAME]),
    restart: parseCommand(RESTART_CMD, ['restart', APP_NAME]),
    status: parseCommand(STATUS_CMD, ['status', APP_NAME]),
    logs: parseCommand(LOGS_CMD, ['logs', APP_NAME])
};

function runPm2(args, { stream = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('pm2', args, {
            cwd: WORKING_DIR,
            stdio: stream ? 'inherit' : 'pipe'
        });

        if (stream) {
            child.on('close', (code) => {
                if (code && code !== 0) {
                    reject(new Error(`pm2 ${args.join(' ')} exited with code ${code}`));
                } else {
                    resolve({ code });
                }
            });
            child.on('error', reject);
            return;
        }

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', reject);

        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
            } else {
                const error = new Error(`pm2 ${args.join(' ')} exited with code ${code}`);
                error.stdout = stdout;
                error.stderr = stderr;
                error.code = code;
                reject(error);
            }
        });
    });
}

async function ensureStatus() {
    try {
        const result = await runPm2(commands.status);
        return result.stdout;
    } catch (error) {
        const fallback = await runPm2(['list']);
        return fallback.stdout;
    }
}

async function startBot() {
    const result = await runPm2(commands.start);
    return result.stdout;
}

async function stopBot() {
    const result = await runPm2(commands.stop);
    return result.stdout;
}

async function restartBot() {
    const result = await runPm2(commands.restart);
    return result.stdout;
}

async function getStatus() {
    return ensureStatus();
}

async function getLogs(lines = 100) {
    const args = [...commands.logs];
    if (!args.includes('--lines')) {
        args.push('--lines', String(lines));
    }
    if (!args.includes('--nostream')) {
        args.push('--nostream');
    }
    const result = await runPm2(args);
    return result.stdout || result.stderr;
}

function streamLogs() {
    return spawn('pm2', [...commands.logs], {
        cwd: WORKING_DIR,
        stdio: 'pipe'
    });
}

module.exports = {
    APP_NAME,
    WORKING_DIR,
    commands,
    runPm2,
    startBot,
    stopBot,
    restartBot,
    getStatus,
    getLogs,
    streamLogs
};
