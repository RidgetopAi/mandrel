import React, { useState, useCallback, useMemo } from 'react';
import {
  Card,
  Space,
  Select,
  Slider,
  Input,
  Button,
  Row,
  Col,
  Checkbox,
  Radio,
  DatePicker,
  Tag,
  Collapse,
  Typography,
  Divider,
  Badge,
  Tooltip,
  Switch,
  InputNumber,
  AutoComplete
} from 'antd';
import {
  FilterOutlined,
  SearchOutlined,
  ClearOutlined,
  SaveOutlined,
  SettingOutlined,
  BugOutlined,
  CodeOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  FunctionOutlined,
  ApiOutlined
} from '@ant-design/icons';
import type { RangePickerProps } from 'antd/es/date-picker';

const { Text, Title } = Typography;
const { Panel } = Collapse;
const { RangePicker } = DatePicker;
const CheckboxGroup = Checkbox.Group;
const { Group: RadioGroup } = Radio;
const { TextArea } = Input;

export interface FilterState {
  // Search and Text Filters
  globalSearch: string;
  filePathPattern: string;
  componentNamePattern: string;
  functionNamePattern: string;

  // Severity and Priority
  severityLevels: ('critical' | 'high' | 'medium' | 'low')[];
  minSeverity: 'low' | 'medium' | 'high' | 'critical';

  // Complexity Metrics
  complexityRange: [number, number];
  readabilityRange: [number, number];
  maintainabilityRange: [number, number];

  // Code Structure
  functionLengthRange: [number, number];
  parameterCountRange: [number, number];
  nestingDepthRange: [number, number];
  cyclomaticComplexityRange: [number, number];

  // Dependencies and API
  importCountRange: [number, number];
  exportCountRange: [number, number];
  apiExposureRange: [number, number];

  // File Types and Patterns
  fileTypes: string[];
  fileExtensions: string[];
  excludePatterns: string[];
  includePatterns: string[];

  // Time and Updates
  lastModifiedRange: [string, string] | null;
  analysisDateRange: [string, string] | null;

  // Advanced Options
  showOnlyIssues: boolean;
  includeResolved: boolean;
  groupBy: 'file' | 'severity' | 'complexity' | 'type' | 'none';
  sortBy: 'severity' | 'complexity' | 'readability' | 'lastModified' | 'alphabetical';
  sortOrder: 'asc' | 'desc';

  // Custom Rules
  customRules: Array<{
    field: string;
    operator: 'gt' | 'lt' | 'eq' | 'contains' | 'regex';
    value: string | number;
    enabled: boolean;
  }>;
}

interface AdvancedFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
  availableFileTypes?: string[];
  availableComponents?: string[];
  savedFilters?: Array<{ name: string; filters: FilterState }>;
  onSaveFilter?: (name: string, filters: FilterState) => void;
  onLoadFilter?: (filters: FilterState) => void;
  className?: string;
}

const defaultFilters: FilterState = {
  globalSearch: '',
  filePathPattern: '',
  componentNamePattern: '',
  functionNamePattern: '',
  severityLevels: ['critical', 'high', 'medium', 'low'],
  minSeverity: 'low',
  complexityRange: [0, 50],
  readabilityRange: [0, 100],
  maintainabilityRange: [0, 100],
  functionLengthRange: [0, 500],
  parameterCountRange: [0, 20],
  nestingDepthRange: [0, 10],
  cyclomaticComplexityRange: [0, 50],
  importCountRange: [0, 100],
  exportCountRange: [0, 50],
  apiExposureRange: [0, 100],
  fileTypes: [],
  fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  excludePatterns: [],
  includePatterns: [],
  lastModifiedRange: null,
  analysisDateRange: null,
  showOnlyIssues: false,
  includeResolved: true,
  groupBy: 'none',
  sortBy: 'severity',
  sortOrder: 'desc',
  customRules: []
};

