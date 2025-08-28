// Simple navigation handler for mobile menu
class SimpleNavigation {
    constructor() {
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupMobileMenu();
            });
        } else {
            this.setupMobileMenu();
        }
    }

    setupMobileMenu() {
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const navigation = document.getElementById('navigation');
        const navOverlay = document.getElementById('nav-overlay');

        if (mobileMenuToggle && navigation && navOverlay) {
            // Toggle menu on hamburger click
            mobileMenuToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMobileMenu();
            });

            // Close menu on overlay click
            navOverlay.addEventListener('click', (e) => {
                this.closeMobileMenu();
            });

            // Close menu on escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeMobileMenu();
                }
            });
        }
    }

    toggleMobileMenu() {
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const navigation = document.getElementById('navigation');
        const navOverlay = document.getElementById('nav-overlay');

        if (mobileMenuToggle && navigation && navOverlay) {
            const isActive = navigation.classList.contains('active');
            
            if (isActive) {
                this.closeMobileMenu();
            } else {
                this.openMobileMenu();
            }
        }
    }

    openMobileMenu() {
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const navigation = document.getElementById('navigation');
        const navOverlay = document.getElementById('nav-overlay');

        if (mobileMenuToggle && navigation && navOverlay) {
            mobileMenuToggle.classList.add('active');
            navigation.classList.add('active');
            navOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeMobileMenu() {
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const navigation = document.getElementById('navigation');
        const navOverlay = document.getElementById('nav-overlay');

        if (mobileMenuToggle && navigation && navOverlay) {
            mobileMenuToggle.classList.remove('active');
            navigation.classList.remove('active');
            navOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
}

// Initialize navigation
window.simpleNav = new SimpleNavigation();

export default window.simpleNav;