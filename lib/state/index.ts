import fs from 'fs/promises';
import path from 'path';
import { Action, ActionLogEntry, GitHubContext } from '../types';
import { domainRegistry } from '../registry';
import { GitHubClient } from '../github/client';

/**
 * Manages state files and action logs for domains
 */
export class StateManager {
  private basePath: string;
  private githubClient: GitHubClient | null = null;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Set the GitHub client for remote operations
   */
  setGitHubClient(client: GitHubClient): void {
    this.githubClient = client;
  }

  /**
   * Get the current state for a domain
   */
  async getState(domain: string): Promise<any> {
    const statePath = this.getStatePath(domain);
    
    try {
      let content: string;
      
      // Try to get content from GitHub if client is available
      if (this.githubClient) {
        try {
          content = await this.githubClient.getFileContent(statePath);
        } catch (error: any) {
          if (error.status === 404) {
            // If file doesn't exist in GitHub, return initial state
            return domainRegistry.getInitialState(domain);
          }
          throw error;
        }
      } else {
        // Otherwise read from local filesystem
        try {
          content = await fs.readFile(statePath, 'utf-8');
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            // If file doesn't exist locally, return initial state
            return domainRegistry.getInitialState(domain);
          }
          throw error;
        }
      }
      
      return JSON.parse(content);
    } catch (error: any) {
      console.error(`Error getting state for domain ${domain}:`, error);
      return domainRegistry.getInitialState(domain);
    }
  }

  /**
   * Save state and log the action
   */
  async saveState(domain: string, state: any, action: Action, context: GitHubContext): Promise<void> {
    // Prepare file paths
    const statePath = this.getStatePath(domain);
    const logPath = this.getActionLogPath(domain);
    
    // Create log entry
    const logEntry: ActionLogEntry = {
      action,
      timestamp: context.timestamp,
      username: context.username
    };
    
    // Get the current log content or start with empty string
    let currentLog = '';
    if (this.githubClient) {
      try {
        currentLog = await this.githubClient.getFileContent(logPath);
      } catch (error: any) {
        if (error.status !== 404) throw error;
        // If file doesn't exist, start with empty string
      }
    } else {
      try {
        currentLog = await fs.readFile(logPath, 'utf-8');
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
        // If file doesn't exist, start with empty string
      }
    }
    
    // Append the new log entry
    const updatedLog = currentLog + JSON.stringify(logEntry) + '\n';
    
    // Save to GitHub if client is available
    if (this.githubClient) {
      const commitMessage = `${action.type}: ${JSON.stringify(action.payload)}`;
      
      // First update the state file
      await this.githubClient.updateFile(
        statePath,
        JSON.stringify(state, null, 2),
        commitMessage
      );
      
      // Then update the log file
      await this.githubClient.updateFile(
        logPath,
        updatedLog,
        `Update action log for ${commitMessage}`
      );
    } else {
      // Otherwise save to local filesystem
      // Ensure the domain directory exists
      const domainDir = path.join(this.basePath, domain);
      await this.ensureDirectoryExists(domainDir);
      
      // Save both files
      await Promise.all([
        fs.writeFile(statePath, JSON.stringify(state, null, 2)),
        fs.writeFile(logPath, updatedLog)
      ]);
    }
  }

  /**
   * Get action log entries for a domain
   */
  async getActionLog(domain: string, limit = 100): Promise<ActionLogEntry[]> {
    const logPath = this.getActionLogPath(domain);
    
    try {
      let content: string;
      
      // Try to get content from GitHub if client is available
      if (this.githubClient) {
        try {
          content = await this.githubClient.getFileContent(logPath);
        } catch (error: any) {
          if (error.status === 404) {
            return []; // Return empty array if log doesn't exist yet
          }
          throw error;
        }
      } else {
        // Otherwise read from local filesystem
        try {
          content = await fs.readFile(logPath, 'utf-8');
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            return []; // Return empty array if log doesn't exist yet
          }
          throw error;
        }
      }
      
      // Split by newlines and parse each line as JSON
      const entries = content
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => JSON.parse(line) as ActionLogEntry)
        .reverse() // Most recent first
        .slice(0, limit);
        
      return entries;
    } catch (error: any) {
      console.error(`Error getting action log for domain ${domain}:`, error);
      return [];
    }
  }

  /**
   * Helper to get the state file path
   */
  private getStatePath(domain: string): string {
    return `${domain}/state.json`;
  }

  /**
   * Helper to get the action log file path
   */
  private getActionLogPath(domain: string): string {
    return `${domain}/actions.jsonl`;
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
    }
  }
}

// Create and export a default state manager instance
export const stateManager = new StateManager('.');