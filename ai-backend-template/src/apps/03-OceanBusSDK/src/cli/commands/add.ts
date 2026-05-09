import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';
import { saveContact, setMyOpenId } from '../contacts';

export const addCommand: CommandModule = {
  command: 'add <name> <openid>',
  describe: 'Save a contact and optionally send a greeting',
  builder: (yargs) =>
    yargs
      .positional('name', { type: 'string', describe: 'Short name for this contact', demandOption: true })
      .positional('openid', { type: 'string', describe: 'Contact OpenID', demandOption: true })
      .option('greet-as', { type: 'string', describe: 'Also send a greeting, signed with this name' }),
  handler: async (argv: any) => {
    try {
      const ob = await createOceanBus();
      if (!ob.identity.getApiKey()) {
        console.error('No identity found. Run "oceanbus register" first.');
        process.exit(1);
      }

      const myOpenId = ob.identity.getCachedOpenId() || (await ob.identity.whoami()).my_openid;

      // --- Save contact ---
      saveContact(argv.name, argv.openid);
      setMyOpenId(argv.name, myOpenId);

      try {
        await ob.roster.add({
          name: argv.name,
          source: 'manual',
          myOpenId,
          agents: [{ agentId: '', openId: argv.openid, purpose: '', isDefault: true }],
        });
      } catch { /* may already exist */ }

      // --- Optional greeting ---
      if (argv.greetAs) {
        const greeting = `Hi ${argv.name}, I'm ${argv.greetAs}. Add me to your contacts.`;
        await ob.send(argv.openid, greeting);
      }

      const result: any = {
        code: 0,
        msg: argv.greetAs ? 'saved + greeted' : 'saved',
        name: argv.name,
      };
      if (argv.greetAs) {
        result.greeting_sent = `Hi ${argv.name}, I'm ${argv.greetAs}. Add me to your contacts.`;
      }
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('add failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
