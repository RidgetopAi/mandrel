--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (Debian 16.9-1.pgdg120+1)
-- Dumped by pg_dump version 16.9 (Debian 16.9-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: update_tasks_updated_at(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_tasks_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_tasks_updated_at() OWNER TO ridgetop;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO ridgetop;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _aidis_migrations; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public._aidis_migrations (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    migration_number integer NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    checksum character varying(64)
);


ALTER TABLE public._aidis_migrations OWNER TO ridgetop;

--
-- Name: _aidis_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: ridgetop
--

CREATE SEQUENCE public._aidis_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public._aidis_migrations_id_seq OWNER TO ridgetop;

--
-- Name: _aidis_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ridgetop
--

ALTER SEQUENCE public._aidis_migrations_id_seq OWNED BY public._aidis_migrations.id;


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone
);


ALTER TABLE public.admin_users OWNER TO ridgetop;

--
-- Name: agent_collaborations; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_collaborations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    agents uuid[] NOT NULL,
    type character varying(100) DEFAULT 'general'::character varying NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    result text,
    contexts uuid[] DEFAULT '{}'::uuid[],
    tasks uuid[] DEFAULT '{}'::uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.agent_collaborations OWNER TO ridgetop;

--
-- Name: agent_messages; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    from_agent_id uuid NOT NULL,
    to_agent_id uuid,
    message_type character varying(100) DEFAULT 'info'::character varying NOT NULL,
    title character varying(500),
    content text NOT NULL,
    context_refs uuid[] DEFAULT '{}'::uuid[],
    task_refs uuid[] DEFAULT '{}'::uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.agent_messages OWNER TO ridgetop;

--
-- Name: agent_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    session_id character varying(255) NOT NULL,
    project_id uuid NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_activity timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.agent_sessions OWNER TO ridgetop;

--
-- Name: agent_tasks; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    assigned_to uuid,
    created_by uuid,
    title character varying(500) NOT NULL,
    description text,
    type character varying(100) DEFAULT 'general'::character varying NOT NULL,
    status character varying(50) DEFAULT 'todo'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    dependencies uuid[] DEFAULT '{}'::uuid[],
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    progress integer DEFAULT 0,
    CONSTRAINT agent_tasks_progress_check CHECK (((progress >= 0) AND (progress <= 100)))
);


ALTER TABLE public.agent_tasks OWNER TO ridgetop;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(100) DEFAULT 'ai_assistant'::character varying NOT NULL,
    capabilities text[] DEFAULT '{}'::text[],
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.agents OWNER TO ridgetop;

--
-- Name: code_analysis_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_analysis_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    analyzer_agent_id uuid,
    session_type character varying(100) DEFAULT 'full'::character varying NOT NULL,
    files_analyzed text[] DEFAULT '{}'::text[],
    components_found integer DEFAULT 0,
    dependencies_found integer DEFAULT 0,
    analysis_duration_ms integer,
    status character varying(50) DEFAULT 'completed'::character varying NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone
);


ALTER TABLE public.code_analysis_sessions OWNER TO ridgetop;

--
-- Name: code_components; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    component_type character varying(100) NOT NULL,
    name character varying(500) NOT NULL,
    signature text,
    start_line integer,
    end_line integer,
    complexity_score integer DEFAULT 0,
    lines_of_code integer DEFAULT 0,
    documentation text,
    is_exported boolean DEFAULT false,
    is_deprecated boolean DEFAULT false,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    analyzed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.code_components OWNER TO ridgetop;

--
-- Name: code_dependencies; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    from_component_id uuid NOT NULL,
    to_component_id uuid,
    dependency_type character varying(100) NOT NULL,
    import_path text,
    import_alias character varying(255),
    is_external boolean DEFAULT false,
    confidence_score double precision DEFAULT 1.0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.code_dependencies OWNER TO ridgetop;

--
-- Name: code_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text,
    component_id uuid,
    metric_type character varying(100) NOT NULL,
    metric_name character varying(255) NOT NULL,
    metric_value double precision NOT NULL,
    threshold_min double precision,
    threshold_max double precision,
    status character varying(50) DEFAULT 'ok'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    measured_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.code_metrics OWNER TO ridgetop;

