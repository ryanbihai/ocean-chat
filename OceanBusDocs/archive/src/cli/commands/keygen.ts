import type { CommandModule } from 'yargs';
import { generateKeypair, keypairToHex } from '../../crypto/ed25519';

export const keygenCommand: CommandModule = {
  command: 'keygen',
  describe: 'Generate Ed25519 keypair',
  handler: async () => {
    try {
      const keypair = await generateKeypair();
      const hex = keypairToHex(keypair);
      console.log(JSON.stringify(hex, null, 2));
    } catch (err) {
      console.error('Keygen failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
