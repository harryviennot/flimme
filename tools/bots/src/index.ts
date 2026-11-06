// Entry point: `mise run bots -- --code 482913 --count 3`. See config.ts for the options.
import { execSync } from 'node:child_process';

import { startBot, type Bot } from './bot';
import { runPlayAgain } from './play-again';
import { localBackend, parseArgs, stagingBackend, UsageError } from './config';

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const backend =
    config.target === 'staging'
      ? stagingBackend(process.env)
      : localBackend(
          execSync('supabase status -o env', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }),
        );

  // The host of the backend is not personal data: printing it shows where the bots go.
  console.log(`Seed ${config.seed}, personalities ${config.personality}`);
  console.log(`Target ${config.target}: ${new URL(backend.url).host}`);

  if (config.action === 'play-again') {
    const stop = await runPlayAgain(config, backend, console.log);
    const end = async () => {
      await stop();
      process.exit(0);
    };
    process.on('SIGINT', () => void end());
    process.on('SIGTERM', () => void end());
    console.log('play-again bots running. Ctrl-C to leave.');
    return;
  }

  const bots: Bot[] = [];
  const stopAll = async (exitCode = 0) => {
    await Promise.all(bots.map((bot) => bot.stop().catch(() => {})));
    process.exit(exitCode);
  };
  process.on('SIGINT', () => void stopAll());
  process.on('SIGTERM', () => void stopAll());

  try {
    for (let index = 1; index <= config.count; index += 1) {
      bots.push(
        await startBot({
          index,
          backend,
          code: config.code,
          swipeMs: config.swipeMs,
          likeRate: config.likeRate,
          seed: config.seed,
          personality: config.personality,
          log: console.log,
        }),
      );
    }
  } catch (error) {
    // A bot that could not join: leave the ones already in, then report.
    console.error(String((error as Error).message ?? error));
    await stopAll(1);
  }
  console.log(`${config.count} bots present on ${config.target}. Ctrl-C to leave.`);
}

main().catch((error) => {
  console.error(
    error instanceof UsageError ? `Usage: ${error.message}` : String(error.message ?? error),
  );
  process.exit(error instanceof UsageError ? 2 : 1);
});
