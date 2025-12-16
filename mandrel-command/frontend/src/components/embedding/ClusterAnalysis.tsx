import React, { useEffect, useMemo, useState } from 'react';
import { Card, Alert, Spin, Button, Row, Col, Select, Slider, Statistic, Space } from 'antd';
import { Scatter } from '@ant-design/plots';
import { ReloadOutlined } from '@ant-design/icons';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useEmbeddingDatasetSelection } from '../../hooks/useEmbeddingDatasetSelection';
import { useEmbeddingClustersQuery } from '../../hooks/useEmbeddings';

const { Option } = Select;

const DEFAULT_CLUSTER_COUNT = 5;
const MIN_CLUSTER_COUNT = 2;
const MAX_CLUSTER_COUNT = 15;

const ClusterAnalysis: React.FC = () => {
  const { currentProject } = useProjectContext();
  const projectId = currentProject?.id;

  const {
    datasetsQuery,
    datasets,
    selectedDatasetId,
    setSelectedDatasetId,
  } = useEmbeddingDatasetSelection(projectId);

  const [clusterCount, setClusterCount] = useState<number>(DEFAULT_CLUSTER_COUNT);

  const activeDataset = useMemo(
    () => datasets.find(dataset => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId]
  );

  const maxClusterValue = useMemo(() => {
    const itemCount = activeDataset?.count ?? 0;
    if (itemCount <= MIN_CLUSTER_COUNT) {
      return MIN_CLUSTER_COUNT;
    }
    return Math.min(MAX_CLUSTER_COUNT, itemCount);
  }, [activeDataset]);

  const clustersQuery = useEmbeddingClustersQuery(
    {
      datasetId: selectedDatasetId ?? undefined,
      clusterCount,
      projectId,
    },
    {
      enabled: Boolean(projectId && selectedDatasetId),
      refetchOnWindowFocus: false,
    }
  );

  const clusterResult = clustersQuery.data ?? null;
  const loading = datasetsQuery.isLoading || clustersQuery.isLoading;
  const fetching = datasetsQuery.isFetching || clustersQuery.isFetching;
  const error = (datasetsQuery.error as Error) ?? (clustersQuery.error as Error) ?? null;

  useEffect(() => {
    if (clusterCount > maxClusterValue) {
      setClusterCount(maxClusterValue);
      return;
    }

    if (clusterCount < MIN_CLUSTER_COUNT) {
      setClusterCount(MIN_CLUSTER_COUNT);
    }
  }, [clusterCount, maxClusterValue]);

  const clustersById = useMemo(() => {
    if (!clusterResult) {
      return new Map<number, number>();
    }
    const counts = new Map<number, number>();
    for (const point of clusterResult.points) {
      counts.set(point.cluster, (counts.get(point.cluster) ?? 0) + 1);
    }
    return counts;
  }, [clusterResult]);

  const chartConfig = useMemo(() => ({
    appendPadding: 10,
    data: clusterResult?.points ?? [],
    xField: 'x',
    yField: 'y',
    colorField: 'cluster',
    size: 4,
    shape: 'circle',
    interactions: [
      { type: 'zoom-canvas', enable: true },
      { type: 'drag-canvas', enable: true },
    ],
    tooltip: {
      fields: ['label', 'cluster', 'x', 'y'],
      formatter: (datum: any) => ({
        name: `${datum.label}`,
        value: `Cluster ${datum.cluster}\n(${datum.x.toFixed(3)}, ${datum.y.toFixed(3)})`,
      }),
    },
    legend: {
      position: 'right' as const,
      flipPage: true,
    },
    xAxis: {
      grid: { line: { style: { stroke: '#f0f0f0' } } },
    },
    yAxis: {
      grid: { line: { style: { stroke: '#f0f0f0' } } },
    },
  }), [clusterResult]);

  const handleRefresh = () => {
    void clustersQuery.refetch();
  };

  if (!projectId) {
    return (
      <Card title="Cluster Analysis" bordered={false}>
        <Alert
          message="Select a project"
          description="Choose a project to analyse embedding clusters."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  if (loading && !clusterResult) {
    return (
      <Card title="Cluster Analysis" bordered={false}>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading embedding clusters...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Cluster Analysis" bordered={false}>
        <Alert
          message="Error"
          description={error.message}
          type="error"
          showIcon
        />
        <Button onClick={handleRefresh} style={{ marginTop: 16 }} icon={<ReloadOutlined />}>
          Retry
        </Button>
      </Card>
    );
  }

  if (datasets.length === 0) {
    return (
      <Card title="Cluster Analysis" bordered={false}>
        <Alert
          message="No embeddings available"
          description="No embedding datasets were found for this project."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  if (!selectedDatasetId) {
    return (
      <Card title="Cluster Analysis" bordered={false}>
        <Alert
          message="No dataset selected"
          description="Select an embedding dataset to run cluster analysis."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card
      title="Cluster Analysis"
      bordered={false}
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={fetching}
        >
          Refresh
        </Button>
      }
    >
      <Card
        size="small"
        title="Clustering Settings"
        style={{ marginBottom: 16 }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Row gutter={16} align="middle">
          <Col span={8}>
            <label>Dataset:</label>
            <Select
              value={selectedDatasetId}
              onChange={setSelectedDatasetId}
              style={{ width: '100%', marginTop: 4 }}
              loading={datasetsQuery.isFetching}
            >
              {datasets.map(dataset => (
                <Option key={dataset.id} value={dataset.id}>
                  {dataset.name} ({dataset.count} items)
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={10}>
            <label>Cluster Count: {clusterCount}</label>
            <Slider
              min={MIN_CLUSTER_COUNT}
              max={maxClusterValue}
              value={clusterCount}
              onChange={value => setClusterCount(value)}
              tooltip={{
                formatter: value => `${value} clusters`,
              }}
              marks={{
                [MIN_CLUSTER_COUNT]: `${MIN_CLUSTER_COUNT}`,
                [maxClusterValue]: `${maxClusterValue}`,
              }}
            />
          </Col>
          <Col span={6}>
            <Space direction="vertical" size={4}>
              <Statistic
                title="Clusters"
                value={clusterResult?.k ?? clusterCount}
              />
              <Statistic
                title="Inertia"
                value={clusterResult?.inertia ? clusterResult.inertia.toFixed(2) : '—'}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {clusterResult ? (
        <>
          {clusterResult.points.length === 0 ? (
            <Alert
              message="No cluster data returned"
              description="Try lowering the cluster count or refreshing the dataset."
              type="info"
              showIcon
            />
          ) : (
            <Scatter {...chartConfig} />
          )}
          {clustersById.size > 0 && (
            <Row gutter={16} style={{ marginTop: 16 }}>
              {Array.from(clustersById.entries()).map(([id, count]) => (
                <Col key={id} span={6}>
                  <Card size="small" bordered>
                    <Statistic title={`Cluster ${id}`} value={count} suffix="points" />
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
        </div>
      )}
    </Card>
  );
};

export default ClusterAnalysis;
