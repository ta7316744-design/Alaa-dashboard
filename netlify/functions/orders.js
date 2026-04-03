const fetch = require('node-fetch');

exports.handler = async (event) => {
  const params    = event.queryStringParameters || {};
  const today     = new Date();
  const week      = new Date(today - 7*86400000);
  const from_date = params.from || week.toISOString().split('T')[0];
  const to_date   = params.to   || today.toISOString().split('T')[0];

  // Auto-refresh token
  let token = '';
  try {
    const refresh = await fetch('https://api.wati.ly/auth/refresh', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WATI_REFRESH_TOKEN || ''}`
      }
    });
    if (refresh.ok) {
      const d = await refresh.json();
      token = d.accessToken || d.token || '';
    }
  } catch(e) {}

  if (!token) token = process.env.WATI_TOKEN || '';

  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Origin': 'https://app.wati.ly',
    'Referer': 'https://app.wati.ly/'
  };

  let orders = [];
  let page = 1;
  while (page <= 200) {
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
          const c    = o.customer || {};
          const addr = o.incomingShippingAddress || {};
          orders.push({
            id:       o.trackingId || '—',
            customer: (c.fullName || '—').trim(),
            phone:    c.telephone1 || '—',
            status:   o.status || '—',
            amount:   String(o.total || '—'),
            date:     updated,
            created:  created,
            wilaya:   addr.city || '—',
          });
        } else if (updated < from_date) {
          stop = true; break;
        }
      }
      if (stop) break;
      const totalPages = data.totalPages || 1;
      if (page >= totalPages) break;
      page++;
    } catch(e) { break; }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ orders, total: orders.length, last_update: new Date().toISOString(), logged_in: !!token })
  };
};
