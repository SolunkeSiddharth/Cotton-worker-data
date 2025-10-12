// Cotton Tracker with PERFECT Unicode PDF Support using html2canvas
class CottonTracker {
    constructor() {
        this.db = null;
        this.currentSession = [];
        this.history = [];
        this.currentEditId = null;
        this.currentEditDate = null;
        this.currentEditIndex = null;
        this.confirmCallback = null;
        this.activeTab = 'today';

        this.init();
    }

    async init() {
        try {
            await this.initDB();
            this.setupEventListeners();
            this.setDefaultDate();
            await this.loadCurrentSession();
            await this.loadHistory();
            this.showToast('Cotton Tracker ready! Perfect Marathi PDF support enabled!', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Failed to initialize app', 'error');
        }
    }

    // Enhanced IndexedDB Setup (same as before)
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CottonTrackerDB', 2);

            request.onerror = () => {
                console.error('Database initialization failed:', request.error);
                reject(request.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('currentSession')) {
                    const currentStore = db.createObjectStore('currentSession', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    currentStore.createIndex('date', 'date', { unique: false });
                    currentStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'date' });
                    historyStore.createIndex('date', 'date', { unique: true });
                }
            };
        });
    }

    // Utility Functions (same as before)
    formatDate(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    formatDateDisplay(dateString) {
        const date = this.parseDate(dateString);
        return date.toLocaleDateString('en-IN', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    parseDate(dateString) {
        const [day, month, year] = dateString.split('-');
        return new Date(year, month - 1, day);
    }

    setDefaultDate() {
        const today = new Date();
        const dateInput = document.getElementById('work-date');
        if (dateInput) {
            dateInput.value = today.toISOString().split('T')[0];
        }
    }

    evaluateExpression(expression) {
        try {
            const cleaned = expression.replace(/\s/g, '');

            if (!/^[\d+\-*/().]+$/.test(cleaned)) {
                throw new Error('केवल संख्या और +, -, *, /, () का उपयोग करें');
            }

            const result = Function('"use strict"; return (' + cleaned + ')')();

            if (isNaN(result) || !isFinite(result) || result < 0) {
                throw new Error('गलत परिणाम');
            }

            return parseFloat(result.toFixed(3));
        } catch (error) {
            throw new Error('गलत गणना: ' + expression);
        }
    }

    // Event Listeners Setup (same as before)
    setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Form Submission
        const form = document.getElementById('add-worker-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addWorkerEntry();
            });
        }

        // Complete Day Button
        const completeDayBtn = document.getElementById('complete-day-btn');
        if (completeDayBtn) {
            completeDayBtn.addEventListener('click', () => this.completeDay());
        }

        // Generate Full Report
        const generateReportBtn = document.getElementById('generate-full-report');
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => this.generateFullReport());
        }

        // Export All Button
        const exportAllBtn = document.getElementById('export-all-btn');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => this.generateFullReport());
        }

        // Search Functionality
        const searchInput = document.getElementById('search-history');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.debounce(() => this.filterHistory(e.target.value), 300)();
            });
        }

        // Modal Events
        this.setupModalEvents();

        // FAB for Mobile
        const fab = document.getElementById('mobile-add-btn');
        if (fab) {
            fab.addEventListener('click', () => {
                this.switchTab('today');
                document.getElementById('worker-name')?.focus();
            });
        }

        // Auto-save form data
        this.setupAutoSave();
    }

    setupModalEvents() {
        const editClose = document.getElementById('edit-modal-close');
        const editCancel = document.getElementById('edit-cancel');
        const editSave = document.getElementById('edit-save');

        if (editClose) editClose.addEventListener('click', () => this.hideModal('edit-modal'));
        if (editCancel) editCancel.addEventListener('click', () => this.hideModal('edit-modal'));
        if (editSave) editSave.addEventListener('click', () => this.saveEdit());

        const confirmClose = document.getElementById('confirm-modal-close');
        const confirmCancel = document.getElementById('confirm-cancel');
        const confirmOk = document.getElementById('confirm-ok');

        if (confirmClose) confirmClose.addEventListener('click', () => this.hideModal('confirm-modal'));
        if (confirmCancel) confirmCancel.addEventListener('click', () => this.hideModal('confirm-modal'));
        if (confirmOk) confirmOk.addEventListener('click', () => this.handleConfirmAction());

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });
    }

    setupAutoSave() {
        const inputs = ['kg-collected', 'rate-per-kg'];
        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    localStorage.setItem(`cotton-tracker-${inputId}`, input.value);
                });

                const saved = localStorage.getItem(`cotton-tracker-${inputId}`);
                if (saved) {
                    input.value = saved;
                }
            }
        });
    }

    // Tab Management (same as before)
    switchTab(tabName) {
        this.activeTab = tabName;

        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            const isActive = content.id === `${tabName}-content`;
            content.classList.toggle('active', isActive);
        });

        if (tabName === 'history') {
            this.loadHistory();
        } else if (tabName === 'reports') {
            this.updateReportsOverview();
        }

        window.history.replaceState(null, null, `#${tabName}`);
    }

    // Worker Entry Management (same as before but with better messages)
    async addWorkerEntry() {
        this.showLoading(true);

        try {
            const nameInput = document.getElementById('worker-name');
            const kgInput = document.getElementById('kg-collected');
            const rateInput = document.getElementById('rate-per-kg');
            const dateInput = document.getElementById('work-date');

            const name = nameInput?.value.trim();
            const kgExpression = kgInput?.value.trim();
            const rate = parseFloat(rateInput?.value);
            const dateValue = dateInput?.value;

            if (!name) {
                throw new Error('कृपया कामगार का नाम दर्ज करें');
            }

            if (name.length < 2) {
                throw new Error('नाम कम से कम 2 अक्षरों का होना चाहिए');
            }

            if (!kgExpression) {
                throw new Error('कृपया किलो की मात्रा दर्ज करें');
            }

            if (!rate || rate <= 0 || rate > 1000) {
                throw new Error('कृपया वैध दर दर्ज करें (1-1000)');
            }

            if (!dateValue) {
                throw new Error('कृपया तारीख चुनें');
            }

            const kg = this.evaluateExpression(kgExpression);
            const total = Math.round(kg * rate * 100) / 100;
            const formattedDate = this.formatDate(dateValue);

            const entry = {
                name: name,
                kg: kg,
                rate: rate,
                total: total,
                date: formattedDate,
                timestamp: new Date().toISOString(),
                saved: false
            };

            await this.saveCurrentEntry(entry);
            await this.loadCurrentSession();

            if (nameInput) nameInput.value = '';
            if (kgInput) kgInput.value = '';

            localStorage.removeItem('cotton-tracker-kg-collected');

            if (nameInput) nameInput.focus();

            this.showToast(`${name} को सफलतापूर्वक जोड़ा गया - PDF में perfect दिखेगा!`, 'success');

        } catch (error) {
            console.error('Add entry error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Database operations (same as before)
    async saveCurrentEntry(entry) {
        try {
            const transaction = this.db.transaction(['currentSession'], 'readwrite');
            const store = transaction.objectStore('currentSession');

            return new Promise((resolve, reject) => {
                const request = store.add(entry);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            throw new Error('डेटा सेव नहीं हो सका');
        }
    }

    async loadCurrentSession() {
        try {
            const transaction = this.db.transaction(['currentSession'], 'readonly');
            const store = transaction.objectStore('currentSession');

            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    this.currentSession = request.result.sort((a, b) => 
                        new Date(b.timestamp) - new Date(a.timestamp)
                    );
                    this.renderCurrentSession();
                    this.updateTodayStats();
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Load session error:', error);
            this.showToast('डेटा लोड नहीं हो सका', 'error');
        }
    }

    renderCurrentSession() {
        const container = document.getElementById('today-entries');
        if (!container) return;

        if (this.currentSession.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>आज कोई एंट्री नहीं है</p>
                    <small>ऊपर से पहली एंट्री जोड़ें - Marathi names perfect दिखेंगे!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.currentSession.map((entry, index) => `
            <div class="entry-item" data-entry-id="${entry.id}">
                <div class="entry-info">
                    <div class="entry-name">${this.escapeHtml(entry.name)}</div>
                    <div class="entry-detail">
                        <div class="entry-detail-label">KG</div>
                        <div class="entry-detail-value">${entry.kg}</div>
                    </div>
                    <div class="entry-detail">
                        <div class="entry-detail-label">Rate</div>
                        <div class="entry-detail-value">₹${entry.rate}</div>
                    </div>
                    <div class="entry-detail">
                        <div class="entry-detail-label">Total</div>
                        <div class="entry-detail-value">₹${entry.total.toFixed(2)}</div>
                    </div>
                </div>
                <div class="entry-actions">
                    <button class="btn btn-outline btn-icon" onclick="cottonTracker.editCurrentEntry(${entry.id}, ${index})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-icon" onclick="cottonTracker.deleteCurrentEntry(${entry.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        const completeDayBtn = document.getElementById('complete-day-btn');
        if (completeDayBtn) {
            completeDayBtn.style.display = this.currentSession.length > 0 ? 'flex' : 'none';
        }
    }

    updateTodayStats() {
        const totalWorkers = this.currentSession.length;
        const totalKg = this.currentSession.reduce((sum, entry) => sum + entry.kg, 0);
        const totalAmount = this.currentSession.reduce((sum, entry) => sum + entry.total, 0);

        const workersEl = document.getElementById('today-workers');
        const kgEl = document.getElementById('today-kg');
        const amountEl = document.getElementById('today-amount');

        if (workersEl) workersEl.textContent = totalWorkers;
        if (kgEl) kgEl.textContent = totalKg.toFixed(1);
        if (amountEl) amountEl.textContent = `₹${totalAmount.toFixed(0)}`;
    }

    // Edit and delete functions (same logic as before)
    async editCurrentEntry(entryId, index) {
        const entry = this.currentSession.find(e => e.id === entryId);
        if (!entry) {
            this.showToast('एंट्री नहीं मिली', 'error');
            return;
        }

        this.currentEditId = entryId;
        this.currentEditIndex = index;
        this.currentEditDate = null;

        const editName = document.getElementById('edit-name');
        const editKg = document.getElementById('edit-kg');
        const editRate = document.getElementById('edit-rate');

        if (editName) editName.value = entry.name;
        if (editKg) editKg.value = entry.kg;
        if (editRate) editRate.value = entry.rate;

        this.showModal('edit-modal');
    }

    async saveEdit() {
        this.showLoading(true);

        try {
            const name = document.getElementById('edit-name')?.value.trim();
            const kg = parseFloat(document.getElementById('edit-kg')?.value);
            const rate = parseFloat(document.getElementById('edit-rate')?.value);

            if (!name || name.length < 2) {
                throw new Error('कृपया वैध नाम दर्ज करें');
            }

            if (!kg || kg <= 0 || kg > 1000) {
                throw new Error('कृपया वैध किलो दर्ज करें (0-1000)');
            }

            if (!rate || rate <= 0 || rate > 1000) {
                throw new Error('कृपया वैध दर दर्ज करें (0-1000)');
            }

            if (this.currentEditId && !this.currentEditDate) {
                await this.updateCurrentSessionEntry(this.currentEditId, { name, kg, rate });
            } else if (this.currentEditDate) {
                await this.updateHistoryEntry(this.currentEditDate, this.currentEditIndex, { name, kg, rate });
            }

            this.hideModal('edit-modal');
            this.showToast('सफलतापूर्वक अपडेट किया गया', 'success');
            this.resetEditState();

        } catch (error) {
            console.error('Save edit error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async updateCurrentSessionEntry(entryId, updates) {
        const transaction = this.db.transaction(['currentSession'], 'readwrite');
        const store = transaction.objectStore('currentSession');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(entryId);
            getRequest.onsuccess = () => {
                const entry = getRequest.result;
                entry.name = updates.name;
                entry.kg = updates.kg;
                entry.rate = updates.rate;
                entry.total = Math.round(updates.kg * updates.rate * 100) / 100;
                entry.timestamp = new Date().toISOString();

                const putRequest = store.put(entry);
                putRequest.onsuccess = async () => {
                    await this.loadCurrentSession();
                    resolve();
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteCurrentEntry(entryId) {
        const entry = this.currentSession.find(e => e.id === entryId);
        if (!entry) return;

        this.showConfirmDialog(
            'एंट्री डिलीट करें',
            `क्या आप ${entry.name} की एंट्री डिलीट करना चाहते हैं?`,
            async () => {
                try {
                    this.showLoading(true);
                    const transaction = this.db.transaction(['currentSession'], 'readwrite');
                    const store = transaction.objectStore('currentSession');

                    return new Promise((resolve, reject) => {
                        const request = store.delete(entryId);
                        request.onsuccess = async () => {
                            await this.loadCurrentSession();
                            this.showToast('एंट्री डिलीट हो गई', 'success');
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    this.showToast('डिलीट नहीं हो सका', 'error');
                } finally {
                    this.showLoading(false);
                }
            }
        );
    }

    // Complete day and history management (same as before)
    async completeDay() {
        if (this.currentSession.length === 0) {
            this.showToast('कोई एंट्री नहीं है', 'warning');
            return;
        }

        const dateInput = document.getElementById('work-date');
        const formattedDate = this.formatDate(dateInput?.value || new Date());

        this.showConfirmDialog(
            'दिन पूरा करें',
            `${formattedDate} के लिए ${this.currentSession.length} एंट्रीज को हिस्ट्री में सेव करना चाहते हैं?`,
            async () => {
                try {
                    this.showLoading(true);

                    const totalKg = this.currentSession.reduce((sum, entry) => sum + entry.kg, 0);
                    const totalAmount = this.currentSession.reduce((sum, entry) => sum + entry.total, 0);

                    const historyEntry = {
                        date: formattedDate,
                        entries: this.currentSession.map(entry => ({
                            name: entry.name,
                            kg: entry.kg,
                            rate: entry.rate,
                            total: entry.total
                        })),
                        totalWorkers: this.currentSession.length,
                        totalKg: Math.round(totalKg * 100) / 100,
                        totalAmount: Math.round(totalAmount * 100) / 100,
                        completedAt: new Date().toISOString()
                    };

                    await this.saveToHistory(historyEntry);
                    await this.clearCurrentSession();
                    await this.loadCurrentSession();
                    await this.loadHistory();

                    this.showToast(`${formattedDate} का दिन पूरा हुआ - PDF ready with perfect Marathi!`, 'success');

                } catch (error) {
                    console.error('Complete day error:', error);
                    this.showToast('दिन पूरा नहीं हो सका', 'error');
                } finally {
                    this.showLoading(false);
                }
            }
        );
    }

    async saveToHistory(historyEntry) {
        const transaction = this.db.transaction(['history'], 'readwrite');
        const store = transaction.objectStore('history');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(historyEntry.date);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                if (existing) {
                    historyEntry.entries = [...existing.entries, ...historyEntry.entries];
                    historyEntry.totalWorkers = existing.totalWorkers + historyEntry.totalWorkers;
                    historyEntry.totalKg = Math.round((existing.totalKg + historyEntry.totalKg) * 100) / 100;
                    historyEntry.totalAmount = Math.round((existing.totalAmount + historyEntry.totalAmount) * 100) / 100;
                }

                const putRequest = store.put(historyEntry);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async clearCurrentSession() {
        const transaction = this.db.transaction(['currentSession'], 'readwrite');
        const store = transaction.objectStore('currentSession');

        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // History management (similar to before)
    async loadHistory() {
        try {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');

            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    this.history = request.result.sort((a, b) => 
                        this.parseDate(b.date) - this.parseDate(a.date)
                    );
                    this.renderHistory(this.history);
                    this.updateReportsOverview();
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Load history error:', error);
            this.showToast('हिस्ट्री लोड नहीं हो सकी', 'error');
        }
    }

    renderHistory(history = this.history) {
        const container = document.getElementById('history-list');
        if (!container) return;

        if (history.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>कोई हिस्ट्री नहीं है</p>
                    <small>पहले कुछ दिन पूरे करें - perfect Marathi PDF बनेंगे!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = history.map(record => `
            <div class="history-item" data-date="${record.date}">
                <div class="history-header" onclick="cottonTracker.toggleHistoryDetails('${record.date}')">
                    <div>
                        <div class="history-date">${this.formatDateDisplay(record.date)}</div>
                        <div class="history-summary">
                            <span><i class="fas fa-users"></i> ${record.totalWorkers} workers</span>
                            <span><i class="fas fa-weight-hanging"></i> ${record.totalKg.toFixed(1)} KG</span>
                            <span><i class="fas fa-rupee-sign"></i> ₹${record.totalAmount.toFixed(0)}</span>
                        </div>
                    </div>
                    <div class="history-toggle">
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
                <div class="history-content">
                    <div class="history-actions">
                        <button class="btn btn-outline btn-sm" onclick="cottonTracker.generateUnicodePDF('${record.date}')">
                            <i class="fas fa-file-pdf"></i> Perfect PDF (Marathi ✓)
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="cottonTracker.deleteHistoryDay('${record.date}')">
                            <i class="fas fa-trash"></i> Delete Day
                        </button>
                    </div>
                    <div class="entries-list">
                        ${record.entries.map((entry, index) => `
                            <div class="entry-item">
                                <div class="entry-info">
                                    <div class="entry-name">${this.escapeHtml(entry.name)}</div>
                                    <div class="entry-detail">
                                        <div class="entry-detail-label">KG</div>
                                        <div class="entry-detail-value">${entry.kg}</div>
                                    </div>
                                    <div class="entry-detail">
                                        <div class="entry-detail-label">Rate</div>
                                        <div class="entry-detail-value">₹${entry.rate}</div>
                                    </div>
                                    <div class="entry-detail">
                                        <div class="entry-detail-label">Total</div>
                                        <div class="entry-detail-value">₹${entry.total.toFixed(2)}</div>
                                    </div>
                                </div>
                                <div class="entry-actions">
                                    <button class="btn btn-outline btn-icon" onclick="cottonTracker.editHistoryEntry('${record.date}', ${index})" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-icon" onclick="cottonTracker.deleteHistoryEntry('${record.date}', ${index})" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    toggleHistoryDetails(date) {
        const item = document.querySelector(`[data-date="${date}"]`);
        if (!item) return;

        const isExpanded = item.classList.contains('expanded');

        document.querySelectorAll('.history-item.expanded').forEach(expandedItem => {
            if (expandedItem !== item) {
                expandedItem.classList.remove('expanded');
            }
        });

        item.classList.toggle('expanded', !isExpanded);
    }

    filterHistory(searchTerm) {
        if (!searchTerm.trim()) {
            this.renderHistory(this.history);
            return;
        }

        const filtered = this.history.filter(record => {
            const searchLower = searchTerm.toLowerCase();
            const dateMatch = record.date.toLowerCase().includes(searchLower);
            const workerMatch = record.entries.some(entry => 
                entry.name.toLowerCase().includes(searchLower)
            );
            return dateMatch || workerMatch;
        });

        this.renderHistory(filtered);
    }

    // REVOLUTIONARY PDF GENERATION using html2canvas for perfect Unicode support!
    async generateUnicodePDF(date) {
        try {
            this.showPDFProgress(true);
            this.updateProgress(0);

            const record = this.history.find(r => r.date === date);
            if (!record) {
                throw new Error('रिकॉर्ड नहीं मिला');
            }

            await this.createPerfectUnicodePDF([record], `CottonReport_${date.replace(/-/g, '')}.pdf`);
            this.showToast('Perfect PDF with Marathi names created! 🎉', 'success');

        } catch (error) {
            console.error('PDF generation error:', error);
            this.showToast('PDF नहीं बन सका - कृपया फिर कोशिश करें', 'error');
        } finally {
            this.showPDFProgress(false);
        }
    }

    async generateFullReport() {
        try {
            this.showPDFProgress(true);
            this.updateProgress(0);

            if (this.history.length === 0) {
                this.showToast('कोई डेटा उपलब्ध नहीं है', 'warning');
                return;
            }

            const sortedHistory = this.history.sort((a, b) => 
                this.parseDate(a.date) - this.parseDate(b.date)
            );

            await this.createPerfectUnicodePDF(sortedHistory, 'CottonFullReport_Perfect.pdf');
            this.showToast('Perfect Full Report with all Marathi names created! 🎉', 'success');

        } catch (error) {
            console.error('Full report error:', error);
            this.showToast('रिपोर्ट नहीं बन सकी', 'error');
        } finally {
            this.showPDFProgress(false);
        }
    }

    // PERFECT Unicode PDF Generation using html2canvas
    async createPerfectUnicodePDF(historyRecords, filename) {
        if (!window.html2canvas || !window.jspdf) {
            throw new Error('Required libraries not loaded');
        }

        this.updateProgress(10);

        // Create HTML content for PDF
        const pdfHtml = this.generatePDFHTML(historyRecords);

        // Insert into hidden div
        const pdfTemplate = document.getElementById('pdf-template');
        pdfTemplate.innerHTML = pdfHtml;
        pdfTemplate.style.display = 'block';

        this.updateProgress(30);

        // Wait for fonts to load
        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 500));

        this.updateProgress(50);

        try {
            // Capture as image with high quality
            const canvas = await html2canvas(pdfTemplate, {
                scale: 2, // High quality
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: pdfTemplate.scrollWidth,
                height: pdfTemplate.scrollHeight
            });

            this.updateProgress(70);

            // Create PDF
            const { jsPDF } = window.jspdf;
            const imgWidth = 210; // A4 width in mm
            const pageHeight = 295; // A4 height in mm  
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            const pdf = new jsPDF('p', 'mm');
            const imgData = canvas.toDataURL('image/png');

            this.updateProgress(80);

            // Add first page
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            // Add additional pages if needed
            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            this.updateProgress(90);

            // Save PDF
            pdf.save(filename);

            this.updateProgress(100);

            // Hide template
            pdfTemplate.style.display = 'none';
            pdfTemplate.innerHTML = '';

        } catch (error) {
            // Hide template on error
            pdfTemplate.style.display = 'none';
            pdfTemplate.innerHTML = '';
            throw error;
        }
    }

    generatePDFHTML(historyRecords) {
        let grandTotalKg = 0;
        let grandTotalAmount = 0;
        let grandTotalWorkers = 0;

        const recordsHTML = historyRecords.map(record => {
            grandTotalKg += record.totalKg;
            grandTotalAmount += record.totalAmount;
            grandTotalWorkers += record.totalWorkers;

            const entriesHTML = record.entries.map(entry => `
                <tr>
                    <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${record.date}</td>
                    <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">₹${entry.rate}</td>
                    <td style="padding: 12px; border: 1px solid #ddd; font-family: 'Noto Sans Devanagari', Arial, sans-serif; font-size: 14px; font-weight: 500;">${entry.name}</td>
                    <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${entry.kg} KG</td>
                </tr>
            `).join('');

            return `
                <div style="margin-bottom: 30px;">
                    <h3 style="color: #00b894; font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #00b894; padding-bottom: 5px;">
                        📅 ${record.date} - ${record.totalWorkers} Workers, ${record.totalKg.toFixed(2)} KG, ₹${record.totalAmount.toFixed(2)}
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <thead>
                            <tr style="background: #00b894; color: white;">
                                <th style="padding: 15px; border: 1px solid #ddd; font-weight: 600;">Date</th>
                                <th style="padding: 15px; border: 1px solid #ddd; font-weight: 600;">Rate per KG</th>
                                <th style="padding: 15px; border: 1px solid #ddd; font-weight: 600;">Worker Name</th>
                                <th style="padding: 15px; border: 1px solid #ddd; font-weight: 600;">Total KG Collected</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${entriesHTML}
                            <tr style="background: #f8f9fa; font-weight: 600;">
                                <td style="padding: 12px; border: 1px solid #ddd; text-align: center;"><strong>TOTAL</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">-</td>
                                <td style="padding: 12px; border: 1px solid #ddd; font-family: 'Noto Sans Devanagari', Arial, sans-serif;"><strong>${record.totalWorkers} Workers</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd; text-align: center;"><strong>${record.totalKg.toFixed(2)} KG</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');

        const grandTotalHTML = historyRecords.length > 1 ? `
            <div style="margin-top: 40px; padding: 20px; background: linear-gradient(135deg, #00b894, #00d2a0); color: white; border-radius: 10px;">
                <h2 style="margin: 0 0 20px 0; text-align: center;">📊 GRAND SUMMARY</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tbody>
                        <tr>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); font-weight: 600;">Total Days:</td>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); text-align: right;">${historyRecords.length} days</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); font-weight: 600;">Total Workers (All Days):</td>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); text-align: right;">${grandTotalWorkers} workers</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); font-weight: 600;">Total KG Collected:</td>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); text-align: right;">${grandTotalKg.toFixed(2)} KG</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); font-weight: 600;">Total Amount Paid:</td>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); text-align: right;">₹${grandTotalAmount.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); font-weight: 600;">Average per Day:</td>
                            <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.3); text-align: right;">₹${(grandTotalAmount / historyRecords.length).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        ` : '';

        return `
            <div style="font-family: 'Poppins', sans-serif; line-height: 1.6; color: #2d3436; max-width: 800px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 40px; border-bottom: 3px solid #00b894; padding-bottom: 20px;">
                    <h1 style="color: #00b894; font-size: 32px; margin-bottom: 10px; font-weight: 700;">🌱 Cotton Workers Report</h1>
                    <h2 style="color: #636e72; font-family: 'Noto Sans Devanagari', Arial, sans-serif; font-size: 20px; margin: 0; font-weight: 500;">कपास कामगार रिपोर्ट</h2>
                    <p style="color: #b2bec3; margin-top: 10px; font-size: 14px;">Generated: ${new Date().toLocaleDateString('hi-IN')} ${new Date().toLocaleTimeString('hi-IN')}</p>
                </div>

                ${recordsHTML}

                ${grandTotalHTML}

                <div style="margin-top: 50px; text-align: center; padding-top: 20px; border-top: 1px solid #e9ecef; color: #b2bec3; font-size: 12px;">
                    <p>Cotton Tracker App • कपास ट्रैकर ऐप</p>
                    <p>Perfect Unicode Support for Marathi Names ✓</p>
                </div>
            </div>
        `;
    }

    // Progress and UI methods
    showPDFProgress(show) {
        const progress = document.getElementById('pdf-progress');
        if (progress) {
            progress.style.display = show ? 'flex' : 'none';
        }
    }

    updateProgress(percent) {
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            progressFill.style.width = `${percent}%`;
        }
    }

    // Other history management methods (similar to before)
    async editHistoryEntry(date, entryIndex) {
        try {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');

            return new Promise((resolve, reject) => {
                const request = store.get(date);
                request.onsuccess = () => {
                    const historyRecord = request.result;
                    const entry = historyRecord.entries[entryIndex];

                    this.currentEditDate = date;
                    this.currentEditIndex = entryIndex;
                    this.currentEditId = null;

                    document.getElementById('edit-name').value = entry.name;
                    document.getElementById('edit-kg').value = entry.kg;
                    document.getElementById('edit-rate').value = entry.rate;

                    this.showModal('edit-modal');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            this.showToast('एंट्री लोड नहीं हो सकी', 'error');
        }
    }

    async updateHistoryEntry(date, entryIndex, updates) {
        const transaction = this.db.transaction(['history'], 'readwrite');
        const store = transaction.objectStore('history');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(date);
            getRequest.onsuccess = () => {
                const historyRecord = getRequest.result;
                const entry = historyRecord.entries[entryIndex];

                entry.name = updates.name;
                entry.kg = updates.kg;
                entry.rate = updates.rate;
                entry.total = Math.round(updates.kg * updates.rate * 100) / 100;

                historyRecord.totalKg = historyRecord.entries.reduce((sum, e) => sum + e.kg, 0);
                historyRecord.totalAmount = historyRecord.entries.reduce((sum, e) => sum + e.total, 0);

                const putRequest = store.put(historyRecord);
                putRequest.onsuccess = async () => {
                    await this.loadHistory();
                    resolve();
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteHistoryEntry(date, entryIndex) {
        this.showConfirmDialog(
            'एंट्री डिलीट करें',
            'क्या आप इस एंट्री को डिलीट करना चाहते हैं?',
            async () => {
                try {
                    const transaction = this.db.transaction(['history'], 'readwrite');
                    const store = transaction.objectStore('history');

                    return new Promise((resolve, reject) => {
                        const getRequest = store.get(date);
                        getRequest.onsuccess = () => {
                            const historyRecord = getRequest.result;
                            historyRecord.entries.splice(entryIndex, 1);

                            if (historyRecord.entries.length === 0) {
                                const deleteRequest = store.delete(date);
                                deleteRequest.onsuccess = async () => {
                                    await this.loadHistory();
                                    this.showToast('एंट्री डिलीट हो गई', 'success');
                                    resolve();
                                };
                                deleteRequest.onerror = () => reject(deleteRequest.error);
                            } else {
                                historyRecord.totalKg = historyRecord.entries.reduce((sum, e) => sum + e.kg, 0);
                                historyRecord.totalAmount = historyRecord.entries.reduce((sum, e) => sum + e.total, 0);

                                const putRequest = store.put(historyRecord);
                                putRequest.onsuccess = async () => {
                                    await this.loadHistory();
                                    this.showToast('एंट्री डिलीट हो गई', 'success');
                                    resolve();
                                };
                                putRequest.onerror = () => reject(putRequest.error);
                            }
                        };
                        getRequest.onerror = () => reject(getRequest.error);
                    });
                } catch (error) {
                    this.showToast('डिलीट नहीं हो सका', 'error');
                }
            }
        );
    }

    async deleteHistoryDay(date) {
        this.showConfirmDialog(
            'दिन डिलीट करें',
            `क्या आप ${date} के सभी रिकॉर्ड डिलीट करना चाहते हैं?`,
            async () => {
                try {
                    const transaction = this.db.transaction(['history'], 'readwrite');
                    const store = transaction.objectStore('history');

                    return new Promise((resolve, reject) => {
                        const request = store.delete(date);
                        request.onsuccess = async () => {
                            await this.loadHistory();
                            this.showToast('दिन डिलीट हो गया', 'success');
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    this.showToast('डिलीट नहीं हो सका', 'error');
                }
            }
        );
    }

    updateReportsOverview() {
        const totalDays = this.history.length;
        const totalWorkers = this.history.reduce((sum, record) => sum + record.totalWorkers, 0);
        const totalKg = this.history.reduce((sum, record) => sum + record.totalKg, 0);
        const totalAmount = this.history.reduce((sum, record) => sum + record.totalAmount, 0);

        const elements = {
            'total-days': totalDays,
            'total-workers': totalWorkers,
            'total-kg': `${totalKg.toFixed(1)} KG`,
            'total-amount': `₹${totalAmount.toFixed(0)}`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    // Utility functions
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    resetEditState() {
        this.currentEditId = null;
        this.currentEditDate = null;
        this.currentEditIndex = null;
    }

    // UI Methods
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            const firstInput = modal.querySelector('input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    showConfirmDialog(title, message, onConfirm) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        this.confirmCallback = onConfirm;
        this.showModal('confirm-modal');
    }

    handleConfirmAction() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.confirmCallback = null;
        this.hideModal('confirm-modal');
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.toggle('active', show);
        }
    }

    showToast(message, type = 'info', duration = 5000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span>${message}</span>
            </div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, duration);

        toast.addEventListener('click', () => {
            toast.remove();
        });
    }
}

// Initialize the application
let cottonTracker;
document.addEventListener('DOMContentLoaded', () => {
    cottonTracker = new CottonTracker();

    const hash = window.location.hash.slice(1);
    if (['today', 'history', 'reports'].includes(hash)) {
        cottonTracker.switchTab(hash);
    }
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
    if (window.cottonTracker) {
        cottonTracker.showToast('कुछ गलत हुआ - कृपया page refresh करें', 'error');
    }
});
