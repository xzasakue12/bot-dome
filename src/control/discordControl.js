#!/usr/bin/env node

const readline = require('readline');
const {
    APP_NAME,
    commands,
    runPm2,
    startBot,
    stopBot,
    restartBot,
    getStatus
} = require('./pm2Controller');

function prompt(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function handleStart() {
    console.log(`\n▶ Starting ${APP_NAME}...\n`);
    try {
        const output = await startBot();
        if (output) {
            process.stdout.write(output);
        }
    } catch (error) {
        console.error(error.message || error);
        if (error.stdout) process.stdout.write(error.stdout);
        if (error.stderr) process.stderr.write(error.stderr);
    }
}

async function handleStop() {
    console.log(`\n⏹ Stopping ${APP_NAME}...\n`);
    try {
        const output = await stopBot();
        if (output) {
            process.stdout.write(output);
        }
    } catch (error) {
        console.error(error.message || error);
        if (error.stdout) process.stdout.write(error.stdout);
        if (error.stderr) process.stderr.write(error.stderr);
    }
}

async function handleRestart() {
    console.log(`\n🔄 Restarting ${APP_NAME}...\n`);
    try {
        const output = await restartBot();
        if (output) {
            process.stdout.write(output);
        }
    } catch (error) {
        console.error(error.message || error);
        if (error.stdout) process.stdout.write(error.stdout);
        if (error.stderr) process.stderr.write(error.stderr);
    }
}

async function handleStatus() {
    console.log(`\n📊 ${APP_NAME} status:\n`);
    try {
        const status = await getStatus();
        if (status) {
            process.stdout.write(status);
        }
    } catch (error) {
        console.error(error.message || error);
    }
    console.log();
}

async function handleLogs() {
    console.log(`\n📝 Streaming logs for ${APP_NAME}. Press Ctrl+C to return.\n`);
    await runPm2(commands.logs, { stream: true }).catch((error) => {
        console.error(error.message || error);
    });
    console.log();
}

function showMenu() {
    console.log('==============================================');
    console.log('  Discord Music Bot - Control Panel');
    console.log('==============================================');
    console.log('[1] Start Bot');
    console.log('[2] Stop Bot');
    console.log('[3] Restart Bot');
    console.log('[4] View Bot Status');
    console.log('[5] View Bot Logs');
    console.log('[6] Exit');
}

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let running = true;

    while (running) {
        showMenu();
        const choice = (await prompt(rl, '\nSelect an option (1-6): ')).trim();

        switch (choice) {
            case '1':
                await handleStart();
                break;
            case '2':
                await handleStop();
                break;
            case '3':
                await handleRestart();
                break;
            case '4':
                await handleStatus();
                break;
            case '5':
                await handleLogs();
                break;
            case '6':
                running = false;
                break;
            default:
                console.log('\nInvalid option. Please choose between 1 and 6.\n');
                break;
        }
    }

    rl.close();
    console.log('\nGoodbye!');
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { main };
