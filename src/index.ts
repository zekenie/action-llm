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
    // Log if env variables are set (without revealing their values)
    core.info('Environment variables:');
    core.info(`GITHUB_TOKEN env: ${!!process.env.GITHUB_TOKEN}`);
    core.info(`LLM_API_KEY env: ${!!process.env.LLM_API_KEY}`);
    core.info(`LLM_MODEL env: ${!!process.env.LLM_MODEL}`);
    
    // Get GitHub token and LLM API key from environment variables only
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token is required but not provided');
    }
    
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error('LLM API key is required but not provided');
    }
    
    const llmModel = process.env.LLM_MODEL || 'claude-3.7-sonnet-20240229';
    
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
        `I've extracted the following action from your request. Please confirm by replying with "approve" or "confirm".\n\n\`\`\`json\n${JSON.stringify(action, null, 2)}\n\`\`\``
      );
      return;
    } else {
      // If no action could be extracted, engage in conversation
      // Use github-actions[bot] as the bot username for Claude to identify responses
      const botUsername = 'github-actions[bot]';
      
      // Get initial conversation response from LLM
      const response = await llmEngine.processConversation(
        [], // No previous comments yet
        issueBody,
        botUsername,
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
  
  // Check if the comment is from the GitHub Actions bot
  const botLogins = ['github-actions[bot]', 'github-actions'];
  
  core.info(`Comment author: ${commentAuthor}, GitHub Actions bots: ${botLogins.join(', ')}`);
  
  if (botLogins.includes(commentAuthor)) {
    core.info('Ignoring GitHub Actions bot\'s own comment');
    return;
  }
  
  // Check if this is an approval comment for a previous action
  if (commentBody.toLowerCase().includes('approve') || 
      commentBody.toLowerCase().includes('confirm') || 
      commentBody.toLowerCase().includes('execute') ||
      commentBody.toLowerCase().includes('yes')) {
    
    core.info(`Detected approval comment: "${commentBody}"`);
    
    // Get previous comment from bot
    const comments = await githubClient.getIssueComments(issueNumber);
    
    // Filter to bot comments containing JSON code blocks
    // Include both GitHub Actions bot and potentially your own comments with actions
    const actionBotLogins = ['github-actions[bot]', 'github-actions'];
    
    const botComments = comments.filter(c => 
      (actionBotLogins.includes(c.author) || c.body.includes('```json')) &&
      c.id !== comment.id  // Skip the current comment
    );
    
    if (botComments.length > 0) {
      // Get the most recent bot comment with an action
      const latestBotComment = botComments[botComments.length - 1];
      
      core.info(`Found previous bot comment to approve: ${latestBotComment.id}`);
      
      // Extract action from the comment
      const action = await extractActionDirectly(latestBotComment.body);
      
      if (action) {
        core.info(`Extracted action from bot comment: ${JSON.stringify(action)}`);
        
        // Execute the action
        await executeAction(action, issue, githubClient);
        return;
      } else {
        core.info(`No valid action found in bot comment: ${latestBotComment.body.substring(0, 100)}...`);
        await githubClient.createIssueComment(
          issueNumber,
          `I couldn't find a valid action to execute in my previous comment. Can you please provide more details?`
        );
        return;
      }
    } else {
      core.info(`No previous bot comments found with actions`);
      await githubClient.createIssueComment(
        issueNumber,
        `I couldn't find a previous action to approve. Can you please provide more details about what you'd like to do?`
      );
      return;
    }
  }

  // Try to extract action directly from comment
  let action = await extractActionDirectly(commentBody);
  
  if (action) {
    // If direct action found, ask for confirmation
    core.info(`Found direct action in comment: ${JSON.stringify(action)}`);
    await githubClient.createIssueComment(
      issueNumber,
      `I'll execute this action for you. Please reply with "approve" to confirm.\n\n\`\`\`json\n${JSON.stringify(action, null, 2)}\n\`\`\``
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
  const botUsername = 'github-actions[bot]';
  const response = await llmEngine.processConversation(
    conversation,
    issue_details.body,
    botUsername,
    createGitHubContext(commentAuthor, context.repo, issueNumber)
  );
  
  // Post the response
  await githubClient.createIssueComment(issueNumber, response);
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