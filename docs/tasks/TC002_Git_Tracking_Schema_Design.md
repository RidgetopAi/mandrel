# TC002: Git Commit Tracking Database Schema Design

## Overview

This document describes the comprehensive database schema design for git commit tracking in AIDIS, integrating seamlessly with existing project, session, context, and decision tracking systems.

## Schema Design Philosophy

The git tracking schema follows AIDIS architectural patterns:
- **UUID primary keys** for all entities
- **Project-centric organization** with CASCADE foreign keys  
- **JSONB metadata** for extensibility
- **PostgreSQL-specific features** (arrays, GIN indexes, full-text search)
- **Automatic lifecycle management** with triggers
- **Performance-first indexing** strategy

## Entity Relationship Diagram

### Core Git Tracking Tables

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   git_commits   │    │  git_branches   │    │git_file_changes │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │id (UUID PK) │ │    │ │id (UUID PK) │ │    │ │id (UUID PK) │ │
│ │project_id   │─┼────┼─│project_id   │ │    │ │project_id   │ │
│ │commit_sha   │ │    │ │branch_name  │ │    │ │commit_id    │─┼─┐
│ │short_sha    │ │    │ │current_sha  │ │    │ │file_path    │ │ │
│ │message      │ │    │ │is_default   │ │    │ │change_type  │ │ │
│ │author_*     │ │    │ │branch_type  │ │    │ │lines_added  │ │ │
│ │committer_*  │ │    │ └─────────────┘ │    │ │lines_removed│ │ │
│ │branch_name  │ │    └─────────────────┘    │ └─────────────┘ │ │
│ │files_changed│ │                           └─────────────────┘ │
│ │insertions   │ │                                               │
│ │deletions    │ │                                               │
│ │commit_type  │ │    ┌─────────────────┐                       │
│ │tags[]       │ │    │commit_session   │                       │
│ │metadata     │ │    │     _links      │                       │
│ └─────────────┘ │    │                 │                       │
└─────────────────┘    │ ┌─────────────┐ │                       │
                       │ │id (UUID PK) │ │                       │
                       │ │project_id   │ │                       │
                       │ │commit_id    │─┼───────────────────────┘
                       │ │session_id   │─┼─┐
                       │ │link_type    │ │ │
                       │ │confidence   │ │ │
                       │ │context_ids[]│ │ │
                       │ └─────────────┘ │ │
                       └─────────────────┘ │
                                          │
```

### Integration with Existing AIDIS Tables

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    projects     │    │    sessions     │    │    contexts     │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │id (UUID PK) │◄┼────┼─│project_id   │ │    │ │id (UUID PK) │ │
│ │name         │ │    │ │agent_type   │ │    │ │project_id   │─┼──┐
│ │git_repo_url │ │    │ │started_at   │ │    │ │session_id   │◄┼──┼─┐
│ │root_dir     │ │    │ │+ active_branch  NEW │ │content      │ │  │ │
│ │metadata     │ │    │ │+ working_commit NEW │ │+ related_commit NEW│ │
│ └─────────────┘ │    │ │+ commits_count  NEW │ │tags[]       │ │  │ │
└─────────────────┘    │ └─────────────┘ │    │ └─────────────┘ │  │ │
                       └─────────────────┘    └─────────────────┘  │ │
                                                                   │ │
┌─────────────────┐    ┌─────────────────┐                        │ │
│technical_decisions   │ code_components │                        │ │
│                 │    │                 │                        │ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │                        │ │
│ │id (UUID PK) │ │    │ │id (UUID PK) │ │                        │ │
│ │project_id   │─┼──┐ │ │project_id   │ │                        │ │
│ │title        │ │  │ │ │file_path    │ │                        │ │
│ │rationale    │ │  │ │ │name         │ │                        │ │
│ │+ implementing_   │  │ │+ last_modified_  NEW                    │ │
│ │  commits[]  NEW  │  │ │  commit     NEW                        │ │
│ │+ impl_status NEW │  │ │+ creation_commit NEW                    │ │
│ └─────────────┘ │  │ │ └─────────────┘ │                        │ │
└─────────────────┘  │ └─────────────────┘                        │ │
                     │                                             │ │
                     └─────────────────────────────────────────────┘ │
                                                                     │
                       ┌─────────────────┐                          │
                       │commit_session   │                          │
                       │     _links      │                          │
                       │                 │                          │
                       │ ┌─────────────┐ │                          │
                       │ │commit_id    │ │                          │
                       │ │session_id   │◄┼──────────────────────────┘
                       │ │link_type    │ │
                       │ │confidence   │ │
                       │ └─────────────┘ │
                       └─────────────────┘
```

