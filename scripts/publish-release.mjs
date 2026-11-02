/**
 * Shared publish step for bump-version.mjs and release.mjs.
 *
 * The default branch only accepts changes through a pull request, so the
 * release commit cannot be pushed to it. Tags are not covered by that rule.
 * The flow is: release commit on a branch -> PR -> squash merge -> tag the
 * merge commit -> push the tag. The tag push is what deploys the dashboard
 * (.github/workflows/deploy-dashboard.yml), so the tag must name a commit that
 * is already on the default branch.
 */

import { execFileSync } from 'node:child_process';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 20 * 60_000;

function fail(message) {
  console.error(`\nrelease: ${message}\n`);
  process.exit(1);
}

function sh(rootDir, cmd, ...args) {
  try {
    return execFileSync(cmd, args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const detail = (err.stderr || err.message || '').toString().trim();
    throw new Error(`${cmd} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
}

/**
 * Run before any file is edited, so a refusal leaves the tree untouched.
 * Returns the default branch name.
 */
export function preflight(rootDir) {
  try {
    sh(rootDir, 'gh', 'auth', 'status');
  } catch {
    fail('gh is missing or not logged in. The release opens a pull request with gh. Run: gh auth login');
  }

  let defaultBranch;
  try {
    defaultBranch = sh(rootDir, 'git', 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
  } catch {
    fail('cannot tell the default branch. Run: git remote set-head origin --auto');
  }

  const current = sh(rootDir, 'git', 'rev-parse', '--abbrev-ref', 'HEAD');
  if (current !== defaultBranch) fail(`run the release from ${defaultBranch}. You are on ${current}.`);

  try {
    sh(rootDir, 'git', 'fetch', 'origin', defaultBranch, '--tags');
  } catch (err) {
    fail(err.message);
  }
  // Unpushed commits would ride along inside the squashed release PR.
  if (sh(rootDir, 'git', 'rev-parse', 'HEAD') !== sh(rootDir, 'git', 'rev-parse', `origin/${defaultBranch}`)) {
    fail(`local ${defaultBranch} differs from origin/${defaultBranch}. Sync it first.`);
  }
  return defaultBranch;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Commit the already-edited files, merge them through a PR, then tag the merge
 * commit. Exits non-zero with recovery steps if any stage fails.
 */
export async function publishRelease({ rootDir, defaultBranch, tag, files }) {
  const branch = `release/${tag}`;
  let prUrl = null;

  try {
    if (sh(rootDir, 'git', 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) {
      throw new Error(`tag ${tag} already exists on origin`);
    }

    sh(rootDir, 'git', 'switch', '-c', branch);
    sh(rootDir, 'git', 'add', ...files);
    sh(rootDir, 'git', 'commit', '-m', `release: ${tag}`);
    sh(rootDir, 'git', 'push', '-u', 'origin', branch);

    prUrl = sh(
      rootDir, 'gh', 'pr', 'create',
      '--base', defaultBranch, '--head', branch,
      '--title', `release: ${tag}`,
      '--body', `Version bump for ${tag}. Opened by the release script.\n\nThe script tags the merge commit after this PR merges. The tag push deploys the dashboard.`,
    );
    console.log(`Opened ${prUrl}`);

    try {
      sh(rootDir, 'gh', 'pr', 'merge', prUrl, '--squash');
    } catch {
      // A required check is still running. Queue the merge for when it passes.
      sh(rootDir, 'gh', 'pr', 'merge', prUrl, '--squash', '--auto');
    }

    process.stdout.write('Waiting for the PR to merge');
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let mergeSha = '';
    while (!mergeSha) {
      const [state, oid] = sh(rootDir, 'gh', 'pr', 'view', prUrl, '--json', 'state,mergeCommit', '--jq', '.state + " " + (.mergeCommit.oid // "")').split(' ');
      if (state === 'CLOSED') throw new Error('the PR was closed without merging');
      if (state === 'MERGED') mergeSha = oid;
      else if (Date.now() > deadline) throw new Error('the PR did not merge within 20 minutes');
      else {
        process.stdout.write('.');
        await sleep(POLL_INTERVAL_MS);
      }
    }
    console.log();

    sh(rootDir, 'git', 'fetch', 'origin', defaultBranch);
    sh(rootDir, 'git', 'tag', '-a', tag, '-m', tag, mergeSha);
    sh(rootDir, 'git', 'push', 'origin', tag);
  } catch (err) {
    console.error(`\nrelease: ${err.message}`);
    if (prUrl) {
      console.error(`The release PR is ${prUrl}. Once it merges, finish by hand:`);
      console.error(`  git fetch origin && git tag -a ${tag} -m ${tag} <merge-commit-sha> && git push origin ${tag}`);
    }
    console.error(`Local branch ${branch} holds the release commit.`);
    process.exit(1);
  }

  // Cleanup is best effort: the release is already out.
  try {
    sh(rootDir, 'git', 'switch', defaultBranch);
    sh(rootDir, 'git', 'merge', '--ff-only', `origin/${defaultBranch}`);
    sh(rootDir, 'git', 'branch', '-D', branch);
  } catch (err) {
    console.error(`Released ${tag}, but cleanup stopped: ${err.message}`);
  }
  try {
    sh(rootDir, 'git', 'push', 'origin', '--delete', branch);
  } catch {
    // The repo may delete merged branches on its own.
  }
}
