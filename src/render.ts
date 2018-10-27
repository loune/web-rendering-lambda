import { APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { getBrowser, closeBrowser, version } from './chrome';
import { archiveBase64, archiveFile } from './archive';

interface Query {
  url: string;
  type: 'png' | 'jpeg' | 'pdf';
  width?: number;
  height?: number;
  fullpage?: boolean;
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

interface RenderPageConfig {
  type: 'png' | 'jpeg' | 'pdf';
  url?: string;
  viewport?: RenderPageConfigViewport;
  content?: string;
  jpegQuality?: number;
  fullPage?: boolean;
  printBackground?: boolean;
  transparentBackground?: boolean;
  media?: 'screen' | 'print';
  timeout?: number;
  saveFilename?: string;
  cookies?: { [name: string]: string };
  headers?: { [name: string]: string };
  userAgent?: string;
  paperMargin?: RenderPageConfigMargin;
  paperWidth?: string;
  paperHeight?: string;
  paperFormat?: string;
  paperScale?: number;
  landscape?: boolean;
}

interface RenderMultipleConfig {
  type: 'zip';
  pages: RenderPageConfig[];
  saveFilename?: string;
}

type RenderConfig = RenderPageConfig | RenderMultipleConfig;

enum formatContentType {
  zip = 'application/zip',
  pdf = 'application/pdf',
  png = 'image/png',
  jpeg = 'image/jpeg'
}

const defaultTimeout = 10000;
const defaultViewportWidth = 1280;
const defaultViewportHeight = 800;
const defaultViewportdeviceScaleFactor = 1;

async function renderPage(browser, config: RenderPageConfig, encoding: 'base64' | 'binary'): Promise<string | Buffer> {
  const page = await browser.newPage();

  if (config.viewport) {
    await page.setViewport({
      width: Number(config.viewport.width) || defaultViewportWidth,
      height: Number(config.viewport.height) || defaultViewportHeight,
      deviceScaleFactor: Number(config.viewport.deviceScaleFactor) || defaultViewportdeviceScaleFactor
    });
  } else {
    await page.setViewport({
      width: defaultViewportWidth,
      height: defaultViewportHeight,
      deviceScaleFactor: defaultViewportdeviceScaleFactor
    });
  }

  await page.setCacheEnabled(false);
  if (config.cookies) {
    await Promise.all(
      Object.keys(config.cookies).map(name => page.setCookie({ name, value: config.cookies[name], url: config.url }))
    );
  }

  if (config.headers) {
    await page.setExtraHTTPHeaders(config.headers);
  }

  if (config.userAgent) {
    await page.setUserAgent(config.userAgent);
  }

  if (config.media) {
    await page.emulateMedia(config.media);
  }

  try {
    if (config.url) {
      await page.goto(config.url, {
        timeout: config.timeout || defaultTimeout,
        waitUntil: ['domcontentloaded', 'networkidle0']
      });
    } else {
      await page.setContent(config.content);
      await page.waitForNavigation({
        timeout: config.timeout || defaultTimeout,
        waitUntil: ['domcontentloaded', 'networkidle0']
      });
    }
  } catch (e) {
    if (e.name !== 'TimeoutError') {
      throw e;
    }
  }

  let result;
  if (config.type === 'pdf') {
    let pdfOptions: any = {};

    if (config.paperFormat) {
      pdfOptions.format = config.paperFormat;
    }

    if (config.landscape) {
      pdfOptions.paperLandscape = config.landscape;
    }

    if (config.paperScale) {
      pdfOptions.scale = config.paperScale;
    }

    if (config.paperMargin) {
      pdfOptions.margin = config.paperMargin;
    }

    if (config.paperWidth) {
      pdfOptions.width = config.paperWidth;
    }

    if (config.paperHeight) {
      pdfOptions.height = config.paperHeight;
    }

    pdfOptions.printBackground = config.printBackground === undefined ? true : config.printBackground;

    let buffer = await page.pdf(pdfOptions);
    result = encoding === 'base64' ? buffer.toString('base64') : buffer;
  } else {
    let options: any = {
      encoding,
      type: config.type,
      fullPage: config.fullPage,
      omitBackground: config.transparentBackground || false
    };

    if (config.type === 'jpeg' && config.jpegQuality) {
      options.quality = config.jpegQuality;
    }

    result = await page.screenshot(options);
  }

  page.close();

  return result;
}

function errorResponse(statusCode, message): APIGatewayProxyResult {
  console.error(`${statusCode}: ${message}`);
  return {
    statusCode: statusCode,
    body: Buffer.from(message, 'utf8').toString('base64'),
    headers: {
      'content-type': 'text/plain'
    },
    isBase64Encoded: true
  };
}

export const render = async (browser, config: RenderConfig): Promise<APIGatewayProxyResult> => {
  let additionalHeaders = {};
  let resultB64;

  await (await browser.newPage())._client.send('Network.clearBrowserCookies');

  if (config.type === 'zip') {
    if (!config.pages) {
      return errorResponse(400, `Missing pages property for zip`);
    }
    console.log(`Rendering ${config.pages.length} URLs to ${config.type}`);

    const bufs = await Promise.all(config.pages.map(page => renderPage(browser, page, 'binary')));
    let bufMap = new Map<string, Buffer>();
    bufs.forEach((value, i) =>
      bufMap.set(config.pages[i].saveFilename || `file${i}.${config.pages[i].type}`, value as Buffer)
    );

    resultB64 = await archiveBase64(bufMap);
    //await archiveFile(bufMap, `${__dirname}/example.zip`);
  } else if (['jpeg', 'png', 'pdf'].includes(config.type)) {
    console.log(`Rendering ${config.url || 'content'} to ${config.type}`);
    resultB64 = await renderPage(browser, config, 'base64');
  } else {
    return errorResponse(400, `Invalid type specified (${config.type})`);
  }

  if (config.saveFilename) {
    additionalHeaders = { 'Content-Disposition': `attachment; filename="${config.saveFilename}"` };
  }

  const response = {
    statusCode: 200,
    body: resultB64,
    headers: {
      'content-type': formatContentType[config.type],
      ...additionalHeaders
    },
    isBase64Encoded: true
  };

  return response;
};

async function post(bodyStr: string, browser): Promise<APIGatewayProxyResult> {
  let body;
  try {
    if (bodyStr[0] !== '{') {
      // base64
      let buf = Buffer.from(bodyStr, 'base64');
      bodyStr = buf.toString();
    }

    body = JSON.parse(bodyStr) as RenderConfig;
  } catch (e) {
    return errorResponse(400, e.message);
  }

  return await render(browser, body);
}

async function get(query: Query, browser): Promise<APIGatewayProxyResult> {
  if (!query) {
    return errorResponse(400, 'arguments missing');
  }

  return await render(browser, {
    url: query.url,
    type: query.type,
    viewport: { width: query.width, height: query.height },
    fullPage: query.fullpage
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

export const handler = async (event: APIGatewayEvent, context, callback): Promise<void> => {
  const isLambda = event.requestContext.accountId !== undefined;
  context.callbackWaitsForEmptyEventLoop = false;
  const browser = await getBrowser(isLambda);
  try {
    let response = await handleEvent(event, browser);
    callback(null, response);
  } catch (e) {
    closeBrowser();

    if (!(event as any).isOurRetry) {
      console.warn(`Error ${e}. Retrying...`);
      await handler({ ...event, isOurRetry: true } as any, context, callback);
    } else {
      callback(e);
    }
  }
};
