/* Enhanced home.js with NASA Challenge features and Chat History */

const API_CONFIG = {
  researcher: {
    url: 'https://n8n.navigo.dpdns.org/webhook/59e89dd8-395c-4763-8112-00797eb4bd7e/chat',
    apiKey: null
  },
  student: {
    url: 'https://n8n.navigo.dpdns.org/webhook/8e243197-5fab-4c6d-ab9e-5fbf39c81e3e/chat',
    apiKey: null
  },
  manager: {
    url: 'https://n8n.navigo.dpdns.org/webhook/d3590fee-4817-41d5-970c-2e3d31e8f567/chat',
    apiKey: null
  },
  default: {
    url: 'https://n8n.navigo.dpdns.org/webhook/59e89dd8-395c-4763-8112-00797eb4bd7e/chat',
    apiKey: null
  }
};

let currentModel = 'researcher';
let lastResponse = null;
let modelsVisible = false;
let currentUser = null;
let isAuthenticated = false;
let _serverAuthAvailable = null;
let currentFilters = {};

// Chat history management
let currentChatHistory = [];
let sessionStartTime = null;

const el = id => document.getElementById(id);

// DOM Elements
const searchInput = el('search-input');
const searchBtn = el('search-btn');
const searchText = el('search-text');
const chatHistoryEl = el('chat-history');
const sourcesList = el('sources-list');
const modelBtns = document.querySelectorAll('.model-btn') || [];
const copyConversationBtn = el('copy-conversation-btn');
const exportBtn = el('export-btn');
const exportMenu = el('export-menu');
const clearConversationBtn = el('clear-conversation-btn');
const showFullHistoryBtn = el('show-full-history-btn');
const filterToggle = el('filter-toggle');
const filterPanel = el('filter-panel');
const yearFilter = el('year-filter');
const topicFilter = el('topic-filter');
const missionFilter = el('mission-filter');

const summaryModal = el('summary-modal');
const modalBody = el('modal-body');
const closeSummaryBtn = el('close-modal');
const closeSummaryBtn2 = el('close-modal-2');
const copySummaryBtn = el('copy-summary-btn');

const sourcesSearchInput = el('sources-search-input');
const sourcesSearchBtn = el('sources-search-btn');
const summarizePaperBtn = el('summarize-paper-btn');

const toggleModelsBtn = el('toggle-models-btn');
const modelSelector = el('model-selector');

const authButtons = el('auth-buttons');
const userInfo = el('user-info');
const usernameDisplay = el('username-display');
const loginBtn = el('login-btn');
const registerBtn = el('register-btn');
const historyBtn = el('history-btn');
const logoutBtn = el('logout-btn');

const loginModal = el('login-modal');
const registerModal = el('register-modal');
const historyModal = el('history-modal');
const fullHistoryModal = el('full-history-modal');
const loginForm = el('login-form');
const registerForm = el('register-form');
const historyList = el('history-list');
const clearHistoryBtn = el('clear-history-btn');

// Full history modal elements
const fullHistoryContent = el('full-history-content');
const totalMessagesEl = el('total-messages');
const totalQuestionsEl = el('total-questions');
const sessionDurationEl = el('session-duration');
const exportFullHistoryBtn = el('export-full-history-btn');
const closeFullHistoryBtn = el('close-full-history-modal');
const closeFullHistoryBtn2 = el('close-full-history-modal-2');

let chatCard = el('chat-card');
let sourcesCard = el('sources-card');

if (chatHistoryEl && !chatHistoryEl.hasAttribute('tabindex')) chatHistoryEl.setAttribute('tabindex', '-1');

/* Utility Functions */
function getSessionId() {
  let sessionId = sessionStorage.getItem('nasaResearchSession');
  if (!sessionId) {
    sessionId = 'nasa_research_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('nasaResearchSession', sessionId);
    sessionStartTime = new Date();
  }
  return sessionId;
}

function formatText(text) {
  text = String(text || '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

function sanitize(str) {
  return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
}

function escapeHtmlOnce(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function truncate(str, length) {
  return str && str.length > length ? str.slice(0, length) + '...' : str || '';
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatTimestamp(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function calculateSessionDuration() {
  if (!sessionStartTime) return '0m';
  const now = new Date();
  const diffMs = now - sessionStartTime;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

/* Chat History Management */
function addMessageToHistory(role, content, timestamp = new Date()) {
  const message = {
    id: Date.now() + Math.random(),
    role, // 'user' or 'assistant'
    content,
    timestamp,
    model: currentModel
  };
  
  currentChatHistory.push(message);
  renderChatHistory();
  saveChatHistoryToStorage();
  
  // Auto-scroll to bottom
  if (chatHistoryEl) {
    setTimeout(() => {
      chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    }, 100);
  }
}

function renderChatHistory() {
  if (!chatHistoryEl) return;
  
  if (currentChatHistory.length === 0) {
    chatHistoryEl.innerHTML = '<div class="empty-state">Ask a question to start exploring NASA bioscience research</div>';
    return;
  }
  
  const messagesHtml = currentChatHistory.map(message => {
    const roleClass = message.role === 'user' ? 'user' : 'assistant';
    const roleLabel = message.role === 'user' ? 'You' : `AI (${message.model})`;
    
    return `
      <div class="chat-message ${roleClass}" data-message-id="${message.id}">
        <div class="chat-message-header">
          <span class="chat-message-role">${roleLabel}</span>
          <span class="chat-message-timestamp">${formatTimestamp(message.timestamp)}</span>
        </div>
        <div class="chat-message-content">${formatText(message.content)}</div>
        <div class="chat-message-actions">
          <button class="btn copy-message-btn" data-message-id="${message.id}" type="button">Copy</button>
          ${message.role === 'user' ? `<button class="btn regenerate-btn" data-message-id="${message.id}" type="button">Ask Again</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  chatHistoryEl.innerHTML = messagesHtml;
  
  // Add event listeners for message actions
  chatHistoryEl.querySelectorAll('.copy-message-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const messageId = e.target.dataset.messageId;
      const message = currentChatHistory.find(m => m.id == messageId);
      if (message) {
        navigator.clipboard.writeText(message.content).then(() => {
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = prev, 2000);
        });
      }
    });
  });
  
  chatHistoryEl.querySelectorAll('.regenerate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const messageId = e.target.dataset.messageId;
      const message = currentChatHistory.find(m => m.id == messageId);
      if (message && searchInput) {
        searchInput.value = message.content;
        handleSearch();
      }
    });
  });
}

function showLoadingMessage() {
  if (!chatHistoryEl) return;
  
  const loadingHtml = `
    <div class="chat-loading" id="chat-loading">
      <span>AI is thinking</span>
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
  
  chatHistoryEl.insertAdjacentHTML('beforeend', loadingHtml);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function hideLoadingMessage() {
  const loadingEl = el('chat-loading');
  if (loadingEl) {
    loadingEl.remove();
  }
}

function clearChatHistory() {
  currentChatHistory = [];
  sessionStartTime = new Date();
  renderChatHistory();
  saveChatHistoryToStorage();
  hideSourcesCard();
}

function saveChatHistoryToStorage() {
  if (!isAuthenticated || !currentUser) return;
  
  try {
    const key = `chat_history_${currentUser.username}`;
    const historyData = {
      messages: currentChatHistory,
      sessionStart: sessionStartTime,
      lastUpdated: new Date()
    };
    localStorage.setItem(key, JSON.stringify(historyData));
  } catch (e) {
    console.error('Failed to save chat history:', e);
  }
}

function loadChatHistoryFromStorage() {
  if (!isAuthenticated || !currentUser) {
    currentChatHistory = [];
    sessionStartTime = new Date();
    renderChatHistory();
    return;
  }
  
  try {
    const key = `chat_history_${currentUser.username}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const historyData = JSON.parse(stored);
      currentChatHistory = historyData.messages || [];
      sessionStartTime = historyData.sessionStart ? new Date(historyData.sessionStart) : new Date();
      renderChatHistory();
      
      if (currentChatHistory.length > 0) {
        showChatCard();
      }
    } else {
      currentChatHistory = [];
      sessionStartTime = new Date();
      renderChatHistory();
    }
  } catch (e) {
    console.error('Failed to load chat history:', e);
    currentChatHistory = [];
    sessionStartTime = new Date();
    renderChatHistory();
  }
}

