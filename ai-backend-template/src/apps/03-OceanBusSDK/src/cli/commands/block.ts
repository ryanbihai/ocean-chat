import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

interface BlockArgs {
  openid: string;
}

export const blockCommand: CommandModule = {
  command: 'block <openid>',
  describe: 'Block a sender by their from_openid',
  builder: (yargs) =>
    yargs.positional('openid', {
      type: 'string',
      describe: 'Sender OpenID to block',
      demandOption: true,
    }),
  handler: async (argv: any) => {
    try {
      const ob = await createOceanBus();
      await ob.blockSender(argv.openid);
      console.log(JSON.stringify({ code: 0, msg: 'blocked' }));
    } catch (err) {
      console.error('Block failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
