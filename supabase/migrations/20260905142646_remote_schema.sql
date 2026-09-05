


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


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."current_tenant"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'organization_id';
END;
$$;


ALTER FUNCTION "public"."current_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hash_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_prev_hash VARCHAR(64);
BEGIN
    -- Get the hash of the chronologically previous record
    SELECT hash INTO v_prev_hash FROM audit_logs ORDER BY row_seq DESC LIMIT 1;
    
    IF v_prev_hash IS NULL THEN
        v_prev_hash := encode(digest('genesis_block_studentops', 'sha256'), 'hex');
    END IF;

    NEW.prev_hash := v_prev_hash;
    -- Generate SHA-256 Hash of (prev_hash + row_seq + canonical_payload)
    NEW.hash := encode(digest(v_prev_hash || NEW.row_seq::text || NEW.payload::text, 'sha256'), 'hex');
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."hash_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_audit_tampering"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY BREACH: Audit logs are immutable and cannot be altered or deleted.';
END;
$$;


ALTER FUNCTION "public"."prevent_audit_tampering"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_action_audits" (
    "id" character varying(36) NOT NULL,
    "action_id" character varying(50),
    "user_id" character varying(50),
    "intent" character varying(100) NOT NULL,
    "tool_name" character varying(100) NOT NULL,
    "parameters" "text",
    "result" "text",
    "requires_confirmation" boolean,
    "confirmed" boolean,
    "status" character varying(30),
    "timestamp" timestamp with time zone
);


ALTER TABLE "public"."agent_action_audits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "tool_name" character varying(100) NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."agent_approvals" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_quotas" (
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "requests_today" integer DEFAULT 0,
    "last_request_date" "date" DEFAULT CURRENT_DATE
);

ALTER TABLE ONLY "public"."agent_quotas" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" character varying(36) NOT NULL,
    "meeting_id" character varying(36) NOT NULL,
    "student_id" character varying(36) NOT NULL,
    "status" character varying(30) NOT NULL,
    "match_confidence" double precision,
    "first_join" timestamp with time zone,
    "last_leave" timestamp with time zone,
    "total_duration_minutes" double precision,
    "excuse_reason" "text",
    "excuse_status" character varying(30),
    "policy_version" character varying(20),
    "recorded_at" timestamp with time zone
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "row_seq" bigint NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "action" character varying(100) NOT NULL,
    "target_id" character varying(255),
    "payload" "jsonb",
    "request_id" "uuid",
    "prev_hash" character varying(64),
    "hash" character varying(64),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


ALTER TABLE "public"."audit_logs" ALTER COLUMN "row_seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_logs_row_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" character varying(36) NOT NULL,
    "title" character varying(150) NOT NULL,
    "description" "text",
    "event_type" character varying(30),
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "location" character varying(100),
    "meet_url" character varying(255),
    "is_mandatory" boolean,
    "created_at" timestamp with time zone,
    "organization_id" "uuid"
);

ALTER TABLE ONLY "public"."events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" character varying(36) NOT NULL,
    "meeting_code" character varying(50),
    "title" character varying(150) NOT NULL,
    "topic" character varying(200),
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "duration_minutes" integer,
    "meet_url" character varying(255),
    "status" character varying(20),
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" character varying(50) NOT NULL,
    "phone_number" character varying(20),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_sessions" (
    "id" character varying(36) NOT NULL,
    "meeting_id" character varying(36) NOT NULL,
    "raw_display_name" character varying(100) NOT NULL,
    "raw_email" character varying(100),
    "join_time" timestamp with time zone NOT NULL,
    "leave_time" timestamp with time zone NOT NULL,
    "duration_seconds" integer,
    "matched_student_id" character varying(36)
);


ALTER TABLE "public"."participant_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminder_logs" (
    "id" character varying(36) NOT NULL,
    "recipient_id" character varying(36),
    "recipient_name" character varying(100) NOT NULL,
    "recipient_phone" character varying(30) NOT NULL,
    "channel" character varying(20),
    "message_content" "text" NOT NULL,
    "status" character varying(20),
    "sent_at" timestamp with time zone,
    "trigger_source" character varying(50)
);


ALTER TABLE "public"."reminder_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."score_records" (
    "id" character varying(36) NOT NULL,
    "student_id" character varying(36) NOT NULL,
    "category" character varying(50) NOT NULL,
    "points" double precision NOT NULL,
    "max_points" double precision NOT NULL,
    "notes" character varying(255),
    "updated_by" character varying(50),
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."score_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" character varying(36) NOT NULL,
    "student_code" character varying(20),
    "full_name" character varying(100) NOT NULL,
    "arabic_name" character varying(100) NOT NULL,
    "email" character varying(100) NOT NULL,
    "phone" character varying(30) NOT NULL,
    "university" character varying(100),
    "role" character varying(50),
    "status" character varying(20),
    "team_id" character varying(36),
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" character varying(36) NOT NULL,
    "task_id" character varying(36) NOT NULL,
    "student_id" character varying(36) NOT NULL,
    "submitted_at" timestamp with time zone,
    "status" character varying(20),
    "score" double precision,
    "file_url" character varying(255),
    "reviewer_notes" "text",
    "reviewed_at" timestamp with time zone,
    "organization_id" "uuid"
);

