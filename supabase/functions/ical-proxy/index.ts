const ICAL_URLS = [
  'https://p39-caldav.icloud.com/published/2/OTE4MDI4ODg5MTgwMjg4OOCp0P2o51yKGRORXO0xc4HyjC3W4P9EV3FXSHNqIKWQBV_YFH16bccEUEs0TnhTnfqO1_fYkPCNWuSCSgqaOJc',
  'https://p39-caldav.icloud.com/published/2/OTE4MDI4ODg5MTgwMjg4OOCp0P2o51yKGRORXO0xc4EE1NvuaNNxXLZ6yNRNsAUckvSs04SHBDah1_5nyRvqbpVWPrAc8Wn25RWZ-jq-zHI',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'apikey, Authorization',
};

interface CalEvent {
  date: string;     // YYYY-MM-DD start
  endDate: string;  // YYYY-MM-DD end (exclusive for all-day per RFC 5545)
  title: string;
  allDay: boolean;
  startTime?: string; // HH:MM
  endTime?: string;
}

function parseDateVal(val: string): { date: string; time?: string; allDay: boolean } {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(val);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, allDay: true };
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(val);
  if (dateTime) {
    return {
      date: `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`,
      time: `${dateTime[4]}:${dateTime[5]}`,
      allDay: false,
    };
  }
  return { date: val, allDay: true };
}

function parseIcal(text: string): CalEvent[] {
  const events: CalEvent[] = [];
  const blocks = text.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    // Unfold continued lines (RFC 5545: continuation starts with space or tab)
    const unfolded = blocks[i].replace(/\r?\n[ \t]/g, '');
    const props: Record<string, string> = {};

    for (const line of unfolded.split(/\r?\n/)) {
      // Match PROPNAME or PROPNAME;PARAMS:value
      const m = line.match(/^([A-Z-]+)(?:;[^:]+)?:(.*)$/);
      if (m) props[m[1]] = m[2].trim();
    }

    if (!props['DTSTART'] || !props['SUMMARY']) continue;

    const start = parseDateVal(props['DTSTART']);
    const end   = props['DTEND'] ? parseDateVal(props['DTEND']) : start;

    events.push({
      date:      start.date,
      endDate:   end.date,
      title:     props['SUMMARY']
                   .replace(/\\,/g, ',')
                   .replace(/\\n/g, ' ')
                   .replace(/\\/g, ''),
      allDay:    start.allDay,
      startTime: start.time,
      endTime:   end.time,
    });
  }

  return events;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const month = new URL(req.url).searchParams.get('month'); // YYYY-MM, optional

    const responses = await Promise.all(ICAL_URLS.map(url => fetch(url)));
    for (const res of responses) {
      if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`);
    }
    const texts = await Promise.all(responses.map(r => r.text()));

    let events = texts.flatMap(parseIcal);

    if (month) {
      const monthStart = month + '-01';
      const monthEnd   = month + '-31';
      events = events.filter(e => e.date <= monthEnd && (e.endDate || e.date) >= monthStart);
    }

    return new Response(JSON.stringify({ events }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
