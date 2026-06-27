-- Seed idempotente do Lar "Casa Panini": Thiago (hue 211) e Jakeline (hue 14).
-- UUIDs fixos + ON CONFLICT DO NOTHING => re-rodável sem duplicar.
INSERT INTO households (id, nome) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Casa Panini')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, household_id, email, nome, hue, inicial) VALUES
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'thiago@casapanini.lar',   'Thiago',   211, 'T'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001', 'jakeline@casapanini.lar', 'Jakeline',  14, 'J')
ON CONFLICT (id) DO NOTHING;
