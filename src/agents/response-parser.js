/**
 * Response Parser - Parse agent CLI output into structured format
 * Extracts artifacts, metadata, and status from Claude responses
 */

/**
 * @typedef {Object} AgentOutput
 * @property {boolean} success - Whether execution succeeded
 * @property {string} summary - Summary of what was done
 * @property {Array} artifacts - Generated artifacts
 * @property {Object} metadata - Execution metadata
 * @property {string[]} [nextSteps] - Suggested next steps
 * @property {string[]} [warnings] - Any warnings encountered
 */

/**
 * Parse agent response from Claude CLI
 * @param {string|Object} response - Raw response from CLI
 * @returns {AgentOutput}
 */
export function parseAgentResponse(response) {
  // Handle object response (from structured output)
  if (typeof response === 'object' && response !== null) {
    return normalizeOutput(response);
  }

  // Parse string response
  const output = {
    success: true,
    summary: '',
    artifacts: [],
    metadata: {
      tokensUsed: 0,
      executionTime: 0,
      filesCreated: [],
      filesModified: []
    },
    nextSteps: [],
    warnings: []
  };

  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(response);
    return normalizeOutput(parsed);
  } catch {
    // Parse as text response
    return parseTextResponse(response, output);
  }
}

/**
 * Parse text response into structured output
 * @param {string} text - Raw text response
 * @param {AgentOutput} output - Output object to populate
 * @returns {AgentOutput}
 */
