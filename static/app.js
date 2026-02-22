/**
 * Friction IDE — app.js
 * Multi-file (HTML/CSS/JS/Backend) + Config Panel + AI Agent + Responsive Mobile
 */

// ═══════════════════════════════════════════════════════
// 1. THREE.JS BACKGROUND
// ═══════════════════════════════════════════════════════
(function initThree() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || typeof THREE === 'undefined') return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 60;
    const count = 1400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [new THREE.Color(0x7c6fe0), new THREE.Color(0x34d4c8), new THREE.Color(0xa78bfa), new THREE.Color(0xffffff)];
    for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - .5) * 200; pos[i * 3 + 1] = (Math.random() - .5) * 200; pos[i * 3 + 2] = (Math.random() - .5) * 150;
        const c = palette[Math.floor(Math.random() * palette.length)];
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: .5, vertexColors: true, transparent: true, opacity: .7 });
    const stars = new THREE.Points(geo, mat);
    scene.add(stars);
    const rings = [];
    for (let i = 0; i < 5; i++) {
        const g = i % 2 === 0 ? new THREE.TorusGeometry(7 + Math.random() * 5, .07, 8, 64) : new THREE.IcosahedronGeometry(3 + Math.random() * 3, 0);
        const m = new THREE.MeshBasicMaterial({ color: [0x7c6fe0, 0x34d4c8, 0xa78bfa][i % 3], wireframe: true, transparent: true, opacity: .08 + Math.random() * .07 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set((Math.random() - .5) * 80, (Math.random() - .5) * 60, (Math.random() - .5) * 40 - 10);
        scene.add(mesh); rings.push({ mesh, speed: .001 + Math.random() * .003 });
    }
    let mx = 0, my = 0;
    document.addEventListener('mousemove', e => { mx = (e.clientX / window.innerWidth - .5) * .5; my = (e.clientY / window.innerHeight - .5) * .35; });
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    let t = 0;
    (function animate() {
        requestAnimationFrame(animate); t++;
        stars.rotation.y += .0003;
        camera.position.x += (mx * 8 - camera.position.x) * .03;
        camera.position.y += (-my * 6 - camera.position.y) * .03;
        camera.lookAt(scene.position);
        rings.forEach(r => { r.mesh.rotation.x += r.speed; r.mesh.rotation.y += r.speed * 1.3; });
        mat.opacity = .55 + Math.sin(t * .018) * .15;
        renderer.render(scene, camera);
    })();
})();

// ═══════════════════════════════════════════════════════
// 2. GSAP ENTRANCE
// ═══════════════════════════════════════════════════════
(function initAnimations() {
    if (typeof gsap === 'undefined') return;
    const ease = 'power3.out';
    gsap.from('.navbar', { y: -50, opacity: 0, duration: .7, ease, delay: .05 });
    gsap.from('.sidebar', { x: -40, opacity: 0, duration: .7, ease, delay: .2 });
    gsap.from('.panel--editor', { y: 30, opacity: 0, duration: .7, ease, delay: .35 });
    gsap.from('.panel--preview', { y: 30, opacity: 0, duration: .7, ease, delay: .5 });
    gsap.from('.chip', { x: -16, opacity: 0, duration: .35, stagger: .05, ease: 'power2.out', delay: .6 });
})();

// ═══════════════════════════════════════════════════════
// 3. STATE
// ═══════════════════════════════════════════════════════
let editorInstance = null;
let activeTab = 'html';
let files = { html: '', css: '', js: '', backend: '' };
let history = [];
let debounceTimer = null;
let isMobile = () => window.innerWidth <= 768;

// ═══════════════════════════════════════════════════════
// 4. DOM REFS
// ═══════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const promptInput = $('prompt-input');
const charCount = $('char-count');
const btnGenerate = $('btn-generate');
const btnDownload = $('btn-download');
const btnSaveFile = $('btn-save-file');
const btnClear = $('btn-clear');
const btnCopyCode = $('btn-copy-code');
const btnFormat = $('btn-format');
const btnRefresh = $('btn-refresh-preview');
const btnOpenTab = $('btn-open-tab');
const previewFrame = $('preview-frame');
const previewHolder = $('preview-placeholder');
const previewBadge = $('preview-badge');
const editorHolder = $('editor-placeholder');
const statusBar = $('status-bar');
const historyList = $('history-list');
const toast = $('toast');
const saveModal = $('save-modal');
const saveFilename = $('save-filename');
const folderPreview = $('folder-preview');
const modalCancel = $('modal-cancel');
const modalSave = $('modal-save');
const connStatus = $('conn-status');
const connLabel = connStatus?.querySelector('.conn-label');
const aiThinking = $('ai-thinking');
const fileTabs = document.querySelectorAll('.file-tab');