ALTER TABLE ONLY "public"."submissions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_reminder_tests" (
    "id" character varying(36) NOT NULL,
    "reminder_key" character varying(80) NOT NULL,
    "recipient_phone" character varying(30) NOT NULL,
    "message" "text" NOT NULL,
    "status" character varying(20) NOT NULL,
    "available_at" timestamp without time zone NOT NULL,
    "sent_at" timestamp without time zone,
    "error" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."task_reminder_tests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_reminders" (
    "id" character varying(36) NOT NULL,
    "task_id" character varying(36) NOT NULL,
    "member_id" character varying(36) NOT NULL,
    "reminder_stage" integer NOT NULL,
    "recipient_phone" character varying(30) NOT NULL,
    "message" "text" NOT NULL,
    "status" character varying(20) NOT NULL,
    "sent_at" timestamp without time zone,
    "error" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."task_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" character varying(36) NOT NULL,
    "task_number" integer,
    "title" character varying(150) NOT NULL,
    "description" "text",
    "deadline" timestamp with time zone NOT NULL,
    "max_score" double precision,
    "score_rule" character varying(100),
    "created_at" timestamp with time zone,
    "organization_id" "uuid"
);

ALTER TABLE ONLY "public"."tasks" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" character varying(36) NOT NULL,
    "name" character varying(100) NOT NULL,
    "code" character varying(50) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" character varying(36) NOT NULL,
    "email" character varying(100) NOT NULL,
    "hashed_password" character varying(255) NOT NULL,
    "full_name" character varying(100) NOT NULL,
    "arabic_name" character varying(100),
    "role" character varying(50),
    "team_id" character varying(36),
    "student_id" character varying(36),
    "is_active" boolean,
    "created_at" timestamp with time zone,
    "organization_id" "uuid"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_action_audits"
    ADD CONSTRAINT "agent_action_audits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_approvals"
    ADD CONSTRAINT "agent_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_quotas"
    ADD CONSTRAINT "agent_quotas_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_sessions"
    ADD CONSTRAINT "participant_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reminder_logs"
    ADD CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."score_records"
    ADD CONSTRAINT "score_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_reminder_tests"
    ADD CONSTRAINT "task_reminder_tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_reminders"
    ADD CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_reminders"
    ADD CONSTRAINT "uq_task_member_reminder_stage" UNIQUE ("task_id", "member_id", "reminder_stage");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "ix_agent_action_audits_action_id" ON "public"."agent_action_audits" USING "btree" ("action_id");



CREATE INDEX "ix_agent_action_audits_id" ON "public"."agent_action_audits" USING "btree" ("id");



CREATE INDEX "ix_agent_action_audits_tool_name" ON "public"."agent_action_audits" USING "btree" ("tool_name");



CREATE INDEX "ix_attendance_records_id" ON "public"."attendance_records" USING "btree" ("id");



CREATE INDEX "ix_attendance_records_meeting_id" ON "public"."attendance_records" USING "btree" ("meeting_id");



CREATE INDEX "ix_attendance_records_student_id" ON "public"."attendance_records" USING "btree" ("student_id");



CREATE INDEX "ix_events_id" ON "public"."events" USING "btree" ("id");



CREATE INDEX "ix_events_start_time" ON "public"."events" USING "btree" ("start_time");



CREATE INDEX "ix_meetings_id" ON "public"."meetings" USING "btree" ("id");



CREATE UNIQUE INDEX "ix_meetings_meeting_code" ON "public"."meetings" USING "btree" ("meeting_code");



CREATE INDEX "ix_participant_sessions_id" ON "public"."participant_sessions" USING "btree" ("id");



CREATE INDEX "ix_participant_sessions_meeting_id" ON "public"."participant_sessions" USING "btree" ("meeting_id");



CREATE INDEX "ix_reminder_logs_id" ON "public"."reminder_logs" USING "btree" ("id");



CREATE INDEX "ix_score_records_id" ON "public"."score_records" USING "btree" ("id");



CREATE INDEX "ix_score_records_student_id" ON "public"."score_records" USING "btree" ("student_id");



CREATE INDEX "ix_students_arabic_name" ON "public"."students" USING "btree" ("arabic_name");



CREATE UNIQUE INDEX "ix_students_email" ON "public"."students" USING "btree" ("email");



CREATE INDEX "ix_students_id" ON "public"."students" USING "btree" ("id");



CREATE UNIQUE INDEX "ix_students_student_code" ON "public"."students" USING "btree" ("student_code");



CREATE INDEX "ix_students_team_id" ON "public"."students" USING "btree" ("team_id");



CREATE INDEX "ix_submissions_id" ON "public"."submissions" USING "btree" ("id");



CREATE INDEX "ix_submissions_student_id" ON "public"."submissions" USING "btree" ("student_id");



CREATE INDEX "ix_submissions_task_id" ON "public"."submissions" USING "btree" ("task_id");



CREATE INDEX "ix_task_reminder_tests_available_at" ON "public"."task_reminder_tests" USING "btree" ("available_at");



CREATE INDEX "ix_task_reminder_tests_id" ON "public"."task_reminder_tests" USING "btree" ("id");



CREATE UNIQUE INDEX "ix_task_reminder_tests_reminder_key" ON "public"."task_reminder_tests" USING "btree" ("reminder_key");



CREATE INDEX "ix_task_reminders_id" ON "public"."task_reminders" USING "btree" ("id");



CREATE INDEX "ix_task_reminders_member_id" ON "public"."task_reminders" USING "btree" ("member_id");



CREATE INDEX "ix_task_reminders_task_id" ON "public"."task_reminders" USING "btree" ("task_id");



CREATE INDEX "ix_tasks_deadline" ON "public"."tasks" USING "btree" ("deadline");



CREATE INDEX "ix_tasks_id" ON "public"."tasks" USING "btree" ("id");



CREATE UNIQUE INDEX "ix_tasks_task_number" ON "public"."tasks" USING "btree" ("task_number");



CREATE UNIQUE INDEX "ix_teams_code" ON "public"."teams" USING "btree" ("code");



CREATE INDEX "ix_teams_id" ON "public"."teams" USING "btree" ("id");



CREATE UNIQUE INDEX "ix_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "ix_users_id" ON "public"."users" USING "btree" ("id");



CREATE INDEX "ix_users_student_id" ON "public"."users" USING "btree" ("student_id");



CREATE INDEX "ix_users_team_id" ON "public"."users" USING "btree" ("team_id");



CREATE OR REPLACE TRIGGER "tg_audit_hash_chain" BEFORE INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."hash_audit_log"();



CREATE OR REPLACE TRIGGER "tg_prevent_audit_tampering" BEFORE DELETE OR UPDATE ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_audit_tampering"();



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_sessions"
    ADD CONSTRAINT "participant_sessions_matched_student_id_fkey" FOREIGN KEY ("matched_student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."participant_sessions"
    ADD CONSTRAINT "participant_sessions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id");



ALTER TABLE ONLY "public"."reminder_logs"
    ADD CONSTRAINT "reminder_logs_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."score_records"
    ADD CONSTRAINT "score_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."task_reminders"
    ADD CONSTRAINT "task_reminders_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."task_reminders"
    ADD CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



CREATE POLICY "Strict Tenant Isolation - Approvals" ON "public"."agent_approvals" AS RESTRICTIVE USING ((("organization_id")::"text" = "public"."current_tenant"()));



CREATE POLICY "Strict Tenant Isolation - Events" ON "public"."events" AS RESTRICTIVE USING ((("organization_id")::"text" = "public"."current_tenant"()));



CREATE POLICY "Strict Tenant Isolation - Quotas" ON "public"."agent_quotas" AS RESTRICTIVE USING ((("organization_id")::"text" = "public"."current_tenant"()));



CREATE POLICY "Strict Tenant Isolation - Submissions" ON "public"."submissions" AS RESTRICTIVE USING ((("organization_id")::"text" = "public"."current_tenant"()));



CREATE POLICY "Strict Tenant Isolation - Tasks" ON "public"."tasks" AS RESTRICTIVE USING ((("organization_id")::"text" = "public"."current_tenant"()));



CREATE POLICY "Users can view their own profile" ON "public"."users" FOR SELECT USING ((("auth"."uid"())::"text" = ("id")::"text"));



ALTER TABLE "public"."agent_action_audits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reminder_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."score_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_reminder_tests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_reminders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."current_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hash_audit_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."hash_audit_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."hash_audit_log"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_audit_tampering"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_audit_tampering"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_audit_tampering"() TO "service_role";


















GRANT ALL ON TABLE "public"."agent_action_audits" TO "anon";
GRANT ALL ON TABLE "public"."agent_action_audits" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_action_audits" TO "service_role";



GRANT ALL ON TABLE "public"."agent_approvals" TO "anon";
GRANT ALL ON TABLE "public"."agent_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."agent_quotas" TO "anon";
GRANT ALL ON TABLE "public"."agent_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."audit_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_logs_row_seq_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_logs_row_seq_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_row_seq_seq" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "anon";
GRANT ALL ON TABLE "public"."meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."participant_sessions" TO "anon";
GRANT ALL ON TABLE "public"."participant_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."reminder_logs" TO "anon";
GRANT ALL ON TABLE "public"."reminder_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_logs" TO "service_role";



GRANT ALL ON TABLE "public"."score_records" TO "anon";
GRANT ALL ON TABLE "public"."score_records" TO "authenticated";
GRANT ALL ON TABLE "public"."score_records" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."task_reminder_tests" TO "anon";
GRANT ALL ON TABLE "public"."task_reminder_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."task_reminder_tests" TO "service_role";



GRANT ALL ON TABLE "public"."task_reminders" TO "anon";
GRANT ALL ON TABLE "public"."task_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."task_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































