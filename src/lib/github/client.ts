import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Get issue details
   */
  async getIssue(issueNumber: number): Promise<{
    title: string;
    body: string;
    user: string;
    state: string;
    created_at: string;
  }> {
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
    } catch (error: unknown) {
      console.error(`Error getting issue #${issueNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get comments from an issue
   */
  async getIssueComments(issueNumber: number): Promise<Array<{
    id: number;
    body: string;
    author: string;
    created_at: string;
  }>> {
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
    } catch (error: unknown) {
      console.error(`Error getting comments for issue #${issueNumber}:`, error);
      throw error;
    }
  }

  /**
   * Create a comment on an issue
   */
  async createIssueComment(issueNumber: number, body: string): Promise<number> {
    try {
      const response = await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body,
      });
      
      return response.data.id;
    } catch (error: unknown) {
      console.error(`Error creating comment on issue #${issueNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get reactions for a comment
   */
  async getCommentReactions(commentId: number): Promise<Array<{
    content: string;
    user: string;
    created_at: string;
  }>> {
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
    } catch (error: unknown) {
      console.error(`Error getting reactions for comment #${commentId}:`, error);
      throw error;
    }
  }

  /**
   * Get file content from the repository
   */
  async getFileContent(path: string): Promise<string> {
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
    } catch (error: unknown) {
      if (error instanceof RequestError && error.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Update a file in the repository
   */
  async updateFile(path: string, content: string, message: string): Promise<string> {
    try {
      // First try to get the current file to get its SHA
      let sha: string | undefined;
      try {
        const response = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
        });
        
        if ('sha' in response.data) {
          sha = response.data.sha;
        }
      } catch (error: unknown) {
        // If file doesn't exist, that's fine - we'll create it
        if (error instanceof RequestError && error.status !== 404) {
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
    } catch (error: unknown) {
      console.error(`Error updating file ${path}:`, error);
      throw error;
    }
  }
}