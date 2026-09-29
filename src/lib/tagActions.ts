import { useUIStore } from '../stores/uiStore';
import { useConfigStore } from '../stores/configStore';

/** Show the notes carrying `#tag`: open the sidebar's Files tab filtered to it. */
export function showTag(tag: string): void {
  const cfg = useConfigStore.getState();
  if (!cfg.config.showSidebar) void cfg.update({ showSidebar: true });
  const ui = useUIStore.getState();
  ui.setSidebarTab('files');
  ui.setTreeQuery(`#${tag}`);
}
