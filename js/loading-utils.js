// Loading utility functions for showing/hiding loading indicators

class LoadingManager {
    constructor() {
        this.loadingCount = 0;
        this.loadingElement = null;
        this.init();
    }

    init() {
        // Create loading element if it doesn't exist
        this.loadingElement = document.getElementById('loading');
        if (!this.loadingElement) {
            this.createLoadingElement();
        }
    }

    createLoadingElement() {
        const loadingHTML = `
            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>Loading...</p>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', loadingHTML);
        this.loadingElement = document.getElementById('loading');
    }

    show(message = 'Loading...') {
        this.loadingCount++;
        if (this.loadingElement) {
            const textElement = this.loadingElement.querySelector('p');
            if (textElement) {
                textElement.textContent = message;
            }
            this.loadingElement.classList.add('active');
            console.log('Loading shown:', message);
        }
    }

    hide() {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        if (this.loadingCount === 0 && this.loadingElement) {
            this.loadingElement.classList.remove('active');
            console.log('Loading hidden');
        }
    }

    forceHide() {
        this.loadingCount = 0;
        if (this.loadingElement) {
            this.loadingElement.classList.remove('active');
            console.log('Loading force hidden');
        }
    }
}

// Create global loading manager instance
window.loadingManager = new LoadingManager();

// Export for use in modules
export default LoadingManager;