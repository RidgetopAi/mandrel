/**
 * Custom React Flow node for displaying files.
 *
 * Ported from the surveyor UI; Tailwind utility classes were replaced with
 * inline styles driven by the surveyor color config (the command-UI has no
 * Tailwind). Shows file name + path with connection handles; supports the
 * generic hover/search fade + highlight the Canvas applies via node data.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { FileNode as FileNodeData } from '../../core-types';
import { COLORS } from '../../config/colors';

export interface FileNodeDataProps {
  label: string;
  filePath: string;
  fileData: FileNodeData;
  isFaded?: boolean;
  isHighlighted?: boolean;
  [key: string]: unknown;
}

const handleStyle = { background: COLORS.accent.primary, width: 8, height: 8 };

function FileNodeComponent({ data }: { data: FileNodeDataProps }) {
  const functionCount = data.fileData.functions.length;
  const exportCount = data.fileData.exports.length;
  const { isFaded, isHighlighted } = data;

  return (
    <div
      style={{
        background: COLORS.surface[2],
        border: `1px solid ${isHighlighted ? COLORS.accent.primary : COLORS.surface[3]}`,
        boxShadow: isHighlighted
          ? `0 0 0 1px ${COLORS.accent.primary}80`
          : '0 2px 6px rgba(0,0,0,0.2)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 140,
        opacity: isFaded ? 0.3 : 1,
        transition: 'all 150ms',
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
        <span
          style={{
            color: COLORS.text.muted,
            fontSize: 11,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {data.filePath}
        </span>
        {(functionCount > 0 || exportCount > 0) && (
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: COLORS.text.secondary }}>
            {functionCount > 0 && <span>{functionCount} fn</span>}
            {exportCount > 0 && <span>{exportCount} exp</span>}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

export const FileNode = memo(FileNodeComponent);
