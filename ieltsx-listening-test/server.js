const express = require('express');
const path = require('path');

const app = express();
const PORT = 30004;

// Serve the static site at /listening/fulltest
app.use('/listening/fulltest', express.static(path.join(__dirname)));

// Optional root redirect to the test
app.get('/', (req, res) => {
  res.redirect('/listening/fulltest/');
});

app.listen(PORT, () => {
  console.log(`IELTSX Listening Test server is running at http://localhost:${PORT}/listening/fulltest`);
});
