import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Typography, Space, Row, Col, Card, List, Pagination, Spin, 
  message, Button, Modal, Empty, Alert
} from 'antd';
import {
  DatabaseOutlined, SearchOutlined, ReloadOutlined,
  FilterOutlined, BarChartOutlined
} from '@ant-design/icons';
import { useContextStore, useContextSearch, useContextSelection } from '../stores/contextStore';
import {
  useContextSearchQuery,
  useContextStatsQuery,
  useDeleteContext,
} from '../hooks/useContexts';
import { getTypeDisplayName } from '../utils/contextHelpers';
import type { Context } from '../types/context';
import ContextCard from '../components/contexts/ContextCard';
import ContextFilters from '../components/contexts/ContextFilters';
import ContextDetail from '../components/contexts/ContextDetail';
import ContextStats from '../components/contexts/ContextStats';
import BulkActions from '../components/contexts/BulkActions';
import { useProjectContext } from '../contexts/ProjectContext';
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
    setSearching,
    setLoading,
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

  const contextSelection = useContextSelection();
  const {
    addSelectedContext,
    removeSelectedContext,
    selectAllContexts,
    clearSelection
  } = useContextStore();

  const [showStatsModal, setShowStatsModal] = useState(false);
  const { currentProject } = useProjectContext();

  const deleteContextMutation = useDeleteContext();
  const {
    data: contextsData,
    isFetching: contextsFetching,
    isLoading: contextsLoading,
    error: contextsError,
    refetch: refetchContexts,
  } = useContextSearchQuery(searchParams, {
    placeholderData: (previous) => previous ?? undefined,
  });

  const {
    data: statsData,
    isFetching: statsFetching,
    error: statsError,
    refetch: refetchStats,
  } = useContextStatsQuery({ staleTime: 1000 * 60 * 5 });

  // Optimized: Consolidate project management effects
  useEffect(() => {
    const newProjectId = currentProject?.id;
    if (searchParams.project_id !== newProjectId) {
      updateSearchParam('project_id', newProjectId);
      clearSelection();
    }
    // Also refetch stats when project changes
    refetchStats();
  }, [currentProject?.id, searchParams.project_id, updateSearchParam, clearSelection, refetchStats]);

  // Optimized: Consolidate loading states
  useEffect(() => {
    setSearching(contextsFetching);
    setLoading(contextsLoading);
  }, [contextsFetching, contextsLoading, setSearching, setLoading]);

  // Optimized: Consolidate error handling
  useEffect(() => {
    if (contextsError) {
      console.error('Failed to load contexts:', contextsError);
      setError('Failed to load contexts. Please try again.');
      message.error('Failed to load contexts');
    } else {
      setError(null);
    }
    if (statsError) {
      console.error('Failed to load context stats:', statsError);
    }
  }, [contextsError, statsError, setError]);

  // Optimized: Consolidate data processing
  useEffect(() => {
    if (contextsData) {
      const limit = contextsData.limit ?? searchParams.limit ?? 20;
      const offset = searchParams.offset ?? 0;
      const page = Math.floor(offset / limit) + 1;

      setSearchResults({
        contexts: contextsData.contexts,
        total: contextsData.total,
        limit,
        page,
      });
    }
    if (statsData) {
      setStats(statsData);
    }
  }, [contextsData, statsData, searchParams.limit, searchParams.offset, setSearchResults, setStats]);

  const handleSearch = useCallback(() => {
    refetchContexts();
  }, [refetchContexts]);

  const handleRefresh = () => {
    clearSelection();
    refetchContexts();
    refetchStats();
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

  const handleContextView = (context: Context) => {
    setCurrentContext(context);
    setShowDetail(true);
  };

  const handleContextEdit = (context: Context) => {
    setCurrentContext(context);
    setShowDetail(true);
  };

  const handleContextDelete = async (context: Context) => {
    Modal.confirm({
      title: 'Delete Context',
      content: 'Are you sure you want to delete this context? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteContextMutation.mutateAsync(context.id);
          removeSelectedContext(context.id);
          message.success('Context deleted successfully');
          refetchContexts();
          refetchStats();
        } catch (err) {
          console.error('Failed to delete context:', err);
          message.error('Failed to delete context');
        }
      }
    });
  };

  const handleContextShare = (context: Context) => {
    const shareData = {
      title: `AIDIS Context: ${context.type}`,
      text: `${getTypeDisplayName(context.type)} context from ${context.project_name || 'Unknown Project'}\n\n${context.content.substring(0, 200)}...`,
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
    refetchContexts();
    refetchStats();
  };

  const handleContextUpdate = (updatedContext: Context) => {
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

  // Memoized computed values to prevent re-renders
  const { contexts, total, currentPage } = useMemo(() => {
    const ctxs = searchResults?.contexts || [];
    const ttl = searchResults?.total || 0;
    const page = searchResults ? Math.floor((searchParams.offset || 0) / (searchParams.limit || 20)) + 1 : 1;
    return { contexts: ctxs, total: ttl, currentPage: page };
  }, [searchResults, searchParams.offset, searchParams.limit]);

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
                loading={contextsFetching}
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
        onDelete={() => {
          setShowDetail(false);
          clearSelection();
          refetchContexts();
          refetchStats();
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
        <ContextStats stats={stats} loading={statsFetching} />
      </Modal>
    </Space>
  );
};

export default Contexts;
