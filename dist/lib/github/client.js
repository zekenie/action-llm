"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const github = __importStar(require("@actions/github"));
/**
 * GitHub client for interacting with the GitHub API
 */
class GitHubClient {
    octokit;
    owner;
    repo;
    constructor(token, owner, repo) {
        this.octokit = github.getOctokit(token);
        this.owner = owner;
        this.repo = repo;
    }
    /**
     * Create a comment on an issue
     */
    async createIssueComment(issueNumber, body) {
        await this.octokit.rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
            body
        });
    }
    /**
     * Get the content of a file from the repository
     */
    async getFileContent(path) {
        try {
            const response = await this.octokit.rest.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path
            });
            // Handle file response
            if ('content' in response.data && !Array.isArray(response.data)) {
                const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
                return content;
            }
            throw new Error(`Not a file: ${path}`);
        }
        catch (error) {
            // Pass through 404 errors (file not found)
            if (error.status === 404) {
                throw error;
            }
            console.error(`Error getting file content for ${path}:`, error);
            throw new Error(`Failed to get file content: ${error.message}`);
        }
    }
    /**
     * Update a file in the repository
     */
    async updateFile(path, content, message) {
        try {
            // Try to get the current file to get its SHA
            let sha;
            try {
                const response = await this.octokit.rest.repos.getContent({
                    owner: this.owner,
                    repo: this.repo,
                    path
                });
                // Handle file response
                if ('sha' in response.data && !Array.isArray(response.data)) {
                    sha = response.data.sha;
                }
            }
            catch (error) {
                // If file doesn't exist (404), that's fine - we'll create it
                if (error.status !== 404) {
                    throw error;
                }
            }
            // Update or create the file
            await this.octokit.rest.repos.createOrUpdateFileContents({
                owner: this.owner,
                repo: this.repo,
                path,
                message,
                content: Buffer.from(content).toString('base64'),
                sha // Include SHA if we're updating an existing file
            });
        }
        catch (error) {
            console.error(`Error updating file ${path}:`, error);
            throw new Error(`Failed to update file: ${error.message}`);
        }
    }
}
exports.GitHubClient = GitHubClient;
