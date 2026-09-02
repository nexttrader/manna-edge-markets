export function formatETTime(isoString?: string | null): string {
  if (!isoString) return '--:--:-- ET';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--:--:-- ET';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date) + ' ET';
  } catch (e) {
    return '--:--:-- ET';
  }
}

export function formatETDate(isoString?: string | null): string {
  if (!isoString) return '--/--/----';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--/--/----';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch (e) {
    return '--/--/----';
  }
}

export function formatETDateTime(isoString?: string | null): string {
  if (!isoString) return '--:--:-- ET';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--:--:-- ET';
    const datePart = formatETDate(isoString);
    const timePart = formatETTime(isoString);
    return `${datePart} · ${timePart}`;
  } catch (e) {
    return '--:--:-- ET';
  }
}

export function formatLocalTime(isoString?: string | null): string {
  if (!isoString) return '--:--:--';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--:--:--';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    return '--:--:--';
  }
}

export function formatDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return '--';
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (isNaN(start) || isNaN(end) || end < start) return '--';
  
  const diffMs = end - start;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  
  if (hours > 0) {
    return `${hours}h ${remMins}m`;
  }
  return `${mins}m`;
}
