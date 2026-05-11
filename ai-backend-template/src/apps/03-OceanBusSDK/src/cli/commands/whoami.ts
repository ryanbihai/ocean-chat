import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

export const whoamiCommand: CommandModule = {
  command: 'whoami',
  describe: '[deprecated] Use "openid" instead — show current agent identity',
  handler: async () => {
    console.error('⚠  "oceanbus whoami" is deprecated — use "oceanbus openid" instead.');
    console.error('   openid      = show your stable receiving OpenID');
    console.error('   new-openid  = generate a new OpenID nonce (changes your address)');
    console.error('');
    try {
      const ob = await createOceanBus();
      if (!ob.identity.getApiKey()) {
        console.error('No identity found. Run "oceanbus register" first.');
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
