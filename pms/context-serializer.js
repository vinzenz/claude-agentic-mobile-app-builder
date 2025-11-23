/**
 * Context Serializer - XML format for agent input/output
 * Serializes task context and dependency outputs for agent consumption
 */

/**
 * ContextSerializer singleton class
 * Handles XML serialization for PMS-driven communication
 */
class ContextSerializer {
  constructor() {
    this.indentSize = 2;
  }

  /**
   * Serialize task context to XML format
   * @param {Object} params - Context parameters
   * @returns {string} - XML formatted context
   */
  serializeContext(params) {
    const {
      agentType,
      taskId,
      workflowId,
      context = {},
      dependencyOutputs = {}
    } = params;

    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<task_context>');

    // Task identification
    if (taskId) {
      lines.push(this.indent(`<task_id>${this.escapeXml(taskId)}</task_id>`, 1));
    }
    lines.push(this.indent(`<agent_type>${this.escapeXml(agentType)}</agent_type>`, 1));
    lines.push(this.indent(`<workflow_id>${this.escapeXml(workflowId)}</workflow_id>`, 1));

    // Project context
    if (Object.keys(context).length > 0) {
      lines.push(this.indent('<project_context>', 1));
      lines.push(this.serializeObject(context, 2));
      lines.push(this.indent('</project_context>', 1));
    }

    // Dependency outputs
    if (Object.keys(dependencyOutputs).length > 0) {
      lines.push(this.indent('<dependency_outputs>', 1));
      for (const [depType, output] of Object.entries(dependencyOutputs)) {
        lines.push(this.indent(`<${depType.toLowerCase()}_output>`, 2));
        lines.push(this.serializeDependencyOutput(output, 3));
        lines.push(this.indent(`</${depType.toLowerCase()}_output>`, 2));
      }
      lines.push(this.indent('</dependency_outputs>', 1));
    }

    lines.push('</task_context>');
    return lines.join('\n');
  }

  /**
   * Serialize a generic object to XML
   * @param {Object} obj
   * @param {number} level - Indentation level
   * @returns {string}
   */
  serializeObject(obj, level = 0) {
    const lines = [];

    for (const [key, value] of Object.entries(obj)) {
      const tagName = this.sanitizeTagName(key);

      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        lines.push(this.indent(`<${tagName}>`, level));
        for (const item of value) {
          if (typeof item === 'object') {
            lines.push(this.indent('<item>', level + 1));
            lines.push(this.serializeObject(item, level + 2));
            lines.push(this.indent('</item>', level + 1));
          } else {
            lines.push(this.indent(`<item>${this.escapeXml(String(item))}</item>`, level + 1));
          }
        }
        lines.push(this.indent(`</${tagName}>`, level));
      } else if (typeof value === 'object') {
        lines.push(this.indent(`<${tagName}>`, level));
        lines.push(this.serializeObject(value, level + 1));
        lines.push(this.indent(`</${tagName}>`, level));
      } else {
        lines.push(this.indent(`<${tagName}>${this.escapeXml(String(value))}</${tagName}>`, level));
      }
    }

