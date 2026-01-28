/**
 * Bug Workflow Panel Component
 *
 * Main orchestration component for the bug workflow.
 * Uses Ant Design Collapse for expandable sections.
 */

import React, { useEffect, useCallback } from 'react';
import {
  Collapse,
  Steps,
  Card,
  Typography,
  Space,
  Tag,
  Alert,
  Result,
  Button,
  Spin,
} from 'antd';
import {
  BugOutlined,
  SearchOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ExperimentOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import BugReportForm from './BugReportForm';
import InvestigationLog from './InvestigationLog';
import ReviewGate from './ReviewGate';
import { useBugWorkflowStore } from '../../stores/bugWorkflowStore';
import {
  createBugWorkflow,
  getWorkflow,
  submitWorkflow,
  submitReview,
  triggerImplementation,
  subscribeToWorkflowEvents,
} from '../../api/bugWorkflowClient';
import type {
  BugReport,
  BugWorkflowState,
  ReviewDecision,
} from '../../types/workflow';

const { Text, Title } = Typography;

// Map states to step indices for the Steps component
const stateToStepIndex: Record<BugWorkflowState, number> = {
  draft: 0,
  submitted: 0,
  analyzing: 1,
  proposed: 2,
  reviewing: 2,
  approved: 3,
  changes_requested: 1,
  rejected: 0,
  implementing: 3,
  verifying: 4,
  completed: 5,
  failed: -1,
};

const stateLabels: Record<BugWorkflowState, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  analyzing: 'Analyzing',
  proposed: 'Proposed',
  reviewing: 'Reviewing',
  approved: 'Approved',
  changes_requested: 'Changes Requested',
  rejected: 'Rejected',
  implementing: 'Implementing',
  verifying: 'Verifying',
  completed: 'Completed',
  failed: 'Failed',
};

const stateColors: Record<BugWorkflowState, string> = {
  draft: 'default',
  submitted: 'processing',
  analyzing: 'processing',
  proposed: 'warning',
  reviewing: 'warning',
  approved: 'success',
  changes_requested: 'warning',
  rejected: 'error',
  implementing: 'processing',
  verifying: 'processing',
  completed: 'success',
  failed: 'error',
};

