import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

/** Only the direct loopback peer qualifies; proxy headers can never grant bypass. */
export function allowLocalWebhookBypass(enabled: boolean, mode: string, remoteAddress?: string, forwarded = false) {
  if (!enabled || !['development', 'test'].includes(mode) || forwarded || !remoteAddress || !isIP(remoteAddress)) return false;
  return ipaddr.process(remoteAddress).range() === 'loopback';
}