--
-- Name: contexts; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    session_id uuid,
    context_type character varying(50) NOT NULL,
    content text NOT NULL,
    embedding public.vector(384),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    relevance_score double precision DEFAULT 1.0,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT content_not_empty CHECK ((length(TRIM(BOTH FROM content)) > 0)),
    CONSTRAINT contexts_context_type_check CHECK (((context_type)::text = ANY ((ARRAY['code'::character varying, 'decision'::character varying, 'error'::character varying, 'discussion'::character varying, 'planning'::character varying, 'completion'::character varying])::text[]))),
    CONSTRAINT contexts_relevance_score_check CHECK (((relevance_score >= (0)::double precision) AND (relevance_score <= (10)::double precision)))
);


ALTER TABLE public.contexts OWNER TO ridgetop;

--
-- Name: file_analysis_cache; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.file_analysis_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    file_hash character varying(64) NOT NULL,
    language character varying(50),
    analysis_result jsonb NOT NULL,
    components_count integer DEFAULT 0,
    dependencies_count integer DEFAULT 0,
    complexity_total integer DEFAULT 0,
    lines_of_code integer DEFAULT 0,
    last_modified timestamp with time zone,
    analyzed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.file_analysis_cache OWNER TO ridgetop;

--
-- Name: naming_registry; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.naming_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    entity_type character varying(50) NOT NULL,
    canonical_name character varying(255) NOT NULL,
    aliases text[] DEFAULT '{}'::text[],
    description text,
    naming_convention jsonb DEFAULT '{}'::jsonb,
    first_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    usage_count integer DEFAULT 1,
    deprecated boolean DEFAULT false,
    deprecated_reason text,
    replacement_id uuid,
    context_tags text[] DEFAULT '{}'::text[],
    related_entities uuid[] DEFAULT '{}'::uuid[],
    CONSTRAINT naming_registry_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['variable'::character varying, 'function'::character varying, 'class'::character varying, 'interface'::character varying, 'type'::character varying, 'component'::character varying, 'file'::character varying, 'directory'::character varying, 'module'::character varying, 'service'::character varying, 'endpoint'::character varying, 'database_table'::character varying, 'database_column'::character varying, 'config_key'::character varying, 'environment_var'::character varying, 'css_class'::character varying, 'html_id'::character varying])::text[])))
);


ALTER TABLE public.naming_registry OWNER TO ridgetop;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'active'::character varying,
    git_repo_url text,
    root_directory text,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT projects_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying, 'completed'::character varying, 'paused'::character varying])::text[])))
);


ALTER TABLE public.projects OWNER TO ridgetop;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    agent_type character varying(50) NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp with time zone,
    context_summary text,
    tokens_used integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT reasonable_session_duration CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);


ALTER TABLE public.sessions OWNER TO ridgetop;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    type character varying(100) DEFAULT 'general'::character varying NOT NULL,
    status character varying(50) DEFAULT 'todo'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    assigned_to uuid,
    dependencies uuid[] DEFAULT '{}'::uuid[],
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tasks OWNER TO ridgetop;

--
-- Name: TABLE tasks; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.tasks IS 'Task management system for AI development coordination';


--
-- Name: COLUMN tasks.status; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.status IS 'Task status: todo (not started), in_progress (actively worked on), blocked (waiting on dependency), completed (finished), cancelled (abandoned)';


--
-- Name: COLUMN tasks.priority; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.priority IS 'Task priority: low (nice to have), medium (normal), high (important), urgent (critical/blocking)';


--
-- Name: COLUMN tasks.dependencies; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.dependencies IS 'Array of task UUIDs that must be completed before this task';


--
-- Name: COLUMN tasks.metadata; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.metadata IS 'Flexible JSON storage for additional task data like estimated time, labels, etc.';


