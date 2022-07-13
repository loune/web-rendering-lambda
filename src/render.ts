import type { APIGatewayProxyResult, APIGatewayEvent, Context } from 'aws-lambda';
import { Browser } from 'puppeteer-core';
import { getBrowser, closeBrowser, version, BrowserMode } from './chrome';
import { userAgent } from './useragent';
import { Protocol } from "devtools-protocol";

export interface Query {
  url: string;
  width?: number;
  height?: number;
  locale?: string;
  userAgent?: string;
  /** warm up the browser */
  warm?: string;
}

interface RenderPageConfigViewport {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}

interface RenderConfig {
  url?: string;
  content?: string;
  viewport?: RenderPageConfigViewport;
  media?: 'screen' | 'print';
  timeout?: number;
  cookies?: { [name: string]: string };
  headers?: { [name: string]: string };
  userAgent?: string;
  locale?: string;
}

const defaultTimeout = 10000;
const defaultViewportWidth = 1280;
const defaultViewportHeight = 800;
const defaultViewportdeviceScaleFactor = 1;

interface RPage {
  url: string
  content: string
  cookies: Array<Protocol.Network.Cookie>
  headers: Record<string, string>
}

async function renderPage(
  browser: Browser,
  config: RenderConfig
): Promise<RPage> {
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
    await userAgent(page, config.userAgent, config.locale);
  }

  if (config.media) {
    await page.emulateMediaType(config.media);
  }

  const waitForResponse = page.waitForResponse(
      (response) =>
        response.url() === config.url && response.status() === 200
  );

  try {
    if (config.url) {
      await page.goto(config.url, {
        timeout: config.timeout || defaultTimeout,
        waitUntil: ['domcontentloaded', 'networkidle2'],
      });
    } else {
      await page.setContent(config.content || '', {
        timeout: config.timeout || defaultTimeout,
        waitUntil: ['domcontentloaded', 'networkidle2'],
      });
    }
  } catch (e: any) {
    if (e.name !== 'TimeoutError') {
      throw e;
    }
  }

  const url = await page.url();
  const response = await waitForResponse;
  const content = await page.content();
  const headers = await response.headers();
  const cookies = await page.cookies();

  page.close().catch(e => console.error(e));

  return {
    url,
    headers,
    cookies,
    content,
  }
}

function errorResponse(statusCode: number, message: string | Record<string, unknown>): APIGatewayProxyResult {
  console.error(`${statusCode}: ${message}`);
  return {
    statusCode: statusCode,
    body: Buffer.from(JSON.stringify({ message }), 'utf8').toString('base64'),
    headers: {
      'content-type': 'application/json',
    },
    isBase64Encoded: true,
  };
}

export const render = async (browser: Browser, config: RenderConfig): Promise<APIGatewayProxyResult> => {
  const page = await renderPage(browser, config);

  return {
    statusCode: 200,
    body: Buffer.from(JSON.stringify(page), 'utf8').toString('base64'),
    headers: {
      'content-type': 'application/json',
    },
    isBase64Encoded: true,
  };
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
    viewport: { width: query.width, height: query.height },
    userAgent: query?.userAgent,
    locale: query?.locale,
  });
}

async function handleEvent(event: any, browser: any): Promise<APIGatewayProxyResult> {
  let response;
  if (event.requestContext.httpMethod === 'POST') {
    response = await post(event.body, browser);
  } else {
    response = await get(event.queryStringParameters, browser);
  }

  return response;
}

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
  context.callbackWaitsForEmptyEventLoop = false;

  let browserMode: BrowserMode = 'local';
  if (event?.requestContext?.accountId) {
    browserMode = 'lambda';
  }

  const browser = await getBrowser(browserMode);

  try {
    return await handleEvent(event, browser);
  } catch (e: any) {
    await closeBrowser();

    if (e.message.includes('Protocol error') && !(event as any).isOurRetry) {
      console.warn(`Error ${e}. Retrying...`);
      return await handler({ ...event, isOurRetry: true } as any, context);
    } else {
      console.error(`Error ${e}.`);
      throw e;
    }
  }
};