## Table Specifications

### 1. git_commits (Core commit tracking)

**Purpose**: Store comprehensive git commit metadata with AIDIS integration

**Key Features**:
- Full SHA-1 and abbreviated commit hashes
- Complete author/committer information with timestamps
- Change statistics (files, insertions, deletions)
- Automatic commit type classification
- Branch context and merge tracking
- Integration with AIDIS analysis workflow

**Unique Constraints**:
- `(project_id, commit_sha)` - One commit per project

**Business Rules**:
- SHA validation with regex patterns
- Email format validation
- Date consistency (committer_date >= author_date)
- Non-empty commit messages

### 2. git_branches (Branch lifecycle tracking)

**Purpose**: Track branch creation, activity, and relationships

**Key Features**:
- Branch type classification (main, feature, hotfix, etc.)
- Current commit tracking with statistics
- Upstream/downstream relationships
- Protection and default branch flags
- Session association for development tracking

**Unique Constraints**:
- `(project_id, branch_name)` - One branch per project

### 3. git_file_changes (File-level change tracking)

**Purpose**: Granular file change tracking per commit

**Key Features**:
- File path tracking with rename support
- Change type classification (added, modified, deleted, etc.)
- Line-level statistics
- Integration with code_components table
- Binary and generated file detection

**Performance**: Optimized for file history queries and impact analysis

### 4. commit_session_links (Session-commit correlation)

**Purpose**: Link AIDIS sessions to git commits with confidence scoring

**Key Features**:
- Multiple link types (contributed, reviewed, planned, etc.)
- Confidence scoring for ML-based correlation
- Time proximity and author matching
- Context and decision ID arrays for traceability

**Unique Constraints**:
- `(commit_id, session_id)` - One link per commit-session pair

## Schema Extensions to Existing Tables

### contexts table
- `related_commit_sha`: Link contexts to specific commits
- `commit_context_type`: Classify commit-related contexts

### sessions table  
- `active_branch`: Track which branch session is working on
- `working_commit_sha`: Current commit context
- `commits_contributed`: Count of commits made during session

### technical_decisions table
- `implementing_commits[]`: Array of commit SHAs implementing decision
- `implementation_status`: Track implementation progress

### code_components table
- `last_modified_commit`: Track when component last changed
- `creation_commit`: Track when component was created
- `modification_frequency`: Count how often component changes

## Indexing Strategy

### Primary Performance Indexes

1. **Project-based queries**: `(project_id, *)` composite indexes
2. **Temporal queries**: Date-based indexes with DESC ordering
3. **SHA lookups**: Both full and abbreviated SHA indexes
4. **Author tracking**: Author email with date ordering
5. **Branch queries**: Branch name and status indexes

### Advanced Indexes

1. **GIN Arrays**: For parent_shas, tags, context_ids arrays
2. **Full-text search**: Commit messages, branch descriptions
3. **Partial indexes**: Only on non-null values for optional columns
4. **Composite indexes**: Common query patterns optimized

### Query Optimization Examples

```sql
-- Recent commits by author (uses idx_git_commits_project_author)
SELECT * FROM git_commits 
WHERE project_id = ? AND author_email = ? 
ORDER BY author_date DESC LIMIT 10;

-- File change history (uses idx_git_file_changes_project_path)  
SELECT gc.*, gfc.* FROM git_commits gc
JOIN git_file_changes gfc ON gc.id = gfc.commit_id
WHERE gc.project_id = ? AND gfc.file_path = ?
ORDER BY gc.author_date DESC;

-- Session-commit correlation (uses multiple indexes)
SELECT gc.*, csl.* FROM git_commits gc
JOIN commit_session_links csl ON gc.id = csl.commit_id
WHERE csl.session_id = ? AND csl.confidence_score > 0.7;
```

