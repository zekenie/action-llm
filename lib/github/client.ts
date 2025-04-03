import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';

/**
 * GitHub client for interacting with the GitHub API
 */
export class GitHubClient {
  private octokit: ReturnType<typeof github.getOctokit>;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = github.getOctokit(token);
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Create a comment on an issue
   */
  async createIssueComment(issueNumber: number, body: string): Promise<void> {
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
  async getFileContent(path: string): Promise<string> {
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
    } catch (error: any) {
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
  async updateFile(path: string, content: string, message: string): Promise<void> {
    try {
      // Try to get the current file to get its SHA
      let sha: string | undefined;
      
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
      } catch (error: any) {
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
    } catch (error: any) {
      console.error(`Error updating file ${path}:`, error);
      throw new Error(`Failed to update file: ${error.message}`);
    }
  }
}