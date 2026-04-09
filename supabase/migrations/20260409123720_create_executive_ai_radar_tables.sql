/*
  # Executive AI Radar - Initial Schema

  ## New Tables

  ### sources
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - Human-readable source name
  - `category` (text) - Either 'tier1' or 'tier2' classification
  - `url` (text) - RSS feed URL
  - `is_active` (boolean) - Whether the source is active
  - `created_at` (timestamptz) - Creation timestamp

  ### articles
  - `id` (uuid, primary key) - Unique identifier
  - `title` (text) - Article title
  - `source_name` (text) - Name of the originating source
  - `source_url` (text) - URL of the RSS source
  - `article_url` (text) - Direct link to the article
  - `metrics` (jsonb) - JSON object with 5 scoring metrics (0-5 each)
  - `total_score` (integer) - Aggregate score out of 25
  - `cto_insight` (text) - "Why it matters to a CTO" AI-generated block
  - `key_insight` (text) - "Strong idea to extract" AI-generated block
  - `status` (text) - 'pending', 'saved', or 'discarded'
  - `published_at` (timestamptz) - Original article publication date
  - `created_at` (timestamptz) - When it was processed by the radar

  ## Security
  - RLS enabled on both tables
  - Anon role granted full CRUD for MVP internal tool usage

  ## Notes
  - metrics JSONB stores: novedad, relevancia_estrategica, impacto_ejecutivo,
    aplicabilidad_enterprise, potencial_editorial (each 0-5)
  - Only articles with total_score >= 15 are surfaced in the Radar Diario view
*/

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'tier1' CHECK (category IN ('tier1', 'tier2')),
  url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_name text NOT NULL,
  source_url text NOT NULL DEFAULT '',
  article_url text NOT NULL DEFAULT '',
  metrics jsonb NOT NULL DEFAULT '{}',
  total_score integer NOT NULL DEFAULT 0,
  cto_insight text NOT NULL DEFAULT '',
  key_insight text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'saved', 'discarded')),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_total_score_idx ON articles (total_score DESC);
CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status);
CREATE INDEX IF NOT EXISTS articles_created_at_idx ON articles (created_at DESC);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read sources"
  ON sources FOR SELECT
  TO anon
  USING (auth.role() = 'anon');

CREATE POLICY "Anon users can insert sources"
  ON sources FOR INSERT
  TO anon
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Anon users can update sources"
  ON sources FOR UPDATE
  TO anon
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Anon users can delete sources"
  ON sources FOR DELETE
  TO anon
  USING (auth.role() = 'anon');

CREATE POLICY "Anon users can read articles"
  ON articles FOR SELECT
  TO anon
  USING (auth.role() = 'anon');

CREATE POLICY "Anon users can insert articles"
  ON articles FOR INSERT
  TO anon
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Anon users can update articles"
  ON articles FOR UPDATE
  TO anon
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Anon users can delete articles"
  ON articles FOR DELETE
  TO anon
  USING (auth.role() = 'anon');