const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  onFilterChange,
  initialFilters = {},
  availableFileTypes = ['component', 'utility', 'service', 'hook', 'test'],
  availableComponents = [],
  savedFilters = [],
  onSaveFilter,
  onLoadFilter,
  className
}) => {
  const [filters, setFilters] = useState<FilterState>({
    ...defaultFilters,
    ...initialFilters
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // Calculate active filter count
  useMemo(() => {
    let count = 0;

    if (filters.globalSearch) count++;
    if (filters.filePathPattern) count++;
    if (filters.componentNamePattern) count++;
    if (filters.severityLevels.length < 4) count++;
    if (filters.complexityRange[0] > 0 || filters.complexityRange[1] < 50) count++;
    if (filters.readabilityRange[0] > 0 || filters.readabilityRange[1] < 100) count++;
    if (filters.fileTypes.length > 0) count++;
    if (filters.showOnlyIssues) count++;
    if (filters.customRules.filter(rule => rule.enabled).length > 0) count++;

    setActiveFilterCount(count);
  }, [filters]);

  const handleFilterChange = useCallback((key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  }, [filters, onFilterChange]);

  const handleReset = useCallback(() => {
    setFilters(defaultFilters);
    onFilterChange(defaultFilters);
  }, [onFilterChange]);

  const handleSaveFilter = useCallback(() => {
    if (saveFilterName && onSaveFilter) {
      onSaveFilter(saveFilterName, filters);
      setSaveFilterName('');
    }
  }, [saveFilterName, filters, onSaveFilter]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#f5222d';
      case 'high': return '#fa8c16';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#d9d9d9';
    }
  };

  const renderBasicFilters = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* Global Search */}
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={12} md={8}>
          <Input
            placeholder="Search everywhere..."
            prefix={<SearchOutlined />}
            value={filters.globalSearch}
            onChange={(e) => handleFilterChange('globalSearch', e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Input
            placeholder="File path pattern"
            prefix={<FileTextOutlined />}
            value={filters.filePathPattern}
            onChange={(e) => handleFilterChange('filePathPattern', e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Input
            placeholder="Component name"
            prefix={<CodeOutlined />}
            value={filters.componentNamePattern}
            onChange={(e) => handleFilterChange('componentNamePattern', e.target.value)}
            allowClear
          />
        </Col>
      </Row>

      {/* Severity and Quick Filters */}
      <Row gutter={[16, 8]} align="middle">
        <Col xs={24} sm={12} md={8}>
          <Space>
            <Text strong>Severity:</Text>
            <CheckboxGroup
              value={filters.severityLevels}
              onChange={(value) => handleFilterChange('severityLevels', value)}
            >
              {['critical', 'high', 'medium', 'low'].map(severity => (
                <Checkbox key={severity} value={severity}>
                  <Tag color={getSeverityColor(severity)}>
                    {severity}
                  </Tag>
                </Checkbox>
              ))}
            </CheckboxGroup>
          </Space>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Space>
            <Text>Issues Only</Text>
            <Switch
              checked={filters.showOnlyIssues}
              onChange={(checked) => handleFilterChange('showOnlyIssues', checked)}
            />
          </Space>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Select
            placeholder="Group by"
            value={filters.groupBy}
            onChange={(value) => handleFilterChange('groupBy', value)}
            style={{ width: '100%' }}
          >
            <Select.Option value="none">No Grouping</Select.Option>
            <Select.Option value="file">By File</Select.Option>
            <Select.Option value="severity">By Severity</Select.Option>
            <Select.Option value="complexity">By Complexity</Select.Option>
            <Select.Option value="type">By Type</Select.Option>
          </Select>
        </Col>
      </Row>
    </Space>
  );

  const renderAdvancedFilters = () => (
    <Collapse ghost>
      <Panel header="Complexity Metrics" key="complexity">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Complexity Range: {filters.complexityRange[0]} - {filters.complexityRange[1]}</Text>
              <Slider
                range
                min={0}
                max={50}
                value={filters.complexityRange}
                onChange={(value) => handleFilterChange('complexityRange', value)}
                marks={{ 0: '0', 10: '10', 25: '25', 50: '50+' }}
              />
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Readability: {filters.readabilityRange[0]}% - {filters.readabilityRange[1]}%</Text>
              <Slider
                range
                min={0}
                max={100}
                value={filters.readabilityRange}
                onChange={(value) => handleFilterChange('readabilityRange', value)}
                marks={{ 0: '0%', 50: '50%', 100: '100%' }}
              />
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Maintainability: {filters.maintainabilityRange[0]}% - {filters.maintainabilityRange[1]}%</Text>
              <Slider
                range
                min={0}
                max={100}
                value={filters.maintainabilityRange}
                onChange={(value) => handleFilterChange('maintainabilityRange', value)}
                marks={{ 0: '0%', 50: '50%', 100: '100%' }}
              />
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Cyclomatic Complexity: {filters.cyclomaticComplexityRange[0]} - {filters.cyclomaticComplexityRange[1]}</Text>
              <Slider
                range
                min={0}
                max={50}
                value={filters.cyclomaticComplexityRange}
                onChange={(value) => handleFilterChange('cyclomaticComplexityRange', value)}
                marks={{ 0: '0', 5: '5', 15: '15', 50: '50+' }}
              />
            </Space>
          </Col>
        </Row>
      </Panel>

      <Panel header="Code Structure" key="structure">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Function Length (lines)</Text>
              <Slider
                range
                min={0}
                max={500}
                value={filters.functionLengthRange}
                onChange={(value) => handleFilterChange('functionLengthRange', value)}
                marks={{ 0: '0', 50: '50', 200: '200', 500: '500+' }}
              />
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Parameter Count</Text>
              <Slider
                range
                min={0}
                max={20}
                value={filters.parameterCountRange}
                onChange={(value) => handleFilterChange('parameterCountRange', value)}
                marks={{ 0: '0', 3: '3', 6: '6', 20: '20+' }}
              />
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Nesting Depth</Text>
              <Slider
                range
                min={0}
                max={10}
                value={filters.nestingDepthRange}
                onChange={(value) => handleFilterChange('nestingDepthRange', value)}
                marks={{ 0: '0', 3: '3', 6: '6', 10: '10+' }}
              />
            </Space>
          </Col>
        </Row>
      </Panel>

      <Panel header="Dependencies & API" key="dependencies">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Import Count</Text>
              <Slider
                range
                min={0}
                max={100}
                value={filters.importCountRange}
                onChange={(value) => handleFilterChange('importCountRange', value)}
              />
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Export Count</Text>
              <Slider
                range
                min={0}
                max={50}
                value={filters.exportCountRange}
                onChange={(value) => handleFilterChange('exportCountRange', value)}
              />
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>API Exposure %</Text>
              <Slider
                range
                min={0}
                max={100}
                value={filters.apiExposureRange}
                onChange={(value) => handleFilterChange('apiExposureRange', value)}
              />
            </Space>
          </Col>
        </Row>
      </Panel>

      <Panel header="File Types & Patterns" key="files">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Text strong>File Types:</Text>
              <CheckboxGroup
                value={filters.fileTypes}
                onChange={(value) => handleFilterChange('fileTypes', value)}
                style={{ width: '100%' }}
              >
                <Row>
                  {availableFileTypes.map(type => (
                    <Col span={12} key={type}>
                      <Checkbox value={type}>{type}</Checkbox>
                    </Col>
                  ))}
                </Row>
              </CheckboxGroup>
            </Col>
            <Col xs={24} md={12}>
              <Text strong>File Extensions:</Text>
              <CheckboxGroup
                value={filters.fileExtensions}
                onChange={(value) => handleFilterChange('fileExtensions', value)}
                style={{ width: '100%' }}
              >
                <Row>
                  {['.ts', '.tsx', '.js', '.jsx', '.vue', '.py', '.java'].map(ext => (
                    <Col span={12} key={ext}>
                      <Checkbox value={ext}>{ext}</Checkbox>
                    </Col>
                  ))}
                </Row>
              </CheckboxGroup>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Text strong>Include Patterns (regex):</Text>
              <TextArea
                placeholder=".*test.*&#10;src/components/.*"
                rows={3}
                value={filters.includePatterns.join('\n')}
                onChange={(e) => handleFilterChange('includePatterns', e.target.value.split('\n').filter(p => p))}
              />
            </Col>
            <Col xs={24} md={12}>
              <Text strong>Exclude Patterns (regex):</Text>
              <TextArea
                placeholder=".*\.test\..*&#10;node_modules/.*"
                rows={3}
                value={filters.excludePatterns.join('\n')}
                onChange={(e) => handleFilterChange('excludePatterns', e.target.value.split('\n').filter(p => p))}
              />
            </Col>
          </Row>
        </Space>
      </Panel>

      <Panel header="Time & Sorting" key="time">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Text strong>Last Modified:</Text>
              <RangePicker
                style={{ width: '100%' }}
                onChange={(dates, dateStrings) =>
                  handleFilterChange('lastModifiedRange', dates ? dateStrings : null)
                }
              />
            </Col>
            <Col xs={24} md={12}>
              <Text strong>Analysis Date:</Text>
              <RangePicker
                style={{ width: '100%' }}
                onChange={(dates, dateStrings) =>
                  handleFilterChange('analysisDateRange', dates ? dateStrings : null)
                }
              />
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={12} md={6}>
              <Text strong>Sort By:</Text>
              <Select
                value={filters.sortBy}
                onChange={(value) => handleFilterChange('sortBy', value)}
                style={{ width: '100%' }}
              >
                <Select.Option value="severity">Severity</Select.Option>
                <Select.Option value="complexity">Complexity</Select.Option>
                <Select.Option value="readability">Readability</Select.Option>
                <Select.Option value="lastModified">Last Modified</Select.Option>
                <Select.Option value="alphabetical">Alphabetical</Select.Option>
              </Select>
            </Col>
            <Col xs={12} md={6}>
              <Text strong>Order:</Text>
              <RadioGroup
                value={filters.sortOrder}
                onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
              >
                <Radio value="asc">Ascending</Radio>
                <Radio value="desc">Descending</Radio>
              </RadioGroup>
            </Col>
          </Row>
        </Space>
      </Panel>
    </Collapse>
  );

  const renderSavedFilters = () => (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Row gutter={[8, 8]} align="middle">
        <Col flex="auto">
          <Input
            placeholder="Filter preset name"
            value={saveFilterName}
            onChange={(e) => setSaveFilterName(e.target.value)}
            size="small"
          />
        </Col>
        <Col>
          <Button
            size="small"
            icon={<SaveOutlined />}
            onClick={handleSaveFilter}
            disabled={!saveFilterName}
          >
            Save
          </Button>
        </Col>
      </Row>

      {savedFilters.length > 0 && (
        <div>
          <Text strong>Saved Filters:</Text>
          <div style={{ marginTop: 8 }}>
            {savedFilters.map((saved, index) => (
              <Tag
                key={index}
                style={{ cursor: 'pointer', marginBottom: 4 }}
                onClick={() => onLoadFilter?.(saved.filters)}
              >
                {saved.name}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </Space>
  );

  return (
    <Card
      className={className}
      title={
        <Space>
          <FilterOutlined />
          <span>Advanced Filters</span>
          {activeFilterCount > 0 && (
            <Badge count={activeFilterCount} style={{ backgroundColor: '#1890ff' }} />
          )}
        </Space>
      }
      size="small"
      extra={
        <Space>
          <Tooltip title="Reset all filters">
            <Button size="small" icon={<ClearOutlined />} onClick={handleReset}>
              Reset
            </Button>
          </Tooltip>
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Less' : 'More'}
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Basic Filters */}
        {renderBasicFilters()}

        {/* Advanced Filters */}
        {isExpanded && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            {renderAdvancedFilters()}
          </>
        )}

        {/* Saved Filters */}
        {(onSaveFilter || savedFilters.length > 0) && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            {renderSavedFilters()}
          </>
        )}
      </Space>
    </Card>
  );
};

export default AdvancedFilters;