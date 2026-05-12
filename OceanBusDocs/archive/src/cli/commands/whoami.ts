import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

export const whoamiCommand: CommandModule = {
  command: 'whoami',
  describe: 'Show current agent_id and latest OpenID',
  handler: async () => {
    try {
      const ob = await createOceanBus();
      const data = await ob.whoami();
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('whoami failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
