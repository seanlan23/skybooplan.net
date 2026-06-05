
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.subscription_tier AS ENUM ('free', 'one_time', 'monthly', 'yearly');
CREATE TYPE public.subscription_status AS ENUM ('active', 'cancelled', 'expired', 'pending');
CREATE TYPE public.currency_code AS ENUM ('EUR', 'USD');

-- ============ TIMESTAMP TRIGGER FN ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT DEFAULT 'en',
  preferred_currency public.currency_code DEFAULT 'EUR',
  travel_style TEXT[],
  home_city TEXT,
  country_code TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ TRIPS ============
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  destination_country TEXT,
  origin_city TEXT,
  start_date DATE,
  end_date DATE,
  travelers_adults INT DEFAULT 1,
  travelers_children INT DEFAULT 0,
  budget_amount NUMERIC(10,2),
  budget_currency public.currency_code DEFAULT 'EUR',
  travel_pace TEXT,
  notes TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own trips" ON public.trips FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own trips" ON public.trips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own trips" ON public.trips FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own trips" ON public.trips FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_trips_updated_at BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_trips_user_id ON public.trips(user_id);
CREATE INDEX idx_trips_created_at ON public.trips(created_at DESC);

-- ============ TRAVEL PLANS (AI generated, JSON body for PDF) ============
-- itinerary JSON structure:
-- {
--   "summary": "...",
--   "highlights": ["..."],
--   "days": [
--     { "day": 1, "date": "2026-07-01", "title": "Arrival in Rome",
--       "morning": {...}, "afternoon": {...}, "evening": {...},
--       "places": [{name, lat, lng, category, description, duration}],
--       "meals": [...], "tips": "..." }
--   ],
--   "flights": [{from, to, date, airline, price, skyscanner_url}],
--   "accommodations": [{name, area, nights, price, booking_url, rating}],
--   "budget_breakdown": {flights, hotels, food, activities, transport},
--   "packing_list": ["..."],
--   "practical_info": {currency, language, plug_type, emergency_number}
-- }
CREATE TABLE public.travel_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  travel_pace TEXT,
  wishes TEXT,
  itinerary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_model TEXT,
  cover_image_url TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_plans TO authenticated;
GRANT ALL ON public.travel_plans TO service_role;

ALTER TABLE public.travel_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own plans" ON public.travel_plans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own plans" ON public.travel_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own plans" ON public.travel_plans FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own plans" ON public.travel_plans FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.travel_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_plans_user_id ON public.travel_plans(user_id);
CREATE INDEX idx_plans_trip_id ON public.travel_plans(trip_id);

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  tier public.subscription_tier NOT NULL DEFAULT 'free',
  status public.subscription_status NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  price_amount NUMERIC(10,2),
  price_currency public.currency_code DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_subs_updated_at BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ DAILY PLAN USAGE (2 plans/day limit) ============
CREATE TABLE public.daily_plan_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plans_generated INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, usage_date)
);

GRANT SELECT ON public.daily_plan_usage TO authenticated;
GRANT ALL ON public.daily_plan_usage TO service_role;

ALTER TABLE public.daily_plan_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own usage" ON public.daily_plan_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_usage_updated_at BEFORE UPDATE ON public.daily_plan_usage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_usage_user_date ON public.daily_plan_usage(user_id, usage_date);
