import React, { useState } from 'react';
import {
  Space, Button, Dropdown, Menu, Modal, message, Typography,
  Select, Divider, Checkbox, Alert, Input, Tag
} from 'antd';
import {
  DeleteOutlined, ExportOutlined, MoreOutlined,
  DownloadOutlined, PlusOutlined
} from '@ant-design/icons';
import { useContextSelection } from '../../stores/contextStore';
import { useBulkDeleteContexts } from '../../hooks/useContexts';
import contextsClient from '../../api/contextsClient';

const { Text } = Typography;
const { Option } = Select;

interface BulkActionsProps {
  onBulkDelete?: (deletedCount: number) => void;
  onSelectionChange?: (allSelected: boolean) => void;
  onContextCreated?: () => void;
  searchParams?: any;
  loading?: boolean;
}

const BulkActions: React.FC<BulkActionsProps> = ({
  onBulkDelete,
  onSelectionChange,
  onContextCreated,
  searchParams = {},
  loading = false
}) => {
  const {
    selectedContexts,
    selectedCount,
    totalCount,
    isAllSelected,
    isPartiallySelected,
    hasSelection
  } = useContextSelection();

  const bulkDeleteMutation = useBulkDeleteContexts();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'md'>('json');
  const [exporting, setExporting] = useState(false);
  const [addContextModalVisible, setAddContextModalVisible] = useState(false);
  const [newContextData, setNewContextData] = useState({
    content: '',
    type: 'discussion' as string,
    tags: [] as string[],
    metadata: {} as Record<string, string>
  });
  const [creating, setCreating] = useState(false);

  // Handle select all/none
  const handleSelectAll = () => {
    onSelectionChange?.(!isAllSelected);
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;

    try {
      const result = await bulkDeleteMutation.mutateAsync(selectedContexts);
      message.success(`Successfully deleted ${result.deleted} contexts`);
      onBulkDelete?.(result.deleted);
      setDeleteModalVisible(false);
    } catch (error) {
      console.error('Bulk delete failed:', error);
      message.error('Failed to delete contexts');
    }
  };

  // Handle export
  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = hasSelection
        ? { ...searchParams, limit: 10000 }
        : { ...searchParams };

      const blob = await contextsClient.exportContexts(exportParams, exportFormat);
      const filename = `contexts-export-${new Date().toISOString().slice(0, 10)}.${exportFormat}`;
      contextsClient.downloadBlob(blob, filename);
      
      message.success(`Exported ${hasSelection ? selectedCount : 'all filtered'} contexts as ${exportFormat.toUpperCase()}`);
      setExportModalVisible(false);
    } catch (error) {
      console.error('Export failed:', error);
      message.error('Failed to export contexts');
    } finally {
      setExporting(false);
    }
  };

  // Handle add context
  const handleAddContext = async () => {
    if (!newContextData.content.trim()) {
      message.error('Context content is required');
      return;
    }

    setCreating(true);
    try {
      // Use AIDIS MCP context_store tool via HTTP bridge
      const response = await fetch('http://localhost:8080/mcp/tools/context_store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arguments: {
            content: newContextData.content,
            type: newContextData.type,
            tags: newContextData.tags.length > 0 ? newContextData.tags : undefined,
            metadata: Object.keys(newContextData.metadata).length > 0 ? newContextData.metadata : undefined
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create context');
      }

      message.success('Context created successfully');
      setAddContextModalVisible(false);
      setNewContextData({ content: '', type: 'discussion', tags: [], metadata: {} });
      onContextCreated?.();
    } catch (error) {
      console.error('Create context failed:', error);
      message.error('Failed to create context');
    } finally {
      setCreating(false);
    }
  };

  // Bulk actions menu
  const bulkActionsMenu = (
    <Menu>
      <Menu.Item
        key="add"
        icon={<PlusOutlined />}
        onClick={() => setAddContextModalVisible(true)}
      >
        Add Context
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        key="delete"
        icon={<DeleteOutlined />}
        danger
        onClick={() => setDeleteModalVisible(true)}
        disabled={!hasSelection}
      >
        Delete Selected ({selectedCount})
      </Menu.Item>
      <Menu.Item
        key="export"
        icon={<ExportOutlined />}
        onClick={() => setExportModalVisible(true)}
      >
        Export {hasSelection ? `Selected (${selectedCount})` : 'All'}
      </Menu.Item>
    </Menu>
  );

  return (
    <>
      <div className="bulk-actions-container" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: '#fafafa',
        borderRadius: '6px',
        border: '1px solid #d9d9d9'
      }}>
        <Space>
          <Checkbox
            indeterminate={isPartiallySelected}
            checked={isAllSelected}
            onChange={handleSelectAll}
            disabled={totalCount === 0 || loading}
          >
            Select All
          </Checkbox>
          <Divider type="vertical" />
          <Text type="secondary">
            {hasSelection ? (
              `${selectedCount} of ${totalCount} selected`
            ) : (
              `${totalCount} total contexts`
            )}
          </Text>
        </Space>

        <Space>
          {hasSelection && (
            <Alert
              message={`${selectedCount} contexts selected`}
              type="info"
              showIcon
              style={{ margin: 0 }}
            />
          )}
          
          <Dropdown
            overlay={bulkActionsMenu}
            trigger={['click']}
            disabled={loading}
            overlayClassName="bulk-actions-dropdown"
          >
            <Button
              icon={<MoreOutlined />}
              loading={bulkDeleteMutation.isPending || exporting || creating}
            >
              Actions
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        title="Confirm Bulk Delete"
        open={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeleteModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="delete"
            type="primary"
            danger
            loading={bulkDeleteMutation.isPending}
            onClick={handleBulkDelete}
            icon={<DeleteOutlined />}
          >
            Delete {selectedCount} Contexts
          </Button>
        ]}
      >
        <Alert
          message="Warning"
          description={`You are about to permanently delete ${selectedCount} context${selectedCount !== 1 ? 's' : ''}. This action cannot be undone.`}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Text>Are you sure you want to proceed?</Text>
      </Modal>

      {/* Export Modal */}
      <Modal
        title="Export Contexts"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="export"
            type="primary"
            loading={exporting}
            onClick={handleExport}
            icon={<DownloadOutlined />}
          >
            Export
          </Button>
        ]}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text strong>Export Scope:</Text>
            <div style={{ marginTop: 8 }}>
              {hasSelection ? (
                <Alert
                  message={`Exporting ${selectedCount} selected contexts`}
                  type="info"
                  showIcon
                />
              ) : (
                <Alert
                  message="Exporting all contexts matching current filters"
                  type="info"
                  showIcon
                />
              )}
            </div>
          </div>

          <div>
            <Text strong>Export Format:</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={exportFormat}
              onChange={setExportFormat}
            >
              <Option value="json">
                JSON - Full data with metadata
              </Option>
              <Option value="csv">
                CSV - Tabular format for spreadsheets
              </Option>
              <Option value="md">
                Markdown - Full content for NotebookLM
              </Option>
            </Select>
          </div>

          {exportFormat === 'json' && (
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
              JSON format includes complete context data, metadata, embeddings, and search filters used.
            </div>
          )}

          {exportFormat === 'csv' && (
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
              CSV format includes: ID, Project, Type, Content Preview, Tags, Relevance Score, and Dates.
            </div>
          )}

          {exportFormat === 'md' && (
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
              Markdown format includes all fields with full content. Compatible with NotebookLM and other AI analysis tools.
            </div>
          )}
        </Space>
      </Modal>

      {/* Add Context Modal */}
      <Modal
        title="Add New Context"
        open={addContextModalVisible}
        onCancel={() => {
          setAddContextModalVisible(false);
          setNewContextData({ content: '', type: 'discussion', tags: [], metadata: {} });
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setAddContextModalVisible(false);
            setNewContextData({ content: '', type: 'discussion', tags: [], metadata: {} });
          }}>
            Cancel
          </Button>,
          <Button
            key="create"
            type="primary"
            loading={creating}
            onClick={handleAddContext}
            icon={<PlusOutlined />}
          >
            Create Context
          </Button>
        ]}
        width={600}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text strong>Context Type</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={newContextData.type}
              onChange={(value) => setNewContextData(prev => ({ ...prev, type: value }))}
            >
              <Option value="code">Code</Option>
              <Option value="decision">Decision</Option>
              <Option value="error">Error</Option>
              <Option value="discussion">Discussion</Option>
              <Option value="planning">Planning</Option>
              <Option value="completion">Completion</Option>
              <Option value="milestone">Milestone</Option>
              <Option value="reflections">Reflections</Option>
              <Option value="handoff">Handoff</Option>
            </Select>
          </div>

          <div>
            <Text strong>Content</Text>
            <Input.TextArea
              style={{ marginTop: 8 }}
              placeholder="Enter context content..."
              value={newContextData.content}
              onChange={(e) => setNewContextData(prev => ({ ...prev, content: e.target.value }))}
              rows={6}
              maxLength={10000}
              showCount
            />
          </div>

          <div>
            <Text strong>Tags (Optional)</Text>
            <Select
              mode="tags"
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Enter tags..."
              value={newContextData.tags}
              onChange={(tags) => setNewContextData(prev => ({ ...prev, tags }))}
              tokenSeparators={[',']}
            >
              <Option value="important">important</Option>
              <Option value="bug">bug</Option>
              <Option value="feature">feature</Option>
              <Option value="refactor">refactor</Option>
            </Select>
          </div>

          <div>
            <Text strong>Metadata (Optional)</Text>
            <div style={{ marginTop: 8 }}>
              <Input.Group style={{ marginBottom: 8 }}>
                <Input
                  placeholder="Key"
                  style={{ width: '40%' }}
                  onPressEnter={(e) => {
                    const key = e.currentTarget.value.trim();
                    const valueInput = e.currentTarget.parentElement?.querySelector('input[placeholder="Value"]') as HTMLInputElement;
                    const value = valueInput?.value?.trim();
                    if (key && value) {
                      setNewContextData(prev => ({
                        ...prev,
                        metadata: { ...prev.metadata, [key]: value }
                      }));
                      e.currentTarget.value = '';
                      if (valueInput) valueInput.value = '';
                    }
                  }}
                />
                <Input
                  placeholder="Value"
                  style={{ width: '40%', marginLeft: 8 }}
                  onPressEnter={(e) => {
                    const value = e.currentTarget.value.trim();
                    const keyInput = e.currentTarget.parentElement?.querySelector('input[placeholder="Key"]') as HTMLInputElement;
                    const key = keyInput?.value?.trim();
                    if (key && value) {
                      setNewContextData(prev => ({
                        ...prev,
                        metadata: { ...prev.metadata, [key]: value }
                      }));
                      keyInput.value = '';
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <Button
                  style={{ width: '20%', marginLeft: 8 }}
                  onClick={() => {
                    const container = document.querySelector('.ant-modal .ant-input-group');
                    const keyInput = container?.querySelector('input[placeholder="Key"]') as HTMLInputElement;
                    const valueInput = container?.querySelector('input[placeholder="Value"]') as HTMLInputElement;
                    const key = keyInput?.value?.trim();
                    const value = valueInput?.value?.trim();
                    if (key && value) {
                      setNewContextData(prev => ({
                        ...prev,
                        metadata: { ...prev.metadata, [key]: value }
                      }));
                      if (keyInput) keyInput.value = '';
                      if (valueInput) valueInput.value = '';
                    }
                  }}
                >
                  Add
                </Button>
              </Input.Group>
              {Object.keys(newContextData.metadata).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {Object.entries(newContextData.metadata).map(([key, value]) => (
                    <Tag
                      key={key}
                      closable
                      onClose={() => {
                        setNewContextData(prev => {
                          const newMetadata = { ...prev.metadata };
                          delete newMetadata[key];
                          return { ...prev, metadata: newMetadata };
                        });
                      }}
                      style={{ marginBottom: 4 }}
                    >
                      {key}: {value}
                    </Tag>
                  ))}
                </div>
              )}
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: 4 }}>
                Add key-value pairs for context metadata (e.g., priority: high, author: john)
              </div>
            </div>
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default BulkActions;
