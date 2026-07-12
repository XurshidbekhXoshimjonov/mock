const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
    if (line.includes('full-test-player') || line.includes('reading-template') || line.includes('.html')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
});
