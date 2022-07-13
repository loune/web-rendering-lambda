import type {APIGatewayEvent, APIGatewayProxyResult, Context} from 'aws-lambda';
import {Browser} from 'puppeteer-core';
import {BrowserMode, closeBrowser, getBrowser, version} from './chrome';
import {userAgent} from './useragent';
import {Protocol} from "devtools-protocol";

export interface Query {
    url: string;
    width?: number;
    height?: number;
    locale?: string;
    userAgent?: string;
    /** warm up the browser */
    warm?: string;
    noContent?: string;
}

interface RenderPageConfigViewport {
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
}

interface RenderConfig extends Query {
    content?: string
    viewport?: RenderPageConfigViewport
    media?: 'screen' | 'print'
    timeout?: number
    cookies?: Record<string, string>
    headers?: Record<string, string>
    userAgent?: string
    locale?: string
    noContent?: string
    features?: Record<string, string>
}

const defaultTimeout = 10000 || +process.env.APP_GOTO_TIMEOUT;
const defaultViewportWidth = 1280 || +process.env.APP_VIEWPORT_WIDTH;
const defaultViewportHeight = 800 || +process.env.APP_VIEWPORT_HEIGHT;
const defaultViewportDeviceScaleFactor = 1 || +process.env.APP_VIEWPORT_SCALE_FACTOR;

interface RPage {
    url: string
    content: string
    cookies: Array<Protocol.Network.Cookie>
    headers: Record<string, string>
    features: Record<string, Array<unknown>>
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
            width: +config.viewport.width || defaultViewportWidth,
            height: +config.viewport.height || defaultViewportHeight,
            deviceScaleFactor: +config.viewport.deviceScaleFactor || defaultViewportDeviceScaleFactor,
        });
    } else {
        await page.setViewport({
            width: defaultViewportWidth,
            height: defaultViewportHeight,
            deviceScaleFactor: defaultViewportDeviceScaleFactor,
        });
    }

    await page.setCacheEnabled(false);
    if (config.cookies) {
        await Promise.all(
            Object.keys(config.cookies).map(name =>
                page.setCookie({name, value: config.cookies?.[name] || '', url: config.url})
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
    let headers, cookies, content;

    const features: Record<string, Array<unknown>> = {};

    await Promise.all(
        Object.
            keys(config.features).
            map(async (k: string) => {
                try {
                    const featureKey = config.features?.[k] ?? '';
                    if (!featureKey) {
                        return;
                    }

                    features[k] = await page.$$eval(featureKey, (elements: Array<Element>) =>
                        elements.map(e => e.innerHTML)
                    );
                } catch (e) {
                    features[k] = e;
                }
            })
    )

    try {
        const response = await waitForResponse;
        headers = await response.headers();
        if (!config.noContent) {
            content = await page.content();
        }
        cookies = await page.cookies();
    } catch (e) {
        console.error(e);
    }

    page.close().catch(e => console.error(e));

    return {
        url,
        headers,
        cookies,
        features,
        content,
    }
}

function errorResponse(statusCode: number, message: string | Record<string, unknown>): APIGatewayProxyResult {
    console.error(`${statusCode}: ${message}`);

    return jsonResponse({ message }, statusCode);
}

export const render = async (browser: Browser, config: RenderConfig): Promise<APIGatewayProxyResult> => {
    const page = await renderPage(browser, config);

    return jsonResponse(page);
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
        return jsonResponse(
            { motd: 'veni, vidi, vici' },
            201
        );
    }

    return await render(
        browser,
        query
    );
}

function jsonResponse(body: any, statusCode: number = 201) {
    return {
        statusCode,
        body: Buffer.from(
            JSON.stringify(body),
            'utf8'
        ).toString('base64'),
        headers: {
            'content-type': 'application/json',
        },
        isBase64Encoded: true,
    };
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
            return await handler({...event, isOurRetry: true} as any, context);
        } else {
            console.error(`Error ${e}.`);
            throw e;
        }
    }
};

