// Utility functions for logging
const lastLogs = new Map();

function logOnce(key, message) {
    if (lastLogs.get(key) !== message) {
        console.log(message);
        lastLogs.set(key, message);
    }
}

function warnOnce(key, message) {
    if (lastLogs.get(key) !== message) {
        console.warn(message);
        lastLogs.set(key, message);
    }
}

function errorOnce(key, message) {
    if (lastLogs.get(key) !== message) {
        console.error(message);
        lastLogs.set(key, message);
    }
}

module.exports = { logOnce, warnOnce, errorOnce };