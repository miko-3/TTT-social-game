// Builds demo.html: the client with the engine inlined (runs fully in the browser, no server).
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8'), eng = fs.readFileSync(__dirname + '/engine.js', 'utf8');
fs.writeFileSync(__dirname + '/demo.html', html.replace('<!--ENGINE-->', () => '<script>' + eng + '</script>'));
console.log('demo.html written');
