import { API_BASE } from '../config';

export interface TelemetryEvent {
  eventType: 'page_view' | 'admin_action' | 'trader_action' | 'session_heartbeat';
  userEmail?: string;
  userRole?: string;
  userTier?: string;
  path: string;
  durationMs?: number;
  actionDetails?: {
    action: string; // e.g. 'rescan_signal', 'disable_signal', 'toggle_voice', 'add_watchlist'
    targetId?: string;
    instrument?: string;
    market?: string;
    extra?: any;
  };
  timestamp: string;
}

class TelemetryTrackerService {
  private currentPath: string = window.location.pathname;
  private pageStartTime: number = Date.now();

  constructor() {
    this.initPathTracking();
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
      // Send page exit event for old path
      this.sendEvent({
        eventType: 'page_view',
        path: oldPath,
        durationMs: duration
      });

      this.currentPath = newPath;
      this.pageStartTime = Date.now();
    }
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
