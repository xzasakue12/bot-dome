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
    if (!tokens || tokens.length === 0) return fallback;
    const normalized = tokens.map(token => token.replace(/^"|"$/g, ''));
    return {
        command: normalized[0],
        args: normalized.slice(1)
    };
}

function buildDefault(command, args) {
    return {
        command,
        args
    };
}

const commands = {
    start: parseCommand(START_CMD, buildDefault('pm2', ['start', START_TARGET, '--name', APP_NAME])),
    stop: parseCommand(STOP_CMD, buildDefault('pm2', ['stop', APP_NAME])),
    restart: parseCommand(RESTART_CMD, buildDefault('pm2', ['restart', APP_NAME])),
    status: parseCommand(STATUS_CMD, buildDefault('pm2', ['status', APP_NAME])),
    logs: parseCommand(LOGS_CMD, buildDefault('pm2', ['logs', APP_NAME]))
};

function runPm2(commandEntry, { stream = false } = {}) {
    const entry = commandEntry || buildDefault('pm2', []);
    const { command, args } = entry;

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: WORKING_DIR,
            stdio: stream ? 'inherit' : 'pipe'
        });

        if (stream) {
            child.on('close', (code) => {
                if (code && code !== 0) {
                    reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
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
                const error = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
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
        const fallback = await runPm2(buildDefault('pm2', ['list']));
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
    const { command, args } = commands.logs;
    if (command === 'pm2') {
        const fullArgs = [...args];
        if (!fullArgs.includes('--lines')) {
            fullArgs.push('--lines', String(lines));
        }
        if (!fullArgs.includes('--nostream')) {
            fullArgs.push('--nostream');
        }
        const result = await runPm2({ command, args: fullArgs });
        return result.stdout || result.stderr;
    }

    const normalizedCommand = command.toLowerCase();
    if (normalizedCommand === 'docker' || normalizedCommand === 'docker-compose') {
        const fullArgs = [...args];
        const logsIndex = fullArgs.findIndex(arg => arg === 'logs');
        if (logsIndex !== -1) {
            if (!fullArgs.includes('--tail')) {
                fullArgs.splice(logsIndex + 1, 0, '--tail', String(lines));
            }
            if (!fullArgs.includes('--no-color')) {
                fullArgs.push('--no-color');
            }
        }
        const result = await runPm2({ command, args: fullArgs });
        return result.stdout || result.stderr;
    }

    const result = await runPm2({ command, args });
    return result.stdout || result.stderr;
}

function streamLogs() {
    const { command, args } = commands.logs;
    return spawn(command, [...args], {
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
