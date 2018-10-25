import * as fs from 'fs';
import * as Stream from 'stream';
let archiver = require('archiver');
let { Base64Encode } = require('base64-stream');

async function archive(buffers: Map<string, Buffer>, output: Stream): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let archive = archiver('zip', {
      zlib: { level: 9 }
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

    archive.pipe(output).on('end', () => resolve());
    buffers.forEach((value, key) => archive.append(value, { name: key }));
    archive.finalize();
  });
}

export async function archiveFile(buffers: Map<string, Buffer>, filename: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let output = fs.createWriteStream(filename);
    output.on('close', function() {
      //console.log(`Finished zipping`);
      resolve();
    });

    archive(buffers, output).catch(reject);
  });
}

export async function archiveBase64(buffers: Map<string, Buffer>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let strings = [];
    let output = new Stream.PassThrough();
    let outputToB64 = new Base64Encode();

    output.on('end', function() {
      resolve(strings.join(''));
    });

    output.on('data', function(data) {
      strings.push(data.toString());
    });

    outputToB64.pipe(output);

    archive(buffers, outputToB64).catch(reject);
  });
}
