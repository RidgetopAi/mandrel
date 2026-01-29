/**
 * Bug Workflow Panel Component
 *
 * Main orchestration component for the bug workflow.
 * Uses Ant Design Collapse for expandable sections.
 *
 * NOTE: SSE is managed by the workflowSSE singleton service.
 * This component just renders state from Zustand - no SSE lifecycle management.
 */

import React, { useCallback } from 'react';
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
import ActivityStream from './ActivityStream';
import { useBugWorkflowStore } from '../../stores/bugWorkflowStore';
import { workflowSSE } from '../../services/workflowSSE';
import { spindlesWS, useSpindlesStore } from '../../services/spindlesWS';
import {
  createBugWorkflow,
  getWorkflow,
  submitWorkflow,
  submitReview,
  triggerImplementation,
} from '../../api/bugWorkflowClient';
import type {
  BugReport,
  BugWorkflowState,
  ReviewDecision,
} from '../../types/workflow';

const { Text } = Typography;

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
    clearInvestigationEvents,
    updateWorkflowState,
    setSubmitting,
    setLoading,
    setError,
    clearError,
    setExpandedPanels,
    reset,
  } = useBugWorkflowStore();

  const state = activeWorkflow?.state;

  // Handle form submission
  const handleSubmit = useCallback(
    async (report: BugReport, projectPath: string) => {
      setSubmitting(true);
      clearError();
      clearInvestigationEvents();

      try {
        // Create the workflow
        const response = await createBugWorkflow({ bugReport: report, projectPath });
        const workflowId = response.workflowId;

        // Get the full workflow object
        const workflowResponse = await getWorkflow(workflowId);
        setActiveWorkflow(workflowResponse.workflow);
        setExpandedPanels(['investigation']);

        // Subscribe to SSE via singleton service (survives component lifecycle)
        console.log('[BugWorkflow] Subscribing to SSE via service...');
        workflowSSE.subscribe(workflowId);

        // Connect to spindles WebSocket for activity streaming
        spindlesWS.connect();
        useSpindlesStore.getState().clearActivities();

        // Update local state to 'analyzing'
        updateWorkflowState('analyzing');

        // Clear submitting now - SSE will track analysis progress
        setSubmitting(false);

        // Submit for analysis - fire-and-forget, SSE handles progress/completion
        console.log('[BugWorkflow] Triggering submitWorkflow (fire-and-forget)...');
        submitWorkflow(workflowId).catch((err) => {
          // SSE should handle errors, but catch here as fallback
          const currentState = useBugWorkflowStore.getState().activeWorkflow?.state;
          console.log('[BugWorkflow] submitWorkflow error, current state:', currentState, err);
          if (currentState !== 'failed' && currentState !== 'proposed' && currentState !== 'reviewing') {
            setError(err instanceof Error ? err.message : 'Analysis failed');
            updateWorkflowState('failed');
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create workflow');
        setSubmitting(false);
      }
    },
    [clearError, clearInvestigationEvents, setActiveWorkflow, setExpandedPanels, updateWorkflowState, setSubmitting, setError]
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
          // Re-subscribe for implementation phase
          workflowSSE.subscribe(activeWorkflow.id);

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
    [activeWorkflow, clearError, clearInvestigationEvents, setExpandedPanels, setError, setSubmitting, updateWorkflowState]
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
  }, [activeWorkflow?.id, clearError, setActiveWorkflow, setError, setLoading]);

  // Handle start new workflow (reset also cleans up SSE via store)
  const handleStartNew = useCallback(() => {
    spindlesWS.disconnect();
    reset();
  }, [reset]);

  // Handle stop workflow (resets UI, backend process will timeout)
  const handleStop = useCallback(() => {
    if (activeWorkflow?.id) {
      workflowSSE.unsubscribe(activeWorkflow.id);
      spindlesWS.disconnect();
    }
    reset();
  }, [activeWorkflow?.id, reset]);

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
          {state && (state === 'analyzing' || state === 'implementing') && (
            <Button size="small" danger onClick={handleStop}>
              Stop
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
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <ActivityStream maxHeight={300} />
                <InvestigationLog
                  events={investigationEvents}
                  isStreaming={state === 'analyzing' && isStreaming}
                />
              </Space>
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