/* AI Communication */
async function sendToAI(message, model = 'researcher') {
  try {
    const cfg = API_CONFIG[model] || API_CONFIG.default;
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

    // Add filter context if filters are active
    let enhancedMessage = message;
    if (Object.keys(currentFilters).length > 0) {
      const filterContext = Object.entries(currentFilters)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      enhancedMessage = `${message}\n[Filter context: ${filterContext}]`;
    }

    const res = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        action: 'sendMessage', 
        chatInput: enhancedMessage, 
        sessionId: getSessionId(), 
        model 
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return data.output || data.message || data.text || JSON.stringify(data);
    } else {
      return await res.text();
    }
  } catch (err) {
    console.error('AI Error:', err);
    return "Connection error. Please check your network and try again. 🛰️";
  }
}

/* Model Selector UI */
modelBtns.forEach(btn => {
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.addEventListener('click', () => {
    const modelType = btn.dataset.model;
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      currentModel = 'researcher';
    } else {
      modelBtns.forEach(b => { 
        b.classList.remove('active'); 
        b.setAttribute('aria-pressed', 'false'); 
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      currentModel = modelType;
    }
    updatePlaceholderText();
    setModelsVisible(false);
  });
  btn.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter' || e.key === ' ') { 
      e.preventDefault(); 
      btn.click(); 
    }
  });
});

function updatePlaceholderText() {
  if (!searchInput) return;
  const placeholders = {
    researcher: "e.g., How does microgravity affect DNA repair mechanisms?",
    student: "e.g., Explain how plants grow in space in simple terms",
    manager: "e.g., What are the investment opportunities in space agriculture?"
  };
  searchInput.placeholder = placeholders[currentModel] || placeholders.researcher;
}

function setModelsVisible(visible) {
  modelsVisible = !!visible;
  if (!modelSelector || !toggleModelsBtn) return;
  if (modelsVisible) {
    modelSelector.style.display = 'flex';
    requestAnimationFrame(() => modelSelector.classList.add('visible'));
    toggleModelsBtn.classList.add('active');
    toggleModelsBtn.setAttribute('aria-expanded', 'true');
  } else {
    modelSelector.classList.remove('visible');
    toggleModelsBtn.classList.remove('active');
    toggleModelsBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { 
      if (!modelsVisible) modelSelector.style.display = 'none'; 
    }, 300);
  }
}

if (toggleModelsBtn) {
  toggleModelsBtn.addEventListener('click', (e) => { 
    e.stopPropagation(); 
    setModelsVisible(!modelsVisible); 
  });
  document.addEventListener('click', (e) => { 
    if (modelSelector && !modelSelector.contains(e.target) && 
        e.target !== toggleModelsBtn && modelsVisible) {
      setModelsVisible(false); 
    }
  });
}

/* Filter Panel */
if (filterToggle) {
  filterToggle.addEventListener('click', () => {
    if (!filterPanel) return;
    const isVisible = filterPanel.style.display !== 'none';
    filterPanel.style.display = isVisible ? 'none' : 'block';
  });
}

// Update filters when changed
[yearFilter, topicFilter, missionFilter].forEach(filter => {
  if (filter) {
    filter.addEventListener('change', (e) => {
      const filterName = e.target.id.replace('-filter', '');
      currentFilters[filterName] = e.target.value;
    });
  }
});

/* Enhanced Search Handler */
if (searchBtn) searchBtn.addEventListener('click', handleSearch);
if (searchInput) searchInput.addEventListener('keypress', (e) => { 
  if (e.key === 'Enter') handleSearch(); 
});

async function handleSearch() {
  if (!searchInput) return;
  const query = searchInput.value.trim();
  if (!query) return;
  
  // Add user message to chat history
  addMessageToHistory('user', query);
  
  setLoading(true);
  showLoadingMessage();

  try {
    const prompt = buildPrompt(query, currentModel);
    const aiResponse = await sendToAI(prompt, currentModel);
    
    hideLoadingMessage();
    
    const parts = String(aiResponse || '').split(/\n\s*(?:Sources?|References?|Papers?):\s*\n/i);
    const answerText = parts[0] ? parts[0].trim() : aiResponse;
    const sources = parseAIResponseToPapers(aiResponse, query);

    // Add AI response to chat history
    addMessageToHistory('assistant', answerText);

    lastResponse = { answer: answerText, sources, query, model: currentModel };
    renderSources(sources);

    showChatCard();
    showSourcesCard();

    await saveSearchToHistory(query, currentModel, answerText, sources);
    
    // Clear search input for next question
    searchInput.value = '';
  } catch (err) {
    console.error('Search error:', err);
    hideLoadingMessage();
    
    const errorMessage = `Error: ${String(err)}`;
    addMessageToHistory('assistant', errorMessage);
    
    if (sourcesList) {
      sourcesList.innerHTML = '<div class="empty-state">No sources available</div>';
    }
  } finally {
    setLoading(false);
  }
}

function buildPrompt(query, model) {
  const basePrompts = {
    researcher: `You are a NASA space biology research assistant with access to 608 NASA bioscience publications and 500+ OSDR experiments.

Provide a detailed, technical answer to the following question, citing specific research where possible. After your answer, list 3-5 relevant NASA publications with:
- Title
- Authors
- Year
- Brief finding

Question: ${query}`,

    student: `You are a friendly science educator explaining NASA space biology research to students.

Explain the following topic in simple terms with analogies and examples. Then list 2-3 relevant research papers in simple language.

Question: ${query}`,

    manager: `You are a space economy analyst with access to NASA research and space economics data.

Provide an executive summary addressing the following, including:
- Key findings
- Business implications
- Investment opportunities
- Risk factors

Then list relevant research and market data.

Question: ${query}`
  };

  return basePrompts[model] || basePrompts.researcher;
}

function setLoading(loading) {
  if (!searchBtn || !searchText) return;
  searchBtn.disabled = loading;
  searchText.innerHTML = loading ? '<span class="loading"></span> Analyzing...' : 'Search';
}

