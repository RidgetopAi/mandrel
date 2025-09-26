import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Space, Row, Col, Card, List, Pagination, Spin, 
  message, Button, Modal, Empty, Alert
} from 'antd';
import {
  BulbOutlined, SearchOutlined, ReloadOutlined,
  FilterOutlined, BarChartOutlined
} from '@ant-design/icons';
import { useDecisionStore, useDecisionSearch, useDecisionSelection } from '../stores/decisionStore';
import { useProjectContext } from '../contexts/ProjectContext';
import { useDecisionSearchQuery, useDecisionStatsQuery } from '../hooks/useDecisions';
import { DecisionApi } from '../services/decisionApi';
import DecisionCard from '../components/decisions/DecisionCard';
import DecisionFilters from '../components/decisions/DecisionFilters';
import DecisionDetail from '../components/decisions/DecisionDetail';

const { Title, Text } = Typography;

const Decisions: React.FC = () => {
  const {
    searchResults,
    currentDecision,
    stats,
    isLoading,
    isSearching,
    error,
    showDetail,
    showFilters,
    setSearchResults,
    setStats,
    setCurrentDecision,
    setSearching,
    setLoading,
    setError,
    setShowDetail,
    setShowFilters,
    clearError,
    addSelectedDecision,
    removeSelectedDecision,
    clearSelection
  } = useDecisionStore();

  const { currentProject } = useProjectContext();
  
  const { 
    searchParams, 
    updateSearchParam, 
    isFiltered 
  } = useDecisionSearch();

  const decisionSelection = useDecisionSelection();
  const [showStatsModal, setShowStatsModal] = useState(false);

  useEffect(() => {
    const newProjectId = currentProject?.id;
    if (searchParams.project_id !== newProjectId) {
      updateSearchParam('project_id', newProjectId);
      clearSelection();
    }
  }, [currentProject?.id, searchParams.project_id, updateSearchParam, clearSelection]);

  const {
    data: decisionsData,
    isFetching: decisionsFetching,
    isLoading: decisionsLoading,
    error: decisionsError,
    refetch: refetchDecisions,
  } = useDecisionSearchQuery(searchParams, {
    placeholderData: (previous) => previous ?? undefined,
  });

  const {
    data: statsData,
    error: statsError,
    refetch: refetchStats,
  } = useDecisionStatsQuery(currentProject?.id, { staleTime: 1000 * 60 * 5 });

  useEffect(() => {
    setSearching(decisionsFetching);
  }, [decisionsFetching, setSearching]);

  useEffect(() => {
    setLoading(decisionsLoading);
  }, [decisionsLoading, setLoading]);

  useEffect(() => {
    if (decisionsError) {
      console.error('Failed to load decisions:', decisionsError);
      setError('Failed to load decisions. Please try again.');
      message.error('Failed to load decisions');
    } else {
      setError(null);
    }
  }, [decisionsError, setError]);

  useEffect(() => {
    if (decisionsData) {
      const limit = decisionsData.limit ?? searchParams.limit ?? 20;
      const page = decisionsData.page ?? Math.floor((searchParams.offset ?? 0) / limit) + 1;

      setSearchResults({
        decisions: decisionsData.decisions,
        total: decisionsData.total,
        limit,
        page,
      });
    }
  }, [decisionsData, searchParams.limit, searchParams.offset, setSearchResults]);

  useEffect(() => {
    if (statsData) {
      setStats(statsData);
    }
  }, [statsData, setStats]);

  useEffect(() => {
    if (statsError) {
      console.error('Failed to load decision stats:', statsError);
    }
  }, [statsError]);

  const handleSearch = useCallback(() => {
    refetchDecisions();
  }, [refetchDecisions]);

  const handleRefresh = () => {
    clearSelection();
    refetchDecisions();
    refetchStats();
  };

  const handleDecisionSelect = (id: number, selected: boolean) => {
    if (selected) {
      addSelectedDecision(id);
    } else {
      removeSelectedDecision(id);
    }
  };

  const handleDecisionView = (decision: any) => {
    setCurrentDecision(decision);
    setShowDetail(true);
  };

  const handleDecisionEdit = (decision: any) => {
    setCurrentDecision(decision);
    setShowDetail(true);
  };

  const handleDecisionDelete = async (decision: any) => {
    Modal.confirm({
      title: 'Delete Technical Decision',
      content: 'Are you sure you want to delete this decision? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await DecisionApi.deleteDecision(decision.id);
          message.success('Decision deleted successfully');
          refetchDecisions();
          refetchStats();
        } catch (err) {
          console.error('Failed to delete decision:', err);
          message.error('Failed to delete decision');
        }
      }
    });
  };

  const handleDecisionShare = (decision: any) => {
    const shareData = {
      title: `AIDIS Technical Decision: ${decision.title}`,
      text: `Problem: ${decision.problem}\n\nDecision: ${decision.decision}`,
      url: window.location.href
    };

    if (navigator.share) {
      navigator.share(shareData).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareData.text);
      message.success('Decision details copied to clipboard');
    }
  };

  const handleDecisionUpdate = (updatedDecision: any) => {
    // Update the decision in the search results
    if (searchResults) {
      const updatedDecisions = searchResults.decisions.map(dec =>
        dec.id === updatedDecision.id ? updatedDecision : dec
      );
      setSearchResults({
        ...searchResults,
        decisions: updatedDecisions
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

  const decisions = searchResults?.decisions || [];
  const total = searchResults?.total || 0;
  const currentPage = searchResults ? Math.floor((searchParams.offset || 0) / (searchParams.limit || 20)) + 1 : 1;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <BulbOutlined /> Technical Decision Browser
          </Title>
          <Text type="secondary">
            Track architectural decisions, their rationale, and outcomes across your projects
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
            <DecisionFilters
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
                    {isSearching ? 'Searching...' : `${total} decisions found`}
                  </Text>
                  {isFiltered && (
                    <Text type="secondary">(filtered)</Text>
                  )}
                </Space>
                
                <Space>
                  {total > 0 && (
                    <Text type="secondary">
                      Showing {Math.min(decisions.length, total)} of {total}
                    </Text>
                  )}
                </Space>
              </div>
            </Card>

            {/* Decision List */}
            <div style={{ minHeight: '400px' }}>
              <Spin spinning={isSearching}>
                {decisions.length > 0 ? (
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
                    dataSource={decisions}
                    renderItem={(decision) => (
                      <List.Item>
                        <DecisionCard
                          decision={decision}
                          selected={decisionSelection.selectedDecisions.includes(decision.id)}
                          showCheckbox={true}
                          searchTerm={searchParams.query}
                          onSelect={handleDecisionSelect}
                          onView={handleDecisionView}
                          onEdit={handleDecisionEdit}
                          onDelete={handleDecisionDelete}
                          onShare={handleDecisionShare}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Card>
                    <Empty
                      image={<BulbOutlined style={{ fontSize: '64px', color: '#d9d9d9' }} />}
                      imageStyle={{ height: 80 }}
                      description={
                        <Space direction="vertical">
                          <Text>
                            {isFiltered ? 'No decisions match your filters' : 'No technical decisions found'}
                          </Text>
                          <Text type="secondary">
                            {isFiltered 
                              ? 'Try adjusting your search criteria or clearing filters'
                              : 'Technical decisions will appear here as they are recorded'
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
                            updateSearchParam('status', undefined);
                            updateSearchParam('project_id', undefined);
                            updateSearchParam('created_by', undefined);
                            updateSearchParam('date_from', undefined);
                            updateSearchParam('date_to', undefined);
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
                    `${range[0]}-${range[1]} of ${total} decisions`
                  }
                  onChange={handlePaginationChange}
                  pageSizeOptions={['10', '20', '50', '100']}
                />
              </div>
            )}
          </Space>
        </Col>
      </Row>

      {/* Decision Detail Drawer */}
      <DecisionDetail
        visible={showDetail}
        decision={currentDecision}
        onClose={() => setShowDetail(false)}
        onUpdate={handleDecisionUpdate}
        onDelete={(decision) => {
          setShowDetail(false);
          refetchDecisions();
          refetchStats();
        }}
      />

      {/* Statistics Modal */}
      <Modal
        title={
          <Space>
            <BarChartOutlined />
            <span>Decision Statistics</span>
          </Space>
        }
        open={showStatsModal}
        onCancel={() => setShowStatsModal(false)}
        footer={null}
        width={800}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card title="Overview">
            <Row gutter={16}>
              <Col span={6}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary">Total Decisions</Text>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                    {stats?.total_decisions || 0}
                  </div>
                </div>
              </Col>
              <Col span={6}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary">Recent (30 days)</Text>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                    {stats?.recent_decisions || 0}
                  </div>
                </div>
              </Col>
              <Col span={6}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary">Projects</Text>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fa8c16' }}>
                    {stats?.total_projects || 0}
                  </div>
                </div>
              </Col>
            </Row>
          </Card>

          <Card title="By Status">
            <Space direction="vertical" style={{ width: '100%' }}>
              {stats?.by_status && Object.entries(stats.by_status).map(([status, count]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Space>
                    <div 
                      style={{ 
                        width: 8, 
                        height: 8, 
                        borderRadius: '50%', 
                        backgroundColor: DecisionApi.getStatusColor(status)
                      }} 
                    />
                    <Text>{DecisionApi.getStatusDisplayName(status)}</Text>
                  </Space>
                  <Text strong>{count}</Text>
                </div>
              ))}
              {!stats?.by_status && (
                <Text type="secondary">No status data available</Text>
              )}
            </Space>
          </Card>
        </Space>
      </Modal>
    </Space>
  );
};

export default Decisions;
