import * as core from '@actions/core';
import * as github from '@actions/github';
import { Action, GitHubContext } from './lib/types';
import { actionDispatcher } from './lib/dispatcher';
import { domainRegistry } from './lib/registry';
import { stateManager } from './lib/state';
import { GitHubClient } from './lib/github/client';
import { LLMEngine } from './lib/llm/engine';

// Import domain reducers
import teamManagementReducer from '../team-management/reducer';

// Register domains
domainRegistry.registerDomain('team-management', teamManagementReducer);

async function run(): Promise<void> {
  try {
    // Log available inputs for debugging
    core.info('Available inputs:');
    core.info(`github-token input: ${!!core.getInput('github-token')}`);
    core.info(`llm-api-key input: ${!!core.getInput('llm-api-key')}`);
    core.info(`llm-model input: ${!!core.getInput('llm-model')}`);
    
    // Log if env variables are set (without revealing their values)
    core.info('Environment variables:');
    core.info(`GITHUB_TOKEN env: ${!!process.env.GITHUB_TOKEN}`);
    core.info(`LLM_API_KEY env: ${!!process.env.LLM_API_KEY}`);
    core.info(`LLM_MODEL env: ${!!process.env.LLM_MODEL}`);
    
    // Get GitHub token and LLM API key (from inputs or environment variables)
    const token = core.getInput('github-token', { required: false }) || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token is required but not provided');
    }
    
    const apiKey = core.getInput('llm-api-key', { required: false }) || process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error('LLM API key is required but not provided');
    }
    
    const llmModel = core.getInput('llm-model') || process.env.LLM_MODEL || 'claude-3.7-sonnet-20240229';
    
    // Get the event that triggered the action
    const context = github.context;
    const repo = context.repo;
    
    // Initialize clients
    const githubClient = new GitHubClient(token, repo.owner, repo.repo);
    const llmEngine = new LLMEngine(apiKey, llmModel);
    
    // Set GitHub client in state manager for remote operations
    stateManager.setGitHubClient(githubClient);
    
    // Handle different event types
    if (context.eventName === 'issues') {
      await handleIssueEvent(context, githubClient, llmEngine);
    } else if (context.eventName === 'issue_comment') {
      await handleCommentEvent(context, githubClient, llmEngine);
    } else if (context.eventName === 'reaction') {
      await handleReactionEvent(context, githubClient, llmEngine);
    } else {
      core.info(`Ignoring unsupported event type: ${context.eventName}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

/**
 * Handle GitHub issue events (opened, edited)
 */
async function handleIssueEvent(
  context: typeof github.context,
  githubClient: GitHubClient,
  llmEngine: LLMEngine
): Promise<void> {
  const issue = context.payload.issue!;
  const issueNumber = issue.number;
  const issueBody = issue.body || '';
  
  core.info(`Processing issue #${issueNumber}: ${issue.title}`);
  
  // Check if issue body contains a direct action (JSON)
  let action = await extractActionDirectly(issueBody);
  
  // If no direct action, use LLM to process
  if (!action) {
    // Try to extract using LLM
    action = await llmEngine.processIssue(issueBody, issueNumber);
    
    if (action) {
      core.info(`LLM extracted action: ${JSON.stringify(action)}`);
      
      // Reply with the extracted action for confirmation
      await githubClient.createIssueComment(
        issueNumber,
        `I've extracted the following action from your request. Please confirm by adding a 👍 reaction to this comment.\n\n\`\`\`json\n${JSON.stringify(action, null, 2)}\n\`\`\``
      );
      return;
    } else {
      // If no action could be extracted, engage in conversation
      const botLogin = context.payload.repository?.owner?.login || 'github-actions[bot]';
      
      // Get initial conversation response from LLM
      const response = await llmEngine.processConversation(
        [], // No previous comments yet
        issueBody,
        botLogin,
        createGitHubContext(issue.user.login, context.repo, issueNumber)
      );
      
      // Post the response
      await githubClient.createIssueComment(issueNumber, response);
      return;
    }
  }
  
  // If we have a direct action, execute it immediately
  core.info(`Extracted direct action from issue body: ${JSON.stringify(action)}`);
  await executeAction(action, issue, githubClient);
}

/**
 * Handle GitHub issue comment events
 */
async function handleCommentEvent(
  context: typeof github.context,
  githubClient: GitHubClient,
  llmEngine: LLMEngine
): Promise<void> {
  // Only process newly created comments
  if (context.payload.action !== 'created') return;
  
  const comment = context.payload.comment!;
  const issue = context.payload.issue!;
  const issueNumber = issue.number;
  const commentBody = comment.body || '';
  const commentAuthor = comment.user.login;
  
  core.info(`Processing comment on issue #${issueNumber} by ${commentAuthor}`);
  
  // Check if the bot itself made the comment
  const botLogin = context.payload.repository?.owner?.login || 'github-actions[bot]';
  if (commentAuthor === botLogin) {
    core.info('Ignoring bot\'s own comment');
    return;
  }
  
  // Try to extract action directly from comment
  let action = await extractActionDirectly(commentBody);
  
  if (action) {
    // If direct action found, ask for confirmation
    core.info(`Found direct action in comment: ${JSON.stringify(action)}`);
    const commentId = await githubClient.createIssueComment(
      issueNumber,
      `I'll execute this action for you. Please confirm by adding a 👍 reaction to this comment.\n\n\`\`\`json\n${JSON.stringify(action, null, 2)}\n\`\`\``
    );
    return;
  }
  
  // If no direct action, continue the conversation
  // Get all comments to build context
  const issue_details = await githubClient.getIssue(issueNumber);
  const comments = await githubClient.getIssueComments(issueNumber);
  
  // Format comments for the LLM
  const conversation = comments.map(c => ({
    author: c.author,
    body: c.body
  }));
  
  // Get LLM response
  const response = await llmEngine.processConversation(
    conversation,
    issue_details.body,
    botLogin,
    createGitHubContext(commentAuthor, context.repo, issueNumber)
  );
  
  // Post the response
  await githubClient.createIssueComment(issueNumber, response);
}

/**
 * Handle GitHub reaction events
 */
async function handleReactionEvent(
  context: typeof github.context,
  githubClient: GitHubClient,
  llmEngine: LLMEngine
): Promise<void> {
  // Only process new reactions
  if (context.payload.action !== 'created') return;
  
  const reaction = context.payload.reaction!;
  const comment = context.payload.comment!;
  const issue = context.payload.issue!;
  const issueNumber = issue.number;
  
  // Only proceed if it's a thumbs up reaction
  if (reaction.content !== '+1') {
    core.info(`Ignoring reaction: ${reaction.content}`);
    return;
  }
  
  core.info(`Processing 👍 reaction on comment #${comment.id} on issue #${issueNumber}`);
  
  // Check if the comment is from the bot
  const botLogin = context.payload.repository?.owner?.login || 'github-actions[bot]';
  if (comment.user.login !== botLogin) {
    core.info('Ignoring reaction on non-bot comment');
    return;
  }
  
  // Extract action from the comment
  const action = await extractActionDirectly(comment.body);
  if (!action) {
    core.info('No action found in the comment');
    return;
  }
  
  // Execute the confirmed action
  core.info(`Executing confirmed action: ${JSON.stringify(action)}`);
  await executeAction(action, issue, githubClient);
}

/**
 * Try to extract action directly from text (JSON parsing)
 */
async function extractActionDirectly(text: string): Promise<Action | null> {
  // First try to parse the entire text as JSON
  try {
    const action = JSON.parse(text) as Action;
    if (isValidAction(action)) {
      return action;
    }
  } catch (e) {
    // If that fails, look for a JSON block in markdown
    const jsonMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const action = JSON.parse(jsonMatch[1].trim()) as Action;
        if (isValidAction(action)) {
          return action;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }
  
  return null;
}

/**
 * Execute an action through the dispatcher
 */
async function executeAction(
  action: Action,
  issue: any,
  githubClient: GitHubClient
): Promise<void> {
  const githubContext = createGitHubContext(
    issue.user.login,
    { owner: githubClient['owner'], repo: githubClient['repo'] },
    issue.number
  );
  
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

/**
 * Create a GitHub context object
 */
function createGitHubContext(
  username: string,
  repo: { owner: string; repo: string },
  issueNumber?: number
): GitHubContext {
  return {
    username,
    repository: repo,
    issueNumber,
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if an object is a valid action
 */
function isValidAction(obj: any): obj is Action {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.domain === 'string' &&
    typeof obj.type === 'string' &&
    obj.payload && typeof obj.payload === 'object'
  );
}

run();