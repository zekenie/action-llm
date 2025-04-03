import { z } from 'zod';
import { Action, GitHubContext, VersionedStateSchema } from '../../lib/types';

/**
 * Team state structure
 */
const TeamSchema = z.object({
  description: z.string(),
  owner: z.string(),
  members: z.array(z.string()),
  createdAt: z.string()
});

export const TeamManagementStateSchema = VersionedStateSchema(
  z.object({
    teams: z.record(z.string(), TeamSchema)
  })
);

export type TeamManagementState = z.infer<typeof TeamManagementStateSchema>;

/**
 * Team action types
 */
export enum TeamActionTypes {
  ADD_TO_TEAM = 'ADD_TO_TEAM',
  REMOVE_FROM_TEAM = 'REMOVE_FROM_TEAM',
  CREATE_TEAM = 'CREATE_TEAM',
  UPDATE_TEAM_DESCRIPTION = 'UPDATE_TEAM_DESCRIPTION'
}

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

export const TeamActionSchema = z.discriminatedUnion('type', [
  AddToTeamSchema,
  RemoveFromTeamSchema,
  CreateTeamSchema,
  UpdateTeamDescriptionSchema
]);

export type TeamAction = z.infer<typeof TeamActionSchema>;

/**
 * Initial state for team management
 */
export const initialState: TeamManagementState = {
  schemaVersion: 1,
  data: {
    teams: {}
  }
};

/**
 * Team management reducer
 */
export function reduce(state: TeamManagementState, action: TeamAction, context: GitHubContext): TeamManagementState {
  switch (action.type) {
    case TeamActionTypes.ADD_TO_TEAM: {
      const { username, teamName } = action.payload;
      
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
      const { username, teamName } = action.payload;
      
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
      const { teamName, description, owner } = action.payload;
      
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
      const { teamName, description } = action.payload;
      
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

// Export the team management domain
export default {
  actionSchema: TeamActionSchema,
  stateSchema: TeamManagementStateSchema,
  initialState,
  reduce
};