// ═══════════════════════════════════════════════════════
// 20. LOADING / STATUS / TOAST
// ═══════════════════════════════════════════════════════
function setLoading(on) {
    if (btnGenerate) btnGenerate.disabled = on;
    btnGenerate?.querySelector('.send-icon')?.classList.toggle('hidden', on);
    btnGenerate?.querySelector('.send-spinner')?.classList.toggle('hidden', !on);
    if (aiThinking) aiThinking.classList.toggle('hidden', !on);
}

// Config refs
const toggleConfig = $('toggle-config');
const configPanel = $('config-panel');
const dbSelect = $('db-select');
const customApiGroup = $('custom-api-group');
const customApiUrl = $('custom-api-url');
const guideSection = $('guide-section');
const guideDivider = $('guide-divider');
const guideContent = $('guide-content');
const backendSelect = $('backend-select');
const tabBackend = $('tab-backend');
const backendTabName = $('backend-tab-name');

// Mobile refs
const btnHamburger = $('btn-hamburger');
const sidebar = document.querySelector('.sidebar');
const backdrop = $('drawer-backdrop');
const mobileNav = $('mobile-nav');
const panelEditor = $('panel-editor');
const panelPreview = $('panel-preview');

// ═══════════════════════════════════════════════════════
// 5. CODEMIRROR INIT
// ═══════════════════════════════════════════════════════
const TAB_MODE = { html: 'htmlmixed', css: 'css', js: 'javascript', backend: 'python' };

function initEditor() {
    editorInstance = CodeMirror.fromTextArea($('code-editor'), {
        mode: 'htmlmixed', theme: 'dracula',
        lineNumbers: true, lineWrapping: false,
        autoCloseTags: true, autoCloseBrackets: true,
        tabSize: 2, indentWithTabs: false,
    });
    editorInstance.on('change', () => {
        files[activeTab] = editorInstance.getValue();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => updatePreview(), 700);
    });
}

// ═══════════════════════════════════════════════════════
// 6. FILE TABS
// ═══════════════════════════════════════════════════════
fileTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === activeTab) return;
        files[activeTab] = editorInstance.getValue();
        activeTab = target;
        fileTabs.forEach(t => t.classList.toggle('file-tab--active', t.dataset.tab === activeTab));
        editorInstance.setValue(files[activeTab] || '');
        const mode = backendSelect?.value === 'node' && activeTab === 'backend' ? 'javascript' : (TAB_MODE[activeTab] || 'htmlmixed');
        editorInstance.setOption('mode', mode);
        setTimeout(() => editorInstance.refresh(), 30);
    });
});

// ═══════════════════════════════════════════════════════
// 7. MOBILE — HAMBURGER DRAWER + BOTTOM NAV
// ═══════════════════════════════════════════════════════
let mobilePanel = 'prompt'; // 'prompt' | 'editor' | 'preview'

function openDrawer() {
    sidebar?.classList.add('drawer-open');
    backdrop?.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeDrawer() {
    sidebar?.classList.remove('drawer-open');
    backdrop?.classList.remove('active');
    document.body.style.overflow = '';
}

btnHamburger?.addEventListener('click', () => {
    if (sidebar?.classList.contains('drawer-open')) closeDrawer();
    else openDrawer();
});
backdrop?.addEventListener('click', closeDrawer);

// Bottom nav: Prompt opens drawer; Code/Preview switch panels
function switchMobilePanel(panel) {
    mobilePanel = panel;
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));

    if (panel === 'prompt') {
        openDrawer();
        // Don't change panel visibility
        return;
    }
    closeDrawer();

    // Show only relevant panel
    panelEditor?.classList.toggle('mobile-active', panel === 'editor');
    panelPreview?.classList.toggle('mobile-active', panel === 'preview');

    if (panel === 'editor') setTimeout(() => editorInstance?.refresh(), 50);
}

document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMobilePanel(btn.dataset.panel));
});

// Init mobile state
function initMobile() {
    if (isMobile()) {
        panelEditor?.classList.remove('mobile-active');
        panelPreview?.classList.remove('mobile-active');
        panelEditor?.classList.add('mobile-active');
        document.querySelector('[data-panel="editor"]')?.classList.remove('active');
        document.querySelector('[data-panel="prompt"]')?.classList.remove('active');
        document.querySelector('[data-panel="editor"]')?.classList.add('active');
        mobilePanel = 'editor';
    }
}
window.addEventListener('resize', () => {
    if (!isMobile()) closeDrawer();
});

