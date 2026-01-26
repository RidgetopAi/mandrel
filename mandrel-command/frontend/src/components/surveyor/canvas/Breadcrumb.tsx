/**
 * Breadcrumb navigation for folder drill-down
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Home } from 'lucide-react';
import { COLORS } from '../utils/colors';
import { useScanStore } from '../stores/scan-store';

export interface BreadcrumbProps {
  projectName?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ projectName = 'Project' }) => {
  const navigationPath = useScanStore((state) => state.navigationPath);
  const drillToPath = useScanStore((state) => state.drillToPath);
  const currentFolder = useScanStore((state) => state.currentFolder);

  const handleRootClick = () => {
    drillToPath(-1); // Go to root
  };

  const handlePathClick = (index: number) => {
    drillToPath(index);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '8px 0',
      fontSize: 13,
      color: COLORS.text.secondary,
    }}>
      {/* Root/Home */}
      <motion.button
        onClick={handleRootClick}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          background: currentFolder === null ? COLORS.surface[2] : 'transparent',
          border: 'none',
          borderRadius: 4,
          color: currentFolder === null ? COLORS.text.primary : COLORS.text.secondary,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <Home size={14} />
        <span>{projectName}</span>
      </motion.button>

      {/* Path segments */}
      {navigationPath.map((segment, index) => {
        const isLast = index === navigationPath.length - 1;
        const label = segment.split('/').pop() || segment;

        return (
          <React.Fragment key={segment}>
            <ChevronRight size={14} style={{ color: COLORS.text.muted }} />
            <motion.button
              onClick={() => handlePathClick(index)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '4px 8px',
                background: isLast ? COLORS.surface[2] : 'transparent',
                border: 'none',
                borderRadius: 4,
                color: isLast ? COLORS.text.primary : COLORS.text.secondary,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </motion.button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Breadcrumb;
