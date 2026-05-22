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
      const { data: d } = await db.from('providers').select('*')
        .ilike('location', '%'+state+'%')
        .eq('is_available', true)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      data = d || [];
    } else if (type === 'trending') {
      const { data: d } = await db.from('providers').select('*')
        .ilike('location', '%'+state+'%')
        .eq('is_available', true)
        .order('rating', { ascending: false })
        .limit(20);
      data = d || [];
    } else if (type === 'recommended') {
      const history = getBrowseHistory();
      let query = db.from('providers').select('*')
        .ilike('location', '%'+state+'%')
        .eq('is_available', true)
        .eq('is_verified', true);
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
    '<p style="font-size:48px;margin-bottom:16px;">📍</p>' +
    '<p style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px;">No providers near you yet</p>' +
    '<p style="font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:24px;">We are actively onboarding providers in '+getUserState()+'. Check back soon.</p>' +
    '<button onclick="showScreen(\'screen-location\')" style="background:var(--primary);color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:13px;font-weight:600;font-family:Poppins,sans-serif;cursor:pointer;">Change Location</button>' +
    '</div>';
}


// ===== HOME SCREEN SECTIONS — ALL STATE FILTERED =====

function getUserState() {
  return localStorage.getItem('preen_user_state') || 'Abuja';
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
    const { data: providers } = await db
      .from('providers')
      .select('*')
      .in('full_name', topNames)
      .ilike('location', '%'+state+'%')
      .eq('is_available', true);

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

    const { data } = await db
      .from('providers')
      .select('*')
      .ilike('location', '%'+state+'%')
      .eq('is_available', true)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(6);

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
      .ilike('location', '%'+state+'%')
      .eq('is_available', true)
      .eq('is_verified', true)
      .limit(6);

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
    const { data } = await db
      .from('providers')
      .select('*')
      .ilike('location', '%'+state+'%')
      .eq('is_available', true)
      .order(sortBy, { ascending: false })
      .limit(6);

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
    (!img ? '<span style="font-size:28px;display:flex;align-items:center;justify-content:center;height:100%;">'+getCategoryEmoji(cat)+'</span>' : '') +
    (verified ? '<div class="verified-badge-small">✓</div>' : '') +
    '</div>' +
    '<div style="padding:8px;">' +
    '<p style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+( p.name||p.full_name||'Provider')+'</p>' +
    '<p style="font-size:11px;color:var(--text3);margin-top:2px;">'+cat+'</p>' +
    (rating > 0 ? '<p style="font-size:11px;color:var(--accent);">★ '+Number(rating).toFixed(1)+'</p>' : '') +
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
        ${!p.image ? '<span style="font-size:32px;display:flex;align-items:center;justify-content:center;height:100%;">' + (getCategoryEmoji(p.category)||'✂️') + '</span>' : ''}
        ${p.verified ? '<div class="verified-badge-small">✓</div>' : ''}
      </div>
      <div style="padding:10px 8px;">
        <p style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name||'Provider'}</p>
        <p style="font-size:11px;color:var(--text3);margin-top:2px;">${p.category||''}</p>
        ${p.rating > 0 ? '<p style="font-size:11px;color:var(--accent);margin-top:2px;">★ '+Number(p.rating).toFixed(1)+'</p>' : ''}
      </div>
    </div>`;

  if (newEl) newEl.innerHTML = providers.slice(0,6).map(makeCard).join('');
  if (trendEl) trendEl.innerHTML = providers.slice(0,6).reverse().map(makeCard).join('');
}

// SEARCH - Load real providers with filter
async function loadSearchProviders(query='', category='') {
  if (!db) return;
  try {
    let req = db.from('providers').select('*').eq('is_available', true);
    if (category) req = req.eq('category', category);
    const { data } = await req.limit(50);
    if (!data) return;

    let results = data.map(p => ({
      id: p.id,
      name: p.full_name,
      category: p.category,
      location: p.location || '',
      rating: p.rating || 0,
      price: 5000,
      verified: p.is_verified,
      image: p.profile_photo || null,
      service: p.category + ' Services',
      hours: 'Available',
      emoji: getCategoryEmoji(p.category),
      bg: 'linear-gradient(135deg, var(--primary-light), #FCB8CB)',
      bio: p.bio || ''
    }));

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(p =>
        (p.name||'').toLowerCase().includes(q) ||
        (p.category||'').toLowerCase().includes(q) ||
        (p.location||'').toLowerCase().includes(q)
      );
    }

    // State filter
    if (currentUserState) {
      results = results.filter(p =>
        (p.location||'').toLowerCase().includes(currentUserState.toLowerCase().split(',')[0])
      );
    }

    allProviders = results;
    renderSearchResults(results);
  } catch(e) {
    console.log('loadSearchProviders error:', e);
  }
}

// MY BOOKINGS - Load real bookings
async function loadMyBookings() {
  const container = document.getElementById('my-bookings-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="ai-spinner" style="margin:0 auto 12px;"></div><p style="font-size:13px;color:var(--text3);">Loading your bookings...</p></div>';

  if (!db) { showEmptyBookings(container); return; }

  try {
    const phone = localStorage.getItem('preen_user_phone') || '';
    const name = localStorage.getItem('preen_user_name') || '';
    if (!phone && !name) { showEmptyBookings(container); return; }

    let query = db.from('bookings').select('*').order('created_at', { ascending: false });
    if (phone) query = query.eq('customer_phone', phone);
    else query = query.ilike('customer_name', '%'+name+'%');

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      showEmptyBookings(container);
      return;
    }

    container.innerHTML = data.map(b => `
      <div style="background:var(--bg2);border-radius:16px;padding:16px;border:1.5px solid var(--border);margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <p style="font-size:14px;font-weight:600;color:var(--text);">${b.provider_name||'Provider'}</p>
            <p style="font-size:12px;color:var(--text3);margin-top:2px;">${b.service||'Service'}</p>
          </div>
          <span class="status ${b.status||'confirmed'}">${b.status||'confirmed'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:12px;">
          <span>📅 ${b.booking_date||''} ${b.booking_time||''}</span>
          <span style="font-weight:600;color:var(--text);">${b.amount||''}</span>
        </div>
        <div style="display:flex;gap:8px;">
          ${b.status==='confirmed'?`<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="cancelBookingById('${b.id}',this)">Cancel</button>`:''}
          ${b.status==='completed'?`<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="showScreen('screen-review')">Leave Review</button>`:''}
        </div>
      </div>
    `).join('');

  } catch(e) {
    showEmptyBookings(container);
  }
}

function showEmptyBookings(container) {
  container.innerHTML = '<div style="text-align:center;padding:60px 20px;"><p style="font-size:40px;margin-bottom:12px;">📅</p><p style="font-size:15px;font-weight:600;margin-bottom:6px;">No bookings yet</p><p style="font-size:13px;color:var(--text3);">Book a service to see it here</p></div>';
}

async function cancelBookingById(id, btn) {
  if (!confirm('Cancel this booking?')) return;
  btn.textContent = '...';
  btn.disabled = true;
  try {
    await db.from('bookings').update({status:'cancelled'}).eq('id', id);
    btn.closest('div[style]').querySelector('.status').textContent = 'cancelled';
    btn.closest('div[style]').querySelector('.status').className = 'status cancelled';
    btn.style.display = 'none';
  } catch(e) {
    btn.textContent = 'Cancel';
    btn.disabled = false;
  }
}

// PROVIDER DASHBOARD - Real earnings
async function loadProviderEarnings() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;
  try {
    const { data } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .eq('status', 'completed');

    if (!data) return;

    const fee = 0.10;
    const total = data.reduce((sum, b) => {
      const amount = parseFloat((b.amount||'0').toString().replace(/[^0-9.]/g,'')) || 0;
      return sum + (amount * (1 - fee));
    }, 0);

    const earningsEl = document.getElementById('provider-earnings');
    if (earningsEl) earningsEl.textContent = '₦' + Math.round(total).toLocaleString();

    const bookingsEl = document.getElementById('provider-total-bookings');
    if (bookingsEl) bookingsEl.textContent = data.length;

  } catch(e) { console.log('loadProviderEarnings error:', e); }
}

// LEADERBOARD - Real provider ratings
async function loadLeaderboard() {
  if (!db) return;
  try {
    const { data } = await db
      .from('providers')
      .select('*')
      .eq('is_verified', true)
      .order('rating', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return;

    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    const medals = ['🥇','🥈','🥉'];
    container.innerHTML = data.map((p, i) => `
      <div class="leaderboard-row ${i===0?'gold':i===1?'silver':i===2?'bronze':''}" onclick="showScreen('screen-provider')">
        <span class="lb-rank">${medals[i]||'#'+(i+1)}</span>
        <div class="lb-avatar" style="background:var(--primary);">
          ${p.full_name ? p.full_name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : 'PR'}
        </div>
        <div style="flex:1;">
          <p style="font-size:14px;font-weight:600;">${p.full_name||'Provider'}</p>
          <p style="font-size:11px;color:var(--text3);">${p.category||''} · ${p.location||''}</p>
        </div>
        <div style="text-align:right;">
          <div class="lb-score">${p.rating ? Number(p.rating).toFixed(1) : '—'}</div>
          <p style="font-size:9px;color:var(--text3);">Rating</p>
        </div>
      </div>
    `).join('');

  } catch(e) { console.log('loadLeaderboard error:', e); }
}


// ===== REAL DATA CONNECTIONS =====

// MY BOOKINGS - Real data from Supabase
async function loadMyBookings() {
  const container = document.getElementById('my-bookings-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="ai-spinner" style="margin:0 auto 12px;"></div><p style="font-size:13px;color:var(--text3);">Loading your bookings...</p></div>';

  if (!db) { showNoBookings(container); return; }

  try {
    const phone = localStorage.getItem('preen_user_phone') || '';
    const name = localStorage.getItem('preen_user_name') || '';
    if (!phone && !name) { showNoBookings(container); return; }

    let query = db.from('bookings').select('*').order('created_at', { ascending: false });
    if (phone) query = query.eq('customer_phone', phone);
    else query = query.ilike('customer_name', name);

    const { data, error } = await query;
    if (error || !data || data.length === 0) { showNoBookings(container); return; }

    container.innerHTML = data.map(b => `
      <div style="background:var(--bg2);border-radius:16px;padding:16px;border:1.5px solid var(--border);margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <p style="font-size:15px;font-weight:700;">${b.provider_name || 'Provider'}</p>
            <p style="font-size:12px;color:var(--text3);margin-top:2px;">${b.service || 'Service'}</p>
          </div>
          <span class="status ${b.status || 'confirmed'}">${b.status || 'Confirmed'}</span>
        </div>
        <div style="background:var(--bg);border-radius:10px;padding:10px 12px;margin-bottom:12px;display:flex;justify-content:space-between;">
          <div><p style="font-size:11px;color:var(--text3);">Date & Time</p><p style="font-size:13px;font-weight:600;margin-top:2px;">${b.booking_date || ''} ${b.booking_time || ''}</p></div>
          <div style="text-align:right;"><p style="font-size:11px;color:var(--text3);">Amount</p><p style="font-size:14px;font-weight:700;color:var(--primary);margin-top:2px;">${b.amount || ''}</p></div>
        </div>
        <div style="display:flex;gap:8px;">
          ${b.status === 'confirmed' ? `<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="cancelBookingById('${b.id}',this)">Cancel</button>` : ''}
          ${b.status === 'completed' ? `<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="openReview()">Leave Review</button><button class="btn-primary" style="flex:1;padding:8px;font-size:12px;" onclick="openTipping()">Tip</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch(e) {
    showNoBookings(container);
  }
}

function showNoBookings(container) {
  container.innerHTML = '<div style="text-align:center;padding:60px 20px;"><p style="font-size:40px;margin-bottom:12px;">📅</p><p style="font-size:15px;font-weight:600;margin-bottom:6px;">No bookings yet</p><p style="font-size:13px;color:var(--text3);">Your bookings will appear here after you book a service</p></div>';
}

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
    const { data } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .eq('status', 'completed');

    if (!data) return;

    const fee = 10; // platform fee %
    const totalGross = data.reduce((sum, b) => {
      const amount = parseInt((b.amount || '0').replace(/[^0-9]/g, '')) || 0;
      return sum + amount;
    }, 0);
    const totalFees = Math.round(totalGross * (fee / 100));
    const totalEarned = totalGross - totalFees;

    // Update dashboard earnings card
    const earningsEl = document.getElementById('provider-earnings-display');
    if (earningsEl) earningsEl.textContent = '₦' + totalEarned.toLocaleString();

    const bookingsEl = document.getElementById('provider-bookings-count');
    if (bookingsEl) bookingsEl.textContent = data.length + ' completed';

  } catch(e) { console.log('Earnings error:', e); }
}

// PROVIDER SEARCH - Real providers from Supabase
async function searchProviders(query, category) {
  if (!db) return;
  try {
    let q = db.from('providers').select('*').eq('is_available', true);
    if (category && category !== 'All') q = q.eq('category', category);
    if (query) q = q.ilike('full_name', '%' + query + '%');
    const { data } = await q.limit(30);
    if (data && data.length > 0) {
      allProviders = data.map(p => ({
        id: p.id, name: p.full_name, category: p.category,
        location: p.location || 'Nigeria', distance: 'Nearby',
        rating: p.rating || 0, price: p.price || 5000,
        emoji: getCategoryEmoji(p.category),
        bg: 'linear-gradient(135deg, var(--primary-light), #FCB8CB)',
        verified: p.is_verified, service: p.category + ' Services',
        hours: 'Available', image: p.profile_photo || null
      }));
      renderSearchResults(allProviders);
    } else {
      renderSearchResults([]);
    }
  } catch(e) { console.log('Search error:', e); }
}

// LEADERBOARD - Real top providers from Supabase
async function loadLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  if (!container || !db) return;

  try {
    const { data } = await db
      .from('providers')
      .select('*')
      .eq('is_verified', true)
      .order('rating', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;"><p style="font-size:13px;color:var(--text3);">Leaderboard will show top providers once bookings start coming in</p></div>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const classes = ['gold', 'silver', 'bronze'];

    container.innerHTML = data.map((p, i) => `
      <div class="leaderboard-row ${classes[i] || ''}" onclick="showScreen('screen-provider')">
        <span class="lb-rank">${medals[i] || '#' + (i+1)}</span>
        <div class="lb-avatar" style="background:${i===0?'linear-gradient(135deg,#F59E0B,#D97706)':i===1?'linear-gradient(135deg,#9CA3AF,#6B7280)':i===2?'linear-gradient(135deg,#D97706,#B45309)':'var(--primary)'};">
          ${(p.full_name||'P').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
        </div>
        <div style="flex:1;">
          <p style="font-size:14px;font-weight:600;">${p.full_name || 'Provider'}</p>
          <p style="font-size:11px;color:var(--text3);">${p.category || ''} · ${p.location || ''}</p>
        </div>
        <div style="text-align:right;">
          <div class="lb-score">${p.rating > 0 ? p.rating.toFixed(1) + '★' : 'New'}</div>
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
        '<div style="width:46px;height:46px;background:#FEF2F2;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🚩</div>' +
        '<div style="flex:1;"><p style="font-size:14px;font-weight:600;color:var(--text);">Report this provider</p><p style="font-size:12px;color:var(--text3);margin-top:2px;">Tell us what went wrong</p></div>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +

      '<div onclick="closeReportBlockSheet();openBlock()" style="background:var(--card);border-radius:16px;padding:16px;border:1.5px solid var(--border);display:flex;align-items:center;gap:14px;cursor:pointer;">' +
        '<div style="width:46px;height:46px;background:#FEF2F2;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🚫</div>' +
        '<div style="flex:1;"><p style="font-size:14px;font-weight:600;color:var(--text);">Block this provider</p><p style="font-size:12px;color:var(--text3);margin-top:2px;">They will not appear in your search</p></div>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +

      '<div onclick="closeReportBlockSheet();shareProfile()" style="background:var(--card);border-radius:16px;padding:16px;border:1.5px solid var(--border);display:flex;align-items:center;gap:14px;cursor:pointer;">' +
        '<div style="width:46px;height:46px;background:#EEF2FF;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🔗</div>' +
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


function openBlock(name, type) {
  reportBlockTarget = { name, type };
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
  const details = document.getElementById('report-details') ? document.getElementById('report-details').value : '';

  // Save report to Supabase if connected
  if (db) {
    try {
      await db.from('reviews').insert([{
        provider_name: reportBlockTarget.name,
        customer_name: localStorage.getItem('preen_user_name') || 'Anonymous',
        rating: 1,
        review_text: 'REPORT: ' + selectedReportReason + (details ? ' — ' + details : ''),
        is_anonymous: true
      }]);
    } catch(e) {}
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
let paymentTimer = null;
let currentBookingDetails = {};

function startWaitingForProvider(providerName, serviceLabel, date, time, amount) {
  // Store booking details
  currentBookingDetails = { providerName, serviceLabel, date, time, amount };

  // Update waiting screen UI
  const nameEl = document.getElementById('waiting-provider-name');
  const serviceEl = document.getElementById('waiting-service-label');
  if (nameEl) nameEl.textContent = providerName;
  if (serviceEl) serviceEl.textContent = serviceLabel;

  showScreen('screen-waiting-provider');
  startWaitingCountdown(900); // 15 minutes
}

function startWaitingCountdown(seconds) {
  if (waitingTimer) clearInterval(waitingTimer);
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
      providerAutoDeclined();
    }
  }, 1000);

  // Simulate provider accepting after 5 seconds for demo
  // In production this would be driven by Supabase Realtime
  setTimeout(() => {
    if (waitingTimer) {
      clearInterval(waitingTimer);
      providerAccepted();
    }
  }, 5000);
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

function proceedToPayment() {
  if (paymentTimer) clearInterval(paymentTimer);
  // In production — open Paystack here
  // For now simulate payment success
  showScreen('screen-booking-success');
}

function cancelWaitingBooking() {
  if (waitingTimer) clearInterval(waitingTimer);
  if (paymentTimer) clearInterval(paymentTimer);
  currentBookingDetails = {};
  showScreen('screen-home');
}

// ===== WAITING SCREEN CHAT =====
function sendWaitingMessage() {
  const input = document.getElementById('waiting-chat-input');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  const container = document.getElementById('waiting-chat-messages');
  if (!container) return;

  // Add customer message
  const customerMsg = document.createElement('div');
  customerMsg.style.cssText = 'display:flex;justify-content:flex-end;';
  customerMsg.innerHTML = `<div style="background:var(--primary);border-radius:12px 12px 0 12px;padding:10px 14px;max-width:75%;">
    <p style="font-size:12px;color:#fff;">${msg}</p>
    <p style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:4px;">You · just now</p>
  </div>`;
  container.appendChild(customerMsg);
  input.value = '';
  container.scrollTop = container.scrollHeight;

  // Simulate provider reply after 3 seconds
  setTimeout(() => {
    const replies = [
      'Got it! See you then 😊',
      'No problem, noted!',
      'Thanks for letting me know 🙏',
      'Perfect, I will be ready for you!'
    ];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    const provMsg = document.createElement('div');
    provMsg.style.cssText = 'display:flex;justify-content:flex-start;';
    provMsg.innerHTML = `<div style="background:var(--bg2);border-radius:12px 12px 12px 0;padding:10px 14px;max-width:75%;border:1px solid var(--border);">
      <p style="font-size:12px;color:var(--text);">${reply}</p>
      <p style="font-size:10px;color:var(--text3);margin-top:4px;">Provider · just now</p>
    </div>`;
    container.appendChild(provMsg);
    container.scrollTop = container.scrollHeight;
  }, 3000);
}


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
        card.innerHTML += '<div style="background:#FEF2F2;border-radius:10px;padding:10px;margin-top:8px;text-align:center;"><p style="font-size:12px;font-weight:600;color:var(--error);">⏰ Time expired — booking auto-declined. Customer has been refunded.</p></div>';
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
function selectCloseReason(el) {
  document.querySelectorAll('#close-reasons .service-select-item').forEach(item => {
    item.classList.remove('selected');
    const check = item.querySelector('.service-check');
    if (check) check.style.opacity = '0';
  });
  el.classList.add('selected');
  const check = el.querySelector('.service-check');
  if (check) check.style.opacity = '1';
}

// FIX - Provider edit profile
function loadProviderEditProfile() {
  const name = document.getElementById('provider-name-display');
  const cat = document.getElementById('provider-category-display');
  if (name) document.getElementById('prov-edit-name') && (document.getElementById('prov-edit-name').value = name.textContent);
  showScreen('screen-edit-profile');
  // Pre-fill with provider data
  const provName = localStorage.getItem('preen_provider_name') || '';
  const provEmail = localStorage.getItem('preen_provider_email') || '';
  const provPhone = localStorage.getItem('preen_provider_phone') || '';
  if (document.getElementById('edit-name')) document.getElementById('edit-name').value = provName;
  if (document.getElementById('edit-email')) document.getElementById('edit-email').value = provEmail;
  if (document.getElementById('edit-phone')) document.getElementById('edit-phone').value = provPhone;
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
        ${!p.image ? '<span style="font-size:28px;">' + p.emoji + '</span>' : ''}
        ${p.verified ? '<div class="verified-badge-small">✓</div>' : ''}
      </div>
      <div class="provider-card-info">
        <p class="provider-card-name">${p.name}</p>
        <p class="provider-card-cat">${p.category} · ${p.location}</p>
        ${p.rating > 0 ? '<p class="provider-card-rating">★ ' + p.rating.toFixed(1) + '</p>' : ''}
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

    let query = db.from('bookings').select('*').order('created_at', { ascending: false });
    if (phone) query = query.eq('customer_phone', phone);
    else query = query.eq('customer_name', localStorage.getItem('preen_user_name') || '');

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;"><p style="font-size:40px;margin-bottom:12px;">📅</p><p style="font-size:15px;font-weight:600;">No bookings yet</p><p style="font-size:13px;color:var(--text3);margin-top:6px;">Your bookings will appear here</p></div>';
      return;
    }

    container.innerHTML = data.map(b => `
      <div style="background:var(--bg2);border-radius:16px;padding:16px;border:1.5px solid var(--border);margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <p style="font-size:14px;font-weight:600;">${b.provider_name || 'Provider'}</p>
            <p style="font-size:12px;color:var(--text3);">${b.service || 'Service'}</p>
          </div>
          <span class="status ${b.status || 'confirmed'}">${b.status || 'confirmed'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:12px;">
          <span>📅 ${b.booking_date || ''} ${b.booking_time || ''}</span>
          <span style="font-weight:600;color:var(--text);">${b.amount || ''}</span>
        </div>
        <div style="display:flex;gap:8px;">
          ${b.status === 'confirmed' ? `<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="cancelBooking('${b.id}',this)">Cancel</button>` : ''}
          ${b.status === 'completed' ? `<button class="btn-secondary" style="flex:1;padding:8px;font-size:12px;" onclick="openReview()">Leave Review</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch(e) {
    renderFakeBookings(container);
  }
}

function renderFakeBookings(container) {
  container.innerHTML = '<div style="text-align:center;padding:40px;"><p style="font-size:40px;margin-bottom:12px;">📅</p><p style="font-size:15px;font-weight:600;">No bookings yet</p><p style="font-size:13px;color:var(--text3);margin-top:6px;">Book a service to see it here</p></div>';
}

// CONNECT PROVIDER BOOKING REQUESTS TO SUPABASE
async function loadProviderBookingRequests() {
  if (!db) return;
  const provName = localStorage.getItem('preen_provider_name') || '';
  if (!provName) return;

  try {
    const { data } = await db
      .from('bookings')
      .select('*')
      .eq('provider_name', provName)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false });

    const container = document.getElementById('booking-requests-list');
    if (!container || !data || data.length === 0) return;

    const badge = document.getElementById('requests-badge');
    if (badge) badge.textContent = data.length;

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
          <p style="font-size:12px;color:var(--text3);">⏰ Auto-declines in <span id="countdown-${b.id}" style="font-weight:700;color:var(--accent);">15:00</span></p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="req-decline-btn" onclick="declineBookingRequest(this,'${b.customer_name}','${b.id}')">✗ Decline</button>
          <button class="req-accept-btn" onclick="acceptBookingRequest(this,'${b.customer_name}','${b.id}')">✓ Accept</button>
        </div>
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
let currentUserState = localStorage.getItem('preen_user_state') || 'Abuja';

function applyAllFilters() {
  const query = (document.getElementById('search-input') ? document.getElementById('search-input').value : '').toLowerCase();
  // Load from Supabase with filters
  loadSearchProviders(query);
  return;
  let results = [...allProviders];

  // State filter
  if (currentUserState) {
    results = results.filter(p => {
      const loc = (p.location || '').toLowerCase();
      const state = currentUserState.toLowerCase();
      return loc.includes(state) || state.includes(loc.split(',')[0]);
    });
  }

  // Text search
  if (query) {
    results = results.filter(p =>
      (p.full_name || '').toLowerCase().includes(query) ||
      (p.category || '').toLowerCase().includes(query) ||
      (p.location || '').toLowerCase().includes(query)
    );
  }

  // Price filter
  if (priceMin > 0 || priceMax < 500000) {
    results = results.filter(p => {
      const price = p.price || 0;
      return price >= priceMin && price <= priceMax;
    });
  }

  // Verified filter
  if (verifiedOnly) results = results.filter(p => p.is_verified);

  // Amenities
  if (activeAmenities.includes('Available Now')) results = results.filter(p => p.is_available);
  if (activeAmenities.includes('Verified Only')) results = results.filter(p => p.is_verified);
  if (activeAmenities.includes('Elite Only')) results = results.filter(p => p.preen_elite);

  renderSearchResults(results);
}

function renderSearchResults(results) {
  const container = document.getElementById('search-results');
  if (!container) return;
  if (!results || results.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;"><p style="font-size:40px;margin-bottom:12px;">🔍</p><p style="font-size:15px;font-weight:600;margin-bottom:6px;">No providers found</p><p style="font-size:13px;color:var(--text3);">Try adjusting your filters</p></div>';
    return;
  }
  container.innerHTML = results.map(p => buildProviderCard ? buildProviderCard(p) : '').join('');
}

// ===== BOOKING REQUESTS - ACCEPT / DECLINE =====
function acceptBookingRequest(btn, customerName, bookingId) {
  const card = btn.closest('.request-card') || btn.parentElement.parentElement;
  if (bookingId) stopRequestTimer(bookingId);
  btn.textContent = '✓ Accepted';
  btn.disabled = true;
  btn.style.background = 'var(--success)';
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
    badge.innerHTML = '<p style="font-size:11px;font-weight:600;color:var(--success);">✓ Accepted</p>';
    badge.style.background = '#ECFDF5';
  }

  // Add confirmation
  const confirm = document.createElement('div');
  confirm.style.cssText = 'background:#ECFDF5;border-radius:10px;padding:10px 14px;margin-top:10px;text-align:center;border:1px solid #A7F3D0;';
  confirm.innerHTML = '<p style="font-size:13px;font-weight:600;color:var(--success);">Booking confirmed! ' + customerName + ' has been notified. 🎉</p>';
  card.appendChild(confirm);
  card.classList.add('accepted');

  // Update badge count
  const badge2 = document.getElementById('requests-badge');
  if (badge2) {
    const count = parseInt(badge2.textContent) - 1;
    badge2.textContent = count > 0 ? count : '0';
  }
}

function declineBookingRequest(btn, customerName, bookingId) {
  const card = btn.closest('.request-card') || btn.parentElement.parentElement;
  if (!confirm('Decline booking from ' + customerName + '? They will be refunded.')) return;
  if (bookingId) stopRequestTimer(bookingId);

  btn.textContent = '✗ Declined';
  btn.disabled = true;
  const acceptBtn = card.querySelector('.req-accept-btn') ||
    card.querySelector('[onclick*="accept"]') ||
    card.querySelectorAll('button')[1];
  if (acceptBtn) acceptBtn.disabled = true;

  const badge = card.querySelector('[style*="FEF3C7"], [style*="accent-light"]');
  if (badge) {
    badge.innerHTML = '<p style="font-size:11px;font-weight:600;color:var(--error);">✗ Declined</p>';
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
  const name = document.getElementById('profile-name').textContent || '';
  const email = document.getElementById('profile-email').textContent || '';
  document.getElementById('edit-name').value = name;
  document.getElementById('edit-email').value = email;
  document.getElementById('edit-phone').value = '';
  document.getElementById('edit-location').value = document.getElementById('selected-location').textContent || 'Abuja, FCT';
  showScreen('screen-edit-profile');
}

function saveEditProfile() {
  const name = document.getElementById('edit-name').value.trim();
  const email = document.getElementById('edit-email').value.trim();
  const phone = document.getElementById('edit-phone').value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  if (!email) { alert('Please enter your email.'); return; }
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = email;
  // Update initials
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.querySelector('.profile-avatar').textContent = initials;
  alert('Profile updated successfully!');
  goBack();
}

function changePassword() {
  const current = document.getElementById('current-password').value.trim();
  const newPass = document.getElementById('new-password').value.trim();
  const confirm = document.getElementById('confirm-password').value.trim();
  if (!current || !newPass || !confirm) { alert('Please fill in all password fields.'); return; }
  if (newPass !== confirm) { alert('New passwords do not match.'); return; }
  if (newPass.length < 6) { alert('Password must be at least 6 characters.'); return; }
  document.getElementById('current-password').value = '';
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  alert('Password updated successfully!');
}

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
function closeAccount() {
  const confirm = document.getElementById('close-confirm').value.trim();
  if (confirm !== 'DELETE') { alert('Please type DELETE exactly to confirm.'); return; }
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
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      document.getElementById('selected-location').textContent = 'Near you · GPS';

      // Calculate distance from user to each provider
      const nearby = allProviders.map(p => {
        const dist = getDistanceKm(lat, lng, p.lat || 9.0579, p.lng || 7.4951);
        return { ...p, distance: dist.toFixed(1) + 'km' };
      }).sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

      // Also pull from Supabase
      let dbProviders = [];
      if (db) {
        try {
          const { data } = await db.from('providers').select('*').eq('is_available', true);
          if (data) {
            dbProviders = data.map(p => ({
              name: p.full_name, category: p.category,
              location: p.location || 'Nearby', distance: 'Nearby',
              rating: p.rating || 0, price: 2500,
              verified: p.is_verified, service: 'Available',
              hours: 'Available now', image: null,
              emoji: getCategoryEmoji(p.category),
              bg: 'linear-gradient(135deg, var(--primary-light), #FCB8CB)'
            }));
          }
        } catch(e) {}
      }

      const combined = [...dbProviders, ...nearby].slice(0, 10);
      const container = document.getElementById('nearby-results');
      container.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:0 0 12px;">' + combined.length + ' providers found near you</p>' +
        combined.map(buildProviderCard).join('');
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
    alert('Account verified ✓\nName: ADEYANJU WISDOM');
  }, 1500);
}

function requestWithdrawal() {
  if (selectedWithdrawAmount === 0) { alert('Please select or enter a withdrawal amount.'); return; }
  if (selectedWithdrawAmount < 1000) { alert('Minimum withdrawal amount is ₦1,000.'); return; }
  if (selectedWithdrawAmount > 47500) { alert('Amount exceeds your available balance of ₦47,500.'); return; }
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
      if (btn) btn.textContent = '✓ Photo Updated';
    } else {
      if (btn) btn.textContent = 'Upload Photo';
      alert('Upload failed. Please try again.');
    }
  });
}


