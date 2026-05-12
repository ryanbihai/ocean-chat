import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

interface KeyRevokeArgs {
  keyId: string;
}

export const keyRevokeCommand: CommandModule = {
  command: 'key-revoke <key_id>',
  describe: 'Revoke an API key',
  builder: (yargs) =>
    yargs.positional('key_id', {
      type: 'string',
      describe: 'API key ID to revoke',
      demandOption: true,
    }),
  handler: async (argv: any) => {
    try {
      const ob = await createOceanBus();
      await ob.revokeApiKey(argv.key_id);
      console.log(JSON.stringify({ code: 0, msg: 'revoked' }));
    } catch (err) {
      console.error('Revoke failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
