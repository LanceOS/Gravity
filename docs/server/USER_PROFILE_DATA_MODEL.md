# User Profile Data Model

## 1. Purpose and Scope

This document details the data architecture for User Profiles and Settings within the Gravity server. It maps the PostgreSQL tables responsible for tracking user preferences, application view states, and UI/AI configurations.

## 2. Non-Goals or Boundary Limits

- This document does not cover the core `user` identity or authentication credentials, which are handled in the Auth Data Model.
- It does not cover workspace or project-level settings.

## 3. Entry Points

- **Schema Definition**: `server/src/modules/users/schema.ts`
- **Routes**: `server/src/modules/users/routes.ts`

## 4. Flow Steps

1. **Profile/Settings Initialization**: When a user registers or first logs in, their core identity is created in the auth domain, but profile details and settings are tracked here.
2. **Preference Updates**: When the user modifies UI preferences (theme, default view) or AI settings (provider, models), updates are made directly to `user_settings`.
3. **Application State Retrieval**: The client fetches the user profile and settings on load to configure the UI, agent integrations, and project layouts correctly.

## 5. Data Stores and Resources

### `user_profiles` Table
- **Purpose**: Non-auth-critical profile information.
- **Created By**: User creation callbacks.
- **Key Fields**: `userId` (Primary Key), `role` (Global role fallback), `avatarUrl`.

### `user_settings` Table
- **Purpose**: Stores detailed application preferences.
- **Created/Mutated By**: User profile configuration forms.
- **Key Fields**: 
  - `userId` (Primary Key).
  - UI preferences: `theme`, `defaultView`, `projectLayout`, `tutorialCompleted`.
  - AI integrations: `ollamaEndpoint`, `preferredOllamaModel`, `aiProvider`, `agentIntegration`.
  - Storage: `encryptedApiKey`.

## 6. Interfaces and Contracts

- Registered in `server/src/db/schema.ts` for Drizzle ORM access.
- Both tables use `userId` as their primary key, establishing a strict 1:1 relationship with the `user` table from the auth domain.

## 7. Key Files and Modules

- `server/src/modules/users/schema.ts`

## 8. Permissions, Guards, or Tenant Boundaries

- These tables are strictly scoped to the individual user. Queries must guarantee that a user can only read or mutate their own `user_profiles` and `user_settings` records.

## 9. Failure Modes, Observability, or Operational Notes

- If the AI provider strings (`aiProvider`, `agentIntegration`) fall out of sync with the frontend enum structures, it can lead to unhandled UI states or failed agent integrations.

## 10. Change Hazards, Invariants, or Migration Constraints

- The 1:1 dependency on `user.id` means any user deletion process must cascade to `user_profiles` and `user_settings` to avoid orphaned configuration records.
- Storing `encryptedApiKey` here rather than in `user_external_credentials` might require synchronization with the KMS layer. If this is a legacy field, migration to `user_external_credentials` should be considered.

## 11. Related Docs

- [Auth Data Model](file:///home/lance/Documents/Gravity%20copy/docs/server/AUTH_DATA_MODEL.md)
- [Database Architecture Flow](file:///home/lance/Documents/Gravity%20copy/docs/server/DATABASE_ARCHITECTURE_FLOW.md)