// ═══════════════════════════════════════════════════════
// 8. CONFIG PANEL — collapsible
// ═══════════════════════════════════════════════════════
toggleConfig?.addEventListener('click', () => {
    const isOpen = configPanel.classList.toggle('open');
    toggleConfig.classList.toggle('open', isOpen);
});

document.querySelector('input[value="custom"]')?.addEventListener('change', function () {
    if (customApiGroup) customApiGroup.style.display = this.checked ? 'flex' : 'none';
});

// Backend tab visibility
backendSelect?.addEventListener('change', () => {
    const val = backendSelect.value;
    if (tabBackend) tabBackend.style.display = val ? '' : 'none';
    if (backendTabName) backendTabName.textContent = val === 'node' ? 'server.js' : 'server.py';
    refreshGuide();
});

// All config changes refresh guide
dbSelect?.addEventListener('change', refreshGuide);
document.querySelectorAll('#api-checkboxes input,#agent-checkboxes input').forEach(cb => cb.addEventListener('change', refreshGuide));

// ═══════════════════════════════════════════════════════
// 9. GUIDES DATA
// ═══════════════════════════════════════════════════════
const GUIDES = {
    firebase: {
        icon: '🔥', name: 'Firebase Realtime DB', badge: 'badge-free-limited', badgeText: 'Free Tier',
        steps: [
            { text: 'Go to <a href="https://console.firebase.google.com" target="_blank">console.firebase.google.com</a> → Create project.' },
            { text: 'Click <b>Realtime Database</b> → Create → Start in test mode.' },
            { text: 'Go to <b>Project Settings → General</b> → Register a web app.' },
            { text: 'Copy your config:', code: `const firebaseConfig={\n  apiKey:"YOUR_KEY",\n  databaseURL:"https://proj.firebaseio.com",\n  projectId:"proj"\n};` },
            { text: 'Paste into <b>script.js</b> at the marked section.' },
        ]
    },
    firestore: {
        icon: '☁️', name: 'Firestore', badge: 'badge-free-limited', badgeText: 'Free Tier',
        steps: [
            { text: 'Firebase Console → <b>Firestore Database</b> → Create.' },
            { text: 'Project Settings → Register web app → Copy <code>firebaseConfig</code>.' },
            { text: 'Paste into <b>script.js</b> at <code>// PASTE CONFIG HERE</code>.' },
        ]
    },
    supabase: {
        icon: '⚡', name: 'Supabase', badge: 'badge-free', badgeText: 'Free',
        steps: [
            { text: '<a href="https://supabase.com" target="_blank">supabase.com</a> → New Project.' },
            { text: '<b>Project Settings → API</b> → Copy Project URL + anon key.' },
            { text: 'Paste:', code: `createClient('https://ID.supabase.co','YOUR_ANON_KEY')` },
            { text: 'Create tables in Table Editor. Enable RLS for production.' },
        ]
    },
    localstorage: { icon: '💾', name: 'LocalStorage', badge: 'badge-free', badgeText: 'No Setup', steps: [{ text: 'No setup needed! Works in every browser.', code: `localStorage.setItem('k',JSON.stringify(data));\nJSON.parse(localStorage.getItem('k'));` }, { text: '⚠️ Data lost on cache clear.' }] },
    indexeddb: { icon: '🗃️', name: 'IndexedDB', badge: 'badge-free', badgeText: 'No Setup', steps: [{ text: 'No setup — built into all browsers. Works offline.' }, { text: 'Best for large local files and media.' }] },
    googlemaps: { icon: '🗺️', name: 'Google Maps', badge: 'badge-paid', badgeText: 'Pay-as-you-go', steps: [{ text: '<a href="https://console.cloud.google.com" target="_blank">Cloud Console</a> → Enable Maps JavaScript API.' }, { text: 'Credentials → Create API Key → restrict to your domain.' }, { text: 'Add to HTML:', code: `<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY"></script>` }] },
    openweather: { icon: '🌦️', name: 'OpenWeather', badge: 'badge-free', badgeText: 'Free', steps: [{ text: '<a href="https://openweathermap.org/api" target="_blank">openweathermap.org</a> → Sign up → copy API key (10min activation).' }, { text: 'Use:', code: `fetch('https://api.openweathermap.org/data/2.5/weather?q=City&appid=YOUR_KEY')` }] },
    stripe: { icon: '💳', name: 'Stripe', badge: 'badge-paid', badgeText: 'Fees Apply', steps: [{ text: '<a href="https://dashboard.stripe.com" target="_blank">dashboard.stripe.com</a> → Developers → API Keys.' }, { text: 'Use publishable key only in frontend:', code: `Stripe('pk_test_YOUR_KEY')` }, { text: '⚠️ Never put secret key in frontend!' }] },
    emailjs: { icon: '📧', name: 'EmailJS', badge: 'badge-free', badgeText: 'Free', steps: [{ text: '<a href="https://emailjs.com" target="_blank">emailjs.com</a> → Add Email Service → Create Template.' }, { text: 'Account → API Keys → copy Public Key.' }, { text: '', code: `emailjs.init('PUBLIC_KEY');\nemailjs.send('service_id','template_id',{name,message});` }] },
    openai: { icon: '🤖', name: 'OpenAI', badge: 'badge-paid', badgeText: 'Pay-as-you-go', steps: [{ text: '<a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a> → Create API Key.' }, { text: '⚠️ Never put key in frontend JS! Use a backend proxy.' }, { text: 'Add to .env on your server:', code: `OPENAI_API_KEY=sk-proj-YOUR_KEY` }] },
    youtube: { icon: '▶️', name: 'YouTube Data API', badge: 'badge-free', badgeText: 'Free', steps: [{ text: 'Cloud Console → Enable <b>YouTube Data API v3</b> → Create API Key.' }, { text: '', code: `fetch('https://www.googleapis.com/youtube/v3/search?key=YOUR_KEY&q=topic')` }] },
    unsplash: { icon: '🖼️', name: 'Unsplash', badge: 'badge-free', badgeText: 'Free', steps: [{ text: '<a href="https://unsplash.com/developers" target="_blank">unsplash.com/developers</a> → Create app → copy Access Key.' }, { text: '', code: `fetch('https://api.unsplash.com/photos/random?client_id=YOUR_KEY')` }] },
    custom: { icon: '🔧', name: 'Custom API', badge: 'badge-free', badgeText: 'Your API', steps: [{ text: 'Enter your API endpoint URL in the field above.' }, { text: 'The AI will generate a fetch() call with your endpoint.' }, { text: '', code: `const API_KEY='your_key';\nconst API_URL='https://your-api.com/endpoint';` }] },
    // ── Agents ──
    'gemini-agent': {
        icon: '⚡', name: 'Gemini Chatbot Widget', badge: 'badge-free-limited', badgeText: 'Free Tier',
        steps: [
            { text: 'Go to <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a> → Create API Key.' },
            { text: 'A floating chat bubble will be added to your website — users can ask it questions.' },
            { text: 'Paste your key in <b>script.js</b> at:', code: `const GEMINI_KEY = 'YOUR_GEMINI_API_KEY'; // aistudio.google.com` },
            { text: 'The chatbot calls Gemini 2.0 Flash API directly from the browser.' },
            { text: '⚠️ For production, proxy through a backend to protect your key.' },
        ]
    },
    'openai-agent': {
        icon: '🧠', name: 'OpenAI Chatbot Widget', badge: 'badge-paid', badgeText: 'Pay-as-you-go',
        steps: [
            { text: '<a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a> → Create API Key.' },
            { text: 'A floating chatbot bubble will appear on your site.' },
            { text: '⚠️ Key must be on a backend server — the AI will generate a Flask/Node proxy.' },
            { text: 'Run the generated <b>server.py</b> for the secure backend proxy.' },
        ]
    },
    n8n: {
        icon: '🔗', name: 'n8n Automation Webhook', badge: 'badge-free', badgeText: 'Self-hosted / Free',
        steps: [
            { text: '<a href="https://n8n.io" target="_blank">n8n.io</a> → Sign up or self-host.' },
            { text: 'Create a Workflow → Add <b>Webhook</b> trigger → copy the webhook URL.' },
            { text: 'Paste URL into <b>script.js</b> at:', code: `const N8N_WEBHOOK='https://your-n8n.com/webhook/your-id';` },
            { text: 'The website will POST data to n8n for automation (emails, Notion, Slack etc.).' },
        ]
    },
    webhook: {
        icon: '📡', name: 'Custom Webhook Agent', badge: 'badge-free', badgeText: 'Any URL',
        steps: [
            { text: 'Provide any webhook URL (Zapier, Make, n8n, your own server).' },
            { text: 'The site will POST JSON data to your webhook when triggered.' },
            { text: 'Replace the placeholder in script.js:', code: `const WEBHOOK_URL='https://your-webhook-url.com/hook';` },
        ]
    },
    flask: {
        icon: '🐍', name: 'Flask Backend (server.py)', badge: 'badge-free', badgeText: 'Python',
        steps: [
            { text: 'Make sure Python is installed: <code>python --version</code>' },
            { text: 'Install Flask:', code: `pip install flask flask-cors` },
            { text: 'Run the generated server:', code: `python server.py` },
            { text: 'Backend starts at <b>http://localhost:5000</b> — the frontend will connect to it.' },
            { text: 'Add your secret API keys in server.py (not in the frontend JS).' },
        ]
    },
    node: {
        icon: '🟢', name: 'Node.js Backend (server.js)', badge: 'badge-free', badgeText: 'Node.js',
        steps: [
            { text: 'Make sure Node.js is installed: <code>node --version</code>' },
            { text: 'Install dependencies:', code: `npm install express cors` },
            { text: 'Run the generated server:', code: `node server.js` },
            { text: 'Backend starts at <b>http://localhost:3000</b> — frontend connects to it.' },
            { text: 'Add your secret API keys in server.js environment variables.' },
        ]
    },
};

