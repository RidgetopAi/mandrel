import React, { useMemo, useState } from 'react';
import { Card, Spin, Alert, Select, Space, InputNumber, Button } from 'antd';
import { Heatmap } from '@ant-design/plots';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useProjectContext } from '../../contexts/ProjectContext';
import {
  useSimilarityMatrixQuery,
} from '../../hooks/useEmbeddings';
import { useEmbeddingStore } from '../../stores/embeddingStore';
import { useEmbeddingDatasetSelection } from '../../hooks/useEmbeddingDatasetSelection';

const { Option } = Select;

interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

const SimilarityHeatmap: React.FC = () => {
  const { currentProject } = useProjectContext();
  const projectId = currentProject?.id;

  const { heatmapSize, updateHeatmapSize } = useEmbeddingStore();
  const [showSettings, setShowSettings] = useState(false);

  const { datasetsQuery, datasets, selectedDatasetId, setSelectedDatasetId } =
    useEmbeddingDatasetSelection(projectId);

  const similarityQuery = useSimilarityMatrixQuery(
    {
      datasetId: selectedDatasetId ?? undefined,
      rows: heatmapSize.rows,
      cols: heatmapSize.cols,
      projectId,
    },
    {
      enabled: Boolean(projectId && selectedDatasetId),
      refetchOnWindowFocus: false,
    }
  );

  const loading = datasetsQuery.isLoading || similarityQuery.isLoading;
  const fetching = datasetsQuery.isFetching || similarityQuery.isFetching;
  const error = (datasetsQuery.error as Error) ?? (similarityQuery.error as Error) ?? null;
  const similarityMatrix = similarityQuery.data ?? null;

  const heatmapData = useMemo<HeatmapData[]>(() => {
    if (!similarityMatrix) {
      return [];
    }

    const data: HeatmapData[] = [];
    const { matrix, labels } = similarityMatrix;

    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        data.push({
          x: labels[j] || `Item ${j}`,
          y: labels[i] || `Item ${i}`,
          value: matrix[i][j],
        });
      }
    }

    return data;
  }, [similarityMatrix]);

  const handleRetry = () => {
    void Promise.all([datasetsQuery.refetch(), similarityQuery.refetch()]);
  };

  const handleRefresh = () => {
    void similarityQuery.refetch();
  };

  const heatmapConfig = {
    data: heatmapData,
    xField: 'x',
    yField: 'y',
    colorField: 'value',
    reflect: 'y' as const,
    shape: 'square' as const,
    meta: {
      value: {
        min: 0,
        max: 1,
      },
    },
    xAxis: {
      label: {
        autoRotate: true,
        autoHide: true,
        style: {
          fontSize: 10,
        },
      },
    },
    yAxis: {
      label: {
        autoHide: true,
        style: {
          fontSize: 10,
        },
      },
    },
    tooltip: {
      title: 'Similarity',
      formatter: (datum: HeatmapData) => ({
        name: 'Cosine Similarity',
        value: datum.value.toFixed(3),
      }),
    },
    color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffcc', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
    legend: {
      position: 'right' as const,
    },
    height: 500,
  };

  if (!projectId) {
    return (
      <Card title="Embedding Similarity Heatmap">
        <Alert
          message="Select a project"
          description="Choose a project to load embedding datasets and similarity analytics."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  if (loading && !similarityMatrix) {
    return (
      <Card title="Embedding Similarity Heatmap">
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading embedding datasets...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Embedding Similarity Heatmap">
        <Alert
          message="Error"
          description={error.message}
          type="error"
          showIcon
        />
        <Button onClick={handleRetry} style={{ marginTop: 16 }} icon={<ReloadOutlined />}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <Card
      title="Embedding Similarity Heatmap"
      extra={
        <Space>
          <Button
            icon={<SettingOutlined />}
            onClick={() => setShowSettings(!showSettings)}
            type={showSettings ? 'primary' : 'default'}
          >
            Settings
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            disabled={!selectedDatasetId}
            loading={fetching && Boolean(selectedDatasetId)}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      {showSettings && (
        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f9f9f9' }}>
          <Space wrap>
            <div>
              <label>Dataset: </label>
              <Select
                value={selectedDatasetId ?? undefined}
                onChange={setSelectedDatasetId}
                style={{ width: 240 }}
                placeholder="Select dataset"
                loading={datasetsQuery.isFetching}
              >
                {datasets.map(dataset => (
                  <Option key={dataset.id} value={dataset.id}>
                    {dataset.name} ({dataset.count} items)
                  </Option>
                ))}
              </Select>
            </div>
            <div>
              <label>Rows: </label>
              <InputNumber
                min={10}
                max={200}
                value={heatmapSize.rows}
                onChange={(value) =>
                  updateHeatmapSize({ rows: Number(value ?? 50), cols: heatmapSize.cols })
                }
              />
            </div>
            <div>
              <label>Cols: </label>
              <InputNumber
                min={10}
                max={200}
                value={heatmapSize.cols}
                onChange={(value) =>
                  updateHeatmapSize({ rows: heatmapSize.rows, cols: Number(value ?? 50) })
                }
              />
            </div>
          </Space>
        </Card>
      )}

      {!selectedDatasetId && (
        <Alert
          message="No dataset selected"
          description="Choose an embedding dataset to visualize similarity scores."
          type="info"
          showIcon
        />
      )}

      {selectedDatasetId && similarityMatrix && (
        <Heatmap {...heatmapConfig} />
      )}
    </Card>
  );
};

export default SimilarityHeatmap;
