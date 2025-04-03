import * as core from '@actions/core';
import * as github from '@actions/github';
import { Action, GitHubContext } from '../lib/types';
import { actionDispatcher } from '../lib/dispatcher';
import { domainRegistry } from '../lib/registry';
import { stateManager } from '../lib/state';
import { GitHubClient } from '../lib/github/client';

// Import domain reducers
import teamManagementReducer from '../team-management/reducer';

// Register domains
domainRegistry.registerDomain('team-management', teamManagementReducer);

// Extract action from issue body
async function extractActionFromIssueBody(body: string): Promise<Action | null> {
  try {
    // Assuming the issue body contains valid JSON for an action
    const action = JSON.parse(body) as Action;
    return action;
  } catch (error) {
    core.warning(`Failed to parse action from issue body: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

async function run(): Promise<void> {
  try {
    // Get GitHub token
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    
    // Get the event that triggered the action
    const context = github.context;
    
    // Check if this is a new issue
    if (context.eventName === 'issues' && context.payload.action === 'opened') {
      const issue = context.payload.issue!;
      const repo = context.repo;
      
      core.info(`Processing issue #${issue.number}: ${issue.title}`);
      
      // Create GitHub client
      const githubClient = new GitHubClient(token, repo.owner, repo.repo);
      
      // Set GitHub client in state manager for remote operations
      stateManager.setGitHubClient(githubClient);
      
      // Extract action from issue body
      const action = await extractActionFromIssueBody(issue.body || '');
      
      // If we couldn't extract an action, post a comment explaining the format
      if (!action) {
        await githubClient.createIssueComment(
          issue.number,
          `Failed to extract an action from the issue body. The body should contain a valid JSON object with domain, type, and payload properties.`
        );
        return;
      }
      
      // Create GitHub context for the action
      const githubContext: GitHubContext = {
        username: issue.user.login,
        repository: {
          owner: repo.owner,
          repo: repo.repo
        },
        issueNumber: issue.number,
        timestamp: new Date().toISOString()
      };
      
      // Dispatch the action
      const result = await actionDispatcher.dispatch(action, githubContext);
      
      // Post result as a comment
      if (result.success) {
        await githubClient.createIssueComment(
          issue.number,
          `✅ Action processed successfully!\n\n\`\`\`json\n${JSON.stringify(result.newState, null, 2)}\n\`\`\``
        );
        
        core.info(`Action processed successfully!`);
      } else {
        await githubClient.createIssueComment(
          issue.number,
          `❌ Failed to process action: ${result.error}`
        );
        
        core.error(`Failed to process action: ${result.error}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();