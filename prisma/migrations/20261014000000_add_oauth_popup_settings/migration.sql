ALTER TABLE oauth_client_configs
  ADD COLUMN IF NOT EXISTS auto_prompt BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS popup_placement TEXT NOT NULL DEFAULT 'bottom-right',
  ADD COLUMN IF NOT EXISTS popup_frequency TEXT NOT NULL DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS prompt_delay INTEGER NOT NULL DEFAULT 1500;

ALTER TABLE oauth_client_configs
  ADD CONSTRAINT oauth_client_configs_popup_placement_check
    CHECK (popup_placement IN ('top-right', 'bottom-right')),
  ADD CONSTRAINT oauth_client_configs_popup_frequency_check
    CHECK (popup_frequency IN ('always', 'session', 'once')),
  ADD CONSTRAINT oauth_client_configs_prompt_delay_check
    CHECK (prompt_delay BETWEEN 0 AND 10000);
