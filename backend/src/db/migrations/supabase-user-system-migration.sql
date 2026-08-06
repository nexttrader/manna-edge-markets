-- ====================================================================
-- Manna Edge Markets — Supabase PostgreSQL Database Migration Script
-- Full User Management System Schema: Users, Subscriptions, Trials,
-- Coupons, Redemptions, Tags, Groups (Cohorts), Notifications & Audit Logs
-- ====================================================================

-- 1. Persistent Users & Subscriptions Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL DEFAULT 'temp123',
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    role TEXT NOT NULL DEFAULT 'trader', -- 'trader' | 'admin' | 'super_admin'
    tier TEXT NOT NULL DEFAULT 'futures_forex', -- 'free' | 'forex_only' | 'futures_forex' | 'vip_pro' | 'institutional'
    market_access TEXT NOT NULL DEFAULT 'all',
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'suspended' | 'paused' | 'pending_deletion' | 'expired'
    subscription_status TEXT DEFAULT 'active', -- 'active' | 'trialing' | 'paused' | 'expired' | 'canceled'
    subscription_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    subscription_end TIMESTAMP WITH TIME ZONE,
    billing_cycle TEXT DEFAULT 'monthly', -- 'monthly' | 'yearly' | 'custom' | 'lifetime'
    auto_renew BOOLEAN DEFAULT TRUE,
    pause_start_date TIMESTAMP WITH TIME ZONE,
    pause_resume_date TIMESTAMP WITH TIME ZONE,
    paused_remaining_days INTEGER DEFAULT 0,
    is_trial BOOLEAN DEFAULT FALSE,
    trial_started_at TIMESTAMP WITH TIME ZONE,
    trial_expires_at TIMESTAMP WITH TIME ZONE,
    trial_days_total INTEGER DEFAULT 21,
    trial_days_remaining INTEGER DEFAULT 21,
    trial_expired BOOLEAN DEFAULT FALSE,
    trial_extended_count INTEGER DEFAULT 0,
    preferred_market TEXT DEFAULT 'Both',
    risk_limit TEXT DEFAULT '1%',
    signals_viewed INTEGER DEFAULT 0,
    watchlist_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active TEXT DEFAULT 'Pending First Login',
    deleted_at TIMESTAMP WITH TIME ZONE,
    purge_at TIMESTAMP WITH TIME ZONE,
    days_remaining INTEGER
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON user_profiles(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription ON user_profiles(subscription_status, subscription_end);

-- 2. Coupon Codes Table
CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' | 'fixed_amount' | 'trial_extension' | 'tier_upgrade'
    discount_value DOUBLE PRECISION NOT NULL,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    max_redemptions INTEGER DEFAULT 100,
    current_redemptions INTEGER DEFAULT 0,
    per_user_limit INTEGER DEFAULT 1,
    applicable_tiers TEXT DEFAULT 'all', -- CSV or 'all'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'disabled' | 'expired'
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- 3. Coupon Redemptions Table
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id TEXT PRIMARY KEY,
    coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    coupon_code TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    discount_applied TEXT NOT NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);

-- 4. User Tags Table
CREATE TABLE IF NOT EXISTS user_tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. User Tag Mappings
CREATE TABLE IF NOT EXISTS user_tag_mappings (
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tag_id)
);

-- 6. User Groups (Cohorts) Table
CREATE TABLE IF NOT EXISTS user_groups (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    tier_assignment TEXT DEFAULT 'futures_forex',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. User Group Mappings
CREATE TABLE IF NOT EXISTS user_group_mappings (
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, group_id)
);

-- 8. Notifications Table (In-app + Sent Logs)
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'trial_expiring' | 'sub_expiring' | 'sub_paused' | 'sub_resumed' | 'coupon_applied' | 'announcement'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- 9. Notification Trigger Rules
CREATE TABLE IF NOT EXISTS notification_triggers (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL UNIQUE, -- 'trial_warning_7d' | 'trial_warning_3d' | 'trial_warning_1d' | 'sub_warning_7d' | 'sub_warning_3d' | 'sub_warning_1d'
    threshold_days INTEGER NOT NULL,
    template_title TEXT NOT NULL,
    template_body TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. System Admin Audit Logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_email TEXT NOT NULL,
    admin_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT,
    details_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON admin_audit_logs(created_at DESC);
