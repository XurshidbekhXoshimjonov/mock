const fs = require('fs');
const path = require('path');

const targetFiles = ['reading-translation.js', 'reading-cbt-app.js', 'full-test-player.html'];
const vercelDir = '.vercel';

function check(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) {
            check(p);
        } else {
            if (targetFiles.includes(f)) {
                console.log('Found duplicate in Vercel build:', p);
            }
        }
    });
}

check(vercelDir);
