/**
 * Git Manager - Git operations for workflow management
 * Handles branch creation, commits, and repository state
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * GitManager singleton class
 * Manages git operations for the workflow
 */
class GitManager {
  constructor() {
    this.workingDir = process.cwd();
    this.initialized = false;
  }

  /**
   * Initialize and check git repository
   */
  async init() {
    if (this.initialized) return;

    try {
      await this.execGit('rev-parse --git-dir');
      this.initialized = true;
    } catch (error) {
      throw new Error('Not a git repository. Please initialize git first.');
    }
  }

  /**
   * Execute git command
   * @param {string} command - Git command (without 'git' prefix)
   * @param {Object} [options] - Execution options
   * @returns {string} - Command output
   */
  async execGit(command, options = {}) {
    const { cwd = this.workingDir, ignoreError = false } = options;

    try {
      const { stdout, stderr } = await execAsync(`git ${command}`, { cwd });
      return stdout.trim();
    } catch (error) {
      if (ignoreError) return '';
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  /**
   * Create a new branch
   * @param {string} name - Branch name
   * @returns {string} - Created branch name
   */
  async createBranch(name) {
    await this.init();

    // Check if branch already exists
    const branches = await this.execGit('branch --list', { ignoreError: true });
    if (branches.includes(name)) {
      // Checkout existing branch
      await this.execGit(`checkout ${name}`);
      return name;
    }

    // Create and checkout new branch
    await this.execGit(`checkout -b ${name}`);
    return name;
  }

  /**
   * Create workflow branch with standard naming
   * @param {string} projectName - Project name
   * @returns {string} - Created branch name
   */
  async createWorkflowBranch(projectName) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const branchName = `feature/${safeName}/${date}`;
    return this.createBranch(branchName);
  }

  /**
   * Commit files with message
   * @param {Array} files - Files to commit [{path, content}]
   * @param {string} message - Commit message
   */
  async commitFiles(files, message) {
    await this.init();

    // Write files
    for (const file of files) {
      const filePath = path.join(this.workingDir, file.path);
      const dir = path.dirname(filePath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, file.content);
    }

    // Stage files
    const filePaths = files.map(f => f.path).join(' ');
    await this.execGit(`add ${filePaths}`);

    // Commit
    await this.execGit(`commit -m "${message.replace(/"/g, '\\"')}"`);
  }

  /**
   * Commit staged changes
   * @param {string} message - Commit message
   */
  async commit(message) {
    await this.init();
    await this.execGit(`commit -m "${message.replace(/"/g, '\\"')}"`);
  }

  /**
   * Stage files
   * @param {string[]} files - File paths to stage
   */
  async stage(files) {
    await this.init();
    await this.execGit(`add ${files.join(' ')}`);
  }

  /**
   * Stage all changes
   */
  async stageAll() {
    await this.init();
    await this.execGit('add -A');
  }

  /**
   * Get repository status
   * @returns {Object} - Status object
   */
  async getStatus() {
    await this.init();

    const status = await this.execGit('status --porcelain');
    const branch = await this.getCurrentBranch();

    const lines = status.split('\n').filter(Boolean);
    const staged = [];
    const unstaged = [];
    const untracked = [];

    for (const line of lines) {
      const index = line[0];
      const worktree = line[1];
      const file = line.slice(3);

      if (index === '?') {
        untracked.push(file);
      } else if (index !== ' ') {
        staged.push(file);
      }
      if (worktree !== ' ' && worktree !== '?') {
        unstaged.push(file);
      }
    }

    return {
      branch,
      clean: lines.length === 0,
      staged,
      unstaged,
      untracked
    };
  }

  /**
   * Get current branch name
   * @returns {string}
   */
  async getCurrentBranch() {
    await this.init();
    return this.execGit('rev-parse --abbrev-ref HEAD');
  }

  /**
   * Check if working directory is clean
   * @returns {boolean}
   */
  async isClean() {
    const status = await this.getStatus();
    return status.clean;
  }

  /**
   * Get diff of staged changes
   * @returns {string}
   */
  async getStagedDiff() {
    await this.init();
    return this.execGit('diff --cached', { ignoreError: true });
  }

  /**
   * Get diff of unstaged changes
   * @returns {string}
   */
  async getUnstagedDiff() {
    await this.init();
    return this.execGit('diff', { ignoreError: true });
  }

  /**
   * Get recent commits
   * @param {number} count - Number of commits
   * @returns {Array}
   */
  async getRecentCommits(count = 10) {
    await this.init();
    const log = await this.execGit(`log -${count} --oneline`, { ignoreError: true });
    return log.split('\n').filter(Boolean).map(line => {
      const [hash, ...messageParts] = line.split(' ');
      return { hash, message: messageParts.join(' ') };
    });
  }

  /**
   * Checkout branch
   * @param {string} branch - Branch name
   */
  async checkout(branch) {
    await this.init();
    await this.execGit(`checkout ${branch}`);
  }

  /**
   * Delete branch
   * @param {string} branch - Branch name
   * @param {boolean} force - Force delete
   */
  async deleteBranch(branch, force = false) {
    await this.init();
    const flag = force ? '-D' : '-d';
    await this.execGit(`branch ${flag} ${branch}`);
  }

  /**
   * Push branch to remote
   * @param {string} branch - Branch name
   * @param {string} remote - Remote name
   */
  async push(branch, remote = 'origin') {
    await this.init();
    await this.execGit(`push -u ${remote} ${branch}`);
  }

  /**
   * Pull from remote
   * @param {string} branch - Branch name
   * @param {string} remote - Remote name
   */
  async pull(branch, remote = 'origin') {
    await this.init();
    await this.execGit(`pull ${remote} ${branch}`);
  }

  /**
   * Check if branch exists on remote
   * @param {string} branch - Branch name
   * @param {string} remote - Remote name
   * @returns {boolean}
   */
  async remoteBranchExists(branch, remote = 'origin') {
    await this.init();
    try {
      await this.execGit(`ls-remote --heads ${remote} ${branch}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of all branches
   * @returns {string[]}
   */
  async getBranches() {
    await this.init();
    const output = await this.execGit('branch --list');
    return output.split('\n')
      .map(b => b.replace(/^\*?\s*/, '').trim())
      .filter(Boolean);
  }

  /**
   * Reset to specific commit
   * @param {string} commit - Commit hash or reference
   * @param {string} mode - Reset mode (soft, mixed, hard)
   */
  async reset(commit, mode = 'mixed') {
    await this.init();
    await this.execGit(`reset --${mode} ${commit}`);
  }

  /**
   * Stash changes
   * @param {string} [message] - Stash message
   */
  async stash(message) {
    await this.init();
    const cmd = message ? `stash push -m "${message}"` : 'stash';
    await this.execGit(cmd);
  }

  /**
   * Apply stash
   * @param {number} [index] - Stash index
   */
  async stashPop(index = 0) {
    await this.init();
    await this.execGit(`stash pop stash@{${index}}`);
  }

  /**
   * Get remote URL
   * @param {string} remote - Remote name
   * @returns {string}
   */
  async getRemoteUrl(remote = 'origin') {
    await this.init();
    return this.execGit(`remote get-url ${remote}`, { ignoreError: true });
  }

  /**
   * Create agent-specific commit
   * @param {string} agentType - Agent type
   * @param {string} summary - Commit summary
   * @param {string[]} files - Files to include
   */
  async commitAgentWork(agentType, summary, files = []) {
    const message = `[${agentType}] ${summary}`;

    if (files.length > 0) {
      await this.stage(files);
    } else {
      await this.stageAll();
    }

    const status = await this.getStatus();
    if (status.staged.length > 0) {
      await this.commit(message);
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get GitManager singleton instance
 * @returns {GitManager}
 */
export function getGitManager() {
  if (!instance) {
    instance = new GitManager();
  }
  return instance;
}

export default {
  getGitManager
};