--
-- Name: technical_decisions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.technical_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    session_id uuid,
    decision_type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    rationale text NOT NULL,
    problem_statement text,
    success_criteria text,
    alternatives_considered jsonb DEFAULT '[]'::jsonb,
    decision_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    decided_by text,
    stakeholders text[],
    status character varying(50) DEFAULT 'active'::character varying,
    superseded_by uuid,
    superseded_date timestamp with time zone,
    superseded_reason text,
    impact_level character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    affected_components text[],
    tags text[] DEFAULT '{}'::text[],
    category text,
    outcome_status character varying(50) DEFAULT 'unknown'::character varying,
    outcome_notes text,
    lessons_learned text,
    CONSTRAINT technical_decisions_decision_type_check CHECK (((decision_type)::text = ANY ((ARRAY['architecture'::character varying, 'library'::character varying, 'framework'::character varying, 'pattern'::character varying, 'api_design'::character varying, 'database'::character varying, 'deployment'::character varying, 'security'::character varying, 'performance'::character varying, 'ui_ux'::character varying, 'testing'::character varying, 'tooling'::character varying, 'process'::character varying, 'naming_convention'::character varying, 'code_style'::character varying])::text[]))),
    CONSTRAINT technical_decisions_impact_level_check CHECK (((impact_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT technical_decisions_outcome_status_check CHECK (((outcome_status)::text = ANY ((ARRAY['unknown'::character varying, 'successful'::character varying, 'failed'::character varying, 'mixed'::character varying, 'too_early'::character varying])::text[]))),
    CONSTRAINT technical_decisions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'deprecated'::character varying, 'superseded'::character varying, 'under_review'::character varying])::text[])))
);


ALTER TABLE public.technical_decisions OWNER TO ridgetop;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    token_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true
);


ALTER TABLE public.user_sessions OWNER TO ridgetop;

--
-- Name: _aidis_migrations id; Type: DEFAULT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public._aidis_migrations ALTER COLUMN id SET DEFAULT nextval('public._aidis_migrations_id_seq'::regclass);


--
-- Name: _aidis_migrations _aidis_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public._aidis_migrations
    ADD CONSTRAINT _aidis_migrations_filename_key UNIQUE (filename);


--
-- Name: _aidis_migrations _aidis_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public._aidis_migrations
    ADD CONSTRAINT _aidis_migrations_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_key UNIQUE (username);


--
-- Name: agent_collaborations agent_collaborations_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_collaborations
    ADD CONSTRAINT agent_collaborations_pkey PRIMARY KEY (id);


--
-- Name: agent_messages agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);


--
-- Name: agent_sessions agent_sessions_agent_id_session_id_project_id_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_agent_id_session_id_project_id_key UNIQUE (agent_id, session_id, project_id);


--
-- Name: agent_sessions agent_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_pkey PRIMARY KEY (id);


--
-- Name: agent_tasks agent_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);


--
-- Name: agents agents_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_name_key UNIQUE (name);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: code_analysis_sessions code_analysis_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_pkey PRIMARY KEY (id);


--
-- Name: code_components code_components_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_components
    ADD CONSTRAINT code_components_pkey PRIMARY KEY (id);


--
-- Name: code_dependencies code_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_pkey PRIMARY KEY (id);


--
-- Name: code_metrics code_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_metrics
    ADD CONSTRAINT code_metrics_pkey PRIMARY KEY (id);


--
-- Name: contexts contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_pkey PRIMARY KEY (id);


--
-- Name: file_analysis_cache file_analysis_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_analysis_cache
    ADD CONSTRAINT file_analysis_cache_pkey PRIMARY KEY (id);


--
-- Name: file_analysis_cache file_analysis_cache_project_id_file_path_file_hash_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_analysis_cache
    ADD CONSTRAINT file_analysis_cache_project_id_file_path_file_hash_key UNIQUE (project_id, file_path, file_hash);


--
-- Name: naming_registry naming_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_pkey PRIMARY KEY (id);


--
-- Name: naming_registry naming_registry_project_id_entity_type_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_project_id_entity_type_canonical_name_key UNIQUE (project_id, entity_type, canonical_name);


--
-- Name: projects projects_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_name_key UNIQUE (name);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: technical_decisions technical_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_id_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_id_key UNIQUE (token_id);


--
-- Name: idx_admin_users_email; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_admin_users_email ON public.admin_users USING btree (email);


--
-- Name: idx_admin_users_username; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_admin_users_username ON public.admin_users USING btree (username);


--
-- Name: idx_agent_collaborations_agents; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_agents ON public.agent_collaborations USING gin (agents);


