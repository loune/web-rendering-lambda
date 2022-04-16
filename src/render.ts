import type { APIGatewayProxyResult, APIGatewayEvent, Context } from 'aws-lambda';
import { Browser, ScreenshotOptions, ElementHandle, PDFOptions, PaperFormat, Page } from 'puppeteer';
import Ajv, { ValidateFunction } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import fs from 'fs';
import path from 'path';
import { NodeVM } from 'vm2';
import { getBrowser, closeBrowser, version, BrowserMode } from './chrome';
import { archiveBase64, archiveToS3, saveToS3 } from './archive';
import { getAuthorisedToken } from './authorization';
import config from './config';

export interface Query {
  url: string;
  type: 'png' | 'jpeg' | 'pdf';
  width?: number;
  height?: number;
  fullpage?: boolean;
  /** warm up the browser */
  warm?: string;
}

interface RenderPageConfigViewport {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}

interface RenderPageConfigMargin {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

interface RenderPageConfigPdf {
  margin?: RenderPageConfigMargin;
  width?: string;
  height?: string;
  format?: PaperFormat;
  scale?: number;
  landscape?: boolean;
  printBackground?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

interface RenderPageConfig {
  type: 'png' | 'jpeg' | 'pdf';
  url?: string;
  content?: string;
  viewport?: RenderPageConfigViewport;
  jpegQuality?: number;
  fullPage?: boolean;
  transparentBackground?: boolean;
  media?: 'screen' | 'print';
  timeout?: number;
  saveFilename?: string;
  cookies?: { [name: string]: string };
  headers?: { [name: string]: string };
  pdf?: RenderPageConfigPdf;
  userAgent?: string;
  selector?: string;
  script?: string;
}

interface RenderOnlyPageConfig extends RenderPageConfig {
  encoding?: 'raw' | 'base64';
  saveS3Bucket?: string;
  saveS3Region?: string;
}

interface RenderMultiplePageConfig {
  type: 'zip';
  encoding?: 'raw' | 'base64';
  pages: RenderPageConfig[];
  saveFilename?: string;
  saveS3Bucket?: string;
  saveS3Region?: string;
}

interface RenderScriptConfig {
  type: 'script';
  script: string;
}

export type RenderConfig = RenderOnlyPageConfig | RenderMultiplePageConfig | RenderScriptConfig;

enum formatContentType {
  zip = 'application/zip',
  pdf = 'application/pdf',
  png = 'image/png',
  jpeg = 'image/jpeg',
}

const defaultTimeout = 10000;
const defaultViewportWidth = 1280;
const defaultViewportHeight = 800;
const defaultViewportdeviceScaleFactor = 1;

let globalValidate: { validate: ValidateFunction; schema: string } | undefined;

function getValidator(): { validate: ValidateFunction; schema: string } {
  if (globalValidate) {
    return globalValidate;
  }

  const ajv = new Ajv();
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'render_config_schema.json'), 'utf-8'));
  globalValidate = { validate: ajv.compile(schema), schema };
  return globalValidate;
}

async function renderScript(browser: Browser, page: Page | undefined, script: string): Promise<void> {
  const vm = new NodeVM({
    console: 'inherit',
    sandbox: {
      browser,
      ...(page ? { page } : {}),
    },
    require: {
      external: true,
    },
  });

  try {
    const scriptFunc = vm.run(
      `async function f() { ${script} }` + `module.exports = function myscript(res, rej) { f().then(res).catch(rej) }`
    );

    await new Promise((resolve, rej) => {
      scriptFunc(resolve, rej);
    });
  } catch (err) {
    console.error('Failed to execute script.', err);
  }
}

