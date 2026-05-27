# Auth Data Model

## 1. Purpose and Scope

This document details the data architecture for authentication and external credential management within the Gravity server. It maps the PostgreSQL tables responsible for tracking user identities and storing securely encrypted credentials for third-party providers.

## 2. Non-Goals or Boundary Limits

- This document does not cover user profile settings, application preferences, or workspace/tenant relations.
- It does not cover the complete key management system (KMS) logic, only the database representation of the stored credentials.

## 3. Entry Points

- **Schema Definition**: `server/src/modules/auth/schema.ts`

## 4. Flow Steps

1. **User Identity Creation**: When a user registers or logs in via an identity provider, a record is created or updated in the `user` table.
2. **External Credential Storage**: When a user connects an external integration (e.g., an AI provider), their API keys are encrypted using the application's KMS layer and saved to `user_external_credentials`.
3. **External Credential Retrieval**: When the application needs to act on behalf of the user with a third-party provider, the record is fetched from `user_external_credentials` using the user's ID and provider name, and the credentials are decrypted.

## 5. Data Stores and Resources

### `user` Table
- **Purpose**: Core identity record for the platform.
- **Created By**: Authentication callbacks / Registration flows.
- **Mutated By**: User profile updates, email verification flows.
- **Key Fields**: `id`, `name`, `email`, `emailVerified`, `image`.

### `user_external_credentials` Table
- **Purpose**: Securely stores API keys and integration tokens for third-party providers.
- **Created By**: Integration connection flows (e.g., adding an OpenAI key).
- **Mutated By**: Integration updates or revocations.
- **Key Fields**:
  - `userId`, `provider` (Composite Primary Key)
  - `encryptedApiKey`, `encryptedDek`, `aesIv`, `aesAuthTag`, `kmsKekId` (Fields necessary for KMS decryption)
  - `preferredModel` (Provider-specific metadata)

## 6. Interfaces and Contracts

- **Drizzle Models**: Both `authUsers` and `userExternalCredentials` are exposed via Drizzle ORM and registered in `server/src/db/schema.ts`.
- **KMS Contract**: The `user_external_credentials` table has strict requirements on the presence of `aesIv`, `aesAuthTag`, `encryptedDek`, and `kmsKekId` to allow the KMS module to successfully decrypt the API key.

## 7. Key Files and Modules

- `server/src/modules/auth/schema.ts`: Defines the schema for users and external credentials.

## 8. Permissions, Guards, or Tenant Boundaries

- The `user` table is global and not bound to a specific workspace.
- `user_external_credentials` are strictly bound to a single `userId`. Accessing them requires verifying the active user's identity to prevent leaking decrypted keys to other tenants.

## 9. Failure Modes, Observability, or Operational Notes

- If the KMS configuration is lost or altered incorrectly, the encrypted data in `user_external_credentials` becomes unrecoverable, effectively breaking all user integrations.

## 10. Change Hazards, Invariants, or Migration Constraints

- Modifying the fields related to KMS decryption in `user_external_credentials` (e.g., `aesIv`, `kmsKekId`) will immediately break the application's ability to decrypt existing API keys.
- Changing the primary key structure in the `user` table would require massive data migrations, as `userId` acts as a foreign key reference across the entire application (workspaces, tickets, settings).

## 11. Related Docs

- [Database Architecture Flow](file:///home/lance/Documents/Gravity%20copy/docs/server/DATABASE_ARCHITECTURE_FLOW.md)
- [KMS Security Architecture](file:///home/lance/Documents/Gravity%20copy/docs/server/kms-security-architecture.md)
