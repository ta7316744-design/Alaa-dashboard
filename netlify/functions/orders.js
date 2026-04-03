const fetch = require('node-fetch');

exports.handler = async (event) => {
  const params    = event.queryStringParameters || {};
  const today     = new Date();
  const week      = new Date(today - 7*86400000);
  const from_date = params.from || week.toISOString().split('T')[0];
  const to_date   = params.to   || today.toISOString().split('T')[0];

  let token = '';
  try {
    const r = await fetch('https://api.wati.ly/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WATI_REFRESH_TOKEN || ''}`
      }
    });
    if (r.ok) {
      const d = await r.json();
      token = d.accessToken || '';
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
          sto
