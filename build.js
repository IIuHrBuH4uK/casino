const fs = require('fs');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const games = fs.readFileSync(path.join(dir, 'games.js'), 'utf8');

if (css.includes('</style>') || app.includes('</script>') || games.includes('</script>')) {
  console.error('ERROR: найдены конфликтующие маркеры в исходниках');
  process.exit(1);
}

let out = html.replace(/<link rel="stylesheet" href="style\.css(?:\?[^"]*)?"\s*>/,
  () => '<style>\n' + css + '\n</style>');
out = out.replace(/<script src="app\.js(?:\?[^"]*)?"\s*><\/script>/,
  () => '<script>\n' + app + '\n</script>');
out = out.replace(/<script src="games\.js(?:\?[^"]*)?"\s*><\/script>/,
  () => '<script>\n' + games + '\n</script>');

fs.writeFileSync(path.join(dir, 'casino.html'), out);
console.log('OK: casino.html собрано (' + Math.round(out.length / 1024) + ' КБ)');