function renderGuideService(key) {
    const g = GUIDES[key];
    if (!g) return '';
    const stepsHTML = g.steps.map((s, i) => `
        <div class="guide-step">
          <div class="step-num">${i + 1}</div>
          <div class="step-text">${s.text}${s.code ? `<div class="guide-code">${s.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}</div>
        </div>`).join('');
    return `<div class="guide-service">
        <div class="guide-service-header">
          <span class="guide-service-icon">${g.icon}</span>
          <span class="guide-service-name">${g.name}</span>
          <span class="guide-service-badge ${g.badge}">${g.badgeText}</span>
        </div>
        <div class="guide-steps">${stepsHTML}</div>
      </div>`;
}

function refreshGuide() {
    const activeKeys = [];
    if (dbSelect?.value) activeKeys.push(dbSelect.value);
    document.querySelectorAll('#api-checkboxes input:checked').forEach(cb => activeKeys.push(cb.value));
    document.querySelectorAll('#agent-checkboxes input:checked').forEach(cb => activeKeys.push(cb.value));
    if (backendSelect?.value) activeKeys.push(backendSelect.value);

    if (!activeKeys.length) {
        if (guideSection) guideSection.style.display = 'none';
        if (guideDivider) guideDivider.style.display = 'none';
        return;
    }
    if (guideContent) guideContent.innerHTML = activeKeys.map(renderGuideService).join('');
    if (guideSection) guideSection.style.display = '';
    if (guideDivider) guideDivider.style.display = '';
}

// ═══════════════════════════════════════════════════════
// 10. BUILD CONFIG-AWARE PROMPT
// ═══════════════════════════════════════════════════════
function buildPrompt(userPrompt) {
    let extra = '';

    // Database
    const dbVal = dbSelect?.value;
    if (dbVal) {
        const dbNames = {
            firebase: 'Firebase Realtime Database (use Firebase 9 compat CDN)',
            firestore: 'Firestore (use Firebase + Firestore 9 compat CDN)',
            supabase: 'Supabase (use Supabase JS CDN, createClient)',
            localstorage: 'LocalStorage for data persistence (no CDN needed)',
            indexeddb: 'IndexedDB for offline-first storage',
        };
        extra += `\n\nDatabase: Use ${dbNames[dbVal]}. Add comment blocks "// PASTE YOUR CONFIG HERE" where user must add credentials.`;
    }

    // API services
    const apiNames = {
        googlemaps: 'Google Maps JavaScript API (add CDN script with "YOUR_GOOGLE_MAPS_API_KEY" placeholder)',
        openweather: 'OpenWeather API (use fetch, placeholder "YOUR_OPENWEATHER_KEY")',
        stripe: 'Stripe.js (CDN, placeholder "YOUR_STRIPE_PUBLISHABLE_KEY")',
        emailjs: 'EmailJS (CDN, placeholder "YOUR_EMAILJS_PUBLIC_KEY")',
        openai: 'OpenAI API (note: key should be server-side, add comment warning)',
        youtube: 'YouTube Data API v3 (placeholder "YOUR_YOUTUBE_API_KEY")',
        unsplash: 'Unsplash API (placeholder "YOUR_UNSPLASH_ACCESS_KEY")',
        custom: `Custom API at ${customApiUrl?.value || 'https://your-api.com'} (placeholder "YOUR_API_KEY")`,
    };
    const selectedApis = [...document.querySelectorAll('#api-checkboxes input:checked')].map(cb => cb.value);
    if (selectedApis.length) {
        extra += `\n\nAPI Integrations: ${selectedApis.map(k => apiNames[k]).filter(Boolean).join('; ')}. Add a clearly labeled comment block at top of script.js:\n// ── API KEYS — replace with your actual keys ──`;
    }

    // AI Agent
    const selectedAgents = [...document.querySelectorAll('#agent-checkboxes input:checked')].map(cb => cb.value);
    if (selectedAgents.includes('gemini-agent')) {
        extra += `\n\nAI Agent: Add a beautiful floating chat bubble widget (bottom-right corner) that connects to Google Gemini 2.0 Flash API directly. The widget must:
- Have a toggle button with a ⚡ icon  
- Show a modern chat window with smooth animations
- Use fetch() to call: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=GEMINI_KEY
- Store conversation context for multi-turn chat
- Handle loading states and errors gracefully
- Declare at top of script.js: const GEMINI_KEY = 'YOUR_GEMINI_API_KEY'; // Get from aistudio.google.com`;
    }
    if (selectedAgents.includes('openai-agent')) {
        extra += `\n\nAI Agent: Add a floating GPT chatbot widget (bottom-right). Widget fetches from /api/chat (backend proxy — add Flask/Node backend endpoint). Declare: const CHAT_ENDPOINT = '/api/chat';`;
    }
    if (selectedAgents.includes('n8n')) {
        extra += `\n\nAutomation: Integrate n8n webhook. Add a form or button that POSTs JSON data to: const N8N_WEBHOOK = 'YOUR_N8N_WEBHOOK_URL'; // paste from n8n workflow`;
    }
    if (selectedAgents.includes('webhook')) {
        extra += `\n\nWebhook: Add submit functionality that POSTs form data to: const WEBHOOK_URL = 'YOUR_WEBHOOK_URL';`;
    }

    // Backend
    const backendVal = backendSelect?.value;
    if (backendVal === 'flask') {
        extra += `\n\nBackend: Also generate a complete runnable Flask (Python) backend file. This will be placed in the "backend" key of your JSON response. The Flask server must:
- Use Flask + flask-cors  
- Have /api/chat endpoint (if AI agent selected) or relevant API proxy routes
- Load secret keys from environment variables
- Include CORS for localhost frontend
- Include if __name__ == '__main__': app.run(debug=True)
- Add comments showing where to put API keys`;
    }
    if (backendVal === 'node') {
        extra += `\n\nBackend: Also generate a complete runnable Node.js + Express backend file in the "backend" key. The Express server must:
- Use express + cors + dotenv  
- Have relevant API proxy routes  
- Load secret keys from process.env  
- Add comments showing where to put API keys
- Listen on port 3000`;
    }

    return userPrompt + extra;
}

