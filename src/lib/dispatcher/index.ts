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
      console.log(`Dispatching action: ${JSON.stringify(action)} with context: ${JSON.stringify(context)}`);
      
      // Validate action against its domain schema
      console.log('Validating action against schema...');
      const validationResult = domainRegistry.validateAction(action);
      
      if (validationResult !== true) {
        // If validation fails, return the error
        console.error(`Validation failed: ${JSON.stringify(validationResult)}`);
        return {
          success: false,
          error: `Validation failed: ${validationResult.toString()}`
        };
      }
      
      console.log('Action validation successful');
      
      // Get current state for the domain
      console.log(`Getting current state for domain: ${action.domain}`);
      const currentState = await stateManager.getState(action.domain);
      console.log(`Current state: ${JSON.stringify(currentState)}`);
      
      // Execute the reducer to get the new state
      console.log('Executing reducer...');
      const newState = domainRegistry.executeAction(action, currentState, context);
      console.log(`New state after reducer: ${JSON.stringify(newState)}`);
      
      // Save the new state and log the action
      console.log('Saving state and logging action...');
      await stateManager.saveState(action.domain, newState, action, context);
      console.log('State saved successfully');
      
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