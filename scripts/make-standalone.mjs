// Сборка standalone-файла: инлайнит dist/assets/*.css и *.js в dist/index.html.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const media = assets.filter(name => !/\.(css|js)$/.test(name)).map(name => {
  const ext = name.split('.').at(-1);
  const mime = { png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', jpg: 'image/jpeg', woff2: 'font/woff2' }[ext];
  if (!mime) throw new Error('Unsupported standalone asset: ' + name);
  return [name, `data:${mime};base64,${readFileSync(join(dist, 'assets', name)).toString('base64')}`];
});
for (const name of assets) {
  if (!/\.(css|js)$/.test(name)) continue;
  let content = readFileSync(join(dist, 'assets', name), 'utf8');
  for (const [file, data] of media) content = content.replaceAll('./assets/' + file, data).replaceAll('/assets/' + file, data).replaceAll(file, data);
  if (name.endsWith('.css')) {
    html = html.replace(new RegExp('<link[^>]*' + name + '[^>]*>'), () => '<style>\n' + content + '\n</style>');
  } else if (name.endsWith('.js')) {
    html = html.replace(new RegExp('<script[^>]*' + name + '[^>]*></script>'), () => '<script type="module">\n' + content.replace(/<\/script>/g, '<\\/script>') + '\n</script>');
  }
}
writeFileSync('vochko_pvp_standalone.html', html);
console.log('OK vochko_pvp_standalone.html bytes=' + html.length);
