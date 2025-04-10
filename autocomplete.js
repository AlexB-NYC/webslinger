class Autocomplete {
    constructor(haystack, needle, internal = true, threshold = 0,filter=true) {
        this.haystack = haystack;
        this.needle = needle;
        this.internal = internal;
        this.threshold = threshold;
        this.container = null;
        this.displayed = false;
        this.currentIndex = -1;  // Tracks the current active item
    }

    init = () => {
        console.log(this);
        this.needle.addEventListener('input', this.check);
        this.needle.addEventListener('keydown', this.navigate);  // Add keydown event listener
    }

    create = () => {
        if (!this.container) {
            const container = document.createElement('div');
            container.className = 'autocomplete_list';
            this.container = container;
            this.needle.insertAdjacentElement('afterend', this.container);
            this.displayed = true;
        }
    }

    check = (e) => {
        const value = e.target.value;
        if (value.length >= this.threshold) {

        console.log({value});

            if (this.displayed) {
                this.container.innerHTML = '';
            } else {
                this.create();
            }
            // const regex = new RegExp('^' + value, 'i'); // Match from the beginning of the string
            // const regex = new RegExp(value, 'i'); // Match from the beginning of the string
            // const filtered_haystack = this.haystack.filter(item => regex.test(item));
            const filtered_haystack = this.haystack.filter(item =>
                item.toLowerCase().includes(value.toLowerCase())
            );
            this.disp(filtered_haystack);

            if (filtered_haystack.length === 1) {
                const suggestion = filtered_haystack[0];
                this.prefill(suggestion, value);
            }
        } else {
            if (this.container) {
                this.container.remove();
                this.container = null;
                this.displayed = false;
            }
        }
    };

    prefill = (suggestion, value) => {
        const remainingText = suggestion.slice(value.length);
        this.needle.value = value + remainingText;

        // Set cursor position to after the original input text
        this.needle.setSelectionRange(value.length, value.length + remainingText.length);

        // Handle Tab and Delete key events
        this.needle.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.clear({});
                this.needle.setSelectionRange(suggestion.length, suggestion.length);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                this.needle.value = value; // Restore the original input value
                this.needle.setSelectionRange(value.length, value.length);
            }
        }, { once: true }); // Ensure the event listener is only applied once
    };

    disp = (current_haystack) => {
        if (current_haystack.length > 0) {
            if (!this.container) {
                this.create();
            }
            this.container.innerHTML = '';

            current_haystack.forEach((text, index) => {
                const button = document.createElement('button');
                button.textContent = text;
                button.classList = 'autocomplete-item';
                button.addEventListener('click', this.select);
                this.container.appendChild(button);
            });

            // Reset currentIndex when displaying a new list
            this.currentIndex = -1;
        } else {
            if (this.container) {
                this.container.remove();
                this.container = null;
                this.displayed = false;
            }
        }
    }

    navigate = (e) => {
        if (!this.container) return;  // Ensure the container exists

        const items = Array.from(this.container.querySelectorAll('button'));
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.currentIndex = (this.currentIndex + 1) % items.length;  // Wrap around to the top
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.currentIndex = (this.currentIndex - 1 + items.length) % items.length;  // Wrap around to the bottom
        } else if (e.key === 'Enter' && this.currentIndex >= 0) {
            e.preventDefault();
            items[this.currentIndex].click();  // Simulate click on the active item
        }

        // Update the active item
        items.forEach((item, index) => {
            item.classList.toggle('active_item', index === this.currentIndex);
        });
    }

    select = (e) => {
        this.needle.value = e.target.textContent;
        if (this.container) {
            this.container.remove();
            this.container = null;
            this.displayed = false;
        }

        if (this.callback){
            this.callback(this.needle.value);
        }
    }

    clear = (e) => {
        const relatedTarget = e ? e.relatedTarget : null; // The element gaining focus
        if (relatedTarget && this.container && this.container.contains(relatedTarget)) {
            return; // Do nothing if clicking on the autocomplete list
        }

        if (this.container) {
            this.container.remove();
            this.container = null;
            this.displayed = false;
        }
        this.needle.removeEventListener('input', this.check);
    };
}

export default Autocomplete;
