// C:\Users\USER\kerjaaaaaa/build-static.js
const fs = require('fs');
const path = require('path');

const pubDir = path.join(__dirname, 'public');
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

const htmlContent = fs.readFileSync(path.join(__dirname, 'kantor-tim-3d.html'), 'utf8');
fs.writeFileSync(path.join(pubDir, 'index.html'), htmlContent, 'utf8');
console.log('Static build ready in public/');
