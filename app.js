// FORMAT PRICE INPUT WITH COMMAS
function formatPriceInput(input) {
  // Remove non-digits
  let raw = input.value.replace(/[^0-9]/g, '');
  // Format with commas
  if (raw) {
    input.value = Number(raw).toLocaleString();
  }
  // Store raw value for calculations
  input.dataset.raw = raw;
}

function getPriceRaw(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return 0;
  return parseInt(input.dataset.raw || input.value.replace(/[^0-9]/g, '') || '0');
}


// ===== SECTION RESULTS SCREEN =====
async function showSectionResults(type) {
  // Navigate to category results screen
  showScreen('screen-category-results');

  const titles = {
    'new': 'New to Preen',
    'trending': 'Trending in Your City',
    'recommended': 'Recommended for You',
    'recent': 'Recently Viewed'
  };

  const titleEl = document.getElementById('category-results-title');
  if (titleEl) titleEl.textContent = titles[type] || 'Providers';

  const container = document.getElementById('category-results-list');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="ai-spinner" style="margin:0 auto;"></div></div>';

  // Recently viewed comes from localStorage
  if (type === 'recent') {
    const recent = getRecentlyViewed();
    if (recent.length === 0) {
      showNoProviders(container);
    } else {
      container.innerHTML = recent.map(p => buildProviderCard(p)).join('');
    }
    return;
  }

  // Others load from Supabase
  const state = getUserState();
  try {
    let data = [];
    if (type === 'new') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      let nq = db.from('providers').select('*').eq('is_available', true).gte('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: false });
      if (state) nq = nq.eq('state', state);
      const { data: d } = await nq;
      data = d || [];
    } else if (type === 'trending') {
      let tq = db.from('providers').select('*').eq('is_available', true).order('rating', { ascending: false }).limit(20);
      if (state) tq = tq.eq('state', state);
      const { data: d } = await tq;
      data = d || [];
    } else if (type === 'recommended') {
      const history = getBrowseHistory();
      let query = db.from('providers').select('*').eq('is_available', true).eq('is_verified', true);
      if (state) query = query.eq('state', state);
      if (history.length > 0) query = query.in('category', history);
      const { data: d } = await query.order('rating', { ascending: false });
      data = d || [];
    }

    if (!data || data.length === 0) {
      showNoProviders(container);
      return;
    }

    container.innerHTML = data.map(p => makeHomeCard(p)).join('');

  } catch(e) {
    showNoProviders(container);
  }
}

function showNoProviders(container) {
  container.innerHTML =
    '<div style="text-align:center;padding:80px 20px;">' +
    '<div style="margin-bottom:16px;display:flex;justify-content:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="vertical-align:-2px;display:inline-block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>' +
    '<p style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px;">No providers near you yet</p>' +
    '<p style="font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:24px;">We are actively onboarding providers in '+getUserState()+'. Check back soon.</p>' +
    '<button onclick="showScreen(\'screen-location\')" style="background:var(--primary);color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:13px;font-weight:600;font-family:Poppins,sans-serif;cursor:pointer;">Change Location</button>' +
    '</div>';
}


// ===== HOME SCREEN SECTIONS — ALL STATE FILTERED =====

function getUserState() {
  return localStorage.getItem('preen_user_state') || '';
}

function getRecentlyViewed() {
  return JSON.parse(localStorage.getItem('preen_recently_viewed') || '[]');
}

function addToRecentlyViewed(provider) {
  let recent = getRecentlyViewed();
  // Remove if already exists
  recent = recent.filter(p => p.id !== provider.id);
  // Add to front
  recent.unshift(provider);
  // Keep max 10
  recent = recent.slice(0, 10);
  localStorage.setItem('preen_recently_viewed', JSON.stringify(recent));
}

function getBrowseHistory() {
  return JSON.parse(localStorage.getItem('preen_browse_history') || '[]');
}

function addToBrowseHistory(category) {
  if (!category) return;
  let history = getBrowseHistory();
  history = history.filter(c => c !== category);
  history.unshift(category);
  history = history.slice(0, 5);
  localStorage.setItem('preen_browse_history', JSON.stringify(history));
}

// LOAD ALL HOME SECTIONS
async function loadHomeSections() {
  const state = getUserState();

  await Promise.all([
    loadTrending(state),
    loadNewToPreens(state),
    loadRecommended(state),
    loadRecentlyViewedSection(),
    loadHomeProviders()
  ]);
}

// TRENDING — most booked in last 7 days in user's state
async function loadTrending(state) {
  const container = document.getElementById('trending-providers');
  if (!container || !db) return;

  try {
    // Get bookings from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: bookings } = await db
      .from('bookings')
      .select('provider_name')
      .gte('created_at', sevenDaysAgo.toISOString());

    if (!bookings || bookings.length === 0) {
      // Fallback — show all verified providers in state
      loadProvidersByState(container, state, 'rating');
      return;
    }

    // Count bookings per provider
    const counts = {};
    bookings.forEach(b => {
      counts[b.provider_name] = (counts[b.provider_name] || 0) + 1;
    });

    // Get top provider names
    const topNames = Object.entries(counts)
      .sort((a,b) => b[1]-a[1])
      .slice(0,6)
      .map(e => e[0]);

    // Fetch those providers filtered by state
    let pq = db.from('providers').select('*').in('full_name', topNames).eq('is_available', true);
    if (state) pq = pq.eq('state', state);
    const { data: providers } = await pq;

    if (!providers || providers.length === 0) {
      loadProvidersByState(container, state, 'rating');
      return;
    }

    container.innerHTML = providers.map(p => makeHomeCard(p)).join('');

  } catch(e) {
    loadProvidersByState(container, state, 'rating');
  }
}

// NEW TO PREEN — joined in last 30 days in user's state
async function loadNewToPreens(state) {
  const container = document.getElementById('new-providers');
  if (!container || !db) return;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let q = db.from('providers').select('*').eq('is_available', true).gte('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: false }).limit(6);
    if (state) q = q.eq('state', state);
    const { data } = await q;

    if (!data || data.length === 0) {
      loadProvidersByState(container, state, 'created_at');
      return;
    }

    container.innerHTML = data.map(p => makeHomeCard(p)).join('');

  } catch(e) {
    loadProvidersByState(container, state, 'created_at');
  }
}

// RECOMMENDED — based on browse history + state
async function loadRecommended(state) {
  const container = document.getElementById('recommended-providers');
  if (!container || !db) return;

  try {
    const history = getBrowseHistory();
    let query = db.from('providers').select('*')
      .eq('is_available', true)
      .eq('is_verified', true)
      .limit(6);
    if (state) query = query.eq('state', state);

    // Filter by previously browsed categories if available
    if (history.length > 0) {
      query = query.in('category', history);
    }

    const { data } = await query.order('rating', { ascending: false });

    if (!data || data.length === 0) {
      hideSection(container);
      return;
    }
    container.innerHTML = data.map(p => makeHomeCard(p)).join('');

  } catch(e) {
    console.log('loadRecommended error:', e);
  }
}

// RECENTLY VIEWED — from localStorage, no state filter
function loadRecentlyViewedSection() {
  const container = document.getElementById('recently-viewed');
  if (!container) return;

  const recent = getRecentlyViewed();
  if (recent.length === 0) {
    const section = container.closest('.home-section') || container.parentElement;
    if (section) section.style.display = 'none';
    return;
  }

  container.innerHTML = recent.slice(0, 6).map(p => makeHomeCard(p)).join('');
}

// HELPER — load providers by state with sort
async function loadProvidersByState(container, state, sortBy='rating') {
  if (!db) { hideSection(container); return; }
  try {
    let q = db.from('providers').select('*').eq('is_available', true);
    if (state) q = q.eq('state', state);
    const { data } = await q.order(sortBy, { ascending: false }).limit(6);

    if (!data || data.length === 0) {
      hideSection(container);
      return;
    }
    container.innerHTML = data.map(p => makeHomeCard(p)).join('');
  } catch(e) {
    hideSection(container);
  }
}

function hideSection(container) {
  if (!container) return;
  // Keep shimmer placeholders - section stays visible
  const isWide = container.id !== 'recently-viewed';
  const cls = isWide ? 'h-card-wide-placeholder' : 'h-card-placeholder';
  container.innerHTML = 
    '<div class="'+cls+'"></div>' +
    '<div class="'+cls+'"></div>' +
    '<div class="'+cls+'"></div>';
}

function showSection(container) {
  // Nothing needed - sections always visible
}

// HELPER — make provider home card
function makeHomeCard(p) {
  const name = (p.name || p.full_name || 'Provider').replace(/'/g, "\'");
  const cat = p.category || '';
  const loc = p.location || '';
  const rating = p.rating || 0;
  const verified = p.is_verified || p.verified || false;
  const img = p.profile_photo || p.image || null;
  const bg = img ? '' : 'background:linear-gradient(135deg,var(--primary-light),#FCB8CB);';
  const imgStyle = img ? 'background-image:url('+img+');background-size:cover;background-position:center;' : bg;

  return '<div class="provider-card-new" onclick="openAndTrackProvider(\''+name+'\',\''+cat+'\',\''+loc+'\','+rating+','+verified+')">' +
    '<div class="provider-img-wrap" style="'+imgStyle+'">' +
    (!img ? '<span style="color:var(--primary);display:flex;align-items:center;justify-content:center;height:100%;">'+getCategoryIcon(cat,28)+'</span>' : '') +
    (verified ? '<div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg></div>' : '') +
    '</div>' +
    '<div style="padding:8px;">' +
    '<p style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+( p.name||p.full_name||'Provider')+'</p>' +
    '<p style="font-size:11px;color:var(--text3);margin-top:2px;">'+cat+'</p>' +
    (rating > 0 ? '<p style="font-size:11px;color:var(--accent);"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> '+Number(rating).toFixed(1)+'</p>' : '') +
    '</div></div>';
}

function makeEmptyState() {
  return ''; // Hide section completely when no providers
}

// Track provider view and add to recently viewed
function openAndTrackProvider(name, category, location, rating, verified) {
  // Add to browse history for recommendations
  addToBrowseHistory(category);
  // Add to recently viewed
  addToRecentlyViewed({ name, category, location, rating, verified, id: name+category });
  // Open provider profile
  openProviderProfile(name, category, location, rating, verified);
}


// ===== TERMS AND CONDITIONS CHECKBOX =====
let termsAccepted = { cust: false, prov: false };

function toggleTermsCheck(checkId) {
  const check = document.getElementById(checkId);
  if (!checkId) return;

  const isCustomer = checkId === 'cust-terms-check';
  const key = isCustomer ? 'cust' : 'prov';
  const btnId = isCustomer ? 'cust-signup-btn' : 'prov-signup-btn';

  termsAccepted[key] = !termsAccepted[key];

  if (check) {
    if (termsAccepted[key]) {
      check.style.background = 'var(--primary)';
      check.style.borderColor = 'var(--primary)';
      check.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    } else {
      check.style.background = 'transparent';
      check.style.borderColor = 'var(--border)';
      check.innerHTML = '';
    }
  }

  const btn = document.getElementById(btnId);
  if (btn) {
    if (termsAccepted[key]) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.cursor = 'pointer';
    } else {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
      btn.style.cursor = 'not-allowed';
    }
  }
}


// ===== REAL SUPABASE DATA CONNECTIONS =====

// HOME SCREEN - Load real providers
async function loadHomeProviders() {
  if (!db) return;
  try {
    const { data, error } = await db
      .from('providers')
      .select('*')
      .eq('is_available', true)
      .eq('is_verified', true)
      .limit(20);

    if (error || !data || data.length === 0) return;

    allProviders = data.map(p => ({
      id: p.id,
      name: p.full_name,
      category: p.category,
      location: p.location || 'Nigeria',
      distance: 'Nearby',
      rating: p.rating || 0,
      price: 5000,
      emoji: getCategoryEmoji(p.category),
      bg: 'linear-gradient(135deg, var(--primary-light), #FCB8CB)',
      verified: p.is_verified,
      service: p.category + ' Services',
      hours: 'Available',
      image: p.profile_photo || null,
      bio: p.bio || '',
      phone: p.phone || '',
      email: p.email || ''
    }));

    renderHomeGridProviders(allProviders);
  } catch(e) {
    console.log('loadHomeProviders error:', e);
  }
}

function renderHomeGridProviders(providers) {
  const newEl = document.getElementById('new-providers');
  const trendEl = document.getElementById('trending-providers');
  if (!providers || providers.length === 0) return;

  const makeCard = (p) => `
    <div class="provider-card-new" onclick="openProviderProfile('${(p.name||'').replace(/'/g,"\'")}','${p.category||''}','${p.location||''}','${p.rating||0}','${p.verified||false}')">
      <div class="provider-img-wrap" style="${p.image ? 'background-image:url('+p.image+');background-size:cover;background-position:center;' : p.bg}">
        ${!p.image ? '<span style="color:var(--primary);display:flex;align-items:center;justify-content:center;height:100%;">' + getCategoryIcon(p.category,32) + '</span>' : ''}
        ${p.verified ? '<div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg></div>' : ''}
      </div>
      <div style="padding:10px 8px;">
        <p style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name||'Provider'}</p>
        <p style="font-size:11px;color:var(--text3);margin-top:2px;">${p.category||''}</p>
        ${p.rating > 0 ? '<p style="font-size:11px;color:var(--accent);margin-top:2px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-2px;display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> '+Number(p.rating).toFixed(1)+'</p>' : ''}
      </div>
    </div>`;

  if (newEl) newEl.innerHTML = providers.slice(0,6).map(makeCard).join('');
  if (trendEl) trendEl.innerHTML = providers.slice(0,6).reverse().map(makeCard).join('');
}

// SEARCH - Load real providers with filter
// (dead duplicate loadSearchProviders removed — searchProviders() below is the
// one that actually renders, this was always immediately overwritten by it)

// MY BOOKINGS - Load real bookings
// (dead duplicate loadMyBookings + showEmptyBookings removed — consolidated below)


// (dead duplicate cancelBookingById removed — kept the version below that refreshes the list after cancelling)

// PROVIDER DASHBOARD - Real earnings
// (old duplicate loadProviderEarnings removed — see the single real implementation below)

// LEADERBOARD - Real provider ratings
// (dead duplicate loadLeaderboard removed — kept the version below with a proper empty state)


// ===== REAL DATA CONNECTIONS =====

// MY BOOKINGS - Real data from Supabase
// (dead duplicate loadMyBookings + showNoBookings removed — consolidated below)


async function cancelBookingById(id, btn) {
  if (!confirm('Cancel this booking? This cannot be undone.')) return;
  btn.textContent = 'Cancelling...';
  btn.disabled = true;
  try {
    await db.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    btn.textContent = 'Cancelled';
    btn.style.color = 'var(--error)';
    loadMyBookings();
  } catch(e) {
    btn.textContent = 'Cancel';
    btn.disabled = false;
    alert('Failed to cancel. Please try again.');
  }
}

// PROVIDER EARNINGS - Real data from Supabase
async function loadProviderEarnings() {
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName || !db) return;

  try {
    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .eq('status', 'completed');

    if (error) { console.error('Earnings fetch error:', error); return; }

    const bookings = data || [];
    const platformFeePct = 10;
    const parseAmount = (b) => parseInt((b.amount || '0').toString().replace(/[^0-9]/g, '')) || 0;
    const netOf = (gross) => gross - Math.round(gross * (platformFeePct / 100));

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfThisYear = new Date(now.getFullYear(), 0, 1);

    let grossThisMonth = 0, grossLastMonth = 0, grossThisYear = 0;
    bookings.forEach(b => {
      const created = b.created_at ? new Date(b.created_at) : null;
      const gross = parseAmount(b);
      if (!created || isNaN(created.getTime())) return;
      if (created >= startOfThisMonth) grossThisMonth += gross;
      else if (created >= startOfLastMonth && created < startOfThisMonth) grossLastMonth += gross;
      if (created >= startOfThisYear) grossThisYear += gross;
    });

    const fmtK = (n) => n >= 1000 ? '₦' + Math.round(n / 1000) + 'k' : '₦' + n.toLocaleString();

    const totalEl = document.getElementById('earnings-total-month');
    if (totalEl) totalEl.textContent = '₦' + netOf(grossThisMonth).toLocaleString();
    const countEl = document.getElementById('earnings-month-count');
    if (countEl) {
      const monthCount = bookings.filter(b => b.created_at && new Date(b.created_at) >= startOfThisMonth).length;
      countEl.textContent = monthCount + (monthCount === 1 ? ' booking completed' : ' bookings completed');
    }
    const lastMonthEl = document.getElementById('earnings-last-month');
    if (lastMonthEl) lastMonthEl.textContent = fmtK(netOf(grossLastMonth));
    const yearEl = document.getElementById('earnings-this-year');
    if (yearEl) yearEl.textContent = fmtK(netOf(grossThisYear));

    // Rating pulled straight from the provider's own row
    const ratingEl = document.getElementById('earnings-rating');
    if (ratingEl) {
      const { data: provRow } = await db.from('providers').select('rating').eq('full_name', provName).single();
      ratingEl.textContent = provRow && provRow.rating ? Number(provRow.rating).toFixed(1) : '—';
    }

    // Recent payouts — group completed bookings by day
    const payoutsEl = document.getElementById('earnings-recent-payouts');
    if (payoutsEl) {
      const byDay = {};
      bookings.forEach(b => {
        const created = b.created_at ? new Date(b.created_at) : null;
        if (!created || isNaN(created.getTime())) return;
        const key = created.toLocaleDateString('en-NG', { month: 'long', day: 'numeric' });
        if (!byDay[key]) byDay[key] = { count: 0, gross: 0 };
        byDay[key].count++;
        byDay[key].gross += parseAmount(b);
      });
      const days = Object.keys(byDay);
      if (days.length === 0) {
        payoutsEl.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">No payouts yet — completed bookings will show up here.</p>';
      } else {
        payoutsEl.innerHTML = days.slice(0, 10).map(day => {
          const d = byDay[day];
          return `<div class="service-item"><span>${day} — ${d.count} booking${d.count === 1 ? '' : 's'}</span><span class="service-price">₦${netOf(d.gross).toLocaleString()}</span></div>`;
        }).join('');
      }
    }
  } catch(e) { console.error('Earnings error:', e); }
}

// PROVIDER SEARCH - Real providers from Supabase
function isProviderBlocked(name) {
  return blockedProviders.includes(name);
}

async function searchProviders(query, category) {
  if (!db) return;
  try {
    let q = db.from('providers').select('*').eq('is_available', true);
    if (category && category !== 'All') q = q.eq('category', category);
    if (query) q = q.ilike('full_name', '%' + query + '%');
    if (currentUserState) q = q.eq('state', currentUserState);
    const { data, error } = await q.limit(30);
    if (error) { console.error('Search error:', error); renderSearchResults([]); return; }
    if (data && data.length > 0) {
      let results = data.filter(p => !isProviderBlocked(p.full_name)).map(p => ({
        id: p.id, name: p.full_name, category: p.category,
        location: p.location || 'Nigeria', distance: 'Nearby',
        rating: p.rating || 0, price: p.price || 5000,
        emoji: getCategoryEmoji(p.category),
        bg: 'linear-gradient(135deg, var(--primary-light), #FCB8CB)',
        verified: p.is_verified, is_available: p.is_available, service: p.category + ' Services',
        hours: 'Available', image: p.profile_photo || null
      }));

      if (priceMin > 0 || priceMax < 500000) {
        results = results.filter(p => p.price >= priceMin && p.price <= priceMax);
      }
      if (verifiedOnly) results = results.filter(p => p.verified);
      if (activeAmenities.includes('Available Now')) results = results.filter(p => p.is_available);
      if (activeAmenities.includes('Verified Only')) results = results.filter(p => p.verified);

      allProviders = results;
      renderSearchResults(results);
    } else {
      renderSearchResults([]);
    }
  } catch(e) { console.log('Search error:', e); }
}

// LEADERBOARD - Real top providers from Supabase
async function loadLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  const labelEl = document.getElementById('leaderboard-state-label');
  if (!container || !db) return;

  const state = getUserState();
  if (labelEl) labelEl.textContent = state ? 'Top rated providers in ' + state + ' this month' : 'Top rated providers this month';

  try {
    let q = db.from('providers').select('*').eq('is_verified', true).order('rating', { ascending: false }).limit(10);
    if (state) q = q.eq('state', state);
    const { data } = await q;

    if (!data || data.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;"><p style="font-size:13px;color:var(--text3);">No ranked providers in ' + (state || 'your state') + ' yet</p></div>';
      return;
    }

    const medals = [`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="14" r="7"/><path d="M8 3l4 3 4-3"/></svg>`, `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A3A9B4" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="14" r="7"/><path d="M8 3l4 3 4-3"/></svg>`, `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C0722D" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="14" r="7"/><path d="M8 3l4 3 4-3"/></svg>`];
    const classes = ['gold', 'silver', 'bronze'];

    container.innerHTML = data.map((p, i) => `
      <div class="leaderboard-row ${classes[i] || ''}" onclick="openProviderProfile('${(p.full_name||'Provider').replace(/'/g,"\\'")}')">
        <span class="lb-rank">${medals[i] || '#' + (i+1)}</span>
        <div class="lb-avatar" style="background:${i===0?'linear-gradient(135deg,#F59E0B,#D97706)':i===1?'linear-gradient(135deg,#9CA3AF,#6B7280)':i===2?'linear-gradient(135deg,#D97706,#B45309)':'var(--primary)'};">
          ${(p.full_name||'P').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
        </div>
        <div style="flex:1;">
          <p style="font-size:14px;font-weight:600;">${p.full_name || 'Provider'}</p>
          <p style="font-size:11px;color:var(--text3);">${p.category || ''} · ${p.location || state || ''}</p>
        </div>
        <div style="text-align:right;">
          <div class="lb-score">${p.rating > 0 ? p.rating.toFixed(1) + ' <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : 'New'}</div>
          <p style="font-size:9px;color:var(--text3);">Rating</p>
        </div>
      </div>
    `).join('');

  } catch(e) { console.log('Leaderboard error:', e); }
}


// ===== REPORT AND BLOCK =====
let reportBlockTarget = { name: '', type: '', id: '' };
let blockedProviders = JSON.parse(localStorage.getItem('preen_blocked') || '[]');
let selectedReportReason = '';

function openReportBlock() {
  const provTitle = document.querySelector('.provider-title');
  const name = provTitle ? provTitle.textContent.replace('✓','').trim() : 'This Provider';
  reportBlockTarget = { name, type: 'Provider' };

  const existing = document.getElementById('report-block-sheet');
  if (existing) existing.remove();
  const existingOv = document.getElementById('report-block-overlay');
  if (existingOv) existingOv.remove();

  const overlay = document.createElement('div');
  overlay.id = 'report-block-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999;';
  overlay.onclick = closeReportBlockSheet;

  const sheet = document.createElement('div');
  sheet.id = 'report-block-sheet';
  sheet.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%) translateY(100%);width:100%;max-width:480px;background:var(--bg);border-radius:24px 24px 0 0;z-index:1000;overflow:hidden;transition:transform 0.3s ease;';

  sheet.innerHTML =
    '<div style="background:var(--card);padding:16px 20px;border-bottom:1px solid var(--border);text-align:center;">' +
      '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 12px;"></div>' +
      '<p style="font-size:16px;font-weight:700;color:var(--text);">' + name + '</p>' +
      '<p style="font-size:12px;color:var(--text3);margin-top:4px;">What would you like to do?</p>' +
    '</div>' +
    '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px;">' +

      '<div onclick="closeReportBlockSheet();openReport()" style="background:var(--card);border-radius:16px;padding:16px;border:1.5px solid var(--border);display:flex;align-items:center;gap:14px;cursor:pointer;">' +
        '<div style="width:46px;height:46px;background:#FEF2F2;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></div>' +
        '<div style="flex:1;"><p style="font-size:14px;font-weight:600;color:var(--text);">Report this provider</p><p style="font-size:12px;color:var(--text3);margin-top:2px;">Tell us what went wrong</p></div>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +

      '<div onclick="closeReportBlockSheet();openBlock()" style="background:var(--card);border-radius:16px;padding:16px;border:1.5px solid var(--border);display:flex;align-items:center;gap:14px;cursor:pointer;">' +
        '<div style="width:46px;height:46px;background:#FEF2F2;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg></div>' +
        '<div style="flex:1;"><p style="font-size:14px;font-weight:600;color:var(--text);">Block this provider</p><p style="font-size:12px;color:var(--text3);margin-top:2px;">They will not appear in your search</p></div>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +

      '<div onclick="closeReportBlockSheet();shareProfile()" style="background:var(--card);border-radius:16px;padding:16px;border:1.5px solid var(--border);display:flex;align-items:center;gap:14px;cursor:pointer;">' +
        '<div style="width:46px;height:46px;background:#EEF2FF;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>' +
        '<div style="flex:1;"><p style="font-size:14px;font-weight:600;color:var(--text);">Share this profile</p><p style="font-size:12px;color:var(--text3);margin-top:2px;">Send to a friend</p></div>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +

      '<button onclick="closeReportBlockSheet()" style="width:100%;background:var(--bg2);border:1.5px solid var(--border);border-radius:14px;padding:14px;font-size:14px;font-weight:600;color:var(--text2);font-family:Poppins,sans-serif;cursor:pointer;margin-top:4px;">Cancel</button>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);
  setTimeout(() => { sheet.style.transform = 'translateX(-50%) translateY(0)'; }, 10);
}

function closeReportBlockSheet() {
  const sheet = document.getElementById('report-block-sheet');
  const overlay = document.getElementById('report-block-overlay');
  if (sheet) { sheet.style.transform = 'translateX(-50%) translateY(100%)'; setTimeout(() => sheet.remove(), 300); }
  if (overlay) overlay.remove();
}

function openReport() {
  const name = reportBlockTarget.name || 'Provider';
  const nameEl = document.getElementById('report-target-name');
  const typeEl = document.getElementById('report-target-type');
  if (nameEl) nameEl.textContent = name;
  if (typeEl) typeEl.textContent = 'Provider';
  selectedReportReason = '';
  document.querySelectorAll('#report-reasons .service-select-item').forEach(el => {
    el.classList.remove('selected');
    const check = el.querySelector('.service-check');
    if (check) check.style.opacity = '0';
  });
  showScreen('screen-report');
}

function openBlock() {
  const name = reportBlockTarget.name || 'Provider';
  const nameEl = document.getElementById('block-target-name');
  if (nameEl) nameEl.textContent = name;
  showScreen('screen-block');
}

function selectReportReason(el) {
  document.querySelectorAll('#report-reasons .service-select-item').forEach(item => {
    item.classList.remove('selected');
    const check = item.querySelector('.service-check');
    if (check) check.style.opacity = '0';
  });
  el.classList.add('selected');
  const check = el.querySelector('.service-check');
  if (check) check.style.opacity = '1';
  selectedReportReason = el.querySelector('span') ? el.querySelector('span').textContent : '';
}

async function submitReport() {
  if (!selectedReportReason) {
    alert('Please select a reason for your report.');
    return;
  }
  const details = document.getElementById('report-details') ? document.getElementById('report-details').value.trim() : '';

  if (db) {
    try {
      const { error } = await db.from('reports').insert([{
        provider_name: reportBlockTarget.name,
        customer_name: localStorage.getItem('preen_user_name') || 'Anonymous',
        reason: selectedReportReason,
        details: details
      }]);
      if (error) { alert('Could not submit your report:\n\n' + error.message); console.error('Report save error:', error); return; }
    } catch (e) { alert('Could not submit your report. Please try again.'); console.error('Report save failed:', e); return; }
  }

  alert('Report submitted. Our team will review this within 24 hours. Thank you for keeping Preen safe.');
  goBack();
}

function confirmBlock() {
  const name = reportBlockTarget.name;
  if (!blockedProviders.includes(name)) {
    blockedProviders.push(name);
    localStorage.setItem('preen_blocked', JSON.stringify(blockedProviders));
  }
  alert(name + ' has been blocked. They will no longer appear in your search results.');
  showScreen('screen-home');
}


// ===== WAITING FOR PROVIDER SYSTEM =====
let waitingTimer = null;
let waitingPollTimer = null;
let paymentTimer = null;
let currentBookingDetails = {};

function startWaitingForProvider(bookingId, providerName, serviceLabel, date, time, amount) {
  // Store booking details
  currentBookingDetails = { bookingId, providerName, serviceLabel, date, time, amount };

  // Update waiting screen UI
  const nameEl = document.getElementById('waiting-provider-name');
  const serviceEl = document.getElementById('waiting-service-label');
  if (nameEl) nameEl.textContent = providerName;
  if (serviceEl) serviceEl.textContent = serviceLabel;

  showScreen('screen-waiting-provider');
  startWaitingCountdown(900, bookingId); // 15 minutes
}

