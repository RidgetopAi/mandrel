/**
 * Detail panel for the selected node (Surveyor P4c-frontend).
 *
 *   - FILE node   → fetches the authoritative card from GET /file (path, lines,
 *                   functions w/ behavioral summary + side-effect flags, CLASSES,
 *                   imports, exports). Using /file (not the in-memory graph) means
 *                   the card is complete even when the canvas graph was truncated.
 *   - FOLDER node → aggregated summary (files / functions / classes / warnings)
 *                   computed client-side from the current scan, with a Drill-in.
 *   - function/class node → a compact member card from the in-memory node.
 *
 * Rebuilt on antd (the surveyor standalone used Tailwind). Class data is shaped by
 * the ported pure `shapeFileClasses` / folder rollup by `aggregateFolder`.
 */

import React from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Typography,
  Space,
  Button,
  Empty,
  Spin,
  Statistic,
  Row,
  Col,
  Divider,
} from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useScanStore } from '../../stores/scan-store';
import { isFolderNodeId, folderPathFromNodeId } from '../../config/view.config';
import { aggregateFolder } from '../../lib/cards/folder-summary';
import { surveyorClient, type FileCardDto, type FileMemberDto, type NodeDto } from '../../api/surveyorClient';

const { Text, Title } = Typography;

const PANEL_WIDTH = 340;

interface NodeDetailPanelProps {
  projectId: string;
}

const FLAG_LABELS: { key: string; label: string; color: string }[] = [
  { key: 'databaseRead', label: 'DB Read', color: 'blue' },
  { key: 'databaseWrite', label: 'DB Write', color: 'orange' },
  { key: 'httpCall', label: 'HTTP', color: 'purple' },
  { key: 'fileRead', label: 'File Read', color: 'cyan' },
  { key: 'fileWrite', label: 'File Write', color: 'gold' },
  { key: 'sendsNotification', label: 'Notification', color: 'magenta' },
  { key: 'modifiesGlobalState', label: 'Global State', color: 'red' },
  { key: 'hasSideEffects', label: 'Side Effects', color: 'volcano' },
];

function FlagBadges({ flags }: { flags: Record<string, unknown> | null | undefined }) {
  if (!flags) return null;
  const active = FLAG_LABELS.filter((f) => flags[f.key] === true);
  if (active.length === 0) return null;
  return (
    <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
      {active.map((f) => (
        <Tag key={f.key} color={f.color} style={{ marginInlineEnd: 0 }}>
          {f.label}
        </Tag>
      ))}
    </Space>
  );
}

function PanelShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: PANEL_WIDTH,
        borderLeft: '1px solid rgba(140,140,140,0.2)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(140,140,140,0.2)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }} ellipsis={{ tooltip: title }}>
            {title}
          </Title>
          {subtitle && (
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }} ellipsis>
              {subtitle}
            </Text>
          )}
        </div>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="Close panel" />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
    </div>
  );
}

function FileCard({
  card,
  onClose,
}: {
  card: NonNullable<FileCardDto['file']>;
  onClose: () => void;
}) {
  const node = card.node;
  return (
    <PanelShell title={node.name} subtitle={node.filePath ?? undefined} onClose={onClose}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Lines">
            {node.line ?? '—'} – {node.endLine ?? '—'}
          </Descriptions.Item>
        </Descriptions>

        <FileMembersSection title={`Functions (${card.functions.length})`} empty="No functions">
          {card.functions.map((fn) => (
            <FunctionItem key={fn.key} fn={fn} />
          ))}
        </FileMembersSection>

        <FileMembersSection title={`Classes (${card.classes.length})`} empty="No classes">
          {card.classes.map((cls) => (
            <ClassItem key={cls.key} cls={cls} />
          ))}
        </FileMembersSection>

        <FileMembersSection title={`Imports (${card.imports.length})`} empty="No imports">
          {card.imports.map((imp, i) => (
            <ImportItem key={i} imp={imp} />
          ))}
        </FileMembersSection>

        <FileMembersSection title={`Exports (${card.exports.length})`} empty="No exports">
          {card.exports.map((exp, i) => (
            <ExportItem key={i} exp={exp} />
          ))}
        </FileMembersSection>
      </Space>
    </PanelShell>
  );
}

function FileMembersSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </Text>
      <Divider style={{ margin: '6px 0' }} />
      {children.length > 0 ? (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {children}
        </Space>
      ) : (
        <Text type="secondary" italic style={{ fontSize: 13 }}>
          {empty}
        </Text>
      )}
    </div>
  );
}

function FunctionItem({ fn }: { fn: FileMemberDto }) {
  const isAsync = (fn.data as Record<string, unknown>)?.isAsync === true;
  const summary = fn.summary;
  return (
    <Card size="small" styles={{ body: { padding: 8 } }}>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space size={6} wrap>
          <Text code style={{ fontSize: 13 }}>
            {fn.name}()
          </Text>
          {isAsync && <Tag color="geekblue">async</Tag>}
        </Space>
        {summary?.summary && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {summary.summary}
          </Text>
        )}
        <FlagBadges flags={summary?.flags} />
        {summary?.source && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {summary.source === 'ai'
              ? 'AI-generated'
              : summary.source === 'docstring'
                ? 'From docstring'
                : 'Manual'}
          </Text>
        )}
      </Space>
    </Card>
  );
}

function ClassItem({ cls }: { cls: NodeDto }) {
  const data = (cls.data ?? {}) as Record<string, unknown>;
  const methods = Array.isArray(data.methods) ? (data.methods as string[]) : [];
  const ext = typeof data.extends === 'string' ? data.extends : null;
  const impl = Array.isArray(data.implements) ? (data.implements as string[]) : [];
  const isExported = data.isExported === true;
  return (
    <Card size="small" styles={{ body: { padding: 8 } }}>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space size={6} wrap>
          <Text code style={{ fontSize: 13 }}>
            {cls.name}
          </Text>
          {isExported && <Tag color="blue">export</Tag>}
        </Space>
        {ext && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            extends <Text code>{ext}</Text>
          </Text>
        )}
        {impl.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            implements <Text code>{impl.join(', ')}</Text>
          </Text>
        )}
        <Text type="secondary" style={{ fontSize: 11 }}>
          Methods ({methods.length})
        </Text>
        {methods.length > 0 && (
          <Space size={[4, 4]} wrap>
            {methods.map((m) => (
              <Text key={m} code style={{ fontSize: 11 }}>
                {m}()
              </Text>
            ))}
          </Space>
        )}
      </Space>
    </Card>
  );
}

