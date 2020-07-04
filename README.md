# Web Rendering Lambda

Web Rendering Lambda is a [Serverless](https://github.com/serverless/serverless) application that converts web pages into PNGs, JPEGs and PDFs. Its runs on AWS Lambda or Docker and uses the [Puppeteer](https://github.com/GoogleChrome/puppeteer) framework on headless Chromium to render websites.

## Getting Started

Clone the respository and run `yarn`.

Alternatively, use the `serverless` command:

```bash
$ serverless install --url https://github.com/loune/web-rendering-lambda --name my-lambda-project
```

## Testing Locally

To test the functionality locally, run the provided local node server and access the API at http://localhost:8008/render

```bash
$ yarn start
$ curl http://localhost:8008/render?type=png&url=https://www.google.com.au
```

## Package & Deployment

The package can be deployed on AWS Lambda or Docker.

### AWS Lambda

The AWS Lambda version uses the npm package `chrome-aws-lambda` with comes with a brotli compressed version of chrome that runs on AWS Lambda. Due to the 50 MB limitation of lambda packages, you can package with or without the Chromium binary. The binary compressed is around 43 MB (Chrome 79).

#### Old instructions (if not using chrome-aws-lambda)

The headless Chromium needs to be downloaded from https://github.com/adieuadieu/serverless-chrome/releases, extracted, then tar/gzipped and placed in the root of the project folder as `headless-chromium.tar.gz`.

```bash
$ wget https://github.com/adieuadieu/serverless-chrome/releases/download/v1.0.0-55/stable-headless-chromium-amazonlinux-2017-03.zip
$ unzip stable-headless-chromium-amazonlinux-2017-03.zip
$ tar -czf headless-chromium.tar.gz headless-chromium
```

If Chromium is not found with the Lambda package, the script will try to retrieve it from a bucket. Inside `chrome.ts` please change the `chromeS3Bucket` variable to specify the S3 bucket to pull the chromium binary from. You will need to upload `headless-chromium.tar.gz` to the bucket and give the Lambda permission to access the file (see `iamRoleStatements` in `serverless.yml`).

#### Manual packaging

To package and upload manually to AWS, with Chrome embedded:

```bash
$ yarn package-with-chrome
```

or without Chrome embedded

```bash
$ yarn package-without-chrome
```

Once packaged, upload `package.zip` to your Lambda.

#### With Serverless

You can use `serverless` to package and deploy. Before deploying, please change `serverless.yml` with your settings including if you want to include or exclude Chromium by changing `package:initialize` to `yarn package-with-chrome` or `yarn package-without-chrome`.

```bash
$ serverless deploy
```

### Docker

Build the docker image:

```bash
$ yarn docker-build
```

Run the built `web-rendering-lambda` image:

```bash
$ docker run -p 8008:8008 -it web-rendering-lambda
```

or

```bash
$ yarn docker-run
```

## Usage

An endpoint `/render` is available from the service. If running locally or on Docker, this is by default `http://localhost:8008/render`. When deployed on AWS, the API Gateway endpoint may look like `https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/render`. The render endpoint supports `GET` and `POST` requests.

### API

`GET` supports these query params:

- `type` - `(required)` - The file format of render. Can be `png`, `jpeg` or `pdf`.
- `url` - `(required)` - The website URL to render.
- `fullpage` - Specify `true` to render the full page instead of the view port only.
- `width` - The view port width in number of pixels.
- `height` - The view port height in number of pixels.

`POST` takes a JSON body in the form of:

- `type` `<string>` `(required)` - The file format of render. Can be `png`, `jpeg` or `pdf`. Can also be `zip` (see below).
- `url` `<string>` - The website URL to render. Either this or `content` must be supplied.
- `content` `<string>` - The HTML content to render. Either this or `url` must be supplied.
- `viewport` - Object containing browser view port information.
  - `width` `<number>` - Width of view port in pixels.
  - `height` `<number>` - Height of view port in pixels.
  - `deviceScaleFactor` `<number>` - Scale of image to render.
- `fullPage` `<boolean>` - Specify `true` to render the full page instead of the view port only. Only applies to images, not PDFs.
- `selector` `string` - CSS selector to render a specific DOM element on the page.
- `jpegQuality` `<number>` - JPEG quality from 0-100.
- `transparentBackground` `<boolean>` - Whether image should have transparent background (for PNGs) or the default white background.
- `media` `<string>` - CSS media to use with render. Either `screen` or `print`. Images are defaulted to `screen` while PDFs are `print`.
- `timeout` `<number>` - Number of milliseconds to wait for the page to finish loading. Maximum of 30000 (30 seconds) due to API gateway limits.
- `script` `<string>` - Custom puppeteer JavaScript to run after the page loads. `browser` and `page` are available global objects.
- `saveFilename` `<string>` - The file name to specify in the response headers.
- `cookies` `<object>` - Cookies to include in the request.
- `headers` `<object>` - Headers to include in the request.
- `pdf` - PDF specific options. see - [Puppeteer docs](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions)
  - `width` `<string>` - The page width.
  - `height` `<string>` - The page height.
  - `margin` - The page margin.
    - `top` `<string>` - The top margin. (e.g. `2cm`)
    - `left` `<string>` - The left margin.
    - `bottom` `<string>` - The bottom margin.
    - `right` `<string>` - The right margin.
  - `format` - Page format eg. `A4`, see - [Puppeteer docs](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions)
  - `scale` `<number>` - Render scale.
  - `landscape` - Controls whether the page is in landscape.
  - `printBackground` `<boolean>` - Include backgrounds in the PDF. `true` by default.
  - `headerTemplate` `<string>` - HTML template string for header.
  - `footerTemplate` `<string>` - HTML template string for footer.
- `userAgent` `string` - User agent string to send.
- `encoding` `string` - `raw` binary (default) or `base64` encoded output response.

### Custom Fonts

You can include custom fonts by creating a `fonts` folder in the project root, and copying custom fonts into that directory. Please note the custom fonts and the application files should not exceed the Lambda limit of 50 MB after compression.

### Examples

You can call the API with a `GET` or a `POST` request.

#### GET examples

Render website as a PNG.

```bash
$ curl http://localhost:8008/render?type=png&url=https://www.google.com.au
```

#### POST examples

Render website as a PNG.

```bash
$ curl -XPOST -H "Content-Type: application/json" -d '{
  "type": "png",
  "url": "https://www.google.com.au"
}'
```

Render website as a JPEG thumbnail.

```bash
$ curl -XPOST -H "Content-Type: application/json" -d '{
  "type": "jpeg",
  "url": "https://www.google.com.au",
  "viewPort": {
    "width": 1280,
    "height": 800,
    "deviceScaleFactor": 0.2
  }
}'
```

## Unit Tests

```bash
$ yarn test
```

## References

This project was built with inspiration from:

- https://github.com/alixaxel/chrome-aws-lambda
- https://github.com/sambaiz/puppeteer-lambda-starter-kit
- https://github.com/adieuadieu/serverless-chrome
- https://github.com/prismagraphql/chromeless
