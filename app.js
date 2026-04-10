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
  const service = document.getElementById('booking-service').value;
  const customerName = document.getElementById('booking-name').value.trim();
  const customerPhone = document.getElementById('booking-phone').value.trim();
  if (!date) { alert('Please select a date.'); return; }
  if (!selectedTime) { alert('Please select a time slot.'); return; }
  if (!customerName) { alert('Please enter your name.'); return; }
  if (!customerPhone) { alert('Please enter your phone number.'); return; }
  const formattedDate = new Date(date).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('confirmed-date').textContent = formattedDate + ' · ' + selectedTime.textContent;
  saveBooking(customerName, customerPhone, 'Kings Barbershop', service, formattedDate, selectedTime.textContent, '₦2,500');
  showScreen('screen-booking-success');
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
  list.innerHTML = filtered.map(state => `<div class="state-item" onclick="selectState('${state}')">📍 ${state}</div>`).join('');
}

function filterStates(value) { renderStates(value); }

function selectState(state) {
  document.getElementById('selected-location').textContent = state;
  goBack();
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
    const accepted = amount >= 1800;
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
  if (!name) { alert('Please enter a skill name.'); return; }
  if (!photoUploaded) { alert('Please upload a photo of your work.'); return; }
  skills.push({ name, hasPhoto: photoUploaded, hasVideo: videoUploaded });
  const card = document.createElement('div');
  card.className = 'skill-card';
  card.innerHTML = '<div style="width:48px;height:48px;background:#7C3AED22;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">' + (videoUploaded ? '🎥' : '📸') + '</div><div style="flex:1"><p style="font-size:14px;font-weight:500;">' + name + '</p><p style="font-size:11px;color:#888;margin-top:2px;">' + (videoUploaded ? 'Photo + Video' : 'Photo only') + '</p></div>' + (videoUploaded ? '<span class="verified-tag">✓ Verified</span>' : '');
  document.getElementById('skill-list').appendChild(card);
  document.getElementById('skill-name').value = '';
  photoUploaded = false; videoUploaded = false;
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

// TEAM MANAGEMENT
let teamPhotoUploaded = false;

function simulateTeamPhotoUpload() {
  teamPhotoUploaded = true;
  document.getElementById('team-photo-placeholder').style.display = 'none';
  document.getElementById('team-photo-preview').style.display = 'block';
  document.getElementById('team-photo-box').classList.add('uploaded');
}

function addTeamMember() {
  const name = document.getElementById('team-name').value.trim();
  const role = document.getElementById('team-role').value.trim();
  const experience = document.getElementById('team-experience').value;
  if (!name) { alert('Please enter the team member name.'); return; }
  if (!role) { alert('Please enter their role or title.'); return; }

  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const card = document.createElement('div');
  card.className = 'team-member-card';
  card.innerHTML = '<div class="team-member-avatar">' + initials + '</div>' +
    '<div style="flex:1;">' +
    '<p style="font-size:14px; font-weight:500;">' + name + '</p>' +
    '<p style="font-size:12px; color:#888; margin-top:2px;">' + role + ' · ' + experience + '</p>' +
    '<p style="font-size:11px; color:#F59E0B; margin-top:2px;">New member</p>' +
    '</div>' +
    '<button class="remove-btn" onclick="removeTeamMember(this)">Remove</button>';

  document.getElementById('team-list').appendChild(card);

  document.getElementById('team-name').value = '';
  document.getElementById('team-role').value = '';
  document.getElementById('team-experience').selectedIndex = 0;
  teamPhotoUploaded = false;
  document.getElementById('team-photo-placeholder').style.display = 'flex';
  document.getElementById('team-photo-preview').style.display = 'none';
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
  renderStates();
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