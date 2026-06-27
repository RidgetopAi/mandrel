/**
 * Custom React Flow node for displaying folder clusters.
 *
 * Ported from the surveyor UI (Tailwind → inline styles). Shows folder name with
 * file/function counts and a clickable warning badge that highlights the files
 * in the folder carrying warnings. Single-click selects (card), double-click
 * drills in (handled by the Canvas).
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FolderOutlined } from '@ant-design/icons';
import { useScanStore } from '../../stores/scan-store';
import { COLORS } from '../../config/colors';

export interface FolderNodeDataProps {
  label: string;
  folderPath: string;
  fileCount: number;
  functionCount: number;
  warningCount: number;
  isFaded?: boolean;
  isHighlighted?: boolean;
  [key: string]: unknown;
}

const handleStyle = { background: COLORS.accent.primary, width: 8, height: 8, opacity: 0.5 };

function FolderNodeComponent({ data }: { data: FolderNodeDataProps }) {
  const { isFaded, isHighlighted, warningCount, folderPath } = data;
  const highlightFolderWarnings = useScanStore((s) => s.highlightFolderWarnings);

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    highlightFolderWarnings(folderPath);
  };

  return (
    <div
      style={{
        position: 'relative',
        background: isHighlighted ? COLORS.surface[2] : COLORS.surface[1],
        border: `2px dashed ${isHighlighted ? COLORS.accent.primary : COLORS.surface[3]}`,
        borderRadius: 12,
        padding: '12px 16px',
        minWidth: 160,
        cursor: 'pointer',
        opacity: isFaded ? 0.3 : 1,
        transition: 'all 150ms',
      }}
    >
      {warningCount > 0 && (
        <button
          onClick={handleBadgeClick}
          title="Click to show files with warnings"
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 999,
            background: COLORS.status.warning,
            color: COLORS.surface[0],
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {warningCount}
        </button>
      )}

      <Handle type="target" position={Position.Left} style={handleStyle} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOutlined style={{ color: COLORS.accent.primary }} />
          <span
            style={{
              color: COLORS.text.primary,
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {data.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: COLORS.text.secondary }}>
          <span>{data.fileCount} files</span>
          <span>{data.functionCount} fn</span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

export const FolderNode = memo(FolderNodeComponent);
