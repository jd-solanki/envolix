#!/usr/bin/env node
import { Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { checkCommand } from './commands/check';
import { genCommand } from './commands/gen';
import { pullCommand } from './commands/pull';
import { pushCommand } from './commands/push';

const program = new Command('envolix')
  .description('Generate safe example env files and sync env values to providers.')
  .version(packageJson.version);

program.addCommand(genCommand);
program.addCommand(checkCommand);
program.addCommand(pushCommand);
program.addCommand(pullCommand);

await program.parseAsync();
