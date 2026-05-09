import type { CommandModule } from 'yargs';
import { listContactNames, resolveAlias, getMyOpenId } from '../contacts';

export const contactsCommand: CommandModule = {
  command: 'contacts',
  describe: 'List saved contacts with their dedicated sender addresses',
  handler: () => {
    try {
      const names = listContactNames();
      if (names.length === 0) {
        console.log('No contacts saved. Use "oceanbus add <name> <openid>" to add one.');
        return;
      }

      console.log('Contacts:');
      for (const name of names) {
        const target = resolveAlias(name) || '(none)';
        const myId = getMyOpenId(name);
        console.log(`  ${name}`);
        console.log(`    对方: ${target.slice(0, 16)}...`);
        console.log(`    我方: ${myId ? myId.slice(0, 16) + '...' : '(未分配)'}`);
      }
    } catch (err) {
      console.error('contacts failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