// ═══════════════════════════════════════════════════════
// 11. HEALTH CHECK
// ═══════════════════════════════════════════════════════
async function checkConnection() {
    try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const data = await res.json();
        if (data.status === 'ok') {
            connStatus.className = data.api_key_set ? 'conn-pill connected' : 'conn-pill no-key';
            connLabel.textContent = data.api_key_set ? 'Connected' : 'No API Key';
            if (!data.api_key_set) showToast('Add GEMINI_API_KEY in .env and restart server', 'error');
        }
    } catch {
        connStatus.className = 'conn-pill disconnected';
        connLabel.textContent = 'Disconnected';
    }
}

// ═══════════════════════════════════════════════════════
// 12. CHAR COUNT + CHIPS
// ═══════════════════════════════════════════════════════
promptInput?.addEventListener('input', () => {
    const n = promptInput.value.length;
    if (charCount) { charCount.textContent = `${n} / 4000`; charCount.style.color = n > 3800 ? 'var(--c-red)' : ''; }
});

document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        promptInput.value = chip.dataset.prompt;
        promptInput.dispatchEvent(new Event('input'));
        promptInput.focus();
        if (isMobile()) closeDrawer();
    });
});

// ═══════════════════════════════════════════════════════
// 13. GENERATE
// ═══════════════════════════════════════════════════════
btnGenerate?.addEventListener('click', generate);
promptInput?.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') generate(); });

