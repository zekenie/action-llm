import { z } from 'zod';
import { Action, GitHubContext } from '../types';
import fs from 'fs/promises';
import path from 'path';

/**
 * Simple domain registry to manage domain reducers
 */
export class DomainRegistry {
  private domains: Map<string, any> = new Map();

  /**
   * Register a domain reducer
   */
  registerDomain(domainName: string, domainReducer: any): void {
    this.domains.set(domainName, domainReducer);
  }

  /**
   * Get a domain reducer
   */
  getDomain(domainName: string): any {
    const domain = this.domains.get(domainName);
    if (!domain) {
      throw new Error(`Domain ${domainName} not found`);
    }
    return domain;
  }

  /**
   * Check if a domain exists
   */
  hasDomain(domainName: string): boolean {
    return this.domains.has(domainName);
  }

  /**
   * Get all domain names
   */
  getAllDomainNames(): string[] {
    return Array.from(this.domains.keys());
  }

  /**
   * Validate an action against its domain schema
   */
  validateAction(action: Action): boolean | z.ZodError {
    if (!this.hasDomain(action.domain)) {
      throw new Error(`Domain ${action.domain} not found`);
    }

    const domain = this.getDomain(action.domain);
    
    try {
      domain.actionSchema.parse(action);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error;
      }
      throw error;
    }
  }

  /**
   * Execute a reducer for an action
   */
  executeAction(action: Action, state: any, context: GitHubContext): any {
    if (!this.hasDomain(action.domain)) {
      throw new Error(`Domain ${action.domain} not found`);
    }

    const domain = this.getDomain(action.domain);
    return domain.reduce(state, action, context);
  }

  /**
   * Get initial state for a domain
   */
  getInitialState(domainName: string): any {
    if (!this.hasDomain(domainName)) {
      throw new Error(`Domain ${domainName} not found`);
    }

    const domain = this.getDomain(domainName);
    return domain.initialState;
  }
}

// Create and export a single registry instance
export const domainRegistry = new DomainRegistry();