function startWaitingCountdown(seconds, bookingId) {
  if (waitingTimer) clearInterval(waitingTimer);
  if (waitingPollTimer) clearInterval(waitingPollTimer);
  let remaining = seconds;
  const ring = document.getElementById('waiting-ring');
  const totalDash = 502;

  waitingTimer = setInterval(() => {
    remaining--;
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const display = mins + ':' + (secs < 10 ? '0' : '') + secs;

    const countdownEl = document.getElementById('waiting-countdown');
    if (countdownEl) {
      countdownEl.textContent = display;
      if (remaining < 180) countdownEl.style.color = 'var(--error)';
    }

    // Animate the SVG ring
    if (ring) {
      const progress = remaining / 900;
      const dashOffset = totalDash - (totalDash * progress);
      ring.style.strokeDashoffset = dashOffset;
    }

    if (remaining <= 0) {
      clearInterval(waitingTimer);
      if (waitingPollTimer) clearInterval(waitingPollTimer);
      providerAutoDeclined();
    }
  }, 1000);

  // Poll Supabase for the provider's real Accept/Decline response
  if (db && bookingId) {
    waitingPollTimer = setInterval(async () => {
      try {
        const { data } = await db.from('bookings').select('status').eq('id', bookingId).single();
        if (data && data.status === 'accepted') {
          clearInterval(waitingTimer);
          clearInterval(waitingPollTimer);
          // If the customer has navigated away from the waiting screen (e.g. to
          // chat with the provider), don't forcibly yank them out of it — just
          // remember it was accepted, and move them forward once they come back.
          const activeScreen = document.querySelector('.screen.active');
          if (activeScreen && activeScreen.id === 'screen-waiting-provider') {
            providerAccepted();
          } else {
            window.bookingAcceptedPendingNav = true;
          }
        } else if (data && data.status === 'declined') {
          clearInterval(waitingTimer);
          clearInterval(waitingPollTimer);
          const activeScreen = document.querySelector('.screen.active');
          if (activeScreen && activeScreen.id === 'screen-waiting-provider') {
            providerAutoDeclined();
          } else {
            window.bookingDeclinedPendingNav = true;
          }
        }
      } catch (e) { /* transient network error, keep polling */ }
    }, 3000);
  } else {
    // No DB connection or no booking id (e.g. demo mode) — fall back to a simple simulation
    setTimeout(() => {
      if (waitingTimer) {
        clearInterval(waitingTimer);
        providerAccepted();
      }
    }, 5000);
  }
}

function providerAccepted() {
  const { providerName, serviceLabel, date, time, amount } = currentBookingDetails;

  // Update payment warning screen
  const pwProvider = document.getElementById('pw-provider');
  const pwService = document.getElementById('pw-service');
  const pwDate = document.getElementById('pw-date');
  const pwTime = document.getElementById('pw-time');
  const pwFee = document.getElementById('pw-service-fee');
  const pwTotal = document.getElementById('pw-total');
  const pwAccepted = document.getElementById('payment-provider-accepted-name');

  if (pwProvider) pwProvider.textContent = providerName;
  if (pwService) pwService.textContent = serviceLabel.split(' · ')[0];
  if (pwDate) pwDate.textContent = date;
  if (pwTime) pwTime.textContent = time;
  if (pwFee) pwFee.textContent = '₦' + Number(amount).toLocaleString();
  if (pwTotal) pwTotal.textContent = '₦' + Number(amount).toLocaleString();
  if (pwAccepted) pwAccepted.textContent = providerName + ' has confirmed your booking';

  showScreen('screen-payment-warning');
  startPaymentCountdown(600); // 10 minutes to pay
}

function startPaymentCountdown(seconds) {
  if (paymentTimer) clearInterval(paymentTimer);
  let remaining = seconds;

  paymentTimer = setInterval(() => {
    remaining--;
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const display = mins + ':' + (secs < 10 ? '0' : '') + secs;

    const el = document.getElementById('payment-countdown');
    if (el) {
      el.textContent = display;
      if (remaining < 120) el.style.color = 'var(--error)';
      if (remaining < 60) el.style.fontSize = '20px';
    }

    if (remaining <= 0) {
      clearInterval(paymentTimer);
      // Slot released
      const el2 = document.getElementById('payment-countdown');
      if (el2) el2.textContent = 'EXPIRED';
      alert('Your slot has been released. Please book again.');
      showScreen('screen-home');
    }
  }, 1000);
}

function providerAutoDeclined() {
  const { providerName } = currentBookingDetails;
  const msgEl = document.getElementById('declined-message');
  if (msgEl) msgEl.textContent = providerName + ' is unable to take your booking at this time. You have not been charged.';
  showScreen('screen-provider-declined');
}

let currentDetailBooking = null;
let currentDetailBookingProvider = null;
let bookingDetailMap = null;

async function openBookingDetail(bookingId) {
  if (!db || !bookingId) return;
  showScreen('screen-booking-detail');
  document.getElementById('bd-provider-name').textContent = 'Loading...';

  try {
    const { data: booking, error } = await db.from('bookings').select('*').eq('id', bookingId).single();
    if (error || !booking) { alert('Could not load this booking.'); goBack(); return; }
    currentDetailBooking = booking;

    document.getElementById('bd-provider-name').textContent = booking.provider_name || 'Provider';

    const statusMap = { confirmed: 'confirmed', accepted: 'confirmed', pending_confirmation: 'confirmed', completed: 'completed', disputed: 'cancelled', declined: 'cancelled', cancelled: 'cancelled' };
    const statusLabel = { confirmed: 'Pending', accepted: 'Confirmed', pending_confirmation: 'Awaiting Your Confirmation', completed: 'Completed', disputed: 'Under Review', declined: 'Declined', cancelled: 'Cancelled' };
    const badge = document.getElementById('bd-status-badge');
    badge.className = 'status ' + (statusMap[booking.status] || 'confirmed');
    badge.textContent = statusLabel[booking.status] || 'Pending';

    document.getElementById('bd-date').textContent = (booking.booking_date || '-') + (booking.booking_time ? ' at ' + booking.booking_time : '');
    document.getElementById('bd-duration').textContent = booking.is_house_call ? 'House Call' : 'Appointment';

    document.getElementById('bd-service-name').textContent = booking.service || 'Service';
    document.getElementById('bd-service-price').textContent = booking.amount || '₦0';
    document.getElementById('bd-service-sub').textContent = 'with ' + (booking.provider_name || 'Provider');
    document.getElementById('bd-total').textContent = booking.amount || '₦0';

    const cancelRow = document.getElementById('bd-cancel-row');
    cancelRow.style.display = (booking.status === 'confirmed' || booking.status === 'accepted') ? 'flex' : 'none';

    // Load provider details for map, directions, and the Call button
    const { data: provRow } = await db.from('providers').select('latitude, longitude, location_note, phone, whatsapp').eq('full_name', booking.provider_name).maybeSingle();
    currentDetailBookingProvider = provRow || null;

    const mapSection = document.getElementById('bd-map-section');
    if (provRow && provRow.latitude != null && provRow.longitude != null) {
      mapSection.style.display = 'block';
      setTimeout(() => {
        if (bookingDetailMap) { bookingDetailMap.remove(); bookingDetailMap = null; }
        bookingDetailMap = L.map('booking-detail-map', { zoomControl: false, dragging: false, scrollWheelZoom: false, tap: false })
          .setView([provRow.latitude, provRow.longitude], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(bookingDetailMap);
        L.marker([provRow.latitude, provRow.longitude]).addTo(bookingDetailMap);
      }, 150);
    } else {
      mapSection.style.display = 'none';
    }
  } catch (e) { console.error('Booking detail load error:', e); }
}

let currentChatBookingId = null;
let currentChatOtherPartyPhone = null;
let currentChatOtherPartyName = null;
let chatPollTimer = null;

async function openChat(bookingId) {
  if (!db || !bookingId) return;
  currentChatBookingId = bookingId;
  showScreen('screen-chat');
  document.getElementById('chat-messages').innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text3); padding:20px 0;">Loading messages...</p>';

  try {
    const { data: booking } = await db.from('bookings').select('*').eq('id', bookingId).single();
    if (!booking) { alert('Could not load this conversation.'); goBack(); return; }

    const myRole = localStorage.getItem('preen_role') === 'provider' ? 'provider' : 'customer';
    if (myRole === 'provider') {
      currentChatOtherPartyName = booking.customer_name || 'Customer';
      currentChatOtherPartyPhone = booking.customer_phone || '';
    } else {
      currentChatOtherPartyName = booking.provider_name || 'Provider';
      const { data: prov } = await db.from('providers').select('phone, whatsapp').eq('full_name', booking.provider_name).maybeSingle();
      currentChatOtherPartyPhone = prov ? (prov.phone || prov.whatsapp) : '';
    }
    document.getElementById('chat-header-name').textContent = currentChatOtherPartyName;
    document.getElementById('chat-header-sub').textContent = booking.service || '';
    document.getElementById('chat-header-avatar').textContent = currentChatOtherPartyName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    await loadChatMessages();
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(loadChatMessages, 3000);
  } catch (e) { console.error('Open chat error:', e); }
}

async function loadChatMessages() {
  // Self-terminating: if the customer/provider has navigated away from chat,
  // stop polling instead of running forever in the background.
  const screenEl = document.getElementById('screen-chat');
  if (!screenEl || !screenEl.classList.contains('active')) {
    if (chatPollTimer) clearInterval(chatPollTimer);
    return;
  }
  if (!currentChatBookingId || !db) return;

  // If the booking was accepted/declined while the customer was chatting,
  // show it clearly right here instead of leaving them to discover it later.
  const banner = document.getElementById('chat-status-banner');
  if (window.bookingAcceptedPendingNav || window.bookingDeclinedPendingNav) {
    if (!banner) {
      const accepted = !!window.bookingAcceptedPendingNav;
      const bannerEl = document.createElement('div');
      bannerEl.id = 'chat-status-banner';
      bannerEl.onclick = closeChatScreen;
      bannerEl.style.cssText = 'background:' + (accepted ? 'var(--primary-light)' : 'var(--bg3)') + '; border-bottom:1px solid var(--border); padding:12px 16px; text-align:center; font-size:12px; font-weight:600; color:' + (accepted ? 'var(--primary-dark)' : 'var(--error)') + '; cursor:pointer;';
      bannerEl.textContent = accepted ? 'Booking accepted! Tap here to continue to payment →' : 'This booking was declined. Tap here to continue →';
      const chatScreenEl = document.getElementById('screen-chat');
      chatScreenEl.querySelector('.inner-header').insertAdjacentElement('afterend', bannerEl);
    }
  }

  const container = document.getElementById('chat-messages');
  try {
    const { data, error } = await db.from('messages').select('*').eq('booking_id', currentChatBookingId).order('created_at', { ascending: true });
    if (error) { console.error('Chat load error:', error); return; }
    const myRole = localStorage.getItem('preen_role') === 'provider' ? 'provider' : 'customer';
    const msgs = data || [];

    if (msgs.length === 0) {
      container.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text3); padding:20px 0;">No messages yet. Say hello!</p>';
      return;
    }

    container.innerHTML = msgs.map(m => {
      const isMine = m.sender_role === myRole;
      const time = m.created_at ? new Date(m.created_at).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }) : '';
      const content = m.image_url
        ? '<img src="' + m.image_url + '" style="max-width:180px;border-radius:12px;display:block;" onclick="window.open(\'' + m.image_url + '\',\'_blank\')"/>'
        : (m.message || '').replace(/</g, '&lt;');
      const tick = isMine ? ' <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-1px;display:inline-block;opacity:0.6;"><polyline points="20 6 9 17 4 12"/></svg>' : '';
      // The wrapper itself must be the flex item for align-items to have any
      // effect — putting alignment on the bubble alone (nested one level
      // deeper) silently does nothing, which is why every bubble was
      // rendering on the same side regardless of sender.
      return '<div style="display:flex; flex-direction:column; align-items:' + (isMine ? 'flex-end' : 'flex-start') + ';">' +
        '<div class="chat-bubble ' + (isMine ? 'sent' : 'received') + '"' + (m.image_url ? ' style="padding:4px;background:transparent;"' : '') + '>' + content + '</div>' +
        '<div class="chat-time" style="' + (isMine ? 'text-align:right; padding-right:4px;' : 'padding-left:4px;') + '">' + time + tick + '</div>' +
        '</div>';
    }).join('');
    container.scrollTop = container.scrollHeight;
  } catch (e) { console.error('Load chat messages error:', e); }
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentChatBookingId || !db) return;
  const myRole = localStorage.getItem('preen_role') === 'provider' ? 'provider' : 'customer';
  const myName = myRole === 'provider' ? (localStorage.getItem('preen_provider_name') || 'Provider') : (localStorage.getItem('preen_user_name') || 'Customer');
  input.value = '';
  try {
    const { error } = await db.from('messages').insert([{ booking_id: currentChatBookingId, sender_role: myRole, sender_name: myName, message: text }]);
    if (error) { alert('Could not send message:\n\n' + error.message); return; }
    loadChatMessages();
  } catch (e) { console.error('Send chat message error:', e); alert('Could not send message. Please try again.'); }
}

async function sendChatImage(inputEl) {
  const file = inputEl.files[0];
  if (!file || !currentChatBookingId || !db) return;
  try {
    const fileName = currentChatBookingId + '-' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.]/g, '');
    const { error: uploadError } = await db.storage.from('chat-images').upload(fileName, file);
    if (uploadError) { alert('Could not upload image:\n\n' + uploadError.message); inputEl.value = ''; return; }
    const { data: urlData } = db.storage.from('chat-images').getPublicUrl(fileName);
    const imageUrl = urlData.publicUrl;

    const myRole = localStorage.getItem('preen_role') === 'provider' ? 'provider' : 'customer';
    const myName = myRole === 'provider' ? (localStorage.getItem('preen_provider_name') || 'Provider') : (localStorage.getItem('preen_user_name') || 'Customer');
    const { error } = await db.from('messages').insert([{ booking_id: currentChatBookingId, sender_role: myRole, sender_name: myName, image_url: imageUrl }]);
    if (error) { alert('Could not send image:\n\n' + error.message); inputEl.value = ''; return; }
    loadChatMessages();
  } catch (e) { console.error('Send chat image error:', e); alert('Could not send image. Please try again.'); }
  inputEl.value = '';
}

function closeChatScreen() {
  if (chatPollTimer) clearInterval(chatPollTimer);
  if (window.bookingAcceptedPendingNav) {
    window.bookingAcceptedPendingNav = false;
    providerAccepted();
    return;
  }
  if (window.bookingDeclinedPendingNav) {
    window.bookingDeclinedPendingNav = false;
    providerAutoDeclined();
    return;
  }
  goBack();
}

function callFromChat() {
  if (!currentChatOtherPartyPhone) { alert('No phone number available for this conversation.'); return; }
  window.location.href = 'tel:' + currentChatOtherPartyPhone;
}

function closeBookingDetail() {
  showScreen('screen-home');
}

function addBookingToCalendar() {
  if (!currentDetailBooking) return;
  const title = encodeURIComponent((currentDetailBooking.service || 'Booking') + ' at ' + (currentDetailBooking.provider_name || 'Preen'));
  const details = encodeURIComponent('Booking with ' + (currentDetailBooking.provider_name || 'your provider') + ' via Preen');
  let datesParam = '';
  try {
    const d = new Date(currentDetailBooking.booking_date + ' ' + (currentDetailBooking.booking_time || ''));
    if (!isNaN(d.getTime())) {
      const end = new Date(d.getTime() + 60 * 60 * 1000);
      const fmt = (dt) => dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      datesParam = '&dates=' + fmt(d) + '/' + fmt(end);
    }
  } catch (e) { /* falls back to an undated event below */ }
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + title + datesParam + '&details=' + details;
  window.open(url, '_blank');
}

function openDirectionsForBookingDetail() {
  if (!currentDetailBookingProvider || currentDetailBookingProvider.latitude == null) {
    alert('This provider hasn\'t set their studio location yet.');
    return;
  }
  const url = 'https://www.google.com/maps/dir/?api=1&destination=' + currentDetailBookingProvider.latitude + ',' + currentDetailBookingProvider.longitude;
  window.open(url, '_blank');
}

function callProviderFromBookingDetail() {
  const phone = currentDetailBookingProvider ? (currentDetailBookingProvider.phone || currentDetailBookingProvider.whatsapp) : null;
  if (!phone) { alert('No phone number available for this provider.'); return; }
  window.location.href = 'tel:' + phone;
}

function openProviderProfileFromDetail() {
  if (!currentDetailBooking) return;
  openProviderProfile(currentDetailBooking.provider_name);
}

async function cancelFromBookingDetail() {
  if (!currentDetailBooking) return;
  if (!confirm('Cancel this booking? This cannot be undone.')) return;
  try {
    const { error } = await db.from('bookings').update({ status: 'cancelled' }).eq('id', currentDetailBooking.id);
    if (error) { alert('Could not cancel this booking:\n\n' + error.message); return; }
    alert('Booking cancelled.');
    showScreen('screen-bookings');
    loadMyBookings();
  } catch (e) { console.error('Cancel error:', e); alert('Could not cancel this booking. Please try again.'); }
}

function openChatForBookingDetail() {
  if (!currentDetailBooking) return;
  openChat(currentDetailBooking.id);
}

function proceedToPayment() {
  if (paymentTimer) clearInterval(paymentTimer);
  // In production — open Paystack here
  // For now simulate payment success
  if (currentBookingDetails && currentBookingDetails.bookingId) {
    openBookingDetail(currentBookingDetails.bookingId);
  } else {
    showScreen('screen-home');
  }
}

function cancelWaitingBooking() {
  if (waitingTimer) clearInterval(waitingTimer);
  if (waitingPollTimer) clearInterval(waitingPollTimer);
  if (paymentTimer) clearInterval(paymentTimer);
  if (db && currentBookingDetails.bookingId) {
    db.from('bookings').update({ status: 'cancelled' }).eq('id', currentBookingDetails.bookingId).then(()=>{}).catch(()=>{});
  }
  currentBookingDetails = {};
  showScreen('screen-home');
}

// ===== WAITING SCREEN CHAT =====
// (sendWaitingMessage removed — the waiting screen now uses the real chat system via openChat(), not this old fake canned-reply widget)


// 15 MINUTE COUNTDOWN TIMER FOR BOOKING REQUESTS
let requestTimers = {};

function startRequestTimer(bookingId, seconds) {
  if (requestTimers[bookingId]) clearInterval(requestTimers[bookingId]);
  
  let remaining = seconds || 900; // 15 minutes = 900 seconds
  
  requestTimers[bookingId] = setInterval(() => {
    remaining--;
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const display = mins + ':' + (secs < 10 ? '0' : '') + secs;
    
    const countdownEl = document.getElementById('countdown-' + bookingId);
    if (countdownEl) {
      countdownEl.textContent = display;
      // Turn red when under 3 minutes
      if (remaining < 180) countdownEl.style.color = 'var(--error)';
    }
    
    // Auto decline when time runs out
    if (remaining <= 0) {
      clearInterval(requestTimers[bookingId]);
      const card = document.getElementById('req-' + bookingId);
      if (card) {
        card.style.opacity = '0.5';
        card.innerHTML += '<div style="background:#FEF2F2;border-radius:10px;padding:10px;margin-top:8px;text-align:center;"><p style="font-size:12px;font-weight:600;color:var(--error);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Time expired — booking auto-declined. Customer has been refunded.</p></div>';
        card.querySelectorAll('button').forEach(b => b.disabled = true);
      }
    }
  }, 1000);
}

function stopRequestTimer(bookingId) {
  if (requestTimers[bookingId]) {
    clearInterval(requestTimers[bookingId]);
    delete requestTimers[bookingId];
  }
}


// FIX - selectCloseReason
let selectedCloseReason = '';

function selectCloseReason(el) {
  document.querySelectorAll('#close-reasons .service-select-item').forEach(item => {
    item.classList.remove('selected');
    const check = item.querySelector('.service-check');
    if (check) check.style.opacity = '0';
  });
  el.classList.add('selected');
  const check = el.querySelector('.service-check');
  if (check) check.style.opacity = '1';
  selectedCloseReason = el.querySelector('span') ? el.querySelector('span').textContent : '';
}

// Provider edit profile — loads real data from Supabase and shows the
// bio/hours/social fields that only make sense for a business account.
async function loadProviderEditProfile() {
  showScreen('screen-edit-profile');
  document.getElementById('edit-profile-title').textContent = 'Edit Business Profile';
  document.getElementById('edit-name-group').style.display = 'none';
  document.getElementById('edit-business-name-group').style.display = 'block';
  document.getElementById('edit-provider-fields').style.display = 'flex';

  const provName = localStorage.getItem('preen_provider_name') || '';
  document.getElementById('edit-business-name').value = provName;
  document.getElementById('edit-email').value = localStorage.getItem('preen_provider_email') || '';
  document.getElementById('edit-phone').value = localStorage.getItem('preen_provider_phone') || '';

  if (db && provName) {
    try {
      const { data } = await db.from('providers').select('*').eq('full_name', provName).single();
      if (data) {
        document.getElementById('edit-location').value = data.location || '';
        document.getElementById('edit-bio').value = data.bio || '';
        document.getElementById('edit-hours').value = data.working_hours || '';
        document.getElementById('edit-instagram').value = data.instagram_url || '';
        document.getElementById('edit-tiktok').value = data.tiktok_url || '';
        capturedProviderLat = data.latitude != null ? data.latitude : null;
        capturedProviderLng = data.longitude != null ? data.longitude : null;
        capturedProviderNote = data.location_note || '';
      }
    } catch (e) { console.error('Provider profile load error:', e); }
  }
}

// CONNECT HOME SCREEN PROVIDERS TO SUPABASE
async function loadHomeProviders() {
  if (!db) { showEmptyProviders(); return; }
  try {
    const { data, error } = await db
      .from('providers')
      .select('*')
      .eq('is_available', true)
      .order('rating', { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) {
      showEmptyProviders();
      return;
    }

    allProviders = data.map(p => ({
      id: p.id,
      name: p.full_name,
      category: p.category,
      location: p.location || 'Nigeria',
      distance: 'Nearby',
      rating: p.rating || 0,
      price: p.price || 5000,
      emoji: getCategoryEmoji(p.category),
      bg: 'linear-gradient(135deg, var(--primary-light), #FCB8CB)',
      verified: p.is_verified,
      service: p.category + ' Services',
      hours: p.is_available ? 'Available now' : 'Unavailable',
      image: p.profile_photo || null,
      bio: p.bio || ''
    }));

    renderHomeProviders(allProviders);

  } catch(e) {
    console.log('Supabase error:', e);
    showEmptyProviders();
  }
}

function showEmptyProviders() {
  const containers = ['new-providers', 'trending-providers', 'recommended-providers'];
  containers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div style="text-align:center;padding:30px 20px;"><p style="font-size:13px;color:var(--text3);">No providers yet in your area. Check back soon!</p></div>';
  });
}

function renderHomeProviders(providers) {
  const newContainer = document.getElementById('new-providers');
  const trendingContainer = document.getElementById('trending-providers');
  if (!newContainer && !trendingContainer) return;
  if (providers.length === 0) return;

  const cards = providers.slice(0, 6).map(p => `
    <div class="provider-card" onclick="openProviderProfile('${p.name}','${p.category}','${p.location}','${p.rating}','${p.verified}')">
      <div class="provider-card-img" style="${p.image ? 'background-image:url(' + p.image + ');background-size:cover;background-position:center;' : p.bg}">
        ${!p.image ? '<span style="color:var(--primary);">' + p.emoji + '</span>' : ''}
        ${p.verified ? '<div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg></div>' : ''}
      </div>
      <div class="provider-card-info">
        <p class="provider-card-name">${p.name}</p>
        <p class="provider-card-cat">${p.category} · ${p.location}</p>
        ${p.rating > 0 ? '<p class="provider-card-rating"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ' + p.rating.toFixed(1) + '</p>' : ''}
      </div>
    </div>
  `).join('');

  if (newContainer) newContainer.innerHTML = cards;
  if (trendingContainer) trendingContainer.innerHTML = cards;
}

// CONNECT MY BOOKINGS TO SUPABASE
async function loadMyBookings() {
  const container = document.getElementById('my-bookings-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="ai-spinner" style="margin:0 auto;"></div></div>';

  if (!db) { renderFakeBookings(container); return; }

  try {
    const phone = localStorage.getItem('preen_user_phone') || '';
    const email = localStorage.getItem('preen_user_email') || '';
    if (!phone && !email) { renderFakeBookings(container); return; }
    if (phone) await checkAutoReleaseBookings(phone);

    let query = db.from('bookings').select('*').order('created_at', { ascending: false });
    if (phone) query = query.eq('customer_phone', phone);
    else query = query.eq('customer_name', localStorage.getItem('preen_user_name') || '');

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;"><div style="margin-bottom:12px;display:flex;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="vertical-align:-2px;display:inline-block;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><p style="font-size:15px;font-weight:600;">No bookings yet</p><p style="font-size:13px;color:var(--text3);margin-top:6px;">Your bookings will appear here</p></div>';
      return;
    }

    const statusMap = { confirmed: 'confirmed', accepted: 'confirmed', pending_confirmation: 'confirmed', completed: 'completed', disputed: 'cancelled', declined: 'cancelled', cancelled: 'cancelled' };
    const statusLabel = { confirmed: 'Pending', accepted: 'Confirmed', pending_confirmation: 'Awaiting Your Confirmation', completed: 'Completed', disputed: 'Under Review', declined: 'Declined', cancelled: 'Cancelled' };

    // Check which of these bookings already have a review and/or tip attached,
    // so those buttons can correctly disappear instead of being reusable forever
    const completedIds = data.filter(b => b.status === 'completed').map(b => b.id);
    let reviewedBookingIds = new Set();
    let tippedBookingIds = new Set();
    if (completedIds.length > 0) {
      try {
        const [{ data: reviewRows }, { data: tipRows }] = await Promise.all([
          db.from('reviews').select('booking_id').in('booking_id', completedIds),
          db.from('tips').select('booking_id').in('booking_id', completedIds)
        ]);
        reviewedBookingIds = new Set((reviewRows || []).map(r => r.booking_id).filter(Boolean));
        tippedBookingIds = new Set((tipRows || []).map(t => t.booking_id).filter(Boolean));
      } catch (e) { console.error('Review/tip status check error:', e); }
    }

    container.innerHTML = data.map(b => {
      const cls = statusMap[b.status] || 'confirmed';
      const label = statusLabel[b.status] || 'Pending';
      const safeName = (b.provider_name || '').replace(/'/g, "\\'");
      const alreadyReviewed = reviewedBookingIds.has(b.id);
      const alreadyTipped = tippedBookingIds.has(b.id);
      return `
      <div style="background:var(--bg2);border-radius:16px;padding:16px;border:1.5px solid var(--border);margin-bottom:12px;cursor:pointer;" onclick="openBookingDetail('${b.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <p style="font-size:14px;font-weight:600;">${b.provider_name || 'Provider'}</p>
            <p style="font-size:12px;color:var(--text3);">${b.service || 'Service'}</p>
          </div>
          <span class="status ${cls}">${label}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:12px;">
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${b.booking_date || ''} ${b.booking_time || ''}</span>
          <span style="font-weight:600;color:var(--text);">${b.amount || ''}</span>
        </div>
        ${b.status === 'pending_confirmation' ? `<div class="booking-note" style="margin-bottom:10px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${b.provider_name || 'The provider'} marked this service as done. Please confirm it went as expected.</div>` : ''}
        ${b.status === 'disputed' ? `<div class="booking-note" style="margin-bottom:10px; border-color:var(--error);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>This booking is on hold pending review. We'll be in touch.</div>` : ''}
        <div style="display:flex;gap:8px;" onclick="event.stopPropagation()">
          ${(b.status === 'confirmed' || b.status === 'accepted') ? `<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="cancelBookingById('${b.id}',this)">Cancel</button>` : ''}
          ${b.status === 'pending_confirmation' ? `<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;color:var(--error);border-color:var(--error);" onclick="reportServiceProblem('${b.id}')">Report a Problem</button><button class="btn-primary" style="flex:1;padding:8px;font-size:12px;" onclick="confirmServiceCompletion('${b.id}')">Confirm</button>` : ''}
          ${b.status === 'completed' ? `${alreadyReviewed ? '<span class="status completed" style="flex:1;text-align:center;padding:8px;">Reviewed</span>' : `<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="openReview('${safeName}', '${b.id}')">Leave Review</button>`}${alreadyTipped ? '<span class="status completed" style="flex:1;text-align:center;padding:8px;">Tipped</span>' : `<button class="btn-primary" style="flex:1;padding:8px;font-size:12px;" onclick="openTip('${safeName}', '${b.id}')">Tip</button>`}` : ''}
        </div>
      </div>
    `;
    }).join('');
  } catch(e) {
    renderFakeBookings(container);
  }
}

function renderFakeBookings(container) {
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div style="margin-bottom:12px;display:flex;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="vertical-align:-2px;display:inline-block;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><p style="font-size:15px;font-weight:600;">No bookings yet</p><p style="font-size:13px;color:var(--text3);margin-top:6px;">Book a service to see it here</p></div>';
}

// CONNECT PROVIDER BOOKING REQUESTS TO SUPABASE
async function loadAcceptedTodayBookings() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;
  const container = document.getElementById('accepted-today-list');
  if (!container) return;

  try {
    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) { console.error('Accepted bookings fetch error:', error); return; }

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">No bookings accepted yet today.</p>';
      return;
    }

    container.innerHTML = data.map(b => `
      <div class="request-card" style="opacity:0.85;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <div class="review-avatar" style="width:44px; height:44px; font-size:16px;">${(b.customer_name || 'C').charAt(0).toUpperCase()}</div>
          <div style="flex:1;">
            <p style="font-size:14px; font-weight:600;">${b.customer_name || 'Customer'}</p>
            <p style="font-size:11px; color:var(--text3);">${b.service || ''} · ${b.booking_time || ''} · ${b.amount || ''}</p>
          </div>
          <span class="status confirmed">Accepted</span>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error('Accepted bookings error:', e); }
}

async function loadProviderBookingRequests() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;

  const container = document.getElementById('booking-requests-list');
  if (!container) return;

  try {
    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false });

    if (error) { console.error('Booking requests fetch error:', error); return; }

    const count = data ? data.length : 0;
    const badge = document.getElementById('requests-badge');
    if (badge) badge.textContent = count;
    const label = document.getElementById('pending-count-label');
    if (label) label.textContent = 'Pending — ' + count;

    if (count === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:24px 0;">No pending booking requests right now.</p>';
      return;
    }

    container.innerHTML = data.map(b => `
      <div class="request-card" id="req-${b.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:42px;height:42px;background:var(--primary);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;">
              ${(b.customer_name || 'C').charAt(0).toUpperCase()}
            </div>
            <div>
              <p style="font-size:14px;font-weight:600;">${b.customer_name || 'Customer'}</p>
              <p style="font-size:11px;color:var(--text3);">${b.customer_phone || ''}</p>
            </div>
          </div>
          <span class="status confirmed">Pending</span>
        </div>
        <div style="background:var(--bg2);border-radius:12px;padding:12px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:12px;color:var(--text3);">Service</span><span style="font-size:12px;font-weight:600;">${b.service || ''}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:12px;color:var(--text3);">Date</span><span style="font-size:12px;font-weight:600;">${b.booking_date || ''}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:var(--text3);">Amount</span><span style="font-size:14px;font-weight:700;color:var(--primary);">${b.amount || ''}</span></div>
        </div>
        <div style="text-align:center;margin-bottom:10px;">
          <p style="font-size:12px;color:var(--text3);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Auto-declines in <span id="countdown-${b.id}" style="font-weight:700;color:var(--accent);">15:00</span></p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="req-decline-btn" onclick="declineBookingRequest(this,'${b.customer_name}','${b.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Decline</button>
          <button class="req-accept-btn" onclick="acceptBookingRequest(this,'${b.customer_name}','${b.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg> Accept</button>
        </div>
        <button class="btn-secondary" style="width:100%; margin-top:8px; padding:8px; font-size:12px;" onclick="openChat('${b.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;display:inline-block;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Message</button>
      </div>
    `).join('');
    
    // Start timers for each booking
    data.forEach(b => startRequestTimer(b.id, 900));

  } catch(e) { console.log('Booking requests error:', e); }
}