async function generate() {
    const userPrompt = promptInput.value.trim();
    if (!userPrompt) return showToast('Please enter a description!', 'error');

    setLoading(true);

    const hasBackend = !!backendSelect?.value;
    const prompt = buildPrompt(userPrompt); // This is the full prompt sent to the AI

    // On mobile, switch to editor panel
    if (isMobile()) {
        closeDrawer();
        switchMobilePanel('editor');
    }

    try {
        // Clear previous files
        files.html = ''; files.css = ''; files.js = ''; files.backend = '';

        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Generation failed');

        files.html = data.html || '';
        files.css = data.css || '';
        files.js = data.js || '';
        files.backend = data.backend || '';

        switchToTab('html');
        updatePreview();

        addHistory(userPrompt);

        const lines = (files.html + files.css + files.js + files.backend).split('\n').length;
        const fileCount = hasBackend ? '4 files' : '3 files';
        showStatus(`Done — ${lines} lines across ${fileCount}`, 'success');
        showToast('Website generated! ✨', 'success');
        if (previewBadge) { previewBadge.textContent = fileCount; previewBadge.style.display = ''; }

        if (typeof gsap !== 'undefined') {
            gsap.fromTo('#panel-editor',
                { boxShadow: '0 0 0 2px rgba(124,111,224,0.7)' },
                { boxShadow: '0 0 0 0px rgba(124,111,224,0)', duration: 1.2, ease: 'power2.out' });
        }
    } catch (err) {
        showStatus(`Error: ${err.message}`, 'error');
        showToast(err.message, 'error');
    } finally {
        setLoading(false);
    }
}

