--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (Ubuntu 16.9-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.9 (Ubuntu 16.9-0ubuntu0.24.04.1)

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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    CONSTRAINT contexts_context_type_check CHECK (((context_type)::text = ANY ((ARRAY['code'::character varying, 'decision'::character varying, 'error'::character varying, 'discussion'::character varying, 'planning'::character varying, 'completion'::character varying, 'milestone'::character varying])::text[]))),
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
    CONSTRAINT naming_registry_entity_type_check CHECK (((entity_type)::text = ANY (ARRAY[('variable'::character varying)::text, ('function'::character varying)::text, ('class'::character varying)::text, ('interface'::character varying)::text, ('type'::character varying)::text, ('component'::character varying)::text, ('file'::character varying)::text, ('directory'::character varying)::text, ('module'::character varying)::text, ('service'::character varying)::text, ('endpoint'::character varying)::text, ('database_table'::character varying)::text, ('database_column'::character varying)::text, ('config_key'::character varying)::text, ('environment_var'::character varying)::text, ('css_class'::character varying)::text, ('html_id'::character varying)::text])))
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
    CONSTRAINT projects_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('archived'::character varying)::text, ('completed'::character varying)::text, ('paused'::character varying)::text])))
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
    CONSTRAINT technical_decisions_decision_type_check CHECK (((decision_type)::text = ANY (ARRAY[('architecture'::character varying)::text, ('library'::character varying)::text, ('framework'::character varying)::text, ('pattern'::character varying)::text, ('api_design'::character varying)::text, ('database'::character varying)::text, ('deployment'::character varying)::text, ('security'::character varying)::text, ('performance'::character varying)::text, ('ui_ux'::character varying)::text, ('testing'::character varying)::text, ('tooling'::character varying)::text, ('process'::character varying)::text, ('naming_convention'::character varying)::text, ('code_style'::character varying)::text]))),
    CONSTRAINT technical_decisions_impact_level_check CHECK (((impact_level)::text = ANY (ARRAY[('low'::character varying)::text, ('medium'::character varying)::text, ('high'::character varying)::text, ('critical'::character varying)::text]))),
    CONSTRAINT technical_decisions_outcome_status_check CHECK (((outcome_status)::text = ANY (ARRAY[('unknown'::character varying)::text, ('successful'::character varying)::text, ('failed'::character varying)::text, ('mixed'::character varying)::text, ('too_early'::character varying)::text]))),
    CONSTRAINT technical_decisions_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('deprecated'::character varying)::text, ('superseded'::character varying)::text, ('under_review'::character varying)::text])))
);


ALTER TABLE public.technical_decisions OWNER TO ridgetop;

--
-- Data for Name: agent_collaborations; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.agent_collaborations (id, project_id, agents, type, title, description, status, result, contexts, tasks, metadata, started_at, completed_at, updated_at) FROM stdin;
\.


--
-- Data for Name: agent_messages; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.agent_messages (id, project_id, from_agent_id, to_agent_id, message_type, title, content, context_refs, task_refs, metadata, read_at, created_at) FROM stdin;
\.


--
-- Data for Name: agent_sessions; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.agent_sessions (id, agent_id, session_id, project_id, status, started_at, last_activity, metadata) FROM stdin;
\.


