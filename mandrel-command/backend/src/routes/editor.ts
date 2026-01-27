/**
 * Editor Integration Routes
 * Open files in nvim via socket
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);
const router = Router();

/**
 * POST /api/v1/editor/open-file
 * Open a file in nvim via socket
 */
router.post('/open-file', async (req, res) => {
  try {
    const { projectPath, filePath, line } = req.body as {
      projectPath?: string;
      filePath: string;
      line?: number;
    };

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    // Build absolute path
    const absolutePath = projectPath
      ? path.join(projectPath, filePath)
      : filePath;

    // Validate file exists
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: `File not found: ${absolutePath}` });
    }

    // Get nvim socket path from env or use default
    const nvimSocket = process.env.NVIM_SOCKET || '/tmp/nvimsocket';

    // Check if socket exists
    if (!fs.existsSync(nvimSocket)) {
      return res.status(400).json({
        error: `Nvim socket not found at ${nvimSocket}. Start nvim with: nvim --listen ${nvimSocket}`,
      });
    }

    // Use :edit command which works more reliably than --remote
    const lineCmd = line ? `:${line}` : '';
    await execFileAsync('nvim', [
      '--server', nvimSocket,
      '--remote-send', `<Esc>:edit ${absolutePath}<CR>${lineCmd}<CR>`,
    ]);

    return res.json({ success: true, file: absolutePath });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('Failed to open file in editor:', error);
    return res.status(500).json({ error: `Failed to open file: ${error}` });
  }
});

export default router;
