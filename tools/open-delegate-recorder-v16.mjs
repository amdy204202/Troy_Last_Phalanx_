import { appendFileSync } from 'node:fs';

const output = process.env.TROY_OPEN_DELEGATE_LOG;
if (!output) {
  console.error('TROY_OPEN_DELEGATE_LOG is required');
  process.exitCode = 2;
} else {
  appendFileSync(output, `${JSON.stringify({ pid: process.pid, args: process.argv.slice(2) })}\n`, 'utf8');
}