function ImportItem({ imp }: { imp: unknown }) {
  const rec = (imp ?? {}) as Record<string, unknown>;
  const source = typeof rec.source === 'string' ? rec.source : JSON.stringify(imp);
  const items = Array.isArray(rec.items) ? (rec.items as Record<string, unknown>[]) : [];
  return (
    <div>
      <Text code style={{ fontSize: 12 }}>
        {source}
      </Text>
      {items.length > 0 && (
        <div style={{ marginLeft: 12 }}>
          {items.map((it, i) => (
            <div key={i}>
              <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                {it.isDefault ? '(default) ' : ''}
                {String(it.name ?? '')}
                {it.alias ? ` as ${String(it.alias)}` : ''}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportItem({ exp }: { exp: unknown }) {
  const rec = (exp ?? {}) as Record<string, unknown>;
  const kind = typeof rec.kind === 'string' ? rec.kind : 'export';
  const name = typeof rec.name === 'string' ? rec.name : JSON.stringify(exp);
  const isDefault = rec.isDefault === true;
  return (
    <Space size={6}>
      <Tag color={isDefault ? 'blue' : 'default'}>{kind}</Tag>
      <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>{name}</Text>
    </Space>
  );
}

function MemberNodeCard({
  onClose,
}: {
  onClose: () => void;
}) {
  const node = useScanStore((s) => (s.selectedNodeId ? s.getNodeById(s.selectedNodeId) : undefined));
  if (!node) return null;
  const data = node as unknown as Record<string, unknown>;
  return (
    <PanelShell title={node.name} subtitle={node.filePath || undefined} onClose={onClose}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Type">{node.type}</Descriptions.Item>
          <Descriptions.Item label="Lines">
            {node.line} – {node.endLine}
          </Descriptions.Item>
        </Descriptions>
        {node.type === 'function' && (
          <FlagBadges
            flags={
              (data.behavioral as Record<string, unknown> | null)?.flags as
                | Record<string, unknown>
                | undefined
            }
          />
        )}
      </Space>
    </PanelShell>
  );
}

export function NodeDetailPanel({ projectId }: NodeDetailPanelProps) {
  const selectedNodeId = useScanStore((s) => s.selectedNodeId);
  const currentScan = useScanStore((s) => s.currentScan);
  const selectNode = useScanStore((s) => s.selectNode);
  const drillInto = useScanStore((s) => s.drillInto);

  const isFolder = !!selectedNodeId && isFolderNodeId(selectedNodeId);
  const selectedNode = selectedNodeId && currentScan ? currentScan.nodes[selectedNodeId] : undefined;
  const isFile = selectedNode?.type === 'file';
  const fileRef = isFile ? selectedNodeId! : null;

  const fileQuery = useQuery({
    queryKey: ['surveyor', 'file', projectId, fileRef],
    queryFn: () => surveyorClient.getFile(projectId, fileRef as string),
    enabled: !!fileRef,
  });

  if (!selectedNodeId || !currentScan) return null;
  const handleClose = () => selectNode(null);

  // Folder summary card (synthetic node, computed client-side).
  if (isFolder) {
    const folderPath = folderPathFromNodeId(selectedNodeId);
    const summary = aggregateFolder(currentScan, folderPath);
    const name = folderPath.split('/').pop() || folderPath;
    const stats = [
      { label: 'Files', value: summary.fileCount },
      { label: 'Functions', value: summary.functionCount },
      { label: 'Classes', value: summary.classCount },
      { label: 'Warnings', value: summary.warningCount },
    ];
    return (
      <PanelShell title={name} subtitle={folderPath} onClose={handleClose}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={[8, 8]}>
            {stats.map((s) => (
              <Col span={12} key={s.label}>
                <Card size="small" styles={{ body: { padding: 12 } }}>
                  <Statistic title={s.label} value={s.value} />
                </Card>
              </Col>
            ))}
          </Row>
          {summary.warningCount > 0 && (
            <Space size={[4, 4]} wrap>
              {summary.warningsByLevel.error > 0 && (
                <Tag color="error">{summary.warningsByLevel.error} error</Tag>
              )}
              {summary.warningsByLevel.warning > 0 && (
                <Tag color="warning">{summary.warningsByLevel.warning} warning</Tag>
              )}
              {summary.warningsByLevel.info > 0 && (
                <Tag color="blue">{summary.warningsByLevel.info} info</Tag>
              )}
            </Space>
          )}
          <Button type="primary" block onClick={() => drillInto(folderPath)}>
            Drill in
          </Button>
        </Space>
      </PanelShell>
    );
  }

  // File card from GET /file.
  if (isFile) {
    if (fileQuery.isLoading) {
      return (
        <PanelShell title={selectedNode?.name ?? 'File'} onClose={handleClose}>
          <Spin />
        </PanelShell>
      );
    }
    const card = fileQuery.data?.file;
    if (!card) {
      return (
        <PanelShell title={selectedNode?.name ?? 'File'} onClose={handleClose}>
          <Empty description="No card available for this file." />
        </PanelShell>
      );
    }
    return <FileCard card={card} onClose={handleClose} />;
  }

  // Any other node (function / class selected directly) → compact member card.
  return <MemberNodeCard onClose={handleClose} />;
}
