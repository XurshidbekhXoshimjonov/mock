const http = require('http');

console.log("Sending GET to http://localhost:30004/writing/task-1...");
http.get('http://localhost:30004/writing/task-1', (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => {
        console.log(`Body length: ${body.length}`);
        console.log(`Body contains selectorScreen: ${body.includes('id="selectorScreen"')}`);
        console.log(`Body contains globalNavbar: ${body.includes('id="globalNavbar"')}`);
    });
}).on('error', (err) => {
    console.error("GET failed:", err.message);
});
