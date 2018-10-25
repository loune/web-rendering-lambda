# Web Rendering Lambda

Web Rendering Lambda is a [Serverless](https://github.com/serverless/serverless) service that runs on AWS lambda that converts web pages into PNGs, JPEGs and PDFs. It uses the [Puppeteer](https://github.com/GoogleChrome/puppeteer) framework on headless Chromium.

## Test locally

A local node server is provided to test the functionality:

```bash
yarn start
```

## Package

The AWS Lambda version of headless Chromium needs to be downloaded from https://github.com/adieuadieu/serverless-chrome/releases, extracted, then tar/gzipped and placed in the root of the project folder as `headless-chromium.tar.gz`.

```bash
wget https://github.com/adieuadieu/serverless-chrome/releases/download/v1.0.0-55/stable-headless-chromium-amazonlinux-2017-03.zip
unzip stable-headless-chromium-amazonlinux-2017-03.zip
tar -czf headless-chromium.tar.gz headless-chromium
```

Due to th 50 MB limitation of lambda packages, you can package with or without the Chromium binary. The binary compressed is around 46 MB (Chrome 49).

With Chrome embedded

```bash
yarn package
```

Without Chrome embedded

```bash
yarn package-without-chrome
```

If chromium is not found with the package, the script will try to retrive it from an S3 bucket. Inside `chrome.ts` please change `chromeS3Bucket` variable to specify the S3 bucket to pull the chromium binary from. You will need to upload `headless-chromium.tar.gz` to the bucket and give the lambda permission to access the file.

## Deploy

You can use serverless to deploy. Please change `serverless.yml` with your settings.

```bash
serverless deploy
```

## References

This project was built with inspiration from:

* https://github.com/sambaiz/puppeteer-lambda-starter-kit
* https://github.com/adieuadieu/serverless-chrome
* https://github.com/prismagraphql/chromeless
