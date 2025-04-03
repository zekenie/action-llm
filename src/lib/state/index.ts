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
  private githubClient?: GitHubClient;

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
      // Try to read the state file
      const content = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      // If the file doesn't exist, return the initial state
      if (error.code === 'ENOENT') {
        return domainRegistry.getInitialState(domain);
      }
      throw error;
    }
  }

  /**
   * Save state and log the action
   */
  async saveState(domain: string, state: any, action: Action, context: GitHubContext): Promise<void> {
    console.log(`StateManager: Saving state for domain: ${domain}`);
    
    // Make sure domain directory exists
    const domainDir = path.join(this.basePath, domain);
    console.log(`StateManager: Ensuring directory exists: ${domainDir}`);
    await this.ensureDirectoryExists(domainDir);
    
    // Prepare state file path
    const statePath = this.getStatePath(domain);
    console.log(`StateManager: State file path: ${statePath}`);
    
    // Prepare action log path
    const logPath = this.getActionLogPath(domain);
    console.log(`StateManager: Action log path: ${logPath}`);
    
    // Create log entry
    const logEntry: ActionLogEntry = {
      action,
      timestamp: context.timestamp,
      username: context.username
    };
    
    // Get the current log content or start with empty string
    let currentLog = '';
    try {
      currentLog = await fs.readFile(logPath, 'utf-8');
      console.log(`StateManager: Successfully read existing log file`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`StateManager: Error reading log file: ${error.message}`);
        throw error;
      }
      console.log(`StateManager: Log file does not exist yet, starting with empty string`);
      // If file doesn't exist, start with empty string
    }
    
    // Append the new log entry
    const updatedLog = currentLog + JSON.stringify(logEntry) + '\n';
    
    // Debug current working directory
    console.log(`StateManager: Current working directory: ${process.cwd()}`);
    
    try {
      // Save state file
      console.log(`StateManager: Writing state file to ${statePath}`);
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
      console.log(`StateManager: State file written successfully`);
      
      // Save log file
      console.log(`StateManager: Writing log file to ${logPath}`);
      await fs.writeFile(logPath, updatedLog);
      console.log(`StateManager: Log file written successfully`);
    } catch (error) {
      console.error(`StateManager: Error writing files: ${error}`);
      throw error;
    }
  }

  /**
   * Get action log entries for a domain
   */
  async getActionLog(domain: string, limit = 100): Promise<ActionLogEntry[]> {
    const logPath = this.getActionLogPath(domain);
    
    try {
      // Get the log file content
      const content = await fs.readFile(logPath, 'utf-8');
      
      // Split by newlines and parse each line as JSON
      const entries = content
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => JSON.parse(line) as ActionLogEntry)
        .reverse() // Most recent first
        .slice(0, limit);
        
      return entries;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []; // Return empty array if log doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Helper to get the state file path
   */
  private getStatePath(domain: string): string {
    return path.join(this.basePath, domain, 'state.json');
  }

  /**
   * Helper to get the action log file path
   */
  private getActionLogPath(domain: string): string {
    return path.join(this.basePath, domain, 'actions.jsonl');
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
// Use absolute path based on current working directory
export const stateManager = new StateManager(path.join(process.cwd(), 'domains'));