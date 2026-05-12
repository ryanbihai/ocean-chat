import type { CommandModule } from 'yargs';
import { createOceanBus } from '../../index';
import { saveContact, setMyOpenId } from '../contacts';

export const introduceCommand: CommandModule = {
  command: 'introduce <openid>',
  describe: 'Introduce yourself to another agent — sends greeting + adds to roster',
  builder: (yargs) =>
    yargs
      .positional('openid', { type: 'string', describe: 'Recipient OpenID', demandOption: true })
      .option('as', { type: 'string', describe: 'Your name (so they know who you are)', demandOption: true })
      .option('name', { type: 'string', describe: "How to save THEM in your roster (default: 'Contact-<shortid>')" }),
  handler: async (argv: any) => {
    try {
      const ob = await createOceanBus();
      if (!ob.identity.getApiKey()) {
        console.error('No identity found. Run "oceanbus register" first.');
        process.exit(1);
      }

      const myOpenId = await ob.getOpenId();
      const myName = argv.as;
      const theirName = argv.name || `Contact-${argv.openid.slice(0, 8)}`;

      // --- 1. Add them to your roster ---
      saveContact(theirName, argv.openid);
      setMyOpenId(theirName, myOpenId);
      try {
        await ob.roster.add({
          name: theirName,
          myOpenId,
          openIds: [argv.openid],
        });
      } catch { /* may already exist */ }

      // --- 2. Send greeting ---
      const greeting = `Hi, I'm ${myName}. Add me to your contacts.`;
      await ob.send(argv.openid, greeting);

      const shortId = myOpenId.slice(0, 12) + '...';
      console.log(JSON.stringify({
        code: 0,
        msg: 'introduced',
        to: argv.openid.slice(0, 12) + '...',
        saved_as: theirName,
        your_address: shortId,
        greeting_sent: greeting,
        hint: `They can add you back with: oceanbus introduce ${shortId} --as <their-name>`,
      }, null, 2));
    } catch (err) {
      console.error('Introduce failed:', (err as Error).message);
      process.exit(1);
    }
  },
};
