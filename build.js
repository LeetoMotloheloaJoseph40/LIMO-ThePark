// build.js - makes index.html: one file with the assembler and the example programs inside it,
// so the page works by double-clicking it, and on GitHub Pages, with no server and no installs.
// Run:  node build.js      (re-run it after you change anything in src/ or examples/)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Remove the "import ... from './isa.js'" line and the word "export", so the code can sit in a web page.
function inline(code) {
  return code.replace(/import\s*\{[^}]*\}\s*from\s*'\.\/isa\.js';/, '').replace(/^export /gm, '');
}

const assemblerCode = inline(read('./src/isa.js')) + '\n' + inline(read('./src/assembler.js'));

const examples = {};
for (const file of readdirSync(new URL('./examples/', import.meta.url)).sort()) {
  if (file.endsWith('.limo')) examples[file.replace('.limo', '')] = read('./examples/' + file);
}

let html = read('./page.template.html');
html = html.replace('/*ASSEMBLER*/', () => `const LIMO = (function () {\n${assemblerCode}\nreturn { assemble };\n})();`);
html = html.replace('/*EXAMPLES*/', () => 'const EXAMPLES = ' + JSON.stringify(examples) + ';');
writeFileSync(new URL('./src/index.html', import.meta.url), html);
console.log('src/index.html written (' + html.length + ' bytes)');
