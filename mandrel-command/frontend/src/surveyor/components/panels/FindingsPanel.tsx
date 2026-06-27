/**
 * FindingsPanel — the actionable view of the scan's findings (Surveyor P4c-frontend).
 *
 * Lists findings with severity + category, a SOURCE badge (knip / dependency-
 * cruiser / surveyor), a CONFIDENCE bar, the suggestion, and a one-click DISMISS.
 * Dismissals persist (localStorage, keyed by stable finding identity) so they
 * survive reloads and re-scans. A confidence-threshold slider hides low-signal
 * findings. Clicking a finding highlights + navigates to its affected node(s).
 *
 * All selection logic is delegated to the ported, unit-tested helpers in
 * `lib/findings/*`; this component only wires them to the store + antd Drawer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Slider,
  Switch,
  Tag,
  Typography,
  Space,
  Progress,
  Empty,
  Button,
} from 'antd';
import {
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  EyeInvisibleOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { useScanStore } from '../../stores/scan-store';
import { filterFindings, countBelowThreshold } from '../../lib/findings/filter-findings';
import type { FindingLike } from '../../lib/findings/types';
import {
  loadDismissed,
  saveDismissed,
  withDismissed,
  withoutDismissed,
  getBrowserStorage,
} from '../../lib/findings/dismissed-store';
import {
  SOURCE_BADGES,
  UNKNOWN_SOURCE_BADGE,
  CONFIDENCE_THRESHOLD,
  type FindingLevel,
  type FindingSource,
} from '../../config/findings.config';
import { folderOf } from '../../views/graph-utils';

const { Text } = Typography;

interface FindingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const LEVEL_UI: Record<FindingLevel, { icon: React.ReactNode; color: string }> = {
  error: { icon: <CloseCircleOutlined style={{ color: '#f87171' }} />, color: '#f87171' },
  warning: { icon: <WarningOutlined style={{ color: '#facc15' }} />, color: '#facc15' },
  info: { icon: <InfoCircleOutlined style={{ color: '#60a5fa' }} />, color: '#60a5fa' },
};

const CATEGORY_LABELS: Record<string, string> = {
  circular_dependency: 'Circular',
  orphaned_code: 'Orphaned',
  unused_export: 'Unused Export',
  large_file: 'Large File',
  duplicate_code: 'Duplicate',
  deep_nesting: 'Deep Nesting',
  missing_types: 'No Types',
  security_concern: 'Security',
};

function sourceBadge(source: string) {
  return SOURCE_BADGES[source as FindingSource] ?? UNKNOWN_SOURCE_BADGE;
}

export function FindingsPanel({ isOpen, onClose }: FindingsPanelProps) {
  const currentScan = useScanStore((s) => s.currentScan);
  const selectNode = useScanStore((s) => s.selectNode);
  const setHighlightedNodes = useScanStore((s) => s.setHighlightedNodes);
  const drillInto = useScanStore((s) => s.drillInto);
  const getNodeById = useScanStore((s) => s.getNodeById);

  const storage = useMemo(() => getBrowserStorage(), []);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [minConfidence, setMinConfidence] = useState(CONFIDENCE_THRESHOLD.default);
  const [showDismissed, setShowDismissed] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && storage) {
      setDismissedIds(loadDismissed(storage));
    }
  }, [isOpen, storage]);

  // `currentScan.warnings` is a core Warning[] — structurally a FindingLike[].
  const findings = useMemo(
    () => (currentScan?.warnings ?? []) as unknown as FindingLike[],
    [currentScan],
  );

  const visible = useMemo(
    () => filterFindings(findings, { dismissedIds, minConfidence, showDismissed }),
    [findings, dismissedIds, minConfidence, showDismissed],
  );

  const hiddenByThreshold = useMemo(
    () => countBelowThreshold(findings, minConfidence),
    [findings, minConfidence],
  );

  const persist = useCallback(
    (next: Set<string>) => {
      setDismissedIds(next);
      if (storage) saveDismissed(storage, next);
    },
    [storage],
  );

  const handleDismiss = useCallback(
    (identity: string) => {
      persist(withDismissed(dismissedIds, identity));
      if (selectedIdentity === identity) {
        setSelectedIdentity(null);
        setHighlightedNodes([]);
      }
    },
    [persist, dismissedIds, selectedIdentity, setHighlightedNodes],
  );

  const handleRestore = useCallback(
    (identity: string) => persist(withoutDismissed(dismissedIds, identity)),
    [persist, dismissedIds],
  );

  const handleSelect = useCallback(
    (finding: FindingLike, identity: string) => {
      setSelectedIdentity(identity);
      setHighlightedNodes(finding.affectedNodes);
      const firstNodeId = finding.affectedNodes[0];
      if (firstNodeId) {
        const node = getNodeById(firstNodeId);
        if (node) drillInto(folderOf(node.filePath));
        selectNode(firstNodeId);
      }
    },
    [setHighlightedNodes, getNodeById, drillInto, selectNode],
  );

  const handleClose = useCallback(() => {
    setHighlightedNodes([]);
    setSelectedIdentity(null);
    onClose();
  }, [setHighlightedNodes, onClose]);

  return (
    <Drawer
      title={`Findings (${visible.length})`}
      placement="right"
      open={isOpen}
      onClose={handleClose}
      width={420}
    >
      {/* Controls */}
      <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 12 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary">Min confidence</Text>
          <Text strong>{Math.round(minConfidence * 100)}%</Text>
        </Space>
        <Slider
          min={CONFIDENCE_THRESHOLD.min}
          max={CONFIDENCE_THRESHOLD.max}
          step={CONFIDENCE_THRESHOLD.step}
          value={minConfidence}
          onChange={(v) => setMinConfidence(v as number)}
          tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
        />
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {hiddenByThreshold > 0 ? `${hiddenByThreshold} below threshold` : ''}
          </Text>
          <Space size={6}>
            <Switch
              size="small"
              checked={showDismissed}
              onChange={setShowDismissed}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Show dismissed
            </Text>
          </Space>
        </Space>
      </Space>

      {/* List */}
      {visible.length === 0 ? (
        <Empty
          description={findings.length === 0 ? 'No findings detected' : 'No findings match the filter'}
        />
      ) : (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {visible.map(({ finding, identity, isDismissed }) => (
            <FindingCard
              key={identity}
              finding={finding}
              isDismissed={isDismissed}
              isSelected={selectedIdentity === identity}
              affectedNames={finding.affectedNodes.slice(0, 4).map((id) => getNodeById(id)?.name ?? id)}
              extraAffected={Math.max(0, finding.affectedNodes.length - 4)}
              onSelect={() => handleSelect(finding, identity)}
              onDismiss={() => handleDismiss(identity)}
              onRestore={() => handleRestore(identity)}
            />
          ))}
        </Space>
      )}
    </Drawer>
  );
}