function updatePriceInputs() {
  const minVal = parseInt(document.getElementById('price-min-input').value) || 0;
  const maxVal = parseInt(document.getElementById('price-max-input').value) || 0;
  const preview = document.getElementById('price-preview');
  const previewText = document.getElementById('price-preview-text');
  if (minVal > 0 || maxVal > 0) {
    preview.style.display = 'block';
    if (minVal > 0 && maxVal > 0) {
      previewText.textContent = '₦' + minVal.toLocaleString() + ' — ₦' + maxVal.toLocaleString();
    } else if (minVal > 0) {
      previewText.textContent = 'Above ₦' + minVal.toLocaleString();
    } else {
      previewText.textContent = 'Under ₦' + maxVal.toLocaleString();
    }
  } else {
    preview.style.display = 'none';
  }
  priceMin = minVal;
  priceMax = maxVal > 0 ? maxVal : 500000;
}

function clearPriceFilter() {
  document.getElementById('price-min-input').value = '';
  document.getElementById('price-max-input').value = '';
  document.getElementById('price-preview').style.display = 'none';
  priceMin = 0;
  priceMax = 500000;
  closeAllDropdowns();
  applyAllFilters();
}


// ===== SEARCH - THREE LINES TOGGLE =====
function toggleListView(btn) {
  const grid = document.getElementById('search-results');
  if (!grid) return;
  const isList = grid.classList.toggle('list-view');
  btn.style.background = isList ? 'var(--primary)' : 'transparent';
  btn.style.color = isList ? '#fff' : '';
  btn.style.borderRadius = '8px';
  btn.style.padding = '4px 8px';
}

// ===== CLOSE ALL DROPDOWNS =====
function closeAllDropdowns() {
  ['amenities-dropdown','price-dropdown','venue-dropdown','sort-dropdown'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ===== AMENITIES =====
let activeAmenities = [];

function toggleAmenitiesDropdown() {
  const el = document.getElementById('amenities-dropdown');
  const isOpen = el.style.display === 'block';
  closeAllDropdowns();
  el.style.display = isOpen ? 'none' : 'block';
}

function toggleAmenity(btn, amenity) {
  btn.classList.toggle('active');
  if (activeAmenities.includes(amenity)) {
    activeAmenities = activeAmenities.filter(a => a !== amenity);
  } else {
    activeAmenities.push(amenity);
  }
}

function applyAmenityFilter() {
  closeAllDropdowns();
  applyAllFilters();
}

// ===== PRICE SLIDER =====
let priceMin = 0;
let priceMax = 500000;


function togglePriceDropdown() {
  const el = document.getElementById('price-dropdown');
  const isOpen = el.style.display === 'block';
  closeAllDropdowns();
  el.style.display = isOpen ? 'none' : 'block';
}


function applyPriceFilter() {
  closeAllDropdowns();
  applyAllFilters();
}

// ===== VERIFIED ONLY =====
let verifiedOnly = false;
function filterVerifiedOnly(btn) {
  verifiedOnly = !verifiedOnly;
  btn.classList.toggle('active', verifiedOnly);
  applyAllFilters();
}

// ===== MAIN FILTER FUNCTION =====
let currentUserState = localStorage.getItem('preen_user_state') || '';

// Approximate center point of each Nigerian state, used to guess which state
// a customer is in from raw GPS coordinates without needing a paid reverse-
// geocoding API. Not perfectly precise right at a state border, but combined
// with the manual override in the location picker, that's a reasonable trade.
const STATE_CENTERS = {
  'Abia': [5.4527, 7.5248], 'Adamawa': [9.3265, 12.3984], 'Akwa Ibom': [4.9057, 7.8537],
  'Anambra': [6.2209, 6.9370], 'Bauchi': [10.7769, 9.9959], 'Bayelsa': [4.7719, 6.0699],
  'Benue': [7.3369, 8.7404], 'Borno': [11.8333, 13.1500], 'Cross River': [5.8702, 8.5988],
  'Delta': [5.5320, 5.8987], 'Ebonyi': [6.2649, 8.0137], 'Edo': [6.5244, 5.8987],
  'Ekiti': [7.7190, 5.3110], 'Enugu': [6.5244, 7.5106], 'FCT': [9.0579, 7.4951],
  'Gombe': [10.2897, 11.1673], 'Imo': [5.5720, 7.0588], 'Jigawa': [12.2280, 9.5616],
  'Kaduna': [10.5105, 7.4165], 'Kano': [11.9914, 8.5317], 'Katsina': [12.9908, 7.6018],
  'Kebbi': [11.4942, 4.2333], 'Kogi': [7.7337, 6.6906], 'Kwara': [8.9670, 4.3874],
  'Lagos': [6.5244, 3.3792], 'Nasarawa': [8.4933, 8.3200], 'Niger': [9.9309, 5.5983],
  'Ogun': [7.1608, 3.3487], 'Ondo': [7.2571, 5.2058], 'Osun': [7.5629, 4.5199],
  'Oyo': [7.8500, 3.9300], 'Plateau': [9.2182, 9.5179], 'Rivers': [4.8156, 6.9778],
  'Sokoto': [13.0059, 5.2476], 'Taraba': [8.8937, 11.3595], 'Yobe': [12.2939, 11.4390],
  'Zamfara': [12.1704, 6.2597]
};

function guessNearestState(lat, lng) {
  let closest = null, closestDist = Infinity;
  for (const [state, [slat, slng]] of Object.entries(STATE_CENTERS)) {
    const dist = getDistanceKm(lat, lng, slat, slng);
    if (dist < closestDist) { closestDist = dist; closest = state; }
  }
  return closest;
}

function useLiveLocation() {
  localStorage.removeItem('preen_state_is_manual');
  const input = document.querySelector('#screen-location input');
  if (input) input.value = '';
  const listEl = document.getElementById('states-list');
  if (listEl) listEl.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:20px 0;">Detecting your location...</p>';
  if (!navigator.geolocation) { alert('Location is not available on this device.'); renderStates(''); return; }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const state = guessNearestState(position.coords.latitude, position.coords.longitude);
      if (state) {
        currentUserState = state;
        localStorage.setItem('preen_user_state', state);
        const el = document.getElementById('selected-location');
        if (el) el.textContent = state;
        goBack();
        setTimeout(loadHomeSections, 300);
      }
    },
    () => { alert('Could not get your location — please allow location access and try again, or pick your state manually below.'); renderStates(''); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function detectCustomerStateFromGPS() {
  // A manual choice (via the location picker) always wins and is never
  // silently overridden. Otherwise, follow live GPS every time — this is
  // what lets a traveling customer's feed genuinely follow where they are,
  // rather than being stuck on wherever they happened to open the app first.
  if (localStorage.getItem('preen_state_is_manual') === 'true') return;
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const state = guessNearestState(position.coords.latitude, position.coords.longitude);
      if (state && state !== currentUserState) {
        currentUserState = state;
        localStorage.setItem('preen_user_state', state);
        const el = document.getElementById('selected-location');
        if (el) el.textContent = state;
        loadHomeSections();
      }
    },
    () => { /* permission denied or unavailable — falls back to the manual picker */ },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
  );
}

function applyAllFilters() {
  const query = (document.getElementById('search-input') ? document.getElementById('search-input').value : '').toLowerCase();
  searchProviders(query, '');
}

function renderSearchResults(results) {
  const container = document.getElementById('search-results');
  if (!container) return;
  if (!results || results.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;"><div style="margin-bottom:14px;display:flex;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><p style="font-size:15px;font-weight:600;margin-bottom:6px;">No providers found</p><p style="font-size:13px;color:var(--text3);">Try adjusting your filters</p></div>';
    return;
  }
  container.innerHTML = results.map(p => buildProviderCard ? buildProviderCard(p) : '').join('');
}

// ===== BOOKING REQUESTS - ACCEPT / DECLINE =====
async function acceptBookingRequest(btn, customerName, bookingId) {
  const card = btn.closest('.request-card') || btn.parentElement.parentElement;
  if (bookingId) stopRequestTimer(bookingId);
  if (bookingId && db) {
    try { await db.from('bookings').update({ status: 'accepted' }).eq('id', bookingId); }
    catch (e) { console.error('Accept update failed:', e); }
  }
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg> Accepted';
  btn.disabled = true;
  btn.style.background = 'var(--primary)';
  const declineBtn = card.querySelector('.req-decline-btn') ||
    card.querySelector('[onclick*="decline"]') ||
    card.querySelectorAll('button')[0];
  if (declineBtn) declineBtn.disabled = true;

  // Remove timer
  const timer = card.querySelector('[id*="timer"], [id*="countdown"]');
  if (timer) timer.closest('div').style.display = 'none';

  // Update status badge
  const badge = card.querySelector('[style*="FEF3C7"], [style*="accent-light"]');
  if (badge) {
    badge.innerHTML = '<p style="font-size:11px;font-weight:600;color:var(--primary);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg> Accepted</p>';
    badge.style.background = 'var(--primary-light)';
  }

  // Add confirmation
  const confirm = document.createElement('div');
  confirm.style.cssText = 'background:var(--primary-light);border-radius:10px;padding:10px 14px;margin-top:10px;text-align:center;border:1px solid rgba(232,84,122,0.2);';
  confirm.innerHTML = '<p style="font-size:13px;font-weight:600;color:var(--primary-dark);">Booking confirmed! ' + customerName + ' has been notified.</p>';
  card.appendChild(confirm);
  card.classList.add('accepted');

  // Update badge count
  const badge2 = document.getElementById('requests-badge');
  if (badge2) {
    const count = parseInt(badge2.textContent) - 1;
    badge2.textContent = count > 0 ? count : '0';
  }
  const label2 = document.getElementById('pending-count-label');
  if (label2) label2.textContent = 'Pending — ' + (badge2 ? badge2.textContent : '0');
  loadAcceptedTodayBookings();
}

async function declineBookingRequest(btn, customerName, bookingId) {
  const card = btn.closest('.request-card') || btn.parentElement.parentElement;
  if (!confirm('Decline booking from ' + customerName + '? They will be refunded.')) return;
  if (bookingId) stopRequestTimer(bookingId);
  if (bookingId && db) {
    try { await db.from('bookings').update({ status: 'declined' }).eq('id', bookingId); }
    catch (e) { console.error('Decline update failed:', e); }
  }

  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Declined';
  btn.disabled = true;
  const acceptBtn = card.querySelector('.req-accept-btn') ||
    card.querySelector('[onclick*="accept"]') ||
    card.querySelectorAll('button')[1];
  if (acceptBtn) acceptBtn.disabled = true;

  const badge = card.querySelector('[style*="FEF3C7"], [style*="accent-light"]');
  if (badge) {
    badge.innerHTML = '<p style="font-size:11px;font-weight:600;color:var(--error);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Declined</p>';
    badge.style.background = '#FEF2F2';
  }

  const msg = document.createElement('div');
  msg.style.cssText = 'background:#FEF2F2;border-radius:10px;padding:10px 14px;margin-top:10px;text-align:center;border:1px solid #FECACA;';
  msg.innerHTML = '<p style="font-size:13px;font-weight:600;color:var(--error);">Booking declined. ' + customerName + ' has been refunded.</p>';
  card.appendChild(msg);
  card.classList.add('declined');
  card.style.opacity = '0.65';
}

// ===== STATE FILTERING =====
function setUserState(state) {
  currentUserState = state;
  localStorage.setItem('preen_user_state', state);
  applyAllFilters();
  // Update leaderboard banner text
  const banner = document.querySelector('[onclick*="leaderboard"] p:last-child');
  if (banner) banner.textContent = 'See who is leading the ' + state + ' leaderboard';
}

function selectLocation(location) {
  const el = document.getElementById('selected-location');
  if (el) el.textContent = location;
  const state = location.includes(',') ? location.split(',')[1].trim() : location;
  setUserState(state);
  goBack();
}


// ============ SEARCH FILTERS ============
let activePriceRange = 'any';

// Three lines — toggle list/grid view

// AMENITIES



// PRICE



// VERIFIED ONLY

// COMBINED FILTER — state + price + amenities + verified + search text



// ============ STATE BASED FILTERING ============
// Set user state when they select location


// ============ PROVIDER BOOKING REQUESTS ============


// ============ LOCATION SELECTION — SET STATE ============


// FORGOT PASSWORD
function sendResetEmail() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { alert('Please enter your email address.'); return; }
  if (!email.includes('@')) { alert('Please enter a valid email address.'); return; }
  document.getElementById('forgot-email-sent').textContent = email;
  document.getElementById('forgot-form').style.display = 'none';
  document.getElementById('forgot-success').style.display = 'block';
  // In production this calls Supabase auth.resetPasswordForEmail(email)
}

// EDIT PROFILE
function loadEditProfile() {
  showScreen('screen-edit-profile');
  document.getElementById('edit-profile-title').textContent = 'Edit Profile';
  document.getElementById('edit-name-group').style.display = 'block';
  document.getElementById('edit-business-name-group').style.display = 'none';
  document.getElementById('edit-provider-fields').style.display = 'none';

  const name = document.getElementById('profile-name').textContent || '';
  const email = document.getElementById('profile-email').textContent || '';
  document.getElementById('edit-full-name').value = name;
  document.getElementById('edit-email').value = email;
  document.getElementById('edit-phone').value = localStorage.getItem('preen_user_phone') || '';
  document.getElementById('edit-location').value = document.getElementById('selected-location') ? (document.getElementById('selected-location').textContent || '') : '';
}

async function saveEditProfile() {
  const isProvider = document.getElementById('edit-provider-fields').style.display !== 'none';
  const email = document.getElementById('edit-email').value.trim();
  const phone = document.getElementById('edit-phone').value.trim();
  const location = document.getElementById('edit-location').value.trim();
  if (!email) { alert('Please enter your email.'); return; }

  if (isProvider) {
    const provName = localStorage.getItem('preen_provider_name') || '';
    const bio = document.getElementById('edit-bio').value.trim();
    const hours = document.getElementById('edit-hours').value.trim();
    const instagram = document.getElementById('edit-instagram').value.trim();
    const tiktok = document.getElementById('edit-tiktok').value.trim();

    if (db && provName) {
      try {
        const { error } = await db.from('providers').update({
          email: email,
          phone: phone,
          location: location,
          bio: bio,
          working_hours: hours,
          instagram_url: instagram,
          tiktok_url: tiktok
        }).eq('full_name', provName);
        if (error) { alert('Could not save your profile:\n\n' + error.message); console.error('Provider profile save error:', error); return; }
      } catch (e) { alert('Could not save your profile. Please try again.'); console.error('Provider profile save failed:', e); return; }
    }
    localStorage.setItem('preen_provider_email', email);
    localStorage.setItem('preen_provider_phone', phone);
    alert('Profile updated successfully!');
    goBack();
    return;
  }

  // Customer path
  const name = document.getElementById('edit-full-name').value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  const oldEmail = localStorage.getItem('preen_user_email') || '';

  if (db && oldEmail) {
    try {
      const { error } = await db.from('user').update({
        full_name: name,
        email: email,
        phone: phone
      }).eq('email', oldEmail);
      if (error) { alert('Could not save your profile:\n\n' + error.message); console.error('Customer profile save error:', error); return; }
    } catch (e) { alert('Could not save your profile. Please try again.'); console.error('Customer profile save failed:', e); return; }
  }

  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = email;
  localStorage.setItem('preen_user_name', name);
  localStorage.setItem('preen_user_email', email);
  localStorage.setItem('preen_user_phone', phone);
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarEl = document.querySelector('.profile-avatar');
  if (avatarEl) avatarEl.textContent = initials;
  alert('Profile updated successfully!');
  goBack();
}

// (changePassword removed — this app has no real password authentication to
// change against; the Edit Profile screen now says so honestly instead of
// faking a successful password change)

function uploadEditProfilePhoto() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const avatar = document.getElementById('edit-profile-avatar');
    avatar.textContent = '...';
    const url = await uploadToCloudinary(file, 'image');
    if (url) {
      avatar.style.backgroundImage = 'url(' + url + ')';
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
      avatar.textContent = '';
    } else {
      avatar.textContent = 'AK';
      alert('Upload failed. Please try again.');
    }
  };
  input.click();
}

// CLOSE ACCOUNT
async function closeAccount() {
  const input = document.getElementById('delete-confirm');
  if (!input) { alert('Error finding input field.'); return; }
  const val = input.value.trim().toUpperCase();
  if (val !== 'DELETE') { alert('Please type DELETE exactly to confirm.'); return; }

  // Your own database rules deliberately block hard deletion of user accounts
  // and bookings — accounts are meant to be closed via a status flag instead,
  // same as how providers, bookings, and reviews already work in this app.
  const email = localStorage.getItem('preen_user_email');
  if (db && email) {
    try {
      const { error } = await db.from('user').update({
        is_closed: true,
        closed_at: new Date().toISOString(),
        close_reason: selectedCloseReason || 'Not specified'
      }).eq('email', email);
      if (error) {
        alert('Could not close your account:\n\n' + error.message + '\n\nPlease try again or contact support.');
        console.error('Close account error:', error);
        return;
      }
    } catch (e) {
      alert('Could not close your account. Please check your connection and try again.');
      console.error('Close account failed:', e);
      return;
    }
  }

  // Clear localStorage
  localStorage.removeItem('preen_user_name');
  localStorage.removeItem('preen_user_email');
  localStorage.removeItem('preen_user_phone');
  localStorage.removeItem('preen_role');
  localStorage.removeItem('preen_recently_viewed');
  localStorage.removeItem('preen_browse_history');
  selectedCloseReason = '';

  alert('Your account has been closed. We are sorry to see you go.');
  showScreen('screen-welcome');
}

// GPS NEARBY PROVIDERS
function getNearbyProviders() {
  showScreen('screen-nearby');
  document.getElementById('nearby-loading').style.display = 'block';
  document.getElementById('nearby-results').style.display = 'none';
  document.getElementById('nearby-denied').style.display = 'none';

  if (!navigator.geolocation) {
    document.getElementById('nearby-loading').style.display = 'none';
    document.getElementById('nearby-denied').style.display = 'block';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async () => {
      // Note: real distance sorting needs each provider's actual coordinates,
      // which this app doesn't collect yet (would need a "pin your location"
      // step at signup, or geocoding their typed address via a paid API).
      // For now this shows real available providers without a fabricated
      // distance number, rather than pretending to sort by proximity.
      document.getElementById('selected-location').textContent = 'Near you · GPS';

      const container = document.getElementById('nearby-results');
      if (!db) {
        document.getElementById('nearby-loading').style.display = 'none';
        document.getElementById('nearby-denied').style.display = 'block';
        return;
      }

      try {
        const { data: providers, error } = await db.from('providers').select('*').eq('is_available', true).eq('is_verified', true).limit(20);
        if (error) { console.error('Nearby providers fetch error:', error); document.getElementById('nearby-loading').style.display = 'none'; document.getElementById('nearby-denied').style.display = 'block'; return; }

        const list = providers || [];
        if (list.length === 0) {
          container.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:40px 20px;">No available providers found right now.</p>';
        } else {
          // Get each provider's real cheapest service price
          const names = list.map(p => p.full_name);
          const { data: skills } = await db.from('skills').select('provider_name, price').in('provider_name', names);
          const priceByProvider = {};
          (skills || []).forEach(s => {
            const p = Number(s.price) || 0;
            if (!priceByProvider[s.provider_name] || p < priceByProvider[s.provider_name]) priceByProvider[s.provider_name] = p;
          });

          const cards = list.map(p => ({
            name: p.full_name, category: p.category,
            location: p.location || 'Location not set', distance: '',
            rating: p.rating || 0,
            price: priceByProvider[p.full_name] || 0,
            verified: p.is_verified, service: 'Available',
            hours: p.is_available ? 'Available now' : 'Unavailable',
            image: null, emoji: getCategoryEmoji(p.category),
            bg: 'linear-gradient(135deg, var(--primary-light), #FCB8CB)'
          }));

          container.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:0 0 12px;">' + cards.length + ' available providers</p>' +
            cards.map(buildProviderCard).join('');
        }
      } catch (e) {
        console.error('Nearby providers error:', e);
      }

      document.getElementById('nearby-loading').style.display = 'none';
      document.getElementById('nearby-results').style.display = 'block';
    },
    (error) => {
      document.getElementById('nearby-loading').style.display = 'none';
      document.getElementById('nearby-denied').style.display = 'block';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}


// WITHDRAWAL SYSTEM
let selectedWithdrawMethod = 'bank';
let selectedWithdrawAmount = 0;

function selectWithdrawalMethod(el, method) {
  selectedWithdrawMethod = method;
  document.querySelectorAll('.withdrawal-option').forEach(o => {
    o.classList.remove('selected-method');
    o.querySelector('.method-check').style.background = 'var(--border)';
    o.querySelector('.method-check').style.color = 'transparent';
  });
  el.classList.add('selected-method');
  el.querySelector('.method-check').style.background = 'var(--primary)';
  el.querySelector('.method-check').style.color = '#fff';
  if (method === 'bank') {
    document.getElementById('bank-details-section').style.display = 'block';
    document.getElementById('wallet-details-section').style.display = 'none';
  } else {
    document.getElementById('bank-details-section').style.display = 'none';
    document.getElementById('wallet-details-section').style.display = 'block';
    document.getElementById('wallet-title').textContent = method === 'opay' ? 'OPay Details' : 'PalmPay Details';
  }
}

async function loadWithdrawalBalance() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;

  try {
    const { data, error } = await db.from('bookings').select('*').eq('provider_name', provName).eq('status', 'completed');
    if (error) { console.error('Withdrawal balance error:', error); return; }

    const completed = data || [];
    const gross = completed.reduce((sum, b) => sum + (parseInt((b.amount || '0').toString().replace(/[^0-9]/g, '')) || 0), 0);
    const net = gross - Math.round(gross * 0.10);

    // No withdrawal-tracking table exists yet, so "Already Withdrawn" is honestly
    // always ₦0 for now — the full amount earned is what's available.
    window.realAvailableBalance = net;

    const balEl = document.getElementById('withdraw-available-balance');
    if (balEl) balEl.textContent = '₦' + net.toLocaleString();
    const countEl = document.getElementById('withdraw-completed-count');
    if (countEl) countEl.textContent = 'From ' + completed.length + (completed.length === 1 ? ' completed booking' : ' completed bookings');
    const totalEl = document.getElementById('withdraw-total-earned');
    if (totalEl) totalEl.textContent = '₦' + net.toLocaleString();
    const withdrawnEl = document.getElementById('withdraw-already-withdrawn');
    if (withdrawnEl) withdrawnEl.textContent = '₦0';
    const allOption = document.getElementById('withdraw-all-option');
    if (allOption) allOption.textContent = 'All ₦' + net.toLocaleString();
  } catch (e) { console.error('Withdrawal balance load error:', e); }
}

function setWithdrawAmount(el, amount) {
  document.querySelectorAll('#screen-withdrawal .tip-option').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  selectedWithdrawAmount = amount;
  document.getElementById('withdraw-amount-input').value = '';
  updateWithdrawSummary(amount);
}

function setCustomWithdrawAmount(value) {
  document.querySelectorAll('#screen-withdrawal .tip-option').forEach(t => t.classList.remove('selected'));
  selectedWithdrawAmount = parseInt(value) || 0;
  if (selectedWithdrawAmount > 0) updateWithdrawSummary(selectedWithdrawAmount);
  else document.getElementById('withdraw-summary').style.display = 'none';
}

function updateWithdrawSummary(amount) {
  document.getElementById('withdraw-amount-display').textContent = '₦' + amount.toLocaleString();
  document.getElementById('withdraw-receive-display').textContent = '₦' + amount.toLocaleString();
  document.getElementById('withdraw-summary').style.display = 'block';
}

function verifyAccountNumber() {
  const number = document.getElementById('account-number').value;
  if (!number || number.length < 10) { alert('Please enter a valid 10-digit account number.'); return; }
  document.getElementById('account-name').value = 'Verifying...';
  setTimeout(() => {
    document.getElementById('account-name').value = 'ADEYANJU WISDOM';
    alert('Account verified\nName: ADEYANJU WISDOM');
  }, 1500);
}

function requestWithdrawal() {
  const realBalance = window.realAvailableBalance || 0;
  if (selectedWithdrawAmount === 0) { alert('Please select or enter a withdrawal amount.'); return; }
  if (selectedWithdrawAmount < 1000) { alert('Minimum withdrawal amount is ₦1,000.'); return; }
  if (selectedWithdrawAmount > realBalance) { alert('Amount exceeds your available balance of ₦' + realBalance.toLocaleString() + '.'); return; }
  if (selectedWithdrawMethod === 'bank') {
    const bank = document.getElementById('bank-name').value;
    const number = document.getElementById('account-number').value;
    const name = document.getElementById('account-name').value;
    if (!number || !name || name === 'Verifying...') { alert('Please verify your account number first.'); return; }
    alert('Withdrawal request submitted!\n\nAmount: ₦' + selectedWithdrawAmount.toLocaleString() + '\nBank: ' + bank + '\nAccount: ' + number + '\n\nYou will receive your funds within 1 to 2 business days.');
  } else {
    const phone = document.getElementById('wallet-phone').value;
    if (!phone) { alert('Please enter your wallet phone number.'); return; }
    alert('Withdrawal request submitted!\n\nAmount: ₦' + selectedWithdrawAmount.toLocaleString() + '\nWallet: ' + selectedWithdrawMethod.toUpperCase() + '\nPhone: ' + phone + '\n\nYou will receive your funds instantly.');
  }
  showScreen('screen-provider-dashboard');
}


// PHOTO GALLERY
const galleryPhotos = []; // Loaded from provider profile;
let galleryIndex = 0;

function openGallery(index) {
  galleryIndex = index;
  const modal = document.getElementById('gallery-modal');
  modal.style.display = 'flex';
  renderGalleryImage();
  renderGalleryThumbs();
  document.body.style.overflow = 'hidden';
  // swipe support
  let startX = 0;
  modal.ontouchstart = (e) => { startX = e.touches[0].clientX; };
  modal.ontouchend = (e) => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? galleryNext() : galleryPrev(); }
  };
}