function parseTextResponse(text, output) {
  const lines = text.split('\n');

  // Extract summary (first paragraph or heading)
  const summaryMatch = text.match(/^#?\s*(?:Summary|Overview|Result)[:.]?\s*(.+?)(?:\n\n|$)/mi);
  if (summaryMatch) {
    output.summary = summaryMatch[1].trim();
  } else {
    // Use first non-empty line as summary
    output.summary = lines.find(l => l.trim().length > 0)?.trim() || '';
  }

  // Extract code blocks as artifacts
  const codeBlockRegex = /```(\w+)?\s*(?:\n)?(?:\/\/\s*file:\s*(.+?)\n)?([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const [, language, filePath, content] = match;

    if (content.trim()) {
      const artifact = {
        name: filePath || `code-${output.artifacts.length + 1}`,
        type: language || 'code',
        content: content.trim()
      };

      if (filePath) {
        artifact.path = filePath.trim();
        output.metadata.filesCreated.push(artifact.path);
      }

      output.artifacts.push(artifact);
    }
  }

  // Extract file paths mentioned in response
  const filePathRegex = /(?:created?|generated?|wrote|modified?|updated?)[:\s]+[`"]?([^\s`"]+\.[a-zA-Z]+)[`"]?/gi;
  while ((match = filePathRegex.exec(text)) !== null) {
    const filePath = match[1];
    if (!output.metadata.filesCreated.includes(filePath) && !output.metadata.filesModified.includes(filePath)) {
      if (/created?|generated?|wrote/i.test(match[0])) {
        output.metadata.filesCreated.push(filePath);
      } else {
        output.metadata.filesModified.push(filePath);
      }
    }
  }

  // Extract warnings
  const warningRegex = /(?:⚠️|warning|caution|note)[:.]?\s*(.+?)(?:\n|$)/gi;
  while ((match = warningRegex.exec(text)) !== null) {
    output.warnings.push(match[1].trim());
  }

  // Extract next steps
  const nextStepsMatch = text.match(/(?:next\s*steps?|todo|recommendations?)[:.]?\s*([\s\S]*?)(?:\n\n|$)/mi);
  if (nextStepsMatch) {
    const steps = nextStepsMatch[1]
      .split(/\n[-*\d.]+\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    output.nextSteps.push(...steps);
  }

  // Check for error indicators
  if (/error|failed|exception|cannot|unable/i.test(text) && !/fixed|resolved|handled/i.test(text)) {
    output.success = false;
  }

  return output;
}

/**
 * Normalize output object to standard format
 * @param {Object} obj - Parsed object
 * @returns {AgentOutput}
 */
function normalizeOutput(obj) {
  return {
    success: obj.success ?? true,
    summary: obj.summary || obj.message || obj.result || '',
    artifacts: normalizeArtifacts(obj.artifacts || obj.files || []),
    metadata: {
      tokensUsed: obj.metadata?.tokensUsed || obj.tokensUsed || obj.usage?.total_tokens || 0,
      executionTime: obj.metadata?.executionTime || obj.executionTime || 0,
      filesCreated: obj.metadata?.filesCreated || obj.filesCreated || [],
      filesModified: obj.metadata?.filesModified || obj.filesModified || []
    },
    nextSteps: obj.nextSteps || obj.next_steps || obj.recommendations || [],
    warnings: obj.warnings || []
  };
}

/**
 * Normalize artifacts array
 * @param {Array} artifacts
 * @returns {Array}
 */
function normalizeArtifacts(artifacts) {
  return artifacts.map(a => ({
    name: a.name || a.filename || 'unnamed',
    type: a.type || detectArtifactType(a.path || a.name || ''),
    path: a.path || a.filepath || null,
    content: a.content || a.code || a.data || '',
    metadata: a.metadata || {}
  }));
}

/**
 * Detect artifact type from filename
 * @param {string} filename
 * @returns {string}
 */
function detectArtifactType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();

  const typeMap = {
    // Code
    js: 'code',
    ts: 'code',
    jsx: 'code',
    tsx: 'code',
    py: 'code',
    java: 'code',
    kt: 'code',
    swift: 'code',
    dart: 'code',

    // Config
    json: 'config',
    yaml: 'config',
    yml: 'config',
    toml: 'config',
    xml: 'config',
    env: 'config',

    // Documentation
    md: 'documentation',
    txt: 'documentation',
    rst: 'documentation',

    // Styles
    css: 'style',
    scss: 'style',
    less: 'style',

    // Tests
    test: 'test',
    spec: 'test',

    // Schema
    sql: 'schema',
    prisma: 'schema',
    graphql: 'schema'
  };

  return typeMap[ext] || 'file';
}

/**
 * Extract structured data from agent response
 * @param {string} response - Raw response
 * @param {string} format - Expected format (json, xml, yaml)
 * @returns {Object|null}
 */
export function extractStructuredData(response, format = 'json') {
  const formatPatterns = {
    json: /```json\s*([\s\S]*?)```/,
    xml: /```xml\s*([\s\S]*?)```/,
    yaml: /```ya?ml\s*([\s\S]*?)```/
  };

  const pattern = formatPatterns[format];
  if (!pattern) return null;

  const match = response.match(pattern);
  if (!match) return null;

  try {
    if (format === 'json') {
      return JSON.parse(match[1]);
    }
    // Return raw for other formats
    return { raw: match[1].trim() };
  } catch {
    return null;
  }
}

/**
 * Extract file operations from response
 * @param {string} response - Raw response
 * @returns {Object}
 */
export function extractFileOperations(response) {
  const operations = {
    create: [],
    modify: [],
    delete: [],
    rename: []
  };

  // Create patterns
  const createPattern = /(?:create|add|new|generate)[sd]?\s+(?:file\s+)?[`"]?([^\s`"]+\.[a-zA-Z]+)[`"]?/gi;
  let match;
  while ((match = createPattern.exec(response)) !== null) {
    operations.create.push(match[1]);
  }

  // Modify patterns
  const modifyPattern = /(?:modif|updat|chang|edit)[yed]+\s+(?:file\s+)?[`"]?([^\s`"]+\.[a-zA-Z]+)[`"]?/gi;
  while ((match = modifyPattern.exec(response)) !== null) {
    operations.modify.push(match[1]);
  }

  // Delete patterns
  const deletePattern = /(?:delet|remov)[ed]+\s+(?:file\s+)?[`"]?([^\s`"]+\.[a-zA-Z]+)[`"]?/gi;
  while ((match = deletePattern.exec(response)) !== null) {
    operations.delete.push(match[1]);
  }

  // Rename patterns
  const renamePattern = /renam[ed]+\s+[`"]?([^\s`"]+)[`"]?\s+(?:to|->)\s+[`"]?([^\s`"]+)[`"]?/gi;
  while ((match = renamePattern.exec(response)) !== null) {
    operations.rename.push({ from: match[1], to: match[2] });
  }

  return operations;
}

/**
 * Validate agent output structure
 * @param {Object} output - Output to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateOutput(output) {
  const errors = [];

  if (typeof output.success !== 'boolean') {
    errors.push('Missing or invalid "success" field');
  }

  if (typeof output.summary !== 'string') {
    errors.push('Missing or invalid "summary" field');
  }

  if (!Array.isArray(output.artifacts)) {
    errors.push('Missing or invalid "artifacts" field');
  } else {
    output.artifacts.forEach((a, i) => {
      if (!a.name) errors.push(`Artifact ${i} missing "name"`);
      if (!a.type) errors.push(`Artifact ${i} missing "type"`);
    });
  }

  if (!output.metadata || typeof output.metadata !== 'object') {
    errors.push('Missing or invalid "metadata" field');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  parseAgentResponse,
  extractStructuredData,
  extractFileOperations,
  validateOutput
};