--
-- Name: idx_agent_collaborations_contexts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_contexts ON public.agent_collaborations USING gin (contexts);


--
-- Name: idx_agent_collaborations_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_project ON public.agent_collaborations USING btree (project_id);


--
-- Name: idx_agent_collaborations_started_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_started_at ON public.agent_collaborations USING btree (started_at);


--
-- Name: idx_agent_collaborations_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_status ON public.agent_collaborations USING btree (status);


--
-- Name: idx_agent_collaborations_tasks; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_tasks ON public.agent_collaborations USING gin (tasks);


--
-- Name: idx_agent_collaborations_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_type ON public.agent_collaborations USING btree (type);


--
-- Name: idx_agent_messages_context_refs; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_context_refs ON public.agent_messages USING gin (context_refs);


--
-- Name: idx_agent_messages_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_created_at ON public.agent_messages USING btree (created_at);


--
-- Name: idx_agent_messages_from; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_from ON public.agent_messages USING btree (from_agent_id);


--
-- Name: idx_agent_messages_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_project ON public.agent_messages USING btree (project_id);


--
-- Name: idx_agent_messages_task_refs; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_task_refs ON public.agent_messages USING gin (task_refs);


--
-- Name: idx_agent_messages_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_to ON public.agent_messages USING btree (to_agent_id);


--
-- Name: idx_agent_messages_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_type ON public.agent_messages USING btree (message_type);


--
-- Name: idx_agent_sessions_activity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_activity ON public.agent_sessions USING btree (last_activity);


--
-- Name: idx_agent_sessions_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_agent ON public.agent_sessions USING btree (agent_id);


--
-- Name: idx_agent_sessions_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_project ON public.agent_sessions USING btree (project_id);


--
-- Name: idx_agent_sessions_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_session ON public.agent_sessions USING btree (session_id);


--
-- Name: idx_agent_sessions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_status ON public.agent_sessions USING btree (status);


--
-- Name: idx_agent_tasks_assigned_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_assigned_to ON public.agent_tasks USING btree (assigned_to);


--
-- Name: idx_agent_tasks_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_created_at ON public.agent_tasks USING btree (created_at);


--
-- Name: idx_agent_tasks_created_by; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_created_by ON public.agent_tasks USING btree (created_by);


--
-- Name: idx_agent_tasks_dependencies; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_dependencies ON public.agent_tasks USING gin (dependencies);


--
-- Name: idx_agent_tasks_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_priority ON public.agent_tasks USING btree (priority);


--
-- Name: idx_agent_tasks_progress; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_progress ON public.agent_tasks USING btree (progress);


--
-- Name: idx_agent_tasks_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_project ON public.agent_tasks USING btree (project_id);


--
-- Name: idx_agent_tasks_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_status ON public.agent_tasks USING btree (status);


--
-- Name: idx_agent_tasks_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_tags ON public.agent_tasks USING gin (tags);


--
-- Name: idx_agent_tasks_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_type ON public.agent_tasks USING btree (type);


--
-- Name: idx_agents_last_seen; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_last_seen ON public.agents USING btree (last_seen);


--
-- Name: idx_agents_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_name ON public.agents USING btree (name);


--
-- Name: idx_agents_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_status ON public.agents USING btree (status);


--
-- Name: idx_agents_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_type ON public.agents USING btree (type);


--
-- Name: idx_code_analysis_sessions_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_agent ON public.code_analysis_sessions USING btree (analyzer_agent_id);


--
-- Name: idx_code_analysis_sessions_files; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_files ON public.code_analysis_sessions USING gin (files_analyzed);


--
-- Name: idx_code_analysis_sessions_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_project ON public.code_analysis_sessions USING btree (project_id);


--
-- Name: idx_code_analysis_sessions_started; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_started ON public.code_analysis_sessions USING btree (started_at);


--
-- Name: idx_code_analysis_sessions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_status ON public.code_analysis_sessions USING btree (status);


--
-- Name: idx_code_components_documentation_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_documentation_fts ON public.code_components USING gin (to_tsvector('english'::regconfig, documentation));


--
-- Name: idx_code_components_exported; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_exported ON public.code_components USING btree (is_exported);


--
-- Name: idx_code_components_file; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_file ON public.code_components USING btree (file_path);


