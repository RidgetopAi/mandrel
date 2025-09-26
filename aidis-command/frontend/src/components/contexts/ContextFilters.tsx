import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Space, Input, Select, DatePicker, Button, Row, Col,
  Slider, Typography, Tag, Collapse
} from 'antd';
import {
  SearchOutlined, FilterOutlined, ClearOutlined, 
  TagsOutlined
} from '@ant-design/icons';
import { useContextSearch } from '../../stores/contextStore';
// Oracle Phase 1: Removed useProjectContext - project scoping handled by API interceptor
import { getTypeColor } from '../../utils/contextHelpers';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text } = Typography;
const { Panel } = Collapse;

interface ContextFiltersProps {
  onSearch?: () => void;
  loading?: boolean;
}

const CONTEXT_TYPES = [
  { value: 'code', label: 'Code' },
  { value: 'decision', label: 'Decision' },
  { value: 'error', label: 'Error' },
  { value: 'discussion', label: 'Discussion' },
  { value: 'planning', label: 'Planning' },
  { value: 'completion', label: 'Completion' }
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Created Date' },
  { value: 'updated_at', label: 'Updated Date' },
  { value: 'relevance', label: 'Relevance Score' }
];

const ContextFilters: React.FC<ContextFiltersProps> = ({ onSearch, loading }) => {
  const { searchParams, updateSearchParam, clearFilters, isFiltered } = useContextSearch();
  // Oracle Phase 1: Removed currentProject - project scoping handled by API interceptor
  const [localQuery, setLocalQuery] = useState(searchParams.query || '');
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local query with global state when query is cleared externally
  useEffect(() => {
    if (!searchParams.query && localQuery) {
      setLocalQuery('');
    }
  }, [searchParams.query]); // Remove localQuery from dependencies to prevent circular updates

  // Optimized debounced search with useCallback and useRef
  const debouncedSearch = useCallback((query: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      updateSearchParam('query', query || undefined);
      updateSearchParam('offset', 0);
      onSearch?.();
    }, 300);
  }, [updateSearchParam, onSearch]);

  // Trigger debounced search when local query changes
  useEffect(() => {
    if (localQuery !== searchParams.query) {
      debouncedSearch(localQuery);
    }
  }, [localQuery, searchParams.query, debouncedSearch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const handleDateRangeChange = useCallback((dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      updateSearchParam('date_from', dates[0].toISOString());
      updateSearchParam('date_to', dates[1].toISOString());
    } else {
      updateSearchParam('date_from', undefined);
      updateSearchParam('date_to', undefined);
    }
    updateSearchParam('offset', 0);
    onSearch?.();
  }, [updateSearchParam, onSearch]);

  const handleTagsChange = useCallback((tags: string[]) => {
    updateSearchParam('tags', tags.length > 0 ? tags : undefined);
    updateSearchParam('offset', 0);
    onSearch?.();
  }, [updateSearchParam, onSearch]);

  const handleClearFilters = useCallback(() => {
    setLocalQuery('');
    clearFilters();
    // Oracle Phase 1: Removed manual project_id manipulation - handled by API interceptor
    onSearch?.();
  }, [clearFilters, onSearch]);

  const handleSortChange = useCallback((value: string) => {
    const [sortBy, sortOrder] = value.split('-');
    updateSearchParam('sort_by', sortBy as any);
    updateSearchParam('sort_order', sortOrder as any);
    updateSearchParam('offset', 0);
    onSearch?.();
  }, [updateSearchParam, onSearch]);

  const handleMinSimilarityChange = useCallback((value: number) => {
    updateSearchParam('min_similarity', value / 100);
    updateSearchParam('offset', 0);
  }, [updateSearchParam]);

  const getSortValue = () => {
    return `${searchParams.sort_by || 'created_at'}-${searchParams.sort_order || 'desc'}`;
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchParams.query) count++;
    if (searchParams.type) count++;
    // Oracle Phase 1: Removed project_id from filter count - handled by API interceptor
    if (searchParams.tags?.length) count++;
    if (searchParams.date_from || searchParams.date_to) count++;
    if (searchParams.min_similarity && searchParams.min_similarity !== 0.3) count++;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <Card
      className="context-filters"
      title={
        <Space>
          <FilterOutlined />
          <span>Search & Filters</span>
          {activeFiltersCount > 0 && (
            <Tag color="blue">{activeFiltersCount} active</Tag>
          )}
        </Space>
      }
      size="small"
      extra={
        <Button
          type="link"
          icon={<ClearOutlined />}
          onClick={handleClearFilters}
          disabled={!isFiltered}
        >
          Clear All
        </Button>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Main Search */}
        <Input
          placeholder="Search contexts with semantic understanding..."
          prefix={<SearchOutlined />}
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          size="large"
          allowClear
        />

        {/* Quick Filters Row */}
        <Row gutter={16}>
          <Col span={12} xs={24} sm={12} md={8} lg={8}>
            <Select
              placeholder="Filter by type"
              style={{ width: '100%', minWidth: '200px' }}
              value={searchParams.type}
              onChange={(value) => {
                updateSearchParam('type', value);
                updateSearchParam('offset', 0);
                onSearch?.();
              }}
              allowClear
              dropdownMatchSelectWidth={false}
            >
              {CONTEXT_TYPES.map(type => (
                <Option key={type.value} value={type.value}>
                  <Tag color={getTypeColor(type.value)} style={{ margin: 0 }}>
                    {type.label}
                  </Tag>
                </Option>
              ))}
            </Select>
          </Col>
          
          <Col span={12} xs={24} sm={12} md={8} lg={8}>
            <Select
              placeholder="Sort by"
              style={{ width: '100%', minWidth: '220px' }}
              value={getSortValue()}
              onChange={handleSortChange}
              dropdownMatchSelectWidth={false}
            >
              {SORT_OPTIONS.map(option => (
                <React.Fragment key={option.value}>
                  <Option value={`${option.value}-desc`}>
                    {option.label} (Newest First)
                  </Option>
                  <Option value={`${option.value}-asc`}>
                    {option.label} (Oldest First)
                  </Option>
                </React.Fragment>
              ))}
            </Select>
          </Col>

          <Col span={12} xs={24} sm={24} md={8} lg={8}>
            <RangePicker
              style={{ width: '100%', minWidth: '240px' }}
              placeholder={['From Date', 'To Date']}
              value={[
                searchParams.date_from ? dayjs(searchParams.date_from) : null,
                searchParams.date_to ? dayjs(searchParams.date_to) : null
              ]}
              onChange={handleDateRangeChange}
              format="YYYY-MM-DD"
            />
          </Col>
        </Row>

        {/* Advanced Filters (Collapsible) */}
        <Collapse ghost>
          <Panel header="Advanced Filters" key="advanced">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* Tags Filter */}
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  <TagsOutlined /> Filter by Tags
                </Text>
                <Select
                  mode="tags"
                  style={{ width: '100%', minWidth: '300px' }}
                  placeholder="Enter or select tags..."
                  value={searchParams.tags}
                  onChange={handleTagsChange}
                  tokenSeparators={[',']}
                  maxTagCount="responsive"
                  dropdownMatchSelectWidth={false}
                >
                  {/* Common tags could be loaded from API */}
                  <Option value="important">important</Option>
                  <Option value="bug">bug</Option>
                  <Option value="feature">feature</Option>
                  <Option value="refactor">refactor</Option>
                </Select>
              </div>

              {/* Similarity Threshold */}
              {searchParams.query && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    Minimum Similarity: {Math.round((searchParams.min_similarity || 0.3) * 100)}%
                  </Text>
                  <Slider
                    min={10}
                    max={90}
                    value={Math.round((searchParams.min_similarity || 0.3) * 100)}
                    onChange={handleMinSimilarityChange}
                    onAfterChange={() => onSearch?.()}
                    marks={{
                      10: '10%',
                      30: '30%',
                      50: '50%',
                      70: '70%',
                      90: '90%'
                    }}
                  />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Higher values show more similar results
                  </Text>
                </div>
              )}

              {/* Results Per Page */}
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Results per Page
                </Text>
                <Select
                  style={{ width: 120, minWidth: '120px' }}
                  value={searchParams.limit}
                  onChange={(value) => {
                    updateSearchParam('limit', value);
                    updateSearchParam('offset', 0);
                    onSearch?.();
                  }}
                  dropdownMatchSelectWidth={false}
                >
                  <Option value={10}>10</Option>
                  <Option value={20}>20</Option>
                  <Option value={50}>50</Option>
                  <Option value={100}>100</Option>
                </Select>
              </div>
            </Space>
          </Panel>
        </Collapse>

        {/* Search Stats */}
        {isFiltered && (
          <div style={{ padding: '8px 12px', background: '#f0f8ff', borderRadius: 4 }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <SearchOutlined /> Active search with {activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''}
            </Text>
          </div>
        )}
      </Space>
    </Card>
  );
};

export default ContextFilters;
