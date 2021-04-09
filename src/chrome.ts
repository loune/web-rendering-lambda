import puppeteer from 'puppeteer';
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
    closeBrowser();
  }

  return false;
}

export async function findChrome(isLambda: boolean): Promise<string | undefined> {
  if (!isLambda) {
    return undefined;
  }

  const tmpPath = '/tmp';
  const chromePathUncompressed = path.join(__dirname, chromeExeFilname);

  if (fs.existsSync(chromePathUncompressed)) {
    return chromePathUncompressed;
  }

  const chromePathTmp = path.join(tmpPath, chromeExeFilname);
  const chromePathTgz = path.join(__dirname, chromeTgzFilename);

  if (fs.existsSync(chromePathTmp)) {
    return chromePathTmp;
  }

  if (fs.existsSync(chromePathTgz)) {
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(chromePathTgz)
        .on('error', err => reject(err))
        .pipe(
          tar.x({
            C: tmpPath,
          })
        )
        .on('error', err => reject(err))
        .on('end', () => resolve());
    });

    return chromePathTmp;
  }

  if (chromeS3Bucket) {
    const s3 = new aws.S3({ apiVersion: '2006-03-01' });
    // s3
    await new Promise<void>((resolve, reject) => {
      const params = {
        Bucket: chromeS3Bucket,
        Key: chromeTgzFilename,
      };
      s3.getObject(params)
        .createReadStream()
        .on('error', err => reject(err))
        .pipe(
          tar.x({
            C: tmpPath,
          })
        )
        .on('error', err => reject(err))
        .on('end', () => resolve());
    });
    return chromePathTmp;
  }

  return undefined;
}

function copyPackagedFonts(): void {
  if (process.env.HOME === undefined) {
    process.env.HOME = '/tmp';
  }

  const home = process.env.HOME;
  const srcFontDir = path.join(__dirname, 'fonts');
  const destFontDir = path.join(home, '.fonts');
  if (fs.existsSync(srcFontDir) !== true) {
    return;
  }
  if (fs.existsSync(destFontDir) !== true) {
    fs.mkdirSync(destFontDir);
  }

  const fontFiles = fs.readdirSync(srcFontDir);
  fontFiles.forEach(f => fs.copyFileSync(path.join(srcFontDir, f), path.join(destFontDir, f.replace(' ', '+'))));
}

export async function getBrowser(
  mode: BrowserMode,
  externalFontUrls: string[] | null = null
): Promise<puppeteer.Browser> {
  if (browser && (await browserOk(browser))) {
    return browser;
  }

  if (mode === 'lambda') {
    // load fonts
    copyPackagedFonts();
    if (externalFontUrls) {
      await Promise.all(externalFontUrls.map(url => chromiumLambda.font(url)));
    }

    browser = (await chromiumLambda.puppeteer.launch({
      args: chromiumLambda.args,
      defaultViewport: chromiumLambda.defaultViewport,
      executablePath: await chromiumLambda.executablePath,
      headless: chromiumLambda.headless,
    })) as puppeteer.Browser;
  } else {
    const executablePath = await findChrome(false);

    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: undefined,
      dumpio: false,
      executablePath: executablePath,
      args: mode === 'docker' ? launchOptionForLambda : undefined,
    });
  }

  return browser;
}
