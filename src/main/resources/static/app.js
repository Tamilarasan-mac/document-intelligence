// Document Intelligence Chatbot Client Logic
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const uploadLoader = document.getElementById('upload-loader');
  const dropzoneContent = dropzone.querySelector('.dropzone-content');
  const uploadStatus = document.getElementById('upload-status');
  const docList = document.getElementById('doc-list');
  const docCounter = document.getElementById('doc-counter');

  const modeAskBtn = document.getElementById('mode-ask-btn');
  const modeSearchBtn = document.getElementById('mode-search-btn');
  const modeIndicator = document.getElementById('mode-indicator');
  const clearChatBtn = document.getElementById('clear-chat-btn');

  const chatMessages = document.getElementById('chat-messages');
  const chatTextarea = document.getElementById('chat-textarea');
  const sendBtn = document.getElementById('send-btn');
  const stopBtn = document.getElementById('stop-btn');
  const welcomeCard = document.getElementById('welcome-card');
  const toast = document.getElementById('toast');

  // Modal elements
  const sourceModal = document.getElementById('source-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalDocTitle = document.getElementById('modal-doc-title');
  const modalChunkId = document.getElementById('modal-chunk-id');
  const modalChunkContent = document.getElementById('modal-chunk-content');

  // State
  let currentMode = 'ask'; // 'ask' or 'search'
  let isGenerating = false;
  let indexedDocs = [];
  let currentAbortController = null;
  let toastTimeout = null;

  // 1. Mode toggling
  modeAskBtn.addEventListener('click', () => {
    if (currentMode === 'ask') return;
    currentMode = 'ask';
    modeAskBtn.classList.add('active');
    modeSearchBtn.classList.remove('active');
    modeIndicator.innerHTML = 'Mode: <strong>Ask AI (RAG with Qwen2.5)</strong>';
    chatTextarea.placeholder = 'Ask a question about your indexed documents...';
  });

  modeSearchBtn.addEventListener('click', () => {
    if (currentMode === 'search') return;
    currentMode = 'search';
    modeSearchBtn.classList.add('active');
    modeAskBtn.classList.remove('active');
    modeIndicator.innerHTML = 'Mode: <strong>Direct Chunk Search (pgvector)</strong>';
    chatTextarea.placeholder = 'Search semantic chunks with query...';
  });

  // 2. Clear Chat
  clearChatBtn.addEventListener('click', () => {
    if (isGenerating && currentAbortController) {
      currentAbortController.abort();
    }
    chatMessages.innerHTML = '';
    if (welcomeCard) {
      chatMessages.appendChild(welcomeCard);
      attachSuggestionHandlers();
    }
  });

  // 3. Suggestion chips handler
  function attachSuggestionHandlers() {
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          chatTextarea.value = prompt;
          autoResizeTextarea();
          handleSendMessage();
        }
      });
    });
  }
  attachSuggestionHandlers();

  // 4. Drag & Drop and Upload File
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  ['dragleave', 'dragend'].forEach(type => {
    dropzone.addEventListener(type, () => dropzone.classList.remove('dragover'));
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
      fileInput.value = '';
    }
  });

  async function handleFileUpload(file) {
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExt) {
      showUploadStatus('Invalid file extension. Only .pdf, .docx, and .txt are supported.', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showUploadStatus('File size exceeds the 10 MB limit.', 'error');
      return;
    }

    dropzoneContent.classList.add('hidden');
    uploadLoader.classList.remove('hidden');
    uploadStatus.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        let msg = data.error || `Upload failed with status ${response.status}`;
        showUploadStatus(msg, 'error');
      } else {
        showUploadStatus(`"${file.name}" indexed successfully (${data.totalChunks || 0} chunks).`, 'success');
        addIndexedDoc({
          filename: file.name,
          chunks: data.totalChunks || 0,
          documentId: data.documentId
        });
      }
    } catch (err) {
      showUploadStatus(`Network error: ${err.message}`, 'error');
    } finally {
      dropzoneContent.classList.remove('hidden');
      uploadLoader.classList.add('hidden');
    }
  }

  function showUploadStatus(message, type, autoDismissMs = 6000) {
    uploadStatus.textContent = message;
    uploadStatus.className = `status-banner ${type}`;
    uploadStatus.classList.remove('hidden');
    if (autoDismissMs > 0) {
      setTimeout(() => {
        uploadStatus.classList.add('hidden');
      }, autoDismissMs);
    }
  }

  function addIndexedDoc(doc) {
    indexedDocs.push(doc);
    renderDocList();
  }

  function renderDocList() {
    docCounter.textContent = indexedDocs.length;
    if (indexedDocs.length === 0) {
      docList.innerHTML = `
        <div class="empty-docs-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          <span>No documents uploaded yet in this session.</span>
        </div>`;
      return;
    }

    docList.innerHTML = indexedDocs.map(doc => `
      <div class="doc-item" title="Document ID: ${doc.documentId || 'N/A'}">
        <div class="doc-info">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span class="doc-name">${escapeHtml(doc.filename)}</span>
        </div>
        <span class="doc-chunks">${doc.chunks} chunks</span>
      </div>
    `).join('');
  }

  // 5. Textarea auto-resize and Enter key send
  chatTextarea.addEventListener('input', () => {
    autoResizeTextarea();
    updateSendStopButtons();
  });

  chatTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled && !isGenerating) {
        handleSendMessage();
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    if (!sendBtn.disabled && !isGenerating) {
      handleSendMessage();
    }
  });

  stopBtn.addEventListener('click', () => {
    if (isGenerating && currentAbortController) {
      currentAbortController.abort();
    }
  });

  function autoResizeTextarea() {
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 150) + 'px';
  }

  function updateSendStopButtons() {
    if (isGenerating) {
      sendBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
    } else {
      stopBtn.classList.add('hidden');
      sendBtn.classList.remove('hidden');
      sendBtn.disabled = chatTextarea.value.trim().length === 0;
    }
  }

  // 6. Message Sending & Query Execution
  async function handleSendMessage(customPrompt = null, replaceTargetRow = null) {
    const question = customPrompt !== null ? customPrompt.trim() : chatTextarea.value.trim();
    if (!question || isGenerating) return;

    // Remove welcome card if visible
    if (welcomeCard && welcomeCard.parentNode) {
      welcomeCard.remove();
    }

    let userRow;
    if (replaceTargetRow) {
      userRow = replaceTargetRow;
      updateUserMessageContent(userRow, question);
    } else {
      userRow = appendUserMessage(question);
      chatTextarea.value = '';
      autoResizeTextarea();
    }

    isGenerating = true;
    updateSendStopButtons();

    const loadingId = appendTypingIndicator();
    scrollToBottom();

    currentAbortController = new AbortController();
    const endpoint = currentMode === 'ask' ? '/api/documents/ask' : '/api/documents/search';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ question: question }),
        signal: currentAbortController.signal
      });

      removeMessageElement(loadingId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        let errorMsg = data.error || `Request failed (${response.status})`;
        appendErrorMessage(errorMsg, question);
      } else {
        if (currentMode === 'ask') {
          appendRagAnswer(data, question);
        } else {
          appendSearchResults(data, question);
        }
      }
    } catch (err) {
      removeMessageElement(loadingId);
      if (err.name === 'AbortError') {
        appendStoppedMessage(question);
      } else {
        appendErrorMessage(`Network error connecting to backend: ${err.message}`, question);
      }
    } finally {
      isGenerating = false;
      currentAbortController = null;
      updateSendStopButtons();
      scrollToBottom();
    }
  }

  // 7. Message Rendering with Copy, Edit, and Retry Buttons
  function appendUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'message-row user';
    row.setAttribute('data-raw-content', text);

    row.innerHTML = `
      <div class="avatar">You</div>
      <div class="message-body">
        <div class="message-content">${escapeHtml(text)}</div>
        <div class="message-actions">
          <button class="msg-action-btn edit-btn" title="Edit prompt">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Edit</span>
          </button>
          <button class="msg-action-btn copy-btn" title="Copy text">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
        </div>
      </div>
    `;

    setupUserRowEvents(row);
    chatMessages.appendChild(row);
    return row;
  }

  function updateUserMessageContent(row, newText) {
    row.setAttribute('data-raw-content', newText);
    const contentEl = row.querySelector('.message-content');
    if (contentEl) {
      contentEl.innerHTML = escapeHtml(newText);
    }
  }

  function setupUserRowEvents(row) {
    const copyBtn = row.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = row.getAttribute('data-raw-content') || '';
        copyToClipboard(text);
      });
    }

    const editBtn = row.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        startInlineEdit(row);
      });
    }
  }

  function startInlineEdit(row) {
    if (isGenerating) return;
    const bodyEl = row.querySelector('.message-body');
    const currentText = row.getAttribute('data-raw-content') || '';

    bodyEl.innerHTML = `
      <div class="inline-edit-container">
        <textarea class="inline-edit-textarea" rows="3">${escapeHtml(currentText)}</textarea>
        <div class="inline-edit-actions">
          <button class="btn-cancel-sm cancel-edit-btn">Cancel</button>
          <button class="btn-primary-sm save-edit-btn">Save & Submit</button>
        </div>
      </div>
    `;

    const textarea = bodyEl.querySelector('.inline-edit-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const cancelBtn = bodyEl.querySelector('.cancel-edit-btn');
    cancelBtn.addEventListener('click', () => {
      restoreUserRow(row, currentText);
    });

    const saveBtn = bodyEl.querySelector('.save-edit-btn');
    saveBtn.addEventListener('click', () => {
      const newPrompt = textarea.value.trim();
      if (!newPrompt) return;
      restoreUserRow(row, newPrompt);
      // Remove subsequent assistant replies following this user prompt
      removeSubsequentMessages(row);
      handleSendMessage(newPrompt, row);
    });
  }

  function restoreUserRow(row, text) {
    row.setAttribute('data-raw-content', text);
    const bodyEl = row.querySelector('.message-body');
    bodyEl.innerHTML = `
      <div class="message-content">${escapeHtml(text)}</div>
      <div class="message-actions">
        <button class="msg-action-btn edit-btn" title="Edit prompt">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          <span>Edit</span>
        </button>
        <button class="msg-action-btn copy-btn" title="Copy text">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
      </div>
    `;
    setupUserRowEvents(row);
  }

  function removeSubsequentMessages(fromRow) {
    let next = fromRow.nextElementSibling;
    while (next) {
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
    }
  }

  function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.id = id;
    row.innerHTML = `
      <div class="avatar">AI</div>
      <div class="message-body">
        <div class="message-content">
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;
    chatMessages.appendChild(row);
    return id;
  }

  function removeMessageElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function appendRagAnswer(data, question) {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    const rawAnswerText = data.answer || '';
    row.setAttribute('data-raw-content', rawAnswerText);

    const formattedAnswer = typeof marked !== 'undefined'
      ? marked.parse(rawAnswerText || 'No answer provided.')
      : `<p>${escapeHtml(rawAnswerText)}</p>`;

    let sourcesHtml = '';
    if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
      sourcesHtml = `
        <div class="sources-container">
          <div class="sources-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <span>Retrieved Sources (${data.sources.length}):</span>
          </div>
          <div class="sources-list">
            ${data.sources.map((src, i) => `
              <button class="source-badge" data-source-index="${i}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                <span>${escapeHtml(src.filename || 'Source')}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="avatar">AI</div>
      <div class="message-body">
        <div class="message-content">${formattedAnswer}</div>
        ${sourcesHtml}
        <div class="message-actions">
          <button class="msg-action-btn copy-btn" title="Copy answer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
          <button class="msg-action-btn retry-btn" title="Regenerate response">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            <span>Retry</span>
          </button>
        </div>
      </div>
    `;

    // Attach click listeners to source badges
    if (data.sources && data.sources.length > 0) {
      const badges = row.querySelectorAll('.source-badge');
      badges.forEach((badge) => {
        const idx = parseInt(badge.getAttribute('data-source-index'), 10);
        const sourceData = data.sources[idx];
        badge.addEventListener('click', () => openSourceModal(sourceData));
      });
    }

    setupAssistantRowEvents(row, question);
    chatMessages.appendChild(row);
  }

  function appendSearchResults(results, question) {
    const row = document.createElement('div');
    row.className = 'message-row assistant';

    if (!Array.isArray(results) || results.length === 0) {
      row.innerHTML = `
        <div class="avatar">AI</div>
        <div class="message-body">
          <div class="message-content">
            <p>No matching semantic chunks found for this query in the vector store.</p>
          </div>
          <div class="message-actions">
            <button class="msg-action-btn retry-btn" title="Retry search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              <span>Retry</span>
            </button>
          </div>
        </div>
      `;
    } else {
      const cardsHtml = results.map(res => `
        <div class="search-result-card">
          <div class="search-result-meta">
            <span class="search-result-source">${escapeHtml(res.source || 'Unknown')}</span>
            <span>Chunk: <code>${escapeHtml(res.chunkId ? res.chunkId.substring(0, 8) + '...' : 'N/A')}</code></span>
          </div>
          <div class="search-result-content">${escapeHtml(res.content || '')}</div>
        </div>
      `).join('');

      const rawSummary = results.map(r => `[${r.source}]: ${r.content}`).join('\n\n');
      row.setAttribute('data-raw-content', rawSummary);

      row.innerHTML = `
        <div class="avatar">AI</div>
        <div class="message-body">
          <div class="message-content">
            <p style="margin-bottom: 8px;"><strong>Found ${results.length} semantically relevant chunks:</strong></p>
            ${cardsHtml}
          </div>
          <div class="message-actions">
            <button class="msg-action-btn copy-btn" title="Copy results">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
            <button class="msg-action-btn retry-btn" title="Retry search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              <span>Retry</span>
            </button>
          </div>
        </div>
      `;
    }

    setupAssistantRowEvents(row, question);
    chatMessages.appendChild(row);
  }

  function appendErrorMessage(errorMsg, question) {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.setAttribute('data-raw-content', errorMsg);

    row.innerHTML = `
      <div class="avatar" style="background: linear-gradient(135deg, #f43f5e, #be123c);">!</div>
      <div class="message-body">
        <div class="message-content" style="border-color: rgba(244, 63, 94, 0.4); background: rgba(244, 63, 94, 0.1); color: #fda4af;">
          <strong>Error:</strong> ${escapeHtml(errorMsg)}
        </div>
        <div class="message-actions">
          <button class="msg-action-btn retry-btn" title="Retry question">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            <span>Retry</span>
          </button>
          <button class="msg-action-btn copy-btn" title="Copy error">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
        </div>
      </div>
    `;

    setupAssistantRowEvents(row, question);
    chatMessages.appendChild(row);
  }

  function appendStoppedMessage(question) {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.setAttribute('data-raw-content', 'Generation stopped by user.');

    row.innerHTML = `
      <div class="avatar" style="background: linear-gradient(135deg, #f59e0b, #d97706);">⏹</div>
      <div class="message-body">
        <div class="message-content" style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.1); color: #fde68a;">
          <em>Generation was stopped.</em>
        </div>
        <div class="message-actions">
          <button class="msg-action-btn retry-btn" title="Retry generation">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            <span>Retry</span>
          </button>
        </div>
      </div>
    `;

    setupAssistantRowEvents(row, question);
    chatMessages.appendChild(row);
  }

  function setupAssistantRowEvents(row, question) {
    const copyBtn = row.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = row.getAttribute('data-raw-content') || '';
        copyToClipboard(text);
      });
    }

    const retryBtn = row.querySelector('.retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (isGenerating) return;
        row.remove();
        handleSendMessage(question);
      });
    }
  }

  // 8. Clipboard helper
  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!');
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    } catch {
      showToast('Failed to copy');
    }
    document.body.removeChild(ta);
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2000);
  }

  // 9. Source Modal logic
  function openSourceModal(source) {
    modalDocTitle.textContent = source.filename || 'Source Document';
    modalChunkId.textContent = source.chunkId || 'Unknown Chunk';
    modalChunkContent.textContent = source.content || 'No content';
    sourceModal.classList.remove('hidden');
  }

  function closeSourceModal() {
    sourceModal.classList.add('hidden');
  }

  modalCloseBtn.addEventListener('click', closeSourceModal);
  sourceModal.addEventListener('click', (e) => {
    if (e.target === sourceModal) {
      closeSourceModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sourceModal.classList.contains('hidden')) {
      closeSourceModal();
    }
  });

  // Helpers
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
