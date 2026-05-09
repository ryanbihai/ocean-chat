import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { registerCommand } from './commands/register';
import { whoamiCommand } from './commands/whoami';
import { openidCommand } from './commands/openid';
import { sendCommand } from './commands/send';
import { listenCommand } from './commands/listen';
import { blockCommand } from './commands/block';
import { keygenCommand } from './commands/keygen';
import { keyNewCommand } from './commands/key-new';
import { keyRevokeCommand } from './commands/key-revoke';

export function runCli(argv: string[] = process.argv): void {
  yargs(hideBin(argv))
    .scriptName('oceanbus')
    .usage('$0 <command> [options]')
    .command(registerCommand)
    .command(whoamiCommand)
    .command(openidCommand)
    .command(sendCommand)
    .command(listenCommand)
    .command(blockCommand)
    .command(keygenCommand)
    .command(keyNewCommand)
    .command(keyRevokeCommand)
    .demandCommand(1, 'Please specify a command')
    .help()
    .version()
    .strict()
    .parse();
}
