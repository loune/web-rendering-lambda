import { handler } from './render';
import { closeBrowser } from './chrome';
import { APIGatewayProxyResult, APIGatewayProxyEvent } from 'aws-lambda';

afterAll(() => {
  return closeBrowser();
});

function generateEvent(httpMethod, queryParams, body): APIGatewayProxyEvent {
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
        jpegQuality: 60,
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