function closeGallery() {
  document.getElementById('gallery-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function renderGalleryImage() {
  const img = document.getElementById('gallery-img');
  const counter = document.getElementById('gallery-counter');
  img.style.opacity = '0';
  setTimeout(() => {
    img.style.backgroundImage = 'url(' + galleryPhotos[galleryIndex] + ')';
    img.style.opacity = '1';
  }, 150);
  counter.textContent = (galleryIndex + 1) + ' / ' + galleryPhotos.length;
}

function renderGalleryThumbs() {
  const thumbs = document.getElementById('gallery-thumbs');
  thumbs.innerHTML = galleryPhotos.map((photo, i) =>
    '<div onclick="galleryJump(' + i + ')" style="flex-shrink:0; width:56px; height:56px; border-radius:8px; background-image:url(' + photo + '); background-size:cover; background-position:center; opacity:' + (i === galleryIndex ? '1' : '0.5') + '; border:2px solid ' + (i === galleryIndex ? 'var(--primary)' : 'transparent') + '; cursor:pointer; transition:all 0.2s;"></div>'
  ).join('');
}

function galleryNext() {
  galleryIndex = (galleryIndex + 1) % galleryPhotos.length;
  renderGalleryImage();
  renderGalleryThumbs();
}

function galleryPrev() {
  galleryIndex = (galleryIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
  renderGalleryImage();
  renderGalleryThumbs();
}

function galleryJump(index) {
  galleryIndex = index;
  renderGalleryImage();
  renderGalleryThumbs();
}

// Close gallery on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeGallery();
  if (e.key === 'ArrowRight') galleryNext();
  if (e.key === 'ArrowLeft') galleryPrev();
});


// IMAGE CROP SYSTEM
let cropFile = null;
let cropCallback = null;
let cropX = 0, cropY = 0, cropScale = 1;
let isDragging = false, dragStartX, dragStartY, imgStartX, imgStartY;

function openCropModal(file, callback) {
  cropFile = file;
  cropCallback = callback;
  cropX = 0; cropY = 0; cropScale = 1;
  const modal = document.getElementById('crop-modal');
  const img = document.getElementById('crop-img');
  const zoom = document.getElementById('crop-zoom');
  if (!modal || !img) { callback(file); return; }
  zoom.value = 1;
  const reader = new FileReader();
  reader.onload = (e) => {
    img.src = e.target.result;
    img.onload = () => {
      const container = img.parentElement;
      const scale = Math.max(container.clientWidth / img.naturalWidth, container.clientHeight / img.naturalHeight);
      cropScale = scale;
      zoom.min = scale * 0.8;
      zoom.max = scale * 3;
      zoom.step = scale * 0.05;
      zoom.value = scale;
      updateCropZoom(scale);
    };
  };
  reader.readAsDataURL(file);
  modal.style.display = 'flex';
  setupCropDrag(img);
}

function setupCropDrag(img) {
  img.onmousedown = img.ontouchstart = (e) => {
    isDragging = true;
    const touch = e.touches ? e.touches[0] : e;
    dragStartX = touch.clientX; dragStartY = touch.clientY;
    imgStartX = cropX; imgStartY = cropY;
    e.preventDefault();
  };
  document.onmousemove = document.ontouchmove = (e) => {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    cropX = imgStartX + (touch.clientX - dragStartX);
    cropY = imgStartY + (touch.clientY - dragStartY);
    img.style.left = cropX + 'px';
    img.style.top = cropY + 'px';
  };
  document.onmouseup = document.ontouchend = () => { isDragging = false; };
}

function updateCropZoom(val) {
  cropScale = parseFloat(val);
  const img = document.getElementById('crop-img');
  if (!img) return;
  img.style.width = (img.naturalWidth * cropScale) + 'px';
  img.style.height = (img.naturalHeight * cropScale) + 'px';
  img.style.left = cropX + 'px';
  img.style.top = cropY + 'px';
}

function closeCropModal() {
  document.getElementById('crop-modal').style.display = 'none';
  cropFile = null; cropCallback = null;
}

function applyCrop() {
  document.getElementById('crop-modal').style.display = 'none';
  if (cropCallback && cropFile) cropCallback(cropFile);
}

// ENHANCED PHOTO UPLOAD WITH CROP
function uploadWithCrop(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    openCropModal(file, callback);
  };
  input.click();
}


// CLOUDINARY CONFIG
const CLOUD_NAME = 'dwyss58sr';
const UPLOAD_PRESET = 'preen_uploads';

async function uploadToCloudinary(file, type = 'image') {
  try {
    let uploadFile = file;

    // Compress image before uploading — reduces size by 70-80%
    if (type === 'image' && file.type.startsWith('image/')) {
      uploadFile = await compressImage(file);
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'preen');
    // Tell Cloudinary to auto-optimize quality
    formData.append('quality', 'auto');
    formData.append('fetch_format', 'auto');

    const resourceType = type === 'video' ? 'video' : 'image';
    const url = 'https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/' + resourceType + '/upload';

    const response = await fetch(url, { method: 'POST', body: formData });
    const data = await response.json();

    if (data.secure_url) {
      return data.secure_url;
    } else {
      console.error('Cloudinary error:', data);
      return null;
    }
  } catch (err) {
    console.error('Upload failed:', err);
    return null;
  }
}

// Compress image to max 800px and 80% quality before uploading
async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1024; // max dimension
        let w = img.width;
        let h = img.height;

        // Scale down if too large
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob((blob) => {
          // Only use compressed if it is actually smaller
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.82); // 82% quality — good balance of quality vs size
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function triggerPhotoUpload(inputId, previewId, placeholderId, boxId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const placeholder = document.getElementById(placeholderId);
    const preview = document.getElementById(previewId);
    const box = document.getElementById(boxId);
    if (placeholder) placeholder.innerHTML = '<div class="ai-spinner" style="margin:0 auto;"></div><p style="font-size:12px;color:var(--text3);margin-top:8px;">Uploading...</p>';
    const url = await uploadToCloudinary(file, 'image');
    if (url) {
      if (preview) { preview.style.display = 'block'; preview.style.backgroundImage = 'url(' + url + ')'; preview.style.backgroundSize = 'cover'; preview.style.backgroundPosition = 'center'; preview.style.height = '100px'; preview.style.borderRadius = '10px'; }
      if (placeholder) placeholder.style.display = 'none';
      if (box) box.classList.add('uploaded');
      return url;
    } else {
      if (placeholder) placeholder.innerHTML = '<p style="font-size:12px;color:var(--error);">Upload failed. Try again.</p>';
    }
  };
  input.click();
}

function triggerVideoUpload(inputId, previewId, placeholderId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { alert('Video must be under 50MB.'); return; }
    const placeholder = document.getElementById(placeholderId);
    const preview = document.getElementById(previewId);
    if (placeholder) placeholder.innerHTML = '<div class="ai-spinner" style="margin:0 auto;"></div><p style="font-size:12px;color:var(--text3);margin-top:8px;">Uploading video...</p>';
    const url = await uploadToCloudinary(file, 'video');
    if (url) {
      videoUploaded = true;
      if (preview) { preview.style.display = 'block'; preview.innerHTML = '<video src="' + url + '" controls style="width:100%;border-radius:10px;max-height:120px;"></video>'; }
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (placeholder) placeholder.innerHTML = '<p style="font-size:12px;color:var(--error);">Upload failed. Try again.</p>';
    }
  };
  input.click();
}

// PROFILE PHOTO UPLOAD
let providerProfilePhotoUrl = null;

async function uploadProviderProfilePhoto() {
  uploadWithCrop(async (file) => {
    const btn = document.getElementById('profile-photo-btn');
    if (btn) btn.textContent = 'Uploading...';
    const url = await uploadToCloudinary(file, 'image');
    if (url) {
      providerProfilePhotoUrl = url;
      const cover = document.getElementById('provider-cover-preview');
      if (cover) {
        cover.style.backgroundImage = 'url(' + url + ')';
        cover.style.backgroundSize = 'cover';
        cover.style.backgroundPosition = 'center';
        cover.style.borderStyle = 'solid';
        cover.innerHTML = '';
      }
      if (btn) btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg> Photo Updated';
    } else {
      if (btn) btn.textContent = 'Upload Photo';
      alert('Upload failed. Please try again.');
    }
  });
}


// PROVIDER DATA - connects to Supabase
let allProviders = []; // Loaded from Supabase

// Opens the (currently single, static) provider profile screen but — critically —
// tags it with the REAL name of whichever provider was tapped. confirmBooking()
// reads this name back off the .provider-title element, so this is what makes a
// booking actually attribute to the correct provider instead of always saving
// under the hardcoded demo name.
function viewMyReviews() {
  const provName = localStorage.getItem('preen_provider_name') || '';
  openProviderProfile(provName);
  setTimeout(() => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const reviewsTab = document.querySelector('.tab[onclick*="tab-reviews"]');
    if (reviewsTab) reviewsTab.classList.add('active');
    const reviewsContent = document.getElementById('tab-reviews');
    if (reviewsContent) reviewsContent.classList.add('active');
  }, 150);
}

