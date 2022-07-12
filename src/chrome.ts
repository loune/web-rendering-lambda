import puppeteer from 'puppeteer-core';
import chromiumLambda from 'chrome-aws-lambda';
import * as path from 'path';
import * as fs from 'fs';
import tar from 'tar';
import * as aws from 'aws-sdk';

export type BrowserMode = 'lambda' | 'docker' | 'local';

const chromeS3Bucket = 'your-bucket-here';
const chromeTgzFilename = 'headless-chromium.tar.gz';
const chromeExeFilname = 'headless-chromium';

const launchOptionForLambda = [
  // error when launch(); No usable sandbox! Update your kernel
  '--no-sandbox',
  // error when launch(); Failed to load libosmesa.so
  '--disable-gpu',
  // freeze when newPage()
  '--single-process',

  '--disable-webaudio',
  '--disable-dev-shm-usage',
  '--autoplay-policy=user-gesture-required', // https://source.chromium.org/search?q=lang:cpp+symbol:kAutoplayPolicy&ss=chromium
  '--disable-blink-features=AutomationControlled', // https://blog.m157q.tw/posts/2020/09/11/bypass-cloudflare-detection-while-using-selenium-with-chromedriver/
  '--disable-cloud-import',
  '--disable-component-update', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableComponentUpdate&ss=chromium
  '--disable-domain-reliability', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableDomainReliability&ss=chromium
  '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process', // https://source.chromium.org/search?q=file:content_features.cc&ss=chromium
  '--disable-gesture-typing',
  '--disable-infobars',
  '--disable-notifications',
  '--disable-offer-store-unmasked-wallet-cards',
  '--disable-offer-upload-credit-cards',
  '--disable-print-preview', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisablePrintPreview&ss=chromium
  '--disable-setuid-sandbox', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSetuidSandbox&ss=chromium
  '--disable-site-isolation-trials', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSiteIsolation&ss=chromium
  '--disable-speech-api', // https://source.chromium.org/search?q=lang:cpp+symbol:kDisableSpeechAPI&ss=chromium
  '--disable-tab-for-desktop-share',
  '--disable-translate',
  '--disable-voice-input',
  '--disable-wake-on-wifi',
  '--enable-async-dns',
  '--enable-simple-cache-backend',
  '--enable-tcp-fast-open',
  '--enable-webgl',
  '--force-webrtc-ip-handling-policy=default_public_interface_only',
  '--ignore-gpu-blocklist', // https://source.chromium.org/search?q=lang:cpp+symbol:kIgnoreGpuBlocklist&ss=chromium
  '--in-process-gpu', // https://source.chromium.org/search?q=lang:cpp+symbol:kInProcessGPU&ss=chromium
  '--no-default-browser-check', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoDefaultBrowserCheck&ss=chromium
  '--no-pings', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoPings&ss=chromium
  '--no-sandbox', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoSandbox&ss=chromium
  '--no-zygote', // https://source.chromium.org/search?q=lang:cpp+symbol:kNoZygote&ss=chromium
  '--prerender-from-omnibox=disabled',
  '--use-gl=swiftshader', // https://source.chromium.org/search?q=lang:cpp+symbol:kUseGl&ss=chromium
];

let browser: puppeteer.Browser | null = null;
export let version: string | null = null;

export async function closeBrowser(): Promise<void> {
  try {
    if (browser) {
      await browser.close();
    }
  } catch (e) {
    console.error(e);
  }

  version = null;
  browser = null;
}

async function browserOk(browser: puppeteer.Browser | null): Promise<boolean> {
  if (!browser) {
    return false;
  }

  try {
    version = await browser.version();
    return true;
  } catch (e) {
    await closeBrowser();
  }

  return false;
}

export async function getBrowser(
  mode: BrowserMode
): Promise<puppeteer.Browser> {
  if (browser && (await browserOk(browser))) {
    return browser;
  }

  if (mode === 'lambda') {
    browser = (await chromiumLambda.puppeteer.launch({
      args: chromiumLambda.args,
      executablePath: await chromiumLambda.executablePath,
      defaultViewport: chromiumLambda.defaultViewport,
      headless: chromiumLambda.headless,
      ignoreHTTPSErrors: true,
    })) as puppeteer.Browser;
  } else {
    browser = await puppeteer.launch({
      executablePath: process.env.APP_PUPPETEER_EXECUTABLE,
      headless: true,
      defaultViewport: undefined,
      dumpio: false,
      args: mode === 'docker' ? launchOptionForLambda : undefined,
    });
  }

  return browser;
}
