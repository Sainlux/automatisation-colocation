// Capture une vraie émulation mobile (CDP setDeviceMetricsOverride)
// Usage : node tools/mobile-screenshot.js <url> <output.png> [width=390] [height=844]
import puppeteer from 'puppeteer-core';

const [url, outPath, wArg, hArg] = process.argv.slice(2);
if (!url || !outPath) {
  console.error('Usage : node tools/mobile-screenshot.js <url> <out.png> [w] [h]');
  process.exit(1);
}
const width = parseInt(wArg || '390', 10);
const height = parseInt(hArg || '844', 10);

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu']
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

// Mesure les dimensions réelles vs viewport pour détecter l'overflow
const metrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  innerWidth: window.innerWidth,
  // Cherche les éléments qui débordent
  overflowing: [...document.querySelectorAll('*')].slice(0, 5000)
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.right > window.innerWidth + 1 && r.width > 0;
    })
    .slice(0, 8)
    .map(el => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 80),
      width: Math.round(el.getBoundingClientRect().width),
      right: Math.round(el.getBoundingClientRect().right),
      text: (el.textContent || '').trim().slice(0, 40)
    }))
}));
console.log(JSON.stringify(metrics, null, 2));

await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log(`✅ ${outPath}`);