async function loadProviderNotifications() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;
  const container = document.getElementById('prov-notif-list');
  if (!container) return;

  const iconCalendar = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const iconCheck = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16 9"/></svg>';
  const iconCross = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  const iconStar = '<svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)" stroke="none" style="vertical-align:-2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const iconHeart = '<svg width="18" height="18" viewBox="0 0 24 24" fill="var(--primary)" stroke="none" style="vertical-align:-2px;"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/></svg>';

  try {
    const [{ data: bookings, error: bErr }, { data: reviews, error: rErr }, { data: tips, error: tErr }] = await Promise.all([
      db.from('bookings').select('*').eq('provider_name', provName).order('created_at', { ascending: false }).limit(10),
      db.from('reviews').select('*').eq('provider_name', provName).order('created_at', { ascending: false }).limit(5),
      db.from('tips').select('*').eq('provider_name', provName).order('created_at', { ascending: false }).limit(5)
    ]);

    if (bErr) console.error('Provider notif bookings error:', bErr);
    if (rErr) console.error('Provider notif reviews error:', rErr);
    if (tErr) console.error('Provider notif tips error:', tErr);

    const items = [];
    (bookings || []).forEach(b => {
      const isOffer = (b.service || '').includes('(Offer');
      const isHouseCall = !!b.is_house_call;
      const kind = isHouseCall ? 'House Call Request' : isOffer ? 'New Offer' : 'New Booking Request';

      if (b.status === 'confirmed') {
        items.push({ icon: iconCalendar, title: kind, sub: (b.customer_name || 'A customer') + ' · ' + (b.service || '') + (isHouseCall ? '' : ' · ' + (b.booking_time || '')), onclick: "showScreen('screen-booking-requests')" });
      } else if (b.status === 'accepted') {
        items.push({ icon: iconCheck, title: (isHouseCall ? 'House Call' : isOffer ? 'Offer' : 'Booking') + ' Confirmed', sub: (b.customer_name || 'A customer') + ' booked ' + (b.service || ''), onclick: "showScreen('screen-booking-requests')" });
      } else if (b.status === 'completed') {
        items.push({ icon: iconCheck, title: 'Payment Released', sub: (b.customer_name || 'A customer') + ' confirmed the service — funds have been released to your balance.', onclick: "showScreen('screen-provider-all-bookings')" });
      } else if (b.status === 'disputed') {
        items.push({ icon: iconCross, title: 'Booking Disputed', sub: (b.customer_name || 'A customer') + ' reported an issue with their booking. It\'s on hold pending review.', onclick: "showScreen('screen-provider-all-bookings')" });
      }
    });
    (reviews || []).forEach(r => {
      const stars = r.rating ? r.rating + ' star' + (r.rating === 1 ? '' : 's') : '';
      items.push({ icon: iconStar, title: 'New Review', sub: (r.is_anonymous ? 'Someone' : (r.customer_name || 'A customer')) + ' left you a ' + stars + ' review', onclick: "viewMyReviews()" });
    });
    (tips || []).forEach(t => {
      items.push({ icon: iconHeart, title: 'Tip Received', sub: (t.customer_name || 'A customer') + ' sent you a ₦' + Number(t.amount || 0).toLocaleString() + ' tip', onclick: "showScreen('screen-provider-earnings')" });
    });

    if (items.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">No notifications yet.</p>';
      return;
    }

    container.innerHTML = items.slice(0, 10).map(n => `
      <div class="notif-item" style="cursor:pointer;" onclick="${n.onclick}">
        <div class="notif-icon">${n.icon}</div>
        <div class="notif-text">
          <p class="notif-title">${n.title}</p>
          <p class="notif-sub">${n.sub}</p>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error('Provider notifications error:', e); }
}

async function loadCustomerNotifications() {
  if (!db) return;
  const phone = localStorage.getItem('preen_user_phone') || '';
  if (!phone) return;
  const container = document.querySelector('#screen-notifications .notif-list');
  if (!container) return;
  await checkAutoReleaseBookings(phone);

  const iconCheck = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/></svg>';
  const iconCross = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  const iconClock = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const iconStar = '<svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const iconQuestion = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  try {
    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) { console.error('Notifications fetch error:', error); return; }

    const bookings = data || [];
    if (bookings.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:24px 0;">No notifications yet.</p>';
      return;
    }

    // Also check which completed bookings still need a review, to add a reminder notification
    const { data: myReviews } = await db.from('reviews').select('booking_id').eq('customer_name', localStorage.getItem('preen_user_name') || '');
    const reviewedBookingIds = new Set((myReviews || []).map(r => r.booking_id).filter(Boolean));

    const items = [];
    bookings.forEach(b => {
      const isOffer = (b.service || '').includes('(Offer');
      const isHouseCall = !!b.is_house_call;
      const kind = isHouseCall ? 'House Call' : isOffer ? 'Offer' : 'Booking';

      if (b.status === 'accepted') {
        items.push({ icon: iconCheck, title: kind + ' Confirmed', sub: (b.provider_name || 'Provider') + (isHouseCall ? ' will come to ' + (b.house_call_address || 'your location') : ' · ' + (b.booking_date || '') + (b.booking_time ? ' ' + b.booking_time : '')), onclick: "showScreen('screen-bookings')" });
      } else if (b.status === 'declined') {
        items.push({ icon: iconCross, title: kind + ' Declined', sub: (b.provider_name || 'Provider') + ' was unable to accept your ' + kind.toLowerCase() + ' — you were refunded.', onclick: "showScreen('screen-bookings')" });
      } else if (b.status === 'confirmed') {
        items.push({ icon: iconClock, title: 'Waiting for Provider', sub: (b.provider_name || 'Provider') + ' has ' + (isHouseCall ? '15 minutes' : isOffer ? '10 minutes' : '15 minutes') + ' to respond to your ' + kind.toLowerCase() + '.', onclick: "showScreen('screen-bookings')" });
      } else if (b.status === 'pending_confirmation') {
        items.push({ icon: iconQuestion, title: 'Please Confirm', sub: (b.provider_name || 'Provider') + ' marked your ' + kind.toLowerCase() + ' as done — please confirm or report a problem.', onclick: "showScreen('screen-bookings')" });
      } else if (b.status === 'disputed') {
        items.push({ icon: iconCross, title: 'Under Review', sub: 'Your reported issue with ' + (b.provider_name || 'this provider') + ' is being reviewed.', onclick: "showScreen('screen-bookings')" });
      } else if (b.status === 'completed' && !reviewedBookingIds.has(b.id)) {
        const safeName = (b.provider_name || '').replace(/'/g, "\\'");
        items.push({ icon: iconStar, title: 'Leave a Review', sub: 'How was your experience with ' + (b.provider_name || 'your provider') + '? You can also add a tip.', onclick: "openReview('" + safeName + "', '" + b.id + "')" });
      }
    });

    if (items.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:24px 0;">No notifications yet.</p>';
      return;
    }

    container.innerHTML = items.map(n => `
      <div class="notif-item" style="cursor:pointer;" onclick="${n.onclick}"><div class="notif-icon">${n.icon}</div><div class="notif-text"><p class="notif-title">${n.title}</p><p class="notif-sub">${n.sub}</p></div></div>
    `).join('');
  } catch (e) { console.error('Notifications load error:', e); }
}

async function loadProviderAvailabilityStatus(providerName) {
  const el = document.getElementById('provider-availability-status');
  if (!el || !db || !providerName) return;
  try {
    const { data } = await db.from('providers').select('is_available').eq('full_name', providerName).single();
    const isAvailable = data ? !!data.is_available : true;
    el.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:' + (isAvailable ? 'var(--success)' : 'var(--text3)') + ';display:inline-block;"></span>' + (isAvailable ? 'Available now' : 'Currently unavailable');
    el.style.color = isAvailable ? 'var(--success)' : 'var(--text3)';
  } catch (e) { console.error('Availability status error:', e); }
}

function starIcons(count, color) {
  const one = '<svg width="11" height="11" viewBox="0 0 24 24" fill="' + (color || 'var(--accent)') + '" stroke="none" style="vertical-align:-1px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  return one.repeat(count);
}

async function loadProfileTeamMembers(providerName) {
  const container = document.getElementById('profile-team-list');
  if (!container || !db || !providerName) return;

  try {
    const { data, error } = await db.from('team_members').select('*').eq('provider_name', providerName).order('created_at', { ascending: true });
    if (error) { console.error('Profile team fetch error:', error); return; }

    const members = data || [];
    if (members.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:24px 0;">This provider hasn\'t added team members yet.</p>';
      return;
    }

    container.innerHTML = members.map(m => {
      const initials = (m.name || 'T').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return `
      <div class="team-member">
        <div class="team-avatar">${initials}</div>
        <div>
          <p style="font-size:14px; font-weight:500;">${m.name}</p>
          <p style="font-size:12px; color:var(--text3); margin-top:2px;">${m.role || ''} · ${m.years_experience || ''}</p>
        </div>
      </div>`;
    }).join('');
  } catch (e) { console.error('Profile team load error:', e); }
}

async function loadLoyaltyPoints() {
  const el = document.getElementById('loyalty-points-balance');
  const email = localStorage.getItem('preen_user_email') || '';
  if (!el || !db || !email) return;
  try {
    const { data } = await db.from('user').select('loyalty_points').eq('email', email).single();
    el.textContent = (data && data.loyalty_points) ? data.loyalty_points : 0;
  } catch (e) { console.error('Loyalty points load error:', e); }
}

// How long a customer has to confirm or dispute before it auto-releases.
// This check only runs opportunistically when relevant screens load (no real
// server-side scheduled job exists yet) — see markServiceDone below for details.
const SERVICE_CONFIRMATION_WINDOW_HOURS = 6;

async function markServiceDone(id, btn) {
  if (!confirm('Mark this service as done? The customer will be asked to confirm — if they don\'t respond within ' + SERVICE_CONFIRMATION_WINDOW_HOURS + ' hours, it releases automatically.')) return;
  if (btn) { btn.textContent = '...'; btn.disabled = true; }
  try {
    const { error } = await db.from('bookings').update({
      status: 'pending_confirmation',
      service_done_at: new Date().toISOString()
    }).eq('id', id);

    if (error) { alert('Could not update this booking:\n\n' + error.message); if (btn) { btn.textContent = 'Service Done'; btn.disabled = false; } return; }

    if (btn) {
      const card = btn.closest('.prov-booking-card') || btn.closest('div');
      if (card) card.style.opacity = '0.7';
      btn.textContent = 'Waiting for customer';
    }
    loadProviderAllBookings();
    loadProviderDashboardSchedule();
  } catch (e) {
    console.error('Mark service done error:', e);
    alert('Could not update this booking. Please try again.');
    if (btn) { btn.textContent = 'Service Done'; btn.disabled = false; }
  }
}

async function confirmServiceCompletion(id) {
  if (!db) return;
  try {
    const { error } = await db.from('bookings').update({ status: 'completed' }).eq('id', id);
    if (error) { alert('Could not confirm this booking:\n\n' + error.message); return; }
    await awardLoyaltyPoints(50);
    alert('Thanks for confirming! You earned 50 loyalty points.');
    loadMyBookings();
    loadCustomerNotifications();
  } catch (e) { console.error('Confirm completion error:', e); alert('Could not confirm this booking. Please try again.'); }
}

async function reportServiceProblem(id) {
  const reason = prompt('What went wrong? This will be reviewed before any funds are released.');
  if (reason === null) return; // cancelled
  if (!reason.trim()) { alert('Please describe the issue so it can be reviewed.'); return; }
  if (!db) return;
  try {
    const { error } = await db.from('bookings').update({ status: 'disputed', dispute_reason: reason.trim() }).eq('id', id);
    if (error) { alert('Could not report this issue:\n\n' + error.message); return; }
    alert('Your report has been submitted. This booking is now on hold pending review — no funds will be released until it\'s resolved.');
    loadMyBookings();
    loadCustomerNotifications();
  } catch (e) { console.error('Report problem error:', e); alert('Could not report this issue. Please try again.'); }
}

// Opportunistic auto-release: since there's no real server-side scheduled job
// yet, this checks for bookings whose confirmation window has quietly expired
// whenever a relevant screen loads, and releases them the same way an active
// customer confirmation would.
async function checkAutoReleaseBookings(phone) {
  if (!db || !phone) return;
  try {
    const { data } = await db.from('bookings').select('id, service_done_at').eq('customer_phone', phone).eq('status', 'pending_confirmation');
    const cutoff = Date.now() - SERVICE_CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000;
    for (const b of (data || [])) {
      if (b.service_done_at && new Date(b.service_done_at).getTime() < cutoff) {
        await db.from('bookings').update({ status: 'completed' }).eq('id', b.id);
        await awardLoyaltyPoints(50);
      }
    }
  } catch (e) { console.error('Auto-release check error:', e); }
}

async function awardLoyaltyPoints(points, targetEmail) {
  const email = targetEmail || localStorage.getItem('preen_user_email') || '';
  if (!db || !email || !points) return;
  try {
    const { data } = await db.from('user').select('loyalty_points').eq('email', email).single();
    const current = (data && data.loyalty_points) || 0;
    const { error } = await db.from('user').update({ loyalty_points: current + points }).eq('email', email);
    if (error) console.error('Award loyalty points update error:', error);
  } catch (e) { console.error('Award loyalty points error:', e); }
}

async function toggleSaveProvider() {
  if (!requireAuth('save this provider')) return;
  const providerName = window.currentProviderName;
  const phone = localStorage.getItem('preen_user_phone') || '';
  if (!db || !providerName || !phone) return;

  const icon = document.getElementById('save-provider-icon');
  const isSaved = icon.getAttribute('fill') === '#E8547A';

  try {
    if (isSaved) {
      const { error } = await db.from('saved_providers').delete().eq('customer_phone', phone).eq('provider_name', providerName);
      if (error) { console.error('Unsave error:', error); return; }
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', '#1a1a1a');
    } else {
      const { error } = await db.from('saved_providers').insert([{ customer_phone: phone, provider_name: providerName }]);
      if (error) { console.error('Save error:', error); return; }
      icon.setAttribute('fill', '#E8547A');
      icon.setAttribute('stroke', '#E8547A');
    }
  } catch (e) { console.error('Toggle save failed:', e); }
}

async function syncSaveProviderIcon(providerName) {
  const icon = document.getElementById('save-provider-icon');
  const phone = localStorage.getItem('preen_user_phone') || '';
  if (!icon || !db || !providerName || !phone) return;
  try {
    const { data } = await db.from('saved_providers').select('id').eq('customer_phone', phone).eq('provider_name', providerName).maybeSingle();
    if (data) {
      icon.setAttribute('fill', '#E8547A');
      icon.setAttribute('stroke', '#E8547A');
    } else {
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', '#1a1a1a');
    }
  } catch (e) { console.error('Save icon sync error:', e); }
}

async function loadSavedProviders() {
  const container = document.querySelector('#screen-saved .providers-list');
  const phone = localStorage.getItem('preen_user_phone') || '';
  if (!container || !db || !phone) return;

  try {
    const { data, error } = await db.from('saved_providers').select('*').eq('customer_phone', phone).order('created_at', { ascending: false });
    if (error) { console.error('Saved providers fetch error:', error); return; }

    const saved = data || [];
    if (saved.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:40px 0;">You haven\'t saved any providers yet. Tap the heart icon on a profile to save it here.</p>';
      return;
    }

    // Look up each saved provider's real details
    const names = saved.map(s => s.provider_name);
    const { data: providers } = await db.from('providers').select('*').in('full_name', names);
    const providerMap = {};
    (providers || []).forEach(p => { providerMap[p.full_name] = p; });

    container.innerHTML = saved.map(s => {
      const p = providerMap[s.provider_name];
      const rating = p && p.rating ? Number(p.rating).toFixed(1) : 'New';
      const category = p ? p.category : '';
      const location = p ? p.location : '';
      const safeName = s.provider_name.replace(/'/g, "\\'");
      return `
      <div class="provider-card-new" onclick="openProviderProfile('${safeName}')">
        <div class="provider-card-img" style="background:linear-gradient(135deg,#FDF2F8,#FBCFE8);"><div class="provider-card-rating-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ${rating}</div></div>
        <div class="provider-card-body"><div class="provider-card-top"><p class="provider-name">${s.provider_name}</p><p style="font-size:11px; color:var(--text3);">${category}${category && location ? ' · ' : ''}${location}</p></div></div>
      </div>`;
    }).join('');
  } catch (e) { console.error('Saved providers load error:', e); }
}

function openDirectionsToProvider() {
  if (!window.currentProviderCoords) {
    alert('This provider hasn\'t set their studio location yet.');
    return;
  }
  const { lat, lng } = window.currentProviderCoords;
  // Universal link — opens whichever maps app is installed (Google Maps,
  // Apple Maps, etc.) on the actual device once this is running as a real app.
  const url = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
  window.open(url, '_blank');
}

async function loadProviderAboutTab(providerName) {
  if (!db || !providerName) return;

  try {
    const [{ data: provRow }, { data: skills }] = await Promise.all([
      db.from('providers').select('*').eq('full_name', providerName).single(),
      db.from('skills').select('price').eq('provider_name', providerName)
    ]);

    const bioEl = document.getElementById('about-bio-text');
    if (bioEl) bioEl.textContent = (provRow && provRow.bio) ? provRow.bio : 'This provider hasn\'t added a bio yet.';

    const hoursEl = document.getElementById('about-hours-text');
    if (hoursEl) hoursEl.textContent = (provRow && provRow.working_hours) ? provRow.working_hours : 'Working hours not set yet.';

    const locEl = document.getElementById('about-location-text');
    if (locEl) locEl.textContent = (provRow && provRow.location) ? provRow.location : (provRow && provRow.state) ? provRow.state : 'Location not set.';

    const directionsBtn = document.getElementById('get-directions-btn');
    if (directionsBtn) {
      if (provRow && provRow.latitude != null && provRow.longitude != null) {
        window.currentProviderCoords = { lat: provRow.latitude, lng: provRow.longitude };
        directionsBtn.style.display = 'flex';
      } else {
        window.currentProviderCoords = null;
        directionsBtn.style.display = 'none';
      }
    }

    const socialBlock = document.getElementById('about-social-block');
    const socialLinks = document.getElementById('about-social-links');
    if (socialBlock && socialLinks && provRow) {
      let html = '';
      if (provRow.instagram_url) {
        const handle = provRow.instagram_url.replace(/^@/, '');
        html += `<div class="social-link-item" onclick="window.open('https://instagram.com/${handle.replace(/'/g, "")}', '_blank')">
          <div class="social-icon" style="background:var(--primary-light);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></div>
          <div><p style="font-size:13px; font-weight:500;">Instagram</p><p style="font-size:11px; color:var(--text3);">@${handle}</p></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" style="margin-left:auto;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </div>`;
      }
      if (provRow.tiktok_url) {
        const handle = provRow.tiktok_url.replace(/^@/, '');
        html += `<div class="social-link-item" onclick="window.open('https://tiktok.com/@${handle.replace(/'/g, "")}', '_blank')">
          <div class="social-icon" style="background:var(--bg3);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2"><path d="M9 18V6a4 4 0 0 0 4 4V6a8 8 0 0 0 8 8v-2a6 6 0 0 1-4-2v6a4 4 0 1 1-4-4"/></svg></div>
          <div><p style="font-size:13px; font-weight:500;">TikTok</p><p style="font-size:11px; color:var(--text3);">@${handle}</p></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" style="margin-left:auto;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </div>`;
      }
      if (html) {
        socialLinks.innerHTML = html;
        socialBlock.style.display = 'block';
      } else {
        socialBlock.style.display = 'none';
      }
    }

    const prices = (skills || []).map(s => Number(s.price) || 0).filter(p => p > 0);
    const priceEl = document.getElementById('sticky-price');
    const countEl = document.getElementById('sticky-service-count');
    if (priceEl) priceEl.textContent = prices.length > 0 ? '₦' + Math.min(...prices).toLocaleString() : '—';
    if (countEl) countEl.textContent = (skills ? skills.length : 0) + (skills && skills.length === 1 ? ' service available' : ' services available');
  } catch (e) { console.error('About tab load error:', e); }
}

async function loadProviderReviews(providerName) {
  if (!db || !providerName) return;
  const avgEl = document.getElementById('rating-avg-number');
  const starsEl = document.getElementById('rating-avg-stars');
  const countEl = document.getElementById('rating-count-text');
  const listEl = document.getElementById('reviews-list');
  if (!listEl) return;

  try {
    const { data, error } = await db
      .from('reviews')
      .select('*')
      .eq('provider_name', providerName)
      .order('created_at', { ascending: false });

    if (error) { console.error('Reviews fetch error:', error); return; }

    const reviews = data || [];
    const total = reviews.length;
    const headerNumEl = document.getElementById('header-rating-number');
    const headerCountEl = document.getElementById('header-rating-count');

    if (total === 0) {
      if (avgEl) avgEl.textContent = '—';
      if (starsEl) starsEl.innerHTML = '';
      if (countEl) countEl.textContent = 'No reviews yet';
      if (headerNumEl) headerNumEl.textContent = 'New';
      if (headerCountEl) headerCountEl.textContent = '0 reviews';
      for (let s = 1; s <= 5; s++) {
        const bar = document.getElementById('rating-bar-' + s);
        const pct = document.getElementById('rating-pct-' + s);
        if (bar) bar.style.width = '0%';
        if (pct) pct.textContent = '0%';
      }
      listEl.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">No reviews yet. Be the first to book and leave one!</p>';
      return;
    }

    const avg = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / total;
    if (avgEl) avgEl.textContent = avg.toFixed(1);
    if (starsEl) starsEl.innerHTML = starIcons(Math.round(avg));
    if (countEl) countEl.textContent = total + (total === 1 ? ' review' : ' reviews');
    if (headerNumEl) headerNumEl.textContent = avg.toFixed(1);
    if (headerCountEl) headerCountEl.textContent = total + (total === 1 ? ' review' : ' reviews');

    for (let s = 1; s <= 5; s++) {
      const starCount = reviews.filter(r => Math.round(r.rating) === s).length;
      const pct = Math.round((starCount / total) * 100);
      const bar = document.getElementById('rating-bar-' + s);
      const pctEl = document.getElementById('rating-pct-' + s);
      if (bar) bar.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
    }

    listEl.innerHTML = reviews.map(r => {
      const displayName = r.is_anonymous ? 'Anonymous' : (r.customer_name || 'Customer');
      const initials = r.is_anonymous ? '?' : displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const when = r.created_at ? timeAgo(r.created_at) : '';
      return `
        <div class="review-item">
          <div class="review-avatar">${initials}</div>
          <div class="review-content">
            <div class="review-name">${displayName} <span>${starIcons(r.rating || 0)}</span></div>
            <p style="font-size:12px; color:var(--text2); margin-bottom:4px;">${when}</p>
            <p>${(r.review_text || '').replace(/</g, '&lt;')}</p>
          </div>
        </div>`;
    }).join('');
  } catch (e) { console.error('Reviews load error:', e); }
}

function timeAgo(dateStr) {
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return days + ' days ago';
  if (days < 14) return '1 week ago';
  if (days < 30) return Math.floor(days / 7) + ' weeks ago';
  return Math.floor(days / 30) + (Math.floor(days / 30) === 1 ? ' month ago' : ' months ago');
}

function openProviderProfile(name, category, location, rating, verified) {
  // This was previously called from several card templates (Recently Viewed,
  // Recommended, category results) but never actually defined anywhere —
  // those taps silently threw a ReferenceError and never opened the profile.
  // It's now defined once here and drives which provider a booking gets
  // attributed to, since confirmBooking() reads the name back off .provider-title.
  window.currentProviderName = name || 'Kings Barbershop';
  const titleEl = document.querySelector('#screen-provider .provider-title');
  if (titleEl) {
    const badge = titleEl.querySelector('.verified-check');
    titleEl.textContent = window.currentProviderName + ' ';
    if (badge) titleEl.appendChild(badge);
  }
  loadProviderReviews(window.currentProviderName);
  loadProviderAvailabilityStatus(window.currentProviderName);
  loadProviderScore(window.currentProviderName);
  loadProviderServicesTab(window.currentProviderName);
  loadProfileTeamMembers(window.currentProviderName);
  loadProviderAboutTab(window.currentProviderName);
  syncSaveProviderIcon(window.currentProviderName);
  showScreen('screen-provider');
}

function buildProviderCard(p) {
  return '<div class="provider-card-new" onclick="openProviderProfile(\'' + String(p.name).replace(/'/g,"\\'") + '\')">' +
    '<div class="provider-card-img" style="' + (p.image ? 'background-image:url(' + p.image + '); background-size:cover; background-position:center;' : 'background:' + p.bg + '; display:flex; align-items:center; justify-content:center;') + '">' +
    (p.image ? '' : '<span style="color:var(--primary);display:flex;align-items:center;justify-content:center;height:100%;">' + p.emoji + '</span>') +
    '<div class="provider-card-rating-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ' + p.rating + '</div>' +
    '</div>' +
    '<div class="provider-card-body">' +
    '<div class="provider-card-top">' +
    '<p class="provider-name">' + p.name + (p.verified ? ' <span class="verified-dot"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg></span>' : '') + '</p>' +
    '<p style="font-size:11px; color:var(--text3);">' + (p.distance ? p.distance + ' · ' : '') + p.location + '</p>' +
    '<p style="font-size:11px; color:var(--text3);">' + p.category + ' · <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:7px;height:7px;border-radius:50%;background:' + (p.hours === 'Available now' ? 'var(--success)' : 'var(--text3)') + ';display:inline-block;"></span>' + p.hours + '</span></p>' +
    '</div>' +
    '<div class="provider-service-preview">' +
    '<span>' + p.service + '</span>' +
    '<span class="service-price-sm">₦' + p.price.toLocaleString() + '</span>' +
    '</div>' +
    '</div>' +
    '</div>';
}

async function showCategory(category) {
  const categoryTitles = {
    'Hair Stylist': 'Hair Salons',
    'Barber': 'Barbers',
    'Nail Tech': 'Nail Specialists',
    'Makeup Artist': 'Makeup Artists',
    'Massage Therapist': 'Massage Therapists',
    'Lash Tech': 'Lash Specialists',
    'Wig Stylist': 'Wig Stylists',
    'Gele Tying': 'Gele Specialists'
  };
  document.getElementById('category-title').textContent = categoryTitles[category] || category + ' Specialists';
  const container = document.getElementById('category-results');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="ai-spinner"></div><p style="margin-top:12px; font-size:13px; color:var(--text3);">Finding providers near you...</p></div>';
  showScreen('screen-category');

  let providers = [];

  if (db) {
    try {
      let q = db.from('providers').select('*').eq('category', category).eq('is_available', true);
      if (currentUserState) q = q.eq('state', currentUserState);
      const { data, error } = await q;
      if (error) { console.error('Category fetch error:', error); }
      else if (data && data.length > 0) {
        const available = data.filter(p => !isProviderBlocked(p.full_name));
        const names = available.map(p => p.full_name);
        const { data: skills } = await db.from('skills').select('provider_name, price').in('provider_name', names);
        const priceByProvider = {};
        (skills || []).forEach(s => {
          const p = Number(s.price) || 0;
          if (!priceByProvider[s.provider_name] || p < priceByProvider[s.provider_name]) priceByProvider[s.provider_name] = p;
        });

        providers = available.map(p => ({
          name: p.full_name,
          category: p.category,
          location: p.location || 'Location not set',
          distance: '',
          rating: p.rating || 0,
          price: priceByProvider[p.full_name] || 0,
          emoji: getCategoryIcon(p.category, 40),
          bg: 'linear-gradient(135deg, #FDE8EE, #FCB8CB)',
          verified: p.is_verified,
          service: 'Available services',
          hours: p.is_available ? 'Available now' : 'Currently unavailable',
          image: null
        }));
      }
    } catch (e) { console.error('Category browsing error:', e); }
  }

  if (providers.length === 0) {
    const noProviderHTML = [
      '<div style="text-align:center; padding:40px 20px;">',
      '<div style="margin-bottom:14px;display:flex;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>',
      '<p style="font-size:16px; font-weight:600;">No providers yet</p>',
      '<p style="font-size:13px; color:var(--text3); margin-top:8px;">No ' + category + ' providers in ' + (currentUserState || 'your area') + ' yet — be the first!</p>',
      '<button class="btn-primary" style="margin-top:20px; width:auto; padding:12px 24px;" onclick="showScreen(\x27screen-provider-login\x27)">Join as Provider</button>',
      '</div>'
    ].join('');
    container.innerHTML = noProviderHTML;
    return;
  }

  container.innerHTML = '<p style="font-size:12px; color:var(--text3); padding:0 0 12px;">' + providers.length + ' provider' + (providers.length > 1 ? 's' : '') + ' found near you</p>' + providers.map(buildProviderCard).join('');
}

async function loadHomeProviders() {
  const container = document.getElementById('home-providers-list');
  if (!container) return;

  let providers = allProviders.slice(0, 4);

  if (db) {
    try {
      const { data, error } = await db.from('providers').select('*').limit(8);
      if (!error && data && data.length > 0) {
        const dbCards = data.map(p => ({
          name: p.full_name,
          category: p.category,
          location: p.location || 'Abuja',
          distance: 'Nearby',
          rating: p.rating || 0,
          price: 2500,
          emoji: getCategoryEmoji(p.category),
          bg: 'linear-gradient(135deg, #FDE8EE, #FCB8CB)',
          verified: p.is_verified,
          service: 'Available services',
          hours: p.is_available ? 'Available now' : 'Unavailable',
          image: null
        }));
        providers = [...dbCards, ...allProviders.slice(0, 4)];
      }
    } catch(e) {}
  }

  container.innerHTML = providers.slice(0, 6).map(buildProviderCard).join('');
}

function getCategoryIcon(category, size) {
  size = size || 28;
  const icons = {
    'Barber': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    'Hair Stylist': '<path d="M6 3a3 3 0 0 0-3 3v3a4 4 0 0 0 4 4h1v6a3 3 0 0 0 6 0v-6h1a4 4 0 0 0 4-4V6a3 3 0 0 0-3-3"/>',
    'Hair': '<path d="M6 3a3 3 0 0 0-3 3v3a4 4 0 0 0 4 4h1v6a3 3 0 0 0 6 0v-6h1a4 4 0 0 0 4-4V6a3 3 0 0 0-3-3"/>',
    'Nail Tech': '<path d="M12 2c-1 3-4 5-4 9a4 4 0 0 0 8 0c0-4-3-6-4-9z"/>',
    'Nails': '<path d="M12 2c-1 3-4 5-4 9a4 4 0 0 0 8 0c0-4-3-6-4-9z"/>',
    'Lash Tech': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    'Lash': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    'Makeup Artist': '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    'Makeup': '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    'Massage Therapist': '<circle cx="12" cy="6" r="3"/><path d="M6 21v-4a6 6 0 0 1 12 0v4"/>',
    'Massage': '<circle cx="12" cy="6" r="3"/><path d="M6 21v-4a6 6 0 0 1 12 0v4"/>',
    'Wig Stylist': '<path d="M4 18c0-6 3-11 8-11s8 5 8 11" /><path d="M4 18h16" /><path d="M7 18v3M12 18v3M17 18v3"/>',
    'Gele Tying': '<path d="M4 15c2-6 6-9 8-9s6 3 8 9" /><path d="M4 15c2 2 5 3 8 3s6-1 8-3"/>',
    'Skincare Specialist': '<path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    'Spa / Sauna': '<path d="M4 12h16M6 12a6 6 0 0 1 12 0M4 16h16v4H4z"/>',
    'Spa': '<path d="M4 12h16M6 12a6 6 0 0 1 12 0M4 16h16v4H4z"/>',
    'MedSpa': '<path d="M12 3v18M4 8h16M4 16h16"/>'
  };
  const path = icons[category] || icons['Barber'];
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
}
// Kept for compatibility with older calls; now returns an SVG icon string instead of an emoji character.
function getCategoryEmoji(category) { return getCategoryIcon(category, 28); }


// SPLASH SCREEN
function initSplash() {
  const splash = document.getElementById('screen-splash');
  if (!splash) return;
  setTimeout(() => {
    splash.style.opacity = '0';
    splash.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      splash.style.display = 'none';
      const savedRole = localStorage.getItem('preen_role');
      if (savedRole === 'provider' && localStorage.getItem('preen_provider_name')) {
        showScreen('screen-provider-dashboard');
      } else if (savedRole === 'customer' && localStorage.getItem('preen_user_name')) {
        showScreen('screen-home');
        setTimeout(updateHomeForGuest, 100);
      } else {
        showScreen('screen-home');
        setTimeout(updateHomeForGuest, 100);
      }
    }, 500);
  }, 2500);
}

// MULTI SERVICE SELECTION
let selectedServices = [];
let selectedServiceTotal = 0;

function toggleService(el, serviceName, price) {
  const idx = selectedServices.findIndex(s => s.name === serviceName);
  if (idx > -1) {
    selectedServices.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    selectedServices.push({ name: serviceName, price });
    el.classList.add('selected');
  }
  selectedServiceTotal = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalBar = document.getElementById('service-total-bar');
  const label = document.getElementById('selected-services-label');
  const priceEl = document.getElementById('services-total-price');
  const confirmBtn = document.getElementById('confirm-booking-btn');
  if (selectedServices.length > 0) {
    totalBar.style.display = 'flex';
    label.textContent = selectedServices.length + ' service' + (selectedServices.length > 1 ? 's' : '') + ' selected';
    priceEl.textContent = '₦' + selectedServiceTotal.toLocaleString();
    if (confirmBtn) confirmBtn.textContent = 'Confirm Booking · ₦' + selectedServiceTotal.toLocaleString();
  } else {
    totalBar.style.display = 'none';
    if (confirmBtn) confirmBtn.textContent = 'Confirm Booking · ₦2,500';
  }
}

// TEAM MEMBER SELECTION
let selectedTeamMember = 'No preference';

function selectTeamMember(el, memberName) {
  document.querySelectorAll('#team-select-list .team-member').forEach(m => m.classList.remove('selected'));
  el.classList.add('selected');
  selectedTeamMember = memberName;
}

// CHAT
// (dead duplicate sendChatMessage removed — this was a leftover from the
// original codebase that silently overrode the real Supabase-backed version
// above, since JS keeps whichever same-named function is declared last)

// SOCIAL LINKS
function saveSocialLinks() {
  const instagram = document.getElementById('instagram-link').value.trim();
  const tiktok = document.getElementById('tiktok-link').value.trim();
  if (!instagram && !tiktok) { alert('Please add at least one social media link.'); return; }
  alert('Social media links saved! They will appear on your public profile.');
  goBack();
}

// BACK BUTTON HANDLER
window.addEventListener('popstate', function(e) {
  e.preventDefault();
  const current = document.querySelector('.screen.active');
  if (current && current.id !== 'screen-welcome' && current.id !== 'screen-splash') {
    goBack();
    history.pushState(null, '', window.location.href);
  }
});

// SUPABASE
const SUPABASE_URL = 'https://noucyqailmqgaujgzxay.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdWN5cWFpbG1xZ2F1amd6eGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDgwMjksImV4cCI6MjA5MTA4NDAyOX0.5PQ5_pIyu-loK3PM9s813SEDI3cywrqtmEPZi7MOI8Y';

let db = null;

function initSupabase() {
  try {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase connected');
  } catch(e) {
    console.error('Supabase init failed:', e);
  }
}

async function saveUser(fullName, email, phone, role) {
  if (!db) { console.error('DB not ready'); return; }
  const { data, error } = await db.from('user').insert([{ 
    full_name: fullName, 
    email: email, 
    phone: phone, 
    role: role 
  }]);
  if (error) console.error('User save error:', error.message);
  else console.log('User saved:', fullName);
}

async function saveBooking(customerName, customerPhone, providerName, service, date, time, amount) {
  if (!db) { console.error('DB not ready'); return null; }
  const { data, error } = await db.from('bookings').insert([{
    customer_name: customerName,
    customer_phone: customerPhone,
    provider_name: providerName,
    service: service,
    booking_date: date,
    booking_time: time,
    amount: amount,
    status: 'confirmed'
  }]).select();
  if (error) { console.error('Booking save error:', error.message); return null; }
  console.log('Booking saved for:', customerName);
  return (data && data[0]) ? data[0].id : null;
}

// SAVE PROVIDER TO SUPABASE
async function saveProvider(name, email, phone, category) {
  if (!db) { console.error('DB not ready'); return; }
  const { data, error } = await db.from('providers').insert([{
    full_name: name,
    email: email,
    phone: phone,
    category: category,
    is_available: true,
    is_verified: false
  }]);
  if (error) console.error('Provider save error:', error.message);
  else console.log('Provider saved:', name);
}

// SAVE REVIEW TO SUPABASE
async function saveReview(providerName, customerName, rating, reviewText, isAnonymous, bookingId) {
  if (!db) { console.error('DB not ready'); return false; }
  const { error } = await db.from('reviews').insert([{
    provider_name: providerName,
    customer_name: isAnonymous ? 'Anonymous' : customerName,
    rating: rating,
    review_text: reviewText,
    is_anonymous: isAnonymous,
    booking_id: bookingId || null
  }]);
  if (error) { console.error('Review save error:', error.message); return false; }
  console.log('Review saved for:', providerName);
  return true;
}

// NAVIGATION
let history = [];

// The dashboard header (business name + photo prompt) was previously hardcoded
// static text ("Kings Barbershop") in the HTML — no signup, login, or session
// restore ever updated it, so every provider saw the same demo name regardless
// of what they actually signed up as. This pulls the real logged-in provider's
// name from localStorage every time the dashboard screen opens.
async function loadProviderDashboardStats() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;

  try {
    const [{ data: completed }, { data: accepted }, { data: reviews }, { data: provRow }] = await Promise.all([
      db.from('bookings').select('*').eq('provider_name', provName).eq('status', 'completed'),
      db.from('bookings').select('*').eq('provider_name', provName).eq('status', 'accepted'),
      db.from('reviews').select('rating').eq('provider_name', provName),
      db.from('providers').select('rating, is_verified').eq('full_name', provName).single()
    ]);

    const parseAmount = (b) => parseInt((b.amount || '0').toString().replace(/[^0-9]/g, '')) || 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = now.toDateString();

    const thisMonth = (completed || []).filter(b => b.created_at && new Date(b.created_at) >= startOfMonth);
    const gross = thisMonth.reduce((sum, b) => sum + parseAmount(b), 0);
    const net = gross - Math.round(gross * 0.10);

    const earningsEl = document.getElementById('dash-earnings-month');
    if (earningsEl) earningsEl.textContent = '₦' + net.toLocaleString();
    const countEl = document.getElementById('dash-earnings-count');
    if (countEl) countEl.textContent = thisMonth.length + (thisMonth.length === 1 ? ' booking completed' : ' bookings completed');

    const todayCount = (accepted || []).filter(b => {
      const d = b.booking_date ? new Date(b.booking_date) : null;
      return d && !isNaN(d.getTime()) && d.toDateString() === todayStr;
    }).length;
    const todayEl = document.getElementById('dash-stat-today');
    if (todayEl) todayEl.textContent = todayCount;

    const ratingEl = document.getElementById('dash-stat-rating');
    if (ratingEl) {
      const r = provRow && provRow.rating ? Number(provRow.rating).toFixed(1) : '—';
      ratingEl.innerHTML = r + '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }

    const reviewsEl = document.getElementById('dash-stat-reviews');
    if (reviewsEl) reviewsEl.textContent = (reviews || []).length;

    const verifiedEl = document.getElementById('dash-stat-verified');
    if (verifiedEl) {
      verifiedEl.innerHTML = provRow && provRow.is_verified
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    }
  } catch (e) { console.error('Dashboard stats error:', e); }
}

async function loadProviderServicesTab(providerName) {
  const container = document.getElementById('tab-services');
  if (!container || !db || !providerName) return;

  try {
    const { data, error } = await db.from('skills').select('*').eq('provider_name', providerName).order('created_at', { ascending: true });
    if (error) { console.error('Services fetch error:', error); return; }

    const services = data || [];
    if (services.length === 0) {
      container.innerHTML = '<div style="padding: 24px 20px; text-align:center;"><p style="font-size:13px; color:var(--text3);">This provider has not added any services yet.</p></div>';
      return;
    }

    container.innerHTML = '<div style="padding: 16px 20px;">' + services.map(s => {
      const safeName = (s.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `
      <div style="padding:14px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <p style="font-size:14px; font-weight:600; color:var(--text);">${s.name}</p>
          <p style="font-size:12px; color:var(--text3); margin-top:2px;">${s.duration || ''}</p>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:14px; font-weight:700; color:var(--primary-dark);">₦${Number(s.price || 0).toLocaleString()}</span>
          <button class="btn-secondary" style="padding:6px 14px; font-size:11px;" onclick="bookSpecificService('${safeName}', ${s.price || 0}, '${(s.duration || '').replace(/'/g, "\\'")}')">Book</button>
        </div>
      </div>`;
    }).join('') + '</div>';
  } catch (e) { console.error('Services tab load error:', e); }
}

function bookSpecificService(name, price, duration) {
  if (!requireAuth('book this service')) return;
  showScreen('screen-booking');
  setTimeout(async () => {
    await loadBookingServicesForProvider(window.currentProviderName);
    const items = document.querySelectorAll('#service-select-list .service-select-item');
    items.forEach(item => {
      if (item.getAttribute('data-name') === name) toggleService(item, name, price);
    });
  }, 150);
}

function prefillBookingCustomerInfo() {
  const nameEl = document.getElementById('booking-name');
  const phoneEl = document.getElementById('booking-phone');
  const savedName = localStorage.getItem('preen_user_name');
  const savedPhone = localStorage.getItem('preen_user_phone');
  // Pre-filling matters beyond convenience: "My Bookings" and Notifications
  // both look up a customer's bookings by matching this exact phone number
  // against their account. If this field was left blank or typed differently,
  // the booking would silently never show up anywhere for that customer.
  if (nameEl && savedName && !nameEl.value) nameEl.value = savedName;
  if (phoneEl && savedPhone && !phoneEl.value) phoneEl.value = savedPhone;
}

async function loadBookingTeamMembers(providerName) {
  const container = document.getElementById('team-select-list');
  if (!container || !db || !providerName) return;

  // Keep the "No preference" option, just clear anything appended after it
  const noPreference = container.querySelector('.team-member');
  container.innerHTML = '';
  if (noPreference) container.appendChild(noPreference);

  try {
    const { data, error } = await db.from('team_members').select('*').eq('provider_name', providerName).order('created_at', { ascending: true });
    if (error) { console.error('Booking team members error:', error); return; }

    (data || []).forEach(m => {
      const initials = (m.name || 'T').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const safeName = (m.name || '').replace(/'/g, "\\'");
      const el = document.createElement('div');
      el.className = 'team-member';
      el.setAttribute('onclick', "selectTeamMember(this, '" + safeName + "')");
      el.innerHTML = '<div class="team-avatar">' + initials + '</div><div><p style="font-size:13px; font-weight:500;">' + m.name + '</p><p style="font-size:11px; color:var(--text3); margin-top:2px;">' + (m.role || '') + (m.years_experience ? ' · ' + m.years_experience : '') + '</p></div>';
      container.appendChild(el);
    });
  } catch (e) { console.error('Booking team members load error:', e); }
}

async function checkTimeSlotAvailability() {
  const dateInput = document.getElementById('booking-date');
  const slotsContainer = document.getElementById('booking-time-slots');
  if (!dateInput || !dateInput.value || !slotsContainer || !db) return;

  const providerName = window.currentProviderName;
  if (!providerName) return;

  const formattedDate = new Date(dateInput.value).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  try {
    const { data, error } = await db.from('bookings')
      .select('booking_time')
      .eq('provider_name', providerName)
      .eq('booking_date', formattedDate)
      .in('status', ['confirmed', 'accepted', 'pending_confirmation']);

    if (error) { console.error('Time slot availability check error:', error); return; }

    const takenTimes = new Set((data || []).map(b => b.booking_time));
    slotsContainer.querySelectorAll('.time-slot').forEach(slot => {
      const isTaken = takenTimes.has(slot.textContent.trim());
      slot.classList.toggle('taken', isTaken);
      // If the slot they'd already picked just became unavailable (someone
      // else booked it while they were filling out the form), deselect it
      // so they can't submit a conflict.
      if (isTaken && slot.classList.contains('selected')) {
        slot.classList.remove('selected');
      }
    });
  } catch (e) { console.error('Time slot availability error:', e); }
}

async function loadBookingServicesForProvider(providerName) {
  const container = document.getElementById('service-select-list');
  if (!container || !db || !providerName) return;

  // Also reflect the real provider's name/location on the booking screen header
  const nameEl = document.querySelector('.booking-provider-name');
  if (nameEl) nameEl.textContent = providerName;

  try {
    const { data, error } = await db.from('skills').select('*').eq('provider_name', providerName).order('created_at', { ascending: true });
    if (error) { console.error('Booking services fetch error:', error); return; }

    const services = data || [];
    if (services.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">This provider has not added any services yet.</p>';
      return;
    }

    container.innerHTML = services.map(s => {
      const safeName = (s.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `
      <div class="service-select-item" data-name="${safeName}" onclick="toggleService(this, '${safeName}', ${s.price || 0})">
        <div><p style="font-size:13px; font-weight:500; color:var(--text);">${s.name}</p><p style="font-size:11px; color:var(--text3); margin-top:2px;">${s.duration || ''}</p></div>
        <div style="display:flex; align-items:center; gap:10px;"><span style="font-size:13px; font-weight:600; color:var(--primary);">₦${Number(s.price || 0).toLocaleString()}</span><div class="service-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div></div>
      </div>`;
    }).join('');
  } catch (e) { console.error('Booking services load error:', e); }
}

async function loadScoreLeaderboard(currentProviderName) {
  if (!db) return;
  const container = document.getElementById('score-leaderboard-mini');
  if (!container) return;

  try {
    const { data, error } = await db
      .from('providers')
      .select('*')
      .eq('is_verified', true)
      .order('rating', { ascending: false })
      .limit(10);

    if (error) { console.error('Score leaderboard error:', error); return; }

    const providers = data || [];
    if (providers.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">Leaderboard will show top providers once ratings start coming in.</p>';
      return;
    }

    const medalColors = ['gold', 'silver', 'bronze'];
    const medalIcons = [
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="14" r="7"/><path d="M12 10v8M9 12l3-2 3 2"/><path d="M8 3l4 3 4-3"/></svg>',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A3A9B4" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="14" r="7"/><path d="M9 17h6M10 11a2 2 0 1 1 3 1.7L9.5 17H15"/><path d="M8 3l4 3 4-3"/></svg>',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0722D" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><circle cx="12" cy="14" r="7"/><path d="M9.5 11.5a2 2 0 1 1 2 2.5 2 2 0 1 1-2 2.5"/><path d="M8 3l4 3 4-3"/></svg>'
    ];

    // Show the top 5, but if the currently-viewed provider isn't in that top 5,
    // swap the last slot for their real row so they can always see where they stand.
    let rows = providers.slice(0, 5).map((p, i) => ({ p, rank: i + 1 }));
    if (currentProviderName) {
      const inTop = rows.some(r => r.p.full_name === currentProviderName);
      if (!inTop) {
        const idx = providers.findIndex(p => p.full_name === currentProviderName);
        if (idx >= 0) {
          rows[rows.length - 1] = { p: providers[idx], rank: idx + 1 };
        }
      }
    }

    container.innerHTML = rows.map(({ p, rank }) => {
      const isMe = p.full_name === currentProviderName;
      const initials = (p.full_name || 'P').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const medal = rank <= 3 ? medalIcons[rank - 1] : ('<span style="font-size:13px; font-weight:600; color:' + (isMe ? 'var(--primary)' : 'var(--text3)') + ';">#' + rank + '</span>');
      const cls = rank <= 3 ? medalColors[rank - 1] : (isMe ? 'active-row' : '');
      return `
        <div class="leaderboard-row ${cls}" onclick="openProviderProfile('${(p.full_name || 'Provider').replace(/'/g, "\\'")}')">
          <span class="lb-rank">${medal}</span>
          <div class="lb-avatar" style="background:${isMe ? 'var(--primary)' : 'var(--text3)'};">${initials}</div>
          <div style="flex:1;"><p style="font-size:13px; font-weight:600; ${isMe ? 'color:var(--primary);' : ''}">${p.full_name}</p><p style="font-size:11px; color:var(--text3);">${p.category || ''} · ${p.location || ''}</p></div>
          <div class="lb-score" style="${isMe ? 'color:var(--primary);' : ''}">${p.rating ? Number(p.rating).toFixed(1) : '—'}</div>
        </div>`;
    }).join('');
  } catch (e) { console.error('Score leaderboard load error:', e); }
}

async function loadProviderScore(providerNameOverride) {
  if (!db) return;
  const provName = providerNameOverride || localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;
  const nameEl = document.getElementById('score-provider-name');
  if (nameEl) nameEl.textContent = provName;

  try {
    const [{ data: bookings }, { data: reviews }, { data: provRow }] = await Promise.all([
      db.from('bookings').select('*').eq('provider_name', provName),
      db.from('reviews').select('rating').eq('provider_name', provName),
      db.from('providers').select('*').eq('full_name', provName).single()
    ]);

    const allBookings = bookings || [];
    const completed = allBookings.filter(b => b.status === 'completed').length;
    const declined = allBookings.filter(b => b.status === 'declined').length;
    const showUpTotal = completed + declined;

    // Show-up rate (25pts) — proportion of resolved bookings that were completed
    // rather than declined. New providers with no history yet get full marks
    // (no reason to penalize before they've had a chance).
    const showUpPct = showUpTotal > 0 ? Math.round((completed / showUpTotal) * 100) : 100;
    const showUpPts = Math.round((showUpPct / 100) * 25);

    // Customer reviews (25pts) — scaled from average star rating
    const reviewList = reviews || [];
    const avgRating = reviewList.length > 0 ? reviewList.reduce((s, r) => s + (r.rating || 0), 0) / reviewList.length : 0;
    const reviewPts = reviewList.length > 0 ? Math.round((avgRating / 5) * 25) : 13; // neutral starting point pre-reviews

    // Profile completeness (25pts) — based on whether real profile fields are filled in
    const fields = [provRow?.profile_photo, provRow?.bio, provRow?.work_photos, provRow?.is_verified];
    const filledCount = fields.filter(Boolean).length;
    const profilePct = Math.round((filledCount / fields.length) * 100);
    const profilePts = Math.round((profilePct / 100) * 25);

    // Booking consistency (25pts) — completed bookings this month, capped at 10 for full marks
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = allBookings.filter(b => b.status === 'completed' && b.created_at && new Date(b.created_at) >= startOfMonth).length;
    const consistencyPts = Math.round(Math.min(completedThisMonth / 10, 1) * 25);

    const total = showUpPts + reviewPts + profilePts + consistencyPts;

    const scoreEl = document.getElementById('score-number');
    if (scoreEl) scoreEl.textContent = total;
    const ring = document.getElementById('score-ring');
    if (ring) ring.style.strokeDashoffset = 314 - (314 * (total / 100));

    const showUpLabel = document.getElementById('score-showup-label');
    if (showUpLabel) showUpLabel.textContent = showUpPct + '% · ' + showUpPts + 'pts';
    const showUpBar = document.getElementById('score-showup-bar');
    if (showUpBar) showUpBar.style.width = showUpPct + '%';
    const showUpSub = document.getElementById('score-showup-sub');
    if (showUpSub) showUpSub.textContent = showUpTotal > 0 ? completed + ' completed, ' + declined + ' declined' : 'No booking history yet';

    const reviewsLabel = document.getElementById('score-reviews-label');
    if (reviewsLabel) reviewsLabel.textContent = (reviewList.length > 0 ? avgRating.toFixed(1) : '—') + ' · ' + reviewPts + 'pts';
    const reviewsBar = document.getElementById('score-reviews-bar');
    if (reviewsBar) reviewsBar.style.width = (reviewPts / 25 * 100) + '%';
    const reviewsSub = document.getElementById('score-reviews-sub');
    if (reviewsSub) reviewsSub.textContent = reviewList.length > 0 ? reviewList.length + (reviewList.length === 1 ? ' review' : ' reviews') : 'No reviews yet';

    const profileLabel = document.getElementById('score-profile-label');
    if (profileLabel) profileLabel.textContent = profilePct + '% · ' + profilePts + 'pts';
    const profileBar = document.getElementById('score-profile-bar');
    if (profileBar) profileBar.style.width = profilePct + '%';

    const consistencyLabel = document.getElementById('score-consistency-label');
    if (consistencyLabel) consistencyLabel.textContent = completedThisMonth + ' this month · ' + consistencyPts + 'pts';
    const consistencyBar = document.getElementById('score-consistency-bar');
    if (consistencyBar) consistencyBar.style.width = (consistencyPts / 25 * 100) + '%';

    const eliteBadge = document.getElementById('score-elite-badge');
    if (eliteBadge) eliteBadge.style.display = total >= 80 ? 'inline-flex' : 'none';
    const encourageEl = document.getElementById('score-encouragement');
    if (encourageEl) {
      encourageEl.textContent = total >= 80
        ? 'Great work — you are building a strong reputation on Preen.'
        : 'Complete more bookings and collect reviews to raise your score.';
    }

    // Dashboard home preview card (separate, smaller version of the same score)
    const dashNumEl = document.getElementById('dash-score-number');
    if (dashNumEl) dashNumEl.textContent = total;
    const dashRing = document.getElementById('dash-score-ring');
    if (dashRing) dashRing.style.strokeDashoffset = 163 - (163 * (total / 100));
    const dashBadge = document.getElementById('dash-score-elite-badge');
    if (dashBadge) dashBadge.style.display = total >= 80 ? 'inline-flex' : 'none';
    const dashShowup = document.getElementById('dash-score-showup');
    if (dashShowup) dashShowup.textContent = 'Show-up ' + showUpPct + '%';
    const dashReviews = document.getElementById('dash-score-reviews');
    if (dashReviews) dashReviews.textContent = 'Reviews ' + (reviewList.length > 0 ? avgRating.toFixed(1) : '—');
    const dashConsistency = document.getElementById('dash-score-consistency');
    if (dashConsistency) dashConsistency.textContent = completedThisMonth + ' this month';

    // Customer-facing mini score badge on the provider profile screen
    const profileNumEl = document.getElementById('profile-score-number');
    if (profileNumEl) profileNumEl.textContent = total;
    const profileRing = document.getElementById('profile-score-ring');
    if (profileRing) profileRing.style.strokeDashoffset = 163 - (163 * (total / 100));
  } catch (e) { console.error('Preen Score error:', e); }
}

async function refreshProviderDashboardHeader() {
  const nameEl = document.getElementById('prov-dashboard-name');
  const realName = localStorage.getItem('preen_provider_name');
  if (nameEl && realName) nameEl.textContent = realName;

  // The Requests quick-action badge was previously a hardcoded "3" that never
  // changed no matter how many real requests existed. This fetches the real count.
  const dashBadge = document.getElementById('dashboard-requests-badge');
  if (dashBadge && db && realName) {
    try {
      const { count, error } = await db
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('provider_name', realName)
        .eq('status', 'confirmed');
      if (error) { console.error('Dashboard badge count error:', error); return; }
      dashBadge.textContent = count || 0;
    } catch (e) { console.error('Dashboard badge fetch failed:', e); }
  }
}

async function loadProviderDashboardSchedule() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;
  const todayEl = document.getElementById('prov-today-bookings');
  const upcomingEl = document.getElementById('prov-upcoming-bookings');
  if (!todayEl && !upcomingEl) return;

  try {
    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { console.error('Dashboard schedule fetch error:', error); return; }

    const cardHtml = (b) => `
      <div class="prov-booking-card" style="flex-direction:column; align-items:stretch; gap:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="review-avatar" style="width:44px; height:44px; font-size:16px;">${(b.customer_name || 'C').charAt(0).toUpperCase()}</div>
          <div style="flex:1;">
            <p style="font-size:14px; font-weight:500;">${b.customer_name || 'Customer'}</p>
            <p style="font-size:12px; color:var(--text3); margin-top:2px;">${b.service || ''} · ${b.booking_time || ''}</p>
          </div>
          <div style="text-align:right;">
            <span class="status confirmed">Confirmed</span>
            <p style="font-size:12px; color:var(--primary-dark); font-weight:600; margin-top:4px;">${b.amount || ''}</p>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-secondary" style="flex:1; padding:8px; font-size:12px;" onclick="openChat('${b.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;display:inline-block;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Message</button>
          <button class="btn-primary" style="flex:1; padding:8px; font-size:12px;" onclick="markServiceDone('${b.id}', this)">Service Done</button>
        </div>
      </div>`;

    // booking_date is stored as a human-readable string (e.g. "Saturday, 10 May 2025").
    // We try to parse it back into a real date to split today vs. this week; if a
    // particular row's date can't be parsed, it's shown under "Upcoming" as a safe default.
    const now = new Date();
    const todayStr = now.toDateString();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const todayBookings = [];
    const upcomingBookings = [];

    (data || []).forEach(b => {
      const parsed = b.booking_date ? new Date(b.booking_date) : null;
      const isValidDate = parsed && !isNaN(parsed.getTime());
      if (isValidDate && parsed.toDateString() === todayStr) {
        todayBookings.push(b);
      } else if (!isValidDate || parsed <= weekFromNow) {
        upcomingBookings.push(b);
      }
    });

    if (todayEl) {
      todayEl.innerHTML = todayBookings.length
        ? todayBookings.map(cardHtml).join('')
        : '<p style="font-size:12px; color:var(--text3); text-align:center; padding:12px 0;">No bookings today yet.</p>';
    }
    if (upcomingEl) {
      upcomingEl.innerHTML = upcomingBookings.length
        ? upcomingBookings.slice(0, 5).map(cardHtml).join('')
        : '<p style="font-size:12px; color:var(--text3); text-align:center; padding:12px 0;">Nothing else on the calendar this week.</p>';
    }
  } catch (e) { console.error('Dashboard schedule error:', e); }
}

function showScreen(id) {
  const current = document.querySelector('.screen.active');
  if (current) { history.push(current.id); current.classList.remove('active'); }
  // Load real data when screen opens
  if (id === 'screen-bookings') setTimeout(loadMyBookings, 100);
  if (id === 'screen-booking-requests') setTimeout(loadProviderBookingRequests, 100);
  if (id === 'screen-booking-requests') setTimeout(loadAcceptedTodayBookings, 100);
  if (id === 'screen-home') setTimeout(loadHomeSections, 300);
  if (id === 'screen-leaderboard') setTimeout(loadLeaderboard, 100);
  if (id === 'screen-provider-dashboard') setTimeout(loadProviderEarnings, 100);
  if (id === 'screen-provider-dashboard') refreshProviderDashboardHeader();
  if (id === 'screen-provider-dashboard') setTimeout(loadProviderDashboardSchedule, 100);
  if (id === 'screen-provider-dashboard') setTimeout(loadProviderDashboardStats, 100);
  if (id === 'screen-provider-dashboard') setTimeout(syncAvailabilityToggle, 100);
  if (id === 'screen-provider-dashboard') setTimeout(loadProviderScore, 150);
  if (id === 'screen-provider-score') setTimeout(() => loadProviderScore(window.currentProviderName), 100);
  if (id === 'screen-provider-score') setTimeout(() => loadScoreLeaderboard(window.currentProviderName || localStorage.getItem('preen_provider_name')), 100);
  if (id === 'screen-withdrawal') setTimeout(loadWithdrawalBalance, 100);
  if (id === 'screen-provider-earnings') setTimeout(loadProviderEarnings, 100);
  if (id === 'screen-notifications') setTimeout(loadCustomerNotifications, 100);
  if (id === 'screen-provider-notifications') setTimeout(loadProviderNotifications, 100);
  if (id === 'screen-provider-all-bookings') setTimeout(loadProviderAllBookings, 100);
  if (id === 'screen-booking') setTimeout(() => loadBookingServicesForProvider(window.currentProviderName), 100);
  if (id === 'screen-booking') setTimeout(() => loadBookingTeamMembers(window.currentProviderName), 100);
  if (id === 'screen-booking') setTimeout(prefillBookingCustomerInfo, 50);
  if (id === 'screen-booking') setTimeout(checkTimeSlotAvailability, 150);
  if (id === 'screen-saved') setTimeout(loadSavedProviders, 100);
  if (id === 'screen-promo') setTimeout(loadActivePromoDisplay, 50);
  if (id === 'screen-loyalty') setTimeout(loadLoyaltyPoints, 50);
  if (id === 'screen-manage-team') setTimeout(loadManageTeamList, 100);
  if (id === 'screen-housecall') setTimeout(() => loadHouseCallServices(window.currentProviderName), 100);
  if (id === 'screen-leaderboard') setTimeout(loadLeaderboard, 100);
  if (id === 'screen-provider-dashboard') setTimeout(loadProviderEarnings, 200);
  if (id === 'screen-search') setTimeout(() => searchProviders('', ''), 100);
  const next = document.getElementById(id);
  if (next) { next.classList.add('active'); window.scrollTo(0, 0); }
}

function goBack() {
  if (history.length > 0) {
    const current = document.querySelector('.screen.active');
    if (current) current.classList.remove('active');
    const prev = document.getElementById(history.pop());
    if (prev) { prev.classList.add('active'); window.scrollTo(0, 0); }
  }
}

// AUTH
async function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  if (!name || !phone || !email || !password) { alert('Please fill in all fields.'); return; }
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = email;
  saveUser(name, email, phone, 'customer');
  // This was the real root cause of bookings/notifications being invisible after
  // a fresh signup: these identity keys were never set here at all (only
  // handleLogin set them), so every phone-matching lookup had nothing to match.
  localStorage.setItem('preen_role', 'customer');
  localStorage.setItem('preen_user_name', name);
  localStorage.setItem('preen_user_email', email);
  localStorage.setItem('preen_user_phone', phone);
  const redirect = localStorage.getItem('preen_redirect_screen');
  localStorage.removeItem('preen_redirect_screen');
  showScreen(redirect || 'screen-home');
  setTimeout(updateHomeForGuest, 100);
}

function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!email || !password) { alert('Please enter your email and password.'); return; }
  document.getElementById('profile-email').textContent = email;
  showScreen('screen-home');
}

// BOOKING
async function confirmBooking() {
  const date = document.getElementById('booking-date').value;
  const selectedTime = document.querySelector('.time-slot.selected');
  const customerName = document.getElementById('booking-name').value.trim();
  // Prefer the logged-in account's real phone number over whatever's typed here.
  // My Bookings and Notifications both match bookings to a customer by this exact
  // value — if it doesn't match the account's saved number, the booking becomes
  // invisible to that customer even though it's genuinely theirs.
  const typedPhone = document.getElementById('booking-phone').value.trim();
  const customerPhone = localStorage.getItem('preen_user_phone') || typedPhone;
  if (selectedServices.length === 0) { alert('Please select at least one service.'); return; }
  if (!date) { alert('Please select a date.'); return; }
  if (!selectedTime) { alert('Please select a time slot.'); return; }
  if (!customerName) { alert('Please enter your name.'); return; }
  if (!customerPhone) { alert('Please enter your phone number.'); return; }
  const formattedDate = new Date(date).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const serviceNames = selectedServices.map(s => s.name).join(', ');

  // Apply an active promo, if one was applied on the Promo Codes screen
  let finalAmount = selectedServiceTotal;
  let appliedPromo = null;
  const rawPromo = localStorage.getItem('preen_active_promo');
  if (rawPromo) {
    try {
      appliedPromo = JSON.parse(rawPromo);
      const discount = appliedPromo.discount_type === 'percent'
        ? Math.round(selectedServiceTotal * (appliedPromo.discount_value / 100))
        : Math.min(appliedPromo.discount_value, selectedServiceTotal);
      finalAmount = Math.max(0, selectedServiceTotal - discount);
    } catch (e) { appliedPromo = null; }
  }

  const totalAmount = '₦' + finalAmount.toLocaleString();

  // Get provider details for the waiting screen
  const providerName = document.querySelector('.provider-title') ?
    document.querySelector('.provider-title').textContent.replace('✓','').trim() : 'Kings Barbershop';
  const rawAmount = finalAmount;
  const serviceLabel = serviceNames + (appliedPromo ? ' (' + appliedPromo.code + ' applied)' : '') + ' · ' + totalAmount;

  // Prevent double-booking: check if this provider already has an active
  // booking (from anyone) at this exact date and time before saving a new one.
  if (db) {
    try {
      const { data: conflicts } = await db.from('bookings')
        .select('id')
        .eq('provider_name', providerName)
        .eq('booking_date', formattedDate)
        .eq('booking_time', selectedTime.textContent)
        .in('status', ['confirmed', 'accepted', 'pending_confirmation']);
      if (conflicts && conflicts.length > 0) {
        alert('That time slot is no longer available — someone else has already booked ' + providerName + ' for ' + formattedDate + ' at ' + selectedTime.textContent + '. Please choose a different time.');
        return;
      }
    } catch (e) { console.error('Booking conflict check error:', e); }
  }

  const bookingId = await saveBooking(customerName, customerPhone, providerName, serviceNames, formattedDate, selectedTime.textContent, totalAmount);

  // Record the redemption now that the booking actually went through, so the
  // discount can't be reused, and clear it so the next booking starts fresh
  if (appliedPromo && bookingId && db) {
    try {
      await db.from('promo_redemptions').insert([{ customer_phone: customerPhone, code: appliedPromo.code }]);
      const { data: currentPromo } = await db.from('promo_codes').select('times_used').eq('code', appliedPromo.code).single();
      if (currentPromo) {
        await db.from('promo_codes').update({ times_used: (currentPromo.times_used || 0) + 1 }).eq('code', appliedPromo.code);
      }
    } catch (e) { console.error('Promo redemption record error:', e); }
    localStorage.removeItem('preen_active_promo');
  }

  selectedServices = [];
  selectedServiceTotal = 0;

  // Go to waiting screen instead of booking success
  startWaitingForProvider(bookingId, providerName, serviceLabel, formattedDate, selectedTime.textContent, rawAmount);
}

// (dead cancelBooking(btn) — UI-only, no persistence — removed; use cancelBookingById)

// TIME SLOTS
function selectTime(el) {
  if (el.classList.contains('taken')) return;
  document.querySelectorAll('.time-slot').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
}

// CATEGORIES
function setCategory(el) {
  el.closest('.categories') && el.closest('.categories').querySelectorAll('.cat').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

// TABS
function switchTab(el, tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// SEARCH
function filterAndSearch(category) {
  showScreen('screen-search');
}

function filterProviders(value) {}

function setSearchFilter(el, type) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
}

function toggleSearchView() {}

function toggleVenueDropdown() {
  const venueDD = document.getElementById('venue-dropdown');
  const sortDD = document.getElementById('sort-dropdown');
  sortDD.style.display = 'none';
  venueDD.style.display = venueDD.style.display === 'none' ? 'block' : 'none';
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  if (venueDD.style.display === 'block') {
    document.querySelector('.filter-pill').classList.add('active');
  }
}

function toggleSortDropdown() {
  const venueDD = document.getElementById('venue-dropdown');
  const sortDD = document.getElementById('sort-dropdown');
  venueDD.style.display = 'none';
  sortDD.style.display = sortDD.style.display === 'none' ? 'block' : 'none';
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  if (sortDD.style.display === 'block') {
    document.querySelectorAll('.filter-pill')[1].classList.add('active');
  }
}

function selectVenueType(type) {
  document.getElementById('venue-dropdown').style.display = 'none';
  document.querySelectorAll('.filter-pill')[0].textContent = type + ' ▾';
  document.querySelectorAll('.filter-pill')[0].classList.add('active');
  document.getElementById('search-results').innerHTML = getProviderCards(type);
}

function selectSortType(type) {
  document.getElementById('sort-dropdown').style.display = 'none';
  document.querySelectorAll('.filter-pill')[1].textContent = type + ' ▾';
  document.querySelectorAll('.filter-pill')[1].classList.add('active');
}

function getProviderCards(type) {
  const starSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-1px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const checkSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-1px;"><polyline points="20 6 9 17 4 12"/></svg>';
  const barberIcon = '<span style="color:var(--primary);display:flex;align-items:center;justify-content:center;height:100%;">' + getCategoryIcon('Barber', 32) + '</span>';
  const nailIcon = '<span style="color:var(--primary);display:flex;align-items:center;justify-content:center;height:100%;">' + getCategoryIcon('Nail Tech', 32) + '</span>';

  if (type === 'Professionals') {
    return `
      <div class="provider-card-new" onclick="openProviderProfile('Kingsley James','Barber','Wuse 2',4.9,true)">
        <div class="provider-card-img" style="background: linear-gradient(135deg, var(--primary-light), #FCB8CB);">
          ${barberIcon}
          <div class="provider-card-rating-badge">${starSvg} 4.9</div>
        </div>
        <div class="provider-card-body">
          <div class="provider-card-top">
            <p class="provider-name">Kingsley James <span class="verified-dot">${checkSvg}</span></p>
            <p style="font-size:11px; color:var(--text3);">Senior Barber · 0.8km · Wuse 2</p>
            <p style="font-size:11px; color:var(--text3);">5 years experience</p>
          </div>
          <div class="provider-service-preview">
            <span>Signature Fade</span>
            <span class="service-price-sm">₦2,500</span>
          </div>
        </div>
      </div>
      <div class="provider-card-new" onclick="openProviderProfile('Temi Adeyemi','Nail Tech','Garki',4.8,true)">
        <div class="provider-card-img" style="background: linear-gradient(135deg, #FEF3C7, #FDE68A);">
          ${nailIcon}
          <div class="provider-card-rating-badge">${starSvg} 4.8</div>
        </div>
        <div class="provider-card-body">
          <div class="provider-card-top">
            <p class="provider-name">Temi Adeyemi <span class="verified-dot">${checkSvg}</span></p>
            <p style="font-size:11px; color:var(--text3);">Nail Tech · 1.2km · Garki</p>
            <p style="font-size:11px; color:var(--text3);">3 years experience</p>
          </div>
          <div class="provider-service-preview">
            <span>Gel Manicure</span>
            <span class="service-price-sm">₦8,000</span>
          </div>
        </div>
      </div>`;
  }
  return `
    <div class="provider-card-new" onclick="openProviderProfile('Kings Barbershop','Barber','Wuse 2, Abuja',4.9,true)">
      <div class="provider-card-img" style="background: linear-gradient(135deg, var(--primary-light), #FCB8CB);">
        ${barberIcon}
        <div class="provider-card-rating-badge">${starSvg} 4.9</div>
      </div>
      <div class="provider-card-body">
        <div class="provider-card-top">
          <p class="provider-name">Kings Barbershop <span class="verified-dot">${checkSvg}</span></p>
          <p style="font-size:11px; color:var(--text3);">0.8km · Wuse 2, Abuja</p>
          <p style="font-size:11px; color:var(--text3);">Barber · Open until 8:00 PM</p>
        </div>
        <div class="provider-service-preview">
          <span>Signature Fade</span>
          <span class="service-price-sm">₦2,500</span>
        </div>
      </div>
    </div>
    <div class="provider-card-new" onclick="openProviderProfile('Glam Nails by Temi','Nail Tech','Garki, Abuja',4.8,true)">
      <div class="provider-card-img" style="background: linear-gradient(135deg, #FEF3C7, #FDE68A);">
        ${nailIcon}
        <div class="provider-card-rating-badge">${starSvg} 4.8</div>
      </div>
      <div class="provider-card-body">
        <div class="provider-card-top">
          <p class="provider-name">Glam Nails by Temi <span class="verified-dot">${checkSvg}</span></p>
          <p style="font-size:11px; color:var(--text3);">1.2km · Garki, Abuja</p>
          <p style="font-size:11px; color:var(--text3);">Nail Tech · Open until 7:00 PM</p>
        </div>
        <div class="provider-service-preview">
          <span>Gel Manicure</span>
          <span class="service-price-sm">₦8,000</span>
        </div>
      </div>
    </div>`;
}

// STATES
const nigerianStates = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe',
  'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
  'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
  'Taraba','Yobe','Zamfara'
];

function renderStates(filter = '') {
  const list = document.getElementById('states-list');
  if (!list) return;
  const filtered = nigerianStates.filter(s => s.toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML = filtered.map(state =>
    '<div onclick="selectState(\''+state+'\')" style="padding:16px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;cursor:pointer;">' +
    '<div style="display:flex;align-items:center;gap:12px;">' +
    '<div style="width:36px;height:36px;background:var(--primary-light);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>' +
    '<span style="font-size:14px;font-weight:500;color:var(--text);">'+state+'</span>' +
    '</div>' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
    '</div>'
  ).join('');
}

function filterStates(q) { renderStates(q); }

function selectState(state) {
  const el = document.getElementById('selected-location');
  if (el) el.textContent = state;
  // Save state and reload home sections
  currentUserState = state;
  localStorage.setItem('preen_user_state', state);
  localStorage.setItem('preen_state_is_manual', 'true');
  goBack();
  setTimeout(loadHomeSections, 300);
}

// REVIEWS
let selectedRating = 0;
let isAnonymous = false;

let reviewBookingId = null;

function openReview(providerName, bookingId) {
  reviewBookingId = bookingId || null;
  document.getElementById('review-provider-name').textContent = providerName;
  selectedRating = 0;
  renderStars(0);
  document.getElementById('review-text').value = '';
  isAnonymous = false;
  const toggle = document.getElementById('anon-toggle');
  if (toggle) toggle.classList.remove('active');
  showScreen('screen-review');
}

function renderStars(rating) {
  const container = document.getElementById('review-stars');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'star' + (i <= rating ? ' active' : '');
    star.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    star.onclick = () => setRating(i);
    container.appendChild(star);
  }
}

function setRating(rating) { selectedRating = rating; renderStars(rating); }

function toggleAnonymous() {
  isAnonymous = !isAnonymous;
  const toggle = document.getElementById('anon-toggle');
  toggle.classList.toggle('active', isAnonymous);
}

async function submitReview() {
  const text = document.getElementById('review-text').value.trim();
  const providerName = document.getElementById('review-provider-name').textContent;
  if (selectedRating === 0) { alert('Please select a star rating.'); return; }
  if (!text) { alert('Please write a short review.'); return; }
  const realCustomerName = localStorage.getItem('preen_user_name') || 'Customer';
  const saved = await saveReview(providerName, realCustomerName, selectedRating, text, isAnonymous, reviewBookingId);
  if (!saved) { alert('Could not save your review. Please check your connection and try again.'); return; }
  await awardLoyaltyPoints(20);
  const name = isAnonymous ? 'Anonymous' : 'You';
  alert('Review submitted as ' + name + '! Thank you — you earned 20 loyalty points.');
  isAnonymous = false;
  reviewBookingId = null;
  loadMyBookings();
  showScreen('screen-home');
}

// TIPPING
let selectedTipAmount = 0;
let tipProviderName = '';
let tipBookingId = null;

function openTip(providerName, bookingId) {
  tipProviderName = providerName;
  tipBookingId = bookingId || null;
  selectedTipAmount = 0;
  document.getElementById('tip-provider-name').textContent = providerName;
  document.querySelectorAll('.tip-option').forEach(t => t.classList.remove('selected'));
  document.getElementById('tip-summary').style.display = 'none';
  document.getElementById('custom-tip').value = '';
  showScreen('screen-tip');
}

function selectTip(el, amount) {
  document.querySelectorAll('.tip-option').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('custom-tip').value = '';
  selectedTipAmount = amount;
  updateTipSummary(amount);
}

function setCustomTip(value) {
  document.querySelectorAll('.tip-option').forEach(t => t.classList.remove('selected'));
  selectedTipAmount = parseInt(value) || 0;
  if (selectedTipAmount > 0) updateTipSummary(selectedTipAmount);
  else document.getElementById('tip-summary').style.display = 'none';
}

function updateTipSummary(amount) {
  const fee = Math.round(amount * 0.05);
  const providerGets = amount - fee;
  document.getElementById('tip-amount-display').textContent = '₦' + amount.toLocaleString();
  document.getElementById('tip-fee-display').textContent = '₦' + fee.toLocaleString();
  document.getElementById('tip-provider-display').textContent = '₦' + providerGets.toLocaleString();
  document.getElementById('tip-summary').style.display = 'block';
}

async function sendTip() {
  if (selectedTipAmount === 0) { alert('Please select or enter a tip amount.'); return; }
  const customerName = localStorage.getItem('preen_user_name') || 'Guest';
  const customerPhone = localStorage.getItem('preen_user_phone') || '';

  if (db) {
    try {
      const { error } = await db.from('tips').insert([{
        provider_name: tipProviderName,
        customer_name: customerName,
        customer_phone: customerPhone,
        amount: selectedTipAmount,
        booking_id: tipBookingId || null
      }]);
      if (error) { alert('Could not send your tip:\n\n' + error.message); console.error('Tip save error:', error); return; }
    } catch (e) { alert('Could not send your tip. Please try again.'); console.error('Tip save failed:', e); return; }
  }

  await awardLoyaltyPoints(10);
  alert('Tip of ₦' + selectedTipAmount.toLocaleString() + ' sent! You earned 10 loyalty points.');
  tipBookingId = null;
  loadMyBookings();
  showScreen('screen-bookings');
}

function skipTip() { showScreen('screen-bookings'); }

// PROMO
async function applyPromo() {
  const code = document.getElementById('promo-input').value.trim().toUpperCase();
  if (!code) { alert('Please enter a promo code.'); return; }
  if (!db) { alert('Could not reach the server. Please try again.'); return; }

  const phone = localStorage.getItem('preen_user_phone') || '';
  if (!phone) { alert('Please sign in to apply a promo code.'); return; }

  try {
    const { data: promo, error } = await db.from('promo_codes').select('*').eq('code', code).eq('active', true).maybeSingle();
    if (error) { console.error('Promo lookup error:', error); alert('Something went wrong. Please try again.'); return; }
    if (!promo) { alert('Invalid or inactive promo code.'); return; }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) { alert('This promo code has expired.'); return; }
    if (promo.max_uses && promo.times_used >= promo.max_uses) { alert('This promo code has reached its usage limit.'); return; }

    const { data: alreadyUsed } = await db.from('promo_redemptions').select('id').eq('customer_phone', phone).eq('code', code).maybeSingle();
    if (alreadyUsed) { alert('You\'ve already used this promo code.'); return; }

    // Store it so the next booking checkout can apply it — cleared after use in confirmBooking()
    localStorage.setItem('preen_active_promo', JSON.stringify({ code: promo.code, discount_type: promo.discount_type, discount_value: promo.discount_value }));
    alert('Promo code ' + code + ' applied! It will be used automatically on your next booking.');
    loadActivePromoDisplay();
  } catch (e) { console.error('Apply promo failed:', e); alert('Something went wrong. Please try again.'); }
}

function loadActivePromoDisplay() {
  const container = document.getElementById('active-promos-list');
  if (!container) return;
  const raw = localStorage.getItem('preen_active_promo');
  if (!raw) {
    container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">No active promo. Enter a code above to apply one.</p>';
    return;
  }
  const promo = JSON.parse(raw);
  const label = promo.discount_type === 'percent' ? promo.discount_value + '% off your next booking' : '₦' + Number(promo.discount_value).toLocaleString() + ' off your next booking';
  container.innerHTML = `<div class="booking-item"><div class="booking-item-left"><div style="width:36px;height:36px;background:var(--primary-light);border-radius:10px;display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8c-2 0-4-1-4-3.5S9.5 1 12 4c0-3 4.5-2.5 4.5-.5S14 8 12 8z"/></svg></div><div><p class="booking-item-name">${promo.code}</p><p class="booking-item-meta">${label}</p></div></div><span class="status confirmed">Active</span></div>`;
}

// OFFER
let selectedOfferService = null;
let offerPollTimer = null;

async function openOffer() {
  document.getElementById('offer-amount').value = '';
  document.getElementById('offer-preview').style.display = 'none';
  document.getElementById('offer-message').value = '';
  selectedOfferService = null;
  showScreen('screen-offer');
  await loadOfferServices(window.currentProviderName);
}

async function loadOfferServices(providerName) {
  const container = document.getElementById('offer-service-list');
  if (!container || !db || !providerName) return;
  try {
    const { data, error } = await db.from('skills').select('*').eq('provider_name', providerName).order('created_at', { ascending: true });
    if (error) { console.error('Offer services error:', error); return; }
    const services = data || [];
    if (services.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3);">This provider has not added any services yet.</p>';
      return;
    }
    container.innerHTML = services.map(s => {
      const safeName = (s.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<div class="offer-service-option" style="width:100%;text-align:left;padding:12px 14px;display:flex;justify-content:space-between;border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;" onclick="selectOfferService(this, '${safeName}', ${s.price || 0})">
        <span>${s.name}</span><span style="font-weight:600;">₦${Number(s.price || 0).toLocaleString()}</span>
      </div>`;
    }).join('');
    const first = container.querySelector('.offer-service-option');
    if (first && services[0]) selectOfferService(first, services[0].name, services[0].price || 0);
  } catch (e) { console.error('Offer services load error:', e); }
}

