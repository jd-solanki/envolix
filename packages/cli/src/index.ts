#!/usr/bin/env node
import { Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { genCommand } from './commands/gen.js';

const program = new Command('envolix')
  .description('Generate safe example env files from source env files.')
  .version(packageJson.version);

program.addCommand(genCommand);

await program.parseAsync();
