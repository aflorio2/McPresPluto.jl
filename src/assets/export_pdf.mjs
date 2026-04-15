#!/usr/bin/env node
// MCPresPluto PDF exporter — requires: npm install -g playwright && npx playwright install chromium

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const [exportUrl, outputPath] = process.argv.slice(2);
if (!exportUrl || !outputPath) {
  console.error('Usage: node export_pdf.mjs <pluto-export-url> <output.pdf>');
  process.exit(1);
}

const mcpresScript = readFileSync(join(__dirname, 'mcpres.js'), 'utf8');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1200, height: 850 },
});
const page = await context.newPage();

// Strip Content-Disposition: attachment so Playwright renders the HTML as a page
await page.route(exportUrl, async route => {
  const response = await route.fetch();
  const headers = response.headers();
  delete headers['content-disposition'];
  await route.fulfill({ response, headers });
});

console.log('Loading static export...');
await page.goto(exportUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

// Wait for slide elements to appear
await page.waitForSelector('[data-mcpres-slide]', { timeout: 120000 });
await page.waitForTimeout(1000);

// Inject slide engine and enter print mode
await page.evaluate(mcpresScript);
await page.evaluate(() => window.__mcpres.enterPrintMode());
await page.waitForSelector('#mcpres-print-layout', { timeout: 15000 });

// Force correct layout in @media print — prevents Pluto's own print CSS from interfering
await page.evaluate(() => {
  const s = document.createElement('style');
  s.textContent = `
    @media print {
      body > *:not(#mcpres-print-layout) { display: none !important; }
      #mcpres-print-layout { display: block !important; padding: 0 !important; margin: 0 !important; max-width: none !important; }
      #mcpres-print-layout .mcpres-double-panels { display: grid !important; grid-template-columns: 47fr 2px 53fr !important; height: calc(210mm - 4.5em) !important; align-items: stretch !important; }
      #mcpres-print-layout .mcpres-panel-left, #mcpres-print-layout .mcpres-panel-right { display: block !important; min-height: 0; overflow: hidden; padding: 1em 2em !important; }
      #mcpres-print-layout .mcpres-content-single { padding: 1em 2em !important; }
      #mcpres-print-layout .mcpres-divider { background: var(--mcpres-colour) !important; opacity: 0.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 2px !important; align-self: stretch !important; }
    }
  `;
  document.head.appendChild(s);
});

// Wait for KaTeX
await page.waitForTimeout(1500);

await page.pdf({
  path: outputPath,
  format: 'A4',
  landscape: true,
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});

await browser.close();
console.log('Saved:', outputPath);