// ═══════════════════════════════════════════════════════
// 14. SWITCH TAB
// ═══════════════════════════════════════════════════════
function switchToTab(tab) {
    activeTab = tab;
    fileTabs.forEach(t => t.classList.toggle('file-tab--active', t.dataset.tab === tab));
    if (editorHolder) editorHolder.classList.add('hidden');
    editorInstance.setValue(files[tab] || '');
    const mode = backendSelect?.value === 'node' && tab === 'backend' ? 'javascript' : (TAB_MODE[tab] || 'htmlmixed');
    editorInstance.setOption('mode', mode);
    setTimeout(() => editorInstance.refresh(), 30);
}

// ═══════════════════════════════════════════════════════
// 15. PREVIEW
// ═══════════════════════════════════════════════════════
function buildCombinedHTML() {
    let html = files.html;
    if (!html) return '';
    html = html.includes('href="style.css"')
        ? html.replace(/<link[^>]+href="style\.css"[^>]*>/i, `<style>\n${files.css}\n</style>`)
        : html.replace('</head>', `<style>\n${files.css}\n</style>\n</head>`);
    html = html.includes('src="script.js"')
        ? html.replace(/<script[^>]+src="script\.js"[^>]*><\/script>/i, `<script>\n${files.js}\n</script>`)
        : html.replace('</body>', `<script>\n${files.js}\n</script>\n</body>`);
    return html;
}

function updatePreview() {
    if (!files.html) return;
    if (previewHolder) previewHolder.classList.add('hidden');
    if (previewFrame) { previewFrame.classList.remove('hidden'); previewFrame.srcdoc = buildCombinedHTML(); }
}

