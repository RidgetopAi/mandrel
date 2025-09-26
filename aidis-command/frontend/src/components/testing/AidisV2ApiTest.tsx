/**
 * TR001-6 Integration Test Component
 * Tests the AIDIS V2 API client integration with live endpoints
 */

import React, { useState, useCallback } from 'react';
import { Card, Button, Space, Typography, Alert, Spin, Divider, Input, message } from 'antd';
import { aidisApi } from '../../api/aidisApiClient';
import { useProjectContext } from '../../contexts/ProjectContext';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface TestResult {
  test: string;
  status: 'pending' | 'success' | 'error';
  duration?: number;
  data?: any;
  error?: string;
}

const AidisV2ApiTest: React.FC = () => {
  const { switchProjectViaAidis, currentProject } = useProjectContext();
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState('');

  const addResult = useCallback((result: TestResult) => {
    setResults(prev => [...prev, result]);
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  const runTest = useCallback(async (
    testName: string,
    testFunction: () => Promise<any>
  ) => {
    const startTime = Date.now();
    addResult({ test: testName, status: 'pending' });

    try {
      const data = await testFunction();
      const duration = Date.now() - startTime;

      setResults(prev => prev.map(r =>
        r.test === testName && r.status === 'pending'
          ? { test: testName, status: 'success', duration, data }
          : r
      ));

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;

      setResults(prev => prev.map(r =>
        r.test === testName && r.status === 'pending'
          ? { test: testName, status: 'error', duration, error: String(error) }
          : r
      ));

      throw error;
    }
  }, [addResult]);

  const runAllTests = useCallback(async () => {
    setLoading(true);
    clearResults();

    try {
      // Test 1: Health Check
      await runTest('V2 Health Check', () => aidisApi.getHealth());

      // Test 2: Ping
      await runTest('AIDIS Ping', () => aidisApi.ping('Frontend integration test'));

      // Test 3: Get Status
      await runTest('Get Status', () => aidisApi.getStatus());

      // Test 4: List Tools
      await runTest('List Tools', () => aidisApi.listTools());

      // Test 5: Get Current Project
      await runTest('Get Current Project', () => aidisApi.getCurrentProject());

      // Test 6: List Projects
      await runTest('List Projects', () => aidisApi.listProjects(true));

      // Test 7: Get Session Status
      await runTest('Get Session Status', () => aidisApi.getSessionStatus());

      // Test 8: Error Handling Test (intentionally bad request)
      await runTest('Error Handling Test', () =>
        aidisApi.callTool('nonexistent_tool', {})
      );

      message.success('All tests completed! Check results below.');
    } catch (error) {
      console.error('Test suite error:', error);
    } finally {
      setLoading(false);
    }
  }, [runTest, clearResults]);

  const testProjectSwitch = useCallback(async () => {
    if (!projectName.trim()) {
      message.error('Please enter a project name');
      return;
    }

    setLoading(true);
    try {
      const success = await switchProjectViaAidis(projectName.trim());
      if (success) {
        message.success(`Successfully switched to project: ${projectName}`);
        addResult({
          test: `Switch to Project: ${projectName}`,
          status: 'success',
          duration: 0,
          data: { projectName, success }
        });
      } else {
        message.error('Failed to switch project');
        addResult({
          test: `Switch to Project: ${projectName}`,
          status: 'error',
          duration: 0,
          error: 'Switch operation returned false'
        });
      }
    } catch (error) {
      message.error(`Error switching project: ${error}`);
      addResult({
        test: `Switch to Project: ${projectName}`,
        status: 'error',
        duration: 0,
        error: String(error)
      });
    } finally {
      setLoading(false);
    }
  }, [projectName, switchProjectViaAidis, addResult]);

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return '#52c41a';
      case 'error': return '#ff4d4f';
      case 'pending': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

  return (
    <Card title="🧪 AIDIS V2 API Integration Test" style={{ margin: '16px 0' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          message="TR001-6: Frontend API Client Hardening"
          description="This component tests the enhanced AIDIS V2 API client with retry logic, validation, and error handling."
          type="info"
          showIcon
        />

        <div>
          <Text strong>Current Project: </Text>
          <Text code>{currentProject?.name || 'None'}</Text>
          {currentProject?.description && (
            <div>
              <Text type="secondary">{currentProject.description}</Text>
            </div>
          )}
        </div>

        <Divider />

        <Space wrap>
          <Button
            type="primary"
            onClick={runAllTests}
            loading={loading}
            disabled={loading}
          >
            Run All Tests
          </Button>

          <Button onClick={clearResults} disabled={loading}>
            Clear Results
          </Button>
        </Space>

        <div>
          <Text strong>Project Switch Test:</Text>
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input
              placeholder="Enter project name (e.g., aidis-core)"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onPressEnter={testProjectSwitch}
              disabled={loading}
            />
            <Button
              type="default"
              onClick={testProjectSwitch}
              loading={loading}
              disabled={loading || !projectName.trim()}
            >
              Test Switch
            </Button>
          </Space.Compact>
        </div>

        <Divider />

        {results.length > 0 && (
          <div>
            <Title level={4}>Test Results</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              {results.map((result, index) => (
                <Card
                  key={`${result.test}-${index}`}
                  size="small"
                  style={{
                    borderLeft: `4px solid ${getStatusColor(result.status)}`,
                    marginBottom: 8
                  }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text strong>{result.test}</Text>
                      {result.status === 'pending' && <Spin size="small" style={{ marginLeft: 8 }} />}
                      {result.duration !== undefined && (
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          ({result.duration}ms)
                        </Text>
                      )}
                    </div>

                    {result.status === 'success' && result.data && (
                      <TextArea
                        value={JSON.stringify(result.data, null, 2)}
                        readOnly
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        style={{ fontSize: '12px' }}
                      />
                    )}

                    {result.status === 'error' && result.error && (
                      <Alert
                        message="Error"
                        description={result.error}
                        type="error"
                      />
                    )}
                  </Space>
                </Card>
              ))}
            </Space>
          </div>
        )}
      </Space>
    </Card>
  );
};

export default AidisV2ApiTest;