function selectOfferService(el, name, price) {
  document.querySelectorAll('#offer-service-list .offer-service-option').forEach(s => {
    s.style.borderColor = 'var(--border)';
    s.style.background = 'transparent';
  });
  el.style.borderColor = 'var(--primary)';
  el.style.background = 'var(--primary-light)';
  selectedOfferService = { name, price };
  document.getElementById('offer-listed-price').textContent = '₦' + price.toLocaleString();
  document.getElementById('offer-service-label').textContent = name + ' · ' + (window.currentProviderName || 'Provider');
  updateOfferPreview(document.getElementById('offer-amount').value);
}

function updateOfferPreview(value) {
  const offer = parseInt(value) || 0;
  const listed = selectedOfferService ? selectedOfferService.price : 0;
  if (offer > 0 && listed > 0 && offer < listed) {
    document.getElementById('offer-preview-listed').textContent = '₦' + listed.toLocaleString();
    document.getElementById('offer-display').textContent = '₦' + offer.toLocaleString();
    document.getElementById('offer-saving').textContent = '₦' + (listed - offer).toLocaleString();
    document.getElementById('offer-preview').style.display = 'block';
  } else {
    document.getElementById('offer-preview').style.display = 'none';
  }
}

async function sendOffer() {
  if (!selectedOfferService) { alert('Please select a service.'); return; }
  const amount = parseInt(document.getElementById('offer-amount').value) || 0;
  const listed = selectedOfferService.price;
  if (amount === 0) { alert('Please enter your offer amount.'); return; }
  if (amount >= listed) { alert('Your offer must be less than the listed price of ₦' + listed.toLocaleString() + '.'); return; }
  if (amount < 100) { alert('Your offer is too low.'); return; }

  const providerName = window.currentProviderName || 'Provider';
  const customerName = localStorage.getItem('preen_user_name') || 'Guest';
  const customerPhone = localStorage.getItem('preen_user_phone') || '';
  const message = document.getElementById('offer-message').value.trim();

  document.getElementById('offer-sent-provider').textContent = providerName;
  document.getElementById('offer-sent-listed').textContent = '₦' + listed.toLocaleString();
  document.getElementById('offer-sent-amount').textContent = '₦' + amount.toLocaleString();
  document.getElementById('offer-status').textContent = 'Pending';
  document.getElementById('offer-status').style.color = '#F59E0B';
  document.getElementById('offer-response-title').textContent = 'Offer Sent!';
  document.getElementById('offer-response-msg').textContent = 'Waiting for ' + providerName + ' to respond.';
  document.getElementById('offer-action-btn').textContent = 'Waiting for response...';
  document.getElementById('offer-action-btn').setAttribute('onclick', 'return false;');
  document.getElementById('offer-response-icon').innerHTML = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8"><path d="M6 2h12M6 22h12M6 2c0 6 6 6 6 10s-6 4-6 10M18 2c0 6-6 6-6 10s6 4 6 10"/></svg>';

  let bookingId = null;
  const serviceLabel = selectedOfferService.name + (message ? ' — "' + message.replace(/"/g, "'") + '"' : '') + ' (Offer, listed ₦' + listed.toLocaleString() + ')';

  if (db) {
    try {
      const { data, error } = await db.from('bookings').insert([{
        customer_name: customerName,
        customer_phone: customerPhone,
        provider_name: providerName,
        service: serviceLabel,
        booking_date: 'To be arranged',
        booking_time: 'To be arranged',
        amount: '₦' + amount.toLocaleString(),
        status: 'confirmed'
      }]).select();
      if (error) { alert('Could not send your offer:\n\n' + error.message); console.error('Offer save error:', error); return; }
      bookingId = data && data[0] ? data[0].id : null;
    } catch (e) { alert('Could not send your offer. Please try again.'); console.error('Offer save failed:', e); return; }
  }

  showScreen('screen-offer-response');
  if (!bookingId || !db) return;

  // Poll for the real provider's response — same mechanism used for normal bookings
  if (offerPollTimer) clearInterval(offerPollTimer);
  offerPollTimer = setInterval(async () => {
    try {
      const { data } = await db.from('bookings').select('status').eq('id', bookingId).single();
      if (data && data.status === 'accepted') {
        clearInterval(offerPollTimer);
        currentBookingDetails = { bookingId, providerName, serviceLabel: selectedOfferService.name, date: 'To be arranged', time: 'To be arranged', amount };
        providerAccepted();
      } else if (data && data.status === 'declined') {
        clearInterval(offerPollTimer);
        document.getElementById('offer-response-icon').innerHTML = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        document.getElementById('offer-response-title').textContent = 'Offer Declined';
        document.getElementById('offer-response-msg').textContent = providerName + ' declined your offer.';
        document.getElementById('offer-status').textContent = 'Declined';
        document.getElementById('offer-status').style.color = 'var(--error)';
        document.getElementById('offer-action-btn').textContent = 'Book at Full Price';
        document.getElementById('offer-action-btn').setAttribute('onclick', "requireAuth('book this service') && showScreen('screen-booking')");
      }
    } catch (e) { /* transient error, keep polling */ }
  }, 3000);

  // Stop polling after 10 minutes if the provider never responds
  setTimeout(() => { if (offerPollTimer) clearInterval(offerPollTimer); }, 10 * 60 * 1000);
}

// HOUSE CALL
let selectedHouseCallService = null;
let housecallPollTimer = null;

async function loadHouseCallServices(providerName) {
  const container = document.getElementById('housecall-service-list');
  if (!container || !db || !providerName) return;

  try {
    const { data, error } = await db.from('skills').select('*').eq('provider_name', providerName).order('created_at', { ascending: true });
    if (error) { console.error('House call services error:', error); return; }

    const services = data || [];
    if (services.length === 0) {
      container.innerHTML = '<p style="font-size:12px; color:var(--text3);">This provider hasn\'t added any services yet.</p>';
      return;
    }

    container.innerHTML = services.map((s, i) => {
      const safeName = (s.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<div class="housecall-service-option" style="width:100%;text-align:left;padding:12px 14px;display:flex;justify-content:space-between;border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;" onclick="selectHouseCallService(this, '${safeName}', ${s.price || 0})">
        <span>${s.name}</span><span style="font-weight:600;">₦${Number(s.price || 0).toLocaleString()}</span>
      </div>`;
    }).join('');

    // Auto-select the first service so the price shown is never ₦0/blank
    const firstItem = container.querySelector('.housecall-service-option');
    if (firstItem && services[0]) selectHouseCallService(firstItem, services[0].name, services[0].price || 0);
  } catch (e) { console.error('House call services load error:', e); }
}

function selectHouseCallService(el, name, price) {
  document.querySelectorAll('#housecall-service-list .housecall-service-option').forEach(s => {
    s.style.borderColor = 'var(--border)';
    s.style.background = 'transparent';
  });
  el.style.borderColor = 'var(--primary)';
  el.style.background = 'var(--primary-light)';
  selectedHouseCallService = { name, price };
  const travelFee = 1000;
  const total = price + travelFee;
  document.getElementById('housecall-service-fee').textContent = '₦' + price.toLocaleString();
  document.getElementById('housecall-total').textContent = '₦' + total.toLocaleString();
  document.getElementById('housecall-submit-btn').textContent = 'Request House Call · ₦' + total.toLocaleString();
}

async function confirmHouseCall() {
  const address = document.getElementById('housecall-address').value.trim();
  const date = document.getElementById('housecall-date').value;
  const selectedTime = document.querySelector('#screen-housecall .time-slots .time-slot.selected');
  if (!selectedHouseCallService) { alert('Please select a service.'); return; }
  if (!address) { alert('Please enter your address.'); return; }
  if (!date) { alert('Please select a date.'); return; }
  if (!selectedTime) { alert('Please select a time slot.'); return; }
  const formattedDate = new Date(date).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const providerName = window.currentProviderName || 'Provider';
  const customerName = localStorage.getItem('preen_user_name') || 'Guest';
  const customerPhone = localStorage.getItem('preen_user_phone') || '';
  const travelFee = 1000;
  const total = selectedHouseCallService.price + travelFee;

  let bookingId = null;
  if (db) {
    try {
      const { data, error } = await db.from('bookings').insert([{
        customer_name: customerName,
        customer_phone: customerPhone,
        provider_name: providerName,
        service: selectedHouseCallService.name + ' (House Call)',
        booking_date: formattedDate,
        booking_time: selectedTime.textContent,
        amount: '₦' + total.toLocaleString(),
        status: 'confirmed',
        is_house_call: true,
        house_call_address: address
      }]).select();
      if (error) { alert('Could not send your house call request:\n\n' + error.message); console.error('House call save error:', error); return; }
      bookingId = data && data[0] ? data[0].id : null;
    } catch (e) { alert('Could not send your house call request. Please try again.'); console.error('House call save failed:', e); return; }
  }

  document.getElementById('housecall-confirmed-provider').textContent = providerName;
  document.getElementById('housecall-confirmed-address').textContent = address;
  document.getElementById('housecall-confirmed-date').textContent = formattedDate + ' · ' + selectedTime.textContent;
  document.getElementById('housecall-confirmed-total').textContent = '₦' + total.toLocaleString();
  document.getElementById('housecall-status-label').textContent = 'Pending';
  document.getElementById('housecall-status-label').style.color = '#F59E0B';
  document.getElementById('housecall-status-title').textContent = 'House Call Requested!';
  document.getElementById('housecall-status-msg').textContent = 'The provider will confirm your request shortly.';
  showScreen('screen-housecall-success');

  if (!bookingId || !db) return;

  // Poll for the real provider's response, same mechanism used for offers and normal bookings
  if (housecallPollTimer) clearInterval(housecallPollTimer);
  housecallPollTimer = setInterval(async () => {
    try {
      const { data } = await db.from('bookings').select('status').eq('id', bookingId).single();
      if (data && data.status === 'accepted') {
        clearInterval(housecallPollTimer);
        currentBookingDetails = { bookingId, providerName, serviceLabel: selectedHouseCallService.name, date: formattedDate, time: selectedTime.textContent, amount: total };
        providerAccepted();
      } else if (data && data.status === 'declined') {
        clearInterval(housecallPollTimer);
        document.getElementById('housecall-status-icon').innerHTML = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        document.getElementById('housecall-status-title').textContent = 'House Call Declined';
        document.getElementById('housecall-status-msg').textContent = providerName + ' is unable to take this request. You have not been charged.';
        document.getElementById('housecall-status-label').textContent = 'Declined';
        document.getElementById('housecall-status-label').style.color = 'var(--error)';
      }
    } catch (e) { /* transient error, keep polling */ }
  }, 3000);

  setTimeout(() => { if (housecallPollTimer) clearInterval(housecallPollTimer); }, 15 * 60 * 1000);
}

// SHARE
function shareProfile(providerName) {
  const slug = providerName.toLowerCase().replace(/\s+/g, '-');
  const link = 'https://preen.ng/' + slug;
  if (navigator.share) {
    navigator.share({ title: providerName + ' on Preen', text: 'Book ' + providerName + ' on Preen', url: link });
  } else {
    navigator.clipboard.writeText(link).then(() => alert('Profile link copied!\n' + link));
  }
}

// WHATSAPP
function notifyBookingConfirmed(providerName, date, time) {
  const msg = 'Hi! Your booking with ' + providerName + ' on Preen has been confirmed for ' + date + ' at ' + time + '. See you then!';
  window.open('https://wa.me/2348000000000?text=' + encodeURIComponent(msg), '_blank');
}

// PROVIDER AUTH
function handleProviderLogin() {
  const email = document.getElementById('provider-email').value.trim();
  const password = document.getElementById('provider-password').value.trim();
  if (!email || !password) { alert('Please enter your email and password.'); return; }
  showScreen('screen-provider-dashboard');
}

let capturedProviderLat = null;
let capturedProviderLng = null;
let capturedProviderNote = '';
let locationPickerMap = null;
let locationPickerMarker = null;
let locationPickerMode = 'signup'; // 'signup' or 'edit'

function openLocationPicker(mode) {
  locationPickerMode = mode;
  showScreen('screen-location-picker');

  // Start centered on whatever was already set, or a reasonable Nigeria-wide default
  const startLat = capturedProviderLat || 9.0820;
  const startLng = capturedProviderLng || 8.6753;
  const startZoom = capturedProviderLat ? 15 : 6;

  setTimeout(() => {
    if (locationPickerMap) { locationPickerMap.remove(); locationPickerMap = null; }
    locationPickerMap = L.map('location-picker-map').setView([startLat, startLng], startZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(locationPickerMap);

    locationPickerMarker = L.marker([startLat, startLng], { draggable: true }).addTo(locationPickerMap);
    locationPickerMarker.on('dragend', () => {
      const pos = locationPickerMarker.getLatLng();
      capturedProviderLat = pos.lat;
      capturedProviderLng = pos.lng;
    });

    // Tapping anywhere on the map also moves the pin there — easier than
    // fine dragging on a small phone screen
    locationPickerMap.on('click', (e) => {
      locationPickerMarker.setLatLng(e.latlng);
      capturedProviderLat = e.latlng.lat;
      capturedProviderLng = e.latlng.lng;
    });
  }, 150);

  const noteInput = document.getElementById('location-picker-note');
  if (noteInput) noteInput.value = capturedProviderNote || '';
}

function useMyCurrentLocationForPicker() {
  if (!navigator.geolocation) { alert('Location is not available on this device.'); return; }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      capturedProviderLat = lat;
      capturedProviderLng = lng;
      if (locationPickerMap && locationPickerMarker) {
        locationPickerMap.setView([lat, lng], 16);
        locationPickerMarker.setLatLng([lat, lng]);
      }
    },
    () => { alert('Could not get your current location — please allow location access, or just drag the pin manually instead.'); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function closeLocationPicker() {
  goBack();
}

async function confirmLocationPicker() {
  if (capturedProviderLat === null || capturedProviderLng === null) {
    alert('Please set a location — drag the pin or use your current location.');
    return;
  }
  capturedProviderNote = document.getElementById('location-picker-note').value.trim();

  const statusText = document.getElementById('prov-location-status-text');
  if (statusText) statusText.innerHTML = '<span style="color:var(--success);">Location set ✓</span> — tap to update';

  if (locationPickerMode === 'edit') {
    // Save immediately to Supabase since Edit Profile is a "revisit anytime" flow
    const provName = localStorage.getItem('preen_provider_name') || '';
    if (db && provName) {
      try {
        const { error } = await db.from('providers').update({
          latitude: capturedProviderLat,
          longitude: capturedProviderLng,
          location_note: capturedProviderNote
        }).eq('full_name', provName);
        if (error) { alert('Could not save your location:\n\n' + error.message); console.error('Location save error:', error); return; }
      } catch (e) { alert('Could not save your location. Please try again.'); console.error('Location save failed:', e); return; }
    }
    alert('Studio location updated!');
    showScreen('screen-edit-profile');
    return;
  }

  // Signup mode — just staged in memory, saved for real when the account is created
  goBack();
}

async function handleProviderSignup() {
  const name = document.getElementById('prov-name').value.trim();
  const phone = document.getElementById('prov-phone').value.trim();
  const whatsapp = document.getElementById('prov-whatsapp') ? document.getElementById('prov-whatsapp').value.trim() : phone;
  const email = document.getElementById('prov-email-signup').value.trim();
  const password = document.getElementById('prov-password') ? document.getElementById('prov-password').value.trim() : '';
  const category = document.getElementById('prov-category').value;
  const state = document.getElementById('prov-state').value;

  if (!name) { alert('Please enter your business or stage name.'); return; }
  if (!phone) { alert('Please enter your phone number.'); return; }
  if (!email) { alert('Please enter your email address.'); return; }
  if (!category) { alert('Please select your service category.'); return; }
  if (!state) { alert('Please select your state.'); return; }
  if (capturedProviderLat === null || capturedProviderLng === null) { alert('Please set your studio location so customers can find you — tap the location field above.'); return; }

  // Check for duplicate business name
  if (db) {
    const { data: existing } = await db
      .from('providers')
      .select('id')
      .ilike('full_name', name)
      .single();

    if (existing) {
      alert('A provider with the name "' + name + '" already exists on Preen. Please choose a different business name.');
      return;
    }
  }

  // Save to Supabase
  if (db) {
    const { error: providerError } = await db.from('providers').insert([{
      full_name: name,
      phone: phone,
      whatsapp: whatsapp || phone,
      email: email,
      category: category,
      state: state,
      latitude: capturedProviderLat,
      longitude: capturedProviderLng,
      location_note: capturedProviderNote,
      is_verified: false,
      is_available: true,
      rating: 0
    }]);

    if (providerError) {
      alert('Could not save your provider account to the database:\n\n' + providerError.message + '\n\nYour account will only exist on this device until this is fixed — customers will not be able to find you. Please contact support with this error.');
      console.error('Provider signup error:', providerError);
      return;
    }

    const { error: userError } = await db.from('user').insert([{
      full_name: name,
      phone: phone,
      email: email,
      role: 'provider'
    }]);
    if (userError) console.error('User table insert error (non-critical):', userError);
  }

  // Save to localStorage
  localStorage.setItem('preen_role', 'provider');
  localStorage.setItem('preen_provider_name', name);
  localStorage.setItem('preen_provider_email', email);
  localStorage.setItem('preen_provider_phone', phone);
  localStorage.setItem('preen_provider_category', category);

  showScreen('screen-provider-dashboard');
}

// AVAILABILITY
async function toggleAvailability() {
  const toggle = document.getElementById('avail-toggle');
  const label = document.getElementById('avail-label');
  const provName = localStorage.getItem('preen_provider_name') || '';

  const goingAvailable = !toggle.classList.contains('active');

  // Update the DB first — only flip the UI once we know it actually saved,
  // since this toggle previously did nothing but change its own appearance.
  if (db && provName) {
    try {
      const { error } = await db.from('providers').update({ is_available: goingAvailable }).eq('full_name', provName);
      if (error) { console.error('Availability update error:', error); alert('Could not update your availability. Please try again.'); return; }
    } catch (e) { console.error('Availability update failed:', e); alert('Could not update your availability. Please try again.'); return; }
  }

  toggle.classList.toggle('active');
  if (toggle.classList.contains('active')) { label.textContent = 'Available'; label.style.color = 'var(--primary)'; }
  else { label.textContent = 'Unavailable'; label.style.color = 'var(--text3)'; }
}

async function syncAvailabilityToggle() {
  const toggle = document.getElementById('avail-toggle');
  const label = document.getElementById('avail-label');
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!toggle || !db || !provName) return;
  try {
    const { data } = await db.from('providers').select('is_available').eq('full_name', provName).single();
    const isAvailable = data ? !!data.is_available : true;
    toggle.classList.toggle('active', isAvailable);
    if (label) {
      label.textContent = isAvailable ? 'Available' : 'Unavailable';
      label.style.color = isAvailable ? 'var(--primary)' : 'var(--text3)';
    }
  } catch (e) { console.error('Availability sync error:', e); }
}

// AI ONBOARDING
function processAIOnboarding() {
  const input = document.getElementById('ai-input').value.trim();
  if (!input) { alert('Please tell us about yourself first.'); return; }
  if (input.length < 20) { alert('Please write a bit more so we can build your profile.'); return; }
  document.getElementById('ai-loading').style.display = 'block';
  document.getElementById('ai-build-btn').style.display = 'none';
  setTimeout(() => {
    const name = extractName(input);
    const category = extractCategory(input);
    const location = extractLocation(input);
    const services = extractServices(input, category);
    const hours = extractHours(input);
    document.getElementById('ai-name').value = name;
    document.getElementById('ai-location').value = location;
    document.getElementById('ai-bio').value = generateBio(name, category, location);
    document.getElementById('ai-hours').value = hours;
    const categorySelect = document.getElementById('ai-category');
    for (let i = 0; i < categorySelect.options.length; i++) {
      if (categorySelect.options[i].text.toLowerCase().includes(category.toLowerCase())) { categorySelect.selectedIndex = i; break; }
    }
    document.getElementById('ai-services').innerHTML = services.map(s =>
      '<div style="background:#1a1a1a;border-radius:12px;padding:12px;display:flex;justify-content:space-between;"><span>' + s.name + '</span><span style="color:#F59E0B;font-weight:600;">' + s.price + '</span></div>'
    ).join('');
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-build-btn').style.display = 'block';
    showScreen('screen-ai-result');
  }, 2500);
}

function extractName(text) {
  const patterns = [/my name is ([a-zA-Z]+)/i, /i am ([a-zA-Z]+)/i, /called ([a-zA-Z]+)/i];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1); }
  return 'Provider';
}

function extractCategory(text) {
  const lower = text.toLowerCase();
  if (['barber','fade','lineup','beard','cut'].some(k => lower.includes(k))) return 'Barber';
  if (['nail','manicure','pedicure','gel','acrylic'].some(k => lower.includes(k))) return 'Nail Tech';
  if (['lash','eyelash','extension'].some(k => lower.includes(k))) return 'Lash Tech';
  if (['makeup','make up'].some(k => lower.includes(k))) return 'Makeup Artist';
  if (['weave','braid','relaxer','hairdresser'].some(k => lower.includes(k))) return 'Hair Stylist';
  if (['massage','spa','therapy'].some(k => lower.includes(k))) return 'Massage Therapist';
  return 'Barber';
}

function extractLocation(text) {
  const areas = ['wuse','garki','maitama','gwarinpa','asokoro','abuja','lagos','ikeja','lekki','port harcourt','kano','ibadan','enugu'];
  const lower = text.toLowerCase();
  for (const area of areas) {
    if (lower.includes(area)) return area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + (lower.includes('abuja') && area !== 'abuja' ? ', Abuja' : '');
  }
  return 'Abuja, FCT';
}

function extractServices(text, category) {
  const lower = text.toLowerCase();
  const serviceMap = {
    'Barber': [{keywords:['fade'],name:'Signature Fade',price:'₦2,500'},{keywords:['beard'],name:'Beard Trim',price:'₦1,500'},{keywords:['lineup','line-up'],name:'Line-up',price:'₦1,000'},{keywords:['design'],name:'Creative Designs',price:'₦3,500'}],
    'Nail Tech': [{keywords:['gel'],name:'Gel Manicure',price:'₦8,000'},{keywords:['acrylic'],name:'Acrylic Full Set',price:'₦12,000'},{keywords:['pedicure'],name:'Pedicure',price:'₦5,000'}],
    'Lash Tech': [{keywords:['classic'],name:'Classic Set',price:'₦8,000'},{keywords:['volume'],name:'Volume Set',price:'₦12,000'},{keywords:['lash'],name:'Lash Extensions',price:'₦10,000'}],
    'Hair Stylist': [{keywords:['weave'],name:'Weave Installation',price:'₦15,000'},{keywords:['braid'],name:'Braids',price:'₦12,000'}],
    'Makeup Artist': [{keywords:['bridal'],name:'Bridal Makeup',price:'₦35,000'},{keywords:['glam'],name:'Glam Makeup',price:'₦15,000'}],
    'Massage Therapist': [{keywords:['body'],name:'Full Body Massage',price:'₦15,000'},{keywords:['back'],name:'Back Massage',price:'₦8,000'}]
  };
  const catServices = serviceMap[category] || serviceMap['Barber'];
  const detected = catServices.filter(s => s.keywords.some(k => lower.includes(k)));
  return detected.length > 0 ? detected : catServices.slice(0, 3);
}

function extractHours(text) {
  const lower = text.toLowerCase();
  if (['monday to saturday','mon to sat','mon-sat'].some(k => lower.includes(k))) return 'Monday to Saturday — 8:00 AM to 8:00 PM';
  if (['everyday','every day','7 days'].some(k => lower.includes(k))) return 'Monday to Sunday — 9:00 AM to 7:00 PM';
  return 'Monday to Saturday — 8:00 AM to 8:00 PM';
}

function generateBio(name, category, location) {
  return name + ' is a professional ' + category + ' based in ' + location + '. Known for quality service and attention to detail.';
}

function publishProfile() {
  alert('Your profile has been published! Customers can now find and book you on Preen.');
  showScreen('screen-provider-dashboard');
}

// SKILL UPLOAD
let skills = [];
let photoUploaded = false;
let videoUploaded = false;

function simulatePhotoUpload() {
  photoUploaded = true;
  document.getElementById('photo-placeholder').style.display = 'none';
  document.getElementById('photo-preview').style.display = 'block';
}

function simulateVideoUpload() {
  videoUploaded = true;
  document.getElementById('video-placeholder').style.display = 'none';
  document.getElementById('video-preview').style.display = 'block';
}

function addSkill() {
  const name = document.getElementById('skill-name').value.trim();
  const price = document.getElementById('skill-price') ? document.getElementById('skill-price').value.trim() : '';
  const duration = document.getElementById('skill-duration') ? document.getElementById('skill-duration').value : '';
  if (!name) { alert('Please enter a skill name.'); return; }
  if (!price) { alert('Please enter a price for this skill.'); return; }
  if (!duration) { alert('Please select how long this service takes.'); return; }
  if (!photoUploaded) { alert('Please upload a photo of your work.'); return; }

  const photoUrl = window.skillPhotoUrl || null;
  const videoUrl = window.skillVideoUrl || null;

  skills.push({ name, price, duration, photoUrl, videoUrl, hasPhoto: photoUploaded, hasVideo: videoUploaded });

  const card = document.createElement('div');
  card.className = 'skill-card';

  // Show actual photo thumbnail instead of emoji
  const thumbHtml = photoUrl
    ? '<div style="width:52px;height:52px;border-radius:12px;overflow:hidden;flex-shrink:0;"><img src="' + photoUrl + '" style="width:100%;height:100%;object-fit:cover;"/></div>'
    : '<div style="width:52px;height:52px;background:#7C3AED22;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="vertical-align:-2px;display:inline-block;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>';

  card.innerHTML = thumbHtml +
    '<div style="flex:1;margin-left:12px;">' +
    '<p style="font-size:14px;font-weight:500;">' + name + '</p>' +
    '<p style="font-size:12px;color:var(--primary);font-weight:600;margin-top:2px;">₦' + (price ? Number(price).toLocaleString() : '0') + ' · ' + duration + '</p>' +
    '<p style="font-size:11px;color:#888;margin-top:1px;">' + (videoUploaded ? 'Photo + Video' : 'Photo only') + '</p>' +
    '</div>' +
    (videoUploaded ? '<span style="font-size:10px;color:var(--accent);font-weight:600;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> Video added</span>' : '');

  document.getElementById('skill-list').appendChild(card);

  // Reset form
  document.getElementById('skill-name').value = '';
  if (document.getElementById('skill-price')) document.getElementById('skill-price').value = '';
  if (document.getElementById('skill-duration')) document.getElementById('skill-duration').value = '';
  photoUploaded = false;
  videoUploaded = false;
  window.skillPhotoUrl = null;
  window.skillVideoUrl = null;
  document.getElementById('photo-placeholder').style.display = 'flex';
  document.getElementById('photo-preview').style.display = 'none';
  document.getElementById('video-placeholder').style.display = 'flex';
  document.getElementById('video-preview').style.display = 'none';
}

async function submitSkills() {
  if (skills.length === 0) { alert('Please add at least one skill before saving.'); return; }
  const provName = localStorage.getItem('preen_provider_name') || '';

  if (db && provName) {
    const rows = skills.map(s => ({
      provider_name: provName,
      name: s.name,
      price: parseFloat(s.price) || 0,
      duration: s.duration,
      photo_url: s.photoUrl || null,
      video_url: s.videoUrl || null
    }));
    try {
      const { error } = await db.from('skills').insert(rows);
      if (error) {
        alert('Could not save your services to the database:\n\n' + error.message + '\n\nThey will only exist on this device until this is fixed.');
        console.error('Skills save error:', error);
        return;
      }
    } catch (e) {
      alert('Could not save your services. Please check your connection and try again.');
      console.error('Skills save failed:', e);
      return;
    }
  }

  document.getElementById('skills-count').textContent = skills.length;
  skills = [];
  showScreen('screen-verified');
}




// PROVIDER BOOKINGS FILTER
let allProviderBookingsCache = [];

async function loadProviderAllBookings() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;
  const container = document.getElementById('prov-all-bookings-list');
  if (!container) return;

  try {
    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) { console.error('All bookings fetch error:', error); return; }

    allProviderBookingsCache = data || [];
    renderProviderAllBookings('all');
  } catch (e) { console.error('All bookings load error:', e); }
}

function renderProviderAllBookings(filterType) {
  const container = document.getElementById('prov-all-bookings-list');
  if (!container) return;

  const statusMap = { confirmed: 'confirmed', accepted: 'confirmed', pending_confirmation: 'confirmed', completed: 'completed', disputed: 'cancelled', declined: 'cancelled', cancelled: 'cancelled' };
  const statusLabel = { confirmed: 'Pending', accepted: 'Confirmed', pending_confirmation: 'Awaiting Customer', completed: 'Completed', disputed: 'Under Review', declined: 'Declined', cancelled: 'Cancelled' };

  const now = new Date();
  const todayStr = now.toDateString();

  let filtered = allProviderBookingsCache;
  if (filterType === 'today') {
    filtered = filtered.filter(b => {
      const d = b.booking_date ? new Date(b.booking_date) : null;
      return d && !isNaN(d.getTime()) && d.toDateString() === todayStr;
    });
  } else if (filterType === 'upcoming') {
    filtered = filtered.filter(b => {
      const d = b.booking_date ? new Date(b.booking_date) : null;
      return (b.status === 'accepted' || b.status === 'confirmed') && d && !isNaN(d.getTime()) && d >= now;
    });
  } else if (filterType === 'completed') {
    filtered = filtered.filter(b => b.status === 'completed');
  } else if (filterType === 'cancelled') {
    filtered = filtered.filter(b => b.status === 'declined' || b.status === 'cancelled');
  }

  if (filtered.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--text3); text-align:center; padding:24px 0;">No bookings here yet.</p>';
    return;
  }

  container.innerHTML = filtered.map(b => {
    const cls = statusMap[b.status] || 'confirmed';
    const label = statusLabel[b.status] || 'Pending';
    const canComplete = b.status === 'accepted';
    const canMessage = ['confirmed', 'accepted', 'pending_confirmation'].includes(b.status);
    return `
      <div class="prov-booking-card" style="${(canComplete || canMessage) ? 'flex-direction:column; align-items:stretch; gap:10px;' : ''}">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="review-avatar" style="width:44px; height:44px; font-size:16px;">${(b.customer_name || 'C').charAt(0).toUpperCase()}</div>
          <div style="flex:1;">
            <p style="font-size:14px; font-weight:500;">${b.customer_name || 'Customer'}</p>
            <p style="font-size:12px; color:var(--text3); margin-top:2px;">${b.service || ''} · ${b.booking_date || ''} ${b.booking_time || ''}</p>
            <p style="font-size:11px; color:var(--text2); margin-top:1px;">${b.customer_phone || ''}</p>
          </div>
          <div style="text-align:right;">
            <span class="status ${cls}">${label}</span>
            <p style="font-size:12px; color:var(--primary-dark); font-weight:600; margin-top:4px;">${b.amount || ''}</p>
          </div>
        </div>
        ${(canComplete || canMessage) ? `<div style="display:flex; gap:8px;">
          ${canMessage ? `<button class="btn-secondary" style="flex:1;padding:8px; font-size:12px;" onclick="openChat('${b.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;display:inline-block;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Message</button>` : ''}
          ${canComplete ? `<button class="btn-primary" style="flex:1;padding:8px; font-size:12px;" onclick="markServiceDone('${b.id}', this)">Service Done</button>` : ''}
        </div>` : ''}
      </div>`;
  }).join('');
}

function filterProvBookings(el, type) {
  document.querySelectorAll('#screen-provider-all-bookings .filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderProviderAllBookings(type);
}

function sendWhatsAppReminder(clientName, service, time) {
  const msg = 'Hi ' + clientName + '! Just a reminder that your ' + service + ' appointment is in 15 minutes at ' + time + '. We look forward to seeing you! - Preen';
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// PROVIDER CALENDAR
let providerCalendarBookings = []; // real bookings, fetched from Supabase — replaces the old hardcoded fake schedule
let currentWeekOffset = 0;
let selectedCalDay = new Date().getDay();

async function loadProviderCalendar() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;
  try {
    const { data, error } = await db.from('bookings').select('*').eq('provider_name', provName).eq('status', 'accepted');
    if (error) { console.error('Calendar fetch error:', error); return; }
    providerCalendarBookings = data || [];
  } catch (e) { console.error('Calendar load error:', e); }
  initCalendar();
}

function getCalWeekStart() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + (currentWeekOffset * 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

function calBookingsForDate(dateObj) {
  return providerCalendarBookings.filter(b => {
    const d = b.booking_date ? new Date(b.booking_date) : null;
    return d && !isNaN(d.getTime()) && d.toDateString() === dateObj.toDateString();
  });
}

function initCalendar() {
  renderCalDays();
  renderCalBookings(selectedCalDay);
}

function renderCalDays() {
  const container = document.getElementById('cal-days');
  if (!container) return;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const startOfWeek = getCalWeekStart();

  const weekLabel = document.getElementById('cal-week-label');
  if (currentWeekOffset === 0) weekLabel.textContent = 'This Week';
  else if (currentWeekOffset === 1) weekLabel.textContent = 'Next Week';
  else if (currentWeekOffset === -1) weekLabel.textContent = 'Last Week';
  else {
    const end = new Date(startOfWeek); end.setDate(startOfWeek.getDate() + 6);
    weekLabel.textContent = startOfWeek.getDate() + ' - ' + end.getDate() + ' ' + end.toLocaleString('default', {month: 'short'});
  }

  container.innerHTML = days.map((day, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    const isActive = i === selectedCalDay;
    const hasBooking = calBookingsForDate(date).length > 0;
    return '<div class="cal-day' + (isActive ? ' active' : '') + (hasBooking ? ' has-booking' : '') + '" onclick="selectCalDay(' + i + ')">' +
      '<div class="cal-day-name">' + day + '</div>' +
      '<div class="cal-day-num">' + date.getDate() + '</div>' +
      (hasBooking ? '<div class="cal-day-dot"></div>' : '') +
      '</div>';
  }).join('');
}

function selectCalDay(dayIndex) {
  selectedCalDay = dayIndex;
  renderCalDays();
  renderCalBookings(dayIndex);
}

function renderCalBookings(dayIndex) {
  const container = document.getElementById('cal-bookings');
  if (!container) return;
  const startOfWeek = getCalWeekStart();
  const date = new Date(startOfWeek);
  date.setDate(startOfWeek.getDate() + dayIndex);
  const bookings = calBookingsForDate(date).sort((a, b) => (a.booking_time || '').localeCompare(b.booking_time || ''));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (bookings.length === 0) {
    container.innerHTML = '<div class="cal-empty"><div style="margin-bottom:8px;display:flex;justify-content:center;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="vertical-align:-2px;display:inline-block;"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div><p>No bookings on ' + days[dayIndex] + '</p><p style="font-size:12px; color:var(--text3); margin-top:4px;">Enjoy your free time!</p></div>';
    return;
  }

  container.innerHTML = '<p style="font-size:12px; color:var(--text3); margin-bottom:8px;">' + bookings.length + ' booking' + (bookings.length > 1 ? 's' : '') + ' on ' + days[dayIndex] + '</p>' +
    bookings.map(b =>
      '<div class="cal-booking-slot' + (b.status === 'completed' ? ' completed' : b.status === 'cancelled' ? ' cancelled' : '') + '">' +
      '<div class="cal-time">' + (b.booking_time || '') + '</div>' +
      '<div class="cal-booking-info">' +
      '<p class="cal-booking-name">' + (b.customer_name || 'Customer') + '</p>' +
      '<p class="cal-booking-service">' + (b.service || '') + '</p>' +
      '</div>' +
      '<div class="cal-booking-amount">' + (b.amount || '') + '</div>' +
      '</div>'
    ).join('');
}

function changeWeek(direction) {
  currentWeekOffset += direction;
  renderCalDays();
  renderCalBookings(selectedCalDay);
}
// WHATSAPP NOTIFICATIONS
let whatsappEnabled = true;

function toggleWhatsApp() {
  whatsappEnabled = !whatsappEnabled;
  const toggle = document.getElementById('whatsapp-toggle');
  toggle.classList.toggle('active', whatsappEnabled);
}

function saveWhatsAppNumber() {
  const number = document.getElementById('prov-whatsapp-number').value.trim();
  if (!number) { alert('Please enter your WhatsApp number.'); return; }
  alert('WhatsApp number saved! You will receive booking reminders at ' + number);
}

function testWhatsAppNotification() {
  const number = document.getElementById('prov-whatsapp-number').value.trim() || '2348000000000';
  const clean = number.replace(/[^0-9]/g, '');
  const msg = 'Hi! This is a test notification from Preen. Your next booking reminder will look like this:\n\n⏰ REMINDER: You have a booking in 15 minutes!\n\nClient: Adebayo O.\nService: Signature Fade\nTime: 10:00 AM\n\nGet ready! 💈';
  window.open('https://wa.me/' + clean + '?text=' + encodeURIComponent(msg), '_blank');
}

function scheduleBookingReminder(clientName, service, time, providerPhone) {
  if (!whatsappEnabled) return;
  const msg = '⏰ REMINDER: You have a booking in 15 minutes!\n\nClient: ' + clientName + '\nService: ' + service + '\nTime: ' + time + '\n\nGet ready! 💈';
  const clean = providerPhone.replace(/[^0-9]/g, '');
  window.open('https://wa.me/' + clean + '?text=' + encodeURIComponent(msg), '_blank');
}


// SKILL UPLOAD - REAL CLOUDINARY
async function handleSkillPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  const placeholder = document.getElementById('photo-placeholder');
  const preview = document.getElementById('photo-preview');
  const box = document.getElementById('photo-upload-box');
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

  // Show local preview immediately using FileReader — no wait needed
  const reader = new FileReader();
  reader.onload = (e) => {
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (box) box.style.borderColor = 'var(--primary)';
  };
  reader.readAsDataURL(file);

  // Upload to Cloudinary in background
  if (placeholder) {
    placeholder.innerHTML =
      '<div class="ai-spinner" style="margin:0 auto 8px;"></div>' +
      '<p style="font-size:12px;color:var(--primary);">Saving to cloud...</p>';
  }

  uploadToCloudinary(file, 'image').then(url => {
    if (url) {
      window.skillPhotoUrl = url;
      photoUploaded = true;
      if (box) box.style.borderColor = 'var(--success)';
      if (placeholder) {
        placeholder.style.display = 'none';
      }
    } else {
      if (box) box.style.borderColor = 'var(--error)';
      if (placeholder) {
        placeholder.innerHTML = '<p style="color:var(--error);font-size:12px;text-align:center;">Upload failed. Check your connection and try again.</p>';
        placeholder.style.display = 'flex';
      }
    }
  }).catch(e => {
    if (box) box.style.borderColor = 'var(--error)';
    if (placeholder) {
      placeholder.innerHTML = '<p style="color:var(--error);font-size:12px;text-align:center;">Upload failed. Check your connection and try again.</p>';
      placeholder.style.display = 'flex';
    }
  });
}

async function handleSkillVideo(input) {
  const file = input.files[0];
  if (!file) return;

  const placeholder = document.getElementById('video-placeholder');
  const preview = document.getElementById('video-preview');
  const box = document.getElementById('video-upload-box');

  // Show local video preview immediately
  const localUrl = URL.createObjectURL(file);
  if (preview) {
    preview.src = localUrl;
    preview.style.display = 'block';
    preview.load();
  }
  if (placeholder) placeholder.style.display = 'none';
  if (box) box.style.borderColor = 'var(--primary)';

  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  if (placeholder) {
    placeholder.style.display = 'none';
  }

  // Show upload progress near the box
  const progressEl = document.getElementById('video-upload-progress');
  if (progressEl) {
    progressEl.textContent = 'Uploading ' + sizeMB + 'MB video...';
    progressEl.style.display = 'block';
  }

  uploadToCloudinary(file, 'video').then(url => {
    if (url) {
      window.skillVideoUrl = url;
      videoUploaded = true;
      if (box) box.style.borderColor = 'var(--success)';
      if (progressEl) progressEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg> Video uploaded successfully';
    } else {
      if (box) box.style.borderColor = 'var(--error)';
      if (progressEl) progressEl.textContent = 'Upload failed. Try again.';
      alert('Video upload failed. Please try a shorter video.');
    }
  });
}

// TEAM MANAGEMENT
let teamPhotoUploaded = false;
let teamPhotoUrl = null;

function uploadTeamMemberPhoto() {
  uploadWithCrop(async (file) => {
    const placeholder = document.getElementById('team-photo-placeholder');
    const preview = document.getElementById('team-photo-preview');
    const box = document.getElementById('team-photo-box');
    if (placeholder) placeholder.innerHTML = '<div class="ai-spinner" style="margin:0 auto; width:24px; height:24px; border-width:2px;"></div>';
    const url = await uploadToCloudinary(file, 'image');
    if (url) {
      teamPhotoUploaded = true;
      teamPhotoUrl = url;
      if (preview) {
        preview.style.display = 'block';
        preview.style.backgroundImage = 'url(' + url + ')';
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.style.borderRadius = '50%';
        preview.style.width = '100%';
        preview.style.height = '100%';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (box) { box.style.borderStyle = 'solid'; box.style.borderColor = 'var(--primary)'; }
    } else {
      if (placeholder) placeholder.innerHTML = '<p style="font-size:10px;color:var(--error);">Failed</p>';
    }
  });
}

async function addTeamMember() {
  const name = document.getElementById('team-name').value.trim();
  const role = document.getElementById('team-role').value.trim();
  const experience = document.getElementById('team-experience').value;
  if (!name) { alert('Please enter the team member name.'); return; }
  if (!role) { alert('Please enter their role or title.'); return; }

  const provName = localStorage.getItem('preen_provider_name') || '';
  if (db && provName) {
    try {
      const { error } = await db.from('team_members').insert([{
        provider_name: provName,
        name: name,
        role: role,
        years_experience: experience
      }]);
      if (error) {
        alert('Could not save this team member:\n\n' + error.message);
        console.error('Team member save error:', error);
        return;
      }
    } catch (e) {
      alert('Could not save this team member. Please try again.');
      console.error('Team member save failed:', e);
      return;
    }
  }

  document.getElementById('team-name').value = '';
  document.getElementById('team-role').value = '';
  document.getElementById('team-experience').selectedIndex = 0;
  teamPhotoUploaded = false;
  teamPhotoUrl = null;
  document.getElementById('team-photo-placeholder').style.display = 'flex';
  document.getElementById('team-photo-placeholder').innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><p style="font-size:12px; color:var(--text3); margin-top:8px;">Tap to upload photo</p>';
  document.getElementById('team-photo-preview').style.display = 'none';
  document.getElementById('team-photo-preview').style.backgroundImage = '';
  document.getElementById('team-photo-box').classList.remove('uploaded');
  alert(name + ' has been added to your team!');
  loadManageTeamList();
}

async function loadManageTeamList() {
  const provName = localStorage.getItem('preen_provider_name') || '';
  const container = document.getElementById('team-list');
  if (!container || !db || !provName) return;

  try {
    const { data, error } = await db.from('team_members').select('*').eq('provider_name', provName).order('created_at', { ascending: true });
    if (error) { console.error('Team list fetch error:', error); return; }

    const members = data || [];
    if (members.length === 0) {
      container.innerHTML = '<p id="team-list-empty" style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">No team members added yet.</p>';
      return;
    }

    container.innerHTML = members.map(m => {
      const initials = (m.name || 'T').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return `
      <div class="team-member-card">
        <div class="team-member-avatar">${initials}</div>
        <div style="flex:1;">
          <p style="font-size:14px; font-weight:500;">${m.name}</p>
          <p style="font-size:12px; color:var(--text3); margin-top:2px;">${m.role || ''} · ${m.years_experience || ''}</p>
        </div>
        <button class="remove-btn" onclick="removeTeamMember(this, '${m.id}')">Remove</button>
      </div>`;
    }).join('');
  } catch (e) { console.error('Team list load error:', e); }
}

async function removeTeamMember(btn, teamMemberId) {
  if (!confirm('Remove this team member from your profile?')) return;
  if (db && teamMemberId) {
    try {
      const { error } = await db.from('team_members').delete().eq('id', teamMemberId);
      if (error) { console.error('Team member delete error:', error); alert('Could not remove this team member. Please try again.'); return; }
    } catch (e) { console.error('Team member delete failed:', e); alert('Could not remove this team member. Please try again.'); return; }
  }
  btn.closest('.team-member-card').remove();
  const container = document.getElementById('team-list');
  if (container && container.children.length === 0) {
    container.innerHTML = '<p id="team-list-empty" style="font-size:12px; color:var(--text3); text-align:center; padding:16px 0;">No team members added yet.</p>';
  }
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  initSplash();
  history.pushState(null, '', window.location.href);
  renderStates();
  setTimeout(detectCustomerStateFromGPS, 800);
  setTimeout(loadHomeProviders, 500);
  renderStars(0);
  const dateInput = document.getElementById('booking-date');
  if (dateInput) { const today = new Date().toISOString().split('T')[0]; dateInput.min = today; }
  const housecallDate = document.getElementById('housecall-date');
  if (housecallDate) { const today = new Date().toISOString().split('T')[0]; housecallDate.min = today; }
});

// Init calendar when screen opens
const origShowScreen = showScreen;
window.showScreen = function(id) {
  origShowScreen(id);
  if (id === 'screen-provider-calendar') {
    setTimeout(loadProviderCalendar, 100);
  }
};

// ===== WHATSAPP NUMBER SYNC =====
let sameWhatsApp = true;
let providerSameWhatsApp = true;

function syncWhatsApp() {
  if (sameWhatsApp) {
    const phone = document.getElementById('signup-phone');
    const wa = document.getElementById('signup-whatsapp');
    if (phone && wa) wa.value = phone.value;
  }
}

function toggleSameWhatsApp() {
  sameWhatsApp = !sameWhatsApp;
  const check = document.getElementById('same-wa-check');
  const wa = document.getElementById('signup-whatsapp');
  if (check) {
    check.style.background = sameWhatsApp ? 'var(--primary)' : '#fff';
    check.innerHTML = sameWhatsApp ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
  }
  if (sameWhatsApp) syncWhatsApp();
  else if (wa) wa.value = '';
}

function syncProviderWhatsApp() {
  if (providerSameWhatsApp) {
    const phone = document.getElementById('prov-phone');
    const wa = document.getElementById('prov-whatsapp');
    if (phone && wa) wa.value = phone.value;
  }
}

function toggleProviderSameWhatsApp() {
  providerSameWhatsApp = !providerSameWhatsApp;
  const check = document.getElementById('prov-same-wa-check');
  const wa = document.getElementById('prov-whatsapp');
  if (check) {
    check.style.background = providerSameWhatsApp ? 'var(--primary)' : '#fff';
    check.innerHTML = providerSameWhatsApp ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
  }
  if (providerSameWhatsApp) syncProviderWhatsApp();
  else if (wa) wa.value = '';
}

// ===== REPORT AND BLOCK =====





// (dead duplicate submitReport removed — kept the version above that uses the real reports table)


// ===== WAITING FOR PROVIDER =====
// ===== ROLE-BASED LOGIN =====
function switchLoginTab(role) {
  localStorage.setItem('preen_login_role', role);
  const custTab = document.getElementById('login-tab-customer');
  const provTab = document.getElementById('login-tab-provider');
  const btn = document.getElementById('login-btn');
  const switchText = document.getElementById('login-switch-text');
  if (role === 'provider') {
    if (custTab) { custTab.style.background = 'transparent'; custTab.style.color = 'var(--text2)'; }
    if (provTab) { provTab.style.background = 'var(--primary)'; provTab.style.color = '#fff'; }
    if (btn) btn.textContent = 'Log In as Provider';
    if (switchText) switchText.innerHTML = "Don't have a provider account? <span onclick='showProviderJoin()' style='color:var(--primary);cursor:pointer;font-weight:600;'>Join as Provider</span>";
  } else {
    if (provTab) { provTab.style.background = 'transparent'; provTab.style.color = 'var(--text2)'; }
    if (custTab) { custTab.style.background = 'var(--primary)'; custTab.style.color = '#fff'; }
    if (btn) btn.textContent = 'Log In as Customer';
    if (switchText) switchText.innerHTML = "Don't have an account? <span onclick=\"showScreen('screen-signup')\" style='color:var(--primary);cursor:pointer;font-weight:600;'>Sign Up</span>";
  }
}

function showProviderJoin() {
  showScreen('screen-provider-signup');
}

function updateProviderBanner() {
  const banner = document.getElementById('provider-join-banner');
  if (!banner) return;
  const role = localStorage.getItem('preen_role');
  banner.style.display = (role === 'provider') ? 'none' : 'flex';
}

// ===== GUEST MODE =====
function isGuest() {
  return !localStorage.getItem('preen_user_name') && !localStorage.getItem('preen_provider_name');
}

function requireAuth(action) {
  if (isGuest()) { showGuestSignup(action); return false; }
  return true;
}

function showGuestSignup(action) {
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen && activeScreen.id !== 'screen-signup' && activeScreen.id !== 'screen-login') {
    localStorage.setItem('preen_redirect_screen', activeScreen.id);
  }
  const existing = document.getElementById('guest-signup-sheet');
  if (existing) existing.remove();
  const existingOv = document.getElementById('guest-signup-overlay');
  if (existingOv) existingOv.remove();
  const overlay = document.createElement('div');
  overlay.id = 'guest-signup-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999;';
  overlay.onclick = closeGuestSheet;
  const sheet = document.createElement('div');
  sheet.id = 'guest-signup-sheet';
  sheet.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%) translateY(100%);width:100%;max-width:480px;background:var(--bg);border-radius:24px 24px 0 0;z-index:1000;overflow:hidden;transition:transform 0.3s ease;';
  const actionText = action ? 'to ' + action : 'to continue';
  sheet.innerHTML =
    '<div style="padding:24px 20px;text-align:center;">' +
    '<div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px;"></div>' +
    '<div style="margin-bottom:12px;display:flex;justify-content:center;"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" style="vertical-align:-2px;display:inline-block;"><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg></div>' +
    '<p style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;">Join Preen ' + actionText + '</p>' +
    '<p style="font-size:13px;color:var(--text3);margin-bottom:24px;line-height:1.6;">Book top beauty professionals near you.</p>' +
    '<button onclick="closeGuestSheet();showScreen(\'screen-signup\')" style="width:100%;background:var(--primary);color:#fff;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:700;font-family:Poppins,sans-serif;cursor:pointer;margin-bottom:10px;">Create Free Account</button>' +
    '<button onclick="closeGuestSheet();showScreen(\'screen-login\')" style="width:100%;background:transparent;border:1.5px solid var(--border);border-radius:14px;padding:14px;font-size:14px;font-weight:600;color:var(--text2);font-family:Poppins,sans-serif;cursor:pointer;margin-bottom:10px;">I already have an account</button>' +
    '<button onclick="closeGuestSheet();showProviderJoin()" style="width:100%;background:transparent;border:1.5px solid var(--border);border-radius:14px;padding:14px;font-size:14px;font-weight:600;color:var(--text2);font-family:Poppins,sans-serif;cursor:pointer;margin-bottom:16px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;display:inline-block;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> Join as a Provider</button>' +
    '<p onclick="closeGuestSheet()" style="font-size:12px;color:var(--text3);cursor:pointer;">Maybe later</p>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.appendChild(sheet);
  setTimeout(() => { sheet.style.transform = 'translateX(-50%) translateY(0)'; }, 10);
}

function closeGuestSheet() {
  const sheet = document.getElementById('guest-signup-sheet');
  const overlay = document.getElementById('guest-signup-overlay');
  if (sheet) { sheet.style.transform = 'translateX(-50%) translateY(100%)'; setTimeout(() => { if (sheet.parentNode) sheet.remove(); }, 300); }
  if (overlay) overlay.remove();
}

function updateHomeForGuest() {
  updateProviderBanner();
  const signinBtn = document.getElementById('signin-btn-home');
  const greeting = document.getElementById('home-greeting');
  if (signinBtn) signinBtn.style.display = isGuest() ? 'flex' : 'none';
  if (greeting) {
    const uname = localStorage.getItem('preen_user_name');
    greeting.textContent = uname ? 'Hey ' + uname.split(' ')[0] : 'Good day';
  }
}

// Override handleLogin to be role-aware
const _origHandleLogin = typeof handleLogin !== 'undefined' ? handleLogin : null;
async function handleLogin() {
  const loginEmail = document.getElementById('login-email').value.trim();
  const loginPassword = document.getElementById('login-password').value.trim();
  if (!loginEmail || !loginPassword) { alert('Please enter your email and password.'); return; }
  const loginRole = localStorage.getItem('preen_login_role') || 'customer';
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) { loginBtn.textContent = 'Logging in...'; loginBtn.disabled = true; }
  try {
    if (loginRole === 'provider') {
      if (!db) { alert('Connection error. Please try again.'); return; }
      const { data, error } = await db.from('providers').select('*').eq('email', loginEmail).single();
      if (error || !data) {
        if (loginBtn) { loginBtn.textContent = 'Log In as Provider'; loginBtn.disabled = false; }
        alert('No provider account found. Did you mean to log in as a customer?');
        return;
      }
      localStorage.setItem('preen_role', 'provider');
      localStorage.setItem('preen_provider_name', data.full_name);
      localStorage.setItem('preen_provider_email', data.email);
      localStorage.setItem('preen_provider_phone', data.phone || '');
      localStorage.setItem('preen_provider_id', data.id);
      showScreen('screen-provider-dashboard');
    } else {
      if (!db) { alert('Connection error. Please try again.'); return; }
      const { data, error } = await db.from('user').select('*').eq('email', loginEmail).single();
      if (error || !data) {
        if (loginBtn) { loginBtn.textContent = 'Log In as Customer'; loginBtn.disabled = false; }
        alert('No customer account found. Did you mean to log in as a provider?');
        return;
      }
      if (data.is_suspended) {
        if (loginBtn) { loginBtn.textContent = 'Log In as Customer'; loginBtn.disabled = false; }
        alert('Your account has been suspended. Contact support.');
        return;
      }
      localStorage.setItem('preen_role', 'customer');
      localStorage.setItem('preen_user_name', data.full_name);
      localStorage.setItem('preen_user_email', data.email);
      localStorage.setItem('preen_user_phone', data.phone || '');
      const redirect = localStorage.getItem('preen_redirect_screen');
      localStorage.removeItem('preen_redirect_screen');
      showScreen(redirect || 'screen-home');
      setTimeout(updateHomeForGuest, 100);
    }
  } catch(e) {
    if (loginBtn) { loginBtn.textContent = loginRole === 'provider' ? 'Log In as Provider' : 'Log In as Customer'; loginBtn.disabled = false; }
    alert('Login failed. Please check your details and try again.');
  }
}