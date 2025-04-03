"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateManager = exports.StateManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const registry_1 = require("../registry");
/**
 * Manages state files and action logs for domains
 */
class StateManager {
    basePath;
    githubClient;
    constructor(basePath) {
        this.basePath = basePath;
    }
    /**
     * Set the GitHub client for remote operations
     */
    setGitHubClient(client) {
        this.githubClient = client;
    }
    /**
     * Get the current state for a domain
     */
    async getState(domain) {
        const statePath = this.getStatePath(domain);
        try {
            // Try to read the state file
            const content = await promises_1.default.readFile(statePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            // If the file doesn't exist, return the initial state
            if (error.code === 'ENOENT') {
                return registry_1.domainRegistry.getInitialState(domain);
            }
            throw error;
        }
    }
    /**
     * Save state and log the action
     */
    async saveState(domain, state, action, context) {
        // Make sure domain directory exists
        const domainDir = path_1.default.join(this.basePath, domain);
        await this.ensureDirectoryExists(domainDir);
        // Prepare state file path
        const statePath = this.getStatePath(domain);
        // Prepare action log path
        const logPath = this.getActionLogPath(domain);
        // Create log entry
        const logEntry = {
            action,
            timestamp: context.timestamp,
            username: context.username
        };
        // Get the current log content or start with empty string
        let currentLog = '';
        try {
            currentLog = await promises_1.default.readFile(logPath, 'utf-8');
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
            // If file doesn't exist, start with empty string
        }
        // Append the new log entry
        const updatedLog = currentLog + JSON.stringify(logEntry) + '\n';
        // Save both files
        await Promise.all([
            promises_1.default.writeFile(statePath, JSON.stringify(state, null, 2)),
            promises_1.default.writeFile(logPath, updatedLog)
        ]);
    }
    /**
     * Get action log entries for a domain
     */
    async getActionLog(domain, limit = 100) {
        const logPath = this.getActionLogPath(domain);
        try {
            // Get the log file content
            const content = await promises_1.default.readFile(logPath, 'utf-8');
            // Split by newlines and parse each line as JSON
            const entries = content
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => JSON.parse(line))
                .reverse() // Most recent first
                .slice(0, limit);
            return entries;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return []; // Return empty array if log doesn't exist yet
            }
            throw error;
        }
    }
    /**
     * Helper to get the state file path
     */
    getStatePath(domain) {
        return path_1.default.join(this.basePath, domain, 'state.json');
    }
    /**
     * Helper to get the action log file path
     */
    getActionLogPath(domain) {
        return path_1.default.join(this.basePath, domain, 'actions.jsonl');
    }
    /**
     * Ensure a directory exists
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await promises_1.default.mkdir(dirPath, { recursive: true });
        }
        catch (error) {
            // Ignore if directory already exists
        }
    }
}
exports.StateManager = StateManager;
// Create and export a default state manager instance
exports.stateManager = new StateManager('domains');
