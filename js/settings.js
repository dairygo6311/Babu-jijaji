import { db } from './firebase-config.js';
import { 
    collection, 
    doc,
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class SettingsManager {
    constructor() {
        this.currentSettings = null;
        this.init();
    }

    async init() {
        console.log('Initializing Settings Manager');
        this.setupEventListeners();
        await this.loadCurrentSettings();
        this.checkConnections();
    }

    setupEventListeners() {
        const form = document.getElementById('settings-form');
        const loadBtn = document.getElementById('load-current-settings');
        const resetBtn = document.getElementById('reset-settings');
        const testTelegramBtn = document.getElementById('test-telegram');

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }

        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                this.loadCurrentSettings();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetToDefaults();
            });
        }

        if (testTelegramBtn) {
            testTelegramBtn.addEventListener('click', () => {
                this.testTelegramBot();
            });
        }
    }

    async loadCurrentSettings() {
        try {
            this.showLoading(true);
            
            // Try to get settings from Firestore first
            const settingsDoc = await getDoc(doc(db, 'app_settings', 'main'));
            
            if (settingsDoc.exists()) {
                this.currentSettings = settingsDoc.data();
                this.populateForm(this.currentSettings);
                this.showNotification('Settings loaded successfully', 'success');
            } else {
                // If no settings in Firestore, extract from current files
                await this.extractCurrentSettings();
            }

            this.updateLastUpdated(this.currentSettings?.lastUpdated);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showNotification('Error loading settings: ' + error.message, 'error');
            // Fallback to extracting from files
            await this.extractCurrentSettings();
        } finally {
            this.showLoading(false);
        }
    }

    async extractCurrentSettings() {
        // Extract current settings from project files
        const defaultSettings = {
            // Project Configuration
            projectName: 'SUDHA SAGAR',
            businessType: 'DAIRY',
            
            // Contact Information
            contactNumber: '9413577474',
            adminEmail: 'admin@sudhasagar.com',
            
            // Firebase Configuration (from firebase-config.js)
            firebase: {
                apiKey: "AIzaSyDL7AzbkoI8XXn9TfRwOg9K2T0M-K60p3I",
    authDomain: "dairy-4aee1.firebaseapp.com",
    databaseURL: "https://dairy-4aee1-default-rtdb.firebaseio.com",
    projectId: "dairy-4aee1",
    storageBucket: "dairy-4aee1.firebasestorage.app",
    messagingSenderId: "952312422395",
    appId: "1:952312422395:web:909f176fc2b4530008355e",
    measurementId: "G-J6L08JDM5M"
            },
            
            // Telegram Configuration
            telegram: {
                botToken: '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ',
                adminChatId: '5861659575'
            },
            
            lastUpdated: new Date().toISOString()
        };

        this.currentSettings = defaultSettings;
        this.populateForm(defaultSettings);
        
        // Save to Firestore for future use
        await this.saveSettingsToFirestore(defaultSettings);
        
        this.showNotification('Current settings extracted and loaded', 'info');
    }

    populateForm(settings) {
        // Project Configuration
        this.setFieldValue('project-name', settings.projectName);
        this.setFieldValue('business-type', settings.businessType);
        
        // Contact Information
        this.setFieldValue('contact-number', settings.contactNumber);
        this.setFieldValue('admin-email', settings.adminEmail);
        
        // Firebase Configuration
        if (settings.firebase) {
            this.setFieldValue('firebase-api-key', settings.firebase.apiKey);
            this.setFieldValue('firebase-auth-domain', settings.firebase.authDomain);
            this.setFieldValue('firebase-project-id', settings.firebase.projectId);
            this.setFieldValue('firebase-storage-bucket', settings.firebase.storageBucket);
            this.setFieldValue('firebase-messaging-sender-id', settings.firebase.messagingSenderId);
            this.setFieldValue('firebase-app-id', settings.firebase.appId);
            this.setFieldValue('firebase-measurement-id', settings.firebase.measurementId || '');
            this.setFieldValue('firebase-database-url', settings.firebase.databaseURL || '');
        }
        
        // Telegram Configuration
        if (settings.telegram) {
            this.setFieldValue('telegram-bot-token', settings.telegram.botToken);
            this.setFieldValue('admin-chat-id', settings.telegram.adminChatId);
        }
    }

    setFieldValue(fieldId, value) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = value || '';
        }
    }

    getFieldValue(fieldId) {
        const field = document.getElementById(fieldId);
        return field ? field.value.trim() : '';
    }

    async saveSettings() {
        try {
            this.showLoading(true);
            
            // Gather all settings from form
            const settings = {
                // Project Configuration
                projectName: this.getFieldValue('project-name'),
                businessType: this.getFieldValue('business-type'),
                
                // Contact Information
                contactNumber: this.getFieldValue('contact-number'),
                adminEmail: this.getFieldValue('admin-email'),
                
                // Firebase Configuration
                firebase: {
                    apiKey: this.getFieldValue('firebase-api-key'),
                    authDomain: this.getFieldValue('firebase-auth-domain'),
                    projectId: this.getFieldValue('firebase-project-id'),
                    storageBucket: this.getFieldValue('firebase-storage-bucket'),
                    messagingSenderId: this.getFieldValue('firebase-messaging-sender-id'),
                    appId: this.getFieldValue('firebase-app-id'),
                    measurementId: this.getFieldValue('firebase-measurement-id'),
                    databaseURL: this.getFieldValue('firebase-database-url')
                },
                
                // Telegram Configuration
                telegram: {
                    botToken: this.getFieldValue('telegram-bot-token'),
                    adminChatId: this.getFieldValue('admin-chat-id')
                },
                
                lastUpdated: new Date().toISOString()
            };

            // Validate required fields
            if (!this.validateSettings(settings)) {
                return;
            }

            // Save to Firestore
            await this.saveSettingsToFirestore(settings);
            
            // Update all project files
            await this.updateProjectFiles(settings);
            
            // Update current settings
            this.currentSettings = settings;
            
            this.showNotification('Settings saved and applied successfully! 🎉', 'success');
            this.updateLastUpdated(settings.lastUpdated);
            
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Error saving settings: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    validateSettings(settings) {
        const required = [
            { field: 'projectName', message: 'Project Name is required' },
            { field: 'businessType', message: 'Business Type is required' },
            { field: 'contactNumber', message: 'Contact Number is required' },
            { field: 'adminEmail', message: 'Admin Email is required' }
        ];

        for (const req of required) {
            if (!settings[req.field]) {
                this.showNotification(req.message, 'error');
                return false;
            }
        }

        // Validate contact number format
        if (!/^\d{10}$/.test(settings.contactNumber)) {
            this.showNotification('Contact Number must be 10 digits', 'error');
            return false;
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.adminEmail)) {
            this.showNotification('Please enter a valid email address', 'error');
            return false;
        }

        // Validate Firebase settings
        const firebaseRequired = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        for (const field of firebaseRequired) {
            if (!settings.firebase[field]) {
                this.showNotification(`Firebase ${field} is required`, 'error');
                return false;
            }
        }

        // Validate Telegram settings
        if (!settings.telegram.botToken || !settings.telegram.adminChatId) {
            this.showNotification('Telegram Bot Token and Admin Chat ID are required', 'error');
            return false;
        }

        return true;
    }

    async saveSettingsToFirestore(settings) {
        const settingsRef = doc(db, 'app_settings', 'main');
        await setDoc(settingsRef, {
            ...settings,
            lastUpdated: serverTimestamp()
        }, { merge: true });
    }

    async updateProjectFiles(settings) {
        // This would typically be done server-side for security
        // For now, we'll show a message that manual updates are needed
        this.showNotification('⚠️ Note: Some changes may require manual file updates or redeployment', 'info');
        
        // Store updated settings in localStorage for other components to use
        localStorage.setItem('app_settings', JSON.stringify(settings));
        
        // Trigger custom event for other components to listen
        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
    }

    async testTelegramBot() {
        try {
            const botToken = this.getFieldValue('telegram-bot-token');
            const adminChatId = this.getFieldValue('admin-chat-id');
            
            if (!botToken) {
                this.showNotification('Please enter Telegram Bot Token first', 'error');
                return;
            }

            this.showLoading(true);
            
            // Test bot connection
            const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
            const data = await response.json();
            
            if (data.ok) {
                this.showNotification(`✅ Bot connected: ${data.result.first_name} (@${data.result.username})`, 'success');
                this.updateStatus('telegram-status', 'Connected', 'success');
                
                // If admin chat ID is provided, send test message
                if (adminChatId) {
                    const testMessage = `🛠️ Settings Test Message\n\nHello! This is a test message from your SUDHA SAGAR settings panel.\n\nBot is working correctly! ✅\n\nTime: ${new Date().toLocaleString('en-IN')}`;
                    
                    const messageResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: adminChatId,
                            text: testMessage
                        })
                    });
                    
                    const messageData = await messageResponse.json();
                    if (messageData.ok) {
                        this.showNotification('✅ Test message sent to admin successfully!', 'success');
                    } else {
                        this.showNotification(`❌ Bot works but couldn't send message: ${messageData.description}`, 'error');
                    }
                }
            } else {
                this.showNotification(`❌ Bot connection failed: ${data.description}`, 'error');
                this.updateStatus('telegram-status', 'Failed', 'error');
            }
            
        } catch (error) {
            console.error('Error testing Telegram bot:', error);
            this.showNotification('Error testing bot: ' + error.message, 'error');
            this.updateStatus('telegram-status', 'Error', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    resetToDefaults() {
        if (confirm('Are you sure you want to reset all settings to default values? This action cannot be undone.')) {
            this.extractCurrentSettings();
            this.showNotification('Settings reset to defaults', 'info');
        }
    }

    checkConnections() {
        // Check Firebase connection
        if (db) {
            this.updateStatus('firebase-status', 'Connected', 'success');
        } else {
            this.updateStatus('firebase-status', 'Disconnected', 'error');
        }
    }

    updateStatus(statusId, text, type = 'info') {
        const statusElement = document.getElementById(statusId);
        if (statusElement) {
            statusElement.textContent = text;
            statusElement.className = `status-value status-${type}`;
        }
    }

    updateLastUpdated(timestamp) {
        const lastUpdatedElement = document.getElementById('last-updated');
        if (lastUpdatedElement && timestamp) {
            const date = new Date(timestamp);
            lastUpdatedElement.textContent = date.toLocaleString('en-IN');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span>${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        // Add to notification container
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = '3000';
            document.body.appendChild(container);
        }

        container.appendChild(notification);

        // Set up close functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    // Static method to get current settings for other components
    static async getCurrentSettings() {
        try {
            // First try localStorage (fast access)
            const stored = localStorage.getItem('app_settings');
            if (stored) {
                return JSON.parse(stored);
            }

            // Fallback to Firestore
            const settingsDoc = await getDoc(doc(db, 'app_settings', 'main'));
            if (settingsDoc.exists()) {
                const settings = settingsDoc.data();
                localStorage.setItem('app_settings', JSON.stringify(settings));
                return settings;
            }
        } catch (error) {
            console.error('Error getting settings:', error);
        }

        return null;
    }
}

// Initialize settings manager
const settingsManager = new SettingsManager();
window.settingsManager = settingsManager;

export default settingsManager;