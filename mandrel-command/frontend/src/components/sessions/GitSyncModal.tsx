import React, { useState, useMemo } from 'react';
import { Button, Modal, Typography, Space, message, Input, Alert, Tooltip } from 'antd';
import { CloudSyncOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';

const { Text, Paragraph, Title } = Typography;
const { TextArea } = Input;

interface GitSyncModalProps {
  sessionId: string;
  projectId: string;
}

const GitSyncModal: React.FC<GitSyncModalProps> = ({ sessionId, projectId }) => {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Backend URL - use window location origin for production
  const backendUrl = useMemo(() => {
    const hostname = window.location.hostname;
    // If running locally, use localhost:5000 (backend port), otherwise use current origin (nginx proxy)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    // Production: use origin without port - nginx proxies /api to backend
    return window.location.origin;
  }, []);

  // Git commands to collect data locally
  const gitCommands = `# Run these commands in your local git repository
# Collect last N commits (adjust number as needed)
git log -10 --pretty=format:'{"sha":"%H","message":"%s","author_name":"%an","author_email":"%ae","author_date":"%aI","branch":"'$(git branch --show-current)'"}' --numstat`;

  // Curl command for the API
  const curlCommand = `curl -X POST '${backendUrl}/api/git/push-stats' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -d '{
    "session_id": "${sessionId}",
    "project_id": "${projectId}",
    "commits": [
      {
        "sha": "COMMIT_SHA_HERE",
        "message": "commit message",
        "author_name": "Your Name",
        "author_email": "you@example.com",
        "author_date": "2025-01-01T00:00:00Z",
        "branch": "main",
        "files": [
          {"path": "src/file.ts", "change_type": "modified", "lines_added": 10, "lines_removed": 5}
        ]
      }
    ]
  }'`;

  // Simpler script that collects and sends
  const fullScript = `#!/bin/bash
# Git Sync Script for Mandrel
# Run this in your local git repository

SESSION_ID="${sessionId}"
PROJECT_ID="${projectId}"
API_URL="${backendUrl}/api/git/push-stats"
AUTH_TOKEN="YOUR_TOKEN"  # Get from mandrel-command login

# Collect last 10 commits with file stats
commits_json='['
first=true

for sha in $(git log -10 --format='%H'); do
  # Get commit metadata
  author_name=$(git log -1 --format='%an' $sha)
  author_email=$(git log -1 --format='%ae' $sha)
  author_date=$(git log -1 --format='%aI' $sha)
  message=$(git log -1 --format='%s' $sha | sed 's/"/\\\\"/g')
  branch=$(git branch --show-current)
  
  # Get file changes
  files_json='['
  files_first=true
  while IFS=$'\\t' read -r added removed filepath; do
    [ -z "$filepath" ] && continue
    [ "$files_first" = true ] && files_first=false || files_json+=','
    change_type="modified"
    [ "$added" = "-" ] && change_type="deleted" && added=0
    [ "$removed" = "-" ] && removed=0
    files_json+='{"path":"'"$filepath"'","change_type":"'"$change_type"'","lines_added":'"$added"',"lines_removed":'"$removed"'}'
  done < <(git show --numstat --format='' $sha)
  files_json+=']'
  
  [ "$first" = true ] && first=false || commits_json+=','
  commits_json+='{"sha":"'"$sha"'","message":"'"$message"'","author_name":"'"$author_name"'","author_email":"'"$author_email"'","author_date":"'"$author_date"'","branch":"'"$branch"'","files":'"$files_json"'}'
done

commits_json+=']'

# Send to API
curl -X POST "$API_URL" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  -d '{"session_id":"'"$SESSION_ID"'","project_id":"'"$PROJECT_ID"'","commits":'"$commits_json"'}'

echo ""
echo "Git sync complete!"`;

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      message.success('Copied to clipboard!');
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      message.error('Failed to copy');
    }
  };

  return (
    <>
      <Tooltip title="Sync Git commits from your local repository">
        <Button
          icon={<CloudSyncOutlined />}
          onClick={() => setVisible(true)}
        >
          Sync Git
        </Button>
      </Tooltip>

      <Modal
        title={
          <Space>
            <CloudSyncOutlined />
            <span>Sync Git Commits</span>
          </Space>
        }
        open={visible}
        onCancel={() => setVisible(false)}
        footer={[
          <Button key="close" onClick={() => setVisible(false)}>
            Close
          </Button>
        ]}
        width={800}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            message="Push Git Data to Mandrel"
            description="Since Mandrel runs on a remote server, it cannot directly access your local git repository. Use this script to collect git data locally and push it to Mandrel."
            type="info"
            showIcon
          />

          <div>
            <Title level={5}>Session Info</Title>
            <Paragraph>
              <Text strong>Session ID:</Text> <Text code>{sessionId}</Text><br />
              <Text strong>Project ID:</Text> <Text code>{projectId}</Text>
            </Paragraph>
          </div>

          <div>
            <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
              <Title level={5} style={{ margin: 0 }}>Full Sync Script (Recommended)</Title>
              <Button
                icon={copied === 'script' ? <CheckOutlined /> : <CopyOutlined />}
                size="small"
                onClick={() => handleCopy(fullScript, 'script')}
              >
                {copied === 'script' ? 'Copied!' : 'Copy Script'}
              </Button>
            </Space>
            <TextArea
              value={fullScript}
              readOnly
              rows={12}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Save this as sync-git.sh, make it executable (chmod +x sync-git.sh), and run it in your git repository.
            </Text>
          </div>

          <div>
            <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
              <Title level={5} style={{ margin: 0 }}>Or Prompt Your Agent</Title>
            </Space>
            <Alert
              message='Say: "Sync git stats for this session" and provide the session/project IDs above.'
              type="success"
              showIcon
            />
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default GitSyncModal;
