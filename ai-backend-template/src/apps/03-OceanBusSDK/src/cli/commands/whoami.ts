import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

export const whoamiCommand: CommandModule = {
  command: 'whoami',
  describe: 'Show current agent identity (must register first)',
  handler: async () => {
    try {
      const ob = await createOceanBus();
      if (!ob.identity.getApiKey()) {
        console.error('No identity found. Run "oceanbus register" first to create a persistent agent identity.');
        console.error('Once registered, whoami will always show the same OpenID — your permanent global address.');
        process.exit(1);
      }
      const data = await ob.whoami();
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('whoami failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
