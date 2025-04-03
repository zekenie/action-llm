/**
 * Team Management Domain - Type Definitions
 */

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
 * Team action payloads
 */
export interface AddToTeamPayload {
  username: string;
  teamName: string;
}

export interface RemoveFromTeamPayload {
  username: string;
  teamName: string;
}

export interface CreateTeamPayload {
  teamName: string;
  description: string;
  owner?: string;
}

export interface UpdateTeamDescriptionPayload {
  teamName: string;
  description: string;
}

/**
 * Team state structure
 */
export interface TeamState {
  schemaVersion: number;
  data: {
    teams: {
      [teamName: string]: {
        description: string;
        owner: string;
        members: string[];
        createdAt: string;
      }
    }
  }
}