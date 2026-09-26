#!/bin/sh
# Bundles src/ into ONE self-contained HTML file (three.js inlined, works offline).
# Outputs (generated, do not edit by hand):
#   docs/index.html                         -> published by GitHub Pages
#   ~/Desktop/Web-Files/neural-brain.html   -> local copy for the projector
#   ~/Desktop/Web-Files/neural-brain-qr.png -> QR code for the slides
#   docs/next/index.html                    -> "what should I teach next" form (src/next.html)
#   docs/results/index.html                 -> live ratings dashboard (src/results.html)
#   ~/Desktop/Web-Files/next-topic-{form,results}.html + next-topic-qr.png
set -e
cd "$(dirname "$0")"
URL="https://dayvonmp4.github.io/neural-brain/"
mkdir -p dist docs
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=dist/app.js --log-level=warning
URL="$URL" node --input-type=module - <<'EOF'
import fs from 'node:fs';
import os from 'node:os';
import QRCode from 'qrcode';
const url = process.env.URL;
const qr = await QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#020409', light: '#ffffff' } });
const app = fs.readFileSync('dist/app.js', 'utf8').replaceAll('</script', '<\\/script');
const html = fs.readFileSync('src/index.html', 'utf8')
  .replace('<!--__QR__-->', qr)
  .replace('__URL_SHORT__', url.replace(/^https:\/\//, '').replace(/\/$/, ''))
  .replace('/*__APP__*/', () => app);
const local = `${os.homedir()}/Desktop/Web-Files/neural-brain.html`;
fs.writeFileSync('docs/index.html', html);
fs.writeFileSync(local, html);
await QRCode.toFile(`${os.homedir()}/Desktop/Web-Files/neural-brain-qr.png`, url, { width: 1024, margin: 2 });
console.log('wrote docs/index.html + ' + local, Math.round(html.length / 1024) + ' KB');
const nextUrl = url + 'next/';
// Ratings pipeline: the form posts to, and the results page reads from, the Apps Script web app.
const endpoint = fs.existsSync('apps-script/endpoint.txt') ? fs.readFileSync('apps-script/endpoint.txt', 'utf8').trim() : '';
const formQr = await QRCode.toString(nextUrl, { type: 'svg', margin: 0, color: { dark: '#020409', light: '#ffffff' } });
const next = fs.readFileSync('src/next.html', 'utf8').replaceAll('__ENDPOINT__', endpoint);
const results = fs.readFileSync('src/results.html', 'utf8').replaceAll('__ENDPOINT__', endpoint).replace('<!--__FORM_QR__-->', formQr);
fs.mkdirSync('docs/next', { recursive: true });
fs.mkdirSync('docs/results', { recursive: true });
fs.writeFileSync('docs/next/index.html', next);
fs.writeFileSync('docs/results/index.html', results);
fs.writeFileSync(`${os.homedir()}/Desktop/Web-Files/next-topic-form.html`, next);
fs.writeFileSync(`${os.homedir()}/Desktop/Web-Files/next-topic-results.html`, results);
await QRCode.toFile(`${os.homedir()}/Desktop/Web-Files/next-topic-qr.png`, nextUrl, { width: 1024, margin: 2 });
console.log('wrote docs/next + docs/results' + (endpoint ? ' -> ' + endpoint.slice(0, 60) + '...' : ' (no endpoint yet: form keeps ratings on-device)'));
EOF
