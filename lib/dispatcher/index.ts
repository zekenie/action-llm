import { Action, DispatchResult, GitHubContext } from '../types';
import { domainRegistry } from '../registry';
import { stateManager } from '../state';
import { z } from 'zod';

/**
 * Dispatches actions to the appropriate reducers and manages state updates
 */
export class ActionDispatcher {
  /**
   * Dispatch an action to its domain reducer
   */
  async dispatch(action: Action, context: GitHubContext): Promise<DispatchResult> {
    try {
      // Validate action against its domain schema
      const validationResult = domainRegistry.validateAction(action);
      
      if (validationResult !== true) {
        // If validation fails, return the error
        return {
          success: false,
          error: `Validation failed: ${validationResult.toString()}`
        };
      }
      
      // Get current state for the domain
      const currentState = await stateManager.getState(action.domain);
      
      // Execute the reducer to get the new state
      const newState = domainRegistry.executeAction(action, currentState, context);
      
      // Save the new state and log the action
      await stateManager.saveState(action.domain, newState, action, context);
      
      return {
        success: true,
        newState
      };
    } catch (error) {
      // Handle errors during dispatch
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`Error dispatching action: ${errorMessage}`, {
        action,
        error
      });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}

// Create and export a single dispatcher instance
export const actionDispatcher = new ActionDispatcher();