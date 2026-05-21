\### 1. Design Philosophy & System Boundaries

Gravity operates as a network of independent, self-hosted nodes. There is no central server and no browser-based key management.

\- \*\*The Node as an Agent:\*\* Each user deploys their own Docker container containing the React UI, Node.js Backend, and PostgreSQL database. The user's local Node.js backend acts as their cryptographic identity agent.
    
\- \*\*Zero-Trust Federation:\*\* Nodes communicate directly over the public internet using asymmetric cryptography. Trust is established mathematically via Public Key Infrastructure (PKI), not by sharing emails or secrets.
    
\- \*\*Asymmetric Synchronization:\*\* Because nodes sit behind home routers and NATs, data flow is asymmetric:
    
    - \*\*Outbound Actions:\*\* Guest Backend $\\rightarrow$ Host Backend via REST POST requests.
        
    - \*\*Inbound State:\*\* Host Backend $\\rightarrow$ Guest Backend via persistent Server-Sent Events (SSE).
        

\### 2. Cryptographic Identity & Network Handshake

Emails and passwords are only used locally for a user to log into their _own_ node. When communicating across the network, nodes only know each other by their \*\*Public Keys\*\*.

1\. \*\*Bootstrapping:\*\* Upon the first container boot, the Node.js backend generates an Ed25519 keypair. The Private Key is encrypted using an AES-256 Master Key (injected via the .env file) and stored in the local database.
    
2\. \*\*The Handshake:\*\* A user pastes a Host's invite link into their UI. The Guest Backend sends a REST POST to the Host Backend containing the validation code and the Guest's Public Key. The Host saves this Public Key as a "Verified Peer."
    
3\. \*\*Authentication (HTTP Message Signatures):\*\* When the Guest creates a task on the Host's workspace, the Guest Backend crafts the payload, signs the entire HTTP header and body with its Private Key, and sends it. The Host verifies the signature using the stored Public Key before processing the request.
    

\### 3. Database Schema Blueprint (PostgreSQL via Drizzle ORM)

The schema must separate local user accounts from external peers and implement the Outbox pattern for SSE synchronization.

TypeScript

\`\`\`
import { pgTable, uuid, text, timestamp, boolean, jsonb, serial, integer } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------
// Cryptographic Identity Registry
// -------------------------------------------------------------------------
export const identities = pgTable('identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  displayName: text('display_name').notNull(),
  publicKey: text('public_key').notNull().unique(), // The universal network identifier (Ed25519)
  
  // Only populated for the LOCAL owner of this node. Null for external peers.
  encryptedPrivateKey: text('encrypted_private_key'), 
  isLocalOwner: boolean('is_local_owner').default(false).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -------------------------------------------------------------------------
// Peer Workspace Routing (Connections to other Hosts)
// -------------------------------------------------------------------------
export const peerConnections = pgTable('peer_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  hostUrl: text('host_url').notNull(), // e.g., https://workspace.bob.com
  hostPublicKey: text('host_public_key').notNull(),
  
  // Crucial: The cursor for SSE to know where to resume if the network drops
  lastSyncedEventId: integer('last_synced_event_id').default(0).notNull(), 
  
  status: text('status').default('active').notNull(),
});

// -------------------------------------------------------------------------
// The Event Outbox (Source of Truth for SSE Sync)
// -------------------------------------------------------------------------
export const syncOutbox = pgTable('sync_outbox', {
  eventId: serial('event_id').primaryKey(), // Strictly sequential integer
  workspaceId: uuid('workspace_id').notNull(),
  actorPublicKey: text('actor_public_key').notNull(),
  
  entityType: text('entity_type').notNull(), // e.g., 'task', 'comment'
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(), // 'create', 'update', 'delete'
  
  payload: jsonb('payload').notNull(), // The actual state change
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// (Projects, Tasks, and Comments schemas remain similar, but remove emails and use publicKey as foreign keys)
\`\`\`

\### 4. The Outbox & SSE Synchronization Flow

When a user on a Guest node performs an action in a Host workspace, the state is synchronized using a strict Event Sourcing pattern to guarantee eventual consistency across the network.

\*\*1.Action Initiation (Guest Local):\*\*

The user moves a task to "Done" in the Guest UI. The UI sends a standard API request to the Guest Backend.

\*\*2.Payload Signature (Guest Backend):\*\*HTTP Signature.

The Guest Backend constructs the REST POST payload for the Host. It fetches its local Encrypted Private Key, decrypts it in RAM using the .env KEK, signs the HTTP request, and transmits it to the Host over the public internet.

\*\*3.Verification & Execution (Host Backend):\*\*

The Host receives the POST request. It validates the cryptographic signature against the Guest's known Public Key. If valid, it updates the task in its Postgres database AND writes a new record to the syncOutbox table (e.g., eventId: 1042).

\*\*4.SSE Distribution (Host Backend):\*\*Server-Sent Events.

The Host Backend instantly pushes Event 1042 down the open SSE connections to all currently connected Guest Backends (including the one that initiated the change).

\*\*5.State Reconciliation (Guest Backend):\*\*

The Guest Backend receives the SSE event, verifies it, applies the task update to its local Postgres replica, updates its lastSyncedEventId to 1042, and pushes the UI update to the user's browser via a local WebSocket/SSE.

\### 5. Institutional & Academic References

This architecture complies with the highest standards for distributed systems and cryptographic security.

1\. \*\*Federated Identity & Server-to-Server Communication:\*\*
    
    - _World Wide Web Consortium (W3C)._ (2018). ActivityPub Recommendation. Details the standard for decentralized, federated architectures where individual instances act as the identity agents for their local users via Outbox/Inbox patterns.
        
    - \[Link to W3C ActivityPub Specification\](https://www.w3.org/TR/activitypub/)
        
2\. \*\*Request Authentication (HTTP Message Signatures):\*\*
    
    - _Internet Engineering Task Force (IETF)._ (2024). RFC 9421: HTTP Message Signatures. The definitive standard for authenticating REST requests between independent servers using asymmetric cryptography without shared secrets.
        
    - \[Link to IETF RFC 9421\](https://datatracker.ietf.org/doc/rfc9421/)
        
3\. \*\*Resilient Asymmetric Synchronization (SSE):\*\*
    
    - _WHATWG._ (2024). HTML Standard: Server-Sent Events. Details the Last-Event-ID mechanism that makes SSE inherently fault-tolerant, allowing disconnected nodes to request missing sequence gaps upon reconnection.
        
    - \[Link to WHATWG SSE Standard\](https://html.spec.whatwg.org/multipage/server-sent-events.html)
        
4\. \*\*Local Key Management:\*\*
    
    - _National Institute of Standards and Technology (NIST)._ (2013). Framework for Designing Cryptographic Key Management Systems (SP 800-130). Mandates that private keys stored in persistent databases must be encrypted at rest using a Master Key injected from a secure external boundary (e.g., Docker environment variables).
        
    - \[Link to NIST SP 800-130\](https://csrc.nist.gov/publications/detail/sp/800-130/final)