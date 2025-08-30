import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Space, Row, Col, Card, List, Pagination, Spin, 
  message, Button, Modal, Divider, Empty, Alert
} from 'antd';
import {
  DatabaseOutlined, SearchOutlined, ReloadOutlined,
  EyeOutlined, FilterOutlined, BarChartOutlined
} from '@ant-design/icons';
import { useContextStore, useContextSearch, useContextSelection } from '../stores/contextStore';
import { useProjectContext } from '../contexts/ProjectContext';
import { ContextApi } from '../services/contextApi';
import ContextCard from '../components/contexts/ContextCard';
import ContextFilters from '../components/contexts/ContextFilters';
import ContextDetail from '../components/contexts/ContextDetail';
import ContextStats from '../components/contexts/ContextStats';
import BulkActions from '../components/contexts/BulkActions';
import '../components/contexts/contexts.css';

const { Title, Text } = Typography;

const Contexts: React.FC = () => {
  const {
    searchResults,
    currentContext,
    stats,
    isLoading,
    isSearching,
    error,
    showDetail,
    showFilters,
    setSearchResults,
    setStats,
    setCurrentContext,
    setLoading,
    setSearching,
    setError,
    setShowDetail,
    setShowFilters,
    clearError
  } = useContextStore();

  const { 
    searchParams, 
    updateSearchParam, 
    isFiltered 
  } = useContextSearch();

  const { currentProject } = useProjectContext();

  const contextSelection = useContextSelection();
  const {
    addSelectedContext,
    removeSelectedContext,
    selectAllContexts,
    clearSelection
  } = useContextStore();

  const [showStatsModal, setShowStatsModal] = useState(false);

  const loadContexts = useCallback(async () => {
    setSearching(true);
    setError(null);
    
    try {
      const result = await ContextApi.searchContexts(searchParams);
      setSearchResults(result);
    } catch (err) {
      console.error('Failed to load contexts:', err);
      setError('Failed to load contexts. Please try again.');
      message.error('Failed to load contexts');
    } finally {
      setSearching(false);
    }
  }, [searchParams, setSearchResults, setSearching, setError]);

  const loadStats = async () => {
    try {
      const contextStats = await ContextApi.getContextStats();
      setStats(contextStats);
    } catch (err) {
      console.error('Failed to load context stats:', err);
    }
  };

  // Load contexts on component mount and when search params change
  useEffect(() => {
    loadContexts();
    loadStats();
  }, []);

  // Oracle Phase 1: Removed manual project sync - handled by API interceptor
  
  // Auto-refresh contexts when searchParams change
  useEffect(() => {
    loadContexts();
  }, [searchParams, loadContexts]);

  const handleSearch = useCallback(() => {
    loadContexts();
  }, [loadContexts]);

  const handleRefresh = () => {
    clearSelection();
    loadContexts();
    loadStats();
  };

  const handleContextSelect = (id: string, selected: boolean) => {
    if (selected) {
      addSelectedContext(id);
    } else {
      removeSelectedContext(id);
    }
  };

  const handleSelectAll = (allSelected: boolean) => {
    if (allSelected) {
      selectAllContexts();
    } else {
      clearSelection();
    }
  };

  const handleContextView = (context: any) => {
    setCurrentContext(context);
    setShowDetail(true);
  };

  const handleContextEdit = (context: any) => {
    setCurrentContext(context);
    setShowDetail(true);
  };

  const handleContextDelete = async (context: any) => {
    Modal.confirm({
      title: 'Delete Context',
      content: 'Are you sure you want to delete this context? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await ContextApi.deleteContext(context.id);
          message.success('Context deleted successfully');
          loadContexts(); // Refresh the list
        } catch (err) {
          console.error('Failed to delete context:', err);
          message.error('Failed to delete context');
        }
      }
    });
  };

  const handleContextShare = (context: any) => {
    const shareData = {
      title: `AIDIS Context: ${context.type}`,
      text: `${ContextApi.getTypeDisplayName(context.type)} context from ${context.project_name || 'Unknown Project'}\n\n${context.content.substring(0, 200)}...`,
      url: window.location.href
    };

    if (navigator.share) {
      navigator.share(shareData).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareData.text);
      message.success('Context details copied to clipboard');
    }
  };

  const handleBulkDelete = (deletedCount: number) => {
    clearSelection();
    loadContexts();
    loadStats();
  };

  const handleContextUpdate = (updatedContext: any) => {
    // Update the context in the search results
    if (searchResults) {
      const updatedContexts = searchResults.contexts.map(ctx =>
        ctx.id === updatedContext.id ? updatedContext : ctx
      );
      setSearchResults({
        ...searchResults,
        contexts: updatedContexts
      });
    }
  };

  const handlePaginationChange = (page: number, pageSize?: number) => {
    const newOffset = (page - 1) * (pageSize || searchParams.limit || 20);
    updateSearchParam('offset', newOffset);
    if (pageSize && pageSize !== searchParams.limit) {
      updateSearchParam('limit', pageSize);
    }
    handleSearch();
  };

  const contexts = searchResults?.contexts || [];
  const total = searchResults?.total || 0;
  const currentPage = searchResults ? Math.floor((searchParams.offset || 0) / (searchParams.limit || 20)) + 1 : 1;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <DatabaseOutlined /> Context Browser
          </Title>
          <Text type="secondary">
            Explore your AI's memory with semantic search and intelligent filtering
          </Text>
        </div>
        
        <Space>
          <Button
            icon={<BarChartOutlined />}
            onClick={() => setShowStatsModal(true)}
          >
            Statistics
          </Button>
          <Button
            icon={<FilterOutlined />}
            onClick={() => setShowFilters(!showFilters)}
            type={showFilters ? 'primary' : 'default'}
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={isLoading || isSearching}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={clearError}
        />
      )}

      <Row gutter={24}>
        {/* Filters Sidebar */}
        {showFilters && (
          <Col span={6}>
            <ContextFilters
              onSearch={handleSearch}
              loading={isSearching}
            />
          </Col>
        )}

        {/* Main Content */}
        <Col span={showFilters ? 18 : 24}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Results Header */}
            <Card size="small">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <SearchOutlined />
                  <Text strong>
                    {isSearching ? 'Searching...' : `${total} contexts found`}
                  </Text>
                  {isFiltered && (
                    <Text type="secondary">(filtered)</Text>
                  )}
                </Space>
                
                <Space>
                  {total > 0 && (
                    <Text type="secondary">
                      Showing {Math.min(contexts.length, total)} of {total}
                    </Text>
                  )}
                </Space>
              </div>
            </Card>

            {/* Bulk Actions */}
            {total > 0 && (
              <BulkActions
                onBulkDelete={handleBulkDelete}
                onSelectionChange={handleSelectAll}
                searchParams={searchParams}
                loading={isSearching}
              />
            )}

            {/* Context List */}
            <div style={{ minHeight: '400px' }}>
              <Spin spinning={isSearching}>
                {contexts.length > 0 ? (
                  <List
                    grid={{
                      gutter: 16,
                      xs: 1,
                      sm: 1,
                      md: 1,
                      lg: 2,
                      xl: 2,
                      xxl: 3,
                    }}
                    dataSource={contexts}
                    renderItem={(context) => (
                      <List.Item>
                        <ContextCard
                          context={context}
                          selected={contextSelection.selectedContexts.includes(context.id)}
                          showCheckbox={true}
                          searchTerm={searchParams.query}
                          onSelect={handleContextSelect}
                          onView={handleContextView}
                          onEdit={handleContextEdit}
                          onDelete={handleContextDelete}
                          onShare={handleContextShare}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Card>
                    <Empty
                      image={<DatabaseOutlined style={{ fontSize: '64px', color: '#d9d9d9' }} />}
                      imageStyle={{ height: 80 }}
                      description={
                        <Space direction="vertical">
                          <Text>
                            {isFiltered ? 'No contexts match your filters' : 'No contexts found'}
                          </Text>
                          <Text type="secondary">
                            {isFiltered 
                              ? 'Try adjusting your search criteria or clearing filters'
                              : 'Contexts will appear here as they are created by AI agents'
                            }
                          </Text>
                        </Space>
                      }
                    >
                      {isFiltered && (
                        <Button 
                          type="primary" 
                          onClick={() => {
                            updateSearchParam('query', undefined);
                            updateSearchParam('type', undefined);
                            updateSearchParam('tags', undefined);
                            // Oracle Phase 1: Removed manual project_id manipulation - handled by API interceptor
                            handleSearch();
                          }}
                        >
                          Clear Filters
                        </Button>
                      )}
                    </Empty>
                  </Card>
                )}
              </Spin>
            </div>

            {/* Pagination */}
            {total > (searchParams.limit || 20) && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <Pagination
                  current={currentPage}
                  total={total}
                  pageSize={searchParams.limit || 20}
                  showSizeChanger
                  showQuickJumper
                  showTotal={(total, range) =>
                    `${range[0]}-${range[1]} of ${total} contexts`
                  }
                  onChange={handlePaginationChange}
                  pageSizeOptions={['10', '20', '50', '100']}
                />
              </div>
            )}
          </Space>
        </Col>
      </Row>

      {/* Context Detail Drawer */}
      <ContextDetail
        visible={showDetail}
        context={currentContext}
        onClose={() => setShowDetail(false)}
        onUpdate={handleContextUpdate}
        onDelete={(context) => {
          setShowDetail(false);
          loadContexts();
        }}
      />

      {/* Statistics Modal */}
      <Modal
        title={
          <Space>
            <BarChartOutlined />
            <span>Context Statistics</span>
          </Space>
        }
        open={showStatsModal}
        onCancel={() => setShowStatsModal(false)}
        footer={null}
        width={800}
      >
        <ContextStats stats={stats} loading={isLoading} />
      </Modal>
    </Space>
  );
};

export default Contexts;
