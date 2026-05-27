# Server Auth Module

## 1. Purpose and Scope
The `auth` module (`server/src/modules/auth/`) owns the integration with Better Auth, KMS-based envelope encryption for external API credentials, and HTTP request actor resolution. It serves as the definitive boundary for user authentication identity and cryptographic secrets.

## 2. Non-Goals or Boundary Limits
- Does not authorize domain-specific data access (e.g., whether a user can read a ticket). That is left to tenant guards in domain modules.
- Does not handle generic user profile data beyond core auth assertions (delegated to `users` module).

## 3. Entry Points
- **Better Auth Integration**: `src/modules/auth/auth.ts` exports the configured `auth` singleton.
- **API Router**: `src/modules/auth/routes.ts` mounts compatibility layer routes mapping legacy REST auth to the new Better Auth implementation.
- **Request Actor Resolution**: `src/modules/auth/utils/request-auth.ts` provides the `resolveRequestActorUserId` utility used across all protected REST routes.

## 4. Flow Steps
1. **Authentication**: Users sign in via the Better Auth endpoints (`/api/auth/*`). The module manages session cookies automatically.
2. **Actor Resolution**: When an authenticated request reaches a domain module, it calls `resolveRequestActorUserId(req)`, which invokes `auth.api.getSession()`.
3. **External Credential Provisioning**: Users submit external API keys (e.g., OpenAI). The `CredentialManager` (`src/modules/auth/kms/credential-manager.ts`) uses envelope encryption via a KMS provider (e.g., `LocalEnvKmsProvider`) to encrypt the key before persistence.

## 5. Data Stores and Resources
- `authUsers`: Better Auth core table.
- `user_external_credentials`: Stores AES-GCM encrypted API keys and Data Encryption Keys (DEKs).

## 6. Interfaces and Contracts
- **`resolveRequestActorUserId(req: Request)`**: The universal contract for obtaining a trusted user ID from an Express request.
- **KMS Provider Interface**: `src/modules/auth/kms/types.ts` defines `IKmsProvider` for generic KMS integrations.

## 7. Key Files and Modules
- `auth.ts`: Better Auth instance configuration.
- `utils/request-auth.ts`: Authentication session resolution.
- `utils/crypto.ts`: AES-256-GCM symmetric encryption primitives.
- `kms/`: The sub-module managing envelope encryption schemas and credential caching.

## 8. Permissions, Guards, or Tenant Boundaries
- **Test Environments**: In specific test environments (when `ALLOW_DEV_AUTH_BYPASS === 'true'`), `resolveRequestActorUserId` honors `x-user-id` headers for test bypassing. **This is strictly prohibited in production.**

## 9. Failure Modes, Observability, or Operational Notes
- If the KMS provider is unreachable, API credential decryption fails securely (fail-closed model).

## 10. Change Hazards, Invariants, or Migration Constraints
- Modifying encryption algorithms in `utils/crypto.ts` requires a data migration for all stored API keys.
- Changing `auth.ts` schema configurations requires synchronization with `src/db/schema.ts` and `better-auth` database schemas.

## 11. Related Docs
- [SERVER_ARCHITECTURE_OVERVIEW.md](SERVER_ARCHITECTURE_OVERVIEW.md)
