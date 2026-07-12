const fs = require('fs');
const html = fs.readFileSync('C:/Users/dizay/Downloads/ielts_listening_test.html', 'utf8');
const start = html.indexOf('class="tour-table"');
if (start !== -1) {
    // print 2000 characters from start
    console.log(html.substring(start - 100, start + 2500));
} else {
    console.log('tour-table not found');
}
