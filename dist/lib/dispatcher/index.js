"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actionDispatcher = exports.ActionDispatcher = void 0;
const registry_1 = require("../registry");
const state_1 = require("../state");
/**
 * Dispatches actions to the appropriate reducers and manages state updates
 */
class ActionDispatcher {
    /**
     * Dispatch an action to its domain reducer
     */
    async dispatch(action, context) {
        try {
            // Validate action against its domain schema
            const validationResult = registry_1.domainRegistry.validateAction(action);
            if (validationResult !== true) {
                // If validation fails, return the error
                return {
                    success: false,
                    error: `Validation failed: ${validationResult.toString()}`
                };
            }
            // Get current state for the domain
            const currentState = await state_1.stateManager.getState(action.domain);
            // Execute the reducer to get the new state
            const newState = registry_1.domainRegistry.executeAction(action, currentState, context);
            // Save the new state and log the action
            await state_1.stateManager.saveState(action.domain, newState, action, context);
            return {
                success: true,
                newState
            };
        }
        catch (error) {
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
exports.ActionDispatcher = ActionDispatcher;
// Create and export a single dispatcher instance
exports.actionDispatcher = new ActionDispatcher();
