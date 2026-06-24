const fs = require('fs');

if (fs.existsSync('reading-cbt.css')) {
    console.log("Printing reading-cbt.css L214-250...");
    const content = fs.readFileSync('reading-cbt.css', 'utf8');
    const lines = content.split('\n');
    for (let i = 213; i < 250; i++) {
        console.log(`${i+1}: ${lines[i]}`);
    }
}
