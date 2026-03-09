class GOBEngine {
    constructor() {
        this.dbKey = 'gob_users_v2'; // Use a fresh key to avoid conflicts with old buggy data
        this.users = JSON.parse(localStorage.getItem(this.dbKey)) || {};
        this.currentUser = null;

        this.init();
    }

    init() {
        this.bindEvents();

        // Background interest/rent check every minute
        setInterval(() => {
            if (this.currentUser) {
                this.calculatePassive(this.currentUser);
                this.updateDashboard();
            }
        }, 60000);

        // Force initial screen state
        this.showScreen('auth');
        console.log("GOB Engine Initialized. Users loaded:", Object.keys(this.users));
    }

    bindEvents() {
        // Auth Tabs
        document.getElementById('tab-login').addEventListener('click', () => this.switchAuthView('login'));
        document.getElementById('tab-signup').addEventListener('click', () => this.switchAuthView('signup'));

        // Input Keyup (Enter to submit)
        const addEnterSupport = (inputId, btnId) => {
            document.getElementById(inputId).addEventListener('keyup', (e) => {
                if (e.key === 'Enter') document.getElementById(btnId).click();
            });
        };

        addEnterSupport('login-username', 'login-btn');
        addEnterSupport('login-password', 'login-btn');
        addEnterSupport('signup-username', 'signup-btn');
        addEnterSupport('signup-password', 'signup-btn');

        // Auth Actions
        document.getElementById('login-btn').addEventListener('click', () => {
            const u = document.getElementById('login-username').value;
            const p = document.getElementById('login-password').value;
            this.login(u, p);
        });

        document.getElementById('signup-btn').addEventListener('click', () => {
            const u = document.getElementById('signup-username').value;
            const p = document.getElementById('signup-password').value;
            this.signup(u, p);
        });

        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Dashboard Mode Tabs
        const tabBtns = document.querySelectorAll('.tab-btn');
        let currentMode = 'deposit';
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMode = btn.dataset.tab;
            });
        });

        // Transaction Submit
        document.getElementById('submit-btn').addEventListener('click', () => {
            const val = document.getElementById('amount-input').value;
            this.addTransaction(val, currentMode);
            document.getElementById('amount-input').value = '';
        });

        // History Clear
        document.getElementById('clear-history').addEventListener('click', () => {
            if (this.currentUser && confirm('Clear your history?')) {
                this.currentUser.history = [];
                this.saveDB();
                this.updateDashboard();
            }
        });

        // Staff Portal Management
        document.getElementById('staff-access-btn').addEventListener('click', () => {
            document.getElementById('staff-overlay').classList.remove('hidden');
        });

        document.getElementById('close-staff').addEventListener('click', () => {
            document.getElementById('staff-overlay').classList.add('hidden');
        });

        document.getElementById('staff-login-btn').addEventListener('click', () => {
            const pass = document.getElementById('staff-password').value;
            if (pass === 'GOP2026') {
                document.getElementById('staff-auth-view').classList.add('hidden');
                document.getElementById('staff-dashboard').classList.remove('hidden');
                this.updateStaffDashboard();
            } else {
                this.notify('Invalid Password', 'error');
            }
        });

        document.getElementById('back-to-list').addEventListener('click', () => {
            document.getElementById('staff-user-detail-view').classList.add('hidden');
            document.getElementById('staff-user-list-view').classList.remove('hidden');
        });

        document.getElementById('test-email-btn').addEventListener('click', () => {
            this.sendEmailNotification('Test System', 'deposit', 999);
        });
    }

    // --- Core Logic ---
    signup(rawName, password) {
        const cleanName = rawName.trim();
        const id = cleanName.toLowerCase();
        const cleanPass = password.trim();

        if (!id || !cleanPass) {
            return this.notify('Please enter both name and password', 'error');
        }

        if (this.users[id]) {
            return this.notify('This name is already registered!', 'error');
        }

        // Create user
        this.users[id] = {
            id: id,
            username: cleanName,
            password: cleanPass,
            balance: 0,
            history: [],
            lastUpdate: Date.now()
        };

        this.saveDB();
        this.notify('Signup success! Logging you in...', 'success');

        // Auto-login for better UX
        setTimeout(() => this.login(cleanName, cleanPass), 500);
    }

    login(rawName, password) {
        const id = rawName.trim().toLowerCase();
        const cleanPass = password.trim();
        const user = this.users[id];

        console.log(`Login attempt for ID: "${id}"`);

        if (user) {
            if (user.password === cleanPass) {
                this.currentUser = user;
                this.calculatePassive(user);
                this.showScreen('app');
                this.updateDashboard();
                this.notify(`Logged in as ${user.username}`, 'success');
            } else {
                this.notify('Wrong Password!', 'error');
            }
        } else {
            this.notify('User not found! Please Sign Up.', 'error');
        }
    }

    logout() {
        this.currentUser = null;
        this.showScreen('auth');
        this.notify('Logged out', 'success');
        // Clear inputs
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    }

    calculatePassive(user) {
        const now = Date.now();
        const elapsedHours = (now - user.lastUpdate) / (1000 * 60 * 60);
        if (elapsedHours < 0.1) return;

        // 2% per hour, whole sheets only
        const interest = Math.floor(user.balance * (Math.pow(1.02, elapsedHours) - 1));
        const rent = Math.floor(1 * elapsedHours);

        if (interest >= 1) {
            user.balance += interest;
            this.addHistory(user, 'Interest', interest, 'interest');
        }
        if (rent >= 1) {
            user.balance -= rent;
            this.addHistory(user, 'Rent (BOP)', -rent, 'rent');
        }

        if (interest >= 1 || rent >= 1 || elapsedHours >= 1) {
            user.lastUpdate = now;
        }

        if (user.balance < 0) user.balance = 0;
        this.saveDB();
    }

    addTransaction(amountStr, type) {
        const amount = Math.floor(parseInt(amountStr));
        if (isNaN(amount) || amount <= 0) return this.notify('Enter a whole number', 'error');
        if (!this.currentUser) return;

        if (type === 'withdraw' && amount > this.currentUser.balance) {
            return this.notify('Not enough sheets!', 'error');
        }

        const delta = type === 'deposit' ? amount : -amount;
        this.currentUser.balance += delta;
        this.addHistory(this.currentUser, type === 'deposit' ? 'Deposit' : 'Withdrawal', delta, type);
        this.currentUser.lastUpdate = Date.now();
        this.saveDB();
        this.updateDashboard();

        // Notification Email logic
        this.sendEmailNotification(this.currentUser.username, type, amount);

        this.notify(`${Math.abs(delta)} sheets ${type === 'deposit' ? 'added' : 'removed'}`, 'success');
    }

    sendEmailNotification(username, type, amount) {
        const now = new Date();
        const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
        const month = months[now.getMonth()];
        const date = now.getDate();
        const action = type === 'deposit' ? '입금' : '인출';

        const message = `${username} has ${action} ${amount} origami paper on ${month} ${date}`;

        console.log(`%c[NOTIFICATION: Attempting to send...]`, 'color: #F59E0B; font-weight: bold;');

        // --- REAL EmailJS START ---
        const serviceID = 'service_2m0je8c';
        const templateID = 'template_ynicopa';
        const publicKey = 'BInrMF80lzyvGARbK';

        if (typeof emailjs !== 'undefined') {
            const templateParams = {
                from_name: username,
                to_name: "David Kim",
                message: message,
                action: action,
                amount: amount,
                date: `${month} ${date}`
            };

            emailjs.send(serviceID, templateID, templateParams, publicKey)
                .then((response) => {
                    console.log("SUCCESS!", response.status, response.text);
                    this.notify('Email Sent Successfully!', 'success');
                }, (err) => {
                    console.error("FAILED to send email:", err);
                    const errorMsg = err.text || err.message || JSON.stringify(err);
                    this.notify(`Email Error: ${errorMsg}`, 'error');
                });
        } else {
            console.error("EmailJS Library not found. Please check index.html script tag.");
            this.notify('System Error: Email library missing', 'error');
        }
        // --- REAL EmailJS END ---
    }

    addHistory(user, label, amount, type) {
        if (!user.history) user.history = [];
        user.history.unshift({
            timestamp: new Date().toLocaleString(),
            timeValue: Date.now(),
            label,
            amount: Math.floor(amount),
            type,
            userRef: user.username // For global feed
        });
        if (user.history.length > 50) user.history.pop();
    }

    // --- UI Helpers ---
    showScreen(screen) {
        if (screen === 'app') {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
        } else {
            document.getElementById('auth-screen').classList.remove('hidden');
            document.getElementById('app-screen').classList.add('hidden');
        }
    }

    switchAuthView(view) {
        const login = document.getElementById('login-view');
        const signup = document.getElementById('signup-view');
        const tabL = document.getElementById('tab-login');
        const tabS = document.getElementById('tab-signup');

        if (view === 'login') {
            login.classList.add('active');
            signup.classList.remove('active');
            tabL.classList.add('active');
            tabS.classList.remove('active');
        } else {
            login.classList.remove('active');
            signup.classList.add('active');
            tabL.classList.remove('active');
            tabS.classList.add('active');
        }
    }

    updateDashboard() {
        if (!this.currentUser) return;
        document.getElementById('display-username').innerText = this.currentUser.username;
        document.getElementById('balance-amount').innerText = Math.floor(this.currentUser.balance);
        const body = document.getElementById('history-body');
        body.innerHTML = (this.currentUser.history || []).map(h => `
            <tr>
                <td>${h.timestamp}</td>
                <td><span class="status-badge status-${h.type}">${h.label}</span></td>
                <td class="${h.amount < 0 ? 'border-red' : ''}">${h.amount > 0 ? '+' : ''}${Math.floor(h.amount)}</td>
                <td><span class="status-badge status-${h.type}">OK</span></td>
            </tr>
        `).join('');
    }

    // --- Staff UI Helpers ---
    updateStaffDashboard() {
        this.updateStaffStats();
        this.updateGlobalActivity();
        this.updateStaffUserList();
    }

    updateStaffStats() {
        const userArray = Object.values(this.users);
        document.getElementById('staff-total-users').innerText = userArray.length;
        document.getElementById('staff-vault-total').innerText = Math.floor(userArray.reduce((acc, u) => acc + (u.balance || 0), 0));
    }

    updateGlobalActivity() {
        const allHistory = [];
        Object.values(this.users).forEach(u => {
            (u.history || []).forEach(h => {
                allHistory.push({ ...h, username: u.username });
            });
        });

        // Top 5 most recent
        const recent = allHistory.sort((a, b) => b.timeValue - a.timeValue).slice(0, 5);
        const container = document.getElementById('staff-global-activity');

        container.innerHTML = recent.map(h => `
            <div class="activity-item">
                <strong>${h.username}</strong>: ${h.label} (${h.amount > 0 ? '+' : ''}${h.amount})
                <span class="time">${h.timestamp}</span>
            </div>
        `).join('') || '<p class="helper-text">No activity yet</p>';
    }

    updateStaffUserList() {
        const userList = document.getElementById('staff-user-list');
        const userArray = Object.values(this.users);
        userList.innerHTML = userArray.map(u => `
            <tr>
                <td><span class="clickable-name" onclick="window.gob.showUserDetail('${u.id}')">${u.username}</span></td>
                <td>${Math.floor(u.balance || 0)}</td>
                <td>
                    <button class="adj-btn" onclick="window.gob.adjustUser('${u.id}', 1)">+1</button>
                    <button class="adj-btn" onclick="window.gob.adjustUser('${u.id}', -1)">-1</button>
                </td>
            </tr>
        `).join('');
    }

    showUserDetail(id) {
        const user = this.users[id];
        if (!user) return;

        document.getElementById('staff-user-list-view').classList.add('hidden');
        document.getElementById('staff-user-detail-view').classList.remove('hidden');
        document.getElementById('detail-username-title').innerText = user.username;

        const body = document.getElementById('detail-user-history');
        body.innerHTML = (user.history || []).map(h => `
            <tr>
                <td>${h.timestamp}</td>
                <td><span class="status-badge status-${h.type}">${h.label}</span></td>
                <td>${h.amount > 0 ? '+' : ''}${h.amount}</td>
            </tr>
        `).join('') || '<tr><td colspan="3" class="center">No history</td></tr>';
    }

    adjustUser(id, delta) {
        const user = this.users[id];
        if (user) {
            user.balance += delta;
            if (user.balance < 0) user.balance = 0;
            this.addHistory(user, 'Staff Correction', delta, delta > 0 ? 'deposit' : 'withdraw');
            this.saveDB();
            this.updateStaffDashboard();
            if (this.currentUser && this.currentUser.id === id) this.updateDashboard();
            this.notify(`Adjusted ${user.username}`, 'success');
        }
    }

    saveDB() {
        localStorage.setItem(this.dbKey, JSON.stringify(this.users));
    }

    notify(msg, type) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
}

// Start the engine
document.addEventListener('DOMContentLoaded', () => {
    window.gob = new GOBEngine();
});
