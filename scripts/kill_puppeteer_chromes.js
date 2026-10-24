'use strict';

const { execSync } = require('child_process');

try {
    const raw = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = \'node.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"', { encoding: 'utf8' });
    const procs = JSON.parse(raw);
    const list = Array.isArray(procs) ? procs : [procs];
    console.log(`Found ${list.length} Node processes:`);
    for (const p of list) {
        console.log(`PID: ${p.ProcessId} -> ${p.CommandLine}`);
    }
} catch (e) {
    console.error('Error:', e.message);
}
