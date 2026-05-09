import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

interface ListenArgs {
  format?: 'json' | 'text';
}

export const listenCommand: CommandModule = {
  command: 'listen',
  describe: 'Listen for incoming messages',
  builder: (yargs) =>
    yargs.option('format', {
      type: 'string',
      choices: ['json', 'text'] as const,
      default: 'text' as const,
      description: 'Output format',
    }),
  handler: async (argv: any) => {
    try {
      const ob = await createOceanBus();
      const format = argv.format || 'text';

      console.error(`Listening for messages... (format: ${format})`);
      console.error('Press Ctrl+C to stop.\n');

      const stop = ob.startListening((msg) => {
        if (format === 'json') {
          console.log(JSON.stringify(msg));
        } else {
          const toStr = msg.to_openid ? `→${msg.to_openid.slice(0, 12)}...` : '';
          console.log(`[seq:${msg.seq_id}] ${msg.from_openid.slice(0, 16)}... ${toStr}: ${msg.content}`);
        }
      });

      // Graceful shutdown
      process.on('SIGINT', () => {
        console.error('\nStopping...');
        stop();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        stop();
        process.exit(0);
      });
    } catch (err) {
      console.error('Listen failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
