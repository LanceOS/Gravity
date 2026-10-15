import { describe, expect, it, vi } from 'vitest';
import { DefaultWorkspaceDirectoryService } from '../services/workspaceDirectoryService';

describe('workspace invite transport', () => {
  it('sends the invite code in the request body, never in the URL', async () => {
    const code = `WSP-${'A'.repeat(48)}`;
    const post = vi.fn().mockResolvedValue({ status: 'pending' });
    const service = new DefaultWorkspaceDirectoryService({ post } as never);

    await service.requestJoinByInvite('user-1', code, 'Please add me');

    expect(post).toHaveBeenCalledWith('/workspaces/invites/join-requests', {
      userId: 'user-1',
      inviteCode: code,
      message: 'Please add me',
    }, expect.any(Object));
    expect(post.mock.calls[0][0]).not.toContain(code);
  });
});
