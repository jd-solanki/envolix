#!/usr/bin/env node
import { Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { genCommand } from './commands/gen.js';
import { pushCommand } from './commands/push.js';

const program = new Command('envolix')
  .description('Generate safe example env files and sync env values to providers.')
  .version(packageJson.version);

program.addCommand(genCommand);
program.addCommand(pushCommand);

await program.parseAsync();
