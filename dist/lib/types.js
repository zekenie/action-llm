"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionedStateSchema = exports.BaseActionSchema = void 0;
const zod_1 = require("zod");
/**
 * Base action schema for validation
 */
exports.BaseActionSchema = zod_1.z.object({
    domain: zod_1.z.string(),
    type: zod_1.z.string(),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.any())
});
/**
 * Base state interface with versioning
 */
const VersionedStateSchema = (dataSchema) => zod_1.z.object({
    schemaVersion: zod_1.z.number(),
    data: dataSchema
});
exports.VersionedStateSchema = VersionedStateSchema;
