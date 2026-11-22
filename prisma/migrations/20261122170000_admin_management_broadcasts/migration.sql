-- Delegated MAX Auth administration and user broadcasts.
CREATE TABLE IF NOT EXISTS public.admin_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  role VARCHAR(40) NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  full_access BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_access_is_active_idx ON public.admin_access(is_active);

CREATE TABLE IF NOT EXISTS public.admin_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  body VARCHAR(12000) NOT NULL,
  audience VARCHAR(20) NOT NULL,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_broadcasts_created_at_idx ON public.admin_broadcasts(created_at);

CREATE TABLE IF NOT EXISTS public.admin_broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.admin_broadcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  email_error VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_broadcast_recipients_broadcast_user_key UNIQUE (broadcast_id, user_id)
);
CREATE INDEX IF NOT EXISTS admin_broadcast_recipients_user_created_idx ON public.admin_broadcast_recipients(user_id, created_at);

-- Preserve the existing primary owner as the only automatically provisioned full-access admin.
UPDATE public.users SET "isAdmin" = TRUE WHERE username = 'zionopaaje';
INSERT INTO public.admin_access (user_id, role, permissions, full_access, is_active)
SELECT id, 'SUPER_ADMIN', ARRAY[]::TEXT[], TRUE, TRUE
FROM public.users
WHERE username = 'zionopaaje'
ON CONFLICT (user_id) DO UPDATE SET role = 'SUPER_ADMIN', full_access = TRUE, is_active = TRUE;
