import * as http from 'http';
import type { Context } from 'aws-lambda';
import { URL } from 'url';
import { handler } from './render';
import configFunc from './config';

const config = configFunc();
const port = process.env.PORT || config.localPort;
const isDocker = process.env.IS_DOCKER;

http
  .createServer((request, response) => {
    const bodyChunks: any[] = [];

    request
      .on('data', chunk => {
        bodyChunks.push(chunk);
      })
      .on('end', async () => {
        if (!request.url || !request.method) {
          throw new Error('Url or method not defined');
        }

        const requestUrl = new URL(`http://localhost${request.url}`);
        const body = Buffer.concat(bodyChunks).toString();

        const event: any = {
          body,
          isBase64Encoded: false,
          httpMethod: request.method.toUpperCase(),
          path: requestUrl.pathname,
          headers: request.headers,
          queryStringParameters: Object.fromEntries(requestUrl.searchParams as unknown as Iterable<any>),
          requestContext: {
            accountId: isDocker ? 'docker' : undefined,
            httpMethod: request.method.toUpperCase(),
            path: requestUrl.pathname,
          },
        };

        try {
          const renderResult = await handler(event, {} as Context);
          response.writeHead(renderResult.statusCode, renderResult.headers as any);
          const buf = renderResult.isBase64Encoded
            ? Buffer.from(renderResult.body, 'base64')
            : Buffer.from(renderResult.body);
          response.write(buf);
          response.end();
        } catch (error: any) {
          response.writeHead(500);
          response.end(error.message);
        }
      });
  })
  .listen(port);

console.log(`Server started on http://localhost:${port}`);
