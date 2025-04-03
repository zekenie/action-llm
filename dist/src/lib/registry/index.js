"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainRegistry = exports.DomainRegistry = void 0;
const zod_1 = require("zod");
/**
 * Simple domain registry to manage domain reducers
 */
class DomainRegistry {
    domains = new Map();
    /**
     * Register a domain reducer
     */
    registerDomain(domainName, domainReducer) {
        this.domains.set(domainName, domainReducer);
    }
    /**
     * Get a domain reducer
     */
    getDomain(domainName) {
        const domain = this.domains.get(domainName);
        if (!domain) {
            throw new Error(`Domain ${domainName} not found`);
        }
        return domain;
    }
    /**
     * Check if a domain exists
     */
    hasDomain(domainName) {
        return this.domains.has(domainName);
    }
    /**
     * Get all domain names
     */
    getAllDomainNames() {
        return Array.from(this.domains.keys());
    }
    /**
     * Validate an action against its domain schema
     */
    validateAction(action) {
        if (!this.hasDomain(action.domain)) {
            throw new Error(`Domain ${action.domain} not found`);
        }
        const domain = this.getDomain(action.domain);
        try {
            domain.actionSchema.parse(action);
            return true;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return error;
            }
            throw error;
        }
    }
    /**
     * Execute a reducer for an action
     */
    executeAction(action, state, context) {
        if (!this.hasDomain(action.domain)) {
            throw new Error(`Domain ${action.domain} not found`);
        }
        const domain = this.getDomain(action.domain);
        return domain.reduce(state, action, context);
    }
    /**
     * Get initial state for a domain
     */
    getInitialState(domainName) {
        if (!this.hasDomain(domainName)) {
            throw new Error(`Domain ${domainName} not found`);
        }
        const domain = this.getDomain(domainName);
        return domain.initialState;
    }
}
exports.DomainRegistry = DomainRegistry;
// Create and export a single registry instance
exports.domainRegistry = new DomainRegistry();
