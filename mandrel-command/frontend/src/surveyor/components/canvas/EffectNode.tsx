/**
 * Effect node — a function in the data-flow view, accented by the side-effect
 * group it belongs to (DB / HTTP / file / …). The accent color and effect label
 * are computed by the data-flow view strategy and passed in via node data.
 *
 * Ported from the surveyor UI (Tailwind → inline styles).
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { EffectGroup } from '../../config/view.config';
import { COLORS } from '../../config/colors';

export interface EffectNodeDataProps {
  label: string;
  filePath: string;
  effectGroup: EffectGroup;
  effectLabel: string;
  color: string;
  isAsync?: boolean;
  isFaded?: boolean;
  isHighlighted?: boolean;
  [key: string]: unknown;
}

function EffectNodeComponent({ data }: { data: EffectNodeDataProps }) {
  const { isFaded, isHighlighted, color, effectLabel, label, filePath, isAsync } = data;

  return (
    <div
      style={{
        background: COLORS.surface[2],
        border: `1px solid ${COLORS.surface[3]}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 160,
        boxShadow: isHighlighted
          ? `0 0 0 1px ${color}`
          : '0 2px 6px rgba(0,0,0,0.2)',
        opacity: isFaded ? 0.3 : 1,
        transition: 'all 150ms',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color, width: 8, height: 8 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            {label}
          </span>
          {isAsync && (
            <span style={{ color: COLORS.text.muted, fontSize: 10, textTransform: 'uppercase' }}>
              async
            </span>
          )}
        </div>
        <span
          style={{
            color: COLORS.text.muted,
            fontSize: 11,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {filePath}
        </span>
        <span style={{ color, fontSize: 11, fontWeight: 500 }}>{effectLabel}</span>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: color, width: 8, height: 8 }} />
    </div>
  );
}

export const EffectNode = memo(EffectNodeComponent);
