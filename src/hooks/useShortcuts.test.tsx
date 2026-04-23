import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/configService', () => ({
  configService: {
    load: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/dialogService', () => ({
  dialogService: {
    pickMarkdownFile: vi.fn(),
    pickWorkspaceDir: vi.fn(),
  },
}));

import { handleMenuAction } from './useShortcuts';
import { useConfigStore } from '../stores/configStore';

describe('useShortcuts', () => {
  beforeEach(() => {
    useConfigStore.setState({
      config: {
        ...useConfigStore.getState().config,
        showSidebar: true,
      },
    });
  });

  it('dispatches toggle-sidebar menu actions through the config store', async () => {
    const updateSpy = vi.spyOn(useConfigStore.getState(), 'update');

    await handleMenuAction('toggle-sidebar');

    expect(updateSpy).toHaveBeenCalledWith({ showSidebar: false });
  });
});