--
-- Data for Name: agent_tasks; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.agent_tasks (id, project_id, assigned_to, created_by, title, description, type, status, priority, dependencies, tags, metadata, started_at, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: agents; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.agents (id, name, type, capabilities, status, metadata, last_seen, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: code_analysis_sessions; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.code_analysis_sessions (id, project_id, analyzer_agent_id, session_type, files_analyzed, components_found, dependencies_found, analysis_duration_ms, status, error_message, metadata, started_at, completed_at) FROM stdin;
\.


--
-- Data for Name: code_components; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.code_components (id, project_id, file_path, component_type, name, signature, start_line, end_line, complexity_score, lines_of_code, documentation, is_exported, is_deprecated, tags, metadata, created_at, updated_at, analyzed_at) FROM stdin;
\.


--
-- Data for Name: code_dependencies; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.code_dependencies (id, project_id, from_component_id, to_component_id, dependency_type, import_path, import_alias, is_external, confidence_score, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: code_metrics; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.code_metrics (id, project_id, file_path, component_id, metric_type, metric_name, metric_value, threshold_min, threshold_max, status, metadata, measured_at) FROM stdin;
\.


--
-- Data for Name: contexts; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.contexts (id, project_id, session_id, context_type, content, embedding, created_at, relevance_score, tags, metadata) FROM stdin;
357357da-aea9-4b46-b615-dcb6de15d6ee	af30e43d-afb7-42fc-bb81-c3079099629c	62eef75a-889a-474d-869c-709a3640b6c0	completion	Successfully set up PostgreSQL with pgvector extension for vector search capabilities. This enables semantic search across all stored contexts.	\N	2025-08-16 23:12:35.549216-04	9	{postgresql,pgvector,database,setup}	{"status": "completed", "components": ["postgresql", "pgvector"]}
c6cc4fd0-ff88-4cc7-968c-3a6a254f89cd	af30e43d-afb7-42fc-bb81-c3079099629c	62eef75a-889a-474d-869c-709a3640b6c0	code	Created MCP server with TypeScript using @modelcontextprotocol/sdk. Server responds to ping and status tools, ready for AI agent connections.	\N	2025-08-16 23:12:35.549216-04	8.5	{mcp,typescript,server,tools}	{"tools": ["ping", "status"], "language": "typescript", "framework": "mcp-sdk"}
c63611a1-98f5-4209-be30-5f55f25ea263	af30e43d-afb7-42fc-bb81-c3079099629c	62eef75a-889a-474d-869c-709a3640b6c0	planning	Phase 2 planning: Implement core context management with vector embeddings, context storage/search tools, and agent session tracking.	\N	2025-08-16 23:12:35.549216-04	7	{planning,phase-2,context-management,roadmap}	{"focus": "context_management", "phase": 2, "priority": "high"}
ec1d87aa-559a-4e0e-91e2-7cbcc87f3061	af30e43d-afb7-42fc-bb81-c3079099629c	\N	milestone	direct db test 2	\N	2025-08-19 20:48:32.228989-04	1	{}	{}
bf8303f0-c9dc-4245-ae95-4058d44aba28	af30e43d-afb7-42fc-bb81-c3079099629c	\N	milestone	final direct test	\N	2025-08-19 21:07:21.453506-04	1	{}	{}
cd13d212-e83e-4b62-94a7-d2fd982d0acb	af30e43d-afb7-42fc-bb81-c3079099629c	\N	milestone	constraint rebuild test	\N	2025-08-19 21:19:54.22937-04	1	{}	{}
\.


--
-- Data for Name: file_analysis_cache; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.file_analysis_cache (id, project_id, file_path, file_hash, language, analysis_result, components_count, dependencies_count, complexity_total, lines_of_code, last_modified, analyzed_at) FROM stdin;
\.


--
-- Data for Name: naming_registry; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.naming_registry (id, project_id, entity_type, canonical_name, aliases, description, naming_convention, first_seen, last_used, usage_count, deprecated, deprecated_reason, replacement_id, context_tags, related_entities) FROM stdin;
4b155123-f01a-4b66-9952-f058362f1ffa	af30e43d-afb7-42fc-bb81-c3079099629c	variable	contextId	{}	Unique identifier for stored contexts	{"suffix": "Id", "pattern": "camelCase"}	2025-08-16 23:12:35.62273-04	2025-08-16 23:12:35.62273-04	1	f	\N	\N	{id,context}	{}
80160d5c-f125-457d-8efb-0df30d003fd2	af30e43d-afb7-42fc-bb81-c3079099629c	variable	projectName	{}	Human-readable project name	{"type": "string", "pattern": "camelCase"}	2025-08-16 23:12:35.62273-04	2025-08-16 23:12:35.62273-04	1	f	\N	\N	{project,name}	{}
4ac5edb9-ad84-48a5-9bfb-e64b395a6209	af30e43d-afb7-42fc-bb81-c3079099629c	function	generateEmbedding	{}	Creates vector embeddings from text	{"prefix": "generate", "pattern": "camelCase"}	2025-08-16 23:12:35.62273-04	2025-08-16 23:12:35.62273-04	1	f	\N	\N	{embedding,ai}	{}
49eae66b-3dd3-43a6-89bb-4a48ab044a41	af30e43d-afb7-42fc-bb81-c3079099629c	interface	ContextEntry	{}	TypeScript interface for context objects	{"suffix": "Entry", "pattern": "PascalCase"}	2025-08-16 23:12:35.62273-04	2025-08-16 23:12:35.62273-04	1	f	\N	\N	{interface,context}	{}
299aa51b-9d6b-415a-aea4-da3a711820a2	af30e43d-afb7-42fc-bb81-c3079099629c	component	ProjectSwitcher	{}	React component for switching projects	{"type": "component", "pattern": "PascalCase"}	2025-08-16 23:12:35.62273-04	2025-08-16 23:12:35.62273-04	1	f	\N	\N	{component,project}	{}
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.projects (id, name, description, created_at, updated_at, status, git_repo_url, root_directory, metadata) FROM stdin;
af30e43d-afb7-42fc-bb81-c3079099629c	aidis-bootstrap	The AIDIS project itself - bootstrapping the AI Development Intelligence System	2025-08-16 23:12:35.482003-04	2025-08-16 23:12:35.482003-04	active	https://github.com/your-username/aidis	/home/ridgetop/aidis	{"phase": "foundation", "tools": ["postgresql", "typescript", "mcp"], "learning_project": true}
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.sessions (id, project_id, agent_type, started_at, ended_at, context_summary, tokens_used, metadata) FROM stdin;
62eef75a-889a-474d-869c-709a3640b6c0	af30e43d-afb7-42fc-bb81-c3079099629c	aidis-bootstrap-agent	2025-08-16 23:12:35.549216-04	\N	Initial AIDIS system setup - Phase 1 foundation completed	0	{"phase": "foundation", "completed_tasks": ["database_setup", "mcp_server", "migrations"]}
\.


--
-- Data for Name: technical_decisions; Type: TABLE DATA; Schema: public; Owner: ridgetop
--

COPY public.technical_decisions (id, project_id, session_id, decision_type, title, description, rationale, problem_statement, success_criteria, alternatives_considered, decision_date, decided_by, stakeholders, status, superseded_by, superseded_date, superseded_reason, impact_level, affected_components, tags, category, outcome_status, outcome_notes, lessons_learned) FROM stdin;
a8d1d70a-a27b-4672-b2fd-fe2db12b8767	af30e43d-afb7-42fc-bb81-c3079099629c	\N	database	Use PostgreSQL with pgvector for context storage	Selected PostgreSQL with pgvector extension as the primary database for AIDIS context storage and semantic search.	PostgreSQL provides ACID compliance, mature ecosystem, and pgvector enables efficient vector similarity search without external dependencies.	\N	\N	[{"cons": ["Less mature vector support", "No ACID"], "name": "MongoDB with vector search", "pros": ["Document-oriented", "Flexible schema"], "reason_rejected": "Vector search capabilities not as advanced"}, {"cons": ["Extra cost", "External dependency", "Data split across systems"], "name": "Pinecone + PostgreSQL", "pros": ["Best vector performance", "Managed service"], "reason_rejected": "Increased complexity and cost"}, {"cons": ["No concurrent access", "Limited scalability"], "name": "SQLite with custom vectors", "pros": ["Simple", "Embedded"], "reason_rejected": "Not suitable for multi-agent scenarios"}]	2025-08-16 23:12:35.62273-04	\N	\N	active	\N	\N	\N	high	{database,context_storage,search,embeddings}	{database,postgresql,pgvector,architecture}	\N	unknown	\N	\N
b3a73fbb-eedd-44cc-a955-d1d28c1b0a55	af30e43d-afb7-42fc-bb81-c3079099629c	\N	library	Use local embeddings with Transformers.js	Implemented local text embedding generation using Transformers.js instead of OpenAI API calls.	Local embeddings eliminate API costs, enable offline operation, and provide consistent performance without rate limits.	\N	\N	[{"cons": ["API costs", "Rate limits", "Network dependency"], "name": "OpenAI Embeddings API", "pros": ["High quality", "1536 dimensions", "Proven"], "reason_rejected": "Ongoing costs would be prohibitive for high-volume usage"}, {"cons": ["Python dependency", "Complex integration"], "name": "Sentence Transformers (Python)", "pros": ["Many models", "High quality"], "reason_rejected": "Adds deployment complexity"}, {"cons": ["Still has API costs", "Less ecosystem"], "name": "Cohere Embeddings", "pros": ["Good quality", "API"], "reason_rejected": "Similar cost issues to OpenAI"}]	2025-08-16 23:12:35.62273-04	\N	\N	active	\N	\N	\N	high	{embeddings,context_storage,search,api_integration}	{embeddings,transformers,local,cost-optimization}	\N	unknown	\N	\N
fe189a6e-affc-4fbe-8330-79f754967ba1	af30e43d-afb7-42fc-bb81-c3079099629c	\N	architecture	MCP protocol for AI agent integration	Adopted Model Context Protocol (MCP) as the standard interface for AI agent communication with AIDIS.	MCP provides standardized tool calling, resource access, and is supported by major AI systems like Claude and ChatGPT.	\N	\N	[{"cons": ["No standardization", "Custom integration needed"], "name": "REST API", "pros": ["Universal", "Simple", "Well understood"], "reason_rejected": "Would require custom integration for each AI system"}, {"cons": ["More complex", "Not standard for AI tools"], "name": "GraphQL API", "pros": ["Flexible queries", "Type safety", "Efficient"], "reason_rejected": "Overkill for tool-calling use case"}, {"cons": ["Complex setup", "Not AI-agent friendly"], "name": "gRPC", "pros": ["Type safety", "Performance", "Streaming"], "reason_rejected": "Too low-level for AI agent integration"}]	2025-08-16 23:12:35.62273-04	\N	\N	active	\N	\N	\N	critical	{api,integration,ai_agents,protocol}	{mcp,protocol,ai-agents,integration}	\N	unknown	\N	\N
\.


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
-- Name: code_components code_components_project_id_file_path_name_component_type_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_components
    ADD CONSTRAINT code_components_project_id_file_path_name_component_type_key UNIQUE (project_id, file_path, name, component_type);


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
-- Name: technical_decisions technical_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_pkey PRIMARY KEY (id);


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
-- PostgreSQL database dump complete
--

