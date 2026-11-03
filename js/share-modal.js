(function () {
    function setupShareModal() {
        const modal = document.getElementById('share-modal');
        if (!modal) {
            return;
        }

        const openButtons = Array.from(document.querySelectorAll('[data-share-open], #share-open-btn'));
        const closeButtons = Array.from(document.querySelectorAll('[data-share-close], #share-close-btn'));

        openButtons.forEach((button) => {
            if (!button) {
                return;
            }
            button.addEventListener('click', () => {
                modal.style.display = 'flex';
            });
        });

        const closeModal = () => {
            modal.style.display = 'none';
        };

        closeButtons.forEach((button) => {
            if (!button) {
                return;
            }
            button.addEventListener('click', closeModal);
        });

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupShareModal);
    } else {
        setupShareModal();
    }
})();
