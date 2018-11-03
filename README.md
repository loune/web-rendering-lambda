# Web Rendering Lambda

Web Rendering Lambda is a [Serverless](https://github.com/serverless/serverless) application that converts web pages into PNGs, JPEGs and PDFs. Its runs on AWS Lambda and uses the [Puppeteer](https://github.com/GoogleChrome/puppeteer) framework on headless Chromium to render websites.

## Getting Started

Clone the respository and run `yarn`, or use `serverless`:

```bash
$ serverless install --url https://github.com/loune/web-rendering-lambda --name my-lambda-project
```

## Test Locally

To test the functionality locally, run the provided local node server and access the API at http://localhost:8008/render:

```bash
$ yarn start
$ curl http://localhost:8008/render?type=png&url=https://www.google.com.au
```

## Package & Deployment

The AWS Lambda version of headless Chromium needs to be downloaded from https://github.com/adieuadieu/serverless-chrome/releases, extracted, then tar/gzipped and placed in the root of the project folder as `headless-chromium.tar.gz`.

```bash
$ wget https://github.com/adieuadieu/serverless-chrome/releases/download/v1.0.0-55/stable-headless-chromium-amazonlinux-2017-03.zip
$ unzip stable-headless-chromium-amazonlinux-2017-03.zip
$ tar -czf headless-chromium.tar.gz headless-chromium
```

Due to the 50 MB limitation of lambda packages, you can package with or without the Chromium binary. The binary compressed is around 46 MB (Chrome 69).

If Chromium is not found with the Lambda package, the script will try to retrieve it from a bucket. Inside `chrome.ts` please change the `chromeS3Bucket` variable to specify the S3 bucket to pull the chromium binary from. You will need to upload `headless-chromium.tar.gz` to the bucket and give the Lambda permission to access the file (see `iamRoleStatements` in `serverless.yml`).

### Manual

To package and uploade manually, with Chrome embedded:

```bash
$ yarn package
```

or without Chrome embedded

```bash
$ yarn package-without-chrome
```

Once packaged, upload `package.zip` to your Lambda.

### With Serverless

You can use `serverless` to package and deploy. Before deploying, please change `serverless.yml` with your settings including if you want to include or exclude Chromium by changing `package:initialize` to `yarn package` or `yarn package-without-chrome`.

```bash
$ serverless deploy
```

## Usage

An endpoint `/render` is available from the service. If running locally, this is by default `http://localhost:8008/render`. When deployed on AWS, the API Gateway endpoint may look like `https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/render`. The render endpoint supports `GET` and `POST` requests.

### API

`GET` supports these query params:

* `type` - `(required)` - The file format of render. Can be `png`, `jpeg` or `pdf`.
* `url` - `(required)` - The website URL to render.
* `fullpage` - Specify `true` to render the full page instead of the view port only.
* `width` - The view port width in number of pixels.
* `height` - The view port height in number of pixels.

`POST` takes a JSON body in the form of:

* `type` - `<string>` `(required)` - The file format of render. Can be `png`, `jpeg` or `pdf`. Can also be `zip` (see below).
* `url` - `<string>` `(required)` - The website URL to render.
* `fullPage` - `<boolean>` - Specify `true` to render the full page instead of the view port only.

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

* https://github.com/sambaiz/puppeteer-lambda-starter-kit
* https://github.com/adieuadieu/serverless-chrome
* https://github.com/prismagraphql/chromeless
