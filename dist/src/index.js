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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const dispatcher_1 = require("./lib/dispatcher");
const registry_1 = require("./lib/registry");
const state_1 = require("./lib/state");
const client_1 = require("./lib/github/client");
const engine_1 = require("./lib/llm/engine");
// Import domain reducers
const reducer_1 = __importDefault(require("../team-management/reducer"));
// Register domains
registry_1.domainRegistry.registerDomain('team-management', reducer_1.default);
async function run() {
    try {
        // Get GitHub token and LLM API key
        const token = core.getInput('github-token', { required: true });
        const apiKey = core.getInput('llm-api-key', { required: true });
        const llmModel = core.getInput('llm-model') || 'claude-3-opus-20240229';
        // Get the event that triggered the action
        const context = github.context;
        const repo = context.repo;
        // Initialize clients
        const githubClient = new client_1.GitHubClient(token, repo.owner, repo.repo);
        const llmEngine = new engine_1.LLMEngine(apiKey, llmModel);
        // Set GitHub client in state manager for remote operations
        state_1.stateManager.setGitHubClient(githubClient);
        // Handle different event types
        if (context.eventName === 'issues') {
            await handleIssueEvent(context, githubClient, llmEngine);
        }
        else if (context.eventName === 'issue_comment') {
            await handleCommentEvent(context, githubClient, llmEngine);
        }
        else if (context.eventName === 'reaction') {
            await handleReactionEvent(context, githubClient, llmEngine);
        }
        else {
            core.info(`Ignoring unsupported event type: ${context.eventName}`);
        }
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed('An unknown error occurred');
        }
    }
}
/**
 * Handle GitHub issue events (opened, edited)
 */
async function handleIssueEvent(context, githubClient, llmEngine) {
    const issue = context.payload.issue;
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
            await githubClient.createIssueComment(issueNumber, `I've extracted the following action from your request. Please confirm by adding a 👍 reaction to this comment.\n\n\`\`\`json\n${JSON.stringify(action, null, 2)}\n\`\`\``);
            return;
        }
        else {
            // If no action could be extracted, engage in conversation
            const botLogin = context.payload.repository?.owner?.login || 'github-actions[bot]';
            // Get initial conversation response from LLM
            const response = await llmEngine.processConversation([], // No previous comments yet
            issueBody, botLogin, createGitHubContext(issue.user.login, context.repo, issueNumber));
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
async function handleCommentEvent(context, githubClient, llmEngine) {
    // Only process newly created comments
    if (context.payload.action !== 'created')
        return;
    const comment = context.payload.comment;
    const issue = context.payload.issue;
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
        const commentId = await githubClient.createIssueComment(issueNumber, `I'll execute this action for you. Please confirm by adding a 👍 reaction to this comment.\n\n\`\`\`json\n${JSON.stringify(action, null, 2)}\n\`\`\``);
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
    const response = await llmEngine.processConversation(conversation, issue_details.body, botLogin, createGitHubContext(commentAuthor, context.repo, issueNumber));
    // Post the response
    await githubClient.createIssueComment(issueNumber, response);
}
/**
 * Handle GitHub reaction events
 */
async function handleReactionEvent(context, githubClient, llmEngine) {
    // Only process new reactions
    if (context.payload.action !== 'created')
        return;
    const reaction = context.payload.reaction;
    const comment = context.payload.comment;
    const issue = context.payload.issue;
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
async function extractActionDirectly(text) {
    // First try to parse the entire text as JSON
    try {
        const action = JSON.parse(text);
        if (isValidAction(action)) {
            return action;
        }
    }
    catch (e) {
        // If that fails, look for a JSON block in markdown
        const jsonMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const action = JSON.parse(jsonMatch[1].trim());
                if (isValidAction(action)) {
                    return action;
                }
            }
            catch (e) {
                // Ignore parsing errors
            }
        }
    }
    return null;
}
/**
 * Execute an action through the dispatcher
 */
async function executeAction(action, issue, githubClient) {
    const githubContext = createGitHubContext(issue.user.login, { owner: githubClient['owner'], repo: githubClient['repo'] }, issue.number);
    // Dispatch the action
    const result = await dispatcher_1.actionDispatcher.dispatch(action, githubContext);
    // Post result as a comment
    if (result.success) {
        await githubClient.createIssueComment(issue.number, `✅ Action processed successfully!\n\n\`\`\`json\n${JSON.stringify(result.newState, null, 2)}\n\`\`\``);
        core.info(`Action processed successfully!`);
    }
    else {
        await githubClient.createIssueComment(issue.number, `❌ Failed to process action: ${result.error}`);
        core.error(`Failed to process action: ${result.error}`);
    }
}
/**
 * Create a GitHub context object
 */
function createGitHubContext(username, repo, issueNumber) {
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
function isValidAction(obj) {
    return (obj &&
        typeof obj === 'object' &&
        typeof obj.domain === 'string' &&
        typeof obj.type === 'string' &&
        obj.payload && typeof obj.payload === 'object');
}
run();