// ═══════════════════════════════════════════════════════
// 16. DOWNLOAD ZIP
// ═══════════════════════════════════════════════════════
btnDownload?.addEventListener('click', async () => {
    if (!files.html) { showToast('Generate a website first', 'error'); return; }
    if (typeof JSZip === 'undefined') { showToast('JSZip not loaded', 'error'); return; }
    const zip = new JSZip();
    zip.file('index.html', files.html);
    zip.file('style.css', files.css);
    zip.file('script.js', files.js);
    if (files.backend) {
        const bname = backendSelect?.value === 'node' ? 'server.js' : 'server.py';
        zip.file(bname, files.backend);
        // requirements.txt for Flask
        if (backendSelect?.value === 'flask') zip.file('requirements.txt', 'flask\nflask-cors\npython-dotenv\n');
        if (backendSelect?.value === 'node') zip.file('package.json', JSON.stringify({ name: 'friction-backend', dependencies: { express: '^4.18.0', cors: '^2.8.5', dotenv: '^16.0.0' } }, null, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'friction_project.zip';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Downloaded friction_project.zip!', 'success');
});

// ═══════════════════════════════════════════════════════
// 17. SAVE TO SERVER
// ═══════════════════════════════════════════════════════
btnSaveFile?.addEventListener('click', () => {
    if (!files.html) { showToast('Generate a website first', 'error'); return; }
    if (saveModal) saveModal.classList.remove('hidden');
});

saveFilename?.addEventListener('input', () => { if (folderPreview) folderPreview.textContent = saveFilename.value || 'my_website'; });
modalCancel?.addEventListener('click', () => saveModal?.classList.add('hidden'));
saveModal?.addEventListener('click', e => { if (e.target === saveModal) saveModal.classList.add('hidden'); });

modalSave?.addEventListener('click', async () => {
    const name = saveFilename.value.trim() || 'my_website';
    saveModal.classList.add('hidden');
    try {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: files.html, css: files.css, js: files.js, backend: files.backend, backend_type: backendSelect?.value || '', project_name: name }),
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Saved to generated/${name}/`, 'success');
            showStatus(`Saved: generated/${name}/`, 'success');
        } else throw new Error(data.error);
    } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
});

// ═══════════════════════════════════════════════════════
// 18. TOOLBAR BUTTONS
// ═══════════════════════════════════════════════════════
btnCopyCode?.addEventListener('click', async () => {
    const code = editorInstance?.getValue() || '';
    if (!code) return;
    try {
        await navigator.clipboard.writeText(code);
        const names = { html: 'index.html', css: 'style.css', js: 'script.js', backend: backendSelect?.value === 'node' ? 'server.js' : 'server.py' };
        showToast(`Copied ${names[activeTab]}!`, 'success');
    } catch { showToast('Could not copy', 'error'); }
});

btnRefresh?.addEventListener('click', () => updatePreview());

btnOpenTab?.addEventListener('click', () => {
    if (!files.html) { showToast('No preview to open', 'error'); return; }
    const blob = new Blob([buildCombinedHTML()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
});

btnClear?.addEventListener('click', () => {
    if (!files.html && !promptInput.value) return;
    if (!confirm('Clear everything?')) return;
    promptInput.value = ''; promptInput.dispatchEvent(new Event('input'));
    files = { html: '', css: '', js: '', backend: '' };
    switchToTab('html');
    editorInstance.setValue('');
    if (editorHolder) editorHolder.classList.remove('hidden');
    if (previewFrame) previewFrame.classList.add('hidden');
    if (previewHolder) previewHolder.classList.remove('hidden');
    if (statusBar) statusBar.classList.add('hidden');
    if (previewBadge) previewBadge.style.display = 'none';
    showToast('Cleared');
});

btnFormat?.addEventListener('click', () => { if (files.html) showToast('Code formatted!', 'success'); });

// ═══════════════════════════════════════════════════════
// 19. HISTORY
// ═══════════════════════════════════════════════════════
function addHistory(prompt) {
    history.unshift({ prompt, files: { ...files }, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });
    if (history.length > 10) history.pop();
    renderHistory();
}
function renderHistory() {
    if (!historyList) return;
    if (!history.length) { historyList.innerHTML = '<p class="empty-state">No generations yet.</p>'; return; }
    historyList.innerHTML = history.map((h, i) => `
      <div class="history-item fade-in" data-i="${i}">
        <div>${h.prompt.length > 50 ? h.prompt.slice(0, 50) + '…' : h.prompt}</div>
        <div class="history-time">${h.time}</div>
      </div>`).join('');
    historyList.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
            const h = history[+el.dataset.i];
            promptInput.value = h.prompt; promptInput.dispatchEvent(new Event('input'));
            files = { ...h.files }; switchToTab('html'); updatePreview(); showToast('Loaded from history');
        });
    });
}

// ═══════════════════════════════════════════════════════
// 20. LOADING / STATUS / TOAST
// ═══════════════════════════════════════════════════════
function setLoading(on) {
    if (btnGenerate) btnGenerate.disabled = on;
    btnGenerate?.querySelector('.send-icon')?.classList.toggle('hidden', on);
    btnGenerate?.querySelector('.send-spinner')?.classList.toggle('hidden', !on);
    if (aiThinking) aiThinking.classList.toggle('hidden', !on);
}
function showStatus(msg, type = 'info') {
    if (!statusBar) return;
    statusBar.textContent = msg;
    statusBar.className = `status-bar ${type}`;
    statusBar.classList.remove('hidden');
}
let toastT = null;
function showToast(msg, type = '') {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast${type ? ' ' + type : ''} show`;
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════════
// 21. BOOT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initEditor();
    checkConnection();
    initMobile();
});
