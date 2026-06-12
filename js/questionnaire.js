document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('carfectiveForm');
    const steps = document.querySelectorAll('.form-step');
    const nextBtns = document.querySelectorAll('.next-btn');
    const prevBtns = document.querySelectorAll('.prev-btn');
    const progressBar = document.getElementById('progressBar');
    let currentStep = 0;

    // --- Progress Update ---
    const updateProgress = () => {
        const percent = ((currentStep + 1) / steps.length) * 100;
        progressBar.style.width = percent + '%';
        // Smooth scroll to top of form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // --- Navigation ---
    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                steps[currentStep].classList.remove('active');
                currentStep++;
                steps[currentStep].classList.add('active');
                updateProgress();
            }
        });
    });

    prevBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            steps[currentStep].classList.remove('active');
            currentStep--;
            steps[currentStep].classList.add('active');
            updateProgress();
        });
    });

    // --- Validation ---
    const validateStep = (stepIdx) => {
        const currentStepEl = steps[stepIdx];
        const requiredInputs = currentStepEl.querySelectorAll('[required]');
        let valid = true;

        requiredInputs.forEach(input => {
            if (input.offsetParent === null) return; // skip hidden

            if (input.type === 'radio') {
                const name = input.name;
                const checked = currentStepEl.querySelector(`input[name="${name}"]:checked`);
                const group = input.closest('.form-group');
                if (!checked) {
                    valid = false;
                    if (group) group.classList.add('error');
                } else {
                    if (group) group.classList.remove('error');
                }
            } else if (!input.value.trim()) {
                valid = false;
                input.classList.add('error');
                input.addEventListener('input', () => input.classList.remove('error'), { once: true });
            } else {
                input.classList.remove('error');
            }
        });

        // File size check
        const fileInput = currentStepEl.querySelector('#build_sheet_pdf');
        if (fileInput && fileInput.files.length > 0) {
            const size = fileInput.files[0].size / 1024 / 1024;
            if (size > 10) {
                alert('The PDF file is too large. Please upload a file under 10MB.');
                valid = false;
            }
        }

        if (!valid) {
            alert('Please complete all required fields before proceeding.');
        }
        return valid;
    };

    // --- File Upload UI ---
    const fileInputs = document.querySelectorAll('.file-upload-wrapper input[type="file"]');

    fileInputs.forEach(fileInput => {
        fileInput.addEventListener('change', () => {
            const wrapper = fileInput.closest('.file-upload-wrapper');
            const fileLabel = wrapper.querySelector('.file-label');

            if (fileInput.files.length > 0) {
                if (fileInput.files.length > 1) {
                    fileLabel.innerText = `${fileInput.files.length} files selected`;
                    fileLabel.style.color = 'var(--text-accent)';
                } else {
                    const file = fileInput.files[0];
                    const size = file.size / 1024 / 1024;

                    if (size > 10) {
                        alert('File too large. Please upload under 10MB.');
                        fileInput.value = '';
                        fileLabel.innerText = 'Click to upload or drag file here';
                        fileLabel.style.color = 'var(--text-secondary)';
                    } else {
                        fileLabel.innerText = file.name;
                        fileLabel.style.color = 'var(--text-accent)';
                    }
                }
            } else {
                fileLabel.innerText = 'Click to upload or drag file here';
                fileLabel.style.color = 'var(--text-secondary)';
            }
        });
    });

    // --- Drag & Drop Ranking (with Touch support) ---
    const priorityList = document.getElementById('priorityList');
    let dragSrcEl = null;

    // Desktop drag events
    function handleDragStart(e) {
        this.classList.add('dragging');
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDrop(e) {
        e.stopPropagation();
        if (dragSrcEl !== this) {
            const targetID = this.dataset.id;
            this.dataset.id = dragSrcEl.dataset.id;
            dragSrcEl.dataset.id = targetID;

            const targetContent = this.innerHTML;
            this.innerHTML = dragSrcEl.innerHTML;
            dragSrcEl.innerHTML = targetContent;

            updateRanks();
        }
        return false;
    }

    function handleDragEnd() {
        this.classList.remove('dragging');
        priorityList.querySelectorAll('.sort-item').forEach(item => item.classList.remove('dragging'));
    }

    // Touch drag support for mobile
    let touchDragSrc = null;
    let touchClone = null;

    function handleTouchStart(e) {
        touchDragSrc = this;
        this.classList.add('dragging');

        // Create visual clone
        touchClone = this.cloneNode(true);
        touchClone.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9999;
            opacity: 0.85;
            width: ${this.offsetWidth}px;
            transform: scale(1.02);
            transition: none;
            border: 1px solid var(--text-accent);
            border-radius: 12px;
            background: rgba(212, 175, 55, 0.1);
            padding: 1.1rem;
        `;
        document.body.appendChild(touchClone);
        moveTouchClone(e.touches[0]);
    }

    function moveTouchClone(touch) {
        if (!touchClone) return;
        touchClone.style.left = (touch.clientX - touchClone.offsetWidth / 2) + 'px';
        touchClone.style.top = (touch.clientY - 30) + 'px';
    }

    function handleTouchMove(e) {
        e.preventDefault();
        moveTouchClone(e.touches[0]);

        // Find item under finger
        const touch = e.touches[0];
        touchClone.style.display = 'none';
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        touchClone.style.display = '';

        const targetItem = el ? el.closest('.sort-item') : null;
        if (targetItem && targetItem !== touchDragSrc) {
            // Swap in DOM
            const parent = priorityList;
            const items = Array.from(parent.querySelectorAll('.sort-item'));
            const srcIdx = items.indexOf(touchDragSrc);
            const tgtIdx = items.indexOf(targetItem);

            if (srcIdx > tgtIdx) {
                parent.insertBefore(touchDragSrc, targetItem);
            } else {
                parent.insertBefore(touchDragSrc, targetItem.nextSibling);
            }
        }
    }

    function handleTouchEnd() {
        if (touchDragSrc) touchDragSrc.classList.remove('dragging');
        if (touchClone) { touchClone.remove(); touchClone = null; }
        touchDragSrc = null;
        updateRanks();
    }

    function updateRanks() {
        const items = priorityList.querySelectorAll('.sort-item');
        items.forEach((item, index) => {
            const hiddenInput = item.querySelector('.rank-input');
            if (hiddenInput) hiddenInput.value = index + 1;
        });
    }

    priorityList.querySelectorAll('.sort-item').forEach(item => {
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', handleDragStart, false);
        item.addEventListener('dragover', handleDragOver, false);
        item.addEventListener('drop', handleDrop, false);
        item.addEventListener('dragend', handleDragEnd, false);
        // Touch events
        item.addEventListener('touchstart', handleTouchStart, { passive: false });
        item.addEventListener('touchmove', handleTouchMove, { passive: false });
        item.addEventListener('touchend', handleTouchEnd, false);
    });

    updateRanks();

    // --- Finance Toggle ---
    const financeToggle = document.getElementById('financeToggle');
    const purchaseFields = document.getElementById('purchasingFields');
    const leaseFields = document.getElementById('leasingFields');

    financeToggle.addEventListener('change', () => {
        const val = form.querySelector('input[name="finance_type"]:checked');
        if (!val) return;
        if (val.value === 'Purchasing') {
            purchaseFields.style.display = 'block';
            leaseFields.style.display = 'none';
        } else if (val.value === 'Leasing') {
            purchaseFields.style.display = 'none';
            leaseFields.style.display = 'block';
        } else {
            purchaseFields.style.display = 'block';
            leaseFields.style.display = 'block';
        }
    });

    // --- Conditional Fields ---
    const setupConditionals = () => {
        const inputs = form.querySelectorAll('input[type="radio"], select, input[type="checkbox"]');
        const checkConditionals = () => {
            document.querySelectorAll('.form-step .conditional').forEach(el => {
                const fieldName = el.dataset.showIf;
                const expectedValue = el.dataset.value;
                const checkedField = form.querySelector(`[name="${fieldName}"]:checked`);
                const selectField = form.querySelector(`select[name="${fieldName}"]`);
                const field = checkedField || selectField;
                el.style.display = (field && field.value === expectedValue) ? 'block' : 'none';
            });
        };
        inputs.forEach(input => input.addEventListener('change', checkConditionals));
        checkConditionals();
    };

    setupConditionals();

    // --- Submission ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        updateRanks();

        const submitBtn = document.getElementById('submitBtn');
        const overlay = document.getElementById('submittingOverlay');
        const statusText = document.getElementById('submitStatusText');
        submitBtn.disabled = true;

        // Show overlay
        overlay.style.display = 'flex';
        steps[currentStep].style.visibility = 'hidden';

        // Cycle status messages to reassure the user
        const messages = [
            'This may take a moment…',
            'Encoding your files…',
            'Uploading to our server…',
            'Almost there…'
        ];
        let msgIdx = 0;
        const msgTimer = setInterval(() => {
            msgIdx = (msgIdx + 1) % messages.length;
            statusText.textContent = messages[msgIdx];
        }, 2200);

        const toBase64 = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });

        const formData = new FormData(form);
        const data = {};

        for (let [key, value] of formData.entries()) {
            if (data[key]) {
                if (!Array.isArray(data[key])) data[key] = [data[key]];
                data[key].push(value);
            } else {
                data[key] = value;
            }
        }

        for (let key in data) {
            if (Array.isArray(data[key]) && !(data[key][0] instanceof File)) {
                data[key] = data[key].join(', ');
            }
        }

        const allFileInputs = form.querySelectorAll('input[type="file"]');
        for (const input of allFileInputs) {
            const key = input.name;
            if (input.files && input.files.length > 0) {
                if (input.multiple && input.files.length > 1) {
                    data[key] = [];
                    for (let i = 0; i < input.files.length; i++) {
                        try {
                            const file = input.files[i];
                            const base64Content = await toBase64(file);
                            data[key].push({ base64: base64Content.split(',')[1], type: file.type, name: file.name });
                        } catch (err) { console.error('File error:', err); }
                    }
                } else {
                    try {
                        const file = input.files[0];
                        const base64Content = await toBase64(file);
                        data[key] = { base64: base64Content.split(',')[1], type: file.type, name: file.name };
                    } catch (err) { console.error('File error:', err); }
                }
            } else {
                data[key] = {};
            }
        }

        if (typeof grecaptcha !== 'undefined') {
            const resp = grecaptcha.getResponse();
            if (!resp) {
                alert('Please complete the CAPTCHA.');
                clearInterval(msgTimer);
                overlay.style.display = 'none';
                steps[currentStep].style.visibility = '';
                submitBtn.disabled = false;
                return;
            }
            data['g-recaptcha-response'] = resp;
        }

        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw_0jMWyofmIV0uJXstyRMnZTlPMOYrAZVU8fRu6xzAVuHFYVAFx2R6Ld0px2zq46ov/exec';

        try {
            if (SCRIPT_URL.includes('YOUR_GOOGLE_')) {
                await new Promise(r => setTimeout(r, 1500));
            } else {
                await fetch(SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    body: JSON.stringify(data)
                });
            }

            clearInterval(msgTimer);
            overlay.style.display = 'none';
            steps[currentStep].style.visibility = '';
            steps[currentStep].classList.remove('active');
            document.getElementById('successMessage').style.display = 'flex';
            progressBar.style.width = '100%';
        } catch (err) {
            console.error('Submission error:', err);
            clearInterval(msgTimer);
            overlay.style.display = 'none';
            steps[currentStep].style.visibility = '';
            steps[currentStep].classList.remove('active');
            document.getElementById('errorMessage').style.display = 'flex';
        }
    });
});
