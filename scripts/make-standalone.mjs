// Сборка standalone-файла: инлайнит dist/assets/*.css и *.js в dist/index.html.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
for (const name of assets) {
  const content = readFileSync(join(dist, 'assets', name), 'utf8');
  if (name.endsWith('.css')) {
    html = html.replace(new RegExp('<link[^>]*' + name + '[^>]*>'), () => '<style>\n' + content + '\n</style>');
  } else if (name.endsWith('.js')) {
    html = html.replace(new RegExp('<script[^>]*' + name + '[^>]*></script>'), () => '<script type="module">\n' + content.replace(/<\/script>/g, '<\\/script>') + '\n</script>');
  }
}
writeFileSync('vochko_pvp_standalone.html', html);
console.log('OK vochko_pvp_standalone.html bytes=' + html.length);