async function renderPage(
  browser: Browser,
  config: RenderPageConfig,
  encoding: 'base64' | 'binary'
): Promise<string | Buffer> {
  const page = await browser.newPage();

  // clear cookies
  await (page as any)._client.send('Network.clearBrowserCookies');

  if (config.viewport) {
    await page.setViewport({
      width: Number(config.viewport.width) || defaultViewportWidth,
      height: Number(config.viewport.height) || defaultViewportHeight,
      deviceScaleFactor: Number(config.viewport.deviceScaleFactor) || defaultViewportdeviceScaleFactor,
    });
  } else {
    await page.setViewport({
      width: defaultViewportWidth,
      height: defaultViewportHeight,
      deviceScaleFactor: defaultViewportdeviceScaleFactor,
    });
  }

  await page.setCacheEnabled(false);
  if (config.cookies) {
    await Promise.all(
      Object.keys(config.cookies).map(name =>
        page.setCookie({ name, value: config.cookies?.[name] || '', url: config.url })
      )
    );
  }

  if (config.headers) {
    await page.setExtraHTTPHeaders(config.headers);
  }

  if (config.userAgent) {
    await page.setUserAgent(config.userAgent);
  }

  if (config.media) {
    await page.emulateMediaType(config.media);
  }

  try {
    if (config.url) {
      await page.goto(config.url, {
        timeout: config.timeout || defaultTimeout,
        waitUntil: ['domcontentloaded', 'networkidle0'],
      });
    } else {
      await page.setContent(config.content || '', {
        timeout: config.timeout || defaultTimeout,
        waitUntil: ['domcontentloaded', 'networkidle0'],
      });
    }
  } catch (e: any) {
    if (e.name !== 'TimeoutError') {
      throw e;
    }
  }

  if (config.script) {
    await renderScript(browser, page, config.script);
  }

  let element: ElementHandle<any> | null = null;
  if (config.selector) {
    element = await page.$(config.selector);
  }

  let result: Buffer | string;
  if (config.type === 'pdf') {
    if (element) {
      throw new Error('selector not compatible with type pdf');
    }

    const pdfOptions: PDFOptions = {};

    if (config.pdf) {
      if (config.pdf.format) {
        pdfOptions.format = config.pdf.format;
      }

      if (config.pdf.landscape) {
        pdfOptions.landscape = config.pdf.landscape;
      }

      if (config.pdf.scale) {
        pdfOptions.scale = config.pdf.scale;
      }

      if (config.pdf.margin) {
        pdfOptions.margin = config.pdf.margin;
      }

      if (config.pdf.width) {
        pdfOptions.width = config.pdf.width;
      }

      if (config.pdf.height) {
        pdfOptions.height = config.pdf.height;
      }

      if (config.pdf.headerTemplate || config.pdf.footerTemplate) {
        pdfOptions.displayHeaderFooter = true;
        pdfOptions.headerTemplate = config.pdf.headerTemplate || ' ';
        pdfOptions.footerTemplate = config.pdf.footerTemplate || ' ';
      }

      pdfOptions.printBackground = config.pdf.printBackground === undefined ? true : config.pdf.printBackground;
    }

    const buffer = await page.pdf(pdfOptions);
    result = encoding === 'base64' ? buffer.toString('base64') : buffer;
  } else {
    const options: ScreenshotOptions = {
      encoding,
      type: config.type,
      fullPage: config.fullPage,
      omitBackground: config.transparentBackground || false,
    };

    if (config.type === 'jpeg' && config.jpegQuality) {
      options.quality = config.jpegQuality;
    }

    if (element) {
      result = (await element.screenshot(options)) as string | Buffer;
    } else {
      result = (await page.screenshot(options)) as string | Buffer;
    }
  }

  page.close().catch(e => console.error(e));

  return result;
}

function errorResponse(statusCode: number, message: string | Record<string, unknown>): APIGatewayProxyResult {
  console.error(`${statusCode}: ${message}`);
  return {
    statusCode: statusCode,
    body: Buffer.from(typeof message === 'string' ? message : JSON.stringify(message), 'utf8').toString('base64'),
    headers: {
      'content-type': typeof message === 'string' ? 'text/plain' : 'application/json',
    },
    isBase64Encoded: true,
  };
}

