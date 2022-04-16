import type { APIGatewayProxyResult, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { Duplex } from 'stream';
import unzip from 'unzip-stream';
import { imageSize } from 'image-size';
import http from 'http';
import { handler, RenderConfig } from './render';
import { closeBrowser } from './chrome';
import * as config from './config';
import * as mockedConfigTypes from './__mocks__/config';
import { Config } from './config';

const mockedConfig = config as typeof mockedConfigTypes;

declare global {
  // eslint-disable-next-line
  namespace jest {
    interface Matchers<R> {
      toStartWith: (prefix: string) => R;
    }
  }
}

jest.mock('./config');
jest.setTimeout(30000);

const dummyContext: Context = {} as Context;

afterAll(() => {
  return closeBrowser();
});

function toStartWith(this: jest.MatcherUtils, received: string, prefix: string): any {
  const pass = received.startsWith(prefix);
  if (pass) {
    return {
      message: () => `expected ${received.substring(0, 100)} not to start with ${prefix}`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received.substring(0, 100)} to start with ${prefix}`,
      pass: false,
    };
  }
}

expect.extend({ toStartWith });

function generateEvent(
  httpMethod: string,
  queryParams: { [key: string]: string },
  body: RenderConfig | null
): APIGatewayProxyEvent {
  const event: any = {
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
    httpMethod: httpMethod,
    path: '/render',
    headers: {},
    queryStringParameters: queryParams,
    requestContext: {
      httpMethod: httpMethod,
      path: '/render',
    },
  };

  return event;
}

function setupDummyAuthServer(port: number): http.Server {
  return http
    .createServer(function (req, res) {
      if (req.url === '/oauth2/dummy/.well-known/openid-configuration') {
        res.setHeader('content-type', 'application/json');
        res.end(
          `{"issuer":"http://localhost:${port}/oauth2/dummy","jwks_uri":"http://localhost:${port}/oauth2/dummy/v1/keys"}`
        );
        return;
      } else if (req.url === '/oauth2/dummy-no-jwks/.well-known/openid-configuration') {
        res.setHeader('content-type', 'application/json');
        res.end(
          `{"issuer":"http://localhost:${port}/oauth2/dummy-no-jwks","jwks_uri":"http://localhost:${port}/oauth2/dummy-no-jwks/v1/keys"}`
        );
        return;
      } else if (req.url === '/oauth2/dummy/v1/keys') {
        res.setHeader('content-type', 'application/json');
        res.end(
          `{"keys":[{"kty":"RSA","e":"AQAB","kid":"923aca74-022f-4f2f-96e9-45b3a43e7ca5","n":"nzyis1ZjfNB0bBgKFMSvvkTtwlvBsaJq7S5wA-kzeVOVpVWwkWdVha4s38XM_pa_yr47av7-z3VTmvDRyAHcaT92whREFpLv9cj5lTeJSibyr_Mrm_YtjCZVWgaOYIhwrXwKLqPr_11inWsAkfIytvHWTxZYEcXLgAXFuUuaS3uF9gEiNQwzGTU1v0FqkqTBr4B8nW3HCN47XUu0t8Y0e-lf4s4OxQawWD79J9_5d3Ry0vbV3Am1FtGJiJvOwRsIfVChDpYStTcHTCMqtvWbV6L11BWkpzGXSW4Hv43qa-GSYOD2QU68Mb59oSk2OB-BtOLpJofmbGEGgvmwyCI9Mw"}]}`
        );
        return;
      }

      res.statusCode = 404;
      res.end('Not found');
    })
    .listen(port);
}

describe('handler with get', () => {
  it('warms up chrome', async () => {
    const event = generateEvent('GET', { warm: '1' }, null);

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
    expect(Buffer.from(response?.body || '', 'base64').toString()).toStartWith('Warmed up chrome');
  });

  it('render google with GET', async () => {
    const event = generateEvent('GET', { url: 'https://www.google.com.au/', type: 'png' }, null);

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('errors when no params with GET', async () => {
    const event = generateEvent('GET', {}, null);

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(400);
  });

  it('errors when missing type with GET', async () => {
    const event = generateEvent('GET', {}, null);

    let response: APIGatewayProxyResult | undefined;
    let error;

    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(400);
  });
});

describe('handler with get with security', () => {
  const dummyPort = 49873;
  let dummyAuthServer: http.Server;
  beforeAll(() => {
    dummyAuthServer = setupDummyAuthServer(dummyPort);
  });

  afterAll(() => {
    dummyAuthServer.close();
  });

  afterEach(() => {
    mockedConfig.mockSetConfig({ localPort: 3000 });
  });

  it.each([
    [
      'render with authorisation',
      `http://localhost:${dummyPort}/oauth2/dummy`,
      200,
      'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjQ5ODczL29hdXRoMi9kdW1teSIsInN1YiI6IjEyMzQ1Njc4OTAiLCJzY3AiOiJyZW5kZXIiLCJuYW1lIjoiRXhhbXBsZSBVc2VyIiwiaWF0IjoxNjE5ODI2NzA1LCJleHAiOjI2MTk4MjY3MDV9.hityl106tZxBOBFiyO7GGfjMbl6jesSI269fRUg6eN7FkbHfUFoJPsuJmAbsaADNnesXn8h-0HaZXVq7wpj2R1vpADpNjZnO6bGxroXX10xfm3MQhwW1pCuzzHb6Non8KUHOqJIL2oZ8m2JtXZjzX5EeHc_PD_HBY4AiHS87E0MKhNlGRdoCDZOWHl7isDE5bShDGnDF5T-lO-fTOCTJzgdOV7v-Ltc_FMCIZg0eApumdBTNUUEpyqtM9YJaVPRzjhUSFI8Wh40IlQC6xjm2LV0oIVD6UbeOkt6jGbv8WaGl6hZUjoEUoy8vzXtEAWhu6tC-tNNy1Juynt3wmqBrXg',
    ],
    [
      'authorisation failed with unable to get openid-configuration',
      `http://localhost:9/oauth2/dummy`,
      401,
      'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjQ5ODczL29hdXRoMi9kdW1teSIsInN1YiI6IjEyMzQ1Njc4OTAiLCJzY3AiOiJyZW5kZXIiLCJuYW1lIjoiRXhhbXBsZSBVc2VyIiwiaWF0IjoxNjE5ODI2NzA1LCJleHAiOjI2MTk4MjY3MDV9.hityl106tZxBOBFiyO7GGfjMbl6jesSI269fRUg6eN7FkbHfUFoJPsuJmAbsaADNnesXn8h-0HaZXVq7wpj2R1vpADpNjZnO6bGxroXX10xfm3MQhwW1pCuzzHb6Non8KUHOqJIL2oZ8m2JtXZjzX5EeHc_PD_HBY4AiHS87E0MKhNlGRdoCDZOWHl7isDE5bShDGnDF5T-lO-fTOCTJzgdOV7v-Ltc_FMCIZg0eApumdBTNUUEpyqtM9YJaVPRzjhUSFI8Wh40IlQC6xjm2LV0oIVD6UbeOkt6jGbv8WaGl6hZUjoEUoy8vzXtEAWhu6tC-tNNy1Juynt3wmqBrXg',
    ],
    [
      'authorisation failed with unable to get JWKS',
      `http://localhost:${dummyPort}/oauth2/dummy-no-jwks`,
      401,
      'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjQ5ODczL29hdXRoMi9kdW1teSIsInN1YiI6IjEyMzQ1Njc4OTAiLCJzY3AiOiJyZW5kZXIiLCJuYW1lIjoiRXhhbXBsZSBVc2VyIiwiaWF0IjoxNjE5ODI2NzA1LCJleHAiOjI2MTk4MjY3MDV9.hityl106tZxBOBFiyO7GGfjMbl6jesSI269fRUg6eN7FkbHfUFoJPsuJmAbsaADNnesXn8h-0HaZXVq7wpj2R1vpADpNjZnO6bGxroXX10xfm3MQhwW1pCuzzHb6Non8KUHOqJIL2oZ8m2JtXZjzX5EeHc_PD_HBY4AiHS87E0MKhNlGRdoCDZOWHl7isDE5bShDGnDF5T-lO-fTOCTJzgdOV7v-Ltc_FMCIZg0eApumdBTNUUEpyqtM9YJaVPRzjhUSFI8Wh40IlQC6xjm2LV0oIVD6UbeOkt6jGbv8WaGl6hZUjoEUoy8vzXtEAWhu6tC-tNNy1Juynt3wmqBrXg',
    ],
    [
      'authorisation failed with token expired',
      `http://localhost:${dummyPort}/oauth2/dummy`,
      401,
      'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjQ5ODczL29hdXRoMi9kdW1teSIsInN1YiI6IjEyMzQ1Njc4OTAiLCJzY3AiOiJyZW5kZXIiLCJuYW1lIjoiRXhhbXBsZSBVc2VyIiwiaWF0IjoxNjE5ODI2NzA1LCJleHAiOjE2MTk4MjY3MDZ9.Eq3TgSEUvHOJ8Ro6q0yutr8NC-PgGAYx1-A1e5ICARAcU1ieXc2hpDZDHDyZLFfMFR1ltIDGRXCmF-MaiDXkN1oepS68-1p9hAZ1XvEHkiMcBdcV28-B8wrRIDkPnn5sn78lMj6hy0ccLtgKc3wTGPhz6xUVRnV8K0kA3UhTSg13jGFF0IRnKn1Go_94y7P1NTTmyY-h97T8IYBr8_QD6ZWMN7bns1bs9VR7qrqGhMIvtRTKQFriDkp-s8S_lQo0wMVPosKn9gjWEyjaESv2HplK1cpvKuzJMYACXf6zQuONqhAjsWRVYjxvplPHwFVnRicKXQEcNQD34eIeacOOrA',
    ],
    [
      'authorisation failed with invalid scope',
      `http://localhost:${dummyPort}/oauth2/dummy`,
      401,
      'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjQ5ODczL29hdXRoMi9kdW1teSIsInN1YiI6IjEyMzQ1Njc4OTAiLCJzY3AiOiJzb21ldGhpbmciLCJuYW1lIjoiRXhhbXBsZSBVc2VyIiwiaWF0IjoxNjE5ODI2NzA1LCJleHAiOjI2MTk4MjY3MDZ9.H46FAgN4p-SDMP4rrAmn1IvQsAZN7rpb4pEcl26P4dhFi0q2lQ__c_t4D6hjySgo3-EeyUnbuy7gEkFGrkDwrlfpX4n1STphrZ3BUMXGjr3LvAkFqNPYOB5JuvD7Znb8-sdRAQiKAou5Gv-XV6niTnH3uYKlPJvM8z34zWXM5m8YJpDKdUduJa82ueJVGOSHI_3kIss70W1kz5kSx200wYHoT6rrsqkLreubzPf27YS5he4fkRN9UTwnXmXi21rhjRxIg1xN55-0usXYiIzM_k0iwM0UwaNp6ov6eWlc6cFdNhd-wjdFsrNds4P51GfqAE9wtcdzMr1t7FoKCiTwOA',
    ],
    [
      'authorisation failed with invalid token signature',
      `http://localhost:${dummyPort}/oauth2/dummy`,
      401,
      'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjQ5ODczL29hdXRoMi9kdW1teSIsInN1YiI6IjEyMzQ1Njc4OTAiLCJzY3AiOiJzb21ldGhpbmciLCJuYW1lIjoiRXhhbXBsZSBVc2VyIiwiaWF0IjoxNjE5ODI2NzA1LCJleHAiOjI2MTk4MjY3MDZ9.upxGd22HMi-1ARYGpXYcMHlZTvCqCtOMT4tu4q7MOjfGvsQaJt-dHneUAAT7G7FmCDyslfEWud6cQAbYtjC5kPNuvwYGZbaJbQOd5E-Xx3e7SXUk3j0AA5liCmJto6wAXFsnDrQ4JK8026pD5f7go1kHcKX13HJV4KyxqmzBgGY',
    ],
  ])('%s', async (description: string, oauthIssuer: string, statusCode: number, token: string) => {
    (mockedConfig as any).mockSetConfig({
      oauthIssuer,
      oauthTokenScopeCheck: payload =>
        (typeof payload.scp === 'object' && (payload.scp as any).includes('render')) || payload.scp === 'render',
    } as Config);

    const event = generateEvent('GET', { url: 'https://www.google.com.au/', type: 'png' }, null);

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler({ ...event, headers: { authorization: `Bearer ${token}` } }, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(statusCode);
  });
});

