/**
 * Custom React Flow node for displaying folder clusters
 * Dark theme with warning badges
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { Folder } from 'lucide-react';
import { COLORS } from '../utils/colors';
import { nodeVariants } from '../utils/animations';

export interface FolderNodeDataProps {
  label: string;
  folderPath: string;
  fileCount: number;
  functionCount: number;
  warningCount: number;
  isFaded?: boolean;
  isHighlighted?: boolean;
  onWarningBadgeClick?: (folderPath: string) => void;
  [key: string]: unknown;
}

/**
 * Folder cluster node component for React Flow
 * Shows folder name with file/function counts and warning badge
 * Click to drill down into the folder
 */
function FolderNodeComponent({ data }: { data: FolderNodeDataProps }) {
  const { isFaded, isHighlighted, warningCount, folderPath, onWarningBadgeClick } = data;

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent folder drill-in
    if (onWarningBadgeClick) {
      onWarningBadgeClick(folderPath);
    }
  };

  // Determine visual state
  const getBackground = () => {
    if (isHighlighted) return COLORS.surface[2];
    return COLORS.surface[1];
  };

  const getBorder = () => {
    if (isHighlighted) return `2px solid ${COLORS.accent.primary}`;
    return `2px dashed ${COLORS.surface[3]}`;
  };

  const getBoxShadow = () => {
    if (isHighlighted) return `0 0 16px ${COLORS.accent.primary}60, 0 0 32px ${COLORS.accent.primary}30`;
    if (isFaded) return 'none';
    return '0 2px 8px rgba(0,0,0,0.2)';
  };

  return (
    <motion.div
      initial="hidden"
      animate={isHighlighted ? 'selected' : 'visible'}
      variants={nodeVariants}
      style={{
        position: 'relative',
        background: getBackground(),
        border: getBorder(),
        borderRadius: 12,
        padding: '12px 16px',
        minWidth: 160,
        cursor: 'pointer',
        opacity: isFaded ? 0.25 : 1,
        boxShadow: getBoxShadow(),
        transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
        transition: 'all 0.2s ease',
        zIndex: isHighlighted ? 100 : 1,
      }}
      whileHover={{
        borderColor: COLORS.accent.primary,
        background: COLORS.surface[2],
      }}
    >
      {/* Warning badge - clickable to show files with warnings */}
      {warningCount > 0 && (
        <motion.button
          onClick={handleBadgeClick}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 10,
            background: COLORS.status.warning,
            color: COLORS.surface[0],
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
          title="Click to show files with warnings"
        >
          {warningCount}
        </motion.button>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: COLORS.accent.primary,
          width: 8,
          height: 8,
          opacity: 0.5,
          border: 'none',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Folder size={16} color={COLORS.accent.primary} />
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
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: COLORS.text.secondary }}>
          <span>{data.fileCount} files</span>
          <span>{data.functionCount} fn</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: COLORS.accent.primary,
          width: 8,
          height: 8,
          opacity: 0.5,
          border: 'none',
        }}
      />
    </motion.div>
  );
}

export const FolderNode = memo(FolderNodeComponent);
