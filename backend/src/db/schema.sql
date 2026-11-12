-- Esquema do banco. Idempotente: pode rodar várias vezes.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(30)  NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL CHECK (role IN ('ADMIN', 'MEMBRO')),
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entries (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER     NOT NULL REFERENCES users(id),
  before_url       TEXT        NOT NULL,
  before_public_id TEXT        NOT NULL,
  after_url        TEXT        NOT NULL,
  after_public_id  TEXT        NOT NULL,
  qty_done         INTEGER     NOT NULL CHECK (qty_done >= 0),
  qty_banned       INTEGER     NOT NULL CHECK (qty_banned >= 0),
  description      TEXT,
  status           VARCHAR(10) NOT NULL DEFAULT 'PENDENTE'
                   CHECK (status IN ('PENDENTE', 'APROVADO', 'REPROVADO')),
  admin_comment    TEXT,
  reviewed_by      INTEGER     REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  -- false quando o admin avalia e o membro ainda não viu o aviso
  member_seen      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reprovado_exige_comentario CHECK (
    status <> 'REPROVADO' OR (admin_comment IS NOT NULL AND length(btrim(admin_comment)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_entries_user_created ON entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries (status);
CREATE INDEX IF NOT EXISTS idx_entries_unseen ON entries (user_id) WHERE member_seen = FALSE;

-- Cada linha = uma quitação feita pelo admin (quantos pagamentos foram pagos de uma vez)
CREATE TABLE IF NOT EXISTS payments (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id),
  quantity   INTEGER     NOT NULL CHECK (quantity > 0),
  paid_by    INTEGER     REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at DESC);

-- Supabase expõe o schema public pela API REST (chave anon/publishable).
-- RLS ligado e sem políticas = ninguém acessa por lá. O backend conecta como
-- dono das tabelas e não é afetado.
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Marca de "última alteração" do lançamento: usada pela atualização automática
-- das telas (o navegador pergunta periodicamente se algo mudou).
ALTER TABLE entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entries_touch_updated_at ON entries;
CREATE TRIGGER entries_touch_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
