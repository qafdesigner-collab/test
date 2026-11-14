import * as net from 'net';
import * as fs from 'fs';
import { config } from '../config';

/** Scan a file with ClamAV (clamd INSTREAM). Returns CLEAN / INFECTED, or SKIPPED when no scanner is configured. */
export async function scanFile(filePath: string): Promise<'CLEAN' | 'INFECTED' | 'SKIPPED'> {
  if (!config.clamav) {
    if (config.requireMalwareScan) throw new Error('Malware scanner is required but not configured');
    return 'SKIPPED';
  }
  const { host, port } = config.clamav;
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, async () => {
      sock.write('zINSTREAM\0');
      for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
        const len = Buffer.alloc(4); len.writeUInt32BE((chunk as Buffer).length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    let out = '';
    sock.setTimeout(120_000, () => { sock.destroy(); reject(new Error('Malware scan timed out')); });
    sock.on('data', (d) => { out += d.toString(); });
    sock.on('end', () => resolve(/FOUND/.test(out) ? 'INFECTED' : /OK/.test(out) ? 'CLEAN' : (() => { throw new Error('Scanner: ' + out); })()));
    sock.on('error', reject);
  });
}
