import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

export const keyNewCommand: CommandModule = {
  command: 'key new',
  describe: 'Create a new API key',
  handler: async () => {
    try {
      const ob = await createOceanBus();
      const data = await ob.createApiKey();
      console.log(JSON.stringify(data, null, 2));
      console.error('Note: new API keys may take a few seconds to propagate.');
    } catch (err) {
      console.error('Key creation failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
