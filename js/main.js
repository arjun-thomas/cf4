document.addEventListener('DOMContentLoaded', () => {

    // --- Detect mobile for performance decisions ---
    const isMobile = () => window.innerWidth <= 900 || ('ontouchstart' in window);

    // --- Navigation Scroll Effect ---
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });

    // --- Mobile Menu Toggle ---
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const menuIcon = menuBtn ? menuBtn.querySelector('i') : null;

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            if (menuIcon) {
                menuIcon.className = isOpen ? 'fas fa-times' : 'fas fa-bars';
            }
        });

        // Close menu when a link is clicked
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                if (menuIcon) menuIcon.className = 'fas fa-bars';
            });
        });

        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (!nav.contains(e.target) && navLinks.classList.contains('open')) {
                navLinks.classList.remove('open');
                if (menuIcon) menuIcon.className = 'fas fa-bars';
            }
        });
    }

    // --- Parallax Effect (desktop only, throttled with RAF) ---
    const parallaxBg = document.querySelector('.hero-bg');
    const parallaxEls = document.querySelectorAll('.parallax-el');
    let ticking = false;

    if (!isMobile()) {
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const offset = window.pageYOffset;

                    if (parallaxBg) {
                        parallaxBg.style.transform = `translateY(${offset * 0.35}px)`;
                    }

                    parallaxEls.forEach(el => {
                        const speedY = parseFloat(el.dataset.speed) || 0.1;
                        const elOffset = el.getBoundingClientRect().top;
                        if (elOffset < window.innerHeight + 100 && elOffset > -window.innerHeight) {
                            el.style.transform = `translateY(${elOffset * speedY}px)`;
                        }
                    });

                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // --- Reveal on Scroll ---
    const revealElements = document.querySelectorAll('.reveal');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Don't unobserve — allow re-trigger for parallax returns
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: "0px 0px -40px 0px"
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // --- Process Accordion ---
    document.querySelectorAll('.process-accordion').forEach(step => {
        step.addEventListener('click', () => step.classList.toggle('expanded'));
    });

    // --- Active Nav on Scroll ---
    const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');
    const navSections = Array.from(navAnchors)
        .map(a => document.querySelector(a.getAttribute('href')))
        .filter(Boolean);

    const navObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navAnchors.forEach(a => {
                    a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`);
                });
            }
        });
    }, { threshold: 0.3, rootMargin: '-10% 0px -60% 0px' });

    navSections.forEach(s => navObserver.observe(s));

    // --- Additional FAQ Toggle ---
    const additionalFaqToggle = document.querySelector('.additional-faq-toggle');
    const additionalFaqGrid = document.getElementById('additionalFaq');
    if (additionalFaqToggle && additionalFaqGrid) {
        additionalFaqToggle.addEventListener('click', () => {
            additionalFaqGrid.classList.toggle('expanded');
            const icon = additionalFaqToggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
            }
        });
    }

    // --- FAQ Accordion ---
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        item.addEventListener('click', () => {
            const wasActive = item.classList.contains('active');
            // Close all
            faqItems.forEach(other => other.classList.remove('active'));
            // Toggle current
            if (!wasActive) item.classList.add('active');
        });
    });

});
