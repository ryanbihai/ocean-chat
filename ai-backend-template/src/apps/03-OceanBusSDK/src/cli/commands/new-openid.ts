import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

export const newOpenIdCommand: CommandModule = {
  command: 'new-openid',
  describe: 'Generate a new OpenID nonce (changes your address — use openid for stable identity)',
  handler: async () => {
    try {
      const ob = await createOceanBus();
      if (!ob.identity.getApiKey()) {
        console.error('No identity found. Run "oceanbus register" first.');
        process.exit(1);
      }
      const data = await ob.newOpenId();
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('new-openid failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
