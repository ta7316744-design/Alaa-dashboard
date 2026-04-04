export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── ORDERS API ──
    if (path === '/api/orders') {
      const from_date = url.searchParams.get('from') || new Date(Date.now()-7*86400000).toISOString().split('T')[0];
      const to_date   = url.searchParams.get('to')   || new Date().toISOString().split('T')[0];

      let token = '';
      try {
        const r = await fetch('https://api.wati.ly/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.WATI_REFRESH_TOKEN}` }
        });
        if (r.ok) { const d = await r.json(); token = d.accessToken || ''; }
      } catch(e) {}
      if (!token) token = env.WATI_TOKEN || '';

      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://app.wati.ly',
        'Referer': 'https://app.wati.ly/'
      };

      let orders = [], page = 1;
      while (page <= 20) {
        try {
          const r = await fetch(`https://api.wati.ly/orders?page=${page}&limit=50`, { headers });
          if (!r.ok) break;
          const data = await r.json();
          const arr = data.data || [];
          if (!arr.length) break;
          let stop = false;
          for (const o of arr) {
            const updated = (o.updatedUtc || '').slice(0, 10);
            const created = (o.createdUtc || '').slice(0, 10);
            if (updated >= from_date && updated <= to_date) {
              const c = o.customer || {}, addr = o.incomingShippingAddress || {};
              orders.push({
                id: o.trackingId || '—',
                customer: (c.fullName || '—').trim(),
                phone: c.telephone1 || '—',
                status: o.status || '—',
