'use strict';

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', '.wwebjs_auth', 'session-comp_1792869695336');
console.log('Testing access to:', target);

try {
    const files = fs.readdirSync(target);
    console.log('Files count in session-comp_1792869695336:', files.length);
    console.log('Sample files:', files.slice(0, 10));
} catch (e) {
    console.error('Error reading session dir:', e.message);
}