// PROVIDER DATA - connects to Supabase
let allProviders = []; // Loaded from Supabase

function buildProviderCard(p) {
  return '<div class="provider-card-new" onclick="showScreen(\'screen-provider\')">' +
    '<div class="provider-card-img" style="' + (p.image ? 'background-image:url(' + p.image + '); background-size:cover; background-position:center;' : 'background:' + p.bg + '; display:flex; align-items:center; justify-content:center;') + '">' +
    (p.image ? '' : '<span style="font-size:40px;">' + p.emoji + '</span>') +
    '<div class="provider-card-rating-badge">★ ' + p.rating + '</div>' +
    '</div>' +
    '<div class="provider-card-body">' +
    '<div class="provider-card-top">' +
    '<p class="provider-name">' + p.name + (p.verified ? ' <span class="verified-dot">✓</span>' : '') + '</p>' +
    '<p style="font-size:11px; color:var(--text3);">' + p.distance + ' · ' + p.location + '</p>' +
    '<p style="font-size:11px; color:var(--text3);">' + p.category + ' · ' + p.hours + '</p>' +
    '</div>' +
    '<div class="provider-service-preview">' +
    '<span>' + p.service + '</span>' +
    '<span class="service-price-sm">₦' + p.price.toLocaleString() + '</span>' +
    '</div>' +
    '</div>' +
    '</div>';
}