/* Parse AI Response to Papers */
function parseAIResponseToPapers(aiResponse, query) {
  if (!aiResponse) return [];
  const text = String(aiResponse);
  const papers = [];
  
  // Try to extract structured references
  const lines = text.split('\n');
  let inSourcesSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (/^(sources?|references?|papers?|publications?):?$/i.test(line)) {
      inSourcesSection = true;
      continue;
    }
    
    if (inSourcesSection && line) {
      // Try to parse structured citation
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
      
      // Remove numbering and extract title
      let title = line
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^[-•]\s*/, '')
        .split(/[–—]|(?:\s+\(\d{4}\))/)[0]
        .trim();
      
      if (title && title.length > 10 && title.length < 200) {
        papers.push({
          id: `paper-${papers.length}`,
          title,
          authors: ['NASA Research'],
          year,
          hits: [{ text: lines[i + 1] || 'Research finding' }],
          source: 'ai'
        });
      }
      
      if (papers.length >= 5) break;
    }
  }
  
  // Fallback if no papers found
  if (papers.length === 0) {
    papers.push({
      id: 'paper-0',
      title: `Research on ${query}`,
      authors: ['NASA Bioscience'],
      year: new Date().getFullYear(),
      hits: [{ text: text.substring(0, 200) + '...' }],
      source: 'fallback'
    });
  }
  
  return papers;
}

/* Card Visibility Management */
function showChatCard() {
  if (!chatCard) chatCard = el('chat-card');
  if (!chatCard) return;
  chatCard.style.display = '';
  chatCard.removeAttribute('aria-hidden');
  if (chatHistoryEl) chatHistoryEl.focus?.();
}

function hideChatCard() {
  if (!chatCard) chatCard = el('chat-card');
  if (!chatCard) return;
  chatCard.style.display = 'none';
  chatCard.setAttribute('aria-hidden', 'true');
}

function showSourcesCard() {
  if (!sourcesCard) sourcesCard = el('sources-card');
  if (!sourcesCard) return;
  sourcesCard.style.display = '';
  sourcesCard.removeAttribute('aria-hidden');
}

function hideSourcesCard() {
  if (!sourcesCard) sourcesCard = el('sources-card');
  if (!sourcesCard) return;
  sourcesCard.style.display = 'none';
  sourcesCard.setAttribute('aria-hidden', 'true');
}

/* Sources Rendering */
function renderSources(sources) {
  if (!sourcesList) return;
  if (!sources || sources.length === 0) {
    sourcesList.innerHTML = '<div class="empty-state">No sources found</div>';
    return;
  }
  
  sourcesList.innerHTML = sources.map((s, i) => {
    const authors = Array.isArray(s.authors) ? s.authors.join(', ') : (s.authors || '');
    const snippet = s.hits?.[0]?.text || '';
    const id = escapeHtmlOnce(s.id || `doc-${i}`);
    const title = escapeHtmlOnce(s.title || `Untitled (${i+1})`);
    const meta = `${escapeHtmlOnce(authors)}${s.year ? ' • ' + s.year : ''}`;
    
    // Add tags based on content
    const tags = [];
    if (snippet.toLowerCase().includes('microgravity')) tags.push('Microgravity');
    if (snippet.toLowerCase().includes('iss')) tags.push('ISS');
    if (snippet.toLowerCase().includes('plant')) tags.push('Plant Biology');
    
    const tagHtml = tags.map(tag => `<span class="source-tag">${tag}</span>`).join('');
    
    return `
      <div class="source-item" data-source-id="${id}" data-source-title="${escapeHtmlOnce(s.title || title)}">
        <div class="source-title">${title}</div>
        <div class="source-meta">${meta}</div>
        ${tagHtml ? `<div style="margin-bottom: 0.5rem;">${tagHtml}</div>` : ''}
        <div class="source-snippet">${escapeHtmlOnce(truncate(snippet, 160))}</div>
        <div class="source-actions">
          <button class="btn btn-primary summarize-btn" data-id="${id}" type="button">Summarize</button>
          <button class="btn cite-btn" data-id="${id}" type="button">Cite</button>
        </div>
      </div>
    `;
  }).join('');
}

/* Full History Modal Functions */
function showFullHistoryModal() {
  if (!fullHistoryModal) return;
  
  // Update stats
  const totalMessages = currentChatHistory.length;
  const totalQuestions = currentChatHistory.filter(m => m.role === 'user').length;
  const duration = calculateSessionDuration();
  
  if (totalMessagesEl) totalMessagesEl.textContent = totalMessages;
  if (totalQuestionsEl) totalQuestionsEl.textContent = totalQuestions;
  if (sessionDurationEl) sessionDurationEl.textContent = duration;
  
  // Render full history
  if (fullHistoryContent) {
    if (currentChatHistory.length === 0) {
      fullHistoryContent.innerHTML = '<div class="empty-state">No conversation history available</div>';
    } else {
      const messagesHtml = currentChatHistory.map(message => {
        const roleClass = message.role === 'user' ? 'user' : 'assistant';
        const roleLabel = message.role === 'user' ? 'You' : `AI (${message.model})`;
        
        return `
          <div class="chat-message ${roleClass}">
            <div class="chat-message-header">
              <span class="chat-message-role">${roleLabel}</span>
              <span class="chat-message-timestamp">${formatTimestamp(message.timestamp)}</span>
            </div>
            <div class="chat-message-content">${formatText(message.content)}</div>
          </div>
        `;
      }).join('');
      
      fullHistoryContent.innerHTML = messagesHtml;
    }
  }
  
  openModalElem(fullHistoryModal);
}

function exportFullHistory() {
  if (currentChatHistory.length === 0) {
    alert('No conversation history to export');
    return;
  }
  
  const exportData = {
    sessionInfo: {
      startTime: sessionStartTime,
      duration: calculateSessionDuration(),
      totalMessages: currentChatHistory.length,
      totalQuestions: currentChatHistory.filter(m => m.role === 'user').length
    },
    messages: currentChatHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      model: msg.model
    }))
  };
  
  const filename = `nasa-research-conversation-${new Date().toISOString().split('T')[0]}.json`;
  download(filename, JSON.stringify(exportData, null, 2));
}

/* Event Listeners for Chat History Features */
if (showFullHistoryBtn) {
  showFullHistoryBtn.addEventListener('click', showFullHistoryModal);
}

if (copyConversationBtn) {
  copyConversationBtn.addEventListener('click', () => {
    if (currentChatHistory.length === 0) {
      alert('No conversation to copy');
      return;
    }
    
    const conversationText = currentChatHistory.map(msg => {
      const role = msg.role === 'user' ? 'You' : `AI (${msg.model})`;
      const timestamp = formatTimestamp(msg.timestamp);
      return `[${timestamp}] ${role}: ${msg.content}`;
    }).join('\n\n');
    
    navigator.clipboard.writeText(conversationText).then(() => {
      const prev = copyConversationBtn.textContent;
      copyConversationBtn.textContent = 'Copied!';
      setTimeout(() => copyConversationBtn.textContent = prev, 2000);
    });
  });
}

if (clearConversationBtn) {
  clearConversationBtn.addEventListener('click', () => {
    if (currentChatHistory.length === 0) return;
    
    if (confirm('Are you sure you want to clear the current conversation? This cannot be undone.')) {
      clearChatHistory();
    }
  });
}

if (exportFullHistoryBtn) {
  exportFullHistoryBtn.addEventListener('click', exportFullHistory);
}

