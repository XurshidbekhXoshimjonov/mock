const text = "B She doesn't mind it";
const optValue = "B";
const match1 = text.match(new RegExp(`^${optValue}\\b[\\s.:\\u2013\\u2014-—]+(.+)$`));
console.log("Escaped Match:", match1);