## Data Validation and Constraints

### Automatic Validation (Triggers)

1. **SHA Format Validation**: Ensures 40-char hex format
2. **Short SHA Generation**: Auto-generates if not provided
3. **Commit Type Classification**: Pattern-based from message
4. **Merge Detection**: Based on parent_shas array length
5. **Branch Statistics**: Auto-updates commit counts and dates

### Business Rule Constraints

1. **Email Format**: Valid email regex for authors/committers
2. **Date Logic**: Committer date >= author date
3. **Non-empty Content**: Commit messages must have content
4. **SHA Consistency**: Short SHA must be prefix of full SHA
5. **Positive Counts**: Line counts and statistics >= 0

### Data Integrity Features

1. **Cascade Deletes**: Properly configured for data consistency
2. **Foreign Key Constraints**: Maintain referential integrity
3. **Check Constraints**: Validate enum values and ranges
4. **Unique Constraints**: Prevent duplicate entries

## Performance Characteristics

### Expected Query Patterns

1. **Recent Activity**: "Show recent commits for project" - O(log n)
2. **Author Analysis**: "Show all commits by author" - O(log n)
3. **File History**: "Show changes to specific file" - O(log n)
4. **Branch Activity**: "Show commits on branch" - O(log n)
5. **Session Correlation**: "Find commits related to session" - O(log n)

### Scalability Considerations

1. **Partitioning Ready**: Tables designed for future partitioning by project_id
2. **Index Efficiency**: Selective indexes minimize overhead
3. **JSONB Usage**: Flexible metadata without schema bloat
4. **Array Columns**: Efficient storage for related IDs

### Storage Estimates

- **git_commits**: ~2KB per commit (with metadata)
- **git_file_changes**: ~500B per file change
- **git_branches**: ~1KB per branch
- **commit_session_links**: ~300B per link

For a large project (100K commits, 1M file changes):
- Total storage: ~500MB for git tracking data
- Index overhead: ~200MB additional
- Query performance: Sub-second for all common patterns

## Integration Points with AIDIS

### Context Management
- Commits linked to relevant contexts via SHA references
- Pre/post commit context classification
- Session-based context correlation

### Decision Tracking
- Technical decisions linked to implementing commits
- Implementation status tracking
- Decision outcome validation through commit analysis

### Code Analysis
- Component modification tracking through commits
- Impact analysis for code changes
- Complexity evolution over time

### Session Analytics
- Development velocity per session
- Code contribution attribution
- Team collaboration patterns

## Migration Deployment Strategy

### Phase 1: Schema Creation
1. Run migration script on development environment
2. Validate table structure and constraints
3. Test trigger functions and validation rules

### Phase 2: Data Population
1. Implement git repository scanning tools
2. Populate historical commit data
3. Establish session-commit correlation algorithms

### Phase 3: Integration Testing
1. Validate foreign key relationships
2. Test query performance with realistic data volumes
3. Verify trigger behavior and automatic updates

### Phase 4: Production Deployment
1. Deploy during maintenance window
2. Monitor performance impact
3. Establish ongoing data synchronization

## Monitoring and Maintenance

### Key Metrics
- Table growth rates and storage utilization
- Query performance for common patterns
- Index usage and effectiveness
- Foreign key constraint violations

### Maintenance Tasks
- Regular VACUUM and ANALYZE operations
- Index maintenance and optimization
- Orphaned record cleanup
- Performance monitoring and tuning

## Future Extensions

### Planned Enhancements
1. **Git Tags and Releases**: Additional tables for release tracking
2. **Merge Request Integration**: Link to PR/MR systems
3. **Code Review Data**: Reviewer assignments and feedback
4. **CI/CD Integration**: Build and deployment correlation
5. **Security Scanning**: Vulnerability tracking per commit

### Scalability Roadmap
1. **Horizontal Partitioning**: By project_id or date ranges  
2. **Read Replicas**: For analytics and reporting workloads
3. **Archival Strategy**: Historical data management
4. **Caching Layer**: Frequently accessed commit metadata

---

**Document Version**: 1.0  
**Created**: 2025-09-10  
**Author**: AIDIS Team - TC002 Implementation  
**Status**: Ready for Review and Implementation