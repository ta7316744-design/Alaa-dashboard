const fetch = require('node-fetch');

exports.handler = async (event) => {
  const TOKEN      = process.env.FB_ACCESS_TOKEN || '';
  const ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID || '796078686692145';
  const params     = event.queryStringParameters || {};
  const today      = new Date();
  const week       = new Date(today - 7*86400000);
  const from_date  = params.from || week.toISOString().split('T')[0];
  const to_date    = params.to   || today.toISOString().split('T')[0];

  let campaigns = [];
  let error_msg = '';
  try {
    const url = new URL(`https://graph.facebook.com/v19.0/act_${ACCOUNT_ID}/insights`);
    url.searchParams.set('access_token', TOKEN);
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('fields', 'campaign_name,spend,impressions,clicks,reach,actions,action_values');
    url.searchParams.set('time_range', JSON.stringify({ since: from_date, until: to_date }));
    url.searchParams.set('limit', '100');

    const r    = await fetch(url.toString());
    const data = await r.json();

    if (data.error) {
      error_msg = data.error.message || 'FB API Error';
    }

    for (const c of data.data || []) {
      let purchases = 0, revenue = 0;
      for (const a of c.actions || []) {
        if (a.action_type === 'purchase') purchases += parseInt(a.value || 0);
      }
      for (const a of c.action_values || []) {
        if (a.action_type === 'purchase') revenue += parseFloat(a.value || 0);
      }
      const spend = parseFloat(c.spend || 0);
      const cpo   = purchases > 0 ? Math.round(spend / purchases * 100) / 100 : 0;
      const roas  = spend > 0 ? Math.round(revenue / spend * 100) / 100 : 0;
      campaigns.push({
        name:        c.campaign_name || '—',
        spend,
        impressions: parseInt(c.impressions || 0),
        clicks:      parseInt(c.clicks || 0),
        reach:       parseInt(c.reach || 0),
        purchases,
        revenue,
        cpo,
        roas,
        ctr: Math.round(parseInt(c.clicks||0) / Math.max(parseInt(c.impressions||1),1) * 10000) / 100
      });
    }
  } catch(e) {
    error_msg = e.message;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ campaigns, total: campaigns.length, error: error_msg, last_update: new Date().toISOString() })
  };
};
