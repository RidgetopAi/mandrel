import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { ContextService } from '../services/context';
import { TaskService } from '../services/task';
import { ProjectService } from '../services/project';

export interface DashboardStats {
  contexts: number;
  activeTasks: number;
  totalTasks: number;
  projects: number;
  agents: number; // TODO: Implement when agent service ready
  recentActivity: {
    contextsThisWeek: number;
    tasksCompletedThisWeek: number;
  };
}

class DashboardController {
  /**
   * GET /dashboard/stats - Get aggregated dashboard statistics
   * Oracle Phase 2: Real database counts using dedicated count methods
   */
  static async getDashboardStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const projectId = req.projectId;
      
      console.log('🚀 Oracle Phase 2 Dashboard - Starting aggregation for project:', projectId);

      // Oracle Phase 2: Use dedicated count methods for maximum efficiency
      const [
        contextCount,
        activeTaskCount, 
        taskStats,
        projectStats
      ] = await Promise.all([
        ContextService.count(),                   // Total count (no project filter)
        TaskService.countActive(projectId),       // Active tasks count
        TaskService.getTaskStats(projectId),      // For completed tasks
        ProjectService.getProjectStats()          // Project statistics
      ]);

      // Build Oracle's dashboard stats response structure
      const dashboardStats: DashboardStats = {
        contexts: contextCount,                    // Real count from ContextService.count()
        activeTasks: activeTaskCount,              // Real count from TaskService.countActive()
        totalTasks: taskStats.total,
        projects: projectStats.total_projects,
        agents: 0, // TODO: Implement when agent service ready
        recentActivity: {
          contextsThisWeek: projectStats.recent_activity.contexts_last_week,
          tasksCompletedThisWeek: taskStats.by_status.completed || 0
        }
      };

      console.log('📊 Oracle Phase 2 Dashboard - Final aggregation:', {
        projectId: projectId || 'ALL',
        contextCount,
        activeTaskCount,
        totalTasks: taskStats.total,
        projectCount: projectStats.total_projects,
        recentContexts: projectStats.recent_activity.contexts_last_week
      });

      res.json({
        success: true,
        data: dashboardStats
      });

    } catch (error) {
      console.error('❌ Oracle Phase 2 Dashboard aggregation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard statistics',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default DashboardController;