--
-- Name: idx_code_components_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_name ON public.code_components USING btree (name);


--
-- Name: idx_code_components_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_project ON public.code_components USING btree (project_id);


--
-- Name: idx_code_components_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_tags ON public.code_components USING gin (tags);


--
-- Name: idx_code_components_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_type ON public.code_components USING btree (component_type);


--
-- Name: idx_code_components_updated; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_updated ON public.code_components USING btree (updated_at);


--
-- Name: idx_code_dependencies_external; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_external ON public.code_dependencies USING btree (is_external);


--
-- Name: idx_code_dependencies_from; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_from ON public.code_dependencies USING btree (from_component_id);


--
-- Name: idx_code_dependencies_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_project ON public.code_dependencies USING btree (project_id);


--
-- Name: idx_code_dependencies_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_to ON public.code_dependencies USING btree (to_component_id);


--
-- Name: idx_code_dependencies_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_type ON public.code_dependencies USING btree (dependency_type);


--
-- Name: idx_code_metrics_component; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_component ON public.code_metrics USING btree (component_id);


--
-- Name: idx_code_metrics_measured; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_measured ON public.code_metrics USING btree (measured_at);


--
-- Name: idx_code_metrics_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_name ON public.code_metrics USING btree (metric_name);


--
-- Name: idx_code_metrics_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_project ON public.code_metrics USING btree (project_id);


--
-- Name: idx_code_metrics_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_status ON public.code_metrics USING btree (status);


--
-- Name: idx_code_metrics_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_type ON public.code_metrics USING btree (metric_type);


--
-- Name: idx_contexts_content_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_content_fts ON public.contexts USING gin (to_tsvector('english'::regconfig, content));


--
-- Name: idx_contexts_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_created_at ON public.contexts USING btree (created_at);


--
-- Name: idx_contexts_embedding_cosine; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_embedding_cosine ON public.contexts USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_contexts_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_metadata_gin ON public.contexts USING gin (metadata);


--
-- Name: idx_contexts_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_project_id ON public.contexts USING btree (project_id);


--
-- Name: idx_contexts_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_project_type ON public.contexts USING btree (project_id, context_type);


--
-- Name: idx_contexts_relevance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_relevance ON public.contexts USING btree (relevance_score DESC);


--
-- Name: idx_contexts_session_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_session_id ON public.contexts USING btree (session_id);


--
-- Name: idx_contexts_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_tags_gin ON public.contexts USING gin (tags);


--
-- Name: idx_contexts_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_type ON public.contexts USING btree (context_type);


--
-- Name: idx_file_analysis_cache_analyzed; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_analyzed ON public.file_analysis_cache USING btree (analyzed_at);


--
-- Name: idx_file_analysis_cache_file; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_file ON public.file_analysis_cache USING btree (file_path);


--
-- Name: idx_file_analysis_cache_hash; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_hash ON public.file_analysis_cache USING btree (file_hash);


--
-- Name: idx_file_analysis_cache_language; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_language ON public.file_analysis_cache USING btree (language);


--
-- Name: idx_file_analysis_cache_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_project ON public.file_analysis_cache USING btree (project_id);


--
-- Name: idx_migrations_number; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_migrations_number ON public._aidis_migrations USING btree (migration_number);


--
-- Name: idx_naming_registry_aliases_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_aliases_gin ON public.naming_registry USING gin (aliases);


--
-- Name: idx_naming_registry_canonical_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_canonical_name ON public.naming_registry USING btree (canonical_name);


--
-- Name: idx_naming_registry_deprecated; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_deprecated ON public.naming_registry USING btree (deprecated, project_id);


--
-- Name: idx_naming_registry_description_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_description_fts ON public.naming_registry USING gin (to_tsvector('english'::regconfig, description));


--
-- Name: idx_naming_registry_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_project_type ON public.naming_registry USING btree (project_id, entity_type);


--
-- Name: idx_naming_registry_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_tags_gin ON public.naming_registry USING gin (context_tags);


--
-- Name: idx_naming_registry_usage; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_usage ON public.naming_registry USING btree (usage_count DESC, last_used DESC);


--
-- Name: idx_projects_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at);


--
-- Name: idx_projects_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_metadata_gin ON public.projects USING gin (metadata);


