import { Request, Response } from 'express';
import { centralDb, getProjectDb } from './db.js';

// Express Response objects representing SSE connections
let clients: Response[] = [];

// Subscribe a frontend client to SSE events
export function subscribeToEvents(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send an initial handshake
  res.write('data: {"type":"init","message":"Connected to Gravity live stream"}\n\n');

  clients.push(res);

  // Remove client on disconnect
  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
}

// Broadcast an event to all connected browsers
export function broadcastEvent(type: string, data: any) {
  const payload = JSON.stringify({ type, data });
  clients.forEach(client => {
    client.write(`data: ${payload}\n\n`);
  });
}

// Handle GitHub Pull Request webhooks
export function handleGithubWebhook(req: Request, res: Response) {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received GitHub Webhook: event=${event}, action=${payload?.action}`);

  // We are interested in pull_request events
  if (event === 'pull_request') {
    const action = payload.action;
    const pr = payload.pull_request;

    if (!pr) {
      res.status(400).json({ error: 'Missing pull_request payload' });
      return;
    }

    const prTitle = pr.title || '';
    const prBranch = pr.head?.ref || '';
    const prUrl = pr.html_url || '';
    const isMerged = pr.merged || false;

    // Extract any ticket keys in the format of [PREFIX]-[NUMBER], e.g. GRA-123
    const ticketKeyRegex = /([A-Za-z]+)-\d+/g;
    const keysFound = new Set<string>();

    let match;
    while ((match = ticketKeyRegex.exec(prTitle)) !== null) {
      keysFound.add(match[0].toUpperCase());
    }
    while ((match = ticketKeyRegex.exec(prBranch)) !== null) {
      keysFound.add(match[0].toUpperCase());
    }

    if (keysFound.size > 0) {
      console.log(`GitHub Webhook matched tickets: ${Array.from(keysFound).join(', ')}`);

      let dbPrStatus: 'open' | 'merged' | 'closed' | 'none' = 'none';
      let dbTicketStatus: string | null = null;

      if (action === 'opened' || action === 'reopened') {
        dbPrStatus = 'open';
        dbTicketStatus = 'in_review'; // Pull Request opened -> In Review
      } else if (action === 'closed') {
        if (isMerged) {
          dbPrStatus = 'merged';
          dbTicketStatus = 'done'; // Merged -> Done
        } else {
          dbPrStatus = 'closed';
        }
      }

      const updatedTicketsByProject: Record<string, any[]> = {};

      for (const key of keysFound) {
        // Extract project prefix
        const prefix = key.split('-')[0]?.toUpperCase();
        if (!prefix) continue;

        // Query central DB to find the project ID matching this prefix key
        const project = centralDb.prepare('SELECT * FROM projects WHERE upper(key) = ?').get(prefix) as any;
        if (!project) {
          console.log(`No project found in central database for prefix key: ${prefix}`);
          continue;
        }

        const projectId = project.id;
        const pdb = getProjectDb(projectId);

        // Query current ticket in tenant DB
        const ticket = pdb.prepare('SELECT * FROM tickets WHERE key = ?').get(key) as any;
        if (ticket) {
          const newStatus = dbTicketStatus || ticket.status;
          const now = new Date().toISOString();

          pdb.prepare(`
            UPDATE tickets
            SET prStatus = ?, prUrl = ?, status = ?, updatedAt = ?
            WHERE key = ?
          `).run(dbPrStatus, prUrl, newStatus, now, key);

          const updated = pdb.prepare('SELECT * FROM tickets WHERE key = ?').get(key) as any;
          
          if (!updatedTicketsByProject[projectId]) {
            updatedTicketsByProject[projectId] = [];
          }
          updatedTicketsByProject[projectId].push(updated);

          // Broadcast comment from "GitHub Webhook"
          const commentId = `co-gh-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const commentBody = `🤖 **GitHub PR Alert**: Pull request [#${pr.number}](${prUrl}) was **${action === 'closed' && isMerged ? 'merged' : action}** by ${pr.user?.login || 'developer'}.\n\n* **PR Title**: ${prTitle}\n* **Branch**: \`${prBranch}\`\n* **Ticket Status**: Transformed to \`${newStatus.replace('_', ' ').toUpperCase()}\``;
          
          pdb.prepare(`
            INSERT INTO comments (id, ticketId, userId, body, createdAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(commentId, ticket.id, 'u-alice', commentBody, now); // Add it as an automated agent comment from Alice (AI Agent)

          // Fetch updated comments for this ticket
          const ticketComments = pdb.prepare(`
            SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
            FROM comments 
            JOIN central.users ON comments.userId = central.users.id 
            WHERE ticketId = ? 
            ORDER BY createdAt ASC
          `).all(ticket.id);

          // Broadcast comment event narrowed to this specific ticket
          broadcastEvent('comments-updated', { ticketId: ticket.id, comments: ticketComments });
        }
      }

      // Broadcast ticket updates grouped by project
      const updatedKeys: string[] = [];
      Object.entries(updatedTicketsByProject).forEach(([projectId, tickets]) => {
        const pdb = getProjectDb(projectId);
        broadcastEvent('tickets-updated', { 
          projectId, 
          tickets: pdb.prepare('SELECT * FROM tickets').all() 
        });
        tickets.forEach(t => updatedKeys.push(t.key));
      });

      if (updatedKeys.length > 0) {
        res.status(200).json({ success: true, updatedTickets: updatedKeys });
        return;
      }
    }
  }

  res.status(200).json({ success: true, message: 'Webhook received but no matching tickets found' });
}

