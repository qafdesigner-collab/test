process.removeAllListeners('warning'); // hide node:sqlite experimental notice
const express = require('express');
const path = require('path');
const { seed } = require('./src/db');
const { attachUser } = require('./src/auth');

seed();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
app.use(attachUser);
app.use('/api', require('./src/routes'));
app.use(express.static(path.join(__dirname, 'public')));
app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`🎈 Kids LMS running at http://localhost:${PORT}`));
module.exports = app;
