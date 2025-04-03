"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const rest_1 = require("@octokit/rest");
const request_error_1 = require("@octokit/request-error");
class GitHubClient {
    octokit;
    owner;
    repo;
    constructor(token, owner, repo) {
        this.octokit = new rest_1.Octokit({ auth: token });
        this.owner = owner;
        this.repo = repo;
    }
    /**
     * Get issue details
     */
    async getIssue(issueNumber) {
        try {
            const response = await this.octokit.issues.get({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
            });
            return {
                title: response.data.title,
                body: response.data.body || '',
                user: response.data.user?.login || 'unknown',
                state: response.data.state,
                created_at: response.data.created_at,
            };
        }
        catch (error) {
            console.error(`Error getting issue #${issueNumber}:`, error);
            throw error;
        }
    }
    /**
     * Get comments from an issue
     */
    async getIssueComments(issueNumber) {
        try {
            const response = await this.octokit.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
            });
            return response.data.map(comment => ({
                id: comment.id,
                body: comment.body || '',
                author: comment.user?.login || 'unknown',
                created_at: comment.created_at,
            }));
        }
        catch (error) {
            console.error(`Error getting comments for issue #${issueNumber}:`, error);
            throw error;
        }
    }
    /**
     * Create a comment on an issue
     */
    async createIssueComment(issueNumber, body) {
        try {
            const response = await this.octokit.issues.createComment({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                body,
            });
            return response.data.id;
        }
        catch (error) {
            console.error(`Error creating comment on issue #${issueNumber}:`, error);
            throw error;
        }
    }
    /**
     * Get reactions for a comment
     */
    async getCommentReactions(commentId) {
        try {
            const response = await this.octokit.reactions.listForIssueComment({
                owner: this.owner,
                repo: this.repo,
                comment_id: commentId,
            });
            return response.data.map(reaction => ({
                content: reaction.content,
                user: reaction.user?.login || 'unknown',
                created_at: reaction.created_at,
            }));
        }
        catch (error) {
            console.error(`Error getting reactions for comment #${commentId}:`, error);
            throw error;
        }
    }
    /**
     * Get file content from the repository
     */
    async getFileContent(path) {
        try {
            const response = await this.octokit.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path,
            });
            // The content is base64 encoded
            if ('content' in response.data) {
                return Buffer.from(response.data.content, 'base64').toString('utf-8');
            }
            throw new Error('Unexpected response format');
        }
        catch (error) {
            if (error instanceof request_error_1.RequestError && error.status === 404) {
                throw new Error(`File not found: ${path}`);
            }
            throw error;
        }
    }
    /**
     * Update a file in the repository
     */
    async updateFile(path, content, message) {
        try {
            // First try to get the current file to get its SHA
            let sha;
            try {
                const response = await this.octokit.repos.getContent({
                    owner: this.owner,
                    repo: this.repo,
                    path,
                });
                if ('sha' in response.data) {
                    sha = response.data.sha;
                }
            }
            catch (error) {
                // If file doesn't exist, that's fine - we'll create it
                if (error instanceof request_error_1.RequestError && error.status !== 404) {
                    throw error;
                }
            }
            // Now update or create the file
            const response = await this.octokit.repos.createOrUpdateFileContents({
                owner: this.owner,
                repo: this.repo,
                path,
                message,
                content: Buffer.from(content).toString('base64'),
                sha,
            });
            // The commit SHA should always be returned
            const commitSha = response.data.commit.sha;
            if (!commitSha) {
                throw new Error('No commit SHA returned from GitHub API');
            }
            return commitSha;
        }
        catch (error) {
            console.error(`Error updating file ${path}:`, error);
            throw error;
        }
    }
}
exports.GitHubClient = GitHubClient;