export const render = async (browser: Browser, config: RenderConfig): Promise<APIGatewayProxyResult> => {
  let additionalHeaders = {};
  let resultB64: string;

  const oKResponse: (location?: string) => APIGatewayProxyResult = location => ({
    statusCode: 200,
    body: Buffer.from('OK').toString('base64'),
    headers: {
      'content-type': 'text/plain',
      ...(location ? { location } : {}),
    },
    isBase64Encoded: true,
  });

  // multi-page zip file
  if (config.type === 'zip') {
    if (!config.pages) {
      return errorResponse(400, `Missing pages property for zip`);
    }
    console.log(`Rendering ${config.pages.length} URLs to ${config.type}`);

    const bufs = await Promise.all(config.pages.map(page => renderPage(browser, page, 'binary')));
    const bufMap = new Map<string, Buffer>();
    bufs.forEach((value, i) =>
      bufMap.set(config.pages[i].saveFilename || `file${i}.${config.pages[i].type}`, value as Buffer)
    );

    if (config.saveS3Bucket) {
      if (!config.saveFilename || !config.saveS3Region) {
        return errorResponse(400, `Missing saveFilename or saveS3Region property for saving to S3`);
      }

      const s3response = await archiveToS3(
        bufMap,
        config.saveFilename,
        config.saveS3Bucket,
        config.saveS3Region,
        formatContentType[config.type]
      );

      return oKResponse(s3response.Location);
    }

    resultB64 = await archiveBase64(bufMap);
    //await archiveFile(bufMap, `${__dirname}/example.zip`);

    // script file
  } else if (config.type === 'script') {
    console.log(`Rendering with script ${config.script}`);

    await renderScript(browser, undefined, config.script);
    return oKResponse();

    // single image
  } else if (['jpeg', 'png', 'pdf'].includes(config.type)) {
    console.log(`Rendering ${config.url || 'content'} to ${config.type}`);
    if (config.saveS3Bucket) {
      if (!config.saveFilename || !config.saveS3Region) {
        return errorResponse(400, `Missing saveFilename or saveS3Region property for saving to S3`);
      }

      const result = await renderPage(browser, config, 'binary');
      const s3response = await saveToS3(
        result as Buffer,
        config.saveFilename,
        config.saveS3Bucket,
        config.saveS3Region,
        formatContentType[config.type]
      );
      return oKResponse(s3response.Location);
    }
    resultB64 = (await renderPage(browser, config, 'base64')) as string;
  } else {
    return errorResponse(400, `Invalid type specified (${config.type})`);
  }

  if (config.saveFilename) {
    additionalHeaders = { 'Content-Disposition': `attachment; filename="${config.saveFilename}"` };
  }

  const sendB64 = config.encoding === 'base64';
  const response: APIGatewayProxyResult = {
    statusCode: 200,
    body: resultB64,
    headers: {
      'content-type': !sendB64 ? formatContentType[config.type] : 'text/plain',
      ...additionalHeaders,
    },
    isBase64Encoded: !sendB64,
  };

  return response;
};

async function post(bodyStr: string, browser: Browser): Promise<APIGatewayProxyResult> {
  let body;
  if (!bodyStr) {
    return errorResponse(400, 'body is missing');
  }

  try {
    if (bodyStr[0] !== '{') {
      // base64
      const buf = Buffer.from(bodyStr, 'base64');
      bodyStr = buf.toString();
    }

    body = JSON.parse(bodyStr) as RenderConfig;
    const { validate, schema } = getValidator();
    const valid = validate(body);
    if (!valid) {
      console.error(validate.errors);
      return errorResponse(400, {
        error: validate.errors ? betterAjvErrors(schema, body, validate.errors, { format: 'js' }) : undefined,
      });
    }
  } catch (e: any) {
    return errorResponse(400, e.message);
  }

  return await render(browser, body);
}

async function get(query: Query, browser: Browser): Promise<APIGatewayProxyResult> {
  if (!query) {
    return errorResponse(400, `arguments missing (chrome ${version})`);
  }

  if (query.warm) {
    return {
      statusCode: 200,
      body: Buffer.from(`Warmed up chrome ${version}`, 'utf8').toString('base64'),
      headers: {
        'content-type': 'text/plain',
      },
      isBase64Encoded: true,
    };
  }

  return await render(browser, {
    url: query.url,
    type: query.type,
    viewport: { width: query.width, height: query.height },
    fullPage: query.fullpage,
  });
}

async function handleEvent(event: any, browser: any): Promise<APIGatewayProxyResult> {
  let response;
  if (event.path === '/render') {
    if (event.requestContext.httpMethod === 'POST') {
      response = await post(event.body, browser);
    } else {
      response = await get(event.queryStringParameters, browser);
    }
  } else {
    return errorResponse(404, `unknown api ${event.path}`);
  }

  return response;
}

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
  context.callbackWaitsForEmptyEventLoop = false;
  let browserMode: BrowserMode = 'local';
  if (event.requestContext.accountId !== undefined) {
    browserMode = event.requestContext.accountId === 'docker' ? 'docker' : 'lambda';
  }

  const serviceConfig = config();

  if (serviceConfig.oauthIssuer) {
    // OAuth2 bearer token authentication
    const token = await getAuthorisedToken(
      event.headers['authorization'] || event.headers['Authorization'],
      serviceConfig.oauthIssuer,
      serviceConfig.oauthRequiredAudience,
      serviceConfig.oauthTokenScopeCheck
    );

    if (!token) {
      return errorResponse(401, `Unauthorised`);
    }

    console.log(`Authorised as ${token.sub}`);
  }

  const browser = await getBrowser(browserMode, serviceConfig.fontsURL);
  try {
    const response = await handleEvent(event, browser);
    return response;
  } catch (e: any) {
    closeBrowser();

    if (e.message.includes('Protocol error') && !(event as any).isOurRetry) {
      console.warn(`Error ${e}. Retrying...`);
      return await handler({ ...event, isOurRetry: true } as any, context);
    } else {
      console.error(`Error ${e}.`);
      throw e;
    }
  }
};
