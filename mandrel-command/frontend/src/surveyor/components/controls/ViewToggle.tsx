/**
 * Segmented control to switch the active canvas view.
 *
 * Reads/writes `viewMode` on the UI store; the Canvas renders whatever view is
 * active via the ViewStrategy seam. Views are driven by the VIEWS config. Ported
 * from the surveyor UI; rebuilt on antd `Segmented` to match the command-UI.
 */

import { Segmented, Tooltip } from 'antd';
import { useUIStore, ViewMode } from '../../stores/ui-store';
import { VIEWS } from '../../config/view.config';

export function ViewToggle() {
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <Segmented
      value={viewMode}
      onChange={(value) => setViewMode(value as ViewMode)}
      options={VIEWS.map((view) => ({
        value: view.id,
        label: <Tooltip title={view.description}>{view.label}</Tooltip>,
      }))}
    />
  );
}
