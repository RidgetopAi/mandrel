/**
 * Custom React Flow node for displaying files
 * Dark theme with smooth transitions
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { COLORS } from '../utils/colors';
import { nodeVariants } from '../utils/animations';

export interface FileNodeDataProps {
  label: string;
  filePath: string;
  fileData: {
    functions: any[];
    exports: any[];
    [key: string]: any;
  };
  isFaded?: boolean;
  isHighlighted?: boolean;
  [key: string]: unknown;
}

/**
 * Basic file node component for React Flow
 * Shows file name with connection handles
 * Supports hover highlighting/fading
 */
function FileNodeComponent({ data }: { data: FileNodeDataProps }) {
  const functionCount = data.fileData?.functions?.length || 0;
  const exportCount = data.fileData?.exports?.length || 0;
  const { isFaded, isHighlighted } = data;

  // Determine visual state
  const getBackground = () => {
    if (isHighlighted) return COLORS.surface[3]; // Brighter when hovered
    if (isFaded) return COLORS.surface[2];
    return COLORS.surface[2];
  };

  const getBorder = () => {
    if (isHighlighted) return `2px solid ${COLORS.accent.primary}`;
    if (isFaded) return `1px solid ${COLORS.surface[3]}`;
    return `1px solid ${COLORS.surface[3]}`;
  };

  const getBoxShadow = () => {
    if (isHighlighted) return `0 0 12px ${COLORS.accent.primary}80, 0 0 24px ${COLORS.accent.primary}40`;
    if (isFaded) return 'none';
    return '0 2px 8px rgba(0,0,0,0.3)';
  };

  return (
    <motion.div
      initial="hidden"
      animate={isHighlighted ? 'selected' : 'visible'}
      variants={nodeVariants}
      style={{
        background: getBackground(),
        border: getBorder(),
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 140,
        boxShadow: getBoxShadow(),
        opacity: isFaded ? 0.25 : 1,
        transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
        transition: 'all 0.2s ease',
        zIndex: isHighlighted ? 100 : 1,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: COLORS.accent.primary,
          width: 8,
          height: 8,
          border: 'none',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{
          color: COLORS.text.primary,
          fontSize: 13,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {data.label}
        </span>
        <span style={{
          color: COLORS.text.muted,
          fontSize: 11,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {data.filePath}
        </span>
        {(functionCount > 0 || exportCount > 0) && (
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: COLORS.text.secondary }}>
            {functionCount > 0 && <span>{functionCount} fn</span>}
            {exportCount > 0 && <span>{exportCount} exp</span>}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: COLORS.accent.primary,
          width: 8,
          height: 8,
          border: 'none',
        }}
      />
    </motion.div>
  );
}

export const FileNode = memo(FileNodeComponent);
