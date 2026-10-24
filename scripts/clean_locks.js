'use strict';

const fs = require('fs');
const path = require('path');

const authDir = path.join(__dirname, '..', '.wwebjs_auth');
console.log('Inspecting:', authDir);

if (fs.existsSync(authDir)) {
    const sessions = fs.readdirSync(authDir);
    console.log('Sessions in auth dir:', sessions);

    for (const s of sessions) {
        const sessionPath = path.join(authDir, s);
        if (fs.statSync(sessionPath).isDirectory()) {
            const files = fs.readdirSync(sessionPath);
            const lockFiles = files.filter(f => f.toLowerCase().includes('singleton') || f.toLowerCase().includes('lock'));
            console.log(`Session ${s} lock files:`, lockFiles);
            for (const lf of lockFiles) {
                const fullLockPath = path.join(sessionPath, lf);
                try {
                    fs.unlinkSync(fullLockPath);
                    console.log(`Removed stale lock file: ${fullLockPath}`);
                } catch (e) {
                    console.error(`Cannot remove ${lf} (possibly in use):`, e.message);
                }
            }
        }
    }
}