if (closeFullHistoryBtn) closeFullHistoryBtn.addEventListener('click', () => closeModalElem(fullHistoryModal));
if (closeFullHistoryBtn2) closeFullHistoryBtn2.addEventListener('click', () => closeModalElem(fullHistoryModal));
if (fullHistoryModal) fullHistoryModal.addEventListener('click', (e) => { 
  if (e.target === fullHistoryModal) closeModalElem(fullHistoryModal); 
});

/* Summarization */
if (sourcesList) {
  sourcesList.addEventListener('click', async (ev) => {
    const summarizeBtn = ev.target.closest('.summarize-btn');
    const citeBtn = ev.target.closest('.cite-btn');
    
    if (summarizeBtn) {
      const container = summarizeBtn.closest('.source-item');
      const title = container?.dataset?.sourceTitle || summarizeBtn.dataset.id || 'Unknown';
      const prev = summarizeBtn.innerHTML;
      
      try {
        summarizeBtn.disabled = true;
        summarizeBtn.innerHTML = '<span class="loading"></span> Summarizing...';
        showSummaryModal(`Generating summary for "${title}"...`);
        
        const summary = await getSummaryForTitle(title, currentModel);
        
        // Ensure we have a valid summary before rendering
        if (summary && summary.trim()) {
          renderSummary({ summary, bullets: [], highlights: [], citations: [] });
        } else {
          throw new Error('Empty summary received');
        }
        
      } catch (err) {
        console.error('Summarize error', err);
        
        // Show user-friendly error message
        const errorMessage = err.message || 'An unexpected error occurred';
        if (modalBody) {
          modalBody.innerHTML = `
            <div style="color: var(--accent-secondary); text-align: center; padding: 2rem;">
              <h3>Summary Unavailable</h3>
              <p>We couldn't generate a summary for "${escapeHtmlOnce(title)}" at this time.</p>
              <p style="font-size: 0.9em; margin-top: 1rem;">Error: ${escapeHtmlOnce(errorMessage)}</p>
              <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
                Refresh Page
              </button>
            </div>
          `;
        }
        
        // Show toast notification for better UX
        showToastNotification('Summarization failed. Please try again.', 'error');
        
      } finally {
        summarizeBtn.disabled = false;
        summarizeBtn.innerHTML = prev;
      }
    }
    
    if (citeBtn) {
      const container = citeBtn.closest('.source-item');
      const title = container?.dataset?.sourceTitle || 'Unknown Paper';
      showCitationModal(title);
    }
  });
}

async function getSummaryForTitle(title, model) {
  try {
    // Use the new local summarization API endpoint
    const response = await fetch('/api/papers/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        paper_title: title
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Summarization failed');
    }
    
    // Format the structured response into a readable summary
    let formattedSummary = data.summary;
    
    if (data.key_findings && data.key_findings.length > 0) {
      formattedSummary += '\n\n**Key Findings:**\n';
      data.key_findings.forEach(finding => {
        formattedSummary += `• ${finding}\n`;
      });
    }
    
    if (data.methodology) {
      formattedSummary += `\n**Methodology:** ${data.methodology}`;
    }
    
    if (data.significance) {
      formattedSummary += `\n\n**Significance:** ${data.significance}`;
    }
    
    return formattedSummary;
    
  } catch (error) {
    console.error('Local summarization error:', error);
    
    // Fallback to external AI service if local API fails
    try {
      const prompt = `Provide a concise, professional summary (2-3 paragraphs) of the research paper titled: "${title}". Include main findings, methodology, and significance. Use academic tone.`;
      const response = await sendToAI(prompt, model);
      return String(response || 'Summary unavailable');
    } catch (fallbackError) {
      console.error('Fallback summarization error:', fallbackError);
      return `Unable to generate summary for "${title}". Please try again later or check your network connection.`;
    }
  }
}

function renderSummary(data) {
  if (!modalBody) return;
  let html = `<div>${formatText(data.summary || 'No summary available')}</div>`;
  if (data.bullets && data.bullets.length) {
    html += '<strong>Key Takeaways</strong><ul>' + 
            data.bullets.map(b => `<li>${sanitize(b)}</li>`).join('') + '</ul>';
  }
  if (data.highlights && data.highlights.length) {
    html += '<strong>Highlighted Excerpts</strong>' + 
            data.highlights.map(h => `
      <div class="highlight-snippet">
        <div class="meta">Page ${h.page} • Paragraph ${h.paragraph}</div>
        <div>${sanitize(h.text)}</div>
      </div>
    `).join('');
  }
  modalBody.innerHTML = html;
}

function showCitationModal(title) {
  if (!summaryModal || !modalBody) return;
  summaryModal.hidden = false;
  summaryModal.style.display = 'flex';
  
  const bibtex = `@article{paper2025,
  title = {${title}},
  author = {NASA Bioscience Research},
  year = {2025},
  journal = {NASA Open Science Data Repository}
}`;
  
  const apa = `NASA Bioscience Research. (2025). ${title}. NASA Open Science Data Repository.`;
  
  modalBody.innerHTML = `
    <h3 style="margin-bottom: 1rem;">Citation Formats</h3>
    <div style="margin-bottom: 1.5rem;">
      <strong>BibTeX:</strong>
      <div class="citation-preview">${escapeHtmlOnce(bibtex)}</div>
    </div>
    <div>
      <strong>APA:</strong>
      <div class="citation-preview">${escapeHtmlOnce(apa)}</div>
    </div>
  `;
}

/* Modal Controls */
function showSummaryModal(loadingText = 'Generating summary...') {
  if (!summaryModal || !modalBody) return;
  summaryModal.hidden = false;
  summaryModal.style.display = 'flex';
  modalBody.innerHTML = `<div class="empty-state"><div class="loading"></div> ${escapeHtmlOnce(loadingText)}</div>`;
}

function hideSummaryModal() {
  if (!summaryModal || !modalBody) return;
  summaryModal.hidden = true;
  summaryModal.style.display = 'none';
  modalBody.innerHTML = '';
}

if (closeSummaryBtn) closeSummaryBtn.addEventListener('click', hideSummaryModal);
if (closeSummaryBtn2) closeSummaryBtn2.addEventListener('click', hideSummaryModal);
if (summaryModal) summaryModal.addEventListener('click', (e) => { 
  if (e.target === summaryModal) hideSummaryModal(); 
});
if (copySummaryBtn) copySummaryBtn.addEventListener('click', () => {
  if (!modalBody) return;
  const text = modalBody.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const prev = copySummaryBtn.textContent;
    copySummaryBtn.textContent = 'Copied!';
    setTimeout(() => copySummaryBtn.textContent = prev, 2000);
  });
});

/* Export Functions */
if (exportBtn) {
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (exportMenu) {
      exportMenu.classList.toggle('show');
    }
  });
  
  document.addEventListener('click', (e) => {
    if (exportMenu && !exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
      exportMenu.classList.remove('show');
    }
  });
}

