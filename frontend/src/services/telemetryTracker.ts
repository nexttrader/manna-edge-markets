import { API_BASE } from '../config';

export interface TelemetryEvent {
  eventType: 'page_view' | 'admin_action' | 'trader_action' | 'session_heartbeat' | 'feature_click';
  userEmail?: string;
  userRole?: string;
  userTier?: string;
  path: string;
  durationMs?: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  refSource?: string;
  actionDetails?: {
    action: string;
    instrument?: string;
    targetId?: string;
    extra?: any;
  };
  timestamp: string;
}

class TelemetryTrackerService {
  private currentPath: string = window.location.pathname;
  private pageStartTime: number = Date.now();
  private utmSource: string = '';
  private utmMedium: string = '';
  private utmCampaign: string = '';
  private refSource: string = '';

  constructor() {
    this.initUtmParams();
    this.initPathTracking();
  }

  private initUtmParams() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get('utm_source') || urlParams.get('ref');
      const medium = urlParams.get('utm_medium');
      const campaign = urlParams.get('utm_campaign');
      const ref = document.referrer;

      if (source) {
        this.utmSource = source;
        localStorage.setItem('manna_utm_source', source);
      } else {
        this.utmSource = localStorage.getItem('manna_utm_source') || '';
      }

      if (medium) {
        this.utmMedium = medium;
        localStorage.setItem('manna_utm_medium', medium);
      } else {
        this.utmMedium = localStorage.getItem('manna_utm_medium') || '';
      }

      if (campaign) {
        this.utmCampaign = campaign;
        localStorage.setItem('manna_utm_campaign', campaign);
      } else {
        this.utmCampaign = localStorage.getItem('manna_utm_campaign') || '';
      }

      if (ref) {
        this.refSource = ref;
        localStorage.setItem('manna_ref_source', ref);
      } else {
        this.refSource = localStorage.getItem('manna_ref_source') || '';
      }
    } catch {}
  }

  private getUserInfo() {
    try {
      const saved = localStorage.getItem('manna_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          email: parsed.email || 'anonymous',
          role: parsed.role || 'trader',
          tier: parsed.tier || 'free'
        };
      }
    } catch {}
    return { email: 'guest@mannaedge.com', role: 'trader', tier: 'free' };
  }

  private sendEvent(event: Partial<TelemetryEvent>) {
    const userInfo = this.getUserInfo();
    const payload: TelemetryEvent = {
      eventType: event.eventType || 'page_view',
      userEmail: userInfo.email,
      userRole: userInfo.role,
      userTier: userInfo.tier,
      path: event.path || this.currentPath,
      durationMs: event.durationMs || 0,
      utmSource: this.utmSource,
      utmMedium: this.utmMedium,
      utmCampaign: this.utmCampaign,
      refSource: this.refSource,
      actionDetails: event.actionDetails,
      timestamp: new Date().toISOString()
    };

    fetch(`${API_BASE}/api/super-admin/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Non-blocking background telemetry send
    });
  }

  private initPathTracking() {
    // Send heartbeat every 30 seconds to track online status
    setInterval(() => {
      const duration = Date.now() - this.pageStartTime;
      this.sendEvent({
        eventType: 'session_heartbeat',
        path: window.location.pathname,
        durationMs: duration
      });
    }, 30000);
  }

  public trackPageView(newPath: string) {
    const duration = Date.now() - this.pageStartTime;
    const oldPath = this.currentPath;

    if (oldPath !== newPath) {
      this.sendEvent({
        eventType: 'page_view',
        path: oldPath,
        durationMs: duration
      });

      this.currentPath = newPath;
      this.pageStartTime = Date.now();
    }
  }

  public trackFeatureClick(featureName: string, extra?: any) {
    this.sendEvent({
      eventType: 'feature_click',
      path: window.location.pathname,
      actionDetails: {
        action: `feature_${featureName}`,
        extra
      }
    });
  }

  public trackAdminAction(action: string, instrument?: string, targetId?: string, extra?: any) {
    this.sendEvent({
      eventType: 'admin_action',
      path: window.location.pathname,
      actionDetails: {
        action,
        instrument,
        targetId,
        extra
      }
    });
  }

  public trackTraderAction(action: string, instrument?: string, targetId?: string, extra?: any) {
    this.sendEvent({
      eventType: 'trader_action',
      path: window.location.pathname,
      actionDetails: {
        action,
        instrument,
        targetId,
        extra
      }
    });
  }
}

export const telemetryTracker = new TelemetryTrackerService();
