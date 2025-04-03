// Export all the modules from the library
export * from './lib/types';
export * from './lib/registry';
export * from './lib/state';
export * from './lib/dispatcher';
export * from './lib/github/client';

// Re-export domains
import teamManagementReducer from './team-management/reducer';
export { teamManagementReducer };

// This file is the main entry point for the library
// The actual GitHub Action is executed from src/index.ts