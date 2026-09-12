CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SEQUENCE IF NOT EXISTS student_member_seq START 1;
CREATE SEQUENCE IF NOT EXISTS teacher_member_seq START 1;
CREATE SEQUENCE IF NOT EXISTS book_copy_seq START 1;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','librarian')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  grade integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code text NOT NULL UNIQUE,
  nis text UNIQUE,
  nisn text UNIQUE,
  name text NOT NULL,
  gender text CHECK (gender IN ('L','P') OR gender IS NULL),
  photo_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','graduated','moved','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_students_name_trgm ON students USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, academic_year_id)
);

CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code text NOT NULL UNIQUE,
  nip text UNIQUE,
  name text NOT NULL,
  photo_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn text,
  title text NOT NULL,
  subtitle text,
  author_text text,
  publisher text,
  publication_year integer,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  shelf_id uuid REFERENCES shelves(id) ON DELETE SET NULL,
  description text,
  cover_url text,
  language text,
  page_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_books_title_trgm ON books USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_author_trgm ON books USING gin (author_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);

CREATE TABLE IF NOT EXISTS book_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  copy_code text NOT NULL UNIQUE,
  acquisition_date date,
  acquisition_source text,
  purchase_price numeric(14,2),
  condition text NOT NULL DEFAULT 'good' CHECK (condition IN ('good','fair','damaged')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','borrowed','reserved','damaged','lost','repair','withdrawn')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_book_copies_book ON book_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_book_copies_status ON book_copies(status);

CREATE TABLE IF NOT EXISTS loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_type text NOT NULL CHECK (member_type IN ('student','teacher')),
  member_id uuid NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  loaned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text
);

CREATE TABLE IF NOT EXISTS loan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  book_copy_id uuid NOT NULL REFERENCES book_copies(id),
  borrowed_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  returned_at timestamptz,
  status text NOT NULL DEFAULT 'borrowed' CHECK (status IN ('borrowed','returned','lost')),
  return_condition text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_copy_loan ON loan_items(book_copy_id) WHERE status = 'borrowed';
CREATE INDEX IF NOT EXISTS idx_loan_items_due ON loan_items(due_at) WHERE status = 'borrowed';

CREATE TABLE IF NOT EXISTS library_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_type text NOT NULL CHECK (member_type IN ('student','teacher')),
  member_id uuid NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  device_id text,
  source text NOT NULL DEFAULT 'kiosk',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visits_member_time ON library_visits(member_type, member_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_time ON library_visits(scanned_at DESC);

CREATE TABLE IF NOT EXISTS library_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('books','students')),
  filename text,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','failed')),
  payload jsonb NOT NULL,
  summary jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS sync_queue (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('upsert','delete')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(id) WHERE synced_at IS NULL;

INSERT INTO library_settings(key, value) VALUES
  ('student_loan_days', '7'::jsonb),
  ('teacher_loan_days', '30'::jsonb),
  ('student_max_books', '3'::jsonb),
  ('teacher_max_books', '10'::jsonb),
  ('visit_cooldown_minutes', '30'::jsonb),
  ('kiosk_idle_seconds', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;
