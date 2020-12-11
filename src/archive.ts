import * as fs from 'fs';
import * as stream from 'stream';
import archiver from 'archiver';
import { Base64Encode } from 'base64-stream';
import * as aws from 'aws-sdk';

function getArchive(
  buffers: Map<string, Buffer>,
  pipeOutput: stream.Writable | undefined,
  resolve: (value?: void) => void,
  reject: (err?: any) => void
): any {
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  archive.on('warning', err => {
    if (err.code === 'ENOENT') {
      // log warning
    } else {
      // throw error
      reject(err);
    }
  });

  archive.on('error', err => {
    reject(err);
  });

  if (pipeOutput) {
    archive.pipe(pipeOutput).on('end', () => resolve());
  }

  buffers.forEach((value, key) => archive.append(value, { name: key }));
  archive.finalize();
  return archive;
}

export async function archive(buffers: Map<string, Buffer>, output: stream.Writable): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    getArchive(buffers, output, resolve, reject);
  });
}

export async function archiveFile(buffers: Map<string, Buffer>, filename: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(filename);
    output.on('close', () => {
      //console.log(`Finished zipping`);
      resolve();
    });

    archive(buffers, output).catch(reject);
  });
}

export async function archiveBase64(buffers: Map<string, Buffer>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const strings: string[] = [];
    const output = new stream.PassThrough();
    const outputToB64 = new Base64Encode();

    output.on('data', data => {
      strings.push(data.toString());
    });

    output.on('end', () => {
      resolve(strings.join(''));
    });

    outputToB64.pipe(output);

    archive(buffers, outputToB64).catch(reject);
  });
}

export async function archiveToS3(
  buffers: Map<string, Buffer>,
  s3Key: string,
  s3Bucket: string,
  s3Region: string,
  contentType: string
): Promise<aws.S3.ManagedUpload.SendData> {
  const s3 = new aws.S3({ apiVersion: '2006-03-01', region: s3Region });
  return await new Promise<aws.S3.ManagedUpload.SendData>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const archive = getArchive(buffers, undefined, () => {}, reject);
    s3.upload(
      { Bucket: s3Bucket, Key: s3Key, Body: archive, ContentType: contentType },
      (error: any, data: aws.S3.ManagedUpload.SendData) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      }
    );
  });
}

export async function saveToS3(
  buffer: Buffer,
  s3Key: string,
  s3Bucket: string,
  s3Region: string,
  contentType: string
): Promise<aws.S3.ManagedUpload.SendData> {
  const s3 = new aws.S3({ apiVersion: '2006-03-01', region: s3Region });
  return await new Promise<aws.S3.ManagedUpload.SendData>((resolve, reject) => {
    const duplexStream = new stream.Duplex();
    duplexStream.push(buffer);
    duplexStream.push(null);
    s3.upload({ Bucket: s3Bucket, Key: s3Key, Body: stream, ContentType: contentType }, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}
