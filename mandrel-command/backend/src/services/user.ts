import { db as pool } from '../database/connection';
import { AuthService } from './auth';
import { User } from '../types/auth';

export interface UserUpdateData {
  username?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
}

export interface PasswordUpdateData {
  currentPassword: string;
  newPassword: string;
}

export class UserService {
  static async getAllUsers(): Promise<Omit<User, 'password_hash'>[]> {
    const result = await pool.query(`
      SELECT id, username, email, role, theme, is_active, created_at, updated_at, last_login
      FROM admin_users
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  static async getUserById(id: string): Promise<Omit<User, 'password_hash'> | null> {
    const result = await pool.query(`
      SELECT id, username, email, role, theme, is_active, created_at, updated_at, last_login
      FROM admin_users
      WHERE id = $1
    `, [id]);

    return result.rows[0] || null;
  }

  static async updateUser(id: string, updateData: UserUpdateData): Promise<Omit<User, 'password_hash'> | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.username !== undefined) {
      fields.push(`username = $${paramIndex}`);
      values.push(updateData.username);
      paramIndex++;
    }

    if (updateData.email !== undefined) {
      fields.push(`email = $${paramIndex}`);
      values.push(updateData.email);
      paramIndex++;
    }

    if (updateData.role !== undefined) {
      fields.push(`role = $${paramIndex}`);
      values.push(updateData.role);
      paramIndex++;
    }

    if (updateData.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(updateData.is_active);
      paramIndex++;
    }

    if (fields.length === 0) {
      return null;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE admin_users
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, email, role, theme, is_active, created_at, updated_at, last_login
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  static async updatePassword(userId: string, passwordData: PasswordUpdateData): Promise<boolean> {
    // Get current user with password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return false;
    }

    const currentHash = userResult.rows[0].password_hash;

    // Verify current password
    const isValidCurrentPassword = await AuthService.verifyPassword(
      passwordData.currentPassword, 
      currentHash
    );

    if (!isValidCurrentPassword) {
      return false;
    }

    // Hash new password
    const newHash = await AuthService.hashPassword(passwordData.newPassword);

    // Update password
    await pool.query(
      'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, userId]
    );

    // Invalidate all existing sessions for this user (force re-login)
    await AuthService.invalidateAllUserSessions(userId);

    return true;
  }

  static async deleteUser(id: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM admin_users WHERE id = $1',
      [id]
    );
    
    return (result.rowCount ?? 0) > 0;
  }

  static async deactivateUser(id: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE admin_users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    if ((result.rowCount ?? 0) > 0) {
      // Invalidate all sessions for deactivated user
      await AuthService.invalidateAllUserSessions(id);
      return true;
    }

    return false;
  }

  static async activateUser(id: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE admin_users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    
    return (result.rowCount ?? 0) > 0;
  }

  static async getUserSessions(userId: string): Promise<any[]> {
    const result = await pool.query(`
      SELECT id, token_id, created_at, expires_at, is_active
      FROM user_sessions 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId]);
    
    return result.rows;
  }

  static async getActiveSessionsCount(userId: string): Promise<number> {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM user_sessions 
      WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
    `, [userId]);
    
    return parseInt(result.rows[0].count);
  }

  static async validatePasswordStrength(password: string): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