describe('handler with POST', () => {
  it('render google with POST', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'png',
        fullPage: false,
        viewport: { width: 800, height: 600 },
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('outputs base64', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'png',
        fullPage: false,
        viewport: { width: 800, height: 600 },
        encoding: 'base64',
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(false);
    expect(response?.statusCode).toBe(200);
  });

  it('render google full page jpg with POST', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'jpeg',
        jpegQuality: 50,
        fullPage: true,
        viewport: { width: 1280, height: 600 },
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('render google image with script', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'jpeg',
        jpegQuality: 50,
        viewport: { width: 1280, height: 600 },
        script: 'page.setViewport({ width: 720, height: 1024 })',
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    const dimension = imageSize(Buffer.from(response?.body || '', 'base64'));
    expect(dimension.height).toBe(1024);
    expect(dimension.width).toBe(720);

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('render google selector with POST', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'png',
        selector: 'body',
        viewport: { width: 1280, height: 600 },
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('render google pdf with POST', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'pdf',
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();

    const pdfString = Buffer.from(response?.body || '', 'base64').toString();

    expect(pdfString).toStartWith('%PDF-');
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('render content pdf with POST', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        content: '<h1>Hello</h1><p>world</p>',
        type: 'pdf',
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();

    const pdfString = Buffer.from(response?.body || '', 'base64').toString();

    expect(pdfString).toStartWith('%PDF-');
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('render multiple files zipped', async () => {
    const event = generateEvent(
      'POST',
      {},
      {
        type: 'zip',
        pages: [
          { url: 'https://www.yahoo.co.jp/', type: 'png', jpegQuality: 50, fullPage: true, saveFilename: 'yahoo.png' },
          {
            url: 'https://www.amazon.co.jp/',
            type: 'jpeg',
            jpegQuality: 50,
            fullPage: true,
            saveFilename: 'amazon.jpg',
          },
          {
            url: 'https://www.google.com.au/',
            type: 'pdf',
            jpegQuality: 50,
            fullPage: true,
            saveFilename: 'google.pdf',
          },
        ],
      }
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();

    const zipBuffer = Buffer.from(response?.body || '', 'base64');
    const stream = new Duplex();
    stream.push(zipBuffer);
    stream.push(null);

    const fileNames = ['yahoo.png', 'amazon.jpg', 'google.pdf'];
    let i = 0;
    await new Promise<void>(resolve => {
      stream
        .pipe(unzip.Parse())
        .on('entry', (entry: any) => {
          const filePath = entry.path;

          expect(filePath).toBe(fileNames[i]);
          i++;
        })
        .on('end', () => {
          resolve();
        });
    });

    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(200);
  });

  it('errors when no body with POST', async () => {
    const event = generateEvent('POST', {}, null);

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(400);
  });

  it('errors when missing type with POST', async () => {
    const event = generateEvent(
      'POST',
      {
        url: 'https://www.google.com.au/',
      },
      null
    );

    let response: APIGatewayProxyResult | undefined;
    let error;
    try {
      response = await handler(event, dummyContext);
    } catch (err) {
      error = err;
    }

    expect(response).not.toBeFalsy();
    expect(response?.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response?.isBase64Encoded).toBe(true);
    expect(response?.statusCode).toBe(400);
  });
});
