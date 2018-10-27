import puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import tar from 'tar';
import * as aws from 'aws-sdk';

const chromeS3Bucket = 'chrome-html';
const chromeTgzFilename = 'headless-chromium.tar.gz';
const chromeExeFilname = 'headless-chromium';

const launchOptionForLambda = [
  // error when launch(); No usable sandbox! Update your kernel
  '--no-sandbox',
  // error when launch(); Failed to load libosmesa.so
  '--disable-gpu',
  // freeze when newPage()
  '--single-process'
];

let browser = null;
export let version = null;

export async function closeBrowser(): Promise<void> {
  try {
    if (browser) {
      await browser.close();
    }
  } catch(e) {
    console.error(e);
  }

  version = null;
  browser = null;
}

async function browserOk(browser: puppeteer.Browser): Promise<boolean> {
  if (!browser) {
    return false;
  }

  try {
    version = await browser.version();
    return true;
  } catch(e) {
    closeBrowser();
  }

  return false;
}

export async function findChrome(isLambda): Promise<string> {
  if (!isLambda) {
    return undefined;
  }

  let tmpPath = '/tmp';
  let chromePathUncompressed = path.join(__dirname, chromeExeFilname);

  if (fs.existsSync(chromePathUncompressed)) {
    return chromePathUncompressed;
  }

  let chromePathTmp = path.join(tmpPath, chromeExeFilname);
  let chromePathTgz = path.join(__dirname, chromeTgzFilename);

  if (fs.existsSync(chromePathTmp)) {
    return chromePathTmp;
  }

  if (fs.existsSync(chromePathTgz)) {
    await new Promise((resolve, reject) => {
      fs.createReadStream(chromePathTgz)
        .on('error', err => reject(err))
        .pipe(
          tar.x({
            C: tmpPath
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
    await new Promise((resolve, reject) => {
      const params = {
        Bucket: chromeS3Bucket,
        Key: chromeTgzFilename
      };
      s3.getObject(params)
        .createReadStream()
        .on('error', err => reject(err))
        .pipe(
          tar.x({
            C: tmpPath
          })
        )
        .on('error', err => reject(err))
        .on('end', () => resolve());
    });
    return chromePathTmp;
  }

  return undefined;
}

export async function getBrowser(isLambda: boolean): Promise<puppeteer.Browser> {
  if (await browserOk(browser)) {
    return browser;
  }

  let executablePath = await findChrome(isLambda);

  browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    dumpio: false,
    executablePath: isLambda ? executablePath : undefined,
    args: isLambda ? launchOptionForLambda : undefined
  });

  return browser;
}
