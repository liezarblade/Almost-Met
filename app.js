// AlmostMet - Main JavaScript Controller

const app = {
    // -------------------------------------------------------------
    // STATE STORAGE
    // -------------------------------------------------------------
    state: {
        currentScreen: 'landing',
        currentUser: null, // { username, avatarSrc, color, lat, lng }
        activeTab: 'chats',
        map: null,
        userMarker: null,
        markers: {}, // { id: { markerObj, data } }
        nearbyUsers: [], // Array of REAL connected users from socket
        activeChatPartnerId: null,
        chats: {}, // { partnerId: [ { sender: 'me'|'them', text, timestamp } ] }
        filter: 'all',
        myVibe: null, // { feeling, emoji, dress, thought, lat, lng }
        gender: 'secret', // 'secret' | 'male' | 'female'
        ghostMode: false, // Ghost Mode active state
        socket: null, // Socket.io connection
        userId: null // Persistent user ID (survives reconnects)
    },

    // Gendered Nicknames pools
    namesPool: {
        secret: ['ShadowDrifter', 'CosmicEcho', 'StaticNova', 'SilentGhost', 'CryptoVibe', 'ViperSlink', 'SpecterPulse', 'MidnightGlitch'],
        male: ['bheem', 'ChhotaBheem', 'Kalia', 'Karan', 'Kabir', 'Raju', 'Rockstar', 'NeonRider', 'AlphaBuster', 'DriftSamurai', 'BulletSid'],
        female: ['Mamasita', 'chudki', 'Chutki', 'Indumati', 'Simran', 'Pooja', 'Anjali', 'Sofia', 'Aria', 'Zara', 'PinkVixen', 'BellaGamer']
    },

    // Available avatar images for selection
    avatarOptions: [
        'assets/avatar_male_1.jpg',
        'assets/avatar_female_1.jpg',
        'assets/avatar_male_2.jpg',
        'assets/avatar_female_2.jpg'
    ],

    // -------------------------------------------------------------
    // INITIALIZATION
    // -------------------------------------------------------------
    init() {
        this.loadLocalStorage();

        // Generate or load persistent userId
        if (!this.state.userId) {
            this.state.userId = localStorage.getItem('almostmet_userId');
            if (!this.state.userId) {
                this.state.userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                localStorage.setItem('almostmet_userId', this.state.userId);
            }
        }
        this.setupEventListeners();
        this.initChatFeatures();
        lucide.createIcons();

        // If user already existed, pre-fill login
        if (this.state.currentUser) {
            document.getElementById('username').value = this.state.currentUser.username;
            this.updateAvatarPreview(this.state.currentUser.avatarSrc, this.state.currentUser.color);
            
            // Mark correct avatar selected in selector
            const activeSelect = document.querySelector(`.avatar-select[data-src="${this.state.currentUser.avatarSrc}"]`);
            if (activeSelect) {
                document.querySelectorAll('.avatar-select').forEach(b => b.classList.remove('active'));
                activeSelect.classList.add('active');
            }
        } else {
            this.rollRandomName();
        }

        console.log("AlmostMet Initialized.");
    },

    setupEventListeners() {
        // Roll Name Button
        document.getElementById('btn-roll-name').addEventListener('click', () => this.rollRandomName());
        
        // Gender Selector Tabs
        document.querySelectorAll('.gender-select').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.gender-select').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.state.gender = e.currentTarget.dataset.gender;
                this.rollRandomName();
            });
        });

        // Anime Avatar List Selector
        document.querySelectorAll('.avatar-select').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.avatar-select').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.updateAvatarPreview(e.currentTarget.dataset.src, null);
            });
        });

        // Avatar Background Color dots
        document.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
                document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.updateAvatarPreview(null, e.currentTarget.dataset.color);
            });
        });

        // Auth Submit
        document.getElementById('btn-enter-space').addEventListener('click', () => this.handleLogin());

        // Sidebar Logout (desktop)
        document.getElementById('btn-log-out').addEventListener('click', () => this.handleLogout());

        // Recenter Map (desktop)
        document.getElementById('btn-recenter').addEventListener('click', () => this.recenterMap());

        // Mobile recenter
        document.getElementById('btn-recenter-mobile').addEventListener('click', () => this.recenterMap());

        // Dashboard Ghost Mode Toggle (mobile top bar)
        document.getElementById('btn-dashboard-ghost').addEventListener('click', () => this.toggleGhostMode());

        // Dashboard Ghost Mode Toggle (desktop sidebar controls)
        const desktopGhostBtn = document.getElementById('btn-dashboard-ghost-desktop');
        if (desktopGhostBtn) desktopGhostBtn.addEventListener('click', () => this.toggleGhostMode());

        // Mobile FAB: Post Vibe
        document.getElementById('btn-post-vibe-mobile').addEventListener('click', () => this.openVibeModal());

        // Desktop FAB: Post Vibe
        document.getElementById('btn-post-vibe').addEventListener('click', () => this.openVibeModal());

        // Vibe Modal Close/Submit
        document.getElementById('btn-close-modal').addEventListener('click', () => this.closeVibeModal());
        document.getElementById('btn-submit-vibe').addEventListener('click', () => this.submitVibe());

        // Vibe Feeling Pill selection
        document.querySelectorAll('.vibe-tag-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                document.querySelectorAll('.vibe-tag-pill').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        // Category Filter Buttons on Map
        document.querySelectorAll('.floating-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                document.querySelectorAll('.floating-pill').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.setCategoryFilter(e.currentTarget.dataset.filter);
            });
        });

        // Chat send message
        document.getElementById('btn-send-message').addEventListener('click', () => this.sendMessage());
        document.getElementById('chat-input-field').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('btn-close-chat').addEventListener('click', () => this.closeChatDrawer());
    },

    initChatFeatures() {
        // Emoji Picker Toggle
        const btnEmoji = document.getElementById('btn-emoji');
        const emojiPanel = document.getElementById('emoji-picker-panel');
        if (btnEmoji && emojiPanel) {
            btnEmoji.addEventListener('click', () => {
                const isHidden = emojiPanel.style.display === 'none';
                emojiPanel.style.display = isHidden ? 'flex' : 'none';
                btnEmoji.classList.toggle('active', isHidden);
                if (isHidden && document.getElementById('emoji-grid').children.length === 0) {
                    this.populateEmojiGrid('smileys'); // load default
                }
            });
        }

        // Emoji Categories
        document.querySelectorAll('.emoji-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.populateEmojiGrid(e.currentTarget.dataset.cat);
            });
        });

        // Image Attachment
        const btnAttach = document.getElementById('btn-attach-image');
        const fileInput = document.getElementById('image-file-input');
        if (btnAttach && fileInput) {
            btnAttach.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleImageUpload(e));
        }

        // YouTube Music Sync Toggle
        const btnMusic = document.getElementById('btn-music-sync');
        const ytPanel = document.getElementById('yt-sync-panel');
        if (btnMusic && ytPanel) {
            btnMusic.addEventListener('click', () => {
                ytPanel.style.display = ytPanel.style.display === 'none' ? 'block' : 'none';
            });
        }

        const btnYtShare = document.getElementById('btn-yt-share');
        const ytInput = document.getElementById('yt-url-input');
        if (btnYtShare && ytInput) {
            btnYtShare.addEventListener('click', () => {
                const url = ytInput.value.trim();
                const videoId = this.extractYouTubeId(url);
                if (videoId && this.state.activeChatPartnerId) {
                    this.loadYouTubeVideo(videoId);
                    if (this.state.socket) {
                        this.state.socket.emit('music:share', {
                            toUserId: this.state.activeChatPartnerId,
                            videoId: videoId
                        });
                    }
                    ytInput.value = '';
                }
            });
        }
    },

    populateEmojiGrid(category) {
        const grid = document.getElementById('emoji-grid');
        grid.innerHTML = '';
        
        const emojis = {
            smileys: ['😀','😂','🥰','😎','🤔','😴','😭','😡','🤯','🥳','🥶','🤢'],
            gestures: ['👍','👎','👋','🙌','🤝','🙏','💪','🖕','🤙','🖖'],
            hearts: ['❤️','💔','💕','💖','💗','💙','💚','💛','💜','🖤'],
            food: ['🍔','🍕','🍟','🍩','🍦','🍭','🍎','🍇','🍉','🍷','🍻','☕'],
            activities: ['⚽','🏀','🎮','🎵','🎸','🎬','🎤','🎧','🎨','🚴'],
            nature: ['🌞','🌙','⭐','🔥','💧','🌲','🌸','🌺','🍀','🐶','🐱','🐼'],
            objects: ['📱','💻','⌚','👗','👔','👟','👑','💍','💄','🚗','✈️','🚀']
        };

        const list = emojis[category] || emojis.smileys;
        list.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.addEventListener('click', () => {
                const input = document.getElementById('chat-input-field');
                input.value += emoji;
                input.focus();
            });
            grid.appendChild(span);
        });
    },

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.state.activeChatPartnerId) return;

        // Basic validation and compression logic here
        const reader = new FileReader();
        reader.onload = (ev) => {
            const imgData = ev.target.result;
            this.sendImageMessage(imgData);
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // reset
    },

    sendImageMessage(imageData) {
        const partnerId = this.state.activeChatPartnerId;
        if (!partnerId) return;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        this.state.chats[partnerId].push({
            sender: 'me',
            type: 'image',
            imageData: imageData,
            timestamp: timestamp
        });

        this.renderChatMessages();
        this.saveStateToLocalStorage();

        if (this.state.socket) {
            this.state.socket.emit('chat:image', {
                toUserId: partnerId,
                imageData: imageData
            });
        }
    },

    extractYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    loadYouTubeVideo(videoId) {
        document.getElementById('yt-input-row').style.display = 'none';
        document.getElementById('yt-player-container').style.display = 'block';

        if (window.YT && window.YT.Player) {
            if (this.state.ytPlayer) {
                this.state.ytPlayer.loadVideoById(videoId);
            } else {
                this.state.ytPlayer = new window.YT.Player('yt-player', {
                    height: '180',
                    width: '100%',
                    videoId: videoId,
                    playerVars: { 'autoplay': 1, 'controls': 1 },
                    events: {
                        'onStateChange': this.onPlayerStateChange.bind(this)
                    }
                });
            }
        }
    },

    onPlayerStateChange(event) {
        // -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
        if (!this.state.socket || !this.state.activeChatPartnerId) return;

        const time = event.target.getCurrentTime();
        
        if (event.data == window.YT.PlayerState.PLAYING) {
            this.state.socket.emit('music:sync', {
                toUserId: this.state.activeChatPartnerId,
                action: 'play',
                time: time
            });
        } else if (event.data == window.YT.PlayerState.PAUSED) {
            this.state.socket.emit('music:sync', {
                toUserId: this.state.activeChatPartnerId,
                action: 'pause',
                time: time
            });
        }
    },

    // -------------------------------------------------------------
    // NAVIGATION & ROUTING
    // -------------------------------------------------------------
    navigateTo(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            screen.style.display = 'none';
        });

        const activeScreen = document.getElementById(`screen-${screenId}`);
        if (activeScreen) {
            activeScreen.style.display = (screenId === 'dashboard') ? 'flex' : 'flex';
            // Force redraw/opacity transition
            setTimeout(() => {
                activeScreen.classList.add('active');
            }, 50);
        }
        this.state.currentScreen = screenId;

        if (screenId === 'dashboard') {
            this.initDashboard();
        }
    },

    switchTab(tabId) {
        const tabBtn = document.getElementById(`tab-${tabId}`);
        const panelEl = document.getElementById(`panel-${tabId}`);
        if (tabBtn) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            tabBtn.classList.add('active');
        }
        if (panelEl) {
            document.querySelectorAll('.sidebar-panel').forEach(panel => panel.classList.remove('active'));
            panelEl.classList.add('active');
        }
        this.state.activeTab = tabId;

        if (tabId === 'chats') {
            this.renderChatsSidebar();
        } else if (tabId === 'vibes') {
            this.renderVibesSidebar();
        }
    },

    // Mobile bottom navigation panel switcher
    showMobilePanel(panelId) {
        const sheets = ['chats', 'vibes', 'profile'];
        const backdrop = document.getElementById('sheet-backdrop');

        if (panelId === 'map') {
            // Close all sheets
            sheets.forEach(s => {
                const sheet = document.getElementById(`mobile-sheet-${s}`);
                if (sheet) sheet.classList.remove('open');
            });
            if (backdrop) backdrop.classList.remove('active');

            // Update bottom nav
            document.querySelectorAll('.mob-nav-btn').forEach(btn => btn.classList.remove('active'));
            const mapBtn = document.getElementById('mob-nav-map');
            if (mapBtn) mapBtn.classList.add('active');
        } else {
            // Open requested sheet, close others
            sheets.forEach(s => {
                const sheet = document.getElementById(`mobile-sheet-${s}`);
                if (sheet) {
                    if (s === panelId) {
                        sheet.classList.add('open');
                    } else {
                        sheet.classList.remove('open');
                    }
                }
            });
            if (backdrop) backdrop.classList.add('active');

            // Update bottom nav active state
            document.querySelectorAll('.mob-nav-btn').forEach(btn => btn.classList.remove('active'));
            const activeNavBtn = document.getElementById(`mob-nav-${panelId}`);
            if (activeNavBtn) activeNavBtn.classList.add('active');

            // Load content
            if (panelId === 'chats') this.renderMobileChats();
            else if (panelId === 'vibes') this.renderMobileVibes();
            else if (panelId === 'profile') this.renderMobileProfile();
        }
    },

    renderMobileChats() {
        const container = document.getElementById('mobile-chats-container');
        const emptyEl = document.getElementById('mobile-chats-empty');
        if (!container) return;
        container.innerHTML = '';

        const activeThreads = Object.keys(this.state.chats);
        if (activeThreads.length === 0) {
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        activeThreads.forEach(partnerId => {
            const partner = this.state.nearbyUsers.find(u => u.id === partnerId);
            if (!partner) return;
            const messages = this.state.chats[partnerId];
            if (messages.length === 0) return;
            const lastMsg = messages[messages.length - 1];
            const hasUnread = lastMsg.sender === 'them' && lastMsg.unread;

            const item = document.createElement('div');
            item.classList.add('list-item');
            if (hasUnread) item.classList.add('unread');
            item.innerHTML = `
                <div class="list-item-avatar" style="background-color: ${partner.color}; padding:0; overflow:hidden;">
                    <img src="${partner.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                    <div class="status-indicator"></div>
                </div>
                <div class="list-item-info">
                    <div class="list-item-header">
                        <span class="list-item-title">${partner.username}</span>
                        <span class="list-item-time">${lastMsg.timestamp}</span>
                    </div>
                    <div class="list-item-preview">${lastMsg.sender === 'me' ? 'You: ' : ''}${lastMsg.text}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                if (hasUnread) { lastMsg.unread = false; this.saveStateToLocalStorage(); }
                this.showMobilePanel('map');
                setTimeout(() => this.startChat(partnerId), 200);
            });
            container.appendChild(item);
        });
    },

    renderMobileVibes() {
        const container = document.getElementById('mobile-vibes-container');
        const emptyEl = document.getElementById('mobile-vibes-empty');
        if (!container) return;
        container.innerHTML = '';

        let filteredUsers = this.state.nearbyUsers;
        if (this.state.filter !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.feeling === this.state.filter);
        }

        if (filteredUsers.length === 0 && !this.state.myVibe) {
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        // Add own vibe if active
        if (this.state.myVibe) {
            const user = this.state.currentUser;
            const vibe = this.state.myVibe;
            const item = document.createElement('div');
            item.classList.add('list-item');
            item.style.border = '1px dashed var(--primary)';
            item.innerHTML = `
                <div class="list-item-avatar" style="background-color: ${user.color}; padding:0; overflow:hidden;">
                    <img src="${user.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                    <div class="status-indicator" style="background-color: var(--primary);"></div>
                </div>
                <div class="list-item-info">
                    <div class="list-item-header">
                        <span class="list-item-title" style="color: var(--primary-bright);">${user.username} (You)</span>
                        <span class="list-item-time">Now</span>
                    </div>
                    <div class="list-item-preview" style="color:white; font-weight:500;">👗 ${vibe.dress}</div>
                    <div class="list-item-preview" style="font-size:0.8rem; font-style:italic; margin-top:4px;">&quot;${vibe.thought}&quot;</div>
                </div>
            `;
            container.appendChild(item);
        }

        filteredUsers.forEach(u => {
            const item = document.createElement('div');
            item.classList.add('list-item');
            item.innerHTML = `
                <div class="list-item-avatar" style="background-color: ${u.color}; padding:0; overflow:hidden;">
                    <img src="${u.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                    <div class="status-indicator"></div>
                </div>
                <div class="list-item-info">
                    <div class="list-item-header">
                        <span class="list-item-title">${u.username}</span>
                        <span class="list-item-time">~${u.distance}m</span>
                    </div>
                    <div class="list-item-preview" style="color:white; font-weight:500;">👗 ${u.dress}</div>
                    <div class="list-item-preview" style="font-size:0.8rem; font-style:italic; margin-top:4px;">&quot;${u.thought}&quot;</div>
                </div>
            `;
            item.addEventListener('click', () => {
                this.showMobilePanel('map');
                setTimeout(() => {
                    const wrap = this.state.markers[u.id];
                    if (wrap) {
                        this.state.map.setView([u.lat, u.lng], 17, { animate: true });
                        setTimeout(() => wrap.markerObj.openPopup(), 350);
                    }
                }, 200);
            });
            container.appendChild(item);
        });
    },

    renderMobileProfile() {
        const container = document.getElementById('mobile-profile-content');
        if (!container) return;
        const user = this.state.currentUser;
        if (!user) return;

        const displayName = this.state.ghostMode ? 'SpecterGhost' : user.username;
        const avatarHtml = this.state.ghostMode
            ? `<div style="font-size:3rem; display:flex; align-items:center; justify-content:center; width:90px; height:90px; border-radius:50%; background:#3f3f46; border:3px solid var(--primary);">👻</div>`
            : `<div class="profile-avatar-large"><img src="${user.avatarSrc}"></div>`;

        const chatCount = Object.keys(this.state.chats).length;
        const vibeActive = this.state.myVibe ? 'Active' : 'None';
        const statusText = this.state.ghostMode ? 'Ghost Mode ON' : 'Active Nearby';

        container.innerHTML = `
            ${avatarHtml}
            <div class="profile-name-badge">
                <h2>${displayName}</h2>
                <div class="profile-subtitle">${statusText}</div>
            </div>
            <div class="profile-stats-row">
                <div class="profile-stat">
                    <div class="profile-stat-num">${chatCount}</div>
                    <div class="profile-stat-label">Chats</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-num">${this.state.nearbyUsers.length}</div>
                    <div class="profile-stat-label">Nearby</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-num">${vibeActive}</div>
                    <div class="profile-stat-label">My Vibe</div>
                </div>
            </div>
            ${this.state.myVibe ? `
            <div class="profile-vibe-preview">
                <strong>My Current Vibe</strong>
                👗 ${this.state.myVibe.dress}<br>
                <em style="font-size:0.82rem;">&quot;${this.state.myVibe.thought}&quot;</em>
            </div>` : ''}
        `;
    },

    // -------------------------------------------------------------
    // LOCAL STORAGE & PERSISTENCE
    // -------------------------------------------------------------
    loadLocalStorage() {
        const storedUser = localStorage.getItem('almostmet_user');
        const storedChats = localStorage.getItem('almostmet_chats');
        const storedVibe = localStorage.getItem('almostmet_myvibe');

        if (storedUser) {
            this.state.currentUser = JSON.parse(storedUser);
        }
        if (storedChats) {
            this.state.chats = JSON.parse(storedChats);
        }
        if (storedVibe) {
            this.state.myVibe = JSON.parse(storedVibe);
        }
    },

    saveStateToLocalStorage() {
        if (this.state.currentUser) {
            localStorage.setItem('almostmet_user', JSON.stringify(this.state.currentUser));
        } else {
            localStorage.removeItem('almostmet_user');
        }
        localStorage.setItem('almostmet_chats', JSON.stringify(this.state.chats));
        if (this.state.myVibe) {
            localStorage.setItem('almostmet_myvibe', JSON.stringify(this.state.myVibe));
        } else {
            localStorage.removeItem('almostmet_myvibe');
        }
    },

    // -------------------------------------------------------------
    // LOGIN & ALIAS CUSTOMIZER LOGIC
    // -------------------------------------------------------------
    rollRandomName() {
        const pool = this.namesPool[this.state.gender];
        const name = pool[Math.floor(Math.random() * pool.length)];
        const number = Math.floor(Math.random() * 90) + 10;
        document.getElementById('username').value = `${name}${number}`;
    },

    updateAvatarPreview(src, color) {
        const preview = document.getElementById('avatar-preview');
        const previewImg = document.getElementById('avatar-preview-img');
        if (src) {
            previewImg.src = src;
            preview.setAttribute('data-src', src);
        }
        if (color) {
            preview.style.backgroundColor = color;
            preview.setAttribute('data-color', color);
        }
    },

    getAvatarSelection() {
        const preview = document.getElementById('avatar-preview');
        const avatarSrc = preview.getAttribute('data-src') || 'assets/avatar_male_1.jpg';
        const color = preview.getAttribute('data-color') || '#ff2a74';
        return { avatarSrc, color };
    },

    handleLogin() {
        const usernameInput = document.getElementById('username').value.trim();
        if (!usernameInput) {
            alert('Please input a nickname or roll a random one.');
            return;
        }

        const { avatarSrc, color } = this.getAvatarSelection();

        // Default initial location: downtown SF (lively, centered)
        const initialLat = 37.7749;
        const initialLng = -122.4194;

        this.state.currentUser = {
            username: usernameInput,
            avatarSrc: avatarSrc,
            color: color,
            lat: initialLat,
            lng: initialLng
        };

        // Reset Ghost Mode on login
        this.state.ghostMode = false;

        this.saveStateToLocalStorage();
        this.navigateTo('dashboard');
    },

    handleLogout() {
        // Clear state
        this.state.currentUser = null;
        this.state.myVibe = null;
        this.state.chats = {};
        this.state.ghostMode = false;
        
        // Clear local storage
        localStorage.removeItem('almostmet_user');
        localStorage.removeItem('almostmet_chats');
        localStorage.removeItem('almostmet_myvibe');

        // Reset elements
        if (this.state.map) {
            this.state.map.remove();
            this.state.map = null;
        }
        this.state.markers = {};

        this.navigateTo('landing');
    },

    // -------------------------------------------------------------
    // DASHBOARD & MAP LOGIC
    // -------------------------------------------------------------
    initDashboard() {
        // Update user elements in sidebar
        const user = this.state.currentUser;
        if (!user) return;

        const sidebarAvatar = document.getElementById('sidebar-user-avatar');
        sidebarAvatar.innerHTML = `<img src="${user.avatarSrc}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        sidebarAvatar.style.backgroundColor = user.color;
        document.getElementById('sidebar-user-name').textContent = user.username;

        // Reset Ghost Mode UI controls
        const ghostBtn = document.getElementById('btn-dashboard-ghost');
        const ghostBanner = document.getElementById('ghost-mode-banner');
        if (ghostBtn) ghostBtn.classList.remove('active');
        if (ghostBanner) ghostBanner.style.display = 'none';

        // Initialize Geolocation & Leaflet
        setTimeout(() => {
            this.setupMap();
        }, 100);
    },

    setupMap() {
        if (this.state.map) return; // Prevent double init

        const user = this.state.currentUser;
        
        // Initialize Map centered at user's initial state coords
        this.state.map = L.map('map', {
            zoomControl: false,
            minZoom: 14,
            maxZoom: 18
        }).setView([user.lat, user.lng], 16);

        // Load CartoDB Dark Matter map tile (sleek, high aesthetic dark mode)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.state.map);

        // Add standard zoom controls to bottom-left instead of top-left
        L.control.zoom({
            position: 'bottomleft'
        }).addTo(this.state.map);

        // Attempt Geolocation to set real center if permission granted
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    
                    user.lat = lat;
                    user.lng = lng;
                    this.state.map.setView([lat, lng], 16);
                    this.updateUserMarker();
                    this.connectSocket();
                },
                (error) => {
                    console.warn("Geolocation denied/failed. Falling back to default center.", error);
                    this.updateUserMarker();
                    this.connectSocket();
                }
            );
        } else {
            this.updateUserMarker();
            this.connectSocket();
        }
    },

    updateUserMarker() {
        const user = this.state.currentUser;
        if (!this.state.map) return;

        // Remove old marker if exists
        if (this.state.userMarker) {
            this.state.userMarker.remove();
        }

        // Custom HTML Marker for current user
        let userMarkerHtml = "";
        if (this.state.ghostMode) {
            userMarkerHtml = `
                <div class="marker-pin-wrapper">
                    <div class="marker-avatar-circle" style="background-color: #3f3f46; border-color: var(--primary); box-shadow: 0 0 15px var(--primary-glow); display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
                        👻
                        <span class="marker-badge" style="background-color: #18181b;">GHOST</span>
                    </div>
                    <div class="marker-indicator-triangle" style="border-top-color: var(--primary);"></div>
                </div>
            `;
        } else {
            userMarkerHtml = `
                <div class="marker-pin-wrapper">
                    <div class="marker-avatar-circle" style="background-color: ${user.color}; border-color: #ffffff; padding:0; overflow:hidden;">
                        <img src="${user.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                        <span class="marker-badge">You</span>
                    </div>
                    <div class="marker-indicator-triangle" style="border-top-color: #ffffff;"></div>
                </div>
            `;
        }

        const userIcon = L.divIcon({
            className: 'custom-leaflet-marker',
            html: userMarkerHtml,
            iconSize: [44, 52],
            iconAnchor: [22, 52]
        });

        this.state.userMarker = L.marker([user.lat, user.lng], { icon: userIcon }).addTo(this.state.map);
        
        // If user already had a casted vibe, render it too
        if (this.state.myVibe) {
            this.renderMyVibeMarker();
        }
    },

    // ---------------------------------------------------------------
    // SOCKET.IO REAL-TIME CONNECTION
    // ---------------------------------------------------------------
    connectSocket() {
        if (this.state.socket) return; // Already connected

        // Connect to our server
        const socket = io();
        this.state.socket = socket;

        const user = this.state.currentUser;

        // When connected, join with our profile
        socket.on('connect', () => {
            console.log('[AlmostMet] Connected to server:', socket.id);

            socket.emit('user:join', {
                userId: this.state.userId,
                username: user.username,
                avatarSrc: user.avatarSrc,
                color: user.color,
                lat: user.lat,
                lng: user.lng,
                feeling: this.state.myVibe ? this.state.myVibe.feeling : null,
                feelingEmoji: this.state.myVibe ? this.state.myVibe.emoji : null,
                dress: this.state.myVibe ? this.state.myVibe.dress : null,
                thought: this.state.myVibe ? this.state.myVibe.thought : null,
                ghostMode: this.state.ghostMode
            });
        });

        // Receive list of already-online users
        socket.on('users:list', (users) => {
            console.log('[AlmostMet] Online users:', users.length);
            users.forEach(u => {
                if (!u.ghostMode) {
                    this.addRemoteUser(u);
                }
            });
            this.renderNearbyMarkers();
            this.switchTab(this.state.activeTab);
        });

        // A new user just joined
        socket.on('user:joined', (userData) => {
            console.log('[AlmostMet] User joined:', userData.username);
            if (!userData.ghostMode) {
                this.addRemoteUser(userData);
                this.renderNearbyMarkers();
                this.switchTab(this.state.activeTab);
            }
        });

        // A user updated their vibe/location
        socket.on('user:updated', (data) => {
            const idx = this.state.nearbyUsers.findIndex(u => u.id === data.userId);
            if (idx !== -1) {
                Object.assign(this.state.nearbyUsers[idx], data);
                // Recalculate distance
                const u = this.state.nearbyUsers[idx];
                if (u.lat && u.lng) {
                    u.distance = this.calculateDistance(
                        this.state.currentUser.lat, this.state.currentUser.lng,
                        u.lat, u.lng
                    );
                }
                this.renderNearbyMarkers();
            }
        });

        // User went ghost
        socket.on('user:ghosted', ({ userId }) => {
            this.removeRemoteUser(userId);
            this.renderNearbyMarkers();
        });

        // User came back from ghost
        socket.on('user:unghosted', (userData) => {
            this.addRemoteUser(userData);
            this.renderNearbyMarkers();
        });

        // A user left
        socket.on('user:left', ({ userId }) => {
            console.log('[AlmostMet] User left:', userId);
            this.removeRemoteUser(userId);
            this.renderNearbyMarkers();
            this.switchTab(this.state.activeTab);
        });

        // Incoming chat message from another user
        socket.on('chat:message', ({ fromUserId, fromUsername, text, timestamp }) => {
            console.log('[AlmostMet] Chat from', fromUsername, ':', text);

            if (!this.state.chats[fromUserId]) {
                this.state.chats[fromUserId] = [];
            }

            this.state.chats[fromUserId].push({
                sender: 'them',
                text: text,
                timestamp: timestamp,
                unread: true
            });

            // Re-render if chat drawer is open for this partner
            if (this.state.activeChatPartnerId === fromUserId) {
                this.renderChatMessages();
                // Mark as read immediately since drawer is open
                const msgs = this.state.chats[fromUserId];
                if (msgs.length > 0) {
                    msgs[msgs.length - 1].unread = false;
                }
            }

            this.renderChatsSidebar();
            this.saveStateToLocalStorage();
            this.updateChatBadge();
        });

        // Incoming image from another user
        socket.on('chat:image', ({ fromUserId, fromUsername, imageData, timestamp }) => {
            console.log('[AlmostMet] Image from', fromUsername);
            
            if (!this.state.chats[fromUserId]) {
                this.state.chats[fromUserId] = [];
            }

            this.state.chats[fromUserId].push({
                sender: 'them',
                type: 'image',
                imageData: imageData,
                timestamp: timestamp,
                unread: true
            });

            if (this.state.activeChatPartnerId === fromUserId) {
                this.renderChatMessages();
                const msgs = this.state.chats[fromUserId];
                if (msgs.length > 0) msgs[msgs.length - 1].unread = false;
            }

            this.renderChatsSidebar();
            this.saveStateToLocalStorage();
            this.updateChatBadge();
        });

        // Incoming music sync events
        socket.on('music:share', ({ fromUserId, videoId }) => {
            if (this.state.activeChatPartnerId === fromUserId) {
                document.getElementById('yt-sync-panel').style.display = 'block';
                this.loadYouTubeVideo(videoId);
            }
        });

        socket.on('music:sync', ({ fromUserId, action, time }) => {
            if (this.state.activeChatPartnerId === fromUserId && this.state.ytPlayer) {
                if (action === 'play') {
                    if (time !== undefined && Math.abs(this.state.ytPlayer.getCurrentTime() - time) > 2) {
                        this.state.ytPlayer.seekTo(time);
                    }
                    this.state.ytPlayer.playVideo();
                } else if (action === 'pause') {
                    this.state.ytPlayer.pauseVideo();
                }
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log('[AlmostMet] Disconnected from server');
        });

        // Handle reconnect
        socket.on('reconnect', () => {
            console.log('[AlmostMet] Reconnected!');
            socket.emit('user:join', {
                userId: this.state.userId,
                username: user.username,
                avatarSrc: user.avatarSrc,
                color: user.color,
                lat: user.lat,
                lng: user.lng,
                feeling: this.state.myVibe ? this.state.myVibe.feeling : null,
                feelingEmoji: this.state.myVibe ? this.state.myVibe.emoji : null,
                dress: this.state.myVibe ? this.state.myVibe.dress : null,
                thought: this.state.myVibe ? this.state.myVibe.thought : null,
                ghostMode: this.state.ghostMode
            });
        });
    },

    addRemoteUser(userData) {
        // Don't add ourselves
        if (userData.userId === this.state.userId) return;

        // Don't add duplicates
        const existingIdx = this.state.nearbyUsers.findIndex(u => u.id === userData.userId);
        if (existingIdx !== -1) {
            // Update existing user data
            Object.assign(this.state.nearbyUsers[existingIdx], {
                username: userData.username,
                avatarSrc: userData.avatarSrc,
                color: userData.color,
                lat: userData.lat,
                lng: userData.lng,
                feeling: userData.feeling || null,
                feelingEmoji: userData.feelingEmoji || null,
                dress: userData.dress || null,
                thought: userData.thought || null
            });
            return;
        }

        const user = this.state.currentUser;
        const distance = this.calculateDistance(
            user.lat, user.lng,
            userData.lat || user.lat, userData.lng || user.lng
        );

        this.state.nearbyUsers.push({
            id: userData.userId,
            username: userData.username,
            avatarSrc: userData.avatarSrc,
            color: userData.color,
            feeling: userData.feeling || 'social',
            feelingEmoji: userData.feelingEmoji || '🌟',
            dress: userData.dress || 'Unknown',
            thought: userData.thought || 'Just joined nearby!',
            lat: userData.lat || user.lat + (Math.random() - 0.5) * 0.002,
            lng: userData.lng || user.lng + (Math.random() - 0.5) * 0.002,
            distance: distance
        });
    },

    removeRemoteUser(userId) {
        this.state.nearbyUsers = this.state.nearbyUsers.filter(u => u.id !== userId);
        // Remove their marker
        if (this.state.markers[userId]) {
            this.state.markers[userId].markerObj.remove();
            delete this.state.markers[userId];
        }
    },

    updateChatBadge() {
        let unreadCount = 0;
        Object.values(this.state.chats).forEach(msgs => {
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.sender === 'them' && lastMsg.unread) {
                unreadCount++;
            }
        });
        const badge = document.getElementById('mob-chat-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    renderNearbyMarkers() {
        // Clear old markers from map
        Object.keys(this.state.markers).forEach(id => {
            this.state.markers[id].markerObj.remove();
        });
        this.state.markers = {};

        // Draw active nearby markers
        this.state.nearbyUsers.forEach(u => {
            // Apply category filter
            if (this.state.filter !== 'all' && u.feeling !== this.state.filter) {
                return; // Skip drawing this user
            }

            const markerIcon = L.divIcon({
                className: 'custom-leaflet-marker',
                html: `
                    <div class="marker-pin-wrapper">
                        <div class="marker-avatar-circle" style="background-color: ${u.color}; padding:0; overflow:hidden;">
                            <img src="${u.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                            <span class="marker-badge" style="background-color: var(--primary);">${u.feelingEmoji}</span>
                        </div>
                        <div class="marker-indicator-triangle"></div>
                    </div>
                `,
                iconSize: [44, 52],
                iconAnchor: [22, 52]
            });

            const marker = L.marker([u.lat, u.lng], { icon: markerIcon }).addTo(this.state.map);

            // Bind Snapchat-like neon popup card
            const popupContent = `
                <div class="popup-vibe-header">
                    <div class="popup-avatar" style="background-color: ${u.color}; padding:0; overflow:hidden;"><img src="${u.avatarSrc}" style="width:100%; height:100%; object-fit:cover;"></div>
                    <div class="popup-title">${u.username}</div>
                </div>
                <div class="popup-vibe-content">
                    <p style="margin-bottom: 6px; font-weight:500;">👗 Dress: <span style="color: var(--primary-bright); font-style:italic;">${u.dress}</span></p>
                    <p style="font-weight:400; color: #dfdfdf;">"${u.thought}"</p>
                </div>
                <div class="popup-meta">
                    <span>📍 ~${u.distance}m away</span>
                    <span>Feeling: ${u.feelingEmoji}</span>
                </div>
                <a href="#" class="popup-btn" onclick="event.preventDefault(); app.startChat('${u.id}')">Secret Chat</a>
            `;

            marker.bindPopup(popupContent, {
                maxWidth: 240,
                closeButton: false
            });

            this.state.markers[u.id] = {
                markerObj: marker,
                data: u
            };
        });
    },

    recenterMap() {
        const user = this.state.currentUser;
        if (this.state.map && user) {
            this.state.map.setView([user.lat, user.lng], 16, { animate: true });
        }
    },

    toggleGhostMode() {
        this.state.ghostMode = !this.state.ghostMode;
        
        const ghostBtn = document.getElementById('btn-dashboard-ghost');
        const ghostBanner = document.getElementById('ghost-mode-banner');
        const user = this.state.currentUser;

        if (this.state.ghostMode) {
            if (ghostBtn) ghostBtn.classList.add('active');
            if (ghostBanner) {
                ghostBanner.style.display = 'flex';
                ghostBanner.querySelector('span').textContent = `Ghost Mode: Disguised as "SpecterGhost"`;
            }
            
            // Temporary change display name in sidebar
            document.getElementById('sidebar-user-name').textContent = "SpecterGhost";
            document.querySelector('.user-status-text').textContent = "Disguised & Invisible";
            
            // Change sidebar avatar preview to Ghost
            const sidebarAvatar = document.getElementById('sidebar-user-avatar');
            sidebarAvatar.innerHTML = "👻";
            sidebarAvatar.style.backgroundColor = "#3f3f46";
        } else {
            if (ghostBtn) ghostBtn.classList.remove('active');
            if (ghostBanner) ghostBanner.style.display = 'none';

            // Restore display name
            document.getElementById('sidebar-user-name').textContent = user.username;
            document.querySelector('.user-status-text').textContent = "Active Nearby";

            // Restore avatar image
            const sidebarAvatar = document.getElementById('sidebar-user-avatar');
            sidebarAvatar.innerHTML = `<img src="${user.avatarSrc}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            sidebarAvatar.style.backgroundColor = user.color;
        }

        // Redraw main user marker
        this.updateUserMarker();
        
        // Re-render sidebar vibes feed (since our indicator updates)
        if (this.state.activeTab === 'vibes') {
            this.renderVibesSidebar();
        }

        // Broadcast ghost mode change to other users via socket
        if (this.state.socket) {
            this.state.socket.emit('user:ghost', this.state.ghostMode);
        }
    },

    setCategoryFilter(filterType) {
        this.state.filter = filterType;
        this.renderNearbyMarkers();
        
        // If vibes feed tab is active, update sidebar list too
        if (this.state.activeTab === 'vibes') {
            this.renderVibesSidebar();
        }
    },

    // -------------------------------------------------------------
    // CHAT DRAWER & PRIVATE CHAT LOGIC
    // -------------------------------------------------------------
    startChat(partnerId) {
        // Find partner data
        const partner = this.state.nearbyUsers.find(u => u.id === partnerId);
        if (!partner) return;

        this.state.activeChatPartnerId = partnerId;

        // Close leaflet popup
        if (this.state.markers[partnerId]) {
            this.state.markers[partnerId].markerObj.closePopup();
        }

        // Initialize chat history array if not present
        if (!this.state.chats[partnerId]) {
            this.state.chats[partnerId] = [];
        }

        // Render partner info in drawer
        document.getElementById('chat-partner-name').textContent = partner.username;
        const avatarDiv = document.getElementById('chat-partner-avatar');
        avatarDiv.innerHTML = `<img src="${partner.avatarSrc}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        avatarDiv.style.backgroundColor = partner.color;
        document.getElementById('chat-partner-vibe').innerHTML = `Feeling: ${partner.feelingEmoji} &nbsp;|&nbsp; 👗 ${partner.dress}`;

        // Render messages
        this.renderChatMessages();

        // Slide open the drawer
        document.getElementById('chat-drawer').classList.add('open');

        // Mark chat as read (remove unread class in list item if exists)
        this.renderChatsSidebar();
    },

    closeChatDrawer() {
        document.getElementById('chat-drawer').classList.remove('open');
        this.state.activeChatPartnerId = null;
        this.renderChatsSidebar(); // Refresh list to show last messages
    },

    renderChatMessages() {
        const partnerId = this.state.activeChatPartnerId;
        const chatBox = document.getElementById('chat-messages-box');
        chatBox.innerHTML = '';

        if (!partnerId || !this.state.chats[partnerId]) return;

        const messages = this.state.chats[partnerId];

        if (messages.length === 0) {
            chatBox.innerHTML = `
                <div class="empty-state" style="padding: 30px;">
                    <i data-lucide="shield-check" style="color: var(--primary-bright); font-size: 2rem;"></i>
                    <p style="font-size:0.85rem; color: var(--text-muted);">This chat is encrypted and local to your device. Closing AlmostMet clears all history.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        messages.forEach(msg => {
            const group = document.createElement('div');
            group.classList.add('chat-message-group');

            if (msg.type === 'image') {
                const img = document.createElement('img');
                img.src = msg.imageData;
                img.classList.add('message-image');
                
                const bubble = document.createElement('div');
                bubble.classList.add('message-bubble', 'image-bubble', msg.sender === 'me' ? 'outgoing' : 'incoming');
                bubble.appendChild(img);
                
                // Full screen preview on click
                img.addEventListener('click', () => {
                    const overlay = document.createElement('div');
                    overlay.classList.add('image-preview-overlay');
                    const fullImg = document.createElement('img');
                    fullImg.src = msg.imageData;
                    overlay.appendChild(fullImg);
                    overlay.addEventListener('click', () => overlay.remove());
                    document.body.appendChild(overlay);
                });

                group.appendChild(bubble);
            } else {
                const bubble = document.createElement('div');
                bubble.classList.add('message-bubble', msg.sender === 'me' ? 'outgoing' : 'incoming');
                bubble.textContent = msg.text;
                group.appendChild(bubble);
            }

            chatBox.appendChild(group);
        });

        // Scroll to bottom
        chatBox.scrollTop = chatBox.scrollHeight;
    },

    sendMessage() {
        const inputField = document.getElementById('chat-input-field');
        const text = inputField.value.trim();
        const partnerId = this.state.activeChatPartnerId;

        if (!text || !partnerId) return;

        // Add user message to state
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.state.chats[partnerId].push({
            sender: 'me',
            text: text,
            timestamp: timestamp
        });

        inputField.value = '';
        this.renderChatMessages();
        this.saveStateToLocalStorage();

        // Send message to partner via socket
        if (this.state.socket) {
            this.state.socket.emit('chat:message', {
                toUserId: partnerId,
                text: text
            });
        }
    },



    // -------------------------------------------------------------
    // SIDEBAR RENDERING LOGIC
    // -------------------------------------------------------------
    renderChatsSidebar() {
        const container = document.getElementById('chats-container');
        const emptyState = document.getElementById('chats-empty-state');
        container.innerHTML = '';

        const activeThreads = Object.keys(this.state.chats);

        if (activeThreads.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';

        activeThreads.forEach(partnerId => {
            const partner = this.state.nearbyUsers.find(u => u.id === partnerId);
            if (!partner) return; // Skip if user is out of range/missing

            const messages = this.state.chats[partnerId];
            if (messages.length === 0) return;

            const lastMsg = messages[messages.length - 1];
            const hasUnread = lastMsg.sender === 'them' && lastMsg.unread;

            const item = document.createElement('div');
            item.classList.add('list-item');
            if (hasUnread) item.classList.add('unread');
            if (this.state.activeChatPartnerId === partnerId) {
                item.style.borderColor = 'var(--primary)';
                item.style.backgroundColor = 'var(--primary-dim)';
            }

            item.innerHTML = `
                <div class="list-item-avatar" style="background-color: ${partner.color}; padding:0; overflow:hidden;">
                    <img src="${partner.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                    <div class="status-indicator"></div>
                </div>
                <div class="list-item-info">
                    <div class="list-item-header">
                        <span class="list-item-title">${partner.username}</span>
                        <span class="list-item-time">${lastMsg.timestamp}</span>
                    </div>
                    <div class="list-item-preview">${lastMsg.sender === 'me' ? 'You: ' : ''}${lastMsg.text}</div>
                </div>
            `;

            // Click listener
            item.addEventListener('click', () => {
                // Clear unread flag
                if (hasUnread) {
                    lastMsg.unread = false;
                    this.saveStateToLocalStorage();
                }
                this.startChat(partnerId);
            });

            container.appendChild(item);
        });
    },

    renderVibesSidebar() {
        const container = document.getElementById('vibes-container');
        const emptyState = document.getElementById('vibes-empty-state');
        container.innerHTML = '';

        // Collect all vibes (mock users) matching the active filter
        let filteredUsers = this.state.nearbyUsers;
        if (this.state.filter !== 'all') {
            filteredUsers = filteredUsers.filter(u => u.feeling === this.state.filter);
        }

        // Add custom user's vibe if they have casted one and it matches the filter
        if (this.state.myVibe) {
            const userVibe = this.state.myVibe;
            const userFilterMatch = (this.state.filter === 'all' || userVibe.feeling === this.state.filter);
            
            if (userVibe && userFilterMatch) {
                const user = this.state.currentUser;
                const userItem = document.createElement('div');
                userItem.classList.add('list-item');
                userItem.style.border = '1px dashed var(--primary)';
                
                let userSidebarName = user.username;
                let userSidebarAvatarHtml = `<img src="${user.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">`;
                let userSidebarBg = user.color;

                if (this.state.ghostMode) {
                    userSidebarName = "SpecterGhost";
                    userSidebarAvatarHtml = "👻";
                    userSidebarBg = "#3f3f46";
                }

                userItem.innerHTML = `
                    <div class="list-item-avatar" style="background-color: ${userSidebarBg}; padding:0; overflow:hidden; display:flex; align-items:center; justify-content:center; font-size:1.1rem;">
                        ${userSidebarAvatarHtml}
                        <div class="status-indicator" style="background-color: var(--primary);"></div>
                    </div>
                    <div class="list-item-info">
                        <div class="list-item-header">
                            <span class="list-item-title" style="color: var(--primary-bright);">${userSidebarName} (You)</span>
                            <span class="list-item-time">Now</span>
                        </div>
                        <div class="list-item-preview" style="color: white; font-weight: 500;">
                            👗 ${userVibe.dress}
                        </div>
                        <div class="list-item-preview" style="font-size: 0.8rem; margin-top: 4px; font-style:italic;">
                            "${userVibe.thought}"
                        </div>
                    </div>
                `;
                userItem.addEventListener('click', () => {
                    this.state.map.setView([userVibe.lat, userVibe.lng], 17, { animate: true });
                });
                container.appendChild(userItem);
            }
        }

        if (filteredUsers.length === 0 && !this.state.myVibe) {
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';

        filteredUsers.forEach(u => {
            const item = document.createElement('div');
            item.classList.add('list-item');
            item.innerHTML = `
                <div class="list-item-avatar" style="background-color: ${u.color}; padding:0; overflow:hidden;">
                    <img src="${u.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                    <div class="status-indicator"></div>
                </div>
                <div class="list-item-info">
                    <div class="list-item-header">
                        <span class="list-item-title">${u.username}</span>
                        <span class="list-item-time">~${u.distance}m away</span>
                    </div>
                    <div class="list-item-preview" style="color: white; font-weight: 500;">
                        👗 ${u.dress}
                    </div>
                    <div class="list-item-preview" style="font-size: 0.8rem; margin-top: 4px; font-style:italic;">
                        "${u.thought}"
                    </div>
                </div>
            `;

            // Click listener: Fly to map location & open popup
            item.addEventListener('click', () => {
                const markerWrap = this.state.markers[u.id];
                if (markerWrap) {
                    this.state.map.setView([u.lat, u.lng], 17, { animate: true });
                    setTimeout(() => {
                        markerWrap.markerObj.openPopup();
                    }, 350);
                }
            });

            container.appendChild(item);
        });
    },

    // -------------------------------------------------------------
    // MODAL & NEW VIBE POST LOGIC
    // -------------------------------------------------------------
    openVibeModal() {
        document.getElementById('modal-post-vibe').classList.add('active');
        // Clear fields
        document.getElementById('vibe-dress').value = this.state.myVibe ? this.state.myVibe.dress : '';
        document.getElementById('vibe-thought').value = this.state.myVibe ? this.state.myVibe.thought : '';
    },

    closeVibeModal() {
        document.getElementById('modal-post-vibe').classList.remove('active');
    },

    submitVibe() {
        const dress = document.getElementById('vibe-dress').value.trim();
        const thought = document.getElementById('vibe-thought').value.trim();

        if (!dress || !thought) {
            alert('Please specify what you are wearing and write a short thought.');
            return;
        }

        const activeFeelingPill = document.querySelector('.vibe-tag-pill.active');
        const feeling = activeFeelingPill.dataset.feeling;
        const emoji = activeFeelingPill.dataset.emoji;

        const user = this.state.currentUser;

        // Cast Vibe locally at user coordinates
        this.state.myVibe = {
            feeling: feeling,
            emoji: emoji,
            dress: dress,
            thought: thought,
            lat: user.lat,
            lng: user.lng
        };

        this.saveStateToLocalStorage();
        this.closeVibeModal();

        // Render marker and refresh sidebar
        this.renderMyVibeMarker();
        this.switchTab('vibes');

        // Pan to own vibe marker
        this.state.map.setView([user.lat, user.lng], 17, { animate: true });

        // Broadcast vibe to other users via socket
        if (this.state.socket) {
            this.state.socket.emit('user:update', {
                feeling: feeling,
                feelingEmoji: emoji,
                dress: dress,
                thought: thought
            });
        }
    },

    renderMyVibeMarker() {
        // Redraw user marker with active vibe details
        const user = this.state.currentUser;
        const vibe = this.state.myVibe;
        if (!vibe || !this.state.userMarker) return;

        // Update popup on user marker
        const popupContent = `
            <div class="popup-vibe-header">
                <div class="popup-avatar" style="background-color: ${user.color}; padding:0; overflow:hidden;"><img src="${user.avatarSrc}" style="width:100%; height:100%; object-fit:cover;"></div>
                <div class="popup-title">${this.state.ghostMode ? 'SpecterGhost' : user.username} (You)</div>
            </div>
            <div class="popup-vibe-content">
                <p style="margin-bottom: 6px; font-weight:500;">👗 Dress: <span style="color: var(--primary-bright); font-style:italic;">${vibe.dress}</span></p>
                <p style="font-weight:400; color: #dfdfdf;">"${vibe.thought}"</p>
            </div>
            <div class="popup-meta">
                <span>📍 Casted by you</span>
                <span>Vibe: ${vibe.emoji}</span>
            </div>
        `;
        
        this.state.userMarker.bindPopup(popupContent, {
            maxWidth: 240,
            closeButton: false
        });

        // Change marker HTML slightly to showcase active pulse vibe
        let userMarkerHtml = "";
        if (this.state.ghostMode) {
            userMarkerHtml = `
                <div class="marker-pin-wrapper">
                    <div class="marker-avatar-circle" style="background-color: #3f3f46; border: 2.5px solid var(--primary); box-shadow: 0 0 15px var(--primary-glow); display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
                        👻
                        <span class="marker-badge" style="background-color: #18181b; font-size: 0.6rem;">GHOST</span>
                    </div>
                    <div class="marker-indicator-triangle" style="border-top-color: var(--primary);"></div>
                </div>
            `;
        } else {
            userMarkerHtml = `
                <div class="marker-pin-wrapper">
                    <div class="marker-avatar-circle" style="background-color: ${user.color}; border: 2.5px solid var(--primary); box-shadow: 0 0 15px var(--primary-glow); padding:0; overflow:hidden;">
                        <img src="${user.avatarSrc}" style="width:100%; height:100%; object-fit:cover;">
                        <span class="marker-badge" style="background-color: var(--primary); font-size: 0.6rem;">VIBING</span>
                    </div>
                    <div class="marker-indicator-triangle" style="border-top-color: var(--primary);"></div>
                </div>
            `;
        }

        this.state.userMarker.setIcon(L.divIcon({
            className: 'custom-leaflet-marker',
            html: userMarkerHtml,
            iconSize: [44, 52],
            iconAnchor: [22, 52]
        }));
    },

    // -------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        const d = R * c; // in meters
        return Math.round(d);
    }
};

// Start application on page load
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});