if (exportMenu) {
  exportMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !lastResponse) return;
    
    const format = btn.dataset.format;
    exportMenu.classList.remove('show');
    
    switch(format) {
      case 'bibtex':
        const bibtex = lastResponse.sources.map(toBibtex).join('\n\n');
        download('sources.bib', bibtex);
        break;
      case 'ris':
        const ris = lastResponse.sources.map(toRIS).join('\n\n');
        download('sources.ris', ris);
        break;
      case 'json':
        download('research-results.json', JSON.stringify(lastResponse, null, 2));
        break;
      case 'csv':
        const csv = toCSV(lastResponse.sources);
        download('sources.csv', csv);
        break;
    }
  });
}

function toBibtex(source) {
  const key = (source.authors?.[0] || 'unknown').split(' ').pop() + (source.year || 'nd');
  const authors = Array.isArray(source.authors) ? source.authors.join(' and ') : (source.authors || '');
  return `@article{${key},\n  title = {${source.title || ''}},\n  author = {${authors}},\n  year = {${source.year || ''}},\n  note = {${source.id || ''}}\n}`;
}

function toRIS(source) {
  const authors = Array.isArray(source.authors) ? source.authors : [source.authors || ''];
  return `TY  - JOUR\nTI  - ${source.title || ''}\n${authors.map(a => `AU  - ${a}`).join('\n')}\nPY  - ${source.year || ''}\nER  -`;
}

function toCSV(sources) {
  const header = 'Title,Authors,Year,ID\n';
  const rows = sources.map(s => {
    const authors = Array.isArray(s.authors) ? s.authors.join('; ') : s.authors;
    return `"${s.title || ''}","${authors}","${s.year || ''}","${s.id || ''}"`;
  }).join('\n');
  return header + rows;
}

/* Authentication - simplified wrapper functions */
async function checkAuthStatus() {
  const stored = localStorage.getItem('supernova_current_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      isAuthenticated = true;
      updateAuthUI();
      loadChatHistoryFromStorage();
    } catch (e) {
      localStorage.removeItem('supernova_current_user');
    }
  }
}

function getAllUsersLocal() { 
  return JSON.parse(localStorage.getItem('supernova_users') || '[]'); 
}

function saveAllUsersLocal(users) { 
  localStorage.setItem('supernova_users', JSON.stringify(users)); 
}

function setCurrentUserLocal(user) {
  currentUser = user;
  isAuthenticated = true;
  localStorage.setItem('supernova_current_user', JSON.stringify({
    id: user.id,
    username: user.username,
    email: user.email
  }));
  updateAuthUI();
  loadChatHistoryFromStorage();
}

function clearCurrentUserLocal() {
  currentUser = null;
  isAuthenticated = false;
  localStorage.removeItem('supernova_current_user');
  clearChatHistory();
  updateAuthUI();
}

async function register(username, email, password) {
  username = (username || '').trim();
  email = (email || '').trim();
  password = (password || '').toString();
  
  if (!username || !email || !password) {
    return { success: false, error: 'All fields required' };
  }
  
  if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }
  
  const users = getAllUsersLocal();
  
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, error: 'Username already taken' };
  }
  
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { success: false, error: 'Email already registered' };
  }
  
  const user = {
    id: 'user_' + Date.now(),
    username,
    email,
    password,
    createdAt: new Date().toISOString()
  };
  
  users.push(user);
  saveAllUsersLocal(users);
  setCurrentUserLocal({ id: user.id, username: user.username, email: user.email });
  
  return { success: true };
}

async function login(username, password) {
  username = (username || '').trim();
  password = (password || '').toString();
  
  if (!username || !password) {
    return { success: false, error: 'Username and password required' };
  }
  
  const users = getAllUsersLocal();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  if (user.password !== password) {
    return { success: false, error: 'Invalid password' };
  }
  
  setCurrentUserLocal({ id: user.id, username: user.username, email: user.email });
  return { success: true };
}

async function logout() {
  clearCurrentUserLocal();
  return { success: true };
}

function updateAuthUI() {
  if (isAuthenticated && currentUser) {
    if (authButtons) authButtons.style.display = 'none';
    if (userInfo) userInfo.style.display = 'flex';
    if (usernameDisplay) usernameDisplay.textContent = currentUser.username;
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (userInfo) userInfo.style.display = 'none';
    if (usernameDisplay) usernameDisplay.textContent = '';
  }
}

/* History Management */
function getHistoryKeyForUser(username) {
  return `supernova_history_${username}`;
}

async function saveSearchToHistory(query, modelType, response, sources) {
  if (!isAuthenticated || !currentUser) return;
  
  try {
    const key = getHistoryKeyForUser(currentUser.username);
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    
    history.unshift({
      id: Date.now(),
      query,
      model_type: modelType,
      response: response || '',
      sources: sources || [],
      timestamp: new Date().toISOString()
    });
    
    localStorage.setItem(key, JSON.stringify(history.slice(0, 200)));
  } catch (e) {
    console.error('Save history error', e);
  }
}

async function loadSearchHistory() {
  if (!isAuthenticated || !currentUser) {
    if (historyList) {
      historyList.innerHTML = '<div class="empty-history">Please login to see your history</div>';
    }
    return;
  }
  
  try {
    const key = getHistoryKeyForUser(currentUser.username);
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    displayHistory(history);
  } catch (e) {
    console.error('Load history error', e);
    if (historyList) {
      historyList.innerHTML = '<div class="empty-history">Failed to load history</div>';
    }
  }
}

