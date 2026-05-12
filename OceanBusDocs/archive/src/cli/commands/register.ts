import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';

export const registerCommand: CommandModule = {
  command: 'register',
  describe: 'Register a new Agent identity',
  handler: async () => {
    try {
      const ob = await createOceanBus();
      const data = await ob.register();
      console.log(JSON.stringify(data, null, 2));
      console.error('Identity saved to ~/.oceanbus/credentials.json');
    } catch (err) {
      console.error('Registration failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
