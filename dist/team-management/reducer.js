"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialState = exports.TeamActionSchema = exports.TeamManagementStateSchema = void 0;
exports.reduce = reduce;
const zod_1 = require("zod");
const types_1 = require("../lib/types");
const types_2 = require("./types");
/**
 * Team schema for validation
 */
const TeamSchema = zod_1.z.object({
    description: zod_1.z.string(),
    owner: zod_1.z.string(),
    members: zod_1.z.array(zod_1.z.string()),
    createdAt: zod_1.z.string()
});
/**
 * Team management state schema
 */
exports.TeamManagementStateSchema = (0, types_1.VersionedStateSchema)(zod_1.z.object({
    teams: zod_1.z.record(zod_1.z.string(), TeamSchema)
}));
/**
 * Team action schemas
 */
const AddToTeamSchema = zod_1.z.object({
    domain: zod_1.z.literal('team-management'),
    type: zod_1.z.literal(types_2.TeamActionTypes.ADD_TO_TEAM),
    payload: zod_1.z.object({
        username: zod_1.z.string(),
        teamName: zod_1.z.string()
    })
});
const RemoveFromTeamSchema = zod_1.z.object({
    domain: zod_1.z.literal('team-management'),
    type: zod_1.z.literal(types_2.TeamActionTypes.REMOVE_FROM_TEAM),
    payload: zod_1.z.object({
        username: zod_1.z.string(),
        teamName: zod_1.z.string()
    })
});
const CreateTeamSchema = zod_1.z.object({
    domain: zod_1.z.literal('team-management'),
    type: zod_1.z.literal(types_2.TeamActionTypes.CREATE_TEAM),
    payload: zod_1.z.object({
        teamName: zod_1.z.string(),
        description: zod_1.z.string(),
        owner: zod_1.z.string().optional()
    })
});
const UpdateTeamDescriptionSchema = zod_1.z.object({
    domain: zod_1.z.literal('team-management'),
    type: zod_1.z.literal(types_2.TeamActionTypes.UPDATE_TEAM_DESCRIPTION),
    payload: zod_1.z.object({
        teamName: zod_1.z.string(),
        description: zod_1.z.string()
    })
});
/**
 * Combined action schema
 */
exports.TeamActionSchema = zod_1.z.discriminatedUnion('type', [
    AddToTeamSchema,
    RemoveFromTeamSchema,
    CreateTeamSchema,
    UpdateTeamDescriptionSchema
]);
/**
 * Initial state for team management
 */
exports.initialState = {
    schemaVersion: 1,
    data: {
        teams: {}
    }
};
/**
 * Team management reducer
 */
function reduce(state = exports.initialState, action, context) {
    switch (action.type) {
        case types_2.TeamActionTypes.ADD_TO_TEAM: {
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
        case types_2.TeamActionTypes.REMOVE_FROM_TEAM: {
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
        case types_2.TeamActionTypes.CREATE_TEAM: {
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
        case types_2.TeamActionTypes.UPDATE_TEAM_DESCRIPTION: {
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
// Export complete reducer module
exports.default = {
    actionSchema: exports.TeamActionSchema,
    stateSchema: exports.TeamManagementStateSchema,
    initialState: exports.initialState,
    reduce
};
