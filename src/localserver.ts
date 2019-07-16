import { handler } from './render';
import * as http from 'http';
import * as url from 'url';

const port = process.env.PORT || 8008;
const isDocker = process.env.IS_DOCKER;

http
  .createServer((request, response) => {
    let bodyChunks = [];

    request
      .on('data', chunk => {
        bodyChunks.push(chunk);
      })
      .on('end', async () => {
        let requestUrl = url.parse(request.url, true);
        let body = Buffer.concat(bodyChunks).toString();

        let event: any = {
          body,
          isBase64Encoded: false,
          httpMethod: request.method.toUpperCase(),
          path: requestUrl.pathname,
          headers: {},
          queryStringParameters: requestUrl.query,
          requestContext: {
            accountId: isDocker ? 'docker' : undefined,
            httpMethod: request.method.toUpperCase(),
            path: requestUrl.pathname,
          },
        };

        try {
          const renderResult = await handler(event, {});
          response.writeHead(renderResult.statusCode, renderResult.headers as any);
          const buf = renderResult.isBase64Encoded
            ? Buffer.from(renderResult.body, 'base64')
            : Buffer.from(renderResult.body);
          response.write(buf);
          response.end();
        } catch (error) {
          response.writeHead(500);
          response.end(error.message);
        }
      });
  })
  .listen(port);

console.log(`Server started on http://localhost:${port}`);
