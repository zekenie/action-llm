import * as core from '@actions/core';
import * as github from '@actions/github';

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
      
      // Add a comment to the issue
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: issue.number,
        body: 'Hello World! 👋 Thanks for creating this issue!'
      });
      
      core.info(`Responded to issue #${issue.number}`);
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