--
-- Name: idx_projects_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_name ON public.projects USING btree (name);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_sessions_agent_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_agent_type ON public.sessions USING btree (agent_type);


--
-- Name: idx_sessions_project_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_project_agent ON public.sessions USING btree (project_id, agent_type);


--
-- Name: idx_sessions_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_project_id ON public.sessions USING btree (project_id);


--
-- Name: idx_sessions_started_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_started_at ON public.sessions USING btree (started_at);


--
-- Name: idx_tasks_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_active ON public.tasks USING btree (project_id, status) WHERE ((status)::text <> ALL ((ARRAY['completed'::character varying, 'cancelled'::character varying])::text[]));


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_created_at ON public.tasks USING btree (created_at);


--
-- Name: idx_tasks_dependencies; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_dependencies ON public.tasks USING gin (dependencies);


--
-- Name: idx_tasks_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_priority ON public.tasks USING btree (priority);


--
-- Name: idx_tasks_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_project_id ON public.tasks USING btree (project_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_tags ON public.tasks USING gin (tags);


--
-- Name: idx_tasks_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_type ON public.tasks USING btree (type);


--
-- Name: idx_tasks_updated_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_updated_at ON public.tasks USING btree (updated_at);


--
-- Name: idx_tasks_urgent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_urgent ON public.tasks USING btree (project_id, priority) WHERE ((priority)::text = 'urgent'::text);


--
-- Name: idx_technical_decisions_components_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_components_gin ON public.technical_decisions USING gin (affected_components);


--
-- Name: idx_technical_decisions_content_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_content_fts ON public.technical_decisions USING gin (to_tsvector('english'::regconfig, (((((((title)::text || ' '::text) || description) || ' '::text) || rationale) || ' '::text) || COALESCE(problem_statement, ''::text))));


--
-- Name: idx_technical_decisions_date; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_date ON public.technical_decisions USING btree (decision_date DESC);


--
-- Name: idx_technical_decisions_impact; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_impact ON public.technical_decisions USING btree (impact_level, project_id);


--
-- Name: idx_technical_decisions_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_project_type ON public.technical_decisions USING btree (project_id, decision_type);


--
-- Name: idx_technical_decisions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_status ON public.technical_decisions USING btree (status, project_id);


--
-- Name: idx_technical_decisions_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_tags_gin ON public.technical_decisions USING gin (tags);


--
-- Name: idx_user_sessions_expires_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_user_sessions_token_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_token_id ON public.user_sessions USING btree (token_id);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: tasks trigger_update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_tasks_updated_at();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sessions update_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_collaborations agent_collaborations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_collaborations
    ADD CONSTRAINT agent_collaborations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_from_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_from_agent_id_fkey FOREIGN KEY (from_agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_to_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_to_agent_id_fkey FOREIGN KEY (to_agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_sessions agent_sessions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_sessions agent_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agent_tasks agent_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_analysis_sessions code_analysis_sessions_analyzer_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_analyzer_agent_id_fkey FOREIGN KEY (analyzer_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: code_analysis_sessions code_analysis_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_components code_components_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_components
    ADD CONSTRAINT code_components_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_dependencies code_dependencies_from_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_from_component_id_fkey FOREIGN KEY (from_component_id) REFERENCES public.code_components(id) ON DELETE CASCADE;


--
-- Name: code_dependencies code_dependencies_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_dependencies code_dependencies_to_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_to_component_id_fkey FOREIGN KEY (to_component_id) REFERENCES public.code_components(id) ON DELETE CASCADE;


--
-- Name: code_metrics code_metrics_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_metrics
    ADD CONSTRAINT code_metrics_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.code_components(id) ON DELETE CASCADE;


--
-- Name: code_metrics code_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_metrics
    ADD CONSTRAINT code_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: contexts contexts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: contexts contexts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: file_analysis_cache file_analysis_cache_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_analysis_cache
    ADD CONSTRAINT file_analysis_cache_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: naming_registry naming_registry_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: naming_registry naming_registry_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.naming_registry(id);


--
-- Name: sessions sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: technical_decisions technical_decisions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: technical_decisions technical_decisions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: technical_decisions technical_decisions_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.technical_decisions(id);


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