function displayHistory(history) {
  if (!historyList) return;
  
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="empty-history">No search history yet</div>';
    return;
  }
  
  historyList.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-item-header">
        <div>
          <div class="history-item-query">${escapeHtmlOnce(item.query)}</div>
          <div class="history-item-meta">
            <span class="history-item-model">${escapeHtmlOnce(item.model_type)}</span>
            <span>${new Date(item.timestamp).toLocaleString()}</span>
          </div>
        </div>
        <div class="history-item-actions">
          <button class="btn restore-btn" data-query="${escapeHtmlOnce(item.query)}" 
                  data-model="${escapeHtmlOnce(item.model_type)}" type="button">Restore</button>
          <button class="btn delete-item" data-id="${item.id}" type="button">Delete</button>
        </div>
      </div>
      ${item.response ? `<div class="history-item-response">${formatText(item.response.substring(0, 200))}${item.response.length > 200 ? '...' : ''}</div>` : ''}
    </div>
  `).join('');
  
  historyList.querySelectorAll('.restore-btn').forEach(btn => {
    btn.addEventListener('click', () => restoreSearch(btn.dataset.query, btn.dataset.model));
  });
  
  historyList.querySelectorAll('.delete-item').forEach(btn => {
    btn.addEventListener('click', () => deleteHistoryItem(Number(btn.dataset.id)));
  });
}

function deleteHistoryItem(id) {
  if (!isAuthenticated || !currentUser) return;
  
  const key = getHistoryKeyForUser(currentUser.username);
  const history = JSON.parse(localStorage.getItem(key) || '[]').filter(h => h.id !== id);
  localStorage.setItem(key, JSON.stringify(history));
  loadSearchHistory();
}

async function clearAllHistory() {
  if (!isAuthenticated || !currentUser) {
    alert('Please login to clear history.');
    return;
  }
  
  if (!confirm('Are you sure you want to clear all search history?')) return;
  
  const key = getHistoryKeyForUser(currentUser.username);
  localStorage.setItem(key, JSON.stringify([]));
  loadSearchHistory();
}

function restoreSearch(query, modelType) {
  if (searchInput) searchInput.value = query;
  currentModel = modelType;
  
  modelBtns.forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });
  
  modelBtns.forEach(btn => {
    if (btn.dataset.model === modelType) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    }
  });
  
  updatePlaceholderText();
  closeModalElem(historyModal);
  
  if (searchInput) searchInput.focus();
  showChatCard();
  showSourcesCard();
}

/* Modal Helpers */
function openModalElem(modal) {
  if (!modal) return;
  modal.hidden = false;
  modal.style.display = 'flex';
}

function closeModalElem(modal) {
  if (!modal) return;
  modal.hidden = true;
  modal.style.display = 'none';
  
  const forms = modal.querySelectorAll('form');
  forms.forEach(f => f.reset());
  
  const errors = modal.querySelectorAll('.error-message');
  errors.forEach(e => {
    e.style.display = 'none';
    e.textContent = '';
  });
}

function showError(elem, message) {
  if (!elem) return;
  elem.textContent = message;
  elem.style.display = 'block';
}

/* Auth Event Handlers */
if (loginBtn) loginBtn.addEventListener('click', () => openModalElem(loginModal));
if (registerBtn) registerBtn.addEventListener('click', () => openModalElem(registerModal));
if (historyBtn) historyBtn.addEventListener('click', () => {
  openModalElem(historyModal);
  loadSearchHistory();
});
if (logoutBtn) logoutBtn.addEventListener('click', () => logout());

document.querySelectorAll('.close-btn, #close-login-modal-2, #close-register-modal-2, #close-history-modal-2').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) closeModalElem(modal);
  });
});

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const username = fd.get('username');
    const password = fd.get('password');
    
    if (!username || !password) {
      showError(el('login-error'), 'Please provide username and password');
      return;
    }
    
    try {
      const result = await login(username, password);
      if (!result || !result.success) {
        showError(el('login-error'), result?.error || 'Login failed');
      } else {
        closeModalElem(loginModal);
      }
    } catch (err) {
      console.error('Login handler error', err);
      showError(el('login-error'), 'Login failed (unexpected error)');
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(registerForm);
    const username = fd.get('username');
    const email = fd.get('email');
    const password = fd.get('password');
    const confirmPassword = fd.get('confirm-password');
    
    if (password !== confirmPassword) {
      showError(el('register-error'), 'Passwords do not match');
      return;
    }
    
    try {
      const result = await register(username, email, password);
      if (!result || !result.success) {
        showError(el('register-error'), result?.error || 'Registration failed');
      } else {
        closeModalElem(registerModal);
      }
    } catch (err) {
      console.error('Register handler error', err);
      showError(el('register-error'), 'Registration failed (unexpected error)');
    }
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', clearAllHistory);
}

/* Sources Search */
if (sourcesSearchBtn) {
  sourcesSearchBtn.addEventListener('click', async () => {
    const q = (sourcesSearchInput && sourcesSearchInput.value || '').trim();
    if (!q) {
      if (sourcesSearchInput) sourcesSearchInput.focus();
      return;
    }
    
    sourcesSearchBtn.disabled = true;
    if (sourcesList) {
      sourcesList.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    }
    
    try {
      const prompt = `Find and list 3-5 NASA space biology research papers related to: "${q}". For each, provide: Title, Authors, Year, and a brief finding.`;
      const response = await sendToAI(prompt, currentModel);
      const papers = parseAIResponseToPapers(response, q);
      renderSources(papers || []);
    } catch (err) {
      console.error('Sources search error', err);
      if (sourcesList) {
        sourcesList.innerHTML = '<div class="empty-state">Error searching sources</div>';
      }
    } finally {
      sourcesSearchBtn.disabled = false;
    }
  });
  
  if (sourcesSearchInput) {
    sourcesSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sourcesSearchBtn.click();
    });
  }
}

if (summarizePaperBtn) {
  summarizePaperBtn.addEventListener('click', async () => {
    const paperName = (sourcesSearchInput && sourcesSearchInput.value || '').trim();
    if (!paperName) {
      if (sourcesSearchInput) sourcesSearchInput.focus();
      showToastNotification('Please enter a paper name to summarize', 'info');
      return;
    }
    
    // Disable button during processing
    const originalText = summarizePaperBtn.textContent;
    summarizePaperBtn.disabled = true;
    summarizePaperBtn.textContent = 'Summarizing...';
    
    try {
      showSummaryModal(`Generating summary for "${paperName}"...`);
      const summary = await getSummaryForTitle(paperName, currentModel);
      
      if (summary && summary.trim()) {
        renderSummary({ summary, bullets: [], highlights: [], citations: [] });
        showToastNotification('Summary generated successfully!', 'success');
      } else {
        throw new Error('Empty summary received');
      }
      
    } catch (err) {
      console.error('Summarize paper error', err);
      
      const errorMessage = err.message || 'An unexpected error occurred';
      if (modalBody) {
        modalBody.innerHTML = `
          <div style="color: var(--accent-secondary); text-align: center; padding: 2rem;">
            <h3>Summary Unavailable</h3>
            <p>We couldn't generate a summary for "${escapeHtmlOnce(paperName)}" at this time.</p>
            <p style="font-size: 0.9em; margin-top: 1rem;">Error: ${escapeHtmlOnce(errorMessage)}</p>
            <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
              Refresh Page
            </button>
          </div>
        `;
      }
      
      showToastNotification('Failed to generate summary. Please try again.', 'error');
      
    } finally {
      // Re-enable button
      summarizePaperBtn.disabled = false;
      summarizePaperBtn.textContent = originalText;
    }
  });
}

/* Initialization */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (searchInput) searchInput.focus();
    
    modelBtns.forEach(btn => btn.classList.remove('active'));
    currentModel = 'researcher';
    updatePlaceholderText();
    setModelsVisible(false);
    
    await checkAuthStatus();
    
    hideChatCard();
    hideSourcesCard();
    
    console.info('SuperNova-AI with Chat History initialized successfully');
  } catch (err) {
    console.error('Initialization error:', err);
  }
});


/* Quiz Functionality */
let currentQuiz = null;
let quizAnswers = {};
let showingAnswers = false;

// Quiz elements
const quizCard = el('quiz-card');
const quizSearchInput = el('quiz-search-input');
const quizSearchBtn = el('quiz-search-btn');
const generateQuizBtn = el('generate-quiz-btn');
const quizContent = el('quiz-content');
const showQuizAnswersBtn = el('show-quiz-answers-btn');
const clearQuizBtn = el('clear-quiz-btn');
const quizSuggestions = el('quiz-suggestions');

// Sources suggestions
const sourcesSuggestions = el('sources-suggestions');

// Sample papers database for suggestions
const samplePapers = [
  {
    title: "Effects of Microgravity on Plant Cell Wall Synthesis",
    authors: "Johnson, M.K., Smith, A.L., Brown, R.T.",
    year: "2023",
    keywords: ["microgravity", "plant", "cell wall", "synthesis"]
  },
  {
    title: "DNA Repair Mechanisms in Space Radiation Environment",
    authors: "Chen, L., Williams, P.D., Davis, K.M.",
    year: "2022",
    keywords: ["DNA", "repair", "radiation", "space"]
  },
  {
    title: "Bone Density Changes in Long-Duration Spaceflight",
    authors: "Anderson, J.R., Thompson, S.A., Miller, C.L.",
    year: "2023",
    keywords: ["bone", "density", "spaceflight", "astronaut"]
  },
  {
    title: "Protein Crystallization in Microgravity Conditions",
    authors: "Garcia, M.E., Wilson, D.K., Taylor, B.J.",
    year: "2021",
    keywords: ["protein", "crystallization", "microgravity"]
  },
  {
    title: "Cardiovascular Adaptations to Zero Gravity",
    authors: "Lee, H.S., Martinez, R.C., Jackson, T.M.",
    year: "2022",
    keywords: ["cardiovascular", "zero gravity", "adaptation"]
  },
  {
    title: "Yeast Gene Expression Under Simulated Mars Conditions",
    authors: "Patel, N.K., Robinson, A.F., White, L.G.",
    year: "2023",
    keywords: ["yeast", "gene expression", "mars", "conditions"]
  },
  {
    title: "Immune System Response to Extended Space Travel",
    authors: "Kumar, S.R., Adams, M.J., Clark, P.L.",
    year: "2022",
    keywords: ["immune", "system", "space travel", "extended"]
  },
  {
    title: "Muscle Atrophy Prevention Strategies in Microgravity",
    authors: "Brooks, K.A., Evans, D.R., Moore, J.S.",
    year: "2023",
    keywords: ["muscle", "atrophy", "prevention", "microgravity"]
  }
];

function showQuizCard() {
  if (quizCard) {
    quizCard.style.display = 'block';
    quizCard.setAttribute('aria-hidden', 'false');
  }
}

function hideQuizCard() {
  if (quizCard) {
    quizCard.style.display = 'none';
    quizCard.setAttribute('aria-hidden', 'true');
  }
}

function clearQuiz() {
  currentQuiz = null;
  quizAnswers = {};
  showingAnswers = false;
  
  if (quizContent) {
    quizContent.innerHTML = '<div class="empty-state">Search for a paper and generate a quiz to test your knowledge</div>';
  }
  
  if (showQuizAnswersBtn) {
    showQuizAnswersBtn.style.display = 'none';
  }
  
  if (quizSearchInput) {
    quizSearchInput.value = '';
  }
}

async function generateQuiz(paperTitle) {
  if (!paperTitle) return;
  
  try {
    if (quizContent) {
      quizContent.innerHTML = '<div class="loading">Generating quiz questions...</div>';
    }
    
    const prompt = `Generate a 5-question multiple choice quiz about the research paper titled "${paperTitle}". 
    For each question, provide:
    1. The question text
    2. Four answer options (A, B, C, D)
    3. The correct answer letter
    4. A brief explanation of why the answer is correct
    
    Format as JSON with this structure:
    {
      "questions": [
        {
          "question": "Question text here?",
          "options": {
            "A": "Option A text",
            "B": "Option B text", 
            "C": "Option C text",
            "D": "Option D text"
          },
          "correct": "A",
          "explanation": "Explanation of correct answer"
        }
      ]
    }`;
    
    const response = await sendToAI(prompt, currentModel);
    const quiz = parseQuizResponse(response);
    
    if (quiz && quiz.questions && quiz.questions.length > 0) {
      currentQuiz = quiz;
      renderQuiz(quiz);
      if (showQuizAnswersBtn) {
        showQuizAnswersBtn.style.display = 'inline-block';
      }
    } else {
      throw new Error('Invalid quiz format received');
    }
  } catch (err) {
    console.error('Quiz generation error:', err);
    if (quizContent) {
      quizContent.innerHTML = `<div class="empty-state" style="color: var(--accent-secondary);">Error generating quiz: ${escapeHtmlOnce(String(err))}</div>`;
    }
  }
}

function parseQuizResponse(response) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback: parse text format
    const questions = [];
    const lines = response.split('\n').filter(line => line.trim());
    
    let currentQuestion = null;
    let questionCount = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Question detection
      if (trimmed.match(/^\d+\./) || trimmed.toLowerCase().includes('question')) {
        if (currentQuestion) {
          questions.push(currentQuestion);
        }
        questionCount++;
        currentQuestion = {
          question: trimmed.replace(/^\d+\.\s*/, ''),
          options: {},
          correct: 'A',
          explanation: 'No explanation provided'
        };
      }
      // Options detection
      else if (trimmed.match(/^[A-D][\.\)]/)) {
        const letter = trimmed[0];
        const text = trimmed.substring(2).trim();
        if (currentQuestion) {
          currentQuestion.options[letter] = text;
        }
      }
      // Correct answer detection
      else if (trimmed.toLowerCase().includes('correct') || trimmed.toLowerCase().includes('answer')) {
        const answerMatch = trimmed.match(/[A-D]/);
        if (answerMatch && currentQuestion) {
          currentQuestion.correct = answerMatch[0];
        }
      }
    }
    
    if (currentQuestion) {
      questions.push(currentQuestion);
    }
    
    return { questions };
  } catch (err) {
    console.error('Quiz parsing error:', err);
    return null;
  }
}

function renderQuiz(quiz) {
  if (!quiz || !quiz.questions || !quizContent) return;
  
  const questionsHtml = quiz.questions.map((q, index) => {
    const questionId = `question-${index}`;
    const optionsHtml = Object.entries(q.options).map(([letter, text]) => `
      <div class="quiz-option" data-question="${index}" data-option="${letter}">
        <input type="radio" name="${questionId}" value="${letter}" id="${questionId}-${letter}">
        <label for="${questionId}-${letter}" class="quiz-option-text">${escapeHtmlOnce(text)}</label>
      </div>
    `).join('');
    
    return `
      <div class="quiz-question" data-question="${index}">
        <div class="quiz-question-number">Question ${index + 1}</div>
        <div class="quiz-question-text">${escapeHtmlOnce(q.question)}</div>
        <div class="quiz-options">
          ${optionsHtml}
        </div>
        <div class="quiz-answer-explanation" data-question="${index}">
          <h4>Correct Answer: ${q.correct}</h4>
          <p>${escapeHtmlOnce(q.explanation)}</p>
        </div>
      </div>
    `;
  }).join('');
  
  quizContent.innerHTML = questionsHtml;
  
  // Add event listeners for option selection
  quizContent.querySelectorAll('.quiz-option').forEach(option => {
    option.addEventListener('click', () => {
      const questionIndex = parseInt(option.dataset.question);
      const selectedOption = option.dataset.option;
      
      // Clear previous selections for this question
      const questionElement = option.closest('.quiz-question');
      questionElement.querySelectorAll('.quiz-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      
      // Mark current selection
      option.classList.add('selected');
      option.querySelector('input').checked = true;
      
      // Store answer
      quizAnswers[questionIndex] = selectedOption;
    });
  });
}

function showQuizAnswers() {
  if (!currentQuiz || showingAnswers) return;
  
  showingAnswers = true;
  
  currentQuiz.questions.forEach((q, index) => {
    const questionElement = quizContent.querySelector(`[data-question="${index}"]`);
    if (!questionElement) return;
    
    const userAnswer = quizAnswers[index];
    const correctAnswer = q.correct;
    
    // Mark correct and incorrect options
    questionElement.querySelectorAll('.quiz-option').forEach(option => {
      const optionLetter = option.dataset.option;
      
      if (optionLetter === correctAnswer) {
        option.classList.add('correct');
      } else if (optionLetter === userAnswer && optionLetter !== correctAnswer) {
        option.classList.add('incorrect');
      }
      
      // Disable further selection
      option.style.pointerEvents = 'none';
      const input = option.querySelector('input');
      if (input) input.disabled = true;
    });
    
    // Show explanation
    const explanation = questionElement.querySelector('.quiz-answer-explanation');
    if (explanation) {
      explanation.classList.add('show');
    }
  });
  
  // Show results
  showQuizResults();
  
  // Update button
  if (showQuizAnswersBtn) {
    showQuizAnswersBtn.textContent = 'Answers Shown';
    showQuizAnswersBtn.disabled = true;
  }
}

function showQuizResults() {
  if (!currentQuiz) return;
  
  const totalQuestions = currentQuiz.questions.length;
  const correctAnswers = currentQuiz.questions.reduce((count, q, index) => {
    return count + (quizAnswers[index] === q.correct ? 1 : 0);
  }, 0);
  
  const percentage = Math.round((correctAnswers / totalQuestions) * 100);
  
  let feedback = '';
  if (percentage >= 90) feedback = 'Excellent work! You have a strong understanding of this research.';
  else if (percentage >= 70) feedback = 'Good job! You understand most of the key concepts.';
  else if (percentage >= 50) feedback = 'Not bad! Consider reviewing the paper for better understanding.';
  else feedback = 'Keep studying! This research area might benefit from more review.';
  
  const resultsHtml = `
    <div class="quiz-results">
      <div class="quiz-score">${correctAnswers}/${totalQuestions}</div>
      <div class="quiz-score-text">${percentage}% Correct</div>
      <div class="quiz-feedback">${feedback}</div>
    </div>
  `;
  
  if (quizContent) {
    quizContent.insertAdjacentHTML('beforeend', resultsHtml);
  }
}

/* Search Suggestions */
function filterPaperSuggestions(query) {
  if (!query || query.length < 2) return [];
  
  const lowerQuery = query.toLowerCase();
  return samplePapers.filter(paper => {
    return paper.title.toLowerCase().includes(lowerQuery) ||
           paper.authors.toLowerCase().includes(lowerQuery) ||
           paper.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery));
  }).slice(0, 5);
}

function showSuggestions(suggestions, suggestionsElement, inputElement) {
  if (!suggestionsElement || !suggestions.length) {
    if (suggestionsElement) suggestionsElement.style.display = 'none';
    return;
  }
  
  const suggestionsHtml = suggestions.map(paper => `
    <div class="suggestion-item" data-title="${escapeHtmlOnce(paper.title)}">
      <div class="suggestion-title">${escapeHtmlOnce(paper.title)}</div>
      <div class="suggestion-authors">${escapeHtmlOnce(paper.authors)}</div>
      <div class="suggestion-year">${paper.year}</div>
    </div>
  `).join('');
  
  suggestionsElement.innerHTML = suggestionsHtml;
  suggestionsElement.style.display = 'block';
  
  // Add click handlers
  suggestionsElement.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const title = item.dataset.title;
      if (inputElement) {
        inputElement.value = title;
      }
      suggestionsElement.style.display = 'none';
    });
  });
}

function hideSuggestions(suggestionsElement) {
  if (suggestionsElement) {
    suggestionsElement.style.display = 'none';
  }
}

/* Quiz Event Handlers */
if (quizSearchBtn) {
  quizSearchBtn.addEventListener('click', () => {
    const query = (quizSearchInput && quizSearchInput.value || '').trim();
    if (!query) {
      if (quizSearchInput) quizSearchInput.focus();
      return;
    }
    
    showQuizCard();
    // Just show that we found the paper - in a real app this would search
    if (quizContent) {
      quizContent.innerHTML = `<div class="empty-state">Found paper: "${escapeHtmlOnce(query)}". Click "Generate Quiz" to create questions.</div>`;
    }
  });
}

if (generateQuizBtn) {
  generateQuizBtn.addEventListener('click', () => {
    const paperTitle = (quizSearchInput && quizSearchInput.value || '').trim();
    if (!paperTitle) {
      if (quizSearchInput) quizSearchInput.focus();
      return alert('Please enter a paper title first');
    }
    
    generateQuiz(paperTitle);
  });
}

if (showQuizAnswersBtn) {
  showQuizAnswersBtn.addEventListener('click', showQuizAnswers);
}

if (clearQuizBtn) {
  clearQuizBtn.addEventListener('click', clearQuiz);
}

/* Search Input Event Handlers */
if (quizSearchInput) {
  quizSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const suggestions = filterPaperSuggestions(query);
    showSuggestions(suggestions, quizSuggestions, quizSearchInput);
  });
  
  quizSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      hideSuggestions(quizSuggestions);
      if (quizSearchBtn) quizSearchBtn.click();
    }
  });
  
  quizSearchInput.addEventListener('blur', () => {
    // Delay hiding to allow clicks on suggestions
    setTimeout(() => hideSuggestions(quizSuggestions), 200);
  });
}

if (sourcesSearchInput) {
  sourcesSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const suggestions = filterPaperSuggestions(query);
    showSuggestions(suggestions, sourcesSuggestions, sourcesSearchInput);
  });
  
  sourcesSearchInput.addEventListener('blur', () => {
    // Delay hiding to allow clicks on suggestions
    setTimeout(() => hideSuggestions(sourcesSuggestions), 200);
  });
}

/* Update the main search handler to show quiz card */
const originalHandleSearch = window.handleSearch;
if (typeof handleSearch === 'function') {
  window.handleSearch = function() {
    showQuizCard(); // Show quiz card when user searches
    return originalHandleSearch.apply(this, arguments);
  };
}

// Show quiz card when sources card is shown
const originalShowSourcesCard = showSourcesCard;
if (typeof showSourcesCard === 'function') {
  window.showSourcesCard = function() {
    showQuizCard();
    return originalShowSourcesCard.apply(this, arguments);
  };
}

/* Toast Notification System */
function showToastNotification(message, type = 'info', duration = 5000) {
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-message">${escapeHtmlOnce(message)}</span>
      <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  // Add styles if not already present
  if (!document.querySelector('#toast-styles')) {
    const styles = document.createElement('style');
    styles.id = 'toast-styles';
    styles.textContent = `
      .toast-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease-out;
        font-family: inherit;
      }
      
      .toast-info {
        background: #e3f2fd;
        color: #1565c0;
        border-left: 4px solid #2196f3;
      }
      
      .toast-error {
        background: #ffebee;
        color: #c62828;
        border-left: 4px solid #f44336;
      }
      
      .toast-success {
        background: #e8f5e8;
        color: #2e7d32;
        border-left: 4px solid #4caf50;
      }
      
      .toast-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .toast-message {
        flex: 1;
        margin-right: 1rem;
      }
      
      .toast-close {
        background: none;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        opacity: 0.7;
      }
      
      .toast-close:hover {
        opacity: 1;
        background: rgba(0,0,0,0.1);
      }
      
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(styles);
  }
  
  // Add to page
  document.body.appendChild(toast);
  
  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }
}

console.info('Quiz functionality and search suggestions initialized');
