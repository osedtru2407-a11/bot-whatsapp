'use strict';

const { execSync } = require('child_process');

try {
    const raw = execSync('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine', { encoding: 'utf8' });
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
        if (line.includes('server.js') && !line.includes('kill_node_server.js')) {
            console.log('Found running server process:', line.trim());
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (/^\d+$/.test(pid) && parseInt(pid, 10) !== process.pid) {
                try {
                    execSync(`taskkill /F /PID ${pid}`);
                    console.log(`Killed node server PID: ${pid}`);
                } catch (e) {
                    console.error('Error killing PID:', e.message);
                }
            }
        }
    }
} catch (e) {
    console.error('Error:', e.message);
}