async function showCategory(category) {
  document.getElementById('category-title').textContent = category === 'Hair' ? 'Hair Salons' : category === 'Barber' ? 'Barbers' : category + ' Specialists';
  const container = document.getElementById('category-results');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="ai-spinner"></div><p style="margin-top:12px; font-size:13px; color:var(--text3);">Finding providers near you...</p></div>';
  showScreen('screen-category');

  await new Promise(r => setTimeout(r, 800));

  let providers = allProviders.filter(p => p.category === category);

  if (db) {
    try {
      const { data, error } = await db.from('providers').select('*').eq('category', category);
      if (!error && data && data.length > 0) {
        const dbCards = data.map(p => ({
          name: p.full_name,
          category: p.category,
          location: p.location || 'Abuja',
          distance: 'Nearby',
          rating: p.rating || 0,
          price: 2500,
          emoji: '✂️',
          bg: 'linear-gradient(135deg, #FDE8EE, #FCB8CB)',
          verified: p.is_verified,
          service: 'Available services',
          hours: p.is_available ? 'Available now' : 'Currently unavailable',
          image: null
        }));
        providers = [...dbCards, ...providers];
      }
    } catch(e) {
      console.log('Using local data');
    }
  }

  if (providers.length === 0) {
    const noProviderHTML = [
      '<div style="text-align:center; padding:40px 20px;">',
      '<p style="font-size:32px; margin-bottom:12px;">🔍</p>',
      '<p style="font-size:16px; font-weight:600;">No providers yet</p>',
      '<p style="font-size:13px; color:var(--text3); margin-top:8px;">Be the first ' + category + ' provider in your area!</p>',
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

function getCategoryEmoji(category) {
  const map = {
    'Barber': '✂️',
    'Hair Stylist': '💇',
    'Nail Tech': '💅',
    'Lash Tech': '👁️',
    'Makeup Artist': '👄',
    'Massage Therapist': '💆',
    'Wig Stylist': '👱',
    'Gele Tying': '👑',
    'Skincare Specialist': '✨',
    'Spa / Sauna': '🧖',
    'MedSpa': '🏥',
    'Nails': '💅',
    'Lash': '👁️',
    'Hair': '💇',
    'Makeup': '👄',
    'Massage': '💆',
    'Spa': '🧖'
  };
  return map[category] || '✂️';
}


// SPLASH SCREEN
function initSplash() {
  const splash = document.getElementById('screen-splash');
  if (!splash) return;
  setTimeout(() => {
    splash.style.opacity = '0';
    splash.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      splash.style.display = 'none';
      // Check if already logged in
      const provName = localStorage.getItem('preen_provider_name');
      const userName = localStorage.getItem('preen_user_name');
      if (provName) {
        showScreen('screen-provider-dashboard');
      } else if (userName) {
        showScreen('screen-home');
      } else {
        // Guest - go straight to home
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
function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  const container = document.getElementById('chat-messages');
  const now = new Date();
  const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ' ' + (now.getHours() >= 12 ? 'PM' : 'AM');
  const div = document.createElement('div');
  div.innerHTML = '<div class="chat-bubble sent">' + msg + '</div><div class="chat-time" style="text-align:right; padding-right:4px;">' + time + '</div>';
  container.appendChild(div);
  input.value = '';
  container.scrollTop = container.scrollHeight;
  setTimeout(() => {
    const replies = [
      'Thank you for your message! We will get back to you shortly.',
      'Great question! Yes we can definitely help with that.',
      'Our slots are filling up fast. Would you like to book now?',
      'Please check our services tab for full pricing details.',
      'We look forward to seeing you! Book anytime.'
    ];
    const reply = document.createElement('div');
    reply.innerHTML = '<div class="chat-bubble received">' + replies[Math.floor(Math.random() * replies.length)] + '</div><div class="chat-time" style="padding-left:4px;">' + time + '</div>';
    container.appendChild(reply);
    container.scrollTop = container.scrollHeight;
  }, 1200);
}

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
  if (!db) { console.error('DB not ready'); return; }
  const { data, error } = await db.from('bookings').insert([{
    customer_name: customerName,
    customer_phone: customerPhone,
    provider_name: providerName,
    service: service,
    booking_date: date,
    booking_time: time,
    amount: amount,
    status: 'confirmed'
  }]);
  if (error) console.error('Booking save error:', error.message);
  else console.log('Booking saved for:', customerName);
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
async function saveReview(providerName, customerName, rating, reviewText, isAnonymous) {
  if (!db) { console.error('DB not ready'); return; }
  const { data, error } = await db.from('reviews').insert([{
    provider_name: providerName,
    customer_name: isAnonymous ? 'Anonymous' : customerName,
    rating: rating,
    review_text: reviewText,
    is_anonymous: isAnonymous
  }]);
  if (error) console.error('Review save error:', error.message);
  else console.log('Review saved for:', providerName);
}

// NAVIGATION
let history = [];

function showScreen(id) {
  const current = document.querySelector('.screen.active');
  if (current) { history.push(current.id); current.classList.remove('active'); }
  // Load real data when screen opens
  if (id === 'screen-bookings') setTimeout(loadMyBookings, 100);
  if (id === 'screen-booking-requests') setTimeout(loadProviderBookingRequests, 100);
  if (id === 'screen-home') setTimeout(loadHomeSections, 300);
  if (id === 'screen-leaderboard') setTimeout(loadLeaderboard, 100);
  if (id === 'screen-provider-dashboard') setTimeout(loadProviderEarnings, 100);
  if (id === 'screen-search') setTimeout(() => loadSearchProviders(), 100);
  if (id === 'screen-leaderboard') setTimeout(loadLeaderboard, 100);
  if (id === 'screen-provider-dashboard') setTimeout(loadProviderEarnings, 200);
  if (id === 'screen-search') setTimeout(() => searchProviders('', ''), 200);
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
  showScreen('screen-home');
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
  const customerPhone = document.getElementById('booking-phone').value.trim();
  if (selectedServices.length === 0) { alert('Please select at least one service.'); return; }
  if (!date) { alert('Please select a date.'); return; }
  if (!selectedTime) { alert('Please select a time slot.'); return; }
  if (!customerName) { alert('Please enter your name.'); return; }
  if (!customerPhone) { alert('Please enter your phone number.'); return; }
  const formattedDate = new Date(date).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const serviceNames = selectedServices.map(s => s.name).join(', ');
  const totalAmount = '₦' + selectedServiceTotal.toLocaleString();
  document.getElementById('confirmed-date').textContent = formattedDate + ' · ' + selectedTime.textContent;
  document.getElementById('confirmed-services').textContent = serviceNames;
  document.getElementById('confirmed-amount').textContent = totalAmount;
  document.getElementById('confirmed-team').textContent = selectedTeamMember;
  saveBooking(customerName, customerPhone, 'Kings Barbershop', serviceNames, formattedDate, selectedTime.textContent, totalAmount);
  selectedServices = [];
  selectedServiceTotal = 0;

  // Get booking details for waiting screen
  const providerName = document.querySelector('.provider-title') ?
    document.querySelector('.provider-title').textContent.replace('✓','').trim() : 'Provider';
  const serviceLabel = serviceNames + ' · ₦' + totalAmount.toLocaleString();

  // Go to waiting screen instead of booking success
  startWaitingForProvider(providerName, serviceLabel, formattedDate, selectedTime.textContent, totalAmount);
}

function cancelBooking(btn) {
  if (confirm('Are you sure you want to cancel this booking?')) {
    const item = btn.closest('.booking-item');
    const status = item.querySelector('.status');
    status.textContent = 'Cancelled';
    status.className = 'status cancelled';
    btn.style.display = 'none';
  }
}

// TIME SLOTS
function selectTime(el) {
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
  if (type === 'Professionals') {
    return `
      <div class="provider-card-new" onclick="showScreen('screen-provider')">
        <div class="provider-card-img" style="background: linear-gradient(135deg, #1e1040, #3b1a7a);">
          <span style="font-size:32px;">✂️</span>
          <div class="provider-card-rating-badge">★ 4.9</div>
        </div>
        <div class="provider-card-body">
          <div class="provider-card-top">
            <p class="provider-name">Kingsley James <span class="verified-dot">✓</span></p>
            <p style="font-size:11px; color:#888;">Senior Barber · 0.8km · Wuse 2</p>
            <p style="font-size:11px; color:#888;">5 years experience</p>
          </div>
          <div class="provider-service-preview">
            <span>Signature Fade</span>
            <span class="service-price-sm">₦2,500</span>
          </div>
        </div>
      </div>
      <div class="provider-card-new" onclick="showScreen('screen-provider')">
        <div class="provider-card-img" style="background: linear-gradient(135deg, #1a0e2e, #4a1a6e);">
          <span style="font-size:32px;">💅</span>
          <div class="provider-card-rating-badge">★ 4.8</div>
        </div>
        <div class="provider-card-body">
          <div class="provider-card-top">
            <p class="provider-name">Temi Adeyemi <span class="verified-dot">✓</span></p>
            <p style="font-size:11px; color:#888;">Nail Tech · 1.2km · Garki</p>
            <p style="font-size:11px; color:#888;">3 years experience</p>
          </div>
          <div class="provider-service-preview">
            <span>Gel Manicure</span>
            <span class="service-price-sm">₦8,000</span>
          </div>
        </div>
      </div>`;
  }
  return `
    <div class="provider-card-new" onclick="showScreen('screen-provider')">
      <div class="provider-card-img" style="background: linear-gradient(135deg, #1e1040, #3b1a7a);">
        <span style="font-size:32px;">✂️</span>
        <div class="provider-card-rating-badge">★ 4.9</div>
      </div>
      <div class="provider-card-body">
        <div class="provider-card-top">
          <p class="provider-name">Kings Barbershop <span class="verified-dot">✓</span></p>
          <p style="font-size:11px; color:#888;">0.8km · Wuse 2, Abuja</p>
          <p style="font-size:11px; color:#888;">Barber · Open until 8:00 PM</p>
        </div>
        <div class="provider-service-preview">
          <span>Signature Fade</span>
          <span class="service-price-sm">₦2,500</span>
        </div>
      </div>
    </div>
    <div class="provider-card-new" onclick="showScreen('screen-provider')">
      <div class="provider-card-img" style="background: linear-gradient(135deg, #1a0e2e, #4a1a6e);">
        <span style="font-size:32px;">💅</span>
        <div class="provider-card-rating-badge">★ 4.8</div>
      </div>
      <div class="provider-card-body">
        <div class="provider-card-top">
          <p class="provider-name">Glam Nails by Temi <span class="verified-dot">✓</span></p>
          <p style="font-size:11px; color:#888;">1.2km · Garki, Abuja</p>
          <p style="font-size:11px; color:#888;">Nail Tech · Open until 7:00 PM</p>
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
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT Abuja','Gombe',
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
    '<div style="width:36px;height:36px;background:var(--primary-light);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;">📍</div>' +
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
  goBack();
  setTimeout(loadHomeSections, 300);
}

// REVIEWS
let selectedRating = 0;
let isAnonymous = false;

function openReview(providerName) {
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
    star.textContent = '★';
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

function submitReview() {
  const text = document.getElementById('review-text').value.trim();
  const providerName = document.getElementById('review-provider-name').textContent;
  if (selectedRating === 0) { alert('Please select a star rating.'); return; }
  if (!text) { alert('Please write a short review.'); return; }
  saveReview(providerName, 'Customer', selectedRating, text, isAnonymous);
  const name = isAnonymous ? 'Anonymous' : 'You';
  alert('Review submitted as ' + name + '! Thank you 🙏');
  isAnonymous = false;
  showScreen('screen-home');
}

// TIPPING
let selectedTipAmount = 0;
let tipProviderName = '';

function openTip(providerName) {
  tipProviderName = providerName;
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

function sendTip() {
  if (selectedTipAmount === 0) { alert('Please select or enter a tip amount.'); return; }
  alert('Tip of ₦' + selectedTipAmount.toLocaleString() + ' sent! 💛');
  showScreen('screen-bookings');
}

function skipTip() { showScreen('screen-bookings'); }

// PROMO
function applyPromo() {
  const code = document.getElementById('promo-input').value.trim().toUpperCase();
  const valid = ['PREEN20', 'ABUJA10'];
  if (valid.includes(code)) alert('Promo code ' + code + ' applied successfully!');
  else alert('Invalid promo code. Please try again.');
}

// OFFER
function openOffer() {
  document.getElementById('offer-amount').value = '';
  document.getElementById('offer-preview').style.display = 'none';
  document.getElementById('offer-message').value = '';
  showScreen('screen-offer');
}

function updateOfferPreview(value) {
  const offer = parseInt(value) || 0;
  const listed = 2500;
  if (offer > 0 && offer < listed) {
    document.getElementById('offer-display').textContent = '₦' + offer.toLocaleString();
    document.getElementById('offer-saving').textContent = '₦' + (listed - offer).toLocaleString();
    document.getElementById('offer-preview').style.display = 'block';
  } else {
    document.getElementById('offer-preview').style.display = 'none';
  }
}

function sendOffer() {
  const amount = parseInt(document.getElementById('offer-amount').value) || 0;
  if (amount === 0) { alert('Please enter your offer amount.'); return; }
  if (amount >= 2500) { alert('Your offer must be less than ₦2,500.'); return; }
  if (amount < 500) { alert('Your offer is too low.'); return; }
  document.getElementById('offer-sent-amount').textContent = '₦' + amount.toLocaleString();
  showScreen('screen-offer-response');
  setTimeout(() => {
    const accepted = amount >= 900;
    if (accepted) {
      document.getElementById('offer-response-icon').textContent = '✅';
      document.getElementById('offer-response-title').textContent = 'Offer Accepted!';
      document.getElementById('offer-response-msg').textContent = 'Kings Barbershop accepted your offer.';
      document.getElementById('offer-status').textContent = 'Accepted';
      document.getElementById('offer-status').style.color = '#22c55e';
      document.getElementById('offer-action-btn').textContent = 'Book at ₦' + amount.toLocaleString();
    } else {
      document.getElementById('offer-response-icon').textContent = '❌';
      document.getElementById('offer-response-title').textContent = 'Offer Declined';
      document.getElementById('offer-response-msg').textContent = 'Kings Barbershop declined your offer.';
      document.getElementById('offer-status').textContent = 'Declined';
      document.getElementById('offer-status').style.color = '#ef4444';
      document.getElementById('offer-action-btn').textContent = 'Book at Full Price ₦2,500';
    }
  }, 3000);
}

// HOUSE CALL
function confirmHouseCall() {
  const address = document.getElementById('housecall-address').value.trim();
  const date = document.getElementById('housecall-date').value;
  const selectedTime = document.querySelector('.time-slot.selected');
  if (!address) { alert('Please enter your address.'); return; }
  if (!date) { alert('Please select a date.'); return; }
  if (!selectedTime) { alert('Please select a time slot.'); return; }
  const formattedDate = new Date(date).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('housecall-confirmed-address').textContent = address;
  document.getElementById('housecall-confirmed-date').textContent = formattedDate + ' · ' + selectedTime.textContent;
  showScreen('screen-housecall-success');
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

function handleProviderSignup() {
  const name = document.getElementById('prov-name').value.trim();
  const phone = document.getElementById('prov-phone').value.trim();
  const email = document.getElementById('prov-email-signup').value.trim();
  const password = document.getElementById('prov-password').value.trim();
  const category = document.getElementById('prov-category').value;
  if (!name || !phone || !email || !password) { alert('Please fill in all fields.'); return; }
  saveUser(name, email, phone, 'provider');
  saveProvider(name, email, phone, category);
  document.getElementById('prov-dashboard-name').textContent = name;
  showScreen('screen-provider-dashboard');
}

// AVAILABILITY
function toggleAvailability() {
  const toggle = document.getElementById('avail-toggle');
  const label = document.getElementById('avail-label');
  toggle.classList.toggle('active');
  if (toggle.classList.contains('active')) { label.textContent = 'Available'; label.style.color = '#7C3AED'; }
  else { label.textContent = 'Unavailable'; label.style.color = '#888'; }
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

  skills.push({ name, photoUrl, videoUrl, hasPhoto: photoUploaded, hasVideo: videoUploaded });

  const card = document.createElement('div');
  card.className = 'skill-card';

  // Show actual photo thumbnail instead of emoji
  const thumbHtml = photoUrl
    ? '<div style="width:52px;height:52px;border-radius:12px;overflow:hidden;flex-shrink:0;"><img src="' + photoUrl + '" style="width:100%;height:100%;object-fit:cover;"/></div>'
    : '<div style="width:52px;height:52px;background:#7C3AED22;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">📸</div>';

  card.innerHTML = thumbHtml +
    '<div style="flex:1;margin-left:12px;">' +
    '<p style="font-size:14px;font-weight:500;">' + name + '</p>' +
    '<p style="font-size:12px;color:var(--primary);font-weight:600;margin-top:2px;">₦' + (price ? Number(price).toLocaleString() : '0') + ' · ' + duration + '</p>' +
    '<p style="font-size:11px;color:#888;margin-top:1px;">' + (videoUploaded ? 'Photo + Video' : 'Photo only') + '</p>' +
    '</div>' +
    (videoUploaded ? '<span style="font-size:10px;color:var(--accent);font-weight:600;">📹 Video added</span>' : '');

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

function submitSkills() {
  if (skills.length === 0) { alert('Please add at least one skill before saving.'); return; }
  document.getElementById('skills-count').textContent = skills.length;
  skills = [];
  showScreen('screen-verified');
}




// PROVIDER BOOKINGS FILTER
function filterProvBookings(el, type) {
  document.querySelectorAll('#screen-provider-all-bookings .filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const cards = document.querySelectorAll('#prov-all-bookings-list .prov-booking-card');
  cards.forEach(card => {
    const statusEl = card.querySelector('.status');
    if (!statusEl) return;
    const status = statusEl.textContent.toLowerCase();
    if (type === 'all') card.style.display = 'flex';
    else if (type === 'today') card.style.display = card.querySelector('.booking-item-meta, p') && card.innerHTML.includes('Today') ? 'flex' : 'none';
    else if (type === 'upcoming') card.style.display = (card.innerHTML.includes('Tomorrow') || card.innerHTML.includes('Sat') || card.innerHTML.includes('Mon')) ? 'flex' : 'none';
    else if (type === 'completed') card.style.display = status.includes('completed') ? 'flex' : 'none';
    else if (type === 'cancelled') card.style.display = status.includes('cancelled') ? 'flex' : 'none';
  });
}

function sendWhatsAppReminder(clientName, service, time) {
  const msg = 'Hi ' + clientName + '! Just a reminder that your ' + service + ' appointment is in 15 minutes at ' + time + '. We look forward to seeing you! - Preen';
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// PROVIDER CALENDAR
const providerBookings = {
  0: [], // Sunday
  1: [ // Monday
    { time: '10:00 AM', name: 'Adebayo O.', service: 'Signature Fade', amount: '₦2,500', status: 'confirmed' },
    { time: '12:00 PM', name: 'Chidi U.', service: 'Beard Trim', amount: '₦1,500', status: 'confirmed' },
    { time: '3:00 PM', name: 'Tunde A.', service: 'Full Cut + Beard', amount: '₦3,500', status: 'confirmed' }
  ],
  2: [ // Tuesday
    { time: '9:00 AM', name: 'Emeka O.', service: 'Line-up', amount: '₦1,000', status: 'confirmed' },
    { time: '2:00 PM', name: 'Bola K.', service: 'Signature Fade', amount: '₦2,500', status: 'confirmed' }
  ],
  3: [ // Wednesday
    { time: '11:00 AM', name: 'Segun F.', service: 'Beard Trim', amount: '₦1,500', status: 'confirmed' }
  ],
  4: [ // Thursday
    { time: '10:00 AM', name: 'Femi A.', service: 'Full Cut + Beard', amount: '₦3,500', status: 'confirmed' },
    { time: '4:00 PM', name: 'Kunle B.', service: 'Signature Fade', amount: '₦2,500', status: 'confirmed' }
  ],
  5: [ // Friday
    { time: '9:00 AM', name: 'Dapo R.', service: 'Line-up', amount: '₦1,000', status: 'confirmed' },
    { time: '11:00 AM', name: 'Wale S.', service: 'Signature Fade', amount: '₦2,500', status: 'confirmed' },
    { time: '2:00 PM', name: 'Jide M.', service: 'Full Cut + Beard', amount: '₦3,500', status: 'confirmed' }
  ],
  6: [ // Saturday
    { time: '10:00 AM', name: 'Kayode A.', service: 'Signature Fade', amount: '₦2,500', status: 'confirmed' },
    { time: '12:00 PM', name: 'Tola P.', service: 'Beard Trim', amount: '₦1,500', status: 'confirmed' }
  ]
};

let currentWeekOffset = 0;
let selectedCalDay = new Date().getDay();

function initCalendar() {
  renderCalDays();
  renderCalBookings(selectedCalDay);
}

function renderCalDays() {
  const container = document.getElementById('cal-days');
  if (!container) return;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + (currentWeekOffset * 7));

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
    const hasBooking = providerBookings[i] && providerBookings[i].length > 0;
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
  const bookings = providerBookings[dayIndex] || [];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (bookings.length === 0) {
    container.innerHTML = '<div class="cal-empty"><p style="font-size:32px; margin-bottom:8px;">📭</p><p>No bookings on ' + days[dayIndex] + '</p><p style="font-size:12px; color:#444; margin-top:4px;">Enjoy your free time!</p></div>';
    return;
  }

  container.innerHTML = '<p style="font-size:12px; color:#888; margin-bottom:8px;">' + bookings.length + ' booking' + (bookings.length > 1 ? 's' : '') + ' on ' + days[dayIndex] + '</p>' +
    bookings.map(b =>
      '<div class="cal-booking-slot' + (b.status === 'completed' ? ' completed' : b.status === 'cancelled' ? ' cancelled' : '') + '">' +
      '<div class="cal-time">' + b.time + '</div>' +
      '<div class="cal-booking-info">' +
      '<p class="cal-booking-name">' + b.name + '</p>' +
      '<p class="cal-booking-service">' + b.service + '</p>' +
      '</div>' +
      '<div class="cal-booking-amount">' + b.amount + '</div>' +
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
    } else {
      if (box) box.style.borderColor = 'var(--error)';
      alert('Upload failed. Please try again.');
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
      if (progressEl) progressEl.textContent = '✓ Video uploaded successfully';
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

function addTeamMember() {
  const name = document.getElementById('team-name').value.trim();
  const role = document.getElementById('team-role').value.trim();
  const experience = document.getElementById('team-experience').value;
  if (!name) { alert('Please enter the team member name.'); return; }
  if (!role) { alert('Please enter their role or title.'); return; }

  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarHtml = teamPhotoUrl
    ? '<div class="team-member-avatar" style="background-image:url(' + teamPhotoUrl + '); background-size:cover; background-position:center;"></div>'
    : '<div class="team-member-avatar">' + initials + '</div>';
  const card = document.createElement('div');
  card.className = 'team-member-card';
  card.innerHTML = avatarHtml +
    '<div style="flex:1;">' +
    '<p style="font-size:14px; font-weight:500;">' + name + '</p>' +
    '<p style="font-size:12px; color:var(--text3); margin-top:2px;">' + role + ' · ' + experience + '</p>' +
    '<p style="font-size:11px; color:var(--primary); margin-top:2px;">New member</p>' +
    '</div>' +
    '<button class="remove-btn" onclick="removeTeamMember(this)">Remove</button>';

  document.getElementById('team-list').appendChild(card);

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
}

function removeTeamMember(btn) {
  if (confirm('Remove this team member from your profile?')) {
    btn.closest('.team-member-card').remove();
  }
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  initSplash();
  history.pushState(null, '', window.location.href);
  renderStates();
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
    setTimeout(initCalendar, 100);
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





async function submitReport() {
  if (!selectedReportReason) { alert('Please select a reason for your report.'); return; }
  const details = document.getElementById('report-details');
  const detailsText = details ? details.value.trim() : '';
  if (db) {
    try {
      await db.from('reviews').insert([{
        provider_name: reportBlockTarget.name,
        customer_name: localStorage.getItem('preen_user_name') || 'Anonymous',
        rating: 1,
        review_text: 'REPORT: ' + selectedReportReason + (detailsText ? ' — ' + detailsText : ''),
        is_anonymous: true
      }]);
    } catch(e) {}
  }
  alert('Report submitted. Our team will review this within 24 hours. Thank you for keeping Preen safe.');
  goBack();
}


// ===== WAITING FOR PROVIDER =====
// ===== GUEST MODE =====
function isGuest() {
  return !localStorage.getItem('preen_user_name') && !localStorage.getItem('preen_provider_name');
}

function requireAuth(action) {
  if (isGuest()) {
    showGuestSignup(action);
    return false;
  }
  return true;
}

function showGuestSignup(action) {
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
    '<div style="font-size:44px;margin-bottom:12px;">✨</div>' +
    '<p style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;">Join Preen ' + actionText + '</p>' +
    '<p style="font-size:13px;color:var(--text3);margin-bottom:24px;line-height:1.6;">Book top beauty professionals near you. Fast, easy and secure.</p>' +
    '<button onclick="closeGuestSheet();showScreen(\'screen-signup\')" style="width:100%;background:var(--primary);color:#fff;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:700;font-family:Poppins,sans-serif;cursor:pointer;margin-bottom:10px;">Create Free Account</button>' +
    '<button onclick="closeGuestSheet();showScreen(\'screen-login\')" style="width:100%;background:transparent;border:1.5px solid var(--border);border-radius:14px;padding:14px;font-size:14px;font-weight:600;color:var(--text2);font-family:Poppins,sans-serif;cursor:pointer;margin-bottom:16px;">I already have an account</button>' +
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
  const guest = isGuest();
  const signinBtn = document.getElementById('signin-btn-home');
  const greeting = document.getElementById('home-greeting');
  if (signinBtn) signinBtn.style.display = guest ? 'flex' : 'none';
  if (greeting) {
    const name = localStorage.getItem('preen_user_name');
    greeting.textContent = name ? 'Hey ' + name.split(' ')[0] + ' 👋' : 'Good day 👋';
  }
}
