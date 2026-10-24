'use strict';

const { execSync } = require('child_process');

try {
    const raw = execSync('wmic process where "name=\'chrome.exe\'" get ProcessId,CommandLine', { encoding: 'utf8' });
    const lines = raw.split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
        if (line.includes('wwebjs_auth') || line.includes('--headless')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (/^\d+$/.test(pid)) {
                try {
                    execSync(`taskkill /F /PID ${pid}`);
                    console.log(`Killed Chrome PID: ${pid}`);
                    count++;
                } catch (e) {}
            }
        }
    }
    console.log(`Finished. Terminated ${count} orphaned Chrome instances.`);
} catch (e) {
    console.log('Finished with status:', e.message);
}