const BugWorkflowPanel: React.FC = () => {
  const {
    activeWorkflow,
    investigationEvents,
    isSubmitting,
    isLoading,
    isStreaming,
    error,
    expandedPanels,
    setActiveWorkflow,
    addInvestigationEvent,
    clearInvestigationEvents,
    updateWorkflowState,
    setAnalysis,
    setImplementation,
    setSubmitting,
    setLoading,
    setStreaming,
    setError,
    clearError,
    setExpandedPanels,
    reset,
  } = useBugWorkflowStore();

  const state = activeWorkflow?.state;

  // Subscribe to SSE events when in analyzing/implementing states
  useEffect(() => {
    if (!activeWorkflow?.id) return;

    const shouldStream =
      state === 'analyzing' ||
      state === 'implementing' ||
      state === 'verifying';

    if (!shouldStream) {
      setStreaming(false);
      return;
    }

    setStreaming(true);

    const unsubscribe = subscribeToWorkflowEvents(activeWorkflow.id, {
      onInvestigation: (event) => {
        addInvestigationEvent(event);
      },
      onStateChange: (from, to) => {
        updateWorkflowState(to as BugWorkflowState);
      },
      onAnalysisComplete: (analysis) => {
        setAnalysis(analysis);
        updateWorkflowState('proposed');
      },
      onImplementationComplete: (result) => {
        setImplementation(result);
        updateWorkflowState(result.success ? 'completed' : 'failed');
      },
      onError: (message, stage) => {
        setError(`${stage}: ${message}`);
        updateWorkflowState('failed');
      },
      onConnectionError: () => {
        setStreaming(false);
        // Try to refetch the workflow state
        handleRefresh();
      },
      onOpen: () => {
        setStreaming(true);
      },
    });

    return () => {
      unsubscribe();
      setStreaming(false);
    };
  }, [activeWorkflow?.id, state]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (report: BugReport, projectPath: string) => {
      setSubmitting(true);
      clearError();
      clearInvestigationEvents();

      try {
        // Create the workflow
        const response = await createBugWorkflow({ bugReport: report, projectPath });

        // Get the full workflow object
        const workflowResponse = await getWorkflow(response.workflowId);
        setActiveWorkflow(workflowResponse.workflow);
        setExpandedPanels(['investigation']);

        // Submit for analysis (triggers AI processing)
        await submitWorkflow(response.workflowId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create workflow');
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  // Handle review decision
  const handleReviewDecision = useCallback(
    async (decision: ReviewDecision, feedback?: string) => {
      if (!activeWorkflow?.id) return;

      setSubmitting(true);
      clearError();

      try {
        const response = await submitReview(activeWorkflow.id, { decision, feedback });

        updateWorkflowState(response.newState);

        if (decision === 'approved' && activeWorkflow.analysis?.proposedFix) {
          // Trigger implementation
          await triggerImplementation(activeWorkflow.id, {
            approvedChanges: activeWorkflow.analysis.proposedFix.changes,
            runTests: true,
          });

          setExpandedPanels(['implementation']);
        } else if (decision === 'changes_requested') {
          // Go back to analyzing
          clearInvestigationEvents();
          setExpandedPanels(['investigation']);
        } else if (decision === 'rejected') {
          // Reset to draft
          setExpandedPanels(['bug-report']);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit review');
      } finally {
        setSubmitting(false);
      }
    },
    [activeWorkflow]
  );

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (!activeWorkflow?.id) return;

    setLoading(true);
    clearError();

    try {
      const response = await getWorkflow(activeWorkflow.id);
      setActiveWorkflow(response.workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh workflow');
    } finally {
      setLoading(false);
    }
  }, [activeWorkflow?.id]);

  // Handle start new workflow
  const handleStartNew = useCallback(() => {
    reset();
  }, []);

  // Determine which panels to show
  const showBugReport = !state || state === 'draft' || state === 'rejected';
  const showInvestigation =
    state === 'analyzing' ||
    state === 'proposed' ||
    state === 'reviewing' ||
    state === 'changes_requested' ||
    investigationEvents.length > 0;
  const showReview =
    (state === 'proposed' || state === 'reviewing') &&
    activeWorkflow?.analysis;
  const showImplementation =
    state === 'approved' ||
    state === 'implementing' ||
    state === 'verifying' ||
    state === 'completed';
  const showResults = state === 'completed' || state === 'failed';

  return (
    <Card
      title={
        <Space>
          <BugOutlined />
          <span>Bug Fix Workflow</span>
          {state && (
            <Tag color={stateColors[state]}>{stateLabels[state]}</Tag>
          )}
          {isStreaming && <Spin size="small" />}
        </Space>
      }
      extra={
        <Space>
          {activeWorkflow && (
            <Button
              icon={<ReloadOutlined spin={isLoading} />}
              onClick={handleRefresh}
              disabled={isLoading}
              size="small"
            >
              Refresh
            </Button>
          )}
          {state && (
            <Button size="small" onClick={handleStartNew}>
              Start New
            </Button>
          )}
        </Space>
      }
    >
      {/* Error Alert */}
      {error && (
        <Alert
          type="error"
          message="Error"
          description={error}
          showIcon
          closable
          onClose={clearError}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Progress Steps */}
      {state && (
        <Steps
          current={stateToStepIndex[state]}
          status={state === 'failed' ? 'error' : undefined}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: 'Submit', icon: <BugOutlined /> },
            { title: 'Analyze', icon: <SearchOutlined /> },
            { title: 'Review', icon: <FileSearchOutlined /> },
            { title: 'Implement', icon: <SyncOutlined /> },
            { title: 'Verify', icon: <ExperimentOutlined /> },
            { title: 'Complete', icon: <CheckCircleOutlined /> },
          ]}
        />
      )}

      {/* Collapsible Panels */}
      <Collapse
        activeKey={expandedPanels}
        onChange={(keys) => setExpandedPanels(keys as string[])}
        items={[
          // Bug Report Panel
          showBugReport && {
            key: 'bug-report',
            label: (
              <Space>
                <BugOutlined />
                <Text strong>Bug Report</Text>
              </Space>
            ),
            children: (
              <BugReportForm
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                initialValues={
                  activeWorkflow
                    ? {
                        ...activeWorkflow.bugReport,
                        projectPath: activeWorkflow.projectPath,
                      }
                    : undefined
                }
              />
            ),
          },

          // Investigation Panel
          showInvestigation && {
            key: 'investigation',
            label: (
              <Space>
                <SearchOutlined />
                <Text strong>Investigation</Text>
                {state === 'analyzing' && (
                  <LoadingOutlined style={{ color: '#1890ff' }} />
                )}
              </Space>
            ),
            children: (
              <InvestigationLog
                events={investigationEvents}
                isStreaming={state === 'analyzing' && isStreaming}
              />
            ),
          },

          // Review Panel
          showReview && {
            key: 'review',
            label: (
              <Space>
                <FileSearchOutlined />
                <Text strong>Review Proposed Fix</Text>
                <Tag color="warning">Action Required</Tag>
              </Space>
            ),
            children: activeWorkflow?.analysis && (
              <ReviewGate
                analysis={activeWorkflow.analysis}
                onDecision={handleReviewDecision}
                isSubmitting={isSubmitting}
              />
            ),
          },

          // Implementation Panel
          showImplementation && {
            key: 'implementation',
            label: (
              <Space>
                <SyncOutlined spin={state === 'implementing'} />
                <Text strong>Implementation</Text>
              </Space>
            ),
            children: (
              <div>
                {state === 'implementing' && (
                  <Space direction="vertical" align="center" style={{ width: '100%', padding: 24 }}>
                    <Spin size="large" />
                    <Text>Implementing approved changes...</Text>
                  </Space>
                )}
                {state === 'verifying' && (
                  <Space direction="vertical" align="center" style={{ width: '100%', padding: 24 }}>
                    <Spin size="large" />
                    <Text>Running verification tests...</Text>
                  </Space>
                )}
                {activeWorkflow?.implementation && (
                  <Result
                    status={activeWorkflow.implementation.success ? 'success' : 'error'}
                    title={
                      activeWorkflow.implementation.success
                        ? 'Implementation Successful'
                        : 'Implementation Failed'
                    }
                    subTitle={
                      activeWorkflow.implementation.success
                        ? `${activeWorkflow.implementation.changedFiles.length} file(s) modified`
                        : activeWorkflow.implementation.errors.join(', ')
                    }
                    extra={
                      activeWorkflow.implementation.testResults && (
                        <Space>
                          <Tag color="green">
                            {activeWorkflow.implementation.testResults.passed} passed
                          </Tag>
                          {activeWorkflow.implementation.testResults.failed > 0 && (
                            <Tag color="red">
                              {activeWorkflow.implementation.testResults.failed} failed
                            </Tag>
                          )}
                          {activeWorkflow.implementation.testResults.skipped > 0 && (
                            <Tag color="default">
                              {activeWorkflow.implementation.testResults.skipped} skipped
                            </Tag>
                          )}
                        </Space>
                      )
                    }
                  />
                )}
              </div>
            ),
          },

          // Results Panel
          showResults && {
            key: 'results',
            label: (
              <Space>
                {state === 'completed' ? (
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                )}
                <Text strong>Results</Text>
              </Space>
            ),
            children: (
              <Result
                status={state === 'completed' ? 'success' : 'error'}
                title={state === 'completed' ? 'Bug Fixed!' : 'Workflow Failed'}
                subTitle={
                  state === 'failed'
                    ? activeWorkflow?.failureReason || 'An error occurred during the workflow'
                    : 'The bug has been analyzed, reviewed, and fixed.'
                }
                extra={
                  <Button type="primary" onClick={handleStartNew}>
                    Start New Workflow
                  </Button>
                }
              />
            ),
          },
        ].filter(Boolean) as any}
      />
    </Card>
  );
};

export default BugWorkflowPanel;
