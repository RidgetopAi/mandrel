/**
 * Review Gate Component
 *
 * Enforced human review UI with diff viewer.
 * Users must approve, request changes, or reject before proceeding.
 */

import React, { useState } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Input,
  Alert,
  Collapse,
  Tag,
  Divider,
  Tooltip,
  Badge,
} from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  FileOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type {
  BugAnalysis,
  CodeChange,
  ReviewDecision,
  Confidence,
} from '../../types/workflow';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

interface ReviewGateProps {
  analysis: BugAnalysis;
  onDecision: (decision: ReviewDecision, feedback?: string) => void;
  isSubmitting?: boolean;
}

// Confidence badge colors
const confidenceColors: Record<Confidence, string> = {
  high: 'green',
  medium: 'orange',
  low: 'red',
};

// Simple diff viewer using pre-formatted text
const DiffViewer: React.FC<{ change: CodeChange }> = ({ change }) => {
  const originalLines = change.original.split('\n');
  const proposedLines = change.proposed.split('\n');

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary">Original:</Text>
        <pre
          style={{
            background: '#fff1f0',
            padding: 12,
            borderRadius: 4,
            margin: '4px 0 12px',
            overflow: 'auto',
            maxHeight: 200,
            border: '1px solid #ffccc7',
          }}
        >
          {originalLines.map((line, i) => (
            <div key={i} style={{ color: '#cf1322' }}>
              - {line}
            </div>
          ))}
        </pre>
      </div>
      <div>
        <Text type="secondary">Proposed:</Text>
        <pre
          style={{
            background: '#f6ffed',
            padding: 12,
            borderRadius: 4,
            margin: '4px 0',
            overflow: 'auto',
            maxHeight: 200,
            border: '1px solid #b7eb8f',
          }}
        >
          {proposedLines.map((line, i) => (
            <div key={i} style={{ color: '#389e0d' }}>
              + {line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};

const ReviewGate: React.FC<ReviewGateProps> = ({
  analysis,
  onDecision,
  isSubmitting = false,
}) => {
  const [selectedDecision, setSelectedDecision] = useState<ReviewDecision | null>(null);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const handleDecisionClick = (decision: ReviewDecision) => {
    if (decision === 'approved') {
      // Approve doesn't require feedback
      onDecision(decision);
    } else {
      // Request changes and reject require feedback
      setSelectedDecision(decision);
      setShowFeedback(true);
    }
  };

  const handleSubmitWithFeedback = () => {
    if (!selectedDecision) return;

    if (!feedback.trim() && selectedDecision !== 'approved') {
      // Feedback required for non-approval
      return;
    }

    onDecision(selectedDecision, feedback.trim() || undefined);
  };

  const handleCancel = () => {
    setSelectedDecision(null);
    setShowFeedback(false);
    setFeedback('');
  };

  const proposedFix = analysis.proposedFix;

  return (
    <Card
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          <span>Review Required</span>
        </Space>
      }
      extra={
        <Badge
          status={
            analysis.confidence === 'high'
              ? 'success'
              : analysis.confidence === 'medium'
              ? 'warning'
              : 'error'
          }
          text={
            <Text type="secondary">
              {analysis.confidence} confidence
            </Text>
          }
        />
      }
    >
      {/* Root Cause Analysis */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5}>Root Cause</Title>
        <Paragraph>{analysis.rootCause}</Paragraph>

        <Title level={5}>Evidence</Title>
        <Paragraph type="secondary">{analysis.evidence}</Paragraph>

        {analysis.questions && analysis.questions.length > 0 && (
          <>
            <Title level={5}>
              <QuestionCircleOutlined /> Open Questions
            </Title>
            <ul>
              {analysis.questions.map((q, i) => (
                <li key={i}>
                  <Text type="secondary">{q}</Text>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Proposed Fix */}
      {proposedFix && (
        <>
          <Divider />
          <div style={{ marginBottom: 24 }}>
            <Title level={5}>Proposed Fix</Title>
            <Paragraph>{proposedFix.explanation}</Paragraph>

            {/* Risks */}
            {proposedFix.risks.length > 0 && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message="Potential Risks"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {proposedFix.risks.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                }
                style={{ marginBottom: 16 }}
              />
            )}

            {/* Test Needs */}
            {proposedFix.testNeeds.length > 0 && (
              <Alert
                type="info"
                showIcon
                message="Testing Requirements"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {proposedFix.testNeeds.map((need, i) => (
                      <li key={i}>{need}</li>
                    ))}
                  </ul>
                }
                style={{ marginBottom: 16 }}
              />
            )}

            {/* Code Changes */}
            <Title level={5}>
              Code Changes ({proposedFix.changes.length} file
              {proposedFix.changes.length !== 1 ? 's' : ''})
            </Title>

            <Collapse
              items={proposedFix.changes.map((change, index) => ({
                key: index.toString(),
                label: (
                  <Space>
                    <FileOutlined />
                    <Text code>{change.file}</Text>
                  </Space>
                ),
                children: (
                  <div>
                    {change.explanation && (
                      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                        {change.explanation}
                      </Paragraph>
                    )}
                    <DiffViewer change={change} />
                  </div>
                ),
              }))}
              defaultActiveKey={['0']}
            />
          </div>
        </>
      )}

      <Divider />

      {/* Decision Buttons */}
      {!showFeedback ? (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message="Your decision is required before implementation can proceed"
            style={{ marginBottom: 8 }}
          />

          <Space size="middle" style={{ width: '100%', justifyContent: 'center' }}>
            <Tooltip title="Approve the proposed fix and proceed with implementation">
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                size="large"
                onClick={() => handleDecisionClick('approved')}
                loading={isSubmitting}
                disabled={!proposedFix}
                style={{ minWidth: 140 }}
              >
                Approve
              </Button>
            </Tooltip>

            <Tooltip title="Request modifications to the proposed fix">
              <Button
                icon={<EditOutlined />}
                size="large"
                onClick={() => handleDecisionClick('changes_requested')}
                disabled={isSubmitting}
                style={{ minWidth: 140 }}
              >
                Request Changes
              </Button>
            </Tooltip>

            <Tooltip title="Reject the fix entirely and start over">
              <Button
                danger
                icon={<CloseCircleOutlined />}
                size="large"
                onClick={() => handleDecisionClick('rejected')}
                disabled={isSubmitting}
                style={{ minWidth: 140 }}
              >
                Reject
              </Button>
            </Tooltip>
          </Space>
        </Space>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type={selectedDecision === 'rejected' ? 'error' : 'warning'}
            showIcon
            message={
              selectedDecision === 'rejected'
                ? 'Rejecting the proposed fix'
                : 'Requesting changes to the proposed fix'
            }
          />

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Please provide feedback{' '}
              <Text type="danger">*</Text>
            </Text>
            <TextArea
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={
                selectedDecision === 'rejected'
                  ? 'Explain why this fix should be rejected...'
                  : 'Describe what changes you would like to see...'
              }
              status={!feedback.trim() ? 'error' : undefined}
            />
            {!feedback.trim() && (
              <Text type="danger" style={{ fontSize: 12 }}>
                Feedback is required for this decision
              </Text>
            )}
          </div>

          <Space>
            <Button
              type="primary"
              onClick={handleSubmitWithFeedback}
              loading={isSubmitting}
              disabled={!feedback.trim()}
            >
              Submit Decision
            </Button>
            <Button onClick={handleCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          </Space>
        </Space>
      )}
    </Card>
  );
};

export default ReviewGate;
