const fs = require('fs');
const cheerio = require('cheerio');

const p = 'C:/Users/dizay/Downloads/ielts_academic_reading_full_test.html';
if (fs.existsSync(p)) {
    const html = fs.readFileSync(p, 'utf8');
    const $ = cheerio.load(html);
    
    for (let num = 1; num <= 3; num++) {
        console.log(`\n================ PASSAGE ${num} ================`);
        const $pass = $(`#passage${num}`);
        const title = $pass.find('h1, h2, h3, h4, .pass-title').first().text().trim() || $pass.find('.title').first().text().trim();
        console.log('Title:', title || 'None found');
        console.log('Passage HTML Length:', $pass.html()?.length || 0);
        console.log('Passage Text snippet:', $pass.text().replace(/\s+/g, ' ').substring(0, 300) + '...');
        
        const $qs = $(`#questions${num}`);
        console.log('Questions Container HTML Length:', $qs.html()?.length || 0);
        
        // Print all headers and child structures inside questions
        $qs.children().each((idx, child) => {
            const tagName = child.name;
            const className = $(child).attr('class') || '';
            const id = $(child).attr('id') || '';
            const text = $(child).text().replace(/\s+/g, ' ').trim().substring(0, 100);
            console.log(`  Child #${idx + 1}: <${tagName} class="${className}" id="${id}"> - "${text}..."`);
        });
    }
}
