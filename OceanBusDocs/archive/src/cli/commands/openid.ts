import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

export const openidCommand: CommandModule = {
  command: 'openid',
  describe: 'Get and print current OpenID',
  handler: async () => {
    try {
      const ob = await createOceanBus();
      const openid = await ob.getOpenId();
      console.log(openid);
    } catch (err) {
      console.error('openid failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
