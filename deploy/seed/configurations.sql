-- Application-level configurations. Keep in sync with src/lib/configurations.ts
-- when adding or removing keys. Defaults below match CONFIG_DEFAULTS.
-- Idempotent: re-running on a populated DB is a no-op.

INSERT INTO configurations (code, value, description) VALUES
  (
    'autofetch.staleness_timeout_ms',
    '300000'::jsonb,
    'Milliseconds without progress before an in-flight source PDF auto-detect row is marked failed on the next status poll.'
  ),
  (
    'autofetch.download_timeout_ms',
    '30000'::jsonb,
    'Milliseconds to wait for a single source PDF HTTP download before aborting.'
  ),
  (
    'autofetch.concurrency',
    '4'::jsonb,
    'Maximum number of source PDFs fetched in parallel by the auto-detect pipeline.'
  ),
  (
    'upload.max_file_size_bytes',
    '52428800'::jsonb,
    'Maximum allowed size in bytes for any user-uploaded PDF (thesis or source).'
  )
ON CONFLICT (code) DO NOTHING;
