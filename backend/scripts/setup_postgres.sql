-- Run as postgres superuser.
DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ai_eda') THEN
      CREATE ROLE ai_eda LOGIN PASSWORD 'changeme';
   END IF;
END
$$;

SELECT 'CREATE DATABASE ai_eda OWNER ai_eda'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_eda')\gexec

GRANT ALL PRIVILEGES ON DATABASE ai_eda TO ai_eda;
