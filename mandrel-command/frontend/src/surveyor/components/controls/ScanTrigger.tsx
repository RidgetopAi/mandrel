/**
 * ScanTrigger — run a Surveyor scan of a server-side path (Surveyor P4c-frontend).
 *
 * Opens a modal to enter an absolute server path, POSTs it to /scan (which is
 * synchronous + slow — the backend calls the analyzer then persists), shows a
 * loading state for the duration, and on success reports the totals and asks the
 * page to refetch the graph/findings. Backend failures (service down / bad path /
 * timeout) surface their actionable message.
 */

import { useState } from 'react';
import { Modal, Input, Button, Form, message, Typography } from 'antd';
import { ScanOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { surveyorClient, type ScanSummaryDto } from '../../api/surveyorClient';

const { Text } = Typography;

interface ScanTriggerProps {
  projectId: string | null;
  /** Called after a successful scan so the page can refetch graph + findings. */
  onScanned: () => void;
}

/** Pull the actionable message out of an axios-style error from the scan POST. */
function scanErrorMessage(err: unknown): string {
  const anyErr = err as { response?: { data?: { error?: string } }; message?: string };
  return anyErr?.response?.data?.error || anyErr?.message || 'Scan failed.';
}

export function ScanTrigger({ projectId, onScanned }: ScanTriggerProps) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');

  const mutation = useMutation<ScanSummaryDto, unknown, { projectId: string; path: string }>({
    mutationFn: ({ projectId: pid, path: p }) => surveyorClient.scan(pid, p),
    onSuccess: (scan) => {
      const t = scan.totals;
      message.success(
        `Scan complete: ${t.files} files, ${t.functions} functions, ${t.warnings} findings.`,
      );
      setOpen(false);
      setPath('');
      onScanned();
    },
    onError: (err) => {
      message.error(scanErrorMessage(err));
    },
  });

  const trimmed = path.trim();
  const canSubmit = !!projectId && trimmed.length > 0 && !mutation.isPending;

  const submit = () => {
    if (!projectId || trimmed.length === 0) return;
    mutation.mutate({ projectId, path: trimmed });
  };

  return (
    <>
      <Button
        icon={<ScanOutlined />}
        onClick={() => setOpen(true)}
        disabled={!projectId}
      >
        Run scan
      </Button>

      <Modal
        title="Run a Surveyor scan"
        open={open}
        onCancel={() => (mutation.isPending ? undefined : setOpen(false))}
        confirmLoading={mutation.isPending}
        okText="Scan"
        okButtonProps={{ disabled: !canSubmit }}
        cancelButtonProps={{ disabled: mutation.isPending }}
        onOk={submit}
        maskClosable={!mutation.isPending}
        keyboard={!mutation.isPending}
      >
        <Form layout="vertical">
          <Form.Item
            label="Server-side path to scan"
            help="Absolute path on the server (the scan reads it on the host running Surveyor)."
          >
            <Input
              placeholder="/home/ridgetop/projects/my-repo"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onPressEnter={() => canSubmit && submit()}
              disabled={mutation.isPending}
              autoFocus
            />
          </Form.Item>
          {mutation.isPending && (
            <Text type="secondary">Scanning… this can take a while for a large codebase.</Text>
          )}
        </Form>
      </Modal>
    </>
  );
}
