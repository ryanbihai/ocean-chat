import type { CommandModule } from 'yargs';

export const whoamiCommand: CommandModule = {
  command: 'whoami',
  describe: '[REMOVED] Use "openid" instead — this command has been removed',
  handler: async () => {
    console.error('"oceanbus whoami" has been removed.');
    console.error('Use "oceanbus openid" to see your stable receiving OpenID.');
    console.error('Use "oceanbus new-openid" to generate a new anti-tracking nonce.');
    process.exit(1);
  },
};
