import { Action, GitHubContext } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export class LLMEngine {
  private apiKey: string;
  private model: string;
  
  constructor(apiKey: string, model = 'claude-3-opus-20240229') {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Process an issue to extract an action
   */
  async processIssue(issueBody: string, issueNumber: number): Promise<Action | null> {
    try {
      // First attempt to directly parse the issue body as JSON
      try {
        const action = JSON.parse(issueBody) as Action;
        if (this.isValidAction(action)) {
          return action;
        }
      } catch (e) {
        // If direct parsing fails, continue to LLM processing
        console.log('Issue body is not valid JSON, trying LLM extraction');
      }
      
      // If direct parsing fails, use Claude to extract the action
      const systemPrompt = this.generateSystemPrompt();
      
      const messages: Message[] = [
        { role: 'user', content: `Extract the action from this text: ${issueBody}` }
      ];
      
      const response = await this.callClaudeAPI(messages);
      return this.extractActionFromResponse(response);
    } catch (error) {
      console.error('Error processing issue:', error);
      return null;
    }
  }

  /**
   * Load conversation history from GitHub issue comments
   * and process them to generate a response
   */
  async processConversation(
    issueComments: Array<{author: string, body: string}>,
    issueBody: string,
    botUsername: string,
    context: GitHubContext
  ): Promise<string> {
    try {
      const systemPrompt = this.generateSystemPrompt();
      
      // Start with empty messages array
      const messages: Message[] = [];
      
      // Add the issue body as the first user message
      messages.push({ role: 'user', content: issueBody });
      
      // Add all comments in chronological order
      for (const comment of issueComments) {
        const role = comment.author === botUsername ? 'assistant' : 'user';
        messages.push({ role, content: comment.body });
      }
      
      // Get response from Claude
      return await this.callClaudeAPI(messages);
    } catch (error) {
      console.error('Error processing conversation:', error);
      return 'I encountered an error while processing your request. Please try again.';
    }
  }

  /**
   * Generate the system prompt for Claude
   */
  private generateSystemPrompt(): string {
    return `You are an AI assistant managing operations through a GitHub issue interface.

Your task is to:
1. Understand what action the user wants to take
2. Ask clarifying questions if necessary
3. Once you understand their intent, propose a specific action using the correct JSON format
4. Tell them to confirm by replying with "approve" or "confirm"

When proposing an action, always use this format:
\`\`\`json
{
  "domain": "domain-name",
  "type": "ACTION_TYPE",
  "payload": {
    // Action-specific parameters
  }
}
\`\`\`

Some examples of valid actions:
- Adding a user to a team:
\`\`\`json
{
  "domain": "team-management",
  "type": "ADD_TO_TEAM",
  "payload": {
    "username": "jsmith",
    "teamName": "frontend"
  }
}
\`\`\`

- Creating a new team:
\`\`\`json
{
  "domain": "team-management",
  "type": "CREATE_TEAM",
  "payload": {
    "teamName": "backend",
    "description": "Backend development team"
  }
}
\`\`\`

Keep your responses concise and focused on helping the user complete their task efficiently.`;
  }

  /**
   * Call the Claude API with the conversation history
   */
  private async callClaudeAPI(messages: Message[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          system: this.generateSystemPrompt(),
          messages,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Claude API error: ${response.status} ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json() as ClaudeResponse;
      return data.content[0].text;
    } catch (error) {
      console.error('Error calling Claude API:', error);
      throw error;
    }
  }

  /**
   * Extract an action from Claude's response
   */
  private extractActionFromResponse(response: string): Action | null {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        const action = JSON.parse(jsonMatch[1].trim()) as Action;
        if (this.isValidAction(action)) {
          return action;
        }
      } catch (e) {
        console.warn('Invalid JSON extracted from response:', e);
      }
    }
    
    return null;
  }

  /**
   * Check if an object is a valid action
   */
  private isValidAction(obj: any): obj is Action {
    return (
      obj &&
      typeof obj === 'object' &&
      typeof obj.domain === 'string' &&
      typeof obj.type === 'string' &&
      obj.payload && typeof obj.payload === 'object'
    );
  }
}