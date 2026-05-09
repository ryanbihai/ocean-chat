import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

interface SendArgs {
  openid: string;
  message?: string;
}

export const sendCommand: CommandModule = {
  command: 'send <openid>',
  describe: 'Send a message to a recipient OpenID',
  builder: (yargs) =>
    yargs
      .positional('openid', {
        type: 'string',
        describe: 'Recipient OpenID',
        demandOption: true,
      })
      .option('message', {
        alias: 'm',
        type: 'string',
        describe: 'Message content (default: read from stdin)',
      }),
  handler: async (argv: any) => {
    try {
      const content = argv.message || await readStdin();
      if (!content) {
        console.error('No message content. Use -m "message" or pipe content.');
        process.exit(1);
      }
      const ob = await createOceanBus();
      await ob.send(argv.openid, content);
      console.log(JSON.stringify({ code: 0, msg: 'sent' }));
    } catch (err) {
      console.error('Send failed:', (err as Error).message);
      process.exit(1);
    }
  },
};

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    let resolved = false;
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => {
      if (!resolved) { resolved = true; resolve(data.trim()); }
    });
    process.stdin.on('error', () => {
      if (!resolved) { resolved = true; resolve(''); }
    });
    process.stdin.resume();
  });
}
