/**
 * PR Manager - Pull Request creation and management
 * Uses gh CLI for GitHub operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getGitManager } from './git-manager.js';

const execAsync = promisify(exec);

/**
 * PRManager singleton class
 * Manages pull request operations via gh CLI
 */
class PRManager {
  constructor() {
    this.gitManager = null;
    this.ghAvailable = null;
  }

  /**
   * Get GitManager instance
   */
  getGit() {
    if (!this.gitManager) {
      this.gitManager = getGitManager();
    }
    return this.gitManager;
  }

  /**
   * Check if gh CLI is available
   * @returns {boolean}
   */
  async isGhAvailable() {
    if (this.ghAvailable !== null) {
      return this.ghAvailable;
    }

    try {
      await execAsync('gh --version');
      this.ghAvailable = true;
    } catch {
      this.ghAvailable = false;
    }

    return this.ghAvailable;
  }

  /**
   * Execute gh command
   * @param {string} command - gh command (without 'gh' prefix)
   * @returns {string}
   */
  async execGh(command) {
    if (!await this.isGhAvailable()) {
      throw new Error('GitHub CLI (gh) is not available. Please install it: https://cli.github.com/');
    }

    try {
      const { stdout } = await execAsync(`gh ${command}`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`GitHub CLI command failed: ${error.message}`);
    }
  }

