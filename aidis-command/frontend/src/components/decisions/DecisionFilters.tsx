import React, { useEffect, useState } from 'react';
import {
  Card,
  Input,
  Select,
  DatePicker,
  Space,
  Button,
  Form,
  Typography,
  Divider,
  Tag,
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  CalendarOutlined,
  UserOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useDecisionSearch } from '../../stores/decisionStore';
import { useProjectContext } from '../../contexts/ProjectContext';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface DecisionFiltersProps {
  onSearch: () => void;
  loading?: boolean;
}

const DecisionFilters: React.FC<DecisionFiltersProps> = ({
  onSearch,
  loading = false
}) => {
  const [form] = Form.useForm();
  const { searchParams, updateSearchParam, clearFilters, isFiltered } = useDecisionSearch();
  const { allProjects: projects } = useProjectContext();

  // Update form when search params change
  useEffect(() => {
    form.setFieldsValue({
      query: searchParams.query || '',
      status: searchParams.status || undefined,
      project_id: searchParams.project_id || undefined,
      created_by: searchParams.created_by || '',
      dateRange: searchParams.date_from && searchParams.date_to 
        ? [dayjs(searchParams.date_from), dayjs(searchParams.date_to)]
        : undefined,
    });
  }, [searchParams, form]);

  const handleSearch = () => {
    onSearch();
  };

  const handleClearFilters = () => {
    form.resetFields();
    clearFilters();
    onSearch();
  };

  const handleFieldChange = (field: string, value: any) => {
    if (field === 'dateRange') {
      if (value && value.length === 2) {
        updateSearchParam('date_from', value[0].toISOString());
        updateSearchParam('date_to', value[1].toISOString());
      } else {
        updateSearchParam('date_from', undefined);
        updateSearchParam('date_to', undefined);
      }
    } else {
      updateSearchParam(field as any, value || undefined);
    }
  };

  const statusOptions = [
    { label: 'Active', value: 'active', color: '#52c41a' },
    { label: 'Under Review', value: 'under_review', color: '#1890ff' },
    { label: 'Superseded', value: 'superseded', color: '#fa8c16' },
    { label: 'Deprecated', value: 'deprecated', color: '#8c8c8c' },
  ];

  const projectOptions = projects?.map(project => ({
    label: project.name,
    value: project.id,
  })) || [];

  return (
    <Card 
      size="small" 
      title={
        <Space>
          <FilterOutlined />
          <span>Decision Filters</span>
        </Space>
      }
      extra={
        isFiltered && (
          <Button
            type="link"
            size="small"
            icon={<ClearOutlined />}
            onClick={handleClearFilters}
          >
            Clear All
          </Button>
        )
      }
    >
      <Form
        form={form}
        layout="vertical"
        size="small"
      >
        {/* Search Query */}
        <Form.Item
          name="query"
          label={
            <Space>
              <SearchOutlined />
              <Text>Search Decisions</Text>
            </Space>
          }
        >
          <Input
            placeholder="Search title, problem, or decision..."
            allowClear
            onChange={(e) => handleFieldChange('query', e.target.value)}
            onPressEnter={handleSearch}
          />
        </Form.Item>

        {/* Status Filter */}
        <Form.Item
          name="status"
          label="Status"
        >
          <Select
            placeholder="Select status"
            allowClear
            onChange={(value) => handleFieldChange('status', value)}
            options={statusOptions.map(option => ({
              label: (
                <Space>
                  <div 
                    style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      backgroundColor: option.color 
                    }} 
                  />
                  {option.label}
                </Space>
              ),
              value: option.value,
            }))}
          />
        </Form.Item>

        {/* Project Filter */}
        <Form.Item
          name="project_id"
          label={
            <Space>
              <FolderOutlined />
              <Text>Project</Text>
            </Space>
          }
        >
          <Select
            placeholder="Select project"
            allowClear
            showSearch
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            onChange={(value) => handleFieldChange('project_id', value)}
            options={projectOptions}
          />
        </Form.Item>

        {/* Created By Filter */}
        <Form.Item
          name="created_by"
          label={
            <Space>
              <UserOutlined />
              <Text>Created By</Text>
            </Space>
          }
        >
          <Input
            placeholder="Enter username"
            allowClear
            onChange={(e) => handleFieldChange('created_by', e.target.value)}
          />
        </Form.Item>

        {/* Date Range Filter */}
        <Form.Item
          name="dateRange"
          label={
            <Space>
              <CalendarOutlined />
              <Text>Date Range</Text>
            </Space>
          }
        >
          <RangePicker
            style={{ width: '100%' }}
            onChange={(dates) => handleFieldChange('dateRange', dates)}
            format="YYYY-MM-DD"
            placeholder={['Start date', 'End date']}
          />
        </Form.Item>

        <Divider />

        {/* Action Buttons */}
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={loading}
            block
          >
            Search
          </Button>
        </Space>

        {/* Active Filters Display */}
        {isFiltered && (
          <>
            <Divider />
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Active Filters:
              </Text>
              <div style={{ marginTop: '8px' }}>
                <Space wrap size="small">
                  {searchParams.query && (
                    <Tag color="blue" closable onClose={() => handleFieldChange('query', '')}>
                      Query: {searchParams.query}
                    </Tag>
                  )}
                  {searchParams.status && (
                    <Tag color="green" closable onClose={() => handleFieldChange('status', undefined)}>
                      Status: {statusOptions.find(s => s.value === searchParams.status)?.label}
                    </Tag>
                  )}
                  {searchParams.project_id && (
                    <Tag color="purple" closable onClose={() => handleFieldChange('project_id', undefined)}>
                      Project: {projectOptions.find(p => p.value === searchParams.project_id)?.label}
                    </Tag>
                  )}
                  {searchParams.created_by && (
                    <Tag color="orange" closable onClose={() => handleFieldChange('created_by', '')}>
                      Creator: {searchParams.created_by}
                    </Tag>
                  )}
                  {searchParams.date_from && searchParams.date_to && (
                    <Tag color="red" closable onClose={() => handleFieldChange('dateRange', undefined)}>
                      Date: {dayjs(searchParams.date_from).format('MMM DD')} - {dayjs(searchParams.date_to).format('MMM DD')}
                    </Tag>
                  )}
                </Space>
              </div>
            </div>
          </>
        )}
      </Form>
    </Card>
  );
};

export default DecisionFilters;
