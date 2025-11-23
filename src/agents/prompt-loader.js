/**
 * Prompt Loader - Load and prepare agent system prompts
 * Manages prompt templates for different agent types
 */

import fs from 'fs';
import path from 'path';
import { AgentType } from '../../orchestration/types.js';
import { getAgentConfig } from '../../orchestration/agent-configs.js';

const PROMPTS_DIR = '.prompts/agents';

/**
 * PromptLoader class
 * Loads and prepares agent prompts with variable interpolation
 */
class PromptLoader {
  constructor() {
    this.promptsDir = PROMPTS_DIR;
    this.cache = new Map();
    this.ensurePromptsDir();
  }

  /**
   * Ensure prompts directory exists
   */
  ensurePromptsDir() {
    if (!fs.existsSync(this.promptsDir)) {
      fs.mkdirSync(this.promptsDir, { recursive: true });
    }
  }

  /**
   * Load prompt for an agent type
   * @param {string} agentType - Agent type
   * @returns {string} - Prompt content
   */
  loadPrompt(agentType) {
    // Check cache
    if (this.cache.has(agentType)) {
      return this.cache.get(agentType);
    }

    const config = getAgentConfig(agentType);
    if (!config) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    const promptPath = path.join(this.promptsDir, config.promptFile);

    // Check if prompt file exists
    if (!fs.existsSync(promptPath)) {
      // Return default prompt
      const defaultPrompt = this.getDefaultPrompt(agentType);
      this.cache.set(agentType, defaultPrompt);
      return defaultPrompt;
    }

    const prompt = fs.readFileSync(promptPath, 'utf-8');
    this.cache.set(agentType, prompt);
    return prompt;
  }

  /**
   * Get default prompt for agent type
   * @param {string} agentType
   * @returns {string}
   */
  getDefaultPrompt(agentType) {
    const config = getAgentConfig(agentType);
    const capabilities = Object.keys(config.capabilities || {}).join(', ');

    return `# ${config.name}

You are a specialized ${config.name} agent in a multi-agent mobile app development system.

## Role
${config.description}

## Capabilities
${capabilities}

## Output Format
Provide your response in the following structure:
1. Summary of actions taken
2. Generated artifacts (code, configs, documentation)
3. Next steps and recommendations
4. Any warnings or concerns

## Guidelines
- Focus on your specialized area of expertise
- Consider outputs from dependent agents
- Provide actionable, production-ready artifacts
- Follow best practices for mobile development
- Consider security, performance, and maintainability
`;
  }

  /**
   * Prepare prompt with context interpolation
   * @param {string} agentType - Agent type
   * @param {Object} context - Variables to interpolate
   * @returns {string}
   */
  preparePrompt(agentType, context = {}) {
    let prompt = this.loadPrompt(agentType);

    // Interpolate variables
    for (const [key, value] of Object.entries(context)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      prompt = prompt.replace(pattern, String(value));
    }

    // Remove unfilled variables
    prompt = prompt.replace(/\{\{\s*\w+\s*\}\}/g, '');

    return prompt;
  }

  /**
   * Build full agent prompt with task context
   * @param {string} agentType - Agent type
   * @param {string} taskContext - XML task context
   * @param {Object} [options] - Additional options
   * @returns {string}
   */
  buildAgentPrompt(agentType, taskContext, options = {}) {
    const config = getAgentConfig(agentType);
    const systemPrompt = this.preparePrompt(agentType, options.variables || {});

    const sections = [
      systemPrompt,
      '',
      '## Task Context',
      '',
      taskContext,
      ''
    ];

    // Add dependency context if provided
    if (options.dependencyContext) {
      sections.push('## Dependency Outputs');
      sections.push('');
      sections.push(options.dependencyContext);
      sections.push('');
    }

    // Add constraints if any
    if (options.constraints) {
      sections.push('## Constraints');
      sections.push('');
      for (const constraint of options.constraints) {
        sections.push(`- ${constraint}`);
      }
      sections.push('');
    }

    // Add output requirements
    sections.push('## Required Output Format');
    sections.push('');
    sections.push('Provide your response with:');
    sections.push('1. **Summary**: Brief description of what you did');
    sections.push('2. **Artifacts**: Code blocks with file paths (```language\\n// file: path/to/file.ext)');
    sections.push('3. **Next Steps**: Recommendations for following agents');
    sections.push('4. **Warnings**: Any concerns or issues to address');
    sections.push('');

    return sections.join('\n');
  }

  /**
   * Save custom prompt for agent
   * @param {string} agentType - Agent type
   * @param {string} content - Prompt content
   */
  savePrompt(agentType, content) {
    const config = getAgentConfig(agentType);
    if (!config) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    const promptPath = path.join(this.promptsDir, config.promptFile);
    fs.writeFileSync(promptPath, content);

    // Update cache
    this.cache.set(agentType, content);
  }

  /**
   * Clear prompt cache
   * @param {string} [agentType] - Specific agent type or all
   */
  clearCache(agentType) {
    if (agentType) {
      this.cache.delete(agentType);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get all available prompts
   * @returns {Object}
   */
  getAllPrompts() {
    const prompts = {};
    for (const type of Object.values(AgentType)) {
      try {
        prompts[type] = this.loadPrompt(type);
      } catch {
        prompts[type] = null;
      }
    }
    return prompts;
  }

  /**
   * Validate prompt template
   * @param {string} content - Prompt content
   * @returns {{valid: boolean, errors: string[]}}
   */
  validatePrompt(content) {
    const errors = [];

    if (!content || content.trim().length === 0) {
      errors.push('Prompt content is empty');
    }

    if (content.length < 100) {
      errors.push('Prompt is too short (minimum 100 characters)');
    }

    // Check for required sections
    const requiredSections = ['Role', 'Output Format'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        errors.push(`Missing required section: ${section}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get PromptLoader singleton instance
 * @returns {PromptLoader}
 */
export function getPromptLoader() {
  if (!instance) {
    instance = new PromptLoader();
  }
  return instance;
}

/**
 * Load prompt for agent (convenience function)
 * @param {string} agentType
 * @returns {string}
 */
export function loadAgentPrompt(agentType) {
  return getPromptLoader().loadPrompt(agentType);
}

/**
 * Build full agent prompt (convenience function)
 * @param {string} agentType
 * @param {string} taskContext
 * @param {Object} [options]
 * @returns {string}
 */
export function buildAgentPrompt(agentType, taskContext, options) {
  return getPromptLoader().buildAgentPrompt(agentType, taskContext, options);
}

export default {
  getPromptLoader,
  loadAgentPrompt,
  buildAgentPrompt
};