    return lines.join('\n');
  }

  /**
   * Serialize dependency output
   * @param {Object} output - Agent output
   * @param {number} level - Indentation level
   * @returns {string}
   */
  serializeDependencyOutput(output, level = 0) {
    const lines = [];

    if (output.summary) {
      lines.push(this.indent(`<summary>${this.escapeXml(output.summary)}</summary>`, level));
    }

    if (output.artifacts?.length > 0) {
      lines.push(this.indent('<artifacts>', level));
      for (const artifact of output.artifacts) {
        lines.push(this.indent('<artifact>', level + 1));
        lines.push(this.indent(`<name>${this.escapeXml(artifact.name)}</name>`, level + 2));
        lines.push(this.indent(`<type>${this.escapeXml(artifact.type)}</type>`, level + 2));
        if (artifact.path) {
          lines.push(this.indent(`<path>${this.escapeXml(artifact.path)}</path>`, level + 2));
        }
        if (artifact.content) {
          lines.push(this.indent('<content><![CDATA[', level + 2));
          lines.push(artifact.content);
          lines.push(this.indent(']]></content>', level + 2));
        }
        lines.push(this.indent('</artifact>', level + 1));
      }
      lines.push(this.indent('</artifacts>', level));
    }

    if (output.nextSteps?.length > 0) {
      lines.push(this.indent('<next_steps>', level));
      for (const step of output.nextSteps) {
        lines.push(this.indent(`<step>${this.escapeXml(step)}</step>`, level + 1));
      }
      lines.push(this.indent('</next_steps>', level));
    }

    if (output.warnings?.length > 0) {
      lines.push(this.indent('<warnings>', level));
      for (const warning of output.warnings) {
        lines.push(this.indent(`<warning>${this.escapeXml(warning)}</warning>`, level + 1));
      }
      lines.push(this.indent('</warnings>', level));
    }

    return lines.join('\n');
  }

  /**
   * Deserialize XML context back to object
   * @param {string} xml
   * @returns {Object}
   */
  deserializeContext(xml) {
    // Simple XML parsing (for basic cases)
    const result = {};

    // Extract task_id
    const taskIdMatch = xml.match(/<task_id>(.*?)<\/task_id>/s);
    if (taskIdMatch) result.taskId = this.unescapeXml(taskIdMatch[1]);

    // Extract agent_type
    const agentTypeMatch = xml.match(/<agent_type>(.*?)<\/agent_type>/s);
    if (agentTypeMatch) result.agentType = this.unescapeXml(agentTypeMatch[1]);

    // Extract workflow_id
    const workflowIdMatch = xml.match(/<workflow_id>(.*?)<\/workflow_id>/s);
    if (workflowIdMatch) result.workflowId = this.unescapeXml(workflowIdMatch[1]);

    // Extract project_context
    const contextMatch = xml.match(/<project_context>(.*?)<\/project_context>/s);
    if (contextMatch) {
      result.context = this.parseSimpleXml(contextMatch[1]);
    }

    // Extract dependency_outputs
    const depsMatch = xml.match(/<dependency_outputs>(.*?)<\/dependency_outputs>/s);
    if (depsMatch) {
      result.dependencyOutputs = this.parseDependencyOutputs(depsMatch[1]);
    }

    return result;
  }

  /**
   * Parse simple XML to object
   * @param {string} xml
   * @returns {Object}
   */
  parseSimpleXml(xml) {
    const result = {};
    const tagRegex = /<(\w+)>(.*?)<\/\1>/gs;
    let match;

    while ((match = tagRegex.exec(xml)) !== null) {
      const [, tag, content] = match;
      // Check if content has nested tags
      if (/<\w+>/.test(content)) {
        result[tag] = this.parseSimpleXml(content);
      } else {
        result[tag] = this.unescapeXml(content.trim());
      }
    }

    return result;
  }

  /**
   * Parse dependency outputs from XML
   * @param {string} xml
   * @returns {Object}
   */
  parseDependencyOutputs(xml) {
    const outputs = {};
    const outputRegex = /<(\w+)_output>(.*?)<\/\1_output>/gs;
    let match;

    while ((match = outputRegex.exec(xml)) !== null) {
      const [, agentType, content] = match;
      outputs[agentType.toUpperCase()] = this.parseOutputXml(content);
    }

    return outputs;
  }

  /**
   * Parse output XML structure
   * @param {string} xml
   * @returns {Object}
   */
  parseOutputXml(xml) {
    const output = {};

    const summaryMatch = xml.match(/<summary>(.*?)<\/summary>/s);
    if (summaryMatch) output.summary = this.unescapeXml(summaryMatch[1]);

    // Parse artifacts
    const artifactsMatch = xml.match(/<artifacts>(.*?)<\/artifacts>/s);
    if (artifactsMatch) {
      output.artifacts = [];
      const artifactRegex = /<artifact>(.*?)<\/artifact>/gs;
      let match;
      while ((match = artifactRegex.exec(artifactsMatch[1])) !== null) {
        const artifact = {};
        const nameMatch = match[1].match(/<name>(.*?)<\/name>/s);
        if (nameMatch) artifact.name = this.unescapeXml(nameMatch[1]);
        const typeMatch = match[1].match(/<type>(.*?)<\/type>/s);
        if (typeMatch) artifact.type = this.unescapeXml(typeMatch[1]);
        const pathMatch = match[1].match(/<path>(.*?)<\/path>/s);
        if (pathMatch) artifact.path = this.unescapeXml(pathMatch[1]);
        const contentMatch = match[1].match(/<content><!\[CDATA\[(.*?)\]\]><\/content>/s);
        if (contentMatch) artifact.content = contentMatch[1];
        output.artifacts.push(artifact);
      }
    }

    return output;
  }

  /**
   * Create task summary XML for quick reference
   * @param {Object} task
   * @returns {string}
   */
  serializeTaskSummary(task) {
    return `<task>
  <id>${this.escapeXml(task.id)}</id>
  <agent>${this.escapeXml(task.agentType)}</agent>
  <status>${this.escapeXml(task.status)}</status>
  <summary>${this.escapeXml(task.summary)}</summary>
</task>`;
  }

  /**
   * Escape XML special characters
   * @param {string} str
   * @returns {string}
   */
  escapeXml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Unescape XML special characters
   * @param {string} str
   * @returns {string}
   */
  unescapeXml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&');
  }

  /**
   * Sanitize string for use as XML tag name
   * @param {string} str
   * @returns {string}
   */
  sanitizeTagName(str) {
    return str
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^[0-9-]/, '_$&');
  }

  /**
   * Create indentation string
   * @param {string} str
   * @param {number} level
   * @returns {string}
   */
  indent(str, level) {
    return ' '.repeat(level * this.indentSize) + str;
  }
}

// Singleton instance
let instance = null;

/**
 * Get ContextSerializer singleton instance
 * @returns {ContextSerializer}
 */
export function getContextSerializer() {
  if (!instance) {
    instance = new ContextSerializer();
  }
  return instance;
}

export default {
  getContextSerializer
};
