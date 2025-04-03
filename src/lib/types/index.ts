import { z } from 'zod';

/**
 * Base GitHub context containing information about the action context
 */
export interface GitHubContext {
  username: string;
  repository: {
    owner: string;
    repo: string;
  };
  issueNumber?: number;
  timestamp: string;
}

/**
 * Base action interface
 */
export interface Action {
  domain: string;
  type: string;
  payload: Record<string, any>;
}

/**
 * Base action schema for validation
 */
export const BaseActionSchema = z.object({
  domain: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.any())
});

/**
 * Result of dispatching an action
 */
export interface DispatchResult {
  success: boolean;
  newState?: any;
  error?: string;
}

/**
 * Base state interface with versioning
 */
export const VersionedStateSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  schemaVersion: z.number(),
  data: dataSchema
});

/**
 * Action log entry structure
 */
export interface ActionLogEntry {
  action: Action;
  timestamp: string;
  username: string;
}