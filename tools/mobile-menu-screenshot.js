// Capture le burger menu ouvert (clique sur le label)
import puppeteer from 'puppeteer-core';

const [url, outPath] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new', args: ['--no-sandbox', '--disable-gpu']
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
});
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
// Coche la checkbox pour ouvrir le menu
await page.evaluate(() => { document.getElementById('nav-toggle').checked = true; });
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log(`✅ ${outPath}`);