interface FindingCardProps {
  finding: FindingLike;
  isDismissed: boolean;
  isSelected: boolean;
  affectedNames: string[];
  extraAffected: number;
  onSelect: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}

function FindingCard({
  finding,
  isDismissed,
  isSelected,
  affectedNames,
  extraAffected,
  onSelect,
  onDismiss,
  onRestore,
}: FindingCardProps) {
  const level: FindingLevel = (finding.level as FindingLevel) in LEVEL_UI
    ? (finding.level as FindingLevel)
    : 'info';
  const { icon } = LEVEL_UI[level];
  const badge = sourceBadge(finding.source);
  const confidencePct = Math.round(finding.confidence * 100);

  return (
    <div
      style={{
        border: `1px solid ${isSelected ? '#60a5fa' : 'rgba(140,140,140,0.25)'}`,
        borderRadius: 8,
        padding: 12,
        opacity: isDismissed ? 0.55 : 1,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect();
        }}
        style={{ cursor: 'pointer' }}
      >
        <Space size={6} wrap style={{ marginBottom: 6 }}>
          {icon}
          <Tag>{CATEGORY_LABELS[finding.category] ?? finding.category}</Tag>
          <Tag color={badge.color}>{badge.label}</Tag>
        </Space>

        <div style={{ marginBottom: 6 }}>
          <Text style={{ fontSize: 13 }}>{finding.title}</Text>
        </div>

        <div style={{ marginBottom: 6 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Confidence
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {confidencePct}%
            </Text>
          </Space>
          <Progress percent={confidencePct} showInfo={false} size="small" />
        </div>

        {finding.suggestion && (
          <div style={{ marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {finding.suggestion.summary}
            </Text>
          </div>
        )}

        {affectedNames.length > 0 && (
          <Space size={[4, 4]} wrap>
            {affectedNames.map((name, i) => (
              <Tag key={`${name}-${i}`} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
              </Tag>
            ))}
            {extraAffected > 0 && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                +{extraAffected} more
              </Text>
            )}
          </Space>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        {isDismissed ? (
          <Button type="text" size="small" icon={<RedoOutlined />} onClick={onRestore}>
            Restore
          </Button>
        ) : (
          finding.dismissible && (
            <Button type="text" size="small" icon={<EyeInvisibleOutlined />} onClick={onDismiss}>
              Dismiss
            </Button>
          )
        )}
      </div>
    </div>
  );
}
