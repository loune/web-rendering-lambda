import { APIGatewayProxyResult, APIGatewayProxyEvent } from 'aws-lambda';
import archiver from 'archiver';
import { Duplex } from 'stream';
import unzip from 'unzip-stream';
import { handler, RenderConfig, Query } from './render';
import { closeBrowser } from './chrome';

jest.setTimeout(30000);

afterAll(() => {
  return closeBrowser();
});

function toStartWith(this: jest.MatcherUtils, received: string, prefix: string): any {
  const pass = received.startsWith(prefix);
  if (pass) {
    return {
      message: () => `expected ${received.substring(0, 100)} not to start with ${prefix}`,
      pass: true
    };
  } else {
    return {
      message: () => `expected ${received.substring(0, 100)} to start with ${prefix}`,
      pass: false
    };
  }
}

declare global {
  // eslint-disable-next-line
  namespace jest {
    interface Matchers<R> {
      toStartWith: (prefix: string) => R;
    }
  }
}

expect.extend({ toStartWith });

function generateEvent(httpMethod, queryParams, body: RenderConfig): APIGatewayProxyEvent {
  let event: any = {
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
    httpMethod: httpMethod,
    path: '/render',
    headers: {},
    queryStringParameters: queryParams,
    requestContext: {
      httpMethod: httpMethod,
      path: '/render'
    }
  };

  return event;
}

describe('handler with get', () => {
  it('render google with GET', async () => {
    let event = generateEvent('GET', { url: 'https://www.google.com.au/', type: 'png' }, null);

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it('errors when no params with GET', async () => {
    let event = generateEvent('GET', {}, null);

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(400);
  });

  it('errors when missing type with GET', async () => {
    let event = generateEvent('GET', {}, null);

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, { url: 'https://www.google.com.au/' }, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(400);
  });
});

describe('handler with POST', () => {
  it('render google with POST', async () => {
    let event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'png',
        fullPage: false,
        viewport: { width: 800, height: 600 }
      }
    );

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it('render google full page jpg with POST', async () => {
    let event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'jpeg',
        jpegQuality: 50,
        fullPage: true,
        viewport: { width: 1280, height: 600 }
      }
    );

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it('render google selector with POST', async () => {
    let event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'png',
        selector: 'body',
        viewport: { width: 1280, height: 600 }
      }
    );

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it('render google pdf with POST', async () => {
    let event = generateEvent(
      'POST',
      {},
      {
        url: 'https://www.google.com.au/',
        type: 'pdf',
      }
    );

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();

    let pdfString = Buffer.from(response.body, 'base64').toString();

    expect(pdfString).toStartWith('%PDF-');
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it('render content pdf with POST', async () => {
    let event = generateEvent(
      'POST',
      {},
      {
        content: '<h1>Hello</h1><p>world</p>',
        type: 'pdf',
      }
    );

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();

    let pdfString = Buffer.from(response.body, 'base64').toString();

    expect(pdfString).toStartWith('%PDF-');
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it('render multiple files zipped', async () => {
    let event = generateEvent(
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
            saveFilename: 'amazon.jpg'
          },
          {
            url: 'https://www.google.com.au/',
            type: 'pdf',
            jpegQuality: 50,
            fullPage: true,
            saveFilename: 'google.pdf'
          }
        ]
      }
    );

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();

    let zipBuffer = Buffer.from(response.body, 'base64');
    let stream = new Duplex();
    stream.push(zipBuffer);
    stream.push(null);

    let fileNames = [ 'yahoo.png', 'amazon.jpg', 'google.pdf' ];
    let i = 0;
    await new Promise((resolve, reject) => {
      stream.pipe(unzip.Parse())
        .on('entry', (entry) => {
          var filePath = entry.path;

          expect(filePath).toBe(fileNames[i]);
          i++;
        })
        .on('end', () => {
          resolve();
        });
    });

    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(200);

  });

  it('errors when no body with POST', async () => {
    let event = generateEvent('POST', {}, null);

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, {}, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(400);
  });

  it('errors when missing type with POST', async () => {
    let event = generateEvent(
      'POST',
      {
        url: 'https://www.google.com.au/'
      },
      null
    );

    let response: APIGatewayProxyResult;
    let error;
    await handler(event, { url: 'https://www.google.com.au/' }, (herror, hresponse) => {
      response = hresponse;
      error = herror;
    });

    expect(response).not.toBeFalsy();
    expect(response.body).not.toBeFalsy();
    expect(error).toBeFalsy();
    expect(response.isBase64Encoded).toBe(true);
    expect(response.statusCode).toBe(400);
  });
});
