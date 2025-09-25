// Cotton Worker Tracker - Mobile Optimized Application
class CottonTracker {
    constructor() {
        this.db = null;
        this.currentSession = [];
        this.currentEditId = null;
        this.currentEditDate = null;
        this.currentEditIndex = null;
        
        this.init();
    }

    async init() {
        await this.initDB();
        this.setupEventListeners();
        this.setDefaultDate();
        await this.loadCurrentSession();
        await this.loadHistory();
    }

    // IndexedDB Setup
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CottonTrackerDB', 1);
            
            request.onerror = () => {
                this.showToast('Database initialization failed', 'error');
                reject(request.error);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Current Session Store
                if (!db.objectStoreNames.contains('currentSession')) {
                    const currentStore = db.createObjectStore('currentSession', { keyPath: 'id', autoIncrement: true });
                    currentStore.createIndex('date', 'date', { unique: false });
                }
                
                // History Store
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'date' });
                    historyStore.createIndex('date', 'date', { unique: true });
                }
            };
        });
    }

    // Date Utilities
    formatDate(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    parseDate(dateString) {
        const [day, month, year] = dateString.split('-');
        return new Date(year, month - 1, day);
    }

    setDefaultDate() {
        const today = new Date();
        const dateInput = document.getElementById('work-date');
        dateInput.value = today.toISOString().split('T')[0];
    }

    // Mathematical Expression Evaluator
    evaluateExpression(expression) {
        try {
            // Remove spaces and validate input
            const cleaned = expression.replace(/\s/g, '');
            
            // Only allow numbers, +, -, *, /, ., and parentheses
            if (!/^[\d+\-*/().]+$/.test(cleaned)) {
                throw new Error('Invalid characters in expression');
            }
            
            // Evaluate the expression safely
            const result = Function('"use strict"; return (' + cleaned + ')')();
            
            if (isNaN(result) || !isFinite(result) || result < 0) {
                throw new Error('Invalid result');
            }
            
            return parseFloat(result.toFixed(2));
        } catch (error) {
            throw new Error('Invalid expression');
        }
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Add Worker Entry
        document.getElementById('add-worker-btn').addEventListener('click', () => this.addWorkerEntry());

        // Complete Day
        document.getElementById('complete-day-btn').addEventListener('click', () => this.completeDay());

        // Generate Report
        document.getElementById('generate-report-btn').addEventListener('click', () => this.generateFullReport());

        // Modal Events
        document.getElementById('confirm-cancel').addEventListener('click', () => this.hideModal('confirm-modal'));
        document.getElementById('confirm-ok').addEventListener('click', () => this.handleConfirmAction());
        document.getElementById('edit-cancel').addEventListener('click', () => this.hideModal('edit-modal'));
        document.getElementById('edit-save').addEventListener('click', () => this.saveEdit());

        // Form validation
        document.getElementById('worker-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('kg-collected').focus();
            }
        });

        document.getElementById('kg-collected').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addWorkerEntry();
            }
        });
    }

    // Tab Management
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // Load data if switching to history
        if (tabName === 'history') {
            this.loadHistory();
        }
    }

    // Worker Entry Management
    async addWorkerEntry() {
        const nameInput = document.getElementById('worker-name');
        const kgInput = document.getElementById('kg-collected');
        const rateInput = document.getElementById('rate-per-kg');
        const dateInput = document.getElementById('work-date');

        const name = nameInput.value.trim();
        const kgExpression = kgInput.value.trim();
        const rate = parseFloat(rateInput.value);
        const dateValue = dateInput.value;

        // Validation
        if (!name) {
            this.showToast('Please enter worker name', 'error');
            nameInput.focus();
            return;
        }

        if (!kgExpression) {
            this.showToast('Please enter KG collected', 'error');
            kgInput.focus();
            return;
        }

        if (!rate || rate <= 0) {
            this.showToast('Please enter valid rate per KG', 'error');
            rateInput.focus();
            return;
        }

        if (!dateValue) {
            this.showToast('Please select date', 'error');
            dateInput.focus();
            return;
        }

        try {
            const kg = this.evaluateExpression(kgExpression);
            const total = kg * rate;
            const formattedDate = this.formatDate(dateValue);

            const entry = {
                name,
                kg,
                rate,
                total,
                date: formattedDate,
                saved: false
            };

            await this.saveCurrentEntry(entry);
            await this.loadCurrentSession();

            // Clear form
            nameInput.value = '';
            kgInput.value = '';
            nameInput.focus();

            this.showToast('Entry added successfully', 'success');

        } catch (error) {
            this.showToast(error.message, 'error');
            kgInput.focus();
        }
    }

    async saveCurrentEntry(entry) {
        this.showLoading(true);
        try {
            const transaction = this.db.transaction(['currentSession'], 'readwrite');
            const store = transaction.objectStore('currentSession');
            
            return new Promise((resolve, reject) => {
                const request = store.add(entry);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            throw new Error('Failed to save entry');
        } finally {
            this.showLoading(false);
        }
    }

    async loadCurrentSession() {
        try {
            const transaction = this.db.transaction(['currentSession'], 'readonly');
            const store = transaction.objectStore('currentSession');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    this.currentSession = request.result;
                    this.renderCurrentSession();
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            this.showToast('Failed to load current session', 'error');
        }
    }

    renderCurrentSession() {
        const tbody = document.querySelector('#current-entries-table tbody');
        tbody.innerHTML = '';

        let totalKg = 0;
        let totalAmount = 0;

        this.currentSession.forEach((entry, index) => {
            totalKg += entry.kg;
            totalAmount += entry.total;

            const row = document.createElement('tr');
            row.className = entry.saved ? 'bg-success' : '';
            
            row.innerHTML = `
                <td>${entry.name}</td>
                <td>${entry.kg}</td>
                <td>₹${entry.total.toFixed(2)}</td>
                <td>
                    <button class="action-btn action-btn--edit" onclick="cottonTracker.editCurrentEntry(${entry.id}, ${index})">Edit</button>
                    <button class="action-btn action-btn--delete" onclick="cottonTracker.deleteCurrentEntry(${entry.id})">Delete</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });

        // Update totals
        document.getElementById('current-total-kg').textContent = totalKg.toFixed(2);
        document.getElementById('current-total-amount').textContent = `₹${totalAmount.toFixed(2)}`;

        // Show/hide complete day button
        const completeDayBtn = document.getElementById('complete-day-btn');
        if (this.currentSession.length > 0) {
            completeDayBtn.style.display = 'block';
            completeDayBtn.classList.remove('hidden');
        } else {
            completeDayBtn.style.display = 'none';
        }
    }

    async editCurrentEntry(entryId, index) {
        const entry = this.currentSession.find(e => e.id === entryId);
        if (!entry) return;

        this.currentEditId = entryId;
        this.currentEditIndex = index;
        this.currentEditDate = null; // Reset history edit state
        
        document.getElementById('edit-name').value = entry.name;
        document.getElementById('edit-kg').value = entry.kg;
        
        this.showModal('edit-modal');
    }

    async saveEdit() {
        const name = document.getElementById('edit-name').value.trim();
        const kg = parseFloat(document.getElementById('edit-kg').value);

        if (!name || !kg || kg <= 0) {
            this.showToast('Please enter valid values', 'error');
            return;
        }

        if (this.currentEditId && !this.currentEditDate) {
            // Editing current session entry
            try {
                const transaction = this.db.transaction(['currentSession'], 'readwrite');
                const store = transaction.objectStore('currentSession');
                
                return new Promise((resolve, reject) => {
                    const getRequest = store.get(this.currentEditId);
                    getRequest.onsuccess = () => {
                        const entry = getRequest.result;
                        entry.name = name;
                        entry.kg = kg;
                        entry.total = kg * entry.rate;
                        entry.saved = false;
                        
                        const putRequest = store.put(entry);
                        putRequest.onsuccess = async () => {
                            await this.loadCurrentSession();
                            this.hideModal('edit-modal');
                            this.showToast('Entry updated successfully', 'success');
                            this.resetEditState();
                            resolve();
                        };
                        putRequest.onerror = () => reject(putRequest.error);
                    };
                    getRequest.onerror = () => reject(getRequest.error);
                });
            } catch (error) {
                this.showToast('Failed to update entry', 'error');
            }
        } else if (this.currentEditDate) {
            // Editing history entry
            try {
                const transaction = this.db.transaction(['history'], 'readwrite');
                const store = transaction.objectStore('history');
                
                return new Promise((resolve, reject) => {
                    const getRequest = store.get(this.currentEditDate);
                    getRequest.onsuccess = () => {
                        const historyRecord = getRequest.result;
                        const entry = historyRecord.entries[this.currentEditIndex];
                        
                        entry.name = name;
                        entry.kg = kg;
                        entry.total = kg * entry.rate;
                        
                        // Recalculate totals
                        historyRecord.totalKg = historyRecord.entries.reduce((sum, e) => sum + e.kg, 0);
                        historyRecord.totalAmount = historyRecord.entries.reduce((sum, e) => sum + e.total, 0);
                        
                        const putRequest = store.put(historyRecord);
                        putRequest.onsuccess = async () => {
                            await this.loadHistory();
                            this.hideModal('edit-modal');
                            this.showToast('Entry updated successfully', 'success');
                            this.resetEditState();
                            resolve();
                        };
                        putRequest.onerror = () => reject(putRequest.error);
                    };
                    getRequest.onerror = () => reject(getRequest.error);
                });
            } catch (error) {
                this.showToast('Failed to update entry', 'error');
            }
        }
    }

    resetEditState() {
        this.currentEditId = null;
        this.currentEditDate = null;
        this.currentEditIndex = null;
    }

    async deleteCurrentEntry(entryId) {
        this.showConfirmDialog(
            'Delete Entry',
            'Are you sure you want to delete this entry?',
            async () => {
                try {
                    const transaction = this.db.transaction(['currentSession'], 'readwrite');
                    const store = transaction.objectStore('currentSession');
                    
                    return new Promise((resolve, reject) => {
                        const request = store.delete(entryId);
                        request.onsuccess = async () => {
                            await this.loadCurrentSession();
                            this.showToast('Entry deleted successfully', 'success');
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    this.showToast('Failed to delete entry', 'error');
                }
            }
        );
    }

    async completeDay() {
        if (this.currentSession.length === 0) {
            this.showToast('No entries to complete', 'error');
            return;
        }

        const dateInput = document.getElementById('work-date');
        const formattedDate = this.formatDate(dateInput.value);

        this.showConfirmDialog(
            'Complete Day',
            `Move all entries to history for ${formattedDate}?`,
            async () => {
                this.showLoading(true);
                try {
                    // Calculate totals for current session
                    let sessionTotalKg = 0;
                    let sessionTotalAmount = 0;
                    const newEntries = this.currentSession.map(entry => {
                        sessionTotalKg += entry.kg;
                        sessionTotalAmount += entry.total;
                        return {
                            name: entry.name,
                            kg: entry.kg,
                            rate: entry.rate,
                            total: entry.total
                        };
                    });

                    const transaction = this.db.transaction(['history', 'currentSession'], 'readwrite');
                    const historyStore = transaction.objectStore('history');
                    const currentStore = transaction.objectStore('currentSession');

                    return new Promise((resolve, reject) => {
                        // Check if history record already exists for this date
                        const getHistoryRequest = historyStore.get(formattedDate);
                        getHistoryRequest.onsuccess = () => {
                            const existingRecord = getHistoryRequest.result;
                            
                            let historyEntry;
                            if (existingRecord) {
                                // Append to existing record
                                historyEntry = {
                                    date: formattedDate,
                                    entries: [...existingRecord.entries, ...newEntries],
                                    totalKg: existingRecord.totalKg + sessionTotalKg,
                                    totalAmount: existingRecord.totalAmount + sessionTotalAmount
                                };
                            } else {
                                // Create new record
                                historyEntry = {
                                    date: formattedDate,
                                    entries: newEntries,
                                    totalKg: sessionTotalKg,
                                    totalAmount: sessionTotalAmount
                                };
                            }

                            // Save to history
                            const historyRequest = historyStore.put(historyEntry);
                            historyRequest.onsuccess = () => {
                                // Clear current session
                                const clearRequest = currentStore.clear();
                                clearRequest.onsuccess = async () => {
                                    await this.loadCurrentSession();
                                    await this.loadHistory();
                                    const action = existingRecord ? 'updated' : 'completed';
                                    this.showToast(`Day ${action} for ${formattedDate}`, 'success');
                                    resolve();
                                };
                                clearRequest.onerror = () => reject(clearRequest.error);
                            };
                            historyRequest.onerror = () => reject(historyRequest.error);
                        };
                        getHistoryRequest.onerror = () => reject(getHistoryRequest.error);
                    });

                } catch (error) {
                    this.showToast('Failed to complete day', 'error');
                } finally {
                    this.showLoading(false);
                }
            }
        );
    }

    // History Management
    async loadHistory() {
        try {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const history = request.result.sort((a, b) => {
                        return this.parseDate(b.date) - this.parseDate(a.date);
                    });
                    this.renderHistory(history);
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            this.showToast('Failed to load history', 'error');
        }
    }

    renderHistory(history) {
        const historyList = document.getElementById('history-list');
        
        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>No history records found</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = history.map(record => `
            <div class="history-item">
                <div class="history-date-header" onclick="cottonTracker.toggleHistoryDetails('${record.date}')">
                    <div class="date-info">
                        <h4>${record.date}</h4>
                        <div class="date-totals">
                            ${record.entries.length} workers • ${record.totalKg.toFixed(2)} KG • ₹${record.totalAmount.toFixed(2)}
                        </div>
                    </div>
                    <div class="expand-icon">▼</div>
                </div>
                <div class="history-details" id="details-${record.date}">
                    <div class="history-actions">
                        <button class="btn btn--outline btn--sm" onclick="cottonTracker.generateDayPDF('${record.date}')">
                            Generate PDF
                        </button>
                        <button class="btn btn--outline btn--sm" onclick="cottonTracker.deleteHistoryDay('${record.date}')">
                            Delete Day
                        </button>
                    </div>
                    <div class="table-container">
                        <table class="entries-table">
                            <thead>
                                <tr>
                                    <th>Worker Name</th>
                                    <th>KG</th>
                                    <th>Rate</th>
                                    <th>Total</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${record.entries.map((entry, index) => `
                                    <tr>
                                        <td>${entry.name}</td>
                                        <td>${entry.kg}</td>
                                        <td>₹${entry.rate}</td>
                                        <td>₹${entry.total.toFixed(2)}</td>
                                        <td>
                                            <button class="action-btn action-btn--edit" onclick="cottonTracker.editHistoryEntry('${record.date}', ${index})">Edit</button>
                                            <button class="action-btn action-btn--delete" onclick="cottonTracker.deleteHistoryEntry('${record.date}', ${index})">Delete</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `).join('');
    }

    toggleHistoryDetails(date) {
        const details = document.getElementById(`details-${date}`);
        const header = details.previousElementSibling;
        
        if (details.classList.contains('expanded')) {
            details.classList.remove('expanded');
            header.classList.remove('expanded');
        } else {
            details.classList.add('expanded');
            header.classList.add('expanded');
        }
    }

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
                    this.currentEditId = null; // Reset current session edit state
                    
                    document.getElementById('edit-name').value = entry.name;
                    document.getElementById('edit-kg').value = entry.kg;
                    
                    this.showModal('edit-modal');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            this.showToast('Failed to load entry for editing', 'error');
        }
    }

    async deleteHistoryEntry(date, entryIndex) {
        this.showConfirmDialog(
            'Delete Entry',
            'Are you sure you want to delete this entry?',
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
                                // Delete entire day if no entries left
                                const deleteRequest = store.delete(date);
                                deleteRequest.onsuccess = async () => {
                                    await this.loadHistory();
                                    this.showToast('Entry deleted successfully', 'success');
                                    resolve();
                                };
                                deleteRequest.onerror = () => reject(deleteRequest.error);
                            } else {
                                // Recalculate totals
                                historyRecord.totalKg = historyRecord.entries.reduce((sum, e) => sum + e.kg, 0);
                                historyRecord.totalAmount = historyRecord.entries.reduce((sum, e) => sum + e.total, 0);
                                
                                const putRequest = store.put(historyRecord);
                                putRequest.onsuccess = async () => {
                                    await this.loadHistory();
                                    this.showToast('Entry deleted successfully', 'success');
                                    resolve();
                                };
                                putRequest.onerror = () => reject(putRequest.error);
                            }
                        };
                        getRequest.onerror = () => reject(getRequest.error);
                    });
                } catch (error) {
                    this.showToast('Failed to delete entry', 'error');
                }
            }
        );
    }

    async deleteHistoryDay(date) {
        this.showConfirmDialog(
            'Delete Day',
            `Are you sure you want to delete all records for ${date}?`,
            async () => {
                try {
                    const transaction = this.db.transaction(['history'], 'readwrite');
                    const store = transaction.objectStore('history');
                    
                    return new Promise((resolve, reject) => {
                        const request = store.delete(date);
                        request.onsuccess = async () => {
                            await this.loadHistory();
                            this.showToast('Day deleted successfully', 'success');
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    this.showToast('Failed to delete day', 'error');
                }
            }
        );
    }

    // PDF Generation
    async generateDayPDF(date) {
        try {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');
            
            return new Promise((resolve, reject) => {
                const request = store.get(date);
                request.onsuccess = () => {
                    const historyRecord = request.result;
                    this.createPDF([historyRecord], `Cotton_Report_${date.replace(/-/g, '_')}.pdf`);
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            this.showToast('Failed to generate PDF', 'error');
        }
    }

    async generateFullReport() {
        try {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const history = request.result.sort((a, b) => {
                        return this.parseDate(a.date) - this.parseDate(b.date);
                    });
                    
                    if (history.length === 0) {
                        this.showToast('No history records to export', 'error');
                        return;
                    }
                    
                    this.createPDF(history, 'Cotton_Full_Report.pdf');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            this.showToast('Failed to generate report', 'error');
        }
    }

    createPDF(historyRecords, filename) {
        this.showLoading(true);
        
        try {
            // Check if jsPDF is available
            if (!window.jspdf) {
                throw new Error('PDF library not loaded');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            let yPosition = 20;
            
            // Title - without date
            doc.setFontSize(18);
            doc.text('Cotton Worker Report', 20, yPosition);
            yPosition += 30;

            let grandTotalKg = 0;
            let grandTotalAmount = 0;

            historyRecords.forEach((record, recordIndex) => {
                // Check if we need a new page
                if (yPosition > 250) {
                    doc.addPage();
                    yPosition = 20;
                }

                // Date header
                doc.setFontSize(14);
                doc.text(`Date: ${record.date}`, 20, yPosition);
                yPosition += 10;

                // Create table data without rupee symbols
                const tableData = record.entries.map(entry => [
                    entry.name,
                    entry.kg.toString(),
                    entry.rate.toString(),
                    entry.total.toFixed(2)
                ]);

                // Add totals row without rupee symbols
                tableData.push([
                    'TOTAL',
                    record.totalKg.toFixed(2),
                    '',
                    record.totalAmount.toFixed(2)
                ]);

                // Generate table using autoTable if available
                if (doc.autoTable) {
                    doc.autoTable({
                        head: [['Worker Name', 'KG', 'Rate', 'Total']],
                        body: tableData,
                        startY: yPosition,
                        styles: { fontSize: 10 },
                        headStyles: { fillColor: [135, 206, 235] }, // Light blue
                        alternateRowStyles: { fillColor: [248, 249, 250] }, // Very light gray
                        margin: { left: 20, right: 20 }
                    });
                    yPosition = doc.lastAutoTable.finalY + 15;
                } else {
                    // Fallback to simple text if autoTable is not available
                    doc.setFontSize(10);
                    tableData.forEach((row, index) => {
                        const text = row.join('  |  ');
                        doc.text(text, 20, yPosition);
                        yPosition += 6;
                    });
                    yPosition += 10;
                }
                
                grandTotalKg += record.totalKg;
                grandTotalAmount += record.totalAmount;
            });

            // Grand totals for multiple records - without rupee symbols
            if (historyRecords.length > 1) {
                if (yPosition > 250) {
                    doc.addPage();
                    yPosition = 20;
                }

                doc.setFontSize(14);
                doc.text('GRAND TOTAL', 20, yPosition);
                yPosition += 10;

                if (doc.autoTable) {
                    doc.autoTable({
                        head: [['Description', 'Value']],
                        body: [
                            ['Total KG', grandTotalKg.toFixed(2)],
                            ['Total Amount', grandTotalAmount.toFixed(2)]
                        ],
                        startY: yPosition,
                        styles: { fontSize: 12 },
                        headStyles: { fillColor: [144, 238, 144] }, // Light green
                        margin: { left: 20, right: 20 }
                    });
                } else {
                    doc.setFontSize(12);
                    doc.text(`Total KG: ${grandTotalKg.toFixed(2)}`, 20, yPosition);
                    yPosition += 10;
                    doc.text(`Total Amount: ${grandTotalAmount.toFixed(2)}`, 20, yPosition);
                }
            }

            // Save the PDF
            doc.save(filename);
            this.showToast('PDF generated successfully', 'success');
            
        } catch (error) {
            console.error('PDF generation error:', error);
            this.showToast('Failed to generate PDF: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // UI Utilities
    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
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
            this.confirmCallback = null;
        }
        this.hideModal('confirm-modal');
    }

    showLoading(show) {
        document.getElementById('loading-overlay').classList.toggle('hidden', !show);
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        toastMessage.textContent = message;
        toast.className = `toast ${type === 'error' ? 'bg-error' : type === 'success' ? 'bg-success' : ''}`;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// Initialize the application
let cottonTracker;

document.addEventListener('DOMContentLoaded', () => {
    cottonTracker = new CottonTracker();
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
    if (window.cottonTracker) {
        cottonTracker.showToast('An unexpected error occurred', 'error');
    }
});