  /**
   * Create a pull request
   * @param {string} branch - Source branch
   * @param {Object} options - PR options
   * @returns {Object} - Created PR info
   */
  async createPR(branch, options = {}) {
    const {
      title,
      body = '',
      baseBranch = 'main',
      draft = true,
      labels = [],
      reviewers = [],
      assignees = []
    } = options;

    // Ensure we're on the correct branch and pushed
    const git = this.getGit();
    const currentBranch = await git.getCurrentBranch();

    if (currentBranch !== branch) {
      await git.checkout(branch);
    }

    // Push branch to remote if not already
    try {
      await git.push(branch);
    } catch (error) {
      // Branch might already be pushed, continue
    }

    // Build gh pr create command
    let command = `pr create --title "${title.replace(/"/g, '\\"')}" --base ${baseBranch}`;

    if (body) {
      // Use stdin for body to handle special characters
      command += ` --body "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }

    if (draft) {
      command += ' --draft';
    }

    if (labels.length > 0) {
      command += ` --label "${labels.join(',')}"`;
    }

    if (reviewers.length > 0) {
      command += ` --reviewer "${reviewers.join(',')}"`;
    }

    if (assignees.length > 0) {
      command += ` --assignee "${assignees.join(',')}"`;
    }

    const output = await this.execGh(command);

    // Parse PR URL from output
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : output;

    return {
      url,
      branch,
      baseBranch,
      title,
      draft,
      output
    };
  }

  /**
   * Get PR status
   * @param {string} [prNumber] - PR number (optional, uses current branch PR)
   * @returns {Object}
   */
  async getPRStatus(prNumber) {
    const command = prNumber
      ? `pr view ${prNumber} --json number,title,state,url,isDraft,additions,deletions,changedFiles`
      : 'pr view --json number,title,state,url,isDraft,additions,deletions,changedFiles';

    const output = await this.execGh(command);
    return JSON.parse(output);
  }

  /**
   * List open PRs
   * @param {Object} [options] - List options
   * @returns {Array}
   */
  async listPRs(options = {}) {
    const { state = 'open', limit = 30 } = options;
    const output = await this.execGh(`pr list --state ${state} --limit ${limit} --json number,title,state,url,author,createdAt`);
    return JSON.parse(output);
  }

  /**
   * Add comment to PR
   * @param {string} prNumber - PR number
   * @param {string} body - Comment body
   */
  async addComment(prNumber, body) {
    await this.execGh(`pr comment ${prNumber} --body "${body.replace(/"/g, '\\"')}"`);
  }

  /**
   * Request review
   * @param {string} prNumber - PR number
   * @param {string[]} reviewers - Reviewer usernames
   */
  async requestReview(prNumber, reviewers) {
    await this.execGh(`pr edit ${prNumber} --add-reviewer ${reviewers.join(',')}`);
  }

  /**
   * Add labels to PR
   * @param {string} prNumber - PR number
   * @param {string[]} labels - Labels to add
   */
  async addLabels(prNumber, labels) {
    await this.execGh(`pr edit ${prNumber} --add-label ${labels.join(',')}`);
  }

  /**
   * Mark PR as ready for review
   * @param {string} prNumber - PR number
   */
  async markReady(prNumber) {
    await this.execGh(`pr ready ${prNumber}`);
  }

  /**
   * Close PR
   * @param {string} prNumber - PR number
   */
  async closePR(prNumber) {
    await this.execGh(`pr close ${prNumber}`);
  }

  /**
   * Merge PR
   * @param {string} prNumber - PR number
   * @param {Object} [options] - Merge options
   */
  async mergePR(prNumber, options = {}) {
    const { method = 'squash', deleteAfterMerge = true } = options;

    let command = `pr merge ${prNumber} --${method}`;
    if (deleteAfterMerge) {
      command += ' --delete-branch';
    }

    await this.execGh(command);
  }

  /**
   * Get PR checks status
   * @param {string} prNumber - PR number
   * @returns {Array}
   */
  async getChecks(prNumber) {
    const output = await this.execGh(`pr checks ${prNumber} --json name,state,conclusion`);
    return JSON.parse(output);
  }

  /**
   * Create workflow completion PR
   * @param {Object} workflowRun - Workflow run object
   * @returns {Object} - Created PR info
   */
  async createWorkflowPR(workflowRun) {
    const { workflowDef, context, agentExecutions, gitBranch } = workflowRun;

    const title = `[${workflowDef.id}] ${context.projectName || 'Generated App'}`;

    // Generate PR body
    const body = this.generateWorkflowPRBody(workflowRun);

    return this.createPR(gitBranch, {
      title,
      body,
      draft: workflowDef.options?.draftPR ?? true
    });
  }

  /**
   * Generate PR body from workflow run
   * @param {Object} workflowRun
   * @returns {string}
   */
  generateWorkflowPRBody(workflowRun) {
    const { workflowDef, agentExecutions, context } = workflowRun;
    const sections = [];

    // Header
    sections.push(`## ${workflowDef.name}`);
    sections.push('');
    sections.push(workflowDef.description);
    sections.push('');

    // Context
    if (context.description) {
      sections.push('### Description');
      sections.push(context.description);
      sections.push('');
    }

    // Agents summary
    sections.push('### Agents Executed');
    sections.push('');
    sections.push('| Agent | Status | Summary |');
    sections.push('|-------|--------|---------|');

    for (const exec of agentExecutions) {
      const status = exec.status === 'completed' ? '✅' : '❌';
      const summary = exec.output?.summary?.slice(0, 50) || '-';
      sections.push(`| ${exec.agentType} | ${status} | ${summary} |`);
    }
    sections.push('');

    // Artifacts
    const allArtifacts = agentExecutions
      .filter(e => e.output?.artifacts?.length > 0)
      .flatMap(e => e.output.artifacts);

    if (allArtifacts.length > 0) {
      sections.push('### Generated Artifacts');
      sections.push('');
      for (const artifact of allArtifacts) {
        sections.push(`- \`${artifact.path || artifact.name}\` (${artifact.type})`);
      }
      sections.push('');
    }

    // Warnings
    const warnings = agentExecutions
      .filter(e => e.output?.warnings?.length > 0)
      .flatMap(e => e.output.warnings);

    if (warnings.length > 0) {
      sections.push('### ⚠️ Warnings');
      sections.push('');
      for (const warning of warnings) {
        sections.push(`- ${warning}`);
      }
      sections.push('');
    }

    // Footer
    sections.push('---');
    sections.push('*Generated by Agentic Mobile App Builder*');

    return sections.join('\n');
  }
}

// Singleton instance
let instance = null;

/**
 * Get PRManager singleton instance
 * @returns {PRManager}
 */
export function getPRManager() {
  if (!instance) {
    instance = new PRManager();
  }
  return instance;
}

export default {
  getPRManager
};
