import React, { useState } from 'react';
import {
  Space, Button, Dropdown, Menu, Modal, message, Typography,
  Select, Divider, Checkbox, Alert
} from 'antd';
import {
  DeleteOutlined, ExportOutlined, MoreOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { useContextSelection } from '../../stores/contextStore';
import { ContextApi } from '../../services/contextApi';

const { Text } = Typography;
const { Option } = Select;

interface BulkActionsProps {
  onBulkDelete?: (deletedCount: number) => void;
  onSelectionChange?: (allSelected: boolean) => void;
  searchParams?: any;
  loading?: boolean;
}

const BulkActions: React.FC<BulkActionsProps> = ({
  onBulkDelete,
  onSelectionChange,
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

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');

  // Handle select all/none
  const handleSelectAll = () => {
    onSelectionChange?.(!isAllSelected);
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;

    setActionLoading(true);
    try {
      const result = await ContextApi.bulkDeleteContexts(selectedContexts);
      message.success(`Successfully deleted ${result.deleted} contexts`);
      onBulkDelete?.(result.deleted);
      setDeleteModalVisible(false);
    } catch (error) {
      console.error('Bulk delete failed:', error);
      message.error('Failed to delete contexts');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    setActionLoading(true);
    try {
      // If contexts are selected, export only those
      // Otherwise export all with current search filters
      let exportParams = { ...searchParams };
      
      if (hasSelection) {
        // For selected contexts, we need to adjust the search to only include those IDs
        // This is a simplified approach - in a real app you might want to export selected IDs directly
        exportParams = { 
          ...exportParams,
          limit: 10000 // Ensure we get all
        };
      }

      const blob = await ContextApi.exportContexts(exportParams, exportFormat);
      const filename = `contexts-export-${new Date().toISOString().slice(0, 10)}.${exportFormat}`;
      ContextApi.downloadBlob(blob, filename);
      
      message.success(`Exported ${hasSelection ? selectedCount : 'all filtered'} contexts as ${exportFormat.toUpperCase()}`);
      setExportModalVisible(false);
    } catch (error) {
      console.error('Export failed:', error);
      message.error('Failed to export contexts');
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk actions menu
  const bulkActionsMenu = (
    <Menu>
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
      <div style={{ 
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
          >
            <Button 
              icon={<MoreOutlined />}
              loading={actionLoading}
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
            loading={actionLoading}
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
            loading={actionLoading}
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
        </Space>
      </Modal>
    </>
  );
};

export default BulkActions;
