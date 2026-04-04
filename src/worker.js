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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.WATI_REFRESH_TOKEN}` },
        body: JSON.stringify({ req: env.WATI_REFRESH_TOKEN })
      });
        if (r.ok) { const d = await r.json(); token = d.accessToken || ''; }
        else { console.log('Refresh failed:', r.status, await r.text()); }
      } catch(e) {}

      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      
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
            const updated = (o.createdUtc || '').slice(0, 10);
            const created = (o.createdUtc || '').slice(0, 10);
if (updated >= from_date && updated <= to_date) {
              const c = o.customer || {}, addr = o.incomingShippingAddress || {};
              orders.push({
                id: o.trackingId || '—',
                customer: (c.fullName || '—').trim(),
                phone: c.telephone1 || '—',
                status: o.status || '—',
                amount: String(o.total || '—'),
                date: updated, created,
                wilaya: addr.city || '—',
              });
     } else if (updated < from_date) {
              stop = true; break;
            }
          }
          if (stop) break;
          if (page >= (data.totalPages || 1)) break;
          page++;
        } catch(e) { break; }
      }

      return new Response(JSON.stringify({ orders, total: orders.length, last_update: new Date().toISOString() }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // ── FACEBOOK API ──
    if (path === '/api/facebook') {
      const from_date = url.searchParams.get('from') || new Date(Date.now()-7*86400000).toISOString().split('T')[0];
      const to_date   = url.searchParams.get('to')   || new Date().toISOString().split('T')[0];
      const TOKEN = env.FB_ACCESS_TOKEN || '';
      const ACCOUNT_ID = env.FB_AD_ACCOUNT_ID || '796078686692145';

      let campaigns = [], error_msg = '';
      try {
        const fbUrl = `https://graph.facebook.com/v19.0/act_${ACCOUNT_ID}/insights?access_token=${TOKEN}&level=campaign&fields=campaign_name,spend,impressions,clicks,reach,actions,action_values&time_range={"since":"${from_date}","until":"${to_date}"}&limit=100`;
        const r = await fetch(fbUrl);
        const data = await r.json();
        if (data.error) error_msg = data.error.message || 'FB Error';
        for (const c of data.data || []) {
          let purchases = 0, revenue = 0;
          for (const a of c.actions || []) if (a.action_type === 'purchase') purchases += parseInt(a.value || 0);
          for (const a of c.action_values || []) if (a.action_type === 'purchase') revenue += parseFloat(a.value || 0);
          const spend = parseFloat(c.spend || 0);
          campaigns.push({
            name: c.campaign_name || '—', spend,
            impressions: parseInt(c.impressions || 0),
            clicks: parseInt(c.clicks || 0),
            reach: parseInt(c.reach || 0),
            purchases, revenue,
            cpo: purchases > 0 ? Math.round(spend/purchases*100)/100 : 0,
            roas: spend > 0 ? Math.round(revenue/spend*100)/100 : 0,
            ctr: Math.round(parseInt(c.clicks||0)/Math.max(parseInt(c.impressions||1),1)*10000)/100
          });
        }
      } catch(e) { error_msg = e.message; }

      return new Response(JSON.stringify({ campaigns, total: campaigns.length, error: error_msg }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // ── AI ANALYSIS ──
    if (path === '/api/ai_analysis' && request.method === 'POST') {
      const body = await request.json();
      const campaigns = body.campaigns || [], orders = body.orders || [], period = body.period || '7 أيام';
      const total_spend = campaigns.reduce((a,c)=>a+c.spend,0);
      const total_orders = orders.length;
      const total_revenue = orders.reduce((a,o)=>a+(parseFloat(o.amount)||0),0);
      const delivered = orders.filter(o=>/deliver|مسلم|تسليم/i.test(o.status||'')).length;
      const cancelled = orders.filter(o=>/cancel|ملغ|إلغاء/i.test(o.status||'')).length;
      const delivery_rate = total_orders>0?Math.round(delivered/total_orders*1000)/10:0;
      const global_cpo = total_orders>0?Math.round(total_spend/total_orders*100)/100:0;
      const global_roas = total_spend>0?Math.round(total_revenue/total_spend*100)/100:0;
      const profit = total_revenue - total_spend;
      const camp_summary = campaigns.sort((a,b)=>b.spend-a.spend).slice(0,10).map(c=>`- ${c.name}: $${c.spend.toFixed(2)}, طلبات=${c.purchases}, CPO=$${c.cpo.toFixed(2)}, ROAS=${c.roas.toFixed(2)}`).join('\n');
      const prompt = `أنت خبير تسويق رقمي. حلل البيانات وقدم توصيات باللغة العربية.\nالفترة: ${period}\nالإنفاق: $${total_spend.toFixed(2)} | الطلبات: ${total_orders} | المبيعات: ${total_revenue.toFixed(2)} دج\nالموصل: ${delivered} (${delivery_rate}%) | الملغي: ${cancelled}\nCPO: $${global_cpo.toFixed(2)} | ROAS: ${global_roas.toFixed(2)} | الربح: ${profit.toFixed(2)} دج\nالحملات:\n${camp_summary||'لا توجد بيانات'}\nاعطني:\n1. تقييم الأداء العام\n2. أفضل حملة وأسوأ حملة\n3. 3 توصيات عملية\n4. تحذير إن وجد`;

      let analysis = '', error_msg = '';
      try {
        const r = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 1000 })
        });
        const data = await r.json();
        if (data.choices) analysis = data.choices[0].message.content;
        else if (data.error) error_msg = String(data.error);
      } catch(e) { error_msg = e.message; }

      return new Response(JSON.stringify({ analysis, error: error_msg, stats: { total_spend, total_orders, total_revenue, delivered, cancelled, delivery_rate, global_cpo, global_roas, profit } }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // ── SERVE HTML ──
    return env.ASSETS.fetch(request);
  }
};
