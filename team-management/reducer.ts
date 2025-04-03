import { z } from 'zod';
import { Action, GitHubContext, VersionedStateSchema } from '../lib/types';
import { 
  TeamState, 
  TeamActionTypes,
  AddToTeamPayload,
  RemoveFromTeamPayload,
  CreateTeamPayload,
  UpdateTeamDescriptionPayload
} from './types';

/**
 * Team schema for validation
 */
const TeamSchema = z.object({
  description: z.string(),
  owner: z.string(),
  members: z.array(z.string()),
  createdAt: z.string()
});

/**
 * Team management state schema
 */
export const TeamManagementStateSchema = VersionedStateSchema(
  z.object({
    teams: z.record(z.string(), TeamSchema)
  })
);

/**
 * Team action schemas
 */
const AddToTeamSchema = z.object({
  domain: z.literal('team-management'),
  type: z.literal(TeamActionTypes.ADD_TO_TEAM),
  payload: z.object({
    username: z.string(),
    teamName: z.string()
  })
});

const RemoveFromTeamSchema = z.object({
  domain: z.literal('team-management'),
  type: z.literal(TeamActionTypes.REMOVE_FROM_TEAM),
  payload: z.object({
    username: z.string(),
    teamName: z.string()
  })
});

const CreateTeamSchema = z.object({
  domain: z.literal('team-management'),
  type: z.literal(TeamActionTypes.CREATE_TEAM),
  payload: z.object({
    teamName: z.string(),
    description: z.string(),
    owner: z.string().optional()
  })
});

const UpdateTeamDescriptionSchema = z.object({
  domain: z.literal('team-management'),
  type: z.literal(TeamActionTypes.UPDATE_TEAM_DESCRIPTION),
  payload: z.object({
    teamName: z.string(),
    description: z.string()
  })
});

/**
 * Combined action schema
 */
export const TeamActionSchema = z.discriminatedUnion('type', [
  AddToTeamSchema,
  RemoveFromTeamSchema,
  CreateTeamSchema,
  UpdateTeamDescriptionSchema
]);

/**
 * Initial state for team management
 */
export const initialState: TeamState = {
  schemaVersion: 1,
  data: {
    teams: {}
  }
};

/**
 * Team management reducer
 */
export function reduce(state: TeamState = initialState, action: Action, context: GitHubContext): TeamState {
  switch (action.type) {
    case TeamActionTypes.ADD_TO_TEAM: {
      const { username, teamName } = action.payload as AddToTeamPayload;
      
      // Validate team exists
      if (!state.data.teams[teamName]) {
        throw new Error(`Team ${teamName} does not exist`);
      }
      
      // Check if user already in team
      if (state.data.teams[teamName].members.includes(username)) {
        return state; // No change needed
      }
      
      return {
        ...state,
        data: {
          ...state.data,
          teams: {
            ...state.data.teams,
            [teamName]: {
              ...state.data.teams[teamName],
              members: [...state.data.teams[teamName].members, username]
            }
          }
        }
      };
    }
    
    case TeamActionTypes.REMOVE_FROM_TEAM: {
      const { username, teamName } = action.payload as RemoveFromTeamPayload;
      
      // Validate team exists
      if (!state.data.teams[teamName]) {
        throw new Error(`Team ${teamName} does not exist`);
      }
      
      // Check if user is in team
      if (!state.data.teams[teamName].members.includes(username)) {
        return state; // No change needed
      }
      
      return {
        ...state,
        data: {
          ...state.data,
          teams: {
            ...state.data.teams,
            [teamName]: {
              ...state.data.teams[teamName],
              members: state.data.teams[teamName].members.filter(member => member !== username)
            }
          }
        }
      };
    }
    
    case TeamActionTypes.CREATE_TEAM: {
      const { teamName, description, owner } = action.payload as CreateTeamPayload;
      
      // Validate team doesn't already exist
      if (state.data.teams[teamName]) {
        throw new Error(`Team ${teamName} already exists`);
      }
      
      // Use the action initiator as the default owner if not specified
      const actualOwner = owner || context.username;
      
      return {
        ...state,
        data: {
          ...state.data,
          teams: {
            ...state.data.teams,
            [teamName]: {
              description,
              owner: actualOwner,
              members: [actualOwner], // Owner is automatically a member
              createdAt: context.timestamp
            }
          }
        }
      };
    }
    
    case TeamActionTypes.UPDATE_TEAM_DESCRIPTION: {
      const { teamName, description } = action.payload as UpdateTeamDescriptionPayload;
      
      // Validate team exists
      if (!state.data.teams[teamName]) {
        throw new Error(`Team ${teamName} does not exist`);
      }
      
      return {
        ...state,
        data: {
          ...state.data,
          teams: {
            ...state.data.teams,
            [teamName]: {
              ...state.data.teams[teamName],
              description
            }
          }
        }
      };
    }
    
    default:
      return state;
  }
}

// Export complete reducer module
export default {
  actionSchema: TeamActionSchema,
  stateSchema: TeamManagementStateSchema,
  initialState,
  reduce
};