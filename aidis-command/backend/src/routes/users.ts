import { Router, Response } from 'express';
import { UserService } from '../services/user';
import { authenticateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { db as pool } from '../database/connection';

const router = Router();

/**
 * PUT /api/users/profile
 * Update current user's profile (username and/or email)
 */
router.put('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
      return;
    }

    const { username, email } = req.body;

    // Validate input
    if (!username && !email) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'At least one field (username or email) must be provided'
      });
      return;
    }

    // Check if username already exists (if updating username)
    if (username) {
      const existingUser = await pool.query(
        'SELECT id FROM admin_users WHERE username = $1 AND id != $2',
        [username, userId]
      );

      if (existingUser.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: 'Username already taken'
        });
        return;
      }
    }

    // Check if email already exists (if updating email)
    if (email) {
      const existingEmail = await pool.query(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (existingEmail.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: 'Email already in use'
        });
        return;
      }
    }

    // Update user
    const updatedUser = await UserService.updateUser(userId, { username, email });

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update profile'
    });
  }
});

/**
 * POST /api/users/change-password
 * Change current user's password
 */
router.post('/change-password', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Both currentPassword and newPassword are required'
      });
      return;
    }

    // Validate new password strength
    const passwordValidation = await UserService.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
      return;
    }

    // Update password
    const success = await UserService.updatePassword(userId, {
      currentPassword,
      newPassword
    });

    if (!success) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Current password is incorrect'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to change password'
    });
  }
});

/**
 * PATCH /api/users/preferences
 * Update user preferences (theme)
 */
router.patch('/preferences', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
      return;
    }

    const { theme } = req.body;

    // Validate theme value
    if (theme && !['light', 'dark'].includes(theme)) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid theme value. Must be "light" or "dark"'
      });
      return;
    }

    // Update theme preference
    const result = await pool.query(
      'UPDATE admin_users SET theme = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, email, role, theme, is_active, created_at, updated_at, last_login',
      [theme, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: { user: result.rows[0] }
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update preferences'
    });
  }
});

/**
 * POST /api/users/revoke-sessions
 * Revoke all active sessions for current user
 */
router.post('/revoke-sessions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
      return;
    }

    // Invalidate all sessions for this user
    await pool.query(
      'UPDATE user_sessions SET is_active = false WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    res.json({
      success: true,
      message: 'All sessions revoked successfully. Please log in again.'
    });
  } catch (error) {
    console.error('Error revoking sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to revoke sessions'
    });
  }
});

export default router;
